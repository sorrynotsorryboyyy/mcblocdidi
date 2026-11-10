const { SlashCommandBuilder } = require('discord.js');
const config = require('../../../config');
const db = require('../../utils/db');
const { base } = require('../../utils/embeds');
const levels = require('../../utils/levels');

const bar = (current, needed, size = 12) => {
  const filled = Math.round((current / needed) * size);
  return '🟩'.repeat(filled) + '⬛'.repeat(size - filled);
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('niveau')
    .setDescription('Ton niveau Discord (ou celui d\'un membre)')
    .addUserOption((o) => o.setName('membre').setDescription('Membre à consulter')),

  async execute(interaction) {
    const user = interaction.options.getUser('membre') ?? interaction.user;
    const rec = db.guild(interaction.guild.id).levels[user.id] ?? { xp: 0, voiceMinutes: 0 };
    const { level, current, needed } = levels.levelFromXp(rec.xp);
    const nextTier = config.levels.tiers.find((t) => t.level > level);
    const rank = levels.rankOf(interaction.guild.id, user.id);

    const embed = base(config.colors.primary)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setTitle(`📈 Niveau ${level}`)
      .setDescription(`${bar(current, needed)}\n**${current} / ${needed} XP** vers le niveau ${level + 1}`)
      .addFields(
        { name: '🏆 Rang', value: rank ? `#${rank}` : '—', inline: true },
        { name: '✨ XP totale', value: String(rec.xp), inline: true },
        { name: '🎙️ Vocal', value: `${rec.voiceMinutes ?? 0} min`, inline: true },
      );
    if (nextTier) embed.addFields({ name: '🎯 Prochain palier', value: `Niveau ${nextTier.level} → **${nextTier.coins} pièces** en jeu` });
    return interaction.reply({ embeds: [embed] });
  },
};
