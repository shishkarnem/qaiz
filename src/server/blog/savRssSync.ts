import { XMLParser } from 'fast-xml-parser';
import { getAll, getOne, runSql, generateId } from '../db';
import { invalidatePostsMemoryCache } from './postsMemoryCache';

export const SAV_RSS_DOMAINS = [
  'https://savbot.ru',
  'https://sav-ai.ru',
  'https://aisav.ru',
  'https://ai-greenland.ru',
  'https://aisav.online',
];

const RSS_FETCH_TIMEOUT_MS = 15000;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

export const OLD_SAV_DEFAULT_IMG =
  'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMJH0GOjgMOTE_BA9wETwiCzYmBQ95AyhoBSJLMhgZEyQdKwssKyoEUnQKdGsEfDonABIYETY4NRQmEV9uZlUAaA11VQJrCjgDAzkkAVczLRouDiMXfQxTNBdFGT8aIyw2ZyIcIQsIKjIuHhtsBXZSBGZ5T3FP.png';
export const NEW_SAV_DEFAULT_IMG =
  'https://file.pro-talk.ru/tgf/GTUpJwQ9JCkYKlJzP2IIL1oQCjoETxogKjMQDi9dHDc1dQsFCixmCA0jFUkMFlo-dhssKysQFkQeQj4zeRQiCnQAPCYtCXIiOTkcEyNBEHQHUlkQCgN1PyQuUFJzaVlQbGpXAmN0ByliZnsWMyoNOCEeLTtAMSMWVnRsRxEKZyMCTHIPH2Q-KTkmQFlpYlAHaQZwVAtoe0E.jpg';

export function replaceKnownRssImages(input: string): string {
  if (!input || !input.includes(OLD_SAV_DEFAULT_IMG)) return input;
  return input.split(OLD_SAV_DEFAULT_IMG).join(NEW_SAV_DEFAULT_IMG);
}

let schemaInitialized = false;
let isSyncRunning = false;
let schedulerStarted = false;

export interface SavRssSyncResult {
  success: boolean;
  sourceDomain?: string;
  sourceUrl?: string;
  totalFetched: number;
  added: number;
  updated: number;
  skipped: number;
  errors: number;
  syncedAt: string;
  error?: string;
}

let lastSyncStatus: SavRssSyncResult | null = null;

export function getLastSavRssSyncStatus(): SavRssSyncResult | null {
  return lastSyncStatus;
}

export function sanitizeExternalUrl(rawUrl: unknown): string {
  const val = replaceKnownRssImages(String(rawUrl || '').trim());
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
    return val;
  }
  return '';
}

function isVideoUrl(url: string, mimeType?: string): boolean {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  return VIDEO_EXT_RE.test(url);
}

function isImageUrl(url: string, mimeType?: string): boolean {
  if (!url) return false;
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return !isVideoUrl(url, mimeType);
}

function extractNodeText(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val).trim();
  }
  if (Array.isArray(val)) {
    for (const entry of val) {
      const t = extractNodeText(entry);
      if (t) return t;
    }
    return '';
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, any>;
    if (obj['#cdata'] !== undefined) return String(obj['#cdata']).trim();
    if (obj['#text'] !== undefined) return String(obj['#text']).trim();
    if (obj['@_url'] !== undefined) return String(obj['@_url']).trim();
  }
  return '';
}

function getNamespacedValue(item: Record<string, any>, prefix: string, localName: string): any {
  const exactKey = `${prefix}:${localName}`;
  if (item[exactKey] !== undefined) return item[exactKey];
  const lowerExact = exactKey.toLowerCase();
  const suffix = `:${localName.toLowerCase()}`;
  for (const key of Object.keys(item)) {
    const lk = key.toLowerCase();
    if (lk === lowerExact) return item[key];
    if (prefix === 'sav' && lk.endsWith(suffix)) return item[key];
  }
  return undefined;
}

function slugifyRssTitle(title: string): string {
  const ruToEn: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const base = String(title || '')
    .toLowerCase()
    .split('')
    .map((ch) => (ruToEn[ch] !== undefined ? ruToEn[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 88);
  return base || `article-${Date.now()}`;
}

function stripPlainSummary(raw: string, maxLen = 280): string {
  return String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function parseIsoOrRfcDate(raw: string): string {
  const clean = String(raw || '').trim();
  if (!clean) return new Date().toISOString();
  const dt = new Date(clean);
  if (isNaN(dt.getTime())) return new Date().toISOString();
  return dt.toISOString();
}

export async function ensureBlogRssSchema(): Promise<void> {
  if (schemaInitialized) return;

  const statements = [
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS external_id TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS external_updated_at TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_image_url TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_video_url TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_url TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS telegram_post_url TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS telegram_channel TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS category TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_role TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_json TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS buttons_json TEXT`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_published INTEGER DEFAULT 1`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned INTEGER DEFAULT 0`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_external_id_unique ON posts(external_id) WHERE external_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_posts_pinned ON posts(is_pinned, pinned_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_posts_published_created ON posts(COALESCE(published_at, created_at) DESC)`,
  ];

  for (const sql of statements) {
    await runSql(sql).catch((err) => {
      console.warn('[Blog RSS Schema Warning]:', err?.message || err);
    });
  }

  await runSql(
    `UPDATE posts
     SET image_url = REPLACE(image_url, $1, $2),
         cover_image_url = REPLACE(cover_image_url, $1, $2),
         content = REPLACE(content, $1, $2),
         excerpt = REPLACE(excerpt, $1, $2),
         seo_title = REPLACE(seo_title, $1, $2),
         seo_description = REPLACE(seo_description, $1, $2),
         media_json = REPLACE(media_json, $1, $2),
         buttons_json = REPLACE(buttons_json, $1, $2),
         updated_at = NOW()
     WHERE COALESCE(image_url, '') LIKE $3
        OR COALESCE(cover_image_url, '') LIKE $3
        OR COALESCE(content, '') LIKE $3
        OR COALESCE(excerpt, '') LIKE $3
        OR COALESCE(seo_title, '') LIKE $3
        OR COALESCE(seo_description, '') LIKE $3
        OR COALESCE(media_json, '') LIKE $3
        OR COALESCE(buttons_json, '') LIKE $3`,
    [OLD_SAV_DEFAULT_IMG, NEW_SAV_DEFAULT_IMG, `%${OLD_SAV_DEFAULT_IMG}%`]
  ).catch((err) => {
    console.warn('[Blog RSS Image Replace Warning]:', err?.message || err);
  });

  schemaInitialized = true;
}

async function fetchRssXmlWithFailover(options?: {
  limit?: number;
  category?: string;
}): Promise<{ xml: string; sourceDomain: string; sourceUrl: string }> {
  const limit = Math.max(1, Math.min(200, Number(options?.limit) || 100));
  const queryParts = [`limit=${limit}`];
  if (options?.category && options.category.trim()) {
    queryParts.push(`category=${encodeURIComponent(options.category.trim())}`);
  }
  const qs = queryParts.join('&');
  const attemptErrors: string[] = [];

  for (const domain of SAV_RSS_DOMAINS) {
    for (const feedPath of ['/rss.xml', '/feed.xml']) {
      const targetUrl = `${domain}${feedPath}?${qs}`;
      try {
        const res = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
            'Cache-Control': 'no-cache',
            'User-Agent': 'QaizBlogRssSync/1.0 (+https://qaiz.ru)',
          },
          signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS),
        });

        if (res.status >= 500 || !res.ok) {
          attemptErrors.push(`${targetUrl} -> HTTP ${res.status}`);
          continue;
        }

        const xml = await res.text();
        if (!xml || (!xml.includes('<rss') && !xml.includes('<channel>'))) {
          attemptErrors.push(`${targetUrl} -> Invalid RSS XML`);
          continue;
        }

        return { xml, sourceDomain: domain, sourceUrl: targetUrl };
      } catch (err: any) {
        attemptErrors.push(`${targetUrl} -> ${err?.message || 'Network error'}`);
      }
    }
  }

  throw new Error(`Все источники SAV AI RSS недоступны: ${attemptErrors.slice(0, 4).join('; ')}`);
}

async function resolveUniquePostSlug(desiredSlug: string, externalId: string): Promise<string> {
  const baseSlug = desiredSlug.replace(/[^a-z0-9-_]/gi, '-').replace(/^-+|-+$/g, '').slice(0, 90) || `article-${Date.now()}`;
  const conflict = await getOne<{ id: string; external_id: string | null }>(
    'SELECT id, external_id FROM posts WHERE slug = $1 LIMIT 1',
    [baseSlug]
  );
  if (!conflict || conflict.external_id === externalId) {
    return baseSlug;
  }
  const suffix = externalId.replace(/[^a-z0-9]/gi, '').slice(-6) || String(Date.now()).slice(-6);
  return `${baseSlug.slice(0, 80)}-${suffix}`;
}

export async function syncSavRssFeed(options?: {
  limit?: number;
  category?: string;
}): Promise<SavRssSyncResult> {
  if (isSyncRunning) {
    return (
      lastSyncStatus || {
        success: true,
        totalFetched: 0,
        added: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        syncedAt: new Date().toISOString(),
        error: 'Синхронизация уже выполняется',
      }
    );
  }

  isSyncRunning = true;
  const startedAt = new Date().toISOString();

  try {
    await ensureBlogRssSchema();

    const { xml, sourceDomain, sourceUrl } = await fetchRssXmlWithFailover(options);

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: false,
      cdataPropName: '#cdata',
      textNodeName: '#text',
      parseTagValue: false,
      trimValues: false,
    });

    const parsed = parser.parse(xml);
    const channel = parsed?.rss?.channel;
    const rawItems = channel?.item;
    const itemsList: Record<string, any>[] = Array.isArray(rawItems)
      ? rawItems
      : rawItems
      ? [rawItems]
      : [];

    const existingRows = await getAll<{
      id: string;
      external_id: string | null;
      external_updated_at: string | null;
      slug: string | null;
    }>('SELECT id, external_id, external_updated_at, slug FROM posts WHERE external_id IS NOT NULL');

    const existingByExternalId = new Map<string, { id: string; external_updated_at: string | null; slug: string | null }>();
    for (const row of existingRows) {
      if (row.external_id) {
        existingByExternalId.set(String(row.external_id), {
          id: String(row.id),
          external_updated_at: row.external_updated_at ? String(row.external_updated_at) : null,
          slug: row.slug ? String(row.slug) : null,
        });
      }
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of itemsList) {
      try {
        const savId = extractNodeText(getNamespacedValue(item, 'sav', 'id'));
        const guidText = extractNodeText(item.guid);
        const linkText = sanitizeExternalUrl(extractNodeText(item.link));
        const externalId = savId || guidText || linkText;

        if (!externalId) {
          skipped++;
          continue;
        }

        const incomingUpdatedAt =
          extractNodeText(getNamespacedValue(item, 'sav', 'updatedAt')) ||
          extractNodeText(item['atom:updated']) ||
          extractNodeText(item.pubDate) ||
          '';

        const existing = existingByExternalId.get(externalId);
        if (existing && incomingUpdatedAt && existing.external_updated_at === incomingUpdatedAt) {
          skipped++;
          continue;
        }

        const title = extractNodeText(item.title) || 'Публикация SAV AI';
        const rawSlug = extractNodeText(getNamespacedValue(item, 'sav', 'slug')) || slugifyRssTitle(title);
        const publishedAtIso = parseIsoOrRfcDate(
          extractNodeText(getNamespacedValue(item, 'sav', 'publishedAt')) ||
            extractNodeText(item.pubDate) ||
            incomingUpdatedAt
        );
        const category =
          extractNodeText(getNamespacedValue(item, 'sav', 'category')) ||
          extractNodeText(item.category) ||
          'новости и кейсы';
        const readTimeMinutes = Math.max(
          1,
          parseInt(extractNodeText(getNamespacedValue(item, 'sav', 'readTimeMinutes')), 10) || 3
        );
        const authorName =
          extractNodeText(getNamespacedValue(item, 'sav', 'authorName')) ||
          extractNodeText(item['dc:creator']) ||
          extractNodeText(item.author) ||
          'SAV AI';
        const authorRole =
          extractNodeText(getNamespacedValue(item, 'sav', 'authorRole')) ||
          extractNodeText(getNamespacedValue(item, 'sav', 'telegramChannel')) ||
          'Telegram @SAV_AI';
        const telegramPostUrl = sanitizeExternalUrl(
          extractNodeText(getNamespacedValue(item, 'sav', 'telegramPostUrl'))
        );
        const telegramChannel = extractNodeText(getNamespacedValue(item, 'sav', 'telegramChannel')) || '@SAV_AI';

        // Parse mediaJson safely
        const rawMediaJsonText = extractNodeText(getNamespacedValue(item, 'sav', 'mediaJson'));
        let mediaArray: any[] = [];
        if (rawMediaJsonText) {
          try {
            const parsedMedia = JSON.parse(rawMediaJsonText);
            if (Array.isArray(parsedMedia)) {
              mediaArray = parsedMedia.map((m: any) => ({
                ...m,
                url: sanitizeExternalUrl(m?.url),
                posterUrl: sanitizeExternalUrl(m?.posterUrl),
                postUrl: sanitizeExternalUrl(m?.postUrl),
              }));
            }
          } catch (_) {}
        }

        // Parse buttonsJson safely
        const rawButtonsJsonText = extractNodeText(getNamespacedValue(item, 'sav', 'buttonsJson'));
        let buttonsArray: any[] = [];
        if (rawButtonsJsonText) {
          try {
            const parsedButtons = JSON.parse(rawButtonsJsonText);
            if (Array.isArray(parsedButtons)) {
              buttonsArray = parsedButtons.map((row: any) =>
                Array.isArray(row)
                  ? row
                      .map((btn: any) => ({
                        text: String(btn?.text || '').trim(),
                        url: sanitizeExternalUrl(btn?.url),
                        isTelegramFallback: Boolean(btn?.isTelegramFallback),
                      }))
                      .filter((btn: any) => btn.text && btn.url)
                  : []
              ).filter((row: any[]) => row.length > 0);
            }
          } catch (_) {}
        }

        // Extract media:thumbnail and enclosure attributes safely
        const mediaThumbRaw = item['media:thumbnail'];
        const mediaThumbUrl = sanitizeExternalUrl(
          Array.isArray(mediaThumbRaw) ? mediaThumbRaw[0]?.['@_url'] : mediaThumbRaw?.['@_url']
        );

        const enclosureRaw = Array.isArray(item.enclosure) ? item.enclosure[0] : item.enclosure;
        const enclosureUrl = sanitizeExternalUrl(enclosureRaw?.['@_url']);
        const enclosureType = String(enclosureRaw?.['@_type'] || '').toLowerCase();

        // Cover Image URL (STRICTLY image, NEVER video)
        const savCoverImage = sanitizeExternalUrl(
          extractNodeText(getNamespacedValue(item, 'sav', 'coverImage'))
        );
        const firstPhotoMediaUrl = mediaArray.find((m) => m?.type === 'photo' && m?.url)?.url || '';
        const enclosureImgUrl = isImageUrl(enclosureUrl, enclosureType) ? enclosureUrl : '';

        let coverImageUrl = '';
        for (const candidate of [savCoverImage, mediaThumbUrl, enclosureImgUrl, firstPhotoMediaUrl]) {
          if (candidate && !isVideoUrl(candidate)) {
            coverImageUrl = candidate;
            break;
          }
        }

        // Cover Video URL (playable mp4/webm/mov <= 20MB, without tooLarge)
        const savCoverVideo = sanitizeExternalUrl(
          extractNodeText(getNamespacedValue(item, 'sav', 'coverVideo'))
        );
        const enclosureVideoUrl = isVideoUrl(enclosureUrl, enclosureType) ? enclosureUrl : '';
        const firstPlayableVideoUrl =
          mediaArray.find((m) => m?.type === 'video' && !m?.tooLarge && m?.url)?.url || '';

        const coverVideoUrl = savCoverVideo || enclosureVideoUrl || firstPlayableVideoUrl || '';

        const contentMarkdown = extractNodeText(getNamespacedValue(item, 'sav', 'contentMarkdown'));
        const contentEncoded = extractNodeText(item['content:encoded']);
        const descriptionText = extractNodeText(item.description);
        const fullContent = replaceKnownRssImages(
          contentMarkdown || contentEncoded || descriptionText || title
        );

        const cleanExcerpt = replaceKnownRssImages(
          stripPlainSummary(descriptionText, 280) || stripPlainSummary(fullContent, 280)
        );
        const seoTitle = replaceKnownRssImages(
          extractNodeText(getNamespacedValue(item, 'sav', 'seoTitle')) || title
        );
        const seoDescription = replaceKnownRssImages(
          extractNodeText(getNamespacedValue(item, 'sav', 'seoDescription')) || cleanExcerpt
        );
        const seoKeywords =
          extractNodeText(getNamespacedValue(item, 'sav', 'seoKeywords')) || `${category}, sav ai`;

        coverImageUrl = replaceKnownRssImages(coverImageUrl);
        const mediaJsonSerialized = replaceKnownRssImages(JSON.stringify(mediaArray));
        const buttonsJsonSerialized = replaceKnownRssImages(JSON.stringify(buttonsArray));
        const finalSlug = await resolveUniquePostSlug(rawSlug, externalId);

        if (!existing) {
          const newId = generateId('post_sav');
          await runSql(
            `INSERT INTO posts (
              id, slug, game_id, title, excerpt, content, image_url, platforms,
              seo_title, seo_description, seo_keywords, cover_prompt,
              author_name, author_role, reading_time, views_count, likes_count,
              external_id, external_updated_at, cover_image_url, cover_video_url,
              source_url, telegram_post_url, telegram_channel, category,
              media_json, buttons_json, is_published, published_at, created_at, updated_at
            ) VALUES (
              $1, $2, NULL, $3, $4, $5, $6, $7,
              $8, $9, $10, '',
              $11, $12, $13, 1, 0,
              $14, $15, $16, $17,
              $18, $19, $20, $21,
              $22, $23, 1, $24::timestamptz, $25::timestamptz, NOW()
            )`,
            [
              newId,
              finalSlug,
              title,
              cleanExcerpt,
              fullContent,
              coverImageUrl || null,
              'Web, Telegram, RSS',
              seoTitle,
              seoDescription,
              seoKeywords,
              authorName,
              authorRole,
              readTimeMinutes,
              externalId,
              incomingUpdatedAt || publishedAtIso,
              coverImageUrl || null,
              coverVideoUrl || null,
              linkText || null,
              telegramPostUrl || null,
              telegramChannel,
              category,
              mediaJsonSerialized,
              buttonsJsonSerialized,
              publishedAtIso,
              publishedAtIso,
            ]
          );
          added++;
          existingByExternalId.set(externalId, {
            id: newId,
            external_updated_at: incomingUpdatedAt || publishedAtIso,
            slug: finalSlug,
          });
        } else {
          await runSql(
            `UPDATE posts SET
              slug = $1,
              title = $2,
              excerpt = $3,
              content = $4,
              image_url = COALESCE($5, image_url),
              seo_title = $6,
              seo_description = $7,
              seo_keywords = $8,
              author_name = $9,
              author_role = $10,
              reading_time = $11,
              external_updated_at = $12,
              cover_image_url = $13,
              cover_video_url = $14,
              source_url = $15,
              telegram_post_url = $16,
              telegram_channel = $17,
              category = $18,
              media_json = $19,
              buttons_json = $20,
              is_published = 1,
              published_at = COALESCE(published_at, $21::timestamptz),
              updated_at = NOW()
            WHERE id = $22`,
            [
              finalSlug,
              title,
              cleanExcerpt,
              fullContent,
              coverImageUrl || null,
              seoTitle,
              seoDescription,
              seoKeywords,
              authorName,
              authorRole,
              readTimeMinutes,
              incomingUpdatedAt || publishedAtIso,
              coverImageUrl || null,
              coverVideoUrl || null,
              linkText || null,
              telegramPostUrl || null,
              telegramChannel,
              category,
              mediaJsonSerialized,
              buttonsJsonSerialized,
              publishedAtIso,
              existing.id,
            ]
          );
          updated++;
        }
      } catch (itemErr: any) {
        errors++;
        console.warn('[SAV RSS Item Error]:', itemErr?.message || itemErr);
      }
    }

    const result: SavRssSyncResult = {
      success: true,
      sourceDomain,
      sourceUrl,
      totalFetched: itemsList.length,
      added,
      updated,
      skipped,
      errors,
      syncedAt: startedAt,
    };
    lastSyncStatus = result;
    if (added > 0 || updated > 0) {
      invalidatePostsMemoryCache();
    }
    console.log(
      `[SAV RSS Sync] Source: ${sourceDomain} | Total: ${itemsList.length} | Added: ${added} | Updated: ${updated} | Skipped: ${skipped}${errors > 0 ? ` | Failed: ${errors}` : ''}`
    );
    return result;
  } catch (err: any) {
    const failResult: SavRssSyncResult = {
      success: false,
      totalFetched: 0,
      added: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      syncedAt: startedAt,
      error: err?.message || 'Ошибка синхронизации RSS',
    };
    lastSyncStatus = failResult;
    console.warn('[SAV RSS Sync Warning]:', failResult.error);
    return failResult;
  } finally {
    isSyncRunning = false;
  }
}

export function initSavRssScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Initial sync 10 seconds after backend ready
  setTimeout(() => {
    syncSavRssFeed({ limit: 100 }).catch((err) =>
      console.warn('[SAV RSS Initial Sync Warning]:', err?.message || err)
    );
  }, 10000);

  // Repeat every 10 minutes
  setInterval(() => {
    syncSavRssFeed({ limit: 100 }).catch((err) =>
      console.warn('[SAV RSS Interval Sync Warning]:', err?.message || err)
    );
  }, 10 * 60 * 1000);

  console.log('[SAV RSS Scheduler] Auto-sync configured: initial +10s, interval 10m.');
}
