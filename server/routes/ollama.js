import { Router } from 'express';
import {
  getOllamaStatus,
  streamOllamaGenerate,
  streamOllamaChat,
  generateConversationTitle,
  getCuratedModelLibrary,
  fetchOllamaOnlineLibrary,
  streamOllamaPull,
  deleteOllamaModel
} from '../services/ollamaService.js';

const router = Router();

/**
 * GET /api/ollama/status
 * Vérifie si Ollama est actif et liste les modèles disponibles
 */
router.get('/status', async (req, res) => {
  try {
    const status = await getOllamaStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la vérification du statut Ollama', details: err.message });
  }
});

/**
 * GET /api/ollama/models/library
 * Retourne la liste des modèles officiels Ollama récupérés en direct
 */
router.get('/models/library', async (req, res) => {
  try {
    const sort = req.query.sort === 'newest' ? 'newest' : 'popular';
    const forceRefresh = req.query.refresh === 'true';
    const libraryData = await fetchOllamaOnlineLibrary(sort, forceRefresh);
    res.json({ success: true, ...libraryData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ollama/models/pull
 * Lance le téléchargement d'un modèle et stream la progression SSE
 */
router.post('/models/pull', async (req, res) => {
  const { model } = req.body;
  await streamOllamaPull(model, res);
});

/**
 * DELETE /api/ollama/models/:name
 * Supprime un modèle local
 */
router.delete('/models/:name', async (req, res) => {
  try {
    const modelName = req.params.name;
    const result = await deleteOllamaModel(modelName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ollama/generate
 * Envoie un prompt unique et stream la réponse
 */
router.post('/generate', async (req, res) => {
  await streamOllamaGenerate(req.body, res);
});

/**
 * POST /api/ollama/chat
 * Multi-tour conversationnel avec mémoire et streaming
 */
router.post('/chat', async (req, res) => {
  await streamOllamaChat(req.body, res);
});

/**
 * POST /api/ollama/title
 * Génère automatiquement un titre court et intelligent pour une conversation
 */
router.post('/title', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Le prompt est requis' });
    }
    const title = await generateConversationTitle(prompt, model);
    res.json({ title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
