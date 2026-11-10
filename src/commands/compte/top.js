const { SlashCommandBuilder } = require('discord.js');
const config = require('../../../config');
const { base } = require('../../utils/embeds');
const levels = require('../../utils/levels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('Les membres les plus actifs du Discord'),

  async execute(interaction) {
    const top = levels.ranking(interaction.guild.id).slice(0, 10);
    const medals = ['🥇', '🥈', '🥉'];
    const mine = levels.rankOf(interaction.guild.id, interaction.user.id);
    return interaction.reply({
      embeds: [base(0xf1c40f)
        .setTitle(`🏅 Top Discord — ${config.serverName}`)
        .setDescription(top.length
          ? top.map(([id, r], i) => `${medals[i] ?? `\`#${i + 1}\``} <@${id}> — niveau **${r.level}** (${r.xp} XP)`).join('\n')
          : 'Personne n\'a encore d\'XP.')
        .addFields({ name: 'Ton rang', value: mine ? `#${mine}` : 'Pas encore classé' })],
      allowedMentions: { parse: [] },
    });
  },
};
