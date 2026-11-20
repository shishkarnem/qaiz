import { Router, Request, Response } from 'express';
import { getOne, runSql } from '../db';
import { pgOne } from '../pg';

export const voiceAiRouter = Router();

/**
 * 1. Исключительный эндпоинт распознавания речи через ProTalk STT (2-Step Pipeline)
 * Согласно официальному скиллу ProTalk STT, процесс полностью не требует токена:
 * Шаг 1: Загрузка на временный сервер https://file.pro-talk.ru/upload_tmp
 * Шаг 2: Распознавание речи через https://api.pro-talk.ru/api/v1.0/stt_from_widget?url=...
 */
export async function handleVoiceStt(req: Request, res: Response) {
  try {
    const { audio_base64, audio, mime_type, mimeType, fileName } = req.body || {};
    const rawAudio = audio_base64 || audio;
    if (!rawAudio) {
      return res.status(400).json({ success: false, error: 'no_audio_data', reason: 'Аудиозапись не передана' });
    }

    // 1. Извлечение бинарного буфера из Base64 без повреждения заголовков
    const cleanBase64 = typeof rawAudio === 'string' && rawAudio.includes(',')
      ? rawAudio.split(',')[1]
      : typeof rawAudio === 'string'
      ? rawAudio.replace(/^data:[^;]+;base64,/, '')
      : '';

    const buffer = Buffer.from(cleanBase64, 'base64');
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'empty_audio_file', reason: 'Пустой аудиофайл' });
    }

    const mime = mime_type || mimeType || 'audio/webm';
    const uploadFileName = fileName || `voice_${Date.now()}.webm`;

    // 2. Шаг 1: Загрузка во временное хранилище ProTalk (БЕЗ ТОКЕНА)
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mime });
    formData.append('file', blob, uploadFileName);

    let fileUrl: string | null = null;
    let lastUploadError = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const uploadRes = await fetch('https://file.pro-talk.ru/upload_tmp', {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadData = (await uploadRes.json().catch(() => ({}))) as any;
          fileUrl = uploadData?.data?.url || uploadData?.url;
          if (fileUrl) break;
        } else {
          lastUploadError = await uploadRes.text().catch(() => `HTTP ${uploadRes.status}`);
        }
      } catch (err: any) {
        lastUploadError = err?.message || 'Network error';
      }

      if (!fileUrl && attempt < 3) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }

    if (!fileUrl) {
      console.warn('[ProTalk STT Upload Failed]:', lastUploadError);
      return res.status(502).json({
        success: false,
        error: 'upload_failed',
        step: 'upload',
        reason: 'Сервер временных файлов временно недоступен. Попробуйте еще раз через пару секунд.',
        details: lastUploadError
      });
    }

    // 3. Шаг 2: Распознавание речи через официальный STT ProTalk (БЕЗ ТОКЕНА)
    const encodedUrl = encodeURIComponent(fileUrl);
    const sttUrl = `https://api.pro-talk.ru/api/v1.0/stt_from_widget?url=${encodedUrl}`;

    let transcribedText = '';
    // Даем небольшую паузу на синхронизацию временного файла на сервере
    await new Promise((r) => setTimeout(r, 300));

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const sttRes = await fetch(sttUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });

        if (sttRes.ok) {
          const sttData = (await sttRes.json().catch(() => ({}))) as any;
          transcribedText = sttData?.text || '';
          if (transcribedText) break;
        } else {
          const sttErr = await sttRes.text().catch(() => '');
          console.warn(`[ProTalk STT attempt ${attempt} warning]:`, sttRes.status, sttErr);
        }
      } catch (sttEx: any) {
        console.warn(`[ProTalk STT attempt ${attempt} exception]:`, sttEx.message);
      }

      if (!transcribedText && attempt < 3) {
        await new Promise((r) => setTimeout(r, 350 * attempt));
      }
    }

    // 4. Шаг 3: Автоматическая запись файла в PostgreSQL (file_storage)
    try {
      let folderRow = await getOne<{ id: number }>(
        `SELECT id FROM file_folders WHERE id = 3 OR legacy_id = '3' OR name = 'Голосовые' LIMIT 1`
      );
      let folderId: number | null = folderRow ? Number(folderRow.id) : null;

      if (!folderId) {
        try {
          const insertedFolder = await pgOne<{ id: number }>(
            `INSERT INTO file_folders (legacy_id, name, color) VALUES ('3', 'Голосовые', '#E7C768')
             ON CONFLICT (legacy_id) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`
          );
          folderId = insertedFolder ? Number(insertedFolder.id) : null;
        } catch (_) {}
      }

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const formattedName = `VoiseSite_${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`;

      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let fileKey = '';
      for (let i = 0; i < 8; i++) fileKey += chars.charAt(Math.floor(Math.random() * chars.length));

      await runSql(
        `INSERT INTO file_storage (
          file_key, filename, name, url, original_url, mime_type, file_type,
          size_bytes, size, file_size, folder_id, folder_key, owner_id, user_id, description,
          preserve_alpha, created_at, updated_at
        ) VALUES ($1, $2, $2, $3, $3, $4, 'audio', $5, $5, $5, $6, '3', '169262990', '169262990', 'Запись голоса с сайта', true, NOW(), NOW())`,
        [
          fileKey,
          formattedName,
          fileUrl,
          mime,
          buffer.length,
          folderId
        ]
      );
    } catch (dbErr) {
      console.warn('[Voice Save DB Error]:', dbErr);
    }

    const cleanResult = (transcribedText || '').trim();

    return res.json({
      success: true,
      text: cleanResult,
      transcript: cleanResult,
      file_url: fileUrl,
      reason: cleanResult ? undefined : 'Нейросеть не смогла различить слова (тихая запись или шум). Попробуйте сказать громче.'
    });
  } catch (err: any) {
    console.error('[Voice STT Error]:', err);
    return res.status(500).json({ success: false, error: err.message || 'internal_server_error' });
  }
}

voiceAiRouter.post('/stt', handleVoiceStt);
voiceAiRouter.post('/voice/stt', handleVoiceStt);

/**
 * 2. Вызов ProTalk LLM Chat для обработки текста
 */
export async function callProTalkLLM(
  messages: Array<{ role: string; content: string }>,
  chatId: string = 'user_default',
  temperature: number = 0.2
): Promise<string> {
  const cfg = await getOne<{ bot_id: string; bot_token: string }>(
    'SELECT bot_id, bot_token FROM protalk_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
  ).catch(() => null);

  const botId = cfg?.bot_id || '60381';
  let botToken = cfg?.bot_token || '60381_FONb1dD2SQdv7FwG0ui2PZ9ODxXMKkz7';

  const rawToken = botToken.replace(new RegExp(`^${botId}_`), '').trim();
  const bearerToken = `Bearer ${botId}_${rawToken}`;

  const response = await fetch('https://ai.pro-talk.ru/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: bearerToken,
    },
    body: JSON.stringify({
      model: 'hr_rr',
      messages,
      temperature,
      stream: false,
      bot_id: botId,
      bot_token: rawToken,
      bot_chat_id: chatId,
      chat_id: chatId,
      channel_id: chatId,
    }),
  });

  if (!response.ok) {
    throw new Error(`ProTalk HTTP error: ${response.status}`);
  }

  const data = (await response.json().catch(() => ({}))) as any;
  return data?.choices?.[0]?.message?.content || data?.reply || data?.text || '';
}
