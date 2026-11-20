import { Router } from 'express';
import { getAll, getOne, runSql, generateId } from '../db';
import { ensureUserPackAnswersTable, enrichPackQuestionsWithAllSources } from './generatedQuestions';
import { healMultiplayerPacksAndParticipants } from './multiplayer';

export const gamePacksRouter = Router();

function parseTimestampMs(val: unknown): number {
  if (!val) return NaN;
  if (val instanceof Date) return val.getTime();
  const s = String(val).trim();
  if (!s) return NaN;
  if (/[Zz]$|[+-]\d{2}(:?\d{2})?$/.test(s)) {
    return new Date(s).getTime();
  }
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  return new Date(`${iso}Z`).getTime();
}

function buildPackDifficultyCond(diff: string, pIdxRef: { val: number }, params: any[]): string | null {
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
    return `LOWER(COALESCE(gp.difficulty, 'people')) LIKE $${pIdxRef.val++}`;
  });
  return `(${clauses.join(' OR ')})`;
}

// GET /api/game-packs (list packs with optional filters, pagination & lightweight summary mode)
gamePacksRouter.get('/', async (req, res) => {
  try {
    await ensureUserPackAnswersTable();
    await healMultiplayerPacksAndParticipants();
    const {
      user_id,
      game_id,
      mode,
      difficulty,
      topic,
      q,
      limit = '100',
      offset = '0',
      summary,
      sort_by = 'date',
      sort_order = 'desc'
    } = req.query;

    const isSummary = summary === '1' || summary === 'true';
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
      const p1 = targetUserIds.map(() => `$${pIdxRef.val++}`).join(',');
      params.push(...targetUserIds);
      const p2 = targetUserIds.map(() => `$${pIdxRef.val++}`).join(',');
      params.push(...targetUserIds);
      whereSql += ` AND (gp.user_id IN (${p1}) OR gp.id IN (
        SELECT mr.pack_id FROM multiplayer_rooms mr
        JOIN multiplayer_participants mp ON mp.room_id = mr.id
        WHERE mr.pack_id IS NOT NULL AND mp.user_id IN (${p2})
      ))`;
    }

    if (game_id && game_id !== 'all') {
      const g = String(game_id).toLowerCase();
      if (g === 'jeopardy') {
        whereSql += ` AND (LOWER(COALESCE(gp.game_id,'')) LIKE '%jeopardy%' OR LOWER(gp.id) LIKE '%jeopardy%' OR LOWER(COALESCE(gp.game_title,'')) LIKE '%своя%' OR LOWER(COALESCE(gp.game_title,'')) LIKE '%икр%')`;
      } else if (g === 'blitz') {
        whereSql += ` AND LOWER(COALESCE(gp.game_id,'')) LIKE '%blitz%'`;
      } else if (g === '100to1') {
        whereSql += ` AND LOWER(COALESCE(gp.game_id,'')) LIKE '%100%'`;
      } else if (g === 'whatwherewhen') {
        whereSql += ` AND (LOWER(COALESCE(gp.game_id,'')) LIKE '%whatwherewhen%' OR LOWER(COALESCE(gp.game_id,'')) LIKE '%chgk%' OR LOWER(COALESCE(gp.game_id,'')) LIKE '%чтогдеквада%')`;
      } else {
        whereSql += ` AND gp.game_id = $${pIdxRef.val++}`;
        params.push(String(game_id));
      }
    }

    if (mode === 'multi') {
      whereSql += ` AND (
        EXISTS (SELECT 1 FROM multiplayer_rooms mr WHERE mr.pack_id = gp.id)
        OR EXISTS (
          SELECT 1 FROM game_progress pr
          WHERE pr.pack_id = gp.id
            AND (COALESCE(pr.state,'') ILIKE '%"isMultiplayer":true%' OR COALESCE(pr.state,'') ILIKE '%"playMode":"multi"%')
        )
      )`;
    } else if (mode === 'single') {
      whereSql += ` AND NOT EXISTS (SELECT 1 FROM multiplayer_rooms mr WHERE mr.pack_id = gp.id)
        AND NOT EXISTS (
          SELECT 1 FROM game_progress pr
          WHERE pr.pack_id = gp.id
            AND (COALESCE(pr.state,'') ILIKE '%"isMultiplayer":true%' OR COALESCE(pr.state,'') ILIKE '%"playMode":"multi"%')
        )`;
    }

    if (difficulty && String(difficulty) !== 'all' && String(game_id || '') !== 'jeopardy') {
      const diffCond = buildPackDifficultyCond(String(difficulty), pIdxRef, params);
      if (diffCond) whereSql += ` AND ${diffCond}`;
    }

    if (topic && String(topic).trim()) {
      whereSql += ` AND (COALESCE(gp.topic, '') ILIKE $${pIdxRef.val++})`;
      params.push(`%${String(topic).trim()}%`);
    }

    if (q && String(q).trim()) {
      const query = `%${String(q).trim()}%`;
      whereSql += ` AND (COALESCE(gp.topic, '') ILIKE $${pIdxRef.val} OR COALESCE(gp.game_title, '') ILIKE $${pIdxRef.val + 1} OR COALESCE(gp.difficulty, '') ILIKE $${pIdxRef.val + 2} OR gp.id ILIKE $${pIdxRef.val + 3})`;
      params.push(query, query, query, query);
      pIdxRef.val += 4;
    }

    const dir = String(sort_order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const sb = String(sort_by);
    const orderBy =
      sb === 'title'
        ? `COALESCE(gp.game_title, gp.game_id, '') ${dir}, gp.updated_at DESC, gp.id DESC`
        : sb === 'topic'
        ? `COALESCE(gp.topic, '') ${dir}, gp.updated_at DESC, gp.id DESC`
        : sb === 'gameType'
        ? `COALESCE(gp.game_id, gp.game_title, '') ${dir}, gp.updated_at DESC, gp.id DESC`
        : `gp.updated_at ${dir}, gp.id ${dir}`;

    const countRow = await getOne<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM game_packs gp WHERE ${whereSql}`,
      params
    );
    const totalCount = Number(countRow?.total || 0);

    const selectCols = isSummary
      ? 'gp.id, gp.user_id, gp.game_id, gp.game_title, gp.topic, gp.difficulty, gp.question_count, gp.play_count, gp.created_at, gp.updated_at'
      : 'gp.*';

    const packs = await getAll(
      `SELECT ${selectCols} FROM game_packs gp WHERE ${whereSql} ORDER BY ${orderBy} LIMIT $${pIdxRef.val} OFFSET $${pIdxRef.val + 1}`,
      [...params, limitNum, offsetNum]
    );

    if (packs.length === 0) {
      return res.json({
        data: [],
        totalCount,
        offset: offsetNum,
        limit: limitNum,
        hasMore: false
      });
    }

    const packIds = packs.map((p: any) => p.id).filter(Boolean);
    const packPlaceholders = packIds.map((_: any, i: number) => `$${i + 1}`).join(',');

    // Run scoped enrichment queries ONLY for the current batch of packIds (never scan whole DB tables!)
    const [progressList, userAnswers, directMpRooms, qStatsList, sessionPackRows, allDbQuestions] = await Promise.all([
      getAll<any>(
        `SELECT pack_id, user_id, current_step, total_steps, is_completed, topic, state
         FROM game_progress
         WHERE pack_id IN (${packPlaceholders})`,
        packIds
      ).catch(() => []),
      targetUserIds.length > 0
        ? getAll<any>(
            `SELECT pack_id, question_index, user_answer, is_answered, is_correct
             FROM user_pack_answers
             WHERE pack_id IN (${packPlaceholders})
               AND user_id IN (${targetUserIds.map((_, idx) => `$${packIds.length + idx + 1}`).join(',')})`,
            [...packIds, ...targetUserIds]
          ).catch(() => [])
        : Promise.resolve([]),
      getAll<any>(
        `SELECT * FROM multiplayer_rooms WHERE pack_id IN (${packPlaceholders}) ORDER BY created_at DESC`,
        packIds
      ).catch(() => []),
      getAll<any>(
        `SELECT pack_id,
                COUNT(*)::int as total_q,
                COALESCE(SUM(CASE WHEN is_answered = 1 THEN 1 ELSE 0 END), 0)::int as answered_q,
                COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0)::int as correct_q,
                COALESCE(MAX(times_shown), 0)::int as max_shown
         FROM generated_questions
         WHERE pack_id IN (${packPlaceholders})
         GROUP BY pack_id`,
        packIds
      ).catch(() => []),
      targetUserIds.length > 0
        ? getAll<{ pack_id: string }>(
            `SELECT DISTINCT pack_id FROM game_sessions
             WHERE pack_id IN (${packPlaceholders})
               AND user_id IN (${targetUserIds.map((_, idx) => `$${packIds.length + idx + 1}`).join(',')})`,
            [...packIds, ...targetUserIds]
          ).catch(() => [])
        : getAll<{ pack_id: string }>(
            `SELECT DISTINCT pack_id FROM game_sessions WHERE pack_id IN (${packPlaceholders})`,
            packIds
          ).catch(() => []),
      isSummary
        ? Promise.resolve([])
        : getAll<any>(
            `SELECT id, user_id, pack_id, game_id, topic, title, category, value, category_description,
                    question_index, question, answer, options_json, hint, explanation, user_answer,
                    is_answered, is_correct, times_shown, times_correct, times_incorrect, times_skipped
             FROM generated_questions
             WHERE pack_id IN (${packPlaceholders})
             ORDER BY pack_id, question_index ASC`,
            packIds
          ).catch(() => [])
    ]);

    const completedPackSet = new Set<string>(
      (sessionPackRows || []).map((r: any) => String(r.pack_id || '')).filter(Boolean)
    );

    const progressMap = new Map<string, any>();
    progressList.forEach(pr => {
      if (pr.pack_id) {
        if (targetUserIds.length > 0) {
          if (targetUserIds.includes(String(pr.user_id))) {
            progressMap.set(pr.pack_id, pr);
          }
        } else if (!progressMap.has(pr.pack_id)) {
          progressMap.set(pr.pack_id, pr);
        }
      }
    });

    const userAnswersByPackMap = new Map<string, any[]>();
    userAnswers.forEach((ua: any) => {
      if (ua.pack_id) {
        if (!userAnswersByPackMap.has(ua.pack_id)) userAnswersByPackMap.set(ua.pack_id, []);
        userAnswersByPackMap.get(ua.pack_id)!.push(ua);
      }
    });

    // Check if any progress state references explicit mpRoomId not matched by pack_id
    const explicitRoomIds: string[] = [];
    for (const p of packs) {
      const pr = progressMap.get(p.id);
      if (pr?.state) {
        try {
          const prState = typeof pr.state === 'string' ? JSON.parse(pr.state) : pr.state;
          if (prState?.mpRoomId && !directMpRooms.some((mr: any) => mr.id === prState.mpRoomId)) {
            explicitRoomIds.push(String(prState.mpRoomId));
          }
        } catch (_) {}
      }
    }
    let extraMpRooms: any[] = [];
    if (explicitRoomIds.length > 0) {
      const rPh = explicitRoomIds.map((_, idx) => `$${idx + 1}`).join(',');
      extraMpRooms = await getAll<any>(`SELECT * FROM multiplayer_rooms WHERE id IN (${rPh})`, explicitRoomIds).catch(() => []);
    }

    const mpRooms = [...directMpRooms, ...extraMpRooms];
    const mpRoomByPackMap = new Map<string, any>();
    mpRooms.forEach((mr: any) => {
      if (mr.pack_id && !mpRoomByPackMap.has(mr.pack_id)) {
        mpRoomByPackMap.set(mr.pack_id, mr);
      }
    });

    const roomIds = mpRooms.map((mr: any) => mr.id).filter(Boolean);
    const mpPartsByRoomMap = new Map<string, any[]>();
    if (roomIds.length > 0) {
      const roomPh = roomIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const batchParts = await getAll<any>(
        `SELECT * FROM multiplayer_participants WHERE room_id IN (${roomPh})`,
        roomIds
      ).catch(() => []);
      batchParts.forEach((mp: any) => {
        if (mp.room_id) {
          if (!mpPartsByRoomMap.has(mp.room_id)) mpPartsByRoomMap.set(mp.room_id, []);
          mpPartsByRoomMap.get(mp.room_id)!.push(mp);
        }
      });
    }

    for (const p of packs) {
      if (!mpRoomByPackMap.has(p.id)) {
        const pr = progressMap.get(p.id);
        let prState: any = {};
        if (pr?.state) {
          try {
            prState = typeof pr.state === 'string' ? JSON.parse(pr.state) : pr.state;
          } catch (_) {}
        }
        if (prState?.isMultiplayer === false || prState?.playMode === 'single') {
          continue;
        }
        if (prState?.mpRoomId) {
          const explicitRoom = mpRooms.find((mr: any) => mr.id === prState.mpRoomId);
          if (explicitRoom) {
            mpRoomByPackMap.set(p.id, explicitRoom);
          }
        }
      }
    }

    const qStatsMap = new Map<string, any>();
    qStatsList.forEach(qs => {
      if (qs.pack_id) qStatsMap.set(qs.pack_id, qs);
    });

    const questionsByPackMap = new Map<string, any[]>();
    if (!isSummary) {
      allDbQuestions.forEach(q => {
        if (q.pack_id) {
          if (!questionsByPackMap.has(q.pack_id)) {
            questionsByPackMap.set(q.pack_id, []);
          }
          questionsByPackMap.get(q.pack_id)!.push(q);
        }
      });
    }

    const parsed = packs.map(p => {
      let questions: any[] | undefined = undefined;
      if (!isSummary) {
        questions = [];
        try {
          questions = JSON.parse(p.questions_json || '[]');
        } catch (_) {}

        const dbPackQuestions = questionsByPackMap.get(p.id);
        if (dbPackQuestions && dbPackQuestions.length > 0) {
          if (questions && questions.length > 0) {
            questions = questions.map((q: any, idx: number) => {
              const dbQ =
                dbPackQuestions.find((dq: any) => dq.id && q.id && String(dq.id) === String(q.id) && String(q.id).startsWith('gq_')) ||
                dbPackQuestions.find((dq: any) => Number(dq.question_index) === idx + 1) ||
                dbPackQuestions[idx];
              if (dbQ) {
                const qText = q.text || q.question || dbQ.question;
                const qAns = q.correctAnswer || q.answer || dbQ.answer;
                return {
                  ...q,
                  ...dbQ,
                  text: qText,
                  question: qText,
                  answer: qAns,
                  correctAnswer: qAns,
                  explanation: q.explanation || dbQ.explanation || '',
                  hint: q.hint || dbQ.hint || '',
                  options: q.options || (dbQ.options_json ? JSON.parse(dbQ.options_json) : [])
                };
              }
              return q;
            });
          } else {
            questions = dbPackQuestions.map((dbQ: any) => ({
              ...dbQ,
              text: dbQ.question,
              correctAnswer: dbQ.answer,
              options: dbQ.options_json ? JSON.parse(dbQ.options_json) : []
            }));
          }
        }
      }

      const qStat = qStatsMap.get(p.id);
      const pr = progressMap.get(p.id);
      let prState: any = {};
      if (pr) {
        try {
          prState = typeof pr.state === 'string' ? JSON.parse(pr.state) : (pr.state || {});
        } catch (_) {}
      }

      let authoritativeTopic = p.topic;
      if (p.game_id === 'jeopardy') {
        if (prState.gameTopic) {
          authoritativeTopic = prState.gameTopic;
        } else if (pr?.topic && pr.topic !== 'Разные' && pr.topic !== 'Общие знания') {
          authoritativeTopic = pr.topic;
        }
      }
      const displayTitle = p.game_id === 'jeopardy' ? 'Своя Икра' : p.game_title;

      const rawTotalSteps = p.question_count || (Array.isArray(questions) ? questions.length : 0) || qStat?.total_q || 10;
      const totalSteps = p.game_id === 'jeopardy' ? Math.max(75, rawTotalSteps) : (p.game_id === '100to1' ? Math.max(24, rawTotalSteps) : rawTotalSteps);
      const mpRoom = mpRoomByPackMap.get(p.id);
      const mpParts = mpRoom ? (mpPartsByRoomMap.get(mpRoom.id) || []) : [];
      const myMpPart = mpRoom
        ? (targetUserIds.length > 0
            ? mpParts.find((mp: any) => targetUserIds.includes(String(mp.user_id))) || null
            : mpParts[0] || null)
        : null;

      let mpFinishRemainingSeconds: number | null = null;
      let mpStatus = mpRoom?.status || null;
      if (mpRoom && mpStatus === 'active' && mpRoom.finish_deadline_at) {
        const deadlineMs = parseTimestampMs(mpRoom.finish_deadline_at);
        if (!isNaN(deadlineMs)) {
          mpFinishRemainingSeconds = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
          if (mpFinishRemainingSeconds <= 0) {
            mpStatus = 'finished';
          }
        }
      }

      const myPackUserAnswers = userAnswersByPackMap.get(p.id) || [];
      const answeredByUserTable = myPackUserAnswers.filter((ua: any) => Number(ua.is_answered) === 1).length;
      const correctByUserTable = myPackUserAnswers.filter((ua: any) => Number(ua.is_correct) === 1).length;

      if (!isSummary && questions) {
        if (mpRoom && p.game_id !== 'jeopardy') {
          const myRoundLimit = myMpPart ? Math.max(1, Number(myMpPart.current_round) || 1) : 1;
          const myIsFin = myMpPart ? Number(myMpPart.is_finished) === 1 : false;
          questions = questions.map((q: any, idx: number) => {
            const qIdx = Number(q.question_index) || (idx + 1);
            const ua = myPackUserAnswers.find((a: any) => Number(a.question_index) === qIdx);
            if (ua) {
              return {
                ...q,
                is_answered: Number(ua.is_answered) || 0,
                is_correct: Number(ua.is_correct) || 0,
                user_answer: ua.user_answer || ''
              };
            }
            if (!myIsFin && qIdx >= myRoundLimit) {
              return { ...q, is_answered: 0, is_correct: 0, user_answer: '' };
            }
            return q;
          });
        } else if (p.game_id === 'jeopardy') {
          let jStateObj: any = {};
          if (mpRoom) {
            const rawJ = (mpRoom as any).game_state_json || mpRoom.state_json;
            if (rawJ) {
              try {
                const parsedJ = typeof rawJ === 'string' ? JSON.parse(rawJ) : rawJ;
                jStateObj = parsedJ?.jeopardy_state || parsedJ || {};
              } catch (_) {}
            }
          }
          const jMetaMap = new Map<number, any>();
          const collectCats = (catsList: any[], rNum: number) => {
            if (!Array.isArray(catsList)) return;
            catsList.forEach((cat: any, cIdx: number) => {
              const cName = cat?.name || cat?.categoryName || '';
              const cDesc = cat?.description || cat?.categoryDescription || '';
              if (!Array.isArray(cat?.questions)) return;
              cat.questions.forEach((cq: any, qIdx: number) => {
                const idxNum = Number(cq?.question_index) || ((rNum - 1) * 25 + cIdx * 5 + qIdx + 1);
                jMetaMap.set(idxNum, {
                  ...cq,
                  question_index: idxNum,
                  round: rNum,
                  category: cq?.category || cName,
                  category_description: cq?.category_description || cDesc,
                  value: Number(cq?.value || (qIdx + 1) * 100 * rNum)
                });
              });
            });
          };
          if (prState?.pastRoundsCategories && typeof prState.pastRoundsCategories === 'object') {
            Object.entries(prState.pastRoundsCategories).forEach(([rk, cl]) => collectCats(cl as any[], Number(rk) || 1));
          }
          if (Array.isArray(prState?.categories)) collectCats(prState.categories, Number(prState?.round) || 1);
          if (jStateObj?.pastRoundsCategories && typeof jStateObj.pastRoundsCategories === 'object') {
            Object.entries(jStateObj.pastRoundsCategories).forEach(([rk, cl]) => collectCats(cl as any[], Number(rk) || 1));
          }
          if (Array.isArray(jStateObj?.categories)) collectCats(jStateObj.categories, Number(jStateObj?.round) || 1);

          questions = questions.map((q: any, idx: number) => {
            const qIdx = Number(q.question_index) || (idx + 1);
            const jm = jMetaMap.get(qIdx) || {};
            const ua = myPackUserAnswers.find((a: any) => Number(a.question_index) === qIdx);
            const rawTitle = String(q.title || '').trim();
            const titleMatch = rawTitle.match(/^(.+?)\s*\((\d+)\)$/);
            const catName = jm.category || q.category || q.categoryName || (titleMatch ? titleMatch[1].trim() : '');
            const valNum = jm.value ?? q.value ?? (titleMatch ? Number(titleMatch[2]) : undefined);
            const isAns = (Number(ua?.is_answered) === 1 || Boolean(jm.isAnswered) || Number(jm.is_answered) === 1 || Number(q.is_answered) === 1) ? 1 : 0;
            const isCor = (Number(ua?.is_correct) === 1 || Number(jm.is_correct) === 1 || Number(q.is_correct) === 1) ? 1 : 0;
            const uAns = ua?.user_answer || jm.user_answer || q.user_answer || '';
            return {
              ...q,
              ...jm,
              topic: authoritativeTopic,
              category: catName || q.category,
              categoryName: catName || q.categoryName,
              value: valNum,
              is_answered: isAns,
              isAnswered: Boolean(isAns === 1),
              is_correct: isCor,
              user_answer: uAns,
              times_shown: Math.max(Number(q.times_shown || 0), Number(jm.times_shown || 0), isAns ? 1 : 0),
              times_correct: Math.max(Number(q.times_correct || 0), Number(jm.times_correct || 0), isAns && isCor ? 1 : 0),
              times_incorrect: Math.max(Number(q.times_incorrect || 0), Number(jm.times_incorrect || 0), isAns && !isCor ? 1 : 0)
            };
          });
        }
      }

      const answeredInJson = Array.isArray(questions)
        ? questions.filter((q: any) => Number(q?.is_answered) === 1 || Boolean(q?.user_answer)).length
        : 0;
      const correctInJson = Array.isArray(questions)
        ? questions.filter((q: any) => Number(q?.is_correct) === 1).length
        : 0;

      const answeredFromQ = (mpRoom && p.game_id !== 'jeopardy')
        ? Math.max(answeredByUserTable, myMpPart ? Math.max(0, (Number(myMpPart.current_round) || 1) - 1) : 0)
        : Math.max(qStat ? Number(qStat.answered_q || 0) : 0, answeredInJson, answeredByUserTable);

      const mpMyFinished = myMpPart ? Number(myMpPart.is_finished) === 1 : false;
      const mpMyRound = myMpPart
        ? (mpMyFinished ? totalSteps : Math.min(totalSteps, Math.max(1, Number(myMpPart.current_round) || 1, answeredByUserTable + 1)))
        : 1;
      const mpCompletedSteps = mpMyFinished ? totalSteps : Math.max(0, mpMyRound - 1, answeredByUserTable);
      const sanitizedMpCorrect = myMpPart
        ? (mpMyFinished ? Number(myMpPart.correct_count || 0) : Math.min(Number(myMpPart.correct_count || 0), Math.max(mpCompletedSteps, answeredFromQ)))
        : 0;

      const correctFromQ = (mpRoom && p.game_id !== 'jeopardy')
        ? Math.max(correctByUserTable, sanitizedMpCorrect)
        : Math.max(qStat ? Number(qStat.correct_q || 0) : 0, correctInJson, correctByUserTable);

      const mpStep = mpRoom ? (p.game_id === 'jeopardy' ? Math.max(mpCompletedSteps, answeredFromQ, pr ? Number(pr.current_step || 0) : 0) : mpCompletedSteps) : 0;
      const rawStep = mpRoom
        ? mpStep
        : Math.max(pr ? Number(pr.current_step || 0) : 0, answeredFromQ);

      const isMpActiveOrWaiting = Boolean(mpRoom && (mpStatus === 'waiting' || mpStatus === 'active'));
      const currentStep = isMpActiveOrWaiting
        ? (mpMyFinished ? totalSteps : Math.min(totalSteps - 1, mpStep))
        : rawStep;

      const isUnfinished = isMpActiveOrWaiting
        ? true
        : (
            (!!pr && Number(pr.is_completed || 0) === 0 && currentStep > 0 && currentStep < totalSteps) ||
            (answeredFromQ > 0 && answeredFromQ < totalSteps && (!pr || Number(pr.is_completed || 0) === 0))
          );
      const isCompleted = !isUnfinished;

      const maxShown = qStat?.max_shown;
      let playCount = Number(p.play_count || 1);
      if (maxShown !== undefined && maxShown !== null && Number(maxShown) > 0) {
        playCount = Number(maxShown);
      }
      playCount = Math.max(1, playCount);

      return {
        ...p,
        topic: authoritativeTopic,
        game_title: displayTitle,
        play_count: playCount,
        question_count: totalSteps,
        questions_count: totalSteps,
        current_step: currentStep,
        total_steps: totalSteps,
        is_unfinished: isUnfinished,
        is_completed: isCompleted,
        has_completed_session: completedPackSet.has(String(p.id)),
        is_multiplayer: Boolean(mpRoom || prState?.isMultiplayer || prState?.playMode === 'multi'),
        mp_room_id: mpRoom?.id || prState?.mpRoomId || null,
        mp_status: mpStatus || (prState?.isMultiplayer || prState?.playMode === 'multi' ? 'active' : null),
        mp_finish_deadline_at: mpRoom?.finish_deadline_at || null,
        mp_finish_remaining_seconds: mpFinishRemainingSeconds,
        mp_my_round: mpRoom ? mpMyRound : null,
        mp_my_score: myMpPart ? Number(myMpPart.awarded_score ?? myMpPart.score ?? 0) : null,
        mp_my_correct: myMpPart ? Math.max(sanitizedMpCorrect, correctFromQ) : null,
        mp_my_finished: mpMyFinished,
        mp_participants_count: mpParts.length,
        mp_finished_count: mpParts.filter((mp: any) => Number(mp.is_finished) === 1).length,
        answered_count: Math.max(answeredFromQ, currentStep),
        correct_count: correctFromQ,
        ...(isSummary ? {} : { questions })
      };
    });

    res.json({
      data: parsed,
      totalCount,
      offset: offsetNum,
      limit: limitNum,
      hasMore: offsetNum + parsed.length < totalCount
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/game-packs/:id (get single pack with full questions)
gamePacksRouter.get('/:id', async (req, res) => {
  try {
    await ensureUserPackAnswersTable();
    await healMultiplayerPacksAndParticipants();
    const { id } = req.params;
    const { user_id } = req.query;
    const pack = await getOne('SELECT * FROM game_packs WHERE id = $1', [id]);
    if (!pack) {
      return res.status(404).json({ error: 'Пакет вопросов не найден' });
    }

    let questions = [];
    try {
      questions = JSON.parse(pack.questions_json || '[]');
    } catch (_) {}

    let topics = [];
    try {
      if ((pack as any).topics_json) {
        topics = JSON.parse((pack as any).topics_json);
      }
    } catch (_) {}

    const dbQuestions = await getAll(`
      SELECT 
        id, user_id, pack_id, game_id, topic, title, category, value, category_description,
        question_index, question, answer, 
        options_json, hint, explanation, user_answer, is_answered, is_correct, 
        times_shown, times_correct, times_incorrect, times_skipped
      FROM generated_questions 
      WHERE pack_id = $1 
      ORDER BY question_index ASC
    `, [id]);

    questions = await enrichPackQuestionsWithAllSources(
      String(id),
      dbQuestions,
      user_id ? String(user_id) : undefined
    );

    const mpRoom = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE pack_id = $1 ORDER BY created_at DESC LIMIT 1', [id]).catch(() => null);
    const mpParts = mpRoom
      ? await getAll<any>('SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY joined_at ASC', [mpRoom.id]).catch(() => [])
      : [];
    const pr = user_id
      ? await getOne<any>('SELECT * FROM game_progress WHERE pack_id = $1 AND user_id = $2 ORDER BY updated_at DESC LIMIT 1', [id, String(user_id)]).catch(() => null)
      : await getOne<any>('SELECT * FROM game_progress WHERE pack_id = $1 ORDER BY updated_at DESC LIMIT 1', [id]).catch(() => null);

    const myMpPart = mpRoom
      ? (user_id ? mpParts.find((mp: any) => String(mp.user_id) === String(user_id)) || null : mpParts[0] || null)
      : null;

    const myUserAnswers = user_id
      ? await getAll<any>('SELECT * FROM user_pack_answers WHERE pack_id = $1 AND user_id = $2', [id, String(user_id)]).catch(() => [])
      : [];

    if ((mpRoom || user_id) && Array.isArray(questions)) {
      const myRoundLimit = myMpPart ? Math.max(1, Number(myMpPart.current_round) || 1) : 1;
      const myIsFin = myMpPart ? Number(myMpPart.is_finished) === 1 : false;
      questions = questions.map((q: any, idx: number) => {
        const qIdx = Number(q.question_index) || (idx + 1);
        const ua = myUserAnswers.find((a: any) => Number(a.question_index) === qIdx);
        if (ua) {
          return {
            ...q,
            is_answered: Number(ua.is_answered) || 0,
            is_correct: Number(ua.is_correct) || 0,
            user_answer: ua.user_answer || ''
          };
        }
        if (mpRoom && !myIsFin && qIdx >= myRoundLimit) {
          return {
            ...q,
            is_answered: 0,
            is_correct: 0,
            user_answer: ''
          };
        }
        return q;
      });
    }

    let mpFinishRemainingSeconds: number | null = null;
    let mpStatus = mpRoom?.status || null;
    if (mpRoom && mpStatus === 'active' && mpRoom.finish_deadline_at) {
      const deadlineMs = parseTimestampMs(mpRoom.finish_deadline_at);
      if (!isNaN(deadlineMs)) {
        mpFinishRemainingSeconds = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
        if (mpFinishRemainingSeconds <= 0) {
          mpStatus = 'finished';
        }
      }
    }

    const totalSteps = Number(pack.question_count) || (Array.isArray(questions) ? questions.length : 10) || 10;
    const answeredByUserTable = myUserAnswers.filter((a: any) => Number(a.is_answered) === 1).length;
    const correctByUserTable = myUserAnswers.filter((a: any) => Number(a.is_correct) === 1).length;

    const answeredFromQ = mpRoom
      ? Math.max(answeredByUserTable, myMpPart ? Math.max(0, (Number(myMpPart.current_round) || 1) - 1) : 0)
      : (Array.isArray(questions)
          ? questions.filter((q: any) => Number(q?.is_answered) === 1 || Boolean(q?.user_answer)).length
          : 0);

    const mpMyFinished = myMpPart ? Number(myMpPart.is_finished) === 1 : false;
    const mpMyRound = myMpPart
      ? (mpMyFinished ? totalSteps : Math.min(totalSteps, Math.max(1, Number(myMpPart.current_round) || 1, answeredByUserTable + 1)))
      : 1;
    const mpCompletedSteps = mpMyFinished ? totalSteps : Math.max(0, mpMyRound - 1, answeredByUserTable);
    const sanitizedMpCorrect = myMpPart
      ? (mpMyFinished ? Number(myMpPart.correct_count || 0) : Math.min(Number(myMpPart.correct_count || 0), mpCompletedSteps))
      : 0;

    const correctFromQ = mpRoom
      ? Math.max(correctByUserTable, sanitizedMpCorrect)
      : (Array.isArray(questions)
          ? questions.filter((q: any) => Number(q?.is_correct) === 1).length
          : 0);

    const mpStep = mpRoom ? mpCompletedSteps : 0;
    const rawStep = mpRoom
      ? mpCompletedSteps
      : Math.max(pr ? Number(pr.current_step || 0) : 0, answeredFromQ);
    const isMpActiveOrWaiting = Boolean(mpRoom && (mpStatus === 'waiting' || mpStatus === 'active'));
    const currentStep = isMpActiveOrWaiting
      ? (mpMyFinished ? totalSteps : Math.min(totalSteps - 1, mpStep))
      : rawStep;
    const isUnfinished = isMpActiveOrWaiting
      ? true
      : (
          (!!pr && Number(pr.is_completed || 0) === 0 && currentStep > 0 && currentStep < totalSteps) ||
          (answeredFromQ > 0 && answeredFromQ < totalSteps && (!pr || Number(pr.is_completed || 0) === 0))
        );

    res.json({
      data: {
        ...pack,
        current_step: currentStep,
        total_steps: totalSteps,
        is_unfinished: isUnfinished,
        is_completed: !isUnfinished,
        is_multiplayer: Boolean(mpRoom),
        mp_room_id: mpRoom?.id || null,
        mp_status: mpStatus,
        mp_finish_deadline_at: mpRoom?.finish_deadline_at || null,
        mp_finish_remaining_seconds: mpFinishRemainingSeconds,
        mp_my_round: mpRoom ? mpMyRound : null,
        mp_my_score: myMpPart ? Number(myMpPart.awarded_score ?? myMpPart.score ?? 0) : null,
        mp_my_correct: myMpPart ? Math.max(sanitizedMpCorrect, correctFromQ) : null,
        mp_my_finished: mpMyFinished,
        mp_participants_count: mpParts.length,
        mp_finished_count: mpParts.filter((mp: any) => Number(mp.is_finished) === 1).length,
        answered_count: Math.max(answeredFromQ, currentStep),
        correct_count: correctFromQ,
        topics,
        questions
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game-packs/:id/topics (persist generated topics across rounds)
gamePacksRouter.post('/:id/topics', async (req, res) => {
  try {
    const { id } = req.params;
    const { topics } = req.body;
    if (Array.isArray(topics) && topics.length > 0) {
      await runSql(
        `UPDATE game_packs SET topics_json = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(topics), id]
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game-packs (save newly generated questions pack)
gamePacksRouter.post('/', async (req, res) => {
  try {
    const { user_id, game_id, game_title, topic, difficulty, questions, topics } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Вопросы обязательны для сохранения пакета' });
    }

    const cleanTopic = String(topic || 'Общие знания').trim();
    const effectiveUserId = String(user_id || 'usr_guest');
    const effectiveGameId = String(game_id || 'blitz');
    const effectiveGameTitle = String(game_title || (
      effectiveGameId === 'blitz' ? 'КвИИз' :
      effectiveGameId === 'millionaire' ? 'Квиллионер' :
      effectiveGameId === 'whatwherewhen' ? 'Что? Где? Квада?' :
      effectiveGameId === '100to1' ? 'Сто Квадному' :
      effectiveGameId === 'jeopardy' ? 'Своя Икра' :
      effectiveGameId === 'melody' ? 'Укавкай мелодию' : 'КвИИз'
    ));

    const id = req.body.id || req.body.pack_id || generateId('pack');
    const existingPack = await getOne<any>('SELECT * FROM game_packs WHERE id = $1', [id]).catch(() => null);

    let mergedQuestions = questions;
    let finalTopic = cleanTopic;

    if (existingPack) {
      if (
        existingPack.game_id === 'jeopardy' &&
        existingPack.topic &&
        existingPack.topic !== 'Общие знания' &&
        existingPack.topic !== 'Разные' &&
        questions.length < 25
      ) {
        finalTopic = existingPack.topic;
      }
      try {
        const prevQuestions = JSON.parse(existingPack.questions_json || '[]');
        if (Array.isArray(prevQuestions) && prevQuestions.length > 0) {
          const byIdx = new Map<number, any>();
          prevQuestions.forEach((pq: any, i: number) => {
            const qIdx = Number(pq?.question_index) || (i + 1);
            byIdx.set(qIdx, pq);
          });
          questions.forEach((nq: any, i: number) => {
            const qIdx = Number(nq?.question_index) || (i + 1);
            const oldQ = byIdx.get(qIdx) || {};
            byIdx.set(qIdx, {
              ...oldQ,
              ...nq,
              question_index: qIdx,
              category: nq.category || oldQ.category || nq.categoryName || oldQ.categoryName,
              value: nq.value ?? oldQ.value,
              is_answered: Number(nq.is_answered) === 1 || Number(oldQ.is_answered) === 1 ? 1 : 0,
              is_correct: Number(nq.is_answered) === 1 ? Number(nq.is_correct || 0) : Number(oldQ.is_correct || 0),
              is_skipped: Number(nq.is_skipped) === 1 || Number(oldQ.is_skipped) === 1 ? 1 : 0,
              user_answer: nq.user_answer || oldQ.user_answer || '',
              times_shown: Math.max(Number(nq.times_shown || 0), Number(oldQ.times_shown || 0)),
              times_correct: Math.max(Number(nq.times_correct || 0), Number(oldQ.times_correct || 0)),
              times_incorrect: Math.max(Number(nq.times_incorrect || 0), Number(oldQ.times_incorrect || 0)),
              times_skipped: Math.max(Number(nq.times_skipped || 0), Number(oldQ.times_skipped || 0))
            });
          });
          mergedQuestions = Array.from(byIdx.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, val]) => val);
        }
      } catch (_) {}
    }

    const questionsJson = JSON.stringify(mergedQuestions);
    const topicsJson = topics ? JSON.stringify(topics) : (req.body.topics_json || null);
    const qCount = effectiveGameId === 'jeopardy' ? Math.max(76, mergedQuestions.length) : mergedQuestions.length;

    await runSql(
      `INSERT INTO game_packs (id, user_id, game_id, game_title, topic, difficulty, question_count, questions_json, topics_json, play_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         topic = EXCLUDED.topic,
         difficulty = EXCLUDED.difficulty,
         question_count = EXCLUDED.question_count,
         questions_json = EXCLUDED.questions_json,
         topics_json = COALESCE(EXCLUDED.topics_json, game_packs.topics_json),
         updated_at = NOW()`,
      [id, effectiveUserId, effectiveGameId, effectiveGameTitle, finalTopic, difficulty || 'people', qCount, questionsJson, topicsJson]
    );

    const created = await getOne('SELECT * FROM game_packs WHERE id = $1', [id]);
    res.json({ data: created, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game-packs/:id/play (increment play counter for replayed pack)
gamePacksRouter.post('/:id/play', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body || {};
    await runSql(
      `UPDATE game_packs SET play_count = COALESCE(play_count, 0) + 1, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await runSql(
      `UPDATE generated_questions SET times_shown = COALESCE(times_shown, 0) + 1, updated_at = NOW() WHERE pack_id = $1`,
      [id]
    );
    if (user_id) {
      await runSql(
        `DELETE FROM game_progress WHERE (user_id = $1 OR user_id = 'usr_guest' OR user_id = '10016926299') AND pack_id = $2`,
        [user_id, id]
      );
    }

    // Keep questions_json synchronized with updated times_shown
    const dbQuestions = await getAll('SELECT * FROM generated_questions WHERE pack_id = $1 ORDER BY question_index ASC', [id]);
    if (dbQuestions && dbQuestions.length > 0) {
      const packRow = await getOne<{ questions_json: string }>('SELECT questions_json FROM game_packs WHERE id = $1', [id]);
      let parsed = [];
      try { parsed = JSON.parse(packRow?.questions_json || '[]'); } catch (_) {}
      const updatedQ = (parsed.length > 0 ? parsed : dbQuestions).map((q: any, idx: number) => {
        const dbQ = dbQuestions[idx] || dbQuestions.find((dq: any) => dq.id === q.id);
        return {
          ...q,
          ...(dbQ ? { times_shown: dbQ.times_shown, times_correct: dbQ.times_correct, times_incorrect: dbQ.times_incorrect, times_skipped: dbQ.times_skipped } : {})
        };
      });
      await runSql('UPDATE game_packs SET questions_json = $1 WHERE id = $2', [JSON.stringify(updatedQ), id]);
    }

    const updated = await getOne('SELECT * FROM game_packs WHERE id = $1', [id]);
    res.json({ data: updated, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/game-packs/:id
gamePacksRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await runSql('DELETE FROM game_packs WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
