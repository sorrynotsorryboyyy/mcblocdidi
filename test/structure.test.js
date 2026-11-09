// Toutes les commandes, embeds, panneaux et formulaires se construisent sans erreur (validation discord.js).
const { fakeGuild } = require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const config = require('../config');
const { loadCommands } = require('../src/utils/commands');
const E = require('../src/utils/embeds');

test('toutes les commandes sont valides et uniques', () => {
  const cmds = loadCommands();
  assert.ok(cmds.size >= 20);
  for (const cmd of cmds.values()) {
    assert.equal(typeof cmd.execute, 'function', cmd.data.name);
    cmd.data.toJSON();
  }
});

test('tous les events et handlers se chargent', () => {
  for (const dir of ['events', 'handlers']) {
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', dir))) require(`../src/${dir}/${f}`);
  }
});

test('les préfixes de boutons/menus ne se chevauchent pas', () => {
  const seen = new Map();
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', 'handlers'))) {
    for (const p of require(`../src/handlers/${f}`).prefixes) {
      assert.ok(!seen.has(p), `préfixe « ${p} » déclaré dans ${f} et ${seen.get(p)}`);
      seen.set(p, f);
    }
  }
});

test('panneaux et embeds', () => {
  const guild = fakeGuild();
  for (const fn of ['rulesPanel', 'verifyPanel', 'infoPanel', 'rolesPanel', 'ticketPanel', 'partnersAdminPanel']) {
    const p = E[fn](guild);
    p.embeds.forEach((e) => e.toJSON());
    p.components.forEach((c) => c.toJSON());
  }
  E.statusEmbed({ online: false }).toJSON();
  E.statusEmbed({ online: true, players: { online: 3, max: 50, sample: ['a'] }, version: '1.21', motd: 'x', latency: 20 }).toJSON();
  E.partnerMessage({ name: 'X', description: 'Y', website: 'https://a.fr/', discord: null, image: null }).components[0].toJSON();
  E.giveawayMessage({ id: 'x', prize: 'VIP', winners: 1, endsAt: Date.now(), hostId: '1', participants: [], winnerIds: [], ended: true }).embeds[0].toJSON();
  E.suggestionMessage({ id: 'a', number: 1, authorTag: 'a', text: 'idée', up: [], down: [], status: 'pending' }).components[0].toJSON();
});

test('formulaires de tickets valides (5 champs max, libellés ≤ 45)', () => {
  for (const t of config.ticketTypes) {
    assert.ok(t.fields.length <= 5, t.id);
    new ModalBuilder().setCustomId(`ticket_modal:${t.id}`).setTitle(`${t.emoji} ${t.label}`.slice(0, 45))
      .addComponents(t.fields.map((f) => new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId(f.id).setLabel(f.label).setRequired(f.required !== false).setMaxLength(f.max ?? 1000)
        .setStyle(f.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)))).toJSON();
  }
});

test('config : clés de salons et de rôles uniques', () => {
  const keys = config.categories.flatMap((c) => [c.key, ...c.channels.map((ch) => ch.key)]);
  assert.equal(new Set(keys).size, keys.length, 'clé de salon en double');
  const names = Object.values(config.roles).map((r) => r.name);
  assert.equal(new Set(names).size, names.length, 'nom de rôle en double');
  const games = config.minigames.map((g) => g.id);
  assert.equal(new Set(games).size, games.length, 'mini-jeu en double');
});
