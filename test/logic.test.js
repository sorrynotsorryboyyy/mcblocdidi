// Logique pure : durées, auto-mod, tirage, détection d'invitation, URL de partenaire.
require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration, formatDuration } = require('../src/utils/helpers');
const { detect } = require('../src/events/messageCreate');
const { pickWinners } = require('../src/utils/giveaways');
const { findUsedInvite } = require('../src/utils/invites');

test('parseDuration / formatDuration', () => {
  assert.equal(parseDuration('1h30m'), 5_400_000);
  assert.equal(parseDuration('2j'), 2 * 864e5);
  assert.equal(parseDuration('abc'), null);
  assert.equal(parseDuration('5x'), null);
  assert.equal(formatDuration(5_400_000), '1h 30min');
});

test('auto-mod : invitations, mentions, spam', () => {
  const msg = (content, author, users = 0) => ({ content, author: { id: author }, mentions: { users: { size: users }, roles: { size: 0 }, everyone: false } });
  assert.equal(detect(msg('rejoins discord.gg/abc', 'a'))?.type, 'invite');
  assert.equal(detect(msg('https://discord.com/invite/xyz', 'b'))?.type, 'invite');
  assert.equal(detect(msg('salut', 'c', 6))?.type, 'mentions');
  assert.equal(detect(msg('salut', 'd', 2)), null);
  let hit;
  for (let i = 0; i < 6; i++) hit = detect(msg(`spam ${i}`, 'e'));
  assert.equal(hit?.type, 'spam');
});

test('giveaway : gagnants distincts, reroll exclut les anciens', () => {
  assert.equal(new Set(pickWinners(['a', 'b', 'c', 'd'], 2)).size, 2);
  assert.deepEqual(pickWinners(['a'], 3), ['a']);
  assert.deepEqual(pickWinners(['a', 'b', 'c', 'd'], 2, ['a', 'b']).sort(), ['c', 'd']);
});

test('invitations : détection de l\'invitation utilisée', () => {
  const snap = (entries) => new Map(entries.map(([code, uses, inviterId, maxUses = 0]) => [code, { uses, inviterId, maxUses }]));
  const before = snap([['aaa', 3, 'u1'], ['bbb', 0, 'u2'], ['once', 0, 'u3', 1]]);
  assert.deepEqual(findUsedInvite(before, snap([['aaa', 4, 'u1'], ['bbb', 0, 'u2'], ['once', 0, 'u3', 1]])), { code: 'aaa', inviterId: 'u1' });
  // Invitation à usage unique : Discord la supprime après usage
  assert.deepEqual(findUsedInvite(before, snap([['aaa', 3, 'u1'], ['bbb', 0, 'u2']])), { code: 'once', inviterId: 'u3' });
  // Nouvelle invitation créée puis utilisée avant d'être en cache
  assert.deepEqual(findUsedInvite(before, snap([['aaa', 3, 'u1'], ['bbb', 0, 'u2'], ['once', 0, 'u3', 1], ['new', 1, 'u4']])), { code: 'new', inviterId: 'u4' });
  // Deux arrivées simultanées : on ne devine pas
  assert.equal(findUsedInvite(before, snap([['aaa', 4, 'u1'], ['bbb', 1, 'u2'], ['once', 0, 'u3', 1]])), null);
  assert.equal(findUsedInvite(before, before), null);
});
