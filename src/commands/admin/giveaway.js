const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../../utils/db');
const { giveawayMessage, success, error } = require('../../utils/embeds');
const { isStaff, replyEphemeral, parseDuration, getRole } = require('../../utils/helpers');
const { endGiveaway } = require('../../utils/giveaways');

const MAX_MS = 30 * 864e5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Gestion des giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) => s.setName('lancer').setDescription('Lance un giveaway')
      .addStringOption((o) => o.setName('prix').setDescription('Ce qu\'on peut gagner').setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName('duree').setDescription('Ex : 30m, 2h, 1j').setRequired(true))
      .addIntegerOption((o) => o.setName('gagnants').setDescription('Nombre de gagnants (défaut 1)').setMinValue(1).setMaxValue(20))
      .addChannelOption((o) => o.setName('salon').setDescription('Salon (défaut : ici)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((o) => o.setName('description').setDescription('Conditions, détails...').setMaxLength(1000)))
    .addSubcommand((s) => s.setName('terminer').setDescription('Termine un giveaway maintenant')
      .addStringOption((o) => o.setName('id').setDescription('ID du giveaway (en bas de l\'embed)').setRequired(true)))
    .addSubcommand((s) => s.setName('reroll').setDescription('Tire de nouveaux gagnants')
      .addStringOption((o) => o.setName('id').setDescription('ID du giveaway (en bas de l\'embed)').setRequired(true)))
    .addSubcommand((s) => s.setName('liste').setDescription('Giveaways en cours')),

  async execute(interaction) {
    if (!isStaff(interaction.member)) return replyEphemeral(interaction, { embeds: [error('Réservé au staff.')] });
    const sub = interaction.options.getSubcommand();
    const g = db.guild(interaction.guild.id);

    if (sub === 'liste') {
      const list = Object.values(g.giveaways).filter((gw) => !gw.ended);
      if (!list.length) return replyEphemeral(interaction, 'Aucun giveaway en cours.');
      return replyEphemeral(interaction, list.map((gw) =>
        `• \`${gw.id}\` — **${gw.prize}** — fin <t:${Math.floor(gw.endsAt / 1000)}:R> — ${gw.participants.length} participant(s)`).join('\n'));
    }

    if (sub === 'lancer') {
      const ms = parseDuration(interaction.options.getString('duree'));
      if (!ms || ms < 10_000) return replyEphemeral(interaction, { embeds: [error('Durée invalide. Exemples : `30m`, `2h`, `1j`.')] });
      if (ms > MAX_MS) return replyEphemeral(interaction, { embeds: [error('Durée maximale : 30 jours.')] });

      const channel = interaction.options.getChannel('salon') ?? interaction.channel;
      const gw = {
        id: Date.now().toString(36),
        prize: interaction.options.getString('prix'),
        description: interaction.options.getString('description') ?? '',
        winners: interaction.options.getInteger('gagnants') ?? 1,
        endsAt: Date.now() + ms,
        hostId: interaction.user.id,
        participants: [],
        winnerIds: [],
        ended: false,
        channelId: channel.id,
      };
      const ping = getRole(interaction.guild, 'notifGiveaways');
      const msg = await channel.send({
        ...giveawayMessage(gw),
        content: ping ? `${ping}` : undefined,
        allowedMentions: { roles: ping ? [ping.id] : [] },
      });
      gw.messageId = msg.id;
      g.giveaways[gw.id] = gw;
      db.save();
      return replyEphemeral(interaction, { embeds: [success(`Giveaway lancé dans ${channel} ! (ID : \`${gw.id}\`)`)] });
    }

    // terminer / reroll
    const gw = g.giveaways[interaction.options.getString('id').trim()];
    if (!gw) return replyEphemeral(interaction, { embeds: [error('Giveaway introuvable. Vérifie l\'ID en bas de l\'embed.')] });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'terminer') {
      if (gw.ended) return interaction.editReply({ embeds: [error('Ce giveaway est déjà terminé. Utilise `/giveaway reroll`.')] });
      const winners = await endGiveaway(interaction.client, interaction.guild.id, gw);
      return interaction.editReply({ embeds: [success(`Giveaway terminé — ${winners.length} gagnant(s).`)] });
    }

    if (!gw.ended) return interaction.editReply({ embeds: [error('Ce giveaway n\'est pas encore terminé.')] });
    const winners = await endGiveaway(interaction.client, interaction.guild.id, gw, { reroll: true });
    return interaction.editReply({ embeds: [success(`Nouveau tirage effectué — ${winners.length} gagnant(s).`)] });
  },
};
