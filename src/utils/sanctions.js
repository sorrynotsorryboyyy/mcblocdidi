// Avertissements + sanctions automatiques (partagé par /warn et l'auto-modération).
const config = require('../../config');
const db = require('./db');
const { modAction, notifyUser } = require('./modlog');
const { formatDuration } = require('./helpers');

/**
 * Ajoute un avertissement, prévient le membre, log, et applique un mute si un seuil est atteint.
 * @returns {Promise<{total: number, embed: import('discord.js').EmbedBuilder, escalation: string|null}>}
 */
async function addWarn({ guild, member, moderator, reason }) {
  const g = db.guild(guild.id);
  g.warns[member.id] ??= [];
  g.warns[member.id].push({ reason, modId: moderator.id, date: Date.now() });
  db.save();
  const total = g.warns[member.id].length;

  await notifyUser('warn', guild, member.user, reason, `\n**Total :** ${total} avertissement(s)`);
  const embed = await modAction({
    action: 'warn', guild, user: member.user, moderator, reason,
    extra: [{ name: 'Total', value: `${total} avertissement(s)` }],
  });

  // Sanction automatique si un seuil est atteint pile
  let escalation = null;
  const threshold = config.autoMod.warnThresholds.find((t) => t.warns === total);
  if (threshold && member.moderatable) {
    const ms = threshold.muteMinutes * 60_000;
    const autoReason = `Sanction automatique : ${total} avertissements`;
    await member.timeout(ms, autoReason).catch(() => null);
    await notifyUser('mute', guild, member.user, autoReason, `\n**Durée :** ${formatDuration(ms)}`);
    await modAction({
      action: 'mute', guild, user: member.user, moderator: guild.client.user, reason: autoReason,
      extra: [{ name: 'Durée', value: formatDuration(ms) }],
    });
    escalation = `🔇 Mute automatique de **${formatDuration(ms)}** (${total} avertissements).`;
    embed.addFields({ name: 'Sanction automatique', value: escalation });
  }

  return { total, embed, escalation };
}

module.exports = { addWarn };
