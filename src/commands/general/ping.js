const { SlashCommandBuilder } = require('discord.js');
const { base } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Affiche la latence du bot'),

  async execute(interaction, client) {
    const sent = Date.now();
    await interaction.deferReply();
    return interaction.editReply({
      embeds: [base().setDescription(`🏓 Pong !\n**API :** ${Date.now() - sent} ms\n**WebSocket :** ${client.ws.ping} ms`)],
    });
  },
};
