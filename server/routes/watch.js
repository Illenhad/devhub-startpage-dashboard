import { Router } from 'express';
import {
  getWatchKeywords,
  addWatchKeyword,
  deleteWatchKeyword,
  toggleWatchKeyword,
  resetWatchKeywords
} from '../services/dbService.js';
import { fetchKeywordNews, getUnifiedNewsFeed } from '../services/watchService.js';

const router = Router();

/**
 * GET /api/watch/keywords
 * Liste tous les mots-clés de veille configurés
 */
router.get('/keywords', async (req, res) => {
  try {
    const keywords = await getWatchKeywords();
    res.json({ keywords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/watch/keywords
 * Ajoute un nouveau mot-clé de veille
 */
router.post('/keywords', async (req, res) => {
  try {
    const { keyword, category, icon } = req.body;
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ error: 'Mot-clé requis' });
    }

    const keywords = await addWatchKeyword({ keyword, category, icon });
    res.json({ success: true, keywords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/watch/keywords/:id
 * Supprime un mot-clé de veille
 */
router.delete('/keywords/:id', async (req, res) => {
  try {
    const keywords = await deleteWatchKeyword(req.params.id);
    res.json({ success: true, keywords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/watch/keywords/reset
 * Réinitialise aux mots-clés de veille par défaut
 */
router.post('/keywords/reset', async (req, res) => {
  try {
    const keywords = await resetWatchKeywords();
    res.json({ success: true, keywords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/watch/feed
 * Récupère les actualités pour un mot-clé précis (?keyword=ollama)
 */
router.get('/feed', async (req, res) => {
  const keyword = req.query.keyword || 'ollama';
  try {
    const data = await fetchKeywordNews(keyword);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `Erreur veille (${keyword}): ${err.message}` });
  }
});

/**
 * GET /api/watch/unified
 * Récupère le flux d'actualités unifié (Flux RSS + Veille par mots-clés)
 */
router.get('/unified', async (req, res) => {
  const force = req.query.force === 'true';
  try {
    const data = await getUnifiedNewsFeed(force);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `Erreur flux unifié: ${err.message}` });
  }
});

export default router;
