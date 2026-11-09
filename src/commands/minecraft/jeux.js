const { SlashCommandBuilder } = require('discord.js');
const config = require('../../../config');
const { base } = require('../../utils/embeds');
const { getChannel } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jeux')
    .setDescription('Liste les mini-jeux du serveur'),

  async execute(interaction) {
    const embed = base()
      .setTitle(`🎮 Les mini-jeux de ${config.serverName}`)
      .setDescription('Utilise `/lfg` pour trouver des joueurs, et choisis tes rôles de jeu pour être notifié !');
    for (const g of config.minigames.slice(0, 25)) {
      const ch = getChannel(interaction.guild, `game_${g.id}`);
      embed.addFields({ name: `${g.emoji} ${g.name}`, value: `${g.description}${ch ? `\n💬 ${ch}` : ''}`, inline: true });
    }
    return interaction.reply({ embeds: [embed] });
  },
};
