// Mini API HTTP pour le pont avec le proxy Minecraft (mcblocManager).
// C'est le proxy qui appelle le bot (sortant uniquement) : aucun port à ouvrir côté Minecraft.
//
//   GET  /health                    → { ok: true }                         (sans authentification)
//   GET  /api/rewards/pending       → { rewards: [...] }
//   POST /api/rewards/:id/ack       ← { ok: boolean, message?: string }
//   POST /api/link                  ← { code, uuid, name } → { ok, discord? , error? }
//
// Authentification : en-tête "Authorization: Bearer <BRIDGE_SECRET>".
const http = require('node:http');
const crypto = require('node:crypto');
const config = require('../../config');
const { pendingForBridge, acknowledge } = require('../utils/rewards');
const { redeemCode } = require('../utils/links');
const { base } = require('../utils/embeds');
const { sendLog } = require('../utils/logger');

const MAX_BODY = 10 * 1024;

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
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
      if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not-found' });
      if (!secret) return send(res, 503, { error: 'bridge-disabled' });
      if (!authorized(req, secret)) return send(res, 401, { error: 'unauthorized' });

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
