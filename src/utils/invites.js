// Suivi des invitations : qui a invité qui, validation et récompense du parrain.
const { Collection } = require('discord.js');
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');
const { getChannel } = require('./helpers');
const { ensurePanel, byTitle } = require('./panels');
const { queueReward } = require('./rewards');

const DAY = 864e5;
const TICK_MS = 10 * 60_000;
const BOARD_TITLE = '🏆 Classement des parrains';
const cache = new Map(); // guildId → Map(code → { uses, inviterId, maxUses })

function snapshot(invites) {
  const map = new Map();
  for (const inv of invites.values()) map.set(inv.code, { uses: inv.uses ?? 0, inviterId: inv.inviterId ?? inv.inviter?.id ?? null, maxUses: inv.maxUses ?? 0 });
  return map;
}

/**
 * Trouve l'invitation utilisée en comparant avant/après (fonction pure, testée).
 * @returns {{code, inviterId} | null}
 */
function findUsedInvite(before, after) {
  const used = [];
  for (const [code, now] of after) {
    const prev = before.get(code);
    if (now.uses > (prev?.uses ?? 0)) used.push({ code, inviterId: now.inviterId });
  }
  if (used.length === 1) return used[0];
  if (used.length > 1) return null; // plusieurs arrivées simultanées : impossible de trancher
  // Invitation à usage limité supprimée par Discord juste après sa dernière utilisation
  const vanished = [...before].filter(([code, prev]) => !after.has(code) && prev.maxUses > 0 && prev.uses === prev.maxUses - 1);
  return vanished.length === 1 ? { code: vanished[0][0], inviterId: vanished[0][1].inviterId } : null;
}

async function fetchGuild(guild) {
  const invites = await guild.invites.fetch().catch(() => new Collection());
  const snap = snapshot(invites);
  cache.set(guild.id, snap);
  return snap;
}

function stats(guildId, userId) {
  const s = { rewarded: 0, pending: 0, left: 0, fake: 0 };
  for (const rec of Object.values(db.guild(guildId).invites)) {
    if (rec.inviterId === userId && s[rec.status] !== undefined) s[rec.status]++;
  }
  return s;
}

function leaderboard(guildId, limit = 10) {
  const counts = new Map();
  for (const rec of Object.values(db.guild(guildId).invites)) {
    if (rec.status === 'rewarded') counts.set(rec.inviterId, (counts.get(rec.inviterId) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function boardPayload(guild) {
  const top = leaderboard(guild.id);
  const medals = ['🥇', '🥈', '🥉'];
  const { rewardCoins, holdDays, minAccountAgeDays } = config.invites;
  const embed = base(config.colors.accent)
    .setTitle(BOARD_TITLE)
    .setDescription(
      `Invite tes amis et gagne **${rewardCoins} pièces** en jeu par invitation validée !\n`
      + `> ✅ L'invité doit accepter le règlement et rester **${holdDays} jours**\n`
      + `> 🛡️ Les comptes Discord de moins de ${minAccountAgeDays} jours ne comptent pas\n`
      + '> 🔗 Relie ton compte Minecraft avec **/lier** pour recevoir tes pièces\n\n'
      + (top.length
        ? top.map(([id, n], i) => `${medals[i] ?? `\`#${i + 1}\``} <@${id}> — **${n}** invitation(s)`).join('\n')
        : '*Aucune invitation validée pour le moment. Sois le premier !*'),
    );
  return { embeds: [embed] };
}

function refreshBoard(guild) {
  return ensurePanel(guild, 'invitesBoard', 'invites', boardPayload(guild), { match: byTitle(BOARD_TITLE) })
    .catch((err) => console.error('[invitations] classement :', err.message));
}

async function post(guild, embed) {
  const channel = getChannel(guild, 'invites');
  if (channel) await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
}

// ---------- Événements ----------

async function onJoin(member) {
  if (!config.invites.enabled || member.user.bot) return;
  const { guild } = member;
  const before = cache.get(guild.id) ?? new Map();
  const after = await fetchGuild(guild);
  const used = findUsedInvite(before, after);

  const g = db.guild(guild.id);
  const previous = g.invites[member.id];
  const ageDays = (Date.now() - member.user.createdTimestamp) / DAY;
  let status = 'pending';
  if (!used?.inviterId) status = 'unknown';
  else if (used.inviterId === member.id) status = 'fake';
  else if (ageDays < config.invites.minAccountAgeDays) status = 'fake';

  // Une seule récompense par invité, à vie (pas de farm en quittant / revenant)
  if (previous?.status === 'rewarded') status = 'rewarded';

  g.invites[member.id] = {
    inviterId: previous?.status === 'rewarded' ? previous.inviterId : used?.inviterId ?? null,
    code: used?.code ?? null,
    joinedAt: Date.now(),
    verifiedAt: null,
    status,
  };
  db.save();

  const inviter = used?.inviterId ? `<@${used.inviterId}>` : '*inconnu*';
  const note = {
    pending: `⏳ Validée dans ${config.invites.holdDays} jours s'il accepte le règlement et reste parmi nous.`,
    fake: '🛡️ Compte trop récent : cette invitation ne compte pas.',
    unknown: '',
    rewarded: '↩️ Déjà comptabilisé auparavant.',
  }[status];
  const total = used?.inviterId ? stats(guild.id, used.inviterId).rewarded : 0;
  await post(guild, base(config.colors.info).setDescription(
    `👋 ${member} a rejoint le serveur — invité par ${inviter}${used?.inviterId ? ` (${total} invitation(s) validée(s))` : ''}.${note ? `\n${note}` : ''}`,
  ));
}

function onVerified(member) {
  const rec = db.guild(member.guild.id).invites[member.id];
  if (rec?.status === 'pending' && !rec.verifiedAt) {
    rec.verifiedAt = Date.now();
    db.save();
  }
}

async function onLeave(member) {
  const rec = db.guild(member.guild.id).invites[member.id];
  if (rec?.status !== 'pending') return;
  rec.status = 'left';
  db.save();
  await post(member.guild, base(config.colors.neutral).setDescription(
    `🚪 **${member.user?.tag ?? member.id}** est parti avant la validation — l'invitation de <@${rec.inviterId}> ne compte pas.`,
  ));
}

/** Valide les invitations arrivées à échéance (robuste aux redémarrages : tout est en base). */
async function tick(client) {
  const holdMs = config.invites.holdDays * DAY;
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const g = db.guild(guild.id);
    let changed = false;
    for (const [inviteeId, rec] of Object.entries(g.invites)) {
      if (rec.status !== 'pending' || !rec.verifiedAt || now - rec.joinedAt < holdMs) continue;
      const member = guild.members.cache.get(inviteeId) ?? await guild.members.fetch(inviteeId).catch(() => null);
      if (!member) { rec.status = 'left'; changed = true; continue; }

      rec.status = 'rewarded';
      rec.rewardedAt = now;
      changed = true;
      const amount = config.invites.rewardCoins;
      queueReward(guild, `invite:${inviteeId}`, rec.inviterId, {
        type: 'coins', amount, label: `${amount} pièces (parrainage de ${member.user.tag})`,
      });
      await post(guild, base(config.colors.success).setDescription(
        `✅ Invitation validée : <@${rec.inviterId}> gagne **${amount} pièces** pour avoir invité ${member} ! `
        + `(${stats(guild.id, rec.inviterId).rewarded} au total)`,
      ));
    }
    if (changed) { db.save(); await refreshBoard(guild); }
  }
}

async function start(client) {
  for (const guild of client.guilds.cache.values()) await fetchGuild(guild);
  client.on('inviteCreate', (inv) => inv.guild && fetchGuild(inv.guild));
  client.on('inviteDelete', (inv) => {
    // On garde l'entrée : elle sert à détecter une invitation à usage unique consommée
    if (inv.guild && !cache.has(inv.guild.id)) fetchGuild(inv.guild);
  });
  tick(client).catch((err) => console.error('[invitations]', err.message));
  setInterval(() => tick(client).catch((err) => console.error('[invitations]', err.message)), TICK_MS);
}

module.exports = { start, onJoin, onVerified, onLeave, tick, stats, leaderboard, refreshBoard, findUsedInvite, BOARD_TITLE };
