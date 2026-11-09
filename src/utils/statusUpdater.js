// Boucle de statut : embed de #statut-serveur, nom du salon, présence du bot,
// salons compteurs et annonce « serveur en ligne ».
const { ActivityType } = require('discord.js');
const config = require('../../config');
const db = require('./db');
const { getStatus } = require('./mcstatus');
const { statusEmbed, base, ip } = require('./embeds');
const { getChannel, getRole } = require('./helpers');
const counters = require('./counters');

const RENAME_COOLDOWN = 10 * 60_000; // Discord limite à 2 renommages / 10 min
const lastRename = new Map();
const OFFLINE_CONFIRM = 2; // nb de vérifications hors ligne consécutives avant de considérer le serveur éteint
let offlineStreak = 0;

async function updateStatusMessage(guild, s) {
  const g = db.guild(guild.id);
  const ref = g.messages.status;
  if (!ref) return;

  const channel = guild.channels.cache.get(ref.channelId);
  if (!channel) return;

  let deleted = false;
  const msg = await channel.messages.fetch(ref.messageId).catch((err) => {
    deleted = err.code === 10008; // Unknown Message : vraiment supprimé
    return null;
  });
  if (msg) {
    await msg.edit({ embeds: [statusEmbed(s)] }).catch(() => null);
  } else if (deleted) {
    // Le message a été supprimé : on le reposte (une erreur réseau passagère ne crée pas de doublon)
    const sent = await channel.send({ embeds: [statusEmbed(s)] }).catch(() => null);
    if (sent) { g.messages.status = { channelId: channel.id, messageId: sent.id }; db.save(); }
  }

  // 🟢/🔴 dans le nom du salon (uniquement au changement d'état)
  const wanted = channel.name.replace(/^(🟢|🔴|📊)/u, s.online ? '🟢' : '🔴');
  const last = lastRename.get(channel.id) ?? 0;
  if (wanted !== channel.name && Date.now() - last > RENAME_COOLDOWN) {
    lastRename.set(channel.id, Date.now());
    channel.setName(wanted).catch(() => null);
  }
}

/** Annonce quand le serveur repasse en ligne (état mémorisé en base pour survivre aux redémarrages). */
async function announceTransition(guild, s) {
  const g = db.guild(guild.id);
  const prev = g.state.mcOnline; // undefined au tout premier lancement → pas d'annonce
  let next = prev;
  if (s.online) next = true;
  else if (offlineStreak >= OFFLINE_CONFIRM) next = false;
  if (next === prev) return;

  g.state.mcOnline = next;
  db.save();

  if (!(prev === false && next === true) || !config.announceOnline) return;
  const channel = getChannel(guild, 'announcements');
  if (!channel) return;
  const role = getRole(guild, 'notifAnnonces');
  await channel.send({
    content: role ? `${role}` : undefined,
    embeds: [base(config.colors.success)
      .setTitle('🟢 Le serveur est de nouveau en ligne !')
      .setDescription(`Connecte-toi dès maintenant sur \`${ip()}\` 🎮`)
      .addFields(
        { name: '🧩 Version', value: s.version || '—', inline: true },
        { name: '👥 Joueurs', value: `${s.players.online} / ${s.players.max}`, inline: true },
      )],
    allowedMentions: { roles: role ? [role.id] : [] },
  }).catch(() => null);
}

async function updateAll(client) {
  const s = await getStatus({ force: true });
  offlineStreak = s.online ? 0 : offlineStreak + 1;

  client.user.setPresence({
    status: s.online ? 'online' : 'idle',
    activities: [{
      type: ActivityType.Watching,
      name: s.online ? `${s.players.online} joueurs | ${config.minecraft.host}` : 'Serveur hors ligne',
    }],
  });

  for (const guild of client.guilds.cache.values()) {
    await updateStatusMessage(guild, s).catch((err) => console.error('[status]', err.message));
    await announceTransition(guild, s).catch((err) => console.error('[annonce]', err.message));
    try { counters.update(guild, s); } catch (err) { console.error('[compteurs]', err.message); }
  }
}

function start(client) {
  updateAll(client);
  setInterval(() => updateAll(client), config.statusInterval);
}

module.exports = { start, updateAll };
