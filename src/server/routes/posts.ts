import { Router } from 'express';
import { getAll, getOne, runSql, generateId } from '../db';

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
    const gameId = typeof req.query.game_id === 'string' ? req.query.game_id.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    let posts = await getAll('SELECT * FROM posts ORDER BY created_at DESC');

    if (gameId && gameId !== 'all') {
      posts = posts.filter((p: any) => p.game_id === gameId);
    }
    if (q) {
      posts = posts.filter((p: any) =>
        String(p.title || '').toLowerCase().includes(q) ||
        String(p.excerpt || '').toLowerCase().includes(q) ||
        String(p.content || '').toLowerCase().includes(q) ||
        String(p.seo_keywords || '').toLowerCase().includes(q)
      );
    }

    res.json({ data: posts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

postsRouter.get('/:slugOrId', async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const post = await getOne(
      'SELECT * FROM posts WHERE slug = $1 OR id = $2 LIMIT 1',
      [slugOrId, slugOrId]
    );
    if (!post) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }

    try {
      await runSql('UPDATE posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1', [post.id]);
      post.views_count = (post.views_count || 0) + 1;
    } catch (_) {}

    res.json({ data: post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

postsRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await runSql('DELETE FROM posts WHERE id = $1', [id]);
    res.json({ message: 'Пост удален' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
