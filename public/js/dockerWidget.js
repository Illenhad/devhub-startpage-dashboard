/**
 * Widget Synthèse Docker pour l'Accueil (Affiche les compteurs, l'état et le contrôle du service)
 */

class DockerWidget {
  constructor() {
    this.statusBadgeEl = document.getElementById('docker-status-badge');
    this.countBadgeEl = document.getElementById('docker-count-badge');
    this.powerBtn = document.getElementById('docker-power-btn');
    this.refreshBtn = document.getElementById('docker-refresh-btn');
    this.summaryContainerEl = document.getElementById('dash-docker-content');

    this.isRunning = false;
    this.isToggling = false;
    this.pollInterval = null;

    this.bindEvents();
    this.loadContainers();
  }

  bindEvents() {
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        this.loadContainers(true);
      });
    }
    if (this.powerBtn) {
      this.powerBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        this.toggleService();
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
      const res = await fetch('/api/docker/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur service');

      // Polling de transition (vérifie toutes les 2s jusqu'à 50s pour Docker)
      this.startPollingTransition(action === 'start');
    } catch (err) {
      console.error('Erreur bascule service Docker:', err);
      this.isToggling = false;
      if (this.powerBtn) this.powerBtn.classList.remove('opacity-50', 'pointer-events-none');
      this.loadContainers();
    }
  }

  startPollingTransition(targetRunning) {
    if (this.pollInterval) clearInterval(this.pollInterval);

    let attempts = 0;
    const maxAttempts = 25; // Jusqu'à 50s pour laisser le temps à Docker Desktop de booter sa VM

    this.pollInterval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/docker');
        const data = await res.json();

        if (data.isRunning === targetRunning || attempts >= maxAttempts) {
          clearInterval(this.pollInterval);
          this.pollInterval = null;
          this.isToggling = false;
          if (this.powerBtn) this.powerBtn.classList.remove('opacity-50', 'pointer-events-none');
          this.render(data);
          if (window.dockerFullWidget) window.dockerFullWidget.loadContainers();
        }
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(this.pollInterval);
          this.pollInterval = null;
          this.isToggling = false;
          if (this.powerBtn) this.powerBtn.classList.remove('opacity-50', 'pointer-events-none');
          this.loadContainers();
        }
      }
    }, 2000);
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
    this.isRunning = Boolean(isRunning);

    if (!this.isRunning) {
      this.renderOffline(message);
      return;
    }

    // Mise à jour du bouton d'alimentation
    if (this.powerBtn) {
      this.powerBtn.title = 'Éteindre le service Docker';
      this.powerBtn.className = 'p-1 rounded-lg text-emerald-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer';
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
          <div class="pt-0.5">
            <button
              onclick="window.switchTab && window.switchTab('docker')"
              class="w-full py-2 px-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-zinc-300 hover:text-white flex items-center justify-between transition-all group shadow-sm cursor-pointer"
            >
              <span>Gérer les conteneurs</span>
              <svg class="w-3.5 h-3.5 text-zinc-500 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7"/></svg>
            </button>
          </div>
        </div>
      `;
    }
  }

  renderOffline(message) {
    this.isRunning = false;

    if (this.powerBtn) {
      this.powerBtn.title = 'Démarrer le service Docker';
      this.powerBtn.className = 'p-1 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors cursor-pointer';
    }

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
        <div class="space-y-3 flex-1 flex flex-col justify-between">
          <div class="py-4 px-3 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/60 space-y-2.5">
            <p class="text-xs font-bold text-zinc-300">Docker non démarré</p>
            <p class="text-[10px] text-zinc-500">Lancez Docker Desktop pour vos conteneurs.</p>
            <div class="flex items-center justify-center gap-2 pt-1">
              <button
                onclick="window.dockerWidget.toggleService()"
                class="px-3 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 11-12.728 0M12 2v10"/></svg>
                <span>Démarrer Docker</span>
              </button>
              <button
                onclick="window.dockerWidget.loadContainers(true)"
                class="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-300 transition-all cursor-pointer"
              >
                Actualiser
              </button>
            </div>
          </div>

          <!-- Bouton accès à la page complète -->
          <div class="pt-0.5">
            <button
              onclick="window.switchTab && window.switchTab('docker')"
              class="w-full py-2 px-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-zinc-300 hover:text-white flex items-center justify-between transition-all group shadow-sm cursor-pointer"
            >
              <span>Gérer les conteneurs</span>
              <svg class="w-3.5 h-3.5 text-zinc-500 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7"/></svg>
            </button>
          </div>
        </div>
      `;
    }
  }
}

window.DockerWidget = DockerWidget;
