const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyEphemeral } = require('../../utils/helpers');
const { error } = require('../../utils/embeds');
const { modAction } = require('../../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Débannit un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName('id').setDescription('ID Discord de l\'utilisateur').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),

  async execute(interaction) {
    const id = interaction.options.getString('id').trim();
    const reason = interaction.options.getString('raison');
    const ban = await interaction.guild.bans.fetch(id).catch(() => null);
    if (!ban) return replyEphemeral(interaction, { embeds: [error('Cet utilisateur n\'est pas banni (ou l\'ID est invalide).')] });

    await interaction.guild.members.unban(id, `${interaction.user.tag} : ${reason ?? 'Aucune raison'}`);
    const embed = await modAction({ action: 'unban', guild: interaction.guild, user: ban.user, moderator: interaction.user, reason });
    return interaction.reply({ embeds: [embed] });
  },
};
