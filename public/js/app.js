/**
 * Application Principale — Startpage Coordinator & Tab Navigation & Collapsibles (Synchronisé SQLite)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Horloge & Date
  initClock();

  // Barre de Recherche Rapide
  initSearch();

  // Gestionnaire de Thème (Système / Clair / Sombre)
  window.themeManager = new window.ThemeManager();

  // Initialisation des Widgets
  window.systemWidget = new window.SystemWidget();
  window.systemFullWidget = new window.SystemFullWidget();
  window.dockerWidget = new window.DockerWidget();
  window.dockerFullWidget = new window.DockerFullWidget();
  window.ollamaWidget = new window.OllamaWidget();
  window.ollamaFullWidget = new window.OllamaFullWidget();
  window.rssWidget = new window.RssWidget();
  window.rssFullWidget = new window.RssFullWidget();

  // Gestionnaire d'Agencement de l'Accueil (Drag & Drop, Grille & Visibilité)
  if (window.DashboardLayoutManager) {
    window.dashboardLayoutManager = new window.DashboardLayoutManager();
  }

  // Gestion des Onglets Pleine Page
  initTabs();

  // Nettoyage et suppression des états de repli
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
    // Fermer toute modale de lecture éventuellement ouverte
    if (window.rssFullWidget && typeof window.rssFullWidget.closeReaderModal === 'function') {
      window.rssFullWidget.closeReaderModal();
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
        btn.className = 'tab-nav-btn px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 bg-brand-500 text-white shadow-sm font-bold text-xs';
      } else {
        btn.className = 'tab-nav-btn px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 text-xs';
      }
    });

    // Sauvegarder
    localStorage.setItem('devhub_startpage_tab', targetId);
    window.location.hash = targetId;

    // Déclencher le chargement des données spécifiques
    if (targetId === 'dashboard' && window.rssWidget) {
      window.rssWidget.loadUnreadCount();
    } else if (targetId === 'system' && window.systemFullWidget) {
      window.systemFullWidget.initView();
    } else if (targetId === 'docker' && window.dockerFullWidget) {
      window.dockerFullWidget.initView();
    } else if (targetId === 'ollama' && window.ollamaFullWidget) {
      window.ollamaFullWidget.initView();
    } else if (targetId === 'rss' && window.rssFullWidget) {
      window.rssFullWidget.initView();
    }
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab-target');
      switchTab(target);
    });
  });

  // Restaurer l'onglet actif (depuis hash URL ou localStorage)
  const hash = window.location.hash.replace('#', '');
  const savedTab = hash || localStorage.getItem('devhub_startpage_tab') || localStorage.getItem('mac_startpage_tab') || 'dashboard';
  
  if (['dashboard', 'system', 'docker', 'ollama', 'rss'].includes(savedTab)) {
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
