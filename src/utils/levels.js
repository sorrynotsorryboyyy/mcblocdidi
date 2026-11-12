// Niveaux Discord : XP en écrivant (anti-spam) et en vocal → rôles + pièces en jeu aux paliers.
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');
const { getChannel, getRole } = require('./helpers');
const { ensurePanel, byTitle } = require('./panels');
const { queueReward } = require('./rewards');

const BOARD_TITLE = '🏅 Top Discord';
const cfg = () => config.levels;

/** XP nécessaire pour passer du niveau `lvl` au suivant (courbe type MEE6). */
const xpForNext = (lvl) => 5 * lvl * lvl + 50 * lvl + 100;

/** Niveau atteint pour un total d'XP, avec la progression dans le niveau courant. */
function levelFromXp(xp) {
  let level = 0;
  let rest = Math.max(0, Math.floor(xp));
  while (rest >= xpForNext(level)) {
    rest -= xpForNext(level);
    level++;
  }
  return { level, current: rest, needed: xpForNext(level) };
}

/** Palier le plus haut atteint (ou null). */
function tierFor(level) {
  return [...cfg().tiers].sort((a, b) => b.level - a.level).find((t) => level >= t.level) ?? null;
}

function record(g, userId) {
  g.levels[userId] ??= { xp: 0, level: 0, lastMsg: 0, voiceMinutes: 0 };
  return g.levels[userId];
}

function ranking(guildId) {
  return Object.entries(db.guild(guildId).levels)
    .filter(([, r]) => r.xp > 0)
    .sort((a, b) => b[1].xp - a[1].xp);
}

function rankOf(guildId, userId) {
  const i = ranking(guildId).findIndex(([id]) => id === userId);
  return i >= 0 ? i + 1 : null;
}

/** Donne uniquement le rôle du palier le plus haut atteint. */
async function syncTierRole(member, level) {
  const best = tierFor(level);
  for (const t of cfg().tiers) {
    const role = getRole(member.guild, t.role);
    if (!role) continue;
    const should = best?.role === t.role;
    if (should && !member.roles.cache.has(role.id)) await member.roles.add(role, `Niveau ${level}`).catch(() => null);
    if (!should && member.roles.cache.has(role.id)) await member.roles.remove(role, `Niveau ${level}`).catch(() => null);
  }
}

async function onLevelUp(member, before, after) {
  const { guild } = member;
  const reached = cfg().tiers.filter((t) => t.level > before && t.level <= after);
  for (const t of reached) {
    queueReward(guild, `level:${member.id}:${t.level}`, member.id, {
      type: 'coins', amount: t.coins, label: `${t.coins} pièces (niveau ${t.level} sur Discord)`,
    });
  }
  await syncTierRole(member, after);

  const channel = getChannel(guild, 'botCommands');
  if (!channel) return;
  const tier = reached.at(-1);
  const role = tier ? getRole(guild, tier.role) : null;
  await channel.send({
    content: tier ? `${member}` : undefined,
    embeds: [base(config.colors.primary).setDescription(
      `🎉 ${member} passe au **niveau ${after}** !`
      + (tier ? `\n🏅 Nouveau palier : ${role ?? tier.role} — **+${tier.coins} pièces** en jeu !` : ''),
    )],
    allowedMentions: { users: tier ? [member.id] : [] }, // mention seulement aux paliers
  }).catch(() => null);
}

/** Ajoute de l'XP et gère le passage de niveau. */
async function addXp(member, amount) {
  const g = db.guild(member.guild.id);
  const rec = record(g, member.id);
  const before = levelFromXp(rec.xp).level;
  rec.xp += amount;
  rec.level = levelFromXp(rec.xp).level;
  db.saveSoon();
  if (rec.level > before) await onLevelUp(member, before, rec.level);
}

/** Le message rapporte-t-il de l'XP ? (pas en staff, pas dans les tickets, anti-spam) */
function eligibleMessage(message, rec, now = Date.now()) {
  const staffCat = getChannel(message.guild, 'catStaff')?.id;
  if (staffCat && message.channel.parentId === staffCat) return false;
  if (message.channel.topic?.startsWith('ticket-owner:')) return false;
  if ((message.content ?? '').trim().length < cfg().minMessageLength && !message.attachments?.size) return false;
  return now - (rec.lastMsg ?? 0) >= cfg().messageCooldownSec * 1000;
}

async function onMessage(message) {
  if (!cfg().enabled || !message.member) return;
  const rec = record(db.guild(message.guild.id), message.author.id);
  if (!eligibleMessage(message, rec)) return;
  rec.lastMsg = Date.now();
  const [min, max] = cfg().messageXp;
  await addXp(message.member, min + Math.floor(Math.random() * (max - min + 1)));
}

/** Membres d'un salon vocal qui gagnent de l'XP cette minute. */
function voiceEarners(channel) {
  const humans = channel.members.filter((m) => !m.user.bot);
  if (humans.size < 2) return [];
  return [...humans.values()].filter((m) => {
    const v = m.voice;
    return !(v.selfMute || v.selfDeaf || v.serverMute || v.serverDeaf);
  });
}

async function voiceTick(client) {
  if (!cfg().enabled) return;
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased?.() || channel.id === guild.afkChannelId) continue;
      for (const member of voiceEarners(channel)) {
        record(db.guild(guild.id), member.id).voiceMinutes += 1;
        await addXp(member, cfg().voiceXpPerMinute).catch(() => null);
      }
    }
  }
}

function boardPayload(guild) {
  const top = ranking(guild.id).slice(0, 10);
  const medals = ['🥇', '🥈', '🥉'];
  const embed = base(config.colors.accent)
    .setTitle(BOARD_TITLE)
    .setDescription(
      'Gagne de l\'XP en discutant et en vocal. Paliers : '
      + cfg().tiers.map((t) => `niv. ${t.level} → **${t.coins} pièces**`).join(' · ') + '\n\n'
      + (top.length
        ? top.map(([id, r], i) => `${medals[i] ?? `\`#${i + 1}\``} <@${id}> — niveau **${r.level}** (${r.xp} XP)`).join('\n')
        : '*Personne pour le moment… à toi de jouer !*'),
    );
  return { embeds: [embed] };
}

const lastBoard = new Map();
async function refreshBoard(guild, force = false) {
  const payload = boardPayload(guild);
  const key = payload.embeds[0].data.description;
  if (!force && lastBoard.get(guild.id) === key) return 0;
  lastBoard.set(guild.id, key);
  return ensurePanel(guild, 'levelsBoard', 'leaderboards', payload, { match: byTitle(BOARD_TITLE) })
    .catch((err) => { console.error('[niveaux] classement :', err.message); return 0; });
}

function start(client) {
  setInterval(() => voiceTick(client).catch((err) => console.error('[niveaux] vocal :', err.message)), 60_000);
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) refreshBoard(guild);
  }, 10 * 60_000);
}

module.exports = {
  start, onMessage, addXp, levelFromXp, xpForNext, tierFor, rankOf, ranking, refreshBoard,
  eligibleMessage, voiceEarners, syncTierRole, BOARD_TITLE,
};
