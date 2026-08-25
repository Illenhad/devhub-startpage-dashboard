/**
 * Service RSS / Atom pour la récupération et l'analyse de flux d'actualités
 */

// Cache en mémoire (TTL: 5 minutes)
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Limite maximale d'âge des articles (1 semaine max)
export const MAX_ARTICLE_AGE_DAYS = 7;
export const MAX_ARTICLE_AGE_MS = MAX_ARTICLE_AGE_DAYS * 24 * 60 * 60 * 1000;

// Flux prédéfinis par défaut (avec Korben feedfull)
export const DEFAULT_FEEDS = [
  {
    id: 'korben',
    name: 'Korben.info (Complet)',
    url: 'https://korben.info/feedfull',
    category: 'Tech, Hacks & Outils',
    icon: '⚡',
    description: 'Les articles complets de Korben : actus tech, sécurité, astuces et IA.'
  },
  {
    id: 'hackernews',
    name: 'Hacker News (Top)',
    url: 'https://news.ycombinator.com/rss',
    category: 'Développement & Startups',
    icon: '🔶',
    description: 'Actualités incontournables de la communauté tech mondiale.'
  },
  {
    id: 'lemonde-pixels',
    name: 'Le Monde — Pixels',
    url: 'https://www.lemonde.fr/pixels/rss_full.xml',
    category: 'Société & Culture Numérique',
    icon: '🌍',
    description: 'Décryptages des technologies et du numérique par Le Monde.'
  }
];

/**
 * Décode les entités HTML courantes
 */
export function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8230;/g, '…')
    .replace(/&amp;/g, '&');
}

/**
 * Résout les URLs relatives des images et des liens vers l'URL absolue du domaine source
 */
export function resolveRelativeUrls(html, baseUrl) {
  if (!html || !baseUrl) return html || '';
  
  let origin = '';
  try {
    const u = new URL(baseUrl);
    origin = u.origin;
  } catch {
    origin = baseUrl;
  }

  // 1. Remplacer les images relatives <img ... src="/chemin.ext" ...>
  let resolved = html.replace(/<img([^>]*?)src=["'](\/[^"']+)["']([^>]*?)>/gi, (match, before, path, after) => {
    return `<img${before}src="${origin}${path}" referrerpolicy="no-referrer" loading="lazy"${after}>`;
  });

  // 2. Remplacer les liens relatifs <a ... href="/chemin.ext" ...>
  resolved = resolved.replace(/<a([^>]*?)href=["'](\/[^"']+)["']([^>]*?)>/gi, (match, before, path, after) => {
    return `<a${before}href="${origin}${path}" target="_blank" rel="noopener noreferrer"${after}>`;
  });

  return resolved;
}

/**
 * Nettoie les balises HTML et les entités pour un extrait propre
 */
function cleanExcerpt(html, maxLength = 220) {
  if (!html) return '';
  const decoded = decodeHtmlEntities(html);
  let text = decoded
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > maxLength) {
    return text.slice(0, maxLength).trim() + '...';
  }
  return text;
}

/**
 * Parse une date sous forme de timestamp précis (en millisecondes)
 */
export function parseTimestamp(dateStr) {
  if (!dateStr) return 0;
  try {
    const d = new Date(dateStr);
    const time = d.getTime();
    if (!isNaN(time)) return time;

    // Gestion des dates au format français si nécessaire
    const monthsFr = {
      janvier: 'January', janv: 'Jan',
      'février': 'February', fevrier: 'February', 'févr': 'Feb', fevr: 'Feb',
      mars: 'March',
      avril: 'April', avr: 'Apr',
      mai: 'May',
      juin: 'June',
      juillet: 'July', juil: 'Jul',
      'août': 'August', aout: 'August',
      septembre: 'September', sept: 'Sep',
      octobre: 'October', oct: 'Oct',
      novembre: 'November', nov: 'Nov',
      'décembre': 'December', decembre: 'December', 'déc': 'Dec', dec: 'Dec'
    };
    let normalized = dateStr;
    for (const [fr, en] of Object.entries(monthsFr)) {
      normalized = normalized.replace(new RegExp(fr, 'gi'), en);
    }
    const dNorm = new Date(normalized);
    if (!isNaN(dNorm.getTime())) return dNorm.getTime();
  } catch {}
  return 0;
}

/**
 * Formate une date au format français relatif ou lisible
 */
export function formatDate(dateStr) {
  try {
    const timestamp = parseTimestamp(dateStr);
    if (!timestamp) return dateStr || '';

    const d = new Date(timestamp);
    const now = new Date();
    const diffMs = now - d;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      return `il y a ${diffMins} min`;
    } else if (diffHours < 24) {
      return `il y a ${diffHours} h`;
    } else if (diffDays === 1) {
      return 'Hier';
    } else if (diffDays < 7) {
      return `il y a ${diffDays} jours`;
    }

    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr || '';
  }
}

/**
 * Analyse une chaîne XML RSS ou Atom (limité par défaut aux 7 derniers jours)
 */
export function parseRSSXml(xml, fallbackUrl = '', maxAgeDays = MAX_ARTICLE_AGE_DAYS) {
  // Déterminer l'origine du flux
  let origin = '';
  try {
    const u = new URL(fallbackUrl);
    origin = u.origin;
  } catch {
    origin = fallbackUrl;
  }

  const maxAgeMs = maxAgeDays > 0 ? maxAgeDays * 24 * 60 * 60 * 1000 : Infinity;
  const cutoffTimestamp = Date.now() - maxAgeMs;

  // 1. Titre du Channel
  const channelTitleMatch = xml.match(/<channel>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) ||
                            xml.match(/<feed[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
  const feedTitle = channelTitleMatch ? decodeHtmlEntities(channelTitleMatch[1].trim()) : 'Flux RSS';

  // Description du Channel
  const channelDescMatch = xml.match(/<channel>[\s\S]*?<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) ||
                            xml.match(/<feed[\s\S]*?<subtitle>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/subtitle>/i);
  const feedDescription = channelDescMatch ? cleanExcerpt(channelDescMatch[1], 150) : '';

  // Lien du Channel
  const channelLinkMatch = xml.match(/<channel>[\s\S]*?<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) ||
                            xml.match(/<feed[\s\S]*?<link[^>]+href="([^"]+)"/i);
  const feedLink = channelLinkMatch ? channelLinkMatch[1].trim() : fallbackUrl;

  // 2. Extraction des Items (RSS) ou Entries (Atom)
  const isAtom = /<feed[\s\S]*?xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/i.test(xml);
  const itemBlocks = isAtom
    ? (xml.match(/<entry[\s\S]*?<\/entry>/gi) || [])
    : (xml.match(/<item[\s\S]*?<\/item>/gi) || []);

  const items = [];

  for (const block of itemBlocks) {
    // Date
    const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) ||
                      block.match(/<published>([\s\S]*?)<\/published>/i) ||
                      block.match(/<updated>([\s\S]*?)<\/updated>/i) ||
                      block.match(/<dc:date>([\s\S]*?)<\/dc:date>/i);
    const rawDate = dateMatch ? dateMatch[1].trim() : '';
    const timestamp = parseTimestamp(rawDate);
    const formattedDate = formatDate(rawDate);

    // Ignorer les articles datant de plus de 7 jours (1 semaine max)
    if (timestamp && timestamp > 0 && timestamp < cutoffTimestamp) {
      continue;
    }

    // Titre
    const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]).trim() : 'Sans titre';

    // Lien
    let link = '';
    const linkMatch = block.match(/<link[^>]+href="([^"]+)"/i) || block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    if (linkMatch) link = linkMatch[1].replace(/&amp;/g, '&').trim();

    // Auteur
    const authorMatch = block.match(/<dc:creator>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/dc:creator>/i) ||
                        block.match(/<author>[\s\S]*?<name>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/name>/i) ||
                        block.match(/<author>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/author>/i);
    const author = authorMatch ? decodeHtmlEntities(authorMatch[1]).trim() : '';

    // Description / Contenu
    const contentMatch = block.match(/<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i) ||
                         block.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i) ||
                         block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) ||
                         block.match(/<summary>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
    const rawContent = contentMatch ? contentMatch[1] : '';
    const decodedFullContent = decodeHtmlEntities(rawContent);
    
    // Résoudre toutes les URLs relatives d'images et de liens vers le domaine source
    const resolvedContent = resolveRelativeUrls(decodedFullContent, fallbackUrl);
    const excerpt = cleanExcerpt(rawContent, 220);

    // Image / Thumbnail
    let image = '';
    const mediaThumbMatch = block.match(/<media:thumbnail[^>]+url="([^"]+)"/i) ||
                            block.match(/<media:content[^>]+url="([^"]+)"[^>]*medium="image"/i) ||
                            block.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i) ||
                            resolvedContent.match(/<img[^>]+src="([^">]+\.(?:jpg|jpeg|png|webp|gif|svg|avif)(?:\?[^">]*)?)"/i) ||
                            resolvedContent.match(/<img[^>]+src="([^">]+)"/i);
    if (mediaThumbMatch) {
      image = mediaThumbMatch[1].replace(/&amp;/g, '&');
    }

    if (image && image.startsWith('/')) {
      image = `${origin}${image}`;
    }

    // Catégories
    const categoryMatches = [...block.matchAll(/<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi)];
    const categories = categoryMatches
      .map(m => decodeHtmlEntities(m[1].replace(/<[^>]+>/g, '')).trim())
      .filter(c => c.length > 0 && c.length < 30)
      .slice(0, 3);

    items.push({
      title,
      link,
      rawDate,
      timestamp,
      date: formattedDate,
      author,
      excerpt,
      content: resolvedContent,
      image,
      categories
    });
  }

  // Tri rigoureux par date décroissante (plus récent au plus ancien)
  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return {
    title: feedTitle,
    description: feedDescription,
    link: feedLink,
    feedUrl: fallbackUrl,
    items,
    itemCount: items.length,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Récupère et met en cache un flux RSS
 */
export async function fetchRSSFeed(feedUrl) {
  if (!feedUrl) throw new Error('URL du flux requise');

  // Vérification du Cache
  const cached = cache.get(feedUrl);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return { ...cached.data, fromCache: true };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 DevHub/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, text/html'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Échec HTTP ${res.status}: ${res.statusText}`);
    }

    const xml = await res.text();
    const parsed = parseRSSXml(xml, feedUrl);

    // Mettre en cache
    cache.set(feedUrl, {
      data: parsed,
      timestamp: Date.now()
    });

    return parsed;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`Erreur fetchRSSFeed (${feedUrl}):`, err.message);
    throw err;
  }
}

export default {
  DEFAULT_FEEDS,
  parseTimestamp,
  formatDate,
  decodeHtmlEntities,
  resolveRelativeUrls,
  parseRSSXml,
  fetchRSSFeed
};
