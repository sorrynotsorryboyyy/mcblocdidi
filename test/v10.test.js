// Refonte du Discord : arrivée en 3 étapes, salons revus, annonce des achats, nettoyage, outils staff.
const { fakeGuild } = require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const E = require('../src/utils/embeds');
const staff = require('../src/utils/staff');
const { fixedFooter } = require('../src/utils/cleanup');

const channels = () => config.categories.flatMap((c) => c.channels.map((ch) => ({ ...ch, cat: c.key })));
const channel = (key) => channels().find((c) => c.key === key);
const buttons = (panel) => panel.components.flatMap((row) => row.toJSON().components.map((c) => c.custom_id ?? c.url));

test('arrivée : #vérification (âge) → #règles (accepter) → #guide (j\'ai lu) → ✅ Membre', () => {
  assert.equal(channel('verify').access, 'verify');
  assert.equal(channel('rules').access, 'rulesGate');
  assert.equal(channel('guide').access, 'guideGate');
  assert.ok(config.roles.rulesAccepted, 'rôle intermédiaire 📜 Règlement accepté');
  const guild = fakeGuild();
  assert.deepEqual(buttons(E.verifyPanel(guild)), ['verify_accept:minor', 'verify_accept:adult']);
  assert.deepEqual(buttons(E.rulesPanel(guild)), ['rules_accept']);
  assert.deepEqual(buttons(E.guideReadPanel(guild)), ['guide_read']);
  assert.deepEqual(require('../src/handlers/verification').prefixes, ['verify_accept', 'rules_accept', 'guide_read']);
});

test('règles : le panneau rappelle à quoi servent les tickets (bugs, remboursements, conflits)', () => {
  const rules = E.rulesPanel(fakeGuild()).embeds[0].toJSON();
  const tickets = rules.fields.find((f) => f.name.includes('Ticket') || f.name.includes('staff'));
  for (const word of ['bug', 'remboursement', 'conflit']) assert.ok(tickets.value.toLowerCase().includes(word), word);
  const info = E.infoPanel(fakeGuild()).embeds[0].toJSON();
  assert.ok(info.fields.some((f) => f.name.includes('Tickets')));
  assert.ok(config.ticketTypes.some((t) => t.id === 'conflit'));
  assert.ok(config.ticketTypes.find((t) => t.id === 'boutique').label.includes('remboursement'));
});

test('salons : #bugs et #statut-serveur retirés, statut dans #infos-serveur, #achats-boutique créé', () => {
  assert.equal(channel('bugs'), undefined);
  assert.equal(channel('status'), undefined);
  assert.ok(config.removed.channels.includes('bugs') && config.removed.channels.includes('status'));
  assert.equal(channel('shopFeed').access, 'readonly');
  assert.equal(channel('shopFeed').cat, 'catCommunity');
  const online = { online: true, players: { online: 3, max: 50, sample: [] }, version: '1.21', motd: '', latency: 20 };
  const panel = E.infoPanel(fakeGuild(), online);
  assert.equal(panel.embeds.length, 2, 'infos + statut en direct');
  panel.embeds.forEach((e) => e.toJSON());
});

test('achats : annonce publique avec pseudo et articles, bouton boutique, sans montant', () => {
  const p = E.shopPurchase({ name: 'Steve', items: ['Grade VIP — 30 jours', '2× Pack — 1 000 pièces'] });
  const json = p.embeds[0].toJSON();
  assert.ok(json.description.includes('**Steve**'));
  assert.ok(json.description.includes('2× Pack'));
  assert.ok(!/€/.test(json.description));
  assert.deepEqual(buttons(p), [config.links.boutique]);
});

test('nettoyage : ancien pied de page remplacé, suffixe conservé, pied actuel intact', () => {
  assert.equal(fixedFooter('McBlocDidi'), config.footer);
  assert.equal(fixedFooter('McBlocDidi • ID : abc'), `${config.footer} • ID : abc`);
  assert.equal(fixedFooter('MCBLOC'), config.footer);
  assert.equal(fixedFooter(config.footer), null);
  assert.equal(fixedFooter(`${config.footer} • Sanction #3`), null);
  assert.equal(fixedFooter(''), null);
});

test('staff : salons (annonces réservées à la direction, absences, réunions, tâches, vocal)', () => {
  assert.equal(channel('staffAnnounce').access, 'staffAnnounce');
  for (const key of ['staffAbsences', 'staffMeetings', 'staffTasks', 'staffVoice']) assert.equal(channel(key).cat, 'catStaff', key);
  assert.equal(channel('staffVoice').type, 'voice');
});

test('staff : dates et heures de Paris', () => {
  assert.deepEqual(staff.parseDate('24/12'), { y: null, m: 12, d: 24 });
  assert.deepEqual(staff.parseDate('01-02-27'), { y: 2027, m: 2, d: 1 });
  assert.equal(staff.parseDate('31/02'), null);
  assert.equal(staff.parseDate('demain'), null);
  assert.deepEqual(staff.parseTime('20h30'), { h: 20, mi: 30 });
  assert.deepEqual(staff.parseTime('9h'), { h: 9, mi: 0 });
  assert.equal(staff.parseTime('25:00'), null);
  assert.equal(staff.localTime(2026, 7, 1, 12, 0), Date.UTC(2026, 6, 1, 10, 0), 'été : UTC+2');
  assert.equal(staff.localTime(2026, 12, 1, 12, 0), Date.UTC(2026, 11, 1, 11, 0), 'hiver : UTC+1');
});

test('staff : absences (passage d\'année, erreurs, fin automatique)', () => {
  const now = Date.UTC(2026, 11, 20, 12, 0); // 20/12/2026
  const r = staff.absenceRange('28/12', '03/01', now);
  assert.equal(r.from, staff.localTime(2026, 12, 28, 0, 0));
  assert.equal(r.to, staff.localTime(2027, 1, 3, 23, 59));
  assert.ok(staff.absenceRange('xx', '', now).error);
  assert.ok(staff.absenceRange('01/06/2027', '30/06/2027', now).error, 'plus de 6 mois');
  const one = staff.absenceRange('22/12', '', now);
  assert.equal(one.to - one.from, (23 * 60 + 59) * 60_000, 'un seul jour');

  const gid = 'staff-abs';
  staff.addAbsence(gid, { userId: 'u1', ...r, reason: 'vacances' });
  staff.addAbsence(gid, { userId: 'u2', from: now - 3 * 864e5, to: now - 864e5, reason: '' });
  assert.equal(staff.pruneAbsences(gid, now), true);
  assert.equal(Object.keys(staff.state(gid).absences).length, 1);
  const panel = staff.absencesPanel(gid, now);
  panel.embeds[0].toJSON();
  assert.deepEqual(buttons(panel), ['staff_abs:new', 'staff_abs:end']);
  assert.equal(staff.endAbsences(gid, 'u1'), 1);
});

test('staff : réunions (futur obligatoire, boutons de présence, annulée = plus de boutons)', () => {
  const now = Date.UTC(2026, 11, 20, 12, 0);
  assert.ok(staff.meetingTime('20/12', '13:02', now).error, 'trop proche (moins de 5 min, heure de Paris)');
  const ok = staff.meetingTime('21/12', '20:30', now);
  assert.equal(ok.at, staff.localTime(2026, 12, 21, 20, 30));
  assert.equal(staff.meetingTime('05/01', '20:30', now).at, staff.localTime(2027, 1, 5, 20, 30), 'date passée sans année = l\'an prochain');
  assert.ok(staff.meetingTime('19/12', '20:30', now).error, 'l\'an prochain mais à plus de 6 mois');

  const m = staff.addMeeting('staff-meet', { subject: 'Ouverture', agenda: '• boutique', at: Date.now() + 864e5, authorId: 'a1' });
  assert.equal(m.rsvp.a1, 'yes', 'l\'organisateur est présent');
  const guild = fakeGuild('staff-meet');
  assert.deepEqual(buttons(staff.meetingMessage(guild, m)).map((id) => id.split(':')[1]), ['yes', 'maybe', 'no', 'cancel']);
  staff.meetingMessage(guild, m).embeds[0].toJSON();
  assert.equal(staff.meetingMessage(guild, { ...m, cancelled: true }).components.length, 0);
});

test('staff : tâches (numérotées, prise en charge, récapitulatif)', () => {
  const gid = 'staff-task';
  const a = staff.addTask(gid, { title: 'Maps CoreWars', priority: 'high', authorId: 'a1' });
  const b = staff.addTask(gid, { title: 'Annonce', authorId: 'a1', assigneeId: 'u2' });
  assert.deepEqual([a.number, b.number], [1, 2]);
  assert.equal(b.priority, 'normal');
  assert.deepEqual(buttons(staff.taskCard(a)).map((id) => id.split(':')[1]), ['take', 'done', 'delete']);
  assert.deepEqual(buttons(staff.taskCard({ ...a, status: 'done', doneBy: 'u1', doneAt: Date.now() })).map((id) => id.split(':')[1]), ['delete']);
  const recap = staff.tasksPanel(gid).embeds[0].toJSON();
  assert.ok(recap.fields[0].value.includes('Maps CoreWars'), 'à faire');
  assert.ok(recap.fields[1].value.includes('Annonce'), 'en cours');
});

// ---------- Aucun doublon de salons, remise à neuf ----------
const { Collection, ChannelType } = require('discord.js');
const db = require('../src/utils/db');

function fakeChannels(list) {
  const cache = new Collection();
  const deleted = [];
  for (const c of list) {
    const ch = {
      createdTimestamp: 0, parentId: null, position: 0, isThread: () => false, ...c,
      async delete() { if (c.undeletable) throw new Error('requis'); cache.delete(ch.id); deleted.push(ch.name); },
      async edit(e) { if (e.parent) ch.parentId = e.parent; if (e.name) ch.name = e.name; return ch; },
    };
    cache.set(ch.id, ch);
  }
  return { guild: { id: 'dedupe', channels: { cache, fetch: async () => cache } }, cache, deleted };
}

test('aucun doublon : un salon déplacé laisse son ancien exemplaire supprimé (même avec des messages)', async () => {
  const { ensureChannel } = require('../src/commands/admin/setup')._internal;
  const { guild, deleted } = fakeChannels([
    { id: 'old', name: '👀┃spoilers', type: ChannelType.GuildText, parentId: 'catGames' },
    { id: 'new', name: '👀┃spoilers', type: ChannelType.GuildText, parentId: 'catCommunity' },
    { id: 'here', name: '👀┃spoilers', type: ChannelType.GuildText, parentId: 'x' },
  ]);
  const g = { channels: { spoilers: 'new' } };
  const ch = await ensureChannel(guild, g, { key: 'spoilers', name: '👀┃spoilers', type: ChannelType.GuildText, parent: { id: 'catCommunity' }, overwrites: [] }, new Set(['here']));
  assert.equal(ch.id, 'new');
  assert.deepEqual(deleted, ['👀┃spoilers'], 'l\'ancien est supprimé, le salon de la commande est protégé');
  assert.ok(guild.channels.cache.has('here'));
});

test('aucun doublon : base perdue → le salon existant est déplacé, pas recréé', async () => {
  const { ensureChannel } = require('../src/commands/admin/setup')._internal;
  const { guild, deleted } = fakeChannels([{ id: 'old', name: '👀┃spoilers', type: ChannelType.GuildText, parentId: 'catGames' }]);
  const g = { channels: {} };
  const ch = await ensureChannel(guild, g, { key: 'spoilers', name: '👀┃spoilers', type: ChannelType.GuildText, parent: { id: 'catCommunity' }, overwrites: [] });
  assert.equal(ch.id, 'old');
  assert.equal(ch.parentId, 'catCommunity');
  assert.deepEqual(deleted, []);
});

test('remise à neuf : tout est supprimé sauf le salon de la commande et les tickets ouverts', async () => {
  const { wipeChannels } = require('../src/commands/admin/setup')._internal;
  const { guild, deleted, cache } = fakeChannels([
    { id: 'cat', name: '🛡️ STAFF', type: ChannelType.GuildCategory },
    { id: 'staff', name: '🛡️┃staff', type: ChannelType.GuildText, parentId: 'cat' },
    { id: 'gen', name: '💬┃général', type: ChannelType.GuildText },
    { id: 'rules', name: '📜┃règles', type: ChannelType.GuildText, undeletable: true },
    { id: 'ticket', name: 'ticket-steve', type: ChannelType.GuildText },
  ]);
  const g = db.guild('wipe');
  Object.assign(g.channels, { staff: 'staff', general: 'gen', rules: 'rules' });
  g.messages.info = { channelId: 'gen', messageId: 'm' };
  const r = await wipeChannels(guild, g, new Set(['staff', 'ticket']));
  assert.equal(r.deleted, 2, '#général + la catégorie');
  assert.deepEqual(r.failed, ['📜┃règles']);
  assert.deepEqual([...cache.keys()].sort(), ['rules', 'staff', 'ticket']);
  assert.deepEqual(g.channels, { staff: 'staff', rules: 'rules' }, 'la base oublie les salons supprimés');
  assert.equal(g.messages.info, undefined);
  assert.ok(deleted.indexOf('🛡️ STAFF') > deleted.indexOf('💬┃général'), 'catégories supprimées en dernier');
});

test('remise à neuf : confirmation obligatoire, et retrouvée par nom pour les salons retirés', () => {
  assert.deepEqual(require('../src/handlers/setupReset').prefixes, ['setup_reset']);
  const { coreName } = require('../src/commands/admin/setup')._internal;
  const names = config.removed.channelNames.map(coreName);
  for (const old of ['🐛┃bugs', '🟢┃statut-serveur', '📊┃statut-serveur']) assert.ok(names.includes(coreName(old)), old);
});
