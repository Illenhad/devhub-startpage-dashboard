/**
 * Widget Vue Pleine Page : Gestionnaire Docker Avancé (Conteneurs, Actions & Logs)
 */

class DockerFullWidget {
  constructor() {
    this.containers = [];
    this.filterState = 'all'; // 'all' | 'running' | 'stopped'
    this.searchQuery = '';
    
    this.activeLogContainerId = null;
    this.logIntervalId = null;

    // Éléments DOM
    this.statusBadgeEl = document.getElementById('full-docker-status-badge');
    this.countBadgeEl = document.getElementById('full-docker-count-badge');
    this.powerBtn = document.getElementById('full-docker-power-btn');
    this.powerTextEl = document.getElementById('full-docker-power-text');
    this.containersGridEl = document.getElementById('full-docker-containers-grid');
    this.searchInput = document.getElementById('full-docker-search');
    this.refreshBtn = document.getElementById('full-docker-refresh-btn');
    this.pruneBtn = document.getElementById('full-docker-prune-btn');

    this.isRunning = false;
    this.isToggling = false;
    this.pollInterval = null;
    
    // Modal Logs
    this.logModalEl = document.getElementById('docker-log-modal');
    this.logModalTitleEl = document.getElementById('docker-log-modal-title');
    this.logModalBodyEl = document.getElementById('docker-log-modal-body');
    this.logModalCloseBtn = document.getElementById('docker-log-modal-close');
    this.logModalCopyBtn = document.getElementById('docker-log-modal-copy');
    this.logModalTailSelect = document.getElementById('docker-log-modal-tail');
    this.logModalAutoRefresh = document.getElementById('docker-log-modal-auto');

    this.bindEvents();
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
        this.loadContainers(true);
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

    // Filtres par statut
    document.querySelectorAll('[data-docker-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-docker-filter]').forEach(b => {
          b.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all';
        });
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-500 text-white shadow-sm transition-all';
        this.filterState = btn.getAttribute('data-docker-filter');
        this.render();
      });
    });

    // Prune (Nettoyage conteneurs arrêtés)
    if (this.pruneBtn) {
      this.pruneBtn.addEventListener('click', () => this.handlePrune());
    }

    // Modal Logs Close
    if (this.logModalCloseBtn) {
      this.logModalCloseBtn.addEventListener('click', () => this.closeLogModal());
    }

    if (this.logModalEl) {
      this.logModalEl.addEventListener('click', (e) => {
        if (e.target === this.logModalEl) this.closeLogModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.logModalEl && !this.logModalEl.classList.contains('hidden')) {
        this.closeLogModal();
      }
    });

    if (this.logModalTailSelect) {
      this.logModalTailSelect.addEventListener('change', () => {
        if (this.activeLogContainerId) this.fetchLogs(this.activeLogContainerId);
      });
    }

    if (this.logModalCopyBtn) {
      this.logModalCopyBtn.addEventListener('click', () => {
        if (this.logModalBodyEl) {
          navigator.clipboard.writeText(this.logModalBodyEl.innerText).then(() => {
            this.logModalCopyBtn.textContent = 'Copié !';
            setTimeout(() => {
              this.logModalCopyBtn.textContent = 'Copier';
            }, 2000);
          });
        }
      });
    }

    if (this.logModalAutoRefresh) {
      this.logModalAutoRefresh.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.startLogAutoRefresh();
        } else {
          this.stopLogAutoRefresh();
        }
      });
    }
  }

  async initView() {
    await this.loadContainers();
  }

  async loadContainers(isManual = false) {
    if (isManual && this.refreshBtn) {
      const icon = this.refreshBtn.querySelector('svg') || this.refreshBtn;
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 600);
    }

    try {
      const res = await fetch('/api/docker');
      const data = await res.json();
      this.containers = data.containers || [];
      this.updateHeaderStats(data);
      this.render();
    } catch (err) {
      console.error('Erreur chargement Docker:', err);
    }
  }

  async toggleService() {
    if (this.isToggling) return;
    this.isToggling = true;

    const action = this.isRunning ? 'stop' : 'start';
    const actionLabel = action === 'start' ? 'Démarrage...' : 'Arrêt...';

    if (this.statusBadgeEl) {
      this.statusBadgeEl.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
        <span class="text-xs font-semibold text-amber-400">${actionLabel}</span>
      `;
    }

    if (this.powerBtn) {
      this.powerBtn.classList.add('opacity-50', 'pointer-events-none');
      if (this.powerTextEl) this.powerTextEl.textContent = actionLabel;
    }

    try {
      const res = await fetch('/api/docker/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur service');

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
    const maxAttempts = 25; // Jusqu'à 50s pour Docker Desktop

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
          this.containers = data.containers || [];
          this.updateHeaderStats(data);
          this.render();
          if (window.dockerWidget) window.dockerWidget.loadContainers();
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

  updateHeaderStats(data) {
    const { isRunning, count } = data;
    this.isRunning = Boolean(isRunning);

    if (this.statusBadgeEl) {
      if (this.isRunning) {
        this.statusBadgeEl.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span class="text-xs font-semibold text-emerald-400">Docker En Ligne</span>
        `;
      } else {
        this.statusBadgeEl.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-rose-500"></span>
          <span class="text-xs font-semibold text-rose-400">Docker Inactif</span>
        `;
      }
    }

    if (this.powerBtn && this.powerTextEl) {
      if (this.isRunning) {
        this.powerTextEl.textContent = 'Éteindre Docker';
        this.powerBtn.title = 'Arrêter le service Docker Desktop';
        this.powerBtn.className = 'px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm';
      } else {
        this.powerTextEl.textContent = 'Démarrer Docker';
        this.powerBtn.title = 'Lancer Docker Desktop';
        this.powerBtn.className = 'px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 border border-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md';
      }
    }

    if (this.countBadgeEl && count) {
      this.countBadgeEl.textContent = `${count.running} actif${count.running > 1 ? 's' : ''} / ${count.total} total`;
    }
  }

  render() {
    if (!this.containersGridEl) return;

    if (!this.isRunning) {
      this.containersGridEl.innerHTML = `
        <div class="col-span-full py-16 text-center text-zinc-500 space-y-3">
          <div class="inline-flex p-3.5 rounded-3xl bg-zinc-900 text-rose-400 border border-zinc-800">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          </div>
          <div class="space-y-1">
            <p class="text-sm font-bold text-zinc-200">Le démon Docker est actuellement inactif</p>
            <p class="text-xs text-zinc-500 max-w-sm mx-auto">Lancez Docker Desktop pour démarrer et administrer vos conteneurs.</p>
          </div>
          <div class="pt-2">
            <button
              onclick="window.dockerFullWidget.toggleService()"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 11-12.728 0M12 2v10"/></svg>
              <span>Démarrer Docker Desktop</span>
            </button>
          </div>
        </div>
      `;
      return;
    }

    let filtered = this.containers.filter(c => {
      // Filtre statut
      if (this.filterState === 'running' && !c.isRunning) return false;
      if (this.filterState === 'stopped' && c.isRunning) return false;

      // Filtre recherche
      if (this.searchQuery) {
        const q = this.searchQuery;
        return c.name.toLowerCase().includes(q) ||
               c.image.toLowerCase().includes(q) ||
               c.id.toLowerCase().includes(q) ||
               c.ports.toLowerCase().includes(q);
      }
      return true;
    });

    if (filtered.length === 0) {
      this.containersGridEl.innerHTML = `
        <div class="col-span-full py-16 text-center text-zinc-500 space-y-2">
          <div class="inline-flex p-3 rounded-2xl bg-zinc-900 text-zinc-400 border border-zinc-800">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          </div>
          <p class="text-xs font-semibold text-zinc-300">Aucun conteneur ne correspond aux critères.</p>
          <p class="text-[11px] text-zinc-500">Vérifiez vos filtres ou lancez un nouveau conteneur.</p>
        </div>
      `;
      return;
    }

    this.containersGridEl.innerHTML = filtered.map(c => {
      const isRunning = c.isRunning;
      const shortId = c.id.slice(0, 12);

      return `
        <div class="p-5 rounded-3xl bg-zinc-900/70 border ${isRunning ? 'border-zinc-800 hover:border-zinc-700' : 'border-zinc-800/60 opacity-80 hover:opacity-100'} transition-all flex flex-col justify-between space-y-4 shadow-lg group">
          
          <!-- Haut de carte : Nom, ID & Statut -->
          <div class="space-y-2">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'} shrink-0 mt-0.5"></span>
                <div class="min-w-0">
                  <h4 class="font-bold text-sm text-white truncate group-hover:text-brand-400 transition-colors" title="${c.name}">
                    ${c.name}
                  </h4>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <span class="font-mono text-[10px] text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/50">
                      ${shortId}
                    </span>
                    <button 
                      onclick="navigator.clipboard.writeText('${c.id}'); this.innerText='✓'; setTimeout(() => this.innerText='ID', 1500);" 
                      class="text-[10px] text-zinc-500 hover:text-zinc-300 font-mono" 
                      title="Copier ID complet"
                    >
                      Copier
                    </button>
                  </div>
                </div>
              </div>

              <!-- Badge Statut -->
              <span class="px-2.5 py-1 rounded-xl text-[10px] font-bold font-mono uppercase tracking-wider shrink-0 ${isRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700/40'}">
                ${c.state}
              </span>
            </div>

            <!-- Image & Ports -->
            <div class="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5 text-xs font-mono">
              <div class="flex items-center justify-between text-[11px] text-zinc-300">
                <span class="text-zinc-500">Image:</span>
                <span class="font-bold truncate max-w-[200px]" title="${c.image}">${c.image}</span>
              </div>
              <div class="flex items-center justify-between text-[11px] text-zinc-400">
                <span class="text-zinc-500">Statut:</span>
                <span class="truncate max-w-[200px]">${c.status}</span>
              </div>
              ${c.ports ? `
                <div class="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-900">
                  <span class="text-zinc-500">Ports:</span>
                  <span class="text-brand-400 font-medium truncate max-w-[200px]" title="${c.ports}">${c.ports}</span>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Bas de carte : Barre d'actions -->
          <div class="flex items-center justify-between pt-2 border-t border-zinc-800/60 gap-2">
            <!-- Boutons Start / Stop / Restart -->
            <div class="flex items-center gap-1.5">
              ${isRunning ? `
                <button
                  onclick="window.dockerFullWidget.performAction('${c.id}', 'restart', this)"
                  class="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
                  title="Redémarrer"
                >
                  <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  <span>Restart</span>
                </button>

                <button
                  onclick="window.dockerFullWidget.performAction('${c.id}', 'stop', this)"
                  class="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1.5 border border-rose-500/20 transition-all active:scale-95"
                  title="Arrêter"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/></svg>
                  <span>Stop</span>
                </button>
              ` : `
                <button
                  onclick="window.dockerFullWidget.performAction('${c.id}', 'start', this)"
                  class="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 text-xs font-bold flex items-center gap-1.5 border border-emerald-500/20 transition-all active:scale-95"
                  title="Démarrer"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span>Start</span>
                </button>
              `}
            </div>

            <!-- Logs & Delete -->
            <div class="flex items-center gap-1">
              <button
                onclick="window.dockerFullWidget.openLogModal('${c.id}', '${c.name.replace(/'/g, "\\'")}')"
                class="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all"
                title="Voir les journaux (Logs)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </button>

              <button
                onclick="window.dockerFullWidget.handleRemove('${c.id}', '${c.name.replace(/'/g, "\\'")}', this)"
                class="p-2 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-all"
                title="Supprimer le conteneur"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>

        </div>
      `;
    }).join('');
  }

  // Actions
  async performAction(containerId, action, btnElement) {
    if (btnElement) {
      btnElement.disabled = true;
      btnElement.classList.add('opacity-50');
    }

    try {
      const res = await fetch('/api/docker/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerId, action })
      });
      const data = await res.json();
      if (data.success) {
        setTimeout(() => this.loadContainers(), 800);
      } else {
        alert(`Échec de l'action (${action}): ${data.error || 'Erreur inconnue'}`);
      }
    } catch (err) {
      alert(`Erreur réseau: ${err.message}`);
    } finally {
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.classList.remove('opacity-50');
      }
    }
  }

  async handleRemove(containerId, name, btnElement) {
    if (!confirm(`Voulez-vous vraiment supprimer le conteneur "${name}" (${containerId.slice(0, 12)}) ?`)) {
      return;
    }
    await this.performAction(containerId, 'remove', btnElement);
  }

  async handlePrune() {
    if (!confirm('Supprimer tous les conteneurs arrêtés ?')) return;

    try {
      const res = await fetch('/api/docker/prune', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.loadContainers();
      } else {
        alert(`Erreur prune: ${data.error}`);
      }
    } catch (err) {
      alert(`Erreur réseau: ${err.message}`);
    }
  }

  // --- Modal Logs ---
  openLogModal(containerId, name) {
    this.activeLogContainerId = containerId;
    if (this.logModalTitleEl) {
      this.logModalTitleEl.textContent = `Logs : ${name} (${containerId.slice(0, 12)})`;
    }
    if (this.logModalBodyEl) {
      this.logModalBodyEl.textContent = 'Chargement des logs en cours...';
    }
    if (this.logModalEl) {
      this.logModalEl.classList.remove('hidden');
    }
    this.fetchLogs(containerId);

    if (this.logModalAutoRefresh?.checked) {
      this.startLogAutoRefresh();
    }
  }

  closeLogModal() {
    this.activeLogContainerId = null;
    this.stopLogAutoRefresh();
    if (this.logModalEl) {
      this.logModalEl.classList.add('hidden');
    }
  }

  async fetchLogs(containerId) {
    const tail = this.logModalTailSelect ? this.logModalTailSelect.value : 150;
    try {
      const res = await fetch(`/api/docker/logs/${containerId}?tail=${tail}`);
      const data = await res.json();
      if (this.logModalBodyEl) {
        this.logModalBodyEl.textContent = data.logs || 'Aucun journal disponible.';
        this.logModalBodyEl.scrollTop = this.logModalBodyEl.scrollHeight;
      }
    } catch (err) {
      if (this.logModalBodyEl) {
        this.logModalBodyEl.textContent = `Erreur de chargement: ${err.message}`;
      }
    }
  }

  startLogAutoRefresh() {
    this.stopLogAutoRefresh();
    this.logIntervalId = setInterval(() => {
      if (this.activeLogContainerId) {
        this.fetchLogs(this.activeLogContainerId);
      }
    }, 2500);
  }

  stopLogAutoRefresh() {
    if (this.logIntervalId) {
      clearInterval(this.logIntervalId);
      this.logIntervalId = null;
    }
  }
}

window.DockerFullWidget = DockerFullWidget;
