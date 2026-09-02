/**
 * Vue Pleine Page : Inspecteur de Ports Réseau (Port Killer)
 */

class PortsFullWidget {
  constructor() {
    this.container = document.getElementById('view-system');
    this.tableBody = document.getElementById('ports-full-table-body');
    this.searchInput = document.getElementById('ports-full-search');
    this.refreshBtn = document.getElementById('ports-full-refresh');
    this.totalCountEl = document.getElementById('ports-stat-total');
    this.webCountEl = document.getElementById('ports-stat-web');
    this.killableCountEl = document.getElementById('ports-stat-killable');
    this.tabBadge = document.getElementById('nav-badge-ports');
    this.autoToggle = document.getElementById('ports-full-auto-toggle');
    this.autoRefresh = localStorage.getItem('devhub_ports_full_auto_refresh') === 'true';
    this.intervalSeconds = 5;
    this.timerId = null;

    this.ports = [];
    this.searchQuery = '';
    this.activeCategory = 'all';
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
      this.refreshBtn.addEventListener('click', () => this.loadPorts(false));
    }

    if (this.autoToggle) {
      this.autoToggle.addEventListener('change', (e) => {
        this.autoRefresh = e.target.checked;
        localStorage.setItem('devhub_ports_full_auto_refresh', this.autoRefresh ? 'true' : 'false');
        this.updateAutoRefresh();
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

    if (this.killDevBtn) {
      this.killDevBtn.addEventListener('click', () => this.killAllDevServers());
    }

    // Gestion des filtres de catégories
    const filterBtns = document.querySelectorAll('.ports-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('bg-brand-500', 'text-white'));
        btn.classList.add('bg-brand-500', 'text-white');
        this.activeCategory = btn.dataset.category || 'all';
        this.render();
      });
    });
  }

  updateAutoRefresh() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.autoRefresh) {
      this.timerId = setInterval(() => {
        if (this.container && !this.container.classList.contains('hidden') && !document.hidden) {
          this.loadPorts(true);
        }
      }, this.intervalSeconds * 1000);
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

      // Synchroniser le widget de l'accueil
      if (window.portsWidget && typeof window.portsWidget.render === 'function') {
        window.portsWidget.ports = this.ports;
        window.portsWidget.render();
      }
    } catch (err) {
      console.warn('⚠️ [Ports Full Widget] Erreur:', err.message);
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
    // 1. Mise à jour des statistiques
    if (this.totalCountEl) this.totalCountEl.textContent = this.ports.length;
    if (this.tabBadge) this.tabBadge.textContent = this.ports.length;

    const webDevPorts = this.ports.filter(p => ['Web Dev', 'Backend', 'Web'].includes(p.category) && !p.isDevHub);
    if (this.webCountEl) this.webCountEl.textContent = webDevPorts.length;

    const killablePorts = this.ports.filter(p => p.canKill);
    if (this.killableCountEl) this.killableCountEl.textContent = killablePorts.length;

    if (!this.tableBody) return;

    // 2. Filtrage
    let filtered = this.ports;

    if (this.activeCategory !== 'all') {
      if (this.activeCategory === 'web') {
        filtered = filtered.filter(p => ['Web Dev', 'Backend', 'Web'].includes(p.category));
      } else if (this.activeCategory === 'database') {
        filtered = filtered.filter(p => ['Database', 'Cache'].includes(p.category));
      } else if (this.activeCategory === 'devops') {
        filtered = filtered.filter(p => ['DevOps', 'AI'].includes(p.category));
      } else if (this.activeCategory === 'system') {
        filtered = filtered.filter(p => ['System', 'Processus'].includes(p.category));
      }
    }

    if (this.searchQuery) {
      filtered = filtered.filter(p =>
        String(p.port).includes(this.searchQuery) ||
        (p.command && p.command.toLowerCase().includes(this.searchQuery)) ||
        (p.serviceName && p.serviceName.toLowerCase().includes(this.searchQuery)) ||
        (p.user && p.user.toLowerCase().includes(this.searchQuery)) ||
        String(p.pid).includes(this.searchQuery)
      );
    }

    // 3. Rendu du Tableau
    if (filtered.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-12 text-center text-zinc-500 text-xs">
            <div class="flex flex-col items-center justify-center space-y-2">
              <span class="text-2xl">🔌</span>
              <span>Aucun port ne correspond à votre recherche.</span>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    this.tableBody.innerHTML = filtered.map(p => `
      <tr class="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors text-xs">
        <!-- Port & Service -->
        <td class="px-4 py-3.5">
          <div class="flex items-center gap-2.5">
            <span class="text-base shrink-0">${p.icon}</span>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-mono font-bold text-white text-sm tracking-tight">:${p.port}</span>
                ${p.isDevHub ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30">DevHub</span>' : ''}
              </div>
              <div class="text-[11px] text-zinc-400 font-medium">${p.serviceName}</div>
            </div>
          </div>
        </td>

        <!-- Processus & PID -->
        <td class="px-4 py-3.5">
          <div class="font-mono text-zinc-200 font-semibold">${p.command}</div>
          <div class="text-[10px] text-zinc-500 font-mono">PID: <span class="text-zinc-400">${p.pid}</span></div>
        </td>

        <!-- Utilisateur -->
        <td class="px-4 py-3.5 text-zinc-400 font-mono text-[11px]">
          ${p.user || '<span class="text-zinc-600">--</span>'}
        </td>

        <!-- Adresse & Protocole -->
        <td class="px-4 py-3.5">
          <div class="font-mono text-zinc-300 text-[11px]">${p.address}</div>
          <div class="text-[10px] text-zinc-500">${p.protocol}</div>
        </td>

        <!-- Catégorie -->
        <td class="px-4 py-3.5">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/50">
            ${p.category}
          </span>
        </td>

        <!-- Actions -->
        <td class="px-4 py-3.5 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <a
              href="${p.url}"
              target="_blank"
              class="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition-all shadow-sm"
              title="Ouvrir ${p.url}"
            >
              <span>Ouvrir</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </a>

            ${p.canKill ? `
              <button
                onclick="window.portsFullWidget.kill(${p.pid}, ${p.port}, '${p.command}')"
                class="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-rose-200 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                title="Tuer le processus PID ${p.pid}"
              >
                <span>Kill</span>
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            ` : `
              <span class="px-2.5 py-1.5 text-[11px] text-zinc-600 cursor-not-allowed">Protégé</span>
            `}
          </div>
        </td>
      </tr>
    `).join('');
  }

  async kill(pid, port, command = '') {
    if (!confirm(`Voulez-vous vraiment terminer le processus ${command || ''} (PID ${pid}) sur le port :${port} ?`)) {
      return;
    }

    try {
      const res = await fetch('/api/ports/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid, port })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Erreur lors de la libération du port');
        return;
      }

      this.ports = data.ports || [];
      this.render();

      if (window.portsWidget && typeof window.portsWidget.render === 'function') {
        window.portsWidget.ports = this.ports;
        window.portsWidget.render();
      }
    } catch (err) {
      alert(`Erreur réseau : ${err.message}`);
    }
  }

  async killAllDevServers() {
    const devPorts = this.ports.filter(p => ['Web Dev', 'Backend'].includes(p.category) && p.canKill);

    if (devPorts.length === 0) {
      alert('Aucun serveur de développement arrêté détecté.');
      return;
    }

    const portList = devPorts.map(p => `:${p.port} (${p.command})`).join(', ');
    if (!confirm(`Voulez-vous arrêter TOUS les serveurs de développement en cours (${devPorts.length}) ?\n\n${portList}`)) {
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
  }
}

window.PortsFullWidget = PortsFullWidget;
