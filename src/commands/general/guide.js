const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../../../config');
const gameGuide = require('../../utils/gameGuide');
const { base } = require('../../utils/embeds');

/** Sections proposées : le réseau, la progression, puis chaque mini-jeu (même identifiant que le serveur Minecraft). */
const CHOICES = [
  { name: '🌐 Réseau (règles, commandes)', value: 'reseau' },
  { name: '⭐ Progression (pièces, niveaux, coffres)', value: 'progression' },
  { name: '💎 Grades (prix et avantages)', value: 'grades' },
  ...config.minigames.slice(0, 20).map((g) => ({ name: `${g.emoji} ${g.name}`, value: g.server })),
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guide')
    .setDescription('Règles, commandes et chiffres d\'un jeu (dégâts, chances, prix...)')
    .addStringOption((o) => o.setName('section').setDescription('Le jeu ou la partie du guide').setRequired(true)
      .addChoices(...CHOICES)),

  async execute(interaction) {
    const id = interaction.options.getString('section', true);
    const section = gameGuide.section(id);
    if (!section) {
      const embed = base(config.colors.info)
        .setDescription('📖 Ce guide n\'est pas encore disponible : il arrive dès que le serveur Minecraft l\'a publié.');
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ ...gameGuide.sectionPayload(section), flags: MessageFlags.Ephemeral });
  },
};
