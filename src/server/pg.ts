import dotenv from 'dotenv';
dotenv.config();

export const PROTALK_DB_BASE_URL = process.env.PROTALK_DB_BASE_URL || 'https://db.pro-talk.ru';
export const PROTALK_DB_NAME = process.env.PROTALK_DB_NAME || 'qaiz';
export const PROTALK_DB_USER_ID =
  process.env.PROTALK_DB_USER_ID ||
  'eyJydWlkIjoicmVjVFd5eE4xR3JTUGxTeGMiLCJlbWFpbCI6InJlbnRyb3BleHBlcnRAZ21haWwuY29tIn0';

export const PROTALK_UPLOAD_URL = process.env.PROTALK_UPLOAD_URL || 'https://file.pro-talk.ru/tgf';
export const PROTALK_UPLOAD_TOKEN =
  process.env.PROTALK_UPLOAD_TOKEN ||
  'YGReV3FiWFBsZlh3GH0WVgI-PSkQEBEoAAVoAxcsbRBXRA5eExN7ZHwMAkwOHxQYaGtdWGtjUgVvAH9YAmk';

export function getProTalkHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': PROTALK_DB_USER_ID,
  };
}

/**
 * Normalizes query parameters for PostgreSQL HTTP Proxy:
 * - undefined -> null
 * - plain objects / arrays -> JSON.stringify
 * - Date -> ISO string
 */
export function normalizePgParams(params: any[] = []): any[] {
  return (params || []).map((val) => {
    if (val === undefined) return null;
    if (val !== null && typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
      return JSON.stringify(val);
    }
    if (val instanceof Date) {
      return val.toISOString();
    }
    return val;
  });
}

function isTransientTransportError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || '').toLowerCase();
  const name = String(err?.name || '').toLowerCase();
  const code = String(err?.code || err?.cause?.code || '').toUpperCase();
  const causeMsg = String(err?.cause?.message || '').toLowerCase();

  if (
    code === 'UND_ERR_SOCKET' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNABORTED' ||
    code === 'EPIPE' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN'
  ) {
    return true;
  }

  return (
    name === 'timeouterror' ||
    name === 'aborterror' ||
    msg.includes('fetch failed') ||
    msg.includes('other side closed') ||
    msg.includes('socket') ||
    causeMsg.includes('other side closed') ||
    causeMsg.includes('socket') ||
    causeMsg.includes('timed out')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxAttempts: number = 4,
  timeoutMs: number = 30000
): Promise<Response> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const headers = new Headers(init.headers || {});
      // Force fresh socket after a socket-reuse drop so undici does not reuse a closed keep-alive socket
      if (attempt > 1) {
        headers.set('Connection', 'close');
      }

      const response = await fetch(url, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      });

      if ((response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) && attempt < maxAttempts) {
        try {
          await response.body?.cancel();
        } catch (_) {}
        const delay = 150 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 60);
        await sleep(delay);
        continue;
      }

      return response;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxAttempts && isTransientTransportError(err)) {
        const delay = 150 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 60);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

export interface PgQueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export async function pgQuery<T = any>(
  sql: string,
  params: any[] = [],
  options: { safeMode?: boolean } = {}
): Promise<PgQueryResult<T>> {
  const { safeMode = true } = options;
  const normalizedParams = normalizePgParams(params);

  const response = await fetchWithRetry(`${PROTALK_DB_BASE_URL}/api/proxy/query`, {
    method: 'POST',
    headers: getProTalkHeaders(),
    body: JSON.stringify({
      database: PROTALK_DB_NAME,
      query: sql,
      params: normalizedParams,
      safeMode,
    }),
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch (_) {}

  if (!response.ok || (parsed && parsed.error)) {
    const errMsg = parsed?.error || parsed?.message || text || `HTTP ${response.status}`;
    const err = new Error(`[ProTalk PG Error] ${errMsg}`);
    (err as any).sql = sql;
    throw err;
  }

  const rows: T[] = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const rowCount = typeof parsed?.rowCount === 'number' ? parsed.rowCount : rows.length;
  return { rows, rowCount };
}

export async function pgAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await pgQuery<T>(sql, params);
  return res.rows;
}

export async function pgOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const res = await pgQuery<T>(sql, params);
  return res.rows.length > 0 ? res.rows[0] : null;
}

export async function pgRun(sql: string, params: any[] = []): Promise<{ rowCount: number; rows: any[] }> {
  const res = await pgQuery(sql, params);
  return { rowCount: res.rowCount, rows: res.rows };
}

export async function mcpCall(toolName: string, args: Record<string, any> = {}): Promise<any> {
  const response = await fetchWithRetry(`${PROTALK_DB_BASE_URL}/api/databases/${PROTALK_DB_NAME}/mcp`, {
    method: 'POST',
    headers: getProTalkHeaders(),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  const rawText = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch (_) {}

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || rawText || `MCP HTTP ${response.status}`);
  }
  if (data?.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  const textContent = data?.result?.content?.[0]?.text;
  if (typeof textContent === 'string') {
    try {
      return JSON.parse(textContent);
    } catch (_) {
      return textContent;
    }
  }
  return data?.result;
}

export async function protalkApiRequest(
  path: string,
  method: 'GET' | 'POST' | 'DELETE' | 'PUT' = 'GET',
  body?: any
): Promise<any> {
  const url = `${PROTALK_DB_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetchWithRetry(url, {
    method,
    headers: getProTalkHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch (_) {}
  if (!response.ok) {
    throw new Error(parsed?.error || parsed?.message || text || `HTTP ${response.status}`);
  }
  return parsed ?? text;
}
