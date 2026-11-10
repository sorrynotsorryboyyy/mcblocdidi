// Compte lié : rôle 🔗 Compte lié + surnom Discord = pseudo Minecraft.
// Impossible sur le propriétaire du serveur ou un membre au-dessus du bot : ignoré proprement.
const config = require('../../config');
const db = require('./db');
const { getRole } = require('./helpers');

async function apply(guild, discordId, name) {
  const member = guild.members.cache.get(discordId) ?? await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;
  const role = getRole(guild, 'linked');
  if (role && !member.roles.cache.has(role.id)) await member.roles.add(role, 'Compte Minecraft lié').catch(() => null);

  const link = db.guild(guild.id).links[discordId];
  if (!config.linkSetsNickname || !link) return;
  if (member.id === guild.ownerId || !member.manageable) return;
  if (member.nickname === name) return;
  const ok = await member.setNickname(name, 'Pseudo Minecraft lié').then(() => true).catch(() => false);
  if (ok) { link.nickByBot = true; db.save(); }
}

async function remove(guild, discordId, link) {
  const member = guild.members.cache.get(discordId) ?? await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;
  const role = getRole(guild, 'linked');
  if (role && member.roles.cache.has(role.id)) await member.roles.remove(role, 'Compte Minecraft délié').catch(() => null);
  // On ne retire le surnom que si c'est le bot qui l'a mis et qu'il n'a pas été changé depuis
  if (link?.nickByBot && member.nickname === link.name && member.manageable) {
    await member.setNickname(null, 'Compte Minecraft délié').catch(() => null);
  }
}

/** /setup : répare le rôle et le surnom des comptes déjà liés. */
async function repairAll(guild) {
  let count = 0;
  for (const [discordId, link] of Object.entries(db.guild(guild.id).links)) {
    if (!guild.members.cache.has(discordId)) continue;
    await apply(guild, discordId, link.name);
    count++;
  }
  return count;
}

module.exports = { apply, remove, repairAll };
