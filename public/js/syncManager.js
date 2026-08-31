/**
 * Gestionnaire de Synchronisation Multi-PC (Turso Cloud / LibSQL)
 */

class SyncManager {
  constructor() {
    // Éléments du Header
    this.modalBtn = document.getElementById('sync-modal-btn');
    this.statusDot = document.getElementById('sync-status-dot');
    this.syncIcon = document.getElementById('sync-icon');
    this.btnLabel = document.getElementById('sync-btn-label');

    // Modale & Contrôles
    this.modal = document.getElementById('sync-modal');
    this.closeBtn = document.getElementById('sync-modal-close');
    this.badgeEl = document.getElementById('sync-badge');
    this.modeTextEl = document.getElementById('sync-mode-text');
    this.lastTimeTextEl = document.getElementById('sync-last-time-text');
    this.errorBannerEl = document.getElementById('sync-error-banner');
    this.errorTextEl = document.getElementById('sync-error-text');

    // Formulaire
    this.form = document.getElementById('sync-form');
    this.urlInput = document.getElementById('sync-url-input');
    this.tokenInput = document.getElementById('sync-token-input');
    this.toggleTokenBtn = document.getElementById('sync-toggle-token-btn');
    this.enabledInput = document.getElementById('sync-enabled-input');

    // Boutons d'Action
    this.triggerBtn = document.getElementById('sync-trigger-btn');
    this.disableBtn = document.getElementById('sync-disable-btn');
    this.saveBtn = document.getElementById('sync-save-btn');

    this.status = null;
    this.isSyncing = false;

    this.bindEvents();
    this.loadSyncStatus();

    // Polling du statut toutes les 60 secondes
    setInterval(() => this.loadSyncStatus(false), 60000);
  }

  bindEvents() {
    if (this.modalBtn) {
      this.modalBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openModal();
      });
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.closeModal());
    }

    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.closeModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal && !this.modal.classList.contains('hidden')) {
        this.closeModal();
      }
    });

    // Détection automatique en direct lors du collage
    if (this.urlInput) {
      this.urlInput.addEventListener('input', () => {
        const val = this.urlInput.value.trim();
        if (val.startsWith('eyJ')) {
          if (this.tokenInput) this.tokenInput.value = val;
          this.urlInput.value = '';
          this.showError("Le jeton JWT a été détecté et placé dans le champ 'Jeton d'authentification'. Veuillez saisir l'URL de votre base Turso (libsql://...).");
        }
      });
    }

    if (this.tokenInput) {
      this.tokenInput.addEventListener('input', () => {
        const val = this.tokenInput.value.trim();
        if (val.startsWith('libsql://') || val.startsWith('https://') || (val.includes('turso.io') && !val.startsWith('eyJ'))) {
          if (this.urlInput) this.urlInput.value = val;
          this.tokenInput.value = '';
          this.showError("L'URL de la base a été détectée et placée dans le champ 'URL'. Veuillez saisir votre jeton JWT (eyJ...).");
        }
      });
    }

    if (this.toggleTokenBtn && this.tokenInput) {
      this.toggleTokenBtn.addEventListener('click', () => {
        const isPassword = this.tokenInput.type === 'password';
        this.tokenInput.type = isPassword ? 'text' : 'password';
        this.toggleTokenBtn.textContent = isPassword ? '🙈' : '👁️';
      });
    }

    if (this.triggerBtn) {
      this.triggerBtn.addEventListener('click', () => this.triggerSync());
    }

    if (this.disableBtn) {
      this.disableBtn.addEventListener('click', () => this.disableSync());
    }

    if (this.form) {
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveConfig();
      });
    }
  }

  showError(msg) {
    if (this.errorBannerEl && this.errorTextEl) {
      this.errorBannerEl.classList.remove('hidden');
      this.errorTextEl.textContent = msg;
    }
  }

  hideError() {
    if (this.errorBannerEl) {
      this.errorBannerEl.classList.add('hidden');
    }
  }

  openModal() {
    if (!this.modal) return;
    this.loadSyncStatus(true);
    this.modal.classList.remove('hidden');
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.add('hidden');
  }

  async loadSyncStatus(populateForm = false) {
    try {
      const res = await fetch('/api/settings/sync');
      if (!res.ok) throw new Error('Erreur API sync');
      this.status = await res.json();
      this.renderStatus(populateForm);
    } catch (err) {
      console.warn('⚠️ Erreur lecture statut sync:', err);
    }
  }

  renderStatus(populateForm = false) {
    if (!this.status) return;

    const { enabled, syncUrl, hasToken, lastSyncAt, lastSyncStatus, lastSyncError, isSyncing, mode } = this.status;
    const isCloudConnected = mode === 'turso_replica' && enabled && lastSyncStatus !== 'error';

    // 1. Bouton et indicateur du Header
    if (this.statusDot) {
      if (isSyncing || lastSyncStatus === 'syncing') {
        this.statusDot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-ping';
      } else if (lastSyncStatus === 'error' && enabled) {
        this.statusDot.className = 'w-2 h-2 rounded-full bg-rose-500';
      } else if (isCloudConnected) {
        this.statusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
      } else {
        this.statusDot.className = 'w-2 h-2 rounded-full bg-zinc-600';
      }
    }

    if (this.btnLabel) {
      if (isCloudConnected) {
        this.btnLabel.textContent = 'Turso Sync';
        this.btnLabel.className = 'hidden md:inline text-[11px] text-brand-300 font-bold';
      } else if (lastSyncStatus === 'error' && enabled) {
        this.btnLabel.textContent = 'Erreur Sync';
        this.btnLabel.className = 'hidden md:inline text-[11px] text-rose-400 font-bold';
      } else {
        this.btnLabel.textContent = 'Local';
        this.btnLabel.className = 'hidden md:inline text-[11px] text-zinc-400 font-medium';
      }
    }

    // 2. Éléments de la Modale
    if (this.badgeEl) {
      if (isSyncing || lastSyncStatus === 'syncing') {
        this.badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 flex items-center gap-1.5';
        this.badgeEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span><span>Synchronisation...</span>';
      } else if (lastSyncStatus === 'error' && enabled) {
        this.badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 flex items-center gap-1.5';
        this.badgeEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span><span>Erreur connexion Turso</span>';
      } else if (isCloudConnected) {
        this.badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 flex items-center gap-1.5';
        this.badgeEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Connecté à Turso Cloud</span>';
      } else {
        this.badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-zinc-800 text-zinc-400 flex items-center gap-1.5';
        this.badgeEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-zinc-500"></span><span>Mode local autonome</span>';
      }
    }

    if (this.modeTextEl) {
      this.modeTextEl.textContent = isCloudConnected
        ? 'Réplica Cloud Turso (LibSQL)'
        : (enabled && lastSyncStatus === 'error' ? 'Échec connexion Turso (Repli local)' : 'SQLite local autonome');
    }

    if (this.lastTimeTextEl) {
      if (lastSyncAt) {
        const d = new Date(lastSyncAt);
        this.lastTimeTextEl.textContent = d.toLocaleDateString('fr-FR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
      } else {
        this.lastTimeTextEl.textContent = isCloudConnected ? 'En attente' : 'Jamais (Mode local)';
      }
    }

    if (this.errorBannerEl && this.errorTextEl) {
      const err = lastSyncError || this.status.error;
      if (err && enabled) {
        this.showError(`Erreur : ${err}`);
      } else {
        this.hideError();
      }
    }

    // 3. Pré-remplissage du formulaire si demandé
    if (populateForm) {
      if (this.urlInput) {
        this.urlInput.value = syncUrl && !syncUrl.startsWith('eyJ') ? syncUrl : '';
      }
      if (this.tokenInput) {
        if (hasToken) {
          this.tokenInput.placeholder = '•••••••••••••••••••••••••••••••• (Jeton enregistré)';
        } else {
          this.tokenInput.placeholder = 'Collez votre jeton JWT (ex: eyJhbGciOi...)';
          this.tokenInput.value = '';
        }
      }
      if (this.enabledInput) {
        this.enabledInput.checked = Boolean(enabled);
      }
    }
  }

  async triggerSync() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    if (this.triggerBtn) {
      const icon = this.triggerBtn.querySelector('svg');
      if (icon) icon.classList.add('animate-spin');
      this.triggerBtn.classList.add('opacity-60', 'pointer-events-none');
    }

    try {
      const res = await fetch('/api/settings/sync/trigger', { method: 'POST' });
      const data = await res.json();
      await this.loadSyncStatus();

      // Actualiser les flux RSS et veilles en direct si synchronisé
      if (data.success && window.rssStore) {
        await window.rssStore.loadState();
        if (window.rssFullWidget && typeof window.rssFullWidget.loadUnifiedFeed === 'function') {
          window.rssFullWidget.loadUnifiedFeed();
        }
      }
    } catch (err) {
      console.error('Erreur déclenchement sync:', err);
    } finally {
      this.isSyncing = false;
      if (this.triggerBtn) {
        const icon = this.triggerBtn.querySelector('svg');
        if (icon) icon.classList.remove('animate-spin');
        this.triggerBtn.classList.remove('opacity-60', 'pointer-events-none');
      }
    }
  }

  async saveConfig() {
    let syncUrl = this.urlInput?.value?.trim() || '';
    let authToken = this.tokenInput?.value?.trim() || '';
    const enabled = this.enabledInput ? this.enabledInput.checked : true;

    // Détection d'inversion URL / Token
    if (syncUrl.startsWith('eyJ') && (authToken.includes('turso.io') || authToken.startsWith('libsql://') || authToken.startsWith('https://'))) {
      const temp = syncUrl;
      syncUrl = authToken;
      authToken = temp;
      if (this.urlInput) this.urlInput.value = syncUrl;
      if (this.tokenInput) this.tokenInput.value = authToken;
    } else if (syncUrl.startsWith('eyJ') && !authToken) {
      authToken = syncUrl;
      syncUrl = '';
      if (this.tokenInput) this.tokenInput.value = authToken;
      if (this.urlInput) this.urlInput.value = '';
      this.showError("Le jeton d'authentification a été placé dans le bon champ. Veuillez maintenant renseigner l'URL de votre base Turso (ex: libsql://devhub-xxxx.turso.io).");
      return;
    }

    if (enabled && !syncUrl) {
      this.showError("Veuillez renseigner l'URL de votre base de données Turso (ex: libsql://devhub-xxxx.turso.io).");
      return;
    }

    if (enabled && !authToken && (!this.status || !this.status.hasToken)) {
      this.showError("Veuillez renseigner votre jeton d'authentification Turso (commençant par eyJ...).");
      return;
    }

    if (this.saveBtn) {
      this.saveBtn.textContent = 'Connexion à Turso...';
      this.saveBtn.classList.add('opacity-60', 'pointer-events-none');
    }

    try {
      const payload = { syncUrl, enabled };
      if (authToken) payload.authToken = authToken;

      const res = await fetch('/api/settings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      this.status = data;
      this.renderStatus(true);

      // Notification visuelle
      if (this.saveBtn) {
        if (data.success !== false) {
          this.saveBtn.textContent = enabled ? '✅ Connecté & Synchronisé !' : '✅ Mode local actif';
        } else {
          this.saveBtn.textContent = '⚠️ Échec de connexion';
        }
        setTimeout(() => {
          this.saveBtn.textContent = 'Enregistrer';
          this.saveBtn.classList.remove('opacity-60', 'pointer-events-none');
        }, 2000);
      }
    } catch (err) {
      console.error('Erreur sauvegarde config sync:', err);
      if (this.saveBtn) {
        this.saveBtn.textContent = 'Erreur réseau';
        setTimeout(() => {
          this.saveBtn.textContent = 'Enregistrer';
          this.saveBtn.classList.remove('opacity-60', 'pointer-events-none');
        }, 2000);
      }
    }
  }

  async disableSync() {
    if (this.enabledInput) this.enabledInput.checked = false;
    await this.saveConfig();
  }
}

window.SyncManager = SyncManager;
