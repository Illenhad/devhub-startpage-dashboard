/**
 * Widget Synthèse Projets Git (Startpage Dashboard)
 */

class ProjectsWidget {
  constructor() {
    this.container = document.getElementById('widget-projects');
    this.contentEl = document.getElementById('projects-widget-content');
    this.countBadge = document.getElementById('projects-widget-count');
    this.statusDot = document.getElementById('projects-widget-dot');
    this.refreshBtn = document.getElementById('projects-widget-refresh');

    this.projects = [];
    this.isLoading = false;

    this.bindEvents();
    this.loadProjects(true);
  }

  bindEvents() {
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.loadProjects(false));
    }
  }

  async loadProjects(silent = false) {
    if (this.isLoading) return;
    this.isLoading = true;

    if (!silent && this.refreshBtn) {
      const svg = this.refreshBtn.querySelector('svg');
      if (svg) svg.classList.add('animate-spin');
    }

    try {
      const url = silent ? '/api/projects' : '/api/projects?refresh=true';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erreur API projets');
      const data = await res.json();
      this.projects = data.projects || [];
      this.render();
    } catch (err) {
      console.warn('⚠️ [Projects Widget] Erreur:', err.message);
      if (this.contentEl && !silent) {
        this.contentEl.innerHTML = `
          <div class="text-center py-4 text-xs text-rose-400">
            Impossible de scanner les dépôts Git.
          </div>
        `;
      }
    } finally {
      this.isLoading = false;
      if (this.refreshBtn) {
        const svg = this.refreshBtn.querySelector('svg');
        if (svg) svg.classList.remove('animate-spin');
      }
    }
  }

  render() {
    const totalCount = this.projects.length;
    if (this.countBadge) {
      this.countBadge.textContent = totalCount;
    }

    const dirtyProjects = this.projects.filter(p => p.isDirty);
    const syncProjects = this.projects.filter(p => p.ahead > 0 || p.behind > 0);

    if (this.statusDot) {
      if (dirtyProjects.length > 0) {
        this.statusDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse';
      } else {
        this.statusDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
      }
    }

    if (!this.contentEl) return;

    if (totalCount === 0) {
      this.contentEl.innerHTML = `
        <div class="py-6 text-center text-zinc-500 text-xs flex flex-col items-center justify-center space-y-1">
          <span class="text-xl">📁</span>
          <span>Aucun dépôt Git trouvé dans les dossiers scannés</span>
        </div>
      `;
      return;
    }

    // Affichage synthétique des KPIs + projets récents / modifiés
    const displayProjects = this.projects.slice(0, 4);

    this.contentEl.innerHTML = `
      <div class="space-y-3">
        <!-- 3 Badges de Statut Rapides -->
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="p-2 rounded-2xl bg-zinc-900/70 border border-zinc-800/80">
            <span class="text-[9px] text-zinc-500 font-semibold uppercase block">Dépôts</span>
            <span class="font-mono text-sm font-bold text-zinc-100 mt-0.5 block">${totalCount}</span>
          </div>

          <div class="p-2 rounded-2xl bg-zinc-900/70 border border-zinc-800/80">
            <span class="text-[9px] text-zinc-500 font-semibold uppercase block">Modifiés</span>
            <span class="font-mono text-sm font-bold ${dirtyProjects.length > 0 ? 'text-amber-400' : 'text-emerald-400'} mt-0.5 block">
              ${dirtyProjects.length}
            </span>
          </div>

          <div class="p-2 rounded-2xl bg-zinc-900/70 border border-zinc-800/80">
            <span class="text-[9px] text-zinc-500 font-semibold uppercase block">À Synchro</span>
            <span class="font-mono text-sm font-bold ${syncProjects.length > 0 ? 'text-sky-400' : 'text-zinc-400'} mt-0.5 block">
              ${syncProjects.length}
            </span>
          </div>
        </div>

        <!-- Liste des Projets Récents / Modifiés -->
        <div class="space-y-1.5">
          ${displayProjects.map(p => `
            <div class="p-2 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex items-center justify-between gap-2 text-xs group">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-sm shrink-0">${p.tech.icon}</span>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-white truncate text-[11px]">${p.name}</span>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-mono ${p.isDirty ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400'}">
                      ${p.branch}
                    </span>
                    ${p.ahead > 0 ? `<span class="text-[9px] text-sky-400 font-mono">↑${p.ahead}</span>` : ''}
                    ${p.behind > 0 ? `<span class="text-[9px] text-indigo-400 font-mono">↓${p.behind}</span>` : ''}
                  </div>
                  <div class="text-[10px] text-zinc-500 truncate mt-0.5">
                    ${p.lastCommit ? `${p.lastCommit.subject} (${p.lastCommit.relativeTime})` : p.path}
                  </div>
                </div>
              </div>

              <!-- Lanceurs Rapides (VS Code, Terminal, Finder/Explorateur) -->
              <div class="flex items-center gap-1 shrink-0">
                <button
                  data-path="${this.escapeHtml(p.path)}"
                  onclick="window.projectsWidget.open(this.dataset.path, 'vscode')"
                  class="p-1 rounded-lg bg-zinc-800 hover:bg-sky-500/20 hover:text-sky-300 text-zinc-300 transition-colors cursor-pointer"
                  title="Ouvrir dans VS Code"
                >
                  💻
                </button>
                <button
                  data-path="${this.escapeHtml(p.path)}"
                  onclick="window.projectsWidget.open(this.dataset.path, 'terminal')"
                  class="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  title="Ouvrir dans le Terminal"
                >
                  📟
                </button>
                <button
                  data-path="${this.escapeHtml(p.path)}"
                  onclick="window.projectsWidget.open(this.dataset.path, 'finder')"
                  class="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  title="Révéler dans le Finder / Explorateur"
                >
                  📂
                </button>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Bas de carte -->
        <div class="pt-1 flex items-center justify-between text-xs border-t border-zinc-800/60">
          <span class="text-[10px] text-zinc-500">
            ${dirtyProjects.length > 0 ? `${dirtyProjects.length} dépôts avec modifications` : 'Tous les dépôts sont synchronisés'}
          </span>
          <button
            onclick="window.switchTab && window.switchTab('projects')"
            class="text-[11px] text-brand-400 hover:text-brand-300 hover:underline font-semibold cursor-pointer"
          >
            Explorer tous les projets →
          </button>
        </div>
      </div>
    `;
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
}

window.ProjectsWidget = ProjectsWidget;
