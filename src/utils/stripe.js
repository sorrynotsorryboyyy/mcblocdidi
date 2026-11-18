// Appels à l'API Stripe (paiement uniquement : la boutique est sur mcbloc.fr). Sans dépendance : fetch + formulaire encodé.
//
// Secrets : UNIQUEMENT dans les variables Railway (jamais dans le code ni sur le site) :
//   STRIPE_SECRET_KEY      clé secrète (sk_test_… pour les tests, sk_live_… à l'ouverture ; ou clé restreinte rk_…)
//   STRIPE_WEBHOOK_SECRET  secret de signature du webhook (whsec_…)
//
// Les prix sont envoyés à Stripe au moment du paiement (price_data), calculés depuis network.json :
// aucun produit à créer dans Stripe, aucun prix venant du navigateur.
const crypto = require('node:crypto');

const API = 'https://api.stripe.com/v1';
const TOLERANCE_S = 5 * 60;

function settings(env = process.env) {
  return {
    secretKey: (env.STRIPE_SECRET_KEY ?? '').trim(),
    webhookSecret: (env.STRIPE_WEBHOOK_SECRET ?? '').trim(),
  };
}

function configured(s = settings()) {
  return /^(sk|rk)_(test|live)_\w+$/.test(s.secretKey) && s.webhookSecret.startsWith('whsec_');
}

/** Encode un objet en formulaire Stripe : { a: { b: [ { c: 1 } ] } } → a[b][0][c]=1. */
function encode(value, prefix = '', out = new URLSearchParams()) {
  if (value === undefined || value === null) return out;
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) encode(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.append(prefix, String(value));
  }
  return out;
}

async function call(fetchImpl, method, path, params) {
  const s = settings();
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${s.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
      'User-Agent': 'mcblocdidi',
    },
    body: params ? encode(params).toString() : undefined,
    signal: globalThis.AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`Stripe ${method} ${path} → ${res.status} ${json?.error?.message ?? ''}`.trim());
    err.status = res.status;
    throw err;
  }
  return json;
}

/**
 * Crée une session Stripe Checkout.
 * @param {{ lines: {name:string, cents:number, qty:number}[], successUrl, cancelUrl, metadata: object, ref: string }} p
 * Les moyens de paiement ne sont pas fixés : Stripe propose ceux activés dans le tableau de bord (cartes au départ).
 */
async function createSession(p, fetchImpl = globalThis.fetch) {
  return call(fetchImpl, 'POST', '/checkout/sessions', {
    mode: 'payment',
    locale: 'fr',
    success_url: p.successUrl,
    cancel_url: p.cancelUrl,
    client_reference_id: p.ref,
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 h : les prix ne restent pas figés indéfiniment
    metadata: p.metadata,
    payment_intent_data: { metadata: p.metadata, description: p.description },
    line_items: p.lines.map((l) => ({
      quantity: l.qty,
      price_data: { currency: 'eur', unit_amount: l.cents, product_data: { name: l.name } },
    })),
  });
}

/**
 * Signature Stripe : en-tête « t=<horodatage>,v1=<hex>[,v1=…] ».
 * v1 = HMAC-SHA256(secret, "<t>.<corps brut>"). Refusée si plus vieille de 5 minutes (anti-rejeu).
 */
function validSignature(rawBody, header, secret, now = Date.now()) {
  if (!secret || typeof header !== 'string') return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k, v]) => k === 'v1' && /^[0-9a-f]{64}$/i.test(v ?? '')).map(([, v]) => v.toLowerCase());
  if (!Number.isFinite(t) || !signatures.length || Math.abs(now / 1000 - t) > TOLERANCE_S) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex'), 'hex');
  return signatures.some((s) => crypto.timingSafeEqual(expected, Buffer.from(s, 'hex')));
}

/** Adresse du client vue par le proxy de Railway : X-Real-IP, sinon la DERNIÈRE de X-Forwarded-For, sinon la socket. */
function clientIp(req) {
  const real = String(req.headers['x-real-ip'] ?? '').trim();
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ip = real || forwarded.at(-1) || String(req.socket?.remoteAddress ?? '');
  return ip.replace(/^::ffff:/, '');
}

module.exports = { settings, configured, encode, createSession, validSignature, clientIp };
