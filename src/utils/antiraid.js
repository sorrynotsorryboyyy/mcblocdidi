// Anti-raid : trop d'arrivées d'un coup → invitations en pause + vérification renforcée + alerte staff.
// Déverrouillage automatique (minuteur en base) ou /lockdown off.
const { GuildVerificationLevel } = require('discord.js');
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');
const { getRole } = require('./helpers');
const { sendLog } = require('./logger');

const recent = new Map(); // guildId → timestamps des dernières arrivées

/** Fenêtre glissante : renvoie la nouvelle liste et s'il faut verrouiller (fonction pure). */
function registerJoin(timestamps, now, { joins, windowSeconds }) {
  const list = timestamps.filter((t) => now - t < windowSeconds * 1000);
  list.push(now);
  return { list, trigger: list.length >= joins };
}

const lockState = (guildId) => db.guild(guildId).state.lockdown ?? null;

async function lock(guild, { minutes = config.antiRaid.lockMinutes, reason, by = null } = {}) {
  const st = db.guild(guild.id).state;
  const until = Date.now() + minutes * 60_000;
  if (st.lockdown) {
    st.lockdown.until = Math.max(st.lockdown.until, until); // déjà verrouillé : on prolonge
    db.save();
    return false;
  }
  st.lockdown = { since: Date.now(), until, reason, by, previousVerification: guild.verificationLevel, joins: 0 };
  db.save();

  await guild.disableInvites(true).catch((err) => console.error('[anti-raid] invitations :', err.message));
  if (guild.verificationLevel < GuildVerificationLevel.High) {
    await guild.setVerificationLevel(GuildVerificationLevel.High, 'Anti-raid').catch(() => null);
  }
  const pings = ['admin', 'moderator'].map((k) => getRole(guild, k)).filter(Boolean);
  await sendLog(guild, {
    content: pings.join(' ') || undefined,
    embeds: [base(config.colors.error).setTitle('🚨 Serveur verrouillé (anti-raid)')
      .setDescription(`**Raison :** ${reason}\n**Jusqu'à :** <t:${Math.floor(until / 1000)}:t> (<t:${Math.floor(until / 1000)}:R>)\n\n`
        + '• Invitations **en pause**\n• Niveau de vérification **élevé**\n\n'
        + 'Lever le verrouillage : `/lockdown off`')],
    allowedMentions: { roles: pings.map((r) => r.id) },
  });
  return true;
}

async function unlock(guild, by = null) {
  const st = db.guild(guild.id).state;
  const data = st.lockdown;
  if (!data) return false;
  delete st.lockdown;
  db.save();
  await guild.disableInvites(false).catch((err) => console.error('[anti-raid] invitations :', err.message));
  if (data.previousVerification !== undefined && guild.verificationLevel !== data.previousVerification) {
    await guild.setVerificationLevel(data.previousVerification, 'Fin du verrouillage').catch(() => null);
  }
  await sendLog(guild, base(config.colors.success).setTitle('🔓 Verrouillage levé')
    .setDescription(`${by ? `Par <@${by}>` : 'Automatiquement'} — ${data.joins} arrivée(s) pendant le verrouillage.`));
  return true;
}

async function onJoin(member) {
  if (!config.antiRaid.enabled) return;
  const { guild } = member;
  const current = lockState(guild.id);
  if (current) {
    current.joins += 1;
    db.save();
    const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / 864e5);
    await sendLog(guild, base(config.colors.warning).setDescription(
      `🚨 Arrivée pendant le verrouillage : ${member} (\`${member.id}\`) — compte créé il y a **${ageDays} j**`,
    ));
    return;
  }
  const { list, trigger } = registerJoin(recent.get(guild.id) ?? [], Date.now(), config.antiRaid);
  recent.set(guild.id, list);
  if (trigger) {
    recent.set(guild.id, []);
    await lock(guild, { reason: `${list.length} arrivées en moins de ${config.antiRaid.windowSeconds} s` });
  }
}

function start(client) {
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      const data = lockState(guild.id);
      if (data && data.until <= Date.now()) await unlock(guild).catch((err) => console.error('[anti-raid]', err.message));
    }
  }, 30_000);
}

module.exports = { start, onJoin, lock, unlock, registerJoin, lockState };
