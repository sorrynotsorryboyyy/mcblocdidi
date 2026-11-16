// Guide des jeux (#guide, /guide, route publique pour le site) : règles, commandes et chiffres de chaque jeu.
// SOURCE UNIQUE : le serveur Minecraft. Chaque serveur publie sa section (construite depuis ses fichiers de config),
// le proxy l'envoie ici (POST /api/guide) : rien n'est recopié à la main, donc rien ne peut se contredire.
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');
const { ensurePanel, byTitle } = require('./panels');

const MAX_SECTIONS = 12;
const ID_RE = /^[a-z0-9_-]{1,32}$/;
// Limites Discord : 4096 (description), 1024 (champ), 25 champs, 6000 caractères par message.
const MESSAGE_BUDGET = 5800;
const SECTION_EMOJI = { reseau: '🌐', progression: '⭐', grades: '💎', cosmetiques: '🎨' };

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

/** Valide et nettoie le guide envoyé par le proxy (fonction pure). */
function sanitize(body) {
  const sections = [];
  for (const s of list(body?.sections, MAX_SECTIONS)) {
    const id = String(s?.id ?? '');
    if (!ID_RE.test(id) || sections.some((x) => x.id === id)) continue;
    sections.push({
      id,
      title: text(s.title, 60) || id,
      order: Number.isFinite(Number(s.order)) ? Number(s.order) : 100,
      summary: text(s.summary, 400),
      rules: list(s.rules, 40).map((r) => text(r, 400)).filter(Boolean),
      commands: list(s.commands, 40).map((c) => ({ syntax: text(c?.syntax, 80), description: text(c?.description, 160) }))
        .filter((c) => c.syntax),
      tables: list(s.tables, 30).map((t) => {
        const columns = list(t?.columns, 12).map((c) => text(c, 40));
        return {
          title: text(t?.title, 80),
          note: text(t?.note, 300),
          columns,
          rows: list(t?.rows, 120).map((r) => list(r, columns.length).map((c) => text(c, 200)))
            .filter((r) => r.length === columns.length && r.length > 0),
        };
      }).filter((t) => t.title && t.columns.length),
    });
  }
  sections.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { hash: text(body?.hash, 64), sections };
}

/** Enregistre le guide (le même pour tous les serveurs Discord du bot). */
function store(body) {
  const guide = { ...sanitize(body), updatedAt: Date.now() };
  for (const guildId of db.guildIds()) db.guild(guildId).state.guide = guide;
  db.save();
  return guide.sections.length;
}

function current() {
  const guildId = db.guildIds()[0];
  return (guildId ? db.guild(guildId).state.guide : null) ?? { hash: '', sections: [], updatedAt: 0 };
}

/** Emoji d'une section : celui du mini-jeu (config.js) ou celui des sections du réseau. */
function emojiOf(id) {
  return SECTION_EMOJI[id] ?? config.minigames.find((g) => g.server === id)?.emoji ?? '📘';
}

const titleOf = (section) => `${emojiOf(section.id)} Guide · ${section.title}`;

/** Coupe une liste de lignes pour tenir dans `max` caractères, avec « … et N de plus ». */
function fit(lines, max, more = (n) => `*… et ${n} de plus : /guide en jeu*`) {
  const all = lines.join('\n');
  if (all.length <= max) return all;
  const out = [];
  let size = 0;
  for (let i = 0; i < lines.length; i++) {
    const tail = more(lines.length - i);
    if (size + lines[i].length + 1 + tail.length > max) {
      out.push(tail);
      break;
    }
    out.push(lines[i]);
    size += lines[i].length + 1;
  }
  return out.join('\n');
}

/** Une ligne de tableau : « **Rôdeur** — PV : 20 · Dégâts : 3 ». */
function rowLine(table, row) {
  // Colonnes « _… » (ex. « _icon ») : données pour le site, jamais affichées.
  const rest = row.slice(1).map((v, i) => [table.columns[i + 1], v])
    .filter(([column]) => !column.startsWith('_'))
    .map(([column, v]) => `${column} : ${v}`).join(' · ');
  return `• **${row[0]}**${rest ? ` — ${rest}` : ''}`;
}

/**
 * Message d'une section (fonction pure, testée) : présentation, règles, commandes, puis les tableaux résumés.
 * Toujours sous les limites de Discord ; le détail complet reste dans /guide en jeu.
 */
function sectionPayload(section) {
  const main = base(config.colors.primary).setTitle(titleOf(section));
  const rules = section.rules.map((r) => `• ${r}`);
  // Discord refuse une description vide : présentation et règles seulement si elles existent.
  const description = fit([section.summary, ...(section.summary && rules.length ? [''] : []), ...rules].filter((l, i) => i > 0 || l), 3000).trim();
  if (description) main.setDescription(description);
  if (section.commands.length) {
    main.addFields({ name: '⌨️ Commandes', value: fit(section.commands.map((c) => `\`${c.syntax}\` — ${c.description}`), 1000) });
  }
  const embeds = [main];
  let budget = MESSAGE_BUDGET - (main.data.title?.length ?? 0) - (main.data.description?.length ?? 0)
    - (main.data.fields ?? []).reduce((s, f) => s + f.name.length + f.value.length, 0);

  if (section.tables.length) {
    const numbers = base(config.colors.accent).setTitle(`📊 Chiffres · ${section.title}`);
    budget -= numbers.data.title.length;
    let added = 0;
    for (const table of section.tables) {
      if (added >= 24 || budget < 200) break;
      const room = Math.min(1000, budget - table.title.length - 40);
      const value = fit(table.rows.map((r) => rowLine(table, r)), room) || '—';
      numbers.addFields({ name: table.title, value });
      budget -= table.title.length + value.length;
      added++;
    }
    if (added < section.tables.length) {
      numbers.setDescription(`*${section.tables.length - added} autre(s) tableau(x) dans /guide en jeu.*`);
    }
    embeds.push(numbers);
  }
  return { embeds };
}

const lastHash = new Map();

/** Met à jour #guide : un message par section (dans l'ordre), sans doublon ; retire les sections disparues. */
async function refreshPanels(guild, force = false) {
  const guide = current();
  const g = db.guild(guild.id);
  const ids = new Set(guide.sections.map((s) => s.id));
  for (const key of Object.keys(g.messages ?? {}).filter((k) => k.startsWith('guide_') && !ids.has(k.slice(6)))) {
    const ref = g.messages[key];
    const channel = guild.channels.cache.get(ref?.channelId);
    if (channel?.messages) await channel.messages.delete(ref.messageId).catch(() => null);
    delete g.messages[key];
    db.save();
  }
  let updated = 0;
  for (const section of guide.sections) {
    const payload = sectionPayload(section);
    const hash = JSON.stringify(payload.embeds.map((e) => e.data));
    const cacheKey = `${guild.id}:${section.id}`;
    if (!force && lastHash.get(cacheKey) === hash) continue; // rien de neuf : pas d'édition inutile
    lastHash.set(cacheKey, hash);
    await ensurePanel(guild, `guide_${section.id}`, 'guide', payload, { match: byTitle(titleOf(section)) })
      .catch((err) => console.error('[guide]', err.message));
    updated++;
  }
  return updated;
}

/** Une section pour /guide (recherche par identifiant). */
function section(id) {
  return current().sections.find((s) => s.id === id) ?? null;
}

/** Pour le site (route publique) : le guide complet, sans rien de privé. */
function publicGuide() {
  const guide = current();
  return { hash: guide.hash, updatedAt: guide.updatedAt, sections: guide.sections };
}

module.exports = { sanitize, store, sectionPayload, refreshPanels, section, publicGuide, titleOf, emojiOf };
