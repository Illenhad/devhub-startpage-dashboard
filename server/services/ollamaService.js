const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

/**
 * Vérifie l'état d'Ollama et récupère les modèles installés
 */
export async function getOllamaStatus() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Erreur HTTP: ${res.status}`);
    }

    const data = await res.json();
    const models = (data.models || []).map(m => ({
      name: m.name,
      model: m.model,
      size: m.size ? `${(m.size / (1024 ** 3)).toFixed(2)} Go` : 'N/D',
      modified_at: m.modified_at,
      parameter_size: m.details?.parameter_size || '',
      family: m.details?.family || '',
      format: m.details?.format || ''
    }));

    return {
      isRunning: true,
      host: OLLAMA_HOST,
      models,
      defaultModel: models[0]?.name || null,
      message: 'Ollama est actif et connecté'
    };
  } catch (err) {
    return {
      isRunning: false,
      host: OLLAMA_HOST,
      models: [],
      defaultModel: null,
      message: 'Ollama n’est pas détecté en local (http://localhost:11434)'
    };
  }
}

/**
 * Envoie un prompt simple à Ollama et stream la réponse (endpoint /api/generate)
 */
export async function streamOllamaGenerate(reqBody, res) {
  const { model, prompt, system, options } = reqBody;

  if (!model || !prompt) {
    res.status(400).json({ error: 'Le modèle et le prompt sont obligatoires' });
    return;
  }

  const controller = new AbortController();
  const handleClientClose = () => {
    controller.abort();
  };
  res.on('close', handleClientClose);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        system: system || 'Tu es un assistant IA local concis, précis et courtois. Réponds en français sauf indication contraire.',
        options: options || {},
        stream: true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: `Erreur Ollama: ${errorText}` });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          res.write(`data: ${JSON.stringify(parsed)}\n\n`);
          if (parsed.done) {
            res.write(`data: [DONE]\n\n`);
            res.end();
            return;
          }
        } catch {}
      }
    }
    res.end();
  } catch (err) {
    if (controller.signal.aborted) {
      return;
    }
    console.error('Erreur streaming Ollama Generate:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Erreur lors de la génération avec Ollama' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  } finally {
    res.off('close', handleClientClose);
  }
}

/**
 * Chat multi-tours conversationnel avec streaming (endpoint /api/chat)
 */
export async function streamOllamaChat(reqBody, res) {
  const { model, messages, options } = reqBody;

  if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Le modèle et le tableau de messages sont requis' });
    return;
  }

  const controller = new AbortController();
  const handleClientClose = () => {
    controller.abort();
  };
  res.on('close', handleClientClose);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        options: options || {},
        stream: true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: `Erreur Ollama Chat: ${errorText}` });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          res.write(`data: ${JSON.stringify(parsed)}\n\n`);
          if (parsed.done) {
            res.write(`data: [DONE]\n\n`);
            res.end();
            return;
          }
        } catch {}
      }
    }
    res.end();
  } catch (err) {
    if (controller.signal.aborted) {
      return;
    }
    console.error('Erreur streaming Ollama Chat:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Erreur lors du chat avec Ollama' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  } finally {
    res.off('close', handleClientClose);
  }
}

/**
 * Génère automatiquement un titre concis pour une conversation via Ollama
 */
export async function generateConversationTitle(promptText, model) {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'gemma4:e2b',
        messages: [
          {
            role: 'system',
            content: 'Tu es un générateur de titres de conversation. Donne un titre très court, clair et percutant (3 à 5 mots en français, sans guillemets, sans ponctuation finale) résumant la demande de l\'utilisateur. Tu réponds STRICTEMENT par le titre seul, rien d\'autre.'
          },
          {
            role: 'user',
            content: promptText.slice(0, 300)
          }
        ],
        stream: false,
        options: {
          temperature: 0.3,
          think: false
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Erreur Ollama Titre: ${response.status}`);
    }

    const data = await response.json();
    let title = (data.message?.content || data.response || '').trim();
    
    // Nettoyage des balises de pensée éventuelles (modèles reasoning)
    title = title.replace(/<think>[\s\S]*?<\/think>/gi, '')
                 .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                 .trim();

    // Nettoyage des astérisques markdown, guillemets, dièses et préfixes éventuels
    title = title.replace(/^[\*"'`«#\s:]+|[\*"'`»\s]+$/g, '')
                 .replace(/^(Titre\s*:\s*)/i, '')
                 .trim();
    title = title.replace(/\*\*/g, '').trim();

    if (title.length > 45) {
      title = title.slice(0, 42) + '...';
    }
    return title || promptText.slice(0, 30) + '...';
  } catch (err) {
    console.error('Erreur génération automatique de titre Ollama:', err);
    return promptText.slice(0, 30) + (promptText.length > 30 ? '...' : '');
  }
}
