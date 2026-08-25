/**
 * Widget Synthèse Docker pour l'Accueil (Affiche uniquement les compteurs et l'état)
 */

class DockerWidget {
  constructor() {
    this.statusBadgeEl = document.getElementById('docker-status-badge');
    this.countBadgeEl = document.getElementById('docker-count-badge');
    this.refreshBtn = document.getElementById('docker-refresh-btn');
    this.summaryContainerEl = document.getElementById('dash-docker-content');

    this.bindEvents();
    this.loadContainers();
  }

  bindEvents() {
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.loadContainers(true));
    }
  }

  async loadContainers(isManual = false) {
    if (isManual && this.refreshBtn) {
      const icon = this.refreshBtn.querySelector('svg') || this.refreshBtn;
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 600);
    }

    try {
      const res = await fetch('/api/docker');
      if (!res.ok) throw new Error('Erreur API Docker');
      const data = await res.json();
      this.render(data);
    } catch (err) {
      console.error('Erreur chargement Docker:', err);
      this.renderOffline('Impossible de joindre le service');
    }
  }

  render(data) {
    const { isRunning, count, message } = data;

    if (!isRunning) {
      this.renderOffline(message);
      return;
    }

    // Statut Actif
    if (this.statusBadgeEl) {
      this.statusBadgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="text-[10px] font-semibold text-emerald-400">En Ligne</span>
      `;
    }

    if (this.countBadgeEl) {
      this.countBadgeEl.textContent = `${count.running} actif${count.running > 1 ? 's' : ''}`;
    }

    if (this.summaryContainerEl) {
      this.summaryContainerEl.innerHTML = `
        <div class="space-y-3 flex-1 flex flex-col justify-between">
          <!-- Grille des 3 Compteurs -->
          <div class="grid grid-cols-3 gap-1.5 text-center">
            <div class="p-2.5 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col justify-between">
              <span class="text-[9px] text-zinc-400 uppercase font-semibold">Total</span>
              <span class="font-mono text-xl font-black text-white my-0.5">${count.total}</span>
              <span class="text-[9px] text-zinc-500">conteneurs</span>
            </div>

            <div class="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col justify-between">
              <span class="text-[9px] text-emerald-400 uppercase font-semibold">En cours</span>
              <span class="font-mono text-xl font-black text-emerald-300 my-0.5">${count.running}</span>
              <span class="text-[9px] text-emerald-500 font-medium">actifs</span>
            </div>

            <div class="p-2.5 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-col justify-between">
              <span class="text-[9px] text-zinc-500 uppercase font-semibold">Arrêtés</span>
              <span class="font-mono text-xl font-black text-zinc-400 my-0.5">${count.stopped}</span>
              <span class="text-[9px] text-zinc-600">inactifs</span>
            </div>
          </div>

          <!-- Ligne de statut compacte -->
          <div class="p-2 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
            <span>Démon Docker</span>
            <span class="text-emerald-400 font-bold">● Opérationnel</span>
          </div>

          <!-- Bouton accès à la page complète -->
          <button
            onclick="document.querySelector('[data-tab-target=\\'docker\\']')?.click()"
            class="w-full py-2 px-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-zinc-300 hover:text-white flex items-center justify-between transition-all group shadow-sm"
          >
            <span class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
              <span>Gérer les conteneurs</span>
            </span>
            <svg class="w-3.5 h-3.5 text-zinc-500 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      `;
    }
  }

  renderOffline(message) {
    if (this.statusBadgeEl) {
      this.statusBadgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
        <span class="text-[10px] font-semibold text-rose-400">Inactif</span>
      `;
    }
    if (this.countBadgeEl) {
      this.countBadgeEl.textContent = '0 actif';
    }
    if (this.summaryContainerEl) {
      this.summaryContainerEl.innerHTML = `
        <div class="py-4 px-3 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/60 space-y-2">
          <p class="text-xs font-bold text-zinc-300">Docker non démarré</p>
          <p class="text-[10px] text-zinc-500">Lancez Docker Desktop pour vos conteneurs.</p>
          <button
            onclick="window.dockerWidget.loadContainers(true)"
            class="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-[10px] font-semibold text-zinc-200 transition-all"
          >
            Réessayer
          </button>
        </div>
      `;
    }
  }
}

window.DockerWidget = DockerWidget;
