/**
 * Safely parses a fetch Response as JSON, returning null if the server
 * returned an HTML page (e.g., SPA fallback or 502 Bad Gateway) or empty/invalid body.
 */
export async function safeParseResponseJson<T = any>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    const trimmed = (text || '').trim();
    if (!trimmed || trimmed.startsWith('<')) {
      return null;
    }
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (
      contentType &&
      !contentType.includes('application/json') &&
      !trimmed.startsWith('{') &&
      !trimmed.startsWith('[')
    ) {
      return null;
    }
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}
