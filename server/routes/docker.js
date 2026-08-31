import { Router } from 'express';
import { 
  getContainers, 
  containerAction, 
  getContainerLogs, 
  getDockerStats, 
  pruneContainers,
  manageDockerService
} from '../services/dockerService.js';

const router = Router();

/**
 * POST /api/docker/service
 * Démarre ou éteint l'application/service Docker
 */
router.post('/service', async (req, res) => {
  const { action } = req.body;
  if (!action || !['start', 'stop'].includes(action)) {
    return res.status(400).json({ error: 'Action invalide. Utilisez "start" ou "stop".' });
  }

  try {
    const result = await manageDockerService(action);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/docker
 * Renvoie l'état du démon Docker et la liste des conteneurs
 */
router.get('/', async (req, res) => {
  try {
    const data = await getContainers();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des conteneurs Docker', details: err.message });
  }
});

/**
 * POST /api/docker/action
 * Déclenche une action sur un conteneur (start, stop, restart, pause, unpause, remove)
 */
router.post('/action', async (req, res) => {
  const { containerId, action } = req.body;
  if (!containerId || !action) {
    return res.status(400).json({ error: 'containerId et action requis' });
  }

  try {
    const result = await containerAction(containerId, action);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/docker/logs/:id
 * Récupère les journaux d'un conteneur
 */
router.get('/logs/:id', async (req, res) => {
  const containerId = req.params.id;
  const tail = req.query.tail || 150;

  try {
    const result = await getContainerLogs(containerId, tail);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/docker/stats
 * Récupère les métriques en direct des conteneurs actifs
 */
router.get('/stats', async (req, res) => {
  try {
    const data = await getDockerStats();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/docker/prune
 * Supprime les conteneurs arrêtés
 */
router.post('/prune', async (req, res) => {
  try {
    const result = await pruneContainers();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
