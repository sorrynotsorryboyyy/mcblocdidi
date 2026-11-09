const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkHierarchy, replyEphemeral } = require('../../utils/helpers');
const { error } = require('../../utils/embeds');
const { modAction, notifyUser } = require('../../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre à expulser').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),

  async execute(interaction) {
    const target = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison');
    if (!target) return replyEphemeral(interaction, { embeds: [error('Ce membre n\'est pas sur le serveur.')] });

    const err = checkHierarchy(interaction.member, target);
    if (err) return replyEphemeral(interaction, { embeds: [error(err)] });

    await notifyUser('kick', interaction.guild, target.user, reason);
    await target.kick(`${interaction.user.tag} : ${reason ?? 'Aucune raison'}`);
    const embed = await modAction({ action: 'kick', guild: interaction.guild, user: target.user, moderator: interaction.user, reason });
    return interaction.reply({ embeds: [embed] });
  },
};
