import { Router } from 'express';
import { getSettings, setSetting, setMultipleSettings } from '../services/dbService.js';

const router = Router();

/**
 * GET /api/settings
 * Renvoie l'ensemble des réglages persistés en base SQLite
 */
router.get('/', (req, res) => {
  try {
    const settings = getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings
 * Met à jour un ou plusieurs réglages
 */
router.post('/', (req, res) => {
  try {
    const { key, value } = req.body;
    if (key !== undefined && value !== undefined) {
      const updated = setSetting(key, value);
      return res.json(updated);
    }

    if (typeof req.body === 'object') {
      const updated = setMultipleSettings(req.body);
      return res.json(updated);
    }

    res.status(400).json({ error: 'Données de configuration invalides' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
