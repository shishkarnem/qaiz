import { getOne, runSql, decryptSecret, maskSecret, getSystemSettingAsync } from './db';
import { pgOne } from './pg';

const FALLBACK_CHAT_MODERATION_PROMPT =
  'Проверяй сообщение пользователя на соответствие правилам платформы и законодательству РФ (запрещены оскорбления, нецензурная брань, угрозы, спам, реклама, призывы к насилию и противоправный контент). При нарушении выбери Отказ, иначе Согласие.';

export const PROTALK_BASE_URLS = [
  'https://api.pro-talk.ru',
  'https://eu1.api.pro-talk.ru'
];

export interface ModerationConfig {
  id?: number;
  function_id: number;
  functions_base_id: string;
  bot_id: number;
  bot_token: string;
  masked_bot_token?: string;
  is_token_configured?: boolean;
  instruction: string;
  options: string;
  decision_type: string;
  debug: number | boolean;
  log_url: string | null;
  enable_sheets_logging: number;
  user_prefix: string;
  is_active: number;
  reject_threshold: number;
  updated_at?: string;
}

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  decision?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  tokens?: number;
  rub?: number;
  logId?: number;
  cached?: boolean;
}

// In-memory cache for fast repeated queries
const modCache = new Map<string, { result: ModerationResult; expiresAt: number }>();

// Fast-path common safe greetings and short words
const SAFE_COMMON = new Set([
  'привет', 'хай', 'здравствуйте', 'добрый день', 'доброе утро', 'добрый вечер',
  'да', 'нет', 'ок', 'ок!', 'хорошо', 'спасибо', 'пожалуйста', 'супер', 'круто',
  'плюс', '+', 'го', 'погнали', 'играем', 'красава', 'топ', 'лол', 'gg', 'прив',
  'норм', 'согласен', 'понял', 'ясно', 'принято'
]);

function cleanBotToken(token: string): string {
  if (!token) return '';
  const decrypted = decryptSecret(String(token).trim());
  return decrypted.replace(/^\d+_/, '');
}

export async function getModerationConfig(forBrowserClient = false): Promise<ModerationConfig> {
  const row = await getOne<any>(
    'SELECT * FROM moderation_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
  ).catch(() => null);

  let promptContent = '';
  try {
    const promptRow = await getOne<{ content: string }>(
      `SELECT content FROM prompts WHERE game_id = 'chat_moderation' LIMIT 1`
    );
    if (promptRow && promptRow.content && promptRow.content.trim()) {
      promptContent = promptRow.content.trim();
    }
  } catch (_) {}

  if (
    promptContent &&
    (promptContent.includes('Модерирование чата от грубостей') ||
      promptContent.includes('Проверяй сообщения на спам, токсичность'))
  ) {
    promptContent = '';
  }

  let rowInstruction = row && row.instruction ? String(row.instruction).trim() : '';
  if (
    rowInstruction &&
    (rowInstruction.includes('Модерирование чата от грубостей') ||
      rowInstruction.includes('Проверяй сообщения на спам, токсичность'))
  ) {
    rowInstruction = '';
  }

  const defaultInstruction = promptContent || rowInstruction || FALLBACK_CHAT_MODERATION_PROMPT;
  const vaultModToken = await getSystemSettingAsync('protalk_moderation_token', 'FONb1dD2SQdv7FwG0ui2PZ9ODxXMKkz7');

  const resolvedRawToken = cleanBotToken(row?.bot_token || vaultModToken || 'FONb1dD2SQdv7FwG0ui2PZ9ODxXMKkz7');
  const masked = maskSecret(resolvedRawToken);

  if (row) {
    return {
      id: row.id,
      function_id: Number(row.function_id) || 763,
      functions_base_id: row.functions_base_id || 'appkq3HrzrxYxoAV8',
      bot_id: Number(row.bot_id) || 60381,
      bot_token: forBrowserClient ? masked : resolvedRawToken,
      masked_bot_token: masked,
      is_token_configured: Boolean(resolvedRawToken),
      instruction: defaultInstruction,
      options: row.options || 'Отказ::no;;Согласие::yes',
      decision_type: row.decision_type || 'choice',
      debug: Boolean(row.debug),
      log_url: row.log_url || 'https://docs.google.com/spreadsheets/d/1kIhukcOFzUv5BcISsmFIRxlnGRwjFTB0ZO2Au9t6wh4/edit?usp=sharing',
      enable_sheets_logging: row.enable_sheets_logging !== undefined ? Number(row.enable_sheets_logging) : 1,
      user_prefix: row.user_prefix || 'qaiz_chat_{id}',
      is_active: row.is_active !== undefined ? Number(row.is_active) : 1,
      reject_threshold: Number(row.reject_threshold) || 0.5,
      updated_at: row.updated_at
    };
  }

  return {
    function_id: 763,
    functions_base_id: 'appkq3HrzrxYxoAV8',
    bot_id: 60381,
    bot_token: forBrowserClient ? masked : resolvedRawToken,
    masked_bot_token: masked,
    is_token_configured: Boolean(resolvedRawToken),
    instruction: defaultInstruction,
    options: 'Отказ::no;;Согласие::yes',
    decision_type: 'choice',
    debug: false,
    log_url: 'https://docs.google.com/spreadsheets/d/1kIhukcOFzUv5BcISsmFIRxlnGRwjFTB0ZO2Au9t6wh4/edit?usp=sharing',
    enable_sheets_logging: 1,
    user_prefix: 'qaiz_chat_{id}',
    is_active: 1,
    reject_threshold: 0.5
  };
}

export function formatChatSocialId(senderUid: string, prefixTemplate: string = 'qaiz_chat_{id}'): string {
  const cleanSender = String(senderUid || 'user').replace(/[^a-zA-Z0-9_-]/g, '');
  if (prefixTemplate && prefixTemplate.includes('{id}')) {
    return prefixTemplate.replace('{id}', cleanSender);
  }
  return `${prefixTemplate || 'qaiz_chat'}_${cleanSender}`;
}

export async function moderateChatMessage(
  messageText: string,
  chatId: string,
  senderUid: string,
  customInstruction?: string | null,
  chatType: 'group' | 'direct' = 'group'
): Promise<ModerationResult> {
  const text = (messageText || '').trim();
  if (!text) {
    return { allowed: true, confidence: 1 };
  }

  const lower = text.toLowerCase();
  if (SAFE_COMMON.has(lower)) {
    return { allowed: true, confidence: 1 };
  }

  const config = await getModerationConfig(false);

  if (!config.is_active) {
    return { allowed: true };
  }

  const cleanChat = String(chatId || 'chat').replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanSender = String(senderUid || 'user').replace(/[^a-zA-Z0-9_-]/g, '');
  const cacheKey = `${chatType}:${cleanChat}:${cleanSender}:::${text}`;
  const cached = modCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.result, cached: true };
  }

  const logChatId = formatChatSocialId(cleanSender, config.user_prefix);

  let effectiveCustomInstruction = (customInstruction && customInstruction.trim()) || '';
  if (
    effectiveCustomInstruction.includes('Модерирование чата от грубостей') ||
    effectiveCustomInstruction.includes('Проверяй сообщения на спам, токсичность')
  ) {
    effectiveCustomInstruction = '';
  }

  const finalInstruction = effectiveCustomInstruction || config.instruction || FALLBACK_CHAT_MODERATION_PROMPT;

  const functionArguments: Record<string, any> = {
    text,
    instruction: finalInstruction,
    options: config.options,
    decision_type: config.decision_type || 'choice',
    debug: Boolean(config.debug),
    log_chat_id: logChatId
  };

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

  // Safe copy of payload for database logs (never store raw bot_token in logs!)
  const safeLogPayload = {
    function_id: payload.function_id,
    functions_base_id: payload.functions_base_id,
    bot_id: payload.bot_id,
    bot_token: '[PROTECTED]',
    chat_id: cleanChat,
    chat_type: chatType,
    sender_uid: cleanSender
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
          'User-Agent': 'Qaiz-Moderation-Fn763/1.0'
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
        requestError = err.message || 'Сбой сети при запросе к функции 763';
      }
    }
  }

  if (!apiResponseData) {
    if (requestError && !requestError.includes('отменен по таймауту')) {
      console.warn('[Function 763 Moderation Warn]: No response from ProTalk function 763:', requestError);
    }
    try {
      await runSql(
        `INSERT INTO logs (
          channel_id, user_social_id, user_message, bot_reply,
          channel_name, bot_id, llm, tokens_total, tokens_in_source,
          tokens_out_source, rub, function_error, function_call_params,
          server_name, tokens_user, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
        [
          'chat_moderation',
          cleanSender,
          text,
          'Сбой подключения к функции 763 (fail-open пропуск)',
          'chat_moderation_fn763',
          String(config.bot_id),
          'typesafe_system_one_fn763',
          0,
          0,
          0,
          0,
          requestError || 'Не удалось связаться с функцией 763',
          JSON.stringify(safeLogPayload),
          'function-763-moderation',
          0
        ]
      );
    } catch (_) {}
    return { allowed: true };
  }

  const usageTokens = apiResponseData?.usage?.total_tokens;
  const rawTokens = typeof usageTokens === 'number' ? usageTokens : (Math.ceil(text.length / 3) + 60);
  tokensTotal = rawTokens * 2;
  rubCost = (tokensTotal / 10000000.0) * 300.0;

  const resultObj = apiResponseData?.result || {};
  const rawDecision = resultObj?.raw_decision || {};
  const selectedDecision = String(resultObj?.selected || rawDecision?.choice || '').trim();
  const probabilities = resultObj?.probabilities || rawDecision?.probabilities || {};
  const confidence = typeof rawDecision?.confidence === 'number' ? rawDecision.confidence : 1;

  const rejectProb = typeof probabilities['Отказ'] === 'number' ? probabilities['Отказ'] : (selectedDecision.toLowerCase() === 'отказ' ? 1 : 0);
  const isRejected = (
    selectedDecision.toLowerCase() === 'отказ' ||
    rejectProb >= config.reject_threshold
  );

  const verdictString = isRejected
    ? `Отказ (вероятность: ${Math.round(rejectProb * 100)}%)`
    : `Согласие (вероятность: ${Math.round((probabilities['Согласие'] ?? 1) * 100)}%)`;

  let insertedLogId: number | undefined;
  try {
    const tokensIn = Math.round(tokensTotal * 0.8);
    const tokensOut = Math.max(1, tokensTotal - tokensIn);

    const inserted = await pgOne<{ id: number }>(
      `INSERT INTO logs (
        channel_id, user_social_id, user_message, bot_reply,
        channel_name, bot_id, llm, tokens_total, tokens_in_source,
        tokens_out_source, rub, function_error, function_call_params,
        server_name, tokens_user, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      RETURNING id`,
      [
        'chat_moderation',
        cleanSender,
        text,
        verdictString,
        'chat_moderation_fn763',
        String(config.bot_id),
        'typesafe_system_one_fn763',
        tokensTotal,
        tokensIn,
        tokensOut,
        rubCost,
        null,
        JSON.stringify(safeLogPayload),
        'function-763-moderation',
        tokensTotal
      ]
    );
    if (inserted?.id) insertedLogId = Number(inserted.id);
  } catch (logErr) {
    console.error('[Function 763 Logs Error]:', logErr);
  }

  const finalResult: ModerationResult = {
    allowed: !isRejected,
    reason: isRejected ? 'Сообщение содержит спам, грубость или недопустимый контент' : undefined,
    decision: selectedDecision,
    probabilities,
    confidence,
    tokens: tokensTotal,
    rub: rubCost,
    logId: insertedLogId
  };

  modCache.set(cacheKey, { result: finalResult, expiresAt: Date.now() + 45_000 });

  return finalResult;
}
