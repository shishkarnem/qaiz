import { Router } from 'express';
import { getOne, runSql, generateId, recalculateUserBalancesFromTransactions, encryptSecret, decryptSecret, maskSecret, getSystemSetting, setSystemSetting } from '../db';
import { requireSuperAdmin } from '../authMiddleware';
import { handleVoiceStt } from './voiceAi';

export const protalkRouter = Router();

const PROTALK_BASE_URLS = [
  'https://api.pro-talk.ru',
  'https://eu1.api.pro-talk.ru'
];

protalkRouter.get('/admin/protalk-config', requireSuperAdmin, async (_req, res) => {
  try {
    const config = await getOne(
      'SELECT bot_id, bot_token, channel_name, is_active FROM protalk_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
    );
    const fallbackVaultToken = getSystemSetting('protalk_general_token', '66337_kEL1nRZp330QvUrG1KenhRQ2JIynkWLs');
    const rawToken = decryptSecret(config?.bot_token || fallbackVaultToken);
    res.json({
      bot_id: config?.bot_id || getSystemSetting('protalk_general_bot_id', '66337'),
      bot_token: maskSecret(rawToken),
      masked_bot_token: maskSecret(rawToken),
      is_token_configured: Boolean(rawToken),
      channel_name: config?.channel_name || 'qaiz',
      is_active: config?.is_active ?? 1
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

protalkRouter.put('/admin/protalk-config', requireSuperAdmin, async (req, res) => {
  try {
    const { bot_id, bot_token, channel_name, is_active } = req.body;
    if (!bot_id) {
      return res.status(400).json({ error: 'bot_id обязателен' });
    }

    const existing = await getOne<{ id: number; bot_token?: string }>('SELECT id, bot_token FROM protalk_config ORDER BY id DESC LIMIT 1');
    const currentPlain = decryptSecret(
      existing?.bot_token || getSystemSetting('protalk_general_token', '66337_kEL1nRZp330QvUrG1KenhRQ2JIynkWLs')
    );

    const isMasked =
      !bot_token ||
      String(bot_token).includes('••') ||
      String(bot_token).includes('***') ||
      String(bot_token).includes('...');

    const nextPlainToken = isMasked ? currentPlain : decryptSecret(String(bot_token).trim());
    const encryptedToken = encryptSecret(nextPlainToken);

    setSystemSetting('protalk_general_bot_id', String(bot_id).trim(), false);
    setSystemSetting('protalk_general_token', nextPlainToken, true);

    if (existing) {
      await runSql(
        `UPDATE protalk_config SET bot_id = $1, bot_token = $2, channel_name = $3, is_active = $4, updated_at = NOW() WHERE id = $5`,
        [String(bot_id).trim(), encryptedToken, channel_name || 'qaiz', is_active ?? 1, existing.id]
      );
    } else {
      await runSql(
        `INSERT INTO protalk_config (bot_id, bot_token, channel_name, is_active) VALUES ($1, $2, $3, $4)`,
        [String(bot_id).trim(), encryptedToken, channel_name || 'qaiz', is_active ?? 1]
      );
    }

    res.json({
      message: 'Настройки ProTalk надежно зашифрованы (AES-256-GCM) и сохранены в БД',
      masked_bot_token: maskSecret(nextPlainToken)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function isReasoningContent(text: any): boolean {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (
    t.startsWith('AI Reasoning') ||
    t.startsWith('Reasoning:') ||
    t.startsWith('Thinking:') ||
    t.startsWith('Thought:') ||
    t.startsWith('<think>') ||
    t.includes('AI Reasoning (None):') ||
    (t.startsWith('**Crafting') && t.includes('JSON'))
  ) {
    // If it's pure reasoning without the actual payload JSON array or data objects
    if (!t.includes('"name"') && !t.includes('"question"') && !t.includes('"round"') && !t.includes('"answer"') && !t.includes('"text"')) {
      return true;
    }
  }
  return false;
}

function cleanReasoning(text: any): string {
  if (!text || typeof text !== 'string') return typeof text === 'object' ? JSON.stringify(text) : String(text || '');
  let t = text.trim();
  // Remove <think>...</think> blocks
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // If starts with AI Reasoning, look for start of JSON or clean text
  if (t.startsWith('AI Reasoning') || t.includes('AI Reasoning (None):') || t.startsWith('Reasoning:')) {
    const jsonArrIdx = t.indexOf('[');
    const jsonObjIdx = t.indexOf('{');
    const firstIdx = (jsonArrIdx !== -1 && jsonObjIdx !== -1)
      ? Math.min(jsonArrIdx, jsonObjIdx)
      : (jsonArrIdx !== -1 ? jsonArrIdx : jsonObjIdx);
    if (firstIdx !== -1) {
      return t.substring(firstIdx).trim();
    }
  }
  return t;
}

function extractMessageFromProTalk(data: any): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') {
    const cleaned = cleanReasoning(data);
    if (isReasoningContent(cleaned)) return '';
    return cleaned;
  }

  // If array of messages (e.g. from get_messages or history)
  if (Array.isArray(data)) {
    for (let i = data.length - 1; i >= 0; i--) {
      const item = data[i];
      if (item && typeof item === 'object') {
        if (item.role === 'system' || item.role === 'user') continue;
        const rawContent = item.content !== undefined ? item.content : (item.message || item.text || item.reply);
        const cleaned = cleanReasoning(typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent));
        if (cleaned && !isIntermediateStatus(cleaned) && !isReasoningContent(cleaned)) {
          return cleaned;
        }
      } else if (typeof item === 'string') {
        const cleaned = cleanReasoning(item);
        if (cleaned && !isIntermediateStatus(cleaned) && !isReasoningContent(cleaned)) {
          return cleaned;
        }
      }
    }
    return '';
  }

  if (typeof data === 'object') {
    // Check nested messages list first if available, prioritizing real assistant answers over reasoning
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      for (let i = data.messages.length - 1; i >= 0; i--) {
        const item = data.messages[i];
        if (item && typeof item === 'object') {
          if (item.role === 'system' || item.role === 'user') continue;
          const rawContent = item.content !== undefined ? item.content : (item.message || item.text || item.reply);
          const cleaned = cleanReasoning(typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent));
          if (cleaned && !isIntermediateStatus(cleaned) && !isReasoningContent(cleaned)) {
            return cleaned;
          }
        }
      }
    }

    // Direct keys
    for (const key of ['message', 'reply', 'response', 'text', 'answer', 'result', 'output', 'content']) {
      if (typeof data[key] === 'string' && data[key].trim()) {
        const cleaned = cleanReasoning(data[key]);
        if (!isReasoningContent(cleaned)) {
          return cleaned;
        }
      }
      if (Array.isArray(data[key])) {
        const extracted = extractMessageFromProTalk(data[key]);
        if (extracted) return extracted;
      }
      if (data[key] && typeof data[key] === 'object') {
        const nested = extractMessageFromProTalk(data[key]);
        if (nested && !isReasoningContent(nested)) return nested;
      }
    }
    if (typeof data.done === 'string' && data.done.trim()) {
      const cleaned = cleanReasoning(data.done);
      if (!isReasoningContent(cleaned)) return cleaned;
    }
  }
  return '';
}

function extractTokensFromProTalk(replyJson: any, promptText: string, replyText: string) {
  let tokens_total: number | null = null;
  let tokens_in_source: number | null = null;
  let tokens_out_source: number | null = null;
  let tokens_user: number | null = null;

  if (replyJson && typeof replyJson === 'object') {
    const obj = replyJson.usage || replyJson.data || replyJson;

    // Total tokens
    const rawTotal = obj.tokens_total ?? obj.total_tokens ?? obj.tokens ?? replyJson.tokens_total ?? replyJson.total_tokens;
    if (rawTotal !== undefined && rawTotal !== null && !isNaN(Number(rawTotal))) {
      tokens_total = Number(rawTotal);
    }

    // Input / source tokens (handle variations including tokens_in_sourse)
    const rawIn = obj.tokens_in_source ?? obj.tokens_in_sourse ?? obj.tokens_in ?? obj.prompt_tokens ?? obj.input_tokens ?? 
                  replyJson.tokens_in_source ?? replyJson.tokens_in_sourse ?? replyJson.tokens_in ?? replyJson.prompt_tokens;
    if (rawIn !== undefined && rawIn !== null && !isNaN(Number(rawIn))) {
      tokens_in_source = Number(rawIn);
    }

    // Output / completion tokens (handle variations including tokens_out_sourse)
    const rawOut = obj.tokens_out_source ?? obj.tokens_out_sourse ?? obj.tokens_out ?? obj.completion_tokens ?? obj.output_tokens ?? 
                   replyJson.tokens_out_source ?? replyJson.tokens_out_sourse ?? replyJson.tokens_out ?? replyJson.completion_tokens;
    if (rawOut !== undefined && rawOut !== null && !isNaN(Number(rawOut))) {
      tokens_out_source = Number(rawOut);
    }

    // User tokens
    const rawUserTokens = obj.tokens_user ?? obj.user_tokens ?? replyJson.tokens_user;
    if (rawUserTokens !== undefined && rawUserTokens !== null && !isNaN(Number(rawUserTokens))) {
      tokens_user = Number(rawUserTokens);
    }
  }

  // Fallback estimates if ProTalk didn't provide token counts
  if (tokens_in_source === null && promptText) {
    tokens_in_source = Math.ceil(promptText.length / 3.5);
  }
  if (tokens_out_source === null && replyText) {
    tokens_out_source = Math.ceil(replyText.length / 3.5);
  }
  if (tokens_total === null) {
    tokens_total = (tokens_in_source || 0) + (tokens_out_source || 0);
  }

  return {
    tokens_total,
    tokens_in_source,
    tokens_out_source,
    tokens_user
  };
}

function isIntermediateStatus(str: any): boolean {
  if (!str || typeof str !== 'string') return true;
  const t = str.trim();
  if (
    t === '' ||
    t === 'None' ||
    t === 'null' ||
    t === 'undefined' ||
    t === 'OK' ||
    t === 'STARTED' ||
    t === 'QUEUED' ||
    t === 'WAITING' ||
    t.includes('Dialog state: STARTED') ||
    t.includes('Dialog state: QUEUED') ||
    t.includes('Dialog state: WAITING') ||
    t.startsWith('AI Reasoning') ||
    t.includes('AI Reasoning (None): None')
  ) {
    return true;
  }
  return false;
}

const handleProTalkRequest = async (req: any, res: any) => {
  const { prompt, chat_id, bot_chat_id, user_id, userId, game_id, gameId, mode, social_id, message } = req.body;
  const userPrompt = prompt || message;

  if (!userPrompt) {
    return res.status(400).json({ error: 'Промпт (сообщение) не может быть пустым' });
  }

  let dbConfig = await getOne<{ bot_id: string; bot_token: string; channel_name: string }>(
    'SELECT bot_id, bot_token, channel_name FROM protalk_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
  );

  const botId = dbConfig?.bot_id || getSystemSetting('protalk_general_bot_id', '66337') || '66337';
  const rawStoredToken = dbConfig?.bot_token || getSystemSetting('protalk_general_token', '66337_kEL1nRZp330QvUrG1KenhRQ2JIynkWLs');
  const botToken = decryptSecret(rawStoredToken || '66337_kEL1nRZp330QvUrG1KenhRQ2JIynkWLs');

  const rawGame = game_id || gameId || mode || 'blitz';
  let rawUser = user_id || userId;
  if (!rawUser || rawUser === '169262990' || rawUser === 'usr_guest') {
    rawUser = String(Math.floor(10000000000 + Math.random() * 90000000000));
  }
  const cleanGame = String(rawGame).replace(/[^a-zA-Z0-9]/g, '');
  const cleanUser = String(rawUser).replace(/[^a-zA-Z0-9]/g, '');
  
  const defaultChatId = `${cleanGame}${cleanUser}` || `blitz${Date.now()}`;
  let chatId = chat_id || bot_chat_id || defaultChatId;
  chatId = String(chatId).replace(/[^a-zA-Z0-9]/g, '') || defaultChatId;

  const userSocialId = social_id || `from_user_id:${cleanUser} message_id:${Date.now()}`;
  const channelName = req.body.channel_name || dbConfig?.channel_name || 'qaiz';

  let text = '';
  let functionError = '';

  try {
    // Determine active base URL and send message with automatic failover
    let activeBaseUrl = PROTALK_BASE_URLS[0];
    let sendSuccessful = false;
    let lastSendError = '';

    // 0. Check last reply on primary host before sending to detect fresh updates when chat_id is reused
    let initialOldReply = '';
    for (const host of PROTALK_BASE_URLS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const prevCheck = await fetch(`${host}/api/v1.0/get_last_reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bot_id: parseInt(botId, 10) || botId,
            bot_token: botToken,
            bot_chat_id: chatId,
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (prevCheck.ok) {
          const prevJson = await prevCheck.json().catch(() => null);
          initialOldReply = extractMessageFromProTalk(prevJson) || '';
          break;
        }
      } catch (_) {}
    }

    // 1. Send message asynchronously with automatic host failover and retry on 502/503/504
    const MAX_SEND_ATTEMPTS = 3;
    let attempt = 0;

    while (attempt < MAX_SEND_ATTEMPTS && !sendSuccessful) {
      attempt++;
      for (const host of PROTALK_BASE_URLS) {
        try {
          console.log(`[ProTalk] Sending request to ${host}/api/v1.0/send_message_async (bot_id=${botId}, bot_chat_id=${chatId}, attempt=${attempt})`);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 12000);
          
          const sendRes = await fetch(`${host}/api/v1.0/send_message_async`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'Qaiz-ProTalk-Client/1.0'
            },
            body: JSON.stringify({
              bot_id: parseInt(botId, 10) || botId,
              bot_token: botToken,
              bot_chat_id: chatId,
              message: userPrompt,
            }),
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (sendRes.ok) {
            activeBaseUrl = host;
            sendSuccessful = true;
            console.log(`[ProTalk] Successfully queued message on ${host} (attempt ${attempt})`);
            break;
          } else {
            const errBody = await sendRes.text().catch(() => '');
            const isGatewayError = sendRes.status === 502 || sendRes.status === 503 || sendRes.status === 504;
            
            if (isGatewayError) {
              lastSendError = `Сервер ProTalk временно недоступен (${sendRes.status} Bad Gateway). Пожалуйста, повторите попытку через пару секунд.`;
              console.warn(`[ProTalk Warning] Host ${host} returned HTTP ${sendRes.status} (OpenResty Gateway Error). Attempt ${attempt}/${MAX_SEND_ATTEMPTS}.`);
            } else {
              lastSendError = `ProTalk send_message_async HTTP ${sendRes.status}: ${errBody.slice(0, 150)}`;
              console.warn(`[ProTalk Warning] Host ${host} failed: HTTP ${sendRes.status}.`);
            }
          }
        } catch (sendErr: any) {
          lastSendError = `Ошибка соединения с ProTalk (${host}): ${sendErr.message}`;
          console.warn(`[ProTalk Warning] Network issue with ${host}: ${sendErr.message}. Attempt ${attempt}/${MAX_SEND_ATTEMPTS}.`);
        }
      }

      if (!sendSuccessful && attempt < MAX_SEND_ATTEMPTS) {
        // Wait before retrying on 502/network glitch
        const backoffMs = attempt * 1200;
        console.log(`[ProTalk] Backing off for ${backoffMs}ms before retry attempt ${attempt + 1}...`);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }

    if (!sendSuccessful) {
      throw new Error(lastSendError || 'Серверы ProTalk API временно недоступны (502 Bad Gateway). Повторите попытку через несколько секунд.');
    }

    // 2. Poll get_last_reply (every 3 seconds, up to 165s for jeopardy / 60s for check / 100s for others)
    const isCheckMode = mode === 'check_answer' || mode === 'check' || (typeof userPrompt === 'string' && userPrompt.includes('Проверь ответ'));
    const isJeopardy = cleanGame === 'jeopardy' || 
      mode === 'jeopardy' || 
      (typeof userPrompt === 'string' && (
        userPrompt.includes('Своя Икра') || 
        userPrompt.includes('jeopardy') || 
        userPrompt.includes('раунд из 25 вопросов') || 
        userPrompt.includes('25 вопросов') ||
        userPrompt.includes('супер-вопрос')
      ));
    const TIMEOUT_MS = isJeopardy ? 250000 : (isCheckMode ? 60000 : 100000);
    const POLL_INTERVAL_MS = 3000; // 3 seconds
    const startTime = Date.now();

    let lastReplyJson: any = null;

    while (Date.now() - startTime < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      // 1. First try get_last_reply
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const replyRes = await fetch(`${activeBaseUrl}/api/v1.0/get_last_reply`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${botToken}`
          },
          body: JSON.stringify({
            bot_id: parseInt(botId, 10) || botId,
            bot_token: botToken,
            bot_chat_id: chatId,
            chat_id: chatId
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (replyRes.ok) {
          const replyJson = await replyRes.json().catch(() => null);
          if (replyJson) {
            lastReplyJson = replyJson;
          }
          const candidate = extractMessageFromProTalk(replyJson);
          if (candidate && !isIntermediateStatus(candidate) && !isReasoningContent(candidate)) {
            if (initialOldReply && candidate === initialOldReply && (Date.now() - startTime) < 8000) {
              console.log(`[ProTalk] Polling fresh answer for ${chatId}...`);
            } else {
              text = candidate;
              console.log(`[ProTalk] Received valid reply from get_last_reply for ${chatId} in ${Math.round((Date.now() - startTime) / 1000)}s`);
              break;
            }
          }
        }
      } catch (pollErr: any) {
        console.warn(`[ProTalk Poll Warn for ${chatId}]:`, pollErr.message);
      }

      // 2. If get_last_reply returned empty, reasoning or stale message, check get_messages
      if (!text) {
        try {
          const msgController = new AbortController();
          const msgTimeout = setTimeout(() => msgController.abort(), 7000);
          const msgRes = await fetch(`${activeBaseUrl}/api/v1.0/get_messages`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${botToken}`
            },
            body: JSON.stringify({
              bot_id: parseInt(botId, 10) || botId,
              chat_id: chatId
            }),
            signal: msgController.signal
          });
          clearTimeout(msgTimeout);

          if (msgRes.ok) {
            const msgList = await msgRes.json().catch(() => null);
            if (Array.isArray(msgList) && msgList.length > 0) {
              // Find index of the latest user message
              let lastUserIdx = -1;
              for (let i = msgList.length - 1; i >= 0; i--) {
                if (msgList[i].role === 'user') {
                  lastUserIdx = i;
                  break;
                }
              }

              // Scan assistant messages after the user prompt, ignoring pure reasoning/system messages
              for (let i = msgList.length - 1; i > lastUserIdx; i--) {
                const m = msgList[i];
                if (m && m.role === 'assistant') {
                  const rawContent = m.content !== undefined ? m.content : (m.message || m.text || m.reply);
                  const cleaned = cleanReasoning(typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent));
                  if (cleaned && !isIntermediateStatus(cleaned) && !isReasoningContent(cleaned)) {
                    text = cleaned;
                    console.log(`[ProTalk] Found valid answer from get_messages for ${chatId} at message #${i} in ${Math.round((Date.now() - startTime) / 1000)}s`);
                    break;
                  }
                }
              }

              // If no assistant message after user prompt yet, or if lastUserIdx was -1, fallback to latest non-reasoning assistant message
              if (!text && lastUserIdx === -1) {
                const candidate = extractMessageFromProTalk(msgList);
                if (candidate && !isIntermediateStatus(candidate) && !isReasoningContent(candidate)) {
                  text = candidate;
                  console.log(`[ProTalk] Extracted valid answer from msgList fallback for ${chatId}`);
                  break;
                }
              }
            }
          }
        } catch (_) {}
      }

      if (text) {
        break;
      }
    }

    if (!text) {
      const waitStr = isJeopardy ? '240 секунд' : (isCheckMode ? '60 секунд' : '100 секунд');
      functionError = `Timeout: ответ не получен от ProTalk за ${waitStr}`;
      throw new Error(`Нейросеть не смогла сформировать ответ за отведенное время (${waitStr}). Попробуйте еще раз.`);
    }

    // Extract exact tokens usage from ProTalk payload
    const tokenStats = extractTokensFromProTalk(lastReplyJson, userPrompt, text);
    const rubCost = (tokenStats.tokens_total / 10000000.0) * 300.0;
    const realChannelId = String(req.body.channel_id || channelName || 'qaiz');
    const realUserSocialId = String(req.body.user_social_id || cleanUser || social_id || 'system');

    // Log query in PostgreSQL `logs` table with exact token metrics
    try {
      await runSql(
        `INSERT INTO logs (
          channel_id, user_social_id, user_message, bot_reply,
          channel_name, bot_id, llm, tokens_total, tokens_in_source, tokens_out_source, tokens_user, rub, function_error, function_call_params, server_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          realChannelId,
          realUserSocialId,
          userPrompt,
          text,
          channelName,
          String(botId),
          lastReplyJson?.llm || lastReplyJson?.model || 'protalk',
          tokenStats.tokens_total,
          tokenStats.tokens_in_source,
          tokenStats.tokens_out_source,
          tokenStats.tokens_user,
          rubCost,
          functionError || null,
          JSON.stringify({ chat_id: String(chatId), mode: mode || 'ask' }),
          'ai-chat-miniapp'
        ]
      );
    } catch (logErr) {
      console.error('[Logs Error]:', logErr);
    }

    res.json({
      text,
      reply: text,
      message: text,
      response: text,
      chat_id: chatId,
      social_id: userSocialId,
      tokens_total: tokenStats.tokens_total,
      tokens_in_source: tokenStats.tokens_in_source,
      tokens_out_source: tokenStats.tokens_out_source,
      active_host: activeBaseUrl
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

const handleProTalkSTT = handleVoiceStt;

protalkRouter.post('/protalk', handleProTalkRequest);
protalkRouter.post('/protalk/ask', handleProTalkRequest);
protalkRouter.post('/protalk/test', handleProTalkRequest);
protalkRouter.post('/ai-chat', handleProTalkRequest);
protalkRouter.post('/voice/stt', handleProTalkSTT);
protalkRouter.post('/protalk/stt', handleProTalkSTT);
protalkRouter.post('/stt', handleProTalkSTT);
