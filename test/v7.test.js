// v7 : liaison du site (mcbloc.fr/compte) ↔ compte Minecraft via /site <code> en jeu.
require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const siteLinks = require('../src/utils/siteLinks');
const { createServer } = require('../src/api/server');

const SECRET = 'un-secret-de-test-suffisamment-long';
const UUID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER = '223e4567-e89b-12d3-a456-426614174000';

function call(port, method, path, { token, secret, body, ip = '1.1.1.1' } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { Origin: 'https://mcbloc.fr', 'X-Forwarded-For': ip };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (secret) headers.Authorization = `Bearer ${secret}`;
    if (data) headers['Content-Type'] = 'application/json';
    const req = http.request({ port, method, path, headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('liaison du site : code → /site en jeu → profil → délier', async () => {
  siteLinks._reset();
  const server = createServer({ isReady: () => true, guilds: { cache: new Map() } }, SECRET);
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  try {
    // 1. Le site demande un code
    const created = await call(port, 'POST', '/public/site-link/code');
    assert.equal(created.status, 200);
    assert.match(created.body.code, /^WEB-[A-Z2-9]{6}$/);
    assert.ok(created.body.token.length >= 40, 'jeton long et aléatoire');
    assert.equal(created.headers['cache-control'], 'no-store', 'données privées jamais en cache');
    assert.equal(created.headers['access-control-allow-origin'], 'https://mcbloc.fr');
    const { code, token } = created.body;

    assert.equal((await call(port, 'GET', '/public/site-link/status', { token })).body.status, 'pending');
    assert.equal((await call(port, 'GET', '/public/site-link/status', { token: 'faux' })).body.status, 'unknown');

    // 2. Le joueur tape /site <code> en jeu (route du pont, protégée)
    assert.equal((await call(port, 'POST', '/api/site-link', { body: { code, uuid: UUID, name: 'Steve' } })).status, 401);
    const redeemed = await call(port, 'POST', '/api/site-link', { secret: SECRET, body: { code: code.toLowerCase(), uuid: UUID, name: 'Steve' } });
    assert.deepEqual(redeemed.body, { ok: true, uuid: UUID });
    const again = await call(port, 'POST', '/api/site-link', { secret: SECRET, body: { code, uuid: UUID, name: 'Steve' } });
    assert.equal(again.body.error, 'invalid-code', 'code à usage unique');

    let st = (await call(port, 'GET', '/public/site-link/status', { token })).body;
    assert.equal(st.status, 'linked');
    assert.equal(st.account.name, 'Steve');
    assert.equal(st.account.profile, null, 'profil pas encore envoyé par le proxy');

    // 3. Le proxy envoie les profils des comptes liés (les autres sont ignorés)
    assert.deepEqual((await call(port, 'GET', '/api/site-profiles/wanted', { secret: SECRET })).body.uuids, [UUID]);
    const pushed = await call(port, 'POST', '/api/site-profiles', { secret: SECRET, body: { profiles: [
      { uuid: UUID, name: 'Steve', rank: { id: 'vip', name: 'VIP' }, coins: 1234, level: 7, stats: [{ game: 'Piggy Wars', wins: 3, elo: 1100 }] },
      { uuid: OTHER, name: 'Intrus', coins: 999999 },
    ] } });
    assert.equal(pushed.body.stored, 1);
    st = (await call(port, 'GET', '/public/site-link/status', { token })).body;
    assert.equal(st.account.profile.coins, 1234);
    assert.equal(st.account.profile.rank.name, 'VIP');
    assert.equal(st.account.profile.stats[0].elo, 1100);

    // 4. Délier
    assert.equal((await call(port, 'DELETE', '/public/site-link', { token })).body.ok, true);
    assert.equal((await call(port, 'GET', '/public/site-link/status', { token })).body.status, 'unknown');
    assert.deepEqual(siteLinks.wantedUuids(), [], 'plus de profil demandé après déliaison');
  } finally {
    server.close();
  }
});

test('liaison du site : code expiré, joueur invalide, limite par IP', async () => {
  siteLinks._reset();
  const { code } = siteLinks.createCode(1000);
  assert.equal(siteLinks.redeem(code, 'pas-un-uuid', 'Steve').error, 'invalid-player');
  assert.equal(siteLinks.redeem(code, UUID, 'Steve', 1000 + 11 * 60 * 1000).error, 'invalid-code', 'expiré après 10 min');

  const server = createServer({ isReady: () => true, guilds: { cache: new Map() } }, SECRET);
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await call(port, 'POST', '/public/site-link/code', { ip: '9.9.9.9' })).status, 200);
    assert.equal((await call(port, 'POST', '/public/site-link/code', { ip: '9.9.9.9' })).status, 429, '6e code en 10 min refusé');
    assert.equal((await call(port, 'POST', '/public/site-link/code', { ip: '8.8.8.8' })).status, 200, 'autre IP : autorisée');
    const pre = await call(port, 'OPTIONS', '/public/site-link/status');
    assert.equal(pre.status, 204);
    assert.match(pre.headers['access-control-allow-headers'], /Authorization/);
  } finally {
    server.close();
  }
});
