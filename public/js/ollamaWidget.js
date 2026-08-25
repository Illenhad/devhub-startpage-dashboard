/**
 * Widget Synthèse Ollama AI pour la page d'accueil (Affiche uniquement le statut et l'accès au Studio)
 */

class OllamaWidget {
  constructor() {
    this.statusBadgeEl = document.getElementById('ollama-status-badge');
    this.summaryContainerEl = document.getElementById('dash-ollama-content');

    this.checkStatus();
  }

  async checkStatus() {
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

    if (!isRunning) {
      this.renderOffline();
      return;
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
    if (this.statusBadgeEl) {
      this.statusBadgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
        <span class="text-[10px] font-semibold text-zinc-400">Inactif</span>
      `;
    }

    if (this.summaryContainerEl) {
      this.summaryContainerEl.innerHTML = `
        <div class="py-4 px-3 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/60 space-y-2">
          <p class="text-xs font-bold text-zinc-300">Ollama non démarré</p>
          <p class="text-[10px] text-zinc-500">Lancez <code class="font-mono text-indigo-400">ollama serve</code> dans le terminal.</p>
          <button
            onclick="window.ollamaWidget.checkStatus()"
            class="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-[10px] font-semibold text-zinc-300 hover:text-white transition-all"
          >
            Réessayer
          </button>
        </div>
      `;
    }
  }
}

window.OllamaWidget = OllamaWidget;
