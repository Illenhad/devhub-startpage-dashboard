/**
 * Widget Vue Pleine Page : Ollama AI Studio (Chat Multi-Tours, Personas & Rejouer les Prompts)
 */

class OllamaFullWidget {
  constructor() {
    this.models = [];
    this.selectedModel = '';
    this.currentPersona = 'general';
    this.temperature = 0.7;
    
    // Sessions de chat
    this.sessions = [];
    this.currentSessionId = null;
    this.messages = []; // [{ role, content, timestamp, model }]
    
    this.abortController = null;
    this.isGenerating = false;

    // Personas prédéfinis
    this.personas = {
      general: {
        name: 'Assistant Général',
        icon: '⚡',
        system: 'Tu es un assistant IA local rapide, clair, concis et courtois. Réponds toujours en français sauf demande explicite.'
      },
      coder: {
        name: 'Expert Code & Architecture',
        icon: '💻',
        system: 'Tu es un ingénieur logiciel senior et architecte d\'élite. Écris du code propre, performant, typé et bien documenté. Privilégie les solutions modernes et concises.'
      },
      writer: {
        name: 'Rédacteur & Synthèse',
        icon: '📝',
        system: 'Tu es un rédacteur d\'excellence et expert en synthèse documentaire. Structure tes propos avec clarté, pertinence et élégance.'
      },
      devops: {
        name: 'DevOps & Terminal',
        icon: '🛠️',
        system: 'Tu es un expert DevOps, Docker, scripting shell (Bash, Zsh, PowerShell) et administration système multi-OS (Linux, macOS, Windows). Donne des commandes shell directes, précises et sûres.'
      },
      custom: {
        name: 'Personnalisé',
        icon: '⚙️',
        system: ''
      }
    };

    // Éléments DOM
    this.modelSelect = document.getElementById('full-ollama-model');
    this.modelDetailsBadge = document.getElementById('full-ollama-model-details');
    this.statusBadge = document.getElementById('full-ollama-status-badge');
    this.personaSelect = document.getElementById('full-ollama-persona');
    this.customSystemContainer = document.getElementById('full-ollama-custom-system-container');
    this.customSystemInput = document.getElementById('full-ollama-custom-system');
    this.tempSlider = document.getElementById('full-ollama-temp');
    this.tempValueEl = document.getElementById('full-ollama-temp-value');

    this.chatHistoryList = document.getElementById('full-ollama-sessions-list');
    this.newChatBtn = document.getElementById('full-ollama-new-chat-btn');
    this.clearAllChatsBtn = document.getElementById('full-ollama-clear-all-btn');

    this.messagesContainer = document.getElementById('full-ollama-messages');
    this.emptyState = document.getElementById('full-ollama-empty-state');
    this.promptInput = document.getElementById('full-ollama-prompt-input');
    this.sendBtn = document.getElementById('full-ollama-send-btn');
    this.stopBtn = document.getElementById('full-ollama-stop-btn');
    this.charCountEl = document.getElementById('full-ollama-char-count');

    this.loadSessionsFromStorage();
    this.bindEvents();
  }

  bindEvents() {
    // Changement de modèle
    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', (e) => {
        this.selectedModel = e.target.value;
        this.updateModelDetails();
        localStorage.setItem('devhub_full_ollama_model', this.selectedModel);
      });
    }

    // Changement de persona
    if (this.personaSelect) {
      this.personaSelect.addEventListener('change', (e) => {
        this.currentPersona = e.target.value;
        if (this.currentPersona === 'custom') {
          this.customSystemContainer?.classList.remove('hidden');
        } else {
          this.customSystemContainer?.classList.add('hidden');
        }
        localStorage.setItem('devhub_full_ollama_persona', this.currentPersona);
      });
    }

    // Température
    if (this.tempSlider) {
      this.tempSlider.addEventListener('input', (e) => {
        this.temperature = parseFloat(e.target.value);
        if (this.tempValueEl) this.tempValueEl.textContent = this.temperature.toFixed(2);
      });
    }

    // Nouvelle conversation
    if (this.newChatBtn) {
      this.newChatBtn.addEventListener('click', () => this.createNewSession());
    }

    // Effacer toutes les conversations
    if (this.clearAllChatsBtn) {
      this.clearAllChatsBtn.addEventListener('click', () => {
        if (confirm('Voulez-vous supprimer tout l’historique des conversations ?')) {
          this.sessions = [];
          this.saveSessionsToStorage();
          this.createNewSession();
        }
      });
    }

    // Input prompt & redimensionnement auto
    if (this.promptInput) {
      this.promptInput.addEventListener('input', () => {
        this.promptInput.style.height = 'auto';
        this.promptInput.style.height = `${Math.min(this.promptInput.scrollHeight, 180)}px`;
        if (this.charCountEl) {
          this.charCountEl.textContent = `${this.promptInput.value.length} caractères`;
        }
      });

      this.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
    }

    // Bouton Envoyer
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.handleSendMessage());
    }

    // Bouton Stop
    if (this.stopBtn) {
      this.stopBtn.addEventListener('click', () => this.stopGeneration());
    }

    // Suggestions rapides
    document.querySelectorAll('[data-ollama-suggestion]').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-ollama-suggestion');
        if (this.promptInput) {
          this.promptInput.value = text;
          this.promptInput.focus();
          this.promptInput.dispatchEvent(new Event('input'));
        }
      });
    });
  }

  // Initialisation à l'ouverture de l'onglet
  async initView() {
    await this.fetchModels();
    if (!this.currentSessionId) {
      if (this.sessions.length > 0) {
        this.loadSession(this.sessions[0].id);
      } else {
        this.createNewSession();
      }
    }
  }

  async fetchModels() {
    try {
      const res = await fetch('/api/ollama/status');
      const data = await res.json();

      if (data.isRunning && data.models.length > 0) {
        this.models = data.models;
        if (this.statusBadge) {
          this.statusBadge.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-[11px] text-emerald-400 font-semibold">Ollama Connecté</span>
          `;
        }

        const savedModel = localStorage.getItem('devhub_full_ollama_model') || localStorage.getItem('mac_full_ollama_model');
        this.selectedModel = (savedModel && this.models.some(m => m.name === savedModel))
          ? savedModel
          : this.models[0].name;

        if (this.modelSelect) {
          this.modelSelect.innerHTML = this.models.map(m => `
            <option value="${m.name}" ${m.name === this.selectedModel ? 'selected' : ''}>
              ${m.name} (${m.size})
            </option>
          `).join('');
        }

        this.updateModelDetails();
      } else {
        if (this.statusBadge) {
          this.statusBadge.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-rose-500"></span>
            <span class="text-[11px] text-rose-400 font-semibold">Ollama Inactif</span>
          `;
        }
      }
    } catch (err) {
      console.error('Erreur chargement modèles Ollama:', err);
    }
  }

  updateModelDetails() {
    if (!this.modelDetailsBadge) return;
    const current = this.models.find(m => m.name === this.selectedModel);
    if (current) {
      this.modelDetailsBadge.innerHTML = `
        <span class="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-300 font-mono text-[10px]">Taille: ${current.size}</span>
        ${current.parameter_size ? `<span class="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-300 font-mono text-[10px]">Params: ${current.parameter_size}</span>` : ''}
        ${current.family ? `<span class="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-400 font-mono text-[10px]">Famille: ${current.family}</span>` : ''}
      `;
    }
  }

  // --- Gestion des Sessions de Chat ---

  createNewSession() {
    const newId = 'session_' + Date.now();
    const newSession = {
      id: newId,
      title: 'Nouvelle conversation',
      createdAt: new Date().toISOString(),
      messages: []
    };

    this.sessions.unshift(newSession);
    this.currentSessionId = newId;
    this.messages = [];
    this.saveSessionsToStorage();
    this.renderSessionsList();
    this.renderMessages();

    if (this.promptInput) {
      this.promptInput.value = '';
      this.promptInput.style.height = 'auto';
      this.promptInput.focus();
    }
  }

  loadSession(sessionId) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;

    this.currentSessionId = sessionId;
    this.messages = session.messages || [];
    this.renderSessionsList();
    this.renderMessages();
  }

  deleteSession(sessionId, e) {
    if (e) e.stopPropagation();
    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    this.saveSessionsToStorage();

    if (this.currentSessionId === sessionId) {
      if (this.sessions.length > 0) {
        this.loadSession(this.sessions[0].id);
      } else {
        this.createNewSession();
      }
    } else {
      this.renderSessionsList();
    }
  }

  editSessionTitle(sessionId, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;

    session._isEditing = true;
    this.renderSessionsList();

    setTimeout(() => {
      const input = document.getElementById(`session-title-input-${sessionId}`);
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
  }

  saveInlineTitle(sessionId, newTitle) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      if (newTitle && newTitle.trim()) {
        session.title = newTitle.trim();
      }
      delete session._isEditing;
      this.saveSessionsToStorage();
      this.renderSessionsList();
    }
  }

  cancelInlineTitle(sessionId) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      delete session._isEditing;
      this.renderSessionsList();
    }
  }

  async retitleSessionWithAI(sessionId, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;

    // 1. Chercher les messages de la session
    let promptText = '';
    const msgs = (session.id === this.currentSessionId && this.messages.length > 0)
      ? this.messages
      : (session.messages || []);

    const userMsg = msgs.find(m => m.role === 'user');
    if (userMsg && userMsg.content) {
      promptText = userMsg.content;
    } else if (msgs.length > 0 && msgs[0].content) {
      promptText = msgs[0].content;
    } else if (session.title && session.title !== 'Nouvelle conversation') {
      promptText = session.title;
    }

    if (!promptText) {
      // Si aucun message, proposer directement le renommage manuel inline
      this.editSessionTitle(sessionId, e);
      return;
    }

    session._isTitling = true;
    this.renderSessionsList();

    try {
      const generatedTitle = await this.autoGenerateSessionTitle(session, promptText);
      delete session._isTitling;
      if (generatedTitle) {
        session.title = generatedTitle;
        this.saveSessionsToStorage();
      }
    } catch (err) {
      delete session._isTitling;
    }

    this.renderSessionsList();
  }

  async autoGenerateSessionTitle(session, promptText) {
    if (!session || !promptText) return null;
    try {
      const res = await fetch('/api/ollama/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          model: this.selectedModel || 'gemma4:e2b'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.title && data.title.trim()) {
          session.title = data.title.trim();
          this.saveSessionsToStorage();
          this.renderSessionsList();
          return session.title;
        }
      }
    } catch (err) {
      console.warn('Titrage automatique Ollama ignoré:', err);
    }
    return null;
  }

  saveSessionsToStorage() {
    try {
      localStorage.setItem('devhub_full_ollama_sessions', JSON.stringify(this.sessions));
    } catch {}
  }

  loadSessionsFromStorage() {
    try {
      const raw = localStorage.getItem('devhub_full_ollama_sessions') || localStorage.getItem('mac_full_ollama_sessions');
      this.sessions = raw ? JSON.parse(raw) : [];
    } catch {
      this.sessions = [];
    }
  }

  renderSessionsList() {
    if (!this.chatHistoryList) return;

    if (this.sessions.length === 0) {
      this.chatHistoryList.innerHTML = `
        <div class="p-3 text-center text-xs text-zinc-500">
          Aucune conversation
        </div>
      `;
      return;
    }

    this.chatHistoryList.innerHTML = this.sessions.map(s => {
      const isActive = s.id === this.currentSessionId;
      return `
        <div 
          onclick="${s._isEditing ? '' : `window.ollamaFullWidget.loadSession('${s.id}')`}"
          class="group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${isActive ? 'bg-brand-500/15 border border-brand-500/30 text-white font-medium shadow-sm' : 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border border-transparent'}"
        >
          <div class="flex items-center gap-2 min-w-0 pr-2 flex-1">
            <svg class="w-3.5 h-3.5 shrink-0 ${isActive ? 'text-brand-400' : 'text-zinc-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
            
            ${s._isEditing ? `
              <input
                id="session-title-input-${s.id}"
                type="text"
                value="${this.escapeHtml(s.title)}"
                onclick="event.stopPropagation()"
                onkeydown="if(event.key==='Enter') { event.preventDefault(); window.ollamaFullWidget.saveInlineTitle('${s.id}', this.value); } if(event.key==='Escape') { event.preventDefault(); window.ollamaFullWidget.cancelInlineTitle('${s.id}'); }"
                onblur="window.ollamaFullWidget.saveInlineTitle('${s.id}', this.value)"
                class="text-xs bg-zinc-900 border border-brand-500 rounded-lg px-2 py-0.5 text-white outline-none w-full shadow-inner"
              />
            ` : s._isTitling ? `
              <span class="text-xs truncate block text-amber-400 animate-pulse flex items-center gap-1">
                <span>✨</span> <span>Génération du titre...</span>
              </span>
            ` : `
              <span class="text-xs truncate block">${this.escapeHtml(s.title)}</span>
            `}
          </div>
          
          ${!s._isEditing && !s._isTitling ? `
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button 
                onclick="window.ollamaFullWidget.retitleSessionWithAI('${s.id}', event)"
                class="p-1 rounded hover:text-amber-400 hover:bg-zinc-800/80 transition-all text-zinc-500 cursor-pointer"
                title="Régénérer le titre avec l'IA"
              >
                <span class="text-[11px]">✨</span>
              </button>
              <button 
                onclick="window.ollamaFullWidget.editSessionTitle('${s.id}', event)"
                class="p-1 rounded hover:text-white hover:bg-zinc-800/80 transition-all text-zinc-500 cursor-pointer"
                title="Renommer manuellement"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </button>
              <button 
                onclick="window.ollamaFullWidget.deleteSession('${s.id}', event)"
                class="p-1 rounded hover:text-rose-400 hover:bg-zinc-800/80 transition-all text-zinc-500 cursor-pointer"
                title="Supprimer"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // --- Rendu des Messages & Actions Rejouer / Copier ---

  renderMessages() {
    if (!this.messagesContainer) return;

    if (this.messages.length === 0) {
      this.messagesContainer.innerHTML = '';
      this.emptyState?.classList.remove('hidden');
      return;
    }

    this.emptyState?.classList.add('hidden');

    this.messagesContainer.innerHTML = this.messages.map((m, idx) => {
      const isUser = m.role === 'user';
      const isInterrupted = !isUser && (m.content.includes('(Génération interrompue)') || m.isInterrupted);
      const isError = !isUser && m.content.startsWith('⚠️ Erreur');

      return `
        <div class="flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in group">
          ${!isUser ? `
            <div class="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-black text-xs shrink-0 mt-0.5">
              🦙
            </div>
          ` : ''}

          <div class="max-w-[85%] sm:max-w-[75%] space-y-1">
            <div class="flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'} px-1">
              <span class="text-[10px] font-semibold text-zinc-500 uppercase">${isUser ? 'Vous' : (m.model || 'AI Studio')}</span>
              <span class="text-[10px] text-zinc-600 font-mono">${m.time || ''}</span>
            </div>

            <div class="p-4 rounded-2xl ${isUser ? 'bg-brand-600 text-white rounded-tr-sm shadow-md' : 'bg-zinc-900/90 border border-zinc-800 text-zinc-100 rounded-tl-sm shadow-lg'}">
              ${isUser ? `
                <p class="text-xs whitespace-pre-wrap leading-relaxed">${this.escapeHtml(m.content)}</p>
              ` : `
                <div class="markdown-body text-xs space-y-2" id="msg-content-${idx}">
                  ${this.parseMarkdown(m.content)}
                </div>

                ${(isInterrupted || isError) ? `
                  <div class="mt-3 pt-2.5 border-t border-zinc-800 flex items-center justify-between gap-2 bg-amber-500/5 p-2 rounded-xl border-amber-500/20">
                    <span class="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                      <span>${isInterrupted ? 'Génération interrompue' : 'Erreur de génération'}</span>
                    </span>
                    <button
                      onclick="window.ollamaFullWidget.regenerateResponse(${idx})"
                      class="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                      <span>Rejouer le prompt</span>
                    </button>
                  </div>
                ` : ''}
              `}
            </div>

            <!-- Barre d'actions du message -->
            <div class="flex items-center ${isUser ? 'justify-end' : 'justify-start'} gap-1.5 px-1 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              ${isUser ? `
                <button
                  onclick="window.ollamaFullWidget.editOrReplayPrompt(${idx})"
                  class="text-[10px] text-zinc-400 hover:text-brand-300 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-800/80"
                  title="Rejouer ou modifier ce prompt"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  <span>Rejouer</span>
                </button>
              ` : `
                <button
                  onclick="window.ollamaFullWidget.regenerateResponse(${idx})"
                  class="text-[10px] text-zinc-400 hover:text-purple-300 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-800/80"
                  title="Régénérer cette réponse"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  <span>Régénérer</span>
                </button>
              `}

              <button
                onclick="window.ollamaFullWidget.copyMessageContent(${idx}, this)"
                class="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-800/80"
                title="Copier le texte"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                <span>Copier</span>
              </button>
            </div>
          </div>

          ${isUser ? `
            <div class="w-8 h-8 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-300 font-bold text-xs shrink-0 mt-0.5">
              👤
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    this.scrollToBottom();
    this.attachCopyCodeButtons();
  }

  // --- Envoi, Régénération & Rejeu de Prompts ---

  async handleSendMessage() {
    if (this.isGenerating || !this.promptInput) return;
    const prompt = this.promptInput.value.trim();
    if (!prompt) return;

    if (!this.selectedModel) {
      alert('Veuillez sélectionner un modèle Ollama actif.');
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // 1. Ajouter le message utilisateur
    const userMsg = { role: 'user', content: prompt, time: timeStr };
    this.messages.push(userMsg);

    // Synchronisation de la session active
    const currentSession = this.sessions.find(s => s.id === this.currentSessionId);
    if (currentSession) {
      currentSession.messages = this.messages;
      // Titre automatique intelligent par IA au premier message
      if (this.messages.length === 1) {
        currentSession.title = prompt.slice(0, 30) + (prompt.length > 30 ? '...' : '');
        this.renderSessionsList();
        // Génération du titre intelligent en arrière-plan avec Ollama
        this.autoGenerateSessionTitle(currentSession, prompt);
      }
    }

    // Reset input
    this.promptInput.value = '';
    this.promptInput.style.height = 'auto';
    if (this.charCountEl) this.charCountEl.textContent = '0 caractères';

    // 2. Ajouter le message assistant vide prêt pour le stream
    const assistantMsgIndex = this.messages.length;
    const assistantMsg = { role: 'assistant', content: '', model: this.selectedModel, time: timeStr };
    this.messages.push(assistantMsg);

    this.renderMessages();
    await this.streamAssistantResponse(assistantMsgIndex);
  }

  /**
   * Régénère la réponse de l'assistant (ou rejoue le prompt associé)
   */
  async regenerateResponse(assistantMsgIndex) {
    if (this.isGenerating) {
      this.stopGeneration();
      await new Promise(r => setTimeout(r, 200));
    }

    if (assistantMsgIndex < 0 || assistantMsgIndex >= this.messages.length) return;

    // Si on clique sur un message assistant, on réinitialise son contenu
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Tronquer les messages suivants s'il y en avait
    this.messages = this.messages.slice(0, assistantMsgIndex + 1);
    this.messages[assistantMsgIndex] = {
      role: 'assistant',
      content: '',
      model: this.selectedModel,
      time: timeStr
    };

    this.renderMessages();
    await this.streamAssistantResponse(assistantMsgIndex);
  }

  /**
   * Place le prompt utilisateur dans la zone de saisie pour modification ou rejeu direct
   */
  editOrReplayPrompt(userMsgIndex) {
    if (userMsgIndex < 0 || userMsgIndex >= this.messages.length) return;
    const msg = this.messages[userMsgIndex];
    if (!msg || msg.role !== 'user') return;

    if (this.promptInput) {
      this.promptInput.value = msg.content;
      this.promptInput.focus();
      this.promptInput.dispatchEvent(new Event('input'));
      this.promptInput.scrollIntoView({ behavior: 'smooth' });
    }
  }

  /**
   * Copie le texte d'un message dans le presse-papiers
   */
  copyMessageContent(index, btn) {
    if (index < 0 || index >= this.messages.length) return;
    const msg = this.messages[index];
    if (!msg) return;

    navigator.clipboard.writeText(msg.content).then(() => {
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = `
          <svg class="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          <span class="text-emerald-400">Copié !</span>
        `;
        setTimeout(() => {
          btn.innerHTML = originalText;
        }, 1800);
      }
    });
  }

  /**
   * Cœur d'exécution du streaming SSE pour un message assistant
   */
  async streamAssistantResponse(assistantMsgIndex) {
    if (!this.selectedModel) return;

    // Récupérer le system prompt selon persona
    let systemPrompt = this.personas[this.currentPersona]?.system || '';
    if (this.currentPersona === 'custom' && this.customSystemInput) {
      systemPrompt = this.customSystemInput.value.trim() || this.personas.general.system;
    }

    const currentSession = this.sessions.find(s => s.id === this.currentSessionId);

    // Activer l'état de génération
    this.setGeneratingState(true);

    // Construire le payload de messages pour le multi-tour (exclut le message assistant vide en cours)
    const historyToInclude = this.messages.slice(0, assistantMsgIndex);
    const chatPayload = [
      { role: 'system', content: systemPrompt },
      ...historyToInclude.map(m => ({ role: m.role, content: m.content }))
    ];

    try {
      this.abortController = new AbortController();

      const response = await fetch('/api/ollama/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.selectedModel,
          messages: chatPayload,
          options: {
            temperature: this.temperature
          }
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`Erreur serveur (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';

      const targetEl = document.getElementById(`msg-content-${assistantMsgIndex}`);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.message?.content) {
                accumulatedText += parsed.message.content;
                if (this.messages[assistantMsgIndex]) {
                  this.messages[assistantMsgIndex].content = accumulatedText;
                }
                if (targetEl) {
                  targetEl.innerHTML = this.parseMarkdown(accumulatedText) + '<span class="typing-cursor"></span>';
                }
                this.scrollToBottom();
              }
            } catch {}
          }
        }
      }

      // Finaliser le message
      if (this.messages[assistantMsgIndex]) {
        this.messages[assistantMsgIndex].content = accumulatedText;
        this.messages[assistantMsgIndex].isInterrupted = false;
      }
      if (targetEl) {
        targetEl.innerHTML = this.parseMarkdown(accumulatedText);
      }
      this.attachCopyCodeButtons();

      // Sauvegarder dans la session courante
      if (currentSession) {
        currentSession.messages = this.messages;
        this.saveSessionsToStorage();
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (this.messages[assistantMsgIndex]) {
          this.messages[assistantMsgIndex].content += '\n\n*(Génération interrompue)*';
          this.messages[assistantMsgIndex].isInterrupted = true;
        }
      } else {
        if (this.messages[assistantMsgIndex]) {
          this.messages[assistantMsgIndex].content = `⚠️ Erreur : ${err.message}`;
        }
      }
      this.renderMessages();
    } finally {
      this.setGeneratingState(false);
      this.abortController = null;
      if (currentSession) {
        currentSession.messages = this.messages;
        this.saveSessionsToStorage();
      }
    }
  }

  stopGeneration() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  setGeneratingState(isGenerating) {
    this.isGenerating = isGenerating;
    if (isGenerating) {
      this.sendBtn?.classList.add('hidden');
      this.stopBtn?.classList.remove('hidden');
    } else {
      this.sendBtn?.classList.remove('hidden');
      this.stopBtn?.classList.add('hidden');
    }
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  parseMarkdown(text) {
    if (!text) return '';
    if (typeof marked !== 'undefined') {
      return marked.parse(text);
    }
    return text.replace(/\n/g, '<br>');
  }

  escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  attachCopyCodeButtons() {
    document.querySelectorAll('#full-ollama-messages pre').forEach(pre => {
      if (pre.querySelector('.code-copy-btn')) return;

      const btn = document.createElement('button');
      btn.className = 'code-copy-btn absolute top-2 right-2 px-2.5 py-1 text-[10px] font-mono font-semibold rounded-lg bg-zinc-800/90 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all border border-zinc-700/60';
      btn.textContent = 'Copier';

      pre.style.position = 'relative';
      pre.appendChild(btn);

      btn.addEventListener('click', () => {
        const codeEl = pre.querySelector('code');
        const codeText = codeEl ? codeEl.innerText : pre.innerText;
        navigator.clipboard.writeText(codeText).then(() => {
          btn.textContent = 'Copié !';
          btn.className = 'code-copy-btn absolute top-2 right-2 px-2.5 py-1 text-[10px] font-mono font-semibold rounded-lg bg-emerald-600 text-white transition-all';
          setTimeout(() => {
            btn.textContent = 'Copier';
            btn.className = 'code-copy-btn absolute top-2 right-2 px-2.5 py-1 text-[10px] font-mono font-semibold rounded-lg bg-zinc-800/90 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all border border-zinc-700/60';
          }, 2000);
        });
      });
    });
  }
}

window.OllamaFullWidget = OllamaFullWidget;
