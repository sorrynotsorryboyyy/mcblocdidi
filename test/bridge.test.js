// Liaison de compte, file de récompenses et API HTTP du pont Minecraft.
const { fakeGuild } = require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/utils/db');
const links = require('../src/utils/links');
const rewards = require('../src/utils/rewards');
const { createServer } = require('../src/api/server');

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const SECRET = 'un-secret-de-test-suffisamment-long';
const guild = fakeGuild('g1');
const client = {
  isReady: () => true,
  users: { fetch: async () => ({ tag: 'Joueur#0001', send: async () => null }) },
  guilds: { cache: new Map() },
};

test('liaison : code à usage unique, expiration, compte déjà lié', () => {
  const { code } = links.createCode('g1', 'd1');
  assert.match(code, /^MCB-[A-Z2-9]{6}$/);
  assert.equal(links.redeemCode(code, 'pas-un-uuid', 'Steve').error, 'invalid-player');
  assert.deepEqual(links.redeemCode(code.toLowerCase(), UUID, 'Steve'), { ok: true, guildId: 'g1', discordId: 'd1' });
  assert.equal(links.redeemCode(code, UUID, 'Steve').error, 'invalid-code', 'usage unique');
  assert.equal(links.linkOf('g1', 'd1').name, 'Steve');

  // Le même compte Minecraft ne peut pas être lié à un 2e compte Discord
  const other = links.createCode('g1', 'd2').code;
  assert.equal(links.redeemCode(other, UUID, 'Steve').error, 'already-linked');

  // Code expiré
  const exp = links.createCode('g1', 'd3').code;
  db.guild('g1').linkCodes[exp].expiresAt = Date.now() - 1;
  assert.equal(links.redeemCode(exp, '223e4567-e89b-12d3-a456-426614174000', 'Alex').error, 'invalid-code');
});

test('récompenses : idempotentes, livrées seulement si le compte est lié', async () => {
  assert.equal(rewards.queueReward(guild, 'invite:x', 'd1', { type: 'coins', amount: 500, label: '500 pièces' }), true);
  assert.equal(rewards.queueReward(guild, 'invite:x', 'd1', { type: 'coins', amount: 500, label: '500 pièces' }), false, 'pas de doublon');
  rewards.queueReward(guild, 'boost:y', 'nonlie', { type: 'vip', months: 1, rank: 'vip', label: '1 mois' });

  const pending = rewards.pendingForBridge();
  assert.deepEqual(pending.map((r) => r.id), ['invite:x'], 'membre non lié = en attente');
  assert.equal(pending[0].uuid, UUID);

  assert.equal((await rewards.acknowledge(client, 'invite:x', true, 'ok')).status, 'delivered');
  assert.equal((await rewards.acknowledge(client, 'invite:x', true, 'ok')).status, 'delivered', 'ack idempotent');
  assert.equal(rewards.pendingForBridge().length, 0);
  assert.equal((await rewards.acknowledge(client, 'inconnue', true)).found, false);
});

test('API : authentification et routes', async (t) => {
  const server = createServer(client, SECRET);
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' };

  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.equal((await fetch(`${url}/api/rewards/pending`)).status, 401, 'sans secret');
  assert.equal((await fetch(`${url}/api/rewards/pending`, { headers: { Authorization: 'Bearer faux' } })).status, 401);

  rewards.queueReward(guild, 'invite:api', 'd1', { type: 'coins', amount: 500, label: '500 pièces' });
  const list = await (await fetch(`${url}/api/rewards/pending`, { headers: auth })).json();
  assert.deepEqual(list.rewards.map((r) => r.id), ['invite:api']);

  const ack = await fetch(`${url}/api/rewards/${encodeURIComponent('invite:api')}/ack`, { method: 'POST', headers: auth, body: JSON.stringify({ ok: true }) });
  assert.equal((await ack.json()).status, 'delivered');

  const { code } = links.createCode('g1', 'd9');
  const linked = await (await fetch(`${url}/api/link`, {
    method: 'POST', headers: auth, body: JSON.stringify({ code, uuid: '323e4567-e89b-12d3-a456-426614174000', name: 'Alex' }),
  })).json();
  assert.deepEqual(linked, { ok: true, discord: 'Joueur#0001' });

  assert.equal((await fetch(`${url}/api/link`, { method: 'POST', headers: auth, body: '{pas du json' })).status, 400);
  assert.equal((await fetch(`${url}/api/inconnu`, { headers: auth })).status, 404);
});

test('API désactivée sans secret', async (t) => {
  const server = createServer(client, null);
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/rewards/pending`, { headers: { Authorization: 'Bearer x' } });
  assert.equal(res.status, 503);
});
