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

    this.contentEl.innerHTML = `
      <div class="space-y-3 flex-1 flex flex-col justify-between">
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

          <!-- Ligne d'état de synthèse Git -->
          <div class="p-2.5 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between text-[11px]">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-xs shrink-0">${dirtyProjects.length > 0 ? '📝' : '✨'}</span>
              <span class="text-zinc-300 truncate">
                ${dirtyProjects.length > 0 ? `${dirtyProjects.length} projet${dirtyProjects.length > 1 ? 's' : ''} avec modifications` : 'Arbre de travail propre'}
              </span>
            </div>
            <span class="font-mono text-[10px] shrink-0 font-semibold ${dirtyProjects.length > 0 ? 'text-amber-400' : 'text-emerald-400'}">
              ${dirtyProjects.length > 0 ? 'À valider' : 'À jour'}
            </span>
          </div>
        </div>

        <!-- Bouton Accès aux Projets (Harmonisé) -->
        <div class="pt-0.5">
          <button
            onclick="window.switchTab && window.switchTab('projects')"
            class="w-full py-2 px-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-zinc-300 hover:text-white flex items-center justify-between transition-all group shadow-sm cursor-pointer"
          >
            <span>Explorer tous les projets</span>
            <svg class="w-3.5 h-3.5 text-zinc-500 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7"/></svg>
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
