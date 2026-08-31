import { Router } from 'express';
import {
  getScannedPaths,
  addScannedPath,
  removeScannedPath,
  scanProjects,
  openInEditor
} from '../services/projectsService.js';

const router = Router();

/**
 * GET /api/projects
 * Récupère la liste de tous les dépôts Git découverts et leur statut
 */
router.get('/', async (req, res) => {
  try {
    const projects = await scanProjects();
    const paths = await getScannedPaths();
    res.json({
      success: true,
      count: projects.length,
      paths,
      projects
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/projects/paths
 * Renvoie la liste des dossiers sources configurés
 */
router.get('/paths', async (req, res) => {
  try {
    const paths = await getScannedPaths();
    res.json({ success: true, paths });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/paths
 * Ajoute un nouveau dossier racine à scanner
 */
router.post('/paths', async (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath || typeof dirPath !== 'string') {
    return res.status(400).json({ error: 'Chemin de dossier requis.' });
  }

  try {
    const paths = await addScannedPath(dirPath);
    res.json({ success: true, paths });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/projects/paths
 * Supprime un dossier racine de la liste
 */
router.delete('/paths', async (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath || typeof dirPath !== 'string') {
    return res.status(400).json({ error: 'Chemin de dossier requis.' });
  }

  try {
    const paths = await removeScannedPath(dirPath);
    res.json({ success: true, paths });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/open
 * Ouvre le projet dans un éditeur ou terminal
 */
router.post('/open', async (req, res) => {
  const { path: projectPath, editor } = req.body;
  if (!projectPath) {
    return res.status(400).json({ error: 'Chemin du projet requis.' });
  }

  try {
    const result = await openInEditor(projectPath, editor || 'vscode');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
