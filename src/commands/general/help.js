const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../../../config');
const { base } = require('../../utils/embeds');

const CATEGORIES = {
  general: '📖 Général',
  minecraft: '🎮 Minecraft & Mini-jeux',
  moderation: '🛡️ Modération',
  admin: '⚙️ Administration',
};

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Liste des commandes du bot'),

  async execute(interaction, client) {
    const embed = base().setTitle(`📚 Commandes de ${config.serverName}`);
    for (const [cat, label] of Object.entries(CATEGORIES)) {
      const cmds = client.commands.filter((c) => c.category === cat);
      if (!cmds.size) continue;
      embed.addFields({
        name: label,
        value: cmds.map((c) => `\`/${c.data.name}\` — ${c.data.description}`).join('\n'),
      });
    }
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
