// v8 : Discord simplifié — classement unique, annonces de vote, /help filtré, commandes limitées à #commandes-bot.
const { fakeGuild } = require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const db = require('../src/utils/db');
const leaderboards = require('../src/utils/leaderboards');
const voteFeed = require('../src/utils/voteFeed');
const guide = require('../src/utils/guide');
const { helpPayload } = require('../src/commands/general/help');
const { loadCommands } = require('../src/utils/commands');
const { createServer } = require('../src/api/server');

const entries = (n) => Array.from({ length: n }, (_, i) => ({ uuid: `u${i}`, name: `Joueur${i}`, value: 100 - i }));

test('classement unique : top 5 par catégorie, catégories vides, niveaux Discord', () => {
  const state = { leaderboards: {
    votes: { boards: [{ key: 'month', entries: entries(8) }], updatedAt: 1_700_000_000_000 },
    piggywars: { boards: [{ key: 'wins', entries: entries(3) }, { key: 'kills', entries: entries(9) }] },
  } };
  const json = leaderboards.panelPayload(state, {}, [['111', { level: 12 }], ['222', { level: 9 }]], 'chanVotes').embeds[0].toJSON();
  assert.equal(json.title, leaderboards.PANEL_TITLE);
  assert.match(json.description, /<#chanVotes>/, 'renvoie vers #votes');
  const field = (re) => json.fields.find((f) => re.test(f.name));
  assert.equal(field(/Votes du mois/).value.split('\n').length, 5, 'top 5 seulement');
  assert.match(field(/Piggy Wars/).value, /Joueur0/, 'board « wins » choisi, pas « kills »');
  assert.equal(field(/Piggy Wars/).value.split('\n').length, 3);
  assert.match(field(/SumoGames/).value, /Personne pour le moment/);
  assert.match(field(/Niveaux Discord/).value, /<@111> — niveau \*\*12\*\*/);
  assert.equal(json.fields.length, 5, 'votes + 3 jeux + niveaux : un seul embed');
});

test('annonces de vote : validation, une ligne par vote, regroupement au-delà de 5, palier', () => {
  assert.equal(voteFeed.sanitize({ id: 'x', name: 'pas valide !' }), null);
  assert.equal(voteFeed.sanitize({ name: 'Steve' }), null, 'id obligatoire');
  const one = voteFeed.sanitize({ id: 'v1', name: 'Steve', site: 'Aevum Launcher', monthly: 3, milestone: 10 });
  const text = voteFeed.format([one]);
  assert.match(text, /\*\*Steve\*\* a voté sur \*\*Aevum Launcher\*\* · 3ᵉ vote ce mois-ci/);
  assert.match(text, /Palier de \*\*10 votes\*\*/);
  assert.match(voteFeed.format([{ ...one, monthly: 1, milestone: null }]), /1ᵉʳ vote/);

  const many = Array.from({ length: 7 }, (_, i) => ({ id: `v${i}`, name: `J${i}xx`, site: 'Aevum', monthly: 1 }));
  const grouped = voteFeed.format(many);
  assert.match(grouped, /7 nouveaux votes/);
  assert.equal(grouped.split('\n').length, 1, 'un seul message court');
});

test('annonces de vote : dédoublonnage par id (renvoi du proxy)', () => {
  db.guild('gv');
  assert.equal(voteFeed.enqueue(null, { id: 'vote:abc:1', name: 'Steve', site: 'Aevum' }).queued, true);
  assert.equal(voteFeed.enqueue(null, { id: 'vote:abc:1', name: 'Steve', site: 'Aevum' }).queued, false, 'déjà annoncé');
  assert.equal(voteFeed.enqueue(null, { id: 'x', name: '!' }).ok, false);
});

test('API : POST /api/votes protégé par le secret du pont', async () => {
  const server = createServer({ isReady: () => true, guilds: { cache: new Map() } }, 'un-secret-de-test-suffisamment-long');
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  const post = (auth, body) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ port, method: 'POST', path: '/api/votes', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) } }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(t) }));
    });
    req.on('error', reject);
    req.end(data);
  });
  try {
    assert.equal((await post(null, { id: 'v', name: 'Steve' })).status, 401);
    const ok = await post('un-secret-de-test-suffisamment-long', { id: 'vote:api:1', name: 'Steve', site: 'Aevum', monthly: 2 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.ok, true);
    assert.equal((await post('un-secret-de-test-suffisamment-long', { id: 'v2', name: '??' })).status, 400);
  } finally {
    server.close();
  }
});

test('/help : un joueur ne voit que ses commandes, le staff voit aussi la modération', () => {
  const commands = loadCommands();
  const player = { permissions: { has: () => false } };
  const staff = { permissions: { has: () => true } };
  const forPlayer = helpPayload(player, commands).embeds[0].toJSON();
  const all = JSON.stringify(forPlayer.fields);
  assert.ok(!/ban|setup|Modération/.test(all), 'aucune commande staff pour un joueur');
  for (const name of ['ip', 'vote', 'lier', 'compte', 'daily', 'niveau', 'top']) assert.match(all, new RegExp(`/${name}\\b`));
  const forStaff = JSON.stringify(helpPayload(staff, commands).embeds[0].toJSON().fields);
  assert.match(forStaff, /Modération/);
  assert.match(forStaff, /\/ban/);
});

test('commandes joueurs : toutes existent, tournois et doublons retirés', () => {
  const commands = loadCommands();
  for (const name of guide.PLAYER_COMMAND_NAMES) assert.ok(commands.has(name), `/${name} existe`);
  for (const removed of ['tournoi', 'status', 'jeux', 'lfg', 'invitations']) assert.ok(!commands.has(removed), `/${removed} retirée`);
  assert.ok(commands.get('ping').data.default_member_permissions, '/ping réservée au staff');
});

test('commandes limitées à #commandes-bot pour les joueurs (staff partout)', () => {
  const guild = fakeGuild('gc');
  const channel = { id: 'c-bot', toString: () => '<#c-bot>' };
  const player = { permissions: { has: () => false } };
  const staff = { permissions: { has: () => true } };
  // Avant /setup : pas de salon → aucune restriction
  assert.equal(guide.commandAllowed({ guild, member: player, channelId: 'ailleurs' }).ok, true);

  db.guild('gc').channels.botCommands = 'c-bot';
  guild.channels.cache.set('c-bot', channel);
  const refused = guide.commandAllowed({ guild, member: player, channelId: 'ailleurs' });
  assert.equal(refused.ok, false);
  assert.equal(String(refused.channel), '<#c-bot>');
  assert.equal(guide.commandAllowed({ guild, member: player, channelId: 'c-bot' }).ok, true);
  assert.equal(guide.commandAllowed({ guild, member: staff, channelId: 'ailleurs' }).ok, true);
});

test('panneaux du guide : liste des commandes et panneau #votes', () => {
  const commands = guide.commandsPayload().embeds[0].toJSON();
  assert.equal(commands.title, guide.COMMANDS_TITLE);
  assert.match(commands.description, /dans ce salon/);
  const votes = guide.votesPayload();
  assert.equal(votes.embeds[0].toJSON().title, guide.VOTES_TITLE);
  assert.ok(votes.embeds[0].toJSON().fields.some((f) => f.name.includes('Comment ça marche')));
  assert.ok(votes.components.length, 'boutons de vote');
});
