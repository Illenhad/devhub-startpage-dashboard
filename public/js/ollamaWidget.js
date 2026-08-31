/**
 * Widget Synthèse Ollama AI pour la page d'accueil (Affiche le statut, le modèle actif et le contrôle du service)
 */

class OllamaWidget {
  constructor() {
    this.statusBadgeEl = document.getElementById('ollama-status-badge');
    this.powerBtn = document.getElementById('ollama-power-btn');
    this.refreshBtn = document.getElementById('ollama-refresh-btn');
    this.summaryContainerEl = document.getElementById('dash-ollama-content');

    this.isRunning = false;
    this.isToggling = false;
    this.pollInterval = null;

    this.bindEvents();
    this.checkStatus();
  }

  bindEvents() {
    if (this.powerBtn) {
      this.powerBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        this.toggleService();
      });
    }
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        this.checkStatus(true);
      });
    }
  }

  async toggleService() {
    if (this.isToggling) return;
    this.isToggling = true;

    const action = this.isRunning ? 'stop' : 'start';
    const actionLabel = action === 'start' ? 'Démarrage...' : 'Arrêt...';

    if (this.statusBadgeEl) {
      this.statusBadgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
        <span class="text-[10px] font-semibold text-amber-400">${actionLabel}</span>
      `;
    }

    if (this.powerBtn) {
      this.powerBtn.classList.add('opacity-50', 'pointer-events-none');
    }

    try {
      const res = await fetch('/api/ollama/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur service');

      this.startPollingTransition(action === 'start');
    } catch (err) {
      console.error('Erreur bascule service Ollama:', err);
      this.isToggling = false;
      if (this.powerBtn) this.powerBtn.classList.remove('opacity-50', 'pointer-events-none');
      this.checkStatus();
    }
  }

  startPollingTransition(targetRunning) {
    if (this.pollInterval) clearInterval(this.pollInterval);

    let attempts = 0;
    const maxAttempts = 15;

    this.pollInterval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/ollama/status');
        const data = await res.json();

        if (data.isRunning === targetRunning || attempts >= maxAttempts) {
          clearInterval(this.pollInterval);
          this.pollInterval = null;
          this.isToggling = false;
          if (this.powerBtn) this.powerBtn.classList.remove('opacity-50', 'pointer-events-none');
          this.render(data);
          if (window.ollamaFullWidget) window.ollamaFullWidget.checkStatus();
        }
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(this.pollInterval);
          this.pollInterval = null;
          this.isToggling = false;
          if (this.powerBtn) this.powerBtn.classList.remove('opacity-50', 'pointer-events-none');
          this.checkStatus();
        }
      }
    }, 1500);
  }

  async checkStatus(isManual = false) {
    if (isManual && this.refreshBtn) {
      const icon = this.refreshBtn.querySelector('svg') || this.refreshBtn;
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 600);
    }

    try {
      const res = await fetch('/api/ollama/status');
      const data = await res.json();
      this.render(data);
    } catch {
      this.renderOffline();
    }
  }

  render(data) {
    const { isRunning, models, defaultModel } = data;
    this.isRunning = Boolean(isRunning);

    if (!this.isRunning) {
      this.renderOffline();
      return;
    }

    if (this.powerBtn) {
      this.powerBtn.title = 'Éteindre le service Ollama';
      this.powerBtn.className = 'p-1 rounded-lg text-purple-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer';
    }

    // Statut Actif
    if (this.statusBadgeEl) {
      this.statusBadgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 status-dot-running"></span>
        <span class="text-[10px] font-semibold text-indigo-400">En Ligne</span>
      `;
    }

    const modelCount = models?.length || 0;
    const activeModel = models?.find(m => m.name === defaultModel) || models?.[0] || null;

    if (this.summaryContainerEl) {
      this.summaryContainerEl.innerHTML = `
        <div class="space-y-3 flex-1 flex flex-col justify-between">
          <!-- Tuiles d'informations Modèles -->
          <div class="grid grid-cols-2 gap-2">
            <div class="p-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex flex-col justify-between">
              <span class="text-[9px] text-purple-400 uppercase font-semibold">Modèles Locaux</span>
              <span class="font-mono text-xl font-black text-white my-0.5">${modelCount}</span>
              <span class="text-[9px] text-purple-400/80 font-medium">installé${modelCount > 1 ? 's' : ''}</span>
            </div>

            <div class="p-2.5 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col justify-between">
              <span class="text-[9px] text-zinc-400 uppercase font-semibold">Modèle Actif</span>
              <span class="font-mono text-xs font-bold text-indigo-300 my-0.5 truncate" title="${activeModel?.name || '--'}">
                ${activeModel?.name || '--'}
              </span>
              <span class="text-[9px] text-zinc-500 font-mono">${activeModel?.size || 'Prêt'}</span>
            </div>
          </div>

          <!-- Ligne de statut compacte -->
          <div class="p-2 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
            <span>Moteur LLM</span>
            <span class="text-indigo-400 font-bold">● Streaming actif</span>
          </div>

          <!-- Bouton accès à la page complète Ollama Studio -->
          <button
            onclick="document.querySelector('[data-tab-target=\\'ollama\\']')?.click()"
            class="w-full py-2 px-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-zinc-300 hover:text-white flex items-center justify-between transition-all group shadow-sm"
          >
            <span class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              <span>Ouvrir AI Studio</span>
            </span>
            <svg class="w-3.5 h-3.5 text-zinc-500 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      `;
    }
  }

  renderOffline() {
    this.isRunning = false;

    if (this.powerBtn) {
      this.powerBtn.title = 'Démarrer le service Ollama';
      this.powerBtn.className = 'p-1 rounded-lg text-zinc-400 hover:text-purple-400 hover:bg-zinc-800 transition-colors cursor-pointer';
    }

    if (this.statusBadgeEl) {
      this.statusBadgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
        <span class="text-[10px] font-semibold text-zinc-400">Inactif</span>
      `;
    }

    if (this.summaryContainerEl) {
      this.summaryContainerEl.innerHTML = `
        <div class="py-4 px-3 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/60 space-y-2.5">
          <p class="text-xs font-bold text-zinc-300">Ollama non démarré</p>
          <p class="text-[10px] text-zinc-500">Démarrez le moteur IA pour interagir avec vos modèles locaux.</p>
          <div class="flex items-center justify-center gap-2 pt-1">
            <button
              onclick="window.ollamaWidget.toggleService()"
              class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 11-12.728 0M12 2v10"/></svg>
              <span>Démarrer Ollama</span>
            </button>
            <button
              onclick="window.ollamaWidget.checkStatus(true)"
              class="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-300 transition-all cursor-pointer"
            >
              Actualiser
            </button>
          </div>
        </div>
      `;
    }
  }
}

window.OllamaWidget = OllamaWidget;
