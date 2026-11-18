// Boutique mcbloc.fr → paiement Stripe → livraison en jeu par le proxy.
//
//  1. POST /public/shop/checkout { username, items:[{id,qty}] } → session Stripe AUX PRIX de network.json → lien de paiement
//  2. POST /stripe/webhook (signature Stripe)                   → achats en attente, identifiants fixes shop:<paiement>:<n>-<k>
//  3. Le proxy récupère les achats avec les récompenses (/api/rewards/pending), livre une seule fois, puis accuse réception.
//
// Ce qui a été vendu est enregistré ICI à la création de la session (jamais relu depuis le webhook) ; le montant payé doit
// correspondre au total enregistré. Remboursement / litige : retrait (shop-revoke:…) de chaque achat du paiement + alerte
// dans #logs. Jamais de sanction automatique. Stockage : $DATA_DIR/shop.json.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../../config');
const stripe = require('./stripe');

const FILE = path.join(process.env.DATA_DIR || './data', 'shop.json');
const NAME_RE = /^\w{3,16}$/;
const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const MAX_TRIES = 20;
const MAX_LINES = 10;
const MAX_QTY = 12;
const SESSION_TTL_MS = 3 * 24 * 3600 * 1000;
// Mêmes bornes que ShopRepository.Item (proxy) : un article hors bornes n'est jamais vendu.
const LIMITS = { rankDays: 366, coins: 1_000_000, boosterMin: 60, boosterMax: 7 * 24 * 3600 };
const BOOSTER_EFFECTS = ['coins', 'xp', 'combo', 'network'];

let data = null;

function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { data = {}; }
  data.sessions ??= {};     // session Stripe → { uuid, name, lines:[{id, qty, cents}], total, createdAt, paidAt? }
  data.payments ??= {};     // paiement Stripe (payment_intent) → session
  data.rewards ??= {};      // id → { id, type: 'shop'|'shop-revoke', uuid, name, tx, label, item?, of?, status, tries }
  data.transactions ??= {}; // paiement → { uuid, name, rewardIds, status, at }
  data.webhooks ??= {};     // id de l'événement Stripe → date (anti-rejeu)
  data.early ??= {};        // paiement → type d'événement de retrait reçu AVANT la confirmation du paiement
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

const isOpen = (cfg = config) => cfg.shop?.open === true && stripe.configured();

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

// ------------------------------------------------------------------ paiement (route publique)

function siteUrl(cfg = config) {
  return String(cfg.links?.site ?? 'https://mcbloc.fr').replace(/\/+$/, '');
}

const cents = (euros) => Math.round(euros * 100);

function prune(now = Date.now()) {
  const d = load();
  for (const [id, s] of Object.entries(d.sessions)) if (!s.paidAt && now - s.createdAt > SESSION_TTL_MS) delete d.sessions[id];
  for (const [id, at] of Object.entries(d.webhooks)) if (now - at > 30 * 24 * 3600 * 1000) delete d.webhooks[id];
}

/** Crée la session de paiement Stripe : pseudo vérifié chez Mojang, articles et prix du catalogue uniquement. */
async function checkout({ username, items }, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const cfg = deps.config ?? config;
  if (!isOpen(cfg)) return { status: 403, body: { error: 'shop-closed' } };
  const checked = checkLines(items, cfg);
  if (checked.error) return { status: 400, body: { error: checked.error } };
  const player = await resolvePlayer(username, fetchImpl);
  if (!player) return { status: 400, body: { error: 'invalid-player' } };

  const lines = checked.lines.map(({ item, qty }) => ({
    id: item.id, name: item.name, cents: cents(item.price), qty, kind: item.kind, target: item.target, amount: item.amount,
  }));
  const total = lines.reduce((sum, l) => sum + l.cents * l.qty, 0);
  const site = siteUrl(cfg);
  const session = await stripe.createSession({
    lines,
    ref: player.uuid,
    successUrl: `${site}/boutique/merci`,
    cancelUrl: `${site}/boutique/panier`,
    metadata: { uuid: player.uuid, name: player.name },
    description: `MCBloc — ${player.name}`,
  }, fetchImpl);
  if (!session?.id || !session?.url) throw new Error('session Stripe incomplète');

  const d = load();
  prune();
  d.sessions[session.id] = {
    uuid: player.uuid, name: player.name, total, createdAt: Date.now(),
    lines, // ce qui est vendu est figé ici : livré tel quel même si network.json change ensuite
  };
  save();
  return { status: 200, body: { checkout: session.url, player: player.name } };
}

// ------------------------------------------------------------------ webhook Stripe

const PAID_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
const REVOKE_EVENTS = ['charge.refunded', 'charge.dispute.created'];
const TX_RE = /^[\w-]{1,64}$/;

/** Achats d'une session payée → récompenses en file. Renvoie le nombre d'articles. */
function queuePaid(d, sessionId, object, alerts) {
  const session = d.sessions[sessionId];
  if (!session) {
    alerts.push(`⚠️ Paiement Stripe **${sessionId}** reçu pour une session inconnue : rien n'a été livré, à vérifier à la main.`);
    return 0;
  }
  const tx = String(object.payment_intent ?? '');
  if (!TX_RE.test(tx)) {
    alerts.push(`⚠️ Paiement **${sessionId}** sans identifiant de paiement : rien n'a été livré.`);
    return 0;
  }
  if (object.currency !== 'eur' || Number(object.amount_total) !== session.total) {
    alerts.push(`🚨 Paiement **${tx}** (${session.name}) : montant ${object.amount_total} ${object.currency} ≠ attendu ${session.total} eur. Rien n'a été livré.`);
    return 0;
  }
  const record = d.transactions[tx] ?? { rewardIds: [], at: Date.now(), status: 'paid' };
  session.lines.forEach((line, n) => {
    for (let k = 0; k < line.qty; k += 1) {
      const id = `shop:${tx}:${n}-${k}`;
      d.rewards[id] ??= {
        id, type: 'shop', uuid: session.uuid, name: session.name, tx, label: line.name,
        item: { kind: line.kind, target: line.target, amount: line.amount, id: line.id }, status: 'pending', tries: 0, createdAt: Date.now(),
      };
      if (!record.rewardIds.includes(id)) record.rewardIds.push(id);
    }
  });
  record.uuid = session.uuid;
  record.name = session.name;
  record.session = sessionId;
  d.transactions[tx] = record;
  d.payments[tx] = sessionId;
  session.paidAt ??= Date.now();
  if (d.early[tx]) { // retrait reçu avant la confirmation : on le rejoue maintenant
    revokeTx(d, tx, d.early[tx], alerts, null);
    delete d.early[tx];
  }
  return record.rewardIds.length;
}

/** Retrait de chaque article livré (ou à livrer) d'un paiement. */
function revokeTx(d, tx, type, alerts, detail) {
  const record = d.transactions[tx];
  if (!record?.rewardIds.length) {
    d.early[tx] = type;
    alerts.push(`🚨 **${type}** sur le paiement **${tx}** reçu avant sa confirmation : le retrait sera appliqué dès qu'il arrivera.`);
    return 0;
  }
  for (const of of record.rewardIds) {
    const id = `shop-revoke:${of.slice('shop:'.length)}`;
    d.rewards[id] ??= { id, type: 'shop-revoke', of, uuid: record.uuid, name: record.name, tx, label: `Retrait ${of}`, status: 'pending', tries: 0, createdAt: Date.now() };
  }
  record.status = type;
  const what = type === 'charge.refunded' ? 'Remboursement' : 'Litige bancaire (chargeback)';
  alerts.push(`🚨 **${what}** — ${record.name} · paiement **${tx}** : ${record.rewardIds.length} article(s) retiré(s) automatiquement.${detail ? ` ${detail}` : ''} Aucune sanction automatique.`);
  return record.rewardIds.length;
}

/**
 * Traite un événement Stripe déjà authentifié (signature vérifiée par l'appelant).
 * @returns {{ reply: object, alerts: string[], paid?: {name: string, count: number} }}
 */
function handleWebhook(event) {
  const d = load();
  const alerts = [];
  if (!event?.id || !event?.type) return { reply: { ok: true, ignored: 'bad-event' }, alerts };
  if (d.webhooks[event.id]) return { reply: { ok: true, duplicate: true }, alerts };
  d.webhooks[event.id] = Date.now();
  const object = event.data?.object ?? {};
  const result = { reply: { ok: true }, alerts };

  if (PAID_EVENTS.includes(event.type)) {
    if (object.payment_status !== 'paid') { // paiement différé pas encore confirmé : on attend async_payment_succeeded
      save();
      return { reply: { ok: true, waiting: true }, alerts };
    }
    const count = queuePaid(d, String(object.id ?? ''), object, alerts);
    result.reply.queued = count;
    if (count) result.paid = { name: d.sessions[object.id]?.name ?? '?', count, tx: String(object.payment_intent) };
  } else if (event.type === 'checkout.session.async_payment_failed') {
    alerts.push(`ℹ️ Paiement différé échoué pour la session **${object.id}** : rien n'est livré.`);
  } else if (REVOKE_EVENTS.includes(event.type)) {
    const tx = String(object.payment_intent ?? '');
    if (TX_RE.test(tx)) {
      const partial = event.type === 'charge.refunded' && object.amount_refunded < object.amount
        ? `(remboursement partiel : ${object.amount_refunded / 100} € sur ${object.amount / 100} € — tout a été retiré, à ajuster à la main si besoin)` : null;
      result.reply.revoked = revokeTx(d, tx, event.type, alerts, partial);
    } else {
      alerts.push(`🚨 **${event.type}** sans paiement identifiable (${object.id}) : rien n'a pu être retiré automatiquement.`);
    }
  } else if (event.type === 'charge.dispute.closed') {
    alerts.push(`ℹ️ Litige **${object.id}** clos (${object.status}). Rien n'a été rendu automatiquement : à décider par le staff.`);
  }
  save();
  return result;
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
  catalog, checkLines, isOpen, resolvePlayer, checkout, handleWebhook, pendingForBridge, acknowledge, reset, LIMITS,
};
