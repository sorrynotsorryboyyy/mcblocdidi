const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyEphemeral } = require('../../utils/helpers');
const { error } = require('../../utils/embeds');
const { modAction } = require('../../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Retire le mute d\'un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),

  async execute(interaction) {
    const target = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison');
    if (!target) return replyEphemeral(interaction, { embeds: [error('Ce membre n\'est pas sur le serveur.')] });
    if (!target.isCommunicationDisabled()) return replyEphemeral(interaction, { embeds: [error('Ce membre n\'est pas mute.')] });

    await target.timeout(null, `${interaction.user.tag} : ${reason ?? 'Aucune raison'}`);
    const embed = await modAction({ action: 'unmute', guild: interaction.guild, user: target.user, moderator: interaction.user, reason });
    return interaction.reply({ embeds: [embed] });
  },
};
