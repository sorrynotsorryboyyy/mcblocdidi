// Boutique mcbloc.fr → paiement Tebex → livraison en jeu par le proxy.
//
//  1. POST /public/shop/basket   { username }                → panier Tebex (+ lien de connexion Tebex si demandé)
//  2. POST /public/shop/checkout { basket, items:[{id,qty}] } → paquets créés AU PRIX de network.json → lien de paiement
//  3. POST /tebex/webhook (IP Tebex + signature)             → achats en attente, identifiants fixes tebex:<tx>:<n>-<k>
//  4. Le proxy récupère les achats avec les récompenses (/api/rewards/pending), livre une seule fois, puis accuse réception.
//
// Remboursement / litige : retrait (tebex-revoke:…) de chaque achat de la transaction + alerte dans #logs. Jamais de ban.
// Stockage : $DATA_DIR/shop.json.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../../config');
const tebex = require('./tebex');

const FILE = path.join(process.env.DATA_DIR || './data', 'shop.json');
const NAME_RE = /^\w{3,16}$/;
const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const MAX_TRIES = 20;
const MAX_LINES = 10;
const MAX_QTY = 12;
const BASKET_TTL_MS = 6 * 3600 * 1000;
// Mêmes bornes que ShopRepository.Item (proxy) : un article hors bornes n'est jamais vendu.
const LIMITS = { rankDays: 366, coins: 1_000_000, boosterMin: 60, boosterMax: 7 * 24 * 3600 };
const BOOSTER_EFFECTS = ['coins', 'xp', 'combo', 'network'];

let data = null;

function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { data = {}; }
  data.baskets ??= {};      // ident → { uuid, name, createdAt, checkedOut }
  data.rewards ??= {};      // id → { id, type: 'shop'|'shop-revoke', uuid, name, tx, label, item?, of?, status, tries }
  data.transactions ??= {}; // tx → { uuid, name, rewardIds, status, at }
  data.webhooks ??= {};     // id du webhook → date (anti-rejeu)
  return data;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

/** Pour les tests : repart d'un fichier vide. */
function reset() {
  data = null;
  try { fs.rmSync(FILE); } catch {}
}

// ------------------------------------------------------------------ catalogue (source : network.json)

const price = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0.5 && v <= 500 ? Math.round(v * 100) / 100 : null);
const formatDuration = (s) => (s % 3600 === 0 ? `${s / 3600} h` : `${Math.round(s / 60)} min`);

/**
 * Articles vendus, calculés depuis la config (network.json) : id → { id, name, price, kind, target, amount, maxQty }.
 * Tout article invalide est simplement ignoré (jamais vendu).
 */
function catalog(cfg = config) {
  const shop = cfg.shop ?? {};
  const items = new Map();
  for (const r of shop.ranks ?? []) {
    if (!/^[a-z0-9_-]{1,32}$/.test(r?.id ?? '')) continue;
    const monthly = price(r.priceMonthly);
    const lifetime = price(r.priceLifetime);
    if (monthly) items.set(`rank-${r.id}-30j`, { id: `rank-${r.id}-30j`, name: `Grade ${r.name} — 30 jours`, price: monthly, kind: 'rank_days', target: r.id, amount: 30, maxQty: 12 });
    if (lifetime) items.set(`rank-${r.id}-vie`, { id: `rank-${r.id}-vie`, name: `Grade ${r.name} — à vie`, price: lifetime, kind: 'rank_life', target: r.id, amount: 0, maxQty: 1 });
  }
  for (const p of shop.coinPacks ?? []) {
    const total = Number(p?.coins) + Number(p?.bonus ?? 0);
    if (!/^[a-z0-9_-]{1,40}$/.test(p?.id ?? '') || !price(p.price) || !Number.isInteger(total) || total < 1 || total > LIMITS.coins) continue;
    items.set(p.id, { id: p.id, name: `${p.name} — ${String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} pièces`, price: price(p.price), kind: 'coins', target: 'coins', amount: total, maxQty: MAX_QTY });
  }
  for (const b of shop.boosters ?? []) {
    const seconds = Number(b?.seconds);
    if (!/^[a-z0-9_-]{1,40}$/.test(b?.id ?? '') || !price(b.price) || !BOOSTER_EFFECTS.includes(b.effect)
      || !Number.isInteger(seconds) || seconds < LIMITS.boosterMin || seconds > LIMITS.boosterMax) continue;
    items.set(b.id, { id: b.id, name: b.name || `Booster ${b.effect} ${formatDuration(seconds)}`, price: price(b.price), kind: 'booster', target: b.effect, amount: seconds, maxQty: MAX_QTY });
  }
  return items;
}

const isOpen = (cfg = config) => cfg.shop?.open === true && tebex.configured();

/** Vérifie le panier envoyé par le navigateur : seulement des identifiants connus et des quantités bornées. */
function checkLines(lines, cfg = config) {
  const items = catalog(cfg);
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) return { error: 'invalid-cart' };
  const merged = new Map();
  for (const line of lines) {
    const item = items.get(String(line?.id ?? ''));
    const qty = Number(line?.qty ?? 1);
    if (!item || !Number.isInteger(qty) || qty < 1) return { error: 'invalid-item' };
    merged.set(item.id, Math.min(item.maxQty, (merged.get(item.id) ?? 0) + qty));
  }
  return { lines: [...merged].map(([id, qty]) => ({ item: items.get(id), qty })) };
}

// ------------------------------------------------------------------ pseudo Minecraft → UUID

const dashed = (u) => {
  const hex = String(u).replace(/-/g, '').toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** Compte Mojang du pseudo (null s'il n'existe pas). */
async function resolvePlayer(username, fetchImpl = globalThis.fetch) {
  if (!NAME_RE.test(username ?? '')) return null;
  const res = await fetchImpl(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`,
    { signal: globalThis.AbortSignal.timeout(10_000), headers: { 'User-Agent': 'mcblocdidi' } });
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) throw new Error(`Mojang ${res.status}`);
  const json = await res.json();
  return json?.id && UUID_RE.test(json.id) ? { uuid: dashed(json.id), name: json.name } : null;
}

// ------------------------------------------------------------------ parcours d'achat (routes publiques)

function siteUrl(cfg = config) {
  return String(cfg.links?.site ?? 'https://mcbloc.fr').replace(/\/+$/, '');
}

function prune(now = Date.now()) {
  const d = load();
  for (const [ident, b] of Object.entries(d.baskets)) if (now - b.createdAt > BASKET_TTL_MS) delete d.baskets[ident];
  for (const [id, at] of Object.entries(d.webhooks)) if (now - at > 30 * 24 * 3600 * 1000) delete d.webhooks[id];
}

/** Étape 1 : panier Tebex pour ce pseudo. */
async function startBasket({ username, ip }, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (!isOpen(deps.config ?? config)) return { status: 403, body: { error: 'shop-closed' } };
  const player = await resolvePlayer(username, fetchImpl);
  if (!player) return { status: 400, body: { error: 'invalid-player' } };
  const site = siteUrl(deps.config ?? config);
  const basket = await tebex.createBasket({
    username: player.name, ip,
    completeUrl: `${site}/boutique/merci`, cancelUrl: `${site}/boutique/panier`,
    custom: { uuid: player.uuid, username: player.name },
  }, fetchImpl);
  const d = load();
  prune();
  d.baskets[basket.ident] = { uuid: player.uuid, name: player.name, createdAt: Date.now() };
  save();
  let auth = null;
  if (!basket.username) { // la boutique demande la connexion du joueur à Tebex
    const links = await tebex.authLinks(basket.ident, `${site}/boutique/paiement?basket=${encodeURIComponent(basket.ident)}`, fetchImpl);
    auth = Array.isArray(links) ? links[0]?.url ?? null : null;
  }
  return { status: 200, body: { basket: basket.ident, player: player.name, auth } };
}

/** Étape 2 : articles ajoutés au panier, aux prix de network.json, puis lien de paiement. */
async function checkout({ basket, items }, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const cfg = deps.config ?? config;
  if (!isOpen(cfg)) return { status: 403, body: { error: 'shop-closed' } };
  const known = load().baskets[String(basket ?? '')];
  if (!known) return { status: 404, body: { error: 'unknown-basket' } };
  if (known.checkedOut) return { status: 409, body: { error: 'basket-used' } };
  const checked = checkLines(items, cfg);
  if (checked.error) return { status: 400, body: { error: checked.error } };

  const packages = checked.lines.map(({ item }) => ({
    name: item.name,
    price: item.price,
    custom: { item: item.id, kind: item.kind, target: item.target, amount: item.amount, uuid: known.uuid, name: known.name },
  }));
  await tebex.setDynamicPackages(basket, known.name, packages, fetchImpl);
  const available = await tebex.categoryPackages(basket, fetchImpl);
  for (const { item, qty } of checked.lines) {
    const pkg = available.find((p) => p?.name === item.name);
    if (!pkg) throw new Error(`paquet dynamique introuvable : ${item.name}`);
    await tebex.addPackage(basket, pkg.id, qty, fetchImpl);
  }
  known.checkedOut = Date.now();
  save();
  const full = await tebex.getBasket(basket, fetchImpl);
  const link = full?.links?.checkout;
  if (!link) throw new Error('lien de paiement Tebex absent');
  return { status: 200, body: { checkout: link } };
}

// ------------------------------------------------------------------ webhook Tebex

const REVOKE_EVENTS = ['payment.refunded', 'payment.dispute.opened', 'payment.dispute.lost'];
const INFO_EVENTS = ['payment.dispute.won', 'payment.dispute.closed'];

/** Article d'un produit payé : données jointes au paquet, sinon nom (paquets dynamiques), jamais le prix payé. */
function itemOf(product, items) {
  const custom = typeof product?.custom === 'string' ? safeJson(product.custom) : product?.custom;
  if (custom?.item && items.has(custom.item)) return { item: items.get(custom.item), custom };
  const byName = [...items.values()].find((i) => i.name === product?.name);
  return byName ? { item: byName, custom } : { item: null, custom };
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function buyerOf(subject, product, custom) {
  const candidates = [custom?.uuid, product?.username?.id, subject?.customer?.username?.id];
  const uuid = candidates.find((u) => typeof u === 'string' && UUID_RE.test(u));
  const name = [custom?.name, product?.username?.username, subject?.customer?.username?.username]
    .find((n) => typeof n === 'string' && NAME_RE.test(n)) ?? '';
  return uuid ? { uuid: dashed(uuid), name } : null;
}

/**
 * Traite un webhook déjà authentifié (IP + signature vérifiées par l'appelant).
 * @returns {{ reply: object, alerts: string[] }} réponse HTTP et alertes à envoyer au staff
 */
function handleWebhook(body, cfg = config) {
  const d = load();
  if (body?.type === 'validation.webhook') return { reply: { id: body.id }, alerts: [] };
  const alerts = [];
  if (body?.id && d.webhooks[body.id]) return { reply: { ok: true, duplicate: true }, alerts };
  if (body?.id) d.webhooks[body.id] = Date.now();
  const subject = body?.subject ?? {};
  const tx = String(subject.transaction_id ?? '');
  if (!/^[\w-]{1,64}$/.test(tx)) {
    save();
    return { reply: { ok: true, ignored: 'no-transaction' }, alerts };
  }

  if (body.type === 'payment.completed') {
    const items = catalog(cfg);
    const products = Array.isArray(subject.products) ? subject.products : [];
    const record = d.transactions[tx] ?? { rewardIds: [], at: Date.now(), status: 'paid' };
    products.forEach((product, n) => {
      const { item, custom } = itemOf(product, items);
      const buyer = buyerOf(subject, product, custom);
      if (!item || !buyer) {
        alerts.push(`⚠️ Achat **${tx}** : article « ${product?.name ?? '?'} » non reconnu ou joueur inconnu — à livrer à la main.`);
        return;
      }
      const qty = Math.min(MAX_QTY, Math.max(1, Number(product.quantity) || 1));
      for (let k = 0; k < qty; k += 1) {
        const id = `tebex:${tx}:${n}-${k}`;
        if (!d.rewards[id]) {
          d.rewards[id] = {
            id, type: 'shop', uuid: buyer.uuid, name: buyer.name, tx, label: item.name,
            item: { kind: item.kind, target: item.target, amount: item.amount, id: item.id }, status: 'pending', tries: 0, createdAt: Date.now(),
          };
        }
        if (!record.rewardIds.includes(id)) record.rewardIds.push(id);
        record.uuid = buyer.uuid;
        record.name = buyer.name;
      }
    });
    d.transactions[tx] = record;
    save();
    return { reply: { ok: true, queued: record.rewardIds.length }, alerts };
  }

  if (REVOKE_EVENTS.includes(body.type)) {
    const record = d.transactions[tx];
    let ids = record?.rewardIds ?? [];
    if (!ids.length) { // remboursement reçu avant l'achat : on bloque d'avance chaque article du paiement
      const products = Array.isArray(subject.products) ? subject.products : [];
      ids = products.flatMap((p, n) => Array.from({ length: Math.min(MAX_QTY, Math.max(1, Number(p.quantity) || 1)) }, (_, k) => `tebex:${tx}:${n}-${k}`));
    }
    const buyer = record?.uuid ? { uuid: record.uuid, name: record.name } : buyerOf(subject, null, null);
    if (!buyer || !ids.length) {
      alerts.push(`🚨 **${body.type}** sur **${tx}** : achat introuvable, rien n'a pu être retiré automatiquement.`);
      save();
      return { reply: { ok: true, revoked: 0 }, alerts };
    }
    for (const of of ids) {
      const id = `tebex-revoke:${of.slice('tebex:'.length)}`;
      d.rewards[id] ??= { id, type: 'shop-revoke', of, uuid: buyer.uuid, name: buyer.name, tx, label: `Retrait ${of}`, status: 'pending', tries: 0, createdAt: Date.now() };
    }
    d.transactions[tx] = { ...(record ?? { rewardIds: [], at: Date.now() }), uuid: buyer.uuid, name: buyer.name, status: body.type };
    alerts.push(`🚨 **${body.type === 'payment.refunded' ? 'Remboursement' : 'Litige (chargeback)'}** — ${buyer.name || buyer.uuid} · transaction **${tx}** : ${ids.length} article(s) retiré(s) automatiquement. Aucune sanction automatique.`);
    save();
    return { reply: { ok: true, revoked: ids.length }, alerts };
  }

  if (INFO_EVENTS.includes(body.type)) {
    alerts.push(`ℹ️ **${body.type}** sur la transaction **${tx}**. Rien n'a été rendu automatiquement : à décider par le staff.`);
  }
  save();
  return { reply: { ok: true }, alerts };
}

// ------------------------------------------------------------------ file pour le proxy

/** Achats et retraits à livrer (même file que les récompenses Discord). */
function pendingForBridge() {
  return Object.values(load().rewards)
    .filter((r) => r.status === 'pending')
    .map((r) => ({ id: r.id, type: r.type, uuid: r.uuid, name: r.name, tx: r.tx, label: r.label, item: r.item ?? null, of: r.of ?? null }));
}

/** Accusé du proxy. Renvoie null si l'id n'est pas un achat. */
function acknowledge(id, ok, message) {
  const r = load().rewards[id];
  if (!r) return null;
  if (r.status === 'delivered') return { found: true, status: r.status, failed: false };
  if (ok) {
    r.status = 'delivered';
    r.deliveredAt = Date.now();
    r.detail = String(message ?? '').slice(0, 200);
  } else {
    r.tries += 1;
    r.lastError = String(message ?? 'erreur inconnue').slice(0, 300);
    if (r.tries >= MAX_TRIES) r.status = 'failed';
  }
  save();
  return { found: true, status: r.status, failed: r.status === 'failed', reward: r };
}

module.exports = {
  catalog, checkLines, isOpen, resolvePlayer, startBasket, checkout, handleWebhook, pendingForBridge, acknowledge, reset, LIMITS,
};
