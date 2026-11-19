// Arrivée en 3 étapes, avant d'accéder à tout le serveur :
//   1. #vérification : âge          → "verify_accept:minor" | "verify_accept:adult"  (rôle d'âge → #règles visible)
//   2. #règles       : « J'accepte » → "rules_accept"                                (📜 Règlement accepté → #guide visible)
//   3. #guide        : « J'ai lu »   → "guide_read"                                  (✅ Membre : tout le serveur)
// Les membres déjà ✅ Membre ne repassent jamais par ces étapes (un clic met juste leur âge à jour).
const config = require('../../config');
const { getRole, getChannel, replyEphemeral, setAgeRole } = require('../utils/helpers');
const { success, error, base } = require('../utils/embeds');
const invites = require('../utils/invites');

const AGE_KEYS = { minor: 'ageMinor', adult: 'ageAdult' };
const ageRoleKeys = () => Object.entries(config.roles).filter(([, d]) => d.age).map(([k]) => k);

/** Étape suivante, en message privé (éphémère). */
const next = (text) => base(config.colors.success).setDescription(text);

async function chooseAge(interaction, arg) {
  const { member, guild } = interaction;
  const ageKey = AGE_KEYS[arg] ?? null;
  if (!ageKey) return replyEphemeral(interaction, { embeds: [error('Choisis ton âge avec l\'un des deux boutons.')] });
  if (!await setAgeRole(member, ageKey)) return replyEphemeral(interaction, { embeds: [error('Le serveur n\'est pas configuré. Un admin doit lancer `/setup`.')] });

  const memberRole = getRole(guild, 'member');
  if (memberRole && member.roles.cache.has(memberRole.id)) return replyEphemeral(interaction, { embeds: [success('Ton âge a été mis à jour.')] });
  const rules = getChannel(guild, 'rules');
  return replyEphemeral(interaction, {
    embeds: [next(`✅ **Étape 1/3 terminée !**\n\n➡️ Lis maintenant le règlement dans ${rules ?? '#règles'} et clique sur **J'accepte le règlement**.`)],
  });
}

async function acceptRules(interaction) {
  const { member, guild } = interaction;
  const memberRole = getRole(guild, 'member');
  const accepted = getRole(guild, 'rulesAccepted');
  if (!memberRole || !accepted) return replyEphemeral(interaction, { embeds: [error('Le serveur n\'est pas configuré. Un admin doit lancer `/setup`.')] });
  if (member.roles.cache.has(memberRole.id)) return replyEphemeral(interaction, { embeds: [success('Tu as déjà accepté le règlement. Merci !')] });

  const hasAge = ageRoleKeys().some((k) => { const r = getRole(guild, k); return r && member.roles.cache.has(r.id); });
  if (!hasAge) {
    const verify = getChannel(guild, 'verify');
    return replyEphemeral(interaction, { embeds: [error(`Indique d'abord ton âge dans ${verify ?? '#vérification'}.`)] });
  }
  if (!member.roles.cache.has(accepted.id)) await member.roles.add(accepted, 'Règlement accepté');
  const guide = getChannel(guild, 'guide');
  return replyEphemeral(interaction, {
    embeds: [next(`✅ **Étape 2/3 terminée !**\n\n➡️ Dernière étape : parcours ${guide ?? '#guide'} puis clique sur **J'ai lu le guide** tout en bas.`)],
  });
}

async function readGuide(interaction) {
  const { member, guild } = interaction;
  const memberRole = getRole(guild, 'member');
  const accepted = getRole(guild, 'rulesAccepted');
  if (!memberRole) return replyEphemeral(interaction, { embeds: [error('Le serveur n\'est pas configuré. Un admin doit lancer `/setup`.')] });
  if (member.roles.cache.has(memberRole.id)) return replyEphemeral(interaction, { embeds: [success('Tu as déjà accès à tout le serveur. Bon jeu ! 🎮')] });
  if (!accepted || !member.roles.cache.has(accepted.id)) {
    const rules = getChannel(guild, 'rules');
    return replyEphemeral(interaction, { embeds: [error(`Accepte d'abord le règlement dans ${rules ?? '#règles'}.`)] });
  }

  await member.roles.add(memberRole, 'Règlement accepté et guide lu');
  const done = [accepted, getRole(guild, 'unverified')].filter((r) => r && member.roles.cache.has(r.id));
  if (done.length) await member.roles.remove(done, 'Arrivée terminée').catch(() => null);
  invites.onVerified(member); // condition de validation du parrainage

  const ch = (key, label) => getChannel(guild, key) ?? label;
  return replyEphemeral(interaction, {
    embeds: [next(
      '🎉 **Bienvenue, tu as maintenant accès à tout le serveur !**\n\n'
      + `🎭 Choisis tes notifications dans ${ch('roles', '#rôles')}\n`
      + `🔗 Relie ton compte Minecraft avec \`/lier\` dans ${ch('botCommands', '#commandes-bot')}\n`
      + `🌐 IP et liens utiles : ${ch('info', '#infos-serveur')}\n\nBon jeu ! 🎮`,
    )],
  });
}

module.exports = {
  prefixes: ['verify_accept', 'rules_accept', 'guide_read'],
  async handle(interaction, arg, prefix) {
    if (prefix === 'rules_accept') return acceptRules(interaction);
    if (prefix === 'guide_read') return readGuide(interaction);
    return chooseAge(interaction, arg);
  },
};
