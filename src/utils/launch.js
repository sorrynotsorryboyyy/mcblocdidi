// Lancement : compte à rebours + inscription 🚀 Pionnier, récompense en jeu à l'ouverture.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const db = require('./db');
const { base, ip } = require('./embeds');
const { getChannel, getRole } = require('./helpers');
const { ensurePanel, byTitle } = require('./panels');
const { queueReward } = require('./rewards');

const TITLE = `🚀 Lancement de ${config.serverName}`;
const TICK_MS = 30_000;

/** Décalage (ms) d'un fuseau horaire à un instant donné. */
function tzOffset(utcMs, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcMs;
}

/** « JJ/MM/AAAA HH:MM » (heure de Paris) → timestamp ms, ou null si invalide. */
function parseDate(input, timeZone = config.daily.timezone) {
  const m = String(input).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})[:h](\d{2}))?$/i);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0'] = m;
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  const check = new Date(guess);
  if (check.getUTCDate() !== +d || check.getUTCMonth() !== +mo - 1 || +h > 23 || +mi > 59) return null;
  // Deux passes pour tomber juste autour d'un changement d'heure
  let ts = guess - tzOffset(guess, timeZone);
  ts = guess - tzOffset(ts, timeZone);
  return ts;
}

const state = (guildId) => db.guild(guildId).state;

function panelPayload(launch, guild) {
  const at = Math.floor(launch.at / 1000);
  const role = getRole(guild, 'pioneer');
  const launched = launch.status === 'launched';
  const embed = base(launched ? config.colors.success : 0x3498db)
    .setTitle(TITLE)
    .setDescription(launched
      ? `🎉 **${config.serverName} est ouvert !** Rejoins-nous sur \`${ip()}\`\n\nMerci aux **${launch.pioneers.length}** pionniers ! 💙`
      : `L'ouverture du serveur approche !\n\n⏰ **Ouverture <t:${at}:R>** — <t:${at}:F>\n🌐 IP : \`${ip()}\`\n\n`
        + `Clique sur **« Je serai là ! »** pour devenir ${role ?? '🚀 Pionnier'} :\n`
        + `> 🎁 **${launch.rewardCoins} pièces** en jeu à l'ouverture (compte lié avec \`/lier\`)\n`
        + '> 🔔 Une mention au moment de l\'ouverture')
    .addFields({ name: '🚀 Pionniers inscrits', value: String(launch.pioneers.length), inline: true });

  const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
    .setCustomId('launch_join')
    .setLabel(launched ? 'Le serveur est ouvert !' : 'Je serai là !')
    .setEmoji('🚀')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(launched));
  return { embeds: [embed], components: [row] };
}

function refreshPanel(guild) {
  const launch = state(guild.id).launch;
  if (!launch || launch.status === 'cancelled') return Promise.resolve(0);
  return ensurePanel(guild, 'launch', 'announcements', panelPayload(launch, guild), { match: byTitle(TITLE) });
}

/** Ouverture : annonce + récompenses des pionniers (ids uniques → jamais en double). */
async function openServer(guild) {
  const launch = state(guild.id).launch;
  launch.status = 'launched';
  db.save();
  let rewarded = 0;
  for (const id of launch.pioneers) {
    if (!guild.members.cache.has(id)) continue;
    if (queueReward(guild, `pioneer:${id}`, id, { type: 'coins', amount: launch.rewardCoins, label: `${launch.rewardCoins} pièces (pionnier du lancement)` })) rewarded++;
  }
  await refreshPanel(guild).catch(() => null);

  const channel = getChannel(guild, 'announcements');
  const role = getRole(guild, 'pioneer');
  const msg = await channel?.send({
    content: role ? `${role}` : undefined,
    embeds: [base(config.colors.success).setTitle(`🎉 ${config.serverName} est ouvert !`)
      .setDescription(`Le serveur est **officiellement ouvert** ! Connecte-toi sur \`${ip()}\` 🎮\n`
        + `🚀 ${rewarded} pionnier(s) reçoivent **${launch.rewardCoins} pièces** en jeu.`)],
    allowedMentions: { roles: role ? [role.id] : [] },
  }).catch(() => null);
  if (msg?.crosspostable) await msg.crosspost().catch(() => null);
  return rewarded;
}

async function tick(client) {
  for (const guild of client.guilds.cache.values()) {
    const launch = state(guild.id).launch;
    if (launch?.status === 'scheduled' && launch.at <= Date.now()) {
      await openServer(guild).catch((err) => console.error('[lancement]', err.message));
    }
  }
}

function start(client) {
  tick(client);
  setInterval(() => tick(client), TICK_MS);
}

module.exports = { start, parseDate, panelPayload, refreshPanel, openServer, TITLE };
