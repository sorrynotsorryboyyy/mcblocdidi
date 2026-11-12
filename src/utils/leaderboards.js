// Classements des mini-jeux, envoyés par le proxy (POST /api/leaderboards) et affichés
// dans #classements : un panneau unique par jeu, réécrit seulement si les données changent.
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');
const { ensurePanel, byTitle } = require('./panels');

const NAME_RE = /^\w{1,16}$/;
const title = (game) => `🏆 Classement ${game.name}`;

/** Valide et nettoie le corps envoyé par le proxy (fonction pure). */
function sanitize(body) {
  const games = {};
  for (const game of Array.isArray(body?.games) ? body.games.slice(0, 20) : []) {
    if (typeof game?.server !== 'string') continue;
    const boards = (Array.isArray(game.boards) ? game.boards : []).slice(0, 5).map((b) => ({
      key: String(b?.key ?? '').slice(0, 32),
      title: String(b?.title ?? b?.key ?? '').slice(0, 40),
      entries: (Array.isArray(b?.entries) ? b.entries : []).slice(0, 10)
        .filter((e) => NAME_RE.test(e?.name ?? '') && Number.isFinite(Number(e?.value)))
        .map((e) => ({ uuid: String(e.uuid ?? '').toLowerCase(), name: e.name, value: Number(e.value) })),
    })).filter((b) => b.key);
    games[game.server.toLowerCase()] = { boards, updatedAt: Date.now() };
  }
  return games;
}

function store(body) {
  const games = sanitize(body);
  for (const guildId of db.guildIds()) {
    const st = db.guild(guildId).state;
    st.leaderboards = { ...(st.leaderboards ?? {}), ...games };
  }
  db.save();
  return Object.keys(games).length;
}

function panelPayload(game, data, links = {}) {
  const byUuid = Object.fromEntries(Object.entries(links).map(([discordId, l]) => [l.uuid, discordId]));
  const medals = ['🥇', '🥈', '🥉'];
  const embed = base(config.colors.accent)
    .setTitle(title(game))
    .setDescription(`${game.emoji} ${game.description}\n🔄 Mis à jour <t:${Math.floor(data.updatedAt / 1000)}:R>`);
  for (const board of data.boards) {
    embed.addFields({
      name: board.title,
      value: (board.entries.length
        ? board.entries.map((e, i) => `${medals[i] ?? `\`${i + 1}.\``} **${e.name}**${byUuid[e.uuid] ? ' 🔗' : ''} — ${e.value.toLocaleString('fr-FR')}`).join('\n')
        : '*Personne pour le moment*').slice(0, 1024),
      inline: true,
    });
  }
  return { embeds: [embed] };
}

const lastHash = new Map();

/** Panneau « Top voteurs du mois », envoyé par le proxy comme un jeu à part (server: 'votes'). */
const VOTES_BOARD = {
  id: 'votes', server: 'votes', name: 'des votes du mois', emoji: '🗳️',
  description: 'Les joueurs qui ont le plus voté ce mois-ci. Vote toi aussi avec /vote !',
};

async function refreshPanels(guild, force = false) {
  const st = db.guild(guild.id).state;
  const links = db.guild(guild.id).links;
  for (const game of [...config.minigames, VOTES_BOARD]) {
    const data = st.leaderboards?.[game.server];
    if (!game.server || !data) continue;
    const hash = JSON.stringify(data.boards);
    const key = `${guild.id}:${game.server}`;
    if (!force && lastHash.get(key) === hash) continue; // rien de neuf : pas d'édition inutile
    lastHash.set(key, hash);
    await ensurePanel(guild, `lb_${game.id}`, 'leaderboards', panelPayload(game, data, links), { match: byTitle(title(game)) })
      .catch((err) => console.error('[classements]', err.message));
  }
}

/** Top voteurs du mois (pour le site, sans les UUID) : { top: [{ name, votes }], updatedAt }. */
function topVoters() {
  const guildId = db.guildIds()[0];
  const data = guildId ? db.guild(guildId).state.leaderboards?.votes : null;
  return {
    top: (data?.boards?.[0]?.entries ?? []).map((e) => ({ name: e.name, votes: e.value })),
    updatedAt: data?.updatedAt ?? null,
  };
}

module.exports = { store, sanitize, panelPayload, refreshPanels, title, topVoters, VOTES_BOARD };
