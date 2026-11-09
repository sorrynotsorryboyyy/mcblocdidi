const { Events } = require('discord.js');
const statusUpdater = require('../utils/statusUpdater');
const giveaways = require('../utils/giveaways');
const invites = require('../utils/invites');
const boosts = require('../utils/boosts');
const { registerCommands } = require('../utils/commands');
const db = require('../utils/db');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Connecté en tant que ${client.user.tag} sur ${client.guilds.cache.size} serveur(s).`);
    console.log(`💾 Données : ${db.FILE}`);
    await registerCommands(client);
    // Remplit le cache des membres (tickets, rôles, compteurs, boosters)
    for (const guild of client.guilds.cache.values()) await guild.members.fetch().catch(() => null);
    statusUpdater.start(client);
    giveaways.start(client);
    await invites.start(client);
    for (const guild of client.guilds.cache.values()) await boosts.refreshBoard(guild);
  },
};
