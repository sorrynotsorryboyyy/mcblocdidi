// Sondages à boutons : un vote par membre (modifiable), résultats en direct, fin automatique.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');

const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
const TICK_MS = 30_000;

/** Nombre de votes par choix. */
function tally(poll) {
  const counts = poll.choices.map(() => 0);
  for (const n of Object.values(poll.votes)) if (counts[n] !== undefined) counts[n]++;
  return counts;
}

/** Enregistre (ou retire si identique) le vote d'un membre. Renvoie le nouveau choix ou null. */
function vote(poll, userId, choice) {
  if (poll.votes[userId] === choice) {
    delete poll.votes[userId];
    return null;
  }
  poll.votes[userId] = choice;
  return choice;
}

function pollMessage(poll) {
  const counts = tally(poll);
  const total = counts.reduce((a, b) => a + b, 0);
  const hidden = poll.hideResults && !poll.ended;
  const lines = poll.choices.map((c, i) => {
    if (hidden) return `${NUMBERS[i]} ${c}`;
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    return `${NUMBERS[i]} **${c}**\n\`${bar}\` ${pct}% (${counts[i]})`;
  });
  const winner = poll.ended && total ? counts.indexOf(Math.max(...counts)) : -1;

  const embed = base(poll.ended ? config.colors.neutral : config.colors.info)
    .setTitle(`📊 ${poll.question}`.slice(0, 256))
    .setDescription(lines.join('\n\n')
      + `\n\n👥 **${total}** vote(s)`
      + (hidden ? ' — résultats affichés à la fin' : '')
      + (poll.endsAt ? (poll.ended ? `\n🔒 Terminé <t:${Math.floor(poll.endsAt / 1000)}:R>` : `\n⏰ Fin <t:${Math.floor(poll.endsAt / 1000)}:R>`) : '')
      + (winner >= 0 ? `\n🏆 Gagnant : ${NUMBERS[winner]} **${poll.choices[winner]}**` : ''));

  const row = new ActionRowBuilder().addComponents(poll.choices.map((c, i) => new ButtonBuilder()
    .setCustomId(`poll_vote:${poll.id}:${i}`)
    .setEmoji(NUMBERS[i])
    .setLabel(c.slice(0, 80))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!!poll.ended)));
  return { embeds: [embed], components: [row] };
}

async function endPoll(client, guildId, poll) {
  poll.ended = true;
  poll.endsAt = Math.min(poll.endsAt ?? Date.now(), Date.now());
  db.save();
  const channel = client.guilds.cache.get(guildId)?.channels.cache.get(poll.channelId);
  const msg = await channel?.messages.fetch(poll.messageId).catch(() => null);
  if (msg) await msg.edit(pollMessage(poll)).catch(() => null);
}

async function tick(client) {
  const now = Date.now();
  for (const guildId of db.guildIds()) {
    for (const poll of Object.values(db.guild(guildId).polls)) {
      if (!poll.ended && poll.endsAt && poll.endsAt <= now) await endPoll(client, guildId, poll).catch(() => null);
    }
  }
}

function start(client) {
  tick(client);
  setInterval(() => tick(client).catch((err) => console.error('[sondages]', err.message)), TICK_MS);
}

module.exports = { start, tally, vote, pollMessage, endPoll, NUMBERS };
