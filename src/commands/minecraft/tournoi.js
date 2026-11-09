const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../utils/db');
const { tournamentMessage, success, error } = require('../../utils/embeds');
const { getChannel, getRole, gameChoices, isStaff, replyEphemeral } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournoi')
    .setDescription('Gestion des tournois')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) => s.setName('creer').setDescription('Crée un tournoi avec inscriptions')
      .addStringOption((o) => o.setName('jeu').setDescription('Le mini-jeu').setRequired(true).addChoices(...gameChoices()))
      .addStringOption((o) => o.setName('date').setDescription('Ex : Samedi 15 mars à 20h').setRequired(true).setMaxLength(100))
      .addIntegerOption((o) => o.setName('places').setDescription('Nombre de places').setRequired(true).setMinValue(2).setMaxValue(100))
      .addStringOption((o) => o.setName('description').setDescription('Règles, récompenses...').setMaxLength(1000)))
    .addSubcommand((s) => s.setName('liste').setDescription('Affiche les tournois en cours')),

  async execute(interaction) {
    if (!isStaff(interaction.member)) return replyEphemeral(interaction, { embeds: [error('Réservé au staff.')] });
    const g = db.guild(interaction.guild.id);

    if (interaction.options.getSubcommand() === 'liste') {
      const list = Object.values(g.tournaments).filter((t) => !t.closed);
      if (!list.length) return replyEphemeral(interaction, 'Aucun tournoi ouvert.');
      return replyEphemeral(interaction, list.map((t) =>
        `• **${t.game}** — ${t.date} — ${t.participants.length}/${t.slots} — https://discord.com/channels/${interaction.guild.id}/${t.channelId}/${t.messageId}`).join('\n'));
    }

    const t = {
      id: Date.now().toString(36),
      game: interaction.options.getString('jeu'),
      date: interaction.options.getString('date'),
      slots: interaction.options.getInteger('places'),
      description: interaction.options.getString('description') ?? '',
      participants: [],
      closed: false,
      createdBy: interaction.user.id,
    };

    const channel = getChannel(interaction.guild, 'tournaments') ?? interaction.channel;
    const pings = [getRole(interaction.guild, 'notifTournois'), getRole(interaction.guild, `game_${t.game}`)].filter(Boolean);

    const msg = await channel.send({
      content: pings.join(' ') || undefined,
      ...tournamentMessage(t, interaction.guild),
      allowedMentions: { roles: pings.map((r) => r.id) },
    });
    t.channelId = channel.id;
    t.messageId = msg.id;
    g.tournaments[t.id] = t;
    db.save();

    return replyEphemeral(interaction, { embeds: [success(`Tournoi créé dans ${channel} !`)] });
  },
};
