// Gestion des partenaires depuis le panneau staff (#gestion-partenaires).
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, MessageFlags,
} = require('discord.js');
const config = require('../../config');
const db = require('../utils/db');
const { isStaff, replyEphemeral, getChannel } = require('../utils/helpers');
const { partnerMessage, base, success, error } = require('../utils/embeds');
const { sendLog } = require('../utils/logger');

/** "monsite.fr" → "https://monsite.fr" ; renvoie null si vide, false si invalide. */
function normalizeUrl(raw) {
  const v = raw.trim();
  if (!v) return null;
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    return u.hostname.includes('.') ? u.toString() : false;
  } catch {
    return false;
  }
}

function partnerModal(id, p = {}) {
  const input = (cid, label, style, required, max, value, placeholder) => {
    const t = new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(style)
      .setRequired(required).setMaxLength(max).setPlaceholder(placeholder);
    if (value) t.setValue(value);
    return new ActionRowBuilder().addComponents(t);
  };
  return new ModalBuilder()
    .setCustomId(`partner_modal:${id}`)
    .setTitle(id === 'new' ? '🤝 Nouveau partenaire' : `✏️ Modifier ${p.name}`.slice(0, 45))
    .addComponents(
      input('name', 'Nom du partenaire', TextInputStyle.Short, true, 100, p.name, 'Ex : MonServeur'),
      input('description', 'Description', TextInputStyle.Paragraph, true, 2000, p.description, 'Qui sont-ils ? Que proposent-ils ?'),
      input('website', 'Site web (optionnel)', TextInputStyle.Short, false, 300, p.website, 'https://...'),
      input('discord', 'Invitation Discord (optionnel)', TextInputStyle.Short, false, 300, p.discord, 'https://discord.gg/...'),
      input('image', 'Logo — URL d\'une image (optionnel)', TextInputStyle.Short, false, 500, p.image, 'https://.../logo.png'),
    );
}

function partnersChannel(guild) {
  return getChannel(guild, 'partners');
}

module.exports = {
  prefixes: ['partner_add', 'partner_manage', 'partner_pick', 'partner_edit', 'partner_delete', 'partner_confirmdel', 'partner_cancel', 'partner_modal'],

  async handle(interaction, arg, prefix) {
    if (!isStaff(interaction.member)) return replyEphemeral(interaction, { embeds: [error('Réservé au staff.')] });
    const { guild } = interaction;
    const g = db.guild(guild.id);

    if (prefix === 'partner_add') return interaction.showModal(partnerModal('new'));

    if (prefix === 'partner_manage') {
      const list = Object.values(g.partners);
      if (!list.length) return replyEphemeral(interaction, { embeds: [error('Aucun partenaire pour le moment. Utilise ➕ Ajouter.')] });
      const menu = new StringSelectMenuBuilder()
        .setCustomId('partner_pick')
        .setPlaceholder('Choisis un partenaire...')
        .addOptions(list.slice(0, 25).map((p) => ({ label: p.name.slice(0, 100), value: p.id, description: p.description.slice(0, 100) })));
      return replyEphemeral(interaction, {
        embeds: [base(0x9b59b6).setDescription(`**${list.length}** partenaire(s). Sélectionne celui à gérer :`)],
        components: [new ActionRowBuilder().addComponents(menu)],
      });
    }

    const id = prefix === 'partner_pick' ? interaction.values[0] : arg;
    const p = g.partners[id];

    if (prefix === 'partner_pick' || prefix === 'partner_cancel') {
      if (!p) return interaction.update({ embeds: [error('Partenaire introuvable.')], components: [] });
      const preview = partnerMessage(p);
      return interaction.update({
        content: '**Aperçu :**',
        embeds: preview.embeds,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`partner_edit:${id}`).setLabel('Modifier').setEmoji('✏️').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`partner_delete:${id}`).setLabel('Retirer').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        )],
      });
    }

    if (prefix === 'partner_edit') {
      if (!p) return replyEphemeral(interaction, { embeds: [error('Partenaire introuvable.')] });
      return interaction.showModal(partnerModal(id, p));
    }

    if (prefix === 'partner_delete') {
      if (!p) return interaction.update({ embeds: [error('Partenaire introuvable.')], components: [] });
      return interaction.update({
        content: '',
        embeds: [base(config.colors.error).setDescription(`⚠️ Retirer **${p.name}** des partenaires ? Sa fiche sera supprimée de #partenaires.`)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`partner_confirmdel:${id}`).setLabel('Oui, retirer').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`partner_cancel:${id}`).setLabel('Annuler').setStyle(ButtonStyle.Secondary),
        )],
      });
    }

    if (prefix === 'partner_confirmdel') {
      if (!p) return interaction.update({ embeds: [error('Partenaire introuvable.')], components: [] });
      const channel = guild.channels.cache.get(p.channelId);
      const msg = await channel?.messages.fetch(p.messageId).catch(() => null);
      await msg?.delete().catch(() => null);
      delete g.partners[id];
      db.save();
      await sendLog(guild, base(config.colors.error).setTitle('🤝 Partenaire retiré').setDescription(`**${p.name}** — par ${interaction.user}`));
      return interaction.update({ content: '', embeds: [success(`**${p.name}** a été retiré des partenaires.`)], components: [] });
    }

    // ---------- Formulaire envoyé : création ou modification ----------
    if (prefix === 'partner_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const f = (k) => interaction.fields.getTextInputValue(k).trim();
      const website = normalizeUrl(f('website'));
      const discord = normalizeUrl(f('discord'));
      const image = normalizeUrl(f('image'));
      const bad = [[website, 'site web'], [discord, 'invitation Discord'], [image, 'logo']].filter(([v]) => v === false).map(([, n]) => n);
      if (bad.length) return interaction.editReply({ embeds: [error(`Lien invalide : ${bad.join(', ')}. Vérifie l'adresse.`)] });

      const channel = partnersChannel(guild);
      if (!channel) return interaction.editReply({ embeds: [error('Le salon #partenaires n\'existe pas. Lance `/setup`.')] });

      const isNew = arg === 'new';
      const partner = {
        ...(isNew ? { id: Date.now().toString(36), createdBy: interaction.user.id } : g.partners[arg]),
        name: f('name'),
        description: f('description'),
        website,
        discord,
        image,
      };
      if (!isNew && !g.partners[arg]) return interaction.editReply({ embeds: [error('Partenaire introuvable.')] });

      // Publie ou met à jour la fiche (la reposte si elle a été supprimée à la main)
      const payload = partnerMessage(partner);
      const old = !isNew ? await guild.channels.cache.get(partner.channelId)?.messages.fetch(partner.messageId).catch(() => null) : null;
      let msg;
      try {
        msg = old ? await old.edit(payload) : await channel.send(payload);
      } catch (err) {
        // Ex. URL d'image refusée par Discord
        return interaction.editReply({ embeds: [error(`Discord a refusé la fiche : ${err.message}`)] });
      }
      partner.channelId = msg.channel.id;
      partner.messageId = msg.id;
      g.partners[partner.id] = partner;
      db.save();

      await sendLog(guild, base(0x9b59b6).setTitle(`🤝 Partenaire ${isNew ? 'ajouté' : 'modifié'}`)
        .setDescription(`**${partner.name}** — par ${interaction.user}\n${msg.url}`));
      return interaction.editReply({ embeds: [success(`Partenaire **${partner.name}** ${isNew ? 'publié' : 'mis à jour'} : ${msg.url}`)] });
    }
  },
};
