const { SlashCommandBuilder } = require('discord.js');
const config = require('../../../config');
const { base, ip } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Affiche l\'adresse du serveur Minecraft'),

  async execute(interaction) {
    const embed = base()
      .setTitle(`🌐 Rejoindre ${config.serverName}`)
      .addFields(
        { name: 'Adresse', value: `\`\`\`${ip()}\`\`\`` },
        { name: 'Version', value: config.minecraft.version, inline: true },
        { name: 'Édition', value: 'Java', inline: true },
      );
    return interaction.reply({ embeds: [embed] });
  },
};
