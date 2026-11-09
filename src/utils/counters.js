// Salons compteurs (catégorie 📊 STATISTIQUES) : renommés seulement si la valeur change,
// et au plus une fois par `config.counterInterval` (Discord limite à 2 renommages / 10 min / salon).
const config = require('../../config');
const { getChannel } = require('./helpers');

const lastRename = new Map(); // channelId → timestamp

function names(guild, s) {
  const humans = guild.members.cache.filter((m) => !m.user.bot).size || guild.memberCount;
  return {
    statMembers: `👥 Membres : ${humans}`,
    statPlayers: `🎮 En jeu : ${s.online ? s.players.online : 0}`,
    statServer: s.online ? '🟢 Serveur : En ligne' : '🔴 Serveur : Hors ligne',
  };
}

function update(guild, s) {
  const now = Date.now();
  for (const [key, name] of Object.entries(names(guild, s))) {
    const channel = getChannel(guild, key);
    if (!channel || channel.name === name) continue;
    if (now - (lastRename.get(channel.id) ?? 0) < config.counterInterval) continue;
    lastRename.set(channel.id, now);
    // Pas d'await : si Discord nous limite, la requête attend sans bloquer le reste du bot
    channel.setName(name, 'Compteur').catch(() => null);
  }
}

module.exports = { update, names };
