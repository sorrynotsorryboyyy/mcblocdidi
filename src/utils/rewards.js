// File des récompenses en jeu, récupérées par le pont du proxy Minecraft (voir src/api/server.js).
// Chaque récompense a un identifiant DÉTERMINISTE (ex. "invite:<id>", "boost:<messageId>") :
// la créer deux fois ne fait rien, et le plugin refuse de livrer deux fois le même id.
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');
const { sendLog } = require('./logger');

const MAX_TRIES = 20;

/**
 * Ajoute une récompense si elle n'existe pas déjà.
 * @param {{type:'coins'|'vip', amount?:number, months?:number, label:string}} reward
 * @returns {boolean} true si nouvelle
 */
function queueReward(guild, id, discordId, reward) {
  const g = db.guild(guild.id);
  if (g.rewards[id]) return false;
  g.rewards[id] = { id, discordId, ...reward, status: 'pending', tries: 0, createdAt: Date.now() };
  db.save();
  notifyIfUnlinked(guild, discordId).catch(() => null);
  return true;
}

/** Prévient (une seule fois) un membre non lié qu'une récompense l'attend. */
async function notifyIfUnlinked(guild, discordId) {
  const g = db.guild(guild.id);
  if (g.links[discordId]) return;
  g.state.unlinkedNotified ??= {};
  if (g.state.unlinkedNotified[discordId]) return;
  g.state.unlinkedNotified[discordId] = Date.now();
  db.save();
  const user = await guild.client.users.fetch(discordId).catch(() => null);
  await user?.send({
    embeds: [base(config.colors.info).setTitle('🎁 Une récompense t\'attend !')
      .setDescription(`Tu as gagné une récompense **en jeu** sur ${config.serverName}.\n\n`
        + 'Pour la recevoir, relie ton compte Minecraft :\n'
        + '1️⃣ Tape **`/lier`** sur le Discord pour obtenir un code\n'
        + '2️⃣ En jeu, tape **`/lier <code>`**\n\nLes récompenses en attente seront livrées automatiquement.')],
  }).catch(() => null);
}

/** Récompenses prêtes à être livrées (compte lié), tous serveurs confondus. */
function pendingForBridge() {
  const out = [];
  for (const guildId of db.guildIds()) {
    const g = db.guild(guildId);
    for (const r of Object.values(g.rewards)) {
      const link = g.links[r.discordId];
      if (r.status !== 'pending' || !link) continue;
      out.push({
        id: r.id, type: r.type, amount: r.amount ?? 0, months: r.months ?? 0, rank: r.rank ?? null,
        label: r.label, uuid: link.uuid, name: link.name,
      });
    }
  }
  return out;
}

/** Accusé de réception du plugin. Idempotent. */
async function acknowledge(client, id, ok, message) {
  for (const guildId of db.guildIds()) {
    const g = db.guild(guildId);
    const r = g.rewards[id];
    if (!r) continue;
    if (r.status === 'delivered') return { found: true, status: r.status };

    const guild = client.guilds.cache.get(guildId);
    if (ok) {
      r.status = 'delivered';
      r.deliveredAt = Date.now();
      db.save();
      const user = await client.users.fetch(r.discordId).catch(() => null);
      await user?.send({ embeds: [base(config.colors.success).setDescription(`🎁 **${r.label}** — livré en jeu sur ton compte \`${g.links[r.discordId]?.name ?? '?'}\` !`)] }).catch(() => null);
      if (guild) await sendLog(guild, base(config.colors.success).setTitle('🎁 Récompense livrée').setDescription(`<@${r.discordId}> — ${r.label}\n\`${id}\``));
    } else {
      r.tries += 1;
      r.lastError = String(message ?? 'erreur inconnue').slice(0, 300);
      if (r.tries >= MAX_TRIES) r.status = 'failed';
      db.save();
      if (guild && r.status === 'failed') {
        await sendLog(guild, base(config.colors.error).setTitle('⚠️ Récompense impossible à livrer')
          .setDescription(`<@${r.discordId}> — ${r.label}\n\`${id}\`\n**Erreur :** ${r.lastError}`));
      }
    }
    return { found: true, status: r.status };
  }
  return { found: false };
}

function rewardsOf(guildId, discordId) {
  return Object.values(db.guild(guildId).rewards).filter((r) => r.discordId === discordId);
}

module.exports = { queueReward, pendingForBridge, acknowledge, rewardsOf };
