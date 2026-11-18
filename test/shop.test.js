// Boutique Tebex : catalogue (prix de network.json uniquement), webhook signé, idempotence, retraits.
require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const network = require('../src/utils/network');
const shop = require('../src/utils/shop');
const tebex = require('../src/utils/tebex');
const { createServer } = require('../src/api/server');

const SECRET_WEBHOOK = 'secret-webhook-de-test';
Object.assign(process.env, {
  TEBEX_PUBLIC_TOKEN: 'tok', TEBEX_WEBSTORE_ID: 'store', TEBEX_PRIVATE_KEY: 'key',
  TEBEX_WEBHOOK_SECRET: SECRET_WEBHOOK, TEBEX_DYNAMIC_CATEGORY: '123',
});

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const doc = {
  links: { site: 'https://mcbloc.fr' }, games: [], rules: [],
  shop: { open: true },
  ranks: [{ id: 'vip', name: 'VIP', priceMonthly: 4.99, priceLifetime: 19.99 }, { id: 'pirate', name: 'X', priceMonthly: -1, priceLifetime: 'gratuit' }],
  coinPacks: [{ id: 'coins-7000', name: 'Coffre', coins: 7000, bonus: 1000, price: 9.99 }, { id: 'coins-trop', name: 'Trop', coins: 5_000_000, bonus: 0, price: 9.99 }],
  boosters: [{ id: 'boost-combo-24h', name: 'Combo', effect: 'combo', seconds: 86400, price: 4.99 }, { id: 'boost-fly', name: 'Fly', effect: 'fly', seconds: 3600, price: 1 }],
};
const cfg = { links: {}, minecraft: {}, minigames: [] };
network.apply(cfg, doc);

const sign = (raw) => crypto.createHmac('sha256', SECRET_WEBHOOK).update(crypto.createHash('sha256').update(raw).digest('hex')).digest('hex');
const paid = (tx, extra = {}) => ({
  id: `wh-${tx}`, type: 'payment.completed',
  subject: {
    transaction_id: tx, customer: { username: { id: UUID.replace(/-/g, ''), username: 'Steve' } },
    products: [
      { id: 1, name: 'Grade VIP — 30 jours', quantity: 2, custom: { item: 'rank-vip-30j', uuid: UUID, name: 'Steve' } },
      { id: 2, name: 'Coffre — 8 000 pièces', quantity: 1 },
    ],
    ...extra,
  },
});

test('catalogue : seulement network.json, articles invalides jamais vendus', () => {
  const items = shop.catalog(cfg);
  assert.deepEqual([...items.keys()].sort(), ['boost-combo-24h', 'coins-7000', 'rank-vip-30j', 'rank-vip-vie']);
  assert.equal(items.get('rank-vip-30j').price, 4.99);
  assert.equal(items.get('coins-7000').amount, 8000, 'bonus compris');
  assert.equal(items.get('rank-vip-vie').maxQty, 1);
});

test('panier : un prix envoyé par le navigateur est ignoré, les ids inconnus refusés', () => {
  const ok = shop.checkLines([{ id: 'rank-vip-30j', qty: 1, price: 0.01 }, { id: 'rank-vip-vie', qty: 5 }], cfg);
  assert.equal(ok.lines[0].item.price, 4.99);
  assert.equal(ok.lines[1].qty, 1, 'grade à vie : quantité 1');
  assert.equal(shop.checkLines([{ id: 'boost-fly' }], cfg).error, 'invalid-item');
  assert.equal(shop.checkLines([{ id: 'coins-7000', qty: -3 }], cfg).error, 'invalid-item');
  assert.equal(shop.checkLines([], cfg).error, 'invalid-cart');
});

test('signature Tebex : HMAC du SHA-256 du corps, sinon refus', () => {
  const raw = Buffer.from('{"a":1}');
  assert.equal(tebex.validSignature(raw, sign(raw), SECRET_WEBHOOK), true);
  assert.equal(tebex.validSignature(Buffer.from('{"a":2}'), sign(raw), SECRET_WEBHOOK), false);
  assert.equal(tebex.validSignature(raw, 'zz', SECRET_WEBHOOK), false);
  assert.equal(tebex.validSignature(raw, sign(raw), ''), false);
});

test('IP : celle ajoutée par le proxy, pas celle inventée par l\'appelant', () => {
  const req = (h) => ({ headers: h, socket: {} });
  assert.equal(tebex.clientIp(req({ 'x-forwarded-for': '18.209.80.3, 6.6.6.6' })), '6.6.6.6');
  assert.equal(tebex.allowedIp(req({ 'x-forwarded-for': '6.6.6.6, 18.209.80.3' })), true);
  assert.equal(tebex.allowedIp(req({ 'x-real-ip': '1.2.3.4' })), false);
});

test('webhook : un article = une livraison, même si Tebex renvoie le message', () => {
  shop.reset();
  assert.deepEqual(shop.handleWebhook({ id: 'v', type: 'validation.webhook' }, cfg).reply, { id: 'v' });
  assert.equal(shop.handleWebhook(paid('tx1'), cfg).reply.queued, 3);
  assert.equal(shop.handleWebhook(paid('tx1'), cfg).reply.duplicate, true);
  assert.equal(shop.handleWebhook({ ...paid('tx1'), id: 'autre-id' }, cfg).reply.queued, 3, 'même transaction : mêmes ids');
  const pending = shop.pendingForBridge();
  assert.deepEqual(pending.map((r) => r.id), ['tebex:tx1:0-0', 'tebex:tx1:0-1', 'tebex:tx1:1-0']);
  assert.equal(pending[0].uuid, UUID);
  assert.deepEqual(pending[2].item, { kind: 'coins', target: 'coins', amount: 8000, id: 'coins-7000' }, 'reconnu par son nom');

  assert.equal(shop.acknowledge('tebex:tx1:0-0', true, 'ok').status, 'delivered');
  assert.equal(shop.acknowledge('tebex:tx1:0-0', false, 'x').status, 'delivered', 'ack idempotent');
  assert.equal(shop.acknowledge('invite:x', true), null, 'pas un achat');
});

test('remboursement : un retrait par article + alerte, jamais de doublon', () => {
  shop.reset();
  shop.handleWebhook(paid('tx2'), cfg);
  const refund = shop.handleWebhook({ id: 'r1', type: 'payment.refunded', subject: { transaction_id: 'tx2' } }, cfg);
  assert.equal(refund.reply.revoked, 3);
  assert.match(refund.alerts[0], /Remboursement/);
  shop.handleWebhook({ id: 'r2', type: 'payment.dispute.opened', subject: { transaction_id: 'tx2' } }, cfg);
  const revokes = shop.pendingForBridge().filter((r) => r.type === 'shop-revoke');
  assert.deepEqual(revokes.map((r) => r.of), ['tebex:tx1:0-0', 'tebex:tx1:0-1', 'tebex:tx1:1-0'].map((s) => s.replace('tx1', 'tx2')));
  assert.equal(revokes[0].id, 'tebex-revoke:tx2:0-0');

  const unknown = shop.handleWebhook({ id: 'r3', type: 'payment.refunded', subject: { transaction_id: 'inconnue' } }, cfg);
  assert.match(unknown.alerts[0], /introuvable/);
  const won = shop.handleWebhook({ id: 'r4', type: 'payment.dispute.won', subject: { transaction_id: 'tx2' } }, cfg);
  assert.match(won.alerts[0], /staff/);
});

test('boutique fermée : aucun panier', async () => {
  const closed = { ...cfg, shop: { ...cfg.shop, open: false } };
  assert.equal(shop.isOpen(closed), false);
  const result = await shop.startBasket({ username: 'Steve' }, { config: closed, fetch: async () => { throw new Error('aucun appel'); } });
  assert.equal(result.status, 403);
});

test('paiement : paquets créés au prix du catalogue', async () => {
  shop.reset();
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization });
    const reply = (status, json) => ({ ok: status < 400, status, text: async () => JSON.stringify(json), json: async () => json });
    if (url.startsWith('https://api.mojang.com')) return reply(200, { id: UUID.replace(/-/g, ''), name: 'Steve' });
    if (url.endsWith('/baskets') && init.method === 'POST') return reply(200, { data: { ident: 'b1', username: 'Steve' } });
    if (url.includes('/dynamic-packages')) return reply(200, { data: {} });
    if (url.includes('/categories/123')) return reply(200, { data: { packages: [{ id: 'dyn_34_10', name: 'Grade VIP — 30 jours' }] } });
    if (url.endsWith('/baskets/b1/packages')) return reply(200, { data: {} });
    if (url.endsWith('/baskets/b1')) return reply(200, { data: { links: { checkout: 'https://pay.tebex.io/b1' } } });
    return reply(404, {});
  };
  const started = await shop.startBasket({ username: 'Steve', ip: '1.2.3.4' }, { config: cfg, fetch: fakeFetch });
  assert.deepEqual(started.body, { basket: 'b1', player: 'Steve', auth: null });
  const done = await shop.checkout({ basket: 'b1', items: [{ id: 'rank-vip-30j', qty: 2, price: 0 }] }, { config: cfg, fetch: fakeFetch });
  assert.deepEqual(done.body, { checkout: 'https://pay.tebex.io/b1' });

  const dynamic = calls.find((c) => c.url.includes('/dynamic-packages'));
  assert.equal(dynamic.method, 'PUT');
  assert.equal(dynamic.body.packages[0].price, 4.99, 'prix de network.json');
  assert.equal(dynamic.body.packages[0].custom.uuid, UUID);
  assert.equal(dynamic.body.packages[0].slug, 'rank-vip-30j', 'slug obligatoire chez Tebex');
  assert.match(dynamic.auth, /^Basic /);
  assert.deepEqual(calls.find((c) => c.url.endsWith('/packages')).body, { package_id: 'dyn_34_10', quantity: 2 });
  assert.equal((await shop.checkout({ basket: 'b1', items: [{ id: 'rank-vip-30j' }] }, { config: cfg, fetch: fakeFetch })).status, 409, 'panier à usage unique');
});

test('API : webhook refusé sans IP Tebex ou sans signature', async (t) => {
  shop.reset();
  const client = { isReady: () => true, guilds: { cache: new Map() }, users: { fetch: async () => null } };
  const server = createServer(client, 'un-secret-de-test-suffisamment-long');
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/tebex/webhook`;
  const raw = JSON.stringify({ id: 'v1', type: 'validation.webhook' });
  const post = (headers) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: raw });

  assert.equal((await post({ 'X-Signature': sign(Buffer.from(raw)) })).status, 403, 'IP locale refusée');
  assert.equal((await post({ 'X-Real-IP': '18.209.80.3', 'X-Signature': 'a'.repeat(64) })).status, 403, 'mauvaise signature');
  const ok = await post({ 'X-Real-IP': '18.209.80.3', 'X-Signature': sign(Buffer.from(raw)) });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { id: 'v1' });
});
