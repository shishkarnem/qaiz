export interface TgMediaItem {
  type: 'photo' | 'video' | string;
  url?: string;
  posterUrl?: string;
  caption?: string;
  width?: number;
  height?: number;
  tooLarge?: boolean;
  postUrl?: string;
  fileSize?: number;
}

export interface TgButtonItem {
  text: string;
  url: string;
  isTelegramFallback?: boolean;
}

export interface TgCollapseData {
  markdown: string;
  summary?: string;
  credit?: string;
  isOpen?: boolean;
}

export const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

export function isVideoMediaUrl(url?: string | null): boolean {
  const clean = String(url || '').trim();
  if (!clean) return false;
  return VIDEO_EXT_RE.test(clean);
}

/**
 * Allows only safe URL schemes: https:, http:, mailto:, tel:, tg:, or relative /...
 * Blocks javascript:, data:, vbscript:, etc.
 */
export function sanitizeBlogUrl(raw?: string | null): string {
  const val = String(raw || '').trim();
  if (!val) return '';

  if (val.startsWith('/') && !val.startsWith('//')) {
    return val;
  }

  const lower = val.toLowerCase();
  if (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('tg://')
  ) {
    try {
      if (lower.startsWith('http://') || lower.startsWith('https://')) {
        const parsed = new URL(val);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return parsed.toString();
        }
        return '';
      }
      return val;
    } catch {
      return '';
    }
  }

  return '';
}

const KNOWN_ACRONYMS = new Set([
  'AI',
  'SAV',
  'CRM',
  'API',
  'PDF',
  'GPT',
  'LLM',
  'SEO',
  'RSS',
  'URL',
  'SQL',
  'UI',
  'UX',
  'TG',
  'SI',
  'IT',
  'HR',
  'PR',
  'ROI',
  'B2B',
  'B2C',
  'VPN',
  'SDK',
  'HTML',
  'CSS',
  'JSON',
  'XML',
  'ЧГК',
  'ИИ',
  'РФ',
  'ТЗ',
  'ЦРМ',
]);

/**
 * Normalizes pure ALL-CAPS external strings (e.g. Telegram headlines) into readable
 * sentence case without modifying mixed-case headlines or short acronyms.
 */
export function normalizeDisplayCaps(text?: string | null): string {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const letters = raw.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if (letters.length < 10) return raw;

  const hasLowercase = /[a-zа-яё]/.test(raw);
  if (hasLowercase) return raw;

  let isSentenceStart = true;
  const tokens = raw.split(/(\s+)/);

  return tokens
    .map((token) => {
      if (!token || /^\s+$/.test(token)) return token;

      const cleanWord = token.replace(/^[^A-Za-zА-Яа-яЁё0-9]+|[^A-Za-zА-Яа-яЁё0-9]+$/g, '');
      if (cleanWord && KNOWN_ACRONYMS.has(cleanWord.toUpperCase())) {
        if (/[.!?…]$/.test(token)) {
          isSentenceStart = true;
        } else {
          isSentenceStart = false;
        }
        return token;
      }

      let result = token.toLowerCase();
      if (isSentenceStart) {
        result = result.replace(/[a-zа-яё]/, (ch) => ch.toUpperCase());
        isSentenceStart = false;
      }

      if (/[.!?…]$/.test(token)) {
        isSentenceStart = true;
      }

      return result;
    })
    .join('');
}

export function hasLeadingArticleMedia(content?: string | null): boolean {
  const raw = String(content || '');
  if (!raw.trim()) return false;

  const visibleBody = raw
    .replace(/```tg-collapse[\s\S]*?```/gi, '')
    .replace(/```tg-buttons[\s\S]*?```/gi, '')
    .trim();

  if (!visibleBody) return false;

  // Immediate media fence or image at the very start of the body
  if (/^(?:!\[[^\]]*\]\([^)]+\)|<figure\b[^>]*>[\s\S]*?<img\b|<img\b[^>]*\bsrc\s*=|```tg-gallery\b|```tg-video\b)/i.test(visibleBody)) {
    return true;
  }

  // Check lines before the first substantial non-heading prose paragraph
  const lines = visibleBody.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^---+$/.test(line)) continue;
    if (/^#{1,6}\s+/.test(line)) continue;
    if (/^(?:!\[[^\]]*\]\([^)]+\)|<figure\b[^>]*>.*<img\b|<img\b[^>]*\bsrc\s*=|```tg-gallery\b|```tg-video\b)/i.test(line)) {
      return true;
    }
    // Reached first prose paragraph before any media -> hero cover is not at top
    return false;
  }

  return false;
}

export function hasInlineArticleMedia(content?: string | null): boolean {
  return hasLeadingArticleMedia(content);
}

export function parseTgMediaJson(rawMediaJson: unknown): TgMediaItem[] {
  if (!rawMediaJson) return [];
  let parsed: unknown = rawMediaJson;
  if (typeof rawMediaJson === 'string') {
    const trimmed = rawMediaJson.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is TgMediaItem => {
    if (!item || typeof item !== 'object') return false;
    const url = sanitizeBlogUrl((item as TgMediaItem).url);
    const postUrl = sanitizeBlogUrl((item as TgMediaItem).postUrl);
    return Boolean(url || ((item as TgMediaItem).tooLarge && postUrl));
  });
}

export function resolveArticleFallbackMedia(post: any): TgMediaItem[] {
  if (!post || hasLeadingArticleMedia(post.content)) {
    return [];
  }

  const telegramPostUrl = sanitizeBlogUrl(post.telegram_post_url || post.source_url);
  const mediaItems = parseTgMediaJson(post.media_json);
  if (mediaItems.length > 0) {
    return mediaItems;
  }

  const coverVideoUrl = sanitizeBlogUrl(post.cover_video_url);
  const rawCoverImg = sanitizeBlogUrl(post.cover_image_url || post.image_url);
  const coverImageUrl = rawCoverImg && !isVideoMediaUrl(rawCoverImg) ? rawCoverImg : '';

  if (coverVideoUrl) {
    return [
      {
        type: 'video',
        url: coverVideoUrl,
        posterUrl: coverImageUrl || undefined,
        postUrl: telegramPostUrl || undefined,
      },
    ];
  }

  if (coverImageUrl) {
    return [
      {
        type: 'photo',
        url: coverImageUrl,
        postUrl: telegramPostUrl || undefined,
      },
    ];
  }

  return [];
}

