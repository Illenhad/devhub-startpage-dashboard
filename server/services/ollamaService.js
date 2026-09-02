import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
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

const onlineLibraryCache = new Map();
const LIBRARY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 heures de cache

/**
 * Récupère en direct la bibliothèque complète des modèles depuis ollama.com/library
 * Permet de toujours obtenir les modèles récents et populaires sans être figé dans le code.
 */
export async function fetchOllamaOnlineLibrary(sort = 'popular', forceRefresh = false) {
  const cacheKey = `ollama_lib_${sort}`;
  const cached = onlineLibraryCache.get(cacheKey);

  if (!forceRefresh && cached && (Date.now() - cached.timestamp < LIBRARY_CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const url = `https://ollama.com/library?sort=${encodeURIComponent(sort)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (response.ok) {
      const html = await response.text();
      const itemRegex = /<li[^>]*>\s*<a href="\/library\/([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;
      const models = [];
      let match;

      while ((match = itemRegex.exec(html)) !== null) {
        const slug = match[1];
        const block = match[2];

        // Description
        const descMatch = block.match(/<p[^>]*class="[^"]*text-neutral-800[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
        let desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        desc = desc.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

        // Capacités (tools, thinking, vision, embedding)
        const capMatches = [...block.matchAll(/class="[^"]*text-indigo-600[^"]*"[^>]*>([^<]+)<\/span>/gi)].map(m => m[1].trim());

        // Tailles
        const sizeMatches = [...block.matchAll(/class="[^"]*text-blue-600[^"]*"[^>]*>([^<]+)<\/span>/gi)].map(m => m[1].trim());

        // Pulls
        const pullsMatch = block.match(/<span[^>]*>([0-9.]+[KMB]?)<\/span>\s*<span[^>]*>[^<]*Pulls/i);
        const pulls = pullsMatch ? pullsMatch[1] : '';

        // Catégorie suggérée
        let category = 'general';
        let categoryLabel = 'Polyvalent';
        if (capMatches.includes('thinking')) {
          category = 'reasoning';
          categoryLabel = 'Raisonnement';
        } else if (slug.includes('coder') || slug.includes('code') || slug.includes('dev')) {
          category = 'code';
          categoryLabel = 'Code & Dev';
        } else if (capMatches.includes('embedding')) {
          category = 'embedding';
          categoryLabel = 'Embeddings';
        } else if (sizeMatches.some(s => s === '1b' || s === '2b' || s === '3b' || s === '270m')) {
          category = 'light';
          categoryLabel = 'Léger & Rapide';
        }

        models.push({
          name: slug,
          label: slug,
          desc: desc || `Modèle officiel ${slug} sur Ollama`,
          category,
          categoryLabel,
          capabilities: capMatches,
          sizes: sizeMatches,
          pulls: pulls ? `${pulls} pulls` : '',
          isOnline: true
        });
      }

      if (models.length > 0) {
        const result = {
          source: 'online',
          sort,
          total: models.length,
          updatedAt: new Date().toISOString(),
          models
        };
        onlineLibraryCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
    }
  } catch (err) {
    console.warn('Impossible de joindre ollama.com/library en direct, repli sur la sélection locale:', err.message);
  }

  // Repli local en cas d'absence de connexion internet
  return {
    source: 'fallback',
    sort,
    total: 6,
    updatedAt: new Date().toISOString(),
    models: getCuratedModelLibrary().map(m => ({
      ...m,
      capabilities: [m.category],
      sizes: [m.size.replace('~', '')],
      pulls: 'Recommandé',
      isOnline: false
    }))
  };
}

/**
 * Bibliothèque de modèles populaires recommandés (Repli hors-ligne)
 */
export function getCuratedModelLibrary() {
  return [
    {
      name: 'llama3.2:3b',
      label: 'Llama 3.2 (3B)',
      tag: 'Meta',
      category: 'general',
      categoryLabel: 'Polyvalent & Rapide',
      size: '~2.0 Go',
      desc: 'Le modèle compact phare de Meta. Très rapide, excellent en français, idéal au quotidien pour la synthèse et les questions.'
    },
    {
      name: 'qwen2.5-coder:7b',
      label: 'Qwen 2.5 Coder (7B)',
      tag: 'Alibaba',
      category: 'code',
      categoryLabel: 'Spécialiste Code & Dev',
      size: '~4.7 Go',
      desc: 'L\'un des meilleurs modèles open-source pour le développement. Maîtrise JavaScript, Python, Bash, Docker, refactoring et debug.'
    },
    {
      name: 'deepseek-r1:8b',
      label: 'DeepSeek R1 (8B)',
      tag: 'DeepSeek',
      category: 'reasoning',
      categoryLabel: 'Raisonnement & Math',
      size: '~4.9 Go',
      desc: 'Modèle de raisonnement avec chaîne de pensée détaillée (<think>). Remarquable pour la logique, les problèmes complexes et l\'analyse.'
    },
    {
      name: 'mistral:7b',
      label: 'Mistral (7B)',
      tag: 'Mistral AI',
      category: 'general',
      categoryLabel: 'Référence Française',
      size: '~4.1 Go',
      desc: 'Le modèle iconique de Mistral AI. Excellente compréhension du français, écriture fluide, précis et polyvalent.'
    },
    {
      name: 'phi4:14b',
      label: 'Phi-4 (14B)',
      tag: 'Microsoft',
      category: 'reasoning',
      categoryLabel: 'Haute Précision',
      size: '~9.1 Go',
      desc: 'Modèle de pointe de Microsoft entraîné sur des données synthétiques de haute qualité. Très fort en logique et raisonnement.'
    },
    {
      name: 'gemma2:2b',
      label: 'Gemma 2 (2B)',
      tag: 'Google',
      category: 'light',
      categoryLabel: 'Ultra-Léger & Économe',
      size: '~1.6 Go',
      desc: 'Conçu par Google DeepMind pour les machines avec mémoire limitée. Démarre instantanément et consomme très peu de RAM.'
    }
  ];
}

/**
 * Télécharge un modèle Ollama (pull) et stream la progression via Server-Sent Events
 */
export async function streamOllamaPull(modelName, res) {
  if (!modelName || typeof modelName !== 'string') {
    res.status(400).json({ error: 'Le nom du modèle est requis' });
    return;
  }

  const cleanName = modelName.trim();
  const controller = new AbortController();
  const handleClientClose = () => {
    controller.abort();
  };
  res.on('close', handleClientClose);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cleanName,
        stream: true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: `Erreur Ollama Pull: ${errorText}` });
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
          if (parsed.status === 'success') {
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
    console.error('Erreur streaming Ollama Pull:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Erreur lors du téléchargement du modèle' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  } finally {
    res.off('close', handleClientClose);
  }
}

/**
 * Supprime un modèle local Ollama (DELETE /api/delete)
 */
export async function deleteOllamaModel(modelName) {
  if (!modelName || typeof modelName !== 'string') {
    throw new Error('Nom de modèle invalide');
  }

  const res = await fetch(`${OLLAMA_HOST}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName.trim() })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Erreur suppression (${res.status}): ${errorText}`);
  }

  return { success: true, message: `Modèle ${modelName} supprimé avec succès` };
}

/**
 * Démarre ou éteint l'application/service Ollama
 * Supporte macOS (Ollama.app via open / osascript / pkill ou ollama serve), Windows (PowerShell / WSL / taskkill) et Linux (systemctl / ollama serve)
 */
export async function manageOllamaService(action) {
  if (action !== 'start' && action !== 'stop') {
    throw new Error(`Action de service non supportée: ${action}`);
  }

  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';

  if (action === 'start') {
    if (isMac) {
      try {
        await execAsync('open -a Ollama || open /Applications/Ollama.app || nohup /usr/local/bin/ollama serve > /dev/null 2>&1 &');
        return { success: true, message: 'Démarrage d’Ollama initié...' };
      } catch (err) {
        throw new Error(`Échec du lancement d’Ollama: ${err.message}`);
      }
    } else if (isWindows) {
      let started = false;
      let lastError = null;

      // 1. Tenter le démarrage dans WSL si présent
      try {
        const { stdout } = await execAsync('wsl.exe which ollama');
        if (stdout && stdout.trim()) {
          try {
            await execAsync('wsl.exe -u root systemctl start ollama');
            started = true;
          } catch {
            await execAsync('wsl.exe nohup /usr/local/bin/ollama serve > /dev/null 2>&1 &');
            started = true;
          }
        }
      } catch (err) {
        lastError = err;
      }

      // 2. Tenter le démarrage sous Windows natif si WSL n'a pas pris le relais
      if (!started) {
        try {
          await execAsync('powershell -NoProfile -Command "$app = \\"$env:LOCALAPPDATA\\Programs\\Ollama\\ollama app.exe\\"; if (Test-Path $app) { Start-Process $app } else { Start-Process \'ollama\' -ArgumentList \'serve\' -WindowStyle Hidden }"');
          started = true;
        } catch (err) {
          lastError = err;
        }
      }

      if (started) {
        return { success: true, message: 'Démarrage d’Ollama initié (Windows / WSL)...' };
      } else {
        throw new Error(`Échec du lancement d’Ollama sur Windows / WSL: ${lastError?.message || 'Inconnu'}`);
      }
    } else {
      try {
        await execAsync('systemctl start ollama || nohup ollama serve > /dev/null 2>&1 &');
        return { success: true, message: 'Service Ollama démarré' };
      } catch (err) {
        throw new Error(`Échec du démarrage d’Ollama: ${err.message}`);
      }
    }
  } else if (action === 'stop') {
    if (isMac) {
      try {
        await execAsync('killall -9 Ollama ollama 2>/dev/null; pkill -9 -i -f "ollama" 2>/dev/null || true');
        return { success: true, message: 'Fermeture d’Ollama en cours...' };
      } catch (err) {
        throw new Error(`Échec de la fermeture d’Ollama: ${err.message}`);
      }
    } else if (isWindows) {
      // 1. Arrêt des processus Windows natifs
      try {
        await execAsync('powershell -NoProfile -Command "$ErrorActionPreference = \'SilentlyContinue\'; Get-Process \'ollama*\' | Stop-Process -Force; exit 0"');
      } catch {}

      // 2. Arrêt du service et processus dans WSL
      try {
        await execAsync('wsl.exe -u root systemctl stop ollama');
      } catch {
        try {
          await execAsync('wsl.exe -u root pkill -9 -f ollama');
        } catch {}
      }

      try {
        await execAsync('wsl.exe -u root pkill -9 -f "ollama serve"');
      } catch {}

      return { success: true, message: 'Fermeture d’Ollama en cours (Windows & WSL)...' };
    } else {
      try {
        await execAsync('systemctl stop ollama || pkill -9 -f ollama || true');
        return { success: true, message: 'Service Ollama arrêté' };
      } catch (err) {
        throw new Error(`Échec de l’arrêt d’Ollama: ${err.message}`);
      }
    }
  }
}

