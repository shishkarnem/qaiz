import { Router } from 'express';
import { getAll, getOne, runSql, generateId } from '../db';

export const freeGamesRouter = Router();

// GET /api/free-games/millionaire
// Returns only completed millionaire packs from database available for free play
freeGamesRouter.get('/millionaire', async (req, res) => {
  try {
    const { user_id, filter, sort_by = 'date', order = 'desc', search } = req.query;
    const uStr = user_id ? String(user_id).trim() : '';

    const defaultAdminUser = await getOne(
      "SELECT id, uid, display_name, username, photo_url, avatar_url, telegram_photo FROM users WHERE uid = '10016926299' OR role IN ('admin', 'superadmin') ORDER BY created_at ASC LIMIT 1"
    );

    // Fetch completed millionaire packs: any pack that was completed in game_sessions,
    // marked completed in game_progress, or has play_count > 0.
    // Requirement: "Сразу по завершению, независимо от результата, даже если проигрыш или заново, надо выводить в список бесплатных игр"
    const packs = await getAll(`
      SELECT * FROM (
        SELECT DISTINCT ON (gp.id)
               gp.*,
               u.id AS author_id,
               u.uid AS author_uid,
               u.display_name AS author_name,
               u.first_name AS author_first_name,
               u.last_name AS author_last_name,
               u.username AS author_username,
               u.avatar_url AS author_avatar,
               u.photo_url AS author_photo,
               u.telegram_photo AS author_telegram_photo
        FROM game_packs gp
        LEFT JOIN users u ON gp.user_id = u.id OR gp.user_id = u.uid OR gp.user_id = CAST(u.telegram_id AS TEXT)
        WHERE (gp.game_id = 'millionaire' OR gp.game_title ILIKE '%Квиллионер%' OR gp.id LIKE 'pack_millionaire_%')
          AND (
            gp.id IN (
              SELECT DISTINCT pack_id FROM game_sessions
              WHERE pack_id IS NOT NULL AND (game_id = 'millionaire' OR game_id = 'free_millionaire')
            )
            OR gp.id IN (
              SELECT DISTINCT pack_id FROM game_progress
              WHERE is_completed = 1 AND (game_type = 'millionaire' OR game_type = 'free_millionaire')
            )
            OR COALESCE(gp.play_count, 0) > 0
          )
        ORDER BY gp.id, gp.created_at DESC
      ) sub
      ORDER BY sub.created_at DESC
    `);

    // Fetch user progress for free_millionaire
    let userProgressMap = new Map<string, any>();
    let userCompletedSessions = new Set<string>();

    if (uStr) {
      const user = await getOne(
        'SELECT id, uid, telegram_id FROM users WHERE id = $1 OR uid = $2 OR telegram_id::text = $3',
        [uStr, uStr, uStr]
      );
      const targetUserIds = [uStr];
      if (user) {
        if (user.id && !targetUserIds.includes(user.id)) targetUserIds.push(user.id);
        if (user.uid && !targetUserIds.includes(user.uid)) targetUserIds.push(user.uid);
        if (user.telegram_id && !targetUserIds.includes(String(user.telegram_id))) targetUserIds.push(String(user.telegram_id));
      }

      const placeholders = targetUserIds.map((_, idx) => `$${idx + 1}`).join(',');

      // Active and finished progress for this user in free mode
      const progressRows = await getAll(
        `SELECT pack_id, current_step, total_steps, is_completed, score, correct_answers, updated_at
         FROM game_progress 
         WHERE game_type = 'free_millionaire' AND user_id IN (${placeholders})`,
        targetUserIds
      );
      progressRows.forEach(pr => {
        if (pr.pack_id) userProgressMap.set(pr.pack_id, pr);
      });

      // Completed sessions in free mode
      const sessionRows = await getAll(
        `SELECT pack_id, score, correct_answers, total_questions, is_win FROM game_sessions 
         WHERE game_id = 'free_millionaire' AND user_id IN (${placeholders})`,
        targetUserIds
      );
      sessionRows.forEach(sr => {
        if (sr.pack_id) {
          userCompletedSessions.add(sr.pack_id);
          userProgressMap.set(`session_${sr.pack_id}`, sr);
        }
      });
    }

    // Process and enrich pack data
    const results = await Promise.all(packs.map(async (p) => {
      let questions: any[] = [];
      try {
        questions = JSON.parse(p.questions_json || '[]');
      } catch (_) {}

      if (!questions || questions.length === 0) {
        const gqRows = await getAll(
          'SELECT * FROM generated_questions WHERE pack_id = $1 ORDER BY question_index ASC',
          [p.id]
        );
        if (gqRows && gqRows.length > 0) {
          questions = gqRows.map(r => ({
            id: r.id,
            text: r.question,
            question: r.question,
            options: typeof r.options_json === 'string' ? JSON.parse(r.options_json) : (r.options_json || []),
            correctAnswer: r.answer,
            answer: r.answer,
            hint: r.hint || '',
            explanation: r.explanation || ''
          }));
        }
      }

      // Resolve author profile (with fallback to game_sessions creator or admin user)
      let authorUid = p.author_uid || p.author_id || null;
      let authorName =
        p.author_name ||
        (p.author_first_name ? `${p.author_first_name} ${p.author_last_name || ''}`.trim() : '') ||
        (p.author_username ? (p.author_username.startsWith('@') ? p.author_username : `@${p.author_username}`) : '');
      let authorAvatar = p.author_photo || p.author_avatar || p.author_telegram_photo || null;

      if (!authorUid) {
        const sessionCreator = await getOne(
          `SELECT u.id, u.uid, u.display_name, u.username, u.photo_url, u.avatar_url, u.telegram_photo
           FROM game_sessions gs
           JOIN users u ON gs.user_id = u.uid OR gs.user_id = u.id OR gs.user_id = CAST(u.telegram_id AS TEXT)
           WHERE gs.pack_id = $1
           ORDER BY gs.created_at ASC LIMIT 1`,
          [p.id]
        );
        if (sessionCreator) {
          authorUid = sessionCreator.uid || sessionCreator.id;
          authorName = sessionCreator.display_name || sessionCreator.username || authorName;
          authorAvatar = sessionCreator.photo_url || sessionCreator.avatar_url || sessionCreator.telegram_photo || authorAvatar;
        } else if (defaultAdminUser) {
          authorUid = defaultAdminUser.uid || defaultAdminUser.id || '10016926299';
          authorName = defaultAdminUser.display_name || defaultAdminUser.username || 'Тимошенко Денис';
          authorAvatar = defaultAdminUser.photo_url || defaultAdminUser.avatar_url || defaultAdminUser.telegram_photo || null;
        }
      }

      const author = authorName || 'Тимошенко Денис';
      const resolvedAuthorUid = authorUid || '10016926299';

      const pr = userProgressMap.get(p.id);
      const session = userProgressMap.get(`session_${p.id}`);
      const hasCompletedSession = userCompletedSessions.has(p.id);

      const isCompleted = hasCompletedSession || Boolean(pr && Number(pr.is_completed || 0) === 1);
      const currentStep = pr ? Number(pr.current_step || 0) : 0;
      const isInProgress = !isCompleted && currentStep > 0;

      const score = (pr && typeof pr.score === 'number' && pr.score > 0)
        ? Number(pr.score)
        : (session && typeof session.score === 'number' ? Number(session.score) : 0);

      const correctAnswers = (pr && typeof pr.correct_answers === 'number' && pr.correct_answers > 0)
        ? Number(pr.correct_answers)
        : (session && typeof session.correct_answers === 'number' ? Number(session.correct_answers) : (isCompleted ? 15 : currentStep));

      const isWin = Boolean(session?.is_win || score >= 1000000 || correctAnswers >= 15);

      let status: 'not_played' | 'in_progress' | 'completed' = 'not_played';
      if (isCompleted) {
        status = 'completed';
      } else if (isInProgress) {
        status = 'in_progress';
      }

      return {
        id: p.id,
        topic: p.topic || 'Общие знания',
        game_title: 'Freeлионер',
        original_game_title: p.game_title || 'Квиллионер',
        difficulty: p.difficulty || 'people',
        question_count: questions.length > 0 ? questions.length : (p.question_count || 15),
        questions: questions,
        author_uid: resolvedAuthorUid,
        author_name: author,
        author_avatar: authorAvatar,
        created_at: p.created_at,
        updated_at: p.updated_at,
        status,
        is_completed: isCompleted,
        is_in_progress: isInProgress,
        current_step: currentStep,
        total_steps: questions.length || 15,
        score,
        correct_answers: correctAnswers,
        is_win: isWin,
        can_play: status === 'not_played',
        can_resume: status === 'in_progress'
      };
    }));

    const playableResults = results.filter(p => p.questions && p.questions.length > 0);

    // Apply filters
    let filtered = playableResults;

    if (filter === 'not_played') {
      filtered = filtered.filter(p => p.status === 'not_played');
    } else if (filter === 'in_progress') {
      filtered = filtered.filter(p => p.status === 'in_progress');
    } else if (filter === 'completed') {
      filtered = filtered.filter(p => p.status === 'completed');
    }

    if (search && typeof search === 'string' && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(p => 
        p.topic.toLowerCase().includes(q) || 
        p.author_name.toLowerCase().includes(q) ||
        (p.id && p.id.toLowerCase().includes(q))
      );
    }

    // Apply sorting
    const isAsc = String(order).toLowerCase() === 'asc';
    filtered.sort((a, b) => {
      if (sort_by === 'topic') {
        const cmp = a.topic.localeCompare(b.topic, 'ru');
        return isAsc ? cmp : -cmp;
      }
      if (sort_by === 'progress') {
        const scoreA = a.status === 'in_progress' ? 2 : (a.status === 'not_played' ? 1 : 0);
        const scoreB = b.status === 'in_progress' ? 2 : (b.status === 'not_played' ? 1 : 0);
        return isAsc ? scoreA - scoreB : scoreB - scoreA;
      }
      // Default: date
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return isAsc ? timeA - timeB : timeB - timeA;
    });

    res.json({
      success: true,
      data: filtered,
      counts: {
        total: playableResults.length,
        not_played: playableResults.filter(p => p.status === 'not_played').length,
        in_progress: playableResults.filter(p => p.status === 'in_progress').length,
        completed: playableResults.filter(p => p.status === 'completed').length
      }
    });
  } catch (err: any) {
    console.error('[FreeGames Error]:', err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// GET /api/free-games/millionaire/:packId
freeGamesRouter.get('/millionaire/:packId', async (req, res) => {
  try {
    const { packId } = req.params;
    const { user_id } = req.query;

    const pack = await getOne('SELECT * FROM game_packs WHERE id = $1', [packId]);
    if (!pack) {
      return res.status(404).json({ success: false, error: 'Игра не найдена' });
    }

    let questions: any[] = [];
    try {
      questions = JSON.parse(pack.questions_json || '[]');
    } catch (_) {}

    if (!questions || questions.length === 0) {
      const gqRows = await getAll(
        'SELECT * FROM generated_questions WHERE pack_id = $1 ORDER BY question_index ASC',
        [packId]
      );
      if (gqRows && gqRows.length > 0) {
        questions = gqRows.map(r => ({
          id: r.id,
          text: r.question,
          question: r.question,
          options: typeof r.options_json === 'string' ? JSON.parse(r.options_json) : (r.options_json || []),
          correctAnswer: r.answer,
          answer: r.answer,
          hint: r.hint || '',
          explanation: r.explanation || ''
        }));
      }
    }

    // Check progress
    let progress = null;
    let isCompleted = false;

    if (user_id) {
      progress = await getOne(
        `SELECT * FROM game_progress WHERE user_id = $1 AND pack_id = $2 AND game_type = 'free_millionaire'`,
        [String(user_id), packId]
      );
      if (progress && typeof progress.state === 'string') {
        try { progress.state = JSON.parse(progress.state); } catch (_) {}
      }

      const session = await getOne(
        `SELECT id FROM game_sessions WHERE user_id = $1 AND pack_id = $2 AND game_id = 'free_millionaire'`,
        [String(user_id), packId]
      );
      if (session || (progress && Number(progress.is_completed || 0) === 1)) {
        isCompleted = true;
      }
    }

    res.json({
      success: true,
      data: {
        ...pack,
        pack: {
          ...pack,
          questions
        },
        game_title: 'Freeлионер',
        questions,
        progress,
        is_completed: isCompleted
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// POST /api/free-games/millionaire/progress
// Saves active progress or completion of a free game
freeGamesRouter.post('/millionaire/progress', async (req, res) => {
  try {
    const {
      user_id,
      pack_id,
      current_step,
      total_steps = 15,
      state,
      is_completed,
      score = 0,
      correct_answers = 0,
      topic
    } = req.body;

    if (!user_id || !pack_id) {
      return res.status(400).json({ success: false, error: 'user_id and pack_id required' });
    }

    const stateStr = typeof state === 'object' ? JSON.stringify(state) : (state || '{}');
    const isCompletedNum = is_completed ? 1 : 0;
    const stepNum = Number(current_step) || 0;
    const correctNum = Number(correct_answers) || 0;
    const scoreNum = Number(score) || 0;
    const isWin = Number(req.body.is_win) === 1 || scoreNum >= 1000000 || correctNum >= total_steps ? 1 : 0;

    const existing = await getOne(
      `SELECT id FROM game_progress WHERE user_id = $1 AND pack_id = $2 AND game_type = 'free_millionaire'`,
      [user_id, pack_id]
    );

    if (existing) {
      await runSql(
        `UPDATE game_progress 
         SET current_step = $1, total_steps = $2, state = $3, is_completed = $4, score = $5, correct_answers = $6, 
             topic = COALESCE($7, topic), updated_at = NOW()
         WHERE id = $8`,
        [stepNum, total_steps, stateStr, isCompletedNum, scoreNum, correctNum, topic || null, existing.id]
      );
    } else {
      const id = generateId('gp');
      await runSql(
        `INSERT INTO game_progress (id, user_id, pack_id, game_type, current_step, total_steps, state, is_completed, score, correct_answers, topic, updated_at)
         VALUES ($1, $2, $3, 'free_millionaire', $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [id, user_id, pack_id, stepNum, total_steps, stateStr, isCompletedNum, scoreNum, correctNum, topic || null]
      );
    }

    if (isCompletedNum === 1) {
      const existingSession = await getOne(
        `SELECT id FROM game_sessions WHERE user_id = $1 AND pack_id = $2 AND game_id = 'free_millionaire'`,
        [user_id, pack_id]
      );
      if (existingSession) {
        await runSql(
          `UPDATE game_sessions
           SET score = $1, correct_answers = $2, total_questions = $3, is_win = $4, mode = 'free', completed_at = NOW()
           WHERE id = $5`,
          [scoreNum, correctNum, total_steps, isWin, existingSession.id]
        );
      } else {
        const sessionId = generateId('gs');
        await runSql(
          `INSERT INTO game_sessions (
            id, user_id, pack_id, game_id, game_title, mode, score, total_questions, correct_answers, 
            topic, price_paid, is_win, created_at, completed_at
          ) VALUES ($1, $2, $3, 'free_millionaire', 'Freeлионер', 'free', $4, $5, $6, $7, 0, $8, NOW(), NOW())`,
          [sessionId, user_id, pack_id, scoreNum, total_steps, correctNum, topic || 'Общие знания', isWin]
        );
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[FreeGames Progress Error]:', err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});
