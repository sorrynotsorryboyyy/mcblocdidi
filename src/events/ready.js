const { Events } = require('discord.js');
const statusUpdater = require('../utils/statusUpdater');
const giveaways = require('../utils/giveaways');
const { registerCommands } = require('../utils/commands');
const db = require('../utils/db');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Connecté en tant que ${client.user.tag} sur ${client.guilds.cache.size} serveur(s).`);
    console.log(`💾 Données : ${db.FILE}`);
    await registerCommands(client);
    // Remplit le cache des membres (utile pour les tickets / rôles / compteurs)
    for (const guild of client.guilds.cache.values()) await guild.members.fetch().catch(() => null);
    statusUpdater.start(client);
    giveaways.start(client);
  },
};
