import { fetchRSSFeed, fetchArticleHtml, extractDirectUrl, decodeHtmlEntities, MAX_ARTICLE_AGE_DAYS, MAX_ARTICLE_AGE_MS } from './rssService.js';
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
      `["garturlreq",[["X","X",["X","X"],null,null,1,1,"FR:fr",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${base64Str}",${timestamp},"${signature}"]`
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
 * Résout les métadonnées (URL directe, OpenGraph image, contenu éditorial) d'un article
 */
export async function resolveArticleMetadata(articleUrl) {
  if (!articleUrl || typeof articleUrl !== 'string') return null;

  const directUrl = extractDirectUrl(articleUrl);
  if (directUrl.includes('news.google.com')) {
    return resolveGoogleNewsArticle(directUrl);
  }

  const cached = articleMetadataCache.get(directUrl);
  if (cached && (Date.now() - cached.timestamp < ARTICLE_CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const artRes = await fetchArticleHtml(directUrl, 3000);

    let image = null;
    let content = null;

    if (artRes.ok) {
      const artHtml = await artRes.text();
      const ogMatch = artHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                      artHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
                      artHtml.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      if (ogMatch && ogMatch[1]) {
        image = ogMatch[1].trim();
        if (image.startsWith('/')) {
          const destUrlObj = new URL(directUrl);
          image = `${destUrlObj.origin}${image}`;
        }
      }

      const extracted = extractCleanArticleContent(artHtml, directUrl);
      if (extracted && extracted.length > 100) {
        content = extracted;
      }
    }

    const result = { decodedUrl: directUrl, image, content };
    articleMetadataCache.set(directUrl, { data: result, timestamp: Date.now() });
    return result;
  } catch {
    return { decodedUrl: directUrl, image: null, content: null };
  }
}

/**
 * Détecte si un titre / extrait d'article est rédigé en langue française
 */
export function isFrenchText(title = '', excerpt = '') {
  const fullText = (title + ' ' + excerpt).trim();
  if (!fullText) return false;
  const str = fullText.toLowerCase();

  // 1. Rejet immédiat si présence de caractères non-français (espagnol, portugais, allemand, cyrillique, etc.)
  // En français : é, è, ê, ë, à, â, ç, î, ï, ô, û, œ, æ, ù (uniquement dans 'où')
  // Caractères étrangers : ó, á, í, ú, ñ, ¿, ¡, ä, ö, ü, ß, å, ø, ã, õ, etc.
  if (/[óáíúñ¿¡äöüßåøãõčćšžłńśźż\u0400-\u04FF\u4E00-\u9FFF\u0600-\u06FF]/i.test(str)) {
    return false;
  }

  // 2. Caractères et contractions typiques de la langue française
  const hasFrenchDiacritics = /[éèêëàâçîïôûœæ]|(\b(d|l|c|qu|j|n|s|m|t)['’])|(\boù\b)/i.test(str);

  // 3. Mots indicateurs d'autres langues (Espagnol, Italien, Allemand, etc.)
  const foreignWords = new Set([
    'cómo','como','para','por','con','del','las','los','una','unos','unas','sus','su','sin','sobre',
    'este','esta','estos','estas','tu','tus','mi','mis','hacer','propio','ordenador','casa','así',
    'nuevo','nueva','nuevos','nuevas','más','pero','todos','todas','centro','datos','computadoras',
    'posible','funciona','programa','precios','instalar','configurar','montar','lenguaje','puede',
    'pueden','desde','entre','hasta','también','tambien','red','pantalla','juegos','ahora',
    'unisce','due','volte','più','veloci','degli','delle','della','dello','hanno','sono','anche',
    'und','der','die','das','nicht','mit','für','auf','eine','einer','einem','einen'
  ]);

  // 4. Mots indicateurs anglais fréquents
  const enWords = new Set([
    'the','and','is','in','to','of','with','for','on','at','by','from','as','that','this','these','those',
    'are','was','were','been','be','have','has','had','will','would','could','should','about','which',
    'their','its','our','what','how','why','when','who','where','review','using','into','after','before',
    'without','against','pools','your','home','gpus','run','agents','twice','fast','free','launches','announces',
    'features','update','release','guide','best','top','new','news','today','first','world','over','more','than',
    'you','all','can','users','desktop','ships','downloads','subscription','annual','revenue','deployment'
  ]);

  // 5. Mots fréquents en français
  const frWords = new Set([
    'le','la','les','un','une','des','du','de','dans','en','pour','sur','avec','ce','cette','ces','cet',
    'qui','que','quoi','dont','où','est','sont','a','ont','au','aux','par','plus','ou','et','mais','donc',
    'car','ni','pas','se','sa','son','ses','leur','leurs','nous','vous','ils','elles','tout','tous','toute',
    'toutes','comme','fait','faire','être','avoir','sans','selon','après','avant','chez','depuis','pendant',
    'vers','nouvel','nouveau','nouvelle','nouveaux','actu','actus','actualité','actualités','guide','comment',
    'pourquoi','quand','quel','quelle','quels','quelles','votre','notre','vos','nos','aussi','bien','très',
    'peu','ici','relie','maison','rapides','deux','fois','partager','réseau','local','locale','bientôt',
    'semaine','mois','année','jours','dernière','prochaine','première','annoncé','dévoile','présente','test',
    'faire','peut','peuvent','toujours','encore','déjà','même','autres','autre','plusieurs','alors','ainsi',
    'surfer','flipper','navigateur','jetable','redémarrer','conteneur','gourmand','véritable','poche'
  ]);

  const words = str.match(/[a-zà-ÿ0-9'’-]+/gi) || [];
  let frScore = 0;
  let enScore = 0;
  let foreignScore = 0;

  if (hasFrenchDiacritics) {
    frScore += 3;
  }

  for (const w of words) {
    const cleanW = w.replace(/['’].*$/, '');
    if (foreignWords.has(w) || foreignWords.has(cleanW)) foreignScore += 3;
    if (enWords.has(w) || enWords.has(cleanW)) enScore += 1.5;
    if (frWords.has(w) || frWords.has(cleanW)) frScore += 1.5;
  }

  if (foreignScore > 0) return false;
  if (enScore > frScore) return false;
  if (frScore > enScore) return true;
  return frScore >= 3;
}

/**
 * Récupère les actualités fraîches francophones pour un mot-clé donné via multi-sources (Bing News FR + Google News FR)
 */
export async function fetchKeywordNews(keyword) {
  if (!keyword || !keyword.trim()) return { items: [] };

  const cleanKeyword = keyword.trim();
  const cacheKey = `kw_${cleanKeyword.toLowerCase()}`;

  const cached = watchCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < WATCH_CACHE_TTL_MS)) {
    return { ...cached.data, fromCache: true };
  }

  const cutoff = Date.now() - MAX_ARTICLE_AGE_MS;

  // URLs multi-sources résilientes ciblées France / Français
  // 1. Bing News RSS FR avec tri par date décroissante
  const bingDateUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(cleanKeyword)}&setlang=fr-FR&mkt=fr-FR&cc=FR&qft=sortbydate%3d"1"&format=rss`;
  // 2. Google News RSS FR avec tri par date (scoring=n)
  const googleFrUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanKeyword)}&hl=fr&gl=FR&ceid=FR:fr&scoring=n`;

  try {
    const fetchSource = async (url) => {
      try {
        const data = await fetchRSSFeed(url);
        return data.items || [];
      } catch (e) {
        return [];
      }
    };

    // Requêtes concurrentes pour une réactivité optimale
    const [bingItems, googleItems] = await Promise.all([
      fetchSource(bingDateUrl),
      fetchSource(googleFrUrl)
    ]);

    let rawItems = [...bingItems, ...googleItems];

    // Repli Bing FR standard si aucun article récent n'a été trouvé par les requêtes datées
    if (rawItems.length === 0) {
      const bingFallbackUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(cleanKeyword)}&setlang=fr-FR&mkt=fr-FR&cc=FR&format=rss`;
      const fallbackItems = await fetchSource(bingFallbackUrl);
      rawItems = fallbackItems;
    }

    // Déduplication intelligente et filtrage des articles francophones (< 7 jours)
    const seenLinks = new Set();
    const seenTitles = new Set();
    const items = [];

    for (const item of rawItems) {
      if (!item || !item.link) continue;
      if (item.timestamp && item.timestamp < cutoff) continue;

      const directLink = extractDirectUrl(item.link);
      item.link = directLink;

      if (seenLinks.has(directLink)) continue;
      seenLinks.add(directLink);

      let title = decodeHtmlEntities(item.title || '');
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

      // Filtrage strict : Ne conserver par défaut que les articles en français
      if (!isFrenchText(title, item.excerpt || '')) {
        continue;
      }

      // Déduplication par similarité de titre court normalisé
      const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 35);
      if (normTitle && seenTitles.has(normTitle)) continue;
      if (normTitle) seenTitles.add(normTitle);

      items.push({
        ...item,
        title,
        author: author || 'Actualité Tech',
        type: 'watch',
        watchKeyword: cleanKeyword,
        feedName: `Veille: ${cleanKeyword}`,
        feedIcon: '🎯',
        feedCategory: 'Veille'
      });
    }

    // Tri par date la plus récente
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Résolution en tâche de fond non bloquante (ne ralentit pas la réponse API)
    setTimeout(() => {
      items.slice(0, 10).forEach(async (item) => {
        try {
          if (item.link && item.link.includes('news.google.com')) {
            const meta = await resolveGoogleNewsArticle(item.link);
            if (meta) {
              if (meta.decodedUrl) item.link = meta.decodedUrl;
              if (meta.image && !item.image) item.image = meta.image;
            }
          } else if (item.link && !item.image) {
            const meta = await resolveArticleMetadata(item.link);
            if (meta && meta.image) item.image = meta.image;
          }
        } catch {}
      });
    }, 50);

    const result = {
      keyword: cleanKeyword,
      title: `Veille sur "${cleanKeyword}"`,
      description: `Actualités en direct pour le mot-clé "${cleanKeyword}"`,
      feedUrl: bingDateUrl,
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


// Cache du flux unifié (TTL: 3 minutes)
let unifiedCache = null;
let unifiedCacheTime = 0;
const UNIFIED_CACHE_TTL_MS = 3 * 60 * 1000;

export function invalidateUnifiedCache() {
  unifiedCache = null;
  unifiedCacheTime = 0;
}

/**
 * Récupère l'ensemble des articles agrégés : Tous les flux RSS suivis + Tous les mots-clés de veille
 */
export async function getUnifiedNewsFeed(forceRefresh = false) {
  if (!forceRefresh && unifiedCache && (Date.now() - unifiedCacheTime < UNIFIED_CACHE_TTL_MS)) {
    return { ...unifiedCache, fromCache: true };
  }

  // Nettoyage asynchrone non bloquant des anciens articles lus
  cleanupOldReadArticles(1).catch(() => {});

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

  const result = {
    title: 'Veille & Flux RSS Réunis',
    description: `Flux unifié des 7 derniers jours comprenant ${feeds.length} flux RSS et ${keywords.length} sujets de veille surveillés`,
    totalFeeds: feeds.length,
    totalKeywords: keywords.length,
    itemCount: allArticles.length,
    items: allArticles,
    updatedAt: new Date().toISOString()
  };

  unifiedCache = result;
  unifiedCacheTime = Date.now();

  return result;
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
  isFrenchText,
  fetchKeywordNews,
  getUnifiedNewsFeed,
  invalidateUnifiedCache,
  startPeriodicCrawler,
  resolveArticleMetadata,
  resolveGoogleNewsArticle
};

