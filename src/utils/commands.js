// Charge toutes les commandes de src/commands (partagé par index.js, ready.js et deploy-commands.js).
const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');

const ROOT = path.join(__dirname, '..', 'commands');

function loadCommands(dir = ROOT, collection = new Collection()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) loadCommands(full, collection);
    else if (entry.name.endsWith('.js')) {
      const cmd = require(full);
      cmd.category = path.basename(dir);
      collection.set(cmd.data.name, cmd);
    }
  }
  return collection;
}

/** Enregistre les slash commands sur chaque serveur où se trouve le bot (instantané). */
async function registerCommands(client) {
  const body = client.commands.map((c) => c.data.toJSON());
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.commands.set(body);
      console.log(`🔧 ${body.length} commandes enregistrées sur « ${guild.name} ».`);
    } catch (err) {
      console.error(`⚠️ Impossible d'enregistrer les commandes sur « ${guild.name} » : ${err.message}`
        + '\n   → réinvite le bot avec le scope applications.commands.');
    }
  }
}

module.exports = { loadCommands, registerCommands };
