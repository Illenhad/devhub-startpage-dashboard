/**
 * Application Principale — Startpage Coordinator & Tab Navigation & Collapsibles (Synchronisé SQLite)
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Horloge & Date
  initClock();

  // 2. Barre de Recherche Rapide
  initSearch();

  // 3. Gestion des Onglets Pleine Page (prioritaire pour garantir la navigation)
  initTabs();

  // 4. Gestionnaire de Thème (Système / Clair / Sombre)
  try {
    if (window.ThemeManager) window.themeManager = new window.ThemeManager();
  } catch (err) {
    console.warn('⚠️ [App] Erreur ThemeManager:', err);
  }

  // 5. Initialisation sécurisée des Widgets
  const safeInit = (fn) => {
    try { fn(); } catch (err) { console.warn('⚠️ [App] Erreur initialisation widget:', err); }
  };

  safeInit(() => { if (window.SystemWidget) window.systemWidget = new window.SystemWidget(); });
  safeInit(() => { if (window.SystemFullWidget) window.systemFullWidget = new window.SystemFullWidget(); });
  safeInit(() => { if (window.DockerWidget) window.dockerWidget = new window.DockerWidget(); });
  safeInit(() => { if (window.DockerFullWidget) window.dockerFullWidget = new window.DockerFullWidget(); });
  safeInit(() => { if (window.OllamaWidget) window.ollamaWidget = new window.OllamaWidget(); });
  safeInit(() => { if (window.OllamaFullWidget) window.ollamaFullWidget = new window.OllamaFullWidget(); });
  safeInit(() => { if (window.RssWidget) window.rssWidget = new window.RssWidget(); });
  safeInit(() => { if (window.RssFullWidget) window.rssFullWidget = new window.RssFullWidget(); });
  safeInit(() => { if (window.PortsWidget) window.portsWidget = new window.PortsWidget(); });
  safeInit(() => { if (window.PortsFullWidget) window.portsFullWidget = new window.PortsFullWidget(); });
  safeInit(() => { if (window.ProjectsWidget) window.projectsWidget = new window.ProjectsWidget(); });
  safeInit(() => { if (window.ProjectsFullWidget) window.projectsFullWidget = new window.ProjectsFullWidget(); });

  // 6. Gestionnaire de Synchronisation Multi-PC (Turso Cloud)
  safeInit(() => { if (window.SyncManager) window.syncManager = new window.SyncManager(); });

  // 7. Gestionnaire d'Agencement de l'Accueil (Drag & Drop, Grille & Visibilité)
  safeInit(() => { if (window.DashboardLayoutManager) window.dashboardLayoutManager = new window.DashboardLayoutManager(); });

  // 8. Nettoyage et suppression des états de repli
  cleanupCollapsibles();
});

function initClock() {
  const timeEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');

  function update() {
    const now = new Date();

    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }

    if (dateEl) {
      const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
      const formattedDate = now.toLocaleDateString('fr-FR', options);
      dateEl.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    }
  }

  update();
  setInterval(update, 1000);
}

function initSearch() {
  const searchInput = document.getElementById('startpage-search-input');
  const searchEngineSelect = document.getElementById('search-engine-select');
  const searchForm = document.getElementById('startpage-search-form');

  // Moteurs de recherche supportés
  const searchUrls = {
    startpage: (q) => `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}`,
    google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    ecosia: (q) => `https://www.ecosia.org/search?q=${encodeURIComponent(q)}`,
    qwant: (q) => `https://www.qwant.com/?q=${encodeURIComponent(q)}`,
    bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`
  };

  // Restaurer le moteur préféré sauvegardé (Startpage par défaut)
  if (searchEngineSelect) {
    const savedEngine = localStorage.getItem('devhub_startpage_engine') || localStorage.getItem('mac_startpage_engine') || 'startpage';
    if (savedEngine && searchUrls[savedEngine]) {
      searchEngineSelect.value = savedEngine;
    }

    // Récupérer la valeur SQLite si disponible
    fetch('/api/settings')
      .then(res => res.json())
      .then(settings => {
        if (settings.search_engine && searchUrls[settings.search_engine]) {
          searchEngineSelect.value = settings.search_engine;
          localStorage.setItem('devhub_startpage_engine', settings.search_engine);
        }
      })
      .catch(() => {});

    searchEngineSelect.addEventListener('change', (e) => {
      const engine = e.target.value;
      localStorage.setItem('devhub_startpage_engine', engine);
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'search_engine', value: engine })
      }).catch(() => {});
    });
  }

  // Raccourci clavier "/" pour focaliser la recherche
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      searchInput?.focus();
    }
  });

  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (!query) return;

      // Détection URL directe ou localhost
      if (/^(http:\/\/|https:\/\/|localhost[:/])/i.test(query)) {
        const url = query.startsWith('localhost') ? `http://${query}` : query;
        window.location.href = url;
        return;
      }

      if (/^[\w-]+(\.[\w-]+)+([/?].*)?$/i.test(query) && !query.includes(' ')) {
        window.location.href = `https://${query}`;
        return;
      }

      const engine = searchEngineSelect ? searchEngineSelect.value : 'startpage';
      const searchFn = searchUrls[engine] || searchUrls.startpage;
      window.location.href = searchFn(query);
    });
  }
}

/**
 * Gestionnaire du système d'onglets pleine page
 */
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-nav-btn');
  const views = document.querySelectorAll('.app-view');

  function switchTab(targetId) {
    if (!targetId) return;

    // Fermer toute modale de lecture éventuellement ouverte
    if (window.rssFullWidget && typeof window.rssFullWidget.closeReaderModal === 'function') {
      try { window.rssFullWidget.closeReaderModal(); } catch {}
    }

    // Masquer toutes les vues
    views.forEach(v => {
      if (v.id === `view-${targetId}`) {
        v.classList.remove('hidden');
      } else {
        v.classList.add('hidden');
      }
    });

    // Mettre à jour les styles des boutons
    tabButtons.forEach(btn => {
      const isTarget = btn.getAttribute('data-tab-target') === targetId;
      if (isTarget) {
        btn.className = 'tab-nav-btn px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 bg-brand-500 text-white shadow-sm font-bold text-xs shrink-0 cursor-pointer';
      } else {
        btn.className = 'tab-nav-btn px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 text-xs shrink-0 cursor-pointer';
      }
    });

    // Sauvegarder
    localStorage.setItem('devhub_startpage_tab', targetId);
    window.location.hash = targetId;

    // Déclencher le chargement des données spécifiques
    try {
      if (targetId === 'dashboard') {
        if (window.rssWidget && typeof window.rssWidget.loadUnreadCount === 'function') window.rssWidget.loadUnreadCount();
        if (window.portsWidget && typeof window.portsWidget.loadPorts === 'function') window.portsWidget.loadPorts();
        if (window.projectsWidget && typeof window.projectsWidget.loadProjects === 'function') window.projectsWidget.loadProjects();
      } else if (targetId === 'system' && window.systemFullWidget && typeof window.systemFullWidget.initView === 'function') {
        window.systemFullWidget.initView();
      } else if (targetId === 'docker' && window.dockerFullWidget && typeof window.dockerFullWidget.initView === 'function') {
        window.dockerFullWidget.initView();
      } else if (targetId === 'ollama' && window.ollamaFullWidget && typeof window.ollamaFullWidget.initView === 'function') {
        window.ollamaFullWidget.initView();
      } else if (targetId === 'rss' && window.rssFullWidget && typeof window.rssFullWidget.initView === 'function') {
        window.rssFullWidget.initView();
      } else if (targetId === 'projects' && window.projectsFullWidget && typeof window.projectsFullWidget.loadProjects === 'function') {
        window.projectsFullWidget.loadProjects();
      }
    } catch (err) {
      console.warn('⚠️ [SwitchTab] Erreur déclenchement données vue:', err);
    }
  }

  // Exposer sur window pour tous les boutons / widgets
  window.switchTab = switchTab;

  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.getAttribute('data-tab-target');
      switchTab(target);
    });
  });

  // Restaurer l'onglet actif (depuis hash URL ou localStorage)
  const hash = window.location.hash.replace('#', '');
  const savedTab = hash || localStorage.getItem('devhub_startpage_tab') || localStorage.getItem('mac_startpage_tab') || 'dashboard';
  
  if (['dashboard', 'system', 'docker', 'ollama', 'rss', 'projects'].includes(savedTab)) {
    switchTab(savedTab);
  } else {
    switchTab('dashboard');
  }
}

/**
 * Nettoyage et suppression définitive des fonctionnalités de repli / réduction
 */
function cleanupCollapsibles() {
  const allIds = [
    'dash-sys-content', 'dash-docker-content', 'dash-ollama-content', 'dash-rss-content',
    'full-ram-content', 'full-disks-content', 'full-procs-content', 'full-heavy-content'
  ];
  allIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
    try {
      localStorage.removeItem(`devhub_startpage_collapse_${id}`);
      localStorage.removeItem(`mac_startpage_collapse_${id}`);
    } catch {}
  });
}
