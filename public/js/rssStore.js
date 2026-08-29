/**
 * RssStore — Gestionnaire d'état unique et centralisé pour la Veille Technologique et les Flux RSS
 * Assure une synchronisation 100% cohérente et instantanée de tous les badges et compteurs.
 */

class RssStore {
  constructor() {
    this.masterArticles = [];
    this.feeds = [];
    this.watchKeywords = [];
    this.readArticles = new Set();
    this.deletedArticles = new Set();
    this.isLoaded = false;
    this.isLoading = false;
    this.lastFetched = 0;
    this.listeners = new Set();

    this.initFromLocalStorage();
    this.syncStateWithServer();

    // Écoute de l'événement cross-tab localStorage
    window.addEventListener('storage', (e) => {
      if (e.key === 'devhub_rss_read_articles' && e.newValue) {
        try {
          this.readArticles = new Set(JSON.parse(e.newValue));
          this.notify();
        } catch {}
      } else if (e.key === 'devhub_rss_deleted_articles' && e.newValue) {
        try {
          this.deletedArticles = new Set(JSON.parse(e.newValue));
          this.notify();
        } catch {}
      }
    });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (e) {
        console.error('RssStore listener error:', e);
      }
    }
  }

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

  initFromLocalStorage() {
    try {
      const rawRead = localStorage.getItem('devhub_rss_read_articles') || localStorage.getItem('mac_rss_read_articles');
      if (rawRead) this.readArticles = new Set(JSON.parse(rawRead));

      const rawDel = localStorage.getItem('devhub_rss_deleted_articles') || localStorage.getItem('mac_rss_deleted_articles');
      if (rawDel) this.deletedArticles = new Set(JSON.parse(rawDel));

      const rawFeeds = localStorage.getItem('devhub_rss_feeds') || localStorage.getItem('mac_rss_feeds');
      if (rawFeeds) this.feeds = JSON.parse(rawFeeds);

      const rawKw = localStorage.getItem('devhub_watch_keywords') || localStorage.getItem('mac_watch_keywords');
      if (rawKw) this.watchKeywords = JSON.parse(rawKw);

      const rawMaster = localStorage.getItem('devhub_rss_master_cache');
      if (rawMaster) {
        this.masterArticles = JSON.parse(rawMaster);
      }
    } catch (e) {
      console.warn('Erreur initialisation locale RssStore:', e);
    }
  }

  async syncStateWithServer() {
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
        if (stateData.readArticles && Array.isArray(stateData.readArticles)) {
          // Fusionner avec readArticles pour ne jamais effacer des clics récents
          stateData.readArticles.forEach(link => this.readArticles.add(link));
          localStorage.setItem('devhub_rss_read_articles', JSON.stringify([...this.readArticles]));
        }
        if (stateData.deletedArticles && Array.isArray(stateData.deletedArticles)) {
          stateData.deletedArticles.forEach(link => this.deletedArticles.add(link));
          localStorage.setItem('devhub_rss_deleted_articles', JSON.stringify([...this.deletedArticles]));
        }
      }
    } catch (err) {
      console.warn('Sync SQLite RssStore:', err);
    } finally {
      this.notify();
    }
  }

  async fetchUnified(forceRefresh = false) {
    if (this.isLoading) return this.masterArticles;

    // Cache mémoire de 90 secondes si non forcé
    if (!forceRefresh && this.masterArticles.length > 0 && (Date.now() - this.lastFetched < 90_000)) {
      return this.masterArticles;
    }

    this.isLoading = true;
    try {
      const res = await fetch('/api/watch/unified');
      if (!res.ok) throw new Error('Erreur flux unifié');
      const data = await res.json();
      const items = (data.items || []).slice().sort((a, b) => this.getArticleTimestamp(b) - this.getArticleTimestamp(a));

      this.masterArticles = items;
      this.lastFetched = Date.now();
      this.isLoaded = true;

      // Mettre en cache local pour démarrage instantané
      try {
        localStorage.setItem('devhub_rss_master_cache', JSON.stringify(items.slice(0, 100)));
      } catch {}

      this.notify();
      return this.masterArticles;
    } catch (err) {
      console.error('Erreur fetchUnified RssStore:', err);
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  // --- Sélecteurs et Calculs de Métriques ---

  getActiveMasterArticles() {
    return (this.masterArticles || [])
      .filter(a => a && a.link && !this.deletedArticles.has(a.link))
      .sort((a, b) => this.getArticleTimestamp(b) - this.getArticleTimestamp(a));
  }

  getGlobalUnreadArticles() {
    return this.getActiveMasterArticles().filter(a => !this.readArticles.has(a.link));
  }

  getGlobalUnreadCount() {
    return this.getGlobalUnreadArticles().length;
  }

  getGlobalTotalCount() {
    return this.getActiveMasterArticles().length;
  }

  getUnreadCountForKeyword(keyword) {
    if (!keyword || !this.masterArticles || this.masterArticles.length === 0) return 0;
    const clean = keyword.toLowerCase().trim();
    const items = this.masterArticles.filter(a => {
      const kw = (a.watchKeyword || '').toLowerCase().trim();
      return kw === clean || (a.type === 'watch' && kw.includes(clean));
    });
    return items.filter(a => !this.deletedArticles.has(a.link) && !this.readArticles.has(a.link)).length;
  }

  getUnreadCountForFeed(feed) {
    if (!feed || !this.masterArticles || this.masterArticles.length === 0) return 0;
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

  // --- Mutations d'état et Persistance ---

  setArticleRead(link, isRead = true) {
    if (!link) return;
    if (isRead) {
      this.readArticles.add(link);
    } else {
      this.readArticles.delete(link);
    }

    localStorage.setItem('devhub_rss_read_articles', JSON.stringify([...this.readArticles]));
    this.notify();

    // Persistance asynchrone SQLite (sans rafraîchir en retour pour éviter les écrasements)
    fetch('/api/rss/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link, isRead })
    }).catch(e => console.warn('Erreur setArticleRead serveur:', e));
  }

  markMultipleArticlesRead(links) {
    if (!Array.isArray(links) || links.length === 0) return;
    links.forEach(l => {
      if (l) this.readArticles.add(l);
    });

    localStorage.setItem('devhub_rss_read_articles', JSON.stringify([...this.readArticles]));
    this.notify();

    fetch('/api/rss/read-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links })
    }).catch(e => console.warn('Erreur markMultipleArticlesRead serveur:', e));
  }

  deleteArticle(link) {
    if (!link) return;
    this.deletedArticles.add(link);
    localStorage.setItem('devhub_rss_deleted_articles', JSON.stringify([...this.deletedArticles]));
    this.notify();

    fetch('/api/rss/delete-article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link })
    }).catch(e => console.warn('Erreur deleteArticle serveur:', e));
  }

  restoreDeletedArticles() {
    this.deletedArticles.clear();
    localStorage.setItem('devhub_rss_deleted_articles', JSON.stringify([]));
    this.notify();

    fetch('/api/rss/restore-articles', { method: 'POST' })
      .catch(e => console.warn('Erreur restoreDeletedArticles serveur:', e));
  }

  async addFeed(name, url) {
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
    } catch (e) {
      console.warn('Erreur addFeed:', e);
    }
    await this.fetchUnified(true);
  }

  async deleteFeed(feedId) {
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
    this.notify();
  }

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
    } catch (e) {
      console.warn('Erreur addWatchKeyword:', e);
    }
    await this.fetchUnified(true);
  }

  async deleteWatchKeyword(id) {
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
    this.notify();
  }

  async resetDefaultAll() {
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
    await this.fetchUnified(true);
  }
}

// Instance globale unique
window.rssStore = new RssStore();
