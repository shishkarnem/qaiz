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
