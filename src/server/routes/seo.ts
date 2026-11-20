import { Router, Request } from 'express';
import { getAll } from '../db';

export const seoRouter = Router();

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
