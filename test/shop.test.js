// Boutique Stripe : catalogue (prix de network.json uniquement), webhook signé, montant contrôlé, idempotence, retraits.
require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const network = require('../src/utils/network');
const shop = require('../src/utils/shop');
const stripe = require('../src/utils/stripe');
const { createServer } = require('../src/api/server');

const WHSEC = 'whsec_secret_de_test';
Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_abc123', STRIPE_WEBHOOK_SECRET: WHSEC });

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

const reply = (status, json) => ({ ok: status < 400, status, text: async () => JSON.stringify(json), json: async () => json });

/** Faux Stripe + faux Mojang ; garde les appels pour les vérifier. */
function fakeApis(sessionId = 'cs_test_1') {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.startsWith('https://api.mojang.com')) return url.endsWith('/Inconnu') ? reply(404, {}) : reply(200, { id: UUID.replace(/-/g, ''), name: 'Steve' });
    if (url === 'https://api.stripe.com/v1/checkout/sessions') return reply(200, { id: sessionId, url: `https://checkout.stripe.com/c/pay/${sessionId}` });
    return reply(404, {});
  };
  return { calls, fetch };
}

const event = (id, type, object) => ({ id, type, data: { object } });
const completed = (id, session, total, extra = {}) => event(id, 'checkout.session.completed',
  { id: session, payment_status: 'paid', amount_total: total, currency: 'eur', payment_intent: 'pi_1', ...extra });

/** Ouvre une session : 2 × VIP 30 jours (9,98 €) + 1 pack de pièces (9,99 €) = 1997 centimes. */
async function openSession(sessionId = 'cs_test_1') {
  const apis = fakeApis(sessionId);
  const result = await shop.checkout({ username: 'Steve', items: [{ id: 'rank-vip-30j', qty: 2, price: 0.01 }, { id: 'coins-7000' }] },
    { config: cfg, fetch: apis.fetch });
  return { result, apis };
}

test('catalogue : seulement network.json, articles invalides jamais vendus', () => {
  const items = shop.catalog(cfg);
  assert.deepEqual([...items.keys()].sort(), ['boost-combo-24h', 'coins-7000', 'rank-vip-30j', 'rank-vip-vie']);
  assert.equal(items.get('rank-vip-30j').price, 4.99);
  assert.equal(items.get('coins-7000').amount, 8000, 'bonus compris');
  assert.equal(items.get('rank-vip-vie').maxQty, 1);
});

test('panier : prix du navigateur ignoré, ids inconnus et quantités invalides refusés', () => {
  const ok = shop.checkLines([{ id: 'rank-vip-30j', qty: 1, price: 0.01 }, { id: 'rank-vip-vie', qty: 5 }], cfg);
  assert.equal(ok.lines[0].item.price, 4.99);
  assert.equal(ok.lines[1].qty, 1, 'grade à vie : quantité 1');
  assert.equal(shop.checkLines([{ id: 'boost-fly' }], cfg).error, 'invalid-item');
  assert.equal(shop.checkLines([{ id: 'coins-7000', qty: -3 }], cfg).error, 'invalid-item');
  assert.equal(shop.checkLines([], cfg).error, 'invalid-cart');
});

test('signature Stripe : HMAC de « t.corps », récente, sinon refus', () => {
  const raw = Buffer.from('{"a":1}');
  const now = Date.now();
  const t = Math.floor(now / 1000);
  const sig = (body, ts = t, secret = WHSEC) => `t=${ts},v1=${crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
  assert.equal(stripe.validSignature(raw, sig(raw), WHSEC, now), true);
  assert.equal(stripe.validSignature(raw, `${sig(raw)},v1=${'0'.repeat(64)}`, WHSEC, now), true, 'plusieurs v1 acceptés');
  assert.equal(stripe.validSignature(Buffer.from('{"a":2}'), sig(raw), WHSEC, now), false, 'corps modifié');
  assert.equal(stripe.validSignature(raw, sig(raw, t - 600), WHSEC, now), false, 'trop vieux (rejeu)');
  assert.equal(stripe.validSignature(raw, sig(raw, t, 'autre'), WHSEC, now), false, 'mauvais secret');
  assert.equal(stripe.validSignature(raw, 'n-importe-quoi', WHSEC, now), false);
});

test('session : prix du catalogue envoyés à Stripe, en centimes, pseudo vérifié', async () => {
  shop.reset();
  const { result, apis } = await openSession();
  assert.deepEqual(result.body, { checkout: 'https://checkout.stripe.com/c/pay/cs_test_1', player: 'Steve' });
  const call = apis.calls.find((c) => c.url.includes('stripe.com'));
  const form = new URLSearchParams(call.init.body);
  assert.equal(form.get('line_items[0][price_data][unit_amount]'), '499', 'prix de network.json, pas 0,01');
  assert.equal(form.get('line_items[0][quantity]'), '2');
  assert.equal(form.get('line_items[1][price_data][unit_amount]'), '999');
  assert.equal(form.get('metadata[uuid]'), UUID);
  assert.equal(form.get('payment_method_types[0]'), null, 'moyens de paiement choisis dans le tableau de bord Stripe');
  assert.equal(form.get('managed_payments[enabled]'), 'false', 'la micro-entreprise reste le vendeur');
  assert.equal(call.init.headers.Authorization, 'Bearer sk_test_abc123');

  const unknown = await shop.checkout({ username: 'Inconnu', items: [{ id: 'coins-7000' }] }, { config: cfg, fetch: fakeApis().fetch });
  assert.equal(unknown.body.error, 'invalid-player');
});

test('webhook payé : une livraison par article, même si Stripe renvoie l\'événement', async () => {
  shop.reset();
  await openSession();
  const first = shop.handleWebhook(completed('evt_1', 'cs_test_1', 1997));
  assert.equal(first.reply.queued, 3);
  const { items, ...paid } = first.paid;
  assert.deepEqual(paid, { name: 'Steve', count: 3, tx: 'pi_1' });
  assert.equal(items.length, 2, 'une ligne par article pour #achats-boutique');
  assert.match(items[0], /^2× Grade .+30 jours$/);
  assert.match(items[1], /pièces$/);
  assert.ok(items.every((i) => !/€|\d+[.,]\d{2}\b/.test(i)), 'jamais de prix dans l\'annonce publique');
  assert.equal(shop.handleWebhook(completed('evt_1', 'cs_test_1', 1997)).reply.duplicate, true, 'même événement');
  assert.equal(shop.handleWebhook(completed('evt_2', 'cs_test_1', 1997)).reply.queued, 3, 'autre événement, mêmes ids');
  const pending = shop.pendingForBridge();
  assert.deepEqual(pending.map((r) => r.id), ['shop:pi_1:0-0', 'shop:pi_1:0-1', 'shop:pi_1:1-0']);
  assert.equal(pending[0].uuid, UUID);
  assert.deepEqual(pending[2].item, { kind: 'coins', target: 'coins', amount: 8000, id: 'coins-7000' });

  assert.equal(shop.acknowledge('shop:pi_1:0-0', true, 'ok').status, 'delivered');
  assert.equal(shop.acknowledge('shop:pi_1:0-0', false, 'x').status, 'delivered', 'ack idempotent');
  assert.equal(shop.acknowledge('invite:x', true), null, 'pas un achat');
});

test('webhook payé : montant différent ou session inconnue = rien de livré + alerte', async () => {
  shop.reset();
  await openSession();
  const wrong = shop.handleWebhook(completed('evt_a', 'cs_test_1', 100));
  assert.equal(wrong.reply.queued, 0);
  assert.match(wrong.alerts[0], /montant/);
  const ghost = shop.handleWebhook(completed('evt_b', 'cs_inconnue', 1997));
  assert.match(ghost.alerts[0], /inconnue/);
  const unpaid = shop.handleWebhook(completed('evt_c', 'cs_test_1', 1997, { payment_status: 'unpaid' }));
  assert.equal(unpaid.reply.waiting, true, 'paiement différé : on attend');
  assert.equal(shop.pendingForBridge().length, 0);
  assert.equal(shop.handleWebhook(event('evt_d', 'checkout.session.async_payment_succeeded',
    { id: 'cs_test_1', payment_status: 'paid', amount_total: 1997, currency: 'eur', payment_intent: 'pi_1' })).reply.queued, 3);
});

test('remboursement et litige : un retrait par article + alerte, jamais de doublon', async () => {
  shop.reset();
  await openSession();
  shop.handleWebhook(completed('evt_1', 'cs_test_1', 1997));
  const refund = shop.handleWebhook(event('evt_r', 'charge.refunded', { id: 'ch_1', payment_intent: 'pi_1', amount: 1997, amount_refunded: 500 }));
  assert.equal(refund.reply.revoked, 3);
  assert.match(refund.alerts[0], /Remboursement.*partiel/s);
  shop.handleWebhook(event('evt_l', 'charge.dispute.created', { id: 'dp_1', payment_intent: 'pi_1' }));
  const revokes = shop.pendingForBridge().filter((r) => r.type === 'shop-revoke');
  assert.deepEqual(revokes.map((r) => r.id), ['shop-revoke:pi_1:0-0', 'shop-revoke:pi_1:0-1', 'shop-revoke:pi_1:1-0']);
  assert.equal(revokes[0].of, 'shop:pi_1:0-0');
  const closed = shop.handleWebhook(event('evt_c', 'charge.dispute.closed', { id: 'dp_1', status: 'won' }));
  assert.match(closed.alerts[0], /staff/);
});

test('retrait reçu avant la confirmation du paiement : appliqué dès qu\'elle arrive', async () => {
  shop.reset();
  await openSession('cs_test_2');
  const early = shop.handleWebhook(event('evt_r', 'charge.refunded', { id: 'ch_9', payment_intent: 'pi_1', amount: 1997, amount_refunded: 1997 }));
  assert.equal(early.reply.revoked, 0);
  shop.handleWebhook(completed('evt_p', 'cs_test_2', 1997));
  const ids = shop.pendingForBridge().map((r) => r.id);
  assert.ok(ids.includes('shop:pi_1:0-0') && ids.includes('shop-revoke:pi_1:0-0'), 'livraison puis retrait (le proxy annule)');
});

test('boutique fermée : aucune session', async () => {
  const closed = { ...cfg, shop: { ...cfg.shop, open: false } };
  assert.equal(shop.isOpen(closed), false);
  const result = await shop.checkout({ username: 'Steve', items: [{ id: 'coins-7000' }] },
    { config: closed, fetch: async () => { throw new Error('aucun appel'); } });
  assert.equal(result.status, 403);
});

test('API : webhook refusé sans signature valide', async (t) => {
  shop.reset();
  const client = { isReady: () => true, guilds: { cache: new Map() }, users: { fetch: async () => null } };
  const server = createServer(client, 'un-secret-de-test-suffisamment-long');
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/stripe/webhook`;
  const raw = JSON.stringify(event('evt_x', 'charge.dispute.closed', { id: 'dp_x', status: 'won' }));
  const ts = Math.floor(Date.now() / 1000);
  const good = `t=${ts},v1=${crypto.createHmac('sha256', WHSEC).update(`${ts}.${raw}`).digest('hex')}`;
  const post = (signature) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature ? { 'Stripe-Signature': signature } : {}) }, body: raw });

  assert.equal((await post(null)).status, 400, 'sans signature');
  assert.equal((await post(`t=${ts},v1=${'a'.repeat(64)}`)).status, 400, 'fausse signature');
  const ok = await post(good);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).ok, true);
});
