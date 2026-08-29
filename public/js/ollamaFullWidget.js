/**
 * Widget Vue Pleine Page : Ollama AI Studio
 * Gestion avancée des Prompts Système, Personas sur-mesure, Fichiers Joints & Streaming SSE
 */

class OllamaFullWidget {
  constructor() {
    this.models = [];
    this.selectedModel = '';
    this.currentPersona = 'general';
    this.temperature = 0.7;

    // Fichiers joints en cours
    this.attachments = []; // [{ id, name, size, formattedSize, extension, isImage, previewUrl, base64Data, textContent }]

    // Sessions de chat
    this.sessions = [];
    this.currentSessionId = null;
    this.messages = []; // [{ role, content, displayContent, attachments, images, time, model, isInterrupted }]

    this.abortController = null;
    this.isGenerating = false;

    // 1. Personas Système Prédéfinis
    this.builtinPersonas = {
      general: {
        id: 'general',
        name: 'Assistant Général',
        icon: '⚡',
        isBuiltin: true,
        system: 'Tu es un assistant IA local rapide, clair, concis et courtois. Réponds toujours en français sauf demande explicite.'
      },
      coder: {
        id: 'coder',
        name: 'Expert Code & Architecture',
        icon: '💻',
        isBuiltin: true,
        system: 'Tu es un ingénieur logiciel senior et architecte d\'élite. Écris du code propre, performant, typé et bien documenté. Privilégie les solutions modernes, maintenables et concises.'
      },
      writer: {
        id: 'writer',
        name: 'Rédacteur & Synthèse',
        icon: '📝',
        isBuiltin: true,
        system: 'Tu es un rédacteur d\'excellence et expert en synthèse documentaire. Structure tes propos avec clarté, pertinence, rigueur et élégance stylistique.'
      },
      devops: {
        id: 'devops',
        name: 'DevOps & Terminal',
        icon: '🛠️',
        isBuiltin: true,
        system: 'Tu es un expert DevOps, Docker, scripting shell (Bash, Zsh, PowerShell) et administration système multi-OS (Linux, macOS, Windows). Donne des commandes shell directes, précises et sûres.'
      },
      translator: {
        id: 'translator',
        name: 'Traducteur Multilingue',
        icon: '🌐',
        isBuiltin: true,
        system: 'Tu es un traducteur et linguiste professionnel multilingue. Traduis avec exactitude terminologique, fluidité et respect des nuances culturelles et du registre de langue.'
      },
      reviewer: {
        id: 'reviewer',
        name: 'Revue de Code & Debug',
        icon: '🔍',
        isBuiltin: true,
        system: 'Tu es un auditeur de code et relecteur technique exigeant. Analyse minutieusement le code fourni, détecte les failles de sécurité, bugs potentiels, edge cases et propose des optimisations concrètes.'
      },
      custom: {
        id: 'custom',
        name: 'Prompt Libre / Sur-Mesure',
        icon: '⚙️',
        isBuiltin: true,
        system: 'Tu es un assistant IA sur-mesure répondant de manière adaptée à mes besoins et instructions spécifiques.'
      }
    };

    // 2. Personas personnalisés chargés depuis le localStorage
    this.customPersonas = [];
    this.loadCustomPersonas();

    // Éléments DOM principaux
    this.modelSelect = document.getElementById('full-ollama-model');
    this.modelDetailsBadge = document.getElementById('full-ollama-model-details');
    this.statusBadge = document.getElementById('full-ollama-status-badge');

    // Éléments DOM Personas & System Prompt
    this.personaSelect = document.getElementById('full-ollama-persona');
    this.newPersonaBtn = document.getElementById('full-ollama-new-persona-btn');
    this.customSystemContainer = document.getElementById('full-ollama-custom-system-container');
    this.customSystemInput = document.getElementById('full-ollama-custom-system');
    this.systemStatusEl = document.getElementById('full-ollama-system-status');
    this.systemCharCountEl = document.getElementById('full-ollama-system-char-count');
    this.resetSystemBtn = document.getElementById('full-ollama-reset-system-btn');
    this.savePersonaBtn = document.getElementById('full-ollama-save-persona-btn');
    this.deletePersonaBtn = document.getElementById('full-ollama-delete-persona-btn');

    // Header Chat Badge
    this.headerPersonaBadge = document.getElementById('full-ollama-active-persona-badge');
    this.headerPersonaIcon = document.getElementById('full-ollama-active-persona-icon');
    this.headerPersonaName = document.getElementById('full-ollama-active-persona-name');

    // Modal Persona
    this.personaModal = document.getElementById('ollama-persona-modal');
    this.personaForm = document.getElementById('ollama-persona-form');
    this.personaIconInput = document.getElementById('ollama-persona-icon-input');
    this.personaNameInput = document.getElementById('ollama-persona-name-input');
    this.personaPromptInput = document.getElementById('ollama-persona-prompt-input');
    this.personaPromptCount = document.getElementById('ollama-persona-prompt-count');
    this.personaModalClose = document.getElementById('ollama-persona-modal-close');
    this.personaModalCancel = document.getElementById('ollama-persona-modal-cancel');

    // Modal Gestion des Modèles
    this.manageModelsBtn = document.getElementById('full-ollama-manage-models-btn');
    this.modelsModal = document.getElementById('ollama-models-modal');
    this.modelsModalClose = document.getElementById('ollama-models-modal-close');
    this.modelsSummaryEl = document.getElementById('ollama-models-summary');
    this.pullProgressContainer = document.getElementById('ollama-pull-progress-container');
    this.pullModelNameEl = document.getElementById('ollama-pull-model-name');
    this.pullPercentageEl = document.getElementById('ollama-pull-percentage');
    this.pullProgressBar = document.getElementById('ollama-pull-progress-bar');
    this.pullStatusTextEl = document.getElementById('ollama-pull-status-text');
    this.pullBytesEl = document.getElementById('ollama-pull-bytes');
    this.pullCustomForm = document.getElementById('ollama-pull-custom-form');
    this.pullCustomInput = document.getElementById('ollama-pull-custom-input');
    this.pullCustomBtn = document.getElementById('ollama-pull-custom-btn');
    this.recommendedModelsList = document.getElementById('ollama-recommended-models-list');
    this.installedModelsList = document.getElementById('ollama-installed-models-list');
    this.installedCountEl = document.getElementById('ollama-installed-count');
    this.libTabPopular = document.getElementById('ollama-lib-tab-popular');
    this.libTabNewest = document.getElementById('ollama-lib-tab-newest');
    this.libTabCurated = document.getElementById('ollama-lib-tab-curated');
    this.libSearchInput = document.getElementById('ollama-lib-search-input');
    this.libRefreshBtn = document.getElementById('ollama-lib-refresh-btn');
    this.currentLibSort = 'popular';
    this.libSearchQuery = '';
    this.libraryCache = {};
    this.isPulling = false;
    this.pullAbortController = null;
    this.curatedLibrary = [];

    // Éléments Statistiques de Session & Conversation
    this.sessionStatsBadge = document.getElementById('full-ollama-session-stats-badge');
    this.sessionStatsText = document.getElementById('full-ollama-session-stats-text');
    this.statsModal = document.getElementById('ollama-stats-modal');
    this.statsModalClose = document.getElementById('ollama-stats-modal-close');
    this.statsSessionTitle = document.getElementById('ollama-stats-session-title');
    this.statsTotalTokens = document.getElementById('ollama-stats-total-tokens');
    this.statsTokensSplit = document.getElementById('ollama-stats-tokens-split');
    this.statsTotalTime = document.getElementById('ollama-stats-total-time');
    this.statsAvgSpeed = document.getElementById('ollama-stats-avg-speed');
    this.statsMsgCount = document.getElementById('ollama-stats-msg-count');
    this.statsThinkingCount = document.getElementById('ollama-stats-thinking-count');
    this.statsModelsUsed = document.getElementById('ollama-stats-models-used');
    this.statsMessagesBreakdown = document.getElementById('ollama-stats-messages-breakdown');

    // Éléments Modale Métriques d'un Message
    this.msgStatsModal = document.getElementById('ollama-message-stats-modal');
    this.msgStatsModalClose = document.getElementById('ollama-message-stats-modal-close');
    this.msgModalModel = document.getElementById('ollama-msg-modal-model');
    this.msgModalDuration = document.getElementById('ollama-msg-modal-duration');
    this.msgModalSpeed = document.getElementById('ollama-msg-modal-speed');
    this.msgModalTotalTokens = document.getElementById('ollama-msg-modal-total-tokens');
    this.msgModalLoad = document.getElementById('ollama-msg-modal-load');
    this.msgModalPrompt = document.getElementById('ollama-msg-modal-prompt');
    this.msgModalEval = document.getElementById('ollama-msg-modal-eval');
    this.msgModalThinkingBox = document.getElementById('ollama-msg-modal-thinking-box');
    this.msgModalThinkingLen = document.getElementById('ollama-msg-modal-thinking-len');
    this.msgModalThinkingContent = document.getElementById('ollama-msg-modal-thinking-content');
    this.msgModalPromptText = document.getElementById('ollama-msg-modal-prompt-text');

    // Éléments Fichiers & Drag-and-Drop
    this.fileInput = document.getElementById('full-ollama-file-input');
    this.attachBtn = document.getElementById('full-ollama-attach-btn');
    this.attachmentsList = document.getElementById('full-ollama-attachments-list');
    this.dropZone = document.getElementById('full-ollama-drop-zone');
    this.dragOverlay = document.getElementById('full-ollama-drag-overlay');
    this.fileNoticeEl = document.getElementById('full-ollama-file-notice');
    this.fileNoticeText = document.getElementById('full-ollama-file-notice-text');

    // Limites de sécurité des fichiers joints
    this.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo par fichier
    this.MAX_TOTAL_FILES_SIZE = 30 * 1024 * 1024; // 30 Mo au total
    this.MAX_FILES_COUNT = 8; // 8 fichiers max simultanés
    this.CONTEXT_WARN_CHARS = 100_000; // ~25k tokens : alerte contexte pour LLM local

    // Paramètres & Contrôles
    this.tempSlider = document.getElementById('full-ollama-temp');
    this.tempValueEl = document.getElementById('full-ollama-temp-value');
    this.chatHistoryList = document.getElementById('full-ollama-sessions-list');
    this.newChatBtn = document.getElementById('full-ollama-new-chat-btn');
    this.clearAllChatsBtn = document.getElementById('full-ollama-clear-all-btn');

    // Messages & Prompt
    this.messagesContainer = document.getElementById('full-ollama-messages');
    this.emptyState = document.getElementById('full-ollama-empty-state');
    this.promptInput = document.getElementById('full-ollama-prompt-input');
    this.sendBtn = document.getElementById('full-ollama-send-btn');
    this.stopBtn = document.getElementById('full-ollama-stop-btn');
    this.charCountEl = document.getElementById('full-ollama-char-count');

    // Initialisation
    this.loadSavedSettings();
    this.loadSessionsFromStorage();
    this.populatePersonaSelect();
    this.bindEvents();
    this.setupDragAndDrop();
    this.setupClipboardPaste();
  }

  loadSavedSettings() {
    const savedPersona = localStorage.getItem('devhub_full_ollama_persona') || 'general';
    this.currentPersona = savedPersona;
  }

  // --- Gestion des Fichiers & Attachments ---

  async handleFilesSelection(fileList) {
    if (!fileList || fileList.length === 0) return;

    const errors = [];
    const filesArray = Array.from(fileList);

    for (const file of filesArray) {
      // 1. Vérifier le nombre maximal de fichiers
      if (this.attachments.length >= this.MAX_FILES_COUNT) {
        errors.push(`Limite maximale de <strong>${this.MAX_FILES_COUNT} fichiers</strong> par envoi atteinte.`);
        break;
      }

      // 2. Vérifier la taille par fichier (10 Mo max)
      if (file.size > this.MAX_FILE_SIZE) {
        errors.push(`<strong>${this.escapeHtml(file.name)}</strong> (${this.formatBytes(file.size)}) dépasse la taille max de ${this.formatBytes(this.MAX_FILE_SIZE)}.`);
        continue;
      }

      // 3. Vérifier la taille cumulée (30 Mo max)
      const currentTotalSize = this.attachments.reduce((sum, a) => sum + (a.size || 0), 0);
      if (currentTotalSize + file.size > this.MAX_TOTAL_FILES_SIZE) {
        errors.push(`L'ajout de <strong>${this.escapeHtml(file.name)}</strong> dépasse la taille totale autorisée de ${this.formatBytes(this.MAX_TOTAL_FILES_SIZE)}.`);
        continue;
      }

      // 4. Éviter les doublons exacts
      if (this.attachments.some(a => a.name === file.name && a.size === file.size)) {
        continue;
      }

      const extension = (file.name.split('.').pop() || '').toLowerCase();
      const isImage = file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(extension);

      const attachment = {
        id: 'file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: file.name,
        size: file.size,
        formattedSize: this.formatBytes(file.size),
        extension,
        isImage,
        previewUrl: null,
        base64Data: null,
        textContent: null,
        isHugeText: false,
        charCount: 0
      };

      if (isImage) {
        try {
          const dataUrl = await this.readFileAsDataURL(file);
          attachment.previewUrl = dataUrl;
          attachment.base64Data = dataUrl.split(',')[1] || '';
          this.attachments.push(attachment);
        } catch (err) {
          console.error('Erreur lecture image:', err);
          errors.push(`Impossible de lire l'image <strong>${this.escapeHtml(file.name)}</strong>.`);
        }
      } else {
        try {
          const text = await this.readFileAsText(file);
          attachment.textContent = text;
          attachment.charCount = text.length;
          if (text.length > this.CONTEXT_WARN_CHARS) {
            attachment.isHugeText = true;
          }
          this.attachments.push(attachment);
        } catch (err) {
          console.error('Erreur lecture fichier texte:', err);
          errors.push(`Impossible de lire le fichier <strong>${this.escapeHtml(file.name)}</strong>.`);
        }
      }
    }

    this.renderAttachmentsPreview();

    // Afficher un bandeau d'information si des limites ont été atteintes
    if (errors.length > 0) {
      this.showFileNotice(errors.join('<br>'));
    }

    if (this.promptInput) {
      this.promptInput.focus();
    }
  }

  showFileNotice(htmlMessage) {
    if (!this.fileNoticeEl || !this.fileNoticeText) return;
    this.fileNoticeText.innerHTML = htmlMessage;
    this.fileNoticeEl.classList.remove('hidden');
    if (this._noticeTimeout) clearTimeout(this._noticeTimeout);
    this._noticeTimeout = setTimeout(() => {
      this.fileNoticeEl?.classList.add('hidden');
    }, 6000);
  }

  hideFileNotice() {
    if (this.fileNoticeEl) {
      this.fileNoticeEl.classList.add('hidden');
    }
    if (this._noticeTimeout) clearTimeout(this._noticeTimeout);
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'utf-8');
    });
  }

  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  removeAttachment(id) {
    this.attachments = this.attachments.filter(a => a.id !== id);
    this.renderAttachmentsPreview();
  }

  clearAttachments() {
    this.attachments = [];
    this.hideFileNotice();
    this.renderAttachmentsPreview();
    if (this.fileInput) this.fileInput.value = '';
  }

  renderAttachmentsPreview() {
    if (!this.attachmentsList) return;

    if (this.attachments.length === 0) {
      this.attachmentsList.innerHTML = '';
      this.attachmentsList.classList.add('hidden');
      return;
    }

    const totalBytes = this.attachments.reduce((sum, a) => sum + (a.size || 0), 0);
    const totalFormatted = this.formatBytes(totalBytes);
    const hasHugeText = this.attachments.some(a => a.isHugeText);

    this.attachmentsList.classList.remove('hidden');
    this.attachmentsList.innerHTML = `
      <div class="flex items-center justify-between px-1 text-[11px] text-zinc-400">
        <div class="flex items-center gap-1.5 font-medium flex-wrap">
          <span class="text-purple-400 font-semibold">📎 ${this.attachments.length} / ${this.MAX_FILES_COUNT} fichier(s)</span>
          <span class="text-zinc-600 font-mono">•</span>
          <span class="text-zinc-400 font-mono">${totalFormatted} / ${this.formatBytes(this.MAX_TOTAL_FILES_SIZE)} max</span>
          ${hasHugeText ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold text-[10px]" title="Fichier(s) très volumineux : risque de saturation du contexte">⚠️ Fichier très long</span>` : ''}
        </div>
        <button
          type="button"
          onclick="window.ollamaFullWidget.clearAttachments()"
          class="text-[10px] text-zinc-500 hover:text-rose-400 font-medium transition-colors cursor-pointer"
          title="Tout retirer"
        >
          Tout retirer
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        ${this.attachments.map(att => `
          <div class="flex items-center gap-2 p-1.5 px-2.5 rounded-xl bg-zinc-900 border ${att.isHugeText ? 'border-amber-500/40 bg-amber-500/5' : 'border-purple-500/30'} text-xs text-zinc-200 shadow-sm animate-fade-in group">
            ${att.isImage ? `
              <img src="${att.previewUrl}" alt="${this.escapeHtml(att.name)}" class="w-5 h-5 rounded object-cover border border-zinc-700 shrink-0" />
            ` : `
              <span class="text-sm shrink-0">${this.getFileIcon(att.extension)}</span>
            `}
            
            <div class="flex flex-col min-w-0 max-w-[140px] sm:max-w-[200px]">
              <div class="flex items-center gap-1">
                <span class="text-[11px] font-semibold text-zinc-100 truncate">${this.escapeHtml(att.name)}</span>
                ${att.isHugeText ? `<span class="text-amber-400 text-[10px]" title="Fichier très long (~${Math.round(att.charCount / 1000)}k caractères)">⚠️</span>` : ''}
              </div>
              <span class="text-[9px] text-zinc-400 font-mono">${att.formattedSize}${att.charCount ? ` • ${Math.round(att.charCount / 1000)}k car.` : ''}</span>
            </div>

            <button
              type="button"
              onclick="window.ollamaFullWidget.removeAttachment('${att.id}')"
              class="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors ml-1 cursor-pointer"
              title="Retirer ce fichier"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  getFileIcon(ext) {
    const icons = {
      js: '🟨', ts: '🟦', jsx: '⚛️', tsx: '⚛️', py: '🐍',
      json: '📋', md: '📝', html: '🌐', css: '🎨', sh: '🐚',
      sql: '🗄️', csv: '📊', yml: '⚙️', yaml: '⚙️', rs: '🦀',
      go: '🐹', java: '☕', cpp: '⚙️', c: '⚙️', php: '🐘'
    };
    return icons[ext] || '📄';
  }

  getSyntaxLanguage(ext) {
    const map = {
      js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
      py: 'python', json: 'json', md: 'markdown', html: 'html',
      css: 'css', scss: 'scss', sh: 'bash', bash: 'bash', zsh: 'bash',
      sql: 'sql', csv: 'csv', yml: 'yaml', yaml: 'yaml', rs: 'rust',
      go: 'go', java: 'java', cpp: 'cpp', c: 'c', php: 'php',
      xml: 'xml', toml: 'toml', ini: 'ini'
    };
    return map[ext] || '';
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'Ko', 'Mo', 'Go'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  setupDragAndDrop() {
    const dropArea = this.dropZone || document.getElementById('full-ollama-input-container');
    if (!dropArea) return;

    let dragCounter = 0;

    const showOverlay = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      if (this.dragOverlay) this.dragOverlay.classList.remove('hidden');
    };

    const hideOverlay = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        if (this.dragOverlay) this.dragOverlay.classList.add('hidden');
      }
    };

    dropArea.addEventListener('dragenter', showOverlay);
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    dropArea.addEventListener('dragleave', hideOverlay);
    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      if (this.dragOverlay) this.dragOverlay.classList.add('hidden');

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.handleFilesSelection(e.dataTransfer.files);
      }
    });

    // Support également du drag & drop sur la boîte de messages
    if (this.messagesContainer) {
      this.messagesContainer.addEventListener('dragenter', showOverlay);
      this.messagesContainer.addEventListener('dragleave', hideOverlay);
      this.messagesContainer.addEventListener('dragover', (e) => e.preventDefault());
      this.messagesContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        if (this.dragOverlay) this.dragOverlay.classList.add('hidden');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFilesSelection(e.dataTransfer.files);
        }
      });
    }
  }

  setupClipboardPaste() {
    if (!this.promptInput) return;

    this.promptInput.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        this.handleFilesSelection(files);
      }
    });
  }

  // --- Gestion des Personas & Prompts Système ---

  loadCustomPersonas() {
    try {
      const raw = localStorage.getItem('devhub_ollama_custom_personas');
      this.customPersonas = raw ? JSON.parse(raw) : [];
    } catch {
      this.customPersonas = [];
    }
  }

  saveCustomPersonas() {
    try {
      localStorage.setItem('devhub_ollama_custom_personas', JSON.stringify(this.customPersonas));
    } catch (err) {
      console.error('Erreur sauvegarde personas personnalisés:', err);
    }
  }

  getAllPersonasMap() {
    const map = { ...this.builtinPersonas };
    for (const p of this.customPersonas) {
      map[p.id] = p;
    }
    return map;
  }

  getPersona(id) {
    const all = this.getAllPersonasMap();
    return all[id] || this.builtinPersonas.general;
  }

  populatePersonaSelect() {
    if (!this.personaSelect) return;

    let html = '<optgroup label="✨ Personas Prédéfinis">';
    for (const key of Object.keys(this.builtinPersonas)) {
      const p = this.builtinPersonas[key];
      html += `<option value="${p.id}" ${p.id === this.currentPersona ? 'selected' : ''}>${p.icon} ${p.name}</option>`;
    }
    html += '</optgroup>';

    if (this.customPersonas.length > 0) {
      html += '<optgroup label="💾 Personas Personnalisés">';
      for (const p of this.customPersonas) {
        html += `<option value="${p.id}" ${p.id === this.currentPersona ? 'selected' : ''}>${p.icon || '🤖'} ${p.name}</option>`;
      }
      html += '</optgroup>';
    }

    this.personaSelect.innerHTML = html;

    if (!this.getPersona(this.currentPersona)) {
      this.currentPersona = 'general';
      this.personaSelect.value = 'general';
    } else {
      this.personaSelect.value = this.currentPersona;
    }

    this.updateSystemPromptUI();
  }

  selectPersona(personaId, updateSession = true) {
    this.currentPersona = personaId;
    localStorage.setItem('devhub_full_ollama_persona', personaId);

    if (this.personaSelect) {
      this.personaSelect.value = personaId;
    }

    const persona = this.getPersona(personaId);
    let promptText = persona?.system || '';

    const currentSession = this.sessions.find(s => s.id === this.currentSessionId);
    if (currentSession) {
      if (updateSession) {
        currentSession.persona = personaId;
        currentSession.systemPrompt = promptText;
        this.saveSessionsToStorage();
      } else if (currentSession.systemPrompt && currentSession.persona === personaId) {
        promptText = currentSession.systemPrompt;
      }
    }

    if (this.customSystemInput) {
      this.customSystemInput.value = promptText;
    }

    this.updateSystemPromptUI();
    this.renderMessages();
  }

  getCurrentSystemPrompt() {
    if (this.customSystemInput && this.customSystemInput.value.trim()) {
      return this.customSystemInput.value.trim();
    }
    const persona = this.getPersona(this.currentPersona);
    return persona?.system || this.builtinPersonas.general.system;
  }

  updateSystemPromptUI() {
    const persona = this.getPersona(this.currentPersona);
    const promptText = this.getCurrentSystemPrompt();

    if (this.headerPersonaName) {
      this.headerPersonaName.textContent = persona.name;
    }
    if (this.headerPersonaIcon) {
      this.headerPersonaIcon.textContent = persona.icon || '⚡';
    }

    if (this.deletePersonaBtn) {
      if (!persona.isBuiltin) {
        this.deletePersonaBtn.classList.remove('hidden');
      } else {
        this.deletePersonaBtn.classList.add('hidden');
      }
    }

    if (this.systemCharCountEl) {
      this.systemCharCountEl.textContent = `${promptText.length} car.`;
    }

    if (this.systemStatusEl) {
      this.systemStatusEl.textContent = persona.isBuiltin ? 'Rôle actif' : 'Persona personnalisé';
    }
  }

  resetCurrentPersonaPrompt() {
    const persona = this.getPersona(this.currentPersona);
    if (!persona) return;

    let defaultPrompt = '';
    if (persona.isBuiltin) {
      defaultPrompt = this.builtinPersonas[persona.id]?.system || '';
    } else {
      const originalCustom = this.customPersonas.find(p => p.id === persona.id);
      defaultPrompt = originalCustom?.system || '';
    }

    if (this.customSystemInput) {
      this.customSystemInput.value = defaultPrompt;
      this.customSystemInput.dispatchEvent(new Event('input'));
    }

    this.showSystemPromptToast('↺ Prompt réinitialisé par défaut');
  }

  saveCurrentPersonaPrompt() {
    const promptText = this.getCurrentSystemPrompt();
    const persona = this.getPersona(this.currentPersona);

    if (!persona.isBuiltin) {
      const existing = this.customPersonas.find(p => p.id === persona.id);
      if (existing) {
        existing.system = promptText;
        this.saveCustomPersonas();
        this.showSystemPromptToast('💾 Persona sauvegardé !');
      }
    } else {
      this.openNewPersonaModal(promptText, `Mon ${persona.name}`, persona.icon || '🤖');
    }

    const currentSession = this.sessions.find(s => s.id === this.currentSessionId);
    if (currentSession) {
      currentSession.systemPrompt = promptText;
      currentSession.persona = this.currentPersona;
      this.saveSessionsToStorage();
    }
  }

  deleteCurrentCustomPersona() {
    const persona = this.getPersona(this.currentPersona);
    if (!persona || persona.isBuiltin) return;

    if (confirm(`Voulez-vous vraiment supprimer le persona "${persona.name}" ?`)) {
      this.customPersonas = this.customPersonas.filter(p => p.id !== persona.id);
      this.saveCustomPersonas();
      this.selectPersona('general', true);
      this.populatePersonaSelect();
      this.showSystemPromptToast('🗑️ Persona supprimé');
    }
  }

  openNewPersonaModal(initialPrompt = '', initialName = '', initialIcon = '🤖') {
    if (!this.personaModal) return;

    if (this.personaIconInput) this.personaIconInput.value = initialIcon;
    if (this.personaNameInput) this.personaNameInput.value = initialName;
    if (this.personaPromptInput) {
      this.personaPromptInput.value = initialPrompt || this.getCurrentSystemPrompt();
      if (this.personaPromptCount) {
        this.personaPromptCount.textContent = `${this.personaPromptInput.value.length} car.`;
      }
    }

    this.personaModal.classList.remove('hidden');
    setTimeout(() => {
      this.personaNameInput?.focus();
      this.personaNameInput?.select();
    }, 50);
  }

  closeNewPersonaModal() {
    if (!this.personaModal) return;
    this.personaModal.classList.add('hidden');
    if (this.personaForm) this.personaForm.reset();
  }

  handleCreatePersona(e) {
    if (e) e.preventDefault();
    const name = this.personaNameInput ? this.personaNameInput.value.trim() : '';
    const icon = this.personaIconInput ? this.personaIconInput.value.trim() || '🤖' : '🤖';
    const system = this.personaPromptInput ? this.personaPromptInput.value.trim() : '';

    if (!name || !system) {
      alert('Veuillez fournir un nom et une instruction système.');
      return;
    }

    const newId = 'custom_' + Date.now();
    const newPersona = {
      id: newId,
      name,
      icon,
      isBuiltin: false,
      system
    };

    this.customPersonas.unshift(newPersona);
    this.saveCustomPersonas();
    this.closeNewPersonaModal();

    this.populatePersonaSelect();
    this.selectPersona(newId, true);
    this.showSystemPromptToast(`✨ Persona "${name}" créé !`);
  }

  showSystemPromptToast(text) {
    if (this.systemStatusEl) {
      const originalText = this.systemStatusEl.textContent;
      this.systemStatusEl.textContent = text;
      this.systemStatusEl.classList.add('text-purple-400', 'font-bold');
      setTimeout(() => {
        this.systemStatusEl.textContent = originalText;
        this.systemStatusEl.classList.remove('text-purple-400', 'font-bold');
      }, 2500);
    }
  }

  focusSystemPrompt() {
    if (this.customSystemInput) {
      this.customSystemInput.focus();
      this.customSystemInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.customSystemInput.classList.add('ring-2', 'ring-purple-500');
      setTimeout(() => {
        this.customSystemInput?.classList.remove('ring-2', 'ring-purple-500');
      }, 1500);
    }
  }

  // --- Événements & Binding ---

  bindEvents() {
    // Changement de modèle
    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', (e) => {
        this.selectedModel = e.target.value;
        this.updateModelDetails();
        localStorage.setItem('devhub_full_ollama_model', this.selectedModel);
      });
    }

    // Changement de Persona
    if (this.personaSelect) {
      this.personaSelect.addEventListener('change', (e) => {
        this.selectPersona(e.target.value, true);
      });
    }

    // Bouton "+ Nouveau Persona"
    if (this.newPersonaBtn) {
      this.newPersonaBtn.addEventListener('click', () => {
        this.openNewPersonaModal(this.getCurrentSystemPrompt(), '', '🤖');
      });
    }

    // Badge Persona dans le Header du Chat
    if (this.headerPersonaBadge) {
      this.headerPersonaBadge.addEventListener('click', () => {
        this.focusSystemPrompt();
      });
    }

    // Bouton Joindre des Fichiers (Déclenche l'input file caché)
    if (this.attachBtn && this.fileInput) {
      this.attachBtn.addEventListener('click', () => {
        this.fileInput.click();
      });
    }

    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        this.handleFilesSelection(e.target.files);
      });
    }

    // Modifications en direct du System Prompt dans la zone de texte
    if (this.customSystemInput) {
      this.customSystemInput.addEventListener('input', () => {
        const text = this.customSystemInput.value;
        if (this.systemCharCountEl) {
          this.systemCharCountEl.textContent = `${text.length} car.`;
        }

        const currentSession = this.sessions.find(s => s.id === this.currentSessionId);
        if (currentSession) {
          currentSession.systemPrompt = text;
          this.saveSessionsToStorage();
        }
      });
    }

    // Bouton Réinitialiser au prompt par défaut
    if (this.resetSystemBtn) {
      this.resetSystemBtn.addEventListener('click', () => this.resetCurrentPersonaPrompt());
    }

    // Bouton Sauvegarder Prompt / Persona
    if (this.savePersonaBtn) {
      this.savePersonaBtn.addEventListener('click', () => this.saveCurrentPersonaPrompt());
    }

    // Bouton Supprimer Persona Personnalisé
    if (this.deletePersonaBtn) {
      this.deletePersonaBtn.addEventListener('click', () => this.deleteCurrentCustomPersona());
    }

    // Modal Nouveau Persona : Événements
    if (this.personaForm) {
      this.personaForm.addEventListener('submit', (e) => this.handleCreatePersona(e));
    }
    if (this.personaModalClose) {
      this.personaModalClose.addEventListener('click', () => this.closeNewPersonaModal());
    }
    if (this.personaModalCancel) {
      this.personaModalCancel.addEventListener('click', () => this.closeNewPersonaModal());
    }
    if (this.personaPromptInput) {
      this.personaPromptInput.addEventListener('input', () => {
        if (this.personaPromptCount) {
          this.personaPromptCount.textContent = `${this.personaPromptInput.value.length} car.`;
        }
      });
    }

    // Sélecteur d'icônes rapides dans la modale
    const iconPicker = document.getElementById('ollama-persona-icon-picker');
    if (iconPicker) {
      iconPicker.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          if (this.personaIconInput) {
            this.personaIconInput.value = btn.innerText.trim();
          }
        });
      });
    }

    // Modal Gestion des Modèles : Événements
    if (this.manageModelsBtn) {
      this.manageModelsBtn.addEventListener('click', () => this.openModelsModal());
    }
    if (this.modelsModalClose) {
      this.modelsModalClose.addEventListener('click', () => this.closeModelsModal());
    }
    if (this.pullCustomForm) {
      this.pullCustomForm.addEventListener('submit', (e) => this.handleCustomModelPull(e));
    }

    // Onglets de la bibliothèque (Populaires, Nouveautés, Sélection)
    if (this.libTabPopular) {
      this.libTabPopular.addEventListener('click', () => this.switchLibraryTab('popular'));
    }
    if (this.libTabNewest) {
      this.libTabNewest.addEventListener('click', () => this.switchLibraryTab('newest'));
    }
    if (this.libTabCurated) {
      this.libTabCurated.addEventListener('click', () => this.switchLibraryTab('curated'));
    }

    // Recherche en direct dans la bibliothèque
    if (this.libSearchInput) {
      this.libSearchInput.addEventListener('input', (e) => {
        this.libSearchQuery = e.target.value.toLowerCase().trim();
        this.renderModelsModalContent();
      });
    }

    // Bouton forcer l'actualisation depuis ollama.com
    if (this.libRefreshBtn) {
      this.libRefreshBtn.addEventListener('click', () => this.refreshLibraryFromOnline());
    }

    // Modal Statistiques de Conversation : Événements
    if (this.sessionStatsBadge) {
      this.sessionStatsBadge.addEventListener('click', () => this.openSessionStatsModal());
    }
    if (this.statsModalClose) {
      this.statsModalClose.addEventListener('click', () => this.closeSessionStatsModal());
    }
    if (this.msgStatsModalClose) {
      this.msgStatsModalClose.addEventListener('click', () => this.closeMessageStatsModal());
    }

    // Fermeture des modales au clic extérieur ou Échap
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.personaModal && !this.personaModal.classList.contains('hidden')) {
          this.closeNewPersonaModal();
        }
        if (this.modelsModal && !this.modelsModal.classList.contains('hidden') && !this.isPulling) {
          this.closeModelsModal();
        }
        if (this.statsModal && !this.statsModal.classList.contains('hidden')) {
          this.closeSessionStatsModal();
        }
        if (this.msgStatsModal && !this.msgStatsModal.classList.contains('hidden')) {
          this.closeMessageStatsModal();
        }
      }
    });

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
    } else {
      this.updateSessionStatsUI();
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

  // --- Gestionnaire & Téléchargement des Modèles Ollama ---

  async openModelsModal() {
    if (!this.modelsModal) return;
    this.modelsModal.classList.remove('hidden');
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');

    // Récupérer la bibliothèque et rafraîchir le contenu
    await this.fetchCuratedLibrary(this.currentLibSort);
    this.renderModelsModalContent();
  }

  closeModelsModal() {
    if (!this.modelsModal) return;
    if (this.isPulling) {
      if (!confirm('Un téléchargement est en cours. Voulez-vous masquer la fenêtre ? Le téléchargement continuera en arrière-plan.')) {
        return;
      }
    }
    this.modelsModal.classList.add('hidden');
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
  }

  async switchLibraryTab(sort) {
    this.currentLibSort = sort;

    const activeClasses = ['notif-badge-solid', 'text-white', 'font-semibold'];
    const inactiveClasses = ['text-zinc-400', 'hover:text-white', 'font-medium'];

    [
      { el: this.libTabPopular, sort: 'popular' },
      { el: this.libTabNewest, sort: 'newest' },
      { el: this.libTabCurated, sort: 'curated' }
    ].forEach(({ el, sort: s }) => {
      if (!el) return;
      if (s === sort) {
        el.classList.remove(...inactiveClasses);
        el.classList.add(...activeClasses);
      } else {
        el.classList.remove(...activeClasses);
        el.classList.add(...inactiveClasses);
      }
    });

    if (this.recommendedModelsList) {
      this.recommendedModelsList.innerHTML = `
        <div class="col-span-full py-8 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
          <span class="w-2 h-2 rounded-full notif-badge-dot animate-ping"></span>
          <span>Chargement des modèles depuis ollama.com...</span>
        </div>
      `;
    }

    await this.fetchCuratedLibrary(sort);
    this.renderModelsModalContent();
  }

  async refreshLibraryFromOnline() {
    if (this.libRefreshBtn) {
      this.libRefreshBtn.classList.add('animate-spin');
    }
    delete this.libraryCache[this.currentLibSort];
    await this.fetchCuratedLibrary(this.currentLibSort, true);
    if (this.libRefreshBtn) {
      this.libRefreshBtn.classList.remove('animate-spin');
    }
    this.renderModelsModalContent();
  }

  async fetchCuratedLibrary(sort = 'popular', forceRefresh = false) {
    if (sort === 'curated') {
      try {
        const res = await fetch('/api/ollama/models/library');
        const data = await res.json();
        this.curatedLibrary = data.models || [];
      } catch (err) {
        console.error('Erreur chargement sélection:', err);
      }
      return;
    }

    if (!forceRefresh && this.libraryCache[sort] && this.libraryCache[sort].length > 0) {
      this.curatedLibrary = this.libraryCache[sort];
      return;
    }

    try {
      const url = `/api/ollama/models/library?sort=${encodeURIComponent(sort)}${forceRefresh ? '&refresh=true' : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.models)) {
        this.curatedLibrary = data.models;
        this.libraryCache[sort] = data.models;
      }
    } catch (err) {
      console.error('Erreur chargement bibliothèque en direct:', err);
    }
  }

  renderModelsModalContent() {
    const installed = this.models || [];

    // En-tête résumé
    if (this.modelsSummaryEl) {
      this.modelsSummaryEl.textContent = `${installed.length} modèle(s) installé(s) localement`;
    }
    if (this.installedCountEl) {
      this.installedCountEl.textContent = `${installed.length} modèle(s)`;
    }

    // 1. Liste des modèles de la bibliothèque
    if (this.recommendedModelsList) {
      let library = this.curatedLibrary || [];

      // Filtrage par recherche
      if (this.libSearchQuery) {
        const q = this.libSearchQuery;
        library = library.filter(m => 
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.desc && m.desc.toLowerCase().includes(q)) ||
          (m.categoryLabel && m.categoryLabel.toLowerCase().includes(q)) ||
          (m.capabilities && m.capabilities.some(c => c.toLowerCase().includes(q))) ||
          (m.sizes && m.sizes.some(s => s.toLowerCase().includes(q)))
        );
      }

      if (library.length === 0) {
        this.recommendedModelsList.innerHTML = `
          <div class="col-span-full py-8 text-center text-xs text-zinc-500">
            Aucun modèle ne correspond à votre recherche "${this.escapeHtml(this.libSearchQuery)}".
          </div>
        `;
      } else {
        this.recommendedModelsList.innerHTML = library.slice(0, 40).map(rec => {
          // Vérification si le modèle ou l'une de ses déclinaisons est installé
          const isInstalled = installed.some(m => {
            const mBase = m.name.split(':')[0];
            const recBase = rec.name.split(':')[0];
            return m.name === rec.name || mBase === recBase;
          });

          // Badges de capacités
          const capBadges = (rec.capabilities || []).map(cap => {
            if (cap === 'thinking') return '<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/20 text-purple-300 font-semibold">🧠 thinking</span>';
            if (cap === 'tools') return '<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-blue-500/20 text-blue-300 font-semibold">🛠️ tools</span>';
            if (cap === 'vision') return '<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 font-semibold">👁️ vision</span>';
            if (cap === 'embedding') return '<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 font-semibold">📐 embed</span>';
            return `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400">${this.escapeHtml(cap)}</span>`;
          }).join('');

          // Tailles disponibles sous forme de tags cliquables
          const sizePills = (rec.sizes || []).map(size => {
            const fullTagName = `${rec.name}:${size}`;
            const isThisSizeInstalled = installed.some(m => m.name === fullTagName);
            if (isThisSizeInstalled) {
              return `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" title="Cette version est déjà installée">${size} ✓</span>`;
            }
            return `
              <button
                type="button"
                onclick="window.ollamaFullWidget.startModelPull('${this.escapeHtml(fullTagName)}')"
                ${this.isPulling ? 'disabled' : ''}
                class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-900 hover:bg-brand-500/20 hover:border-brand-500/40 border border-zinc-800 text-zinc-300 hover:text-brand-300 transition-all cursor-pointer disabled:opacity-40"
                title="Télécharger la version ${size}"
              >
                + ${size}
              </button>
            `;
          }).join('');

          return `
            <div class="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex flex-col justify-between gap-3 hover:border-zinc-700 transition-all group">
              <div class="space-y-1.5">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="font-bold text-xs text-white truncate group-hover:text-brand-300 transition-colors">${this.escapeHtml(rec.label || rec.name)}</span>
                    ${rec.tag ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400 shrink-0">${rec.tag}</span>` : ''}
                  </div>
                  ${rec.pulls ? `<span class="text-[10px] font-mono text-zinc-500 shrink-0 flex items-center gap-1"><span>📥</span> <span>${rec.pulls}</span></span>` : ''}
                </div>

                <p class="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">${this.escapeHtml(rec.desc || '')}</p>

                <!-- Capacités et Tailles -->
                <div class="flex flex-wrap gap-1 items-center pt-0.5">
                  ${capBadges}
                  ${sizePills}
                </div>
              </div>
              
              <div class="flex items-center justify-between pt-2 border-t border-zinc-800/40">
                <span class="text-[10px] text-zinc-500 font-medium">${rec.categoryLabel || 'Modèle Ollama'}</span>
                ${isInstalled ? `
                  <span class="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    <span>Installé</span>
                  </span>
                ` : `
                  <button
                    type="button"
                    onclick="window.ollamaFullWidget.startModelPull('${this.escapeHtml(rec.name)}')"
                    ${this.isPulling ? 'disabled' : ''}
                    class="px-3 py-1 rounded-xl notif-badge-solid text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    <span>Télécharger</span>
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 2. Liste des modèles installés localement
    if (this.installedModelsList) {
      if (installed.length === 0) {
        this.installedModelsList.innerHTML = `
          <div class="p-4 rounded-2xl bg-zinc-950/40 border border-zinc-800 text-center text-xs text-zinc-500">
            Aucun modèle installé. Choisissez un modèle recommandé ci-dessus ou téléchargez-en un par son nom.
          </div>
        `;
      } else {
        this.installedModelsList.innerHTML = installed.map(m => {
          const isCurrentActive = m.name === this.selectedModel;
          return `
            <div class="p-3 rounded-2xl bg-zinc-950/70 border ${isCurrentActive ? 'border-brand-500/40 bg-brand-500/5' : 'border-zinc-800/80'} flex items-center justify-between gap-3 transition-all hover:border-zinc-700">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm shrink-0">
                  🦙
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs font-bold text-zinc-100 truncate">${this.escapeHtml(m.name)}</span>
                    ${isCurrentActive ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold notif-badge-solid text-white shrink-0">Actif</span>' : ''}
                  </div>
                  <div class="flex items-center gap-2 text-[10px] text-zinc-400 font-mono mt-0.5">
                    <span>${m.size}</span>
                    ${m.parameter_size ? `<span>• ${m.parameter_size}</span>` : ''}
                    ${m.family ? `<span>• ${m.family}</span>` : ''}
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                ${!isCurrentActive ? `
                  <button
                    type="button"
                    onclick="window.ollamaFullWidget.quickSelectModel('${this.escapeHtml(m.name)}')"
                    class="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition-all cursor-pointer"
                    title="Définir comme modèle actif pour le chat"
                  >
                    Activer
                  </button>
                ` : ''}
                <button
                  type="button"
                  onclick="window.ollamaFullWidget.deleteModel('${this.escapeHtml(m.name)}')"
                  ${this.isPulling ? 'disabled' : ''}
                  class="p-1.5 rounded-xl bg-zinc-900 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 border border-zinc-800 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Supprimer ce modèle pour libérer de l'espace"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  quickSelectModel(modelName) {
    this.selectedModel = modelName;
    if (this.modelSelect) this.modelSelect.value = modelName;
    localStorage.setItem('devhub_full_ollama_model', modelName);
    this.updateModelDetails();
    this.renderModelsModalContent();
  }

  handleCustomModelPull(e) {
    e.preventDefault();
    if (!this.pullCustomInput) return;
    const modelName = this.pullCustomInput.value.trim();
    if (!modelName) return;
    this.startModelPull(modelName);
    this.pullCustomInput.value = '';
  }

  async startModelPull(modelName) {
    if (this.isPulling) {
      alert('Un téléchargement est déjà en cours. Veuillez patienter.');
      return;
    }

    this.isPulling = true;
    this.renderModelsModalContent();

    if (this.pullProgressContainer) {
      this.pullProgressContainer.classList.remove('hidden');
    }
    if (this.pullModelNameEl) this.pullModelNameEl.textContent = modelName;
    if (this.pullPercentageEl) this.pullPercentageEl.textContent = '0%';
    if (this.pullProgressBar) this.pullProgressBar.style.width = '0%';
    if (this.pullStatusTextEl) this.pullStatusTextEl.textContent = 'Connexion à la bibliothèque Ollama...';
    if (this.pullBytesEl) this.pullBytesEl.textContent = '0 Mo / 0 Mo';

    try {
      const res = await fetch('/api/ollama/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Erreur serveur HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter(Boolean);

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.replace('data: ', '').trim();
          if (dataStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(dataStr);
            
            if (parsed.error) {
              throw new Error(parsed.error);
            }

            // Calcul du pourcentage et mise à jour de la barre
            if (parsed.completed && parsed.total) {
              const pct = Math.min(100, Math.round((parsed.completed / parsed.total) * 100));
              if (this.pullPercentageEl) this.pullPercentageEl.textContent = `${pct}%`;
              if (this.pullProgressBar) this.pullProgressBar.style.width = `${pct}%`;
              if (this.pullBytesEl) {
                this.pullBytesEl.textContent = `${this.formatBytes(parsed.completed)} / ${this.formatBytes(parsed.total)}`;
              }
            }

            // Statut lisible
            if (parsed.status) {
              let friendlyStatus = parsed.status;
              if (parsed.status.includes('pulling manifest')) friendlyStatus = 'Récupération du manifeste...';
              else if (parsed.status.includes('downloading')) friendlyStatus = 'Téléchargement des couches du modèle...';
              else if (parsed.status.includes('verifying')) friendlyStatus = 'Vérification de l’intégrité (SHA256)...';
              else if (parsed.status.includes('writing manifest')) friendlyStatus = 'Finalisation de l’installation...';
              else if (parsed.status === 'success') friendlyStatus = 'Modèle téléchargé avec succès !';

              if (this.pullStatusTextEl) this.pullStatusTextEl.textContent = friendlyStatus;
            }

            if (parsed.status === 'success') {
              if (this.pullPercentageEl) this.pullPercentageEl.textContent = '100%';
              if (this.pullProgressBar) this.pullProgressBar.style.width = '100%';
            }
          } catch (parseErr) {
            // Non-fatal parse warning
          }
        }
      }

      // Rechargement des modèles Ollama
      await this.fetchModels();
      
      // Sélection automatique du modèle nouvellement installé
      this.selectedModel = modelName;
      if (this.modelSelect) this.modelSelect.value = modelName;
      localStorage.setItem('devhub_full_ollama_model', modelName);
      this.updateModelDetails();

      if (this.pullStatusTextEl) {
        this.pullStatusTextEl.textContent = `✨ ${modelName} est prêt et actif !`;
      }

      setTimeout(() => {
        if (this.pullProgressContainer) {
          this.pullProgressContainer.classList.add('hidden');
        }
      }, 2500);

    } catch (err) {
      console.error('Erreur pull modèle:', err);
      if (this.pullStatusTextEl) {
        this.pullStatusTextEl.textContent = `❌ Erreur : ${err.message}`;
      }
      if (this.pullPercentageEl) this.pullPercentageEl.textContent = 'Échec';
    } finally {
      this.isPulling = false;
      this.renderModelsModalContent();
    }
  }

  async deleteModel(modelName) {
    if (!confirm(`Voulez-vous vraiment supprimer le modèle "${modelName}" de votre machine ?\nCette action libérera son espace disque.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/ollama/models/${encodeURIComponent(modelName)}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression');
      }

      // Recharger les modèles disponibles
      await this.fetchModels();
      this.renderModelsModalContent();

    } catch (err) {
      console.error('Erreur suppression modèle:', err);
      alert(`Impossible de supprimer le modèle : ${err.message}`);
    }
  }

  // --- Gestion des Sessions de Chat ---

  createNewSession() {
    const newId = 'session_' + Date.now();
    const activePrompt = this.getCurrentSystemPrompt();

    const newSession = {
      id: newId,
      title: 'Nouvelle conversation',
      createdAt: new Date().toISOString(),
      persona: this.currentPersona,
      systemPrompt: activePrompt,
      messages: []
    };

    this.sessions.unshift(newSession);
    this.currentSessionId = newId;
    this.messages = [];
    this.clearAttachments();
    this.saveSessionsToStorage();
    this.renderSessionsList();
    this.renderMessages();
    this.updateSessionStatsUI();

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
    this.clearAttachments();

    // Restaurer le persona et le system prompt enregistrés pour cette session
    if (session.persona && this.getPersona(session.persona)) {
      this.currentPersona = session.persona;
    }

    if (this.personaSelect) {
      this.personaSelect.value = this.currentPersona;
    }

    if (this.customSystemInput) {
      this.customSystemInput.value = session.systemPrompt || this.getPersona(this.currentPersona)?.system || '';
    }

    this.updateSystemPromptUI();
    this.renderSessionsList();
    this.renderMessages();
    this.updateSessionStatsUI();
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

    let promptText = '';
    const msgs = (session.id === this.currentSessionId && this.messages.length > 0)
      ? this.messages
      : (session.messages || []);

    const userMsg = msgs.find(m => m.role === 'user');
    if (userMsg && userMsg.content) {
      promptText = userMsg.displayContent || userMsg.content;
    } else if (msgs.length > 0 && msgs[0].content) {
      promptText = msgs[0].displayContent || msgs[0].content;
    } else if (session.title && session.title !== 'Nouvelle conversation') {
      promptText = session.title;
    }

    if (!promptText) {
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
          prompt: promptText.slice(0, 300),
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
      const sPersona = this.getPersona(s.persona || 'general');

      return `
        <div 
          onclick="${s._isEditing ? '' : `window.ollamaFullWidget.loadSession('${s.id}')`}"
          class="group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${isActive ? 'bg-brand-500/15 border border-brand-500/30 text-white font-medium shadow-sm' : 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border border-transparent'}"
        >
          <div class="flex items-center gap-2 min-w-0 pr-2 flex-1">
            <span class="text-xs shrink-0">${sPersona.icon || '💬'}</span>
            
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

    const persona = this.getPersona(this.currentPersona);
    const systemPrompt = this.getCurrentSystemPrompt();

    // Bannière récapitulative du prompt système en haut du fil de discussion
    const systemBannerHtml = `
      <div class="mb-4 p-3 rounded-2xl bg-purple-500/5 border border-purple-500/20 flex items-start justify-between gap-3 text-xs animate-fade-in group">
        <div class="flex items-start gap-2.5 min-w-0 flex-1">
          <span class="text-base shrink-0 p-1 rounded-lg bg-purple-500/10">${persona.icon || '⚡'}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-bold text-purple-300 text-xs">${this.escapeHtml(persona.name)}</span>
              <span class="text-[10px] text-zinc-500 font-mono">Instruction Système active</span>
            </div>
            <p class="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed font-mono">${this.escapeHtml(systemPrompt)}</p>
          </div>
        </div>
        <button
          onclick="window.ollamaFullWidget.focusSystemPrompt()"
          class="px-2.5 py-1 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white text-[10px] font-semibold shrink-0 transition-all border border-zinc-700/60 shadow-sm cursor-pointer"
          title="Modifier le prompt système pour cette session"
        >
          ⚙️ Modifier
        </button>
      </div>
    `;

    const messagesHtml = this.messages.map((m, idx) => {
      const isUser = m.role === 'user';
      const isInterrupted = !isUser && (m.content.includes('(Génération interrompue)') || m.isInterrupted);
      const isError = !isUser && m.content.startsWith('⚠️ Erreur');

      // Affichage du contenu textuel de l'utilisateur
      const userTextToDisplay = m.displayContent || m.content;

      return `
        <div class="flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in group">
          ${!isUser ? `
            <div class="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-black text-xs shrink-0 mt-0.5">
              ${persona.icon || '🦙'}
            </div>
          ` : ''}

          <div class="max-w-[85%] sm:max-w-[75%] space-y-1">
            <div class="flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'} px-1">
              <span class="text-[10px] font-semibold text-zinc-500 uppercase">${isUser ? 'Vous' : (m.model || persona.name || 'AI Studio')}</span>
              <span class="text-[10px] text-zinc-600 font-mono">${m.time || ''}</span>
            </div>

            <div class="p-4 rounded-2xl ${isUser ? 'bg-brand-600 text-white rounded-tr-sm shadow-md' : 'bg-zinc-900/90 border border-zinc-800 text-zinc-100 rounded-tl-sm shadow-lg'} space-y-2">
              
              <!-- Si des fichiers ou images sont attachés au message utilisateur -->
              ${(isUser && m.attachments && m.attachments.length > 0) ? `
                <div class="flex flex-wrap gap-1.5 pb-2 border-b border-brand-500/30">
                  ${m.attachments.map(att => `
                    <div class="flex items-center gap-1.5 p-1 px-2 rounded-lg bg-black/20 text-[10px] border border-white/10">
                      ${att.isImage ? `
                        <img src="${att.previewUrl}" alt="${this.escapeHtml(att.name)}" class="w-4 h-4 rounded object-cover" />
                      ` : `
                        <span>${this.getFileIcon(att.extension)}</span>
                      `}
                      <span class="font-medium truncate max-w-[120px]">${this.escapeHtml(att.name)}</span>
                      <span class="opacity-70 font-mono text-[9px]">(${att.size})</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              ${isUser ? `
                <p class="text-xs whitespace-pre-wrap leading-relaxed">${this.escapeHtml(userTextToDisplay)}</p>
              ` : `
                <div class="markdown-body text-xs space-y-2" id="msg-content-${idx}">
                  ${(!m.content || m.content.trim() === '') ? `
                    <div class="flex items-center gap-2.5 py-1 text-zinc-400 animate-fade-in">
                      <div class="typing-indicator">
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                      </div>
                      <span class="text-xs text-zinc-400 font-mono animate-pulse">
                        ${this.isGenerating ? "L'IA réfléchit..." : "En attente de réponse..."}
                      </span>
                    </div>
                  ` : this.parseMarkdown(m.content)}
                </div>

                ${(isInterrupted || isError) ? `
                  <div class="mt-3 pt-2.5 border-t border-zinc-800 flex items-center justify-between gap-2 bg-amber-500/5 p-2 rounded-xl border-amber-500/20">
                    <span class="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                      <span>${isInterrupted ? 'Génération interrompue' : 'Erreur de génération'}</span>
                    </span>
                    <button
                      onclick="window.ollamaFullWidget.regenerateResponse(${idx})"
                      class="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                      <span>Rejouer le prompt</span>
                    </button>
                  </div>
                ` : ''}
              `}
            </div>

            <!-- Actions sur le message -->
            <div class="flex items-center ${isUser ? 'justify-end' : 'justify-start'} gap-1.5 px-1 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              ${isUser ? `
                <button
                  onclick="window.ollamaFullWidget.editOrReplayPrompt(${idx})"
                  class="text-[10px] text-zinc-400 hover:text-brand-300 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-800/80 cursor-pointer"
                  title="Rejouer ou modifier ce prompt"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  <span>Rejouer</span>
                </button>
              ` : `
                <button
                  onclick="window.ollamaFullWidget.regenerateResponse(${idx})"
                  class="text-[10px] text-zinc-400 hover:text-purple-300 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-800/80 cursor-pointer"
                  title="Régénérer cette réponse"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  <span>Régénérer</span>
                </button>

                ${(m.stats || (m.thinking && m.thinking.trim())) ? `
                  <button
                    type="button"
                    onclick="window.ollamaFullWidget.openMessageStatsModal(${idx})"
                    class="text-[10px] ${(m.thinking && m.thinking.trim()) ? 'text-purple-400 hover:text-purple-300 font-semibold' : 'text-zinc-400 hover:text-indigo-300'} flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-800/80 cursor-pointer"
                    title="Voir les métriques et la réflexion de cette réponse"
                  >
                    <span>${(m.thinking && m.thinking.trim()) ? '🧠' : '📊'}</span>
                    <span>${(m.thinking && m.thinking.trim()) ? 'Réflexion & Infos' : 'Infos'}</span>
                  </button>
                ` : ''}
              `}

              <button
                onclick="window.ollamaFullWidget.copyMessageContent(${idx}, this)"
                class="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-800/80 cursor-pointer"
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

    this.messagesContainer.innerHTML = systemBannerHtml + messagesHtml;
    this.scrollToBottom();
    this.attachCopyCodeButtons();
  }

  // --- Envoi, Régénération & Rejeu de Prompts ---

  async handleSendMessage() {
    if (this.isGenerating || !this.promptInput) return;
    const rawPrompt = this.promptInput.value.trim();

    // S'il n'y a ni texte ni fichiers attachés, on ne fait rien
    if (!rawPrompt && this.attachments.length === 0) return;

    if (!this.selectedModel) {
      alert('Veuillez sélectionner un modèle Ollama actif.');
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Traitement des pièces jointes
    const attachedFiles = [...this.attachments];
    const imagePayloads = [];
    let fullPromptContent = rawPrompt || 'Veuillez analyser les fichiers joints ci-dessous.';

    if (attachedFiles.length > 0) {
      const textFilesBlocks = [];

      for (const att of attachedFiles) {
        if (att.isImage && att.base64Data) {
          imagePayloads.push(att.base64Data);
        } else if (att.textContent) {
          const lang = this.getSyntaxLanguage(att.extension);
          textFilesBlocks.push(`\n\n--- 📄 Fichier joint : \`${att.name}\` (${att.formattedSize}) ---\n\`\`\`${lang}\n${att.textContent}\n\`\`\`\n---`);
        }
      }

      if (textFilesBlocks.length > 0) {
        fullPromptContent += textFilesBlocks.join('\n');
      }
    }

    // 1. Ajouter le message utilisateur avec métadonnées d'attachements
    const userMsg = {
      role: 'user',
      content: fullPromptContent,
      displayContent: rawPrompt || (attachedFiles.length > 0 ? `Analyse de ${attachedFiles.length} fichier(s)` : ''),
      attachments: attachedFiles.map(a => ({
        name: a.name,
        size: a.formattedSize,
        extension: a.extension,
        isImage: a.isImage,
        previewUrl: a.previewUrl
      })),
      images: imagePayloads.length > 0 ? imagePayloads : undefined,
      time: timeStr
    };

    this.messages.push(userMsg);

    // Synchronisation de la session active
    const currentSession = this.sessions.find(s => s.id === this.currentSessionId);
    if (currentSession) {
      currentSession.messages = this.messages;
      currentSession.persona = this.currentPersona;
      currentSession.systemPrompt = this.getCurrentSystemPrompt();

      // Titre automatique intelligent au premier message
      if (this.messages.length === 1) {
        const titleSource = rawPrompt || attachedFiles[0]?.name || 'Analyse de document';
        currentSession.title = titleSource.slice(0, 30) + (titleSource.length > 30 ? '...' : '');
        this.renderSessionsList();
        this.autoGenerateSessionTitle(currentSession, titleSource);
      }
    }

    // Reset input & vider les fichiers joints
    this.promptInput.value = '';
    this.promptInput.style.height = 'auto';
    if (this.charCountEl) this.charCountEl.textContent = '0 caractères';
    this.clearAttachments();

    // 2. Ajouter le message assistant vide prêt pour le stream
    const assistantMsgIndex = this.messages.length;
    const assistantMsg = { role: 'assistant', content: '', model: this.selectedModel, time: timeStr };
    this.messages.push(assistantMsg);

    this.renderMessages();
    await this.streamAssistantResponse(assistantMsgIndex);
  }

  async regenerateResponse(assistantMsgIndex) {
    if (this.isGenerating) {
      this.stopGeneration();
      await new Promise(r => setTimeout(r, 200));
    }

    if (assistantMsgIndex < 0 || assistantMsgIndex >= this.messages.length) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

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

  editOrReplayPrompt(userMsgIndex) {
    if (userMsgIndex < 0 || userMsgIndex >= this.messages.length) return;
    const msg = this.messages[userMsgIndex];
    if (!msg || msg.role !== 'user') return;

    if (this.promptInput) {
      this.promptInput.value = msg.displayContent || msg.content;
      this.promptInput.focus();
      this.promptInput.dispatchEvent(new Event('input'));
      this.promptInput.scrollIntoView({ behavior: 'smooth' });
    }
  }

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
   * Cœur d'exécution du streaming SSE avec injection du System Prompt et Support Multi-modal Images
   */
  async streamAssistantResponse(assistantMsgIndex) {
    if (!this.selectedModel) return;

    // Récupérer le Prompt Système actif
    const systemPrompt = this.getCurrentSystemPrompt();
    const currentSession = this.sessions.find(s => s.id === this.currentSessionId);

    // Activer l'état de génération
    this.setGeneratingState(true);

    // Construire le payload de messages pour Ollama Chat (avec images pour modèles vision si présentes)
    const historyToInclude = this.messages.slice(0, assistantMsgIndex);
    const chatPayload = [
      { role: 'system', content: systemPrompt },
      ...historyToInclude.map(m => {
        const msgObj = { role: m.role, content: m.content };
        if (m.images && Array.isArray(m.images) && m.images.length > 0) {
          msgObj.images = m.images;
        }
        return msgObj;
      })
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
        if (response.status === 413) {
          throw new Error('Le fichier ou le contenu envoyé est trop volumineux pour le serveur (Erreur HTTP 413 Payload Too Large).');
        }
        let errMsg = `Erreur serveur (${response.status})`;
        try {
          const errData = await response.json();
          if (errData.error) errMsg = `Erreur (${response.status}) : ${errData.error}`;
        } catch {}
        throw new Error(errMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';
      let accumulatedThinking = '';

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

              // 1. Capture du flux de raisonnement (modèles reasoning : DeepSeek-R1, Gemma, Qwen...)
              if (parsed.message?.thinking) {
                accumulatedThinking += parsed.message.thinking;
                if (this.messages[assistantMsgIndex]) {
                  this.messages[assistantMsgIndex].thinking = accumulatedThinking;
                }
                if (targetEl) {
                  targetEl.innerHTML = this.renderStreamingContent(accumulatedThinking, accumulatedText);
                }
                this.scrollToBottom();
              }

              // 2. Capture du flux de réponse textuelle
              if (parsed.message?.content) {
                accumulatedText += parsed.message.content;
                if (this.messages[assistantMsgIndex]) {
                  this.messages[assistantMsgIndex].content = accumulatedText;
                }
                if (targetEl) {
                  targetEl.innerHTML = this.renderStreamingContent(accumulatedThinking, accumulatedText);
                }
                this.scrollToBottom();
              }

              // 3. Capture des métriques lorsque done: true
              if (parsed.done) {
                const totalMs = parsed.total_duration ? Math.round(parsed.total_duration / 1e6) : 0;
                const loadMs = parsed.load_duration ? Math.round(parsed.load_duration / 1e6) : 0;
                const promptEvalMs = parsed.prompt_eval_duration ? Math.round(parsed.prompt_eval_duration / 1e6) : 0;
                const evalMs = parsed.eval_duration ? Math.round(parsed.eval_duration / 1e6) : 0;
                const promptTokens = parsed.prompt_eval_count || 0;
                const evalTokens = parsed.eval_count || 0;
                const totalTokens = promptTokens + evalTokens;
                const tokPerSec = evalMs > 0 ? parseFloat((evalTokens / (evalMs / 1000)).toFixed(1)) : 0;

                const stats = {
                  totalDurationMs: totalMs,
                  loadDurationMs: loadMs,
                  promptEvalDurationMs: promptEvalMs,
                  evalDurationMs: evalMs,
                  promptTokens,
                  evalTokens,
                  totalTokens,
                  tokPerSec,
                  hasThinking: Boolean(accumulatedThinking && accumulatedThinking.trim()),
                  thinkingLength: accumulatedThinking ? accumulatedThinking.length : 0
                };

                if (this.messages[assistantMsgIndex]) {
                  this.messages[assistantMsgIndex].stats = stats;
                  this.messages[assistantMsgIndex].thinking = accumulatedThinking;
                }
              }
            } catch {}
          }
        }
      }

      // Finaliser le message : si <think>...</think> est dans le texte, l'extraire dans thinking pour alléger la bulle
      if (accumulatedText.includes('<think>')) {
        const thinkMatch = accumulatedText.match(/<think>([\s\S]*?)<\/think>/i);
        if (thinkMatch) {
          if (!accumulatedThinking) {
            accumulatedThinking = thinkMatch[1].trim();
          }
          accumulatedText = accumulatedText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        }
      }

      if (this.messages[assistantMsgIndex]) {
        this.messages[assistantMsgIndex].content = accumulatedText;
        this.messages[assistantMsgIndex].thinking = accumulatedThinking;
        this.messages[assistantMsgIndex].isInterrupted = false;
        if (this.messages[assistantMsgIndex].stats) {
          this.messages[assistantMsgIndex].stats.hasThinking = Boolean(accumulatedThinking && accumulatedThinking.trim());
          this.messages[assistantMsgIndex].stats.thinkingLength = accumulatedThinking ? accumulatedThinking.length : 0;
        }
      }
      
      // Re-render complet pour figer la réponse et afficher la barre de métriques
      this.renderMessages();
      this.updateSessionStatsUI();
      this.attachCopyCodeButtons();

      if (currentSession) {
        currentSession.messages = this.messages;
        this.saveSessionsToStorage();
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (this.messages[assistantMsgIndex]) {
          if (!this.messages[assistantMsgIndex].content.trim()) {
            this.messages[assistantMsgIndex].content = '*(Génération interrompue avant réponse)*';
          } else {
            this.messages[assistantMsgIndex].content += '\n\n*(Génération interrompue)*';
          }
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

  renderStreamingContent(thinking, text) {
    let html = '';

    if (thinking && thinking.trim()) {
      if (!text || !text.trim()) {
        // En cours de réflexion : volet ouvert avec curseur
        html += `
          <details class="think-block mb-3 rounded-2xl bg-purple-950/25 border border-purple-500/25 p-3 text-xs text-zinc-400" open>
            <summary class="font-mono text-[11px] text-purple-300 font-semibold cursor-pointer flex items-center gap-2 select-none">
              <span class="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
              <span>🧠 Réflexion en cours...</span>
            </summary>
            <div class="mt-2 text-[11px] text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap pl-2.5 border-l-2 border-purple-500/40">${this.escapeHtml(thinking)}<span class="typing-cursor"></span></div>
          </details>
        `;
      } else {
        // Réflexion achevée : volet discret
        html += `
          <details class="think-block mb-3 rounded-2xl bg-purple-950/15 border border-purple-500/20 p-2.5 text-xs text-zinc-400">
            <summary class="font-mono text-[11px] text-purple-300 font-semibold cursor-pointer flex items-center gap-2 select-none hover:text-purple-200">
              <span>🧠 Processus de réflexion (${thinking.length} car.)</span>
            </summary>
            <div class="mt-2 text-[11px] text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap pl-2.5 border-l-2 border-purple-500/40">${this.escapeHtml(thinking)}</div>
          </details>
        `;
      }
    }

    if (text && text.trim()) {
      html += this.parseMarkdown(text) + '<span class="typing-cursor"></span>';
    } else if (!thinking || !thinking.trim()) {
      html += `
        <div class="flex items-center gap-2.5 py-1 text-zinc-400 animate-fade-in">
          <div class="typing-indicator">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <span class="text-xs text-zinc-400 font-mono animate-pulse">L'IA réfléchit...</span>
        </div>
      `;
    }

    return html;
  }

  toggleMessageTechDetails(idx) {
    const el = document.getElementById(`msg-tech-details-${idx}`);
    if (el) {
      el.classList.toggle('hidden');
    }
  }

  // --- Statistiques de Conversation ---

  computeSessionStats() {
    const assistantMsgs = (this.messages || []).filter(m => m.role === 'assistant' && m.stats);
    let totalPromptTokens = 0;
    let totalEvalTokens = 0;
    let totalDurationMs = 0;
    let totalEvalDurationMs = 0;
    let thinkingCount = 0;
    const modelsSet = new Set();

    for (const m of assistantMsgs) {
      if (m.model) modelsSet.add(m.model);
      if (m.stats) {
        totalPromptTokens += m.stats.promptTokens || 0;
        totalEvalTokens += m.stats.evalTokens || 0;
        totalDurationMs += m.stats.totalDurationMs || 0;
        totalEvalDurationMs += m.stats.evalDurationMs || 0;
        if (m.stats.hasThinking || (m.thinking && m.thinking.trim())) {
          thinkingCount++;
        }
      }
    }

    const totalTokens = totalPromptTokens + totalEvalTokens;
    const avgTokPerSec = totalEvalDurationMs > 0 ? parseFloat((totalEvalTokens / (totalEvalDurationMs / 1000)).toFixed(1)) : 0;

    return {
      assistantCount: assistantMsgs.length,
      userCount: (this.messages || []).filter(m => m.role === 'user').length,
      totalPromptTokens,
      totalEvalTokens,
      totalTokens,
      totalDurationMs,
      totalDurationSec: parseFloat((totalDurationMs / 1000).toFixed(1)),
      avgTokPerSec,
      thinkingCount,
      modelsUsed: Array.from(modelsSet)
    };
  }

  updateSessionStatsUI() {
    const stats = this.computeSessionStats();

    if (this.sessionStatsBadge && this.sessionStatsText) {
      if (stats.totalTokens > 0) {
        this.sessionStatsBadge.classList.remove('hidden');
        this.sessionStatsText.textContent = `${stats.totalTokens.toLocaleString('fr-FR')} tok • ${stats.totalDurationSec}s • ${stats.avgTokPerSec} tok/s`;
      } else {
        this.sessionStatsBadge.classList.add('hidden');
      }
    }
  }

  openSessionStatsModal() {
    if (!this.statsModal) return;
    this.statsModal.classList.remove('hidden');
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');

    const currentSession = this.sessions.find(s => s.id === this.currentSessionId);
    const stats = this.computeSessionStats();

    if (this.statsSessionTitle) {
      this.statsSessionTitle.textContent = currentSession?.title || 'Session active';
    }
    if (this.statsTotalTokens) {
      this.statsTotalTokens.textContent = stats.totalTokens.toLocaleString('fr-FR');
    }
    if (this.statsTokensSplit) {
      this.statsTokensSplit.textContent = `${stats.totalPromptTokens.toLocaleString('fr-FR')} prompt / ${stats.totalEvalTokens.toLocaleString('fr-FR')} réponse`;
    }
    if (this.statsTotalTime) {
      this.statsTotalTime.textContent = `${stats.totalDurationSec}s`;
    }
    if (this.statsAvgSpeed) {
      this.statsAvgSpeed.textContent = `${stats.avgTokPerSec} tok/s`;
    }
    if (this.statsMsgCount) {
      this.statsMsgCount.textContent = `${this.messages.length} (${stats.userCount}Q / ${stats.assistantCount}R)`;
    }
    if (this.statsThinkingCount) {
      this.statsThinkingCount.textContent = `${stats.thinkingCount} réponse(s)`;
    }
    if (this.statsModelsUsed) {
      this.statsModelsUsed.textContent = stats.modelsUsed.join(', ') || (this.selectedModel || 'N/A');
    }

    if (this.statsMessagesBreakdown) {
      const assistantMsgs = (this.messages || [])
        .map((m, i) => ({ ...m, origIndex: i }))
        .filter(m => m.role === 'assistant' && m.stats);

      if (assistantMsgs.length === 0) {
        this.statsMessagesBreakdown.innerHTML = `
          <div class="p-4 text-center text-xs text-zinc-500 rounded-2xl bg-zinc-950/60 border border-zinc-800">
            Aucune métrique enregistrée dans cette session pour l'instant.
          </div>
        `;
      } else {
        this.statsMessagesBreakdown.innerHTML = assistantMsgs.map((m, idx) => {
          const prevUserMsg = this.messages.slice(0, m.origIndex).reverse().find(msg => msg.role === 'user');
          const promptPreview = prevUserMsg ? (prevUserMsg.displayContent || prevUserMsg.content || '').slice(0, 45) : 'Prompt';

          return `
            <div
              onclick="window.ollamaFullWidget.openMessageStatsModal(${m.origIndex})"
              class="p-3 rounded-2xl bg-zinc-950/70 hover:bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700/80 flex items-center justify-between gap-3 text-xs cursor-pointer transition-all group"
              title="Cliquer pour voir les détails de cette réponse"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-zinc-200 text-[11px]">#${idx + 1}</span>
                  <span class="text-[11px] text-zinc-300 truncate font-medium" title="${this.escapeHtml(promptPreview)}">${this.escapeHtml(promptPreview)}...</span>
                </div>
                <div class="text-[10px] font-mono text-zinc-500 mt-0.5">
                  ${this.escapeHtml(m.model || '')} • ${m.time || ''}
                </div>
              </div>

              <div class="flex items-center gap-2 font-mono text-[11px] shrink-0">
                <span class="text-zinc-300 font-medium">${(m.stats.totalDurationMs / 1000).toFixed(1)}s</span>
                <span class="text-emerald-400 font-bold">${m.stats.tokPerSec} tok/s</span>
                <span class="px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-indigo-300 text-[10px]">${m.stats.totalTokens} tok</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  closeSessionStatsModal() {
    if (!this.statsModal) return;
    this.statsModal.classList.add('hidden');
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
  }

  openMessageStatsModal(idx) {
    if (!this.msgStatsModal) return;
    const msg = this.messages[idx];
    if (!msg) return;

    this.msgStatsModal.classList.remove('hidden');
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');

    // Trouver le prompt utilisateur correspondant
    const prevUserMsg = this.messages.slice(0, idx).reverse().find(m => m.role === 'user');
    const promptText = prevUserMsg ? (prevUserMsg.displayContent || prevUserMsg.content || '') : 'Question';

    if (this.msgModalModel) {
      this.msgModalModel.textContent = `${msg.model || 'Modèle local'}${msg.time ? ' • ' + msg.time : ''}`;
    }
    if (this.msgModalDuration) {
      this.msgModalDuration.textContent = msg.stats ? `${(msg.stats.totalDurationMs / 1000).toFixed(2)}s` : 'N/A';
    }
    if (this.msgModalSpeed) {
      this.msgModalSpeed.textContent = msg.stats ? `${msg.stats.tokPerSec} tok/s` : 'N/A';
    }
    if (this.msgModalTotalTokens) {
      this.msgModalTotalTokens.textContent = msg.stats ? msg.stats.totalTokens.toLocaleString('fr-FR') : 'N/A';
    }
    if (this.msgModalLoad) {
      this.msgModalLoad.textContent = msg.stats ? `${msg.stats.loadDurationMs} ms` : 'N/A';
    }
    if (this.msgModalPrompt) {
      this.msgModalPrompt.textContent = msg.stats ? `${msg.stats.promptTokens} tok (${msg.stats.promptEvalDurationMs} ms)` : 'N/A';
    }
    if (this.msgModalEval) {
      this.msgModalEval.textContent = msg.stats ? `${msg.stats.evalTokens} tok (${msg.stats.evalDurationMs} ms)` : 'N/A';
    }

    // Affichage du processus de réflexion complet (Thinking)
    const thinkingText = (msg.thinking && msg.thinking.trim()) ? msg.thinking.trim() : '';
    if (this.msgModalThinkingBox && this.msgModalThinkingContent) {
      if (thinkingText) {
        this.msgModalThinkingBox.classList.remove('hidden');
        this.msgModalThinkingContent.textContent = thinkingText;
        if (this.msgModalThinkingLen) {
          this.msgModalThinkingLen.textContent = `${thinkingText.length.toLocaleString('fr-FR')} car.`;
        }
      } else {
        this.msgModalThinkingBox.classList.add('hidden');
      }
    }

    if (this.msgModalPromptText) {
      this.msgModalPromptText.textContent = promptText;
    }
  }

  closeMessageStatsModal() {
    if (!this.msgStatsModal) return;
    this.msgStatsModal.classList.add('hidden');
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
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

    let processedText = text;

    // Support des blocs de réflexion <think>...</think> (modèles DeepSeek R1, reasoning, etc.)
    if (processedText.includes('<think>')) {
      if (!processedText.includes('</think>')) {
        // En cours de réflexion (flux en direct)
        processedText = processedText.replace(/<think>([\s\S]*)$/i, (match, p1) => {
          return `\n\n<details class="think-block my-2.5 rounded-2xl bg-purple-950/20 border border-purple-500/20 p-3 text-xs text-zinc-400" open>
            <summary class="font-mono text-[11px] text-purple-300 font-semibold cursor-pointer flex items-center gap-2 select-none">
              <span class="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
              <span>🧠 Réflexion en cours...</span>
            </summary>
            <div class="mt-2 text-[11px] text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap pl-2.5 border-l-2 border-purple-500/40">${this.escapeHtml(p1.trim())}</div>
          </details>\n\n`;
        });
      } else {
        // Réflexion terminée (fermé)
        processedText = processedText.replace(/<think>([\s\S]*?)<\/think>/gi, (match, p1) => {
          return `\n\n<details class="think-block my-2.5 rounded-2xl bg-purple-950/15 border border-purple-500/20 p-3 text-xs text-zinc-400">
            <summary class="font-mono text-[11px] text-purple-300 font-semibold cursor-pointer flex items-center gap-2 select-none hover:text-purple-200 transition-colors">
              <span>🧠 Processus de réflexion (cliquer pour dérouler)</span>
            </summary>
            <div class="mt-2 text-[11px] text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap pl-2.5 border-l-2 border-purple-500/40">${this.escapeHtml(p1.trim())}</div>
          </details>\n\n`;
        });
      }
    }

    if (typeof marked !== 'undefined') {
      return marked.parse(processedText);
    }
    return processedText.replace(/\n/g, '<br>');
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
      btn.className = 'code-copy-btn absolute top-2 right-2 px-2.5 py-1 text-[10px] font-mono font-semibold rounded-lg bg-zinc-800/90 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all border border-zinc-700/60 cursor-pointer';
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
            btn.className = 'code-copy-btn absolute top-2 right-2 px-2.5 py-1 text-[10px] font-mono font-semibold rounded-lg bg-zinc-800/90 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all border border-zinc-700/60 cursor-pointer';
          }, 2000);
        });
      });
    });
  }
}

window.OllamaFullWidget = OllamaFullWidget;

