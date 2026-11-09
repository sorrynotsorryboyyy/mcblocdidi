// ============================================================
//  CONFIGURATION DU BOT — modifie ce fichier selon ton serveur
// ============================================================

module.exports = {
  // Nom affiché dans les embeds
  serverName: 'McBlocDidi',

  // Serveur Minecraft (Java)
  minecraft: {
    // Les variables d'environnement MC_HOST / MC_PORT (Railway) sont prioritaires
    host: process.env.MC_HOST || 'play.mcbloc.fr',
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
  //  `formerIds` : anciens ids → le salon et le rôle existants sont RENOMMÉS
  //  (messages conservés) au lieu d'être supprimés puis recréés.
  // ------------------------------------------------------------
  minigames: [
    { id: 'piggy-wars', name: 'Piggy Wars', emoji: '🐷', description: 'Description à compléter.' },
    { id: 'sumo-tower', name: 'Sumo Tower', emoji: '🗼', description: 'Description à compléter.' },
    { id: 'corewars', name: 'CoreWars', emoji: '🔮', description: 'Description à compléter.', formerIds: ['fallen-clan'] },
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
    member: { name: '✅ Membre', color: 0x95a5a6, hoist: false, permissions: [] },
    unverified: { name: '🔒 Non vérifié', color: 0x546e7a, hoist: false, permissions: [] },
    notifAnnonces: { name: '🔔 Annonces', color: 0x000000, hoist: false, permissions: [], selfAssign: true, description: 'Être notifié des annonces' },
    notifTournois: { name: '🏆 Tournois', color: 0x000000, hoist: false, permissions: [], selfAssign: true, description: 'Être notifié des tournois' },
    notifEvents: { name: '🎉 Events', color: 0x000000, hoist: false, permissions: [], selfAssign: true, description: 'Être notifié des events' },
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
        { key: 'announcements', name: '📢┃annonces', access: 'readonly', topic: 'Annonces officielles' },
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
      ],
    },
    {
      key: 'catGames', name: '🎮 MINI-JEUX',
      channels: [
        { key: 'gamesTalk', name: '🎮┃discussion-jeux', access: 'public' },
        { key: 'leaderboards', name: '🏅┃classements', access: 'readonly', topic: 'Classements et records' },
        { key: 'tournaments', name: '🏆┃tournois', access: 'readonly', topic: 'Inscriptions aux tournois' },
        { key: 'lfg', name: '🔎┃recherche-équipe', access: 'public', topic: 'Utilise /lfg pour trouver des joueurs' },
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
      ],
    },
  ],
};
