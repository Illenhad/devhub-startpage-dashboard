import { Router } from 'express';
import { getOllamaStatus, streamOllamaGenerate, streamOllamaChat, generateConversationTitle } from '../services/ollamaService.js';

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
