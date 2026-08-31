import { Router } from 'express';
import {
  getSettings,
  setSetting,
  setMultipleSettings,
  getSyncStatus,
  syncDatabase,
  updateSyncConfig
} from '../services/dbService.js';

const router = Router();

/**
 * GET /api/settings
 * Renvoie l'ensemble des réglages persistés en base SQLite
 */
router.get('/', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings
 * Met à jour un ou plusieurs réglages
 */
router.post('/', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (key !== undefined && value !== undefined) {
      const updated = await setSetting(key, value);
      return res.json(updated);
    }

    if (typeof req.body === 'object') {
      const updated = await setMultipleSettings(req.body);
      return res.json(updated);
    }

    res.status(400).json({ error: 'Données de configuration invalides' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/settings/sync
 * Renvoie l'état de la synchronisation Turso Cloud
 */
router.get('/sync', (req, res) => {
  try {
    const status = getSyncStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings/sync
 * Met à jour les identifiants Turso et teste la synchronisation
 */
router.post('/sync', async (req, res) => {
  try {
    const { syncUrl, authToken, enabled } = req.body;
    const status = await updateSyncConfig({ syncUrl, authToken, enabled });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings/sync/trigger
 * Déclenche manuellement une synchronisation avec Turso
 */
router.post('/sync/trigger', async (req, res) => {
  try {
    const result = await syncDatabase();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
