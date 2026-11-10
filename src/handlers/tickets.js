const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits: P, AttachmentBuilder, MessageFlags,
} = require('discord.js');
const db = require('../utils/db');
const config = require('../../config');
const { getChannel, staffRoleIds, isStaff, replyEphemeral, getRole } = require('../utils/helpers');
const { base, error, success } = require('../utils/embeds');
const { sendLog } = require('../utils/logger');

const OWNER_RE = /ticket-owner:(\d+)/;

/** 5 boutons ⭐ envoyés en MP à la fermeture (voir handlers/ticketRating.js). */
function ratingRow(guildId, channelId) {
  return new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map((n) => new ButtonBuilder()
    .setCustomId(`ticket_rate:${guildId}:${channelId}:${n}`)
    .setLabel('⭐'.repeat(n))
    .setStyle(n >= 4 ? ButtonStyle.Success : n === 3 ? ButtonStyle.Secondary : ButtonStyle.Danger)));
}

function ownerOf(channel) {
  return channel.topic?.match(OWNER_RE)?.[1] ?? null;
}

function openTicketOf(guild, userId) {
  const id = db.guild(guild.id).tickets[userId];
  return id ? guild.channels.cache.get(id) ?? null : null;
}

async function buildTranscript(channel) {
  let messages = [];
  let before;
  for (let i = 0; i < 5; i++) { // max 500 messages
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    messages = messages.concat([...batch.values()]);
    before = batch.last().id;
  }
  const lines = messages.reverse().map((m) => {
    const date = m.createdAt.toLocaleString('fr-FR');
    const content = m.content || (m.embeds.length ? `[embed] ${m.embeds[0].title ?? m.embeds[0].description ?? ''}` : '');
    const files = m.attachments.map((a) => a.url).join(' ');
    return `[${date}] ${m.author.tag}: ${content} ${files}`.trim();
  });
  return new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: `${channel.name}.txt` });
}

module.exports = {
  // ticket_open = ancien bouton (avant la v2), gardé pour compatibilité
  prefixes: ['ticket_open', 'ticket_type', 'ticket_modal', 'ticket_close', 'ticket_claim', 'ticket_reopen', 'ticket_delete'],

  async handle(interaction, arg, prefix) {
    const { guild, member } = interaction;

    // ---------- Choix de la catégorie : affiche le formulaire correspondant ----------
    if (prefix === 'ticket_open' || prefix === 'ticket_type') {
      const typeId = prefix === 'ticket_type' ? interaction.values[0] : config.ticketTypes[0].id;
      const type = config.ticketTypes.find((t) => t.id === typeId);
      // Réinitialise la sélection du menu (sinon il reste bloqué sur l'option choisie)
      if (interaction.isStringSelectMenu()) interaction.message.edit({ components: interaction.message.components }).catch(() => null);
      if (!type) return replyEphemeral(interaction, { embeds: [error('Catégorie de ticket inconnue.')] });

      const existing = openTicketOf(guild, member.id);
      if (existing) return replyEphemeral(interaction, { embeds: [error(`Tu as déjà un ticket ouvert : ${existing}`)] });

      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal:${type.id}`)
        .setTitle(`${type.emoji} ${type.label}`.slice(0, 45))
        .addComponents(type.fields.slice(0, 5).map((f) => new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(f.id)
            .setLabel(f.label.slice(0, 45))
            .setStyle(f.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(f.required !== false)
            .setMaxLength(f.max ?? 1000),
        )));
      return interaction.showModal(modal);
    }

    // ---------- Formulaire envoyé : crée le salon ----------
    if (prefix === 'ticket_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const existing = openTicketOf(guild, member.id);
      if (existing) return interaction.editReply({ embeds: [error(`Tu as déjà un ticket ouvert : ${existing}`)] });

      const type = config.ticketTypes.find((t) => t.id === arg) ?? config.ticketTypes[0];
      // Réponses du formulaire (compatible avec l'ancien formulaire "pseudo" + "raison")
      const answers = interaction.fields.fields.map((f) => ({
        label: type.fields.find((d) => d.id === f.customId)?.label ?? f.customId,
        value: f.value?.trim() || '—',
      }));
      const summary = answers.map((a) => a.value).filter((v) => v !== '—').join(' / ');
      const parent = getChannel(guild, 'catSupport');
      const staff = staffRoleIds(guild);
      const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || member.id;

      const channel = await guild.channels.create({
        name: `${type.id}-${safeName}`,
        type: ChannelType.GuildText,
        parent: parent?.id,
        topic: `ticket-owner:${member.id} | ${type.label} | ${summary.slice(0, 900)}`,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
          { id: member.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks] },
          { id: guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.ReadMessageHistory] },
          ...staff.map((id) => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] })),
        ],
      });

      const g = db.guild(guild.id);
      g.tickets[member.id] = channel.id;
      db.save();

      const embed = base(config.colors.info)
        .setTitle(`${type.emoji} Ticket — ${type.label}`)
        .setDescription(`Bonjour ${member}, merci d'avoir contacté le staff !\nUn membre de l'équipe va te répondre rapidement.`)
        .addFields(
          { name: '👤 Ouvert par', value: `${member.user.tag}`, inline: true },
          { name: '📂 Catégorie', value: `${type.emoji} ${type.label}`, inline: true },
          ...answers.map((a) => ({ name: a.label.slice(0, 256), value: a.value.slice(0, 1024) })),
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('Prendre en charge').setEmoji('✋').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      );
      const support = getRole(guild, 'support');
      const opening = await channel.send({
        content: `${member}${support ? ` ${support}` : ''}`,
        embeds: [embed],
        components: [row],
        allowedMentions: { users: [member.id], roles: support ? [support.id] : [] },
      });
      g.ticketMeta[channel.id] = {
        ownerId: member.id, type: type.id, openedAt: Date.now(), claimedBy: null, openMessageId: opening.id, rating: null,
      };
      db.save();

      await sendLog(guild, base(config.colors.info).setTitle(`🎫 Ticket ouvert — ${type.label}`)
        .addFields(
          { name: 'Membre', value: `${member} (${member.id})` },
          { name: 'Salon', value: `${channel}` },
          { name: 'Résumé', value: summary.slice(0, 1024) || '—' },
        ));

      return interaction.editReply({ embeds: [success(`Ton ticket a été créé : ${channel}`)] });
    }

    // Les actions suivantes se font dans un salon de ticket
    const channel = interaction.channel;
    const ownerId = ownerOf(channel);
    if (!ownerId) return replyEphemeral(interaction, { embeds: [error('Ce salon n\'est pas un ticket.')] });

    // ---------- Fermer ----------
    if (prefix === 'ticket_close') {
      if (member.id !== ownerId && !isStaff(member)) {
        return replyEphemeral(interaction, { embeds: [error('Seul l\'auteur du ticket ou le staff peut le fermer.')] });
      }
      await interaction.deferUpdate();
      await channel.permissionOverwrites.edit(ownerId, { ViewChannel: false }).catch(() => null);
      const g = db.guild(guild.id);
      if (g.tickets[ownerId] === channel.id) { delete g.tickets[ownerId]; db.save(); }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_reopen').setLabel('Rouvrir').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_delete').setLabel('Supprimer').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      );
      await channel.send({ embeds: [base(config.colors.warning).setDescription(`🔒 Ticket fermé par ${member}.`)], components: [row] });
      await sendLog(guild, base(config.colors.warning).setTitle('🔒 Ticket fermé')
        .addFields({ name: 'Salon', value: `${channel}`, inline: true }, { name: 'Par', value: `${member}`, inline: true }));

      // Demande de note (une seule fois par ticket)
      const meta = g.ticketMeta[channel.id];
      if (meta && !meta.ratingAsked) {
        meta.ratingAsked = true;
        meta.closedAt = Date.now();
        db.save();
        const owner = await interaction.client.users.fetch(ownerId).catch(() => null);
        await owner?.send({
          embeds: [base(config.colors.info).setTitle('⭐ Ton avis compte !')
            .setDescription(`Ton ticket **${channel.name}** sur ${guild.name} a été fermé.\nComment évalues-tu l'aide du staff ?`)],
          components: [ratingRow(guild.id, channel.id)],
        }).catch(() => null);
      }
      return;
    }

    // ---------- Staff uniquement : prendre en charge / rouvrir / supprimer ----------
    if (!isStaff(member)) return replyEphemeral(interaction, { embeds: [error('Réservé au staff.')] });

    if (prefix === 'ticket_claim') {
      const g = db.guild(guild.id);
      const meta = g.ticketMeta[channel.id] ??= { ownerId, openedAt: channel.createdTimestamp, claimedBy: null };
      if (meta.claimedBy) {
        return replyEphemeral(interaction, { embeds: [error(`Ce ticket est déjà pris en charge par <@${meta.claimedBy}>.`)] });
      }
      meta.claimedBy = member.id;
      meta.claimedAt = Date.now();
      db.save();
      // Bouton désactivé + nom du staff sur le message d'ouverture
      const rows = interaction.message.components.map((r) => ActionRowBuilder.from(r));
      for (const r of rows) {
        for (const b of r.components) {
          if (b.data.custom_id === 'ticket_claim') b.setDisabled(true).setLabel(`Pris en charge par ${member.displayName}`.slice(0, 80));
        }
      }
      await interaction.update({ components: rows });
      await channel.send({ embeds: [base(config.colors.success).setDescription(`✋ ${member} prend en charge ce ticket.`)] });
      return;
    }

    if (prefix === 'ticket_reopen') {
      const g = db.guild(guild.id);
      const other = openTicketOf(guild, ownerId);
      if (other && other.id !== channel.id) {
        return replyEphemeral(interaction, { embeds: [error(`Ce membre a déjà un autre ticket ouvert : ${other}`)] });
      }
      await interaction.deferUpdate();
      await channel.permissionOverwrites.edit(ownerId, { ViewChannel: true, SendMessages: true }).catch(() => null);
      g.tickets[ownerId] = channel.id;
      if (g.ticketMeta[channel.id]) g.ticketMeta[channel.id].closedAt = null;
      db.save();
      await interaction.message.edit({ components: [] }).catch(() => null);
      await channel.send({ content: `<@${ownerId}>`, embeds: [base(config.colors.success).setDescription(`🔓 Ticket rouvert par ${member}.`)] });
      return;
    }

    if (prefix === 'ticket_delete') {
      await interaction.reply({ embeds: [base(config.colors.error).setDescription('🗑️ Suppression du ticket dans 5 secondes...')] });
      const transcript = await buildTranscript(channel).catch(() => null);
      await sendLog(guild, {
        embeds: [base(config.colors.error).setTitle('🗑️ Ticket supprimé').addFields(
          { name: 'Salon', value: channel.name, inline: true },
          { name: 'Auteur', value: `<@${ownerId}>`, inline: true },
          { name: 'Supprimé par', value: `${member}`, inline: true },
        )],
        files: transcript ? [transcript] : [],
      });
      const g = db.guild(guild.id);
      if (g.tickets[ownerId] === channel.id) delete g.tickets[ownerId];
      if (g.ticketMeta[channel.id]) g.ticketMeta[channel.id].closedAt ??= Date.now(); // gardé pour les stats
      db.save();
      setTimeout(() => channel.delete('Ticket supprimé').catch(() => null), 5000);
    }
  },
};
