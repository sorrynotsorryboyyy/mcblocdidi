// Envoie un embed dans le salon #logs (si configuré).
const { getChannel } = require('./helpers');

async function sendLog(guild, payload) {
  const channel = getChannel(guild, 'logs');
  if (!channel) return;
  const data = payload.data ? { embeds: [payload] } : payload; // EmbedBuilder ou options
  await channel.send(data).catch((err) => console.error('[logs]', err.message));
}

module.exports = { sendLog };
