import { Router } from 'express';
import { getAll, getOne, runSql, generateId } from '../db';
import { ensureUserPackAnswersTable } from './generatedQuestions';
import { healMultiplayerPacksAndParticipants } from './multiplayer';

export const gameProgressRouter = Router();

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

gameProgressRouter.get('/', async (req, res) => {
  try {
    await ensureUserPackAnswersTable();
    await healMultiplayerPacksAndParticipants();
    const { user_id, pack_id, game_type } = req.query;
    
    // If pack_id and game_type provided, fetch specific progress
    if (user_id && pack_id && game_type) {
      const uStr = String(user_id).trim();
      const targetUserIds = [uStr, 'usr_guest'];
      const user = await getOne(
        'SELECT id, uid, telegram_id FROM users WHERE id = $1 OR uid = $2 OR telegram_id::text = $3',
        [uStr, uStr, uStr]
      ).catch(() => null);
      if (user) {
        if (user.id && !targetUserIds.includes(String(user.id))) targetUserIds.push(String(user.id));
        if (user.uid && !targetUserIds.includes(String(user.uid))) targetUserIds.push(String(user.uid));
        if (user.telegram_id && !targetUserIds.includes(String(user.telegram_id))) targetUserIds.push(String(user.telegram_id));
      }
      const placeholders = targetUserIds.map((_, idx) => `$${idx + 1}`).join(',');
      const nextP = targetUserIds.length + 1;

      let row = await getOne<any>(
        `SELECT * FROM game_progress WHERE user_id IN (${placeholders}) AND pack_id = $${nextP} AND game_type = $${nextP + 1} ORDER BY updated_at DESC LIMIT 1`,
        [...targetUserIds, pack_id, game_type]
      );

      if (row && typeof row.state === 'string') {
        try { row.state = JSON.parse(row.state); } catch (_) { row.state = {}; }
      }

      const mpRoom = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE pack_id = $1 ORDER BY created_at DESC LIMIT 1', [pack_id]).catch(() => null);
      const mpParts = mpRoom
        ? await getAll<any>(
            `SELECT * FROM multiplayer_participants WHERE room_id = $1 AND user_id IN (${targetUserIds.map((_, idx) => `$${idx + 2}`).join(',')})`,
            [mpRoom.id, ...targetUserIds]
          ).catch(() => [])
        : [];
      const myMpPart = mpParts[0] || null;

      const userAnsRow = await getOne<{ answered_count: number; correct_count: number }>(
        `SELECT COUNT(*)::int as answered_count, COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0)::int as correct_count
         FROM user_pack_answers WHERE pack_id = $1 AND user_id IN (${targetUserIds.map((_, idx) => `$${idx + 2}`).join(',')}) AND is_answered = 1`,
        [pack_id, ...targetUserIds]
      ).catch(() => null);

      const countRow = !mpRoom
        ? await getOne<{ answered_count: number; correct_count: number }>(
            'SELECT COUNT(*)::int as answered_count, COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0)::int as correct_count FROM generated_questions WHERE pack_id = $1 AND (is_answered = 1 OR times_skipped > 0)',
            [pack_id]
          ).catch(() => null)
        : null;

      const answeredFromDb = mpRoom
        ? Number(userAnsRow?.answered_count || 0)
        : Math.max(Number(userAnsRow?.answered_count || 0), Number(countRow?.answered_count || 0));
      const correctFromDb = mpRoom
        ? Number(userAnsRow?.correct_count || 0)
        : Math.max(Number(userAnsRow?.correct_count || 0), Number(countRow?.correct_count || 0));

      const mpMyFinished = myMpPart ? Number(myMpPart.is_finished) === 1 : false;
      const mpStep = myMpPart
        ? (mpMyFinished ? Number(mpRoom?.question_count || 10) : Math.max(0, (Number(myMpPart.current_round) || 1) - 1, answeredFromDb))
        : 0;
      const sanitizedMpCorrect = myMpPart
        ? (mpMyFinished ? Number(myMpPart.correct_count || 0) : Math.min(Number(myMpPart.correct_count || 0), mpStep))
        : 0;

      if (row) {
        const bestStep = mpRoom
          ? Math.max(Number(row.current_step || 0), Number(row.state?.currentIndex || 0), mpStep)
          : Math.max(Number(row.current_step || 0), Number(row.state?.currentIndex || 0), answeredFromDb);
        row.current_step = bestStep;
        row.correct_answers = mpRoom
          ? Math.max(Number(row.correct_answers || 0), correctFromDb, sanitizedMpCorrect)
          : Math.max(Number(row.correct_answers || 0), correctFromDb);
        row.state = {
          ...(row.state || {}),
          currentIndex: bestStep,
          score: row.state?.score !== undefined ? Number(row.state.score) : Math.max(Number(row.score || 0), row.correct_answers)
        };
      } else if (mpRoom || answeredFromDb > 0) {
        const bestStep = mpRoom ? mpStep : answeredFromDb;
        const bestCorrect = mpRoom ? Math.max(correctFromDb, sanitizedMpCorrect) : correctFromDb;
        row = {
          user_id: uStr,
          pack_id: String(pack_id),
          game_type: String(game_type),
          current_step: bestStep,
          total_steps: Number(mpRoom?.question_count || 10),
          score: bestCorrect,
          correct_answers: bestCorrect,
          is_completed: mpMyFinished ? 1 : 0,
          state: {
            currentIndex: bestStep,
            score: bestCorrect,
            topic: mpRoom?.topic || 'Общие знания',
            difficulty: mpRoom?.difficulty || 'people'
          }
        };
      }

      return res.json({ data: row || null });
    }

    // If only user_id provided, fetch active (unfinished) progress for this user
    if (user_id) {
      const {
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

      const uStr = String(user_id).trim();
      const targetUserIds = [uStr, 'usr_guest'];
      const user = await getOne(
        'SELECT id, uid, telegram_id FROM users WHERE id = $1 OR uid = $2 OR telegram_id::text = $3',
        [uStr, uStr, uStr]
      ).catch(() => null);
      if (user) {
        if (user.id && !targetUserIds.includes(String(user.id))) targetUserIds.push(String(user.id));
        if (user.uid && !targetUserIds.includes(String(user.uid))) targetUserIds.push(String(user.uid));
        if (user.telegram_id && !targetUserIds.includes(String(user.telegram_id))) targetUserIds.push(String(user.telegram_id));
      }
      const placeholders = targetUserIds.map((_, idx) => `$${idx + 1}`).join(',');

      const packCols = isSummary
        ? 'pk.game_title, pk.topic AS pack_topic, pk.difficulty AS pack_difficulty, pk.question_count AS pack_question_count'
        : 'pk.game_title, pk.topic AS pack_topic, pk.difficulty AS pack_difficulty, pk.question_count AS pack_question_count, pk.questions_json';

      const rows = await getAll(
        `SELECT gp.*, gp.topic AS gp_topic, gp.pack_id, gp.game_type, gp.current_step, gp.total_steps, gp.updated_at,
                ${packCols}
         FROM game_progress gp
         LEFT JOIN game_packs pk ON gp.pack_id = pk.id
         WHERE gp.user_id IN (${placeholders})
           AND (
             gp.is_completed IS NULL
             OR gp.is_completed = 0
             OR gp.pack_id IN (
               SELECT pack_id FROM multiplayer_rooms WHERE pack_id IS NOT NULL AND status IN ('waiting', 'active')
             )
           )
           AND (gp.game_type IS NULL OR gp.game_type != 'free_millionaire')
         ORDER BY gp.updated_at DESC, gp.id DESC`,
        targetUserIds
      );

      // Scoped multiplayer rooms: only rooms matching user's progress packs OR active/waiting rooms user participates in
      const progressPackIds = Array.from(new Set(rows.map((r: any) => r.pack_id).filter(Boolean))) as string[];
      const mpRoomsWhereParts: string[] = [
        `(status IN ('waiting', 'active') AND (host_id IN (${placeholders}) OR id IN (SELECT room_id FROM multiplayer_participants WHERE user_id IN (${placeholders}))))`
      ];
      const mpRoomsParams: any[] = [...targetUserIds, ...targetUserIds];
      if (progressPackIds.length > 0) {
        const packPh = progressPackIds.map((_, idx) => `$${mpRoomsParams.length + idx + 1}`).join(',');
        mpRoomsWhereParts.push(`pack_id IN (${packPh})`);
        mpRoomsParams.push(...progressPackIds);
      }

      const mpRooms = await getAll<any>(
        `SELECT * FROM multiplayer_rooms WHERE ${mpRoomsWhereParts.join(' OR ')} ORDER BY created_at DESC`,
        mpRoomsParams
      ).catch(() => []);

      const mpRoomByPackMap = new Map<string, any>();
      mpRooms.forEach((mr: any) => {
        if (mr.pack_id && !mpRoomByPackMap.has(mr.pack_id)) {
          mpRoomByPackMap.set(mr.pack_id, mr);
        }
      });

      const mpRoomIds = mpRooms.map((mr: any) => mr.id).filter(Boolean);
      const mpPartsByRoomMap = new Map<string, any[]>();
      if (mpRoomIds.length > 0) {
        const rPh = mpRoomIds.map((_, idx) => `$${idx + 1}`).join(',');
        const batchParts = await getAll<any>(
          `SELECT * FROM multiplayer_participants WHERE room_id IN (${rPh})`,
          mpRoomIds
        ).catch(() => []);
        batchParts.forEach((mp: any) => {
          if (mp.room_id) {
            if (!mpPartsByRoomMap.has(mp.room_id)) mpPartsByRoomMap.set(mp.room_id, []);
            mpPartsByRoomMap.get(mp.room_id)!.push(mp);
          }
        });
      }

      const seenPackIds = new Set<string>();
      const seenRoomIds = new Set<string>();
      const parsed: any[] = [];

      for (const r of rows) {
        if (r.pack_id) {
          if (seenPackIds.has(r.pack_id)) continue;
          seenPackIds.add(r.pack_id);
        }
        let stateObj: any = {};
        try {
          if (typeof r.state === 'string') stateObj = JSON.parse(r.state);
          else if (typeof r.state === 'object') stateObj = r.state || {};
        } catch (_) {}

        let packQuestions: any[] = [];
        if (!isSummary && r.questions_json) {
          try {
            packQuestions = JSON.parse(r.questions_json);
          } catch (_) {}
        }

        const isExplicitlySingle = stateObj?.isMultiplayer === false || stateObj?.playMode === 'single';
        let mpRoom = !isExplicitlySingle && r.pack_id ? mpRoomByPackMap.get(r.pack_id) : null;
        if (!mpRoom && !isExplicitlySingle && stateObj?.mpRoomId) {
          mpRoom = mpRooms.find((mr: any) => mr.id === stateObj.mpRoomId) || null;
        }
        if (!mpRoom && !isExplicitlySingle) {
          mpRoom = mpRooms.find((mr: any) => {
            if (mr.game_id !== (r.game_type || r.game_id)) return false;
            if (mr.pack_id && r.pack_id && mr.pack_id !== r.pack_id && String(mr.pack_id).match(/\d{8,}/)) return false;
            const rTopic = String(r.gp_topic || r.pack_topic || stateObj.topic || '').trim().toLowerCase();
            if (rTopic && String(mr.topic || '').trim().toLowerCase() !== rTopic) return false;
            const rParts = mpPartsByRoomMap.get(mr.id) || [];
            return targetUserIds.includes(String(mr.host_id)) || rParts.some((mp: any) => targetUserIds.includes(String(mp.user_id)));
          });
        }
        if (mpRoom?.id) seenRoomIds.add(mpRoom.id);

        const mpParts = mpRoom ? (mpPartsByRoomMap.get(mpRoom.id) || []) : [];
        const myMpPart = mpRoom
          ? mpParts.find((mp: any) => targetUserIds.includes(String(mp.user_id))) || null
          : null;

        let mpFinishRemainingSeconds: number | null = null;
        let mpStatus = mpRoom?.status || (stateObj?.isMultiplayer || stateObj?.playMode === 'multi' ? 'active' : null);
        if (mpRoom && mpStatus === 'active' && mpRoom.finish_deadline_at) {
          const deadlineMs = parseTimestampMs(mpRoom.finish_deadline_at);
          if (!isNaN(deadlineMs)) {
            mpFinishRemainingSeconds = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
            if (mpFinishRemainingSeconds <= 0) {
              mpStatus = 'finished';
            }
          }
        }

        if (Number(r.is_completed) === 1 && (!mpRoom || (mpStatus !== 'waiting' && mpStatus !== 'active'))) {
          continue;
        }

        const isJeopardy = r.game_type === 'jeopardy' || r.game_id === 'jeopardy' || (r.pack_id && r.pack_id.includes('jeopardy'));
        const is100to1 = r.game_type === '100to1' || r.game_id === '100to1' || (r.pack_id && r.pack_id.includes('100to1'));
        const rawTotalSteps = Number(r.total_steps) || Number(r.pack_question_count) || packQuestions.length || 10;
        const totalSteps = isJeopardy ? Math.max(75, rawTotalSteps) : (is100to1 ? Math.max(24, rawTotalSteps) : rawTotalSteps);
        const answeredInJson = (!mpRoom || isJeopardy) && Array.isArray(packQuestions)
          ? packQuestions.filter((pq: any) => Number(pq?.is_answered) === 1 || Boolean(pq?.user_answer) || Boolean(pq?.isAnswered)).length
          : 0;
        const mpMyFinished = myMpPart ? Number(myMpPart.is_finished) === 1 : false;
        const mpMyRound = myMpPart
          ? (mpMyFinished ? totalSteps : Math.min(totalSteps, Math.max(1, Number(myMpPart.current_round) || 1)))
          : 1;
        const mpStep = mpRoom ? (mpMyFinished ? totalSteps : Math.max(0, mpMyRound - 1)) : 0;
        const rawStep = mpRoom
          ? (isJeopardy || is100to1
              ? Math.max(Number(r.current_step || 0), Number(stateObj.currentIndex || 0), mpStep, answeredInJson)
              : mpStep)
          : Math.max(Number(r.current_step || 0), Number(stateObj.currentIndex || 0), answeredInJson);
        const currentStep = mpRoom && (mpStatus === 'waiting' || mpStatus === 'active')
          ? (mpMyFinished ? totalSteps : Math.min(totalSteps - 1, rawStep))
          : rawStep;
        const sanitizedMpCorrect = myMpPart
          ? (mpMyFinished ? Number(myMpPart.correct_count || 0) : Math.min(Number(myMpPart.correct_count || 0), Math.max(mpStep, currentStep)))
          : 0;

        const authoritativeTopic = stateObj.gameTopic || r.gp_topic || r.topic || r.pack_topic || mpRoom?.topic || 'Общие знания';
        const displayGameTitle = isJeopardy ? 'Своя Икра' : (r.game_title || mpRoom?.game_title || (r.game_type === 'millionaire' ? 'Квиллионер' : r.game_type === 'blitz' ? 'КвИИз' : 'Игра'));
        const isRowMultiplayer = Boolean(mpRoom || stateObj?.isMultiplayer || stateObj?.playMode === 'multi' || stateObj?.mpRoomId);

        const lightState = isSummary
          ? {
              gameTopic: stateObj.gameTopic,
              currentIndex: stateObj.currentIndex,
              score: stateObj.score,
              expertScore: stateObj.expertScore,
              viewerScore: stateObj.viewerScore,
              answeredIndices: stateObj.answeredIndices,
              isMultiplayer: stateObj.isMultiplayer,
              playMode: stateObj.playMode,
              mpRoomId: mpRoom?.id || stateObj.mpRoomId || undefined
            }
          : {
              ...stateObj,
              mpRoomId: mpRoom?.id || stateObj.mpRoomId || undefined
            };

        parsed.push({
          id: r.id,
          user_id: r.user_id,
          pack_id: r.pack_id,
          game_type: r.game_type,
          difficulty: r.difficulty || r.pack_difficulty || stateObj.difficulty || 'people',
          score: r.score,
          correct_answers: r.correct_answers,
          is_completed: r.is_completed,
          created_at: r.created_at,
          updated_at: r.updated_at,
          current_step: currentStep,
          total_steps: totalSteps,
          topic: authoritativeTopic,
          game_title: displayGameTitle,
          is_multiplayer: isRowMultiplayer,
          mp_room_id: mpRoom?.id || stateObj?.mpRoomId || null,
          mp_status: mpStatus,
          mp_finish_deadline_at: mpRoom?.finish_deadline_at || null,
          mp_finish_remaining_seconds: mpFinishRemainingSeconds,
          mp_my_round: isRowMultiplayer ? (mpRoom ? mpMyRound : Math.max(1, currentStep + 1)) : null,
          mp_my_score: myMpPart ? Number(myMpPart.awarded_score ?? myMpPart.score ?? 0) : null,
          mp_my_correct: myMpPart ? sanitizedMpCorrect : null,
          mp_my_finished: mpMyFinished,
          mp_participants_count: mpParts.length,
          mp_finished_count: mpParts.filter((mp: any) => Number(mp.is_finished) === 1).length,
          ...(!isSummary && packQuestions.length > 0 ? { questions: packQuestions } : {}),
          state: lightState
        });
      }

      // Include active/waiting multiplayer rooms where user participates even if no game_progress row exists yet
      for (const mr of mpRooms) {
        if (seenRoomIds.has(mr.id)) continue;
        if (mr.pack_id && seenPackIds.has(mr.pack_id)) continue;
        if (mr.status !== 'waiting' && mr.status !== 'active') continue;
        const mpParts = mpPartsByRoomMap.get(mr.id) || [];
        const myMpPart = mpParts.find((mp: any) => targetUserIds.includes(String(mp.user_id)));
        const isCreator = targetUserIds.includes(String(mr.host_id));
        if (!myMpPart && !isCreator) continue;

        let mpFinishRemainingSeconds: number | null = null;
        let mpStatus = mr.status;
        if (mpStatus === 'active' && mr.finish_deadline_at) {
          const deadlineMs = parseTimestampMs(mr.finish_deadline_at);
          if (!isNaN(deadlineMs)) {
            mpFinishRemainingSeconds = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
            if (mpFinishRemainingSeconds <= 0) {
              mpStatus = 'finished';
              continue;
            }
          }
        }

        if (mr.pack_id) seenPackIds.add(mr.pack_id);
        seenRoomIds.add(mr.id);

        let packQuestions: any[] = [];
        let resolvedPackId = mr.pack_id;
        if (!isSummary) {
          if (resolvedPackId) {
            const pkRow = await getOne<any>('SELECT questions_json FROM game_packs WHERE id = $1', [resolvedPackId]).catch(() => null);
            if (pkRow?.questions_json) {
              try { packQuestions = JSON.parse(pkRow.questions_json); } catch (_) {}
            }
          }
          if (packQuestions.length === 0) {
            const pkFallback = await getOne<any>(
              'SELECT id, questions_json FROM game_packs WHERE game_id = $1 AND LOWER(topic) = LOWER($2) ORDER BY created_at DESC LIMIT 1',
              [mr.game_id || 'blitz', mr.topic || 'Общие знания']
            ).catch(() => null);
            if (pkFallback) {
              resolvedPackId = pkFallback.id;
              try { packQuestions = JSON.parse(pkFallback.questions_json || '[]'); } catch (_) {}
            }
          }
        }

        const totalSteps = Number(mr.question_count) || packQuestions.length || 10;
        const mpMyRound = myMpPart ? Math.max(1, Number(myMpPart.current_round) || 1) : 1;
        const mpMyFinished = myMpPart ? Number(myMpPart.is_finished) === 1 : false;
        const currentStep = mpMyFinished ? totalSteps : Math.min(totalSteps - 1, Math.max(0, mpMyRound - 1));

        parsed.push({
          id: `gp_mp_${mr.id}`,
          user_id: String(user_id),
          pack_id: resolvedPackId || `pack_${mr.game_id || 'blitz'}_${mr.id}`,
          game_type: mr.game_id || 'blitz',
          game_id: mr.game_id || 'blitz',
          game_title: mr.game_title || 'КвИИз',
          topic: mr.topic || 'Общие знания',
          difficulty: mr.difficulty || 'people',
          current_step: currentStep,
          total_steps: totalSteps,
          score: myMpPart ? Number(myMpPart.score || 0) : 0,
          correct_answers: myMpPart ? Number(myMpPart.correct_count || 0) : 0,
          is_completed: 0,
          is_multiplayer: true,
          mp_room_id: mr.id,
          mp_status: mpStatus,
          mp_finish_deadline_at: mr.finish_deadline_at || null,
          mp_finish_remaining_seconds: mpFinishRemainingSeconds,
          mp_my_round: mpMyRound,
          mp_my_score: myMpPart ? Number(myMpPart.awarded_score ?? myMpPart.score ?? 0) : 0,
          mp_my_correct: myMpPart ? Number(myMpPart.correct_count || 0) : 0,
          mp_my_finished: mpMyFinished,
          mp_participants_count: mpParts.length,
          mp_finished_count: mpParts.filter((mp: any) => Number(mp.is_finished) === 1).length,
          ...(!isSummary && packQuestions.length > 0 ? { questions: packQuestions } : {}),
          updated_at: mr.started_at || mr.created_at,
          created_at: mr.created_at,
          state: {
            currentIndex: currentStep,
            score: myMpPart ? Number(myMpPart.correct_count || 0) : 0,
            topic: mr.topic,
            difficulty: mr.difficulty,
            mpRoomId: mr.id,
            ...(!isSummary && packQuestions.length > 0 ? { questions: packQuestions } : {})
          }
        });
      }

      // Apply optional filters and sorting before pagination
      const normDiffGroup = (val: string) => {
        const l = String(val || 'people').toLowerCase();
        if (l.includes('dummy') || l.includes('иикра') || l.includes('easy')) return 'dummy';
        if (l.includes('genius') || l.includes('квант') || l.includes('hard')) return 'genius';
        if (l.includes('god') || l.includes('ляга') || l.includes('expert')) return 'god';
        return 'people';
      };

      const filtered = parsed.filter((p: any) => {
        const gKey = String(p.game_type || p.game_id || '').toLowerCase();
        const isJeop = gKey.includes('jeopardy') || String(p.pack_id || '').includes('jeopardy');
        if (mode === 'single' && p.is_multiplayer) return false;
        if (mode === 'multi' && !p.is_multiplayer) return false;
        if (game_id && game_id !== 'all') {
          const g = String(game_id).toLowerCase();
          if (g === 'blitz' && !gKey.includes('blitz')) return false;
          if (g === 'millionaire' && !gKey.includes('millionaire')) return false;
          if (g === '100to1' && !gKey.includes('100')) return false;
          if (g === 'whatwherewhen' && !gKey.includes('whatwherewhen') && !gKey.includes('chgk') && !gKey.includes('чтогдеквада')) return false;
          if (g === 'melody' && !gKey.includes('melody')) return false;
          if (g === 'jeopardy' && !isJeop) return false;
          if (g === 'iqbox' && !gKey.includes('iqbox')) return false;
        }
        if (difficulty && difficulty !== 'all' && String(game_id || '') !== 'jeopardy' && !isJeop) {
          if (normDiffGroup(p.difficulty) !== normDiffGroup(String(difficulty))) return false;
        }
        if (topic && String(topic).trim()) {
          if (!String(p.topic || '').toLowerCase().includes(String(topic).trim().toLowerCase())) return false;
        }
        if (q && String(q).trim()) {
          const ql = String(q).trim().toLowerCase();
          const match =
            String(p.game_title || '').toLowerCase().includes(ql) ||
            String(p.topic || '').toLowerCase().includes(ql) ||
            String(p.game_type || '').toLowerCase().includes(ql);
          if (!match) return false;
        }
        return true;
      });

      const dir = String(sort_order).toLowerCase() === 'asc' ? 1 : -1;
      const sb = String(sort_by);
      filtered.sort((a: any, b: any) => {
        let cmp = 0;
        if (sb === 'title' || sb === 'gameType') {
          cmp = String(a.game_title || '').localeCompare(String(b.game_title || ''), 'ru');
        } else if (sb === 'topic') {
          cmp = String(a.topic || '').localeCompare(String(b.topic || ''), 'ru');
        } else {
          const ta = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
          const tb = new Date(b.updated_at || b.created_at || 0).getTime() || 0;
          cmp = ta - tb;
        }
        if (cmp === 0) {
          cmp = String(a.id || '').localeCompare(String(b.id || ''));
        }
        return cmp * dir;
      });

      const totalCount = filtered.length;
      const sliced = filtered.slice(offsetNum, offsetNum + limitNum);

      return res.json({
        data: sliced,
        totalCount,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + sliced.length < totalCount
      });
    }

    // Default list all
    const all = await getAll('SELECT * FROM game_progress WHERE (is_completed IS NULL OR is_completed = 0) ORDER BY updated_at DESC LIMIT 100');
    res.json({ data: all });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

gameProgressRouter.post('/', async (req, res) => {
  try {
    const { user_id, pack_id, game_type, current_step, total_steps, state, is_completed, score, correct_answers, topic, difficulty } = req.body;
    if (!user_id || !pack_id || !game_type) {
      return res.status(400).json({ error: 'user_id, pack_id и game_type обязательны' });
    }

    const stateStr = typeof state === 'object' ? JSON.stringify(state) : state || '{}';
    const isCompletedNum = is_completed ? 1 : 0;
    const scoreNum = Number(score) || 0;
    const correctNum = Number(correct_answers) || 0;

    const existing = await getOne(
      'SELECT id FROM game_progress WHERE user_id = $1 AND pack_id = $2 AND game_type = $3',
      [user_id, pack_id, game_type]
    );

    if (existing) {
      await runSql(
        `UPDATE game_progress 
         SET current_step = $1, total_steps = $2, state = $3, is_completed = $4, score = $5, correct_answers = $6, 
             topic = COALESCE($7, topic), difficulty = COALESCE($8, difficulty), updated_at = NOW()
         WHERE id = $9`,
        [current_step || 0, total_steps || 0, stateStr, isCompletedNum, scoreNum, correctNum, topic || null, difficulty || null, existing.id]
      );
    } else {
      const id = generateId('gp');
      await runSql(
        `INSERT INTO game_progress (id, user_id, pack_id, game_type, current_step, total_steps, state, is_completed, score, correct_answers, topic, difficulty, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
        [id, user_id, pack_id, game_type, current_step || 0, total_steps || 0, stateStr, isCompletedNum, scoreNum, correctNum, topic || null, difficulty || null]
      );
    }

    const updated = await getOne(
      'SELECT * FROM game_progress WHERE user_id = $1 AND pack_id = $2 AND game_type = $3',
      [user_id, pack_id, game_type]
    );

    if (updated && typeof updated.state === 'string') {
      try { updated.state = JSON.parse(updated.state); } catch (_) {}
    }

    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

gameProgressRouter.delete('/', async (req, res) => {
  try {
    const { user_id, pack_id, game_type } = req.query;
    if (!user_id || !pack_id) {
      return res.status(400).json({ error: 'user_id и pack_id обязательны' });
    }

    let sql = `DELETE FROM game_progress WHERE (user_id = $1 OR user_id = 'usr_guest' OR user_id = '10016926299') AND pack_id = $2`;
    const params: any[] = [user_id, pack_id];
    if (game_type) {
      sql += ' AND game_type = $3';
      params.push(game_type);
    }

    await runSql(sql, params);

    res.json({ message: 'Прогресс сброшен' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

gameProgressRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await runSql('DELETE FROM game_progress WHERE id = $1', [id]);
    res.json({ message: 'Прогресс удален' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
