// Enregistrement manuel des slash commands (facultatif : le bot le fait déjà tout seul au démarrage).
require('dotenv').config({ quiet: true });
const { REST, Routes } = require('discord.js');
const { loadCommands } = require('./src/utils/commands');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ DISCORD_TOKEN, CLIENT_ID et GUILD_ID doivent être remplis dans .env');
  process.exitCode = 1;
} else {
  const commands = loadCommands().map((c) => c.data.toJSON());
  const rest = new REST().setToken(DISCORD_TOKEN);

  (async () => {
    try {
      console.log(`⏳ Déploiement de ${commands.length} commandes...`);
      const data = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`✅ ${data.length} commandes déployées sur le serveur ${GUILD_ID}.`);
    } catch (err) {
      console.error('❌ Erreur de déploiement :', err.message);
      if (err.code === 50001) {
        console.error('👉 Le bot n\'est pas sur ce serveur (ou GUILD_ID est faux). Invite-le avec :');
        console.error(`   https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot%20applications.commands&permissions=8`);
      }
      process.exitCode = 1; // pas de process.exit() : évite le crash "Assertion failed" de Node sous Windows
    }
  })();
}
