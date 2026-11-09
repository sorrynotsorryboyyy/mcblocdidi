const { MessageFlags } = require('discord.js');
const config = require('../../config');
const db = require('./db');

/** Liste des définitions de rôles, mini-jeux inclus (dans l'ordre de la hiérarchie). */
function allRoleDefs() {
  const defs = Object.entries(config.roles).map(([key, def]) => ({ key, ...def }));
  for (const g of config.minigames.slice(0, 20)) {
    defs.push({
      key: `game_${g.id}`,
      name: `${g.emoji} ${g.name}`,
      color: 0x000000,
      hoist: false,
      permissions: [],
      selfAssign: true,
      description: `Être pingé pour les parties de ${g.name}`,
      emoji: g.emoji,
    });
  }
  return defs;
}

/** Récupère un salon enregistré par /setup. */
function getChannel(guild, key) {
  const id = db.guild(guild.id).channels[key];
  return id ? guild.channels.cache.get(id) ?? null : null;
}

/** Récupère un rôle enregistré par /setup. */
function getRole(guild, key) {
  const id = db.guild(guild.id).roles[key];
  return id ? guild.roles.cache.get(id) ?? null : null;
}

function staffRoleIds(guild) {
  return config.staffRoles.map((k) => getRole(guild, k)?.id).filter(Boolean);
}

function isStaff(member) {
  if (member.permissions.has('Administrator')) return true;
  const ids = staffRoleIds(member.guild);
  return member.roles.cache.some((r) => ids.includes(r.id));
}

/** Réponse éphémère qui fonctionne que l'interaction soit déjà différée ou non. */
async function replyEphemeral(interaction, payload) {
  const data = typeof payload === 'string' ? { content: payload } : payload;
  if (interaction.deferred) return interaction.editReply(data);
  if (interaction.replied) return interaction.followUp({ ...data, flags: MessageFlags.Ephemeral });
  return interaction.reply({ ...data, flags: MessageFlags.Ephemeral });
}

/** "10m", "2h", "1d", "30s", "1h30m" → millisecondes (null si invalide). */
function parseDuration(input) {
  const re = /(\d+)\s*(s|m|h|j|d)/gi;
  const units = { s: 1e3, m: 6e4, h: 36e5, j: 864e5, d: 864e5 };
  let total = 0;
  let matched = '';
  for (const m of input.matchAll(re)) {
    total += Number(m[1]) * units[m[2].toLowerCase()];
    matched += m[0];
  }
  if (!total || matched.replace(/\s/g, '').length !== input.replace(/\s/g, '').length) return null;
  return total;
}

function formatDuration(ms) {
  const parts = [];
  const d = Math.floor(ms / 864e5); ms %= 864e5;
  const h = Math.floor(ms / 36e5); ms %= 36e5;
  const m = Math.floor(ms / 6e4); ms %= 6e4;
  const s = Math.floor(ms / 1e3);
  if (d) parts.push(`${d}j`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}min`);
  if (s) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

/**
 * Vérifie qu'un modérateur peut agir sur une cible.
 * @returns {string|null} message d'erreur ou null si OK
 */
function checkHierarchy(moderator, target) {
  const guild = moderator.guild;
  const me = guild.members.me;
  if (target.id === moderator.id) return 'Tu ne peux pas faire ça sur toi-même.';
  if (target.id === guild.ownerId) return 'Impossible d\'agir sur le propriétaire du serveur.';
  if (target.id === me.id) return 'Je ne peux pas agir sur moi-même.';
  if (moderator.id !== guild.ownerId && target.roles.highest.position >= moderator.roles.highest.position) {
    return 'Ce membre a un rôle supérieur ou égal au tien.';
  }
  if (target.roles.highest.position >= me.roles.highest.position) {
    return 'Ce membre a un rôle supérieur ou égal au mien. Monte mon rôle dans Paramètres → Rôles.';
  }
  return null;
}

/** Choix pour les options slash "jeu". */
function gameChoices() {
  return config.minigames.slice(0, 25).map((g) => ({ name: `${g.emoji} ${g.name}`, value: g.id }));
}

function findGame(id) {
  return config.minigames.find((g) => g.id === id) ?? null;
}

module.exports = {
  allRoleDefs, getChannel, getRole, staffRoleIds, isStaff, replyEphemeral,
  parseDuration, formatDuration, checkHierarchy, gameChoices, findGame,
};
