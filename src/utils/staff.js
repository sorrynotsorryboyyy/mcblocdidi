// Outils du staff : absences (#absences), réunions (#réunions, /reunion) et tâches (#tâches, /tache).
// Tout est en base (db.guild().state.staff) : les rappels et les fins d'absence survivent aux redémarrages.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');
const { getChannel, staffRoleIds } = require('./helpers');
const { ensurePanel, byTitle } = require('./panels');

const TZ = config.daily?.timezone ?? 'Europe/Paris';
const TICK_MS = 60_000;
const DAY = 24 * 3600 * 1000;
const MAX_AHEAD = 183 * DAY; // 6 mois
const MEETING_END_MS = 3 * 3600 * 1000; // boutons retirés 3 h après le début
const ABSENCES_TITLE = '🗓️ Absences du staff';
const TASKS_TITLE = '📋 Tâches en cours';
const PRIORITIES = {
  high: { label: 'Haute', emoji: '🔴', color: 0xff5555 },
  normal: { label: 'Normale', emoji: '🟡', color: 0xffd84d },
  low: { label: 'Basse', emoji: '🟢', color: 0x55ff7f },
};
const RSVP = {
  yes: { label: 'Présent', emoji: '✅', style: ButtonStyle.Success },
  maybe: { label: 'Peut-être', emoji: '🤔', style: ButtonStyle.Secondary },
  no: { label: 'Absent', emoji: '❌', style: ButtonStyle.Danger },
};

function state(guildId) {
  const g = db.guild(guildId);
  g.state.staff ??= {};
  const s = g.state.staff;
  s.absences ??= {};
  s.meetings ??= {};
  s.tasks ??= {};
  s.taskSeq ??= 0;
  return s;
}

const newId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
const ts = (ms, style = 'F') => `<t:${Math.floor(ms / 1000)}:${style}>`;

// ------------------------------------------------------------------ dates (heure de Paris)

/** Décalage du fuseau à l'instant t (ms) : heure locale − UTC. */
function tzOffset(t) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return local - Math.floor(t / 1000) * 1000;
}

/** Instant (ms) d'une date + heure de Paris. */
function localTime(y, m, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - tzOffset(guess);
  const again = guess - tzOffset(t);
  if (again !== t) t = again; // changement d'heure entre les deux
  return t;
}

/** Année en cours à Paris. */
function currentYear(now = Date.now()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric' }).format(new Date(now)));
}

/** « 25/12 », « 25/12/2026 », « 25-12 », « 25.12.26 » → { y|null, m, d } (date réelle) ou null. */
function parseDate(input) {
  const m = String(input ?? '').trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = m[3] ? Number(m[3]) : null;
  if (y !== null && y < 100) y += 2000;
  const check = new Date(Date.UTC(y ?? 2024, mo - 1, d)); // 2024 : bissextile (29/02 accepté sans année)
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/** « 20:30 », « 20h30 », « 20h », « 9:05 » → { h, mi } ou null. */
function parseTime(input) {
  const m = String(input ?? '').trim().toLowerCase().match(/^(\d{1,2})\s*[:h]\s*(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2] ?? 0);
  return h <= 23 && mi <= 59 ? { h, mi } : null;
}

/** Date sans année : cette année, ou l'an prochain si elle est déjà passée (de plus d'un jour). */
function resolveYear(date, now = Date.now()) {
  if (date.y) return date.y;
  const y = currentYear(now);
  return localTime(y, date.m, date.d, 23, 59) < now - DAY ? y + 1 : y;
}

/**
 * Absence du `from` (00:00) au `to` (23:59), heure de Paris.
 * @returns {{ from, to } | { error }}
 */
function absenceRange(fromText, toText, now = Date.now()) {
  const from = parseDate(fromText);
  const to = parseDate(toText || fromText);
  if (!from || !to) return { error: 'Date invalide. Format attendu : `JJ/MM` (ex. `24/12`) ou `JJ/MM/AAAA`.' };
  const fy = resolveYear(from, now);
  let ty = to.y ?? fy;
  if (!to.y && localTime(ty, to.m, to.d) < localTime(fy, from.m, from.d)) ty += 1; // 28/12 → 03/01
  const start = localTime(fy, from.m, from.d, 0, 0);
  const end = localTime(ty, to.m, to.d, 23, 59);
  if (end < start) return { error: 'La date de fin est avant la date de début.' };
  if (end < now) return { error: 'Cette absence est déjà terminée.' };
  if (end - now > MAX_AHEAD) return { error: 'Une absence se déclare au plus 6 mois à l\'avance.' };
  return { from: start, to: end };
}

/** Réunion : date + heure de Paris, au moins 5 min dans le futur. @returns {{ at } | { error }} */
function meetingTime(dateText, timeText, now = Date.now()) {
  const date = parseDate(dateText);
  const time = parseTime(timeText);
  if (!date) return { error: 'Date invalide. Format attendu : `JJ/MM` (ex. `24/12`).' };
  if (!time) return { error: 'Heure invalide. Format attendu : `HH:MM` ou `20h30`.' };
  let y = date.y ?? currentYear(now);
  let at = localTime(y, date.m, date.d, time.h, time.mi);
  if (!date.y && at < now) { y += 1; at = localTime(y, date.m, date.d, time.h, time.mi); }
  if (at < now + 5 * 60_000) return { error: 'La réunion doit être dans le futur (au moins 5 minutes).' };
  if (at - now > MAX_AHEAD) return { error: 'Une réunion se programme au plus 6 mois à l\'avance.' };
  return { at };
}

// ------------------------------------------------------------------ absences

function absencesPanel(guildId, now = Date.now()) {
  const list = Object.values(state(guildId).absences).filter((a) => a.to >= now).sort((a, b) => a.from - b.from);
  const line = (a) => `• <@${a.userId}> — du ${ts(a.from, 'D')} au ${ts(a.to, 'D')}${a.reason ? ` · *${a.reason}*` : ''}`;
  const current = list.filter((a) => a.from <= now);
  const upcoming = list.filter((a) => a.from > now);
  const embed = base(config.colors.info)
    .setTitle(ABSENCES_TITLE)
    .setDescription('Tu seras indisponible ? Déclare-le avec le bouton ci-dessous : l\'équipe saura sur qui compter. '
      + 'Les absences terminées disparaissent toutes seules.')
    .addFields(
      { name: `🔴 Absents en ce moment (${current.length})`, value: current.map(line).join('\n').slice(0, 1024) || 'Personne 🎉' },
      { name: `🕒 Absences prévues (${upcoming.length})`, value: upcoming.map(line).join('\n').slice(0, 1024) || 'Aucune' },
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('staff_abs:new').setLabel('Déclarer une absence').setEmoji('🗓️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('staff_abs:end').setLabel('Je suis de retour').setEmoji('👋').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

function addAbsence(guildId, { userId, from, to, reason }) {
  const a = { id: newId(), userId, from, to, reason: String(reason ?? '').trim().slice(0, 150), createdAt: Date.now() };
  state(guildId).absences[a.id] = a;
  db.save();
  return a;
}

/** Retour anticipé : termine les absences en cours ET prévues du membre. Renvoie le nombre retiré. */
function endAbsences(guildId, userId) {
  const s = state(guildId);
  const mine = Object.values(s.absences).filter((a) => a.userId === userId);
  for (const a of mine) delete s.absences[a.id];
  if (mine.length) db.save();
  return mine.length;
}

/** Retire les absences terminées. Renvoie true si quelque chose a changé. */
function pruneAbsences(guildId, now = Date.now()) {
  const s = state(guildId);
  let changed = false;
  for (const a of Object.values(s.absences)) if (a.to < now) { delete s.absences[a.id]; changed = true; }
  if (changed) db.save();
  return changed;
}

// ------------------------------------------------------------------ réunions

function meetingMessage(guild, m) {
  const voice = getChannel(guild, 'staffVoice');
  const who = (k) => Object.entries(m.rsvp).filter(([, v]) => v === k).map(([id]) => `<@${id}>`);
  const embed = base(m.cancelled ? config.colors.error : config.colors.secondary)
    .setTitle(`${m.cancelled ? '❌ Réunion annulée' : '📅 Réunion staff'} : ${m.subject}`)
    .setDescription(m.agenda ? `**Ordre du jour**\n${m.agenda}` : null)
    .addFields(
      { name: '🕒 Quand', value: `${ts(m.at)} (${ts(m.at, 'R')})`, inline: true },
      { name: '🔊 Où', value: voice ? `${voice}` : 'Vocal du staff', inline: true },
      { name: '👤 Organisée par', value: `<@${m.authorId}>`, inline: true },
      ...Object.entries(RSVP).map(([k, r]) => {
        const list = who(k);
        return { name: `${r.emoji} ${r.label} (${list.length})`, value: list.join(', ').slice(0, 1024) || '—', inline: true };
      }),
    );
  if (m.cancelled || m.ended) return { embeds: [embed], components: [] };
  const row = new ActionRowBuilder().addComponents(
    ...Object.entries(RSVP).map(([k, r]) => new ButtonBuilder().setCustomId(`staff_meet:${k}:${m.id}`).setLabel(r.label).setEmoji(r.emoji).setStyle(r.style)),
    new ButtonBuilder().setCustomId(`staff_meet:cancel:${m.id}`).setLabel('Annuler').setEmoji('🗑️').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

function addMeeting(guildId, { subject, agenda, at, authorId }) {
  const m = {
    id: newId(), subject: String(subject).slice(0, 150), agenda: agenda ? String(agenda).slice(0, 1000) : null,
    at, authorId, rsvp: { [authorId]: 'yes' }, cancelled: false, ended: false,
    reminded: { hour: at - Date.now() <= 65 * 60_000, start: false }, // réunion très proche : pas de rappel « dans 1 h » en double
  };
  state(guildId).meetings[m.id] = m;
  db.save();
  return m;
}

// ------------------------------------------------------------------ tâches

function taskCard(t) {
  const p = PRIORITIES[t.priority] ?? PRIORITIES.normal;
  const status = t.status === 'done' ? `✅ Terminée par <@${t.doneBy}> ${ts(t.doneAt, 'R')}`
    : t.assigneeId ? `🔧 En cours — <@${t.assigneeId}>` : '📌 À faire — personne dessus';
  const embed = base(t.status === 'done' ? config.colors.success : p.color)
    .setTitle(`${t.status === 'done' ? '✅' : p.emoji} Tâche #${t.number} : ${t.title}`)
    .setDescription(t.details || null)
    .addFields(
      { name: 'Statut', value: status, inline: true },
      { name: 'Priorité', value: `${p.emoji} ${p.label}`, inline: true },
      { name: 'Ajoutée par', value: `<@${t.authorId}>`, inline: true },
    );
  const row = new ActionRowBuilder();
  if (t.status !== 'done') {
    row.addComponents(
      new ButtonBuilder().setCustomId(`staff_task:take:${t.id}`).setLabel('Je m\'en occupe').setEmoji('🙋').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`staff_task:done:${t.id}`).setLabel('Terminée').setEmoji('✅').setStyle(ButtonStyle.Success),
    );
  }
  row.addComponents(new ButtonBuilder().setCustomId(`staff_task:delete:${t.id}`).setLabel('Supprimer').setEmoji('🗑️').setStyle(ButtonStyle.Secondary));
  return { embeds: [embed], components: [row] };
}

function tasksPanel(guildId) {
  const open = Object.values(state(guildId).tasks).filter((t) => t.status !== 'done')
    .sort((a, b) => Object.keys(PRIORITIES).indexOf(a.priority) - Object.keys(PRIORITIES).indexOf(b.priority) || a.number - b.number);
  const link = (t) => (t.channelId && t.messageId ? `https://discord.com/channels/${guildId}/${t.channelId}/${t.messageId}` : null);
  const line = (t) => {
    const url = link(t);
    const title = url ? `[#${t.number} ${t.title}](${url})` : `#${t.number} ${t.title}`;
    return `${(PRIORITIES[t.priority] ?? PRIORITIES.normal).emoji} ${title}${t.assigneeId ? ` — <@${t.assigneeId}>` : ''}`;
  };
  const todo = open.filter((t) => !t.assigneeId);
  const doing = open.filter((t) => t.assigneeId);
  const embed = base(config.colors.info)
    .setTitle(TASKS_TITLE)
    .setDescription('Ajoute une tâche avec `/tache`. Clique sur **Je m\'en occupe** pour la prendre, puis **Terminée** une fois finie.')
    .addFields(
      { name: `📌 À faire (${todo.length})`, value: todo.map(line).join('\n').slice(0, 1024) || 'Rien 🎉' },
      { name: `🔧 En cours (${doing.length})`, value: doing.map(line).join('\n').slice(0, 1024) || 'Rien' },
    );
  return { embeds: [embed], components: [] };
}

function addTask(guildId, { title, details, priority, authorId, assigneeId }) {
  const s = state(guildId);
  s.taskSeq += 1;
  const t = {
    id: newId(), number: s.taskSeq, title: String(title).slice(0, 150), details: details ? String(details).slice(0, 1000) : null,
    priority: PRIORITIES[priority] ? priority : 'normal', authorId, assigneeId: assigneeId ?? null, status: 'todo', createdAt: Date.now(),
  };
  s.tasks[t.id] = t;
  db.save();
  return t;
}

// ------------------------------------------------------------------ panneaux et minuteur

async function refreshAbsences(guild) {
  return ensurePanel(guild, 'staffAbsences', 'staffAbsences', absencesPanel(guild.id), { match: byTitle(ABSENCES_TITLE) });
}

async function refreshTasks(guild) {
  const n = await ensurePanel(guild, 'staffTasks', 'staffTasks', tasksPanel(guild.id), { match: byTitle(TASKS_TITLE) });
  const ref = db.guild(guild.id).messages.staffTasks;
  const msg = ref ? await guild.channels.cache.get(ref.channelId)?.messages.fetch(ref.messageId).catch(() => null) : null;
  if (msg && !msg.pinned) await msg.pin().catch(() => null);
  return n;
}

/** Panneaux de #absences et #tâches (appelé par /setup). Renvoie le nombre de doublons supprimés. */
async function refreshPanels(guild) {
  let n = 0;
  n += await refreshAbsences(guild).catch(() => 0);
  n += await refreshTasks(guild).catch(() => 0);
  return n;
}

const staffPing = (guild) => {
  const ids = staffRoleIds(guild);
  return { content: ids.map((id) => `<@&${id}>`).join(' ') || undefined, allowedMentions: { roles: ids } };
};

async function editMeeting(guild, m) {
  const channel = guild.channels.cache.get(m.channelId);
  const msg = await channel?.messages.fetch(m.messageId).catch(() => null);
  if (msg) await msg.edit(meetingMessage(guild, m)).catch(() => null);
}

async function tickGuild(guild, now = Date.now()) {
  if (pruneAbsences(guild.id, now)) await refreshAbsences(guild).catch(() => null);
  const voice = getChannel(guild, 'staffVoice');
  for (const m of Object.values(state(guild.id).meetings)) {
    if (m.cancelled || m.ended) continue;
    const channel = guild.channels.cache.get(m.channelId);
    if (!m.reminded.hour && now >= m.at - 3600_000 && now < m.at - 5 * 60_000) {
      m.reminded.hour = true;
      db.save();
      await channel?.send({ ...staffPing(guild), embeds: [base(config.colors.warning).setDescription(`⏰ Réunion **${m.subject}** dans moins d'une heure (${ts(m.at, 't')}). Pense à indiquer ta présence !`)] }).catch(() => null);
    }
    if (!m.reminded.start && now >= m.at) {
      m.reminded.start = true;
      db.save();
      if (now - m.at < 30 * 60_000) { // pas de « ça commence » en retard après une panne du bot
        const coming = Object.entries(m.rsvp).filter(([, v]) => v !== 'no').map(([id]) => id);
        await channel?.send({
          content: coming.map((id) => `<@${id}>`).join(' ') || undefined,
          allowedMentions: { users: coming },
          embeds: [base(config.colors.success).setDescription(`🔊 La réunion **${m.subject}** commence !${voice ? ` Rejoins ${voice}.` : ''}`)],
        }).catch(() => null);
      }
    }
    if (now >= m.at + MEETING_END_MS) {
      m.ended = true;
      db.save();
      await editMeeting(guild, m);
    }
  }
  // Réunions finies depuis plus de 30 jours : on oublie
  const s = state(guild.id);
  for (const m of Object.values(s.meetings)) if ((m.ended || m.cancelled) && now - m.at > 30 * DAY) { delete s.meetings[m.id]; db.save(); }
}

function start(client) {
  const tick = async () => {
    for (const guild of client.guilds.cache.values()) await tickGuild(guild).catch((err) => console.error('[staff]', err.message));
  };
  tick();
  setInterval(tick, TICK_MS);
}

module.exports = {
  state, parseDate, parseTime, localTime, absenceRange, meetingTime,
  absencesPanel, addAbsence, endAbsences, pruneAbsences, refreshAbsences,
  meetingMessage, addMeeting, editMeeting, staffPing,
  taskCard, tasksPanel, addTask, refreshTasks,
  refreshPanels, tickGuild, start, PRIORITIES, ABSENCES_TITLE, TASKS_TITLE,
};
