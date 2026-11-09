const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkHierarchy, replyEphemeral } = require('../../utils/helpers');
const { error } = require('../../utils/embeds');
const { addWarn } = require('../../utils/sanctions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Donne un avertissement à un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre à avertir').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setRequired(true).setMaxLength(500)),

  async execute(interaction) {
    const target = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison');
    if (!target) return replyEphemeral(interaction, { embeds: [error('Ce membre n\'est pas sur le serveur.')] });

    const err = checkHierarchy(interaction.member, target);
    if (err) return replyEphemeral(interaction, { embeds: [error(err)] });

    await interaction.deferReply();
    const { embed } = await addWarn({ guild: interaction.guild, member: target, moderator: interaction.user, reason });
    return interaction.editReply({ embeds: [embed] });
  },
};
