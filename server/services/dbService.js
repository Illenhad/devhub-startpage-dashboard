import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin vers la base de données SQLite
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'devhub.sqlite');
const oldDbPath = path.join(dataDir, 'machub.sqlite');
if (fs.existsSync(oldDbPath) && !fs.existsSync(dbPath)) {
  try {
    fs.renameSync(oldDbPath, dbPath);
  } catch {}
}

const db = new DatabaseSync(dbPath);

// Activation du mode WAL pour haute performance et concurrences multiples
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
`);

// Initialisation du schéma
db.exec(`
  -- Table des préférences et réglages
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Table des flux RSS
  CREATE TABLE IF NOT EXISTS rss_feeds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'Général',
    icon TEXT DEFAULT '📰',
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Table des mots-clés de veille technologique
  CREATE TABLE IF NOT EXISTS watch_keywords (
    id TEXT PRIMARY KEY,
    keyword TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'Veille',
    icon TEXT DEFAULT '🎯',
    enabled INTEGER DEFAULT 1,
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Table des articles RSS & Veille lus
  CREATE TABLE IF NOT EXISTS rss_read_articles (
    link TEXT PRIMARY KEY,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Table des articles RSS & Veille masqués / supprimés (ou purgés après 1 jour)
  CREATE TABLE IF NOT EXISTS rss_deleted_articles (
    link TEXT PRIMARY KEY,
    deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed des flux et mots-clés par défaut si les tables sont vides
const countFeeds = db.prepare('SELECT COUNT(*) as count FROM rss_feeds').get();
if (!countFeeds || countFeeds.count === 0) {
  seedDefaultFeeds();
}

const countKeywords = db.prepare('SELECT COUNT(*) as count FROM watch_keywords').get();
if (!countKeywords || countKeywords.count === 0) {
  seedDefaultKeywords();
}

function seedDefaultFeeds() {
  const insertFeed = db.prepare(`
    INSERT OR IGNORE INTO rss_feeds (id, name, url, category, icon, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const defaults = [
    {
      id: 'korben',
      name: 'Korben.info (Complet)',
      url: 'https://korben.info/feedfull',
      category: 'Tech & Hacks',
      icon: '⚡',
      position: 1
    },
    {
      id: 'hackernews',
      name: 'Hacker News',
      url: 'https://news.ycombinator.com/rss',
      category: 'Dev & Startups',
      icon: '🔶',
      position: 2
    },
    {
      id: 'lemonde-pixels',
      name: 'Le Monde Pixels',
      url: 'https://www.lemonde.fr/pixels/rss_full.xml',
      category: 'Culture Web',
      icon: '🌍',
      position: 3
    }
  ];

  for (const f of defaults) {
    insertFeed.run(f.id, f.name, f.url, f.category, f.icon, f.position);
  }
}

function seedDefaultKeywords() {
  const insertKw = db.prepare(`
    INSERT OR IGNORE INTO watch_keywords (id, keyword, category, icon, enabled, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const defaultKeywords = [
    { id: 'kw_ollama', keyword: 'ollama', category: 'IA & LLM', icon: '⚡', enabled: 1, position: 1 },
    { id: 'kw_apple_m', keyword: 'apple silicon', category: 'Hardware', icon: '🍏', enabled: 1, position: 2 },
    { id: 'kw_docker', keyword: 'docker', category: 'DevOps', icon: '🐳', enabled: 1, position: 3 },
    { id: 'kw_cyber', keyword: 'cybersécurité', category: 'Sécurité', icon: '🛡️', enabled: 1, position: 4 }
  ];

  for (const kw of defaultKeywords) {
    insertKw.run(kw.id, kw.keyword, kw.category, kw.icon, kw.enabled, kw.position);
  }
}

// -------------------------------------------------------------
// SERVICES PARAMÈTRES (SETTINGS)
// -------------------------------------------------------------
export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {
    theme_mode: 'system',
    theme_preset: 'standard',
    search_engine: 'startpage',
    active_tab: 'dashboard',
    collapsibles: '{}'
  };

  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  return settings;
}

export function setSetting(key, value) {
  const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(key, valStr);
  return getSettings();
}

export function setMultipleSettings(obj) {
  for (const [k, v] of Object.entries(obj)) {
    setSetting(k, v);
  }
  return getSettings();
}

// -------------------------------------------------------------
// SERVICES RSS (FLUX, ARTICLES LUS / SUPPRIMÉS)
// -------------------------------------------------------------
export function getRssFeeds() {
  return db.prepare('SELECT id, name, url, category, icon, position FROM rss_feeds ORDER BY position ASC, created_at ASC').all();
}

export function addRssFeed(feed) {
  const id = feed.id || 'feed_' + Date.now();
  const stmt = db.prepare(`
    INSERT INTO rss_feeds (id, name, url, category, icon, position)
    VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM rss_feeds))
  `);
  stmt.run(id, feed.name, feed.url, feed.category || 'Personnalisé', feed.icon || '📰');
  return getRssFeeds();
}

export function deleteRssFeed(feedId) {
  db.prepare('DELETE FROM rss_feeds WHERE id = ?').run(feedId);
  return getRssFeeds();
}

export function resetRssFeeds() {
  db.prepare('DELETE FROM rss_feeds').run();
  seedDefaultFeeds();
  return getRssFeeds();
}

// -------------------------------------------------------------
// SERVICES VEILLE (MOTS-CLÉS)
// -------------------------------------------------------------
export function getWatchKeywords() {
  return db.prepare('SELECT id, keyword, category, icon, enabled, position FROM watch_keywords ORDER BY position ASC, created_at ASC').all();
}

export function addWatchKeyword(keywordObj) {
  const keyword = (typeof keywordObj === 'string' ? keywordObj : keywordObj.keyword || '').trim();
  if (!keyword) throw new Error('Mot-clé requis');

  const id = (typeof keywordObj === 'object' && keywordObj.id) ? keywordObj.id : 'kw_' + Date.now();
  const category = (typeof keywordObj === 'object' && keywordObj.category) ? keywordObj.category : 'Veille';
  const icon = (typeof keywordObj === 'object' && keywordObj.icon) ? keywordObj.icon : '🎯';

  const stmt = db.prepare(`
    INSERT INTO watch_keywords (id, keyword, category, icon, enabled, position)
    VALUES (?, ?, ?, ?, 1, (SELECT COALESCE(MAX(position), 0) + 1 FROM watch_keywords))
    ON CONFLICT(keyword) DO UPDATE SET enabled = 1
  `);
  stmt.run(id, keyword.toLowerCase(), category, icon);
  return getWatchKeywords();
}

export function deleteWatchKeyword(id) {
  db.prepare('DELETE FROM watch_keywords WHERE id = ? OR keyword = ?').run(id, id);
  return getWatchKeywords();
}

export function toggleWatchKeyword(id, enabled) {
  db.prepare('UPDATE watch_keywords SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  return getWatchKeywords();
}

export function resetWatchKeywords() {
  db.prepare('DELETE FROM watch_keywords').run();
  seedDefaultKeywords();
  return getWatchKeywords();
}

// -------------------------------------------------------------
// SERVICES ARTICLES LUS / SUPPRIMÉS (RSS & VEILLE) & PURGE AUTO 1 JOUR
// -------------------------------------------------------------

/**
 * Supprime automatiquement les articles marqués comme lus depuis plus de 1 jour (24h)
 */
export function cleanupOldReadArticles(maxAgeDays = 1) {
  try {
    // 1. Déplacer vers rss_deleted_articles les liens lus depuis plus de maxAgeDays (24h)
    db.exec(`
      INSERT OR IGNORE INTO rss_deleted_articles (link, deleted_at)
      SELECT link, CURRENT_TIMESTAMP FROM rss_read_articles
      WHERE datetime(read_at) <= datetime('now', '-${maxAgeDays} day');

      -- 2. Nettoyer les entrées de rss_read_articles
      DELETE FROM rss_read_articles
      WHERE datetime(read_at) <= datetime('now', '-${maxAgeDays} day');
    `);
  } catch (err) {
    console.warn('⚠️ Erreur purge automatique des articles lus:', err.message);
  }
}

export function getRssArticleState() {
  // Purge automatique des articles lus depuis plus de 1 jour
  cleanupOldReadArticles(1);

  const readRows = db.prepare('SELECT link FROM rss_read_articles').all();
  const delRows = db.prepare('SELECT link FROM rss_deleted_articles').all();

  return {
    readArticles: readRows.map(r => r.link),
    deletedArticles: delRows.map(r => r.link)
  };
}

export function setArticleRead(link, isRead = true) {
  if (isRead) {
    db.prepare(`
      INSERT INTO rss_read_articles (link, read_at) 
      VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT(link) DO UPDATE SET read_at = CURRENT_TIMESTAMP
    `).run(link);
  } else {
    db.prepare('DELETE FROM rss_read_articles WHERE link = ?').run(link);
  }
  return getRssArticleState();
}

export function markMultipleArticlesRead(links) {
  const stmt = db.prepare(`
    INSERT INTO rss_read_articles (link, read_at) 
    VALUES (?, CURRENT_TIMESTAMP)
    ON CONFLICT(link) DO UPDATE SET read_at = CURRENT_TIMESTAMP
  `);
  for (const link of links) {
    if (link) stmt.run(link);
  }
  return getRssArticleState();
}

export function deleteArticle(link) {
  db.prepare('INSERT OR IGNORE INTO rss_deleted_articles (link) VALUES (?)').run(link);
  return getRssArticleState();
}

export function restoreAllDeletedArticles() {
  db.prepare('DELETE FROM rss_deleted_articles').run();
  return getRssArticleState();
}

export default {
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
