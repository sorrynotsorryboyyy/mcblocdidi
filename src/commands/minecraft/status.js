const { SlashCommandBuilder } = require('discord.js');
const { getStatus } = require('../../utils/mcstatus');
const { statusEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Affiche le statut du serveur Minecraft'),

  async execute(interaction) {
    await interaction.deferReply();
    const s = await getStatus();
    return interaction.editReply({ embeds: [statusEmbed(s)] });
  },
};
