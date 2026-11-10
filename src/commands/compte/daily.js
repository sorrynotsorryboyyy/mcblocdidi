const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../../../config');
const { base, error } = require('../../utils/embeds');
const { linkOf } = require('../../utils/links');
const daily = require('../../utils/daily');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Récupère tes pièces quotidiennes en jeu'),

  async execute(interaction) {
    // Compte lié obligatoire : évite d'accumuler des récompenses sur des comptes jetables
    if (!linkOf(interaction.guild.id, interaction.user.id)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [error('Relie d\'abord ton compte Minecraft avec `/lier` pour recevoir tes pièces quotidiennes.')],
      });
    }
    const result = daily.claim(interaction.guild, interaction.user.id);
    if (!result.ok) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [error(`Tu as déjà récupéré ta récompense aujourd'hui (série : **${result.streak} j**). Reviens demain !`)],
      });
    }
    const next = daily.amountFor(result.streak + 1);
    return interaction.reply({
      embeds: [base(config.colors.success)
        .setTitle('🎁 Récompense quotidienne')
        .setDescription(
          `${interaction.user} reçoit **${result.amount} pièces** en jeu !\n`
          + `🔥 Série : **${result.streak} jour(s)** — demain : **${next} pièces**.\n`
          + '> Les pièces arrivent en jeu dans moins d\'une minute.',
        )],
    });
  },
};
