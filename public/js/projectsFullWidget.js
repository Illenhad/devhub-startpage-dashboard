/**
 * Vue Pleine Page : Hub de Projets Git
 */

class ProjectsFullWidget {
  constructor() {
    this.container = document.getElementById('view-projects');
    this.gridContainer = document.getElementById('projects-grid-container');
    this.searchInput = document.getElementById('projects-search-input');
    this.refreshBtn = document.getElementById('projects-refresh-btn');
    this.configPathsBtn = document.getElementById('projects-config-paths-btn');
    this.tabBadge = document.getElementById('nav-badge-projects');

    // Statistiques rapides
    this.statTotalEl = document.getElementById('projects-stat-total');
    this.statDirtyEl = document.getElementById('projects-stat-dirty');
    this.statSyncEl = document.getElementById('projects-stat-sync');

    // Modale de configuration des dossiers
    this.pathsModal = document.getElementById('projects-paths-modal');
    this.pathsModalClose = document.getElementById('projects-paths-modal-close');
    this.pathsListEl = document.getElementById('projects-paths-list');
    this.pathAddForm = document.getElementById('projects-path-add-form');
    this.pathAddInput = document.getElementById('projects-path-add-input');

    this.projects = [];
    this.scannedPaths = [];
    this.searchQuery = '';
    this.activeFilter = 'all'; // 'all' | 'dirty' | 'sync' | 'clean'
    this.isLoading = false;

    this.bindEvents();
    this.loadProjects(true);
  }

  bindEvents() {
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.loadProjects(false));
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

    if (this.configPathsBtn) {
      this.configPathsBtn.addEventListener('click', () => this.openPathsModal());
    }

    if (this.pathsModalClose) {
      this.pathsModalClose.addEventListener('click', () => this.closePathsModal());
    }

    if (this.pathsModal) {
      this.pathsModal.addEventListener('click', (e) => {
        if (e.target === this.pathsModal) this.closePathsModal();
      });
    }

    if (this.pathAddForm) {
      this.pathAddForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.addPath();
      });
    }

    // Gestion des boutons de filtres
    const filterBtns = document.querySelectorAll('.projects-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('bg-brand-500', 'text-white'));
        btn.classList.add('bg-brand-500', 'text-white');
        this.activeFilter = btn.dataset.filter || 'all';
        this.render();
      });
    });
  }

  async loadProjects(silent = false) {
    if (this.isLoading) return;
    this.isLoading = true;
    const startTime = Date.now();

    if (!silent && this.refreshBtn) {
      const svg = this.refreshBtn.querySelector('svg') || this.refreshBtn;
      svg.classList.add('animate-spin');
    }

    try {
      const url = silent ? '/api/projects' : '/api/projects?refresh=true';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erreur API projets');
      const data = await res.json();
      this.projects = data.projects || [];
      this.scannedPaths = data.paths || [];
      this.render();

      // Synchroniser le widget d'accueil
      if (window.projectsWidget && typeof window.projectsWidget.render === 'function') {
        window.projectsWidget.projects = this.projects;
        window.projectsWidget.render();
      }
    } catch (err) {
      console.warn('⚠️ [Projects Full Widget] Erreur:', err.message);
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
    const totalCount = this.projects.length;
    const dirtyCount = this.projects.filter(p => p.isDirty).length;
    const syncCount = this.projects.filter(p => p.ahead > 0 || p.behind > 0).length;

    if (this.statTotalEl) this.statTotalEl.textContent = totalCount;
    if (this.statDirtyEl) this.statDirtyEl.textContent = dirtyCount;
    if (this.statSyncEl) this.statSyncEl.textContent = syncCount;
    if (this.tabBadge) this.tabBadge.textContent = totalCount;

    if (!this.gridContainer) return;

    // Filtrage
    let filtered = this.projects;

    if (this.activeFilter === 'dirty') {
      filtered = filtered.filter(p => p.isDirty);
    } else if (this.activeFilter === 'sync') {
      filtered = filtered.filter(p => p.ahead > 0 || p.behind > 0);
    } else if (this.activeFilter === 'clean') {
      filtered = filtered.filter(p => p.isClean);
    }

    if (this.searchQuery) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(this.searchQuery) ||
        p.branch.toLowerCase().includes(this.searchQuery) ||
        p.path.toLowerCase().includes(this.searchQuery) ||
        (p.tech && p.tech.name.toLowerCase().includes(this.searchQuery)) ||
        (p.lastCommit && p.lastCommit.subject.toLowerCase().includes(this.searchQuery))
      );
    }

    if (filtered.length === 0) {
      this.gridContainer.innerHTML = `
        <div class="col-span-full py-16 text-center text-zinc-500 text-xs">
          <div class="flex flex-col items-center justify-center space-y-2">
            <span class="text-3xl">📁</span>
            <span class="text-sm text-zinc-400 font-medium">Aucun projet ne correspond à vos critères</span>
            <p class="text-[11px] text-zinc-500">Vérifiez vos filtres ou ajoutez des dossiers sources via "Dossiers sources".</p>
          </div>
        </div>
      `;
      return;
    }

    this.gridContainer.innerHTML = filtered.map(p => `
      <div class="glass-card rounded-3xl p-5 shadow-xl space-y-4 hover:border-zinc-700/80 transition-all flex flex-col justify-between group">
        
        <!-- En-tête de Carte -->
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-2xl shrink-0">${p.tech.icon}</span>
              <div class="min-w-0">
                <h3 class="font-bold text-sm text-white truncate" title="${p.name}">${p.name}</h3>
                <span class="text-[10px] text-zinc-400 font-medium">${p.tech.name}</span>
              </div>
            </div>

            <!-- Statut Git (Branch & Dirty) -->
            <div class="flex flex-col items-end gap-1 shrink-0">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${p.isDirty ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'} flex items-center gap-1">
                <span>${p.isDirty ? '●' : '✓'}</span>
                <span>${p.branch}</span>
              </span>

              ${p.ahead > 0 || p.behind > 0 ? `
                <div class="flex items-center gap-1 text-[10px] font-mono">
                  ${p.ahead > 0 ? `<span class="text-sky-400 font-bold">↑${p.ahead} commit${p.ahead > 1 ? 's' : ''}</span>` : ''}
                  ${p.behind > 0 ? `<span class="text-indigo-400 font-bold">↓${p.behind}</span>` : ''}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Détail des modifications (si dirty) -->
          ${p.isDirty ? `
            <div class="p-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center gap-2 font-mono">
              <span>⚠️</span>
              <span>
                ${p.modifiedCount > 0 ? `${p.modifiedCount} modif.` : ''}
                ${p.untrackedCount > 0 ? `${p.untrackedCount} non suivi${p.untrackedCount > 1 ? 's' : ''}` : ''}
                ${p.stagedCount > 0 ? `${p.stagedCount} indexé${p.stagedCount > 1 ? 's' : ''}` : ''}
              </span>
            </div>
          ` : ''}

          <!-- Chemin du Dossier -->
          <p class="text-[10px] text-zinc-500 font-mono truncate" title="${p.path}">
            ${p.path}
          </p>
        </div>

        <!-- Dernier Commit & Actions -->
        <div class="space-y-3 pt-2 border-t border-zinc-800/80">
          ${p.lastCommit ? `
            <div class="text-xs space-y-0.5">
              <div class="text-[11px] text-zinc-300 font-medium line-clamp-1" title="${p.lastCommit.subject}">
                ${p.lastCommit.subject}
              </div>
              <div class="text-[10px] text-zinc-500 flex items-center gap-1.5 font-mono">
                <span class="text-brand-400">${p.lastCommit.hash}</span>
                <span>•</span>
                <span class="truncate">${p.lastCommit.author}</span>
                <span>•</span>
                <span>${p.lastCommit.relativeTime}</span>
              </div>
            </div>
          ` : `
            <div class="text-[10px] text-zinc-500 font-mono">Aucun commit récent</div>
          `}

          <!-- Barre de Lanceurs 1-Click (VS Code, Terminal, Finder/Explorateur) -->
          <div class="flex items-center justify-between gap-1 pt-1">
            <div class="flex items-center gap-1.5">
              <button
                data-path="${this.escapeHtml(p.path)}"
                onclick="window.projectsFullWidget.open(this.dataset.path, 'vscode')"
                class="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-sky-500/20 hover:text-sky-300 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                title="Ouvrir dans VS Code"
              >
                <span>💻</span>
                <span class="text-[11px] font-medium">VS Code</span>
              </button>

              <button
                data-path="${this.escapeHtml(p.path)}"
                onclick="window.projectsFullWidget.open(this.dataset.path, 'terminal')"
                class="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                title="Ouvrir dans le Terminal"
              >
                <span>📟</span>
                <span class="text-[11px] font-medium">Terminal</span>
              </button>

              <button
                data-path="${this.escapeHtml(p.path)}"
                onclick="window.projectsFullWidget.open(this.dataset.path, 'finder')"
                class="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs flex items-center gap-1 transition-all cursor-pointer"
                title="Révéler dans le Finder / Explorateur"
              >
                <span>📂</span>
                <span class="text-[11px] font-medium">Dossier</span>
              </button>
            </div>

            ${p.webUrl ? `
              <a
                href="${p.webUrl}"
                target="_blank"
                class="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                title="Voir sur GitHub / GitLab (${p.webUrl})"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
              </a>
            ` : ''}
          </div>
        </div>

      </div>
    `).join('');
  }

  async open(projectPath, editor) {
    try {
      const res = await fetch('/api/projects/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath, editor })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erreur lors de l\'ouverture du projet');
      }
    } catch (err) {
      alert(`Erreur réseau: ${err.message}`);
    }
  }

  // --- Modale de Gestion des Dossiers Sources ---

  openPathsModal() {
    if (!this.pathsModal) return;
    this.renderPathsList();
    this.pathsModal.classList.remove('hidden');
  }

  closePathsModal() {
    if (!this.pathsModal) return;
    this.pathsModal.classList.add('hidden');
  }

  renderPathsList() {
    if (!this.pathsListEl) return;

    if (this.scannedPaths.length === 0) {
      this.pathsListEl.innerHTML = `
        <div class="text-center py-4 text-xs text-zinc-500">
          Aucun dossier personnalisé configuré (dossiers par défaut actifs).
        </div>
      `;
      return;
    }

    this.pathsListEl.innerHTML = this.scannedPaths.map(p => `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
        <span class="font-mono text-zinc-200 truncate mr-2">${p}</span>
        <button
          data-path="${this.escapeHtml(p)}"
          onclick="window.projectsFullWidget.removePath(this.dataset.path)"
          class="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Supprimer ce dossier"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    `).join('');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async addPath() {
    const newPath = this.pathAddInput ? this.pathAddInput.value.trim() : '';
    if (!newPath) return;

    try {
      const res = await fetch('/api/projects/paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erreur lors de l\'ajout du dossier');
        return;
      }

      this.scannedPaths = data.paths || [];
      if (this.pathAddInput) this.pathAddInput.value = '';
      this.renderPathsList();
      await this.loadProjects();
    } catch (err) {
      alert(`Erreur réseau: ${err.message}`);
    }
  }

  async removePath(pathToRemove) {
    try {
      const res = await fetch('/api/projects/paths', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathToRemove })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erreur lors de la suppression');
        return;
      }

      this.scannedPaths = data.paths || [];
      this.renderPathsList();
      await this.loadProjects();
    } catch (err) {
      alert(`Erreur réseau: ${err.message}`);
    }
  }
}

window.ProjectsFullWidget = ProjectsFullWidget;
