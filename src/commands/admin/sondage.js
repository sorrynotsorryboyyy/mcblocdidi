const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../../utils/db');
const { success, error } = require('../../utils/embeds');
const { getRole, isStaff, parseDuration, replyEphemeral } = require('../../utils/helpers');
const polls = require('../../utils/polls');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sondage')
    .setDescription('Crée un sondage à boutons')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName('question').setDescription('La question').setRequired(true).setMaxLength(200))
    .addStringOption((o) => o.setName('choix').setDescription('2 à 5 choix séparés par | (ex. Oui | Non | Peut-être)').setRequired(true).setMaxLength(400))
    .addStringOption((o) => o.setName('duree').setDescription('Durée (ex. 1h, 2j) — vide = sans fin'))
    .addBooleanOption((o) => o.setName('masquer').setDescription('Masquer les résultats jusqu\'à la fin'))
    .addChannelOption((o) => o.setName('salon').setDescription('Salon (défaut : ici)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addBooleanOption((o) => o.setName('mention').setDescription('Mentionner 📊 Sondages (défaut : oui)')),

  async execute(interaction) {
    if (!isStaff(interaction.member)) return replyEphemeral(interaction, { embeds: [error('Réservé au staff.')] });
    const choices = interaction.options.getString('choix').split('|').map((c) => c.trim()).filter(Boolean);
    if (choices.length < 2 || choices.length > 5) {
      return replyEphemeral(interaction, { embeds: [error('Il faut entre **2 et 5 choix**, séparés par `|`.')] });
    }
    const rawDuration = interaction.options.getString('duree');
    const ms = rawDuration ? parseDuration(rawDuration) : null;
    if (rawDuration && (!ms || ms < 60_000)) {
      return replyEphemeral(interaction, { embeds: [error('Durée invalide (1 minute minimum). Exemples : `30m`, `1h`, `2j`.')] });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    const poll = {
      id: Date.now().toString(36),
      question: interaction.options.getString('question'),
      choices: choices.map((c) => c.slice(0, 80)),
      votes: {},
      endsAt: ms ? Date.now() + ms : null,
      ended: false,
      hideResults: interaction.options.getBoolean('masquer') ?? false,
      authorId: interaction.user.id,
      channelId: channel.id,
    };
    const role = (interaction.options.getBoolean('mention') ?? true) ? getRole(interaction.guild, 'notifPolls') : null;
    const msg = await channel.send({
      ...polls.pollMessage(poll),
      content: role ? `${role}` : undefined,
      allowedMentions: { roles: role ? [role.id] : [] },
    });
    poll.messageId = msg.id;
    db.guild(interaction.guild.id).polls[poll.id] = poll;
    db.save();
    return interaction.editReply({ embeds: [success(`Sondage publié dans ${channel} !`)] });
  },
};
