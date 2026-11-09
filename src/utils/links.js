// Liaison Discord ↔ Minecraft : /lier (Discord) donne un code, /lier <code> en jeu le valide.
const crypto = require('node:crypto');
const config = require('../../config');
const db = require('./db');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_RE = /^\w{3,16}$/;

function randomCode() {
  const bytes = crypto.randomBytes(6);
  return `MCB-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}

function purgeExpired(g) {
  const now = Date.now();
  for (const [code, entry] of Object.entries(g.linkCodes)) if (entry.expiresAt < now) delete g.linkCodes[code];
}

/** Génère un code pour ce membre (remplace son code précédent). */
function createCode(guildId, discordId) {
  const g = db.guild(guildId);
  purgeExpired(g);
  for (const [code, entry] of Object.entries(g.linkCodes)) if (entry.discordId === discordId) delete g.linkCodes[code];
  const code = randomCode();
  const expiresAt = Date.now() + config.linkCodeMinutes * 60_000;
  g.linkCodes[code] = { discordId, expiresAt };
  db.save();
  return { code, expiresAt };
}

/**
 * Valide un code envoyé par le plugin.
 * @returns {{ok:true, guildId, discordId} | {ok:false, error:string}}
 */
function redeemCode(rawCode, uuid, name) {
  const code = String(rawCode ?? '').trim().toUpperCase();
  if (!UUID_RE.test(uuid ?? '') || !NAME_RE.test(name ?? '')) return { ok: false, error: 'invalid-player' };

  for (const guildId of db.guildIds()) {
    const g = db.guild(guildId);
    purgeExpired(g);
    const entry = g.linkCodes[code];
    if (!entry) continue;

    // Ce compte Minecraft est-il déjà lié à un AUTRE compte Discord ?
    const other = Object.entries(g.links).find(([id, l]) => l.uuid.toLowerCase() === uuid.toLowerCase() && id !== entry.discordId);
    if (other) return { ok: false, error: 'already-linked' };

    delete g.linkCodes[code];
    g.links[entry.discordId] = { uuid: uuid.toLowerCase(), name, linkedAt: Date.now() };
    db.save();
    return { ok: true, guildId, discordId: entry.discordId };
  }
  return { ok: false, error: 'invalid-code' };
}

function unlink(guildId, discordId) {
  const g = db.guild(guildId);
  const link = g.links[discordId];
  if (!link) return null;
  delete g.links[discordId];
  db.save();
  return link;
}

function linkOf(guildId, discordId) {
  return db.guild(guildId).links[discordId] ?? null;
}

module.exports = { createCode, redeemCode, unlink, linkOf, randomCode };
