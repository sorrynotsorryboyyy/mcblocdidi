// v9 : guide des jeux (#guide, /guide, route publique) envoyé par le serveur Minecraft, WildFarm dans le Discord.
require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const db = require('../src/utils/db');
const gameGuide = require('../src/utils/gameGuide');
const guide = require('../src/utils/guide');
const { loadCommands } = require('../src/utils/commands');
const { createServer } = require('../src/api/server');

/** Une grosse section, comme celle de WildFarm (beaucoup de tableaux et de lignes). */
function bigSection(id = 'wildfarm', order = 40) {
  const rows = (n, cols) => Array.from({ length: n }, (_, i) => Array.from({ length: cols }, (_, c) => (c === 0 ? `Objet ${i}` : `valeur ${c}-${i}`)));
  return {
    id, title: 'WildFarm', icon: 'ZOMBIE_HEAD', order, summary: 'Raids d\'extraction contre des zombies.',
    rules: Array.from({ length: 18 }, (_, i) => `Règle ${i} : un texte assez long pour remplir la description du guide sur Discord.`),
    commands: [{ syntax: '/wf raid', description: 'Partir en raid' }, { syntax: '/wf ile', description: 'Retourner sur ton île' }],
    tables: Array.from({ length: 16 }, (_, t) => ({ title: `Tableau ${t}`, note: '', columns: ['Nom', 'PV', 'Dégâts', 'Vitesse', 'Capacités'], rows: rows(25, 5) })),
  };
}

const size = (payload) => payload.embeds.reduce((sum, e) => {
  const d = e.toJSON();
  return sum + (d.title?.length ?? 0) + (d.description?.length ?? 0)
    + (d.fields ?? []).reduce((s, f) => s + f.name.length + f.value.length, 0) + (d.footer?.text?.length ?? 0);
}, 0);

test('guide : nettoyage (identifiants valides, pas de doublon, tableaux cohérents, ordre)', () => {
  const clean = gameGuide.sanitize({
    hash: 'abc',
    sections: [
      bigSection('wildfarm', 40),
      { id: 'reseau', title: 'Réseau', order: 0, rules: ['Respect'], commands: [], tables: [] },
      { id: 'Pas Valide', title: 'x' },
      { id: 'reseau', title: 'doublon' },
      { id: 'piggywars', title: 'Piggy Wars', order: 10, tables: [{ title: 'T', columns: ['A', 'B'], rows: [['1', '2'], ['seul']] }] },
    ],
  });
  assert.deepEqual(clean.sections.map((s) => s.id), ['reseau', 'piggywars', 'wildfarm'], 'triées, invalides et doublons retirés');
  assert.equal(clean.sections[1].tables[0].rows.length, 1, 'ligne incomplète retirée');
  assert.equal(gameGuide.sanitize(null).sections.length, 0);
});

test('guide : un message par section reste sous les limites de Discord', () => {
  const [section] = gameGuide.sanitize({ sections: [bigSection()] }).sections;
  const payload = gameGuide.sectionPayload(section);
  assert.ok(payload.embeds.length <= 10);
  assert.ok(size(payload) <= 6000, `taille ${size(payload)}`);
  for (const e of payload.embeds) {
    const d = e.toJSON();
    assert.ok((d.description?.length ?? 0) <= 4096);
    assert.ok((d.fields ?? []).length <= 25);
    for (const f of d.fields ?? []) assert.ok(f.value.length <= 1024 && f.value.length > 0, f.name);
  }
  assert.equal(payload.embeds[0].toJSON().title, '🧟 Guide · WildFarm', 'emoji du mini-jeu (config.js)');
  assert.match(JSON.stringify(payload.embeds.map((e) => e.toJSON())), /\/guide en jeu/, 'renvoi vers le détail en jeu');
});

test('guide : enregistré pour le site (route publique) et pour /guide', () => {
  db.guild('gg');
  gameGuide.store({ hash: 'h1', sections: [bigSection(), { id: 'reseau', title: 'Réseau', order: 0 }] });
  const pub = gameGuide.publicGuide();
  assert.equal(pub.hash, 'h1');
  assert.deepEqual(pub.sections.map((s) => s.id), ['reseau', 'wildfarm']);
  assert.equal(gameGuide.section('wildfarm').title, 'WildFarm');
  assert.equal(gameGuide.section('inconnu'), null);
});

test('API : POST /api/guide protégé, GET /public/guide ouvert', async () => {
  const server = createServer({ isReady: () => true, guilds: { cache: new Map() } }, 'un-secret-de-test-suffisamment-long');
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  const call = (method, path, auth, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({ port, method, path, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) } }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(t) }));
    });
    req.on('error', reject);
    req.end(data);
  });
  try {
    assert.equal((await call('POST', '/api/guide', null, { sections: [] })).status, 401, 'sans secret : refusé');
    const base = bigSection();
    const big = { hash: 'h2', sections: [{ ...base, tables: base.tables.map((t) => ({ ...t, rows: [...t.rows, ...t.rows, ...t.rows, ...t.rows] })) }] };
    assert.ok(JSON.stringify(big).length > 64 * 1024, 'plus gros que la limite des autres routes');
    const ok = await call('POST', '/api/guide', 'un-secret-de-test-suffisamment-long', big);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.sections, 1);
    const pub = await call('GET', '/public/guide');
    assert.equal(pub.status, 200);
    assert.equal(pub.body.hash, 'h2');
  } finally {
    server.close();
  }
});

test('commandes : /guide existe, choix du réseau, de la progression et de chaque jeu ; listée dans /help', () => {
  const commands = loadCommands();
  const cmd = commands.get('guide');
  assert.ok(cmd, '/guide chargée');
  const choices = cmd.data.toJSON().options[0].choices.map((c) => c.value);
  assert.deepEqual(choices, ['reseau', 'progression', 'piggywars', 'sumotower', 'corewars', 'wildfarm']);
  assert.ok(guide.PLAYER_COMMAND_NAMES.has('guide'), 'commande joueur (autorisée dans #commandes-bot)');
});
