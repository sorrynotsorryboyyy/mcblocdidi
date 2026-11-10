// /daily : pièces en jeu une fois par jour (heure de Paris), avec bonus de série.
const config = require('../../config');
const db = require('./db');
const { queueReward } = require('./rewards');

/** Date du jour « AAAA-MM-JJ » dans le fuseau configuré. */
function today(now = new Date(), timeZone = config.daily.timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Nombre de jours entre deux dates « AAAA-MM-JJ ». */
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
}

/** Montant pour une série donnée (1 = premier jour). */
function amountFor(streak) {
  const { baseCoins, streakBonusPercent, maxBonusPercent } = config.daily;
  const bonus = Math.min(maxBonusPercent, (streak - 1) * streakBonusPercent);
  return Math.round(baseCoins * (1 + bonus / 100));
}

/**
 * Réclame la récompense du jour.
 * @returns {{ok:true, amount, streak, day} | {ok:false, reason:'already', next}}
 */
function claim(guild, userId, now = new Date()) {
  const g = db.guild(guild.id);
  const day = today(now);
  const rec = g.daily[userId] ?? { last: null, streak: 0 };
  if (rec.last === day) return { ok: false, reason: 'already', streak: rec.streak };

  const streak = rec.last && daysBetween(rec.last, day) === 1 ? rec.streak + 1 : 1;
  const amount = amountFor(streak);
  g.daily[userId] = { last: day, streak };
  db.save();
  queueReward(guild, `daily:${userId}:${day}`, userId, {
    type: 'coins', amount, label: `${amount} pièces (récompense quotidienne, série de ${streak} j)`,
  });
  return { ok: true, amount, streak, day };
}

module.exports = { claim, today, daysBetween, amountFor };
