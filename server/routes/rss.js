import { Router } from 'express';
import { fetchRSSFeed, fetchArticleHtml, extractDirectUrl, DEFAULT_FEEDS } from '../services/rssService.js';
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
router.get('/feeds', async (req, res) => {
  try {
    const feeds = await getRssFeeds();
    res.json({ feeds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/feeds
 * Ajoute un flux personnalisé
 */
router.post('/feeds', async (req, res) => {
  try {
    const { name, url, category, icon } = req.body;
    if (!url) return res.status(400).json({ error: 'URL du flux requise' });

    const feeds = await addRssFeed({ name, url, category, icon });
    res.json({ success: true, feeds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/rss/feeds/:id
 * Supprime un flux
 */
router.delete('/feeds/:id', async (req, res) => {
  try {
    const feeds = await deleteRssFeed(req.params.id);
    res.json({ success: true, feeds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/feeds/reset
 * Réinitialise aux flux par défaut
 */
router.post('/feeds/reset', async (req, res) => {
  try {
    const feeds = await resetRssFeeds();
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
router.get('/state', async (req, res) => {
  try {
    const state = await getRssArticleState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/read
 * Marque un article comme lu ou non lu
 */
router.post('/read', async (req, res) => {
  try {
    const { link, isRead } = req.body;
    if (!link) return res.status(400).json({ error: 'Lien de l\'article requis' });

    const state = await setArticleRead(link, isRead !== false);
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/read-all
 * Marque un ensemble d'articles comme lus
 */
router.post('/read-all', async (req, res) => {
  try {
    const { links } = req.body;
    if (!Array.isArray(links)) return res.status(400).json({ error: 'Tableau de liens requis' });

    const state = await markMultipleArticlesRead(links);
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/delete-article
 * Masque / supprime un article de la liste
 */
router.post('/delete-article', async (req, res) => {
  try {
    const { link } = req.body;
    if (!link) return res.status(400).json({ error: 'Lien requis' });

    const state = await deleteArticle(link);
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rss/restore-articles
 * Restaure tous les articles masqués
 */
router.post('/restore-articles', async (req, res) => {
  try {
    const state = await restoreAllDeletedArticles();
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
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: 'URL requise' });
  const articleUrl = extractDirectUrl(rawUrl);

  // Les liens Google News ne peuvent pas être extraits sans navigateur headless (page consent 580ko)
  if (articleUrl.includes('news.google.com')) {
    return res.json({
      success: false,
      reason: 'google_news',
      message: 'Article agrégé par Google Actualités. Ouverture directe recommandée.',
      directUrl: articleUrl
    });
  }

  const cached = articleContentCache.get(articleUrl);
  if (cached && (Date.now() - cached.timestamp < CONTENT_CACHE_TTL_MS)) {
    return res.json(cached.data);
  }

  try {
    const response = await fetchArticleHtml(articleUrl, 3500);

    if (response.status === 401 || response.status === 402 || response.status === 403) {
      return res.json({
        success: false,
        reason: 'paywall',
        message: 'Cet article est sous paywall ou réservé aux abonnés de ce média.'
      });
    }

    if (!response.ok) {
      return res.status(502).json({ error: `Erreur HTTP ${response.status}` });
    }

    const html = await response.text();

    // Détection de protection anti-bot ou défi d'accès résiduel
    if (html.includes('Client Challenge') || html.includes('licensing[@]groupelemonde.fr')) {
      return res.json({
        success: false,
        reason: 'paywall',
        message: 'Cet article est protégé ou réservé aux abonnés.'
      });
    }

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

    const isSuccess = Boolean(content && content.length > 80);
    const result = {
      success: isSuccess,
      content: content || null,
      image
    };

    if (isSuccess) {
      articleContentCache.set(articleUrl, { data: result, timestamp: Date.now() });
    }
    res.json(result);
  } catch (err) {
    res.json({
      success: false,
      reason: 'timeout_or_error',
      message: 'Impossible d’extraire le contenu complet dans le délai imparti.'
    });
  }
});

export default router;
