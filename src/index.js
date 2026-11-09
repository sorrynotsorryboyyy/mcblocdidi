require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands } = require('./utils/commands');

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN manquant. En local : remplis .env — sur Railway : onglet Variables.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,    // intent privilégié : SERVER MEMBERS INTENT
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,  // intent privilégié : MESSAGE CONTENT INTENT (auto-mod)
  ],
  partials: [Partials.GuildMember],
});

// ---------- Commandes ----------
client.commands = loadCommands();

// ---------- Events ----------
const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  const run = (...args) => Promise.resolve(event.execute(...args, client))
    .catch((err) => console.error(`[event ${event.name}]`, err));
  if (event.once) client.once(event.name, run);
  else client.on(event.name, run);
}

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

// ---------- Arrêt propre (Railway envoie SIGTERM à chaque redéploiement) ----------
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    console.log(`👋 ${signal} reçu, arrêt du bot...`);
    await client.destroy().catch(() => null);
    process.exitCode = 0;
    setTimeout(() => process.exit(0), 1000).unref();
  });
}

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  if (String(err.message).includes('disallowed intents')) {
    console.error('❌ Active "SERVER MEMBERS INTENT" et "MESSAGE CONTENT INTENT" dans le Developer Portal (onglet Bot).');
  } else if (String(err.message).toLowerCase().includes('token')) {
    console.error('❌ Token invalide. Vérifie DISCORD_TOKEN.');
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
