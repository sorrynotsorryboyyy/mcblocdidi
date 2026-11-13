// v6 : source unique network.json, commande /vote, routes publiques pour le site.
require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fixture = require('./fixtures/network.json');
const config = require('../config');
const network = require('../src/utils/network');
const db = require('../src/utils/db');
const leaderboards = require('../src/utils/leaderboards');
const { votePayload } = require('../src/commands/minecraft/vote');
const { createServer } = require('../src/api/server');

const clone = (o) => JSON.parse(JSON.stringify(o));

test('network.json : liens, version, descriptions et règles Discord appliqués', () => {
  const cfg = clone(config);
  assert.equal(network.apply(cfg, fixture), true);
  assert.equal(cfg.links.boutique, 'https://mcbloc.fr/boutique', 'plus de sous-domaine boutique');
  assert.equal(cfg.links.vote, 'https://mcbloc.fr/vote');
  assert.equal(cfg.discordInvite, 'https://discord.mcbloc.fr');
  assert.equal(cfg.minecraft.version, '1.8 – 1.21');
  // Les ids, noms et salons des jeux ne changent pas, seules les descriptions sont reprises
  assert.deepEqual(cfg.minigames.map((g) => g.id), ['piggy-wars', 'sumogames', 'corewars']);
  assert.match(cfg.minigames[0].description, /cochons/);
  assert.ok(cfg.rules.length >= 5);
  assert.ok(cfg.rules.some((r) => r.includes('salons')), 'règle propre au Discord présente');
  assert.ok(!cfg.rules.some((r) => r.includes('Un seul compte')), 'règle propre au jeu absente');
  const aevum = cfg.votes.sites.find((s) => s.partner);
  assert.equal(aevum.name, 'Aevum Launcher');
  assert.ok(aevum.reward.coins > fixture.votes.defaultReward.coins, 'le partenaire rapporte plus');
});

test('network.json invalide ou injoignable : la config actuelle est conservée', async () => {
  const cfg = clone(config);
  assert.equal(network.apply(cfg, null), false);
  assert.equal(network.apply(cfg, { links: {}, games: 'x', rules: [] }), false);
  assert.equal(network.apply(cfg, { ...clone(fixture), links: { site: 'javascript:alert(1)' } }), true);
  assert.equal(cfg.links.site, config.links.site, 'URL non https ignorée');

  const before = JSON.stringify(config.links);
  const down = async () => { throw new Error('ECONNREFUSED'); };
  assert.equal(await network.refresh(down), false);
  const notFound = async () => ({ ok: false, status: 404, json: async () => ({}) });
  assert.equal(await network.refresh(notFound), false);
  assert.equal(JSON.stringify(config.links), before);
});

test('/vote : partenaire en premier, récompenses, paliers et boutons', () => {
  const cfg = clone(config);
  network.apply(cfg, fixture);
  const payload = votePayload(cfg);
  const embed = payload.embeds[0].toJSON();
  assert.match(embed.title, /Vote pour MCBLOC/);
  assert.match(embed.fields[0].name, /Aevum Launcher — partenaire/);
  assert.match(embed.fields[0].value, /150 pièces/);
  assert.match(embed.fields[0].value, /15 % Coffre basique/);
  assert.ok(embed.fields.some((f) => f.name.includes('Paliers') && f.value.includes('60 votes')));
  const urls = payload.components[0].components.map((b) => b.toJSON().url);
  assert.deepEqual(urls, ['https://aevum-launcher.fr', 'https://mcbloc.fr/vote']);
  assert.equal(embed.color, 0xffd84d, 'couleur accent de la charte');
});

test('routes publiques : top voteurs sans UUID, CORS limité au site, /api toujours protégé', async () => {
  db.guild('g1');
  leaderboards.store({ games: [{ server: 'votes', boards: [{ key: 'month', title: 'Votes du mois', entries: [
    { uuid: '123e4567-e89b-12d3-a456-426614174000', name: 'Steve', value: 12 },
    { uuid: '223e4567-e89b-12d3-a456-426614174000', name: 'Alex', value: 7 },
  ] }] }] });

  const server = createServer({ isReady: () => true, guilds: { cache: new Map() } }, 'un-secret-de-test-suffisamment-long');
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  const get = (path, origin) => new Promise((resolve, reject) => {
    http.get({ port, path, headers: origin ? { Origin: origin } : {} }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: body ? JSON.parse(body) : null }));
    }).on('error', reject);
  });

  try {
    const ok = await get('/public/votes', 'https://mcbloc.fr');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.top, [{ name: 'Steve', votes: 12 }, { name: 'Alex', votes: 7 }]);
    assert.equal(ok.headers['access-control-allow-origin'], 'https://mcbloc.fr');
    assert.ok(!JSON.stringify(ok.body).includes('123e4567'), 'aucune UUID exposée');

    const other = await get('/public/votes', 'https://pirate.example');
    assert.equal(other.status, 200);
    assert.equal(other.headers['access-control-allow-origin'], undefined, 'origine non autorisée : pas de CORS');

    const lb = await get('/public/leaderboards');
    assert.equal(lb.body.games.votes.boards[0].entries[0].name, 'Steve');
    assert.ok(!JSON.stringify(lb.body).includes('uuid'));

    assert.equal((await get('/api/rewards/pending')).status, 401, 'les routes du pont restent protégées');
  } finally {
    server.close();
  }
});

test('classements : les votes du mois font partie du panneau unique', () => {
  const json = leaderboards.panelPayload({ leaderboards: { votes: { boards: [{ key: 'month', entries: [{ uuid: 'u', name: 'Steve', value: 4 }] }] } } })
    .embeds[0].toJSON();
  assert.match(json.fields[0].name, /Votes du mois/);
  assert.match(json.fields[0].value, /Steve\*\* — 4 votes/);
});
