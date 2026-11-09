const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../../../config');
const db = require('../../utils/db');
const { base, error } = require('../../utils/embeds');
const { isStaff } = require('../../utils/helpers');
const { linkOf } = require('../../utils/links');
const { rewardsOf } = require('../../utils/rewards');
const invites = require('../../utils/invites');

const STATUS = { pending: '⏳', delivered: '✅', failed: '⚠️' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('compte')
    .setDescription('Ton compte lié, tes invitations et tes récompenses')
    .addUserOption((o) => o.setName('membre').setDescription('(Staff) voir le compte d\'un autre membre')),

  async execute(interaction) {
    const target = interaction.options.getUser('membre') ?? interaction.user;
    if (target.id !== interaction.user.id && !isStaff(interaction.member)) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [error('Seul le staff peut voir le compte d\'un autre membre.')] });
    }
    const guildId = interaction.guild.id;
    const link = linkOf(guildId, target.id);
    const inv = invites.stats(guildId, target.id);
    const boosts = db.guild(guildId).boosts[target.id]?.count ?? 0;
    const rewards = rewardsOf(guildId, target.id).sort((a, b) => b.createdAt - a.createdAt);

    const embed = base(config.colors.info)
      .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
      .setTitle('👤 Compte')
      .addFields(
        { name: '🔗 Minecraft', value: link ? `\`${link.name}\`` : 'Non lié — utilise `/lier`', inline: true },
        { name: '📨 Invitations', value: `✅ ${inv.rewarded} · ⏳ ${inv.pending} · 🚪 ${inv.left}`, inline: true },
        { name: '🚀 Boosts', value: String(boosts), inline: true },
        {
          name: `🎁 Récompenses (${rewards.length})`,
          value: rewards.length
            ? rewards.slice(0, 10).map((r) => `${STATUS[r.status] ?? '•'} ${r.label}`).join('\n')
            : 'Aucune pour le moment.',
        },
      );
    if (!link && rewards.some((r) => r.status === 'pending')) {
      embed.setDescription('⚠️ Des récompenses t\'attendent : relie ton compte avec `/lier` pour les recevoir en jeu.');
    }
    return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
  },
};
