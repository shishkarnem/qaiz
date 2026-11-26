import { Router, Request } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getAll } from '../db';
import { DIRECT_MEDIA_URLS } from '../../shared/mediaUrls';

export const seoRouter = Router();

interface PwaMediaSpec {
  width: number;
  height: number;
  format: 'png' | 'jpeg';
  sourceKind: 'logo' | 'banner';
  maskable?: boolean;
}

const PWA_MEDIA_SPECS: Record<string, PwaMediaSpec> = {
  'icon-48x48.png': { width: 48, height: 48, format: 'png', sourceKind: 'logo' },
  'icon-96x96.png': { width: 96, height: 96, format: 'png', sourceKind: 'logo' },
  'icon-120x120.png': { width: 120, height: 120, format: 'png', sourceKind: 'logo' },
  'icon-144x144.png': { width: 144, height: 144, format: 'png', sourceKind: 'logo' },
  'pwa-192x192.png': { width: 192, height: 192, format: 'png', sourceKind: 'logo' },
  'pwa-512x512.png': { width: 512, height: 512, format: 'png', sourceKind: 'logo' },
  'pwa-maskable-512x512.png': { width: 512, height: 512, format: 'png', sourceKind: 'logo', maskable: true },
  'apple-touch-icon.png': { width: 180, height: 180, format: 'png', sourceKind: 'logo' },
  'apple-touch-icon-152x152.png': { width: 152, height: 152, format: 'png', sourceKind: 'logo' },
  'apple-touch-icon-167x167.png': { width: 167, height: 167, format: 'png', sourceKind: 'logo' },
  'mstile-150x150.png': { width: 150, height: 150, format: 'png', sourceKind: 'logo' },
  'mstile-310x150.png': { width: 310, height: 150, format: 'png', sourceKind: 'banner' },
  'yandex-tableau-73x73.png': { width: 73, height: 73, format: 'png', sourceKind: 'logo' },
  'favicon.ico': { width: 48, height: 48, format: 'png', sourceKind: 'logo' },
  'og-banner.jpg': { width: 1200, height: 630, format: 'jpeg', sourceKind: 'banner' },
  'QaizSocial.jpg': { width: 1200, height: 594, format: 'jpeg', sourceKind: 'banner' },
};

const mediaBufferCache = new Map<string, Buffer>();
const masterSourceCache = new Map<'logo' | 'banner', Buffer>();

async function getMasterMediaBuffer(kind: 'logo' | 'banner'): Promise<Buffer | null> {
  const cached = masterSourceCache.get(kind);
  if (cached) return cached;

  const url = kind === 'logo' ? DIRECT_MEDIA_URLS.MINI_LOGO : DIRECT_MEDIA_URLS.SOCIAL_COVER;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0) {
        masterSourceCache.set(kind, buf);
        return buf;
      }
    }
  } catch (err) {
    console.warn(`[PWA Media Fallback] Failed fetching ${kind}:`, err);
  }
  return null;
}

async function resolveOrSynthesizeMediaBuffer(fileName: string, spec: PwaMediaSpec): Promise<Buffer> {
  const cached = mediaBufferCache.get(fileName);
  if (cached) return cached;

  const diskCandidates = [
    path.join(process.cwd(), 'dist', fileName),
    path.join(process.cwd(), 'public', fileName),
  ];

  for (const candidatePath of diskCandidates) {
    try {
      if (fs.existsSync(candidatePath)) {
        const diskBuf = await fs.promises.readFile(candidatePath);
        if (diskBuf.length > 0) {
          mediaBufferCache.set(fileName, diskBuf);
          return diskBuf;
        }
      }
    } catch (_) {}
  }

  let outputBuf: Buffer | null = null;
  const masterBuf = await getMasterMediaBuffer(spec.sourceKind);

  if (masterBuf) {
    try {
      let pipeline = sharp(masterBuf);
      if (spec.maskable) {
        const innerSize = Math.round(Math.min(spec.width, spec.height) * 0.72);
        const padX = Math.floor((spec.width - innerSize) / 2);
        const padY = Math.floor((spec.height - innerSize) / 2);
        const innerPng = await pipeline
          .resize(innerSize, innerSize, {
            fit: 'contain',
            background: { r: 11, g: 16, b: 27, alpha: 1 },
          })
          .png()
          .toBuffer();
        pipeline = sharp(innerPng).extend({
          top: padY,
          bottom: spec.height - innerSize - padY,
          left: padX,
          right: spec.width - innerSize - padX,
          background: { r: 11, g: 16, b: 27, alpha: 1 },
        });
      } else if (spec.sourceKind === 'banner') {
        pipeline = pipeline.resize(spec.width, spec.height, { fit: 'cover', position: 'center' });
      } else {
        pipeline = pipeline.resize(spec.width, spec.height, {
          fit: 'contain',
          background: { r: 11, g: 16, b: 27, alpha: 0 },
        });
      }

      outputBuf =
        spec.format === 'jpeg'
          ? await pipeline.jpeg({ quality: 88 }).toBuffer()
          : await pipeline.png().toBuffer();
    } catch (err) {
      console.warn(`[PWA Media Fallback] Sharp resize failed for ${fileName}:`, err);
    }
  }

  if (!outputBuf) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 100 100">
      <rect width="100" height="100" rx="22" fill="#0b101b"/>
      <circle cx="50" cy="50" r="34" fill="none" stroke="#83c42e" stroke-width="10"/>
      <path d="M56 56 L76 76" stroke="#83c42e" stroke-width="10" stroke-linecap="round"/>
    </svg>`;
    const fallbackPipeline = sharp(Buffer.from(svg)).resize(spec.width, spec.height);
    outputBuf =
      spec.format === 'jpeg'
        ? await fallbackPipeline.jpeg({ quality: 88 }).toBuffer()
        : await fallbackPipeline.png().toBuffer();
  }

  mediaBufferCache.set(fileName, outputBuf);

  try {
    const distDir = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      await fs.promises.writeFile(path.join(distDir, fileName), outputBuf).catch(() => {});
    }
  } catch (_) {}

  return outputBuf;
}

for (const [fileName, spec] of Object.entries(PWA_MEDIA_SPECS)) {
  seoRouter.get(`/${fileName}`, async (_req, res) => {
    try {
      const buf = await resolveOrSynthesizeMediaBuffer(fileName, spec);
      const contentType =
        fileName.endsWith('.ico')
          ? 'image/x-icon'
          : spec.format === 'jpeg'
          ? 'image/jpeg'
          : 'image/png';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (err: any) {
      console.error(`[PWA Icon Route Error] ${fileName}:`, err?.message || err);
      res.status(500).end();
    }
  });
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripMarkdown(str: string): string {
  return String(str || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRequestBaseUrl(req: Request): string {
  const rawHost =
    String(req.get('x-forwarded-host') || req.get('host') || 'qaiz.ru')
      .split(',')[0]
      .trim() || 'qaiz.ru';
  const rawProto = String(req.get('x-forwarded-proto') || req.protocol || 'https')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const isLocal = rawHost.startsWith('localhost') || rawHost.startsWith('127.0.0.1');
  const proto = isLocal ? rawProto : 'https';
  return `${proto}://${rawHost}`.replace(/\/+$/, '');
}

const STATIC_GAME_SLUGS = [
  'blitz',
  'millionaire',
  '100to1',
  'whatwherewhen',
  'jeopardy',
  'melody',
];

seoRouter.get('/robots.txt', (req, res) => {
  const baseUrl = getRequestBaseUrl(req);
  const content = [
    'User-agent: *',
    'Allow: /',
    'Allow: /file/',
    'Allow: /game/',
    'Allow: /blog',
    'Allow: /blog/',
    'Allow: /rating',
    'Allow: /rss.xml',
    'Allow: /sitemap.xml',
    'Disallow: /api/',
    'Disallow: /system-admin',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: Yandex',
    'Allow: /',
    '',
    'User-agent: YandexBot',
    'Allow: /',
    '',
    'User-agent: Googlebot',
    'Allow: /',
    '',
    `Host: ${baseUrl}`,
    `Sitemap: ${baseUrl}/sitemap.xml`,
    '',
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(content);
});

seoRouter.get('/yandex-tableau.json', (req, res) => {
  const baseUrl = getRequestBaseUrl(req);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    version: '2.0',
    api_version: 2,
    layout: {
      logo: `${baseUrl}/yandex-tableau-73x73.png`,
      color: '#0b101b',
      show_title: true,
    },
    feed: `${baseUrl}/rss.xml`,
  });
});

seoRouter.get('/browserconfig.xml', (req, res) => {
  const baseUrl = getRequestBaseUrl(req);
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="${escapeXml(baseUrl)}/mstile-150x150.png"/>
      <wide310x150logo src="${escapeXml(baseUrl)}/mstile-310x150.png"/>
      <TileColor>#0b101b</TileColor>
    </tile>
  </msapplication>
</browserconfig>
`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
});

seoRouter.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const [posts, games] = await Promise.all([
      getAll<any>('SELECT id, slug, title, image_url, updated_at, created_at FROM posts ORDER BY created_at DESC LIMIT 200').catch(() => []),
      getAll<any>('SELECT id, title, updated_at, created_at FROM games ORDER BY created_at ASC').catch(() => []),
    ]);

    const todayIso = new Date().toISOString().split('T')[0];

    const entries: Array<{
      loc: string;
      lastmod?: string;
      changefreq: string;
      priority: string;
      image?: string;
      imageTitle?: string;
    }> = [
      {
        loc: `${baseUrl}/`,
        lastmod: todayIso,
        changefreq: 'daily',
        priority: '1.0',
        image: `${baseUrl}/og-banner.jpg`,
        imageTitle: 'Квайз (qAIz) — ИИ-Викторины и Интеллектуальные Игры Онлайн',
      },
      { loc: `${baseUrl}/free`, lastmod: todayIso, changefreq: 'weekly', priority: '0.85' },
      { loc: `${baseUrl}/blog`, lastmod: todayIso, changefreq: 'daily', priority: '0.9' },
      { loc: `${baseUrl}/rating`, lastmod: todayIso, changefreq: 'daily', priority: '0.75' },
      { loc: `${baseUrl}/oferta`, changefreq: 'monthly', priority: '0.4' },
    ];

    const seenGameSlugs = new Set<string>();
    for (const slug of STATIC_GAME_SLUGS) {
      seenGameSlugs.add(slug);
      entries.push({
        loc: `${baseUrl}/game/${slug}`,
        lastmod: todayIso,
        changefreq: 'weekly',
        priority: slug === 'melody' ? '0.85' : '0.9',
      });
    }

    for (const g of games) {
      const gId = String(g.id || '').trim();
      if (!gId || seenGameSlugs.has(gId) || gId.startsWith('free_')) continue;
      seenGameSlugs.add(gId);
      const lastmod = g.updated_at || g.created_at ? new Date(g.updated_at || g.created_at).toISOString().split('T')[0] : todayIso;
      entries.push({
        loc: `${baseUrl}/game/${encodeURIComponent(gId)}`,
        lastmod,
        changefreq: 'weekly',
        priority: '0.85',
      });
    }

    const seenPostSlugs = new Set<string>();
    for (const p of posts) {
      const slug = String(p.slug || p.id || '').trim();
      if (!slug || seenPostSlugs.has(slug)) continue;
      seenPostSlugs.add(slug);
      const dt = p.updated_at || p.created_at;
      const lastmod = dt && !isNaN(new Date(dt).getTime()) ? new Date(dt).toISOString().split('T')[0] : todayIso;
      entries.push({
        loc: `${baseUrl}/blog/${encodeURIComponent(slug)}`,
        lastmod,
        changefreq: 'weekly',
        priority: '0.85',
        image: p.image_url && String(p.image_url).startsWith('http') ? String(p.image_url) : undefined,
        imageTitle: p.title ? String(p.title) : undefined,
      });
    }

    const urlBlocks = entries
      .map((item) => {
        const lines = [
          '  <url>',
          `    <loc>${escapeXml(item.loc)}</loc>`,
          item.lastmod ? `    <lastmod>${escapeXml(item.lastmod)}</lastmod>` : '',
          `    <changefreq>${item.changefreq}</changefreq>`,
          `    <priority>${item.priority}</priority>`,
          item.image
            ? [
                '    <image:image>',
                `      <image:loc>${escapeXml(item.image)}</image:loc>`,
                item.imageTitle ? `      <image:title>${escapeXml(item.imageTitle)}</image:title>` : '',
                '    </image:image>',
              ]
                .filter(Boolean)
                .join('\n')
            : '',
          '  </url>',
        ].filter(Boolean);
        return lines.join('\n');
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlBlocks}
</urlset>
`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.send(xml);
  } catch (err: any) {
    console.error('[SEO Sitemap Error]:', err?.message || err);
    res.status(500).type('text/plain').send('Failed to generate sitemap.xml');
  }
});

seoRouter.get('/rss.xml', async (req, res) => {
  try {
    const baseUrl = getRequestBaseUrl(req);
    const posts = await getAll<any>(
      'SELECT id, slug, title, excerpt, content, image_url, created_at, updated_at FROM posts ORDER BY created_at DESC LIMIT 30'
    ).catch(() => []);

    const lastBuildDate = new Date().toUTCString();

    const postItems = posts.map((p) => {
      const slug = String(p.slug || p.id || '').trim();
      const link = `${baseUrl}/blog/${encodeURIComponent(slug)}`;
      const descRaw = p.excerpt || stripMarkdown(p.content || '').slice(0, 320);
      const pubDateObj = new Date(p.created_at || p.updated_at || Date.now());
      const pubDate = isNaN(pubDateObj.getTime()) ? lastBuildDate : pubDateObj.toUTCString();
      const imageTag =
        p.image_url && String(p.image_url).startsWith('http')
          ? `      <enclosure url="${escapeXml(String(p.image_url))}" type="image/jpeg" />`
          : '';

      return [
        '    <item>',
        `      <title>${escapeXml(p.title || 'Статья Квайз')}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
        `      <description>${escapeXml(descRaw)}</description>`,
        imageTag,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    });

    if (postItems.length === 0) {
      postItems.push(
        [
          '    <item>',
          '      <title>ИИ-Квиз, Квиллионер, Сто Квадному и Своя Икра онлайн на Квайз</title>',
          `      <link>${escapeXml(baseUrl)}/</link>`,
          `      <guid isPermaLink="true">${escapeXml(baseUrl)}/</guid>`,
          `      <pubDate>${escapeXml(lastBuildDate)}</pubDate>`,
          '      <description>Играйте бесплатно и с друзьями в интеллектуальные игры с генерацией вопросов нейросетью.</description>',
          '    </item>',
        ].join('\n')
      );
    }

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Квайз (qAIz) — ИИ-Викторины и Интеллектуальные Игры</title>
    <link>${escapeXml(baseUrl)}/</link>
    <description>Новости, обзоры интеллектуальных игр и авторские викторины на платформе Квайз (qAIz).</description>
    <language>ru</language>
    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>
    <atom:link href="${escapeXml(baseUrl)}/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${escapeXml(baseUrl)}/pwa-192x192.png</url>
      <title>Квайз (qAIz)</title>
      <link>${escapeXml(baseUrl)}/</link>
    </image>
${postItems.join('\n')}
  </channel>
</rss>
`;

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.send(rssXml);
  } catch (err: any) {
    console.error('[SEO RSS Error]:', err?.message || err);
    res.status(500).type('text/plain').send('Failed to generate rss.xml');
  }
});
