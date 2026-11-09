const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../../config');
const { base, success, error } = require('../../utils/embeds');
const { sendLog } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime des messages dans ce salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('membre').setDescription('Ne supprimer que les messages de ce membre')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const amount = interaction.options.getInteger('nombre');
    const user = interaction.options.getUser('membre');

    let messages = await interaction.channel.messages.fetch({ limit: 100 });
    if (user) messages = messages.filter((m) => m.author.id === user.id);
    messages = [...messages.values()].slice(0, amount);

    // bulkDelete ignore les messages de plus de 14 jours (limite Discord)
    const deleted = await interaction.channel.bulkDelete(messages, true);
    if (!deleted.size) return interaction.editReply({ embeds: [error('Aucun message supprimable (ils ont peut-être plus de 14 jours).')] });

    await sendLog(interaction.guild, base(config.colors.info).setTitle('🧹 Messages supprimés').addFields(
      { name: 'Salon', value: `${interaction.channel}`, inline: true },
      { name: 'Nombre', value: `${deleted.size}`, inline: true },
      { name: 'Modérateur', value: `${interaction.user}`, inline: true },
      ...(user ? [{ name: 'Filtre', value: `${user}` }] : []),
    ));
    return interaction.editReply({ embeds: [success(`**${deleted.size}** message(s) supprimé(s).`)] });
  },
};
