import { fetchRSSFeed, MAX_ARTICLE_AGE_DAYS, MAX_ARTICLE_AGE_MS } from './rssService.js';
import { getRssFeeds, getWatchKeywords, cleanupOldReadArticles } from './dbService.js';

// Cache des flux de veille (TTL: 10 minutes)
const watchCache = new Map();
const WATCH_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Récupère les actualités fraîches pour un mot-clé donné via Google News RSS FR (7 derniers jours max)
 */
export async function fetchKeywordNews(keyword) {
  if (!keyword || !keyword.trim()) return { items: [] };

  const cleanKeyword = keyword.trim();
  const cacheKey = `kw_${cleanKeyword.toLowerCase()}`;

  const cached = watchCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < WATCH_CACHE_TTL_MS)) {
    return { ...cached.data, fromCache: true };
  }

  // Requête Google News limitée à la dernière semaine (when:7d)
  const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanKeyword + ' when:7d')}&hl=fr&gl=FR&ceid=FR:fr`;

  try {
    const rawData = await fetchRSSFeed(searchUrl);
    const rawItems = rawData.items || [];
    const cutoff = Date.now() - MAX_ARTICLE_AGE_MS;

    // Nettoyer, filtrer (7 jours max) et enrichir les articles de veille
    const items = rawItems
      .filter(item => !item.timestamp || item.timestamp >= cutoff)
      .map(item => {
      let title = item.title || '';
      let author = item.author || '';

      // Extraction propre de la source dans le titre (ex: "Titre de la news - Nom Du Média")
      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        if (parts.length >= 2) {
          const source = parts.pop().trim();
          if (!author) author = source;
          title = parts.join(' - ').trim();
        }
      }

      return {
        ...item,
        title,
        author: author || 'Actualité Tech',
        type: 'watch',
        watchKeyword: cleanKeyword,
        feedName: `Veille: ${cleanKeyword}`,
        feedIcon: '🎯',
        feedCategory: 'Veille'
      };
    });

    // Tri par date la plus récente
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const result = {
      keyword: cleanKeyword,
      title: `Veille sur "${cleanKeyword}"`,
      description: `Actualités en direct pour le mot-clé "${cleanKeyword}"`,
      feedUrl: searchUrl,
      items,
      itemCount: items.length,
      updatedAt: new Date().toISOString()
    };

    watchCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return result;
  } catch (err) {
    console.error(`Erreur veille mot-clé (${cleanKeyword}):`, err.message);
    throw err;
  }
}

/**
 * Récupère l'ensemble des articles agrégés : Tous les flux RSS suivis + Tous les mots-clés de veille
 */
export async function getUnifiedNewsFeed() {
  cleanupOldReadArticles(1);
  const feeds = getRssFeeds() || [];
  const keywords = (getWatchKeywords() || []).filter(k => k.enabled);

  const fetchPromises = [];

  // 1. Récupérer les flux RSS
  for (const feed of feeds) {
    fetchPromises.push(
      fetchRSSFeed(feed.url)
        .then(data => (data.items || []).map(item => ({
          ...item,
          type: 'rss',
          feedId: feed.id,
          feedName: feed.name,
          feedIcon: feed.icon || '📰',
          feedCategory: feed.category || 'Flux RSS'
        })))
        .catch(err => {
          console.warn(`[UnifiedFeed] Impossible de charger ${feed.name}:`, err.message);
          return [];
        })
    );
  }

  // 2. Récupérer les mots-clés de veille
  for (const kw of keywords) {
    fetchPromises.push(
      fetchKeywordNews(kw.keyword)
        .then(data => data.items || [])
        .catch(err => {
          console.warn(`[UnifiedFeed] Impossible de charger le mot-clé ${kw.keyword}:`, err.message);
          return [];
        })
    );
  }

  const results = await Promise.allSettled(fetchPromises);
  const allArticles = [];
  const seenLinks = new Set();
  const seenTitles = new Set();
  const cutoff = Date.now() - MAX_ARTICLE_AGE_MS;

  for (const res of results) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      for (const item of res.value) {
        if (!item || !item.link) continue;
        
        // Filtrer les articles de plus de 7 jours (1 semaine max)
        if (item.timestamp && item.timestamp < cutoff) continue;

        // Déduplication par lien
        if (seenLinks.has(item.link)) continue;
        seenLinks.add(item.link);

        // Déduplication par similarité de titre court
        const normTitle = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
        if (normTitle && seenTitles.has(normTitle)) continue;
        if (normTitle) seenTitles.add(normTitle);

        allArticles.push(item);
      }
    }
  }

  // Trier par date la plus récente
  allArticles.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return {
    title: 'Veille & Flux RSS Réunis',
    description: `Flux unifié des 7 derniers jours comprenant ${feeds.length} flux RSS et ${keywords.length} sujets de veille surveillés`,
    totalFeeds: feeds.length,
    totalKeywords: keywords.length,
    itemCount: allArticles.length,
    items: allArticles,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Démarre le robot d'exploration périodique en arrière-plan pour maintenir la veille fraîche
 */
export function startPeriodicCrawler(intervalMinutes = 15) {
  const crawl = async () => {
    try {
      console.log('🔄 [Veille] Actualisation automatique des flux et mots-clés...');
      await getUnifiedNewsFeed();
      console.log('✅ [Veille] Actualisation terminée avec succès.');
    } catch (err) {
      console.warn('⚠️ [Veille] Erreur crawler:', err.message);
    }
  };

  // Premier crawl différé de 10s pour ne pas bloquer le démarrage
  setTimeout(crawl, 10000);

  // Intervalle régulier
  setInterval(crawl, intervalMinutes * 60 * 1000);
}

export default {
  fetchKeywordNews,
  getUnifiedNewsFeed,
  startPeriodicCrawler
};
