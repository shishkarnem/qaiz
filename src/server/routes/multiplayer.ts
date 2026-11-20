import { Router } from 'express';
import { getAll, getOne, runSql, generateId, calculateAuthoritativeScoreWithBreakdown } from '../db';
import { ensureUserPackAnswersTable } from './generatedQuestions';

export const multiplayerRouter = Router();

const MAX_ROOM_PARTICIPANTS = 8;
const HOST_ABSENCE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (600 seconds)
const LOBBY_ONLINE_TTL_MS = 12 * 1000; // 12 seconds heartbeat TTL for active lobby viewers

function parseTimestampMs(val?: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  const s = String(val).trim();
  if (!s) return null;
  const hasTz = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(s);
  const iso = s.includes('T') ? (hasTz ? s : `${s}Z`) : `${s.replace(' ', 'T')}${hasTz ? '' : 'Z'}`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

let healedLegacyPack1790366131392 = false;
let lastHealMultiplayerAt = 0;
let healMultiplayerInFlight: Promise<void> | null = null;

export async function healMultiplayerPacksAndParticipants() {
  const now = Date.now();
  if (now - lastHealMultiplayerAt < 60_000) {
    return;
  }
  if (healMultiplayerInFlight) {
    return healMultiplayerInFlight;
  }
  healMultiplayerInFlight = (async () => {
  try {
    await ensureUserPackAnswersTable();

    if (!healedLegacyPack1790366131392) {
      healedLegacyPack1790366131392 = true;
      // Repair the shared-pack collision in pack_1790366131392 / mproom_blitz_muhdroao where
      // participant 93180821063 played all questions while participant 10016926299 was on question 2/10
      const roomMuhdroao = await getOne<any>(
        "SELECT * FROM multiplayer_rooms WHERE id = 'mproom_blitz_muhdroao' OR pack_id = 'pack_1790366131392'"
      ).catch(() => null);

      if (roomMuhdroao) {
        const part1 = await getOne<any>(
          "SELECT * FROM multiplayer_participants WHERE room_id = $1 AND user_id = '10016926299'",
          [roomMuhdroao.id]
        ).catch(() => null);
        const part2 = await getOne<any>(
          "SELECT * FROM multiplayer_participants WHERE room_id = $1 AND user_id = '93180821063'",
          [roomMuhdroao.id]
        ).catch(() => null);

        // If 10016926299 was polluted with current_round=10, correct_count=8 while unfinished and 93180821063 was stuck at 1/0
        if (
          part1 &&
          Number(part1.is_finished) === 0 &&
          Number(part1.correct_count) === 8 &&
          part2 &&
          Number(part2.current_round) === 1 &&
          Number(part2.correct_count) === 0
        ) {
          // 1. Seed user_pack_answers for 93180821063 from the 9 answered questions in generated_questions
          const gqs = await getAll<any>(
            "SELECT * FROM generated_questions WHERE pack_id = 'pack_1790366131392' ORDER BY question_index ASC"
          ).catch(() => []);
          for (const gq of gqs) {
            if (Number(gq.is_answered) === 1) {
              await runSql(
                `INSERT INTO user_pack_answers (id, user_id, pack_id, question_index, question_id, user_answer, is_answered, is_correct, is_skipped, updated_at)
                 VALUES ($1, '93180821063', 'pack_1790366131392', $2, $3, $4, 1, $5, 0, NOW())
                 ON CONFLICT(user_id, pack_id, question_index) DO UPDATE SET
                   user_answer = EXCLUDED.user_answer,
                   is_answered = 1,
                   is_correct = EXCLUDED.is_correct`,
                [
                  `upa_93180821063_pack_1790366131392_${gq.question_index}`,
                  Number(gq.question_index),
                  gq.id,
                  gq.user_answer || '',
                  Number(gq.is_correct) || 0
                ]
              ).catch(() => {});
            }
          }

          // 2. Seed user_pack_answers for 10016926299 with only Question 1 answered (since his progress is question 2 of 10)
          await runSql(
            "DELETE FROM user_pack_answers WHERE user_id = '10016926299' AND pack_id = 'pack_1790366131392' AND question_index > 1"
          ).catch(() => {});
          const q1 = gqs.find((g: any) => Number(g.question_index) === 1);
          if (q1) {
            await runSql(
              `INSERT INTO user_pack_answers (id, user_id, pack_id, question_index, question_id, user_answer, is_answered, is_correct, is_skipped, updated_at)
               VALUES ('upa_10016926299_pack_1790366131392_1', '10016926299', 'pack_1790366131392', 1, $1, $2, 1, 1, 0, NOW())
               ON CONFLICT(user_id, pack_id, question_index) DO UPDATE SET
                 is_answered = 1,
                 is_correct = 1`,
              [q1.id, q1.user_answer || 'Женщина кошка']
            ).catch(() => {});
          }

          // 3. Clean shared generated_questions & game_packs.questions_json for questions 2..10
          await runSql(
            `UPDATE generated_questions
             SET is_answered = 0, is_correct = 0, user_answer = NULL
             WHERE pack_id = 'pack_1790366131392' AND question_index > 1`
          ).catch(() => {});

          const packRow = await getOne<any>("SELECT questions_json FROM game_packs WHERE id = 'pack_1790366131392'").catch(() => null);
          if (packRow?.questions_json) {
            try {
              const parsedQ = JSON.parse(packRow.questions_json);
              if (Array.isArray(parsedQ)) {
                const cleanedQ = parsedQ.map((q: any, idx: number) => {
                  if (idx === 0) {
                    return { ...q, is_answered: 1, is_correct: 1 };
                  }
                  return { ...q, is_answered: 0, is_correct: 0, user_answer: '' };
                });
                await runSql(
                  "UPDATE game_packs SET questions_json = $1 WHERE id = 'pack_1790366131392'",
                  [JSON.stringify(cleanedQ)]
                ).catch(() => {});

                // 4. Repair 10016926299's game_progress row gp_74a13a6f414d2653 to step 1 (Question 2 of 10)
                await runSql(
                  `UPDATE game_progress
                   SET current_step = 1, total_steps = 10, score = 1, correct_answers = 1, is_completed = 0,
                       state = $1
                   WHERE user_id = '10016926299' AND pack_id = 'pack_1790366131392'`,
                  [
                    JSON.stringify({
                      questions: cleanedQ,
                      currentIndex: 1,
                      score: 1,
                      topic: 'Вселенная DC',
                      difficulty: 'people',
                      timeLeft: 60,
                      skipsLeft: 5,
                      isMultiplayer: true,
                      mpRoomId: roomMuhdroao.id,
                      playMode: 'multi'
                    })
                  ]
                ).catch(() => {});
              }
            } catch (_) {}
          }

          // 5. Update multiplayer_participants so 10016926299 is at 2/10 (1 correct) and 93180821063 has his 8/10 (10/10)
          await runSql(
            `UPDATE multiplayer_participants
             SET current_round = 2, correct_count = 1, score = 100, is_finished = 0
             WHERE id = $1`,
            [part1.id]
          ).catch(() => {});

          await runSql(
            `UPDATE multiplayer_participants
             SET current_round = 10, correct_count = 8, score = 2100, is_finished = 1, finish_time_ms = COALESCE(finish_time_ms, 180000)
             WHERE id = $1`,
            [part2.id]
          ).catch(() => {});
        }
      }
    }

    // General invariant: for any unfinished participant in any room, correct_count cannot exceed (current_round - 1)
    const allUnfinished = await getAll<any>(
      `SELECT mp.id, mp.room_id, mp.user_id, mp.current_round, mp.correct_count, mp.is_finished, mr.question_count
       FROM multiplayer_participants mp
       JOIN multiplayer_rooms mr ON mr.id = mp.room_id
       WHERE mp.is_finished = 0`
    ).catch(() => []);

    for (const up of allUnfinished) {
      const roundNum = Math.max(1, Number(up.current_round) || 1);
      const totalQ = Math.max(1, Number(up.question_count) || 10);
      if (roundNum < totalQ) {
        const maxPossibleCorrect = Math.max(0, roundNum - 1);
        if (Number(up.correct_count) > maxPossibleCorrect) {
          await runSql(
            'UPDATE multiplayer_participants SET correct_count = $1 WHERE id = $2',
            [maxPossibleCorrect, up.id]
          ).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('healMultiplayerPacksAndParticipants error:', err);
  } finally {
    lastHealMultiplayerAt = Date.now();
    healMultiplayerInFlight = null;
  }
  })();
  return healMultiplayerInFlight;
}

let multiplayerColumnsEnsured = false;

async function ensureMultiplayerColumns() {
  if (multiplayerColumnsEnsured) return;
  multiplayerColumnsEnsured = true;
  await runSql(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS pack_id TEXT`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS settings_json TEXT`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public'`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 8`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS first_finished_at TIMESTAMPTZ`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS finish_deadline_at TIMESTAMPTZ`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS scores_awarded INTEGER DEFAULT 0`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS display_name TEXT`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS avatar_url TEXT`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS current_round INTEGER DEFAULT 1`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS is_finished INTEGER DEFAULT 0`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS is_ready INTEGER DEFAULT 0`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS finish_time_ms BIGINT`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS awarded_score DOUBLE PRECISION DEFAULT 0`).catch(() => {});
  await runSql(`ALTER TABLE multiplayer_participants ADD COLUMN IF NOT EXISTS score_multiplier DOUBLE PRECISION DEFAULT 1`).catch(() => {});
}

async function ensureJeopardyStatePopulatedFromPack(room: any, currentJState: any, firstPlayerId: string) {
  if (!room || room.game_id !== 'jeopardy') return currentJState;
  const hasCategories = Array.isArray(currentJState?.categories) && currentJState.categories.length > 0;
  const hasQuestionText =
    hasCategories &&
    currentJState.categories.some((c: any) =>
      Array.isArray(c.questions) && c.questions.some((q: any) => q.question && String(q.question).trim().length > 0)
    );
  if (hasCategories && hasQuestionText) return currentJState;

  const packId = room.pack_id || currentJState?.packId;
  if (!packId) return currentJState;

  try {
    let rawQuestions: any[] = [];
    const packRow = await getOne<any>('SELECT questions_json FROM game_packs WHERE id = $1', [packId]).catch(() => null);
    if (packRow?.questions_json) {
      const parsed = typeof packRow.questions_json === 'string' ? JSON.parse(packRow.questions_json) : packRow.questions_json;
      if (Array.isArray(parsed) && parsed.length > 0) {
        rawQuestions = parsed;
      }
    }
    if (rawQuestions.length === 0) {
      const gqs = await getAll<any>(
        'SELECT * FROM generated_questions WHERE pack_id = $1 ORDER BY question_index ASC',
        [packId]
      ).catch(() => []);
      if (gqs.length > 0) {
        rawQuestions = gqs.map((q: any) => ({
          id: q.id,
          question_index: q.question_index,
          category: q.category || q.topic || 'Общие знания',
          question: q.question || q.question_text || '',
          answer: q.answer || q.correct_answer || '',
          hint: q.hint || '',
          explanation: q.explanation || ''
        }));
      }
    }

    if (rawQuestions.length === 0) return currentJState;

    const preloadedRounds: Record<number, any[]> = {};
    const allTopics: { name: string; description: string }[] = [];

    for (const roundNum of [1, 2, 3]) {
      const roundSlice = rawQuestions.slice((roundNum - 1) * 25, roundNum * 25);
      if (roundSlice.length === 0) continue;
      const catsForRound: any[] = [];
      for (let cIdx = 0; cIdx < 5; cIdx++) {
        const qChunk = roundSlice.slice(cIdx * 5, (cIdx + 1) * 5);
        if (qChunk.length === 0) continue;
        const rawTopic = String(qChunk[0]?.category || qChunk[0]?.topic || `Тема ${(roundNum - 1) * 5 + cIdx + 1}`)
          .replace(/^Раунд\s*\d+\s*:\s*/i, '')
          .trim();
        const desc =
          qChunk[0]?.category_description ||
          qChunk[0]?.categoryDescription ||
          `Вопросы по теме «${rawTopic}»`;
        allTopics.push({ name: rawTopic, description: desc });

        // Preserve existing answered flags if currentJState already had this category
        const existingCat =
          roundNum === (Number(currentJState?.round) || 1) && Array.isArray(currentJState?.categories)
            ? currentJState.categories[cIdx]
            : null;

        const mappedQuestions = qChunk.map((q: any, qIdx: number) => {
          const globalIndex = (roundNum - 1) * 25 + cIdx * 5 + qIdx + 1;
          const existingQ = existingCat?.questions?.[qIdx];
          const qId = existingQ?.id || q.id || `gq_${packId}_${globalIndex}`;
          return {
            id: qId,
            db_id: q.id || `gq_${packId}_${globalIndex}`,
            pack_id: packId,
            question_index: q.question_index || globalIndex,
            category: rawTopic,
            value: Number(existingQ?.value || q.value || (qIdx + 1) * 100 * roundNum),
            question: q.question || q.question_text || q.text || existingQ?.question || '',
            answer: q.answer || q.correct_answer || q.correctAnswer || existingQ?.answer || '',
            hint: q.hint || existingQ?.hint || '',
            explanation: q.explanation || existingQ?.explanation || '',
            isAnswered: Boolean(existingQ?.isAnswered),
            type: existingQ?.type || q.type || q.special_type || 'normal'
          };
        });

        catsForRound.push({
          name: rawTopic,
          description: desc,
          questions: mappedQuestions
        });
      }
      if (catsForRound.length > 0) {
        preloadedRounds[roundNum] = catsForRound;
      }
    }

    const activeRound = Number(currentJState?.round) || 1;
    const activeCats = preloadedRounds[activeRound] || preloadedRounds[1] || [];
    if (activeCats.length === 0) return currentJState;

    const finalQRaw = rawQuestions[75] || (rawQuestions.length > 25 ? rawQuestions[rawQuestions.length - 1] : null);
    const populatedState = {
      round: activeRound,
      phase: currentJState?.phase || 'categories_intro',
      introStartedAt: currentJState?.introStartedAt || Date.now(),
      choosingUserId: currentJState?.choosingUserId || firstPlayerId,
      answeringUserId: currentJState?.answeringUserId || null,
      generatorUserId: currentJState?.generatorUserId || firstPlayerId,
      totalAnsweredCount: Number(currentJState?.totalAnsweredCount) || 0,
      ...currentJState,
      packId,
      allTopics: Array.isArray(currentJState?.allTopics) && currentJState.allTopics.length > 0 ? currentJState.allTopics : allTopics,
      categories: activeCats,
      preloadedRounds: {
        ...(currentJState?.preloadedRounds || {}),
        ...preloadedRounds
      },
      ...(finalQRaw && !currentJState?.preloadedFinalQuestion
        ? {
            preloadedFinalQuestion: {
              category: String(finalQRaw.category || finalQRaw.topic || room.topic || 'Суперфинал')
                .replace(/^Суперфинал\s*:\s*/i, '')
                .trim(),
              question: finalQRaw.question || finalQRaw.question_text || finalQRaw.text || '',
              answer: finalQRaw.answer || finalQRaw.correct_answer || finalQRaw.correctAnswer || '',
              explanation: finalQRaw.explanation || ''
            }
          }
        : {})
    };

    await saveRoomJeopardyState(room.id, room, populatedState);
    return populatedState;
  } catch (err) {
    console.warn('ensureJeopardyStatePopulatedFromPack error:', err);
    return currentJState;
  }
}

function parseRoomSettings(room: any): Record<string, any> {
  if (!room?.settings_json) return {};
  if (typeof room.settings_json === 'object') return room.settings_json;
  try {
    return JSON.parse(String(room.settings_json)) || {};
  } catch (_) {
    return {};
  }
}

async function evaluateWaitingRoomHostTimer(
  room: any,
  participants: any[],
  opts?: {
    activeLobbyUserId?: string | null;
    explicitLeaveLobbyUserId?: string | null;
  }
): Promise<{
  isHostInLobby: boolean;
  onlineInLobbyCount: number;
  hostTransferRemainingSeconds: number | null;
  hostTimerPaused: boolean;
  isHostFree: boolean;
  hostId: string;
}> {
  const defaultHostId = String(room?.host_id || '');
  if (!room || room.status !== 'waiting') {
    return {
      isHostInLobby: false,
      onlineInLobbyCount: 0,
      hostTransferRemainingSeconds: null,
      hostTimerPaused: false,
      isHostFree: false,
      hostId: defaultHostId
    };
  }

  const now = Date.now();
  const settings = parseRoomSettings(room);
  let settingsChanged = false;

  const rawPresence: Record<string, number> =
    settings.lobbyPresence && typeof settings.lobbyPresence === 'object'
      ? { ...settings.lobbyPresence }
      : {};

  if (opts?.explicitLeaveLobbyUserId) {
    const leaveUid = String(opts.explicitLeaveLobbyUserId).trim();
    if (leaveUid && rawPresence[leaveUid] !== undefined) {
      delete rawPresence[leaveUid];
      settingsChanged = true;
    }
    if (leaveUid && rawPresence[`${leaveUid}_self2`] !== undefined) {
      delete rawPresence[`${leaveUid}_self2`];
      settingsChanged = true;
    }
  }

  const activeViewerUid =
    opts?.activeLobbyUserId && !String(opts.activeLobbyUserId).endsWith('_self2')
      ? String(opts.activeLobbyUserId).trim()
      : null;

  // Prune expired presence entries before checking existing lobby occupants
  const cleanedPresence: Record<string, number> = {};
  for (const [uid, ts] of Object.entries(rawPresence)) {
    if (uid.endsWith('_self2')) continue;
    const numTs = Number(ts) || 0;
    if (now - numTs <= LOBBY_ONLINE_TTL_MS) {
      cleanedPresence[uid] = numTs;
    } else {
      settingsChanged = true;
    }
  }

  // Record the current active lobby viewer
  if (activeViewerUid) {
    cleanedPresence[activeViewerUid] = now;
    settingsChanged = true;
  }

  settings.lobbyPresence = cleanedPresence;
  const onlineLobbyUids = Object.keys(cleanedPresence);
  const onlineInLobbyCount = onlineLobbyUids.length;

  let currentHostId = String(room.host_id || '');
  let isHostInLobby = Boolean(currentHostId && cleanedPresence[currentHostId]);

  const promoteUserToHost = async (newHostUid: string, reasonText?: string) => {
    const cleanNewHost = String(newHostUid).trim();
    if (!cleanNewHost || cleanNewHost.endsWith('_self2')) return;
    const oldHostUid = currentHostId;
    currentHostId = cleanNewHost;
    room.host_id = cleanNewHost;

    await runSql('UPDATE multiplayer_rooms SET host_id = $1 WHERE id = $2', [cleanNewHost, room.id]).catch(() => {});
    await runSql(
      `UPDATE multiplayer_participants
       SET role = CASE WHEN user_id = $1 THEN 'host' ELSE CASE WHEN role = 'host' THEN 'player' ELSE role END END,
           is_ready = CASE WHEN user_id = $2 THEN 1 ELSE is_ready END
       WHERE room_id = $3`,
      [cleanNewHost, cleanNewHost, room.id]
    ).catch(() => {});

    for (const p of participants) {
      if (String(p.user_id) === cleanNewHost) {
        p.role = 'host';
        p.is_ready = 1;
      } else if (p.role === 'host') {
        p.role = 'player';
      }
    }

    if (room.game_id === 'jeopardy' && settings.jeopardyState) {
      settings.jeopardyState = {
        ...settings.jeopardyState,
        generatorUserId: cleanNewHost,
        choosingUserId: cleanNewHost,
        updatedAt: now
      };
    }

    if (reasonText && oldHostUid !== cleanNewHost) {
      const actionId = generateId('mpa_');
      await runSql(
        `INSERT INTO multiplayer_actions (id, room_id, user_id, action_type, payload_json, created_at)
         VALUES ($1, $2, $3, 'system', $4, NOW())`,
        [
          actionId,
          room.id,
          cleanNewHost,
          JSON.stringify({
            text: reasonText,
            sender_name: 'Система'
          })
        ]
      ).catch(() => {});
    }
    settingsChanged = true;
  };

  // Case 1: Current host IS online in the waiting lobby -> reset 10-minute timer to 10:00 and pause it!
  if (isHostInLobby) {
    if (settings.hostAbsentSince !== null || settings.hostFreeForFirstJoiner) {
      settings.hostAbsentSince = null;
      settings.hostFreeForFirstJoiner = false;
      settingsChanged = true;
    }
    settings.lastHostSeenAt = now;
    if (settingsChanged) {
      const jsonStr = JSON.stringify(settings);
      await runSql('UPDATE multiplayer_rooms SET settings_json = $1 WHERE id = $2', [jsonStr, room.id]).catch(() => {});
      room.settings_json = jsonStr;
    }
    return {
      isHostInLobby: true,
      onlineInLobbyCount,
      hostTransferRemainingSeconds: 600,
      hostTimerPaused: true,
      isHostFree: false,
      hostId: currentHostId
    };
  }

  // Case 2: Current host is NOT in the waiting lobby -> 10-minute countdown is running (or already expired)
  if (!settings.hostAbsentSince) {
    if (opts?.explicitLeaveLobbyUserId && String(opts.explicitLeaveLobbyUserId) === currentHostId) {
      settings.hostAbsentSince = now;
    } else {
      const fallbackMs = Number(settings.lastHostSeenAt) || parseTimestampMs(room.created_at) || now;
      settings.hostAbsentSince = fallbackMs;
    }
    settingsChanged = true;
  }

  const absentSinceMs = Number(settings.hostAbsentSince) || now;
  const elapsedAbsentMs = Math.max(0, now - absentSinceMs);
  let remainingSec = Math.max(0, Math.ceil((HOST_ABSENCE_TIMEOUT_MS - elapsedAbsentMs) / 1000));

  // Has the 10-minute host absence timer expired?
  if (remainingSec === 0 || Boolean(settings.hostFreeForFirstJoiner)) {
    const othersInLobby = onlineLobbyUids.filter(uid => uid !== activeViewerUid);
    const realOrderedParts = participants.filter(p => !String(p.user_id || '').endsWith('_self2'));

    if (activeViewerUid && othersInLobby.length === 0) {
      // 0 people were sitting in the lobby when this player entered after >10m -> this entering player becomes the new host!
      const enteringPart = realOrderedParts.find(p => String(p.user_id) === activeViewerUid);
      const enteringName = enteringPart?.display_name || enteringPart?.username || 'Участник';
      await promoteUserToHost(
        activeViewerUid,
        `Предыдущий создатель отсутствовал в лобби более 10 минут. Новым хостом игры стал первый вошедший игрок: ${enteringName}`
      );
      settings.hostAbsentSince = null;
      settings.hostFreeForFirstJoiner = false;
      settings.lastHostSeenAt = now;
      isHostInLobby = true;
      remainingSec = 600;
      settingsChanged = true;
    } else if (onlineLobbyUids.length > 0) {
      // Players ARE sitting in the lobby when the 10 minutes expire -> transfer host to the first participant in the list who is in the lobby
      const firstOnlineInList =
        realOrderedParts.find(
          p => String(p.user_id) !== currentHostId && onlineLobbyUids.includes(String(p.user_id))
        ) ||
        realOrderedParts.find(p => onlineLobbyUids.includes(String(p.user_id)));
      const targetNewHostId = firstOnlineInList ? String(firstOnlineInList.user_id) : onlineLobbyUids[0];
      const targetName = firstOnlineInList?.display_name || firstOnlineInList?.username || 'Участник';
      await promoteUserToHost(
        targetNewHostId,
        `Хост отсутствовал более 10 минут. Права хоста переведены первому участнику в списке: ${targetName}`
      );
      settings.hostAbsentSince = null;
      settings.hostFreeForFirstJoiner = false;
      settings.lastHostSeenAt = now;
      isHostInLobby = true;
      remainingSec = 600;
      settingsChanged = true;
    } else {
      // 0 people are currently sitting in the lobby after 10 minutes
      const nextInList = realOrderedParts.find(p => String(p.user_id) !== currentHostId);
      if (nextInList && settings.autoTransferredFromHostId !== currentHostId) {
        const prevHostId = currentHostId;
        const nextName = nextInList.display_name || nextInList.username || 'Участник';
        await promoteUserToHost(
          String(nextInList.user_id),
          `Хост вышел и отсутствовал 10 минут. Права хоста переведены первому в списке: ${nextName}`
        );
        settings.autoTransferredFromHostId = prevHostId;
      }
      // Because 0 people are sitting in the lobby right now, mark room as free for the first player who enters the lobby!
      if (!settings.hostFreeForFirstJoiner) {
        settings.hostFreeForFirstJoiner = true;
        settingsChanged = true;
      }
      remainingSec = 0;
    }
  }

  if (settingsChanged) {
    const jsonStr = JSON.stringify(settings);
    await runSql('UPDATE multiplayer_rooms SET settings_json = $1 WHERE id = $2', [jsonStr, room.id]).catch(() => {});
    room.settings_json = jsonStr;
  }

  return {
    isHostInLobby,
    onlineInLobbyCount,
    hostTransferRemainingSeconds: isHostInLobby ? 600 : remainingSec,
    hostTimerPaused: isHostInLobby,
    isHostFree: !isHostInLobby && remainingSec === 0 && onlineInLobbyCount === 0,
    hostId: currentHostId
  };
}

async function saveRoomJeopardyState(roomId: string, room: any, jeopardyState: any) {
  const settings = parseRoomSettings(room);
  settings.jeopardyState = {
    ...jeopardyState,
    updatedAt: Date.now()
  };
  const jsonStr = JSON.stringify(settings);
  await runSql(`UPDATE multiplayer_rooms SET settings_json = $1 WHERE id = $2`, [jsonStr, roomId]);
  if (room) room.settings_json = jsonStr;
  return settings.jeopardyState;
}

function enrichJeopardyStateTimers(jeopardyState: any) {
  if (!jeopardyState) return null;
  const now = Date.now();
  let phase = jeopardyState.phase || 'categories_intro';

  // Auto-transition from categories_intro to board once countdown + 15-category reveal completes (22s fallback)
  if (phase === 'categories_intro' && jeopardyState.introStartedAt) {
    const introElapsedMs = now - Number(jeopardyState.introStartedAt);
    if (introElapsedMs >= 22000) {
      phase = 'board';
    }
  }

  let liveBoardTimeLeft = Number(jeopardyState.boardTurnRemainingSec ?? 15);
  if (phase === 'board') {
    const turnStartMs = Number(
      jeopardyState.boardTurnStartedAt ||
        (jeopardyState.introStartedAt ? Number(jeopardyState.introStartedAt) + 22000 : now)
    );
    const elapsed = Math.max(0, Math.floor((now - turnStartMs) / 1000));
    liveBoardTimeLeft = Math.max(0, 15 - elapsed);
  }

  let liveQuestionTimeLeft = Number(jeopardyState.questionTimeRemainingSec ?? 60);
  if (phase === 'question_buzz' && jeopardyState.questionTimerStartedAt) {
    const elapsed = Math.floor((now - Number(jeopardyState.questionTimerStartedAt)) / 1000);
    liveQuestionTimeLeft = Math.max(0, liveQuestionTimeLeft - elapsed);
  }

  let liveAnswerTimeLeft = Number(jeopardyState.answerTimeRemainingSec ?? 15);
  if (phase === 'question_answer' && jeopardyState.answerTimerStartedAt && !jeopardyState.answerCheckingInProgress) {
    const elapsed = Math.floor((now - Number(jeopardyState.answerTimerStartedAt)) / 1000);
    liveAnswerTimeLeft = Math.max(0, liveAnswerTimeLeft - elapsed);
  }

  let liveFinalBettingTimeLeft = Number(jeopardyState.finalBettingTimeRemainingSec ?? 60);
  if (phase === 'final_betting' && jeopardyState.finalBettingTimerStartedAt) {
    const elapsed = Math.floor((now - Number(jeopardyState.finalBettingTimerStartedAt)) / 1000);
    liveFinalBettingTimeLeft = Math.max(0, liveFinalBettingTimeLeft - elapsed);
  }

  let liveFinalCountdownLeft = Number(jeopardyState.finalCountdownRemainingSec ?? 5);
  if (phase === 'final_countdown' && jeopardyState.finalCountdownStartedAt) {
    const elapsed = Math.floor((now - Number(jeopardyState.finalCountdownStartedAt)) / 1000);
    liveFinalCountdownLeft = Math.max(0, 5 - elapsed);
    if (liveFinalCountdownLeft <= 0) {
      phase = 'final_question';
    }
  }

  let liveFinalTimeLeft = Number(jeopardyState.finalTimeRemainingSec ?? 60);
  if (phase === 'final_question') {
    const startMs = Number(
      jeopardyState.finalTimerStartedAt ||
        (jeopardyState.finalCountdownStartedAt ? Number(jeopardyState.finalCountdownStartedAt) + 5000 : now)
    );
    const elapsed = Math.max(0, Math.floor((now - startMs) / 1000));
    liveFinalTimeLeft = Math.max(0, 60 - elapsed);
  }

  let liveFinalRevealIndex = 0;
  let liveFinalRevealStepRemainingSec = 5;
  let liveFinalRevealStepElapsedMs = 0;
  if (phase === 'final_reveal' && jeopardyState.finalRevealStartedAt) {
    const elapsedMs = Math.max(0, now - Number(jeopardyState.finalRevealStartedAt));
    const perPlayerMs = (Number(jeopardyState.finalRevealPerPlayerSec) || 5) * 1000;
    liveFinalRevealIndex = Math.floor(elapsedMs / perPlayerMs);
    liveFinalRevealStepElapsedMs = elapsedMs % perPlayerMs;
    liveFinalRevealStepRemainingSec = Math.max(1, Math.ceil((perPlayerMs - liveFinalRevealStepElapsedMs) / 1000));
  }

  const auc = jeopardyState.auctionState || null;
  const failedList = Array.isArray(jeopardyState.failedUserIds)
    ? jeopardyState.failedUserIds
    : Array.isArray(jeopardyState.wrongUserIds)
    ? jeopardyState.wrongUserIds
    : [];
  const finalCats = Array.isArray(jeopardyState.remainingFinalCategories)
    ? jeopardyState.remainingFinalCategories
    : Array.isArray(jeopardyState.finalCategories)
    ? jeopardyState.finalCategories
    : [];
  const elimUid = jeopardyState.eliminatingUserId || jeopardyState.finalEliminatingUserId || null;
  const eligFinalUids = Array.isArray(jeopardyState.eligibleFinalPlayerIds)
    ? jeopardyState.eligibleFinalPlayerIds
    : Array.isArray(jeopardyState.eligibleFinalUserIds)
    ? jeopardyState.eligibleFinalUserIds
    : [];
  const rawRevealList = Array.isArray(jeopardyState.finalRevealList)
    ? jeopardyState.finalRevealList
    : Array.isArray(jeopardyState.finalRevealOrder)
    ? jeopardyState.finalRevealOrder
    : [];
  const normalizedRevealList = rawRevealList.map((r: any) => ({
    ...r,
    delta: r.delta !== undefined ? r.delta : (r.scoreDelta ?? 0),
    scoreDelta: r.scoreDelta !== undefined ? r.scoreDelta : (r.delta ?? 0)
  }));

  return {
    ...jeopardyState,
    phase,
    failedUserIds: failedList,
    wrongUserIds: failedList,
    remainingFinalCategories: finalCats,
    finalCategories: finalCats,
    eliminatingUserId: elimUid,
    finalEliminatingUserId: elimUid,
    eligibleFinalPlayerIds: eligFinalUids,
    eligibleFinalUserIds: eligFinalUids,
    finalRevealList: normalizedRevealList,
    finalRevealOrder: normalizedRevealList,
    ...(auc
      ? {
          auctionNominal: auc.nominalValue,
          auctionHighestBid: auc.currentHighBid,
          auctionHighestBidderId: auc.highBidderId,
          auctionCurrentTurnUserId: auc.currentBidderId,
          auctionPassedUserIds: auc.passedBidderIds || []
        }
      : {}),
    liveBoardTimeLeft,
    liveQuestionTimeLeft,
    liveAnswerTimeLeft,
    liveFinalBettingTimeLeft,
    liveFinalBetTimeLeft: liveFinalBettingTimeLeft,
    liveFinalCountdownLeft,
    liveFinalTimeLeft,
    liveFinalRevealIndex,
    liveFinalRevealStepRemainingSec,
    liveFinalRevealStepElapsedMs
  };
}

async function syncJeopardyParticipantsProgress(roomId: string, room: any, jeopardyState: any) {
  if (!jeopardyState || !room) return;
  try {
    const parts = await getAll<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY joined_at ASC',
      [roomId]
    );
    const totalAnswered = Math.min(76, Math.max(0, Number(jeopardyState.totalAnsweredCount) || 0));
    const isOver = jeopardyState.phase === 'game_over' || room.status === 'finished';
    const currentRoundStep = isOver ? 76 : Math.min(76, totalAnswered + 1);

    for (const p of parts) {
      await runSql(
        `UPDATE multiplayer_participants
         SET current_round = $1,
             is_finished = CASE WHEN $2 = 1 THEN 1 ELSE is_finished END
         WHERE id = $3`,
        [currentRoundStep, isOver ? 1 : 0, p.id]
      ).catch(() => {});

      const uid = String(p.user_id || '');
      if (!uid || uid.endsWith('_self2')) continue;
      const packId = room.pack_id || jeopardyState.packId;
      if (!packId) continue;

      const progId = `gp_mp_${roomId}_${uid}`;
      const statePayload = JSON.stringify({
        round: jeopardyState.round || 1,
        categories: jeopardyState.categories || [],
        pastRoundsCategories: jeopardyState.pastRoundsCategories || {},
        allTopics: jeopardyState.allTopics || [],
        totalAnsweredCount: totalAnswered,
        packId,
        gameTopic: room.topic || 'Общие знания',
        gameState: isOver ? 'game_over' : room.status === 'waiting' ? 'mp_lobby' : 'playing',
        isMultiplayer: true,
        mpRoomId: roomId,
        mpStatus: room.status || 'waiting',
        playMode: 'multi'
      });

      const existingProg = await getOne<any>(
        'SELECT id FROM game_progress WHERE user_id = $1 AND pack_id = $2',
        [uid, packId]
      ).catch(() => null);

      if (existingProg) {
        await runSql(
          `UPDATE game_progress
           SET current_step = $1,
               total_steps = 76,
               score = $2,
               correct_answers = $3,
               is_completed = $4,
               state = $5,
               updated_at = NOW()
           WHERE id = $6`,
          [
            isOver ? 76 : totalAnswered,
            Number(p.score) || 0,
            Number(p.correct_count) || 0,
            isOver ? 1 : 0,
            statePayload,
            existingProg.id
          ]
        ).catch(() => {});
      } else {
        await runSql(
          `INSERT INTO game_progress (id, user_id, pack_id, game_type, topic, difficulty, current_step, total_steps, score, correct_answers, is_completed, state, created_at, updated_at)
           VALUES ($1, $2, $3, 'jeopardy', $4, $5, $6, 76, $7, $8, $9, $10, NOW(), NOW())`,
          [
            progId,
            uid,
            packId,
            room.topic || 'Общие знания',
            room.difficulty || 'people',
            isOver ? 76 : totalAnswered,
            Number(p.score) || 0,
            Number(p.correct_count) || 0,
            isOver ? 1 : 0,
            statePayload
          ]
        ).catch(() => {});
      }
    }
  } catch (_) {}
}

// Requirement 4: If another real participant joined the lobby, remove the duplicate 2nd self participant (_self2)
async function cleanupDuplicateSelfParticipants(roomId: string) {
  try {
    const parts = await getAll<any>(
      'SELECT id, user_id FROM multiplayer_participants WHERE room_id = $1',
      [roomId]
    );
    const realUsers = parts.filter(p => !String(p.user_id || '').endsWith('_self2'));
    const self2Users = parts.filter(p => String(p.user_id || '').endsWith('_self2'));

    if (realUsers.length > 1 && self2Users.length > 0) {
      await runSql(
        "DELETE FROM multiplayer_participants WHERE room_id = $1 AND user_id LIKE '%_self2'",
        [roomId]
      );
      await runSql(
        "DELETE FROM zoom_room_members WHERE (room_id = $1 OR room_id = $2) AND user_id LIKE '%_self2'",
        [roomId, `room_${roomId}`]
      );
    }
  } catch (_) {}
}

// Ensure 100to1 multiplayer rooms ALWAYS have 2 distributed teams (even when playing solo with oneself)
async function ensure100to1TeamsDistributed(roomId: string) {
  try {
    const room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [roomId]);
    if (!room || room.game_id !== '100to1') return;

    const parts = await getAll<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY joined_at ASC',
      [roomId]
    );
    if (parts.length === 0) return;

    const realUsers = parts.filter(p => !String(p.user_id || '').endsWith('_self2'));
    const self2Users = parts.filter(p => String(p.user_id || '').endsWith('_self2'));

    if (realUsers.length === 1 && self2Users.length === 0) {
      // Solo player in 100to1 multiplayer: ensure 2nd team participant (_self2) exists on the opposite team
      const hostPart = realUsers[0];
      const hostTeam = Number(hostPart.team_number) === 2 ? 2 : 1;
      const secondTeam = hostTeam === 1 ? 2 : 1;
      const self2Uid = `${hostPart.user_id}_self2`;
      const self2PartId = generateId('mpp_');
      const settings = parseRoomSettings(room);
      const t2Score =
        secondTeam === 2
          ? Number(settings?.teamGameState?.team2_score) || 0
          : Number(settings?.teamGameState?.team1_score) || 0;
      const baseName = String(hostPart.display_name || 'Игрок').replace(/\s*\(2-й участник\)|\s*\(Команда 2\)/gi, '').trim();

      await runSql(
        `INSERT INTO multiplayer_participants (id, room_id, user_id, display_name, avatar_url, team_number, role, score, correct_count, wrong_count, current_round, is_finished, is_ready, joined_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'captain', $7, 0, 0, $8, 0, 1, NOW())`,
        [
          self2PartId,
          roomId,
          self2Uid,
          `${baseName} (2-й участник)`,
          hostPart.avatar_url || null,
          secondTeam,
          t2Score,
          Math.max(1, Number(hostPart.current_round) || 1)
        ]
      ).catch(() => {});
    } else if (realUsers.length === 1 && self2Users.length >= 1) {
      const hostPart = realUsers[0];
      const self2Part = self2Users[0];
      const hostTeam = Number(hostPart.team_number) === 2 ? 2 : 1;
      const targetSelf2Team = hostTeam === 1 ? 2 : 1;
      if (Number(self2Part.team_number) !== targetSelf2Team) {
        await runSql('UPDATE multiplayer_participants SET team_number = $1 WHERE id = $2', [targetSelf2Team, self2Part.id]);
      }
    } else if (realUsers.length >= 2) {
      const team1List = realUsers.filter(p => Number(p.team_number || 1) !== 2);
      const team2List = realUsers.filter(p => Number(p.team_number) === 2);
      if (team1List.length === 0 || team2List.length === 0) {
        for (let i = 0; i < realUsers.length; i++) {
          const assignedTeam = (i % 2) + 1;
          await runSql('UPDATE multiplayer_participants SET team_number = $1 WHERE id = $2', [assignedTeam, realUsers[i].id]);
        }
      }
    }
  } catch (e) {
    console.warn('ensure100to1TeamsDistributed error:', e);
  }
}

// Requirements 1 & 5 & 12: Award final points ONLY when the entire game finishes for all participants.
// In Jeopardy ("Своя Икра"), EVERY participant with a positive score (> 0) gets their score multiplied by participantCount!
async function finalizeMultiplayerRoomScores(roomId: string) {
  try {
    const room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [roomId]);
    if (!room || room.status !== 'finished' || Number(room.scores_awarded) === 1) return;

    await runSql('UPDATE multiplayer_rooms SET scores_awarded = 1 WHERE id = $1', [roomId]);

    const parts = await getAll<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY joined_at ASC',
      [roomId]
    );
    if (parts.length === 0) return;

    const participantCount = Math.max(1, parts.length);
    const totalQuestions = Number(room.question_count) || 10;

    if (room.game_id === 'blitz') {
      // Sort participants: 1) correct_count DESC, 2) finish_time_ms ASC, 3) joined_at ASC
      const ranked = parts.slice().sort((a, b) => {
        const aCorr = Number(a.correct_count) || 0;
        const bCorr = Number(b.correct_count) || 0;
        if (bCorr !== aCorr) return bCorr - aCorr;
        const aTime = a.finish_time_ms !== null && a.finish_time_ms !== undefined ? Number(a.finish_time_ms) : Number.MAX_SAFE_INTEGER;
        const bTime = b.finish_time_ms !== null && b.finish_time_ms !== undefined ? Number(b.finish_time_ms) : Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return 0;
      });

      const winnerId = Number(ranked[0]?.correct_count) > 0 ? ranked[0].id : null;

      for (const p of ranked) {
        const isWinner = winnerId !== null && p.id === winnerId;
        const correctCount = Number(p.correct_count) || 0;

        // Calculate standard single-player authoritative score
        const singleCalc = await calculateAuthoritativeScoreWithBreakdown({
          gameId: 'blitz',
          difficulty: room.difficulty || 'people',
          correctAnswers: correctCount,
          totalQuestions,
          isWin: isWinner,
          mode: 'multi'
        });

        const appliedMult = isWinner ? participantCount : 1;
        const finalAwardedScore = isWinner
          ? Math.round(singleCalc.authoritativeScore * participantCount)
          : Math.round(singleCalc.authoritativeScore);

        await runSql(
          `UPDATE multiplayer_participants
           SET score = $1,
               awarded_score = $2,
               score_multiplier = $3,
               is_finished = 1
           WHERE id = $4`,
          [finalAwardedScore, finalAwardedScore, appliedMult, p.id]
        );

        // Credit real user's game_sessions & rating points (skip synthetic _self2 duplicate)
        if (!String(p.user_id).endsWith('_self2')) {
          const sessionId = `gs_mp_${roomId}_${p.user_id}`;
          const existingSession = await getOne<any>(
            'SELECT id FROM game_sessions WHERE id = $1',
            [sessionId]
          );
          if (!existingSession) {
            await runSql(
              `INSERT INTO game_sessions (
                id, user_id, pack_id, session_id, game_id, game_title, score, total_questions,
                correct_answers, rounds_won, rounds_lost, mode, difficulty, topic, price_paid, is_win
              ) VALUES ($1, $2, $3, $4, 'blitz', 'КвИИз (Мультиплеер)', $5, $6, $7, $8, $9, 'multi', $10, $11, 0, $12)`,
              [
                sessionId,
                p.user_id,
                room.pack_id || `pack_blitz_${roomId}`,
                sessionId,
                finalAwardedScore,
                totalQuestions,
                correctCount,
                isWinner ? 1 : 0,
                isWinner ? 0 : 1,
                room.difficulty || 'people',
                room.topic || 'Общие знания',
                isWinner ? 1 : 0
              ]
            ).catch(() => {});

            await runSql(
              `UPDATE users
               SET points = COALESCE(points, 0) + $1,
                   total_points = COALESCE(total_points, 0) + $2,
                   balance_point = COALESCE(balance_point, 0) + $3,
                   ballance_point = COALESCE(ballance_point, 0) + $4,
                   games_played = COALESCE(games_played, 0) + 1
               WHERE uid = $5 OR id = $6`,
              [finalAwardedScore, finalAwardedScore, finalAwardedScore, finalAwardedScore, p.user_id, p.user_id]
            ).catch(() => {});
          }
        }
      }
    } else if (room.game_id === 'jeopardy') {
      const ranked = parts.slice().sort((a, b) => {
        const aScore = Number(a.score) || 0;
        const bScore = Number(b.score) || 0;
        if (bScore !== aScore) return bScore - aScore;
        const aCorr = Number(a.correct_count) || 0;
        const bCorr = Number(b.correct_count) || 0;
        return bCorr - aCorr;
      });

      const topScore = Number(ranked[0]?.score) || 0;
      const winnerId = ranked[0] && (topScore > 0 || Number(ranked[0]?.correct_count) > 0) ? ranked[0].id : null;

      for (const p of ranked) {
        const isWinner = winnerId !== null && p.id === winnerId;
        const rawScore = Number(p.score) || 0;
        const correctCount = Number(p.correct_count) || 0;

        // Requirement 12: EVERY participant gets their final points (except negative/minus) multiplied by participantCount!
        const appliedMult = rawScore > 0 && participantCount > 1 ? participantCount : 1;
        const finalAwardedScore = rawScore > 0
          ? Math.round(rawScore * participantCount)
          : rawScore;

        await runSql(
          `UPDATE multiplayer_participants
           SET awarded_score = $1,
               score_multiplier = $2,
               current_round = 76,
               is_finished = 1
           WHERE id = $3`,
          [finalAwardedScore, appliedMult, p.id]
        );

        if (!String(p.user_id).endsWith('_self2')) {
          const sessionId = `gs_mp_${roomId}_${p.user_id}`;
          const existingSession = await getOne<any>(
            'SELECT id FROM game_sessions WHERE id = $1',
            [sessionId]
          );
          if (!existingSession) {
            await runSql(
              `INSERT INTO game_sessions (
                id, user_id, pack_id, session_id, game_id, game_title, score, raw_score, total_questions,
                correct_answers, rounds_won, rounds_lost, mode, difficulty, topic, price_paid, is_win
              ) VALUES ($1, $2, $3, $4, 'jeopardy', 'Своя Икра (Мультиплеер)', $5, $6, 76, $7, $8, $9, 'multi', $10, $11, 0, $12)`,
              [
                sessionId,
                p.user_id,
                room.pack_id || `pack_jeopardy_${roomId}`,
                sessionId,
                finalAwardedScore,
                rawScore,
                correctCount,
                isWinner ? 1 : 0,
                isWinner ? 0 : 1,
                room.difficulty || 'people',
                room.topic || 'Общие знания',
                isWinner ? 1 : 0
              ]
            ).catch(() => {});

            if (finalAwardedScore > 0) {
              await runSql(
                `UPDATE users
                 SET points = COALESCE(points, 0) + $1,
                     total_points = COALESCE(total_points, 0) + $2,
                     balance_point = COALESCE(balance_point, 0) + $3,
                     ballance_point = COALESCE(ballance_point, 0) + $4,
                     games_played = COALESCE(games_played, 0) + 1
                 WHERE uid = $5 OR id = $6`,
                [finalAwardedScore, finalAwardedScore, finalAwardedScore, finalAwardedScore, p.user_id, p.user_id]
              ).catch(() => {});
            }
          }
        }
      }
    } else if (room.game_id === '100to1') {
      const settings = parseRoomSettings(room);
      const tState = settings.teamGameState || {};
      const t1Score = Number(tState.team1_score) || 0;
      const t2Score = Number(tState.team2_score) || 0;

      for (const p of parts) {
        const pTeam = Number(p.team_number) === 2 ? 2 : 1;
        const rawScore = pTeam === 2 ? (t2Score || Number(p.score) || 0) : (t1Score || Number(p.score) || 0);
        const finalAwardedScore = Math.round(rawScore * 100);

        await runSql(
          `UPDATE multiplayer_participants
           SET score = $1,
               awarded_score = $2,
               score_multiplier = 100,
               current_round = 24,
               is_finished = 1
           WHERE id = $3`,
          [rawScore, finalAwardedScore, p.id]
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('finalizeMultiplayerRoomScores error:', err);
  }
}

let lastExpireCheckAt = 0;

async function checkAndAutoExpireRooms() {
  if (Date.now() - lastExpireCheckAt < 8000) return;
  lastExpireCheckAt = Date.now();
  try {
    await healMultiplayerPacksAndParticipants();
    const expiredRooms = await getAll<any>(
      `SELECT id FROM multiplayer_rooms 
       WHERE status = 'active' 
         AND finish_deadline_at IS NOT NULL 
         AND NOW() >= finish_deadline_at`
    );
    if (expiredRooms.length > 0) {
      for (const r of expiredRooms) {
        await runSql(
          `UPDATE multiplayer_rooms 
           SET status = 'finished', finished_at = COALESCE(finished_at, NOW()) 
           WHERE id = $1`,
          [r.id]
        );
        await finalizeMultiplayerRoomScores(r.id);
      }
    }
  } catch (_) {}
}

// 1. Get multiplayer rooms (waiting, active, and finished so players can return or view results)
multiplayerRouter.get('/rooms', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    await checkAndAutoExpireRooms();

    const { game_id, status, user_id } = req.query;
    const viewerUserId = user_id ? String(user_id).trim() : null;
    let querySql = 'SELECT * FROM multiplayer_rooms WHERE 1=1';
    const params: any[] = [];
    let pIdx = 1;

    if (game_id && game_id !== 'all') {
      querySql += ` AND game_id = $${pIdx++}`;
      params.push(game_id);
    }
    if (status && status !== 'all') {
      querySql += ` AND status = $${pIdx++}`;
      params.push(status);
    } else {
      querySql += " AND status IN ('waiting', 'active', 'finished')";
    }

    querySql += ' ORDER BY created_at DESC LIMIT 80';
    const rooms = await getAll<any>(querySql, params);

    const roomIds = rooms.map(r => r.id);
    let participantsMap: Record<string, any[]> = {};

    if (roomIds.length > 0) {
      const placeholders = roomIds.map((_, idx) => `$${idx + 1}`).join(',');
      const parts = await getAll<any>(
        `SELECT mp.*, 
                CASE 
                  WHEN mp.user_id LIKE '%_self2' THEN COALESCE(mp.display_name, u.display_name, u.username, 'Игрок') || CASE WHEN COALESCE(mp.display_name, '') LIKE '%(2-й участник)%' THEN '' ELSE ' (2-й участник)' END
                  ELSE COALESCE(mp.display_name, u.display_name, u.username, 'Игрок')
                END as display_name,
                u.username,
                COALESCE(mp.avatar_url, u.avatar_url, u.photo_url, u.telegram_photo) as avatar_url,
                u.photo_url,
                u.telegram_photo 
         FROM multiplayer_participants mp
         LEFT JOIN users u ON (
           u.uid = mp.user_id OR 
           u.id = mp.user_id OR 
           u.uid = REPLACE(mp.user_id, '_self2', '') OR 
           u.id = REPLACE(mp.user_id, '_self2', '')
         )
         WHERE mp.room_id IN (${placeholders})`,
        roomIds
      );
      for (const p of parts) {
        if (!participantsMap[p.room_id]) participantsMap[p.room_id] = [];
        participantsMap[p.room_id].push({
          ...p,
          current_round: Math.max(1, Number(p.current_round) || 1),
          is_finished: Number(p.is_finished) || 0,
          is_ready: Number(p.is_ready ?? 0),
          score: Number(p.score) || 0,
          awarded_score: p.awarded_score !== null && p.awarded_score !== undefined ? Number(p.awarded_score) : null,
          correct_count: Number(p.correct_count) || 0,
          finish_time_ms: p.finish_time_ms !== null && p.finish_time_ms !== undefined ? Number(p.finish_time_ms) : null
        });
      }
    }

    // Also fetch saved game_progress for these rooms so players who left can still see their participation & return
    const packIds = Array.from(new Set(rooms.map(r => r.pack_id).filter(Boolean)));
    const savedProgressByRoomMap: Record<string, Record<string, any>> = {};
    if (roomIds.length > 0) {
      const progRows = await getAll<any>(
        `SELECT user_id, pack_id, score, correct_answers, current_step, state FROM game_progress WHERE id LIKE 'gp_mp_%'${
          packIds.length > 0 ? ` OR pack_id IN (${packIds.map((_, idx) => `$${idx + 1}`).join(',')})` : ''
        }`,
        packIds
      ).catch(() => []);
      for (const pr of progRows) {
        let stObj: any = {};
        try {
          stObj = typeof pr.state === 'string' ? JSON.parse(pr.state) : (pr.state || {});
        } catch (_) {}
        const matchedRoomId =
          stObj?.mpRoomId ||
          rooms.find(rm => rm.pack_id && rm.pack_id === pr.pack_id)?.id;
        if (matchedRoomId && pr.user_id) {
          if (!savedProgressByRoomMap[matchedRoomId]) savedProgressByRoomMap[matchedRoomId] = {};
          savedProgressByRoomMap[matchedRoomId][String(pr.user_id)] = {
            score: Number(pr.score) || 0,
            correct_count: Number(pr.correct_answers) || 0,
            current_round: Math.max(1, Number(pr.current_step) || 1)
          };
        }
      }
    }

    const enrichedList: any[] = [];
    for (const r of rooms) {
      let finishRemainingSeconds: number | null = null;
      if (r.status === 'active' && r.finish_deadline_at) {
        const deadlineMs = parseTimestampMs(r.finish_deadline_at);
        if (deadlineMs !== null) {
          finishRemainingSeconds = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
        }
      }
      const roomParticipants = participantsMap[r.id] || [];
      const hostTimerInfo = await evaluateWaitingRoomHostTimer(r, roomParticipants);
      const parsedSettings = parseRoomSettings(r);
      const jSavedScores = parsedSettings?.jeopardyState?.savedScoresByUser || {};
      const mergedSavedScores = {
        ...(savedProgressByRoomMap[r.id] || {}),
        ...jSavedScores
      };
      const savedUserIds = Object.keys(mergedSavedScores);
      const invitedUserIds: string[] = Array.isArray(parsedSettings?.invitedUserIds)
        ? parsedSettings.invitedUserIds.map(String)
        : [];
      const rawVis = r.visibility || parsedSettings?.visibility || parsedSettings?.jeopardyState?.visibility || 'public';
      const resolvedVisibility: 'public' | 'private' =
        rawVis === 'private' || rawVis === 'closed' ? 'private' : 'public';
      const resolvedMaxPlayers = Math.min(
        8,
        Math.max(
          2,
          Number(
            r.max_players ||
              parsedSettings?.max_players ||
              parsedSettings?.maxPlayers ||
              parsedSettings?.jeopardyState?.maxPlayers
          ) || 8
        )
      );

      // Sort participants so the current host is first in the list
      const orderedParticipants = roomParticipants.slice().sort((a, b) => {
        const aIsHost = String(a.user_id) === String(r.host_id) || a.role === 'host' ? 0 : 1;
        const bIsHost = String(b.user_id) === String(r.host_id) || b.role === 'host' ? 0 : 1;
        if (aIsHost !== bIsHost) return aIsHost - bIsHost;
        return 0;
      });

      // Requirement 1:
      // - Open (public) rooms: if status !== 'waiting', hide from non-participants! Show only 'waiting' to non-participants.
      // - Closed (private) rooms: if status !== 'waiting', hide from non-participants even if they were invited ("Не успел = не видишь").
      //   When status === 'waiting', show closed rooms only to participants or invited users.
      if (viewerUserId) {
        const isInParticipants = orderedParticipants.some(
          (p: any) => String(p.user_id) === viewerUserId || String(p.user_id) === `${viewerUserId}_self2`
        );
        const hasSavedProgress = savedUserIds.includes(viewerUserId);
        const isHostWhileWaiting = r.status === 'waiting' && String(r.host_id) === viewerUserId;
        const isParticipant = isInParticipants || hasSavedProgress || isHostWhileWaiting;
        const isInvited = invitedUserIds.includes(viewerUserId);

        if (r.status !== 'waiting') {
          // Once the game has started or finished, ONLY participants of this game can see it
          if (!isParticipant) {
            continue;
          }
        } else {
          // In 'waiting' status: closed games are visible only to participants or invited users
          if (resolvedVisibility === 'private' && !isParticipant && !isInvited) {
            continue;
          }
        }
      }

      enrichedList.push({
        ...r,
        host_id: hostTimerInfo.hostId || r.host_id,
        visibility: resolvedVisibility,
        max_players: resolvedMaxPlayers,
        finish_remaining_seconds: finishRemainingSeconds,
        is_host_in_lobby: hostTimerInfo.isHostInLobby,
        online_in_lobby_count: hostTimerInfo.onlineInLobbyCount,
        host_transfer_remaining_seconds: hostTimerInfo.hostTransferRemainingSeconds,
        host_timer_paused: hostTimerInfo.hostTimerPaused,
        is_host_free: hostTimerInfo.isHostFree,
        invited_user_ids: invitedUserIds,
        participants: orderedParticipants,
        saved_user_scores: mergedSavedScores,
        saved_user_ids: savedUserIds
      });
    }

    res.json(enrichedList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create room
multiplayerRouter.post('/rooms', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const {
      id: customRoomId,
      game_id,
      game_title,
      host_id,
      host_name,
      host_avatar,
      topic,
      difficulty = 'people',
      question_count = 10,
      pack_id = null,
      visibility: rawBodyVisibility,
      max_players: rawBodyMaxPlayers,
      maxPlayers: rawBodyMaxPlayersCamel,
      jeopardy_state = null,
      settings_json = null
    } = req.body;

    if (!game_id || !host_id) {
      return res.status(400).json({ error: 'game_id and host_id are required' });
    }

    if (game_id === 'jeopardy' && !String(host_id).endsWith('_self2')) {
      const hostUser = await getOne<any>(
        'SELECT balance FROM users WHERE uid = $1 OR id = $2',
        [String(host_id), String(host_id)]
      ).catch(() => null);
      // If jeopardy_state is already generated (15 categories + Round 1 = 26 IIkr spent), host needs >= 50 remaining; otherwise >= 76
      const minRequired = jeopardy_state ? 50 : 76;
      if (hostUser && Number(hostUser.balance ?? 0) < minRequired) {
        return res.status(403).json({
          error: 'Для создания мультиплеера Своей Икры необходимо минимум 76 ИИкр на балансе',
          code: 'INSUFFICIENT_BALANCE'
        });
      }
    }

    const roomId = customRoomId || generateId('mproom_');
    const partId = generateId('mpp_');
    const finalQuestionCount = game_id === 'jeopardy' ? 76 : question_count;
    const parsedIncomingSettings =
      typeof settings_json === 'string'
        ? (() => {
            try {
              return JSON.parse(settings_json) || {};
            } catch {
              return {};
            }
          })()
        : settings_json || {};
    const rawVis =
      rawBodyVisibility ||
      parsedIncomingSettings.visibility ||
      jeopardy_state?.visibility ||
      'public';
    const resolvedVisibility: 'public' | 'private' =
      rawVis === 'private' || rawVis === 'closed' ? 'private' : 'public';
    const resolvedMaxPlayers = Math.min(
      8,
      Math.max(
        2,
        Number(
          rawBodyMaxPlayers ||
            rawBodyMaxPlayersCamel ||
            parsedIncomingSettings.max_players ||
            parsedIncomingSettings.maxPlayers ||
            jeopardy_state?.maxPlayers
        ) || 8
      )
    );

    const nowCreateMs = Date.now();
    const mergedSettingsObj: Record<string, any> = {
      ...parsedIncomingSettings,
      visibility: resolvedVisibility,
      max_players: resolvedMaxPlayers,
      lobbyPresence: {
        [String(host_id)]: nowCreateMs
      },
      lastHostSeenAt: nowCreateMs,
      hostAbsentSince: null,
      hostFreeForFirstJoiner: false
    };
    if (jeopardy_state) {
      mergedSettingsObj.jeopardyState = {
        ...jeopardy_state,
        visibility: resolvedVisibility,
        maxPlayers: resolvedMaxPlayers,
        updatedAt: Date.now()
      };
    }
    const initialSettingsJson: string = JSON.stringify(mergedSettingsObj);

    await runSql(
      `INSERT INTO multiplayer_rooms (id, game_id, game_title, host_id, topic, difficulty, question_count, pack_id, visibility, max_players, settings_json, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'waiting', NOW())
       ON CONFLICT(id) DO UPDATE SET
         topic = COALESCE(EXCLUDED.topic, multiplayer_rooms.topic),
         pack_id = COALESCE(EXCLUDED.pack_id, multiplayer_rooms.pack_id),
         visibility = COALESCE(EXCLUDED.visibility, multiplayer_rooms.visibility),
         max_players = COALESCE(EXCLUDED.max_players, multiplayer_rooms.max_players),
         settings_json = COALESCE(EXCLUDED.settings_json, multiplayer_rooms.settings_json)`,
      [roomId, game_id, game_title || game_id, host_id, topic || 'Общие знания', difficulty, finalQuestionCount, pack_id, resolvedVisibility, resolvedMaxPlayers, initialSettingsJson]
    );

    // Add host as participant (host is always ready = 1)
    const existingHost = await getOne<any>(
      'SELECT id FROM multiplayer_participants WHERE room_id = $1 AND user_id = $2',
      [roomId, host_id]
    );
    if (!existingHost) {
      await runSql(
        `INSERT INTO multiplayer_participants (id, room_id, user_id, display_name, avatar_url, team_number, role, current_round, is_finished, is_ready, joined_at)
         VALUES ($1, $2, $3, $4, $5, 1, 'host', 1, 0, 1, NOW())`,
        [partId, roomId, host_id, host_name || null, host_avatar || null]
      );
    }

    if (game_id === '100to1') {
      await ensure100to1TeamsDistributed(roomId);
    }

    const room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [roomId]);
    const parsedSettings = parseRoomSettings(room);
    if (room && room.game_id === 'jeopardy' && parsedSettings.jeopardyState) {
      await syncJeopardyParticipantsProgress(roomId, room, parsedSettings.jeopardyState);
    }
    res.json({
      success: true,
      room: room ? {
        ...room,
        jeopardy_state: enrichJeopardyStateTimers(parsedSettings.jeopardyState || null)
      } : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get single room state with participants and recent actions
multiplayerRouter.get('/rooms/:id', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    await checkAndAutoExpireRooms();

    const { id } = req.params;
    await cleanupDuplicateSelfParticipants(id);
    await ensure100to1TeamsDistributed(id);

    let room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    // Auto-heal missing pack_id by matching game_packs for the same game_id + topic/host
    if (!room.pack_id) {
      const matchedPack = await getOne<any>(
        `SELECT id FROM game_packs 
         WHERE game_id = $1 AND (LOWER(TRIM(topic)) = LOWER(TRIM($2)) OR user_id = $3)
         ORDER BY created_at DESC LIMIT 1`,
        [room.game_id || 'blitz', room.topic || '', String(room.host_id || '')]
      ).catch(() => null);
      if (matchedPack?.id) {
        room.pack_id = matchedPack.id;
        await runSql('UPDATE multiplayer_rooms SET pack_id = $1 WHERE id = $2', [matchedPack.id, id]).catch(() => {});
      }
    }

    let roomQuestions: any[] = [];
    if (room.pack_id) {
      const packRow = await getOne<any>('SELECT questions_json FROM game_packs WHERE id = $1', [room.pack_id]).catch(() => null);
      if (packRow?.questions_json) {
        try {
          const parsed = JSON.parse(packRow.questions_json);
          if (Array.isArray(parsed)) roomQuestions = parsed;
        } catch (_) {}
      }
    }

    // Compute remaining seconds on 5-minute finish countdown if active
    let finishRemainingSeconds: number | null = null;
    if (room.status === 'active' && room.finish_deadline_at) {
      const deadlineMs = parseTimestampMs(room.finish_deadline_at);
      if (deadlineMs !== null) {
        const diffSec = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
        finishRemainingSeconds = diffSec;
        if (diffSec <= 0) {
          await runSql(
            `UPDATE multiplayer_rooms SET status = 'finished', finished_at = COALESCE(finished_at, NOW()) WHERE id = $1`,
            [id]
          );
          room.status = 'finished';
          await finalizeMultiplayerRoomScores(id);
        }
      }
    }

    if (room.status === 'finished' && Number(room.scores_awarded) !== 1) {
      await finalizeMultiplayerRoomScores(id);
      room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    }

    const participants = await getAll<any>(
      `SELECT mp.*, 
              CASE 
                WHEN mp.user_id LIKE '%_self2' THEN COALESCE(mp.display_name, u.display_name, u.username, 'Игрок') || CASE WHEN COALESCE(mp.display_name, '') LIKE '%(2-й участник)%' THEN '' ELSE ' (2-й участник)' END
                ELSE COALESCE(mp.display_name, u.display_name, u.username, 'Игрок')
              END as display_name,
              u.username,
              COALESCE(mp.avatar_url, u.avatar_url, u.photo_url, u.telegram_photo) as avatar_url,
              u.photo_url,
              u.telegram_photo,
              COALESCE(zrm.is_camera_on, 1) as is_camera_on,
              COALESCE(zrm.is_mic_on, 1) as is_mic_on,
              COALESCE(zrm.is_screen_sharing, 0) as is_screen_sharing
       FROM multiplayer_participants mp
       LEFT JOIN users u ON (
         u.uid = mp.user_id OR 
         u.id = mp.user_id OR 
         u.uid = REPLACE(mp.user_id, '_self2', '') OR 
         u.id = REPLACE(mp.user_id, '_self2', '')
       )
       LEFT JOIN zoom_room_members zrm ON (
         (zrm.room_id = mp.room_id OR zrm.room_id = 'room_' || mp.room_id) AND zrm.user_id = mp.user_id
       )
       WHERE mp.room_id = $1
       ORDER BY mp.team_number ASC, mp.joined_at ASC`,
      [id]
    );

    const actions = await getAll<any>(
      `SELECT ma.*,
              COALESCE(u.display_name, u.username, 'Игрок') as user_display_name,
              COALESCE(u.avatar_url, u.photo_url, u.telegram_photo) as user_avatar_url
       FROM multiplayer_actions ma
       LEFT JOIN users u ON (
         u.uid = ma.user_id OR
         u.id = ma.user_id OR
         u.uid = REPLACE(ma.user_id, '_self2', '') OR
         u.id = REPLACE(ma.user_id, '_self2', '')
       )
       WHERE ma.room_id = $1
       ORDER BY ma.created_at DESC LIMIT 80`,
      [id]
    );

    const queryUserId = req.query.user_id ? String(req.query.user_id).trim() : null;
    const isInLobbyQuery = req.query.in_lobby === '1' || req.query.in_lobby === 'true';
    const hostTimerInfo = await evaluateWaitingRoomHostTimer(room, participants, {
      activeLobbyUserId: isInLobbyQuery && queryUserId ? queryUserId : null
    });

    // Keep host first in participant ordering
    participants.sort((a: any, b: any) => {
      const aHost = String(a.user_id) === String(room.host_id) || a.role === 'host' ? 0 : 1;
      const bHost = String(b.user_id) === String(room.host_id) || b.role === 'host' ? 0 : 1;
      if (aHost !== bHost) return aHost - bHost;
      return 0;
    });

    const parsedSettings = parseRoomSettings(room);
    let rawJState = parsedSettings.jeopardyState || null;
    if (room.game_id === 'jeopardy') {
      const firstPlayerId = String(participants[0]?.user_id || room.host_id);
      rawJState = await ensureJeopardyStatePopulatedFromPack(room, rawJState || {}, firstPlayerId);
    }
    if (room.status === 'active' && room.game_id === 'jeopardy' && rawJState) {
      const now = Date.now();
      let jStateChanged = false;
      if (rawJState.phase === 'categories_intro' && rawJState.introStartedAt && now - Number(rawJState.introStartedAt) >= 22000) {
        rawJState = {
          ...rawJState,
          phase: 'board',
          boardTurnStartedAt: now,
          answeringUserId: null,
          activeQuestion: null,
          feedback: null
        };
        jStateChanged = true;
      } else if (rawJState.phase === 'board') {
        if (!rawJState.boardTurnStartedAt) {
          rawJState = { ...rawJState, boardTurnStartedAt: now };
          jStateChanged = true;
        } else if (now - Number(rawJState.boardTurnStartedAt) >= 15000 && participants.length > 0) {
          const orderIds = participants.map((p: any) => String(p.user_id));
          const curChooser = String(rawJState.choosingUserId || orderIds[0]);
          const curIdx = Math.max(0, orderIds.indexOf(curChooser));
          const nextChooser = orderIds[(curIdx + 1) % orderIds.length];
          rawJState = {
            ...rawJState,
            choosingUserId: nextChooser,
            boardTurnStartedAt: now
          };
          jStateChanged = true;
        }
      }
      if (jStateChanged) {
        await saveRoomJeopardyState(id, room, rawJState);
      }
    }
    const enrichedJeopardyState = enrichJeopardyStateTimers(rawJState);
    const rawRoomVis = room.visibility || parsedSettings?.visibility || parsedSettings?.jeopardyState?.visibility || 'public';
    const normalizedRoomVisibility: 'public' | 'private' =
      rawRoomVis === 'private' || rawVisFallback(rawRoomVis) === 'private' ? 'private' : 'public';
    function rawVisFallback(v: any) { return v === 'closed' ? 'private' : 'public'; }
    const normalizedRoomMaxPlayers = Math.min(
      8,
      Math.max(
        2,
        Number(
          room.max_players ||
            parsedSettings?.max_players ||
            parsedSettings?.maxPlayers ||
            parsedSettings?.jeopardyState?.maxPlayers
        ) || 8
      )
    );

    res.json({
      room: {
        ...room,
        host_id: hostTimerInfo.hostId || room.host_id,
        visibility: normalizedRoomVisibility,
        max_players: normalizedRoomMaxPlayers,
        finish_remaining_seconds: finishRemainingSeconds,
        is_host_in_lobby: hostTimerInfo.isHostInLobby,
        online_in_lobby_count: hostTimerInfo.onlineInLobbyCount,
        host_transfer_remaining_seconds: hostTimerInfo.hostTransferRemainingSeconds,
        host_timer_paused: hostTimerInfo.hostTimerPaused,
        is_host_free: hostTimerInfo.isHostFree,
        questions: roomQuestions,
        jeopardy_state: enrichedJeopardyState,
        team_game_state: parsedSettings.teamGameState || null
      },
      jeopardy_state: enrichedJeopardyState,
      team_game_state: parsedSettings.teamGameState || null,
      questions: roomQuestions,
      participants: participants.map((p: any) => {
        const isHostUser = String(p.user_id) === String(room.host_id) || p.role === 'host';
        return {
          ...p,
          current_round: Math.max(1, Number(p.current_round) || 1),
          is_finished: Number(p.is_finished) || 0,
          is_ready: isHostUser ? 1 : Number(p.is_ready ?? 0),
          score: Number(p.score) || 0,
          awarded_score: p.awarded_score !== null && p.awarded_score !== undefined ? Number(p.awarded_score) : null,
          correct_count: Number(p.correct_count) || 0,
          wrong_count: Number(p.wrong_count) || 0,
          finish_time_ms: p.finish_time_ms !== null && p.finish_time_ms !== undefined ? Number(p.finish_time_ms) : null
        };
      }),
      actions: actions.reverse()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3a. Set a single participant's team (1 or 2) in 100to1 lobby
multiplayerRouter.post('/rooms/:id/team', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const { id } = req.params;
    const { user_id, team_number } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    const validTeam = Number(team_number) === 2 ? 2 : 1;

    await runSql(
      'UPDATE multiplayer_participants SET team_number = $1 WHERE room_id = $2 AND user_id = $3',
      [validTeam, id, String(user_id)]
    );
    // If playing solo with _self2 in 100to1, keep _self2 on the opposite team so both teams always have a player
    const allRoomParts = await getAll<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY joined_at ASC',
      [id]
    );
    const realRoomParts = allRoomParts.filter(p => !String(p.user_id || '').endsWith('_self2'));
    const self2RoomParts = allRoomParts.filter(p => String(p.user_id || '').endsWith('_self2'));
    if (realRoomParts.length === 1 && self2RoomParts.length === 1) {
      const realPart = realRoomParts[0];
      const self2Part = self2RoomParts[0];
      const oppositeTeam = (Number(realPart.team_number) === 2 ? 2 : 1) === 1 ? 2 : 1;
      if (String(user_id) === String(realPart.user_id) && Number(self2Part.team_number) !== oppositeTeam) {
        await runSql('UPDATE multiplayer_participants SET team_number = $1 WHERE id = $2', [oppositeTeam, self2Part.id]);
      } else if (String(user_id) === String(self2Part.user_id) && Number(realPart.team_number) === validTeam) {
        await runSql('UPDATE multiplayer_participants SET team_number = $1 WHERE id = $2', [validTeam === 1 ? 2 : 1, realPart.id]);
      }
    }

    const updatedParts = await getAll<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY team_number ASC, joined_at ASC',
      [id]
    );
    res.json({ success: true, participants: updatedParts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3b. Distribute participants into 2 teams (for 100to1 lobby)
multiplayerRouter.post('/rooms/:id/distribute-teams', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const { id } = req.params;
    const { mode = 'even' } = req.body || {};

    const parts = await getAll<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY joined_at ASC',
      [id]
    );

    if (parts.length > 0) {
      const ordered = mode === 'random' ? [...parts].sort(() => Math.random() - 0.5) : [...parts];
      for (let i = 0; i < ordered.length; i++) {
        const assignedTeam = (i % 2) + 1;
        await runSql(
          'UPDATE multiplayer_participants SET team_number = $1 WHERE id = $2',
          [assignedTeam, ordered[i].id]
        );
      }
    }

    const updatedParts = await getAll<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY team_number ASC, joined_at ASC',
      [id]
    );
    res.json({ success: true, participants: updatedParts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3c. Real-time team game state sync for 100to1
multiplayerRouter.post('/rooms/:id/team-sync', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const { id } = req.params;
    const incomingState = req.body?.teamGameState || req.body || {};

    const room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    const settings = parseRoomSettings(room);
    const ts = Number(incomingState.updated_at || incomingState.updatedAt) || Date.now();
    const updatedTeamGameState = {
      ...(settings.teamGameState || {}),
      ...incomingState,
      updated_at: ts,
      updatedAt: ts
    };
    settings.teamGameState = updatedTeamGameState;

    await runSql('UPDATE multiplayer_rooms SET settings_json = $1 WHERE id = $2', [
      JSON.stringify(settings),
      id
    ]);

    const t1Score =
      typeof incomingState.team1_score === 'number'
        ? incomingState.team1_score
        : Array.isArray(incomingState.players) && incomingState.players.length >= 1
        ? Number(incomingState.players[0]?.score) || 0
        : null;
    const t2Score =
      typeof incomingState.team2_score === 'number'
        ? incomingState.team2_score
        : Array.isArray(incomingState.players) && incomingState.players.length >= 2
        ? Number(incomingState.players[1]?.score) || 0
        : null;

    if (t1Score !== null) {
      await runSql(
        'UPDATE multiplayer_participants SET score = $1 WHERE room_id = $2 AND COALESCE(team_number, 1) = 1',
        [t1Score, id]
      ).catch(() => {});
    }
    if (t2Score !== null) {
      await runSql(
        'UPDATE multiplayer_participants SET score = $1 WHERE room_id = $2 AND team_number = 2',
        [t2Score, id]
      ).catch(() => {});
    }

    res.json({ success: true, team_game_state: updatedTeamGameState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Join room (preserves existing score, current_round, is_finished, and sets is_ready = 0 for non-hosts)
multiplayerRouter.post('/rooms/:id/join', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const { id } = req.params;
    const { user_id, display_name, avatar_url, team_number } = req.body;

    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    // Check existing participant
    const existing = await getOne<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (existing) {
      // Never reset score, current_round, is_finished, or is_ready on re-join!
      // Only update team_number if explicit_team_change is requested, so re-opening the room never overwrites team assignment
      const nextTeamNum = req.body.explicit_team_change && team_number !== undefined ? Number(team_number) : existing.team_number;
      if (display_name || avatar_url || nextTeamNum !== existing.team_number) {
        await runSql(
          `UPDATE multiplayer_participants
           SET display_name = COALESCE($1::text, display_name),
               avatar_url = COALESCE($2::text, avatar_url),
               team_number = COALESCE($3::int, team_number)
           WHERE id = $4`,
          [display_name || null, avatar_url || null, nextTeamNum ?? null, existing.id]
        );
      }
      await cleanupDuplicateSelfParticipants(id);
      if (room.game_id === '100to1') {
        await ensure100to1TeamsDistributed(id);
      }
      const allPartsNow = await getAll<any>(
        'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY joined_at ASC',
        [id]
      );
      const hostTimerInfo = await evaluateWaitingRoomHostTimer(room, allPartsNow, {
        activeLobbyUserId: String(user_id)
      });
      const updated = await getOne<any>('SELECT * FROM multiplayer_participants WHERE id = $1', [existing.id]);
      return res.json({
        success: true,
        participant: updated,
        is_existing: true,
        host_id: hostTimerInfo.hostId || room.host_id
      });
    }

    // Requirement 9 & 13 & 14: After the game has started, new non-participants CANNOT join,
    // EXCEPT returning participants who have saved game_progress / savedScoresByUser for this room/pack or the room host!
    const parsedRoomSettings = parseRoomSettings(room);
    const savedInRoomJState = parsedRoomSettings?.jeopardyState?.savedScoresByUser?.[String(user_id)] || null;
    const savedProgressRow = await getOne<any>(
      `SELECT * FROM game_progress WHERE user_id = $1 AND id = $2 LIMIT 1`,
      [String(user_id), `gp_mp_${id}_${user_id}`]
    ).catch(() => null);
    const isReturningParticipant = Boolean(savedProgressRow) || Boolean(savedInRoomJState) || String(room.host_id) === String(user_id);

    if (room.status === 'active' && !isReturningParticipant) {
      return res.status(403).json({
        error: 'Игра уже началась. Присоединиться к начатой игре могут только текущие участники.',
        code: 'GAME_ALREADY_STARTED'
      });
    }

    if (room.status === 'finished' || room.status === 'cancelled') {
      return res.status(403).json({
        error: 'Эта игра уже завершена.',
        code: 'ROOM_FINISHED',
        room_finished: true
      });
    }

    // Requirement 1 (Jeopardy): Minimum 76 IIkr on balance required to join a Jeopardy multiplayer lobby
    if (room.game_id === 'jeopardy' && !String(user_id).endsWith('_self2') && !isReturningParticipant) {
      const userRow = await getOne<any>(
        'SELECT balance FROM users WHERE uid = $1 OR id = $2',
        [String(user_id), String(user_id)]
      ).catch(() => null);
      if (userRow && Number(userRow.balance ?? 0) < 76) {
        return res.status(403).json({
          error: 'Для вступления в лобби Своей Икры необходимо минимум 76 ИИкр на балансе',
          code: 'INSUFFICIENT_BALANCE'
        });
      }
    }

    // Requirement 4: If someone tries to add a _self2 duplicate when real other players are already in the lobby, block it
    const currentParts = await getAll<any>(
      'SELECT user_id FROM multiplayer_participants WHERE room_id = $1',
      [id]
    );
    const realDistinctUsers = new Set(
      currentParts
        .filter((p: any) => !String(p.user_id).endsWith('_self2'))
        .map((p: any) => String(p.user_id))
    );

    if (String(user_id).endsWith('_self2') && realDistinctUsers.size >= 2) {
      await cleanupDuplicateSelfParticipants(id);
      return res.status(400).json({
        error: 'В лобби уже есть другие участники — дубль второго участника не требуется',
        code: 'DUPLICATE_NOT_NEEDED'
      });
    }

    // If a real 2nd participant is joining, first clean up any _self2 duplicate so it doesn't count towards the 8 limit
    if (!String(user_id).endsWith('_self2') && realDistinctUsers.size >= 1 && !realDistinctUsers.has(String(user_id))) {
      await runSql(
        "DELETE FROM multiplayer_participants WHERE room_id = $1 AND user_id LIKE '%_self2'",
        [id]
      );
      await runSql(
        "DELETE FROM zoom_room_members WHERE (room_id = $1 OR room_id = $2) AND user_id LIKE '%_self2'",
        [id, `room_${id}`]
      );
    }

    // Requirement 2 & 8: Max participants in a multiplayer game room (2..8 configured by host)
    const remainingParts = await getAll<any>(
      'SELECT id, team_number FROM multiplayer_participants WHERE room_id = $1',
      [id]
    );
    const roomMaxPlayers = Math.min(
      MAX_ROOM_PARTICIPANTS,
      Math.max(
        2,
        Number(
          room.max_players ||
            parsedRoomSettings?.max_players ||
            parsedRoomSettings?.maxPlayers ||
            parsedRoomSettings?.jeopardyState?.maxPlayers
        ) || MAX_ROOM_PARTICIPANTS
      )
    );
    if (remainingParts.length >= roomMaxPlayers) {
      return res.status(400).json({
        error: `В комнате достигнут лимит участников (максимум ${roomMaxPlayers})`,
        code: 'ROOM_FULL'
      });
    }

    const team1Count = remainingParts.filter((p: any) => Number(p.team_number || 1) !== 2).length;
    const team2Count = remainingParts.filter((p: any) => Number(p.team_number) === 2).length;
    const targetTeam =
      team_number !== undefined && team_number !== null
        ? Number(team_number) === 2
          ? 2
          : 1
        : room.game_id === '100to1'
        ? team1Count <= team2Count
          ? 1
          : 2
        : 1;
    const teamMembers = remainingParts.filter((p: any) => Number(p.team_number) === Number(targetTeam));

    if (room.game_id === '100to1' && teamMembers.length >= 4) {
      return res.status(400).json({ error: 'В этой команде уже максимальное число участников (4)' });
    }

    const isHost = String(user_id) === String(room.host_id);
    const isFirstInTeam = teamMembers.length === 0;
    const role = isHost ? 'host' : isFirstInTeam ? 'captain' : 'player';
    const initialReady = isHost || isReturningParticipant ? 1 : 0;
    const partId = generateId('mpp_');
    const restoredScore =
      savedInRoomJState?.score !== undefined
        ? Number(savedInRoomJState.score) || 0
        : savedProgressRow
        ? Number(savedProgressRow.score) || 0
        : 0;
    const restoredCorrect =
      savedInRoomJState?.correct_count !== undefined
        ? Number(savedInRoomJState.correct_count) || 0
        : savedProgressRow
        ? Number(savedProgressRow.correct_answers) || 0
        : 0;
    const restoredWrong =
      savedInRoomJState?.wrong_count !== undefined
        ? Number(savedInRoomJState.wrong_count) || 0
        : 0;
    const restoredRound =
      room.game_id === 'jeopardy' && parsedRoomSettings?.jeopardyState
        ? Math.min(76, (Number(parsedRoomSettings.jeopardyState.totalAnsweredCount) || 0) + 1)
        : savedProgressRow
        ? Math.max(1, Number(savedProgressRow.current_step) || 1)
        : 1;

    await runSql(
      `INSERT INTO multiplayer_participants (id, room_id, user_id, display_name, avatar_url, team_number, role, score, correct_count, wrong_count, current_round, is_finished, is_ready, joined_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, NOW())`,
      [partId, id, user_id, display_name || null, avatar_url || null, targetTeam, role, restoredScore, restoredCorrect, restoredWrong, restoredRound, initialReady]
    );

    await cleanupDuplicateSelfParticipants(id);
    if (room.game_id === '100to1') {
      await ensure100to1TeamsDistributed(id);
    }
    const allPartsAfterJoin = await getAll<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY joined_at ASC',
      [id]
    );
    const hostTimerInfo = await evaluateWaitingRoomHostTimer(room, allPartsAfterJoin, {
      activeLobbyUserId: String(user_id)
    });
    if (room.game_id === 'jeopardy') {
      const parsedSettings = parseRoomSettings(room);
      if (parsedSettings.jeopardyState) {
        await syncJeopardyParticipantsProgress(id, room, parsedSettings.jeopardyState);
      }
    }

    const finalRole = String(hostTimerInfo.hostId) === String(user_id) ? 'host' : role;
    const finalReady = finalRole === 'host' ? 1 : initialReady;
    res.json({
      success: true,
      participant_id: partId,
      role: finalRole,
      is_ready: finalReady,
      host_id: hostTimerInfo.hostId || room.host_id
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4a. Confirm participation ("Готово")
multiplayerRouter.post('/rooms/:id/ready', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const { id } = req.params;
    const { user_id, is_ready = 1, display_name } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const existing = await getOne<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (existing) {
      await runSql(
        `UPDATE multiplayer_participants SET is_ready = $1 WHERE id = $2`,
        [is_ready ? 1 : 0, existing.id]
      );
    }

    // Log ready event in room actions
    if (is_ready) {
      const actionId = generateId('mpa_');
      await runSql(
        `INSERT INTO multiplayer_actions (id, room_id, user_id, action_type, payload_json, created_at)
         VALUES ($1, $2, $3, 'ready', $4, NOW())`,
        [
          actionId,
          id,
          user_id,
          JSON.stringify({
            text: `${display_name || existing?.display_name || 'Участник'} подтвердил готовность («Готово»)`,
            sender_name: display_name || existing?.display_name || 'Участник'
          })
        ]
      );
    }

    res.json({ success: true, is_ready: is_ready ? 1 : 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4a-bis. Update waiting lobby presence (enter / exit lobby view) & record room invites
multiplayerRouter.post('/rooms/:id/lobby-presence', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const { id } = req.params;
    const { user_id, in_lobby } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    const parts = await getAll<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY joined_at ASC',
      [id]
    );
    const timerInfo = await evaluateWaitingRoomHostTimer(room, parts, {
      activeLobbyUserId: in_lobby ? String(user_id) : null,
      explicitLeaveLobbyUserId: !in_lobby ? String(user_id) : null
    });

    res.json({
      success: true,
      ...timerInfo
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

multiplayerRouter.post('/rooms/:id/invite', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const { id } = req.params;
    const { invited_user_id, invited_user_ids } = req.body || {};
    const room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    const settings = parseRoomSettings(room);
    const existingInvited: string[] = Array.isArray(settings.invitedUserIds)
      ? settings.invitedUserIds.map(String)
      : [];
    const incoming: string[] = [];
    if (invited_user_id) incoming.push(String(invited_user_id));
    if (Array.isArray(invited_user_ids)) {
      for (const u of invited_user_ids) {
        if (u) incoming.push(String(u));
      }
    }
    for (const uid of incoming) {
      if (uid && !existingInvited.includes(uid)) {
        existingInvited.push(uid);
      }
    }
    settings.invitedUserIds = existingInvited;
    const jsonStr = JSON.stringify(settings);
    await runSql('UPDATE multiplayer_rooms SET settings_json = $1 WHERE id = $2', [jsonStr, id]);
    res.json({ success: true, invited_user_ids: existingInvited });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4b. Leave room (preserves individual score & progress so user can return from History or Multiplayer page!)
multiplayerRouter.post('/rooms/:id/leave', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const uidStr = String(user_id);
    const roomBeforeLeave = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    const leavingPart = await getOne<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 AND user_id = $2',
      [id, uidStr]
    );

    // Requirement 13: Save leaving participant's individual score & unified room progress BEFORE removing them
    if (roomBeforeLeave && leavingPart && !uidStr.endsWith('_self2')) {
      const settings = parseRoomSettings(roomBeforeLeave);
      const jState = settings.jeopardyState || null;
      if (jState) {
        jState.savedScoresByUser = {
          ...(jState.savedScoresByUser || {}),
          [uidStr]: {
            score: Number(leavingPart.score) || 0,
            correct_count: Number(leavingPart.correct_count) || 0,
            wrong_count: Number(leavingPart.wrong_count) || 0
          }
        };
        await saveRoomJeopardyState(id, roomBeforeLeave, jState);
        await syncJeopardyParticipantsProgress(id, roomBeforeLeave, jState);
      }
    }

    if (uidStr.endsWith('_self2')) {
      await runSql(
        'DELETE FROM multiplayer_participants WHERE room_id = $1 AND user_id = $2',
        [id, uidStr]
      );
      await runSql(
        'DELETE FROM zoom_room_members WHERE (room_id = $1 OR room_id = $2) AND user_id = $3',
        [id, `room_${id}`, uidStr]
      ).catch(() => {});
    } else {
      await runSql(
        'DELETE FROM multiplayer_participants WHERE room_id = $1 AND (user_id = $2 OR user_id = $3)',
        [id, uidStr, `${uidStr}_self2`]
      );
      await runSql(
        'DELETE FROM zoom_room_members WHERE (room_id = $1 OR room_id = $2) AND (user_id = $3 OR user_id = $4)',
        [id, `room_${id}`, uidStr, `${uidStr}_self2`]
      ).catch(() => {});
    }

    // Check remaining participants in room
    const remaining = await getAll<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY joined_at ASC',
      [id]
    );
    const room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    if (room) {
      if (room.status === 'waiting') {
        // In waiting status: start the 10-minute host absence timer if host left (so host can return within 10m without losing creator role,
        // and after 10m it transfers to the first participant in the list or first joiner)
        await evaluateWaitingRoomHostTimer(room, remaining, {
          explicitLeaveLobbyUserId: uidStr
        });
      } else if (remaining.length > 0) {
        const nextHost = remaining.find((p: any) => !String(p.user_id).endsWith('_self2')) || remaining[0];
        // Requirement 14: Reassign host & generator rights in active games if previous host/generator left
        if (String(room.host_id) === uidStr && nextHost) {
          await runSql('UPDATE multiplayer_rooms SET host_id = $1 WHERE id = $2', [nextHost.user_id, id]);
          await runSql('UPDATE multiplayer_participants SET role = $1, is_ready = 1 WHERE id = $2', ['host', nextHost.id]);
        }
        if (room.game_id === 'jeopardy' && nextHost) {
          const settings = parseRoomSettings(room);
          if (settings.jeopardyState) {
            const js = settings.jeopardyState;
            let updatedJs = false;
            if (!js.generatorUserId || String(js.generatorUserId) === uidStr) {
              js.generatorUserId = String(nextHost.user_id);
              updatedJs = true;
            }
            if (String(js.choosingUserId) === uidStr) {
              js.choosingUserId = String(nextHost.user_id);
              updatedJs = true;
            }
            if (updatedJs) {
              await saveRoomJeopardyState(id, room, js);
            }
          }
        }
        // If room is active and all remaining participants have already finished, finalize immediately
        if (room.status === 'active' && remaining.every((p: any) => Number(p.is_finished) === 1)) {
          await runSql(
            `UPDATE multiplayer_rooms SET status = 'finished', finished_at = COALESCE(finished_at, NOW()) WHERE id = $1`,
            [id]
          );
          await finalizeMultiplayerRoomScores(id);
        }
      }
    }

    res.json({ success: true, remaining_count: remaining.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Update participant round & score progress (monotonic protection so re-entering never wipes results)
multiplayerRouter.post('/rooms/:id/progress', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const { id } = req.params;
    const {
      user_id,
      current_round,
      score,
      correct_count,
      wrong_count,
      is_finished,
      force_reset,
      pack_id
    } = req.body;

    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    if (pack_id) {
      await runSql(
        `UPDATE multiplayer_rooms SET pack_id = COALESCE(pack_id, $1::text) WHERE id = $2`,
        [String(pack_id), id]
      ).catch(() => {});
    }

    const room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    const existing = await getOne<any>(
      'SELECT * FROM multiplayer_participants WHERE room_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (existing) {
      const prevRound = Math.max(1, Number(existing.current_round) || 1);
      const prevScore = Number(existing.score) || 0;
      const prevCorrect = Number(existing.correct_count) || 0;
      const prevWrong = Number(existing.wrong_count) || 0;
      const prevFinished = Number(existing.is_finished) || 0;

      // Monotonic guard: if already finished or if incoming values are initial 1/0 defaults, keep highest progress
      const nextRound = force_reset
        ? (typeof current_round === 'number' ? current_round : 1)
        : Math.max(prevRound, typeof current_round === 'number' ? current_round : prevRound);

      const isJeopardyRoom = room?.game_id === 'jeopardy' || Boolean(req.body.allow_score_decrease);
      const nextScore = (force_reset || isJeopardyRoom)
        ? (typeof score === 'number' ? score : prevScore)
        : Math.max(prevScore, typeof score === 'number' ? score : prevScore);

      const totalRoomQ = Math.max(1, Number(room?.question_count) || 10);
      const nextFinished = force_reset
        ? (typeof is_finished === 'number' ? is_finished : 0)
        : Math.max(prevFinished, typeof is_finished === 'number' ? is_finished : prevFinished);

      const rawNextCorrect = force_reset
        ? (typeof correct_count === 'number' ? correct_count : 0)
        : Math.max(prevCorrect, typeof correct_count === 'number' ? correct_count : prevCorrect);

      // When unfinished and before the final question, correct_count cannot exceed the number of completed questions (nextRound - 1)
      const nextCorrect = nextFinished === 0 && nextRound < totalRoomQ
        ? Math.min(rawNextCorrect, Math.max(0, nextRound - 1))
        : Math.min(totalRoomQ, rawNextCorrect);

      const nextWrong = force_reset
        ? (typeof wrong_count === 'number' ? wrong_count : 0)
        : Math.max(prevWrong, typeof wrong_count === 'number' ? wrong_count : prevWrong);

      let finishTimeMs = existing.finish_time_ms;
      let finishedAt = existing.finished_at;

      if (nextFinished === 1 && prevFinished === 0) {
        finishedAt = new Date().toISOString();
        const startedMs = parseTimestampMs(room?.started_at);
        if (startedMs !== null) {
          finishTimeMs = Math.max(1000, Date.now() - startedMs);
        } else {
          finishTimeMs = 60000;
        }
      }

      await runSql(
        `UPDATE multiplayer_participants
         SET current_round = $1,
              score = $2,
              correct_count = $3,
              wrong_count = $4,
              is_finished = $5,
              finished_at = COALESCE($6::timestamptz, finished_at),
              finish_time_ms = COALESCE($7::bigint, finish_time_ms)
         WHERE id = $8`,
        [
          nextRound,
          nextScore,
          nextCorrect,
          nextWrong,
          nextFinished,
          finishedAt || null,
          finishTimeMs ?? null,
          existing.id
        ]
      );

      // Check completion rules & start 5-minute countdown timer if someone finished while others are still playing
      if (room && (room.status === 'active' || room.status === 'waiting')) {
        if (room.status === 'waiting' && (nextRound > 1 || nextScore > 0 || nextCorrect > 0 || nextFinished === 1)) {
          await runSql(
            `UPDATE multiplayer_rooms SET status = 'active', started_at = COALESCE(started_at, NOW()) WHERE id = $1`,
            [id]
          );
          room.status = 'active';
        }

        if (nextFinished === 1) {
          const allParts = await getAll<any>(
            'SELECT user_id, is_finished, correct_count FROM multiplayer_participants WHERE room_id = $1',
            [id]
          );
          // Exclude synthetic _self2 when checking if real participants finished, unless _self2 is the only other participant
          const realParts = allParts.filter(p => !String(p.user_id).endsWith('_self2'));
          const checkParts = realParts.length > 1 ? realParts : allParts;
          const everyoneFinished = checkParts.length > 0 && checkParts.every(p => Number(p.is_finished) === 1);
          const isBlitzInstantWin =
            (!room.game_id || room.game_id === 'blitz') &&
            (nextCorrect >= 7 || allParts.some(p => Number(p.is_finished) === 1 && Number(p.correct_count) >= 7));

          if (everyoneFinished || isBlitzInstantWin) {
            await runSql(
              `UPDATE multiplayer_rooms 
               SET status = 'finished',
                   finished_at = COALESCE(finished_at, NOW()),
                   finish_deadline_at = NULL
               WHERE id = $1`,
              [id]
            );
            await finalizeMultiplayerRoomScores(id);
          } else if (!room.first_finished_at || !room.finish_deadline_at) {
            await runSql(
              `UPDATE multiplayer_rooms 
               SET first_finished_at = COALESCE(first_finished_at, NOW()),
                   finish_deadline_at = COALESCE(finish_deadline_at, (NOW() + INTERVAL '5 minutes'))
               WHERE id = $1`,
              [id]
            );
          }
        }
      }
    }

    const updatedRoom = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    const updatedParts = await getAll<any>('SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY joined_at ASC', [id]);
    let finishRemainingSeconds: number | null = null;
    if (updatedRoom?.status === 'active' && updatedRoom?.finish_deadline_at) {
      const dMs = parseTimestampMs(updatedRoom.finish_deadline_at);
      if (dMs !== null) {
        finishRemainingSeconds = Math.max(0, Math.ceil((dMs - Date.now()) / 1000));
      }
    }
    res.json({
      success: true,
      room_status: updatedRoom?.status || 'active',
      finish_remaining_seconds: finishRemainingSeconds,
      room: updatedRoom ? { ...updatedRoom, finish_remaining_seconds: finishRemainingSeconds } : null,
      participants: updatedParts
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Post action / answer / chat (with file/voice attachments) in multiplayer room
multiplayerRouter.post('/rooms/:id/action', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const { id } = req.params;
    const { user_id, action_type, payload } = req.body;

    if (!user_id || !action_type) {
      return res.status(400).json({ error: 'user_id and action_type are required' });
    }

    const actionId = generateId('mpa_');
    await runSql(
      `INSERT INTO multiplayer_actions (id, room_id, user_id, action_type, payload_json, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [actionId, id, user_id, action_type, JSON.stringify(payload || {})]
    );

    if (payload?.score_delta || typeof payload?.current_round === 'number') {
      const scoreDelta = Number(payload?.score_delta) || 0;
      const roundVal = typeof payload?.current_round === 'number' ? payload.current_round : null;
      await runSql(
        `UPDATE multiplayer_participants 
         SET score = score + $1, 
             correct_count = correct_count + CASE WHEN $2 > 0 THEN 1 ELSE 0 END,
             wrong_count = wrong_count + CASE WHEN $3 < 0 THEN 1 ELSE 0 END,
             current_round = COALESCE($4::int, current_round)
         WHERE room_id = $5 AND user_id = $6`,
        [scoreDelta, scoreDelta, scoreDelta, roundVal, id, user_id]
      );
    }

    res.json({ success: true, action_id: actionId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Update room status (only creator starts game -> sets started_at)
multiplayerRouter.patch('/rooms/:id', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const { id } = req.params;
    const { status, current_question_index, pack_id, jeopardy_state } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (status) {
      updates.push(`status = $${pIdx++}`);
      params.push(status);
      if (status === 'active') {
        updates.push("started_at = COALESCE(started_at, NOW())");
        await cleanupDuplicateSelfParticipants(id);
        await ensure100to1TeamsDistributed(id);
      } else if (status === 'finished') {
        updates.push("finished_at = COALESCE(finished_at, NOW())");
      }
    }

    if (typeof current_question_index === 'number') {
      updates.push(`current_question_index = $${pIdx++}`);
      params.push(current_question_index);
    }

    if (pack_id) {
      updates.push(`pack_id = COALESCE(pack_id, $${pIdx++}::text)`);
      params.push(String(pack_id));
    }

    if (updates.length > 0) {
      params.push(id);
      await runSql(`UPDATE multiplayer_rooms SET ${updates.join(', ')} WHERE id = $${pIdx}`, params);
    }

    const room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    if (room && room.game_id === 'jeopardy') {
      const settings = parseRoomSettings(room);
      const currentJState = settings.jeopardyState || {};
      const parts = await getAll<any>(
        'SELECT * FROM multiplayer_participants WHERE room_id = $1 ORDER BY team_number ASC, joined_at ASC',
        [id]
      );
      const firstPlayerId = String(parts[0]?.user_id || room.host_id);
      if (jeopardy_state) {
        const mergedJState = await ensureJeopardyStatePopulatedFromPack(
          room,
          {
            ...currentJState,
            ...jeopardy_state,
            choosingUserId: jeopardy_state.choosingUserId || currentJState.choosingUserId || firstPlayerId
          },
          firstPlayerId
        );
        await saveRoomJeopardyState(id, room, mergedJState);
      } else if (status === 'active') {
        const mergedJState = await ensureJeopardyStatePopulatedFromPack(
          room,
          {
            ...currentJState,
            phase: 'categories_intro',
            introStartedAt: Date.now(),
            round: currentJState.round || 1,
            choosingUserId: currentJState.choosingUserId || firstPlayerId,
            answeringUserId: null,
            totalAnsweredCount: currentJState.totalAnsweredCount || 0
          },
          firstPlayerId
        );
        await saveRoomJeopardyState(id, room, mergedJState);
      }
    }

    if (status === 'finished') {
      await finalizeMultiplayerRoomScores(id);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Real-time synchronized state machine for Jeopardy ("Своя Икра") multiplayer
multiplayerRouter.post('/rooms/:id/jeopardy-sync', async (req, res) => {
  try {
    await ensureMultiplayerColumns();
    const { id } = req.params;
    const { op, user_id, payload = {} } = req.body;

    const room = await getOne<any>('SELECT * FROM multiplayer_rooms WHERE id = $1', [id]);
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    const parts = await getAll<any>(
      `SELECT mp.*,
              CASE
                WHEN mp.user_id LIKE '%_self2' THEN COALESCE(mp.display_name, u.display_name, u.username, 'Игрок') || CASE WHEN COALESCE(mp.display_name, '') LIKE '%(2-й участник)%' THEN '' ELSE ' (2-й участник)' END
                ELSE COALESCE(mp.display_name, u.display_name, u.username, 'Игрок')
              END as display_name,
              COALESCE(mp.avatar_url, u.avatar_url, u.photo_url, u.telegram_photo) as avatar_url
       FROM multiplayer_participants mp
       LEFT JOIN users u ON (
         u.uid = mp.user_id OR
         u.id = mp.user_id OR
         u.uid = REPLACE(mp.user_id, '_self2', '') OR
         u.id = REPLACE(mp.user_id, '_self2', '')
       )
       WHERE mp.room_id = $1
       ORDER BY mp.team_number ASC, mp.joined_at ASC`,
      [id]
    );

    const firstPlayerId = String(parts[0]?.user_id || room.host_id);
    const realParticipants = parts.filter(p => !String(p.user_id).endsWith('_self2'));
    const activeParticipantIds = (realParticipants.length > 0 ? realParticipants : parts).map(p => String(p.user_id));

    const settings = parseRoomSettings(room);
    let jState: any = settings.jeopardyState || {
      round: 1,
      phase: 'categories_intro',
      choosingUserId: firstPlayerId,
      answeringUserId: null,
      generatorUserId: firstPlayerId,
      allTopics: [],
      categories: [],
      pastRoundsCategories: {},
      totalAnsweredCount: 0
    };
    jState = await ensureJeopardyStatePopulatedFromPack(room, jState, firstPlayerId);

    // Requirement 14: If the game creator/generator is not currently in the room, assign generator rights to the next participant in the list
    const curGenId = String(jState.generatorUserId || room.host_id || firstPlayerId);
    const activeGenId = activeParticipantIds.includes(curGenId)
      ? curGenId
      : activeParticipantIds.includes(String(room.host_id))
      ? String(room.host_id)
      : (activeParticipantIds[0] || firstPlayerId);
    jState.generatorUserId = activeGenId;

    // Also if choosingUserId left the room, fallback to activeGenId
    if (jState.choosingUserId && parts.length > 0 && !parts.some(p => String(p.user_id) === String(jState.choosingUserId))) {
      jState.choosingUserId = activeGenId;
    }

    const getParticipantName = (uid: string | null | undefined) => {
      if (!uid) return 'Игрок';
      const found = parts.find(p => String(p.user_id) === String(uid));
      return found?.display_name || 'Игрок';
    };

    const computeNextAuctionBidder = (
      currentHighBid: number,
      highBidderId: string | null,
      passedIds: string[],
      startFromUserId: string,
      hasPlacedInitialBid: boolean = true,
      nominalValue: number = 100
    ): string | null => {
      if (parts.length === 0) return null;
      const orderedIds = parts.map(p => String(p.user_id));
      const startIdx = Math.max(0, orderedIds.indexOf(String(startFromUserId)));
      for (let offset = 1; offset <= orderedIds.length; offset++) {
        const candidateId = orderedIds[(startIdx + offset) % orderedIds.length];
        if (passedIds.includes(candidateId)) continue;
        if (hasPlacedInitialBid && highBidderId && candidateId === String(highBidderId)) continue;
        const part = parts.find(p => String(p.user_id) === candidateId);
        const pScore = Number(part?.score) || 0;
        if (hasPlacedInitialBid) {
          // Player must have a strictly higher balance than currentHighBid to outbid
          if (pScore > currentHighBid) {
            return candidateId;
          }
        } else {
          // Initial bid not yet placed: player needs at least nominalValue
          if (pScore >= nominalValue) {
            return candidateId;
          }
        }
      }
      return null;
    };

    const buildAuctionTurnOrder = (
      chooserUid: string,
      currentBidderUid: string | null,
      highBidderUid: string | null,
      currentHighBidVal: number,
      nominalVal: number,
      passedList: string[],
      autoSkippedList: string[],
      hasPlacedInitial: boolean,
      onlyNominal: boolean = false
    ) => {
      if (parts.length === 0) return [];
      const orderedIds = parts.map(p => String(p.user_id));
      const startIdx = Math.max(0, orderedIds.indexOf(String(chooserUid)));
      const result: any[] = [];
      for (let offset = 0; offset < orderedIds.length; offset++) {
        const uid = orderedIds[(startIdx + offset) % orderedIds.length];
        const pObj = parts.find(p => String(p.user_id) === uid);
        const pScore = Number(pObj?.score) || 0;
        const isCurrent = Boolean(currentBidderUid && String(currentBidderUid) === uid);
        const isHighBidder = Boolean(hasPlacedInitial && highBidderUid && String(highBidderUid) === uid);
        const isAutoSkipped = autoSkippedList.includes(uid) || (!isHighBidder && !isCurrent && (onlyNominal || pScore < nominalVal || (hasPlacedInitial && pScore <= currentHighBidVal)));
        const isPassed = passedList.includes(uid) && !autoSkippedList.includes(uid);
        let status: 'current' | 'high_bidder' | 'passed' | 'auto_skipped' | 'waiting' = 'waiting';
        if (isCurrent) status = 'current';
        else if (isHighBidder) status = 'high_bidder';
        else if (isAutoSkipped) status = 'auto_skipped';
        else if (isPassed) status = 'passed';
        result.push({
          order: offset + 1,
          userId: uid,
          displayName: pObj?.display_name || 'Игрок',
          avatarUrl: pObj?.avatar_url || null,
          score: pScore,
          status
        });
      }
      return result;
    };

    const transitionAfterRoundComplete = (currentRound: number, pastRounds: Record<number, any[]>, triggerUid?: string) => {
      if (currentRound < 3) {
        const nextRoundNum = currentRound + 1;
        const preloadedNextCats = jState.preloadedRounds?.[nextRoundNum];
        if (Array.isArray(preloadedNextCats) && preloadedNextCats.length > 0) {
          return {
            ...jState,
            round: nextRoundNum,
            categories: preloadedNextCats,
            pastRoundsCategories: pastRounds,
            generatingNextRound: null,
            phase: 'board',
            boardTurnStartedAt: Date.now(),
            answeringUserId: null,
            activeQuestion: null,
            feedback: null,
            lastWrongAttempt: null
          };
        }
        // Requirement 7, 8 & 14: Transition to generating_round; active generator (or trigger user if host absent) generates next round;
        // choosingUserId is preserved from the last question of the completed round!
        const nextGenId = activeParticipantIds.includes(activeGenId)
          ? activeGenId
          : (triggerUid || activeGenId);
        return {
          ...jState,
          generatorUserId: nextGenId,
          pastRoundsCategories: pastRounds,
          phase: 'generating_round',
          generatingNextRound: nextRoundNum,
          generatingStartedAt: Date.now(),
          answeringUserId: null,
          activeQuestion: null,
          feedback: null,
          lastWrongAttempt: null
        };
      }
      return null;
    };

    if (op === 'init_host_board') {
      jState = {
        ...jState,
        round: payload.round || jState.round || 1,
        allTopics: payload.allTopics || jState.allTopics || [],
        categories: payload.categories || jState.categories || [],
        packId: payload.packId || jState.packId || room.pack_id,
        choosingUserId: jState.choosingUserId || firstPlayerId,
        generatorUserId: activeGenId,
        phase: payload.phase || jState.phase || 'categories_intro'
      };
      if (payload.packId && !room.pack_id) {
        await runSql('UPDATE multiplayer_rooms SET pack_id = $1 WHERE id = $2', [String(payload.packId), id]).catch(() => {});
        room.pack_id = String(payload.packId);
      }
    } else if (op === 'finish_intro') {
      if (jState.phase === 'categories_intro' || !jState.phase) {
        jState = {
          ...jState,
          phase: 'round_intro',
          choosingUserId: jState.choosingUserId || firstPlayerId
        };
      }
    } else if (op === 'start_round_board') {
      if (jState.phase === 'round_intro' || jState.phase === 'categories_intro' || jState.phase === 'board') {
        jState = {
          ...jState,
          phase: 'board',
          boardTurnStartedAt: Date.now(),
          choosingUserId: jState.choosingUserId || firstPlayerId,
          answeringUserId: null,
          activeQuestion: null,
          feedback: null
        };
      }
    } else if (op === 'board_turn_timeout') {
      if (jState.phase === 'board' && parts.length > 0) {
        const orderIds = parts.map(p => String(p.user_id));
        const curChooser = String(jState.choosingUserId || orderIds[0]);
        const curIdx = Math.max(0, orderIds.indexOf(curChooser));
        const nextChooser = orderIds[(curIdx + 1) % orderIds.length];
        jState = {
          ...jState,
          choosingUserId: nextChooser,
          boardTurnStartedAt: Date.now()
        };
      }
    } else if (op === 'select_question') {
      const { catIndex, categoryIndex, qIndex, questionIndex, categoryName, questionId, question } = payload;
      if (jState.phase === 'board' || jState.phase === 'categories_intro' || jState.phase === 'round_intro') {
        const cats = Array.isArray(jState.categories) ? JSON.parse(JSON.stringify(jState.categories)) : [];
        let resolvedCatIdx =
          typeof catIndex === 'number'
            ? catIndex
            : typeof categoryIndex === 'number'
            ? categoryIndex
            : -1;
        if (resolvedCatIdx < 0 || !cats[resolvedCatIdx]) {
          resolvedCatIdx = cats.findIndex(
            (c: any) =>
              (categoryName && String(c.name).trim() === String(categoryName).trim()) ||
              (questionId &&
                Array.isArray(c.questions) &&
                c.questions.some(
                  (q: any) => String(q.id) === String(questionId) || String(q.db_id) === String(questionId)
                ))
          );
        }
        const targetCat = resolvedCatIdx >= 0 ? cats[resolvedCatIdx] : null;
        let resolvedQIdx =
          typeof qIndex === 'number'
            ? qIndex
            : typeof questionIndex === 'number'
            ? questionIndex
            : -1;
        if ((resolvedQIdx < 0 || !targetCat?.questions?.[resolvedQIdx]) && Array.isArray(targetCat?.questions)) {
          resolvedQIdx = targetCat.questions.findIndex(
            (q: any) =>
              (questionId && (String(q.id) === String(questionId) || String(q.db_id) === String(questionId))) ||
              (question?.value && Number(q.value) === Number(question.value))
          );
        }
        const targetQ =
          (resolvedQIdx >= 0 && targetCat?.questions?.[resolvedQIdx])
            ? { ...(question || {}), ...targetCat.questions[resolvedQIdx], question: targetCat.questions[resolvedQIdx].question || question?.question || '' }
            : question;
        if (targetQ && !targetQ.isAnswered) {
          if (resolvedQIdx >= 0 && targetCat?.questions?.[resolvedQIdx]) {
            targetCat.questions[resolvedQIdx].isAnswered = true;
            targetCat.questions[resolvedQIdx].is_answered = 1;
            targetCat.questions[resolvedQIdx].times_shown = Math.max(1, (Number(targetCat.questions[resolvedQIdx].times_shown) || 0) + 1);
            targetCat.questions[resolvedQIdx].category = targetCat.name || targetQ.category || categoryName || '';
          }
          const catIdxForActive = resolvedCatIdx >= 0 ? resolvedCatIdx : 0;
          const qIdxForActive = resolvedQIdx >= 0 ? resolvedQIdx : 0;
          const qType = targetQ.type || 'normal';
          const qValue = Number(targetQ.value || targetQ.points || (jState.round || 1) * 100);
          const nextAnsweredCount = (Number(jState.totalAnsweredCount) || 0) + 1;
          const activeChooser = String(user_id || jState.choosingUserId || firstPlayerId);

          // Increment times_shown in generated_questions so /profile/history modal shows accurate shown counter
          const packIdToShow = room.pack_id || jState.packId;
          const qIdxToShow = Number(targetQ.question_index) || ((Number(jState.round || 1) - 1) * 25 + catIdxForActive * 5 + qIdxForActive + 1);
          if (packIdToShow) {
            await runSql(
              `UPDATE generated_questions
               SET times_shown = COALESCE(times_shown, 0) + 1,
                   is_answered = 1,
                   category = COALESCE(NULLIF(category, ''), $1::text)
               WHERE (pack_id = $2 AND question_index = $3) OR id = $4`,
              [
                targetCat?.name || targetQ.category || categoryName || null,
                packIdToShow,
                qIdxToShow,
                targetQ.db_id || targetQ.id || `gq_${packIdToShow}_${qIdxToShow}`
              ]
            ).catch(() => {});
          }

          if (qType === 'cat') {
            // Modifier: Cat in a bag - choosing player MUST transfer to another player (cannot pick self)
            jState = {
              ...jState,
              categories: cats,
              totalAnsweredCount: nextAnsweredCount,
              choosingUserId: activeChooser,
              answeringUserId: null,
              phase: 'special_cat',
              activeQuestion: {
                catIndex: catIdxForActive,
                qIndex: qIdxForActive,
                categoryName: targetCat?.name || targetQ.category || categoryName || '',
                question: { ...targetQ, isAnswered: true, value: qValue }
              },
              failedUserIds: [],
              wrongUserIds: [],
              skippedUserIds: [],
              feedback: null,
              lastWrongAttempt: null
            };
          } else if (qType === 'auction') {
            // Modifier: Auction - players bid in turn order starting from activeChooser;
            // Auction screen is ALWAYS shown simultaneously to all players in the board container!
            const eligiblePlayers = parts.filter(p => (Number(p.score) || 0) >= qValue);
            if (eligiblePlayers.length === 0) {
              // Nobody has enough points (>= nominal): show Auction window to everyone so choosing player confirms playing for nominal
              const passedOthers = parts
                .filter(p => String(p.user_id) !== activeChooser)
                .map(p => String(p.user_id));
              const turnOrder = buildAuctionTurnOrder(
                activeChooser,
                activeChooser,
                activeChooser,
                qValue,
                qValue,
                passedOthers,
                passedOthers,
                false,
                true
              );
              jState = {
                ...jState,
                categories: cats,
                totalAnsweredCount: nextAnsweredCount,
                choosingUserId: activeChooser,
                answeringUserId: null,
                phase: 'special_auction',
                auctionState: {
                  nominalValue: qValue,
                  currentHighBid: qValue,
                  highBidderId: activeChooser,
                  currentHighBidderId: activeChooser,
                  currentBidderId: activeChooser,
                  passedBidderIds: passedOthers,
                  autoSkippedBidderIds: passedOthers,
                  hasPlacedInitialBid: false,
                  onlyNominalAllowed: true,
                  turnOrder,
                  bidHistory: []
                },
                activeQuestion: {
                  catIndex: catIdxForActive,
                  qIndex: qIdxForActive,
                  categoryName: targetCat?.name || targetQ.category || categoryName || '',
                  question: { ...targetQ, isAnswered: true, value: qValue }
                },
                failedUserIds: [],
                wrongUserIds: [],
                skippedUserIds: [],
                feedback: null,
                lastWrongAttempt: null
              };
            } else if (eligiblePlayers.length === 1) {
              // Only 1 player has enough balance (>= nominal) to make a bid: they choose their bet from qValue up to their score
              const soleBidderId = String(eligiblePlayers[0].user_id);
              const passedOthers = parts
                .filter(p => String(p.user_id) !== soleBidderId)
                .map(p => String(p.user_id));
              const turnOrder = buildAuctionTurnOrder(
                activeChooser,
                soleBidderId,
                soleBidderId,
                qValue,
                qValue,
                passedOthers,
                passedOthers,
                false,
                false
              );
              jState = {
                ...jState,
                categories: cats,
                totalAnsweredCount: nextAnsweredCount,
                choosingUserId: activeChooser,
                answeringUserId: null,
                phase: 'special_auction',
                auctionState: {
                  nominalValue: qValue,
                  currentHighBid: qValue,
                  highBidderId: soleBidderId,
                  currentHighBidderId: soleBidderId,
                  currentBidderId: soleBidderId,
                  passedBidderIds: passedOthers,
                  autoSkippedBidderIds: passedOthers,
                  hasPlacedInitialBid: false,
                  onlyNominalAllowed: false,
                  turnOrder,
                  bidHistory: []
                },
                activeQuestion: {
                  catIndex: catIdxForActive,
                  qIndex: qIdxForActive,
                  categoryName: targetCat?.name || targetQ.category || categoryName || '',
                  question: { ...targetQ, isAnswered: true, value: qValue }
                },
                failedUserIds: [],
                wrongUserIds: [],
                skippedUserIds: [],
                feedback: null,
                lastWrongAttempt: null
              };
            } else {
              // Multiple players can bid in turn order starting from activeChooser (if eligible) or next eligible player
              const orderedIds = parts.map(p => String(p.user_id));
              const chooserIdx = Math.max(0, orderedIds.indexOf(activeChooser));
              const autoSkippedIds: string[] = [];
              let firstBidderId: string | null = null;
              for (let offset = 0; offset < orderedIds.length; offset++) {
                const cid = orderedIds[(chooserIdx + offset) % orderedIds.length];
                const pObj = parts.find(p => String(p.user_id) === cid);
                if ((Number(pObj?.score) || 0) < qValue) {
                  autoSkippedIds.push(cid);
                } else if (!firstBidderId) {
                  firstBidderId = cid;
                }
              }
              const resolvedFirstBidder = firstBidderId || activeChooser;
              const turnOrder = buildAuctionTurnOrder(
                activeChooser,
                resolvedFirstBidder,
                resolvedFirstBidder,
                qValue,
                qValue,
                autoSkippedIds,
                autoSkippedIds,
                false,
                false
              );
              jState = {
                ...jState,
                categories: cats,
                totalAnsweredCount: nextAnsweredCount,
                choosingUserId: activeChooser,
                answeringUserId: null,
                phase: 'special_auction',
                auctionState: {
                  nominalValue: qValue,
                  currentHighBid: qValue,
                  highBidderId: resolvedFirstBidder,
                  currentHighBidderId: resolvedFirstBidder,
                  currentBidderId: resolvedFirstBidder,
                  passedBidderIds: autoSkippedIds,
                  autoSkippedBidderIds: autoSkippedIds,
                  hasPlacedInitialBid: false,
                  onlyNominalAllowed: false,
                  turnOrder,
                  bidHistory: []
                },
                activeQuestion: {
                  catIndex: catIdxForActive,
                  qIndex: qIdxForActive,
                  categoryName: targetCat?.name || targetQ.category || categoryName || '',
                  question: { ...targetQ, isAnswered: true, value: qValue }
                },
                failedUserIds: [],
                wrongUserIds: [],
                skippedUserIds: [],
                feedback: null,
                lastWrongAttempt: null
              };
            }
          } else {
            // Normal question: 60s buzzing window for all players
            jState = {
              ...jState,
              categories: cats,
              totalAnsweredCount: nextAnsweredCount,
              choosingUserId: activeChooser,
              answeringUserId: null,
              auctionBid: qValue,
              phase: 'question_buzz',
              questionTimeRemainingSec: 60,
              questionTimerStartedAt: Date.now(),
              answerTimeRemainingSec: 15,
              answerTimerStartedAt: null,
              activeQuestion: {
                catIndex: catIdxForActive,
                qIndex: qIdxForActive,
                categoryName: targetCat?.name || targetQ.category || categoryName || '',
                question: { ...targetQ, isAnswered: true, value: qValue }
              },
              failedUserIds: [],
              wrongUserIds: [],
              skippedUserIds: [],
              feedback: null,
              lastWrongAttempt: null
            };
          }
        }
      }
    } else if (op === 'cat_assign' || op === 'select_cat_target' || op === 'transfer_cat') {
      const targetUserId = String(payload.targetUserId || '');
      if ((jState.phase === 'cat_select' || jState.phase === 'special_cat') && targetUserId && targetUserId !== String(jState.choosingUserId)) {
        const qVal = Number(jState.activeQuestion?.question?.value || 100);
        jState = {
          ...jState,
          catTargetUserId: targetUserId,
          answeringUserId: targetUserId,
          auctionBid: qVal,
          phase: 'question_answer',
          answerTimeRemainingSec: 15,
          answerTimerStartedAt: Date.now()
        };
      }
    } else if (op === 'place_auction_bid' || op === 'auction_bid' || op === 'auction_pass') {
      if ((jState.phase === 'auction' || jState.phase === 'special_auction') && jState.auctionState) {
        const auc = jState.auctionState;
        const bidderId = String(user_id || auc.currentBidderId);
        const isPass = op === 'auction_pass' || Boolean(payload.pass) || payload.action === 'pass';
        const bidAmount = Number(payload.bid ?? payload.bet) || auc.nominalValue;
        const bidderPart = parts.find(p => String(p.user_id) === bidderId);
        const bidderScore = Math.max(0, Number(bidderPart?.score) || 0);
        const bidderName = bidderPart?.display_name || 'Игрок';

        let nextHighBid = Number(auc.currentHighBid) || auc.nominalValue;
        let nextHighBidderId = String(auc.highBidderId || auc.currentHighBidderId || jState.choosingUserId || firstPlayerId);
        let nextPassed: string[] = Array.isArray(auc.passedBidderIds) ? [...auc.passedBidderIds.map(String)] : [];
        let nextAutoSkipped: string[] = Array.isArray(auc.autoSkippedBidderIds) ? [...auc.autoSkippedBidderIds.map(String)] : [];
        let hasPlacedInitial = Boolean(auc.hasPlacedInitialBid);
        const bidHistory = Array.isArray(auc.bidHistory) ? [...auc.bidHistory] : [];

        if (auc.onlyNominalAllowed) {
          // Nobody had points >= nominal: choosing player starts answering for nominal value
          const winnerId = String(jState.choosingUserId || bidderId || firstPlayerId);
          jState = {
            ...jState,
            auctionBid: auc.nominalValue,
            answeringUserId: winnerId,
            phase: 'question_answer',
            answerTimeRemainingSec: 15,
            answerTimerStartedAt: Date.now(),
            auctionState: {
              ...auc,
              currentHighBid: auc.nominalValue,
              highBidderId: winnerId,
              currentHighBidderId: winnerId,
              currentBidderId: null,
              hasPlacedInitialBid: true
            }
          };
        } else {
          if (isPass) {
            if (!nextPassed.includes(bidderId)) nextPassed.push(bidderId);
            bidHistory.push({
              userId: bidderId,
              displayName: bidderName,
              action: 'pass',
              amount: null,
              timestamp: Date.now()
            });
          } else {
            const clampedBid = Math.max(auc.nominalValue, Math.min(bidAmount, Math.max(auc.nominalValue, bidderScore)));
            if (!hasPlacedInitial || clampedBid > nextHighBid) {
              nextHighBid = clampedBid;
              nextHighBidderId = bidderId;
              hasPlacedInitial = true;
              bidHistory.push({
                userId: bidderId,
                displayName: bidderName,
                action: 'bid',
                amount: clampedBid,
                timestamp: Date.now()
              });
            } else {
              if (!nextPassed.includes(bidderId)) nextPassed.push(bidderId);
              bidHistory.push({
                userId: bidderId,
                displayName: bidderName,
                action: 'pass',
                amount: null,
                timestamp: Date.now()
              });
            }
          }

          // Auto-skip any player whose score cannot beat nextHighBid (when initial bid is placed)
          if (hasPlacedInitial) {
            for (const p of parts) {
              const pid = String(p.user_id);
              if (pid === String(nextHighBidderId)) continue;
              const pScore = Number(p.score) || 0;
              if (pScore <= nextHighBid) {
                if (!nextPassed.includes(pid)) nextPassed.push(pid);
                if (!nextAutoSkipped.includes(pid)) nextAutoSkipped.push(pid);
              }
            }
          }

          const nextBidderId = computeNextAuctionBidder(
            nextHighBid,
            nextHighBidderId,
            nextPassed,
            bidderId,
            hasPlacedInitial,
            auc.nominalValue
          );

          if (!nextBidderId) {
            // Auction finished! Winner is nextHighBidderId
            const winnerId = String(nextHighBidderId || jState.choosingUserId || firstPlayerId);
            const finalTurnOrder = buildAuctionTurnOrder(
              String(jState.choosingUserId || firstPlayerId),
              null,
              winnerId,
              nextHighBid,
              auc.nominalValue,
              nextPassed,
              nextAutoSkipped,
              true,
              false
            );
            jState = {
              ...jState,
              auctionBid: nextHighBid,
              answeringUserId: winnerId,
              phase: 'question_answer',
              answerTimeRemainingSec: 15,
              answerTimerStartedAt: Date.now(),
              auctionState: {
                ...auc,
                currentHighBid: nextHighBid,
                highBidderId: winnerId,
                currentHighBidderId: winnerId,
                currentBidderId: null,
                passedBidderIds: nextPassed,
                autoSkippedBidderIds: nextAutoSkipped,
                hasPlacedInitialBid: true,
                turnOrder: finalTurnOrder,
                bidHistory
              }
            };
          } else {
            // If initial bid was not placed yet because previous player passed, update tentative highBidderId to nextBidderId
            if (!hasPlacedInitial) {
              nextHighBidderId = nextBidderId;
            }
            const updatedTurnOrder = buildAuctionTurnOrder(
              String(jState.choosingUserId || firstPlayerId),
              nextBidderId,
              nextHighBidderId,
              nextHighBid,
              auc.nominalValue,
              nextPassed,
              nextAutoSkipped,
              hasPlacedInitial,
              false
            );
            jState = {
              ...jState,
              auctionState: {
                ...auc,
                currentHighBid: nextHighBid,
                highBidderId: nextHighBidderId,
                currentHighBidderId: nextHighBidderId,
                currentBidderId: nextBidderId,
                passedBidderIds: nextPassed,
                autoSkippedBidderIds: nextAutoSkipped,
                hasPlacedInitialBid: hasPlacedInitial,
                turnOrder: updatedTurnOrder,
                bidHistory
              }
            };
          }
        }
      }
    } else if (op === 'buzz') {
      // First player to press "Знаю ответ" pauses the 60s timer and gets 15s to answer
      const buzzerId = String(user_id || '');
      const failedIds: string[] = Array.isArray(jState.failedUserIds) ? jState.failedUserIds.map(String) : [];
      if (jState.phase === 'question_buzz' && buzzerId && !failedIds.includes(buzzerId)) {
        const now = Date.now();
        const elapsedSec = jState.questionTimerStartedAt
          ? Math.floor((now - Number(jState.questionTimerStartedAt)) / 1000)
          : 0;
        const pausedRemaining = Math.max(1, (Number(jState.questionTimeRemainingSec ?? 60) - elapsedSec));
        jState = {
          ...jState,
          phase: 'question_answer',
          answeringUserId: buzzerId,
          questionTimeRemainingSec: pausedRemaining,
          questionTimerStartedAt: null,
          answerTimeRemainingSec: 15,
          answerTimerStartedAt: now
        };
      }
    } else if (op === 'pass_question_buzz' || op === 'pass_question') {
      // A player clicks "Не знаю / Пропустить" during the 60s buzzing phase
      const passerId = String(user_id || '');
      if (jState.phase === 'question_buzz' && passerId) {
        const skippedIds: string[] = Array.isArray(jState.skippedUserIds) ? [...jState.skippedUserIds.map(String)] : [];
        const failedIds: string[] = Array.isArray(jState.failedUserIds) ? [...jState.failedUserIds.map(String)] : [];
        if (!skippedIds.includes(passerId)) skippedIds.push(passerId);
        const allPlayerIds = parts.map(p => String(p.user_id));
        const everyoneDone = allPlayerIds.every(pid => skippedIds.includes(pid) || failedIds.includes(pid));
        if (everyoneDone) {
          const q = jState.activeQuestion?.question;
          const qCatIdx = Number(jState.activeQuestion?.catIndex ?? 0);
          const qItemIdx = Number(jState.activeQuestion?.qIndex ?? 0);
          const packIdToSave = room.pack_id || jState.packId;
          const qIndexToSave = Number(q?.question_index) || ((Number(jState.round || 1) - 1) * 25 + qCatIdx * 5 + qItemIdx + 1);
          const resolvedCatName = jState.activeQuestion?.categoryName || (Array.isArray(jState.categories) && jState.categories[qCatIdx]?.name) || q?.category || '';

          if (Array.isArray(jState.categories) && jState.categories[qCatIdx]?.questions?.[qItemIdx]) {
            const catQ = jState.categories[qCatIdx].questions[qItemIdx];
            catQ.isAnswered = true;
            catQ.is_answered = 1;
            catQ.is_skipped = 1;
            catQ.user_answer = catQ.user_answer || 'Пропущено';
            catQ.category = resolvedCatName || catQ.category;
            catQ.times_shown = Math.max(1, Number(catQ.times_shown) || 0);
            catQ.times_skipped = (Number(catQ.times_skipped) || 0) + 1;
          }

          if (packIdToSave) {
            const qDbId = q?.db_id || q?.id || `gq_${packIdToSave}_${qIndexToSave}`;
            await runSql(
              `UPDATE generated_questions
               SET is_answered = 1,
                   user_answer = COALESCE(NULLIF(user_answer, ''), 'Пропущено'),
                   times_shown = CASE WHEN COALESCE(times_shown, 0) = 0 THEN 1 ELSE times_shown END,
                   times_skipped = COALESCE(times_skipped, 0) + 1,
                   category = COALESCE(NULLIF(category, ''), $1::text)
               WHERE (pack_id = $2 AND question_index = $3) OR id = $4`,
              [resolvedCatName || null, packIdToSave, qIndexToSave, qDbId]
            ).catch(() => {});
          }

          jState = {
            ...jState,
            skippedUserIds: skippedIds,
            phase: 'question_feedback',
            answeringUserId: null,
            questionTimerStartedAt: null,
            feedback: {
              isCorrect: false,
              points: 0,
              explanation: `Никто из участников не дал ответа. Правильный ответ: ${q?.answer || ''}`,
              correctAnswer: q?.answer || '',
              answeringUserId: null,
              answeringUserName: null
            }
          };
        } else {
          jState = {
            ...jState,
            skippedUserIds: skippedIds
          };
        }
      }
    } else if (op === 'question_timeout') {
      if (jState.phase === 'question_buzz') {
        const q = jState.activeQuestion?.question;
        const qCatIdx = Number(jState.activeQuestion?.catIndex ?? 0);
        const qItemIdx = Number(jState.activeQuestion?.qIndex ?? 0);
        const packIdToSave = room.pack_id || jState.packId;
        const qIndexToSave = Number(q?.question_index) || ((Number(jState.round || 1) - 1) * 25 + qCatIdx * 5 + qItemIdx + 1);
        const resolvedCatName = jState.activeQuestion?.categoryName || (Array.isArray(jState.categories) && jState.categories[qCatIdx]?.name) || q?.category || '';

        if (Array.isArray(jState.categories) && jState.categories[qCatIdx]?.questions?.[qItemIdx]) {
          const catQ = jState.categories[qCatIdx].questions[qItemIdx];
          catQ.isAnswered = true;
          catQ.is_answered = 1;
          catQ.is_skipped = 1;
          catQ.user_answer = catQ.user_answer || 'Время вышло';
          catQ.category = resolvedCatName || catQ.category;
          catQ.times_shown = Math.max(1, Number(catQ.times_shown) || 0);
          catQ.times_skipped = (Number(catQ.times_skipped) || 0) + 1;
        }

        if (packIdToSave) {
          const qDbId = q?.db_id || q?.id || `gq_${packIdToSave}_${qIndexToSave}`;
          await runSql(
            `UPDATE generated_questions
             SET is_answered = 1,
                 user_answer = COALESCE(NULLIF(user_answer, ''), 'Время вышло'),
                 times_shown = CASE WHEN COALESCE(times_shown, 0) = 0 THEN 1 ELSE times_shown END,
                 times_skipped = COALESCE(times_skipped, 0) + 1,
                 category = COALESCE(NULLIF(category, ''), $1::text)
             WHERE (pack_id = $2 AND question_index = $3) OR id = $4`,
            [resolvedCatName || null, packIdToSave, qIndexToSave, qDbId]
          ).catch(() => {});
        }

        jState = {
          ...jState,
          phase: 'question_feedback',
          answeringUserId: null,
          questionTimeRemainingSec: 0,
          questionTimerStartedAt: null,
          feedback: {
            isCorrect: false,
            points: 0,
            explanation: `Время на раздумье (60 сек) истекло! Правильный ответ: ${q?.answer || ''}`,
            correctAnswer: q?.answer || '',
            answeringUserId: null,
            answeringUserName: null
          }
        };
      }
    } else if (op === 'checking_answer') {
      // Answering player clicked "Ответить" and AI is checking -> pause the 15s answer timer so it doesn't expire during AI check
      const responderId = String(user_id || '');
      if (jState.phase === 'question_answer' && responderId && String(jState.answeringUserId) === responderId) {
        jState = {
          ...jState,
          answerCheckingInProgress: true,
          answerTimerStartedAt: null
        };
      }
    } else if (op === 'submit_answer' || op === 'answer_timeout' || op === 'skip_answer' || op === 'dont_know') {
      // Current answering player submits their answer (or times out of the 15s window / skips)
      const responderId = String(jState.answeringUserId || user_id || '');
      if (jState.phase === 'question_answer' && responderId) {
        const isTimeout = op === 'answer_timeout' || Boolean(payload.isTimeout);
        const isSkip = op === 'skip_answer' || op === 'dont_know';
        const isCorrect = !isTimeout && !isSkip && Boolean(payload.isCorrect ?? payload.is_correct);
        const userAnswer = isTimeout
          ? 'Время на ответ (15 сек) истекло'
          : isSkip
          ? 'Не знаю'
          : String(payload.answer || '').trim();
        const q = jState.activeQuestion?.question;
        const qType = q?.type || 'normal';
        const pointsValue = Number(jState.auctionBid || q?.value || (jState.round || 1) * 100);
        const responderName = getParticipantName(responderId);

        // Update question in jState.categories, generated_questions, and user_pack_answers for /profile/history modal
        const qCatIdx = Number(jState.activeQuestion?.catIndex ?? 0);
        const qItemIdx = Number(jState.activeQuestion?.qIndex ?? 0);
        const packIdToSave = room.pack_id || jState.packId;
        const qIndexToSave =
          Number(q?.question_index) ||
          ((Number(jState.round || 1) - 1) * 25 + qCatIdx * 5 + qItemIdx + 1);
        const resolvedCatName =
          jState.activeQuestion?.categoryName ||
          (Array.isArray(jState.categories) && jState.categories[qCatIdx]?.name) ||
          q?.category ||
          '';

        if (Array.isArray(jState.categories) && jState.categories[qCatIdx]?.questions?.[qItemIdx]) {
          const catQ = jState.categories[qCatIdx].questions[qItemIdx];
          catQ.isAnswered = true;
          catQ.is_answered = 1;
          catQ.is_correct = isCorrect ? 1 : 0;
          catQ.user_answer = userAnswer;
          catQ.category = resolvedCatName || catQ.category;
          catQ.times_shown = Math.max(1, Number(catQ.times_shown) || 0);
          catQ.times_correct = (Number(catQ.times_correct) || 0) + (isCorrect ? 1 : 0);
          catQ.times_incorrect = (Number(catQ.times_incorrect) || 0) + (isCorrect ? 0 : 1);
        }

        if (packIdToSave) {
          const qDbId = q?.db_id || q?.id || `gq_${packIdToSave}_${qIndexToSave}`;
          await runSql(
            `UPDATE generated_questions
             SET user_answer = $1,
                 is_answered = 1,
                 is_correct = CASE WHEN is_correct = 1 THEN 1 ELSE $2 END,
                 times_shown = CASE WHEN COALESCE(times_shown, 0) = 0 THEN 1 ELSE times_shown END,
                 times_correct = COALESCE(times_correct, 0) + $3,
                 times_incorrect = COALESCE(times_incorrect, 0) + $4,
                 category = COALESCE(NULLIF(category, ''), $5::text)
             WHERE (pack_id = $6 AND question_index = $7) OR id = $8`,
            [
              userAnswer,
              isCorrect ? 1 : 0,
              isCorrect ? 1 : 0,
              isCorrect ? 0 : 1,
              resolvedCatName || null,
              packIdToSave,
              qIndexToSave,
              qDbId
            ]
          ).catch(() => {});

          if (responderId && !responderId.endsWith('_self2')) {
            await runSql(
              `INSERT INTO user_pack_answers (id, user_id, pack_id, question_index, question_id, user_answer, is_answered, is_correct, is_skipped, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, NOW())
               ON CONFLICT(user_id, pack_id, question_index) DO UPDATE SET
                 user_answer = EXCLUDED.user_answer,
                 is_answered = 1,
                 is_correct = CASE WHEN user_pack_answers.is_correct = 1 THEN 1 ELSE EXCLUDED.is_correct END,
                 is_skipped = EXCLUDED.is_skipped,
                 updated_at = NOW()`,
              [
                `upa_${responderId}_${packIdToSave}_${qIndexToSave}`,
                responderId,
                packIdToSave,
                qIndexToSave,
                qDbId,
                userAnswer,
                isCorrect ? 1 : 0,
                isSkip || isTimeout ? 1 : 0
              ]
            ).catch(() => {});
          }
        }

        // Update participant score in DB
        const partRow = parts.find(p => String(p.user_id) === responderId);
        if (partRow) {
          const newScore = isCorrect
            ? (Number(partRow.score) || 0) + pointsValue
            : (Number(partRow.score) || 0) - pointsValue;
          const newCorrect = isCorrect
            ? (Number(partRow.correct_count) || 0) + 1
            : (Number(partRow.correct_count) || 0);
          const newWrong = !isCorrect
            ? (Number(partRow.wrong_count) || 0) + 1
            : (Number(partRow.wrong_count) || 0);

          await runSql(
            `UPDATE multiplayer_participants
             SET score = $1, correct_count = $2, wrong_count = $3
             WHERE id = $4`,
            [newScore, newCorrect, newWrong, partRow.id]
          );
          partRow.score = newScore;
          partRow.correct_count = newCorrect;
          partRow.wrong_count = newWrong;

          // Also keep savedScoresByUser updated in jState for Requirement 13
          jState.savedScoresByUser = {
            ...(jState.savedScoresByUser || {}),
            [responderId]: {
              score: newScore,
              correct_count: newCorrect,
              wrong_count: newWrong
            }
          };
        }

        if (isCorrect) {
          // Correct answer: responder becomes next choosingUserId, timers reset, show feedback
          jState = {
            ...jState,
            choosingUserId: responderId,
            lastCorrectUserId: responderId,
            answeringUserId: responderId,
            answerCheckingInProgress: false,
            phase: 'question_feedback',
            questionTimeRemainingSec: 60,
            questionTimerStartedAt: null,
            answerTimeRemainingSec: 15,
            answerTimerStartedAt: null,
            feedback: {
              isCorrect: true,
              points: pointsValue,
              userAnswer,
              explanation: payload.explanation || q?.explanation || `Правильный ответ: ${q?.answer || ''}`,
              correctAnswer: q?.answer || '',
              answeringUserId: responderId,
              answeringUserName: responderName
            }
          };
        } else {
          // Wrong answer or 15s timeout: deduct points, add to failedUserIds & wrongUserIds
          const failedIds: string[] = Array.isArray(jState.failedUserIds) ? [...jState.failedUserIds.map(String)] : [];
          if (!failedIds.includes(responderId)) failedIds.push(responderId);
          const skippedIds: string[] = Array.isArray(jState.skippedUserIds) ? [...jState.skippedUserIds.map(String)] : [];

          const isSpecialNoRetry = qType === 'cat' || qType === 'auction';
          const allPlayerIds = parts.map(p => String(p.user_id));
          const everyoneAttemptedOrSkipped = allPlayerIds.every(pid => failedIds.includes(pid) || skippedIds.includes(pid));
          const remainingBuzzSec = Math.max(0, Number(jState.questionTimeRemainingSec ?? 0));

          if (isSpecialNoRetry || everyoneAttemptedOrSkipped || remainingBuzzSec <= 0) {
            // Question ends: choosingUserId stays unchanged (whoever chose the question originally)
            jState = {
              ...jState,
              failedUserIds: failedIds,
              wrongUserIds: failedIds,
              answeringUserId: null,
              answerCheckingInProgress: false,
              phase: 'question_feedback',
              questionTimerStartedAt: null,
              answerTimerStartedAt: null,
              feedback: {
                isCorrect: false,
                points: -pointsValue,
                userAnswer,
                explanation: payload.explanation || q?.explanation || `Правильный ответ: ${q?.answer || ''}`,
                correctAnswer: q?.answer || '',
                answeringUserId: responderId,
                answeringUserName: responderName
              }
            };
          } else {
            // Resume 60-second countdown from the paused second so other participants can press "Знаю ответ"!
            jState = {
              ...jState,
              failedUserIds: failedIds,
              wrongUserIds: failedIds,
              answeringUserId: null,
              answerCheckingInProgress: false,
              phase: 'question_buzz',
              questionTimeRemainingSec: remainingBuzzSec,
              questionTimerStartedAt: Date.now(),
              answerTimeRemainingSec: 15,
              answerTimerStartedAt: null,
              lastWrongAttempt: {
                userId: responderId,
                userName: responderName,
                userAnswer,
                points: -pointsValue,
                at: Date.now()
              }
            };
          }
        }
      }
    } else if (op === 'continue_after_feedback' || op === 'start_next_round_generation') {
      if (jState.phase === 'question_feedback' || op === 'start_next_round_generation') {
        const cats: any[] = Array.isArray(jState.categories) ? jState.categories : [];
        const allAnswered =
          op === 'start_next_round_generation' ||
          (cats.length > 0 && cats.every(c => Array.isArray(c.questions) && c.questions.every((q: any) => q.isAnswered)));

        if (!allAnswered) {
          jState = {
            ...jState,
            phase: 'board',
            boardTurnStartedAt: Date.now(),
            answeringUserId: null,
            activeQuestion: null,
            feedback: null,
            lastWrongAttempt: null,
            auctionState: null,
            catTargetUserId: null
          };
        } else {
          const currentRound = Number(jState.round) || 1;
          const pastRounds = { ...(jState.pastRoundsCategories || {}), [currentRound]: cats };
          const nextRoundState = transitionAfterRoundComplete(currentRound, pastRounds, String(user_id || ''));
          if (nextRoundState) {
            jState = nextRoundState;
          } else {
            // Requirement 9: Round 3 finished -> transition to Superfinal category elimination!
            // 1) Only players with balance > 0 can participate in Superfinal.
            const eligibleParts = parts.filter(p => (Number(p.score) || 0) > 0);
            if (eligibleParts.length === 0) {
              // Nobody has > 0 balance -> finish game immediately
              jState = {
                ...jState,
                pastRoundsCategories: pastRounds,
                totalAnsweredCount: 76,
                phase: 'game_over',
                answeringUserId: null,
                activeQuestion: null,
                feedback: null
              };
              await runSql(
                `UPDATE multiplayer_rooms
                 SET status = 'finished', finished_at = COALESCE(finished_at, NOW()), finish_deadline_at = NULL
                 WHERE id = $1`,
                [id]
              );
              room.status = 'finished';
              await saveRoomJeopardyState(id, room, jState);
              await syncJeopardyParticipantsProgress(id, room, jState);
              await finalizeMultiplayerRoomScores(id);
              return res.json({
                success: true,
                room_status: 'finished',
                jeopardy_state: enrichJeopardyStateTimers(jState),
                participants: parts
              });
            }

            // 2) First to eliminate category is the player with the highest score (if tied, first in list)
            const sortedEligible = [...eligibleParts].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            const firstEliminatorId = String(sortedEligible[0].user_id);
            const eligibleFinalPlayerIds = eligibleParts.map(p => String(p.user_id));

            // 3) Show ALL 15 categories of the past 3 rounds for elimination!
            const collected15: string[] = [];
            if (Array.isArray(jState.allTopics) && jState.allTopics.length > 0) {
              for (const t of jState.allTopics) {
                const name = typeof t === 'string' ? t.trim() : String(t?.name || '').trim();
                if (name && !collected15.includes(name)) collected15.push(name);
              }
            }
            for (const rNum of [1, 2, 3]) {
              const rCats = pastRounds[rNum] || [];
              if (Array.isArray(rCats)) {
                for (const c of rCats) {
                  const name = String(c?.name || '').trim();
                  if (name && !collected15.includes(name)) collected15.push(name);
                }
              }
            }
            const baseTopic = room.topic || 'Общие знания';
            while (collected15.length < 15) {
              collected15.push(`${baseTopic} — Тема #${collected15.length + 1}`);
            }
            const superCandidates = collected15.slice(0, 15);

            jState = {
              ...jState,
              pastRoundsCategories: pastRounds,
              phase: 'final_elimination',
              remainingFinalCategories: superCandidates,
              eligibleFinalPlayerIds,
              eliminatingUserId: firstEliminatorId,
              choosingUserId: firstEliminatorId,
              answeringUserId: null,
              activeQuestion: null,
              feedback: null,
              lastWrongAttempt: null,
              finalBets: {},
              finalAnswers: {}
            };
          }
        }
      }
    } else if (op === 'set_generated_round') {
      // Requirement 8: Host uploads newly generated round categories (Round 2 or Round 3) -> automatically switch everyone to the new round's board!
      const nextRound = Number(payload.round) || Number(jState.generatingNextRound) || (Number(jState.round) + 1);
      if (Array.isArray(payload.categories) && payload.categories.length > 0) {
        jState = {
          ...jState,
          round: nextRound,
          categories: payload.categories,
          generatingNextRound: null,
          phase: 'board',
          boardTurnStartedAt: Date.now(),
          choosingUserId: jState.choosingUserId || firstPlayerId,
          answeringUserId: null,
          activeQuestion: null,
          feedback: null
        };
      }
    } else if (op === 'eliminate_category' || op === 'eliminate_final_category') {
      // Requirement 9: Superfinal category elimination among eligible players (score > 0)
      const catName = String(payload.category || payload.categoryName || '');
      if (jState.phase === 'final_elimination' && Array.isArray(jState.remainingFinalCategories)) {
        const remaining = jState.remainingFinalCategories.filter((c: string) => c !== catName);
        const eligibleIds: string[] =
          Array.isArray(jState.eligibleFinalPlayerIds) && jState.eligibleFinalPlayerIds.length > 0
            ? jState.eligibleFinalPlayerIds.map(String)
            : parts.filter(p => (Number(p.score) || 0) > 0).map(p => String(p.user_id));
        const activeOrder = eligibleIds.length > 0 ? eligibleIds : parts.map(p => String(p.user_id));
        const curElimId = String(jState.eliminatingUserId || jState.choosingUserId || activeOrder[0]);
        const curIdx = Math.max(0, activeOrder.indexOf(curElimId));
        const nextElimId = activeOrder[(curIdx + 1) % Math.max(1, activeOrder.length)];

        if (remaining.length <= 1) {
          // Requirement 10: 1 category remains -> start 60s simultaneous betting for all eligible players!
          const chosenFinalCategory = remaining[0] || catName || room.topic || 'Суперфинал';
          jState = {
            ...jState,
            remainingFinalCategories: [chosenFinalCategory],
            finalCategory: chosenFinalCategory,
            eligibleFinalPlayerIds: activeOrder,
            phase: 'final_betting',
            finalBettingTimeRemainingSec: 60,
            finalBettingTimerStartedAt: Date.now(),
            finalBets: {},
            finalAnswers: {},
            finalQuestion: null
          };
        } else {
          jState = {
            ...jState,
            remainingFinalCategories: remaining,
            eligibleFinalPlayerIds: activeOrder,
            eliminatingUserId: nextElimId,
            choosingUserId: nextElimId
          };
        }
      }
    } else if (op === 'place_final_bet' || op === 'final_betting_timeout') {
      // Requirement 10: All eligible players place bets simultaneously within 60s.
      // Anyone who didn't make it in 60s gets bet = 0. Then question generation starts automatically!
      if (jState.phase === 'final_betting' || jState.phase === 'final_elimination') {
        const eligibleIds: string[] =
          Array.isArray(jState.eligibleFinalPlayerIds) && jState.eligibleFinalPlayerIds.length > 0
            ? jState.eligibleFinalPlayerIds.map(String)
            : parts.filter(p => (Number(p.score) || 0) > 0).map(p => String(p.user_id));

        const nextBets: Record<string, number> = { ...(jState.finalBets || {}) };

        if (op === 'place_final_bet' && user_id) {
          const bettorId = String(user_id);
          const partRow = parts.find(p => String(p.user_id) === bettorId);
          const maxBet = Math.max(0, Number(partRow?.score) || 0);
          const clampedBet = maxBet > 0 ? Math.max(0, Math.min(Number(payload.bet) || 0, maxBet)) : 0;
          nextBets[bettorId] = clampedBet;
        }

        if (op === 'final_betting_timeout') {
          for (const pid of eligibleIds) {
            if (nextBets[pid] === undefined) {
              nextBets[pid] = 0;
            }
          }
        }

        const allEligiblePlaced =
          op === 'final_betting_timeout' ||
          (eligibleIds.length > 0 && eligibleIds.every(pid => nextBets[pid] !== undefined));

        if (allEligiblePlaced) {
          jState = {
            ...jState,
            finalBets: nextBets,
            finalBettingTimerStartedAt: null,
            phase: jState.finalQuestion ? 'final_countdown' : 'final_generating',
            finalGeneratingStartedAt: Date.now(),
            ...(jState.finalQuestion
              ? {
                  finalCountdownRemainingSec: 5,
                  finalCountdownStartedAt: Date.now(),
                  finalTimeRemainingSec: 60,
                  finalTimerStartedAt: Date.now() + 5000
                }
              : {})
          };
        } else {
          jState = {
            ...jState,
            finalBets: nextBets
          };
        }
      }
    } else if (op === 'set_final_question') {
      // Requirement 10: Host generated the Superfinal question -> show 5..1 countdown to all players, then open question with 60s timer!
      if (payload.finalQuestion) {
        const updatedFinalQ = payload.finalQuestion;
        const nowMs = Date.now();
        jState = {
          ...jState,
          finalQuestion: updatedFinalQ,
          phase: 'final_countdown',
          finalCountdownRemainingSec: 5,
          finalCountdownStartedAt: nowMs,
          finalTimeRemainingSec: 60,
          finalTimerStartedAt: nowMs + 5000
        };
      }
    } else if (op === 'finish_final_countdown' || op === 'start_final_answering') {
      if (jState.phase === 'final_countdown') {
        jState = {
          ...jState,
          phase: 'final_question',
          finalTimeRemainingSec: 60,
          finalTimerStartedAt: jState.finalTimerStartedAt || Date.now()
        };
      }
    } else if (op === 'submit_final_answer' || op === 'final_timeout' || op === 'final_answer_timeout') {
      if (jState.phase === 'final_question' || jState.phase === 'final_countdown') {
        const nextAnswers = { ...(jState.finalAnswers || {}) };
        if (op === 'submit_final_answer' && user_id) {
          nextAnswers[String(user_id)] = {
            answer: String(payload.answer || '').trim(),
            isCorrect: Boolean(payload.isCorrect ?? payload.is_correct),
            explanation: payload.explanation || '',
            submittedAt: Date.now()
          };
        }
        const eligibleIds: string[] =
          Array.isArray(jState.eligibleFinalPlayerIds) && jState.eligibleFinalPlayerIds.length > 0
            ? jState.eligibleFinalPlayerIds.map(String)
            : parts.filter(p => (Number(p.score) || 0) > 0).map(p => String(p.user_id));

        const everyoneSubmitted = eligibleIds.length > 0 && eligibleIds.every(pid => nextAnswers[pid] !== undefined);
        const isForceTimeout = op === 'final_timeout' || op === 'final_answer_timeout';

        if (everyoneSubmitted || isForceTimeout) {
          // Requirement 11: Apply final bets to all participants and start 5-second per-player reveal in random order!
          const bets = jState.finalBets || {};
          const shuffledParts = [...parts].sort(() => Math.random() - 0.5);
          const finalRevealList: any[] = [];

          for (const p of shuffledParts) {
            const pid = String(p.user_id);
            const scoreBefore = Number(p.score) || 0;
            const wasEligible = eligibleIds.includes(pid) && scoreBefore > 0;
            const betVal = wasEligible ? Math.max(0, Number(bets[pid]) || 0) : 0;
            const ansObj = nextAnswers[pid] || {
              answer: wasEligible ? 'Время вышло (нет ответа)' : 'Не участвовал (баланс ≤ 0)',
              isCorrect: false
            };
            const isCorr = wasEligible && Boolean(ansObj.isCorrect);
            const scoreDelta = wasEligible ? (isCorr ? betVal : -betVal) : 0;
            const newScore = scoreBefore + scoreDelta;
            const newCorr = isCorr ? (Number(p.correct_count) || 0) + 1 : (Number(p.correct_count) || 0);
            const newWrong = wasEligible && !isCorr ? (Number(p.wrong_count) || 0) + 1 : (Number(p.wrong_count) || 0);

            await runSql(
              `UPDATE multiplayer_participants
               SET score = $1, correct_count = $2, wrong_count = $3, current_round = 76
               WHERE id = $4`,
              [newScore, newCorr, newWrong, p.id]
            );
            p.score = newScore;
            p.correct_count = newCorr;
            p.wrong_count = newWrong;

            jState.savedScoresByUser = {
              ...(jState.savedScoresByUser || {}),
              [pid]: {
                score: newScore,
                correct_count: newCorr,
                wrong_count: newWrong
              }
            };

            finalRevealList.push({
              userId: pid,
              displayName: p.display_name || 'Игрок',
              avatarUrl: p.avatar_url || null,
              wasEligible,
              answer: ansObj.answer || (wasEligible ? 'Время вышло' : 'Баланс ≤ 0'),
              isCorrect: isCorr,
              bet: betVal,
              scoreBefore,
              scoreDelta,
              delta: scoreDelta,
              scoreAfter: newScore
            });
          }

          jState = {
            ...jState,
            finalAnswers: nextAnswers,
            totalAnsweredCount: 76,
            phase: 'final_reveal',
            finalRevealList,
            finalRevealOrder: finalRevealList,
            finalRevealStartedAt: Date.now(),
            finalRevealPerPlayerSec: 5,
            answeringUserId: null,
            finalTimerStartedAt: null
          };
        } else {
          jState = {
            ...jState,
            finalAnswers: nextAnswers
          };
        }
      }
    } else if (op === 'finish_final_reveal' || op === 'finish_superfinal') {
      if (jState.phase === 'final_reveal') {
        jState = {
          ...jState,
          phase: 'game_over',
          answeringUserId: null
        };

        await runSql(
          `UPDATE multiplayer_participants
           SET current_round = 76, is_finished = 1, finished_at = COALESCE(finished_at, NOW())
           WHERE room_id = $1`,
          [id]
        );
        await runSql(
          `UPDATE multiplayer_rooms
           SET status = 'finished', finished_at = COALESCE(finished_at, NOW()), finish_deadline_at = NULL
           WHERE id = $1`,
          [id]
        );
        room.status = 'finished';
        await saveRoomJeopardyState(id, room, jState);
        await syncJeopardyParticipantsProgress(id, room, jState);
        await finalizeMultiplayerRoomScores(id);

        const updatedParts = await getAll<any>(
          `SELECT mp.*,
                  CASE
                    WHEN mp.user_id LIKE '%_self2' THEN COALESCE(mp.display_name, u.display_name, u.username, 'Игрок') || CASE WHEN COALESCE(mp.display_name, '') LIKE '%(2-й участник)%' THEN '' ELSE ' (2-й участник)' END
                    ELSE COALESCE(mp.display_name, u.display_name, u.username, 'Игрок')
                  END as display_name,
                  COALESCE(mp.avatar_url, u.avatar_url, u.photo_url, u.telegram_photo) as avatar_url
           FROM multiplayer_participants mp
           LEFT JOIN users u ON (
             u.uid = mp.user_id OR u.id = mp.user_id OR u.uid = REPLACE(mp.user_id, '_self2', '') OR u.id = REPLACE(mp.user_id, '_self2', '')
           )
           WHERE mp.room_id = $1
           ORDER BY mp.team_number ASC, mp.joined_at ASC`,
          [id]
        );

        return res.json({
          success: true,
          room_status: 'finished',
          jeopardy_state: enrichJeopardyStateTimers(jState),
          participants: updatedParts
        });
      }
    }

    const savedJState = await saveRoomJeopardyState(id, room, jState);
    await syncJeopardyParticipantsProgress(id, room, savedJState);

    res.json({
      success: true,
      room_status: room.status,
      jeopardy_state: enrichJeopardyStateTimers(savedJState),
      participants: parts
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
