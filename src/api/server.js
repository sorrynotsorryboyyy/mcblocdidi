// Mini API HTTP pour le pont avec le proxy Minecraft (mcblocManager).
// C'est le proxy qui appelle le bot (sortant uniquement) : aucun port à ouvrir côté Minecraft.
//
//   GET  /health                    → { ok: true }                         (sans authentification)
//   GET  /api/rewards/pending       → { rewards: [...] }
//   POST /api/rewards/:id/ack       ← { ok: boolean, message?: string }
//   POST /api/link                  ← { code, uuid, name } → { ok, discord? , error? }
//   POST /api/leaderboards          ← { games: [{ server, boards: [{ key, title, entries: [{ uuid, name, value }] }] }] }
//   POST /api/sanctions             ← { action: 'create'|'revoke', id?, type, target: {uuid, name}, reason, staff, expiresAt, server }
//   GET  /public/votes              → { top: [{ name, votes }], updatedAt }   (sans auth, CORS : PUBLIC_ORIGINS)
//   GET  /public/leaderboards       → { games: { <serveur>: { boards } } }      (sans auth, CORS : PUBLIC_ORIGINS)
//   POST /public/site-link/code     → { code, token, expiresAt }                (liaison du site ; 5 par IP / 10 min)
//   GET  /public/site-link/status   → { status, account? }                       (Authorization: Bearer <token du site>)
//   DELETE /public/site-link        → { ok }                                     (délier ; même jeton)
//   POST /api/votes                 ← { id, name, site, monthly, milestone? }      (vote récompensé → #votes)
//   POST /api/site-link             ← { code, uuid, name }                       (/site <code> en jeu)
//   GET  /api/site-profiles/wanted  → { uuids }      POST /api/site-profiles ← { profiles: [...] }
//
// Authentification : en-tête "Authorization: Bearer <BRIDGE_SECRET>".
const http = require('node:http');
const crypto = require('node:crypto');
const config = require('../../config');
const { pendingForBridge, acknowledge } = require('../utils/rewards');
const { redeemCode } = require('../utils/links');
const { base } = require('../utils/embeds');
const { sendLog } = require('../utils/logger');
const monitor = require('../utils/monitor');
const leaderboards = require('../utils/leaderboards');
const gameSanctions = require('../utils/gameSanctions');
const linkedRole = require('../utils/linkedRole');
const db = require('../utils/db');
const siteLinks = require('../utils/siteLinks');
const voteFeed = require('../utils/voteFeed');

const MAX_BODY = 64 * 1024; // classements : ~10 Ko

function send(res, status, body, headers = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json), ...headers });
  res.end(json);
}

// Origines autorisées pour les routes /public/* (le site). PUBLIC_ORIGINS="https://a.fr,https://b.fr"
const PUBLIC_ORIGINS = (process.env.PUBLIC_ORIGINS || 'https://mcbloc.fr,https://www.mcbloc.fr')
  .split(',').map((o) => o.trim()).filter(Boolean);

function corsHeaders(origin, { privateData = false } = {}) {
  const headers = { 'Cache-Control': privateData ? 'no-store' : 'public, max-age=60', Vary: 'Origin' };
  if (origin && PUBLIC_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

const bearer = (req) => {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
};

// Anti-abus : 5 codes de liaison par adresse IP toutes les 10 minutes.
const codeRequests = new Map();
function allowCode(req, now = Date.now()) {
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  const recent = (codeRequests.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 5) return false;
  recent.push(now);
  codeRequests.set(ip, recent);
  if (codeRequests.size > 5000) codeRequests.clear();
  return true;
}

/** Classements pour le site : noms et valeurs seulement (pas d'UUID). */
function publicLeaderboards() {
  const guildId = db.guildIds()[0];
  const boards = guildId ? db.guild(guildId).state.leaderboards ?? {} : {};
  const games = {};
  for (const [server, data] of Object.entries(boards)) {
    games[server] = {
      updatedAt: data.updatedAt ?? null,
      boards: (data.boards ?? []).map((b) => ({ key: b.key, title: b.title, entries: b.entries.map((e) => ({ name: e.name, value: e.value })) })),
    };
  }
  return { games };
}

function authorized(req, secret) {
  const header = req.headers.authorization ?? '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(secret);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too-large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('bad-json')); }
    });
    req.on('error', reject);
  });
}

function createServer(client, secret) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, ready: client.isReady() });

      // Routes publiques pour le site (mcbloc.fr) : aucun secret du pont, aucune UUID d'un autre joueur.
      if (url.pathname.startsWith('/public/')) {
        const privateData = url.pathname.startsWith('/public/site-link');
        const cors = corsHeaders(req.headers.origin, { privateData });
        if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
        if (req.method === 'GET' && url.pathname === '/public/votes') return send(res, 200, leaderboards.topVoters(), cors);
        if (req.method === 'GET' && url.pathname === '/public/leaderboards') return send(res, 200, publicLeaderboards(), cors);

        // Liaison du site (le navigateur garde un jeton secret, envoyé en "Authorization: Bearer")
        if (req.method === 'POST' && url.pathname === '/public/site-link/code') {
          if (!allowCode(req)) return send(res, 429, { error: 'too-many-requests' }, cors);
          return send(res, 200, siteLinks.createCode(), cors);
        }
        if (req.method === 'GET' && url.pathname === '/public/site-link/status') return send(res, 200, siteLinks.status(bearer(req)), cors);
        if (req.method === 'DELETE' && url.pathname === '/public/site-link') return send(res, 200, { ok: siteLinks.unlink(bearer(req)) }, cors);
        return send(res, 404, { error: 'not-found' }, cors);
      }

      if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not-found' });
      if (!secret) return send(res, 503, { error: 'bridge-disabled' });
      if (!authorized(req, secret)) return send(res, 401, { error: 'unauthorized' });
      monitor.markSeen(); // le proxy est vivant

      if (req.method === 'POST' && url.pathname === '/api/leaderboards') {
        const body = await readJson(req);
        const stored = leaderboards.store(body);
        // Mise à jour des panneaux en arrière-plan (le proxy n'attend pas Discord)
        for (const guild of client.guilds.cache.values()) leaderboards.refreshPanels(guild).catch(() => null);
        return send(res, 200, { ok: true, games: stored });
      }

      // Liaison du site : /site <code> en jeu, puis profils des comptes liés
      if (req.method === 'POST' && url.pathname === '/api/site-link') {
        const body = await readJson(req);
        return send(res, 200, siteLinks.redeem(body.code, body.uuid, body.name));
      }
      if (req.method === 'GET' && url.pathname === '/api/site-profiles/wanted') {
        return send(res, 200, { uuids: siteLinks.wantedUuids() });
      }
      if (req.method === 'POST' && url.pathname === '/api/site-profiles') {
        const body = await readJson(req);
        return send(res, 200, { ok: true, stored: siteLinks.storeProfiles(body.profiles) });
      }

      if (req.method === 'POST' && url.pathname === '/api/sanctions') {
        const body = await readJson(req);
        const posted = await gameSanctions.handle(client, body);
        return send(res, 200, { ok: true, posted });
      }

      // Vote récompensé en jeu → annonce groupée dans #votes
      if (req.method === 'POST' && url.pathname === '/api/votes') {
        const body = await readJson(req);
        const result = voteFeed.enqueue(client, body);
        return send(res, result.ok ? 200 : 400, result);
      }

      if (req.method === 'GET' && url.pathname === '/api/rewards/pending') {
        return send(res, 200, { rewards: pendingForBridge() });
      }

      const ack = url.pathname.match(/^\/api\/rewards\/([^/]+)\/ack$/);
      if (req.method === 'POST' && ack) {
        const body = await readJson(req);
        const result = await acknowledge(client, decodeURIComponent(ack[1]), body.ok === true, body.message);
        return send(res, result.found ? 200 : 404, result);
      }

      if (req.method === 'POST' && url.pathname === '/api/link') {
        const body = await readJson(req);
        const result = redeemCode(body.code, body.uuid, body.name);
        if (!result.ok) return send(res, 200, result);
        const user = await client.users.fetch(result.discordId).catch(() => null);
        const guild = client.guilds.cache.get(result.guildId);
        if (guild) await linkedRole.apply(guild, result.discordId, body.name);
        await user?.send({ embeds: [base(config.colors.success).setDescription(
          `🔗 Ton compte Discord est maintenant lié au compte Minecraft **${body.name}** ! Tes récompenses en attente arrivent en jeu.`,
        )] }).catch(() => null);
        if (guild) await sendLog(guild, base(config.colors.info).setTitle('🔗 Compte lié').setDescription(`<@${result.discordId}> ↔ \`${body.name}\``));
        return send(res, 200, { ok: true, discord: user?.tag ?? result.discordId });
      }

      return send(res, 404, { error: 'not-found' });
    } catch (err) {
      if (['too-large', 'bad-json'].includes(err.message)) return send(res, 400, { error: err.message });
      console.error('[api]', err);
      return send(res, 500, { error: 'internal' });
    }
  });
}

/** Démarre l'API (port fourni par Railway via PORT, sinon 3000). */
function start(client) {
  const secret = (process.env.BRIDGE_SECRET ?? '').trim();
  const port = Number(process.env.PORT) || 3000;
  if (!secret) console.warn('⚠️ BRIDGE_SECRET absent : le pont Minecraft est désactivé (récompenses mises en attente).');
  else if (secret.length < 24) console.warn('⚠️ BRIDGE_SECRET trop court (24 caractères minimum conseillés).');
  const server = createServer(client, secret.length ? secret : null);
  server.listen(port, () => console.log(`🌉 API du pont Minecraft sur le port ${port}.`));
  server.on('error', (err) => console.error('[api] impossible de démarrer :', err.message));
  return server;
}

module.exports = { start, createServer };
