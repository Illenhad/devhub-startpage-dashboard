import { Router } from 'express';
import { fetchRSSFeed, DEFAULT_FEEDS } from '../services/rssService.js';
import { extractCleanArticleContent } from '../services/watchService.js';
import {
  getRssFeeds,
  addRssFeed,
  deleteRssFeed,
  resetRssFeeds,
  getRssArticleState,
  setArticleRead,
  markMultipleArticlesRead,
  deleteArticle,
  restoreAllDeletedArticles
} from '../services/dbService.js';

const router = Router();

/**
 * GET /api/rss
 * Récupère et parse le flux RSS spécifié
 */
router.get('/', async (req, res) => {
  const url = req.query.url || DEFAULT_FEEDS[0].url;

  try {
    const feed = await fetchRSSFeed(url);
    res.json(feed);
  } catch (err) {
    res.status(500).json({
      error: `Impossible de charger le flux RSS: ${err.message}`,
      feedUrl: url
    });
  }
});

/**
 * GET /api/rss/defaults
 * Renvoie les flux par défaut
 */
router.get('/defaults', (req, res) => {
  res.json({ feeds: DEFAULT_FEEDS });
});

// -------------------------------------------------------------
// GESTION DES FLUX RSS PERSISTÉS EN BDD SQLITE
// -------------------------------------------------------------

/**
 * GET /api/rss/feeds
 * Renvoie la liste de tous les flux suivis enregistrés en SQLite
 */
router.get('/feeds', (req, res) => {
  try {
    const feeds = getRssFeeds();
    res.json({ feeds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/feeds
 * Ajoute un flux personnalisé
 */
router.post('/feeds', (req, res) => {
  try {
    const { name, url, category, icon } = req.body;
    if (!url) return res.status(400).json({ error: 'URL du flux requise' });

    const feeds = addRssFeed({ name, url, category, icon });
    res.json({ success: true, feeds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/rss/feeds/:id
 * Supprime un flux
 */
router.delete('/feeds/:id', (req, res) => {
  try {
    const feeds = deleteRssFeed(req.params.id);
    res.json({ success: true, feeds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/feeds/reset
 * Réinitialise aux flux par défaut
 */
router.post('/feeds/reset', (req, res) => {
  try {
    const feeds = resetRssFeeds();
    res.json({ success: true, feeds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// GESTION DES ARTICLES LUS / SUPPRIMÉS EN BDD SQLITE
// -------------------------------------------------------------

/**
 * GET /api/rss/state
 * Renvoie les listes des articles lus et supprimés
 */
router.get('/state', (req, res) => {
  try {
    const state = getRssArticleState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/read
 * Marque un article comme lu ou non lu
 */
router.post('/read', (req, res) => {
  try {
    const { link, isRead } = req.body;
    if (!link) return res.status(400).json({ error: 'Lien de l\'article requis' });

    const state = setArticleRead(link, isRead !== false);
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/read-all
 * Marque un ensemble d'articles comme lus
 */
router.post('/read-all', (req, res) => {
  try {
    const { links } = req.body;
    if (!Array.isArray(links)) return res.status(400).json({ error: 'Tableau de liens requis' });

    const state = markMultipleArticlesRead(links);
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/delete-article
 * Masque / supprime un article de la liste
 */
router.post('/delete-article', (req, res) => {
  try {
    const { link } = req.body;
    if (!link) return res.status(400).json({ error: 'Lien requis' });

    const state = deleteArticle(link);
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/restore-articles
 * Restaure tous les articles masqués
 */
router.post('/restore-articles', (req, res) => {
  try {
    const state = restoreAllDeletedArticles();
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cache mémoire des articles complets extraits (24h)
const articleContentCache = new Map();
const CONTENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/rss/full-content
 * Extrait le contenu intégral d'un article à partir de son URL (Mode Lecteur)
 */
router.get('/full-content', async (req, res) => {
  const articleUrl = req.query.url;
  if (!articleUrl) return res.status(400).json({ error: 'URL requise' });

  const cached = articleContentCache.get(articleUrl);
  if (cached && (Date.now() - cached.timestamp < CONTENT_CACHE_TTL_MS)) {
    return res.json(cached.data);
  }

  try {
    const response = await fetch(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(4500)
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Erreur HTTP ${response.status}` });
    }

    const html = await response.text();
    const content = extractCleanArticleContent(html, articleUrl);

    let image = null;
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch && ogMatch[1]) {
      image = ogMatch[1].trim();
      if (image.startsWith('/')) {
        const u = new URL(articleUrl);
        image = `${u.origin}${image}`;
      }
    }

    const result = { success: true, content, image };
    articleContentCache.set(articleUrl, { data: result, timestamp: Date.now() });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Erreur d'extraction: ${err.message}` });
  }
});

export default router;
