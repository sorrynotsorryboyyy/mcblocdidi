const { SlashCommandBuilder } = require('discord.js');
const config = require('../../../config');
const { base, error, success, ip } = require('../../utils/embeds');
const { getChannel, getRole, gameChoices, findGame, replyEphemeral, formatDuration } = require('../../utils/helpers');

const cooldowns = new Map(); // userId → timestamp

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Cherche des joueurs pour une partie')
    .addStringOption((o) => o.setName('jeu').setDescription('Le mini-jeu').setRequired(true).addChoices(...gameChoices()))
    .addIntegerOption((o) => o.setName('joueurs').setDescription('Nombre de joueurs recherchés').setMinValue(1).setMaxValue(50))
    .addStringOption((o) => o.setName('message').setDescription('Infos supplémentaires').setMaxLength(300)),

  async execute(interaction) {
    const last = cooldowns.get(interaction.user.id) ?? 0;
    const remaining = last + config.lfgCooldown - Date.now();
    if (remaining > 0) {
      return replyEphemeral(interaction, { embeds: [error(`Attends encore **${formatDuration(remaining)}** avant de relancer une recherche.`)] });
    }

    const game = findGame(interaction.options.getString('jeu'));
    const count = interaction.options.getInteger('joueurs');
    const extra = interaction.options.getString('message');
    const channel = getChannel(interaction.guild, 'lfg') ?? interaction.channel;
    const role = getRole(interaction.guild, `game_${game.id}`);

    const embed = base(config.colors.warning)
      .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL() })
      .setTitle(`🔎 Recherche de joueurs — ${game.emoji} ${game.name}`)
      .setDescription(`${interaction.user} cherche ${count ? `**${count}** joueur(s)` : 'des joueurs'} pour une partie de **${game.name}** !${extra ? `\n\n> ${extra}` : ''}`)
      .addFields({ name: '🌐 IP', value: `\`${ip()}\``, inline: true }, { name: '💬 Contact', value: `${interaction.user}`, inline: true });

    await channel.send({
      content: role ? `${role}` : undefined,
      embeds: [embed],
      allowedMentions: { roles: role ? [role.id] : [] },
    });
    cooldowns.set(interaction.user.id, Date.now());

    return replyEphemeral(interaction, { embeds: [success(`Ta recherche a été publiée dans ${channel} !`)] });
  },
};
