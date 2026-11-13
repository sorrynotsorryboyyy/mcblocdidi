// Annonces de vote dans #votes : le proxy prévient le bot à chaque vote récompensé (POST /api/votes).
// Les votes sont regroupés : un seul message toutes les 15 s (pas de spam si beaucoup de votes d'un coup).
const db = require('./db');
const { getChannel } = require('./helpers');

const FLUSH_MS = 15_000;
const MAX_SEEN = 500;
const MAX_LINES = 5;
const NAME_RE = /^\w{3,16}$/;

const queues = new Map(); // guildId → votes en attente
let timer = null;

/** Vote validé et nettoyé (null s'il est invalide). Fonction pure. */
function sanitize(body) {
  const name = String(body?.name ?? '');
  const id = String(body?.id ?? '').slice(0, 100);
  if (!id || !NAME_RE.test(name)) return null;
  const monthly = Number(body?.monthly);
  const milestone = Number(body?.milestone);
  return {
    id,
    name,
    site: String(body?.site ?? 'un site de vote').slice(0, 40),
    monthly: Number.isFinite(monthly) && monthly > 0 ? Math.floor(monthly) : null,
    milestone: Number.isFinite(milestone) && milestone > 0 ? Math.floor(milestone) : null,
  };
}

const ordinal = (n) => (n === 1 ? '1ᵉʳ' : `${n}ᵉ`);

/** Texte du message pour un lot de votes (fonction pure, testée). */
function format(votes) {
  if (votes.length > MAX_LINES) {
    const names = [...new Set(votes.map((v) => `**${v.name}**`))];
    const shown = names.slice(0, 15).join(', ') + (names.length > 15 ? ` et ${names.length - 15} autre(s)` : '');
    return `🗳️ **${votes.length} nouveaux votes** : ${shown}. Merci à tous ! 💙`;
  }
  return votes.map((v) => {
    let line = `🗳️ **${v.name}** a voté sur **${v.site}**`;
    if (v.monthly) line += ` · ${ordinal(v.monthly)} vote ce mois-ci`;
    if (v.milestone) line += `\n🎁 Palier de **${v.milestone} votes** atteint, coffre gagné !`;
    return line;
  }).join('\n');
}

/** Ajoute un vote (dédoublonné par id) dans la file de chaque serveur Discord. */
function enqueue(client, body) {
  const vote = sanitize(body);
  if (!vote) return { ok: false, error: 'invalid-vote' };
  let queued = false;
  for (const guildId of db.guildIds()) {
    const st = db.guild(guildId).state;
    st.votesSeen ??= [];
    if (st.votesSeen.includes(vote.id)) continue; // déjà annoncé (renvoi du proxy)
    st.votesSeen.push(vote.id);
    if (st.votesSeen.length > MAX_SEEN) st.votesSeen.splice(0, st.votesSeen.length - MAX_SEEN);
    if (!queues.has(guildId)) queues.set(guildId, []);
    queues.get(guildId).push(vote);
    queued = true;
  }
  db.save();
  if (queued && client) schedule(client);
  return { ok: true, queued };
}

function schedule(client) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush(client).catch((err) => console.error('[votes] annonce :', err.message));
  }, FLUSH_MS);
  timer.unref?.();
}

/** Envoie un message par serveur avec les votes en attente. */
async function flush(client) {
  for (const [guildId, votes] of queues) {
    queues.delete(guildId);
    const guild = client.guilds.cache.get(guildId);
    const channel = guild ? getChannel(guild, 'votes') : null;
    if (!channel || !votes.length) continue;
    // Texte simple (pas d'embed) : le panneau fixe du salon n'est jamais confondu avec une annonce.
    await channel.send({ content: format(votes), allowedMentions: { parse: [] } });
  }
}

module.exports = { sanitize, format, enqueue, flush, FLUSH_MS };
