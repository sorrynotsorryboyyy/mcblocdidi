// /setup : crée (ou met à jour) rôles, catégories, salons, permissions et panneaux.
// Relançable sans risque : ce qui existe déjà est réutilisé, rien n'est dupliqué.
const {
  SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, MessageFlags, GuildSystemChannelFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  GuildVerificationLevel, GuildExplicitContentFilter, GuildDefaultMessageNotifications, GuildFeature, Locale,
} = require('discord.js');
const config = require('../../../config');
const db = require('../../utils/db');
const { allRoleDefs, getChannel } = require('../../utils/helpers');
const embeds = require('../../utils/embeds');
const { getStatus } = require('../../utils/mcstatus');
const counters = require('../../utils/counters');
const { ensurePanel } = require('../../utils/panels');
const invites = require('../../utils/invites');
const boosts = require('../../utils/boosts');
const levels = require('../../utils/levels');
const leaderboards = require('../../utils/leaderboards');
const gameGuide = require('../../utils/gameGuide');
const launch = require('../../utils/launch');
const linkedRole = require('../../utils/linkedRole');
const guide = require('../../utils/guide');
const staff = require('../../utils/staff');
const { fixFooters } = require('../../utils/cleanup');

// ---------- Rôles ----------
async function ensureRole(guild, def, g) {
  let role = guild.roles.cache.get(g.roles[def.key]) ?? guild.roles.cache.find((r) => r.name === def.name);
  const options = {
    name: def.name,
    colors: { primaryColor: def.color ?? 0 },
    hoist: !!def.hoist,
    mentionable: !!def.selfAssign,
    permissions: def.permissions ?? [],
  };
  if (!role) {
    role = await guild.roles.create({ ...options, reason: '/setup' });
  } else if (role.editable) {
    await role.edit({ ...options, reason: '/setup' });
  }
  g.roles[def.key] = role.id;
  return role;
}

// ---------- Permissions par type d'accès ----------
function overwritesFor(access, guild, R) {
  const everyone = guild.roles.everyone.id;
  const staff = config.staffRoles.map((k) => R[k]).filter(Boolean);
  const me = guild.members.me.id;
  const staffFull = staff.map((id) => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.Connect, P.Speak] }));
  const bot = { id: me, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory, P.ManageChannels, P.ManageMessages] };

  switch (access) {
    case 'public':
      return [
        { id: everyone, deny: [P.ViewChannel] },
        { id: R.member, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.AddReactions] },
        ...staffFull, bot,
      ];
    case 'readonly':
      return [
        { id: everyone, deny: [P.ViewChannel, P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads] },
        { id: R.member, allow: [P.ViewChannel, P.ReadMessageHistory, P.AddReactions], deny: [P.SendMessages] },
        ...staffFull, bot,
      ];
    case 'rulesGate': // étape 2 : visible dès que l'âge est indiqué (et toujours pour les membres)
    case 'guideGate': { // étape 3 : visible dès que le règlement est accepté (et toujours pour les membres)
      const readers = access === 'rulesGate'
        ? [R.ageMinor, R.ageAdult, R.rulesAccepted, R.member]
        : [R.rulesAccepted, R.member];
      return [
        { id: everyone, deny: [P.ViewChannel, P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads] },
        ...readers.filter(Boolean).map((id) => ({ id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions] })),
        ...staffFull, bot,
      ];
    }
    case 'staffAnnounce': { // la direction écrit, le reste du staff lit et réagit
      const writers = ['founder', 'admin'].map((k) => R[k]).filter(Boolean);
      const readers = staff.filter((id) => !writers.includes(id));
      return [
        { id: everyone, deny: [P.ViewChannel] },
        ...readers.map((id) => ({ id, allow: [P.ViewChannel, P.ReadMessageHistory, P.AddReactions], deny: [P.SendMessages] })),
        ...writers.map((id) => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.MentionEveryone] })),
        bot,
      ];
    }
    case 'verify': // étape 1 : visible uniquement par ceux qui n'ont pas encore le rôle Membre
      return [
        { id: everyone, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads] },
        { id: R.member, deny: [P.ViewChannel] },
        bot,
      ];
    case 'staff':
      return [{ id: everyone, deny: [P.ViewChannel] }, ...staffFull, bot];
    case 'counter': // salons compteurs : visibles par tous, impossible de s'y connecter
      return [
        { id: everyone, allow: [P.ViewChannel], deny: [P.Connect, P.SendMessages] },
        { id: me, allow: [P.ViewChannel, P.ManageChannels, P.Connect] },
      ];
    case 'voice':
      return [
        { id: everyone, deny: [P.ViewChannel, P.Connect] },
        { id: R.member, allow: [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD] },
        ...staffFull, bot,
      ];
    default:
      throw new Error(`Type d'accès inconnu : ${access}`);
  }
}

// ---------- Salons ----------

/**
 * Nom « de base » d'un salon, sans les parties que le bot modifie lui-même :
 *   "🔴┃statut-serveur" → "statut-serveur"   (emoji d'état)
 *   "👥 Membres : 12"   → "membres"          (valeur du compteur)
 */
function coreName(name) {
  let n = name.includes('┃') ? name.split('┃').slice(1).join('┃') : name;
  if (n.includes(':')) n = n.split(':')[0];
  return n.toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, ' ').trim();
}

let removedDuplicates = []; // rempli par ensureChannel pendant un /setup

/** Texte et annonces = même « type » (un #annonces converti doit être retrouvé, pas recréé). */
const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const sameType = (a, b) => a === b || (TEXT_TYPES.includes(a) && TEXT_TYPES.includes(b));

/**
 * Active la Communauté Discord : prérequis (vérification, filtre, notifications,
 * #règles, salon des mises à jour Discord) puis la fonctionnalité COMMUNITY,
 * et convertit les salons marqués `announcement: true` en salons d'annonces.
 * @returns {Promise<{ok: boolean, error?: string, converted: string[]}>}
 */
async function enableCommunity(guild) {
  const rules = getChannel(guild, 'rules');
  const updates = getChannel(guild, 'discordUpdates');
  const converted = [];
  if (!rules || !updates) return { ok: false, error: 'salons #règles ou #discord-updates introuvables', converted };
  try {
    await guild.edit({
      verificationLevel: Math.max(guild.verificationLevel, GuildVerificationLevel.Low),
      explicitContentFilter: GuildExplicitContentFilter.AllMembers,
      defaultMessageNotifications: GuildDefaultMessageNotifications.OnlyMentions,
      rulesChannel: rules.id,
      publicUpdatesChannel: updates.id,
      preferredLocale: Locale.French,
      reason: '/setup : prérequis Communauté',
    });
    if (!guild.features.includes(GuildFeature.Community)) {
      await guild.edit({ features: [...guild.features, GuildFeature.Community], reason: '/setup : activation Communauté' });
    }
  } catch (err) {
    return { ok: false, error: err.message, converted };
  }
  // Salons d'annonces (suivables par d'autres serveurs) — uniquement possible en Communauté
  for (const ch of config.categories.flatMap((c) => c.channels).filter((c) => c.announcement)) {
    const channel = getChannel(guild, ch.key);
    if (channel?.type === ChannelType.GuildText) {
      await channel.setType(ChannelType.GuildAnnouncement, '/setup : salon d\'annonces')
        .then(() => converted.push(channel.name))
        .catch((err) => console.error('[setup] conversion annonces :', err.message));
    }
  }
  return { ok: true, converted };
}

/**
 * Crée ou met à jour le salon `key`. AUCUN DOUBLON : tout autre salon du même type et du même nom
 * (dans N'IMPORTE QUELLE catégorie, ex. un ancien #spoilers resté dans MINI-JEUX) est supprimé,
 * qu'il contienne des messages ou non. Un salon déplacé dans config.js est donc déplacé, jamais recopié.
 */
async function ensureChannel(guild, g, { key, name, type, parent, overwrites, topic }, protectedIds = new Set()) {
  const parentId = parent?.id ?? null;
  const sameKind = (c) => sameType(c.type, type) && coreName(c.name) === coreName(name);
  const candidates = guild.channels.cache.filter(sameKind);
  const inParent = candidates.filter((c) => (c.parentId ?? null) === parentId);

  let channel = guild.channels.cache.get(g.channels[key])
    ?? inParent.find((c) => c.name === name)
    ?? inParent.sort((a, b) => a.createdTimestamp - b.createdTimestamp).first()
    ?? candidates.sort((a, b) => a.createdTimestamp - b.createdTimestamp).first();

  if (channel) {
    const managed = new Set(Object.values(g.channels)); // salons d'autres clés : jamais touchés ici
    for (const dup of candidates.values()) {
      if (dup.id === channel.id || protectedIds.has(dup.id) || (managed.has(dup.id) && g.channels[key] !== dup.id)) continue;
      await dup.delete('/setup : salon en double').then(() => removedDuplicates.push(dup.name)).catch(() => null);
    }
  }

  if (!channel) {
    channel = await guild.channels.create({ name, type, parent: parent?.id, topic, permissionOverwrites: overwrites, reason: '/setup' });
  } else {
    const edit = { permissionOverwrites: overwrites, reason: '/setup' };
    // Renomme si le nom de base a changé dans config.js (pas pour l'emoji d'état / la valeur d'un compteur)
    if (coreName(channel.name) !== coreName(name)) edit.name = name;
    if (parent && channel.parentId !== parent.id) edit.parent = parent.id;
    if (topic && 'topic' in channel && channel.topic !== topic) edit.topic = topic;
    await channel.edit(edit);
  }
  g.channels[key] = channel.id;
  return channel;
}

/**
 * Remise à neuf : supprime tous les salons et catégories sauf `protectedIds` (salon de la commande, tickets ouverts).
 * Discord refuse de supprimer #règles et le salon des mises à jour d'un serveur Communauté : ils sont réutilisés.
 */
async function wipeChannels(guild, g, protectedIds) {
  await guild.channels.fetch().catch(() => null);
  const all = [...guild.channels.cache.values()].filter((c) => !c.isThread() && !protectedIds.has(c.id));
  const ordered = [...all.filter((c) => c.type !== ChannelType.GuildCategory), ...all.filter((c) => c.type === ChannelType.GuildCategory)];
  let deleted = 0;
  const failed = [];
  for (const channel of ordered) {
    await channel.delete('/setup nettoyage : remise à neuf').then(() => { deleted += 1; }).catch(() => failed.push(channel.name));
  }
  // La base oublie les salons et les messages qui n'existent plus
  for (const [key, id] of Object.entries(g.channels)) if (!guild.channels.cache.has(id)) delete g.channels[key];
  for (const [key, ref] of Object.entries(g.messages)) if (!guild.channels.cache.has(ref?.channelId)) delete g.messages[key];
  db.save();
  return { deleted, failed };
}

/** Après une remise à neuf : republie partenaires et suggestions en attente ; arrête les giveaways/sondages sans message. */
async function repostContent(guild, g) {
  const result = { partners: 0, suggestions: 0, closed: 0 };
  const gone = (item) => !guild.channels.cache.has(item?.channelId);

  const partners = getChannel(guild, 'partners');
  for (const p of Object.values(g.partners)) {
    if (!partners || !gone(p)) continue;
    const msg = await partners.send(embeds.partnerMessage(p)).catch(() => null);
    if (msg) { p.channelId = partners.id; p.messageId = msg.id; result.partners += 1; }
  }

  const suggestions = getChannel(guild, 'suggestions');
  const pending = Object.values(g.suggestions).filter((s) => s.status === 'pending' && gone(s)).sort((a, b) => a.number - b.number).slice(-25);
  for (const s of pending) {
    if (!suggestions) break;
    const msg = await suggestions.send(embeds.suggestionMessage(s)).catch(() => null);
    if (msg) { s.channelId = suggestions.id; s.messageId = msg.id; result.suggestions += 1; }
  }

  for (const item of [...Object.values(g.giveaways), ...Object.values(g.polls)]) {
    if (!item.ended && gone(item)) { item.ended = true; result.closed += 1; }
  }
  db.save();
  return result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure automatiquement le serveur (rôles, salons, embeds)')
    .setDefaultMemberPermissions(P.Administrator)
    .addBooleanOption((o) => o.setName('nettoyage')
      .setDescription('⚠️ REMISE À NEUF : supprime TOUS les salons (sauf celui-ci et les tickets ouverts) puis recrée tout')),

  async execute(interaction) {
    if (!interaction.options.getBoolean('nettoyage')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return run(interaction, { reset: false });
    }
    // Remise à neuf : irréversible → confirmation par bouton (valable 5 minutes)
    const openTickets = Object.values(db.guild(interaction.guild.id).tickets).filter((id) => interaction.guild.channels.cache.has(id)).length;
    const warn = embeds.base(config.colors.warning)
      .setTitle('⚠️ Remise à neuf du Discord')
      .setDescription(
        `**Tous les salons et catégories vont être supprimés**, avec leurs messages, sauf ${interaction.channel} (où tu tapes la commande)`
        + `${openTickets ? ` et les **${openTickets} ticket(s) ouvert(s)**` : ''}. Puis tout est recréé proprement depuis \`config.js\`.\n\n`
        + '• Les rôles, les comptes liés, les niveaux, les avertissements, les parrainages et les achats sont **conservés** (ils sont en base).\n'
        + '• Les partenaires et les suggestions en attente sont **republiés**.\n'
        + '• L\'historique des discussions (#général, #médias…) est **perdu définitivement**.\n\n'
        + 'Confirme dans les 5 minutes.',
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`setup_reset:confirm:${Date.now()}`).setLabel('Tout supprimer et recréer').setEmoji('🧨').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('setup_reset:cancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({ embeds: [warn], components: [row], flags: MessageFlags.Ephemeral });
  },
  run: (...args) => run(...args),
  _internal: { ensureChannel, wipeChannels, coreName }, // tests
};

/**
 * Configuration complète. `interaction` est déjà différée (commande) ou mise à jour (bouton de confirmation).
 * @param {{ reset: boolean }} opts reset = remise à neuf (supprime d'abord tous les salons)
 */
async function run(interaction, { reset }) {
  {
    const { guild } = interaction;
    const me = guild.members.me;
    if (!me.permissions.has(P.Administrator)) {
      return interaction.editReply({ embeds: [embeds.error('J\'ai besoin de la permission **Administrateur** pour configurer le serveur.')], components: [] });
    }

    const g = db.guild(guild.id);
    removedDuplicates = [];
    const step = (txt) => interaction.editReply({ embeds: [embeds.base(config.colors.info).setDescription(`⏳ ${txt}`)], components: [] });
    // Jamais supprimés : le salon où la commande est tapée et les tickets ouverts
    const protectedIds = new Set([interaction.channelId, ...Object.values(g.tickets)]);

    let wiped = null;
    if (reset) {
      await step('Remise à neuf : suppression de tous les salons...');
      wiped = await wipeChannels(guild, g, protectedIds);
    }

    // 0. Mini-jeux renommés (formerIds) : on réutilise l'ancien salon et l'ancien rôle,
    //    qui seront renommés plus bas (les messages sont conservés)
    for (const m of config.minigames) {
      for (const old of m.formerIds ?? []) {
        const newKey = `game_${m.id}`;
        const oldKey = `game_${old}`;
        if (!g.roles[newKey]) {
          const role = guild.roles.cache.get(g.roles[oldKey])
            ?? guild.roles.cache.find((r) => coreName(r.name) === coreName(old.replace(/-/g, ' ')));
          if (role) g.roles[newKey] = role.id;
        }
        if (!g.channels[newKey]) {
          const ch = guild.channels.cache.get(g.channels[oldKey])
            ?? guild.channels.cache.find((c) => c.type === ChannelType.GuildText && coreName(c.name) === old);
          if (ch) g.channels[newKey] = ch.id;
        }
        delete g.roles[oldKey];
        delete g.channels[oldKey];
      }
    }
    db.save();

    // 1. Rôles (créés du haut vers le bas : chaque nouveau rôle arrive en bas de la liste)
    await step('Création des rôles...');
    const R = {};
    const skipped = [];
    for (const def of allRoleDefs()) {
      const role = await ensureRole(guild, def, g);
      R[def.key] = role.id;
      if (!role.editable) skipped.push(role.name);
    }
    db.save();

    // 2. Catégories et salons
    await step('Création des catégories et des salons...');
    const gameChannels = config.minigames.slice(0, 20).map((m) => ({
      key: `game_${m.id}`, name: `${m.emoji}┃${m.id}`, access: 'public', topic: `${m.name} — ${m.description}`,
    }));

    // Noms réels des compteurs dès la création (évite un renommage immédiat)
    const status = await getStatus();
    const counterNames = counters.names(guild, status);

    for (const cat of config.categories) {
      const category = await ensureChannel(guild, g, {
        key: cat.key, name: cat.name, type: ChannelType.GuildCategory,
        overwrites: overwritesFor(cat.access ?? 'public', guild, R),
      }, protectedIds);
      if (cat.top && category.position !== 0) await category.setPosition(0).catch(() => null);
      const channels = cat.key === 'catGames' ? [...cat.channels, ...gameChannels] : cat.channels;
      const ordered = [];
      for (const ch of channels) {
        ordered.push(await ensureChannel(guild, g, {
          key: ch.key,
          name: counterNames[ch.key] ?? ch.name,
          type: ch.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category,
          topic: ch.topic,
          overwrites: overwritesFor(ch.access, guild, R),
        }, protectedIds));
      }
      // Ordre des salons = ordre de config.js (ex. #spoilers entre #médias et #suggestions)
      const misplaced = ordered.some((c, i) => i > 0 && c.position < ordered[i - 1].position && c.type === ordered[i - 1].type);
      if (misplaced) {
        await guild.channels.setPositions(ordered.map((c, i) => ({ channel: c.id, position: i })))
          .catch((err) => console.error('[setup] ordre des salons :', err.message));
      }
      db.save();
    }

    // Tickets ouverts (conservés) : rangés dans la catégorie SUPPORT
    const support = getChannel(guild, 'catSupport');
    for (const id of Object.values(g.tickets)) {
      const ticket = guild.channels.cache.get(id);
      if (support && ticket && ticket.parentId !== support.id) await ticket.setParent(support.id, { lockPermissions: false }).catch(() => null);
    }

    // 2b. Nettoyage : supprime les salons/rôles de mini-jeux retirés de config.js
    await step('Nettoyage des anciens mini-jeux...');
    const currentGames = new Set(config.minigames.slice(0, 20).map((m) => `game_${m.id}`));
    const removedGames = [];
    for (const [store, cache] of [[g.channels, guild.channels.cache], [g.roles, guild.roles.cache]]) {
      for (const key of Object.keys(store)) {
        if (!key.startsWith('game_') || currentGames.has(key)) continue;
        const item = cache.get(store[key]);
        if (item) {
          await item.delete('/setup : mini-jeu retiré de config.js').catch(() => null);
          removedGames.push(item.name);
        }
        delete store[key];
      }
    }
    db.save();

    // 2b'. Nettoyage : salons et rôles retirés de config.js (config.removed), supprimés même s'ils contiennent des messages.
    //      Retrouvés par leur clé enregistrée, ou par leur nom (config.removed.channelNames) si la base les a oubliés.
    const removedItems = [];
    const managed = new Set(Object.entries(g.channels).filter(([k]) => !(config.removed?.channels ?? []).includes(k)).map(([, id]) => id));
    const removedNames = new Set((config.removed?.channelNames ?? []).map(coreName));
    const toRemove = new Map();
    for (const key of config.removed?.channels ?? []) {
      const ch = guild.channels.cache.get(g.channels[key]);
      if (ch) toRemove.set(ch.id, ch);
      delete g.channels[key];
    }
    for (const ch of guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildCategory && removedNames.has(coreName(ch.name)) && !managed.has(ch.id) && !protectedIds.has(ch.id)) toRemove.set(ch.id, ch);
    }
    for (const ch of toRemove.values()) {
      if (protectedIds.has(ch.id)) continue;
      await ch.delete('/setup : salon retiré de config.js').then(() => removedItems.push(`#${ch.name}`)).catch(() => null);
    }
    for (const key of config.removed?.roles ?? []) {
      const role = guild.roles.cache.get(g.roles[key]);
      if (role?.editable) {
        await role.delete('/setup : rôle retiré de config.js').catch(() => null);
        removedItems.push(`@${role.name}`);
      }
      delete g.roles[key];
    }
    db.save();

    // 2c. Communauté Discord
    await step('Activation de la Communauté Discord...');
    const community = await enableCommunity(guild);
    if (!community.ok) console.error('[setup] Communauté :', community.error);

    // 3. Panneaux
    await step('Envoi des embeds...');
    let duplicates = 0;
    duplicates += await ensurePanel(guild, 'rules', 'rules', embeds.rulesPanel(guild));
    duplicates += await ensurePanel(guild, 'verify', 'verify', embeds.verifyPanel(guild));
    duplicates += await ensurePanel(guild, 'info', 'info', embeds.infoPanel(guild, status)); // + statut en direct
    delete g.messages.status; // ancien #statut-serveur : le statut est maintenant dans #infos-serveur
    duplicates += await ensurePanel(guild, 'roles', 'roles', embeds.rolesPanel(guild));
    duplicates += await ensurePanel(guild, 'ticket', 'ticketPanel', embeds.ticketPanel());
    duplicates += await ensurePanel(guild, 'partnersAdmin', 'partnersAdmin', embeds.partnersAdminPanel());
    duplicates += await staff.refreshPanels(guild); // #absences et #tâches
    duplicates += (await invites.refreshBoard(guild)) ?? 0;
    duplicates += (await boosts.refreshBoard(guild)) ?? 0;
    duplicates += (await levels.refreshBoard(guild, true)) ?? 0;
    duplicates += (await launch.refreshPanel(guild).catch(() => 0)) ?? 0;
    duplicates += await guide.refreshPanels(guild); // #votes et #commandes-bot
    await leaderboards.refreshPanels(guild, true);
    await gameGuide.refreshPanels(guild, true); // #guide (si le serveur Minecraft a déjà publié le guide)
    const relinked = await linkedRole.repairAll(guild);
    const reposted = reset ? await repostContent(guild, g) : null;

    // Messages système Discord (boosts) → #logs (staff) : ils déclenchent la récompense,
    // et c'est le bot qui remercie publiquement dans #boosters (pas de doublon visible).
    // Les messages d'arrivée Discord sont coupés : #bienvenue s'en charge déjà.
    const logs = getChannel(guild, 'logs');
    if (logs) {
      await guild.edit({
        systemChannel: logs.id,
        systemChannelFlags: [
          GuildSystemChannelFlags.SuppressJoinNotifications,
          GuildSystemChannelFlags.SuppressJoinNotificationReplies,
          GuildSystemChannelFlags.SuppressGuildReminderNotifications,
        ],
        reason: '/setup',
      }).catch((err) => console.error('[setup] salon système :', err.message));
    }
    db.save();

    // 3b. Nettoyage (option) : pied de page des anciens messages du bot
    let footersFixed = null;
    if (reset) {
      await step('Nettoyage des anciens messages du bot (pied de page)...');
      footersFixed = await fixFooters(guild);
    }

    // 4. Les membres présents AVANT le bot reçoivent directement le rôle Membre.
    //    Ceux arrivés depuis (rôle 🔒 Non vérifié) suivent le parcours : âge → règlement → guide.
    await step('Attribution des rôles aux membres existants...');
    const members = await guild.members.fetch();
    let given = 0;
    for (const m of members.values()) {
      if (m.user.bot || m.roles.cache.has(R.member) || m.roles.cache.has(R.unverified) || m.roles.cache.has(R.rulesAccepted)) continue;
      await m.roles.add(R.member, '/setup : membre déjà présent').catch(() => null);
      given++;
    }

    const summary = embeds.base(config.colors.success)
      .setTitle('✅ Serveur configuré !')
      .setDescription(
        `**${Object.keys(R).length}** rôles, **${Object.keys(g.channels).length}** salons/catégories et **${Object.keys(g.messages).length}** embeds sont en place.\n`
        + `Le rôle ${guild.roles.cache.get(R.member)} a été donné à **${given}** membre(s) déjà présent(s).\n\n`
        + '👉 Pense à t\'attribuer le rôle 👑 Fondateur.\n'
        + '👉 Tu peux relancer `/setup` à tout moment après avoir modifié `config.js`.',
      );
    if (relinked) summary.addFields({ name: '🔗 Comptes liés', value: `Rôle et surnom vérifiés pour **${relinked}** membre(s).` });
    summary.addFields({
      name: '🌐 Communauté Discord',
      value: community.ok
        ? `✅ Activée${community.converted.length ? ` — ${community.converted.join(', ')} converti en salon d'annonces` : ''}.`
        : `⚠️ Non activée : ${community.error}\nTu peux l'activer dans Paramètres du serveur → Activer la Communauté (les prérequis sont déjà réglés), puis relancer \`/setup\`.`,
    });
    if (wiped) {
      summary.addFields({
        name: '🧨 Remise à neuf',
        value: `${wiped.deleted} salon(s)/catégorie(s) supprimé(s)`
          + (wiped.failed.length ? `. Non supprimables (exigés par Discord, réutilisés) : ${wiped.failed.join(', ')}` : '')
          + (reposted ? `.
🔁 Republiés : ${reposted.partners} partenaire(s), ${reposted.suggestions} suggestion(s) en attente`
            + (reposted.closed ? `. ${reposted.closed} giveaway(s)/sondage(s) en cours arrêté(s) (leur message a été supprimé)` : '') : '')
          + '.',
      });
    }
    if (footersFixed) {
      summary.addFields({
        name: '🧽 Nettoyage des anciens messages',
        value: `${footersFixed.fixed} message(s) corrigé(s) sur ${footersFixed.scanned} message(s) du bot parcourus (${footersFixed.channels} salons).`,
      });
    }
    if (removedDuplicates.length) {
      summary.addFields({ name: '🧹 Salons en double supprimés', value: removedDuplicates.join(', ').slice(0, 1024) });
    }
    if (duplicates) {
      summary.addFields({ name: '🧹 Doublons supprimés', value: `${duplicates} ancien(s) embed(s) en double retiré(s).` });
    }
    if (removedGames.length) {
      summary.addFields({ name: '🗑️ Anciens mini-jeux supprimés', value: removedGames.join(', ').slice(0, 1024) });
    }
    if (removedItems.length) {
      summary.addFields({ name: '🗑️ Salons et rôles retirés', value: removedItems.join(', ').slice(0, 1024) });
    }
    if (skipped.length) {
      summary.addFields({
        name: '⚠️ Rôles non modifiables',
        value: `Ces rôles sont au-dessus du mien, je n'ai pas pu les mettre à jour : ${skipped.join(', ')}.\nMonte mon rôle tout en haut dans Paramètres → Rôles.`,
      });
    }
    return interaction.editReply({ embeds: [summary], components: [] });
  }
}
