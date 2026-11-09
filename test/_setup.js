// Isole chaque fichier de test dans un dossier de données temporaire (jamais la vraie base).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mcblocdidi-test-'));
delete process.env.DB_SEED;

/** Faux serveur Discord minimal pour les fonctions qui ne font que lire le cache. */
function fakeGuild(id = 'g1') {
  return {
    id,
    iconURL: () => null,
    memberCount: 42,
    channels: { cache: new Map() },
    roles: { cache: new Map() },
    members: { cache: new Map(), me: { id: 'bot' } },
    client: { users: { fetch: async () => null } },
  };
}

module.exports = { fakeGuild };
