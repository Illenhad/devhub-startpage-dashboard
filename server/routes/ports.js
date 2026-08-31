import { Router } from 'express';
import { getListeningPorts, killProcess } from '../services/portsService.js';

const router = Router();

/**
 * GET /api/ports
 * Renvoie la liste de tous les ports d'écoute actifs
 */
router.get('/', async (req, res) => {
  try {
    const ports = await getListeningPorts();
    res.json({
      success: true,
      count: ports.length,
      ports
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ports/kill
 * Arrête le processus associé à un PID / Port
 */
router.post('/kill', async (req, res) => {
  const { pid, port } = req.body;
  const numPid = parseInt(pid, 10);

  if (!numPid || isNaN(numPid)) {
    return res.status(400).json({ error: 'PID de processus valide requis.' });
  }

  try {
    const ports = await killProcess(numPid, port);
    res.json({
      success: true,
      message: `Processus ${numPid} (Port ${port || 'N/A'}) arrêté avec succès.`,
      ports
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
