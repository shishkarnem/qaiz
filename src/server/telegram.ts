import { queryRun, getOne, decryptSecret, encryptSecret, getSystemSettingAsync } from "./db";

export interface TelegramBotConfig {
  botToken: string;
  botUsername: string;
  proxyType: "dialog_ai" | "custom_cloudflare" | "direct";
  apiBaseUrl: string;
  adminTelegramId: string;
  miniAppUrl?: string;
}

export const PROXY_PRESETS = {
  dialog_ai: "https://eu1.account.dialog.ai.atiks.org",
  direct: "https://api.telegram.org"
};

let lastWorkingBaseUrl: string | null = null;

function getOrderedBaseUrls(primaryBase: string, preferDirectForUpload = false): string[] {
  const cleanPrimary = cleanTelegramBaseUrl(primaryBase);
  const direct = PROXY_PRESETS.direct;
  const candidates: string[] = [];

  if (preferDirectForUpload && cleanPrimary === PROXY_PRESETS.dialog_ai) {
    candidates.push(direct, cleanPrimary);
  } else if (lastWorkingBaseUrl) {
    candidates.push(lastWorkingBaseUrl);
    if (!candidates.includes(cleanPrimary)) candidates.push(cleanPrimary);
    if (!candidates.includes(direct)) candidates.push(direct);
  } else {
    candidates.push(cleanPrimary);
    if (!candidates.includes(direct)) candidates.push(direct);
  }

  return Array.from(new Set(candidates));
}

export function isTelegramBotBlockedError(errorMsg?: string | null, statusCode?: number): boolean {
  if (statusCode === 403) return true;
  if (!errorMsg) return false;
  const lower = String(errorMsg).toLowerCase();
  return (
    lower.includes("bot was blocked by the user") ||
    lower.includes("user is deactivated") ||
    lower.includes("chat not found") ||
    lower.includes("bot can't initiate conversation") ||
    lower.includes("forbidden: bot") ||
    lower.includes("have no rights to send a message")
  );
}

// 1. Получение настроек бота и прокси из защищенного хранилища PostgreSQL (с расшифровкой токена на сервере)
export async function getTelegramBotConfig(): Promise<TelegramBotConfig> {
  const botConfigRow = await getOne<{
    proxy_type?: "dialog_ai" | "custom_cloudflare" | "direct";
    api_base_url?: string;
    bot_token?: string;
    bot_username?: string;
    web_app_url?: string;
    admin_telegram_id?: string;
  }>(
    "SELECT proxy_type, api_base_url, bot_token, bot_username, web_app_url, admin_telegram_id FROM bot_config WHERE id = 1"
  ).catch(() => undefined);

  const vaultToken = await getSystemSettingAsync("telegram_bot_token", "");
  const envToken = process.env.TELEGRAM_BOT_TOKEN || "";

  const resolvedToken = decryptSecret(
    botConfigRow?.bot_token || vaultToken || envToken || "8663485854:AAHP70ovPUjIzha-YzD4B5rWkUrI57uG6VM"
  );

  const proxyType = botConfigRow?.proxy_type || "dialog_ai";
  const apiBaseUrl =
    botConfigRow?.api_base_url ||
    process.env.TELEGRAM_API_BASE ||
    PROXY_PRESETS[proxyType === "direct" ? "direct" : "dialog_ai"] ||
    PROXY_PRESETS.dialog_ai;

  return {
    botToken: resolvedToken || "8663485854:AAHP70ovPUjIzha-YzD4B5rWkUrI57uG6VM",
    botUsername: botConfigRow?.bot_username || "@qaiz_aibot",
    proxyType,
    apiBaseUrl,
    adminTelegramId: botConfigRow?.admin_telegram_id || process.env.ADMIN_TELEGRAM_ID || "169262990",
    miniAppUrl: botConfigRow?.web_app_url || "https://t.me/qaiz_aibot/app"
  };
}

export async function saveTelegramBotConfigSecure(config: Partial<TelegramBotConfig>): Promise<TelegramBotConfig> {
  const current = await getTelegramBotConfig();
  const nextTokenRaw =
    config.botToken && !config.botToken.includes("••") && !config.botToken.includes("***")
      ? decryptSecret(config.botToken.trim())
      : current.botToken;

  const encryptedToken = encryptSecret(nextTokenRaw);
  const updated: TelegramBotConfig = {
    ...current,
    ...config,
    botToken: nextTokenRaw
  };

  await queryRun(
    `INSERT INTO bot_config (id, proxy_type, api_base_url, bot_token, bot_username, admin_telegram_id, web_app_url, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id) DO UPDATE SET
       proxy_type = EXCLUDED.proxy_type,
       api_base_url = EXCLUDED.api_base_url,
       bot_token = EXCLUDED.bot_token,
       bot_username = EXCLUDED.bot_username,
       admin_telegram_id = EXCLUDED.admin_telegram_id,
       web_app_url = COALESCE(EXCLUDED.web_app_url, bot_config.web_app_url),
       updated_at = NOW()`,
    [
      updated.proxyType || "dialog_ai",
      updated.apiBaseUrl || PROXY_PRESETS.dialog_ai,
      encryptedToken,
      updated.botUsername || "@qaiz_aibot",
      updated.adminTelegramId || "169262990",
      updated.miniAppUrl || "https://t.me/qaiz_aibot/app"
    ]
  ).catch(() => {});

  return updated;
}

// 2. Очистка и нормализация базового URL
export function cleanTelegramBaseUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return PROXY_PRESETS.dialog_ai;
  let u = rawUrl.trim().replace(/\/+$/, "");
  u = u.replace(/\/bot[^\/]+.*$/i, "");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

// Вспомогательная функция очистки reply_markup от поля style при откате для старых прокси
function stripButtonStyle(replyMarkup: any): any {
  if (!replyMarkup || typeof replyMarkup !== "object") return replyMarkup;
  if (!Array.isArray(replyMarkup.inline_keyboard)) return replyMarkup;
  return {
    ...replyMarkup,
    inline_keyboard: replyMarkup.inline_keyboard.map((row: any[]) =>
      Array.isArray(row)
        ? row.map((btn) => {
            if (!btn || typeof btn !== "object") return btn;
            const copy = { ...btn };
            delete copy.style;
            return copy;
          })
        : row
    )
  };
}

// 3. Отправка текстовых сообщений (sendMessage)
export async function sendTelegramMessage(options: {
  chatId: string | number;
  text: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  botToken?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
  replyMarkup?: any;
  disableWebPagePreview?: boolean;
}): Promise<{ ok: boolean; result?: any; error?: string; blocked?: boolean; usedFallback?: boolean }> {
  const config = await getTelegramBotConfig();
  const token = decryptSecret(options.botToken || config.botToken);
  const rawBase = options.apiBaseUrl || config.apiBaseUrl || PROXY_PRESETS.dialog_ai;
  const primaryBase = cleanTelegramBaseUrl(rawBase);
  const timeoutMs = options.timeoutMs || 12000;

  if (!token) {
    return { ok: false, error: "Bot token is missing" };
  }

  const buildPayload = (markup: any) => {
    const p: Record<string, any> = {
      chat_id: options.chatId,
      text: options.text,
      parse_mode: options.parseMode || "HTML",
      disable_web_page_preview: options.disableWebPagePreview ?? true
    };
    if (markup) p.reply_markup = markup;
    return p;
  };

  const candidates = getOrderedBaseUrls(primaryBase, false);
  let lastError = "Request failed";

  for (let i = 0; i < candidates.length; i++) {
    const base = candidates[i];
    const url = `${base}/bot${token}/sendMessage`;
    try {
      let res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(options.replyMarkup)),
        signal: AbortSignal.timeout(timeoutMs)
      });
      let data: any = await res.json().catch(() => ({}));

      // If proxy/server rejected button 'style' parameter, retry cleanly without 'style'
      if (!data.ok && options.replyMarkup && String(data.description || "").toLowerCase().includes("style")) {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(stripButtonStyle(options.replyMarkup))),
          signal: AbortSignal.timeout(timeoutMs)
        });
        data = await res.json().catch(() => ({}));
      }

      // If Telegram rejected inline button URL (e.g. localhost URL during local testing), normalize button URL to https://qaiz.ru
      if (
        !data.ok &&
        options.replyMarkup &&
        (String(data.description || "").toLowerCase().includes("button url") ||
          String(data.description || "").toLowerCase().includes("wrong http url"))
      ) {
        const safeMarkup = JSON.parse(
          JSON.stringify(options.replyMarkup).replace(/https?:\/\/localhost(:\d+)?/gi, "https://qaiz.ru")
        );
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(safeMarkup)),
          signal: AbortSignal.timeout(timeoutMs)
        });
        data = await res.json().catch(() => ({}));
      }

      if (res.ok && data.ok) {
        lastWorkingBaseUrl = base;
        return { ok: true, result: data.result, usedFallback: i > 0 };
      }

      lastError = data.description || `HTTP ${res.status}`;
      if (isTelegramBotBlockedError(lastError, res.status)) {
        return { ok: false, error: lastError, blocked: true };
      }
    } catch (err: any) {
      lastError = err?.message || "Network timeout";
    }
  }

  return { ok: false, error: lastError, blocked: isTelegramBotBlockedError(lastError) };
}

export async function setTelegramWebhook(options: {
  webhookUrl: string;
  botToken?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; error?: string; usedBaseUrl?: string }> {
  const config = await getTelegramBotConfig().catch(() => null);
  const token = decryptSecret(options.botToken || config?.botToken || "");
  const rawBase = options.apiBaseUrl || config?.apiBaseUrl || PROXY_PRESETS.dialog_ai;
  const primaryBase = cleanTelegramBaseUrl(rawBase);
  const timeoutMs = options.timeoutMs || 10000;

  if (!token || !options.webhookUrl) {
    return { ok: false, error: "Bot token or webhookUrl is missing" };
  }

  const candidates = getOrderedBaseUrls(primaryBase, false);
  let lastError = "Webhook setup failed";

  for (let i = 0; i < candidates.length; i++) {
    const base = candidates[i];
    const url = `${base}/bot${token}/setWebhook`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: options.webhookUrl }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        lastWorkingBaseUrl = base;
        return { ok: true, usedBaseUrl: base };
      }
      lastError = data?.description || `HTTP ${res.status}`;
    } catch (err: any) {
      lastError = err?.cause?.message || err?.message || "Network error";
    }
  }

  return { ok: false, error: lastError };
}


// 4. Отправка файлов / бэкапов (sendDocument)
export async function sendTelegramDocument(options: {
  chatId: string | number;
  fileBuffer: Buffer | Uint8Array;
  filename: string;
  caption?: string;
  botToken?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; result?: any; error?: string; blocked?: boolean; usedFallback?: boolean }> {
  const config = await getTelegramBotConfig();
  const token = decryptSecret(options.botToken || config.botToken);
  const rawBase = options.apiBaseUrl || config.apiBaseUrl || PROXY_PRESETS.dialog_ai;
  const primaryBase = cleanTelegramBaseUrl(rawBase);
  const timeoutMs = options.timeoutMs || 60000;

  if (!token) return { ok: false, error: "Bot token is missing" };

  const candidates = getOrderedBaseUrls(primaryBase, true);
  let lastError = "Document upload failed";

  for (let i = 0; i < candidates.length; i++) {
    const base = candidates[i];
    const url = `${base}/bot${token}/sendDocument`;
    try {
      const formData = new FormData();
      formData.append("chat_id", String(options.chatId));
      if (options.caption) {
        formData.append("caption", options.caption);
        formData.append("parse_mode", "HTML");
      }
      const blob = new Blob([options.fileBuffer], { type: "application/json" });
      formData.append("document", blob, options.filename);

      const res = await fetch(url, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(timeoutMs)
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        lastWorkingBaseUrl = base;
        return { ok: true, result: data.result, usedFallback: i > 0 };
      }
      lastError = data.description || `HTTP ${res.status}`;
      if (isTelegramBotBlockedError(lastError, res.status)) {
        return { ok: false, error: lastError, blocked: true };
      }
    } catch (err: any) {
      lastError = err?.message || "Upload timeout";
    }
  }

  return { ok: false, error: lastError, blocked: isTelegramBotBlockedError(lastError) };
}

// 5. Отправка фото с подписью (sendPhoto)
export async function sendTelegramPhoto(options: {
  chatId: string | number;
  photoUrl?: string;
  photoBuffer?: Buffer | Uint8Array;
  filename?: string;
  caption?: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  replyMarkup?: any;
  botToken?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; result?: any; error?: string; blocked?: boolean; usedFallback?: boolean }> {
  const config = await getTelegramBotConfig();
  const token = decryptSecret(options.botToken || config.botToken);
  const rawBase = options.apiBaseUrl || config.apiBaseUrl || PROXY_PRESETS.dialog_ai;
  const primaryBase = cleanTelegramBaseUrl(rawBase);
  const timeoutMs = options.timeoutMs || 20000;

  if (!token) return { ok: false, error: "Bot token is missing" };
  if (!options.photoBuffer && !options.photoUrl) {
    return { ok: false, error: "Neither photoBuffer nor photoUrl was provided" };
  }

  const candidates = getOrderedBaseUrls(primaryBase, Boolean(options.photoBuffer));
  let lastError = "Photo upload failed";

  const sendAttempt = async (base: string, markup: any) => {
    const url = `${base}/bot${token}/sendPhoto`;
    if (options.photoBuffer) {
      const formData = new FormData();
      formData.append("chat_id", String(options.chatId));
      if (options.caption) {
        formData.append("caption", options.caption);
        formData.append("parse_mode", options.parseMode || "HTML");
      }
      if (markup) {
        formData.append("reply_markup", JSON.stringify(markup));
      }
      const blob = new Blob([options.photoBuffer], { type: "image/jpeg" });
      formData.append("photo", blob, options.filename || "image.jpg");

      return fetch(url, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } else {
      const payload: Record<string, any> = {
        chat_id: options.chatId,
        photo: options.photoUrl,
        parse_mode: options.parseMode || "HTML"
      };
      if (options.caption) payload.caption = options.caption;
      if (markup) payload.reply_markup = markup;

      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs)
      });
    }
  };

  for (let i = 0; i < candidates.length; i++) {
    const base = candidates[i];
    try {
      let res = await sendAttempt(base, options.replyMarkup);
      let data: any = await res.json().catch(() => ({}));

      if (!data.ok && options.replyMarkup && String(data.description || "").toLowerCase().includes("style")) {
        res = await sendAttempt(base, stripButtonStyle(options.replyMarkup));
        data = await res.json().catch(() => ({}));
      }

      if (res.ok && data.ok) {
        lastWorkingBaseUrl = base;
        return { ok: true, result: data.result, usedFallback: i > 0 };
      }
      lastError = data.description || `HTTP ${res.status}`;
      if (isTelegramBotBlockedError(lastError, res.status)) {
        return { ok: false, error: lastError, blocked: true };
      }
    } catch (err: any) {
      lastError = err?.message || "Photo upload timeout";
    }
  }

  return { ok: false, error: lastError, blocked: isTelegramBotBlockedError(lastError) };
}

// 6. Отправка голосового сообщения Telegram (sendVoice: OGG Opus buffer)
export async function sendTelegramVoice(options: {
  chatId: string | number;
  voiceBuffer: Buffer | Uint8Array;
  caption?: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  replyMarkup?: any;
  botToken?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; result?: any; error?: string; blocked?: boolean; usedFallback?: boolean }> {
  const config = await getTelegramBotConfig();
  const token = decryptSecret(options.botToken || config.botToken);
  const rawBase = options.apiBaseUrl || config.apiBaseUrl || PROXY_PRESETS.dialog_ai;
  const primaryBase = cleanTelegramBaseUrl(rawBase);
  const timeoutMs = options.timeoutMs || 25000;

  if (!token) return { ok: false, error: "Bot token is missing" };

  const candidates = getOrderedBaseUrls(primaryBase, true);
  let lastError = "Voice upload failed";

  for (let i = 0; i < candidates.length; i++) {
    const base = candidates[i];
    const url = `${base}/bot${token}/sendVoice`;
    try {
      const formData = new FormData();
      formData.append("chat_id", String(options.chatId));
      if (options.caption) {
        formData.append("caption", options.caption);
        formData.append("parse_mode", options.parseMode || "HTML");
      }
      if (options.replyMarkup) {
        formData.append("reply_markup", JSON.stringify(options.replyMarkup));
      }
      const blob = new Blob([options.voiceBuffer], { type: "audio/ogg" });
      formData.append("voice", blob, "voice.ogg");

      const res = await fetch(url, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(timeoutMs)
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        lastWorkingBaseUrl = base;
        return { ok: true, result: data.result, usedFallback: i > 0 };
      }
      lastError = data.description || `HTTP ${res.status}`;
      if (isTelegramBotBlockedError(lastError, res.status)) {
        return { ok: false, error: lastError, blocked: true };
      }
    } catch (err: any) {
      lastError = err?.message || "Voice upload timeout";
    }
  }

  return { ok: false, error: lastError, blocked: isTelegramBotBlockedError(lastError) };
}

// 7. Отправка видео с подписью (sendVideo)
export async function sendTelegramVideo(options: {
  chatId: string | number;
  videoUrl?: string;
  videoBuffer?: Buffer | Uint8Array;
  filename?: string;
  caption?: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  replyMarkup?: any;
  botToken?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; result?: any; error?: string; blocked?: boolean; usedFallback?: boolean }> {
  const config = await getTelegramBotConfig();
  const token = decryptSecret(options.botToken || config.botToken);
  const rawBase = options.apiBaseUrl || config.apiBaseUrl || PROXY_PRESETS.dialog_ai;
  const primaryBase = cleanTelegramBaseUrl(rawBase);
  const timeoutMs = options.timeoutMs || 35000;

  if (!token) return { ok: false, error: "Bot token is missing" };
  if (!options.videoBuffer && !options.videoUrl) {
    return { ok: false, error: "Neither videoBuffer nor videoUrl was provided" };
  }

  const candidates = getOrderedBaseUrls(primaryBase, Boolean(options.videoBuffer));
  let lastError = "Video upload failed";

  for (let i = 0; i < candidates.length; i++) {
    const base = candidates[i];
    const url = `${base}/bot${token}/sendVideo`;
    try {
      let res: Response;
      if (options.videoBuffer) {
        const formData = new FormData();
        formData.append("chat_id", String(options.chatId));
        if (options.caption) {
          formData.append("caption", options.caption);
          formData.append("parse_mode", options.parseMode || "HTML");
        }
        if (options.replyMarkup) {
          formData.append("reply_markup", JSON.stringify(options.replyMarkup));
        }
        const blob = new Blob([options.videoBuffer], { type: "video/mp4" });
        formData.append("video", blob, options.filename || "video.mp4");

        res = await fetch(url, {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(timeoutMs)
        });
      } else {
        const payload: Record<string, any> = {
          chat_id: options.chatId,
          video: options.videoUrl,
          parse_mode: options.parseMode || "HTML"
        };
        if (options.caption) payload.caption = options.caption;
        if (options.replyMarkup) payload.reply_markup = options.replyMarkup;

        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs)
        });
      }

      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        lastWorkingBaseUrl = base;
        return { ok: true, result: data.result, usedFallback: i > 0 };
      }
      lastError = data.description || `HTTP ${res.status}`;
      if (isTelegramBotBlockedError(lastError, res.status)) {
        return { ok: false, error: lastError, blocked: true };
      }
    } catch (err: any) {
      lastError = err?.message || "Video upload timeout";
    }
  }

  return { ok: false, error: lastError, blocked: isTelegramBotBlockedError(lastError) };
}
