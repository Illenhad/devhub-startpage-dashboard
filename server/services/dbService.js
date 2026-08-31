import { createClient } from '@libsql/client';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemins vers les bases de données SQLite locales
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'devhub.sqlite');
const replicaDbPath = path.join(dataDir, 'devhub_replica.sqlite');
const oldDbPath = path.join(dataDir, 'machub.sqlite');
const envPath = path.join(__dirname, '..', '..', '.env');

if (fs.existsSync(oldDbPath) && !fs.existsSync(dbPath)) {
  try {
    fs.renameSync(oldDbPath, dbPath);
  } catch {}
}

/**
 * Charge les identifiants Turso depuis le fichier .env
 */
function loadEnvCredentials() {
  if (!fs.existsSync(envPath)) return {};
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const result = {};
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = match[2] || '';
        val = val.replace(/^['"]|['"]$/g, '').trim();
        result[match[1]] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Sauvegarde les identifiants Turso dans le fichier .env
 */
function saveEnvCredentials({ syncUrl, authToken, enabled }) {
  try {
    let existing = '';
    if (fs.existsSync(envPath)) {
      existing = fs.readFileSync(envPath, 'utf8');
    }

    const envMap = {};
    for (const line of existing.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        envMap[match[1]] = match[2] || '';
      }
    }

    if (syncUrl !== undefined) envMap['TURSO_DATABASE_URL'] = syncUrl;
    if (authToken !== undefined) envMap['TURSO_AUTH_TOKEN'] = authToken;
    if (enabled !== undefined) envMap['TURSO_SYNC_ENABLED'] = enabled ? 'true' : 'false';

    const lines = Object.entries(envMap).map(([k, v]) => `${k}=${v}`);
    fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
    console.log('📝 [Env] Identifiants Turso persistés dans le fichier .env');
  } catch (err) {
    console.warn('⚠️ [Env] Impossible d\'écrire dans .env:', err.message);
  }
}

const initialEnv = loadEnvCredentials();

let client = null;
let isReplicaActive = false;
let syncConfig = {
  syncUrl: initialEnv.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL || process.env.TURSO_SYNC_URL || '',
  authToken: initialEnv.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '',
  enabled: initialEnv.TURSO_SYNC_ENABLED !== undefined ? initialEnv.TURSO_SYNC_ENABLED === 'true' : true
};

let lastSyncAt = null;
let lastSyncStatus = 'idle'; // 'idle' | 'syncing' | 'success' | 'error'
let lastSyncError = null;
let isSyncing = false;
let syncIntervalId = null;
let debounceSyncTimeout = null;

/**
 * Migre les données locales (flux, mots-clés, articles) vers Turso Cloud si le réplica est vierge
 */
async function migrateLocalDataToReplica(localC, replicaC) {
  try {
    await createSchema(replicaC);
    const countRes = await replicaC.execute('SELECT COUNT(*) as count FROM rss_feeds');
    const feedCount = countRes.rows[0]?.count || 0;

    if (feedCount === 0) {
      console.log('📦 [Turso] Migration des données locales vers la base Cloud Turso...');

      // 1. Settings
      try {
        const settingsRes = await localC.execute("SELECT key, value FROM settings WHERE key NOT LIKE 'turso_%'");
        for (const row of settingsRes.rows) {
          await replicaC.execute({
            sql: 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            args: [row.key, row.value]
          });
        }
      } catch {}

      // 2. RSS Feeds
      try {
        const feedsRes = await localC.execute('SELECT id, name, url, category, icon, position FROM rss_feeds');
        for (const row of feedsRes.rows) {
          await replicaC.execute({
            sql: 'INSERT OR IGNORE INTO rss_feeds (id, name, url, category, icon, position) VALUES (?, ?, ?, ?, ?, ?)',
            args: [row.id, row.name, row.url, row.category, row.icon, row.position]
          });
        }
      } catch {}

      // 3. Watch Keywords
      try {
        const kwRes = await localC.execute('SELECT id, keyword, category, icon, enabled, position FROM watch_keywords');
        for (const row of kwRes.rows) {
          await replicaC.execute({
            sql: 'INSERT OR IGNORE INTO watch_keywords (id, keyword, category, icon, enabled, position) VALUES (?, ?, ?, ?, ?, ?)',
            args: [row.id, row.keyword, row.category, row.icon, row.enabled, row.position]
          });
        }
      } catch {}

      // 4. Read articles
      try {
        const readRes = await localC.execute('SELECT link, read_at FROM rss_read_articles');
        for (const row of readRes.rows) {
          await replicaC.execute({
            sql: 'INSERT OR IGNORE INTO rss_read_articles (link, read_at) VALUES (?, ?)',
            args: [row.link, row.read_at]
          });
        }
      } catch {}

      // 5. Synchroniser immédiatement vers Turso Cloud
      await replicaC.sync();
      console.log('✅ [Turso] Données locales publiées avec succès sur Turso Cloud !');
    }
  } catch (err) {
    console.warn('⚠️ [Turso] Note migration:', err.message);
  }
}

/**
 * Nettoie les fichiers de cache du réplica si l'état local a été corrompu ou interrompu
 */
function cleanReplicaFiles() {
  try {
    const dir = path.dirname(replicaDbPath);
    const base = path.basename(replicaDbPath);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.startsWith(base)) {
          try { fs.unlinkSync(path.join(dir, f)); } catch {}
        }
      }
    }
  } catch {}
}

async function createReplicaWithRetry(syncUrl, authToken) {
  const url = syncUrl.trim();
  const token = authToken.trim();

  try {
    const repClient = createClient({
      url: `file:${replicaDbPath}`,
      syncUrl: url,
      authToken: token
    });
    await repClient.sync();
    return repClient;
  } catch (err) {
    if (err.message.includes('InvalidLocalState') || err.message.includes('wal_index') || err.message.includes('metadata file')) {
      console.log('🔄 [Turso] Nettoyage du cache réplica suite à un état incomplet et réessai...');
      cleanReplicaFiles();
      try {
        const repClient = createClient({
          url: `file:${replicaDbPath}`,
          syncUrl: url,
          authToken: token
        });
        await repClient.sync();
        return repClient;
      } catch (retryErr) {
        cleanReplicaFiles();
        throw formatTursoError(retryErr);
      }
    }
    cleanReplicaFiles();
    throw formatTursoError(err);
  }
}

function formatTursoError(err) {
  const msg = err?.message || String(err);
  if (msg.includes('Unauthorized') || msg.includes('401') || msg.includes('authentication')) {
    return new Error("Jeton d'authentification invalide ou expiré. Veuillez générer un nouveau token sur Turso (ex: 'turso db tokens create devhub').");
  }
  if (msg.includes('PrimaryHandshakeTimeout')) {
    return new Error("Délai de connexion dépassé (PrimaryHandshakeTimeout). Vérifiez votre URL Turso et assurez-vous que votre token est valide.");
  }
  if (msg.includes('ENOTFOUND') || msg.includes('dns error')) {
    return new Error("Nom d'hôte Turso introuvable. Vérifiez l'orthographe de l'URL de votre base.");
  }
  return err;
}

/**
 * Initialise le client LibSQL (Local SQLite ou Embedded Replica Turso)
 */
export async function initDatabase() {
  if (client) {
    try {
      client.close();
    } catch {}
  }

  // 1. Initialiser le client local d'abord pour lire les réglages persistés
  const localClient = createClient({
    url: `file:${dbPath}`
  });

  await createSchema(localClient);
  await seedDefaults(localClient);

  // 2. Charger les identifiants Turso depuis le fichier .env et SQLite
  const envCreds = loadEnvCredentials();
  if (envCreds.TURSO_DATABASE_URL) syncConfig.syncUrl = envCreds.TURSO_DATABASE_URL;
  if (envCreds.TURSO_AUTH_TOKEN && envCreds.TURSO_AUTH_TOKEN.startsWith('eyJ')) syncConfig.authToken = envCreds.TURSO_AUTH_TOKEN;
  if (envCreds.TURSO_SYNC_ENABLED !== undefined) syncConfig.enabled = envCreds.TURSO_SYNC_ENABLED === 'true';

  try {
    const settingsRes = await localClient.execute("SELECT key, value FROM settings WHERE key IN ('turso_sync_url', 'turso_auth_token', 'turso_sync_enabled')");
    for (const row of settingsRes.rows) {
      if (row.key === 'turso_sync_url' && row.value && !syncConfig.syncUrl) syncConfig.syncUrl = String(row.value);
      if (row.key === 'turso_auth_token' && row.value && String(row.value).startsWith('eyJ') && !syncConfig.authToken) syncConfig.authToken = String(row.value);
      if (row.key === 'turso_sync_enabled' && envCreds.TURSO_SYNC_ENABLED === undefined) syncConfig.enabled = row.value === 'true' || row.value === true || row.value === '1';
    }
  } catch (err) {
    console.warn('⚠️ [Turso] Erreur lecture settings initDatabase:', err.message);
  }

  // 3. Si Turso est configuré et activé, tenter la connexion en mode Embedded Replica
  if (syncConfig.syncUrl && syncConfig.authToken && syncConfig.enabled) {
    try {
      const replicaClient = await createReplicaWithRetry(syncConfig.syncUrl, syncConfig.authToken);
      await migrateLocalDataToReplica(localClient, replicaClient);

      localClient.close();
      client = replicaClient;
      isReplicaActive = true;
      lastSyncAt = new Date().toISOString();
      lastSyncStatus = 'success';
      lastSyncError = null;
      console.log(`🌐 [Turso] Mode Embedded Replica connecté avec succès vers : ${syncConfig.syncUrl}`);
    } catch (err) {
      console.warn('⚠️ [Turso] Échec initialisation réplica, maintien du client local autonome:', err.message);
      client = localClient;
      isReplicaActive = false;
      lastSyncStatus = 'error';
      lastSyncError = err.message;
    }
  } else {
    client = localClient;
    isReplicaActive = false;
    console.log(`📁 [SQLite] Mode local autonome actif (${dbPath})`);
  }

  // 4. Lancer le timer de synchronisation périodique (toutes les 5 min)
  startPeriodicSync();

  return client;
}

/**
 * Création des tables
 */
async function createSchema(c) {
  await c.batch([
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS rss_feeds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      category TEXT DEFAULT 'Général',
      icon TEXT DEFAULT '📰',
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS watch_keywords (
      id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL UNIQUE,
      category TEXT DEFAULT 'Veille',
      icon TEXT DEFAULT '🎯',
      enabled INTEGER DEFAULT 1,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS rss_read_articles (
      link TEXT PRIMARY KEY,
      read_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS rss_deleted_articles (
      link TEXT PRIMARY KEY,
      deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`
  ], 'write');
}

/**
 * Données par défaut initiales
 */
async function seedDefaults(c) {
  try {
    const countFeedsRes = await c.execute('SELECT COUNT(*) as count FROM rss_feeds');
    const countFeeds = countFeedsRes.rows[0]?.count || 0;
    if (countFeeds === 0) {
      const defaults = [
        ['korben', 'Korben.info (Complet)', 'https://korben.info/feedfull', 'Tech & Hacks', '⚡', 1],
        ['hackernews', 'Hacker News', 'https://news.ycombinator.com/rss', 'Dev & Startups', '🔶', 2],
        ['lemonde-pixels', 'Le Monde Pixels', 'https://www.lemonde.fr/pixels/rss_full.xml', 'Culture Web', '🌍', 3]
      ];
      for (const [id, name, url, cat, icon, pos] of defaults) {
        await c.execute({
          sql: 'INSERT OR IGNORE INTO rss_feeds (id, name, url, category, icon, position) VALUES (?, ?, ?, ?, ?, ?)',
          args: [id, name, url, cat, icon, pos]
        });
      }
    }

    const countKwRes = await c.execute('SELECT COUNT(*) as count FROM watch_keywords');
    const countKw = countKwRes.rows[0]?.count || 0;
    if (countKw === 0) {
      const defaultKeywords = [
        ['kw_ollama', 'ollama', 'IA & LLM', '⚡', 1, 1],
        ['kw_apple_m', 'apple silicon', 'Hardware', '🍏', 1, 2],
        ['kw_docker', 'docker', 'DevOps', '🐳', 1, 3],
        ['kw_cyber', 'cybersécurité', 'Sécurité', '🛡️', 1, 4]
      ];
      for (const [id, kw, cat, icon, en, pos] of defaultKeywords) {
        await c.execute({
          sql: 'INSERT OR IGNORE INTO watch_keywords (id, keyword, category, icon, enabled, position) VALUES (?, ?, ?, ?, ?, ?)',
          args: [id, kw, cat, icon, en, pos]
        });
      }
    }
  } catch (err) {
    console.warn('⚠️ Erreur seed defaults:', err.message);
  }
}

// Initialisation immédiate
await initDatabase();

// -------------------------------------------------------------
// GESTIONNAIRE DE SYNCHRONISATION TURSO
// -------------------------------------------------------------

export function isTursoEnabled() {
  return Boolean(isReplicaActive && syncConfig.enabled);
}

export function getSyncStatus() {
  return {
    enabled: Boolean(syncConfig.enabled && (syncConfig.syncUrl || isReplicaActive)),
    syncUrl: syncConfig.syncUrl ? syncConfig.syncUrl.replace(/\/\/.*@/, '//***@') : '',
    hasToken: Boolean(syncConfig.authToken && syncConfig.authToken.startsWith('eyJ')),
    lastSyncAt,
    lastSyncStatus,
    lastSyncError,
    isSyncing,
    mode: isReplicaActive ? 'turso_replica' : 'local_sqlite'
  };
}

export async function syncDatabase() {
  if (!isReplicaActive || !syncConfig.enabled) {
    return {
      success: false,
      enabled: false,
      status: 'idle',
      message: 'La synchronisation Turso n’est pas configurée ou active. Veuillez enregistrer une URL libsql:// et un token valides.'
    };
  }

  if (isSyncing) {
    return { success: true, enabled: true, isSyncing: true, status: 'syncing' };
  }

  isSyncing = true;
  lastSyncStatus = 'syncing';

  try {
    if (typeof client.sync === 'function') {
      await client.sync();
      lastSyncAt = new Date().toISOString();
      lastSyncStatus = 'success';
      lastSyncError = null;
      console.log(`✅ [Turso] Base de données synchronisée avec succès (${lastSyncAt})`);
      return { success: true, enabled: true, status: 'success', lastSyncAt };
    } else {
      isReplicaActive = false;
      return { success: false, enabled: false, message: 'Client non répliqué' };
    }
  } catch (err) {
    lastSyncStatus = 'error';
    lastSyncError = err.message;
    console.warn(`⚠️ [Turso] Erreur synchronisation : ${err.message}`);
    return { success: false, enabled: true, status: 'error', error: err.message, lastSyncAt };
  } finally {
    isSyncing = false;
  }
}

/**
 * Déclenche une synchronisation différée (debounced) après écriture
 */
function triggerDelayedSync() {
  if (!isReplicaActive || !syncConfig.enabled) return;
  if (debounceSyncTimeout) clearTimeout(debounceSyncTimeout);
  debounceSyncTimeout = setTimeout(() => {
    syncDatabase().catch(() => {});
  }, 2000);
}

/**
 * Configure et applique de nouveaux identifiants Turso
 */
export async function updateSyncConfig({ syncUrl, authToken, enabled }) {
  if (syncUrl !== undefined) syncConfig.syncUrl = (syncUrl || '').trim();
  if (authToken !== undefined) syncConfig.authToken = (authToken || '').trim();
  if (enabled !== undefined) syncConfig.enabled = Boolean(enabled);

  // Auto-correction : Inversion si le jeton JWT a été collé dans le champ URL
  if (syncConfig.syncUrl && syncConfig.syncUrl.startsWith('eyJ') && syncConfig.authToken && (syncConfig.authToken.includes('turso.io') || syncConfig.authToken.startsWith('libsql://') || syncConfig.authToken.startsWith('https://'))) {
    const temp = syncConfig.syncUrl;
    syncConfig.syncUrl = syncConfig.authToken;
    syncConfig.authToken = temp;
  } else if (syncConfig.syncUrl && syncConfig.syncUrl.startsWith('eyJ') && !syncConfig.authToken) {
    syncConfig.authToken = syncConfig.syncUrl;
    syncConfig.syncUrl = '';
  }

  // Normalisation du préfixe libsql:// si manquant
  if (syncConfig.syncUrl && !syncConfig.syncUrl.includes('://')) {
    syncConfig.syncUrl = 'libsql://' + syncConfig.syncUrl;
  }

  // Cas 1 : Activation demandée avec URL et Token
  if (syncConfig.enabled && syncConfig.syncUrl) {
    if (syncConfig.syncUrl.startsWith('eyJ')) {
      return {
        ...getSyncStatus(),
        success: false,
        error: "L'URL renseignée est un jeton JWT. L'URL doit être de la forme 'libsql://votre-base.turso.io' (obtenue avec 'turso db show devhub --url' ou sur la console Turso)."
      };
    }

    if (!syncConfig.authToken) {
      return {
        ...getSyncStatus(),
        success: false,
        error: "Le jeton d'authentification (Auth Token) est manquant. Veuillez coller votre jeton JWT (commençant par eyJ...) dans le champ Jeton d'authentification."
      };
    }

    try {
      console.log(`🌐 [Turso] Test de connexion vers ${syncConfig.syncUrl}...`);
      const newClient = await createReplicaWithRetry(syncConfig.syncUrl, syncConfig.authToken);

      // Si le réplica Cloud est neuf, transférer automatiquement les données locales existantes
      if (client) {
        await migrateLocalDataToReplica(client, newClient);
        try { client.close(); } catch {}
      }

      client = newClient;
      isReplicaActive = true;
      lastSyncAt = new Date().toISOString();
      lastSyncStatus = 'success';
      lastSyncError = null;

      // Sauvegarder les identifiants dans la base active
      await client.execute({
        sql: `
          INSERT INTO settings (key, value, updated_at) VALUES ('turso_sync_url', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `,
        args: [syncConfig.syncUrl]
      });
      await client.execute({
        sql: `
          INSERT INTO settings (key, value, updated_at) VALUES ('turso_auth_token', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `,
        args: [syncConfig.authToken]
      });
      await client.execute({
        sql: `
          INSERT INTO settings (key, value, updated_at) VALUES ('turso_sync_enabled', 'true', CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `,
        args: []
      });

      // Sauvegarder également dans le fichier SQLite local autonome
      try {
        const localSaveClient = createClient({ url: `file:${dbPath}` });
        await localSaveClient.execute({
          sql: `
            INSERT INTO settings (key, value, updated_at) VALUES ('turso_sync_url', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
          `,
          args: [syncConfig.syncUrl]
        });
        await localSaveClient.execute({
          sql: `
            INSERT INTO settings (key, value, updated_at) VALUES ('turso_auth_token', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
          `,
          args: [syncConfig.authToken]
        });
        await localSaveClient.execute({
          sql: `
            INSERT INTO settings (key, value, updated_at) VALUES ('turso_sync_enabled', 'true', CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
          `,
          args: []
        });
        localSaveClient.close();
      } catch {}

      // Sauvegarder dans le fichier .env
      saveEnvCredentials({ syncUrl: syncConfig.syncUrl, authToken: syncConfig.authToken, enabled: true });

      return {
        ...getSyncStatus(),
        success: true,
        message: 'Connexion Turso établie et synchronisée !'
      };
    } catch (err) {
      console.warn('⚠️ [Turso] Échec du test de connexion:', err.message);
      isReplicaActive = false;
      lastSyncStatus = 'error';
      lastSyncError = err.message;

      // Enregistrer quand même les saisies dans .env et local pour éviter toute perte
      saveEnvCredentials({ syncUrl: syncConfig.syncUrl, authToken: syncConfig.authToken, enabled: false });

      // Enregistrer quand même les saisies en local pour que l'utilisateur n'ait pas à tout retaper
      try {
        if (!client) client = createClient({ url: `file:${dbPath}` });
        await client.execute({
          sql: `INSERT INTO settings (key, value, updated_at) VALUES ('turso_sync_url', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          args: [syncConfig.syncUrl]
        });
        if (syncConfig.authToken) {
          await client.execute({
            sql: `INSERT INTO settings (key, value, updated_at) VALUES ('turso_auth_token', ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            args: [syncConfig.authToken]
          });
        }
      } catch {}

      return {
        ...getSyncStatus(),
        success: false,
        error: err.message
      };
    }
  }

  // Cas 2 : Désactivation / Mode local autonome
  if (!syncConfig.enabled) {
    if (client) {
      try { client.close(); } catch {}
    }
    client = createClient({ url: `file:${dbPath}` });
    isReplicaActive = false;
    lastSyncStatus = 'idle';
    lastSyncError = null;

    saveEnvCredentials({ syncUrl: syncConfig.syncUrl, authToken: syncConfig.authToken, enabled: false });

    try {
      await client.execute({
        sql: `INSERT INTO settings (key, value, updated_at) VALUES ('turso_sync_enabled', 'false', CURRENT_TIMESTAMP)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        args: []
      });
    } catch {}

    return {
      ...getSyncStatus(),
      success: true,
      message: 'Mode local autonome actif.'
    };
  }

  return getSyncStatus();
}

function startPeriodicSync(intervalMinutes = 5) {
  if (syncIntervalId) clearInterval(syncIntervalId);
  syncIntervalId = setInterval(() => {
    if (isReplicaActive && syncConfig.enabled) {
      syncDatabase().catch(() => {});
    }
  }, intervalMinutes * 60 * 1000);
}

// -------------------------------------------------------------
// SERVICES PARAMÈTRES (SETTINGS)
// -------------------------------------------------------------

export async function getSettings() {
  const res = await client.execute('SELECT key, value FROM settings');
  const settings = {
    theme_mode: 'system',
    theme_preset: 'standard',
    search_engine: 'startpage',
    active_tab: 'dashboard',
    collapsibles: '{}'
  };

  for (const row of res.rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  return settings;
}

export async function setSetting(key, value) {
  const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
  await client.execute({
    sql: `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `,
    args: [key, valStr]
  });
  triggerDelayedSync();
  return getSettings();
}

export async function setMultipleSettings(obj) {
  for (const [k, v] of Object.entries(obj)) {
    const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
    await client.execute({
      sql: `
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `,
      args: [k, valStr]
    });
  }
  triggerDelayedSync();
  return getSettings();
}

// -------------------------------------------------------------
// SERVICES RSS (FLUX, ARTICLES LUS / SUPPRIMÉS)
// -------------------------------------------------------------

export async function getRssFeeds() {
  const res = await client.execute('SELECT id, name, url, category, icon, position FROM rss_feeds ORDER BY position ASC, created_at ASC');
  return res.rows;
}

export async function addRssFeed(feed) {
  const id = feed.id || 'feed_' + Date.now();
  await client.execute({
    sql: `
      INSERT INTO rss_feeds (id, name, url, category, icon, position)
      VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM rss_feeds))
    `,
    args: [id, feed.name, feed.url, feed.category || 'Personnalisé', feed.icon || '📰']
  });
  triggerDelayedSync();
  return getRssFeeds();
}

export async function deleteRssFeed(feedId) {
  await client.execute({
    sql: 'DELETE FROM rss_feeds WHERE id = ?',
    args: [feedId]
  });
  triggerDelayedSync();
  return getRssFeeds();
}

export async function resetRssFeeds() {
  await client.execute('DELETE FROM rss_feeds');
  await seedDefaults(client);
  triggerDelayedSync();
  return getRssFeeds();
}

// -------------------------------------------------------------
// SERVICES VEILLE (MOTS-CLÉS)
// -------------------------------------------------------------

export async function getWatchKeywords() {
  const res = await client.execute('SELECT id, keyword, category, icon, enabled, position FROM watch_keywords ORDER BY position ASC, created_at ASC');
  return res.rows;
}

export async function addWatchKeyword(keywordObj) {
  const keyword = (typeof keywordObj === 'string' ? keywordObj : keywordObj.keyword || '').trim();
  if (!keyword) throw new Error('Mot-clé requis');

  const id = (typeof keywordObj === 'object' && keywordObj.id) ? keywordObj.id : 'kw_' + Date.now();
  const category = (typeof keywordObj === 'object' && keywordObj.category) ? keywordObj.category : 'Veille';
  const icon = (typeof keywordObj === 'object' && keywordObj.icon) ? keywordObj.icon : '🎯';

  await client.execute({
    sql: `
      INSERT INTO watch_keywords (id, keyword, category, icon, enabled, position)
      VALUES (?, ?, ?, ?, 1, (SELECT COALESCE(MAX(position), 0) + 1 FROM watch_keywords))
      ON CONFLICT(keyword) DO UPDATE SET enabled = 1
    `,
    args: [id, keyword.toLowerCase(), category, icon]
  });
  triggerDelayedSync();
  return getWatchKeywords();
}

export async function deleteWatchKeyword(id) {
  await client.execute({
    sql: 'DELETE FROM watch_keywords WHERE id = ? OR keyword = ?',
    args: [id, id]
  });
  triggerDelayedSync();
  return getWatchKeywords();
}

export async function toggleWatchKeyword(id, enabled) {
  await client.execute({
    sql: 'UPDATE watch_keywords SET enabled = ? WHERE id = ?',
    args: [enabled ? 1 : 0, id]
  });
  triggerDelayedSync();
  return getWatchKeywords();
}

export async function resetWatchKeywords() {
  await client.execute('DELETE FROM watch_keywords');
  await seedDefaults(client);
  triggerDelayedSync();
  return getWatchKeywords();
}

// -------------------------------------------------------------
// SERVICES ARTICLES LUS & PURGE AUTO 1 JOUR
// -------------------------------------------------------------

export async function cleanupOldReadArticles(maxAgeDays = 1) {
  try {
    await client.batch([
      `INSERT OR IGNORE INTO rss_deleted_articles (link, deleted_at)
       SELECT link, CURRENT_TIMESTAMP FROM rss_read_articles
       WHERE datetime(read_at) <= datetime('now', '-${maxAgeDays} day');`,
      `DELETE FROM rss_read_articles
       WHERE datetime(read_at) <= datetime('now', '-${maxAgeDays} day');`
    ], 'write');
  } catch (err) {
    console.warn('⚠️ Erreur purge automatique des articles lus:', err.message);
  }
}

export async function getRssArticleState() {
  await cleanupOldReadArticles(1);

  const readRes = await client.execute('SELECT link FROM rss_read_articles');
  const delRes = await client.execute('SELECT link FROM rss_deleted_articles');

  return {
    readArticles: readRes.rows.map(r => r.link),
    deletedArticles: delRes.rows.map(r => r.link)
  };
}

export async function setArticleRead(link, isRead = true) {
  if (isRead) {
    await client.execute({
      sql: `
        INSERT INTO rss_read_articles (link, read_at) 
        VALUES (?, CURRENT_TIMESTAMP)
        ON CONFLICT(link) DO UPDATE SET read_at = CURRENT_TIMESTAMP
      `,
      args: [link]
    });
  } else {
    await client.execute({
      sql: 'DELETE FROM rss_read_articles WHERE link = ?',
      args: [link]
    });
  }
  triggerDelayedSync();
  return getRssArticleState();
}

export async function markMultipleArticlesRead(links) {
  for (const link of links) {
    if (link) {
      await client.execute({
        sql: `
          INSERT INTO rss_read_articles (link, read_at) 
          VALUES (?, CURRENT_TIMESTAMP)
          ON CONFLICT(link) DO UPDATE SET read_at = CURRENT_TIMESTAMP
        `,
        args: [link]
      });
    }
  }
  triggerDelayedSync();
  return getRssArticleState();
}

export async function deleteArticle(link) {
  await client.execute({
    sql: 'INSERT OR IGNORE INTO rss_deleted_articles (link) VALUES (?)',
    args: [link]
  });
  triggerDelayedSync();
  return getRssArticleState();
}

export async function restoreAllDeletedArticles() {
  await client.execute('DELETE FROM rss_deleted_articles');
  triggerDelayedSync();
  return getRssArticleState();
}

export default {
  initDatabase,
  getSyncStatus,
  syncDatabase,
  updateSyncConfig,
  getSettings,
  setSetting,
  setMultipleSettings,
  getRssFeeds,
  addRssFeed,
  deleteRssFeed,
  resetRssFeeds,
  getWatchKeywords,
  addWatchKeyword,
  deleteWatchKeyword,
  toggleWatchKeyword,
  resetWatchKeywords,
  cleanupOldReadArticles,
  getRssArticleState,
  setArticleRead,
  markMultipleArticlesRead,
  deleteArticle,
  restoreAllDeletedArticles
};
