// Mini base de données JSON, une entrée par serveur Discord.
// Emplacement : $DATA_DIR/db.json (défaut ./data). Sur Railway : Volume monté sur /data + DATA_DIR=/data.
const fs = require('node:fs');
const path = require('node:path');

const DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DIR, 'db.json');

const DEFAULTS = () => ({
  channels: {},     // clé config → id salon
  roles: {},        // clé config → id rôle
  messages: {},     // clé panneau → { channelId, messageId }
  warns: {},        // userId → [{ reason, modId, date }]
  tickets: {},      // userId → channelId
  tournaments: {},  // id → { ... }
  suggestions: {},  // id → { ... }
  giveaways: {},    // id → { ... }
  partners: {},     // id → { name, description, website, discord, image, channelId, messageId }
  invites: {},      // inviteeId → { inviterId, code, joinedAt, verifiedAt, status }
  boosts: {},       // userId → { count, roleByBoost, lastBoostAt }
  links: {},        // discordId → { uuid, name, linkedAt }
  linkCodes: {},    // code → { discordId, expiresAt }
  rewards: {},      // id → { discordId, type, amount|months, label, status, tries, createdAt }
  levels: {},       // userId → { xp, level, lastMsg, voiceMinutes, tier }
  daily: {},        // userId → { last: 'AAAA-MM-JJ', streak }
  polls: {},        // id → { question, choices, votes: {userId: n}, endsAt, ended, ... }
  ticketMeta: {},   // channelId → { ownerId, type, openedAt, claimedBy, closedAt, rating }
  state: {},        // divers (ex. mcOnline, launch, lockdown, leaderboards)
});

function load() {
  if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  // Premier démarrage : import optionnel via DB_SEED (contenu de db.json encodé en base64)
  if (process.env.DB_SEED) {
    try {
      const seeded = JSON.parse(Buffer.from(process.env.DB_SEED, 'base64').toString('utf8'));
      console.log('📦 Base de données importée depuis DB_SEED.');
      return seeded;
    } catch (err) {
      console.error('⚠️ DB_SEED invalide, ignoré :', err.message);
    }
  }
  return {};
}

let data;
try {
  data = load();
} catch (err) {
  // Fichier illisible : on le met de côté AVANT de repartir à vide (sinon il serait écrasé).
  const aside = `${FILE}.corrompu-${Date.now()}`;
  try { fs.renameSync(FILE, aside); } catch {}
  console.error(`⚠️ ${FILE} illisible (${err.message}). Copie conservée : ${aside}. `
    + 'Restaure une sauvegarde de backups/ si besoin. Démarrage avec une base vide.');
  data = {};
}

let saveTimer = null;

function save() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

/** Sauvegarde groupée (5 s) pour les écritures fréquentes (XP des messages). */
function saveSoon() {
  saveTimer ??= setTimeout(() => { saveTimer = null; save(); }, 5000);
  saveTimer.unref?.();
}

/** À appeler à l'arrêt : écrit immédiatement une sauvegarde en attente. */
function flush() {
  if (saveTimer) save();
}

/** Renvoie (et crée si besoin) les données d'un serveur. Modifie l'objet puis appelle save(). */
function guild(guildId) {
  const defaults = DEFAULTS();
  data[guildId] ??= defaults;
  for (const [k, v] of Object.entries(defaults)) data[guildId][k] ??= v;
  return data[guildId];
}

function guildIds() {
  return Object.keys(data);
}

module.exports = { guild, guildIds, save, saveSoon, flush, FILE, DIR };
