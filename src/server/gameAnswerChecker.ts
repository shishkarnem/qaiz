import { runSql } from './db';
import { getModerationConfig, PROTALK_BASE_URLS } from './function763Moderation';

interface CheckAnswerParams {
  gameId: string;
  question: string;
  correctAnswer?: string;
  userAnswer: string;
  explanation?: string;
  userId?: string;
  answers100to1?: { text: string; points?: number }[];
}

export interface CheckAnswerResult {
  isCorrect: boolean;
  matchedIndex?: number;
  matchedText?: string;
  explanation: string;
  source: 'local' | 'function763' | 'llm_fallback';
  timeMs: number;
}

const BOT_API_URLS = [
  'https://api.pro-talk.ru',
  'https://eu1.api.pro-talk.ru'
];

export function formatGameSocialChatId(gameId: string = 'game', userId?: string, prefixTemplate?: string): string {
  const cleanGame = String(gameId || 'game').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '') || 'game';
  const cleanUser = String(userId || 'player').replace(/[^a-zA-Z0-9_-]/g, '') || 'player';

  if (prefixTemplate && prefixTemplate.includes('{game}')) {
    let res = prefixTemplate.replace('{game}', cleanGame);
    return res.includes('{id}') ? res.replace('{id}', cleanUser) : `${res}_${cleanUser}`;
  }

  if (prefixTemplate && prefixTemplate.includes('{id}')) {
    const adjusted = prefixTemplate.replace('chat', `game_${cleanGame}`);
    return adjusted.replace('{id}', cleanUser);
  }

  return `qaiz_game_${cleanGame}_${cleanUser}`;
}

/**
 * Normalizes text for comparison:
 * Lowercases, replaces 'ё' -> 'е', removes punctuation, trims spaces.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»""''.,!?:;\-_—–()[\]{}<>\/\\*~`^#@$%&+=|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  const row = new Array(s2.length + 1);
  for (let i = 0; i <= s2.length; i++) row[i] = i;

  for (let i = 0; i < s1.length; i++) {
    let prev = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const val = s1[i] === s2[j] ? row[j] : Math.min(row[j], row[j + 1], prev) + 1;
      row[j] = prev;
      prev = val;
    }
    row[s2.length] = prev;
  }
  return row[s2.length];
}

/**
 * Calculates similarity coefficient between 0 and 1
 */
function calculateSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(str1, str2);
  return 1 - dist / maxLen;
}

const OBVIOUS_NEGATIVE_ANSWERS = new Set([
  'не знаю', 'незнаю', 'хз', 'пас', 'пропуск', 'сдаюсь', 'хрен знает',
  'нет ответа', 'без понятия', 'хзхз', 'хз короче', '-', '?', 'idk', 'dunno'
]);

/**
 * Level 1: Local Algorithm check for single answer games
 */
export function checkLocalAnswer(userAnswer: string, correctAnswer: string): { isCorrect: boolean; decisive: boolean } {
  const cleanUser = normalizeText(userAnswer);
  const cleanCorrect = normalizeText(correctAnswer);

  if (!cleanUser) {
    return { isCorrect: false, decisive: true };
  }

  // 1. Obvious negative / surrender answers
  if (OBVIOUS_NEGATIVE_ANSWERS.has(cleanUser)) {
    return { isCorrect: false, decisive: true };
  }

  // 2. Exact match
  if (cleanUser === cleanCorrect) {
    return { isCorrect: true, decisive: true };
  }

  // 3. Check parentheses in correct answer, e.g. "Пушкин (Александр)" or "Марс (планета)"
  const bracketMatch = correctAnswer.match(/\((.*?)\)/);
  if (bracketMatch) {
    const inside = normalizeText(bracketMatch[1]);
    const outside = normalizeText(correctAnswer.replace(/\(.*?\)/g, ''));
    if (cleanUser === inside || cleanUser === outside) {
      return { isCorrect: true, decisive: true };
    }
  }

  // 4. Token check for names (e.g. "Александр Пушкин" vs "Пушкин", "Лев Толстой" vs "Толстой")
  const correctTokens = cleanCorrect.split(' ').filter(t => t.length >= 3);
  const userTokens = cleanUser.split(' ').filter(t => t.length >= 3);

  if (correctTokens.length >= 2 && userTokens.length === 1) {
    const singleWord = userTokens[0];
    if (correctTokens.some(t => t === singleWord && t.length >= 4)) {
      return { isCorrect: true, decisive: true };
    }
  }

  // 5. If user wrote the full multi-token title and correct answer is inside
  if (userTokens.length >= 2 && correctTokens.length === 1) {
    if (userTokens.some(t => t === correctTokens[0] && t.length >= 4)) {
      return { isCorrect: true, decisive: true };
    }
  }

  // 6. Fuzzy similarity with typo tolerance
  if (cleanUser.length >= 4 && cleanCorrect.length >= 4) {
    const sim = calculateSimilarity(cleanUser, cleanCorrect);
    // Allow 1 typo for 5+ characters, 2 typos for 8+ characters
    const maxDiff = cleanCorrect.length >= 8 ? 2 : (cleanCorrect.length >= 5 ? 1 : 0);
    const dist = levenshteinDistance(cleanUser, cleanCorrect);
    if (dist <= maxDiff || sim >= 0.88) {
      return { isCorrect: true, decisive: true };
    }
  }

  // If local algorithm didn't find an obvious match, pass to Level 2 (763)
  return { isCorrect: false, decisive: false };
}

/**
 * Level 1: Local Algorithm check for "100 to 1" board answers
 */
export function checkLocal100to1(userAnswer: string, answers: { text: string }[]): { isCorrect: boolean; matchedIndex: number; decisive: boolean } {
  const cleanUser = normalizeText(userAnswer);

  if (!cleanUser || OBVIOUS_NEGATIVE_ANSWERS.has(cleanUser)) {
    return { isCorrect: false, matchedIndex: -1, decisive: true };
  }

  for (let i = 0; i < answers.length; i++) {
    const cleanOption = normalizeText(answers[i].text);
    if (cleanUser === cleanOption) {
      return { isCorrect: true, matchedIndex: i, decisive: true };
    }

    // Single token or typo match
    if (cleanUser.length >= 4 && cleanOption.length >= 4) {
      const dist = levenshteinDistance(cleanUser, cleanOption);
      const maxDiff = cleanOption.length >= 8 ? 2 : (cleanOption.length >= 5 ? 1 : 0);
      if (dist <= maxDiff) {
        return { isCorrect: true, matchedIndex: i, decisive: true };
      }
    }
  }

  return { isCorrect: false, matchedIndex: -1, decisive: false };
}

/**
 * Level 2: Fast classification via Function 763
 */
async function checkWithFunction763(
  question: string,
  correctAnswer: string,
  userAnswer: string,
  gameId: string = 'game',
  userId?: string
): Promise<{ isCorrect: boolean; success: boolean; rawSelected?: string; tokens?: number; rub?: number }> {
  const config = await getModerationConfig();
  const logChatId = formatGameSocialChatId(gameId, userId, config.user_prefix);

  const instruction = `Ты беспристрастный судья интеллектуальной викторины. Определи, является ли ответ игрока правильным по смыслу и сути эталонного ответа.
Критерии:
1. Засчитывай синонимы, опечатки (1-2 буквы), разговорные варианты, грамматические формы, части речи, имена без фамилий или фамилии без имен, если они однозначно указывают на правильный факт.
2. Если ответ игрока передает суть эталонного ответа — выбери "Верно".
3. Если ответ неверен, противоречит сути, искажен или игрок ошибся — выбери "Неверно".`;

  const text = `Вопрос: "${question}"\nПравильный ответ: "${correctAnswer}"\nОтвет игрока: "${userAnswer}"`;

  const functionArguments: Record<string, any> = {
    text,
    instruction,
    options: 'Верно::yes;;Неверно::no',
    decision_type: config.decision_type || 'choice',
    debug: Boolean(config.debug),
    chat_id: logChatId,
    log_chat_id: logChatId
  };

  // Only pass log_url if sheets logging is enabled and log_url is set and not empty
  if (config.enable_sheets_logging && config.log_url && String(config.log_url).trim().length > 0) {
    functionArguments.log_url = String(config.log_url).trim();
  }

  const payload = {
    function_id: config.function_id || 763,
    functions_base_id: config.functions_base_id || 'appkq3HrzrxYxoAV8',
    bot_id: config.bot_id || 60381,
    bot_token: config.bot_token,
    arguments: functionArguments
  };

  let apiResponseData: any = null;
  let requestError: string | null = null;
  let tokensTotal = 80;
  let rubCost = 0.0024;

  for (const host of PROTALK_BASE_URLS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(`${host}/api/v1.0/run_function`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Qaiz-GameAnswerChecker-Fn763/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        apiResponseData = await res.json().catch(() => null);
        if (apiResponseData) break;
      } else {
        const errTxt = await res.text().catch(() => '');
        requestError = `HTTP ${res.status}: ${errTxt.slice(0, 200)}`;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
        requestError = 'Запрос отменен по таймауту 20с';
      } else {
        requestError = err?.message || 'Сбой сети при запросе к функции 763';
      }
    }
  }

  if (!apiResponseData) {
    if (requestError && !requestError.includes('отменен по таймауту')) {
      console.warn(`[GameAnswerChecker 763 Warn] All hosts failed:`, requestError);
    }
    return { isCorrect: false, success: false };
  }

  const usageTokens = apiResponseData?.usage?.total_tokens;
  tokensTotal = typeof usageTokens === 'number' ? usageTokens : (Math.ceil(text.length / 3) + 60);
  rubCost = (tokensTotal / 10000000.0) * 300.0;

  const resultObj = apiResponseData?.result || {};
  const rawDecision = resultObj?.raw_decision || {};
  const selected = String(resultObj?.selected || rawDecision?.choice || '').trim();
  const probabilities = resultObj?.probabilities || rawDecision?.probabilities || {};

  if (selected) {
    const isYes = selected.toLowerCase() === 'верно' ||
                  selected.toLowerCase() === 'yes' ||
                  (typeof probabilities['Верно'] === 'number' && probabilities['Верно'] >= 0.5);
    return { isCorrect: isYes, success: true, rawSelected: selected, tokens: tokensTotal, rub: rubCost };
  }

  return { isCorrect: false, success: false };
}

/**
 * Level 2: Fast classification via Function 763 for 100 to 1
 */
async function checkWithFunction763_100to1(
  question: string,
  userAnswer: string,
  answers: { text: string }[],
  userId?: string
): Promise<{ isCorrect: boolean; matchedIndex: number; success: boolean; tokens?: number; rub?: number }> {
  const config = await getModerationConfig();
  const logChatId = formatGameSocialChatId('100to1', userId, config.user_prefix);

  const optionsList = answers.map((a, i) => `Строка ${i + 1}::opt_${i}`).join(';;') + ';;Мимо::miss';
  const instruction = `Ты судья телеигры "Сто к одному". Определи, какой строке на табло соответствует по смыслу ответ игрока. Если ни одной строке ответ по смыслу не подходит — выбери "Мимо".
Строки табло:
${answers.map((a, i) => `${i + 1}. "${a.text}"`).join('\n')}`;

  const text = `Вопрос: "${question}"\nОтвет игрока: "${userAnswer}"`;

  const functionArguments: Record<string, any> = {
    text,
    instruction,
    options: optionsList,
    decision_type: config.decision_type || 'choice',
    debug: Boolean(config.debug),
    chat_id: logChatId,
    log_chat_id: logChatId
  };

  // Only pass log_url if sheets logging is enabled and log_url is set and not empty
  if (config.enable_sheets_logging && config.log_url && String(config.log_url).trim().length > 0) {
    functionArguments.log_url = String(config.log_url).trim();
  }

  const payload = {
    function_id: config.function_id || 763,
    functions_base_id: config.functions_base_id || 'appkq3HrzrxYxoAV8',
    bot_id: config.bot_id || 60381,
    bot_token: config.bot_token,
    arguments: functionArguments
  };

  let apiResponseData: any = null;
  let requestError: string | null = null;
  let tokensTotal = 80;
  let rubCost = 0.0024;

  for (const host of PROTALK_BASE_URLS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(`${host}/api/v1.0/run_function`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Qaiz-GameAnswerChecker-Fn763/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        apiResponseData = await res.json().catch(() => null);
        if (apiResponseData) break;
      } else {
        const errTxt = await res.text().catch(() => '');
        requestError = `HTTP ${res.status}: ${errTxt.slice(0, 200)}`;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
        requestError = 'Запрос отменен по таймауту 20с';
      } else {
        requestError = err?.message || 'Сбой сети при запросе к функции 763';
      }
    }
  }

  if (!apiResponseData) {
    if (requestError && !requestError.includes('отменен по таймауту')) {
      console.warn(`[GameAnswerChecker 763 100to1 Warn] All hosts failed:`, requestError);
    }
    return { isCorrect: false, matchedIndex: -1, success: false };
  }

  const usageTokens = apiResponseData?.usage?.total_tokens;
  tokensTotal = typeof usageTokens === 'number' ? usageTokens : (Math.ceil(text.length / 3) + 60);
  rubCost = (tokensTotal / 10000000.0) * 300.0;

  const resultObj = apiResponseData?.result || {};
  const rawDecision = resultObj?.raw_decision || {};
  const selected = String(resultObj?.selected || rawDecision?.choice || '').trim();

  if (selected) {
    if (selected.toLowerCase().includes('мимо') || selected.toLowerCase() === 'miss') {
      return { isCorrect: false, matchedIndex: -1, success: true, tokens: tokensTotal, rub: rubCost };
    }
    const matchNum = selected.match(/Строка\s*(\d+)/i) || selected.match(/opt_(\d+)/i);
    if (matchNum) {
      const rawIdx = parseInt(matchNum[1], 10);
      const targetIdx = selected.includes('opt_') ? rawIdx : rawIdx - 1;
      if (targetIdx >= 0 && targetIdx < answers.length) {
        return { isCorrect: true, matchedIndex: targetIdx, success: true, tokens: tokensTotal, rub: rubCost };
      }
    }
  }

  return { isCorrect: false, matchedIndex: -1, success: false };
}

/**
 * Level 3: Fallback LLM bot request (only if Function 763 is unreachable/timeout)
 */
async function checkWithLlmFallback(
  question: string,
  correctAnswer: string,
  userAnswer: string
): Promise<{ isCorrect: boolean; explanation?: string }> {
  try {
    const config = await getModerationConfig();
    const botId = config.bot_id || 60381;
    const botToken = config.bot_token;

    const prompt = `Ты судья викторины. Вопрос: "${question}". Эталонный ответ: "${correctAnswer}". Ответ игрока: "${userAnswer}".
Определи, верен ли ответ по смыслу (синонимы, опечатки, разговорные формы засчитывай).
Верни строго JSON: {"isCorrect": true/false}`;

    const chatId = `chk_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    for (const host of BOT_API_URLS) {
      try {
        const sendRes = await fetch(`${host}/api/v1.0/send_message_async`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bot_id: botId,
            bot_token: botToken,
            bot_chat_id: chatId,
            message: prompt
          })
        });

        if (sendRes.ok) {
          // Poll reply up to 8 seconds
          for (let p = 0; p < 4; p++) {
            await new Promise(r => setTimeout(r, 2000));
            const pollRes = await fetch(`${host}/api/v1.0/get_last_reply`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bot_id: botId,
                bot_token: botToken,
                bot_chat_id: chatId
              })
            });
            if (pollRes.ok) {
              const pollData = await pollRes.json().catch(() => null);
              const reply = pollData?.reply || pollData?.message || '';
              if (reply) {
                const isTrue = reply.includes('"isCorrect": true') || reply.includes('"isCorrect":true');
                return { isCorrect: isTrue };
              }
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  // Last ditch simple equality
  return { isCorrect: normalizeText(userAnswer) === normalizeText(correctAnswer) };
}

/**
 * Logs the answer check to PostgreSQL logs table
 */
async function logAnswerCheck(
  source: 'local' | 'function763' | 'llm_fallback',
  gameId: string,
  userAnswer: string,
  isCorrect: boolean,
  userId?: string,
  customTokens?: number,
  customRub?: number
) {
  try {
    const config = await getModerationConfig().catch(() => null);
    const sender = userId || 'anonymous';
    const logChatId = formatGameSocialChatId(gameId, userId, config?.user_prefix);
    const baseTokens = typeof customTokens === 'number' ? customTokens : (source === 'local' ? 0 : (source === 'function763' ? 80 : 350));
    const baseRub = typeof customRub === 'number' ? customRub : (source === 'local' ? 0 : (source === 'function763' ? 0.0024 : 0.015));
    // Function 763 multiplier: double tokens_total in logs table as required
    const tokens = source === 'function763' ? baseTokens * 2 : baseTokens;
    const rub = source === 'function763' ? baseRub * 2 : baseRub;

    await runSql(
      `INSERT INTO logs (
        channel_id, user_social_id, user_message, bot_reply,
        channel_name, bot_id, llm, tokens_total, tokens_in_source,
        tokens_out_source, rub, function_error, function_call_params,
        server_name, tokens_user, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
      [
        `game_${gameId}`,
        logChatId,
        userAnswer,
        isCorrect ? `Верно (${source})` : `Неверно (${source})`,
        `game_${gameId}`,
        String(config?.bot_id || '60381'),
        source === 'local' ? 'local_algorithm' : (source === 'function763' ? 'typesafe_system_one_fn763' : 'llm_bot_fallback'),
        tokens,
        Math.round(tokens * 0.7),
        Math.max(1, tokens - Math.round(tokens * 0.7)),
        rub,
        null,
        JSON.stringify({ game_id: gameId, source, is_correct: isCorrect, chat_id: logChatId }),
        'game-answer-checker',
        0
      ]
    );
  } catch (_) {}
}

/**
 * Main cascade answer checker for all 5 games
 */
export async function processGameAnswerCheck(params: CheckAnswerParams): Promise<CheckAnswerResult> {
  const startTime = Date.now();
  const { gameId, question, correctAnswer = '', userAnswer, explanation = '', userId, answers100to1 } = params;

  // Handle special case: "100 to 1"
  if (gameId === '100to1' && Array.isArray(answers100to1) && answers100to1.length > 0) {
    // 1. Level 1: Local
    const localResult = checkLocal100to1(userAnswer, answers100to1);
    if (localResult.decisive) {
      const timeMs = Date.now() - startTime;
      await logAnswerCheck('local', gameId, userAnswer, localResult.isCorrect, userId);
      const matchedIdx = localResult.matchedIndex;
      const matchedTxt = matchedIdx !== -1 ? answers100to1[matchedIdx]?.text : undefined;
      return {
        isCorrect: localResult.isCorrect,
        matchedIndex: matchedIdx,
        matchedText: matchedTxt,
        explanation: localResult.isCorrect ? 'Отличный ответ!' : 'Такого варианта не было среди самых популярных.',
        source: 'local',
        timeMs
      };
    }

    // 2. Level 2: Function 763
    const fnResult = await checkWithFunction763_100to1(question, userAnswer, answers100to1, userId);
    if (fnResult.success) {
      const timeMs = Date.now() - startTime;
      await logAnswerCheck('function763', gameId, userAnswer, fnResult.isCorrect, userId, fnResult.tokens, fnResult.rub);
      const matchedIdx = fnResult.matchedIndex;
      const matchedTxt = matchedIdx !== -1 ? answers100to1[matchedIdx]?.text : undefined;
      return {
        isCorrect: fnResult.isCorrect,
        matchedIndex: matchedIdx,
        matchedText: matchedTxt,
        explanation: fnResult.isCorrect ? 'Отличный ответ!' : 'Такого варианта не было среди самых популярных.',
        source: 'function763',
        timeMs
      };
    }

    // 3. Level 3: Fallback (if 763 unreachable)
    const timeMs = Date.now() - startTime;
    await logAnswerCheck('llm_fallback', gameId, userAnswer, false, userId);
    return {
      isCorrect: false,
      matchedIndex: -1,
      explanation: 'Такого варианта не было среди самых популярных.',
      source: 'llm_fallback',
      timeMs
    };
  }

  // Standard quiz games: whatwherewhen, blitz, jeopardy, melody, millionaire
  // 1. Level 1: Local algorithm
  const localCheck = checkLocalAnswer(userAnswer, correctAnswer);
  if (localCheck.decisive) {
    const timeMs = Date.now() - startTime;
    await logAnswerCheck('local', gameId, userAnswer, localCheck.isCorrect, userId);
    const finalExplanation = explanation
      ? (localCheck.isCorrect ? `Верно! ${explanation}` : `Неверно. Правильный ответ: ${correctAnswer}. ${explanation}`)
      : (localCheck.isCorrect ? 'Верно!' : `Правильный ответ: ${correctAnswer}`);
    return {
      isCorrect: localCheck.isCorrect,
      explanation: finalExplanation,
      source: 'local',
      timeMs
    };
  }

  // 2. Level 2: Function 763
  const fn763 = await checkWithFunction763(question, correctAnswer, userAnswer, gameId, userId);
  if (fn763.success) {
    const timeMs = Date.now() - startTime;
    await logAnswerCheck('function763', gameId, userAnswer, fn763.isCorrect, userId, fn763.tokens, fn763.rub);
    const finalExplanation = explanation
      ? (fn763.isCorrect ? `Верно! ${explanation}` : `Неверно. Правильный ответ: ${correctAnswer}. ${explanation}`)
      : (fn763.isCorrect ? 'Верно!' : `Правильный ответ: ${correctAnswer}`);
    return {
      isCorrect: fn763.isCorrect,
      explanation: finalExplanation,
      source: 'function763',
      timeMs
    };
  }

  // 3. Level 3: Fallback LLM bot
  const fallback = await checkWithLlmFallback(question, correctAnswer, userAnswer);
  const timeMs = Date.now() - startTime;
  await logAnswerCheck('llm_fallback', gameId, userAnswer, fallback.isCorrect, userId);
  const finalExplanation = explanation
    ? (fallback.isCorrect ? `Верно! ${explanation}` : `Неверно. Правильный ответ: ${correctAnswer}. ${explanation}`)
    : (fallback.isCorrect ? 'Верно!' : `Правильный ответ: ${correctAnswer}`);

  return {
    isCorrect: fallback.isCorrect,
    explanation: finalExplanation,
    source: 'llm_fallback',
    timeMs
  };
}
