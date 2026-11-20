import { Router } from 'express';
import { getAll, getOne, runSql, generateId, recalculateUserBalancesFromTransactions, calculateAuthoritativeScore, calculateAuthoritativeScoreWithBreakdown } from '../db';

export const gameSessionsRouter = Router();

gameSessionsRouter.get('/jeopardy/previous-topics', async (req, res) => {
  try {
    const rows = await getAll(
      "SELECT jeopardy_topics, topic FROM game_sessions WHERE (game_id = 'jeopardy' OR game_title LIKE '%Своя Икра%' OR game_title LIKE '%Своя Игра%') ORDER BY created_at DESC LIMIT 50"
    );
    const topicsSet = new Set<string>();
    for (const r of rows) {
      if (r.jeopardy_topics) {
        try {
          const parsed = JSON.parse(r.jeopardy_topics);
          if (Array.isArray(parsed)) {
            parsed.forEach((t: any) => {
              const name = typeof t === 'string' ? t : (t?.name || t?.title);
              if (name && typeof name === 'string' && name.trim().length > 1) {
                topicsSet.add(name.trim());
              }
            });
          }
        } catch (_) {
          r.jeopardy_topics.split(',').forEach((t: string) => {
            if (t.trim().length > 1) topicsSet.add(t.trim());
          });
        }
      }
      if (r.topic && typeof r.topic === 'string' && r.topic !== 'Общие знания' && r.topic !== 'Разные' && r.topic.trim().length > 1) {
        topicsSet.add(r.topic.trim());
      }
    }
    res.json({ topics: Array.from(topicsSet) });
  } catch (err: any) {
    res.json({ topics: [] });
  }
});

function buildDifficultyCondition(colExpr: string, diff: string, pIdxRef: { val: number }, params: any[]): string | null {
  const d = diff.trim().toLowerCase();
  if (!d || d === 'all') return null;
  const groups: Record<string, string[]> = {
    dummy: ['dummy', 'easy', 'иикра', 'чайник', 'новичок', 'легк'],
    people: ['people', 'medium', 'головастик', 'обычн', 'средн', 'норм'],
    genius: ['genius', 'hard', 'квант', 'гений', 'сложн'],
    god: ['god', 'expert', 'ляга', 'бог', 'эксперт']
  };
  const keys = groups[d] || [d];
  const clauses = keys.map((k) => {
    params.push(`%${k}%`);
    return `LOWER(COALESCE(${colExpr}, 'people')) LIKE $${pIdxRef.val++}`;
  });
  return `(${clauses.join(' OR ')})`;
}

gameSessionsRouter.get('/', async (req, res) => {
  try {
    const {
      user_id,
      game_id,
      result,
      mode,
      difficulty,
      topic,
      q,
      sort_by = 'date',
      sort_order = 'desc',
      limit = '100',
      offset = '0',
      include_stats
    } = req.query;

    const limitNum = Math.min(200, Math.max(1, Number(limit) || 100));
    const offsetNum = Math.max(0, Number(offset) || 0);

    let whereSql = '1=1';
    const params: any[] = [];
    const pIdxRef = { val: 1 };

    let targetUserIds: string[] = [];
    if (user_id) {
      const uStr = String(user_id).trim();
      targetUserIds = [uStr];
      const user = await getOne(
        'SELECT id, uid, telegram_id FROM users WHERE id = $1 OR uid = $2 OR telegram_id::text = $3',
        [uStr, uStr, uStr]
      );
      if (user) {
        if (user.id && !targetUserIds.includes(user.id)) targetUserIds.push(user.id);
        if (user.uid && !targetUserIds.includes(user.uid)) targetUserIds.push(user.uid);
        if (user.telegram_id && !targetUserIds.includes(String(user.telegram_id))) targetUserIds.push(String(user.telegram_id));
      }

      const placeholders = targetUserIds.map(() => `$${pIdxRef.val++}`).join(',');
      whereSql += ` AND user_id IN (${placeholders})`;
      params.push(...targetUserIds);
    }

    if (game_id && game_id !== 'all') {
      const g = String(game_id).toLowerCase();
      if (g === 'jeopardy') {
        whereSql += ` AND (LOWER(COALESCE(game_id,'')) LIKE '%jeopardy%' OR LOWER(COALESCE(pack_id,'')) LIKE '%jeopardy%' OR LOWER(COALESCE(game_title,'')) LIKE '%своя%' OR LOWER(COALESCE(game_title,'')) LIKE '%икр%')`;
      } else if (g === 'blitz') {
        whereSql += ` AND (LOWER(COALESCE(game_id,'')) LIKE '%blitz%' OR LOWER(COALESCE(game_title,'')) LIKE '%блиц%' OR LOWER(COALESCE(game_title,'')) LIKE '%квииз%')`;
      } else if (g === 'whatwherewhen') {
        whereSql += ` AND (LOWER(COALESCE(game_id,'')) LIKE '%whatwherewhen%' OR LOWER(COALESCE(game_id,'')) LIKE '%chgk%' OR LOWER(COALESCE(game_title,'')) LIKE '%чтогдеквада%' OR LOWER(COALESCE(game_title,'')) LIKE '%что? где?%')`;
      } else if (g === '100to1') {
        whereSql += ` AND (LOWER(COALESCE(game_id,'')) LIKE '%100%' OR LOWER(COALESCE(game_title,'')) LIKE '%100%' OR LOWER(COALESCE(game_title,'')) LIKE '%сто%')`;
      } else {
        whereSql += ` AND game_id = $${pIdxRef.val++}`;
        params.push(String(game_id));
      }
    } else {
      whereSql += " AND (game_id IS NULL OR (game_id != 'free_millionaire' AND game_id NOT LIKE 'free_%')) AND (mode IS NULL OR mode != 'free') AND (game_title IS NULL OR (game_title NOT ILIKE '%Freeлионер%' AND game_title NOT ILIKE '%Free%'))";
    }

    if (mode === 'multi') {
      whereSql += ` AND (mode = 'multi' OR LOWER(COALESCE(game_title,'')) LIKE '%мульти%')`;
    } else if (mode === 'single') {
      whereSql += ` AND COALESCE(mode, 'single') != 'multi' AND LOWER(COALESCE(game_title,'')) NOT LIKE '%мульти%'`;
    }

    if (result === 'win') {
      whereSql += ' AND is_win = 1';
    } else if (result === 'loss') {
      whereSql += ' AND (is_win IS NULL OR is_win = 0)';
    }

    if (difficulty && String(difficulty) !== 'all' && String(game_id || '') !== 'jeopardy') {
      const diffCond = buildDifficultyCondition('difficulty', String(difficulty), pIdxRef, params);
      if (diffCond) whereSql += ` AND ${diffCond}`;
    }

    if (topic && String(topic).trim()) {
      whereSql += ` AND COALESCE(topic, '') ILIKE $${pIdxRef.val++}`;
      params.push(`%${String(topic).trim()}%`);
    }

    if (q && String(q).trim()) {
      const qs = `%${String(q).trim()}%`;
      whereSql += ` AND (COALESCE(game_title, '') ILIKE $${pIdxRef.val} OR COALESCE(topic, '') ILIKE $${pIdxRef.val + 1} OR COALESCE(difficulty, '') ILIKE $${pIdxRef.val + 2} OR COALESCE(pack_id, '') ILIKE $${pIdxRef.val + 3})`;
      params.push(qs, qs, qs, qs);
      pIdxRef.val += 4;
    }

    const dir = String(sort_order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const sb = String(sort_by);
    const orderBy =
      sb === 'title'
        ? `COALESCE(game_title, game_id, '') ${dir}, created_at DESC, id DESC`
        : sb === 'topic'
        ? `COALESCE(topic, '') ${dir}, created_at DESC, id DESC`
        : sb === 'gameType'
        ? `COALESCE(game_id, game_title, '') ${dir}, created_at DESC, id DESC`
        : `created_at ${dir}, id ${dir}`;

    const countRow = await getOne<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM game_sessions WHERE ${whereSql}`,
      params
    );
    const totalCount = Number(countRow?.total || 0);

    const dataSql = `SELECT * FROM game_sessions WHERE ${whereSql} ORDER BY ${orderBy} LIMIT $${pIdxRef.val} OFFSET $${pIdxRef.val + 1}`;
    const sessions = await getAll(dataSql, [...params, limitNum, offsetNum]);

    let stats: any = undefined;
    if (include_stats === '1') {
      const [aggRow, gameDistRows, diffDistRows, overallRow] = await Promise.all([
        getOne<{ total: number; wins: number; total_score: string | number }>(
          `SELECT COUNT(*)::int AS total,
                  COALESCE(SUM(CASE WHEN is_win = 1 THEN 1 ELSE 0 END), 0)::int AS wins,
                  COALESCE(SUM(COALESCE(score, 0)), 0)::bigint AS total_score
           FROM game_sessions WHERE ${whereSql}`,
          params
        ),
        getAll<{ game_id: string | null; game_title: string | null; cnt: number }>(
          `SELECT game_id, game_title, COUNT(*)::int AS cnt
           FROM game_sessions WHERE ${whereSql}
           GROUP BY game_id, game_title`,
          params
        ),
        getAll<{ difficulty: string | null; cnt: number }>(
          `SELECT COALESCE(NULLIF(difficulty, ''), 'people') AS difficulty, COUNT(*)::int AS cnt
           FROM game_sessions WHERE ${whereSql}
           GROUP BY COALESCE(NULLIF(difficulty, ''), 'people')`,
          params
        ),
        targetUserIds.length > 0
          ? getOne<{ total: number; wins: number }>(
              `SELECT COUNT(*)::int AS total,
                      COALESCE(SUM(CASE WHEN is_win = 1 THEN 1 ELSE 0 END), 0)::int AS wins
               FROM game_sessions
               WHERE user_id IN (${targetUserIds.map((_, idx) => `$${idx + 1}`).join(',')})
                 AND (game_id IS NULL OR (game_id != 'free_millionaire' AND game_id NOT LIKE 'free_%'))
                 AND (mode IS NULL OR mode != 'free')`,
              targetUserIds
            )
          : Promise.resolve(null)
      ]);

      const filteredTotal = Number(aggRow?.total || 0);
      const filteredWins = Number(aggRow?.wins || 0);
      const totalScore = Number(aggRow?.total_score || 0);
      stats = {
        totalCount: filteredTotal,
        wins: filteredWins,
        losses: Math.max(0, filteredTotal - filteredWins),
        winRate: filteredTotal > 0 ? Math.round((filteredWins / filteredTotal) * 100) : 0,
        totalScore,
        avgScore: filteredTotal > 0 ? Math.round(totalScore / filteredTotal) : 0,
        overallTotal: Number(overallRow?.total ?? filteredTotal),
        overallWins: Number(overallRow?.wins ?? filteredWins),
        byGame: gameDistRows || [],
        byDifficulty: diffDistRows || []
      };
    }

    res.json({
      data: sessions,
      totalCount,
      offset: offsetNum,
      limit: limitNum,
      hasMore: offsetNum + sessions.length < totalCount,
      ...(stats ? { stats } : {})
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

gameSessionsRouter.post('/', async (req, res) => {
  try {
    const {
      user_id, pack_id, session_id, game_id, game_title, score, total_questions,
      correct_answers, rounds_won, rounds_lost, round_results, mode, difficulty, topic, price_paid, is_win,
      jeopardy_topics
    } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id обязателен' });
    }

    const id = session_id || generateId('gs');
    const actualGameId = game_id || 'blitz';
    const computedTitle = game_title && game_title !== 'Игра Квайз' && game_title !== 'unknown'
      ? game_title
      : (actualGameId === 'millionaire' ? 'Квиллионер' :
         actualGameId === 'blitz' ? 'КвИИз' :
         actualGameId === 'jeopardy' ? 'Своя Икра' :
         actualGameId === '100to1' ? 'Сто Квадному' :
         actualGameId === 'whatwherewhen' ? 'ЧтоГдеКвада' :
         actualGameId === 'melody' ? 'Укавкай мелодию' : 'КвИИз');

    const effectivePackId = (pack_id && String(pack_id).trim() !== '' && pack_id !== 'null')
      ? String(pack_id).trim()
      : `pack_${actualGameId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const jeopardyTopicsJson = jeopardy_topics 
      ? (typeof jeopardy_topics === 'string' ? jeopardy_topics : JSON.stringify(jeopardy_topics))
      : null;

    // Database is authoritative truth for score calculation across all games and difficulty levels
    const scoreCalcResult = await calculateAuthoritativeScoreWithBreakdown({
      gameId: actualGameId,
      difficulty,
      score: Number(score || 0),
      correctAnswers: Number(correct_answers || 0),
      totalQuestions: Number(total_questions || 0),
      isWin: Boolean(is_win),
      rawScore: req.body.raw_score !== undefined ? Number(req.body.raw_score) : undefined,
      mode
    });
    const authoritativeScore = scoreCalcResult.authoritativeScore;

    await runSql(
      `INSERT INTO game_sessions (
        id, user_id, pack_id, session_id, game_id, game_title, score, total_questions,
        correct_answers, rounds_won, rounds_lost, round_results, mode, difficulty, topic, price_paid, is_win, jeopardy_topics
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        id,
        user_id,
        effectivePackId,
        session_id || id,
        actualGameId,
        computedTitle,
        authoritativeScore,
        total_questions || 0,
        correct_answers || 0,
        rounds_won !== undefined ? Number(rounds_won) : (actualGameId === '100to1' && correct_answers <= 4 ? Number(correct_answers) : (is_win ? 1 : 0)),
        rounds_lost !== undefined ? Number(rounds_lost) : (actualGameId === '100to1' ? Math.max(0, 4 - Number(correct_answers || 0)) : (is_win ? 0 : 1)),
        round_results ? (typeof round_results === 'string' ? round_results : JSON.stringify(round_results)) : null,
        mode || 'single',
        difficulty || 'people',
        topic || 'Общие знания',
        price_paid || 0,
        is_win ? 1 : 0,
        jeopardyTopicsJson
      ]
    );

    try {
      await runSql(
        `INSERT INTO game_packs (id, user_id, game_id, game_title, topic, difficulty, question_count, questions_json, play_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '[]', 1, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          effectivePackId,
          user_id,
          actualGameId,
          computedTitle,
          topic || 'Общие знания',
          difficulty || 'people',
          total_questions || 10
        ]
      );
      await runSql(
        `UPDATE game_packs SET play_count = COALESCE(play_count, 0) + 1, updated_at = NOW() WHERE id = $1`,
        [effectivePackId]
      );
    } catch (_) {}

    const created = await getOne('SELECT * FROM game_sessions WHERE id = $1', [id]);
    try {
      await recalculateUserBalancesFromTransactions(user_id);
    } catch (_) {}
    res.json({
      data: {
        ...(created || {}),
        score: authoritativeScore,
        calculation: scoreCalcResult
      },
      calculation: scoreCalcResult,
      authoritative_score: authoritativeScore
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Deduct ИИкра at answer attempt
gameSessionsRouter.post('/deduct_attempt', async (req, res) => {
  try {
    const { user_id, game_id } = req.body;
    if (!user_id || !game_id) {
      return res.status(400).json({ error: 'user_id и game_id обязательны' });
    }

    // Get game price from DB
    const game = await getOne('SELECT * FROM games WHERE id = $1', [game_id]);
    const pricePerQuestion = game ? Number(game.price_per_question || 1) : 1;

    // Get profile / user
    const profile = await getOne(
      'SELECT * FROM users WHERE id = $1 OR uid = $2 OR telegram_id = $3',
      [user_id, user_id, user_id]
    );

    if (!profile) {
      return res.status(404).json({ error: 'Профиль пользователя не найден' });
    }

    const currentBalance = Number(profile.balance ?? 0);

    if (currentBalance < pricePerQuestion) {
      return res.status(402).json({
        error: 'Недостаточно ИИкр для ответа на вопрос',
        required: pricePerQuestion,
        balance: currentBalance
      });
    }

    // Record transaction
    const txId = generateId('tx');
    await runSql(
      `INSERT INTO transactions (id, user_id, amount, currency, type, description, timestamp, created_at)
       VALUES ($1, $2, $3, 'ИИкра', 'attempt_deduction', $4, $5, NOW())`,
      [txId, profile.uid || profile.id, -pricePerQuestion, `Попытка ответа в игре ${game?.title || game_id}`, Date.now()]
    );

    const newBalance = await recalculateUserBalancesFromTransactions(profile.uid || profile.id);

    res.json({
      success: true,
      deducted: pricePerQuestion,
      new_balance: newBalance
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
