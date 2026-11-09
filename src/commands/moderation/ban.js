const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkHierarchy, replyEphemeral } = require('../../utils/helpers');
const { error } = require('../../utils/embeds');
const { modAction, notifyUser } = require('../../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre à bannir').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500))
    .addIntegerOption((o) => o.setName('supprimer_messages').setDescription('Supprimer ses messages des X derniers jours')
      .addChoices({ name: 'Aucun', value: 0 }, { name: '1 jour', value: 1 }, { name: '7 jours', value: 7 })),

  async execute(interaction) {
    const user = interaction.options.getUser('membre');
    const reason = interaction.options.getString('raison');
    const days = interaction.options.getInteger('supprimer_messages') ?? 0;
    const target = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (target) {
      const err = checkHierarchy(interaction.member, target);
      if (err) return replyEphemeral(interaction, { embeds: [error(err)] });
      await notifyUser('ban', interaction.guild, user, reason);
    }

    await interaction.guild.members.ban(user.id, {
      reason: `${interaction.user.tag} : ${reason ?? 'Aucune raison'}`,
      deleteMessageSeconds: days * 86400,
    });
    const embed = await modAction({ action: 'ban', guild: interaction.guild, user, moderator: interaction.user, reason });
    return interaction.reply({ embeds: [embed] });
  },
};
