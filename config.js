// ============================================================
//  CONFIGURATION DU BOT — modifie ce fichier selon ton serveur
// ============================================================

const SERVER_NAME = 'MCBLOC';
// Les variables d'environnement MC_HOST / MC_PORT (Railway) sont prioritaires
const MC_HOST = process.env.MC_HOST || 'play.mcbloc.fr';

module.exports = {
  // Nom affiché dans les titres des embeds (ex. « Règlement de MCBLOC »)
  serverName: SERVER_NAME,
  // Pied de page de tous les embeds
  footer: `${SERVER_NAME} • ${MC_HOST}`,

  // Serveur Minecraft (Java)
  minecraft: {
    host: MC_HOST,
    port: Number(process.env.MC_PORT) || 25565,
    version: '1.8 - 1.21',      // texte affiché dans /ip et #infos-serveur
  },

  // Liens affichés dans #infos-serveur (laisse '' pour masquer)
  links: {
    site: '',
    boutique: '',
    vote: '',
  },

  // Couleurs des embeds
  colors: {
    primary: 0x2ecc71,
    success: 0x57f287,
    error: 0xed4245,
    warning: 0xfee75c,
    info: 0x5865f2,
    neutral: 0x2b2d31,
  },

  // Mise à jour de l'embed de statut (ms)
  statusInterval: 60_000,

  // Cooldown de /lfg par membre (ms)
  lfgCooldown: 5 * 60_000,

  // Durée de timeout max pour /mute (minutes)
  maxMuteMinutes: 28 * 24 * 60,

  // Mise à jour des salons compteurs (ms) — Discord limite les renommages, ne descends pas sous 5 min
  counterInterval: 10 * 60_000,

  // Annonce dans #annonces (ping 🔔 Annonces) quand le serveur Minecraft repasse en ligne
  announceOnline: true,

  // ------------------------------------------------------------
  //  PARRAINAGE : récompense en jeu quand un membre invite quelqu'un
  //  Conditions : compte Discord de l'invité > minAccountAgeDays, règlement accepté,
  //  et toujours présent après holdDays jours. Une seule récompense par invité, à vie.
  // ------------------------------------------------------------
  invites: {
    enabled: true,
    rewardCoins: Number(process.env.INVITE_REWARD) || 500,
    minAccountAgeDays: 7,
    holdDays: 3,
  },

  // ------------------------------------------------------------
  //  BOOSTS : chaque boost acheté = X mois de VIP en jeu (cumulable)
  //  + rôle 💎 VIP sur Discord tant que le membre booste
  // ------------------------------------------------------------
  boosts: {
    enabled: true,
    vipMonthsPerBoost: 1,
    vipRank: 'vip', // id du grade dans mcblocManager
  },

  // Liaison Discord ↔ Minecraft (/lier) : durée de validité d'un code
  linkCodeMinutes: 10,
  // Après /lier : rôle 🔗 Compte lié + surnom Discord = pseudo Minecraft
  linkSetsNickname: true,

  // ------------------------------------------------------------
  //  LANCEMENT : /lancement creer → compte à rebours + bouton « Je serai là ! »
  //  Les 🚀 Pionniers reçoivent des pièces en jeu à l'ouverture (compte lié requis)
  // ------------------------------------------------------------
  launch: {
    pioneerCoins: 1000,
  },

  // ------------------------------------------------------------
  //  NIVEAUX DISCORD : XP en écrivant / en vocal → rôles + pièces aux paliers
  // ------------------------------------------------------------
  levels: {
    enabled: true,
    messageXp: [15, 25],       // XP aléatoire par message (min, max)
    messageCooldownSec: 60,    // 1 message compté par minute maximum
    minMessageLength: 3,
    voiceXpPerMinute: 10,      // seulement à 2 humains minimum, ni muet ni sourd
    // Paliers : rôle (clé de `roles`) + pièces en jeu, donnés une seule fois
    tiers: [
      { level: 5, role: 'level5', coins: 200 },
      { level: 10, role: 'level10', coins: 500 },
      { level: 20, role: 'level20', coins: 1000 },
      { level: 35, role: 'level35', coins: 2500 },
    ],
  },

  // /daily : pièces en jeu chaque jour (compte lié requis), bonus de série
  daily: {
    baseCoins: 100,
    streakBonusPercent: 20,   // +20 % par jour consécutif…
    maxBonusPercent: 100,     // …plafonné à +100 %
    timezone: 'Europe/Paris',
  },

  // ANTI-RAID : trop d'arrivées d'un coup → invitations en pause + vérification renforcée
  antiRaid: {
    enabled: true,
    joins: 10,
    windowSeconds: 30,
    lockMinutes: 15,
  },

  // Sauvegarde quotidienne de la base (heure de Paris) + alerte si le pont Minecraft se tait
  backup: { hour: 4, keep: 7 },
  bridgeAlertMinutes: 5,

  // ------------------------------------------------------------
  //  AUTO-MODÉRATION (le staff n'est jamais concerné)
  // ------------------------------------------------------------
  autoMod: {
    enabled: true,
    antiInvite: true,                                                   // supprime les invitations Discord + warn
    antiSpam: { enabled: true, maxMessages: 5, intervalMs: 5000, muteMinutes: 5 },
    antiMassMention: { enabled: true, maxMentions: 5 },                 // supprime + warn
    // Sanctions automatiques quand un membre atteint X avertissements
    warnThresholds: [
      { warns: 3, muteMinutes: 60 },
      { warns: 5, muteMinutes: 24 * 60 },
    ],
  },

  // ------------------------------------------------------------
  //  TYPES DE TICKETS (menu du panneau #ouvrir-un-ticket)
  //  fields : 5 max — style 'short' ou 'paragraph' — label 45 caractères max
  // ------------------------------------------------------------
  ticketTypes: [
    {
      id: 'support', label: 'Support', emoji: '❓', description: 'Une question ou besoin d\'aide',
      fields: [
        { id: 'pseudo', label: 'Ton pseudo Minecraft', style: 'short', required: false, max: 16 },
        { id: 'demande', label: 'Explique ta demande', style: 'paragraph', required: true, max: 1000 },
      ],
    },
    {
      id: 'signalement', label: 'Signaler un joueur', emoji: '🚨', description: 'Triche, insultes, comportement...',
      fields: [
        { id: 'pseudo', label: 'Ton pseudo Minecraft', style: 'short', required: false, max: 16 },
        { id: 'cible', label: 'Pseudo du joueur signalé', style: 'short', required: true, max: 32 },
        { id: 'faits', label: 'Que s\'est-il passé ? (+ liens de preuves)', style: 'paragraph', required: true, max: 1000 },
      ],
    },
    {
      id: 'boutique', label: 'Boutique', emoji: '🛒', description: 'Problème d\'achat ou de grade',
      fields: [
        { id: 'pseudo', label: 'Ton pseudo Minecraft', style: 'short', required: true, max: 16 },
        { id: 'commande', label: 'Article acheté / n° de commande', style: 'short', required: false, max: 100 },
        { id: 'probleme', label: 'Décris le problème', style: 'paragraph', required: true, max: 1000 },
      ],
    },
    {
      id: 'bug', label: 'Bug', emoji: '🐛', description: 'Un bug en jeu ou sur le Discord',
      fields: [
        { id: 'pseudo', label: 'Ton pseudo Minecraft', style: 'short', required: false, max: 16 },
        { id: 'jeu', label: 'Mini-jeu concerné', style: 'short', required: false, max: 50 },
        { id: 'bug', label: 'Décris le bug et comment le reproduire', style: 'paragraph', required: true, max: 1000 },
      ],
    },
    {
      id: 'candidature', label: 'Candidature staff', emoji: '📝', description: 'Postuler pour rejoindre l\'équipe',
      fields: [
        { id: 'pseudo', label: 'Ton pseudo Minecraft', style: 'short', required: true, max: 16 },
        { id: 'age', label: 'Ton âge', style: 'short', required: true, max: 3 },
        { id: 'dispo', label: 'Tes disponibilités', style: 'short', required: true, max: 100 },
        { id: 'experience', label: 'Ton expérience (modération, serveurs...)', style: 'paragraph', required: true, max: 1000 },
        { id: 'motivation', label: 'Pourquoi toi ?', style: 'paragraph', required: true, max: 1000 },
      ],
    },
  ],

  // ------------------------------------------------------------
  //  MINI-JEUX : un salon + un rôle de notif sont créés pour chacun
  //  (max 20). `id` = nom du salon, en minuscules sans espaces.
  //  `server` : nom du serveur BungeeCord (classements envoyés par le proxy).
  //  `formerIds` : anciens ids → le salon et le rôle existants sont RENOMMÉS
  //  (messages conservés) au lieu d'être supprimés puis recréés.
  // ------------------------------------------------------------
  minigames: [
    {
      id: 'piggy-wars', name: 'Piggy Wars', emoji: '🐷', server: 'piggywars',
      description: '3vs3 — lance des cochons sur tes adversaires pour les éliminer ou les pousser dans le vide !',
    },
    {
      id: 'sumogames', name: 'SumoGames', emoji: '🤼', formerIds: ['sumo-tower'], server: 'sumotower',
      description: 'Sumo classique avec des classes et du loot façon Survival Games — sois le dernier sur le ring !',
    },
    {
      id: 'corewars', name: 'CoreWars', emoji: '🔮', formerIds: ['fallen-clan'], server: 'corewars',
      description: '10vs10 — détruis le cœur de la base ennemie et protège le tien !',
    },
  ],

  // ------------------------------------------------------------
  //  RÈGLES affichées dans #règles
  // ------------------------------------------------------------
  rules: [
    'Respecte tous les membres : aucune insulte, discrimination ou harcèlement.',
    'Pas de spam, flood ou abus de majuscules.',
    'Aucune publicité sans autorisation du staff.',
    'Pas de contenu NSFW, choquant ou illégal.',
    'Utilise les bons salons pour chaque sujet.',
    'Triche, hacks et clients modifiés interdits sur le serveur Minecraft.',
    'Pas d\'usurpation d\'identité (staff ou joueurs).',
    'Les décisions du staff sont à respecter ; en cas de désaccord, ouvre un ticket.',
  ],

  // ------------------------------------------------------------
  //  RÔLES (créés du haut vers le bas de la hiérarchie)
  //  permissions : noms de PermissionFlagsBits de discord.js
  // ------------------------------------------------------------
  roles: {
    founder: { name: '👑 Fondateur', color: 0xe74c3c, hoist: true, permissions: ['Administrator'] },
    admin: { name: '🛡️ Admin', color: 0xe67e22, hoist: true, permissions: ['Administrator'] },
    moderator: {
      name: '🔨 Modérateur', color: 0x3498db, hoist: true,
      permissions: ['KickMembers', 'BanMembers', 'ModerateMembers', 'ManageMessages', 'MuteMembers', 'MoveMembers', 'ViewAuditLog'],
    },
    support: { name: '🎫 Support', color: 0x1abc9c, hoist: true, permissions: ['ManageMessages'] },
    vip: { name: '💎 VIP', color: 0xf1c40f, hoist: true, permissions: [] },
    partner: { name: '🤝 Partenaire', color: 0x9b59b6, hoist: true, permissions: [] },
    // Paliers de niveau Discord (voir `levels.tiers`)
    level35: { name: '👑 Légende', color: 0xe91e63, hoist: true, permissions: [] },
    level20: { name: '⚡ Vétéran', color: 0x9b59b6, hoist: false, permissions: [] },
    level10: { name: '🔥 Habitué', color: 0xe67e22, hoist: false, permissions: [] },
    level5: { name: '🌱 Actif', color: 0x2ecc71, hoist: false, permissions: [] },
    pioneer: { name: '🚀 Pionnier', color: 0x3498db, hoist: false, permissions: [] },
    linked: { name: '🔗 Compte lié', color: 0x000000, hoist: false, permissions: [] },
    member: { name: '✅ Membre', color: 0x95a5a6, hoist: false, permissions: [] },
    unverified: { name: '🔒 Non vérifié', color: 0x546e7a, hoist: false, permissions: [] },
    // Âge : choisi à la vérification (boutons) ou dans #rôles (menu « Ton âge »)
    ageMinor: { name: '🧒 -18 ans', color: 0x000000, hoist: false, permissions: [], age: true, description: 'J\'ai moins de 18 ans' },
    ageAdult: { name: '🧑 +18 ans', color: 0x000000, hoist: false, permissions: [], age: true, description: 'J\'ai 18 ans ou plus' },
    // Rôles de notifications (menu de #rôles)
    notifAnnonces: { name: '🔔 Annonces', color: 0x000000, hoist: false, permissions: [], selfAssign: true, description: 'Être notifié des annonces' },
    notifUpdates: { name: '🆕 Mises à jour', color: 0x000000, hoist: false, permissions: [], selfAssign: true, description: 'Nouveautés et patch notes du serveur' },
    notifStatus: { name: '🛠️ Statut serveur', color: 0x000000, hoist: false, permissions: [], selfAssign: true, description: 'Être prévenu quand le serveur redémarre' },
    notifTournois: { name: '🏆 Tournois', color: 0x000000, hoist: false, permissions: [], selfAssign: true, description: 'Être notifié des tournois' },
    notifEvents: { name: '🎉 Events', color: 0x000000, hoist: false, permissions: [], selfAssign: true, description: 'Être notifié des events' },
    notifGiveaways: { name: '🎁 Giveaways', color: 0x000000, hoist: false, permissions: [], selfAssign: true, description: 'Être notifié des giveaways' },
    notifPolls: { name: '📊 Sondages', color: 0x000000, hoist: false, permissions: [], selfAssign: true, description: 'Donner ton avis dans les sondages' },
    // + un rôle par mini-jeu, généré automatiquement (clé game_<id>)
  },

  // Rôles considérés comme staff (accès tickets, salons staff, tournois)
  staffRoles: ['founder', 'admin', 'moderator', 'support'],

  // ------------------------------------------------------------
  //  SALONS
  //  access : public | readonly | rules | verify | staff | voice | counter
  //  type   : text (défaut) | voice
  // ------------------------------------------------------------
  categories: [
    {
      key: 'catStats', name: '📊 STATISTIQUES', access: 'counter', top: true,
      channels: [
        { key: 'statMembers', name: '👥 Membres : …', type: 'voice', access: 'counter' },
        { key: 'statPlayers', name: '🎮 En jeu : …', type: 'voice', access: 'counter' },
        { key: 'statServer', name: '⏳ Serveur : …', type: 'voice', access: 'counter' },
      ],
    },
    {
      key: 'catInfo', name: '📌 INFORMATIONS',
      channels: [
        { key: 'rules', name: '📜┃règles', access: 'rules', topic: 'Les règles du serveur' },
        // announcement: true → converti en salon d'annonces (suivable) une fois la Communauté activée
        { key: 'announcements', name: '📢┃annonces', access: 'readonly', topic: 'Annonces officielles', announcement: true },
        { key: 'info', name: 'ℹ️┃infos-serveur', access: 'readonly', topic: 'IP, version et liens utiles' },
        { key: 'status', name: '📊┃statut-serveur', access: 'readonly', topic: 'Statut du serveur Minecraft en direct' },
        { key: 'roles', name: '🎭┃rôles', access: 'readonly', topic: 'Choisis tes rôles' },
        { key: 'partners', name: '🤝┃partenaires', access: 'readonly', topic: 'Nos partenaires' },
      ],
    },
    {
      key: 'catWelcome', name: '👋 ACCUEIL',
      channels: [
        { key: 'welcome', name: '👋┃bienvenue', access: 'readonly', topic: 'Arrivées et départs' },
        { key: 'verify', name: '✅┃vérification', access: 'verify', topic: 'Accepte le règlement pour accéder au serveur' },
      ],
    },
    {
      key: 'catCommunity', name: '💬 COMMUNAUTÉ',
      channels: [
        { key: 'general', name: '💬┃général', access: 'public' },
        { key: 'media', name: '📸┃médias', access: 'public', topic: 'Screens, vidéos, clips' },
        { key: 'suggestions', name: '💡┃suggestions', access: 'readonly', topic: 'Propose tes idées avec /suggestion' },
        { key: 'botCommands', name: '🤖┃commandes-bot', access: 'public' },
        { key: 'invites', name: '📨┃invitations', access: 'readonly', topic: 'Invite tes amis et gagne des pièces en jeu ! (/lier puis /invitations)' },
        { key: 'boosters', name: '🚀┃boosters', access: 'readonly', topic: 'Merci à nos boosters ! 1 boost = 1 mois de VIP en jeu' },
      ],
    },
    {
      key: 'catGames', name: '🎮 MINI-JEUX',
      channels: [
        { key: 'gamesTalk', name: '🎮┃discussion-jeux', access: 'public' },
        { key: 'leaderboards', name: '🏅┃classements', access: 'readonly', topic: 'Classements et records' },
        { key: 'tournaments', name: '🏆┃tournois', access: 'readonly', topic: 'Inscriptions aux tournois' },
        { key: 'lfg', name: '🔎┃recherche-équipe', access: 'public', topic: 'Utilise /lfg pour trouver des joueurs' },
        { key: 'spoilers', name: '👀┃spoilers', access: 'readonly', topic: 'Avant-premières : images et vidéos des mini-jeux et des maps' },
        { key: 'bugs', name: '🐛┃bugs', access: 'public', topic: 'Signale les bugs rencontrés en jeu' },
        // + un salon par mini-jeu (généré automatiquement)
      ],
    },
    {
      key: 'catSupport', name: '🎫 SUPPORT',
      channels: [
        { key: 'ticketPanel', name: '🎫┃ouvrir-un-ticket', access: 'readonly', topic: 'Choisis une catégorie pour contacter le staff' },
      ],
    },
    {
      key: 'catVoice', name: '🔊 VOCAUX',
      channels: [
        { key: 'voiceGeneral', name: '🔊 Général', type: 'voice', access: 'voice' },
        { key: 'voiceGame1', name: '🎮 Jeu 1', type: 'voice', access: 'voice' },
        { key: 'voiceGame2', name: '🎮 Jeu 2', type: 'voice', access: 'voice' },
      ],
    },
    {
      key: 'catStaff', name: '🛡️ STAFF', access: 'staff',
      channels: [
        { key: 'staff', name: '🛡️┃staff', access: 'staff' },
        { key: 'logs', name: '📋┃logs', access: 'staff' },
        { key: 'partnersAdmin', name: '🤝┃gestion-partenaires', access: 'staff', topic: 'Ajouter / modifier / retirer un partenaire' },
        { key: 'discordUpdates', name: '📣┃discord-updates', access: 'staff', topic: 'Messages officiels de Discord (Communauté)' },
        { key: 'gameSanctions', name: '🔨┃sanctions-en-jeu', access: 'staff', topic: 'Sanctions appliquées en jeu (envoyées par le proxy)' },
      ],
    },
  ],
};
