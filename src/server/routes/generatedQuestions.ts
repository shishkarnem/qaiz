import { Router } from 'express';
import { getAll, getOne, runSql, generateId } from '../db';

export const generatedQuestionsRouter = Router();

let userPackAnswersTableEnsured = false;

export async function ensureUserPackAnswersTable() {
  if (userPackAnswersTableEnsured) return;
  await runSql(`
    CREATE TABLE IF NOT EXISTS user_pack_answers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      question_index INTEGER NOT NULL,
      question_id TEXT,
      user_answer TEXT,
      is_answered INTEGER DEFAULT 0,
      is_correct INTEGER DEFAULT 0,
      is_skipped INTEGER DEFAULT 0,
      times_shown INTEGER DEFAULT 0,
      times_correct INTEGER DEFAULT 0,
      times_incorrect INTEGER DEFAULT 0,
      times_skipped INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, pack_id, question_index)
    )
  `).catch(() => {});
  userPackAnswersTableEnsured = true;
}

export async function enrichPackQuestionsWithAllSources(
  packId: string,
  dbQuestions: any[],
  requestUserId?: string
): Promise<any[]> {
  if (!packId) return dbQuestions;
  await ensureUserPackAnswersTable();

  const packRow = await getOne<any>('SELECT * FROM game_packs WHERE id = $1', [String(packId)]).catch(() => null);
  const mpRoom = await getOne<any>(
    'SELECT * FROM multiplayer_rooms WHERE pack_id = $1 ORDER BY created_at DESC LIMIT 1',
    [String(packId)]
  ).catch(() => null);
  const pr = requestUserId
    ? await getOne<any>(
        'SELECT * FROM game_progress WHERE pack_id = $1 AND user_id = $2 ORDER BY updated_at DESC LIMIT 1',
        [String(packId), String(requestUserId)]
      ).catch(() => null)
    : await getOne<any>(
        'SELECT * FROM game_progress WHERE pack_id = $1 ORDER BY updated_at DESC LIMIT 1',
        [String(packId)]
      ).catch(() => null);
  const fallbackPr = !pr
    ? await getOne<any>(
        'SELECT * FROM game_progress WHERE pack_id = $1 ORDER BY updated_at DESC LIMIT 1',
        [String(packId)]
      ).catch(() => null)
    : pr;

  const upaRows = await getAll<any>(
    'SELECT * FROM user_pack_answers WHERE pack_id = $1 ORDER BY updated_at DESC',
    [String(packId)]
  ).catch(() => []);

  let packQuestions: any[] = [];
  if (packRow?.questions_json) {
    try {
      const parsed = JSON.parse(packRow.questions_json);
      if (Array.isArray(parsed)) packQuestions = parsed;
    } catch (_) {}
  }

  let packTopics: any[] = [];
  if (packRow?.topics_json) {
    try {
      const parsed = JSON.parse(packRow.topics_json);
      if (Array.isArray(parsed)) packTopics = parsed;
    } catch (_) {}
  }

  let prState: any = {};
  if (fallbackPr?.state) {
    try {
      prState = typeof fallbackPr.state === 'string' ? JSON.parse(fallbackPr.state) : (fallbackPr.state || {});
    } catch (_) {}
  }

  let jState: any = {};
  if (mpRoom) {
    const rawJ = (mpRoom as any).game_state_json || mpRoom.state_json;
    if (rawJ) {
      try {
        const parsed = typeof rawJ === 'string' ? JSON.parse(rawJ) : rawJ;
        jState = parsed?.jeopardy_state || parsed || {};
      } catch (_) {}
    }
  }

  const effectiveGameId = String(
    packRow?.game_id || mpRoom?.game_id || fallbackPr?.game_type || dbQuestions[0]?.game_id || ''
  ).toLowerCase();
  const isJeopardy =
    effectiveGameId.includes('jeopardy') ||
    String(packId).includes('jeopardy') ||
    Boolean(jState?.categories || prState?.categories);

  const allTopicsList: { name: string; description?: string }[] =
    (Array.isArray(jState?.allTopics) && jState.allTopics.length > 0
      ? jState.allTopics
      : Array.isArray(prState?.allTopics) && prState.allTopics.length > 0
      ? prState.allTopics
      : packTopics) || [];

  let authoritativeTopic =
    prState?.gameTopic ||
    mpRoom?.topic ||
    packRow?.topic ||
    fallbackPr?.topic ||
    dbQuestions.find(q => q?.topic && q.topic !== 'Разные' && q.topic !== 'Общие знания')?.topic ||
    dbQuestions[0]?.topic ||
    'Общие знания';
  if (
    (authoritativeTopic === 'Разные' || authoritativeTopic === 'Общие знания') &&
    (prState?.gameTopic || (mpRoom?.topic && mpRoom.topic !== 'Общие знания') || (packRow?.topic && packRow.topic !== 'Общие знания'))
  ) {
    authoritativeTopic = prState?.gameTopic || mpRoom?.topic || packRow?.topic || authoritativeTopic;
  }

  // Build map of question_index -> metadata from Jeopardy categories (singleplayer & multiplayer)
  const jeopardyMetaByIndex = new Map<number, any>();
  const ingestCategoriesList = (catsList: any[], roundNum: number) => {
    if (!Array.isArray(catsList)) return;
    catsList.forEach((cat: any, catIdx: number) => {
      const catName = cat?.name || cat?.categoryName || '';
      const catDesc = cat?.description || cat?.categoryDescription || '';
      if (!Array.isArray(cat?.questions)) return;
      cat.questions.forEach((cq: any, qIdx: number) => {
        const computedIdx = Number(cq?.question_index) || ((roundNum - 1) * 25 + catIdx * 5 + qIdx + 1);
        const existing = jeopardyMetaByIndex.get(computedIdx) || {};
        jeopardyMetaByIndex.set(computedIdx, {
          ...existing,
          ...cq,
          question_index: computedIdx,
          round: roundNum,
          category: cq?.category || catName || existing.category || '',
          category_description: cq?.category_description || catDesc || existing.category_description || '',
          value: Number(cq?.value || existing.value || (qIdx + 1) * 100 * roundNum),
          isAnswered: Boolean(cq?.isAnswered || existing.isAnswered || Number(cq?.is_answered) === 1),
          is_answered: (cq?.isAnswered || Number(cq?.is_answered) === 1 || Number(existing.is_answered) === 1) ? 1 : 0
        });
      });
    });
  };

  if (prState?.pastRoundsCategories && typeof prState.pastRoundsCategories === 'object') {
    Object.entries(prState.pastRoundsCategories).forEach(([rKey, cList]) => {
      ingestCategoriesList(cList as any[], Number(rKey) || 1);
    });
  }
  if (Array.isArray(prState?.categories)) {
    ingestCategoriesList(prState.categories, Number(prState?.round) || 1);
  }
  if (jState?.pastRoundsCategories && typeof jState.pastRoundsCategories === 'object') {
    Object.entries(jState.pastRoundsCategories).forEach(([rKey, cList]) => {
      ingestCategoriesList(cList as any[], Number(rKey) || 1);
    });
  }
  if (Array.isArray(jState?.categories)) {
    ingestCategoriesList(jState.categories, Number(jState?.round) || 1);
  }
  if (jState?.finalQuestion) {
    const fq = jState.finalQuestion;
    const finalAnsMap = jState.finalAnswers || {};
    const finalEntries = Object.values(finalAnsMap) as any[];
    const myFinalEntry = requestUserId ? finalAnsMap[String(requestUserId)] : finalEntries[0];
    const anyAnsweredFinal = finalEntries.length > 0;
    const anyCorrectFinal = finalEntries.filter((e: any) => Boolean(e?.isCorrect ?? e?.is_correct)).length;
    const anyWrongFinal = finalEntries.filter((e: any) => !Boolean(e?.isCorrect ?? e?.is_correct)).length;
    jeopardyMetaByIndex.set(76, {
      ...fq,
      question_index: 76,
      round: 4,
      category: fq.category || jState.finalCategory || 'Суперфинал',
      value: Number(fq.value || 1000),
      isAnswered: Boolean(fq.isAnswered || anyAnsweredFinal),
      is_answered: (fq.isAnswered || anyAnsweredFinal) ? 1 : 0,
      is_correct: myFinalEntry ? (myFinalEntry.isCorrect ? 1 : 0) : (anyCorrectFinal > 0 ? 1 : 0),
      user_answer: myFinalEntry?.answer || fq.user_answer || '',
      times_shown: (fq.isAnswered || anyAnsweredFinal) ? 1 : 0,
      times_correct: anyCorrectFinal,
      times_incorrect: anyWrongFinal
    });
  }

  const dbByIndex = new Map<number, any>();
  dbQuestions.forEach((dq, idx) => {
    const qIdx = Number(dq?.question_index) || (idx + 1);
    dbByIndex.set(qIdx, dq);
  });

  const packByIndex = new Map<number, any>();
  packQuestions.forEach((pq, idx) => {
    const qIdx = Number(pq?.question_index) || (idx + 1);
    packByIndex.set(qIdx, pq);
  });

  const allIndicesSet = new Set<number>([
    ...Array.from(dbByIndex.keys()),
    ...Array.from(packByIndex.keys()),
    ...Array.from(jeopardyMetaByIndex.keys())
  ]);
  const sortedIndices = Array.from(allIndicesSet).filter(n => n > 0).sort((a, b) => a - b);

  if (sortedIndices.length === 0) return dbQuestions;

  const result: any[] = [];
  for (const qIdx of sortedIndices) {
    const dbQ = dbByIndex.get(qIdx) || {};
    const packQ = packByIndex.get(qIdx) || {};
    const jMeta = jeopardyMetaByIndex.get(qIdx) || {};

    // Filter out empty skeleton slots that haven't been generated yet
    const qText = String(jMeta.question || jMeta.text || dbQ.question || dbQ.text || packQ.question || packQ.text || '').trim();
    const qAns = String(jMeta.answer || jMeta.correctAnswer || dbQ.answer || dbQ.correctAnswer || packQ.answer || packQ.correctAnswer || '').trim();
    if (!qText && !qAns) continue;

    const matchingUpas = upaRows.filter(u => Number(u.question_index) === qIdx);
    const myUpa = requestUserId
      ? matchingUpas.find(u => String(u.user_id) === String(requestUserId)) || (isJeopardy ? matchingUpas[0] : null)
      : matchingUpas[0] || null;

    let resolvedCategory = jMeta.category || packQ.category || dbQ.category || packQ.categoryName || '';
    let resolvedValue = jMeta.value ?? packQ.value ?? dbQ.value;
    let resolvedCategoryDesc = jMeta.category_description || packQ.category_description || dbQ.category_description || '';
    const roundNum = isJeopardy ? (qIdx <= 25 ? 1 : qIdx <= 50 ? 2 : qIdx <= 75 ? 3 : 4) : (packQ.round || jMeta.round);

    if (isJeopardy) {
      const rawTitle = String(dbQ.title || packQ.title || '').trim();
      const titleMatch = rawTitle.match(/^(.+?)\s*\((\d+)\)$/);
      if (!resolvedCategory && titleMatch) {
        resolvedCategory = titleMatch[1].trim();
      }
      if (resolvedValue === undefined || resolvedValue === null) {
        if (titleMatch) {
          resolvedValue = Number(titleMatch[2]);
        } else if (qIdx <= 75) {
          resolvedValue = (((qIdx - 1) % 5) + 1) * 100 * roundNum;
        } else {
          resolvedValue = 1000;
        }
      }
      if (!resolvedCategory && rawTitle && rawTitle !== 'Вопрос' && !rawTitle.startsWith('Вопрос ')) {
        resolvedCategory = rawTitle;
      }
      if (qIdx <= 75) {
        const catIdxGlobal = (roundNum - 1) * 5 + Math.floor(((qIdx - 1) % 25) / 5);
        const topicEntry = allTopicsList[catIdxGlobal];
        if (!resolvedCategory && topicEntry?.name) {
          resolvedCategory = topicEntry.name;
        }
        if (!resolvedCategoryDesc && topicEntry?.description) {
          resolvedCategoryDesc = topicEntry.description;
        }
      } else if (!resolvedCategory) {
        resolvedCategory = jState?.finalCategory || 'Суперфинал';
      }
    }

    const userAnswer = String(
      myUpa?.user_answer ?? jMeta.user_answer ?? dbQ.user_answer ?? packQ.user_answer ?? ''
    ).trim();

    const isSkipped =
      Number(myUpa?.is_skipped) === 1 ||
      Number(jMeta.is_skipped) === 1 ||
      Number(dbQ.is_skipped) === 1 ||
      Number(packQ.is_skipped) === 1 ||
      userAnswer === 'Не знаю' ||
      userAnswer === 'Не знаю ответ' ||
      userAnswer === 'Время вышло' ||
      userAnswer === 'Время на ответ (15 сек) истекло' ||
      userAnswer === 'Пропущено' ||
      userAnswer === 'Вопрос пропущен' ||
      userAnswer === 'Никто не ответил'
        ? 1
        : 0;

    const isAnswered =
      Number(myUpa?.is_answered) === 1 ||
      Boolean(jMeta.isAnswered) ||
      Number(jMeta.is_answered) === 1 ||
      Number(dbQ.is_answered) === 1 ||
      Number(packQ.is_answered) === 1 ||
      Boolean(userAnswer)
        ? 1
        : 0;

    const isCorrect =
      Number(myUpa?.is_correct) === 1 ||
      Number(jMeta.is_correct) === 1 ||
      Number(dbQ.is_correct) === 1 ||
      Number(packQ.is_correct) === 1
        ? 1
        : 0;

    const upaCorrectSum = matchingUpas.reduce((acc, u) => acc + (Number(u.times_correct) || (Number(u.is_correct) === 1 ? 1 : 0)), 0);
    const upaIncorrectSum = matchingUpas.reduce(
      (acc, u) => acc + (Number(u.times_incorrect) || (Number(u.is_answered) === 1 && Number(u.is_correct) === 0 && Number(u.is_skipped) === 0 ? 1 : 0)),
      0
    );
    const upaSkippedSum = matchingUpas.reduce((acc, u) => acc + (Number(u.times_skipped) || (Number(u.is_skipped) === 1 ? 1 : 0)), 0);

    const rawTimesCorrect = Math.max(
      Number(dbQ.times_correct || 0),
      Number(jMeta.times_correct || 0),
      Number(packQ.times_correct || 0),
      upaCorrectSum
    );
    const rawTimesIncorrect = Math.max(
      Number(dbQ.times_incorrect || 0),
      Number(jMeta.times_incorrect || 0),
      Number(packQ.times_incorrect || 0),
      upaIncorrectSum
    );
    const rawTimesSkipped = Math.max(
      Number(dbQ.times_skipped || 0),
      Number(jMeta.times_skipped || 0),
      Number(packQ.times_skipped || 0),
      upaSkippedSum
    );

    const timesCorrect = isAnswered === 1 && isCorrect === 1 ? Math.max(1, rawTimesCorrect) : rawTimesCorrect;
    const timesSkipped = isSkipped === 1 ? Math.max(1, rawTimesSkipped) : rawTimesSkipped;
    const timesIncorrect =
      isAnswered === 1 && isCorrect === 0 && isSkipped === 0 ? Math.max(1, rawTimesIncorrect) : rawTimesIncorrect;

    const rawTimesShown = Math.max(
      Number(dbQ.times_shown || 0),
      Number(jMeta.times_shown || 0),
      Number(packQ.times_shown || 0),
      Number(myUpa?.times_shown || 0)
    );
    const timesShown =
      isAnswered === 1 || isSkipped === 1 || timesCorrect > 0 || timesIncorrect > 0 || timesSkipped > 0
        ? Math.max(1, rawTimesShown, timesCorrect + timesIncorrect + timesSkipped > 0 ? 1 : 0)
        : rawTimesShown;

    let optionsArr: any[] = [];
    if (Array.isArray(packQ.options)) optionsArr = packQ.options;
    else if (Array.isArray(jMeta.options)) optionsArr = jMeta.options;
    else if (dbQ.options_json) {
      try {
        const parsed = JSON.parse(dbQ.options_json);
        if (Array.isArray(parsed)) optionsArr = parsed;
      } catch (_) {}
    }

    result.push({
      ...packQ,
      ...dbQ,
      ...jMeta,
      id: dbQ.id || jMeta.db_id || jMeta.id || packQ.id || `gq_${packId}_${qIdx}`,
      pack_id: String(packId),
      game_id: effectiveGameId || dbQ.game_id || 'jeopardy',
      question_index: qIdx,
      round: roundNum,
      topic: authoritativeTopic,
      game_topic: authoritativeTopic,
      category: resolvedCategory || undefined,
      categoryName: resolvedCategory || undefined,
      category_description: resolvedCategoryDesc || undefined,
      value: resolvedValue,
      question: qText,
      text: qText,
      answer: qAns,
      correctAnswer: qAns,
      correct_answer: qAns,
      options: optionsArr,
      options_json: dbQ.options_json || (optionsArr.length > 0 ? JSON.stringify(optionsArr) : null),
      hint: jMeta.hint || dbQ.hint || packQ.hint || '',
      explanation: jMeta.explanation || dbQ.explanation || packQ.explanation || '',
      user_answer: userAnswer,
      is_answered: isAnswered,
      isAnswered: Boolean(isAnswered === 1),
      is_correct: isCorrect,
      is_skipped: isSkipped,
      times_shown: timesShown,
      times_correct: timesCorrect,
      times_incorrect: timesIncorrect,
      times_skipped: timesSkipped
    });
  }

  return result;
}

// GET /api/generated-questions
generatedQuestionsRouter.get('/', async (req, res) => {
  try {
    await ensureUserPackAnswersTable();
    const { user_id, game_id, topic, pack_id, limit = '1000' } = req.query;
    let sql = 'SELECT * FROM generated_questions WHERE 1=1';
    const params: any[] = [];
    let pIdx = 1;

    if (user_id && !pack_id) {
      const uStr = String(user_id).trim();
      const targetUserIds = [uStr];
      const user = await getOne(
        'SELECT id, uid, telegram_id FROM users WHERE id = $1 OR uid = $2 OR telegram_id::text = $3',
        [uStr, uStr, uStr]
      );
      if (user) {
        if (user.id && !targetUserIds.includes(user.id)) targetUserIds.push(user.id);
        if (user.uid && !targetUserIds.includes(user.uid)) targetUserIds.push(user.uid);
        if (user.telegram_id && !targetUserIds.includes(String(user.telegram_id))) targetUserIds.push(String(user.telegram_id));
      }
      const placeholders = targetUserIds.map(() => `$${pIdx++}`).join(',');
      sql += ` AND user_id IN (${placeholders})`;
      params.push(...targetUserIds);
    }
    if (pack_id) {
      sql += ` AND pack_id = $${pIdx++}`;
      params.push(String(pack_id));
    }
    if (game_id) {
      const cleanGame = String(game_id).replace(/_questions|_all_questions|_categories/, '').trim();
      sql += ` AND (game_id = $${pIdx} OR game_id ILIKE $${pIdx + 1})`;
      params.push(cleanGame, `${cleanGame}%`);
      pIdx += 2;
    }

    if (topic) {
      const tStr = String(topic).trim();
      const tokens = tStr.split(/[\s,._-]+/).map(s => s.trim()).filter(s => s.length >= 2);
      
      const topicClauses: string[] = [
        `topic = $${pIdx}`,
        `topic ILIKE $${pIdx + 1}`,
        `$${pIdx + 2} ILIKE '%' || topic || '%'`
      ];
      params.push(tStr, `%${tStr}%`, tStr);
      pIdx += 3;

      for (const tok of tokens) {
        topicClauses.push(`topic ILIKE $${pIdx++}`);
        params.push(`%${tok}%`);
      }

      sql += ` AND (${topicClauses.join(' OR ')})`;
    }

    if (pack_id) {
      sql += ` ORDER BY question_index ASC, created_at ASC, id ASC LIMIT $${pIdx++}`;
    } else {
      sql += ` ORDER BY created_at DESC, question_index ASC LIMIT $${pIdx++}`;
    }
    params.push(Math.min(2000, Math.max(1, Number(limit) || 1000)));

    const questions = await getAll(sql, params);
    if (pack_id) {
      const enriched = await enrichPackQuestionsWithAllSources(
        String(pack_id),
        questions,
        user_id ? String(user_id) : undefined
      );
      return res.json({ data: enriched });
    }
    res.json({ data: questions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/generated-questions/pack/:pack_id
generatedQuestionsRouter.get('/pack/:pack_id', async (req, res) => {
  try {
    await ensureUserPackAnswersTable();
    const { pack_id } = req.params;
    const { user_id } = req.query;
    const questions = await getAll(
      'SELECT * FROM generated_questions WHERE pack_id = $1 ORDER BY question_index ASC, id ASC',
      [pack_id]
    );
    const enriched = await enrichPackQuestionsWithAllSources(
      String(pack_id),
      questions,
      user_id ? String(user_id) : undefined
    );
    res.json({ data: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/generated-questions/stats
generatedQuestionsRouter.get('/stats', async (req, res) => {
  try {
    const { user_id, game_id } = req.query;
    let sql = 'SELECT COUNT(*)::int as total_questions, COALESCE(SUM(is_answered), 0)::int as answered_count, COALESCE(SUM(is_correct), 0)::int as correct_count, COALESCE(SUM(times_shown), 0)::int as total_shown, COALESCE(SUM(times_skipped), 0)::int as total_skipped FROM generated_questions WHERE 1=1';
    const params: any[] = [];
    let pIdx = 1;

    if (user_id) {
      const uStr = String(user_id).trim();
      const targetUserIds = [uStr];
      const user = await getOne(
        'SELECT id, uid, telegram_id FROM users WHERE id = $1 OR uid = $2 OR telegram_id::text = $3',
        [uStr, uStr, uStr]
      );
      if (user) {
        if (user.id && !targetUserIds.includes(user.id)) targetUserIds.push(user.id);
        if (user.uid && !targetUserIds.includes(user.uid)) targetUserIds.push(user.uid);
        if (user.telegram_id && !targetUserIds.includes(String(user.telegram_id))) targetUserIds.push(String(user.telegram_id));
      }
      const placeholders = targetUserIds.map(() => `$${pIdx++}`).join(',');
      sql += ` AND user_id IN (${placeholders})`;
      params.push(...targetUserIds);
    }
    if (game_id) {
      sql += ` AND game_id = $${pIdx++}`;
      params.push(String(game_id));
    }

    const stats = await getAll(sql, params);
    const row = stats[0] || {};
    const totalQ = Number(row.total_questions || 0);
    const answered = Number(row.answered_count || 0);
    const correct = Number(row.correct_count || 0);
    const incorrect = Math.max(0, answered - correct);
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

    res.json({
      data: {
        total_questions: totalQ,
        answered_count: answered,
        correct_count: correct,
        incorrect_count: incorrect,
        accuracy_rate: accuracy,
        total_shown: Number(row.total_shown || 0),
        total_skipped: Number(row.total_skipped || 0)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generated-questions/show (mark question as shown/viewed)
generatedQuestionsRouter.post('/show', async (req, res) => {
  try {
    await ensureUserPackAnswersTable();
    const { id, pack_id, question_index, user_id, is_replay, category, topic, value } = req.body;
    if (!id && (!pack_id || question_index === undefined)) {
      return res.status(400).json({ error: 'id или (pack_id + question_index) обязателен' });
    }

    let targetSql = 'id = $4';
    let targetParams: any[] = [id];

    if (pack_id && question_index !== undefined) {
      targetSql = '(pack_id = $4 AND question_index = $5)' + (id ? ' OR id = $6' : '');
      targetParams = id ? [String(pack_id), Number(question_index), String(id)] : [String(pack_id), Number(question_index)];
    }

    if (is_replay) {
      await runSql(
        `UPDATE generated_questions 
         SET times_shown = COALESCE(times_shown, 0) + 1,
             category = COALESCE(NULLIF($1, ''), category),
             topic = COALESCE(NULLIF($2, ''), topic),
             value = COALESCE($3, value)
         WHERE ${targetSql}`,
        [category || null, topic || null, value !== undefined ? Number(value) : null, ...targetParams]
      );
    } else {
      await runSql(
        `UPDATE generated_questions 
         SET times_shown = CASE WHEN COALESCE(times_shown, 0) = 0 THEN 1 ELSE times_shown END,
             category = COALESCE(NULLIF($1, ''), category),
             topic = COALESCE(NULLIF($2, ''), topic),
             value = COALESCE($3, value)
         WHERE ${targetSql}`,
        [category || null, topic || null, value !== undefined ? Number(value) : null, ...targetParams]
      );
    }

    if (user_id && pack_id && question_index !== undefined) {
      const upaId = `upa_${user_id}_${pack_id}_${question_index}`;
      await runSql(
        `INSERT INTO user_pack_answers (id, user_id, pack_id, question_index, times_shown, updated_at)
         VALUES ($1, $2, $3, $4, 1, NOW())
         ON CONFLICT (user_id, pack_id, question_index) DO UPDATE SET
           times_shown = CASE WHEN $5 = 1 THEN COALESCE(user_pack_answers.times_shown, 0) + 1 ELSE GREATEST(COALESCE(user_pack_answers.times_shown, 0), 1) END,
           updated_at = NOW()`,
        [upaId, String(user_id), String(pack_id), Number(question_index), is_replay ? 1 : 0]
      ).catch(() => {});
    }

    if (pack_id) {
      await runSql(
        `UPDATE game_packs 
         SET play_count = (
           SELECT COALESCE(MAX(times_shown), 1) FROM generated_questions WHERE pack_id = $1
         )
         WHERE id = $2`,
        [pack_id, pack_id]
      ).catch(() => {});
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generated-questions/answer
generatedQuestionsRouter.post('/answer', async (req, res) => {
  try {
    await ensureUserPackAnswersTable();
    const { id, pack_id, question_index, user_id, user_answer, is_correct, is_skipped, category, topic, value } = req.body;
    if (!id && (!pack_id || question_index === undefined)) {
      return res.status(400).json({ error: 'id или (pack_id + question_index) обязателен' });
    }

    const isCorrectNum = is_correct ? 1 : 0;
    const isSkippedNum = is_skipped ? 1 : 0;
    const isIncorrectNum = (!is_correct && !is_skipped) ? 1 : 0;

    let targetSelectWhere = 'id = $1';
    let targetParams: any[] = [id];

    if (pack_id && question_index !== undefined) {
      targetSelectWhere = '(pack_id = $1 AND question_index = $2)' + (id ? ' OR id = $3' : '');
      targetParams = id ? [String(pack_id), Number(question_index), String(id)] : [String(pack_id), Number(question_index)];
    }

    let qRow = await getOne<{ id: string; user_id: string; pack_id: string; game_id: string; question_index: number; is_answered: number; is_correct: number; times_correct: number; times_incorrect: number }>(
      `SELECT id, user_id, pack_id, game_id, question_index, is_answered, is_correct, times_correct, times_incorrect FROM generated_questions WHERE ${targetSelectWhere}`,
      targetParams
    );

    if (!qRow && pack_id) {
      const packRow = await getOne<any>('SELECT * FROM game_packs WHERE id = $1', [String(pack_id)]);
      if (packRow && packRow.questions_json) {
        try {
          const parsedQs = JSON.parse(packRow.questions_json || '[]');
          if (Array.isArray(parsedQs) && parsedQs.length > 0) {
            for (let i = 0; i < parsedQs.length; i++) {
              const pq = parsedQs[i];
              const qIdxVal = Number(pq.question_index) || (i + 1);
              const qId = pq.id && String(pq.id).startsWith('gq_') ? String(pq.id) : `gq_${packRow.id}_${qIdxVal}`;
              const qText = pq.text || pq.question || `Вопрос ${qIdxVal}`;
              const qAns = pq.correctAnswer || pq.answer || '';
              const pqCat = pq.category || pq.categoryName || null;
              const pqVal = pq.value !== undefined ? Number(pq.value) : null;
              await runSql(
                `INSERT INTO generated_questions (id, user_id, pack_id, game_id, topic, title, category, value, difficulty, question_index, question, answer, options_json, hint, explanation, is_answered, is_correct, user_answer, times_shown, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 0, 0, NULL, 1, NOW())
                 ON CONFLICT (id) DO NOTHING`,
                [
                  qId,
                  String(user_id || packRow.user_id || 'usr_guest'),
                  String(packRow.id),
                  String(packRow.game_id || 'blitz'),
                  String(packRow.topic || 'Общие знания'),
                  String(pqCat ? (pqVal ? `${pqCat} (${pqVal})` : pqCat) : (pq.title || 'Вопрос')),
                  pqCat,
                  pqVal,
                  String(packRow.difficulty || 'people'),
                  qIdxVal,
                  String(qText),
                  String(qAns),
                  pq.options ? JSON.stringify(pq.options) : null,
                  pq.hint || null,
                  pq.explanation || null
                ]
              );
            }
            qRow = await getOne(
              `SELECT id, user_id, pack_id, game_id, question_index, is_answered, is_correct, times_correct, times_incorrect FROM generated_questions WHERE ${targetSelectWhere}`,
              targetParams
            );
          }
        } catch (_) {}
      }
    }

    const effPackId = pack_id || qRow?.pack_id;
    const effUserId = user_id || qRow?.user_id;
    const effIndex = question_index !== undefined ? Number(question_index) : (qRow?.question_index || 1);
    const effGameId = qRow?.game_id || 'blitz';

    const addCorrect = isCorrectNum === 1 ? 1 : 0;
    const addIncorrect = isIncorrectNum === 1 ? 1 : 0;
    const addSkipped = isSkippedNum === 1 ? 1 : 0;

    if (effUserId && effPackId && effIndex > 0) {
      const upaId = `upa_${effUserId}_${effPackId}_${effIndex}`;
      await runSql(
        `INSERT INTO user_pack_answers (id, user_id, pack_id, question_index, user_answer, is_answered, is_correct, is_skipped, times_shown, times_correct, times_incorrect, times_skipped, updated_at)
         VALUES ($1, $2, $3, $4, $5, 1, $6, $7, 1, $8, $9, $10, NOW())
         ON CONFLICT (user_id, pack_id, question_index) DO UPDATE SET
           user_answer = EXCLUDED.user_answer,
           is_answered = 1,
           is_correct = EXCLUDED.is_correct,
           is_skipped = EXCLUDED.is_skipped,
           times_shown = GREATEST(COALESCE(user_pack_answers.times_shown, 0), 1),
           times_correct = COALESCE(user_pack_answers.times_correct, 0) + $11,
           times_incorrect = COALESCE(user_pack_answers.times_incorrect, 0) + $12,
           times_skipped = COALESCE(user_pack_answers.times_skipped, 0) + $13,
           updated_at = NOW()`,
        [
          upaId,
          String(effUserId),
          String(effPackId),
          Number(effIndex),
          user_answer || '',
          isCorrectNum,
          isSkippedNum,
          addCorrect,
          addIncorrect,
          addSkipped,
          addCorrect,
          addIncorrect,
          addSkipped
        ]
      ).catch(() => {});
    }

    const mpRoomForPack = effPackId
      ? await getOne<any>('SELECT id, game_id FROM multiplayer_rooms WHERE pack_id = $1 LIMIT 1', [String(effPackId)]).catch(() => null)
      : null;

    if (!mpRoomForPack || mpRoomForPack.game_id === 'jeopardy' || effGameId === 'jeopardy') {
      const baseCount = 8;
      const whereClause =
        pack_id && question_index !== undefined
          ? `(pack_id = $${baseCount + 1} AND question_index = $${baseCount + 2})` + (id ? ` OR id = $${baseCount + 3}` : '')
          : `id = $${baseCount + 1}`;
      await runSql(
        `UPDATE generated_questions 
         SET is_answered = 1,
             is_correct = $1,
             user_answer = $2,
             category = COALESCE(NULLIF($3, ''), category),
             topic = COALESCE(NULLIF($4, ''), topic),
             value = COALESCE($5, value),
             times_shown = CASE WHEN COALESCE(times_shown, 0) = 0 THEN 1 ELSE times_shown END,
             times_correct = COALESCE(times_correct, 0) + $6,
             times_incorrect = COALESCE(times_incorrect, 0) + $7,
             times_skipped = COALESCE(times_skipped, 0) + $8,
             answered_at = NOW()
         WHERE ${whereClause}`,
        [
          isCorrectNum,
          user_answer || '',
          category || null,
          topic || null,
          value !== undefined ? Number(value) : null,
          addCorrect,
          addIncorrect,
          addSkipped,
          ...targetParams
        ]
      );
    } else {
      const baseCount = 6;
      const whereClause =
        pack_id && question_index !== undefined
          ? `(pack_id = $${baseCount + 1} AND question_index = $${baseCount + 2})` + (id ? ` OR id = $${baseCount + 3}` : '')
          : `id = $${baseCount + 1}`;
      await runSql(
        `UPDATE generated_questions 
         SET category = COALESCE(NULLIF($1, ''), category),
             topic = COALESCE(NULLIF($2, ''), topic),
             value = COALESCE($3, value),
             times_shown = CASE WHEN COALESCE(times_shown, 0) = 0 THEN 1 ELSE times_shown END,
             times_correct = COALESCE(times_correct, 0) + $4,
             times_incorrect = COALESCE(times_incorrect, 0) + $5,
             times_skipped = COALESCE(times_skipped, 0) + $6,
             answered_at = NOW()
         WHERE ${whereClause}`,
        [
          category || null,
          topic || null,
          value !== undefined ? Number(value) : null,
          addCorrect,
          addIncorrect,
          addSkipped,
          ...targetParams
        ]
      );
    }

    let packTotalSteps = 10;
    if (effPackId) {
      const packRow = await getOne<any>('SELECT questions_json, question_count FROM game_packs WHERE id = $1', [String(effPackId)]);
      if (packRow) {
        packTotalSteps = Number(packRow.question_count) || 10;
        try {
          const packQs = JSON.parse(packRow.questions_json || '[]');
          if (Array.isArray(packQs) && packQs.length > 0) {
            packTotalSteps = Math.max(packTotalSteps, packQs.length);
            if (!mpRoomForPack || mpRoomForPack.game_id === 'jeopardy' || effGameId === 'jeopardy') {
              const matchIdx = packQs.findIndex((pq: any, idx: number) => (Number(pq?.question_index) || (idx + 1)) === effIndex);
              const targetIdx0 = matchIdx >= 0 ? matchIdx : Math.max(0, effIndex - 1);
              if (packQs[targetIdx0]) {
                const prevQ = packQs[targetIdx0];
                packQs[targetIdx0] = {
                  ...prevQ,
                  category: category || prevQ.category || prevQ.categoryName,
                  value: value !== undefined ? Number(value) : prevQ.value,
                  is_answered: 1,
                  isAnswered: true,
                  is_correct: isCorrectNum,
                  is_skipped: isSkippedNum,
                  user_answer: user_answer || '',
                  times_shown: Math.max(1, Number(prevQ.times_shown) || 0),
                  times_correct: (Number(prevQ.times_correct) || 0) + addCorrect,
                  times_incorrect: (Number(prevQ.times_incorrect) || 0) + addIncorrect,
                  times_skipped: (Number(prevQ.times_skipped) || 0) + addSkipped
                };
                await runSql(
                  `UPDATE game_packs SET questions_json = $1, updated_at = NOW() WHERE id = $2`,
                  [JSON.stringify(packQs), String(effPackId)]
                );
              }
            }
          }
        } catch (_) {}
      }
    }

    if (effPackId && effUserId) {
      const existing = await getOne<{ id: string; current_step: number; total_steps: number; state: string }>(
        'SELECT id, current_step, total_steps, state FROM game_progress WHERE user_id = $1 AND pack_id = $2',
        [String(effUserId), String(effPackId)]
      );
      
      const userCountRow = await getOne<{ answered_count: number; correct_count: number }>(
        'SELECT COUNT(*)::int as answered_count, COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0)::int as correct_count FROM user_pack_answers WHERE user_id = $1 AND pack_id = $2 AND (is_answered = 1 OR is_skipped = 1)',
        [String(effUserId), String(effPackId)]
      ).catch(() => null);

      const actualCount = effGameId === 'jeopardy'
        ? Number(userCountRow?.answered_count || 1)
        : Math.max(Number(userCountRow?.answered_count || 0), effIndex);
      const actualCorrect = Number(userCountRow?.correct_count || 0);

      if (existing) {
        let stateObj: any = {};
        try {
          if (typeof existing.state === 'string') stateObj = JSON.parse(existing.state);
          else if (typeof existing.state === 'object') stateObj = existing.state || {};
        } catch (_) {}
        if (effGameId !== 'jeopardy') {
          stateObj.currentIndex = Math.max(Number(stateObj.currentIndex || 0), effIndex);
        }
        if (Array.isArray(stateObj.questions) && stateObj.questions[effIndex - 1]) {
          stateObj.questions[effIndex - 1] = {
            ...stateObj.questions[effIndex - 1],
            is_answered: 1,
            is_correct: isCorrectNum,
            is_skipped: isSkippedNum,
            user_answer: user_answer || ''
          };
        }

        await runSql(
          `UPDATE game_progress SET current_step = $1, state = $2, correct_answers = $3, updated_at = NOW() WHERE id = $4`,
          [Math.max(Number(existing.current_step || 0), actualCount), JSON.stringify(stateObj), actualCorrect, existing.id]
        );
      } else {
        const gpId = generateId('gp');
        const stateObj = { currentIndex: effIndex };
        await runSql(
          `INSERT INTO game_progress (id, user_id, pack_id, game_type, current_step, total_steps, correct_answers, state, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
          [gpId, String(effUserId), String(effPackId), effGameId, actualCount, packTotalSteps, actualCorrect, JSON.stringify(stateObj)]
        );
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generated-questions
generatedQuestionsRouter.post('/', async (req, res) => {
  try {
    await ensureUserPackAnswersTable();
    const { user_id, pack_id, game_id, topic, questions, title, question, answer, explanation } = req.body;

    const itemsToInsert: Array<{
      id: string;
      user_id: string;
      pack_id?: string;
      game_id: string;
      topic?: string;
      title?: string;
      category?: string;
      value?: number | null;
      category_description?: string;
      difficulty?: string;
      question_index?: number;
      question: string;
      answer: string;
      options_json?: string | null;
      hint?: string;
      explanation?: string;
    }> = [];

    if (Array.isArray(questions) && questions.length > 0) {
      questions.forEach((q: any, idx: number) => {
        const qText = q.text || q.question || '';
        const qAns = q.correctAnswer || q.answer || (Array.isArray(q.answers) ? q.answers.map((a: any) => a.text).join(', ') : '') || (Array.isArray(q.options) && q.correct_index !== undefined ? q.options[q.correct_index] : '');
        const effectiveUserId = q.user_id || user_id || 'usr_guest';
        const effectiveGameId = q.game_id || game_id || 'blitz';
        const effectivePackId = q.pack_id || pack_id || null;

        if (qText) {
          const qIdx = q.question_index !== undefined ? Number(q.question_index) : (idx + 1);
          const rawQId = q.id ? String(q.id) : '';
          const safeQId = (rawQId.startsWith('gq_') && (!effectivePackId || rawQId.includes(String(effectivePackId))))
            ? rawQId
            : `gq_${effectivePackId || Date.now()}_${qIdx}`;
          const rawTitle = String(q.title || title || '').trim();
          const parsedTitleCat = rawTitle.match(/^(.+?)\s*\((\d+)\)$/);
          const qCategory = q.category || q.categoryName || (parsedTitleCat ? parsedTitleCat[1].trim() : '');
          const qValue = q.value !== undefined && q.value !== null
            ? Number(q.value)
            : (parsedTitleCat ? Number(parsedTitleCat[2]) : null);
          itemsToInsert.push({
            id: safeQId,
            user_id: String(effectiveUserId),
            pack_id: effectivePackId ? String(effectivePackId) : undefined,
            game_id: String(effectiveGameId),
            topic: q.topic || topic || 'Общие знания',
            title: qCategory ? (qValue ? `${qCategory} (${qValue})` : qCategory) : (q.categoryName || q.title || title || 'Вопрос'),
            category: qCategory || undefined,
            value: qValue,
            category_description: q.category_description || q.categoryDescription || '',
            difficulty: q.difficulty || 'people',
            question_index: qIdx,
            question: String(qText),
            answer: String(qAns || ''),
            options_json: q.options_json || (q.options ? JSON.stringify(q.options) : (q.answers ? JSON.stringify(q.answers) : null)),
            hint: q.hint || '',
            explanation: q.explanation || q.comment || ''
          });
        }
      });
    } else if (question) {
      itemsToInsert.push({
        id: generateId('gq'),
        user_id: String(user_id || 'usr_guest'),
        pack_id: pack_id ? String(pack_id) : undefined,
        game_id: String(game_id || 'blitz'),
        topic: topic || 'Общие знания',
        title: title || 'Вопрос',
        category: req.body.category || undefined,
        value: req.body.value !== undefined ? Number(req.body.value) : null,
        category_description: req.body.category_description || '',
        question: String(question),
        answer: String(answer || ''),
        explanation: explanation || ''
      });
    }

    for (const item of itemsToInsert) {
      await runSql(
        `INSERT INTO generated_questions (
          id, user_id, pack_id, game_id, topic, title, category, value, category_description, difficulty, question_index, question, answer, options_json, hint, explanation, times_shown, times_correct, times_incorrect, times_skipped, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 0, 0, 0, 0, NOW())
        ON CONFLICT (id) DO UPDATE SET
          pack_id = COALESCE(EXCLUDED.pack_id, generated_questions.pack_id),
          user_id = EXCLUDED.user_id,
          topic = COALESCE(NULLIF(EXCLUDED.topic, ''), generated_questions.topic),
          title = COALESCE(NULLIF(EXCLUDED.title, ''), generated_questions.title),
          category = COALESCE(NULLIF(EXCLUDED.category, ''), generated_questions.category),
          value = COALESCE(EXCLUDED.value, generated_questions.value),
          category_description = COALESCE(NULLIF(EXCLUDED.category_description, ''), generated_questions.category_description),
          question = EXCLUDED.question,
          answer = EXCLUDED.answer,
          options_json = COALESCE(EXCLUDED.options_json, generated_questions.options_json),
          hint = COALESCE(EXCLUDED.hint, generated_questions.hint),
          explanation = COALESCE(EXCLUDED.explanation, generated_questions.explanation),
          question_index = COALESCE(EXCLUDED.question_index, generated_questions.question_index)`,
        [
          item.id,
          item.user_id,
          item.pack_id || null,
          item.game_id,
          item.topic || 'Общие знания',
          item.title || '',
          item.category || null,
          item.value ?? null,
          item.category_description || '',
          item.difficulty || 'people',
          item.question_index || 0,
          item.question,
          item.answer,
          item.options_json || null,
          item.hint || null,
          item.explanation || null
        ]
      );
    }

    res.json({ success: true, count: itemsToInsert.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
