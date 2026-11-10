// Surveillance du pont Minecraft : alerte unique dans #logs si le proxy ne s'est plus manifesté
// depuis `bridgeAlertMinutes`, puis message « rétabli » à son retour.
const config = require('../../config');
const { base } = require('./embeds');
const { sendLog } = require('./logger');

let lastSeen = null; // dernier appel authentifié du proxy
let alerted = false;
let client = null;

async function broadcast(embed) {
  if (!client) return;
  for (const guild of client.guilds.cache.values()) await sendLog(guild, embed);
}

/** Appelé par l'API à chaque requête authentifiée du proxy. */
function markSeen(now = Date.now()) {
  lastSeen = now;
  if (alerted) {
    alerted = false;
    broadcast(base(config.colors.success).setTitle('🌉 Pont Minecraft rétabli')
      .setDescription('Le proxy communique de nouveau avec le bot. Les récompenses en attente vont être livrées.')).catch(() => null);
  }
}

/** Faut-il alerter ? (fonction pure) */
function shouldAlert(seen, isAlerted, now, minutes = config.bridgeAlertMinutes) {
  return seen !== null && !isAlerted && now - seen > minutes * 60_000;
}

async function check(now = Date.now()) {
  if (!shouldAlert(lastSeen, alerted, now)) return;
  alerted = true;
  await broadcast(base(config.colors.error).setTitle('⚠️ Pont Minecraft coupé')
    .setDescription(`Le proxy ne s'est plus connecté au bot depuis <t:${Math.floor(lastSeen / 1000)}:R>.\n`
      + 'Les récompenses (pièces, VIP) restent en attente et seront livrées au retour.\n'
      + '> Vérifie que le proxy BungeeCord tourne et la ligne « Pont Discord » dans sa console.'));
}

function start(c) {
  client = c;
  setInterval(() => check().catch(() => null), 60_000);
}

module.exports = { start, markSeen, shouldAlert, status: () => ({ lastSeen, alerted }) };
