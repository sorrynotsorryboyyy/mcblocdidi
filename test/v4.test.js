// Nom MCBLOC, mini-jeux renommés, âge à la vérification, menus de #rôles, salons spoilers / Communauté.
const { fakeGuild } = require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const db = require('../src/utils/db');
const E = require('../src/utils/embeds');
const { allRoleDefs, findGame } = require('../src/utils/helpers');

test('pied de page « MCBLOC • play.mcbloc.fr »', () => {
  if (!process.env.MC_HOST) assert.equal(config.footer, 'MCBLOC • play.mcbloc.fr');
  assert.equal(E.base().toJSON().footer.text, config.footer);
  assert.equal(config.serverName, 'MCBLOC');
});

test('mini-jeux : SumoGames remplace Sumo Tower, anciens ids reconnus', () => {
  assert.deepEqual(config.minigames.map((g) => g.id), ['piggy-wars', 'sumogames', 'corewars']);
  assert.equal(findGame('sumo-tower').name, 'SumoGames');
  assert.equal(findGame('fallen-clan').name, 'CoreWars');
  assert.equal(findGame('inconnu'), null);
  for (const g of config.minigames) assert.ok(!g.description.includes('compléter'), `${g.id} sans description`);
});

test('vérification : deux boutons d\'âge', () => {
  const row = E.verifyPanel(fakeGuild()).components[0].toJSON();
  assert.deepEqual(row.components.map((b) => b.custom_id), ['verify_accept:minor', 'verify_accept:adult']);
});

test('#rôles : menu notifications + menu âge à choix unique', () => {
  const guild = fakeGuild('roles');
  const g = db.guild(guild.id);
  for (const d of allRoleDefs()) {
    g.roles[d.key] = `r_${d.key}`;
    guild.roles.cache.set(`r_${d.key}`, { id: `r_${d.key}`, name: d.name });
  }
  const [notif, age] = E.rolesPanel(guild).components.map((c) => c.toJSON().components[0]);
  assert.equal(notif.custom_id, 'roles_select');
  for (const key of ['notifUpdates', 'notifGiveaways', 'notifStatus', 'notifPolls']) {
    assert.ok(notif.options.some((o) => o.value === key), `${key} manquant`);
  }
  assert.ok(!notif.options.some((o) => o.value.startsWith('age')), 'l\'âge n\'est pas dans les notifications');
  assert.equal(age.custom_id, 'age_select');
  assert.equal(age.max_values, 1);
  assert.deepEqual(age.options.map((o) => o.value), ['ageMinor', 'ageAdult']);
});

test('salons : #spoilers (lecture seule), #discord-updates (staff), #annonces convertible', () => {
  const all = config.categories.flatMap((c) => c.channels.map((ch) => ({ ...ch, cat: c.key })));
  const spoilers = all.find((c) => c.key === 'spoilers');
  assert.equal(spoilers.access, 'readonly');
  assert.equal(spoilers.cat, 'catGames');
  assert.equal(all.find((c) => c.key === 'discordUpdates').access, 'staff');
  assert.equal(all.find((c) => c.key === 'announcements').announcement, true);
});
