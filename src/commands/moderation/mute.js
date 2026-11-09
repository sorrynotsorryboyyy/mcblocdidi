const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../../config');
const { checkHierarchy, replyEphemeral, parseDuration, formatDuration } = require('../../utils/helpers');
const { error } = require('../../utils/embeds');
const { modAction, notifyUser } = require('../../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Rend un membre muet temporairement (timeout)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre à mute').setRequired(true))
    .addStringOption((o) => o.setName('duree').setDescription('Ex : 10m, 2h, 1j, 1h30m').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),

  async execute(interaction) {
    const target = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison');
    const ms = parseDuration(interaction.options.getString('duree'));

    if (!target) return replyEphemeral(interaction, { embeds: [error('Ce membre n\'est pas sur le serveur.')] });
    if (!ms) return replyEphemeral(interaction, { embeds: [error('Durée invalide. Exemples : `10m`, `2h`, `1j`, `1h30m`.')] });
    if (ms > config.maxMuteMinutes * 60_000) return replyEphemeral(interaction, { embeds: [error('Durée maximale : 28 jours.')] });

    const err = checkHierarchy(interaction.member, target);
    if (err) return replyEphemeral(interaction, { embeds: [error(err)] });
    if (target.permissions.has(PermissionFlagsBits.Administrator)) {
      return replyEphemeral(interaction, { embeds: [error('Impossible de mute un administrateur.')] });
    }

    await target.timeout(ms, `${interaction.user.tag} : ${reason ?? 'Aucune raison'}`);
    await notifyUser('mute', interaction.guild, target.user, reason, `\n**Durée :** ${formatDuration(ms)}`);
    const embed = await modAction({
      action: 'mute', guild: interaction.guild, user: target.user, moderator: interaction.user, reason,
      extra: [{ name: 'Durée', value: `${formatDuration(ms)} (fin <t:${Math.floor((Date.now() + ms) / 1000)}:R>)` }],
    });
    return interaction.reply({ embeds: [embed] });
  },
};
