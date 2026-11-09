// Fabriques d'embeds et de panneaux (embed + boutons/menus).
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
} = require('discord.js');
const config = require('../../config');
const { allRoleDefs, getChannel, getRole } = require('./helpers');

const { colors } = config;
const ip = () => (config.minecraft.port === 25565 ? config.minecraft.host : `${config.minecraft.host}:${config.minecraft.port}`);

function base(color = colors.primary) {
  return new EmbedBuilder().setColor(color).setFooter({ text: config.serverName }).setTimestamp();
}

const success = (desc) => base(colors.success).setDescription(`✅ ${desc}`);
const error = (desc) => base(colors.error).setDescription(`❌ ${desc}`);

// ---------- Panneaux postés par /setup ----------

function rulesPanel(guild) {
  const verify = getChannel(guild, 'verify');
  const embed = base()
    .setTitle(`📜 Règlement de ${config.serverName}`)
    .setDescription(
      config.rules.map((r, i) => `**${i + 1}.** ${r}`).join('\n\n')
      + `\n\n> Le non-respect du règlement peut entraîner un avertissement, un mute, un kick ou un ban.`
      + (verify ? `\n\n➡️ Une fois lu, rends-toi dans ${verify} pour accepter le règlement.` : ''),
    )
    .setThumbnail(guild.iconURL());
  return { embeds: [embed], components: [] };
}

function verifyPanel(guild) {
  const rules = getChannel(guild, 'rules');
  const embed = base(colors.info)
    .setTitle('✅ Vérification')
    .setDescription(
      `Bienvenue sur **${config.serverName}** !\n\n`
      + `1️⃣ Lis le règlement${rules ? ` dans ${rules}` : ''}.\n`
      + '2️⃣ Clique sur le bouton ci-dessous pour l\'accepter et accéder au serveur.',
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify_accept').setLabel('J\'accepte le règlement').setEmoji('✅').setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

function infoPanel(guild) {
  const embed = base()
    .setTitle(`ℹ️ ${config.serverName} — Infos serveur`)
    .setDescription('Serveur Minecraft **mini-jeux** ! Rejoins-nous avec l\'adresse ci-dessous.')
    .addFields(
      { name: '🌐 Adresse IP', value: `\`\`\`${ip()}\`\`\``, inline: false },
      { name: '🧩 Version', value: config.minecraft.version, inline: true },
      { name: '☕ Édition', value: 'Java', inline: true },
      {
        name: '🎮 Mini-jeux',
        value: config.minigames.map((g) => `${g.emoji} **${g.name}**`).join('\n') || '—',
        inline: false,
      },
    )
    .setThumbnail(guild.iconURL());

  const buttons = Object.entries(config.links)
    .filter(([, url]) => url)
    .map(([label, url]) => new ButtonBuilder().setLabel(label[0].toUpperCase() + label.slice(1)).setURL(url).setStyle(ButtonStyle.Link));
  return { embeds: [embed], components: buttons.length ? [new ActionRowBuilder().addComponents(buttons.slice(0, 5))] : [] };
}

function statusEmbed(s) {
  if (!s.online) {
    return base(colors.error)
      .setTitle('🔴 Serveur hors ligne')
      .setDescription(`Le serveur \`${ip()}\` ne répond pas pour le moment.`)
      .addFields({ name: '🔄 Dernière vérification', value: `<t:${Math.floor(Date.now() / 1000)}:R>` });
  }
  const embed = base(colors.success)
    .setTitle('🟢 Serveur en ligne')
    .addFields(
      { name: '🌐 IP', value: `\`${ip()}\``, inline: true },
      { name: '👥 Joueurs', value: `**${s.players.online}** / ${s.players.max}`, inline: true },
      { name: '📶 Latence', value: `${s.latency} ms`, inline: true },
      { name: '🧩 Version', value: s.version || '—', inline: true },
      { name: '🔄 Dernière vérification', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
    );
  if (s.motd) embed.setDescription(`\`\`\`${s.motd.slice(0, 500)}\`\`\``);
  if (s.players.sample.length) {
    embed.addFields({ name: '🎮 En jeu', value: s.players.sample.slice(0, 15).map((n) => `\`${n}\``).join(', ').slice(0, 1024) });
  }
  return embed;
}

function rolesPanel(guild) {
  const options = allRoleDefs()
    .filter((d) => d.selfAssign && getRole(guild, d.key))
    .slice(0, 25)
    .map((d) => ({
      label: d.name.replace(/^\S+\s/, ''), // retire l'emoji du label
      value: d.key,
      description: d.description?.slice(0, 100),
      emoji: d.name.split(' ')[0],
    }));

  const embed = base(colors.info)
    .setTitle('🎭 Choisis tes rôles')
    .setDescription(
      'Sélectionne un rôle dans le menu pour **l\'ajouter**, sélectionne-le à nouveau pour **le retirer**.\n\n'
      + options.map((o) => `${o.emoji} **${o.label}** — ${o.description ?? ''}`).join('\n'),
    );
  const components = options.length ? [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('roles_select')
      .setPlaceholder('Clique ici pour choisir tes rôles')
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(options),
  )] : [];
  return { embeds: [embed], components };
}

function ticketPanel() {
  const types = config.ticketTypes.slice(0, 25);
  const embed = base(colors.info)
    .setTitle('🎫 Support')
    .setDescription(
      'Besoin d\'aide ? Choisis la catégorie qui correspond à ta demande dans le menu ci-dessous '
      + 'pour ouvrir un **ticket privé** avec le staff.\n\n'
      + types.map((t) => `${t.emoji} **${t.label}** — ${t.description}`).join('\n')
      + '\n\n> ⚠️ Un seul ticket ouvert par personne. Tout abus sera sanctionné.',
    );
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_type')
      .setPlaceholder('🎫 Choisis une catégorie...')
      .addOptions(types.map((t) => ({ label: t.label, value: t.id, description: t.description.slice(0, 100), emoji: t.emoji }))),
  );
  return { embeds: [embed], components: [row] };
}

// ---------- Suggestions ----------

const SUGG_STATUS = {
  pending: { label: '🕒 En attente', color: colors.info },
  accepted: { label: '✅ Acceptée', color: colors.success },
  refused: { label: '❌ Refusée', color: colors.error },
};

function suggestionMessage(s) {
  const st = SUGG_STATUS[s.status];
  const total = s.up.length + s.down.length;
  const pct = total ? Math.round((s.up.length / total) * 100) : 0;
  const bar = total ? '🟩'.repeat(Math.round(pct / 10)) + '🟥'.repeat(10 - Math.round(pct / 10)) : '⬜'.repeat(10);

  const embed = base(st.color)
    .setAuthor({ name: s.authorTag, iconURL: s.authorAvatar ?? undefined })
    .setTitle(`💡 Suggestion #${s.number}`)
    .setDescription(s.text)
    .addFields(
      { name: 'Votes', value: `${bar}\n👍 **${s.up.length}** · 👎 **${s.down.length}** (${pct}% pour)`, inline: false },
      { name: 'Statut', value: st.label, inline: true },
    );
  if (s.status !== 'pending') {
    embed.addFields({ name: 'Réponse du staff', value: `${s.reason || '—'}\n— <@${s.staffId}>`, inline: false });
  }

  const locked = s.status !== 'pending';
  const components = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sugg_up:${s.id}`).setEmoji('👍').setLabel(String(s.up.length)).setStyle(ButtonStyle.Success).setDisabled(locked),
    new ButtonBuilder().setCustomId(`sugg_down:${s.id}`).setEmoji('👎').setLabel(String(s.down.length)).setStyle(ButtonStyle.Danger).setDisabled(locked),
    new ButtonBuilder().setCustomId(`sugg_accept:${s.id}`).setEmoji('✅').setLabel('Accepter').setStyle(ButtonStyle.Secondary).setDisabled(locked),
    new ButtonBuilder().setCustomId(`sugg_refuse:${s.id}`).setEmoji('❌').setLabel('Refuser').setStyle(ButtonStyle.Secondary).setDisabled(locked),
  )];
  return { embeds: [embed], components };
}

// ---------- Partenaires ----------

/** Fiche publique d'un partenaire (salon #partenaires). */
function partnerMessage(p) {
  const embed = base(p.color ?? 0x9b59b6)
    .setTitle(`🤝 ${p.name}`)
    .setDescription(p.description);
  if (p.image) embed.setThumbnail(p.image);
  if (p.website) embed.addFields({ name: '🌐 Site', value: p.website, inline: true });
  if (p.discord) embed.addFields({ name: '💬 Discord', value: p.discord, inline: true });

  const buttons = [];
  if (p.website) buttons.push(new ButtonBuilder().setLabel('Site web').setEmoji('🌐').setStyle(ButtonStyle.Link).setURL(p.website));
  if (p.discord) buttons.push(new ButtonBuilder().setLabel('Rejoindre le Discord').setEmoji('💬').setStyle(ButtonStyle.Link).setURL(p.discord));
  return { embeds: [embed], components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [] };
}

/** Panneau staff (salon #gestion-partenaires). */
function partnersAdminPanel() {
  const embed = base(0x9b59b6)
    .setTitle('🤝 Gestion des partenaires')
    .setDescription(
      'Gère ici les partenaires affichés dans le salon public **#partenaires**.\n\n'
      + '➕ **Ajouter** — crée une nouvelle fiche partenaire\n'
      + '✏️ **Gérer** — modifier ou retirer une fiche existante\n\n'
      + '> Champs : nom, description, site, invitation Discord, logo (URL d\'image).',
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('partner_add').setLabel('Ajouter un partenaire').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('partner_manage').setLabel('Gérer les partenaires').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

// ---------- Giveaways ----------

function giveawayMessage(gw) {
  const end = Math.floor(gw.endsAt / 1000);
  const embed = base(gw.ended ? colors.neutral : 0xff73fa)
    .setTitle(`🎉 GIVEAWAY — ${gw.prize}`)
    .setDescription(
      (gw.description ? `${gw.description}\n\n` : '')
      + (gw.ended
        ? `**Terminé** <t:${end}:R>\n🏆 Gagnant(s) : ${gw.winnerIds.length ? gw.winnerIds.map((id) => `<@${id}>`).join(', ') : 'aucun (pas assez de participants)'}`
        : `Clique sur 🎉 pour participer !\n⏰ Fin <t:${end}:R> (<t:${end}:f>)`),
    )
    .addFields(
      { name: '🏆 Gagnants', value: String(gw.winners), inline: true },
      { name: '👥 Participants', value: String(gw.participants.length), inline: true },
      { name: '🎙️ Organisé par', value: `<@${gw.hostId}>`, inline: true },
    )
    .setFooter({ text: `${config.serverName} • ID : ${gw.id}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw_join:${gw.id}`).setEmoji('🎉')
      .setLabel(gw.ended ? 'Terminé' : 'Participer').setStyle(ButtonStyle.Primary).setDisabled(gw.ended),
  );
  return { embeds: [embed], components: [row] };
}

// ---------- Bienvenue / départ ----------

function welcomeEmbed(member) {
  const rules = getChannel(member.guild, 'rules');
  const verify = getChannel(member.guild, 'verify');
  return base()
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setTitle('👋 Un nouveau joueur est arrivé !')
    .setDescription(
      `Bienvenue ${member} sur **${config.serverName}** !\n\n`
      + `${rules ? `📜 Lis le règlement : ${rules}\n` : ''}`
      + `${verify ? `✅ Puis valide-le dans ${verify}\n` : ''}`
      + `🌐 IP : \`${ip()}\``,
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields({ name: '👥 Membres', value: `Tu es le **${member.guild.memberCount}ème** membre !` });
}

function leaveEmbed(member) {
  return base(colors.neutral)
    .setDescription(`👋 **${member.user.tag}** a quitté le serveur. Nous sommes maintenant **${member.guild.memberCount}**.`);
}

// ---------- Mini-jeux ----------

function tournamentMessage(t, guild) {
  const game = config.minigames.find((g) => g.id === t.game);
  const list = t.participants.length
    ? t.participants.map((id, i) => `\`${String(i + 1).padStart(2, '0')}\` <@${id}>`).join('\n').slice(0, 1024)
    : '*Aucun inscrit pour le moment.*';
  const full = t.participants.length >= t.slots;

  const embed = base(t.closed ? colors.neutral : colors.warning)
    .setTitle(`🏆 Tournoi ${game ? `${game.emoji} ${game.name}` : t.game}${t.closed ? ' — Inscriptions closes' : ''}`)
    .setDescription(t.description || 'Inscris-toi avec le bouton ci-dessous !')
    .addFields(
      { name: '📅 Date', value: t.date, inline: true },
      { name: '👥 Places', value: `${t.participants.length} / ${t.slots}`, inline: true },
      { name: '🎙️ Organisé par', value: `<@${t.createdBy}>`, inline: true },
      { name: '📋 Inscrits', value: list },
    );
  if (guild?.iconURL()) embed.setThumbnail(guild.iconURL());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tournoi_join:${t.id}`).setLabel(full ? 'Complet' : 'S\'inscrire').setEmoji('✅')
      .setStyle(ButtonStyle.Success).setDisabled(t.closed || full),
    new ButtonBuilder().setCustomId(`tournoi_leave:${t.id}`).setLabel('Se désinscrire').setEmoji('❌')
      .setStyle(ButtonStyle.Secondary).setDisabled(t.closed),
    new ButtonBuilder().setCustomId(`tournoi_close:${t.id}`).setLabel(t.closed ? 'Rouvrir' : 'Clôturer').setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row] };
}

module.exports = {
  base, success, error, ip,
  rulesPanel, verifyPanel, infoPanel, statusEmbed, rolesPanel, ticketPanel,
  welcomeEmbed, leaveEmbed, tournamentMessage, suggestionMessage, giveawayMessage,
  partnerMessage, partnersAdminPanel,
};
