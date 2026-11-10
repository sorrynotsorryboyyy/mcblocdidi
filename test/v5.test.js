// Pack « Lancement » : niveaux, daily, sondages, anti-raid, lancement, surveillance, sauvegardes,
// classements, sanctions en jeu, tickets, patch notes, routes API.
const { fakeGuild } = require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../config');
const db = require('../src/utils/db');

test('niveaux : courbe d\'XP et paliers', () => {
  const levels = require('../src/utils/levels');
  assert.equal(levels.xpForNext(0), 100);
  assert.deepEqual(levels.levelFromXp(0), { level: 0, current: 0, needed: 100 });
  assert.equal(levels.levelFromXp(99).level, 0);
  assert.equal(levels.levelFromXp(100).level, 1);
  assert.equal(levels.levelFromXp(100 + 155).level, 2); // 155 = xpForNext(1)
  assert.equal(levels.tierFor(4), null);
  assert.equal(levels.tierFor(5).role, 'level5');
  assert.equal(levels.tierFor(34).role, 'level20');
  assert.equal(levels.tierFor(99).role, 'level35');
  for (const t of config.levels.tiers) assert.ok(config.roles[t.role], `rôle ${t.role} absent de config.roles`);
});

test('niveaux : anti-spam des messages', () => {
  const { eligibleMessage } = require('../src/utils/levels');
  const guild = fakeGuild('lv');
  const msg = (content, extra = {}) => ({ guild, content, attachments: { size: 0 }, channel: { parentId: 'x', topic: null, ...extra } });
  const rec = { lastMsg: 0 };
  assert.equal(eligibleMessage(msg('salut tout le monde'), rec, 100_000), true);
  assert.equal(eligibleMessage(msg('ok'), rec, 100_000), false, 'trop court');
  assert.equal(eligibleMessage(msg('salut'), { lastMsg: 90_000 }, 100_000), false, 'cooldown');
  assert.equal(eligibleMessage(msg('salut', { topic: 'ticket-owner:1 | x' }), rec, 100_000), false, 'ticket');
});

test('daily : jour de Paris, série et montants', () => {
  const daily = require('../src/utils/daily');
  // 23h30 UTC le 31/12 = déjà le 1er janvier à Paris
  assert.equal(daily.today(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.equal(daily.daysBetween('2026-11-09', '2026-11-10'), 1);
  assert.equal(daily.amountFor(1), 100);
  assert.equal(daily.amountFor(2), 120);
  assert.equal(daily.amountFor(50), 200, 'bonus plafonné');

  const guild = fakeGuild('daily');
  const d1 = daily.claim(guild, 'u', new Date('2026-11-10T10:00:00Z'));
  assert.deepEqual([d1.ok, d1.streak, d1.amount], [true, 1, 100]);
  assert.equal(daily.claim(guild, 'u', new Date('2026-11-10T20:00:00Z')).ok, false, 'une fois par jour');
  assert.equal(daily.claim(guild, 'u', new Date('2026-11-11T08:00:00Z')).streak, 2);
  assert.equal(daily.claim(guild, 'u', new Date('2026-11-14T08:00:00Z')).streak, 1, 'série cassée');
  assert.ok(db.guild('daily').rewards['daily:u:2026-11-10'], 'récompense à id unique');
});

test('sondages : un vote par membre, modifiable, annulable', () => {
  const polls = require('../src/utils/polls');
  const poll = { id: 'p', question: 'Q ?', choices: ['A', 'B', 'C'], votes: {}, endsAt: null, ended: false };
  polls.vote(poll, 'u1', 0);
  polls.vote(poll, 'u2', 0);
  polls.vote(poll, 'u2', 1); // change d'avis
  assert.deepEqual(polls.tally(poll), [1, 1, 0]);
  assert.equal(polls.vote(poll, 'u1', 0), null, 're-cliquer retire le vote');
  assert.deepEqual(polls.tally(poll), [0, 1, 0]);
  polls.pollMessage(poll).components[0].toJSON();
  polls.pollMessage({ ...poll, ended: true, hideResults: true }).embeds[0].toJSON();
});

test('anti-raid : fenêtre glissante', () => {
  const { registerJoin } = require('../src/utils/antiraid');
  const opts = { joins: 3, windowSeconds: 10 };
  let list = [];
  let r;
  r = registerJoin(list, 0, opts); list = r.list; assert.equal(r.trigger, false);
  r = registerJoin(list, 11_000, opts); list = r.list; assert.equal(r.trigger, false, 'la 1re arrivée est sortie de la fenêtre');
  r = registerJoin(list, 12_000, opts); list = r.list; assert.equal(r.trigger, false);
  r = registerJoin(list, 13_000, opts); assert.equal(r.trigger, true);
});

test('lancement : date à l\'heure de Paris (hiver et été)', () => {
  const { parseDate } = require('../src/utils/launch');
  assert.equal(parseDate('20/12/2026 18:00'), Date.parse('2026-12-20T17:00:00Z')); // UTC+1
  assert.equal(parseDate('14/07/2027 21h30'), Date.parse('2027-07-14T19:30:00Z')); // UTC+2
  assert.equal(parseDate('31/02/2027 10:00'), null);
  assert.equal(parseDate('demain'), null);
  const guild = fakeGuild('launch');
  require('../src/utils/launch').panelPayload({ at: Date.now() + 1e6, status: 'scheduled', pioneers: ['a'], rewardCoins: 1000 }, guild).components[0].toJSON();
});

test('surveillance du pont : une seule alerte', () => {
  const { shouldAlert } = require('../src/utils/monitor');
  assert.equal(shouldAlert(null, false, 1e9, 5), false, 'jamais vu : pas d\'alerte');
  assert.equal(shouldAlert(0, false, 4 * 60_000, 5), false);
  assert.equal(shouldAlert(0, false, 6 * 60_000, 5), true);
  assert.equal(shouldAlert(0, true, 6 * 60_000, 5), false, 'déjà alerté');
});

test('sauvegardes : rotation des N plus récentes', () => {
  const { rotate } = require('../src/utils/backup');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcb-bk-'));
  for (const d of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) fs.writeFileSync(path.join(dir, `db-${d}.json`), '{}');
  fs.writeFileSync(path.join(dir, 'autre.txt'), 'x');
  assert.deepEqual(rotate(dir, 2), ['db-2026-11-02.json', 'db-2026-11-01.json']);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['autre.txt', 'db-2026-11-03.json', 'db-2026-11-04.json']);
});

test('classements : nettoyage des données du proxy et panneau', () => {
  const lb = require('../src/utils/leaderboards');
  const clean = lb.sanitize({ games: [{ server: 'PiggyWars', boards: [{ key: 'wins', title: '🏆 Victoires', entries: [
    { uuid: 'AAA', name: 'Steve', value: 12 }, { name: 'pas un pseudo !', value: 3 }, { name: 'Alex', value: 'NaN' },
  ] }] }, { pas: 'un jeu' }] });
  assert.deepEqual(Object.keys(clean), ['piggywars']);
  assert.deepEqual(clean.piggywars.boards[0].entries, [{ uuid: 'aaa', name: 'Steve', value: 12 }]);
  const game = config.minigames.find((g) => g.server === 'piggywars');
  const json = lb.panelPayload(game, clean.piggywars, { d1: { uuid: 'aaa', name: 'Steve' } }).embeds[0].toJSON();
  assert.equal(json.title, lb.title(game));
  assert.match(json.fields[0].value, /Steve\*\* 🔗/);
  assert.deepEqual(lb.sanitize(null), {});
});

test('sanctions en jeu : embed et dédoublonnage', () => {
  const gs = require('../src/utils/gameSanctions');
  const s = { action: 'create', id: 42, type: 'BAN', target: { uuid: 'u', name: 'Griefer' }, reason: 'Cheat', staff: 'Modo', expiresAt: null, server: 'piggywars' };
  const json = gs.embedFor(s, 'd1').toJSON();
  assert.match(json.title, /Bannissement/);
  assert.ok(json.fields.some((f) => f.value === '**Permanent**'));
  assert.equal(gs.dedupeKey(s), 'create:42');
  assert.notEqual(gs.dedupeKey({ ...s, action: 'revoke' }), gs.dedupeKey(s));
  gs.embedFor({ action: 'revoke', type: 'MUTE', target: { name: 'X' }, staff: 'Modo' }).toJSON();
});

test('tickets : statistiques', () => {
  const { computeStats } = require('../src/commands/moderation/tickets');
  const s = computeStats({
    a: { openedAt: 10, claimedBy: 's1', closedAt: 20, rating: 5 },
    b: { openedAt: 10, claimedBy: 's1', closedAt: 30, rating: 3 },
    c: { openedAt: 10, claimedBy: 's2', closedAt: null, rating: null },
    d: { openedAt: 10, claimedBy: null, closedAt: null, rating: null },
    old: { openedAt: 1, claimedBy: 's3', closedAt: 2, rating: 1 },
  }, 5);
  assert.equal(s.total, 4);
  assert.equal(s.open, 2);
  assert.equal(s.unclaimed, 1);
  assert.equal(s.average, 4);
  assert.deepEqual(s.staff.map((x) => [x.id, x.claimed, x.average]), [['s1', 2, 4], ['s2', 1, null]]);
});

test('patch notes : puces', () => {
  const { bullets } = require('../src/handlers/patchnote');
  assert.equal(bullets('Nouveau kit\n- Nouvelle map\n\n• Fix lag'), '• Nouveau kit\n• Nouvelle map\n• Fix lag');
});

test('API : classements et sanctions (auth + stockage)', async (t) => {
  const { createServer } = require('../src/api/server');
  const SECRET = 'secret-de-test-assez-long-pour-le-pont';
  const sent = [];
  const guild = fakeGuild('api5');
  db.guild('api5').channels.gameSanctions = 'chan';
  guild.channels.cache.set('chan', { send: async (p) => { sent.push(p); return {}; } });
  const client = { isReady: () => true, users: { fetch: async () => null }, guilds: { cache: new Map([['api5', guild]]) } };
  const server = createServer(client, SECRET);
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' };

  assert.equal((await fetch(`${url}/api/leaderboards`, { method: 'POST', body: '{}' })).status, 401);
  const lb = await fetch(`${url}/api/leaderboards`, { method: 'POST', headers, body: JSON.stringify({ games: [{ server: 'corewars', boards: [] }] }) });
  assert.deepEqual(await lb.json(), { ok: true, games: 1 });
  assert.ok(db.guild('api5').state.leaderboards.corewars);

  const body = JSON.stringify({ action: 'create', id: 7, type: 'MUTE', target: { uuid: 'x', name: 'Bob' }, reason: 'Spam', staff: 'Modo', expiresAt: Date.now() + 6e5 });
  assert.deepEqual(await (await fetch(`${url}/api/sanctions`, { method: 'POST', headers, body })).json(), { ok: true, posted: true });
  assert.deepEqual(await (await fetch(`${url}/api/sanctions`, { method: 'POST', headers, body })).json(), { ok: true, posted: false }, 'renvoi ignoré');
  assert.equal(sent.length, 1);
});
