import express, { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getAll, getOne, runSql } from '../db';
import { pgOne, PROTALK_UPLOAD_URL, PROTALK_UPLOAD_TOKEN } from '../pg';

export const filesRouter = Router();
const PROTALK_FILESTORE_UP_URL = process.env.PROTALK_FILESTORE_UP_URL || 'https://filestore.pro-talk.ru/up';

export async function resolveFolderIntId(rawFolderId: any): Promise<number | null> {
  if (rawFolderId === null || rawFolderId === undefined) return null;
  const str = String(rawFolderId).trim();
  if (!str || str === 'root' || str === 'all') return null;

  const row = await getOne<{ id: number }>(
    `SELECT id FROM file_folders WHERE id::text = $1 OR legacy_id = $1 OR name = $1 LIMIT 1`,
    [str]
  ).catch(() => null);
  return row ? Number(row.id) : null;
}

export async function ensureSoundsFolder(): Promise<number | null> {
  try {
    let row = await getOne<{ id: number }>(
      `SELECT id FROM file_folders WHERE legacy_id = 'folder_sounds' OR name = 'Звуки' LIMIT 1`
    );
    if (!row) {
      row = await pgOne<{ id: number }>(
        `INSERT INTO file_folders (legacy_id, name, parent_id, created_at)
         VALUES ('folder_sounds', 'Звуки', NULL, NOW())
         ON CONFLICT (legacy_id) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`
      );
    }
    return row ? Number(row.id) : null;
  } catch (_) {
    return null;
  }
}

function inferMimeTypeFromName(name?: string, fallbackMime?: string): string {
  const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'aac') return 'audio/aac';
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'webm') return 'audio/webm';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  if (fallbackMime && fallbackMime !== 'application/octet-stream' && fallbackMime !== 'binary/octet-stream') {
    return fallbackMime;
  }
  return 'application/octet-stream';
}

// In-memory LRU cache for upstream file buffers so /file/:id/:name streams instantly & browsers cache it
const upstreamBufferCache = new Map<string, { buffer: Buffer; contentType: string }>();
const MAX_CACHE_ENTRIES = 250;

function cacheBuffer(key: string, buffer: Buffer, contentType: string) {
  if (upstreamBufferCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = upstreamBufferCache.keys().next().value;
    if (oldestKey) upstreamBufferCache.delete(oldestKey);
  }
  upstreamBufferCache.set(key, { buffer, contentType });
}

function parseProTalkUploadResponseText(text: string): string | null {
  const clean = (text || '').trim();
  if (!clean) return null;
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }
  try {
    const parsed = JSON.parse(clean);
    if (typeof parsed === 'string' && (parsed.startsWith('http://') || parsed.startsWith('https://'))) {
      return parsed;
    }
    if (parsed?.data?.url) return String(parsed.data.url);
    if (parsed?.url) return String(parsed.url);
    if (parsed?.file) return String(parsed.file);
  } catch (_) {}
  return null;
}

async function uploadBufferToEndpoint(
  endpoint: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  uploadToken: string,
  preserveAlpha: boolean
): Promise<string | null> {
  try {
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType || 'application/octet-stream' });
    const fd = new FormData();
    fd.append('file', blob, fileName || 'file');
    const headers: Record<string, string> = {
      'X-Upload-Token': uploadToken || PROTALK_UPLOAD_TOKEN,
    };
    if (preserveAlpha) {
      headers['X-Preserve-Alpha'] = 'true';
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: fd,
    });
    if (res.ok) {
      const text = await res.text();
      const parsed = parseProTalkUploadResponseText(text);
      if (parsed) return parsed;
    } else {
      const errTxt = await res.text().catch(() => '');
      console.warn(`ProTalk file upload HTTP ${res.status} (${endpoint}):`, errTxt.slice(0, 200));
    }
  } catch (err) {
    console.error(`Error uploading buffer to ${endpoint}:`, err);
  }
  return null;
}

export async function uploadBufferToProTalkFilestore(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  uploadToken: string = PROTALK_UPLOAD_TOKEN,
  preserveAlpha: boolean = true
): Promise<string | null> {
  const primary = await uploadBufferToEndpoint(
    PROTALK_FILESTORE_UP_URL,
    buffer,
    fileName,
    mimeType,
    uploadToken,
    preserveAlpha
  );
  if (primary) return primary;

  if (PROTALK_UPLOAD_URL !== PROTALK_FILESTORE_UP_URL) {
    return await uploadBufferToEndpoint(
      PROTALK_UPLOAD_URL,
      buffer,
      fileName,
      mimeType,
      uploadToken,
      preserveAlpha
    );
  }
  return null;
}

/**
 * Normalizes any /file/:id/... or https://domain/file/:id/... URL to the direct original ProTalk cloud URL stored in file_storage.
 */
export async function resolveDirectFileUrl(rawUrl: string | null | undefined): Promise<string | null> {
  if (!rawUrl) return rawUrl ?? null;
  const trimmed = String(rawUrl).trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(?:https?:\/\/[^/]+)?\/file\/([^/?#]+)(?:\/([^?#]*))?/i);
  if (!match) return trimmed;

  const fileIdent = decodeURIComponent(match[1]);
  const fileRow = await getOne<{ original_url?: string; url?: string }>(
    `SELECT COALESCE(original_url, url) AS original_url
     FROM file_storage
     WHERE id::text = $1 OR file_key = $1
     LIMIT 1`,
    [fileIdent]
  ).catch(() => null);

  const direct = String(fileRow?.original_url || fileRow?.url || '').trim();
  if (direct.startsWith('http://') || direct.startsWith('https://')) {
    return direct;
  }
  return trimmed;
}

export async function getDirectFileUrlMap(): Promise<Map<string, string>> {
  const rows = await getAll<{ id: number; file_key?: string; original_url?: string; url?: string }>(
    `SELECT id, file_key, COALESCE(original_url, url) AS original_url FROM file_storage`
  ).catch(() => []);
  const map = new Map<string, string>();
  for (const r of rows) {
    const u = String(r.original_url || r.url || '').trim();
    if (u.startsWith('http://') || u.startsWith('https://')) {
      map.set(String(r.id), u);
      if (r.file_key) map.set(String(r.file_key), u);
    }
  }
  return map;
}

export function replaceFilePathWithMap(rawUrl: string | null | undefined, map: Map<string, string>): string | null {
  if (!rawUrl) return rawUrl ?? null;
  const trimmed = String(rawUrl).trim();
  const match = trimmed.match(/^(?:https?:\/\/[^/]+)?\/file\/([^/?#]+)(?:\/([^?#]*))?/i);
  if (!match) return trimmed;
  const resolved = map.get(decodeURIComponent(match[1]));
  return resolved || trimmed;
}

function sendBufferWithRange(req: any, res: any, buffer: Buffer, contentType: string, etagSeed?: string) {
  const total = buffer.length;
  const etag = `"${etagSeed || total}-${total}"`;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('ETag', etag);

  if (!req.headers?.range && req.headers?.['if-none-match'] === etag) {
    return res.status(304).end();
  }

  const range = req.headers?.range;
  if (range && typeof range === 'string' && range.startsWith('bytes=')) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10) || 0;
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
    const clampedStart = Math.max(0, Math.min(start, total - 1));
    const clampedEnd = Math.max(clampedStart, Math.min(end, total - 1));
    const chunkSize = clampedEnd - clampedStart + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${clampedStart}-${clampedEnd}/${total}`);
    res.setHeader('Content-Length', String(chunkSize));
    return res.send(buffer.subarray(clampedStart, clampedEnd + 1));
  }

  res.setHeader('Content-Length', String(total));
  return res.send(buffer);
}

function generateFallbackWavBuffer(seedName?: string): Buffer {
  const sampleRate = 44100;
  const durationSec = 0.65;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = Buffer.alloc(44 + numSamples * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  let hash = 0;
  const str = String(seedName || 'sound');
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffff;
  }
  const baseFreq = 440 + (hash % 320);
  const secondFreq = baseFreq * 1.25;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = t < 0.22 ? baseFreq : secondFreq;
    const env = Math.min(1, t / 0.02) * Math.exp(-t * 4.5);
    const sample =
      (Math.sin(2 * Math.PI * freq * t) * 0.7 +
        Math.sin(2 * Math.PI * freq * 2 * t) * 0.2) *
      env;
    const pcm = Math.max(-32768, Math.min(32767, Math.floor(sample * 24000)));
    buffer.writeInt16LE(pcm, 44 + i * 2);
  }

  return buffer;
}

// ==========================================
// DIRECT FILE ACCESS: /file/:file_id/:file_name & /file/:file_id
// ==========================================
export const directFileHandler = async (req: any, res: any) => {
  const { file_id, file_name } = req.params;
  try {
    let file = await getOne<any>(
      `SELECT * FROM file_storage WHERE id::text = $1 OR file_key = $1 LIMIT 1`,
      [String(file_id)]
    );

    if (!file && file_name) {
      file = await getOne<any>(
        `SELECT * FROM file_storage WHERE name = $1 OR filename = $1 ORDER BY id DESC LIMIT 1`,
        [file_name]
      );
    }

    if (!file || (!file.original_url && !file.url)) {
      return res.status(404).send('File not found');
    }

    let url = String(file.original_url || file.url);
    const resolvedName = file_name || file.name || file.filename || '';
    const inferredMime = inferMimeTypeFromName(resolvedName, file.mime_type);
    const isAudioFile =
      file.file_type === 'audio' ||
      inferredMime.startsWith('audio/') ||
      /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(resolvedName);

    // If original_url is a relative /file/... path, look up a matching record with a direct external URL
    if (url.startsWith('/file/') && resolvedName) {
      const externalMatch = await getOne<any>(
        `SELECT COALESCE(original_url, url) AS original_url
         FROM file_storage
         WHERE (name = $1 OR filename = $1)
           AND (COALESCE(original_url, url) LIKE 'http://%' OR COALESCE(original_url, url) LIKE 'https://%')
         ORDER BY id DESC LIMIT 1`,
        [resolvedName]
      );
      if (externalMatch?.original_url) {
        url = String(externalMatch.original_url);
      }
    }

    const etagSeed = `${file.id}-${file.file_key || ''}`;
    const cacheKey = `${file.id}:${url}`;
    const cached = upstreamBufferCache.get(cacheKey);
    if (cached) {
      return sendBufferWithRange(req, res, cached.buffer, cached.contentType, etagSeed);
    }

    // Serve local public/QaizSocial.jpg directly if requesting file 216 / QaizSocial.jpg
    if (Number(file.id) === 216 || resolvedName.toLowerCase() === 'qaizsocial.jpg') {
      const localSocialPath = path.join(process.cwd(), 'public', 'QaizSocial.jpg');
      if (fs.existsSync(localSocialPath)) {
        const localBuf = fs.readFileSync(localSocialPath);
        cacheBuffer(cacheKey, localBuf, 'image/jpeg');
        return sendBufferWithRange(req, res, localBuf, 'image/jpeg', etagSeed);
      }
    }

    // Handle Data URLs (base64)
    if (url.startsWith('data:')) {
      const commaIdx = url.indexOf(',');
      if (commaIdx !== -1) {
        const header = url.slice(5, commaIdx);
        const rawMime = header.split(';')[0] || file.mime_type;
        const mimeType = inferMimeTypeFromName(resolvedName, rawMime);
        const base64Data = url.slice(commaIdx + 1);
        const buffer = Buffer.from(base64Data, 'base64');
        if (isAudioFile && buffer.length < 32) {
          return sendBufferWithRange(req, res, generateFallbackWavBuffer(resolvedName), 'audio/wav', etagSeed);
        }
        cacheBuffer(cacheKey, buffer, mimeType);
        return sendBufferWithRange(req, res, buffer, mimeType, etagSeed);
      }
    }

    // Fetch from cloud storage (https://file.pro-talk.ru/... or https://filestore.pro-talk.ru/...)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const fetchRes = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'audio/*,image/*,*/*'
          }
        });

        if (fetchRes.ok) {
          const upstreamType = fetchRes.headers.get('content-type')?.split(';')[0]?.trim() || '';
          const arrayBuffer = await fetchRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          const looksLikeHtmlOrJson =
            upstreamType.includes('text/html') ||
            upstreamType.includes('application/json') ||
            (buffer.length > 0 && (buffer[0] === 0x3c || buffer[0] === 0x7b));
          if (isAudioFile && (looksLikeHtmlOrJson || buffer.length < 64)) {
            return sendBufferWithRange(req, res, generateFallbackWavBuffer(resolvedName), 'audio/wav', etagSeed);
          }

          const contentType = inferMimeTypeFromName(resolvedName, file.mime_type || upstreamType);
          cacheBuffer(cacheKey, buffer, contentType);
          return sendBufferWithRange(req, res, buffer, contentType, etagSeed);
        }
      } catch (proxyErr) {
        console.error(`Proxy fetch error for file ${file_id}:`, proxyErr);
      }
    }

    if (isAudioFile) {
      return sendBufferWithRange(req, res, generateFallbackWavBuffer(resolvedName), 'audio/wav', etagSeed);
    }

    return res.redirect(302, url);
  } catch (err: any) {
    console.error('Error fetching file:', err);
    return res.status(500).send('Server Error');
  }
};

// ==========================================
// API ROUTES: /api/admin/files, /api/admin/folders, etc.
// ==========================================

const handleGetFiles = async (req: any, res: any) => {
  try {
    await ensureSoundsFolder();
    const { folder_id, file_type, search, user_id, include_sounds } = req.query;
    let sql = `
      SELECT 
        f.*, 
        COALESCE(f.name, f.filename) AS name,
        COALESCE(f.original_url, f.url) AS original_url,
        COALESCE(f.size, f.size_bytes, 0) AS size,
        fold.name AS folder_name,
        fold.legacy_id AS folder_legacy_id,
        u.display_name AS uploader_name,
        u.username AS uploader_username,
        u.photo_url AS uploader_photo_url,
        u.avatar_url AS uploader_avatar_url,
        u.role AS uploader_role
      FROM file_storage f 
      LEFT JOIN file_folders fold ON f.folder_id = fold.id 
      LEFT JOIN users u ON (f.user_id = u.uid OR f.user_id = u.id)
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (folder_id !== undefined && folder_id !== 'all' && folder_id !== '') {
      if (folder_id === 'root') {
        sql += ` AND f.folder_id IS NULL`;
      } else {
        sql += ` AND (f.folder_id::text = $${pIdx} OR fold.legacy_id = $${pIdx})`;
        params.push(String(folder_id));
        pIdx++;
      }
    } else if (include_sounds !== '1') {
      // Do not show files from "Звуки" folder in the general gallery ("Все файлы")
      sql += ` AND (f.folder_id IS NULL OR (COALESCE(fold.legacy_id, '') != 'folder_sounds' AND COALESCE(fold.name, '') != 'Звуки'))`;
    }

    if (user_id !== undefined && user_id !== 'all' && user_id !== '') {
      if (user_id === 'system') {
        sql += ` AND (f.user_id IS NULL OR f.user_id = '')`;
      } else {
        sql += ` AND (f.user_id = $${pIdx} OR u.uid = $${pIdx} OR u.id = $${pIdx})`;
        params.push(String(user_id));
        pIdx++;
      }
    }

    if (file_type && file_type !== 'all') {
      sql += ` AND f.file_type = $${pIdx}`;
      params.push(String(file_type));
      pIdx++;
    }

    if (search) {
      sql += ` AND (COALESCE(f.name, f.filename, '') ILIKE $${pIdx} OR COALESCE(f.file_key, '') ILIKE $${pIdx} OR COALESCE(u.display_name, '') ILIKE $${pIdx} OR COALESCE(u.username, '') ILIKE $${pIdx})`;
      params.push(`%${search}%`);
      pIdx++;
    }

    sql += ` ORDER BY f.id DESC`;

    const files = await getAll(sql, params);
    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: err.message, files: [] });
  }
};

filesRouter.get('/files', handleGetFiles);
filesRouter.get('/', handleGetFiles);

const handleGetUploaders = async (_req: any, res: any) => {
  try {
    const uploaders = await getAll<any>(`
      SELECT 
        COALESCE(u.uid, f.user_id, 'system') AS uid,
        MAX(u.id) AS user_id,
        MAX(COALESCE(u.display_name, CASE WHEN f.user_id IS NULL OR f.user_id = '' THEN 'Система' ELSE 'Пользователь ' || f.user_id END)) AS display_name,
        MAX(u.username) AS username,
        MAX(COALESCE(u.avatar_url, u.photo_url)) AS avatar_url,
        MAX(u.role) AS role,
        COUNT(f.id)::int AS files_count
      FROM file_storage f
      LEFT JOIN users u ON (f.user_id = u.uid OR f.user_id = u.id)
      GROUP BY COALESCE(u.uid, f.user_id, 'system')
      ORDER BY files_count DESC, display_name ASC
    `);
    res.json({ uploaders });
  } catch (err: any) {
    res.status(500).json({ error: err.message, uploaders: [] });
  }
};

filesRouter.get('/uploaders', handleGetUploaders);
filesRouter.get('/files/uploaders', handleGetUploaders);

// Same-origin binary upload proxy to ProTalk cloud storage (avoids browser CORS preflight rejections)
const rawBinaryUploadMiddleware = express.raw({ type: '*/*', limit: '100mb' });

const handleUploadProxy = async (req: any, res: any) => {
  try {
    const buffer = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === 'string'
      ? Buffer.from(req.body)
      : null;

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Пустое тело файла при загрузке' });
    }

    const rawName = String(req.headers['x-file-name'] || req.query?.name || 'file');
    let fileName = rawName;
    try {
      fileName = decodeURIComponent(rawName);
    } catch (_) {}
    fileName = fileName.trim() || 'file';

    const rawMime = String(req.headers['x-file-mime'] || req.query?.mime || 'application/octet-stream');
    const mimeType = inferMimeTypeFromName(fileName, rawMime);
    const tokenHeader = String(req.headers['x-upload-token'] || '').trim();
    const uploadToken = tokenHeader || PROTALK_UPLOAD_TOKEN;
    const isPng =
      req.headers['x-preserve-alpha'] === 'true' ||
      mimeType === 'image/png' ||
      fileName.toLowerCase().endsWith('.png');

    const remoteUrl = await uploadBufferToProTalkFilestore(buffer, fileName, mimeType, uploadToken, isPng);
    if (!remoteUrl) {
      return res.status(502).json({ error: 'Не удалось загрузить файл в облачное хранилище ProTalk' });
    }

    res.json({ success: true, url: remoteUrl });
  } catch (err: any) {
    console.error('Upload proxy error:', err);
    res.status(500).json({ error: err?.message || 'Ошибка прокси-загрузки файла' });
  }
};

filesRouter.post('/upload-proxy', rawBinaryUploadMiddleware, handleUploadProxy);
filesRouter.post('/files/upload-proxy', rawBinaryUploadMiddleware, handleUploadProxy);

// Same-origin URL upload proxy (avoids browser CORS to file.pro-talk.ru/tgf)
const handleUploadUrlProxy = async (req: any, res: any) => {
  try {
    const sourceUrl = String(req.body?.url || '').trim();
    if (!sourceUrl) {
      return res.status(400).json({ error: 'URL обязателен' });
    }
    if (sourceUrl.includes('filestore.pro-talk.ru/') || sourceUrl.includes('file.pro-talk.ru/')) {
      return res.json({ success: true, url: sourceUrl });
    }
    const uploadToken = String(req.body?.token || req.headers['x-upload-token'] || PROTALK_UPLOAD_TOKEN).trim();

    for (const endpoint of [PROTALK_UPLOAD_URL, PROTALK_FILESTORE_UP_URL]) {
      try {
        const upRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'X-Upload-Token': uploadToken || PROTALK_UPLOAD_TOKEN,
          },
          body: new URLSearchParams({ url: sourceUrl }),
        });
        if (upRes.ok) {
          const text = await upRes.text();
          const parsed = parseProTalkUploadResponseText(text);
          if (parsed) {
            return res.json({ success: true, url: parsed });
          }
        }
      } catch (_) {}
    }

    // Fallback: return original URL if upstream did not mirror it
    return res.json({ success: true, url: sourceUrl });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Ошибка загрузки по URL' });
  }
};

filesRouter.post('/upload-url-proxy', handleUploadUrlProxy);
filesRouter.post('/files/upload-url-proxy', handleUploadUrlProxy);

// Create/Store new file record in DB (always uploading data URLs to https://file.pro-talk.ru/tgf)
const handleCreateFile = async (req: any, res: any) => {
  try {
    const { file_key, name, folder_id, user_id, original_url, mime_type, file_type, size } = req.body;

    if (!name || !original_url) {
      return res.status(400).json({ error: 'Name and original_url are required' });
    }

    let detectedType = file_type || 'other';
    if (!file_type && mime_type) {
      if (mime_type.startsWith('image/')) detectedType = 'image';
      else if (mime_type.startsWith('video/')) detectedType = 'video';
      else if (mime_type.startsWith('audio/')) detectedType = 'audio';
      else if (mime_type.includes('pdf') || mime_type.includes('doc') || mime_type.includes('text')) detectedType = 'document';
    } else if (!file_type && name) {
      const ext = name.split('.').pop()?.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) detectedType = 'image';
      else if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext || '')) detectedType = 'video';
      else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext || '')) detectedType = 'audio';
      else if (['pdf', 'doc', 'docx', 'txt', 'csv', 'xlsx'].includes(ext || '')) detectedType = 'document';
    }

    const key = file_key || Math.random().toString(36).substring(2, 10);
    let storedUrl = String(original_url);
    let finalSize = Number(size) || 0;

    if (storedUrl.startsWith('data:')) {
      const commaIdx = storedUrl.indexOf(',');
      if (commaIdx !== -1) {
        const b64 = storedUrl.slice(commaIdx + 1);
        const binBuf = Buffer.from(b64, 'base64');
        if (!finalSize) finalSize = binBuf.length;
        const inferred = inferMimeTypeFromName(name, mime_type);
        const remoteUrl = await uploadBufferToProTalkFilestore(binBuf, name, inferred);
        if (remoteUrl) {
          storedUrl = remoteUrl;
        } else {
          return res.status(502).json({ error: 'Не удалось загрузить файл в ProTalk Storage' });
        }
      }
    }

    const resolvedFolderId = await resolveFolderIntId(folder_id);
    const folderKey = folder_id && folder_id !== 'root' ? String(folder_id) : null;
    const cleanMime = mime_type || inferMimeTypeFromName(name);

    const insertedRow = await pgOne<{ id: number }>(
      `INSERT INTO file_storage (
        file_key, filename, name, folder_id, folder_key, user_id, owner_id,
        url, original_url, mime_type, file_type, size_bytes, size, file_size,
        preserve_alpha, created_at, updated_at
      ) VALUES ($1, $2, $2, $3, $4, $5, $5, $6, $6, $7, $8, $9, $9, $9, true, NOW(), NOW())
      RETURNING id`,
      [key, name, resolvedFolderId, folderKey, user_id || null, storedUrl, cleanMime, detectedType, finalSize]
    );

    const inserted = insertedRow?.id
      ? await getOne<any>(`
          SELECT 
            f.*, 
            COALESCE(f.name, f.filename) AS name,
            COALESCE(f.original_url, f.url) AS original_url,
            fold.name AS folder_name,
            fold.legacy_id AS folder_legacy_id,
            u.display_name AS uploader_name,
            u.username AS uploader_username,
            u.photo_url AS uploader_photo_url,
            u.avatar_url AS uploader_avatar_url,
            u.role AS uploader_role
          FROM file_storage f 
          LEFT JOIN file_folders fold ON f.folder_id = fold.id 
          LEFT JOIN users u ON (f.user_id = u.uid OR f.user_id = u.id)
          WHERE f.id = $1 LIMIT 1
        `, [insertedRow.id])
      : null;

    res.json({ success: true, file: inserted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

filesRouter.post('/files', handleCreateFile);
filesRouter.post('/', handleCreateFile);

// Update file (rename or move to folder)
const handleUpdateFile = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, folder_id } = req.body;

    const current = await getOne<any>(`SELECT * FROM file_storage WHERE id::text = $1 OR file_key = $1`, [String(id)]);
    if (!current) return res.status(404).json({ error: 'File not found' });

    const newName = name !== undefined ? name : (current.name || current.filename);
    let newFolderId = current.folder_id;
    let newFolderKey = current.folder_key;

    if (folder_id !== undefined) {
      if (folder_id === null || folder_id === '' || folder_id === 'root') {
        newFolderId = null;
        newFolderKey = null;
      } else {
        newFolderId = await resolveFolderIntId(folder_id);
        newFolderKey = String(folder_id);
      }
    }

    await runSql(
      `UPDATE file_storage SET name = $1, filename = $1, folder_id = $2, folder_key = $3, updated_at = NOW() WHERE id = $4`,
      [newName, newFolderId, newFolderKey, current.id]
    );

    const updated = await getOne<any>(`SELECT * FROM file_storage WHERE id = $1`, [current.id]);
    res.json({ success: true, file: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

filesRouter.put('/files/:id', handleUpdateFile);
filesRouter.put('/:id', handleUpdateFile);

// Delete file record
const handleDeleteFile = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await runSql(`DELETE FROM file_storage WHERE id::text = $1 OR file_key = $1`, [String(id)]);
    res.json({ success: true, message: `Файл ${id} удален` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

filesRouter.delete('/files/:id', handleDeleteFile);
filesRouter.delete('/:id', handleDeleteFile);

// ==========================================
// FOLDERS API
// ==========================================

const handleGetFolders = async (_req: any, res: any) => {
  try {
    await ensureSoundsFolder();
    const folders = await getAll(
      `SELECT * FROM file_folders
       ORDER BY CASE WHEN legacy_id = 'folder_sounds' OR name = 'Звуки' THEN 0 ELSE 1 END, name ASC`
    );
    res.json({ folders });
  } catch (err: any) {
    res.status(500).json({ error: err.message, folders: [] });
  }
};

filesRouter.get('/folders', handleGetFolders);
filesRouter.get('/files/folders', handleGetFolders);

const handleCreateFolder = async (req: any, res: any) => {
  try {
    const { name, parent_id, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const legacyId = `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const folder = await pgOne(
      `INSERT INTO file_folders (legacy_id, name, parent_id, color, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [legacyId, name, parent_id || null, color || null]
    );
    res.json({ success: true, folder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

filesRouter.post('/folders', handleCreateFolder);
filesRouter.post('/files/folders', handleCreateFolder);

const handleDeleteFolder = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const folder = await getOne<any>(
      `SELECT * FROM file_folders WHERE id::text = $1 OR legacy_id = $1 LIMIT 1`,
      [String(id)]
    );
    if (!folder) {
      return res.status(404).json({ error: 'Папка не найдена' });
    }
    if (folder.legacy_id === 'folder_sounds' || folder.name === 'Звуки') {
      return res.status(400).json({ error: 'Системную папку «Звуки» нельзя удалить' });
    }
    await runSql(`UPDATE file_storage SET folder_id = NULL, folder_key = NULL WHERE folder_id = $1`, [folder.id]);
    await runSql(`DELETE FROM file_folders WHERE id = $1`, [folder.id]);
    res.json({ success: true, message: `Папка ${id} удалена` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

filesRouter.delete('/folders/:id', handleDeleteFolder);
filesRouter.delete('/files/folders/:id', handleDeleteFolder);

