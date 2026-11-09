// Fin des giveaways (tirage) + minuteur qui survit aux redémarrages (tout est en base).
const db = require('./db');
const { giveawayMessage } = require('./embeds');

const TICK_MS = 15_000;

/** Tire `count` gagnants distincts au hasard, en excluant éventuellement certains ids. */
function pickWinners(participants, count, exclude = []) {
  let pool = participants.filter((id) => !exclude.includes(id));
  if (pool.length < count) pool = [...participants]; // pas assez de nouveaux : on reprend tout le monde
  const winners = [];
  while (winners.length < count && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(i, 1)[0]);
  }
  return winners;
}

/**
 * Termine (ou relance le tirage d') un giveaway.
 * @returns {Promise<string[]>} les gagnants
 */
async function endGiveaway(client, guildId, gw, { reroll = false } = {}) {
  const guild = client.guilds.cache.get(guildId);
  // Ne garde que les participants encore sur le serveur
  const present = guild ? gw.participants.filter((id) => guild.members.cache.has(id)) : gw.participants;
  const previous = gw.winnerIds ?? [];
  gw.winnerIds = pickWinners(present, gw.winners, reroll ? previous : []);
  gw.ended = true;
  if (!reroll) gw.endsAt = Math.min(gw.endsAt, Date.now());
  db.save();

  const channel = guild?.channels.cache.get(gw.channelId);
  const msg = await channel?.messages.fetch(gw.messageId).catch(() => null);
  if (msg) await msg.edit(giveawayMessage(gw)).catch(() => null);

  if (channel) {
    const text = gw.winnerIds.length
      ? `🎉 ${reroll ? 'Nouveau tirage ! ' : ''}Félicitations ${gw.winnerIds.map((id) => `<@${id}>`).join(', ')} ! Tu remportes **${gw.prize}** !`
      : `😢 Pas assez de participants pour le giveaway **${gw.prize}**.`;
    await channel.send({
      content: text,
      reply: msg ? { messageReference: msg.id, failIfNotExists: false } : undefined,
      allowedMentions: { users: gw.winnerIds },
    }).catch(() => null);
  }
  return gw.winnerIds;
}

async function tick(client) {
  const now = Date.now();
  for (const guildId of db.guildIds()) {
    for (const gw of Object.values(db.guild(guildId).giveaways)) {
      if (!gw.ended && gw.endsAt <= now) {
        await endGiveaway(client, guildId, gw).catch((err) => console.error('[giveaway]', err.message));
      }
    }
  }
}

function start(client) {
  tick(client);
  setInterval(() => tick(client), TICK_MS);
}

module.exports = { start, endGiveaway, pickWinners };
