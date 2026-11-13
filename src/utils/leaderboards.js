// Classements, affichés dans #classements sous la forme d'UN SEUL embed mis à jour automatiquement :
// top 5 des votes du mois, de chaque mini-jeu (victoires) et des niveaux Discord.
// Les données des jeux et des votes sont envoyées par le proxy (POST /api/leaderboards).
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');
const { ensurePanel, byTitle } = require('./panels');
const { getChannel } = require('./helpers');

const NAME_RE = /^\w{1,16}$/;
const TOP = 5;
const MEDALS = ['🥇', '🥈', '🥉'];
const PANEL_TITLE = `🏆 Classements ${config.serverName}`;

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

/** Lignes « 🥇 **Steve** 🔗 — 12 » (fonction pure). */
function lines(entries, byUuid = {}, unit = '') {
  if (!entries?.length) return '*Personne pour le moment*';
  return entries.slice(0, TOP)
    .map((e, i) => `${MEDALS[i] ?? `\`${i + 1}.\``} **${e.name}**${byUuid[e.uuid] ? ' 🔗' : ''} — ${e.value.toLocaleString('fr-FR')}${unit}`)
    .join('\n');
}

const boardOf = (data, key) => data?.boards?.find((b) => b.key === key) ?? data?.boards?.[0] ?? null;

/**
 * Le panneau unique (fonction pure, testée).
 * @param state       état du serveur (state.leaderboards)
 * @param links       comptes liés (pour la mention 🔗)
 * @param levelsTop   top des niveaux Discord : [[discordId, { level, xp }], ...]
 */
function panelPayload(state, links = {}, levelsTop = [], votesChannelId = null) {
  const byUuid = Object.fromEntries(Object.entries(links).map(([discordId, l]) => [l.uuid, discordId]));
  const boards = state?.leaderboards ?? {};
  const updatedAt = Math.max(0, ...Object.values(boards).map((d) => d.updatedAt ?? 0));
  const votes = votesChannelId ? `<#${votesChannelId}>` : 'le salon des votes';

  const embed = base(config.colors.accent)
    .setTitle(PANEL_TITLE)
    .setDescription(
      `Les meilleurs joueurs du réseau, mis à jour automatiquement.\n🗳️ Pour grimper dans le top des votes, rends-toi dans ${votes} !`
      + (updatedAt ? `\n🔄 Mis à jour <t:${Math.floor(updatedAt / 1000)}:R>` : ''),
    )
    .addFields({ name: '🗳️ Votes du mois', value: lines(boardOf(boards.votes, 'month')?.entries, byUuid, ' votes'), inline: false });

  for (const game of config.minigames) {
    embed.addFields({ name: `${game.emoji} ${game.name} — victoires`, value: lines(boardOf(boards[game.server], 'wins')?.entries, byUuid), inline: true });
  }

  embed.addFields({
    name: '🏅 Niveaux Discord',
    value: levelsTop.length
      ? levelsTop.slice(0, TOP).map(([id, r], i) => `${MEDALS[i] ?? `\`${i + 1}.\``} <@${id}> — niveau **${r.level}**`).join('\n')
      : '*Personne pour le moment*',
    inline: false,
  });
  embed.setFooter({ text: `${config.footer} · 🔗 = compte Minecraft lié` });
  return { embeds: [embed] };
}

const lastHash = new Map();

/** Supprime les anciens panneaux (un par jeu, Top Discord) remplacés par le panneau unique. */
async function removeLegacyPanels(guild) {
  const g = db.guild(guild.id);
  const keys = Object.keys(g.messages ?? {}).filter((k) => k.startsWith('lb_') || k === 'levelsBoard');
  for (const key of keys) {
    const ref = g.messages[key];
    const channel = guild.channels.cache.get(ref?.channelId);
    if (channel?.messages) await channel.messages.delete(ref.messageId).catch(() => null);
    delete g.messages[key];
  }
  if (keys.length) db.save();
  return keys.length;
}

async function refreshPanels(guild, force = false) {
  const g = db.guild(guild.id);
  const { ranking } = require('./levels'); // chargé ici : levels.js rafraîchit aussi ce panneau
  const levelsTop = ranking(guild.id).slice(0, TOP);
  const payload = panelPayload(g.state, g.links, levelsTop, getChannel(guild, 'votes')?.id ?? null);
  const hash = JSON.stringify(payload.embeds[0].data.fields) + payload.embeds[0].data.description;
  if (!force && lastHash.get(guild.id) === hash) return 0; // rien de neuf : pas d'édition inutile
  lastHash.set(guild.id, hash);
  await removeLegacyPanels(guild);
  return ensurePanel(guild, 'leaderboard', 'leaderboards', payload, { match: byTitle(PANEL_TITLE) })
    .catch((err) => { console.error('[classements]', err.message); return 0; });
}

/** Top voteurs du mois (pour le site, sans les UUID) : { top: [{ name, votes }], updatedAt }. */
function topVoters() {
  const guildId = db.guildIds()[0];
  const data = guildId ? db.guild(guildId).state.leaderboards?.votes : null;
  return {
    top: (boardOf(data, 'month')?.entries ?? []).map((e) => ({ name: e.name, votes: e.value })),
    updatedAt: data?.updatedAt ?? null,
  };
}

module.exports = { store, sanitize, panelPayload, refreshPanels, topVoters, lines, PANEL_TITLE };
