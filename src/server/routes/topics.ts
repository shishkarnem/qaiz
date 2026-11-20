import { Router } from 'express';
import { getAll, getOne, runSql, generateId } from '../db';

export const topicsRouter = Router();

// GET all topics (recently used by user first, remainder alphabetically, search query support, total count)
topicsRouter.get('/', async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim().toLowerCase() : '';
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 1000;
    const userId = req.query.user_id ? String(req.query.user_id).trim() : '';

    const totalRow = await getOne<{ total: number }>('SELECT COUNT(*)::int as total FROM topics');
    const totalCount = Number(totalRow?.total || 0);

    let sql = 'SELECT * FROM topics';
    const params: any[] = [];

    if (q) {
      sql += ' WHERE name ILIKE $1';
      params.push(`%${q}%`);
    }

    const allTopics = await getAll<any>(sql, params);

    // Fetch user's recent topics from game_sessions, game_packs, and game_progress
    const userRecentTopics: string[] = [];
    const targetUserIds = ['usr_guest', '10016926299'];
    if (userId) {
      targetUserIds.push(userId);
      const user = await getOne(
        'SELECT id, uid, telegram_id FROM users WHERE id = $1 OR uid = $2 OR telegram_id::text = $3',
        [userId, userId, userId]
      );
      if (user) {
        if (user.id && !targetUserIds.includes(user.id)) targetUserIds.push(user.id);
        if (user.uid && !targetUserIds.includes(user.uid)) targetUserIds.push(user.uid);
        if (user.telegram_id && !targetUserIds.includes(String(user.telegram_id))) targetUserIds.push(String(user.telegram_id));
      }
    }

    const placeholders = targetUserIds.map((_, idx) => `$${idx + 1}`).join(',');
    const recentFromSessions = await getAll<{ topic: string; last_used: string }>(
      `SELECT topic, MAX(created_at) as last_used 
       FROM game_sessions 
       WHERE user_id IN (${placeholders}) 
         AND topic IS NOT NULL AND TRIM(topic) != ''
       GROUP BY topic 
       ORDER BY last_used DESC LIMIT 50`,
      targetUserIds
    );

    const recentFromPacks = await getAll<{ topic: string; last_used: string }>(
      `SELECT topic, MAX(created_at) as last_used 
       FROM game_packs 
       WHERE user_id IN (${placeholders}) 
         AND topic IS NOT NULL AND TRIM(topic) != ''
       GROUP BY topic 
       ORDER BY last_used DESC LIMIT 50`,
      targetUserIds
    );

    const seen = new Set<string>();
    const combined = [...recentFromSessions, ...recentFromPacks].sort((a, b) => {
      const tA = new Date(a.last_used || 0).getTime();
      const tB = new Date(b.last_used || 0).getTime();
      return tB - tA;
    });

    combined.forEach(item => {
      if (!item.topic) return;
      const subTopics = item.topic.split(',').map(s => s.trim()).filter(Boolean);
      subTopics.forEach(t => {
        const lower = t.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          userRecentTopics.push(t);
        }
      });
    });

    // Sort topics: recent topics first, then the rest alphabetically (Russian locale aware)
    const recentMap = new Map<string, number>();
    userRecentTopics.forEach((t, idx) => {
      recentMap.set(t.toLowerCase(), idx);
    });

    const sorted = [...allTopics].sort((a, b) => {
      const aLower = a.name.trim().toLowerCase();
      const bLower = b.name.trim().toLowerCase();
      const aRecentIdx = recentMap.has(aLower) ? recentMap.get(aLower)! : -1;
      const bRecentIdx = recentMap.has(bLower) ? recentMap.get(bLower)! : -1;

      if (aRecentIdx !== -1 && bRecentIdx !== -1) {
        return aRecentIdx - bRecentIdx;
      }
      if (aRecentIdx !== -1) return -1;
      if (bRecentIdx !== -1) return 1;

      return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' });
    });

    const sliced = limit > 0 ? sorted.slice(0, limit) : sorted;

    res.json({
      data: sliced,
      totalCount,
      filteredCount: sorted.length,
      recentTopics: userRecentTopics
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST create or retrieve existing topic (case-insensitive deduplication)
topicsRouter.post('/', async (req, res) => {
  try {
    const { name, category, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Название темы обязательно' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      return res.status(400).json({ error: 'Название темы слишком короткое' });
    }

    // Case-insensitive search for exact duplicate or very close match
    const existing = await getOne<any>(
      'SELECT * FROM topics WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))',
      [trimmedName]
    );

    if (existing) {
      await runSql('UPDATE topics SET use_count = use_count + 1 WHERE id = $1', [existing.id]);
      const updated = await getOne('SELECT * FROM topics WHERE id = $1', [existing.id]);
      return res.json({ data: updated, created: false });
    }

    const similar = await getOne<any>(
      `SELECT * FROM topics WHERE LOWER(TRIM(name)) LIKE $1 OR $2 LIKE '%' || LOWER(TRIM(name)) || '%'`,
      [`%${trimmedName.toLowerCase()}%`, trimmedName.toLowerCase()]
    );

    if (similar && similar.name.toLowerCase() !== trimmedName.toLowerCase() && trimmedName.length <= 3) {
      await runSql('UPDATE topics SET use_count = use_count + 1 WHERE id = $1', [similar.id]);
      return res.json({ data: similar, created: false });
    }

    const id = generateId('tp');
    await runSql(
      'INSERT INTO topics (id, name, category, description, use_count, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [id, trimmedName, category || 'Пользовательские', description || 'Пользовательская тема', 1]
    );

    const created = await getOne('SELECT * FROM topics WHERE id = $1', [id]);
    res.json({ data: created, created: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
