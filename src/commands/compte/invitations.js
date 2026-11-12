const { SlashCommandBuilder } = require('discord.js');
const config = require('../../../config');
const { base } = require('../../utils/embeds');
const invites = require('../../utils/invites');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invitations')
    .setDescription('Tes invitations (ou celles d\'un membre) et le classement')
    .addUserOption((o) => o.setName('membre').setDescription('Membre à consulter')),

  async execute(interaction) {
    const user = interaction.options.getUser('membre') ?? interaction.user;
    const s = invites.stats(interaction.guild.id, user.id);
    const rank = invites.leaderboard(interaction.guild.id, 1000).findIndex(([id]) => id === user.id);
    const embed = base(config.colors.accent)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setTitle('📨 Invitations')
      .addFields(
        { name: '✅ Validées', value: String(s.rewarded), inline: true },
        { name: '⏳ En attente', value: String(s.pending), inline: true },
        { name: '🚪 Parties', value: String(s.left), inline: true },
        { name: '🏆 Classement', value: rank >= 0 ? `#${rank + 1}` : '—', inline: true },
        { name: '💰 Gagné', value: `${s.rewarded * config.invites.rewardCoins} pièces`, inline: true },
      )
      .setDescription(`Chaque invitation validée rapporte **${config.invites.rewardCoins} pièces** en jeu. Crée ton lien : clic droit sur le serveur → *Inviter des gens*.`);
    return interaction.reply({ embeds: [embed] });
  },
};
