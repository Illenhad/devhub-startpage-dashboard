/**
 * Widget Vue Pleine Page : Système, Processus, Disques et Gros Fichiers
 */

class SystemFullWidget {
  constructor() {
    this.processes = [];
    this.disks = [];
    this.heavyFiles = [];

    this.sortColumn = 'mem'; // 'mem' | 'cpu' | 'name' | 'uptime' | 'pid'
    this.sortDirection = 'desc';
    this.searchQuery = '';
    this.processLimit = 35;
    this.heavyMinSize = 100;

    this.autoRefresh = false;
    this.intervalId = null;

    // Éléments DOM
    this.procSearchInput = document.getElementById('full-proc-search');
    this.procLimitSelect = document.getElementById('full-proc-limit');
    this.procTableBody = document.getElementById('full-proc-table-body');
    this.procCountBadge = document.getElementById('full-proc-count-badge');
    this.procRefreshBtn = document.getElementById('full-proc-refresh-btn');
    this.procAutoToggle = document.getElementById('full-proc-auto-toggle');

    this.disksGrid = document.getElementById('full-disks-grid');
    this.disksRefreshBtn = document.getElementById('full-disks-refresh-btn');

    this.heavyTableBody = document.getElementById('full-heavy-table-body');
    this.heavyMinSelect = document.getElementById('full-heavy-min-select');
    this.heavyRefreshBtn = document.getElementById('full-heavy-refresh-btn');

    // RAM Detailed Badges
    this.ramActiveEl = document.getElementById('full-ram-active');
    this.ramWiredEl = document.getElementById('full-ram-wired');
    this.ramCompressedEl = document.getElementById('full-ram-compressed');
    this.ramFreeSummaryEl = document.getElementById('full-ram-free-summary');
    this.ramFreeBadgeEl = document.getElementById('full-ram-free-badge');
    this.ramTotalEl = document.getElementById('full-ram-total');
    this.ramPercentEl = document.getElementById('full-ram-percent');
    this.ramBarEl = document.getElementById('full-ram-bar');

    this.bindEvents();
    this.initView();
  }

  bindEvents() {
    // Recherche processus
    if (this.procSearchInput) {
      this.procSearchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderProcesses();
      });
    }

    // Limite affichage
    if (this.procLimitSelect) {
      this.procLimitSelect.addEventListener('change', (e) => {
        this.processLimit = e.target.value === 'all' ? 9999 : parseInt(e.target.value, 10);
        this.renderProcesses();
      });
    }

    // Actualisation manuelle processus
    if (this.procRefreshBtn) {
      this.procRefreshBtn.addEventListener('click', () => this.loadProcesses(true));
    }

    // Auto-refresh processus
    if (this.procAutoToggle) {
      this.procAutoToggle.addEventListener('change', (e) => {
        this.autoRefresh = e.target.checked;
        this.updateAutoRefresh();
      });
    }

    // Filtre taille gros fichiers
    if (this.heavyMinSelect) {
      this.heavyMinSelect.addEventListener('change', (e) => {
        this.heavyMinSize = parseInt(e.target.value, 10) || 100;
        this.loadHeavyFiles(true);
      });
    }

    if (this.heavyRefreshBtn) {
      this.heavyRefreshBtn.addEventListener('click', () => this.loadHeavyFiles(true));
    }

    if (this.disksRefreshBtn) {
      this.disksRefreshBtn.addEventListener('click', () => this.loadDisks(true));
    }

    // Tri sur les colonnes de la table processus
    document.querySelectorAll('[data-sort-col]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort-col');
        if (this.sortColumn === col) {
          this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortColumn = col;
          this.sortDirection = col === 'name' ? 'asc' : 'desc';
        }
        this.updateSortHeaders();
        this.renderProcesses();
      });
    });
  }

  updateSortHeaders() {
    document.querySelectorAll('[data-sort-col]').forEach(th => {
      const col = th.getAttribute('data-sort-col');
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) {
        if (this.sortColumn === col) {
          arrow.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
          arrow.className = 'sort-arrow text-brand-400 font-bold ml-1';
        } else {
          arrow.textContent = '↕';
          arrow.className = 'sort-arrow text-zinc-600 ml-1';
        }
      }
    });
  }

  updateAutoRefresh() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.autoRefresh) {
      this.intervalId = setInterval(() => {
        this.loadProcesses(false);
        this.loadSystemSummary();
      }, 3000);
    }
  }

  // Chargement global à l'activation de l'onglet
  initView() {
    this.loadSystemSummary();
    this.loadProcesses();
    this.loadDisks();
    this.loadHeavyFiles();
  }

  // 1. RAM Summary
  async loadSystemSummary() {
    try {
      const res = await fetch('/api/system');
      const data = await res.json();
      const { memory } = data;

      if (memory) {
        if (this.ramPercentEl) this.ramPercentEl.textContent = `${memory.percent}%`;
        if (this.ramTotalEl) this.ramTotalEl.textContent = memory.total;
        if (this.ramFreeSummaryEl) this.ramFreeSummaryEl.textContent = memory.free;
        if (this.ramFreeBadgeEl) this.ramFreeBadgeEl.textContent = memory.free;
        if (this.ramActiveEl) this.ramActiveEl.textContent = memory.active;
        if (this.ramWiredEl) this.ramWiredEl.textContent = memory.wired;
        if (this.ramCompressedEl) this.ramCompressedEl.textContent = memory.compressed;

        if (data.platform) {
          this.platform = data.platform;
          const fullSysTitle = document.getElementById('full-sys-header-title');
          if (fullSysTitle) {
            fullSysTitle.textContent = `Moniteur Système ${data.platform}`;
          }
        }

        if (this.ramBarEl) {
          this.ramBarEl.style.width = `${memory.percent}%`;
          this.ramBarEl.className = 'h-full rounded-full transition-all duration-500 ' + 
            (memory.percent > 85 ? 'bg-rose-500' : memory.percent > 70 ? 'bg-amber-500' : 'bg-indigo-500');
        }
      }
    } catch (err) {
      console.error('Erreur loadSystemSummary:', err);
    }
  }

  // 2. Processus
  async loadProcesses(isManual = false) {
    if (isManual && this.procRefreshBtn) {
      const icon = this.procRefreshBtn.querySelector('svg') || this.procRefreshBtn;
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 600);
    }

    try {
      const res = await fetch('/api/system/processes');
      const data = await res.json();
      this.processes = data.processes || [];
      if (this.procCountBadge) {
        this.procCountBadge.textContent = `${this.processes.length} processus actifs`;
      }
      this.renderProcesses();
    } catch (err) {
      console.error('Erreur chargement processus:', err);
    }
  }

  renderProcesses() {
    if (!this.procTableBody) return;

    let filtered = this.processes.filter(p => {
      if (!this.searchQuery) return true;
      return (
        p.name.toLowerCase().includes(this.searchQuery) ||
        p.command.toLowerCase().includes(this.searchQuery) ||
        p.user.toLowerCase().includes(this.searchQuery) ||
        String(p.pid).includes(this.searchQuery)
      );
    });

    // Tri
    filtered.sort((a, b) => {
      let valA = a[this.sortColumn];
      let valB = b[this.sortColumn];

      if (this.sortColumn === 'uptime') {
        valA = a.uptimeSeconds || 0;
        valB = b.uptimeSeconds || 0;
      }

      if (typeof valA === 'string') {
        return this.sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return this.sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    const displayList = filtered.slice(0, this.processLimit);

    if (displayList.length === 0) {
      this.procTableBody.innerHTML = `
        <tr>
          <td colSpan="6" class="py-8 text-center text-xs text-zinc-500">
            Aucun processus ne correspond à votre recherche.
          </td>
        </tr>
      `;
      return;
    }

    this.procTableBody.innerHTML = displayList.map(p => {
      const cpuColor = p.cpu > 50 ? 'text-rose-400 font-bold bg-rose-500/10' : p.cpu > 15 ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-300';
      const memColor = p.mem > 10 ? 'text-indigo-400 font-bold' : 'text-zinc-300';

      return `
        <tr class="hover:bg-zinc-800/40 border-b border-zinc-800/50 transition-colors group">
          <td class="py-2.5 px-3 font-mono text-zinc-500 text-[11px]">
            ${p.pid}
          </td>
          <td class="py-2.5 px-3">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full ${p.cpu > 10 ? 'bg-amber-400 animate-pulse' : 'bg-indigo-500/60'} shrink-0"></div>
              <div class="min-w-0">
                <span class="font-bold text-xs text-zinc-100 block truncate max-w-xs group-hover:text-brand-400 transition-colors">
                  ${p.name}
                </span>
                <span class="text-[10px] text-zinc-500 font-mono block truncate max-w-sm" title="${p.command}">
                  ${p.command}
                </span>
              </div>
            </div>
          </td>
          <td class="py-2.5 px-3">
            <span class="px-2 py-0.5 rounded-lg bg-zinc-800/80 text-zinc-400 text-[11px] font-mono">
              ${p.user}
            </span>
          </td>
          <td class="py-2.5 px-3 text-right">
            <span class="inline-block px-2 py-0.5 rounded-lg font-mono text-xs ${cpuColor}">
              ${p.cpu.toFixed(1)} %
            </span>
          </td>
          <td class="py-2.5 px-3 text-right font-mono text-xs">
            <div class="flex flex-col items-end">
              <span class="${memColor}">${p.rssFormatted}</span>
              <span class="text-[10px] text-zinc-500">${p.mem.toFixed(1)} %</span>
            </div>
          </td>
          <td class="py-2.5 px-3 text-right text-zinc-400 font-mono text-[11px]">
            ${p.uptime}
          </td>
        </tr>
      `;
    }).join('');
  }

  // 3. Disques & Volumes
  async loadDisks(isManual = false) {
    if (isManual && this.disksRefreshBtn) {
      const icon = this.disksRefreshBtn.querySelector('svg') || this.disksRefreshBtn;
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 600);
    }

    try {
      const res = await fetch('/api/system/disks');
      const data = await res.json();
      this.disks = data.disks || [];
      this.renderDisks();
    } catch (err) {
      console.error('Erreur chargement disques:', err);
    }
  }

  renderDisks() {
    if (!this.disksGrid) return;

    if (this.disks.length === 0) {
      this.disksGrid.innerHTML = `
        <div class="col-span-full py-8 text-center text-xs text-zinc-500">
          Chargement des informations de disques...
        </div>
      `;
      return;
    }

    this.disksGrid.innerHTML = this.disks.map(d => {
      const barColor = d.percent > 90 ? 'bg-rose-500' : d.percent > 75 ? 'bg-amber-500' : 'bg-emerald-500';
      const isExternal = d.mountPoint.startsWith('/Volumes/') || d.mountPoint.startsWith('/media/') || (this.platform === 'Windows' && !d.mountPoint.toLowerCase().startsWith('c:'));

      return `
        <div class="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-all space-y-3">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2.5">
              <div class="p-2 rounded-xl ${isExternal ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3zm0 5h16"/></svg>
              </div>
              <div>
                <h4 class="font-bold text-xs text-zinc-100">${d.label}</h4>
                <span class="font-mono text-[10px] text-zinc-500 block truncate max-w-[200px]" title="${d.mountPoint}">
                  ${d.mountPoint}
                </span>
              </div>
            </div>
            <span class="font-mono font-bold text-xs ${d.percent > 85 ? 'text-rose-400' : 'text-emerald-400'}">
              ${d.percent}%
            </span>
          </div>

          <div class="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500 ${barColor}" style="width: ${d.percent}%"></div>
          </div>

          <div class="flex justify-between items-center text-[11px] font-mono text-zinc-400">
            <span>Utilisé : <strong class="text-zinc-200">${d.used}</strong> / ${d.total}</span>
            <span class="text-emerald-400 font-medium">${d.available} libre</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 4. Gros Fichiers
  async loadHeavyFiles(isManual = false) {
    if (isManual && this.heavyRefreshBtn) {
      const icon = this.heavyRefreshBtn.querySelector('svg') || this.heavyRefreshBtn;
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 600);
    }

    try {
      const res = await fetch(`/api/system/heavy-files?minSize=${this.heavyMinSize}&limit=30`);
      const data = await res.json();
      this.heavyFiles = data.files || [];
      this.renderHeavyFiles();
    } catch (err) {
      console.error('Erreur chargement gros fichiers:', err);
    }
  }

  renderHeavyFiles() {
    if (!this.heavyTableBody) return;

    if (this.heavyFiles.length === 0) {
      this.heavyTableBody.innerHTML = `
        <tr>
          <td colSpan="4" class="py-8 text-center text-xs text-zinc-500">
            Aucun fichier de plus de ${this.heavyMinSize} Mo détecté dans votre dossier utilisateur.
          </td>
        </tr>
      `;
      return;
    }

    const revealLabel = this.platform === 'Windows' ? 'Explorateur' : this.platform === 'Linux' ? 'Dossier' : 'Finder';
    const revealTitle = this.platform === 'Windows' ? "Ouvrir l'emplacement dans l'Explorateur Windows" : this.platform === 'Linux' ? "Ouvrir le dossier contenant" : "Ouvrir l'emplacement dans le Finder";

    this.heavyTableBody.innerHTML = this.heavyFiles.map(f => {
      const sizeBadge = f.sizeBytes > 1024 ** 3 
        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
        : f.sizeBytes > 500 * 1024 * 1024 
        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
        : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';

      return `
        <tr class="hover:bg-zinc-800/40 border-b border-zinc-800/50 transition-colors group text-xs">
          <td class="py-2.5 px-3">
            <div class="flex items-center gap-2.5">
              <span class="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 uppercase text-[9px] font-mono font-bold shrink-0">
                ${f.ext}
              </span>
              <div class="min-w-0">
                <span class="font-bold text-zinc-200 block truncate max-w-sm group-hover:text-brand-400 transition-colors" title="${f.name}">
                  ${f.name}
                </span>
                <span class="text-[10px] text-zinc-500 font-mono block truncate max-w-md" title="${f.path}">
                  ${f.path}
                </span>
              </div>
            </div>
          </td>
          <td class="py-2.5 px-3 text-right">
            <span class="inline-block px-2.5 py-1 rounded-xl border font-mono font-bold ${sizeBadge}">
              ${f.sizeFormatted}
            </span>
          </td>
          <td class="py-2.5 px-3 text-right text-zinc-400 font-mono text-[11px]">
            ${f.modified}
          </td>
          <td class="py-2.5 px-3 text-right">
            <button
              onclick="window.systemFullWidget.revealInFinder('${f.path.replace(/'/g, "\\'")}', this)"
              class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-all flex items-center gap-1 ml-auto cursor-pointer"
              title="${revealTitle}"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              <span>${revealLabel}</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async revealInFinder(filePath, btn) {
    const revealLabel = this.platform === 'Windows' ? 'Explorateur' : this.platform === 'Linux' ? 'Dossier' : 'Finder';
    if (btn) {
      btn.innerHTML = '<span class="text-emerald-400 font-bold">Ouvert !</span>';
      setTimeout(() => {
        btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg><span>${revealLabel}</span>`;
      }, 1800);
    }

    try {
      await fetch('/api/system/open-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
    } catch (err) {
      console.error('Erreur openFileLocation:', err);
    }
  }
}

window.SystemFullWidget = SystemFullWidget;
