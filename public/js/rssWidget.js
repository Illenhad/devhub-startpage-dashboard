/**
 * Widget Synthèse Veille & Flux RSS pour la page d'accueil (Synchronisé avec RssStore)
 */

class RssWidget {
  constructor() {
    this.badgeEl = document.getElementById('dash-rss-badge');
    this.navBadgeEl = document.getElementById('nav-rss-badge');
    this.contentEl = document.getElementById('dash-rss-content');
    this.refreshBtn = document.getElementById('dash-rss-refresh-btn');

    this.bindEvents();

    // S'abonner aux changements du store central pour un rafraîchissement 100% réactif
    if (window.rssStore) {
      window.rssStore.subscribe(() => this.updateUI());
    }

    this.loadUnreadCount();
  }

  bindEvents() {
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.loadUnreadCount(true));
    }

    // Mise à jour lors du focus sur la fenêtre si le store a plus de 5 minutes
    window.addEventListener('focus', () => {
      if (window.rssStore && (Date.now() - window.rssStore.lastFetched > 300_000)) {
        this.loadUnreadCount(false);
      } else {
        this.updateUI();
      }
    });
  }

  async loadUnreadCount(isManual = false) {
    if (isManual && this.refreshBtn) {
      const icon = this.refreshBtn.querySelector('svg') || this.refreshBtn;
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 600);
    }

    // Rendu immédiat à partir du cache local
    this.updateUI();

    if (window.rssStore) {
      try {
        await window.rssStore.fetchUnified(isManual);
      } catch (err) {
        console.warn('Erreur chargement RssStore depuis RssWidget:', err);
      }
    }

    this.updateUI();
  }

  updateUI() {
    if (!window.rssStore) return;

    const unreadCount = window.rssStore.getGlobalUnreadCount();
    const totalCount = window.rssStore.getGlobalTotalCount();
    const activeArticles = window.rssStore.getActiveMasterArticles();
    const unreadArticles = window.rssStore.getGlobalUnreadArticles();
    const latestItem = unreadArticles[0] || activeArticles[0] || null;

    const feedCount = window.rssStore.feeds?.length || 3;
    const kwCount = window.rssStore.watchKeywords?.length || 4;

    this.render({
      unreadCount,
      totalCount,
      feedCount,
      kwCount,
      latestItem
    });
  }

  render({ unreadCount, totalCount, feedCount, kwCount, latestItem }) {
    // 1. Badge dans l'en-tête de carte du Dashboard
    if (this.badgeEl) {
      if (unreadCount > 0) {
        this.badgeEl.className = 'text-[9px] font-mono px-1.5 py-0.5 rounded-full notif-badge-soft font-bold';
        this.badgeEl.textContent = `${unreadCount} non lu${unreadCount > 1 ? 's' : ''}`;
      } else {
        this.badgeEl.className = 'text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-semibold';
        this.badgeEl.textContent = 'À jour';
      }
    }

    // 2. Badge dans l'onglet de navigation haut ("Veille Tech")
    if (this.navBadgeEl) {
      if (unreadCount > 0) {
        this.navBadgeEl.className = 'px-1.5 py-0.5 rounded-full notif-badge-solid text-[9px] font-extrabold font-mono shadow-sm';
        this.navBadgeEl.textContent = unreadCount > 99 ? '99+' : unreadCount;
      } else {
        this.navBadgeEl.className = 'hidden';
      }
    }

    // 3. Titre du document navigateur
    const baseTitle = "Dev Hub — Page d'Accueil & Contrôle";
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) Dev Hub`;
    } else {
      document.title = baseTitle;
    }

    // 4. Rendu de la carte du Dashboard
    if (this.contentEl) {
      const isWatch = latestItem?.type === 'watch' || latestItem?.watchKeyword;

      this.contentEl.innerHTML = `
        <div class="space-y-3 flex-1 flex flex-col justify-between">
          <!-- Compteurs -->
          <div class="grid grid-cols-2 gap-2 text-center">
            <div class="p-2.5 rounded-2xl ${unreadCount > 0 ? 'notif-box-soft' : 'bg-zinc-900/70 border border-zinc-800'} flex flex-col justify-between">
              <span class="text-[9px] ${unreadCount > 0 ? 'notif-text-accent font-semibold' : 'text-zinc-400 font-medium'} uppercase">Non lus</span>
              <span class="font-mono text-xl font-black ${unreadCount > 0 ? 'notif-text-accent' : 'text-zinc-300'} my-0.5">${unreadCount}</span>
              <span class="text-[9px] ${unreadCount > 0 ? 'notif-text-accent opacity-80 font-medium' : 'text-zinc-500'}">sur ${totalCount} articles</span>
            </div>

            <div class="p-2.5 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col justify-between">
              <span class="text-[9px] text-zinc-400 uppercase font-medium">Surveillance</span>
              <span class="font-mono text-xl font-black text-white my-0.5">${feedCount + kwCount}</span>
              <span class="text-[9px] text-zinc-500 truncate">${feedCount} flux • ${kwCount} sujets</span>
            </div>
          </div>

          <!-- Dernier article non lu (1 ligne compacte) -->
          ${latestItem ? `
            <div 
              onclick="document.querySelector('[data-tab-target=\\'rss\\']')?.click()"
              class="p-2 rounded-xl bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/60 notif-card-hover transition-all cursor-pointer group flex items-center justify-between gap-2"
              title="${latestItem.title || ''}"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-amber-400 text-xs shrink-0">${isWatch ? '🎯' : '⚡'}</span>
                <span class="text-[11px] font-medium text-zinc-300 group-hover:text-amber-300 truncate">
                  ${latestItem.title || ''}
                </span>
              </div>
              <span class="text-[9px] text-zinc-500 shrink-0 font-mono">${latestItem.date || ''}</span>
            </div>
          ` : `
            <div class="p-2 rounded-xl bg-zinc-900/40 border border-zinc-800/60 text-center text-[10px] text-zinc-500">
              Tous les articles et veilles sont à jour
            </div>
          `}

          <!-- Bouton Ouvrir Lecteur RSS & Veille -->
          <button
            onclick="document.querySelector('[data-tab-target=\\'rss\\']')?.click()"
            class="w-full py-2 px-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-zinc-300 hover:text-white flex items-center justify-between transition-all group shadow-sm"
          >
            <span class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z"/></svg>
              <span>Ouvrir Veille & RSS</span>
            </span>
            <svg class="w-3.5 h-3.5 text-zinc-500 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      `;
    }
  }

  renderOffline() {
    if (this.badgeEl) {
      this.badgeEl.textContent = '--';
    }
    if (this.contentEl) {
      this.contentEl.innerHTML = `
        <div class="py-4 px-3 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/60 space-y-2">
          <p class="text-xs font-bold text-zinc-300">Veille & Flux RSS</p>
          <p class="text-[10px] text-zinc-500">Cliquez pour ouvrir la veille.</p>
          <button
            onclick="document.querySelector('[data-tab-target=\\'rss\\']')?.click()"
            class="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 font-semibold"
          >
            Ouvrir
          </button>
        </div>
      `;
    }
  }
}

window.RssWidget = RssWidget;
