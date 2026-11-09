const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../../../config');
const { base } = require('../../utils/embeds');
const { createCode, linkOf } = require('../../utils/links');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lier')
    .setDescription('Relie ton compte Minecraft pour recevoir tes récompenses en jeu'),

  async execute(interaction) {
    const link = linkOf(interaction.guild.id, interaction.user.id);
    if (link) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [base(config.colors.info).setDescription(
          `🔗 Ton compte est déjà lié à **${link.name}**.\nPour changer de compte, fais d'abord \`/delier\`.`,
        )],
      });
    }
    const { code, expiresAt } = createCode(interaction.guild.id, interaction.user.id);
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [base(config.colors.primary)
        .setTitle('🔗 Lier ton compte Minecraft')
        .setDescription(
          `1️⃣ Connecte-toi sur \`${config.minecraft.host}\`\n`
          + `2️⃣ Tape dans le chat :\n\`\`\`/lier ${code}\`\`\`\n`
          + `⏰ Code valable jusqu'à <t:${Math.floor(expiresAt / 1000)}:t> (usage unique).\n`
          + '> 🔒 Ne partage jamais ce code.',
        )],
    });
  },
};
