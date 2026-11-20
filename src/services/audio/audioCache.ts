export function isSameOriginAudioUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof window === 'undefined') return false;
  if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) return true;
  if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return false;
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

export class AudioCacheManager {
  private cachedBlobUrls: Map<string, string> = new Map();
  private cachingInFlight: Map<string, Promise<string>> = new Map();
  private preloadQueue: string[] = [];
  private activePreloadWorkers: number = 0;
  private queuedPreloadUrls: Set<string> = new Set();

  /**
   * Fetches and caches same-origin /file/... URLs into browser CacheStorage + Blob URL.
   * Cross-origin URLs (e.g. filestore.pro-talk.ru) are returned directly without fetch()
   * so HTML5 <audio> streams them cleanly with zero CORS errors.
   */
  public async cacheAudioUrlAsync(rawUrl: string): Promise<string> {
    if (!rawUrl || typeof window === 'undefined') return rawUrl;
    if (!isSameOriginAudioUrl(rawUrl)) return rawUrl;

    const existingBlob = this.cachedBlobUrls.get(rawUrl);
    if (existingBlob) return existingBlob;

    const existingPromise = this.cachingInFlight.get(rawUrl);
    if (existingPromise) return existingPromise;

    const p = (async () => {
      try {
        let response: Response | undefined;
        if ('caches' in window) {
          try {
            const cache = await window.caches.open('qaiz-audio-cache-v1');
            const matched = await cache.match(rawUrl);
            if (matched && matched.ok) {
              response = matched;
            } else {
              const fetched = await fetch(rawUrl, { cache: 'force-cache' });
              if (fetched.ok) {
                try {
                  await cache.put(rawUrl, fetched.clone());
                } catch (_) {}
                response = fetched;
              }
            }
          } catch (_) {}
        }
        if (!response) {
          const fetched = await fetch(rawUrl, { cache: 'force-cache' });
          if (fetched.ok) response = fetched;
        }
        if (response && response.ok) {
          const blob = await response.blob();
          if (blob.size > 64) {
            const objUrl = URL.createObjectURL(blob);
            this.cachedBlobUrls.set(rawUrl, objUrl);
            return objUrl;
          }
        }
      } catch (_) {
      } finally {
        this.cachingInFlight.delete(rawUrl);
      }
      return rawUrl;
    })();

    this.cachingInFlight.set(rawUrl, p);
    return p;
  }

  public resolveAndCacheAudioUrl(rawUrl: string): string {
    if (!rawUrl || typeof window === 'undefined') return rawUrl;
    const existingBlobUrl = this.cachedBlobUrls.get(rawUrl);
    if (existingBlobUrl) return existingBlobUrl;
    if (isSameOriginAudioUrl(rawUrl)) {
      this.enqueuePreloadUrls([rawUrl], true);
    }
    return rawUrl;
  }

  public enqueuePreloadUrls(urls: string[], highPriority: boolean = false): void {
    for (const rawUrl of urls) {
      if (!rawUrl || !isSameOriginAudioUrl(rawUrl)) continue;
      if (this.cachedBlobUrls.has(rawUrl) || this.cachingInFlight.has(rawUrl)) continue;
      if (this.queuedPreloadUrls.has(rawUrl)) continue;
      this.queuedPreloadUrls.add(rawUrl);
      if (highPriority) {
        this.preloadQueue.unshift(rawUrl);
      } else {
        this.preloadQueue.push(rawUrl);
      }
    }
    this.drainPreloadQueue();
  }

  private drainPreloadQueue(): void {
    const MAX_CONCURRENCY = 3;
    while (this.activePreloadWorkers < MAX_CONCURRENCY && this.preloadQueue.length > 0) {
      const nextUrl = this.preloadQueue.shift()!;
      this.queuedPreloadUrls.delete(nextUrl);
      if (this.cachedBlobUrls.has(nextUrl) || this.cachingInFlight.has(nextUrl)) {
        continue;
      }
      this.activePreloadWorkers++;
      this.cacheAudioUrlAsync(nextUrl).finally(() => {
        this.activePreloadWorkers--;
        this.drainPreloadQueue();
      });
    }
  }
}
