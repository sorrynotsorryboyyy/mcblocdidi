// /setup : crée (ou met à jour) rôles, catégories, salons, permissions et panneaux.
// Relançable sans risque : ce qui existe déjà est réutilisé, rien n'est dupliqué.
const {
  SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, MessageFlags,
} = require('discord.js');
const config = require('../../../config');
const db = require('../../utils/db');
const { allRoleDefs, getChannel } = require('../../utils/helpers');
const embeds = require('../../utils/embeds');
const { getStatus } = require('../../utils/mcstatus');
const counters = require('../../utils/counters');

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
    case 'rules': // visible même par les non-vérifiés
      return [
        { id: everyone, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads] },
        ...staffFull, bot,
      ];
    case 'verify': // visible uniquement par ceux qui n'ont pas encore le rôle Membre
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

/** Un doublon est supprimable seulement s'il est vide (aucun message d'un humain, personne en vocal). */
async function isDisposable(channel) {
  if (channel.type === ChannelType.GuildVoice) return channel.members.size === 0;
  if (!channel.isTextBased()) return false;
  const msgs = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  return !!msgs && !msgs.some((m) => !m.author.bot);
}

async function ensureChannel(guild, g, { key, name, type, parent, overwrites, topic }) {
  const parentId = parent?.id ?? null;
  const sameKind = (c) => c.type === type && (c.parentId ?? null) === parentId && coreName(c.name) === coreName(name);
  const candidates = guild.channels.cache.filter(sameKind);

  let channel = guild.channels.cache.get(g.channels[key])
    ?? candidates.find((c) => c.name === name)
    ?? candidates.sort((a, b) => a.createdTimestamp - b.createdTimestamp).first();

  // Supprime les doublons vides (créés par d'anciens /setup)
  if (channel) {
    for (const dup of candidates.values()) {
      if (dup.id === channel.id || dup.type === ChannelType.GuildCategory) continue;
      if (await isDisposable(dup)) {
        await dup.delete('/setup : salon en double').catch(() => null);
        removedDuplicates.push(dup.name);
      }
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

// ---------- Panneaux (embeds) ----------
async function ensurePanel(guild, g, key, channelKey, payload) {
  const channel = getChannel(guild, channelKey);
  if (!channel) return 0;
  const meId = guild.members.me.id;

  // Messages du bot avec embed déjà présents dans le salon (les plus récents d'abord)
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const mine = recent ? [...recent.filter((m) => m.author.id === meId && m.embeds.length).values()] : [];

  // 1. Message enregistré en base ; 2. sinon, le dernier message du bot dans ce salon
  //    (cas d'une base vide, ex. premier déploiement sur Railway) ; 3. sinon, nouveau message
  const ref = g.messages[key];
  let msg = ref?.channelId === channel.id
    ? mine.find((m) => m.id === ref.messageId) ?? await channel.messages.fetch(ref.messageId).catch(() => null)
    : null;
  msg ??= mine[0] ?? null;

  if (msg) await msg.edit(payload);
  else msg = await channel.send(payload);
  g.messages[key] = { channelId: channel.id, messageId: msg.id };

  // Supprime les doublons (autres embeds du bot dans ce salon dédié)
  const duplicates = mine.filter((m) => m.id !== msg.id);
  for (const d of duplicates) await d.delete().catch(() => null);
  return duplicates.length;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure automatiquement le serveur (rôles, salons, embeds)')
    .setDefaultMemberPermissions(P.Administrator),

  async execute(interaction) {
    const { guild } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const me = guild.members.me;
    if (!me.permissions.has(P.Administrator)) {
      return interaction.editReply({ embeds: [embeds.error('J\'ai besoin de la permission **Administrateur** pour configurer le serveur.')] });
    }

    const g = db.guild(guild.id);
    removedDuplicates = [];
    const step =(txt) => interaction.editReply({ embeds: [embeds.base(config.colors.info).setDescription(`⏳ ${txt}`)] });

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
      });
      if (cat.top && category.position !== 0) await category.setPosition(0).catch(() => null);
      const channels = cat.key === 'catGames' ? [...cat.channels, ...gameChannels] : cat.channels;
      for (const ch of channels) {
        await ensureChannel(guild, g, {
          key: ch.key,
          name: counterNames[ch.key] ?? ch.name,
          type: ch.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category,
          topic: ch.topic,
          overwrites: overwritesFor(ch.access, guild, R),
        });
      }
      db.save();
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

    // 3. Panneaux
    await step('Envoi des embeds...');
    let duplicates = 0;
    duplicates += await ensurePanel(guild, g, 'rules', 'rules', embeds.rulesPanel(guild));
    duplicates += await ensurePanel(guild, g, 'verify', 'verify', embeds.verifyPanel(guild));
    duplicates += await ensurePanel(guild, g, 'info', 'info', embeds.infoPanel(guild));
    duplicates += await ensurePanel(guild, g, 'roles', 'roles', embeds.rolesPanel(guild));
    duplicates += await ensurePanel(guild, g, 'ticket', 'ticketPanel', embeds.ticketPanel());
    duplicates += await ensurePanel(guild, g, 'status', 'status', { embeds: [embeds.statusEmbed(status)] });
    duplicates += await ensurePanel(guild, g, 'partnersAdmin', 'partnersAdmin', embeds.partnersAdminPanel());
    db.save();

    // 4. Rôle Non vérifié pour les membres qui n'ont pas encore le rôle Membre
    //    (les membres déjà présents reçoivent directement le rôle Membre)
    await step('Attribution des rôles aux membres existants...');
    const members = await guild.members.fetch();
    let given = 0;
    for (const m of members.values()) {
      if (m.user.bot || m.roles.cache.has(R.member)) continue;
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
    if (removedDuplicates.length) {
      summary.addFields({ name: '🧹 Salons en double supprimés', value: removedDuplicates.join(', ').slice(0, 1024) });
    }
    if (duplicates) {
      summary.addFields({ name: '🧹 Doublons supprimés', value: `${duplicates} ancien(s) embed(s) en double retiré(s).` });
    }
    if (removedGames.length) {
      summary.addFields({ name: '🗑️ Anciens mini-jeux supprimés', value: removedGames.join(', ').slice(0, 1024) });
    }
    if (skipped.length) {
      summary.addFields({
        name: '⚠️ Rôles non modifiables',
        value: `Ces rôles sont au-dessus du mien, je n'ai pas pu les mettre à jour : ${skipped.join(', ')}.\nMonte mon rôle tout en haut dans Paramètres → Rôles.`,
      });
    }
    return interaction.editReply({ embeds: [summary] });
  },
};
