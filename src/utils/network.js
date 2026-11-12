// Source unique des infos publiques du réseau (liens, jeux, règles, sites de vote),
// publiée par le site : https://mcbloc.fr/network.json (même fichier que le plugin du serveur).
//
// Au démarrage : copie locale ($DATA_DIR/network-cache.json) si elle existe, puis téléchargement ;
// ensuite toutes les 30 minutes. Si le site ne répond pas, config.js et la dernière copie restent valables.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../../config');

const REFRESH_MS = 30 * 60 * 1000;
const CACHE_FILE = path.join(process.env.DATA_DIR || './data', 'network-cache.json');

let lastUpdate = null; // { source: 'site' | 'cache', at: Date }
let timer = null;

const isUrl = (v) => typeof v === 'string' && /^https:\/\/\S+$/.test(v);

/** Vérifie la forme minimale du document (fonction pure). */
function validate(data) {
  return !!data && typeof data === 'object' && !Array.isArray(data)
    && typeof data.links === 'object' && Array.isArray(data.games) && Array.isArray(data.rules);
}

/**
 * Applique le document à la config en mémoire (fonction pure sur l'objet `cfg`).
 * Les noms, emojis et ids des jeux ne changent pas (salons et rôles Discord en dépendent) :
 * seules les descriptions sont reprises.
 */
function apply(cfg, data) {
  if (!validate(data)) return false;
  for (const key of ['site', 'boutique', 'vote']) {
    if (isUrl(data.links[key])) cfg.links[key] = data.links[key];
  }
  if (isUrl(data.links.discord)) cfg.discordInvite = data.links.discord;
  if (typeof data.versions === 'string' && data.versions.length <= 32) cfg.minecraft.version = data.versions;

  for (const game of data.games) {
    const local = cfg.minigames.find((g) => g.id === game?.id);
    if (!local || typeof game.description !== 'string') continue;
    local.description = (typeof game.mode === 'string' ? `${game.mode} — ` : '') + game.description;
  }

  const rules = data.rules
    .filter((r) => typeof r?.text === 'string' && Array.isArray(r.where) && r.where.includes('discord'))
    .map((r) => r.text.slice(0, 300));
  if (rules.length) cfg.rules = rules;

  const sites = Array.isArray(data.votes?.sites) ? data.votes.sites : [];
  cfg.votes = {
    sites: sites
      .filter((s) => typeof s?.name === 'string' && isUrl(s.url))
      .map((s) => ({
        id: String(s.id ?? s.name),
        name: s.name,
        url: s.url,
        partner: s.partner === true,
        cooldownHours: Number(s.cooldownHours) || 24,
        howTo: typeof s.howTo === 'string' ? s.howTo : '',
        reward: s.reward ?? data.votes.defaultReward ?? null,
      })),
    milestones: Array.isArray(data.votes?.milestones) ? data.votes.milestones : [],
  };
  return true;
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
  } catch (err) {
    console.warn('[network] copie locale impossible :', err.message);
  }
}

/** Télécharge network.json et l'applique (garde la version actuelle en cas d'échec). */
async function refresh(fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(config.networkUrl, { signal: globalThis.AbortSignal.timeout(15_000), headers: { 'User-Agent': 'mcblocdidi' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!apply(config, data)) throw new Error('document invalide');
    writeCache(data);
    lastUpdate = { source: 'site', at: new Date() };
    return true;
  } catch (err) {
    console.warn(`[network] ${config.networkUrl} indisponible (${err.message}) : infos actuelles conservées.`);
    return false;
  }
}

/** Démarrage : copie locale immédiate, puis téléchargement et rafraîchissement périodique. */
function start() {
  const cached = readCache();
  if (cached && apply(config, cached)) lastUpdate = { source: 'cache', at: new Date() };
  refresh();
  clearInterval(timer);
  timer = setInterval(refresh, REFRESH_MS);
  timer.unref?.();
}

function status() {
  return lastUpdate;
}

module.exports = { start, refresh, apply, validate, status };
