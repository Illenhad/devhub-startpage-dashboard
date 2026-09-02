/**
 * Widget Synthèse Réseau & Ports (Startpage Dashboard)
 * Affiche des métriques, l'état des serveurs de dev, l'exposition réseau et des raccourcis
 */

class PortsWidget {
  constructor() {
    this.container = document.getElementById('widget-ports');
    this.contentEl = document.getElementById('ports-widget-content');
    this.countBadge = document.getElementById('ports-widget-count');
    this.statusDot = document.getElementById('ports-widget-dot');
    this.refreshBtn = document.getElementById('ports-widget-refresh');
    this.autoToggle = document.getElementById('ports-auto-toggle');
    this.autoIndicator = document.getElementById('ports-auto-indicator');

    this.autoRefresh = localStorage.getItem('devhub_ports_auto_refresh') === 'true';
    this.intervalSeconds = 5;
    this.timerId = null;

    this.ports = [];
    this.isLoading = false;

    this.bindEvents();
    this.loadPorts(true);

    if (this.autoToggle) {
      this.autoToggle.checked = this.autoRefresh;
      this.updateAutoRefresh();
    }
  }

  bindEvents() {
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => {
        this.loadPorts(false);
      });
    }

    if (this.autoToggle) {
      this.autoToggle.addEventListener('change', (e) => {
        this.autoRefresh = e.target.checked;
        localStorage.setItem('devhub_ports_auto_refresh', this.autoRefresh ? 'true' : 'false');
        this.updateAutoRefresh();
      });
    }
  }

  updateAutoRefresh() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.autoRefresh) {
      this.timerId = setInterval(() => {
        if (!document.hidden) {
          this.loadPorts(true);
        }
      }, this.intervalSeconds * 1000);

      if (this.autoIndicator) this.autoIndicator.classList.remove('hidden');
    } else {
      if (this.autoIndicator) this.autoIndicator.classList.add('hidden');
    }
  }

  async loadPorts(silent = false) {
    if (this.isLoading) return;
    this.isLoading = true;
    const startTime = Date.now();

    if (!silent && this.refreshBtn) {
      const svg = this.refreshBtn.querySelector('svg') || this.refreshBtn;
      svg.classList.add('animate-spin');
    }

    try {
      const url = silent ? '/api/ports' : '/api/ports?refresh=true';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erreur API ports');
      const data = await res.json();
      this.ports = data.ports || [];
      this.render();
    } catch (err) {
      console.warn('⚠️ [Ports Widget] Erreur chargement ports:', err.message);
      if (this.contentEl && !silent) {
        this.contentEl.innerHTML = `
          <div class="text-center py-4 text-xs text-rose-400">
            Impossible d'analyser les sockets réseau.
          </div>
        `;
      }
    } finally {
      this.isLoading = false;
      if (!silent && this.refreshBtn) {
        const svg = this.refreshBtn.querySelector('svg') || this.refreshBtn;
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 600 - elapsed);
        setTimeout(() => svg.classList.remove('animate-spin'), remaining);
      }
    }
  }

  render() {
    const totalCount = this.ports.length;
    if (this.countBadge) {
      this.countBadge.textContent = totalCount;
    }

    if (this.statusDot) {
      this.statusDot.className = totalCount > 0
        ? 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse'
        : 'w-1.5 h-1.5 rounded-full bg-zinc-600';
    }

    if (!this.contentEl) return;

    if (totalCount === 0) {
      this.contentEl.innerHTML = `
        <div class="py-6 text-center text-zinc-500 text-xs flex flex-col items-center justify-center space-y-1">
          <span class="text-xl">🔌</span>
          <span>Aucun port en écoute détecté</span>
        </div>
      `;
      return;
    }

    // 1. Calcul des métriques synthétiques
    const devWebPorts = this.ports.filter(p => ['Web Dev', 'Backend', 'Web'].includes(p.category) && !p.isDevHub);
    const dbPorts = this.ports.filter(p => ['Database', 'Cache', 'DevOps', 'AI'].includes(p.category) && !p.isDevHub);
    const localOnlyPorts = this.ports.filter(p => p.address === '127.0.0.1' || p.address === '::1');
    const publicPorts = this.ports.filter(p => p.address === '*' || p.address === '0.0.0.0' || p.address === '::');
    const killableCount = this.ports.filter(p => p.canKill).length;

    // 2. Rendu structuré des informations
    this.contentEl.innerHTML = `
      <div class="space-y-3">
        <!-- 3 Cartes de Métriques Clés -->
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="p-2 rounded-2xl bg-zinc-900/70 border border-zinc-800/80">
            <span class="text-[9px] text-zinc-500 font-semibold uppercase block">Serveurs Dev</span>
            <span class="font-mono text-sm font-bold ${devWebPorts.length > 0 ? 'text-emerald-400' : 'text-zinc-400'} mt-0.5 block">
              ${devWebPorts.length}
            </span>
          </div>

          <div class="p-2 rounded-2xl bg-zinc-900/70 border border-zinc-800/80">
            <span class="text-[9px] text-zinc-500 font-semibold uppercase block">Bases & IA</span>
            <span class="font-mono text-sm font-bold ${dbPorts.length > 0 ? 'text-purple-400' : 'text-zinc-400'} mt-0.5 block">
              ${dbPorts.length}
            </span>
          </div>

          <div class="p-2 rounded-2xl bg-zinc-900/70 border border-zinc-800/80">
            <span class="text-[9px] text-zinc-500 font-semibold uppercase block">Arrêtables</span>
            <span class="font-mono text-sm font-bold ${killableCount > 0 ? 'text-indigo-400' : 'text-zinc-400'} mt-0.5 block">
              ${killableCount}
            </span>
          </div>
        </div>

        <!-- Section Serveurs Actifs & Raccourcis Rapides -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-[10px] text-zinc-400 px-0.5">
            <span class="font-semibold uppercase tracking-wider text-[9px] text-zinc-500">Serveurs détectés</span>
            <span class="font-mono text-zinc-500">${localOnlyPorts.length} local • ${publicPorts.length} LAN/Tous</span>
          </div>

          ${devWebPorts.length > 0 || dbPorts.length > 0 ? `
            <div class="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto pr-1">
              ${[...devWebPorts, ...dbPorts].map(p => `
                <a
                  href="${p.url}"
                  target="_blank"
                  class="px-2.5 py-1 rounded-xl bg-zinc-900/90 border border-zinc-800/90 hover:border-brand-500/50 hover:bg-zinc-800/80 text-[11px] text-zinc-200 hover:text-white flex items-center gap-1.5 transition-all shadow-sm group"
                  title="Ouvrir ${p.serviceName} (${p.url}) • PID ${p.pid}"
                >
                  <span>${p.icon}</span>
                  <span class="font-mono font-bold text-white group-hover:text-brand-300">:${p.port}</span>
                  <span class="text-[10px] text-zinc-400 truncate max-w-[80px]">${p.command}</span>
                </a>
              `).join('')}
            </div>
          ` : `
            <div class="p-2.5 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 text-[11px] text-zinc-400 flex items-center gap-2">
              <span class="text-emerald-400 text-xs">✓</span>
              <span>Aucun serveur web en conflit (ports 3000, 5173, 8080 libres)</span>
            </div>
          `}
        </div>

        <!-- Bas de carte : Bouton Tuer serveurs dev (si actifs) + Lien vers l'onglet Système -->
        <div class="pt-1 flex items-center justify-between gap-2 border-t border-zinc-800/60">
          ${devWebPorts.length > 0 ? `
            <button
              onclick="window.portsWidget.killAllDev()"
              class="px-2 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 hover:text-rose-200 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
              title="Arrêter tous les serveurs de dev en cours"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              <span>Libérer dev (${devWebPorts.length})</span>
            </button>
          ` : `
            <span class="text-[10px] text-zinc-500 flex items-center gap-1 font-mono">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>${totalCount} sockets en écoute</span>
            </span>
          `}

          <button
            onclick="window.switchTab && window.switchTab('system'); setTimeout(() => { document.getElementById('system-ports-section')?.scrollIntoView({ behavior: 'smooth' }); }, 150);"
            class="text-[11px] text-brand-400 hover:text-brand-300 hover:underline font-semibold cursor-pointer ml-auto"
          >
            Inspecteur & Kill →
          </button>
        </div>
      </div>
    `;
  }

  async killAllDev() {
    const devPorts = this.ports.filter(p => ['Web Dev', 'Backend'].includes(p.category) && p.canKill);
    if (devPorts.length === 0) return;

    if (!confirm(`Voulez-vous arrêter les ${devPorts.length} serveurs de développement en cours ?`)) {
      return;
    }

    for (const p of devPorts) {
      try {
        await fetch('/api/ports/kill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pid: p.pid, port: p.port })
        });
      } catch {}
    }

    await this.loadPorts();
    if (window.portsFullWidget && typeof window.portsFullWidget.loadPorts === 'function') {
      window.portsFullWidget.loadPorts();
    }
  }
}

window.PortsWidget = PortsWidget;
