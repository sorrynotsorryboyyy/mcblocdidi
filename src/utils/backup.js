// Sauvegardes de la base : une par jour (dans $DATA_DIR/backups, les N dernières gardées) + envoi dans #logs.
const fs = require('node:fs');
const path = require('node:path');
const { AttachmentBuilder } = require('discord.js');
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');
const { sendLog } = require('./logger');
const { today } = require('./daily');

const DIR = path.join(db.DIR, 'backups');
const NAME_RE = /^db-(\d{4}-\d{2}-\d{2})\.json$/;

/** Supprime les sauvegardes au-delà des `keep` plus récentes (fonction testable). */
function rotate(dir = DIR, keep = config.backup.keep) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => NAME_RE.test(f)).sort().reverse();
  const removed = files.slice(keep);
  for (const f of removed) fs.rmSync(path.join(dir, f), { force: true });
  return removed;
}

/** Écrit la sauvegarde du jour (remplace celle du jour si elle existe). */
function makeBackup(day = today()) {
  db.save(); // l'état en mémoire d'abord
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `db-${day}.json`);
  fs.copyFileSync(db.FILE, file);
  rotate();
  return file;
}

function attachment(file) {
  return new AttachmentBuilder(fs.readFileSync(file), { name: path.basename(file) });
}

/** Heure de Paris actuelle (0-23). */
function parisHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('fr-FR', { timeZone: config.daily.timezone, hour: 'numeric', hourCycle: 'h23' }).format(now));
}

async function dailyCheck(client) {
  const day = today();
  if (parisHour() !== config.backup.hour || fs.existsSync(path.join(DIR, `db-${day}.json`))) return;
  const file = makeBackup(day);
  for (const guild of client.guilds.cache.values()) {
    await sendLog(guild, {
      embeds: [base(config.colors.neutral).setDescription(`💾 Sauvegarde quotidienne de la base — ${day}`)],
      files: [attachment(file)],
    });
  }
}

function start(client) {
  setInterval(() => dailyCheck(client).catch((err) => console.error('[sauvegarde]', err.message)), 10 * 60_000);
}

module.exports = { start, makeBackup, rotate, attachment, parisHour, DIR };
