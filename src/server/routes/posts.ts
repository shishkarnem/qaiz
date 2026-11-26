import { Router } from 'express';
import { getAll, getOne, runSql, generateId } from '../db';
import { requireSuperAdmin } from '../authMiddleware';
import {
  ensureBlogRssSchema,
  getLastSavRssSyncStatus,
  syncSavRssFeed,
} from '../blog/savRssSync';
import {
  getCachedPostsFeed,
  setCachedPostsFeed,
  getCachedPostByKey,
  setCachedPostRecord,
  invalidatePostsMemoryCache,
} from '../blog/postsMemoryCache';

export const postsRouter = Router();

function slugifyTitle(title: string): string {
  const ruToEn: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
  };
  return String(title || '')
    .toLowerCase()
    .split('')
    .map(ch => (ruToEn[ch] !== undefined ? ruToEn[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || `post-${Date.now()}`;
}

postsRouter.get('/', async (req, res) => {
  try {
    await ensureBlogRssSchema().catch(() => {});

    const gameId = typeof req.query.game_id === 'string' ? req.query.game_id.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const hasExplicitLimit = req.query.limit !== undefined;
    const rawLimit = parseInt(String(req.query.limit || '100'), 10);
    const limit = hasExplicitLimit
      ? Math.max(1, Math.min(100, isNaN(rawLimit) ? 20 : rawLimit))
      : 200;
    const rawOffset = parseInt(String(req.query.offset || '0'), 10);
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    const conditions: string[] = ['COALESCE(is_published, 1) = 1'];
    const params: any[] = [];
    let pIdx = 1;

    if (gameId && gameId !== 'all') {
      conditions.push(`game_id = $${pIdx++}`);
      params.push(gameId);
    }

    if (category && category !== 'all') {
      conditions.push(`LOWER(COALESCE(category, '')) = LOWER($${pIdx++})`);
      params.push(category);
    }

    if (q) {
      const likeTerm = `%${q}%`;
      conditions.push(
        `(COALESCE(title, '') ILIKE $${pIdx} OR COALESCE(excerpt, '') ILIKE $${pIdx} OR COALESCE(content, '') ILIKE $${pIdx} OR COALESCE(seo_keywords, '') ILIKE $${pIdx} OR COALESCE(category, '') ILIKE $${pIdx})`
      );
      params.push(likeTerm);
      pIdx++;
    }

    const feedCacheKey = `${gameId}|${category.toLowerCase()}|${q.toLowerCase()}|${limit}|${offset}`;
    const cachedFeed = getCachedPostsFeed(feedCacheKey);
    if (cachedFeed) {
      return res.json({
        ...cachedFeed,
        syncStatus: getLastSavRssSyncStatus(),
      });
    }

    const whereSql = conditions.join(' AND ');

    const [countRow, pinnedCountRow, posts, categoriesRows] = await Promise.all([
      getOne<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM posts WHERE ${whereSql}`, params),
      getOne<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM posts WHERE COALESCE(is_pinned, 0) = 1`),
      getAll<any>(
        `SELECT * FROM posts
         WHERE ${whereSql}
         ORDER BY
           CASE
             WHEN external_id IS NULL AND game_id = 'blitz' THEN 1
             WHEN external_id IS NULL AND game_id = 'millionaire' THEN 2
             WHEN external_id IS NULL AND game_id = '100to1' THEN 3
             WHEN external_id IS NULL AND game_id = 'whatwherewhen' THEN 4
             WHEN external_id IS NULL AND game_id = 'jeopardy' THEN 5
             WHEN COALESCE(is_pinned, 0) = 1 THEN 6
             ELSE 7
           END ASC,
           pinned_at DESC NULLS LAST,
           COALESCE(published_at, created_at) DESC,
           id DESC
         LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
        [...params, limit, offset]
      ),
      getAll<{ category: string; cnt: number }>(
        `SELECT COALESCE(NULLIF(TRIM(category), ''), '') AS category, COUNT(*)::int AS cnt
         FROM posts
         WHERE COALESCE(is_published, 1) = 1 AND NULLIF(TRIM(category), '') IS NOT NULL
         GROUP BY category
         ORDER BY cnt DESC, category ASC`
      ).catch(() => []),
    ]);

    const total = Number(countRow?.cnt || posts.length);
    const pinnedCount = Number(pinnedCountRow?.cnt || 0);
    const hasMore = offset + posts.length < total;

    const payload = {
      data: posts,
      total,
      limit,
      offset,
      hasMore,
      pinnedCount,
      maxPinned: 10,
      categories: categoriesRows,
    };
    setCachedPostsFeed(feedCacheKey, payload);
    for (const p of posts) {
      setCachedPostRecord(p);
    }

    res.json({
      ...payload,
      syncStatus: getLastSavRssSyncStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

postsRouter.get('/sync-rss/status', requireSuperAdmin, async (_req, res) => {
  res.json({
    success: true,
    status: getLastSavRssSyncStatus(),
  });
});

postsRouter.post('/sync-rss', requireSuperAdmin, async (req, res) => {
  try {
    const limit = Number(req.body?.limit || req.query.limit || 100);
    const category =
      typeof req.body?.category === 'string'
        ? req.body.category
        : typeof req.query.category === 'string'
        ? req.query.category
        : undefined;
    const result = await syncSavRssFeed({ limit, category });
    invalidatePostsMemoryCache();
    if (!result.success) {
      return res.status(502).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Ошибка запуска RSS-синхронизации' });
  }
});

postsRouter.get('/:slugOrId', async (req, res) => {
  try {
    await ensureBlogRssSchema().catch(() => {});
    const { slugOrId } = req.params;
    const cachedPost = getCachedPostByKey(slugOrId);
    if (cachedPost) {
      cachedPost.views_count = (cachedPost.views_count || 0) + 1;
      void runSql('UPDATE posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1', [cachedPost.id]).catch(() => {});
      return res.json({ data: cachedPost });
    }

    const post = await getOne(
      'SELECT * FROM posts WHERE slug = $1 OR id = $2 LIMIT 1',
      [slugOrId, slugOrId]
    );
    if (!post) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }

    post.views_count = (post.views_count || 0) + 1;
    setCachedPostRecord(post);
    void runSql('UPDATE posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1', [post.id]).catch(() => {});

    res.json({ data: post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

postsRouter.post('/:id/pin', requireSuperAdmin, async (req, res) => {
  try {
    await ensureBlogRssSchema().catch(() => {});
    const { id } = req.params;
    const post = await getOne<any>('SELECT * FROM posts WHERE id = $1 OR slug = $2 LIMIT 1', [id, id]);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Статья не найдена' });
    }

    const currentlyPinned = Number(post.is_pinned || 0) === 1;
    const nextPinned = req.body?.pinned !== undefined ? Boolean(req.body.pinned) : !currentlyPinned;

    if (nextPinned && !currentlyPinned) {
      const otherPinnedRow = await getOne<{ cnt: number }>(
        'SELECT COUNT(*)::int AS cnt FROM posts WHERE COALESCE(is_pinned, 0) = 1 AND id <> $1',
        [post.id]
      );
      const otherPinned = Number(otherPinnedRow?.cnt || 0);
      if (otherPinned >= 10) {
        return res.status(400).json({
          success: false,
          error: 'Можно закрепить максимум 10 постов. Сначала открепите один из закреплённых постов.',
          pinnedCount: otherPinned,
          maxPinned: 10,
        });
      }
    }

    await runSql(
      `UPDATE posts
       SET is_pinned = $1,
           pinned_at = CASE WHEN $1 = 1 THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $2`,
      [nextPinned ? 1 : 0, post.id]
    );

    const [updated, countRow] = await Promise.all([
      getOne('SELECT * FROM posts WHERE id = $1', [post.id]),
      getOne<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM posts WHERE COALESCE(is_pinned, 0) = 1'),
    ]);

    invalidatePostsMemoryCache();

    res.json({
      success: true,
      data: updated,
      pinnedCount: Number(countRow?.cnt || 0),
      maxPinned: 10,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

postsRouter.post('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const post = await getOne('SELECT * FROM posts WHERE id = $1 OR slug = $2 LIMIT 1', [id, id]);
    if (!post) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }
    await runSql('UPDATE posts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = $1', [post.id]);
    const updated = await getOne('SELECT * FROM posts WHERE id = $1', [post.id]);
    invalidatePostsMemoryCache();
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

postsRouter.post('/', async (req, res) => {
  try {
    const {
      title,
      content,
      excerpt,
      image_url,
      platforms,
      slug,
      game_id,
      seo_title,
      seo_description,
      seo_keywords,
      cover_prompt,
      author_name
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Заголовок и текст обязательны' });
    }

    const id = generateId('post');
    const finalSlug = (slug && String(slug).trim()) ? String(slug).trim() : slugifyTitle(title);
    const platformsStr = Array.isArray(platforms) ? platforms.join(', ') : (platforms || 'Web, Telegram');
    const cleanExcerpt = excerpt || String(content).replace(/[#*_>`~\[\]\(\)]/g, '').slice(0, 260).trim();
    const readingTime = Math.max(2, Math.round(String(content).length / 750));

    await runSql(
      `INSERT INTO posts (
        id, slug, game_id, title, excerpt, content, image_url, platforms,
        seo_title, seo_description, seo_keywords, cover_prompt,
        author_name, reading_time, views_count, likes_count, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1, 0, NOW(), NOW())`,
      [
        id,
        finalSlug,
        game_id || null,
        title,
        cleanExcerpt,
        content,
        image_url || null,
        platformsStr,
        seo_title || title,
        seo_description || cleanExcerpt,
        seo_keywords || '',
        cover_prompt || '',
        author_name || 'Редакция Квайз',
        readingTime
      ]
    );

    const created = await getOne('SELECT * FROM posts WHERE id = $1', [id]);
    invalidatePostsMemoryCache();
    res.json({ data: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

postsRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      excerpt,
      image_url,
      platforms,
      slug,
      game_id,
      seo_title,
      seo_description,
      seo_keywords,
      cover_prompt,
      author_name
    } = req.body;

    const platformsStr = Array.isArray(platforms) ? platforms.join(', ') : platforms;
    const readingTime = content ? Math.max(2, Math.round(String(content).length / 750)) : undefined;

    await runSql(
      `UPDATE posts SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        excerpt = COALESCE($3, excerpt),
        image_url = COALESCE($4, image_url),
        platforms = COALESCE($5, platforms),
        slug = COALESCE($6, slug),
        game_id = COALESCE($7, game_id),
        seo_title = COALESCE($8, seo_title),
        seo_description = COALESCE($9, seo_description),
        seo_keywords = COALESCE($10, seo_keywords),
        cover_prompt = COALESCE($11, cover_prompt),
        author_name = COALESCE($12, author_name),
        reading_time = COALESCE($13, reading_time),
        updated_at = NOW()
      WHERE id = $14`,
      [
        title ?? null,
        content ?? null,
        excerpt ?? null,
        image_url ?? null,
        platformsStr ?? null,
        slug ?? null,
        game_id ?? null,
        seo_title ?? null,
        seo_description ?? null,
        seo_keywords ?? null,
        cover_prompt ?? null,
        author_name ?? null,
        readingTime ?? null,
        id
      ]
    );

    const updated = await getOne('SELECT * FROM posts WHERE id = $1', [id]);
    invalidatePostsMemoryCache();
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

postsRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await runSql('DELETE FROM posts WHERE id = $1', [id]);
    invalidatePostsMemoryCache();
    res.json({ message: 'Пост удален' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
