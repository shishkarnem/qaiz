interface CacheEntry<T> {
  payload: T;
  cachedAt: number;
}

const FEED_CACHE_TTL_MS = 60 * 1000;
const POST_CACHE_TTL_MS = 60 * 1000;
const MAX_FEED_CACHE_ENTRIES = 60;
const MAX_POST_CACHE_ENTRIES = 250;

const feedCache = new Map<string, CacheEntry<any>>();
const postCache = new Map<string, CacheEntry<any>>();

export function getCachedPostsFeed(key: string): any | null {
  const entry = feedCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > FEED_CACHE_TTL_MS) {
    feedCache.delete(key);
    return null;
  }
  return entry.payload;
}

export function setCachedPostsFeed(key: string, payload: any): void {
  if (feedCache.size >= MAX_FEED_CACHE_ENTRIES) {
    const oldestKey = feedCache.keys().next().value;
    if (oldestKey) feedCache.delete(oldestKey);
  }
  feedCache.set(key, { payload, cachedAt: Date.now() });
}

export function getCachedPostByKey(slugOrId: string): any | null {
  const entry = postCache.get(slugOrId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > POST_CACHE_TTL_MS) {
    postCache.delete(slugOrId);
    return null;
  }
  return entry.payload;
}

export function setCachedPostRecord(post: any): void {
  if (!post) return;
  const now = Date.now();
  const keys = [post.slug, post.id].filter(Boolean).map(String);
  for (const k of keys) {
    if (postCache.size >= MAX_POST_CACHE_ENTRIES) {
      const oldestKey = postCache.keys().next().value;
      if (oldestKey) postCache.delete(oldestKey);
    }
    postCache.set(k, { payload: post, cachedAt: now });
  }
}

export function invalidatePostsMemoryCache(): void {
  feedCache.clear();
  postCache.clear();
}
