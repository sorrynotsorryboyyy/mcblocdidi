require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands } = require('./utils/commands');

// Nettoie le token (erreurs de copier-coller fréquentes sur Railway :
// espaces, retours à la ligne, guillemets, "DISCORD_TOKEN=" ou "Bot " collés dans la valeur)
const token = (process.env.DISCORD_TOKEN ?? '')
  .replace(/\s+/g, ' ')
  .replace(/["'`]/g, '')
  .trim()
  .replace(/^DISCORD_TOKEN\s*=\s*/i, '')
  .replace(/^Bot\s+/i, '')
  .replace(/\s+/g, '');

if (!token) {
  console.error('❌ DISCORD_TOKEN manquant. En local : remplis .env — sur Railway : onglet Variables.');
  process.exit(1);
}
if (!/^[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(token)) {
  console.error(`❌ DISCORD_TOKEN a un format invalide (${token.length} caractères, ${token.split('.').length} parties au lieu de 3).`
    + '\n   Colle uniquement le token (Developer Portal → Bot → Reset Token), sans guillemets ni "DISCORD_TOKEN=".');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,    // intent privilégié : SERVER MEMBERS INTENT
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,  // intent privilégié : MESSAGE CONTENT INTENT (auto-mod)
    GatewayIntentBits.GuildInvites,    // suivi des invitations (parrainage)
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

// ---------- API du pont Minecraft (récompenses, liaison de compte) ----------
const api = require('./api/server').start(client);

// ---------- Arrêt propre (Railway envoie SIGTERM à chaque redéploiement) ----------
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    console.log(`👋 ${signal} reçu, arrêt du bot...`);
    api.close();
    await client.destroy().catch(() => null);
    process.exitCode = 0;
    setTimeout(() => process.exit(0), 1000).unref();
  });
}

client.login(token).catch((err) => {
  if (String(err.message).includes('disallowed intents')) {
    console.error('❌ Active "SERVER MEMBERS INTENT" et "MESSAGE CONTENT INTENT" dans le Developer Portal (onglet Bot).');
  } else if (String(err.message).toLowerCase().includes('token')) {
    console.error('❌ Token invalide. Vérifie DISCORD_TOKEN.');
  } else {
    console.error(err);
  }
  // Arrêt réel (l'API HTTP garderait sinon le processus en vie) : Railway redémarre le bot
  process.exitCode = 1;
  api.close();
  setTimeout(() => process.exit(1), 500).unref();
});
