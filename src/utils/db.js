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
  state: {},        // divers (ex. mcOnline)
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
  console.error(`⚠️ Impossible de lire ${FILE} (${err.message}). Démarrage avec une base vide.`);
  data = {};
}

function save() {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
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

module.exports = { guild, guildIds, save, FILE };
