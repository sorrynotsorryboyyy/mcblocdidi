// Embed standard de sanction : envoyé dans #logs et en MP au membre sanctionné.
const config = require('../../config');
const { base } = require('./embeds');
const { sendLog } = require('./logger');

const META = {
  ban: { emoji: '🔨', label: 'Bannissement', color: config.colors.error, dm: 'banni de' },
  kick: { emoji: '👢', label: 'Expulsion', color: config.colors.warning, dm: 'expulsé de' },
  mute: { emoji: '🔇', label: 'Mute', color: config.colors.warning, dm: 'rendu muet sur' },
  unmute: { emoji: '🔊', label: 'Unmute', color: config.colors.success },
  warn: { emoji: '⚠️', label: 'Avertissement', color: config.colors.warning, dm: 'averti sur' },
  unban: { emoji: '✅', label: 'Débannissement', color: config.colors.success },
};

/** @param {{action, guild, user, moderator, reason?, extra?: {name,value}[]}} p */
async function modAction({ action, guild, user, moderator, reason, extra = [] }) {
  const m = META[action];
  const embed = base(m.color)
    .setTitle(`${m.emoji} ${m.label}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: 'Membre', value: `${user} (\`${user.id}\`)`, inline: true },
      { name: 'Modérateur', value: `${moderator}`, inline: true },
      { name: 'Raison', value: reason || 'Aucune raison fournie' },
      ...extra,
    );
  await sendLog(guild, embed);
  return embed;
}

/** MP au membre (à faire AVANT un ban/kick, sinon le bot ne partage plus de serveur avec lui). */
async function notifyUser(action, guild, user, reason, extra = '') {
  const m = META[action];
  if (!m.dm) return;
  await user.send({
    embeds: [base(m.color).setDescription(`${m.emoji} Tu as été **${m.dm} ${guild.name}**.\n**Raison :** ${reason || 'Aucune'}${extra}`)],
  }).catch(() => null); // MP fermés
}

module.exports = { modAction, notifyUser };
