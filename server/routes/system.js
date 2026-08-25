import { Router } from 'express';
import { 
  getSystemStats, 
  getProcessesList, 
  getAllDisks, 
  getHeavyFiles, 
  openFinderPath 
} from '../services/systemService.js';

const router = Router();

/**
 * GET /api/system
 * Renvoie les métriques RAM, Disque principal, CPU, Température et Uptime du système
 */
router.get('/', async (req, res) => {
  try {
    const stats = await getSystemStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des métriques système', details: err.message });
  }
});

/**
 * GET /api/system/processes
 * Renvoie la liste complète des processus actifs
 */
router.get('/processes', async (req, res) => {
  try {
    const processes = await getProcessesList();
    res.json({ processes, count: processes.length, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des processus', details: err.message });
  }
});

/**
 * GET /api/system/disks
 * Renvoie tous les disques et volumes montés
 */
router.get('/disks', async (req, res) => {
  try {
    const disks = await getAllDisks();
    res.json({ disks, count: disks.length });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des disques', details: err.message });
  }
});

/**
 * GET /api/system/heavy-files
 * Scanne et renvoie les fichiers les plus lourds
 */
router.get('/heavy-files', async (req, res) => {
  const minSizeMB = parseInt(req.query.minSize, 10) || 100;
  const limit = parseInt(req.query.limit, 10) || 30;

  try {
    const files = await getHeavyFiles(minSizeMB, limit);
    res.json({ files, count: files.length, minSizeMB, limit });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la recherche des fichiers volumineux', details: err.message });
  }
});

/**
 * POST /api/system/open-path
 * Révèle un fichier dans le gestionnaire de fichiers natif (Finder, Explorateur Windows, Linux)
 */
router.post('/open-path', async (req, res) => {
  const { path: targetPath } = req.body;
  if (!targetPath) {
    return res.status(400).json({ error: 'Paramètre path requis' });
  }

  try {
    const result = await openFinderPath(targetPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
