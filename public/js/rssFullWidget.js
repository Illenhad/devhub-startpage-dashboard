/**
 * Widget Vue Pleine Page : Veille Technologique Multi-Mots-Clés & Flux RSS Réunis (Synchronisé SQLite avec Badges par Source)
 */

class RssFullWidget {
  constructor() {
    this.feeds = [];
    this.watchKeywords = [];
    this.activeMode = 'unified'; // 'unified' | 'feed' | 'keyword'
    this.activeTarget = 'all';   // 'all' | feedUrl | keyword
    this.activeTitle = '🌟 Tous les articles (Flux & Veille)';
    this.activeDesc = 'Flux unifié d\'actualités des 7 derniers jours et surveillance par mots-clés';

    this.masterArticles = []; // Ensemble complet pour calcul des compteurs par source
    this.articles = [];
    this.displayedArticles = [];
    this.currentArticleIndex = 0;
    this.searchQuery = '';
    this.readFilter = 'all'; // 'all' | 'unread' | 'read'
    this.readArticles = new Set();
    this.deletedArticles = new Set();

    // Éléments DOM Sidebar & Listes
    this.allBtnEl = document.getElementById('full-watch-all-btn');
    this.allBadgeEl = document.getElementById('full-watch-all-badge');
    this.keywordsListEl = document.getElementById('full-watch-keywords-list');
    this.feedsListEl = document.getElementById('full-rss-feeds-list');

    // Formulaires d'ajout
    this.addKeywordForm = document.getElementById('full-watch-add-form');
    this.addKeywordInput = document.getElementById('full-watch-add-keyword');
    this.addFeedForm = document.getElementById('full-rss-add-form');
    this.addFeedUrlInput = document.getElementById('full-rss-add-url');
    this.addFeedNameInput = document.getElementById('full-rss-add-name');

    // Contenu Principal & Grille
    this.articlesGridEl = document.getElementById('full-rss-articles-grid');
    this.feedTitleEl = document.getElementById('full-rss-feed-title');
    this.feedDescEl = document.getElementById('full-rss-feed-desc');
    this.articlesCountBadgeEl = document.getElementById('full-rss-count-badge');
    this.searchInput = document.getElementById('full-rss-search');
    this.refreshBtn = document.getElementById('full-rss-refresh-btn');
    this.markAllReadBtn = document.getElementById('full-rss-mark-all-read-btn');
    this.restoreDeletedBtn = document.getElementById('full-rss-restore-deleted-btn');
    this.restoreTextEl = document.getElementById('full-rss-restore-text');

    // Modal de lecture complète
    this.readerModalEl = document.getElementById('rss-reader-modal');
    this.readerModalTitleEl = document.getElementById('rss-reader-modal-title');
    this.readerModalMetaEl = document.getElementById('rss-reader-modal-meta');
    this.readerModalBodyEl = document.getElementById('rss-reader-modal-body');
    this.readerModalLinkEl = document.getElementById('rss-reader-modal-link');
    this.readerModalCloseBtn = document.getElementById('rss-reader-modal-close');
    this.readerModalPrevBtn = document.getElementById('rss-reader-modal-prev');
    this.readerModalNextBtn = document.getElementById('rss-reader-modal-next');

    this.bindEvents();
    this.loadState();
  }

  bindEvents() {
    // Actualisation du flux actif
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.refreshCurrent(true));
    }

    // Tout marquer comme lu
    if (this.markAllReadBtn) {
      this.markAllReadBtn.addEventListener('click', () => this.markAllAsRead());
    }

    // Restaurer les articles supprimés
    if (this.restoreDeletedBtn) {
      this.restoreDeletedBtn.addEventListener('click', () => this.restoreDeletedArticles());
    }

    // Filtres d'état (Tous / Non lus / Lus)
    document.querySelectorAll('[data-rss-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-rss-filter]').forEach(b => {
          b.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all';
        });
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-500 text-white shadow-sm transition-all';
        this.readFilter = btn.getAttribute('data-rss-filter');
        this.renderArticles();
      });
    });

    // Recherche
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderArticles();
      });
    }

    // Formulaire d'ajout de mot-clé de veille
    if (this.addKeywordForm) {
      this.addKeywordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const kw = this.addKeywordInput.value.trim();
        if (!kw) return;
        this.addWatchKeyword(kw);
        this.addKeywordInput.value = '';
      });
    }

    // Formulaire d'ajout de flux RSS
    if (this.addFeedForm) {
      this.addFeedForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = this.addFeedUrlInput.value.trim();
        const name = this.addFeedNameInput.value.trim() || 'Nouveau Flux';
        if (!url) return;

        this.addCustomFeed(name, url);
        this.addFeedUrlInput.value = '';
        this.addFeedNameInput.value = '';
      });
    }

    // Modal de lecture
    if (this.readerModalCloseBtn) {
      this.readerModalCloseBtn.addEventListener('click', () => this.closeReaderModal());
    }

    if (this.readerModalEl) {
      this.readerModalEl.addEventListener('click', (e) => {
        if (e.target === this.readerModalEl) this.closeReaderModal();
      });
    }

    // Navigation précédent / suivant dans la modal
    if (this.readerModalPrevBtn) {
      this.readerModalPrevBtn.addEventListener('click', () => {
        if (this.currentArticleIndex > 0) {
          this.openReaderModalByIndex(this.currentArticleIndex - 1);
        }
      });
    }

    if (this.readerModalNextBtn) {
      this.readerModalNextBtn.addEventListener('click', () => {
        if (this.currentArticleIndex < this.displayedArticles.length - 1) {
          this.openReaderModalByIndex(this.currentArticleIndex + 1);
        }
      });
    }

    // Raccourcis clavier (Échap, Flèches Gauche/Droite)
    document.addEventListener('keydown', (e) => {
      if (this.readerModalEl && !this.readerModalEl.classList.contains('hidden')) {
        if (e.key === 'Escape') {
          this.closeReaderModal();
        } else if (e.key === 'ArrowLeft' && this.currentArticleIndex > 0) {
          this.openReaderModalByIndex(this.currentArticleIndex - 1);
        } else if (e.key === 'ArrowRight' && this.currentArticleIndex < this.displayedArticles.length - 1) {
          this.openReaderModalByIndex(this.currentArticleIndex + 1);
        }
      }
    });
  }

  async loadState() {
    // 1. Pré-chargement rapide depuis localStorage si disponible (zéro latence)
    try {
      const rawRead = localStorage.getItem('devhub_rss_read_articles') || localStorage.getItem('mac_rss_read_articles');
      if (rawRead) this.readArticles = new Set(JSON.parse(rawRead));
      const rawDel = localStorage.getItem('devhub_rss_deleted_articles') || localStorage.getItem('mac_rss_deleted_articles');
      if (rawDel) this.deletedArticles = new Set(JSON.parse(rawDel));
      const rawFeeds = localStorage.getItem('devhub_rss_feeds') || localStorage.getItem('mac_rss_feeds');
      if (rawFeeds) this.feeds = JSON.parse(rawFeeds);
      const rawKw = localStorage.getItem('devhub_watch_keywords') || localStorage.getItem('mac_watch_keywords');
      if (rawKw) this.watchKeywords = JSON.parse(rawKw);
    } catch {}

    // 2. Synchronisation SQLite
    try {
      const [feedsRes, kwRes, stateRes] = await Promise.all([
        fetch('/api/rss/feeds'),
        fetch('/api/watch/keywords'),
        fetch('/api/rss/state')
      ]);

      if (feedsRes.ok) {
        const feedsData = await feedsRes.json();
        if (feedsData.feeds) {
          this.feeds = feedsData.feeds;
          localStorage.setItem('devhub_rss_feeds', JSON.stringify(this.feeds));
        }
      }

      if (kwRes.ok) {
        const kwData = await kwRes.json();
        if (kwData.keywords) {
          this.watchKeywords = kwData.keywords;
          localStorage.setItem('devhub_watch_keywords', JSON.stringify(this.watchKeywords));
        }
      }

      if (stateRes.ok) {
        const stateData = await stateRes.json();
        if (stateData.readArticles) {
          this.readArticles = new Set(stateData.readArticles);
          localStorage.setItem('devhub_rss_read_articles', JSON.stringify(stateData.readArticles));
        }
        if (stateData.deletedArticles) {
          this.deletedArticles = new Set(stateData.deletedArticles);
          localStorage.setItem('devhub_rss_deleted_articles', JSON.stringify(stateData.deletedArticles));
        }
      }
    } catch (err) {
      console.warn('Sync SQLite Veille & RSS:', err);
    }

    this.renderSidebar();
  }

  notifyStateChanged() {
    window.dispatchEvent(new CustomEvent('rss-state-changed'));
  }

  async initView() {
    await this.loadState();
    if (this.articles.length === 0) {
      await this.selectUnified();
    }
  }

  refreshCurrent(isManual = false) {
    if (this.activeMode === 'unified') {
      this.selectUnified(isManual);
    } else if (this.activeMode === 'keyword') {
      this.selectKeyword(this.activeTarget, isManual);
    } else if (this.activeMode === 'feed') {
      this.selectFeed(this.activeTarget, isManual);
    }
  }

  // -------------------------------------------------------------
  // CALCUL DES ARTICLES NON LUS PAR SOURCE & TIMESTAMP
  // -------------------------------------------------------------

  getArticleTimestamp(a) {
    if (!a) return 0;
    if (a.timestamp && typeof a.timestamp === 'number' && !isNaN(a.timestamp) && a.timestamp > 0) {
      return a.timestamp;
    }
    if (a.rawDate) {
      const d = new Date(a.rawDate);
      const t = d.getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    return 0;
  }

  getUnreadCountForKeyword(keyword) {
    if (!this.masterArticles || this.masterArticles.length === 0) return 0;
    const clean = (keyword || '').toLowerCase().trim();
    const items = this.masterArticles.filter(a => {
      const kw = (a.watchKeyword || '').toLowerCase().trim();
      return kw === clean || (a.type === 'watch' && kw.includes(clean));
    });
    return items.filter(a => !this.deletedArticles.has(a.link) && !this.readArticles.has(a.link)).length;
  }

  getUnreadCountForFeed(feed) {
    if (!this.masterArticles || this.masterArticles.length === 0) return 0;
    const feedUrl = feed.url;
    const feedId = feed.id;
    const feedName = (feed.name || '').toLowerCase().trim();

    const items = this.masterArticles.filter(a => {
      if (a.feedUrl && a.feedUrl === feedUrl) return true;
      if (a.feedId && a.feedId === feedId) return true;
      if (a.feedName && a.feedName.toLowerCase().trim() === feedName) return true;
      return false;
    });

    return items.filter(a => !this.deletedArticles.has(a.link) && !this.readArticles.has(a.link)).length;
  }

  // -------------------------------------------------------------
  // NAVIGATION & SÉLECTIONS DE SOURCES
  // -------------------------------------------------------------

  async selectUnified(isManual = false) {
    this.activeMode = 'unified';
    this.activeTarget = 'all';
    this.activeTitle = '🌟 Tous les articles (Flux & Veille)';
    this.activeDesc = `Flux unifié des 7 derniers jours comprenant ${this.feeds.length} flux RSS et ${this.watchKeywords.length} sujets de veille surveillés`;

    this.renderSidebar();
    this.showLoading('Chargement du flux unifié (Flux RSS + Veille)...');

    if (isManual && this.refreshBtn) {
      const icon = this.refreshBtn.querySelector('svg') || this.refreshBtn;
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 600);
    }

    try {
      const res = await fetch('/api/watch/unified');
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erreur flux unifié');

      this.masterArticles = (data.items || []).slice().sort((a, b) => this.getArticleTimestamp(b) - this.getArticleTimestamp(a));
      this.articles = this.masterArticles;
      this.updateHeader();
      this.renderSidebar();
      this.renderArticles();
      this.notifyStateChanged();
    } catch (err) {
      this.showError('Impossible de charger le flux unifié', err.message, () => this.selectUnified(true));
    }
  }

  async selectKeyword(keyword, isManual = false) {
    if (!keyword) return;
    this.activeMode = 'keyword';
    this.activeTarget = keyword;
    this.activeTitle = `🎯 Veille : "${keyword}"`;
    this.activeDesc = `Actualités en direct et surveillance pour le mot-clé "${keyword}"`;

    this.renderSidebar();
    this.showLoading(`Recherche des actualités pour "${keyword}"...`);

    if (isManual && this.refreshBtn) {
      const icon = this.refreshBtn.querySelector('svg') || this.refreshBtn;
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 600);
    }

    try {
      const res = await fetch(`/api/watch/feed?keyword=${encodeURIComponent(keyword)}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erreur recherche');

      this.articles = (data.items || []).slice().sort((a, b) => this.getArticleTimestamp(b) - this.getArticleTimestamp(a));
      
      // Mettre à jour le master cache si nécessaire
      if (!this.masterArticles || this.masterArticles.length === 0) {
        this.masterArticles = this.articles;
      }

      this.updateHeader();
      this.renderSidebar();
      this.renderArticles();
      this.notifyStateChanged();
    } catch (err) {
      this.showError(`Impossible de récupérer la veille pour "${keyword}"`, err.message, () => this.selectKeyword(keyword, true));
    }
  }

  async selectFeed(url, isManual = false) {
    if (!url) return;
    const feed = this.feeds.find(f => f.url === url);
    const feedName = feed ? feed.name : 'Flux RSS';

    this.activeMode = 'feed';
    this.activeTarget = url;
    this.activeTitle = `📡 ${feedName}`;
    this.activeDesc = feed ? `Flux RSS : ${feed.url}` : 'Actualités du flux';

    this.renderSidebar();
    this.showLoading(`Chargement des articles de ${feedName}...`);

    if (isManual && this.refreshBtn) {
      const icon = this.refreshBtn.querySelector('svg') || this.refreshBtn;
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 600);
    }

    try {
      const res = await fetch(`/api/rss?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erreur flux RSS');

      const rawItems = (data.items || []).map(item => ({
        ...item,
        type: 'rss',
        feedId: feed?.id,
        feedUrl: url,
        feedName: feedName,
        feedIcon: feed?.icon || '📰'
      }));

      this.articles = rawItems.slice().sort((a, b) => this.getArticleTimestamp(b) - this.getArticleTimestamp(a));

      if (data.description) this.activeDesc = data.description;
      if (!this.masterArticles || this.masterArticles.length === 0) {
        this.masterArticles = this.articles;
      }

      this.updateHeader();
      this.renderSidebar();
      this.renderArticles();
      this.notifyStateChanged();
    } catch (err) {
      this.showError(`Impossible de charger le flux "${feedName}"`, err.message, () => this.selectFeed(url, true));
    }
  }

  updateHeader() {
    if (this.feedTitleEl) this.feedTitleEl.innerHTML = this.activeTitle;
    if (this.feedDescEl) this.feedDescEl.textContent = this.activeDesc;
  }

  showLoading(text) {
    if (this.articlesGridEl) {
      this.articlesGridEl.innerHTML = `
        <div class="col-span-full py-20 text-center space-y-3">
          <div class="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mx-auto"></div>
          <p class="text-xs font-medium text-zinc-400">${text}</p>
        </div>
      `;
    }
  }

  showError(title, msg, retryFn) {
    if (this.articlesGridEl) {
      this.articlesGridEl.innerHTML = `
        <div class="col-span-full py-16 text-center text-zinc-500 space-y-3">
          <div class="inline-flex p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <p class="text-xs font-bold text-zinc-200">${title}</p>
          <p class="text-[11px] text-zinc-400 max-w-md mx-auto font-mono">${msg}</p>
          <div class="pt-2">
            <button 
              id="rss-retry-btn"
              class="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 hover:text-white transition-all inline-flex items-center gap-1.5"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              <span>Réessayer</span>
            </button>
          </div>
        </div>
      `;
      document.getElementById('rss-retry-btn')?.addEventListener('click', retryFn);
    }
  }

  // -------------------------------------------------------------
  // GESTION DES MOTS-CLÉS DE VEILLE
  // -------------------------------------------------------------

  async addWatchKeyword(keyword) {
    try {
      const res = await fetch('/api/watch/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      });
      const data = await res.json();
      if (data.keywords) {
        this.watchKeywords = data.keywords;
        localStorage.setItem('devhub_watch_keywords', JSON.stringify(this.watchKeywords));
      }
    } catch {}

    this.renderSidebar();
    this.selectKeyword(keyword);
    this.notifyStateChanged();
  }

  async deleteWatchKeyword(id, e) {
    if (e) e.stopPropagation();
    const kw = this.watchKeywords.find(k => k.id === id);
    const kwName = kw ? kw.keyword : 'ce mot-clé';

    if (!confirm(`Supprimer le sujet de veille "${kwName}" ?`)) return;

    try {
      const res = await fetch(`/api/watch/keywords/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.keywords) {
        this.watchKeywords = data.keywords;
        localStorage.setItem('devhub_watch_keywords', JSON.stringify(this.watchKeywords));
      }
    } catch {
      this.watchKeywords = this.watchKeywords.filter(k => k.id !== id);
    }

    if (this.activeMode === 'keyword' && this.activeTarget === kwName) {
      this.selectUnified();
    } else {
      this.renderSidebar();
    }
    this.notifyStateChanged();
  }

  // -------------------------------------------------------------
  // GESTION DES FLUX RSS
  // -------------------------------------------------------------

  async addCustomFeed(name, url) {
    try {
      const res = await fetch('/api/rss/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url })
      });
      const data = await res.json();
      if (data.feeds) {
        this.feeds = data.feeds;
        localStorage.setItem('devhub_rss_feeds', JSON.stringify(this.feeds));
      }
    } catch {}

    this.renderSidebar();
    this.selectFeed(url);
    this.notifyStateChanged();
  }

  async deleteFeed(feedId, e) {
    if (e) e.stopPropagation();
    const feed = this.feeds.find(f => f.id === feedId);
    const feedName = feed ? feed.name : 'ce flux';

    if (!confirm(`Supprimer définitivement le flux "${feedName}" ?`)) return;

    try {
      const res = await fetch(`/api/rss/feeds/${feedId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.feeds) {
        this.feeds = data.feeds;
        localStorage.setItem('devhub_rss_feeds', JSON.stringify(this.feeds));
      }
    } catch {
      this.feeds = this.feeds.filter(f => f.id !== feedId);
    }

    if (this.activeMode === 'feed' && feed && this.activeTarget === feed.url) {
      this.selectUnified();
    } else {
      this.renderSidebar();
    }
    this.notifyStateChanged();
  }

  async resetDefaultAll() {
    if (!confirm('Réinitialiser les flux RSS et les mots-clés de veille par défaut ?')) return;

    try {
      const [resFeeds, resKw] = await Promise.all([
        fetch('/api/rss/feeds/reset', { method: 'POST' }),
        fetch('/api/watch/keywords/reset', { method: 'POST' })
      ]);

      const dataFeeds = await resFeeds.json();
      const dataKw = await resKw.json();

      if (dataFeeds.feeds) this.feeds = dataFeeds.feeds;
      if (dataKw.keywords) this.watchKeywords = dataKw.keywords;

      localStorage.setItem('devhub_rss_feeds', JSON.stringify(this.feeds));
      localStorage.setItem('devhub_watch_keywords', JSON.stringify(this.watchKeywords));
    } catch {}

    this.selectUnified();
    this.notifyStateChanged();
  }

  // -------------------------------------------------------------
  // RENDU SIDEBAR & LISTES AVEC BADGES PAR SOURCE
  // -------------------------------------------------------------

  renderSidebar() {
    // Calcul de l'ensemble des articles actifs pour le badge global
    const sourceArticles = (this.masterArticles && this.masterArticles.length > 0) ? this.masterArticles : this.articles;
    const globalActive = sourceArticles.filter(a => !this.deletedArticles.has(a.link));
    const globalUnread = globalActive.filter(a => !this.readArticles.has(a.link)).length;

    // 1. Bouton Tout afficher
    if (this.allBtnEl) {
      const isAllActive = this.activeMode === 'unified';
      this.allBtnEl.className = `group flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${
        isAllActive
          ? 'bg-brand-500/15 border border-brand-500/30 text-white font-medium shadow-sm'
          : 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border border-transparent'
      }`;
    }

    if (this.allBadgeEl) {
      if (globalUnread > 0) {
        this.allBadgeEl.className = 'px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black font-mono shadow-sm';
        this.allBadgeEl.textContent = globalUnread > 99 ? '99+' : globalUnread;
      } else {
        this.allBadgeEl.className = 'px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-bold font-mono';
        this.allBadgeEl.textContent = '0';
      }
    }

    // 2. Liste des Mots-clés de veille avec badge par mot-clé
    if (this.keywordsListEl) {
      if (this.watchKeywords.length === 0) {
        this.keywordsListEl.innerHTML = `
          <div class="p-2 text-center text-xs text-zinc-500">
            Aucun mot-clé configuré
          </div>
        `;
      } else {
        this.keywordsListEl.innerHTML = this.watchKeywords.map(kw => {
          const isActive = this.activeMode === 'keyword' && this.activeTarget === kw.keyword;
          const unreadCount = this.getUnreadCountForKeyword(kw.keyword);

          return `
            <div
              onclick="window.rssFullWidget.selectKeyword('${kw.keyword}')"
              class="group flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                isActive
                  ? 'bg-purple-500/20 border border-purple-500/40 text-purple-200 font-bold shadow-sm'
                  : 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border border-transparent'
              }"
            >
              <div class="flex items-center gap-2 min-w-0 pr-1">
                <span class="text-xs shrink-0">${kw.icon || '🎯'}</span>
                <span class="text-xs font-semibold truncate ${isActive ? 'text-purple-300' : 'text-zinc-200'}">
                  ${kw.keyword}
                </span>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <!-- Badge d'articles non lus pour ce mot-clé -->
                ${unreadCount > 0 ? `
                  <span class="px-1.5 py-0.5 rounded-full bg-purple-500/25 text-purple-300 border border-purple-500/30 text-[9px] font-bold font-mono">
                    ${unreadCount}
                  </span>
                ` : `
                  <span class="px-1.5 py-0.5 rounded-full bg-zinc-800/60 text-zinc-500 text-[9px] font-medium font-mono">
                    0
                  </span>
                `}

                <!-- Bouton supprimer -->
                <button
                  onclick="window.rssFullWidget.deleteWatchKeyword('${kw.id}', event)"
                  class="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-all shrink-0"
                  title="Supprimer la veille sur ${kw.keyword}"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 3. Liste des Flux RSS avec badge par flux
    if (this.feedsListEl) {
      if (this.feeds.length === 0) {
        this.feedsListEl.innerHTML = `
          <div class="p-2 text-center text-xs text-zinc-500">
            Aucun flux RSS actif
          </div>
        `;
      } else {
        this.feedsListEl.innerHTML = this.feeds.map(f => {
          const isActive = this.activeMode === 'feed' && this.activeTarget === f.url;
          const unreadCount = this.getUnreadCountForFeed(f);

          return `
            <div
              onclick="window.rssFullWidget.selectFeed('${f.url}')"
              class="group flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                isActive
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-200 font-bold shadow-sm'
                  : 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border border-transparent'
              }"
            >
              <div class="flex items-center gap-2 min-w-0 pr-1">
                <span class="text-xs shrink-0">${f.icon || '📰'}</span>
                <div class="min-w-0">
                  <span class="text-xs font-semibold truncate block ${isActive ? 'text-amber-300' : 'text-zinc-200'}">
                    ${f.name}
                  </span>
                </div>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <!-- Badge d'articles non lus pour ce flux -->
                ${unreadCount > 0 ? `
                  <span class="px-1.5 py-0.5 rounded-full bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[9px] font-bold font-mono">
                    ${unreadCount}
                  </span>
                ` : `
                  <span class="px-1.5 py-0.5 rounded-full bg-zinc-800/60 text-zinc-500 text-[9px] font-medium font-mono">
                    0
                  </span>
                `}

                <!-- Bouton supprimer -->
                <button
                  onclick="window.rssFullWidget.deleteFeed('${f.id}', event)"
                  class="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-all shrink-0"
                  title="Supprimer le flux ${f.name}"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  // -------------------------------------------------------------
  // RENDU DE LA GRILLE D'ARTICLES
  // -------------------------------------------------------------

  renderArticles() {
    if (!this.articlesGridEl) return;

    // Filtrer les articles non supprimés
    let activeList = this.articles.filter(a => !this.deletedArticles.has(a.link));

    // Mettre à jour le bouton de restauration des articles masqués
    if (this.restoreDeletedBtn) {
      const deletedCount = this.articles.filter(a => this.deletedArticles.has(a.link)).length;
      if (deletedCount > 0) {
        this.restoreDeletedBtn.classList.remove('hidden');
        if (this.restoreTextEl) {
          this.restoreTextEl.textContent = `Restaurer ${deletedCount} masqué${deletedCount > 1 ? 's' : ''}`;
        }
      } else {
        this.restoreDeletedBtn.classList.add('hidden');
      }
    }

    // Filtrer par état de lecture (tous, non lus, lus)
    let filtered = activeList.filter(a => {
      const isRead = this.readArticles.has(a.link);
      if (this.readFilter === 'unread' && isRead) return false;
      if (this.readFilter === 'read' && !isRead) return false;

      // Filtrer par recherche
      if (this.searchQuery) {
        const q = this.searchQuery;
        return a.title.toLowerCase().includes(q) ||
               a.excerpt.toLowerCase().includes(q) ||
               a.author.toLowerCase().includes(q) ||
               (a.watchKeyword && a.watchKeyword.toLowerCase().includes(q)) ||
               (a.feedName && a.feedName.toLowerCase().includes(q)) ||
               (a.categories && a.categories.some(c => c.toLowerCase().includes(q)));
      }
      return true;
    });

    // Tri strict et systématique par date (du plus récent au plus ancien)
    filtered.sort((a, b) => this.getArticleTimestamp(b) - this.getArticleTimestamp(a));
    this.displayedArticles = filtered;

    // Mettre à jour le badge de compteur
    const unreadCount = activeList.filter(a => !this.readArticles.has(a.link)).length;
    if (this.articlesCountBadgeEl) {
      this.articlesCountBadgeEl.textContent = `${unreadCount} non lu${unreadCount > 1 ? 's' : ''} / ${activeList.length} articles`;
    }

    if (filtered.length === 0) {
      this.articlesGridEl.innerHTML = `
        <div class="col-span-full py-16 text-center text-zinc-500 space-y-2">
          <p class="text-xs font-semibold text-zinc-300">Aucun article ne correspond à ce filtre.</p>
          <p class="text-[11px] text-zinc-500">Essayez de modifier vos filtres ou de réinitialiser la recherche.</p>
        </div>
      `;
      return;
    }

    this.articlesGridEl.innerHTML = filtered.map((a) => {
      const isRead = this.readArticles.has(a.link);
      const isWatch = a.type === 'watch' || a.watchKeyword;
      const escapedLink = encodeURIComponent(a.link || '');

      return `
        <article 
          onclick="window.rssFullWidget.openReaderModalByLink('${escapedLink}')"
          class="p-4 sm:p-5 rounded-3xl transition-all flex flex-col justify-between space-y-3.5 cursor-pointer group ${
            isRead 
              ? 'bg-zinc-950/50 border border-zinc-900/90 opacity-60 hover:opacity-95 grayscale-[35%] hover:grayscale-0 shadow-none' 
              : 'bg-zinc-900/80 border border-zinc-800 hover:border-brand-500/50 shadow-xl hover:-translate-y-0.5'
          }"
        >
          
          <div class="space-y-2.5">
            <!-- En-tête : Source / Sujet de veille, Badge État de Lecture, Auteur & Date -->
            <div class="flex items-center justify-between text-[11px] gap-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <!-- Badge Tag de la source ou du mot-clé -->
                ${isWatch ? `
                  <span class="px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-300 font-bold border border-purple-500/20 font-mono text-[10px] truncate max-w-[150px]">
                    🎯 Veille : ${a.watchKeyword || 'Sujet'}
                  </span>
                ` : `
                  <span class="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 font-bold border border-amber-500/20 font-mono text-[10px] truncate max-w-[150px]">
                    ${a.feedIcon || '⚡'} ${a.feedName || 'RSS'}
                  </span>
                `}

                <!-- Badge Visuel Marqué Lu / Non Lu -->
                ${isRead ? `
                  <span class="px-1.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold font-mono flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    <span>Lu</span>
                  </span>
                ` : `
                  <span class="px-1.5 py-0.5 rounded-lg bg-brand-500/20 text-brand-300 border border-brand-500/30 text-[9px] font-bold font-mono flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse"></span>
                    <span>Nouveau</span>
                  </span>
                `}
              </div>

              <span class="text-zinc-500 font-mono shrink-0 text-[10px]">${a.date}</span>
            </div>

            <!-- Image avec style atténué si lu -->
            ${a.image ? `
              <div class="w-full h-32 rounded-2xl overflow-hidden bg-zinc-950/60 border border-zinc-800 relative">
                <img 
                  src="${a.image}" 
                  alt="${a.title}" 
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${isRead ? 'opacity-70' : ''}" 
                  loading="lazy" 
                  referrerpolicy="no-referrer"
                  onerror="this.parentElement.style.display='none'"
                />
              </div>
            ` : ''}

            <!-- Titre de l'article -->
            <h4 class="font-bold text-xs sm:text-sm ${isRead ? 'text-zinc-400 font-medium' : 'text-zinc-100 font-bold'} group-hover:text-brand-400 transition-colors leading-snug">
              ${a.title}
            </h4>

            <!-- Extrait texte -->
            <p class="text-xs ${isRead ? 'text-zinc-500' : 'text-zinc-400'} line-clamp-2 leading-relaxed">
              ${a.excerpt}
            </p>

            <!-- Auteur / Source originale -->
            ${a.author ? `
              <div class="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                <span>Source:</span>
                <span class="text-zinc-400 font-semibold truncate">${a.author}</span>
              </div>
            ` : ''}
          </div>

          <!-- Bas de carte : Barre d'actions complètes -->
          <div class="flex items-center justify-between pt-2.5 border-t ${isRead ? 'border-zinc-900' : 'border-zinc-800/60'} text-xs gap-2">
            <!-- Boutons d'actions rapides (Basculer Lu/Non lu & Supprimer) -->
            <div class="flex items-center gap-1" onclick="event.stopPropagation()">
              <button
                onclick="window.rssFullWidget.toggleRead(decodeURIComponent('${escapedLink}'), event)"
                class="p-1.5 px-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                  isRead 
                    ? 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200' 
                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                }"
                title="${isRead ? 'Marquer comme non lu' : 'Marquer comme lu'}"
              >
                ${isRead ? `
                  <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  <span class="text-[10px]">Non lu</span>
                ` : `
                  <svg class="w-3.5 h-3.5 fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  <span class="text-[10px]">Lu</span>
                `}
              </button>

              <button
                onclick="window.rssFullWidget.deleteArticle(decodeURIComponent('${escapedLink}'), event)"
                class="p-1.5 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-all"
                title="Supprimer cet article de la liste"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>

            <!-- Bouton Principal : Lire l'article -->
            <button
              class="px-3 py-1 rounded-xl ${
                isRead 
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white' 
                  : 'bg-brand-500/20 group-hover:bg-brand-500 text-brand-300 group-hover:text-white font-bold'
              } transition-all flex items-center gap-1 text-xs shadow-sm"
            >
              <span>Lire</span>
              <svg class="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>

        </article>
      `;
    }).join('');
  }

  // -------------------------------------------------------------
  // ACTIONS SUR LES ARTICLES (LU, NON LU, SUPPRESSION)
  // -------------------------------------------------------------

  async toggleRead(link, e) {
    if (e) e.stopPropagation();
    if (!link) return;

    const willBeRead = !this.readArticles.has(link);
    if (willBeRead) {
      this.readArticles.add(link);
    } else {
      this.readArticles.delete(link);
    }

    localStorage.setItem('devhub_rss_read_articles', JSON.stringify([...this.readArticles]));
    this.renderSidebar();
    this.renderArticles();
    this.notifyStateChanged();

    // Persistance SQLite
    try {
      await fetch('/api/rss/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link, isRead: willBeRead })
      });
    } catch {}
  }

  async markAllAsRead() {
    const linksToMark = [];
    this.articles.forEach(a => {
      if (a.link && !this.readArticles.has(a.link)) {
        this.readArticles.add(a.link);
        linksToMark.push(a.link);
      }
    });

    localStorage.setItem('devhub_rss_read_articles', JSON.stringify([...this.readArticles]));
    this.renderSidebar();
    this.renderArticles();
    this.notifyStateChanged();

    if (linksToMark.length > 0) {
      try {
        await fetch('/api/rss/read-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ links: linksToMark })
        });
      } catch {}
    }
  }

  async deleteArticle(link, e) {
    if (e) e.stopPropagation();
    if (!link) return;

    this.deletedArticles.add(link);
    localStorage.setItem('devhub_rss_deleted_articles', JSON.stringify([...this.deletedArticles]));
    this.renderSidebar();
    this.renderArticles();
    this.notifyStateChanged();

    try {
      await fetch('/api/rss/delete-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link })
      });
    } catch {}
  }

  async restoreDeletedArticles() {
    this.deletedArticles.clear();
    localStorage.setItem('devhub_rss_deleted_articles', JSON.stringify([]));
    this.renderSidebar();
    this.renderArticles();
    this.notifyStateChanged();

    try {
      await fetch('/api/rss/restore-articles', { method: 'POST' });
    } catch {}
  }

  // -------------------------------------------------------------
  // MODALE DE LECTURE PLEINE PAGE
  // -------------------------------------------------------------

  openReaderModalByLink(encodedLink) {
    const link = decodeURIComponent(encodedLink);
    const idx = this.displayedArticles.findIndex(a => a.link === link);

    if (idx !== -1) {
      this.openReaderModalByIndex(idx);
    } else {
      const fallbackIdx = this.articles.findIndex(a => a.link === link);
      if (fallbackIdx !== -1) {
        this.renderArticleModalContent(this.articles[fallbackIdx], 0, 1);
      }
    }
  }

  openReaderModalByIndex(index) {
    if (index < 0 || index >= this.displayedArticles.length) return;
    
    this.currentArticleIndex = index;
    const article = this.displayedArticles[index];
    if (!article) return;

    this.renderArticleModalContent(article, index, this.displayedArticles.length);
  }

  renderArticleModalContent(article, currentIndex, totalCount) {
    // Marquer automatiquement comme lu à l'ouverture
    if (!this.readArticles.has(article.link)) {
      this.readArticles.add(article.link);
      localStorage.setItem('devhub_rss_read_articles', JSON.stringify([...this.readArticles]));
      this.renderSidebar();
      this.renderArticles();
      this.notifyStateChanged();

      fetch('/api/rss/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: article.link, isRead: true })
      }).catch(() => {});
    }

    if (this.readerModalTitleEl) this.readerModalTitleEl.textContent = article.title;
    if (this.readerModalMetaEl) {
      const tag = article.watchKeyword ? `🎯 Veille: ${article.watchKeyword}` : (article.feedName || 'Actualité');
      this.readerModalMetaEl.textContent = `${tag} • ${article.author ? `${article.author} • ` : ''}${article.date}`;
    }

    if (this.readerModalBodyEl) {
      let contentHtml = article.content || `<p class="leading-relaxed text-zinc-300">${article.excerpt}</p>`;
      this.readerModalBodyEl.innerHTML = contentHtml;
      this.readerModalBodyEl.scrollTop = 0;
    }

    if (this.readerModalLinkEl) {
      this.readerModalLinkEl.href = article.link;
    }

    // Gérer état boutons précédent / suivant
    if (this.readerModalPrevBtn) {
      this.readerModalPrevBtn.disabled = currentIndex === 0;
      this.readerModalPrevBtn.classList.toggle('opacity-30', currentIndex === 0);
    }
    if (this.readerModalNextBtn) {
      this.readerModalNextBtn.disabled = currentIndex >= totalCount - 1;
      this.readerModalNextBtn.classList.toggle('opacity-30', currentIndex >= totalCount - 1);
    }

    if (this.readerModalEl) {
      this.readerModalEl.classList.remove('hidden');
    }
  }

  closeReaderModal() {
    if (this.readerModalEl) {
      this.readerModalEl.classList.add('hidden');
    }
  }
}

window.RssFullWidget = RssFullWidget;
