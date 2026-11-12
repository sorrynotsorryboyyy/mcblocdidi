// Liaison du SITE (mcbloc.fr/compte) avec un compte Minecraft, via la commande en jeu /site WEB-XXXXXX.
// (Distincte de /lier, qui relie Discord ↔ Minecraft.)
//
//  1. Le site demande un code : on renvoie { code, token } ; le navigateur garde le jeton (secret).
//  2. Le joueur tape /site <code> en jeu ; le proxy l'envoie ici (route protégée par BRIDGE_SECRET).
//  3. Le site interroge le statut avec son jeton ; le proxy envoie régulièrement les profils des comptes liés.
//
// Stockage : $DATA_DIR/site-links.json (jetons enregistrés hachés, jamais en clair).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = path.join(process.env.DATA_DIR || './data', 'site-links.json');
const CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 180 * 24 * 3600 * 1000; // session inutilisée pendant 6 mois : supprimée
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_RE = /^\w{3,16}$/;

let data = null;

function load() {
  if (data) return data;
  try {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    data = {};
  }
  data.codes ??= {};
  data.sessions ??= {};
  data.profiles ??= {};
  return data;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function randomCode() {
  const bytes = crypto.randomBytes(6);
  return `WEB-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}

/** Supprime codes expirés et sessions abandonnées. */
function prune(now = Date.now()) {
  const d = load();
  for (const [code, c] of Object.entries(d.codes)) if (c.expiresAt < now) delete d.codes[code];
  for (const [h, s] of Object.entries(d.sessions)) if ((s.lastSeen ?? s.createdAt) + SESSION_TTL_MS < now) delete d.sessions[h];
  const linked = new Set(Object.values(d.sessions).map((s) => s.uuid).filter(Boolean));
  for (const uuid of Object.keys(d.profiles)) if (!linked.has(uuid)) delete d.profiles[uuid];
}

/** Nouveau code + jeton de session (le jeton n'est renvoyé qu'une fois, au navigateur). */
function createCode(now = Date.now()) {
  const d = load();
  prune(now);
  let code = randomCode();
  while (d.codes[code]) code = randomCode();
  const token = crypto.randomBytes(32).toString('base64url');
  const h = hash(token);
  d.codes[code] = { session: h, expiresAt: now + CODE_TTL_MS };
  d.sessions[h] = { createdAt: now, lastSeen: now, uuid: null, name: null, linkedAt: null };
  save();
  return { code, token, expiresAt: now + CODE_TTL_MS };
}

/** Appelé par le proxy quand un joueur tape /site <code>. */
function redeem(code, uuid, name, now = Date.now()) {
  const d = load();
  const key = String(code ?? '').trim().toUpperCase();
  if (!UUID_RE.test(String(uuid ?? '')) || !NAME_RE.test(String(name ?? ''))) return { ok: false, error: 'invalid-player' };
  const entry = d.codes[key];
  if (!entry || entry.expiresAt < now || !d.sessions[entry.session]) return { ok: false, error: 'invalid-code' };
  delete d.codes[key]; // usage unique
  Object.assign(d.sessions[entry.session], { uuid: uuid.toLowerCase(), name, linkedAt: now, lastSeen: now });
  save();
  return { ok: true, uuid: uuid.toLowerCase() };
}

/** Statut vu par le site, à partir de son jeton. */
function status(token, now = Date.now()) {
  const d = load();
  const s = token ? d.sessions[hash(token)] : null;
  if (!s) return { status: 'unknown' };
  s.lastSeen = now;
  if (!s.uuid) {
    const pending = Object.values(d.codes).some((c) => c.session === hash(token) && c.expiresAt >= now);
    return { status: pending ? 'pending' : 'expired' };
  }
  const profile = d.profiles[s.uuid] ?? null;
  return {
    status: 'linked',
    account: { uuid: s.uuid, name: profile?.name ?? s.name, linkedAt: s.linkedAt, profile },
  };
}

/** Le site délie : la session est supprimée (le profil aussi s'il n'est plus utilisé). */
function unlink(token) {
  const d = load();
  const h = token ? hash(token) : null;
  if (!h || !d.sessions[h]) return false;
  delete d.sessions[h];
  for (const [code, c] of Object.entries(d.codes)) if (c.session === h) delete d.codes[code];
  prune();
  save();
  return true;
}

/** UUID des comptes liés, dont le proxy doit envoyer le profil. */
function wantedUuids(limit = 500) {
  return [...new Set(Object.values(load().sessions).map((s) => s.uuid).filter(Boolean))].slice(0, limit);
}

/** Profils envoyés par le proxy (nettoyés : seulement les comptes liés, valeurs bornées). */
function storeProfiles(profiles, now = Date.now()) {
  const d = load();
  const wanted = new Set(wantedUuids(10_000));
  let stored = 0;
  for (const p of Array.isArray(profiles) ? profiles.slice(0, 500) : []) {
    const uuid = String(p?.uuid ?? '').toLowerCase();
    if (!wanted.has(uuid) || !NAME_RE.test(String(p?.name ?? ''))) continue;
    const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
    d.profiles[uuid] = {
      name: p.name,
      rank: { id: String(p.rank?.id ?? 'joueur').slice(0, 32), name: String(p.rank?.name ?? 'Joueur').slice(0, 32) },
      coins: num(p.coins),
      level: num(p.level),
      stats: (Array.isArray(p.stats) ? p.stats.slice(0, 10) : []).map((s) => ({
        game: String(s?.game ?? '').slice(0, 32),
        wins: num(s?.wins),
        ...(s?.elo !== undefined && s?.elo !== null ? { elo: num(s.elo) } : {}),
      })),
      updatedAt: now,
    };
    stored++;
  }
  save();
  return stored;
}

/** Pour les tests : repart d'un état vide. */
function _reset() {
  data = { codes: {}, sessions: {}, profiles: {} };
}

module.exports = { createCode, redeem, status, unlink, wantedUuids, storeProfiles, prune, _reset };
