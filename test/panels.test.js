// Anti-doublons : ensurePanel ne crée jamais deux exemplaires du même embed.
const { fakeGuild } = require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Collection } = require('discord.js');
const db = require('../src/utils/db');
const { ensurePanel, byTitle } = require('../src/utils/panels');

/** Salon simulé : garde ses messages en mémoire. */
function fakeChannel(initial = []) {
  let next = 1000;
  const messages = [...initial];
  const wrap = (m) => Object.assign(m, {
    edit: async (p) => { m.embeds = p.embeds.map((e) => e.toJSON?.() ?? e); return m; },
    delete: async () => { messages.splice(messages.indexOf(m), 1); },
  });
  messages.forEach(wrap);
  return {
    id: 'chan',
    messages: {
      fetch: async (opt) => {
        if (typeof opt === 'string') {
          const m = messages.find((x) => x.id === opt);
          if (!m) throw Object.assign(new Error('Unknown Message'), { code: 10008 });
          return m;
        }
        return new Collection([...messages].reverse().map((m) => [m.id, m]));
      },
    },
    send: async (p) => {
      const m = wrap({ id: String(next++), author: { id: 'bot' }, embeds: p.embeds.map((e) => e.toJSON?.() ?? e) });
      messages.push(m);
      return m;
    },
    all: () => messages,
  };
}

function setup(channel) {
  const guild = fakeGuild('panels');
  guild.channels.cache.set(channel.id, channel);
  db.guild(guild.id).channels.board = channel.id;
  return guild;
}

const payload = (title) => ({ embeds: [{ title }], components: [] });

test('deux appels successifs = un seul message', async () => {
  const channel = fakeChannel();
  const guild = setup(channel);
  await ensurePanel(guild, 'p', 'board', payload('Panneau'));
  await ensurePanel(guild, 'p', 'board', payload('Panneau'));
  assert.equal(channel.all().length, 1);
});

test('base vide + doublons existants → on garde le plus récent, on supprime les autres', async () => {
  const bot = (id) => ({ id, author: { id: 'bot' }, embeds: [{ title: 'Panneau' }] });
  const channel = fakeChannel([bot('1'), bot('2'), bot('3')]);
  const guild = setup(channel);
  db.guild(guild.id).messages = {};
  const removed = await ensurePanel(guild, 'p', 'board', payload('Panneau'));
  assert.equal(removed, 2);
  assert.deepEqual(channel.all().map((m) => m.id), ['3']);
});

test('salon partagé : seul le panneau visé est dédoublonné', async () => {
  const channel = fakeChannel([
    { id: '1', author: { id: 'bot' }, embeds: [{ title: 'Classement' }] },
    { id: '2', author: { id: 'bot' }, embeds: [{ title: 'Arrivée de Bob' }] },
    { id: '3', author: { id: 'bot' }, embeds: [{ title: 'Classement' }] },
    { id: '4', author: { id: 'humain' }, embeds: [{ title: 'Classement' }] },
  ]);
  const guild = setup(channel);
  db.guild(guild.id).messages = {};
  await ensurePanel(guild, 'board', 'board', payload('Classement'), { match: byTitle('Classement') });
  assert.deepEqual(channel.all().map((m) => m.id).sort(), ['2', '3', '4']);
});
