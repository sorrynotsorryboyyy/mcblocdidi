// Appels à l'API « Headless » de Tebex (paiement uniquement : la boutique est sur mcbloc.fr).
//
// Secrets : UNIQUEMENT dans les variables Railway (jamais dans le code ni sur le site) :
//   TEBEX_PUBLIC_TOKEN      jeton public de la boutique (webstore)
//   TEBEX_PRIVATE_KEY       clé privée (creator.tebex.io/developers/api-keys) ; authentification = jeton public + clé privée
//   TEBEX_WEBHOOK_SECRET    secret des webhooks (signature)
//   TEBEX_DYNAMIC_CATEGORY  identifiant de la catégorie « dynamic »
//
// Les articles sont des « paquets dynamiques » : nom et PRIX fixés ici, d'après network.json.
// Le navigateur n'envoie que des identifiants d'articles : aucun prix venant du client n'est jamais utilisé.
const crypto = require('node:crypto');

const API = 'https://headless.tebex.io/api';
const DEFAULT_WEBHOOK_IPS = ['18.209.80.3', '54.87.231.232'];

function settings(env = process.env) {
  return {
    token: (env.TEBEX_PUBLIC_TOKEN ?? '').trim(),
    privateKey: (env.TEBEX_PRIVATE_KEY ?? '').trim(),
    webhookSecret: (env.TEBEX_WEBHOOK_SECRET ?? '').trim(),
    category: (env.TEBEX_DYNAMIC_CATEGORY ?? '').trim(),
    webhookIps: (env.TEBEX_WEBHOOK_IPS ?? DEFAULT_WEBHOOK_IPS.join(',')).split(',').map((s) => s.trim()).filter(Boolean),
  };
}

/** Tous les secrets nécessaires sont-ils présents ? */
function configured(s = settings()) {
  return !!(s.token && s.privateKey && s.webhookSecret && /^\d+$/.test(s.category));
}

// ------------------------------------------------------------------ webhooks

/**
 * Signature Tebex : X-Signature = HMAC-SHA256(secret, SHA256(corps brut) en hexadécimal), en hexadécimal.
 * Comparaison en temps constant.
 */
function validSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const expected = crypto.createHmac('sha256', secret).update(bodyHash).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature.toLowerCase(), 'hex'));
}

/**
 * Adresse du client, telle que vue par le proxy de Railway : X-Real-IP, sinon la DERNIÈRE adresse de X-Forwarded-For
 * (celle qu'il ajoute ; les précédentes peuvent être inventées par l'appelant), sinon la socket.
 */
function clientIp(req) {
  const real = String(req.headers['x-real-ip'] ?? '').trim();
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ip = real || forwarded.at(-1) || String(req.socket?.remoteAddress ?? '');
  return ip.replace(/^::ffff:/, '');
}

function allowedIp(req, s = settings()) {
  return s.webhookIps.includes(clientIp(req));
}

// ------------------------------------------------------------------ appels HTTP

async function call(fetchImpl, method, path, { body } = {}) {
  const s = settings();
  const headers = { Accept: 'application/json', 'User-Agent': 'mcblocdidi' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // Tous les appels partent du bot (jamais du navigateur) : authentification privée systématique, exigée par Tebex.
  headers.Authorization = `Basic ${Buffer.from(`${s.token}:${s.privateKey}`).toString('base64')}`;
  const res = await fetchImpl(`${API}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: globalThis.AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const detail = json?.detail ?? json?.message ?? json?.error_message ?? text.slice(0, 200);
    const err = new Error(`Tebex ${method} ${path.replace(s.token, '<token>')} → ${res.status} ${detail}`);
    err.status = res.status;
    throw err;
  }
  return json?.data ?? json;
}

const enc = encodeURIComponent;

/** Crée un panier pour un pseudo Minecraft (retour vers le site après paiement ou annulation). */
async function createBasket({ username, ip, completeUrl, cancelUrl, custom }, fetchImpl = globalThis.fetch) {
  const s = settings();
  return call(fetchImpl, 'POST', `/accounts/${enc(s.token)}/baskets`, {
    body: {
      complete_url: completeUrl, cancel_url: cancelUrl, complete_auto_redirect: true,
      username, ...(ip ? { ip_address: ip } : {}), custom,
    },
  });
}

async function getBasket(ident, fetchImpl = globalThis.fetch) {
  const s = settings();
  return call(fetchImpl, 'GET', `/accounts/${enc(s.token)}/baskets/${enc(ident)}`);
}

/** Liens de connexion Tebex, si la boutique l'exige avant le paiement. */
async function authLinks(ident, returnUrl, fetchImpl = globalThis.fetch) {
  const s = settings();
  return call(fetchImpl, 'GET', `/accounts/${enc(s.token)}/baskets/${enc(ident)}/auth?returnUrl=${enc(returnUrl)}`);
}

/** Crée les paquets dynamiques du panier (prix fixés ici, clé privée). */
async function setDynamicPackages(ident, username, packages, fetchImpl = globalThis.fetch) {
  const s = settings();
  return call(fetchImpl, 'PUT', `/accounts/${enc(s.token)}/baskets/${enc(ident)}/dynamic-packages`, {
    body: { basket_id: ident, username, category_id: Number(s.category), packages },
  });
}

/** Paquets de la catégorie dynamique visibles pour ce panier. */
async function categoryPackages(ident, fetchImpl = globalThis.fetch) {
  const s = settings();
  const data = await call(fetchImpl, 'GET',
    `/accounts/${enc(s.token)}/categories/${enc(s.category)}?includePackages=1&basketIdent=${enc(ident)}`);
  return Array.isArray(data?.packages) ? data.packages : [];
}

async function addPackage(ident, packageId, quantity, fetchImpl = globalThis.fetch) {
  return call(fetchImpl, 'POST', `/baskets/${enc(ident)}/packages`, { body: { package_id: packageId, quantity } });
}

module.exports = {
  settings, configured, validSignature, clientIp, allowedIp,
  createBasket, getBasket, authLinks, setDynamicPackages, categoryPackages, addPackage,
};
