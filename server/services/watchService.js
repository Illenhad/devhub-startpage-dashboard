import { fetchRSSFeed, MAX_ARTICLE_AGE_DAYS, MAX_ARTICLE_AGE_MS } from './rssService.js';
import { getRssFeeds, getWatchKeywords, cleanupOldReadArticles } from './dbService.js';

// Cache des flux de veille (TTL: 10 minutes)
const watchCache = new Map();
const WATCH_CACHE_TTL_MS = 10 * 60 * 1000;

// Cache des métadonnées et images d'articles résolus (TTL: 24 heures)
const articleMetadataCache = new Map();
const ARTICLE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Extrait le contenu éditorial propre d'un article HTML (Mode Lecteur)
 */
export function extractCleanArticleContent(html, baseUrl = '') {
  if (!html || typeof html !== 'string') return '';

  // 1. Suppression des balises techniques et polluantes
  let clean = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<header\b[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, '')
    .replace(/<form\b[\s\S]*?<\/form>/gi, '')
    .replace(/<dialog\b[\s\S]*?<\/dialog>/gi, '');

  // 2. Recherche robuste du conteneur d'article principal (gestion propre des balises imbriquées)
  const patterns = [
    /<div[^>]+class=["'][^"']*\b(?:entry[-_]content|article[-_]content|post[-_]content|story[-_]body|article__body|content[-_]article|single[-_]content|article[-_]text)\b[^"']*["'][^>]*>/i,
    /<article[^>]+class=["'][^"']*\b(?:single|post|entry)\b[^"']*["'][^>]*>/i,
    /<main[^>]*>/i,
    /<article[^>]*>/i
  ];

  let containerHtml = clean;
  let startIdx = -1;
  let matchLength = 0;
  for (const pattern of patterns) {
    const m = clean.match(pattern);
    if (m && m.index !== undefined) {
      startIdx = m.index;
      matchLength = m[0].length;
      break;
    }
  }

  if (startIdx !== -1) {
    const isArticleTag = clean.slice(startIdx, startIdx + 4).toLowerCase().startsWith('<art');
    const openTag = isArticleTag ? 'article' : (clean.slice(startIdx, startIdx + 5).toLowerCase().startsWith('<main') ? 'main' : 'div');
    let depth = 0;
    const tagRegex = new RegExp(`<\/?${openTag}\\b[^>]*>`, 'gi');
    tagRegex.lastIndex = startIdx;

    let endIdx = clean.length;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(clean)) !== null) {
      const tag = tagMatch[0];
      if (tag.startsWith('</')) {
        depth--;
        if (depth === 0) {
          endIdx = tagMatch.index;
          break;
        }
      } else if (!tag.endsWith('/>')) {
        depth++;
      }
    }
    containerHtml = clean.slice(startIdx + matchLength, endIdx);
  }

  // 3. Extraction ordonnée des éléments éditoriaux
  const elementRegex = /<(p|h2|h3|h4|blockquote|ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi;
  const elements = [];
  let match;

  while ((match = elementRegex.exec(containerHtml)) !== null) {
    const tag = match[1].toLowerCase();
    let inner = match[2].trim();

    // Filtre des paragraphes trop courts ou bannières promotionnelles
    const textOnly = inner.replace(/<[^>]+>/g, '').trim();
    if (textOnly.length < 25 && tag === 'p') continue;
    if (/cookie|partager sur|abonnez-vous|newsletter|lire aussi|publicit|suivez-nous|ajoutez-nous/i.test(textOnly) && textOnly.length < 90) continue;

    // Conserver les balises utiles
    inner = inner.replace(/<(?!\/?(strong|b|em|i|a|code|span)\b)[^>]+>/gi, '');

    if (tag === 'p') {
      elements.push(`<p class="mb-4 text-zinc-200 leading-relaxed text-sm sm:text-base">${inner}</p>`);
    } else if (tag === 'h2') {
      elements.push(`<h2 class="text-base sm:text-lg font-bold text-white mt-6 mb-3">${inner}</h2>`);
    } else if (tag === 'h3') {
      elements.push(`<h3 class="text-sm sm:text-base font-bold text-zinc-100 mt-5 mb-2">${inner}</h3>`);
    } else if (tag === 'blockquote') {
      elements.push(`<blockquote class="border-l-4 border-brand-500 pl-4 py-1.5 italic text-zinc-300 my-4 bg-zinc-950/40 rounded-r-xl">${inner}</blockquote>`);
    } else if (tag === 'ul' || tag === 'ol') {
      elements.push(`<div class="my-3 text-zinc-200 text-sm leading-relaxed">${inner}</div>`);
    }
  }

  return elements.join('\n');
}

/**
 * Décode un lien Google News RSS et extrait l'image d'en-tête (og:image) du média source original
 */
export async function resolveGoogleNewsArticle(googleUrl) {
  if (!googleUrl || typeof googleUrl !== 'string') return null;

  // Cache mémoire instantané
  const cached = articleMetadataCache.get(googleUrl);
  if (cached && (Date.now() - cached.timestamp < ARTICLE_CACHE_TTL_MS)) {
    return cached.data;
  }

  // Si ce n'est pas une URL Google News, rien à décoder
  if (!googleUrl.includes('news.google.com')) {
    return { decodedUrl: googleUrl, image: null, content: null };
  }

  try {
    const urlObj = new URL(googleUrl);
    const pathParts = urlObj.pathname.split('/');
    const base64Str = pathParts[pathParts.length - 1];

    if (!base64Str) return null;

    // 1. Récupération des jetons de signature et horodatage
    const pageRes = await fetch(`https://news.google.com/rss/articles/${base64Str}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(3000)
    });

    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const sigMatch = html.match(/data-n-a-sg="([^"]+)"/);
    const tsMatch = html.match(/data-n-a-ts="([^"]+)"/);

    if (!sigMatch || !tsMatch) return null;

    const signature = sigMatch[1];
    const timestamp = tsMatch[1];

    // 2. Appel batchexecute RPC (Fbv4je) pour obtenir l'URL finale
    const payload = [
      "Fbv4je",
      `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${base64Str}",${timestamp},"${signature}"]`
    ];

    const batchRes = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      body: `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`,
      signal: AbortSignal.timeout(3000)
    });

    if (!batchRes.ok) return null;
    const text = await batchRes.text();
    const parts = text.split("\n\n");
    if (parts.length < 2) return null;

    const parsedData = JSON.parse(parts[1]);
    const innerJson = JSON.parse(parsedData[0][2]);
    const decodedUrl = innerJson[1];

    if (!decodedUrl) return null;

    // 3. Extraction de l'image (OpenGraph / Twitter) et du contenu intégral depuis le site source réel
    let image = null;
    let content = null;
    try {
      const artRes = await fetch(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(3000)
      });

      if (artRes.ok) {
        const artHtml = await artRes.text();
        const ogMatch = artHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                        artHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
                        artHtml.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
        if (ogMatch && ogMatch[1]) {
          image = ogMatch[1].trim();
          if (image.startsWith('/')) {
            const destUrlObj = new URL(decodedUrl);
            image = `${destUrlObj.origin}${image}`;
          }
        }

        // Extraction intégrale de l'article (mode lecteur automatique)
        const extracted = extractCleanArticleContent(artHtml, decodedUrl);
        if (extracted && extracted.length > 100) {
          content = extracted;
        }
      }
    } catch {}

    const result = { decodedUrl, image, content };
    articleMetadataCache.set(googleUrl, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    return null;
  }
}

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

    // Résolution asynchrone en parallèle des images (OpenGraph) et des URLs directes des médias
    const resolvePromises = items.slice(0, 15).map(async (item) => {
      try {
        const meta = await resolveGoogleNewsArticle(item.link);
        if (meta) {
          if (meta.decodedUrl) item.link = meta.decodedUrl;
          if (meta.image) item.image = meta.image;
          if (meta.content) item.content = meta.content;
        }
      } catch {}
    });

    await Promise.allSettled(resolvePromises);

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
  await cleanupOldReadArticles(1);
  const feeds = (await getRssFeeds()) || [];
  const allKeywords = (await getWatchKeywords()) || [];
  const keywords = allKeywords.filter(k => k.enabled);

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
          feedUrl: feed.url,
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
