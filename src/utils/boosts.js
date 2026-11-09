// Boosts : 1 boost acheté = X mois de VIP en jeu (cumulable) + rôle 💎 VIP Discord tant que le membre booste.
const { MessageType } = require('discord.js');
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');
const { getChannel, getRole } = require('./helpers');
const { ensurePanel, byTitle } = require('./panels');
const { queueReward } = require('./rewards');
const { sendLog } = require('./logger');

const BOARD_TITLE = '🚀 Nos boosters';
const BOOST_TYPES = new Set([
  MessageType.GuildBoost, MessageType.GuildBoostTier1, MessageType.GuildBoostTier2, MessageType.GuildBoostTier3,
]);
const FALLBACK_DELAY = 90_000;

function record(g, userId) {
  g.boosts[userId] ??= { count: 0, roleByBoost: false, lastBoostAt: 0 };
  return g.boosts[userId];
}

async function giveVipRole(member) {
  const role = getRole(member.guild, 'vip');
  if (!role) return;
  const rec = record(db.guild(member.guild.id), member.id);
  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role, 'Boost du serveur').catch(() => null);
    rec.roleByBoost = true; // on ne retirera que ce que le boost a donné
    db.save();
  }
}

function boardPayload(guild) {
  const g = db.guild(guild.id);
  const boosters = [...guild.members.cache.filter((m) => m.premiumSince).values()]
    .sort((a, b) => a.premiumSinceTimestamp - b.premiumSinceTimestamp);
  const months = config.boosts.vipMonthsPerBoost;
  const embed = base(0xf47fff)
    .setTitle(BOARD_TITLE)
    .setDescription(
      `Merci à tous ceux qui soutiennent **${config.serverName}** ! 💜\n`
      + `> 🎁 Chaque boost = **${months} mois de VIP en jeu** (cumulable) + le rôle 💎 VIP sur Discord\n`
      + '> 🔗 Relie ton compte avec **/lier** pour recevoir ton VIP\n\n'
      + (boosters.length
        ? boosters.slice(0, 40).map((m, i) => {
          const n = g.boosts[m.id]?.count;
          return `\`${String(i + 1).padStart(2, '0')}\` ${m} — depuis <t:${Math.floor(m.premiumSinceTimestamp / 1000)}:D>${n ? ` · ${n} boost(s)` : ''}`;
        }).join('\n')
        : '*Aucun booster pour le moment… le premier sera à l\'honneur ici !*'),
    )
    .addFields(
      { name: 'Boosts', value: String(guild.premiumSubscriptionCount ?? 0), inline: true },
      { name: 'Niveau', value: String(guild.premiumTier ?? 0), inline: true },
    );
  return { embeds: [embed] };
}

function refreshBoard(guild) {
  return ensurePanel(guild, 'boostersBoard', 'boosters', boardPayload(guild), { match: byTitle(BOARD_TITLE) })
    .catch((err) => console.error('[boosts] panneau :', err.message));
}

/** Un boost acheté → récompense (id unique), remerciement, rôle, panneau. */
async function handleBoost(guild, member, rewardId) {
  if (!config.boosts.enabled) return false;
  const months = config.boosts.vipMonthsPerBoost;
  const isNew = queueReward(guild, rewardId, member.id, {
    type: 'vip', months, rank: config.boosts.vipRank, label: `${months} mois de VIP (boost du serveur)`,
  });
  if (!isNew) return false; // déjà traité (redémarrage, double événement…)

  const g = db.guild(guild.id);
  const rec = record(g, member.id);
  rec.count += 1;
  rec.lastBoostAt = Date.now();
  db.save();
  await giveVipRole(member);

  const channel = getChannel(guild, 'boosters');
  await channel?.send({
    content: `${member}`,
    embeds: [base(0xf47fff).setTitle('🚀 Merci pour le boost !')
      .setDescription(`${member} vient de booster **${config.serverName}** ! 💜\n`
        + `🎁 **+${months} mois de VIP** en jeu et le rôle 💎 VIP sur Discord.\n`
        + `Total : **${rec.count}** boost(s) — merci !`)
      .setThumbnail(member.user.displayAvatarURL())],
    allowedMentions: { users: [member.id] },
  }).catch(() => null);
  await sendLog(guild, base(0xf47fff).setTitle('🚀 Boost').setDescription(`${member} — récompense \`${rewardId}\``));
  await refreshBoard(guild);
  return true;
}

/** Message système Discord « X a boosté le serveur » : un par boost acheté. */
async function onBoostMessage(message) {
  const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
  if (member) await handleBoost(message.guild, member, `boost:${message.id}`);
}

/** Secours si les messages système sont désactivés, et retrait du rôle à l'arrêt du boost. */
async function onMemberUpdate(oldMember, newMember) {
  if (oldMember.partial) return;
  const { guild } = newMember;

  if (!oldMember.premiumSince && newMember.premiumSince) {
    const startedAt = newMember.premiumSinceTimestamp;
    setTimeout(async () => {
      const rec = db.guild(guild.id).boosts[newMember.id];
      // Le message système a déjà été traité → rien à faire
      if (rec && rec.lastBoostAt >= startedAt - 60_000) return;
      await handleBoost(guild, newMember, `boost:${newMember.id}:${startedAt}`).catch(() => null);
    }, FALLBACK_DELAY);
    return;
  }

  if (oldMember.premiumSince && !newMember.premiumSince) {
    const g = db.guild(guild.id);
    const rec = g.boosts[newMember.id];
    const role = getRole(guild, 'vip');
    if (rec?.roleByBoost && role) {
      await newMember.roles.remove(role, 'Fin du boost').catch(() => null);
      rec.roleByBoost = false;
      db.save();
    }
    await refreshBoard(guild);
  }
}

module.exports = { BOOST_TYPES, BOARD_TITLE, onBoostMessage, onMemberUpdate, refreshBoard, boardPayload, handleBoost };
