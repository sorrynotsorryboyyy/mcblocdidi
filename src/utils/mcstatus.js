// Interroge le serveur Minecraft Java (avec un petit cache pour éviter le spam).
const { status } = require('minecraft-server-util');
const config = require('../../config');

const CACHE_MS = 20_000;
let cache = { at: 0, value: null };

/**
 * @returns {Promise<{online: boolean, players?: {online:number,max:number,sample:string[]}, version?: string, motd?: string, latency?: number}>}
 */
async function getStatus({ force = false, host = config.minecraft.host, port = config.minecraft.port } = {}) {
  const isDefault = host === config.minecraft.host && port === config.minecraft.port;
  if (isDefault && !force && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;

  let value;
  try {
    const res = await status(host, port, { timeout: 5000, enableSRV: true });
    value = {
      online: true,
      players: {
        online: res.players.online,
        max: res.players.max,
        sample: (res.players.sample ?? []).map((p) => p.name).filter(Boolean),
      },
      version: res.version.name,
      motd: res.motd.clean.trim(),
      latency: res.roundTripLatency,
    };
  } catch {
    value = { online: false };
  }

  if (isDefault) cache = { at: Date.now(), value };
  return value;
}

module.exports = { getStatus };
