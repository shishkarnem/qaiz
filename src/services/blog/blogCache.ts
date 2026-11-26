export interface BlogCategoryStat {
  category: string;
  cnt: number;
}

export interface CachedBlogFeed {
  posts: any[];
  total: number;
  hasMore: boolean;
  categories: BlogCategoryStat[];
  cachedAt: number;
}

export interface BlogViewState {
  selectedGame: string;
  selectedCategory: string;
  searchQuery: string;
  debouncedQuery: string;
  scrollY: number;
  anchorPostId: string | null;
  anchorViewportTop: number;
  shouldRestoreOnReturn: boolean;
  savedAt: number;
}

const LOCAL_DEFAULT_FEED_KEY = 'qaiz_blog_default_feed_v1';
const SESSION_FEED_MAP_KEY = 'qaiz_blog_session_feeds_v1';
const SESSION_VIEW_STATE_KEY = 'qaiz_blog_view_state_v1';
const SESSION_POSTS_MAP_KEY = 'qaiz_blog_session_posts_v1';

export const BLOG_FEED_SOFT_TTL_MS = 2 * 60 * 1000;
const LOCAL_FEED_HARD_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_LOCAL_PERSISTED_POSTS = 20;
const MAX_SESSION_PERSISTED_POSTS = 60;
const MAX_INDIVIDUAL_POSTS_CACHE = 80;

const memoryFeedCache = new Map<string, CachedBlogFeed>();
const memoryPostCache = new Map<string, { post: any; cachedAt: number }>();

let memoryViewState: BlogViewState = {
  selectedGame: 'all',
  selectedCategory: 'all',
  searchQuery: '',
  debouncedQuery: '',
  scrollY: 0,
  anchorPostId: null,
  anchorViewportTop: 0,
  shouldRestoreOnReturn: false,
  savedAt: 0,
};

let sessionViewHydrated = false;
let sessionFeedsHydrated = false;
let sessionPostsHydrated = false;

export function buildBlogFeedFilterKey(
  selectedGame: string,
  selectedCategory: string,
  debouncedQuery: string
): string {
  return `${selectedGame || 'all'}|${selectedCategory || 'all'}|${(debouncedQuery || '').trim().toLowerCase()}`;
}

function isDefaultFeedKey(filterKey: string): boolean {
  return filterKey === 'all|all|';
}

function readStorageJson<T>(storage: Storage | undefined, key: string): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStorageJson(storage: Storage | undefined, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / private mode errors cleanly
  }
}

function hydrateSessionFeedsOnce(): void {
  if (sessionFeedsHydrated || typeof window === 'undefined') return;
  sessionFeedsHydrated = true;

  const sessionMap = readStorageJson<Record<string, CachedBlogFeed>>(window.sessionStorage, SESSION_FEED_MAP_KEY);
  if (sessionMap && typeof sessionMap === 'object') {
    for (const [k, v] of Object.entries(sessionMap)) {
      if (v && Array.isArray(v.posts)) {
        memoryFeedCache.set(k, v);
        seedPostsIntoCache(v.posts);
      }
    }
  }

  if (!memoryFeedCache.has('all|all|')) {
    const localDefault = readStorageJson<CachedBlogFeed>(window.localStorage, LOCAL_DEFAULT_FEED_KEY);
    if (
      localDefault &&
      Array.isArray(localDefault.posts) &&
      localDefault.posts.length > 0 &&
      Date.now() - Number(localDefault.cachedAt || 0) < LOCAL_FEED_HARD_TTL_MS
    ) {
      memoryFeedCache.set('all|all|', localDefault);
      seedPostsIntoCache(localDefault.posts);
    }
  }
}

function hydrateSessionPostsOnce(): void {
  if (sessionPostsHydrated || typeof window === 'undefined') return;
  sessionPostsHydrated = true;

  const stored = readStorageJson<Record<string, { post: any; cachedAt: number }>>(
    window.sessionStorage,
    SESSION_POSTS_MAP_KEY
  );
  if (stored && typeof stored === 'object') {
    for (const [k, entry] of Object.entries(stored)) {
      if (entry?.post) {
        memoryPostCache.set(k, entry);
      }
    }
  }
}

function hydrateViewStateOnce(): void {
  if (sessionViewHydrated || typeof window === 'undefined') return;
  sessionViewHydrated = true;

  const stored = readStorageJson<BlogViewState>(window.sessionStorage, SESSION_VIEW_STATE_KEY);
  if (stored && typeof stored === 'object') {
    memoryViewState = {
      selectedGame: String(stored.selectedGame || 'all'),
      selectedCategory: String(stored.selectedCategory || 'all'),
      searchQuery: String(stored.searchQuery || ''),
      debouncedQuery: String(stored.debouncedQuery || ''),
      scrollY: Math.max(0, Number(stored.scrollY) || 0),
      anchorPostId: stored.anchorPostId ? String(stored.anchorPostId) : null,
      anchorViewportTop: Number(stored.anchorViewportTop) || 0,
      shouldRestoreOnReturn: Boolean(stored.shouldRestoreOnReturn),
      savedAt: Number(stored.savedAt) || 0,
    };
  }
}

export function seedPostsIntoCache(posts: any[]): void {
  if (!Array.isArray(posts) || posts.length === 0) return;
  hydrateSessionPostsOnce();
  const now = Date.now();
  for (const post of posts) {
    if (!post) continue;
    const keys = [post.slug, post.id].filter(Boolean).map(String);
    for (const k of keys) {
      if (memoryPostCache.size >= MAX_INDIVIDUAL_POSTS_CACHE && !memoryPostCache.has(k)) {
        const oldest = memoryPostCache.keys().next().value;
        if (oldest) memoryPostCache.delete(oldest);
      }
      memoryPostCache.set(k, { post, cachedAt: now });
    }
  }

  if (typeof window !== 'undefined') {
    const compact: Record<string, { post: any; cachedAt: number }> = {};
    let count = 0;
    for (const [k, v] of memoryPostCache.entries()) {
      compact[k] = v;
      count++;
      if (count >= 40) break;
    }
    writeStorageJson(window.sessionStorage, SESSION_POSTS_MAP_KEY, compact);
  }
}

export function getCachedBlogFeed(filterKey: string): CachedBlogFeed | null {
  hydrateSessionFeedsOnce();
  return memoryFeedCache.get(filterKey) || null;
}

export function setCachedBlogFeed(filterKey: string, data: Omit<CachedBlogFeed, 'cachedAt'>): void {
  hydrateSessionFeedsOnce();
  const entry: CachedBlogFeed = {
    posts: Array.isArray(data.posts) ? data.posts : [],
    total: Number(data.total ?? data.posts?.length ?? 0),
    hasMore: Boolean(data.hasMore),
    categories: Array.isArray(data.categories) ? data.categories : [],
    cachedAt: Date.now(),
  };

  memoryFeedCache.set(filterKey, entry);
  seedPostsIntoCache(entry.posts);

  if (typeof window !== 'undefined') {
    try {
      const sessionSnapshot: Record<string, CachedBlogFeed> = {};
      sessionSnapshot[filterKey] = {
        ...entry,
        posts: entry.posts.slice(0, MAX_SESSION_PERSISTED_POSTS),
      };
      let keysStored = 1;
      for (const [k, v] of memoryFeedCache.entries()) {
        if (k === filterKey) continue;
        sessionSnapshot[k] = {
          ...v,
          posts: v.posts.slice(0, MAX_LOCAL_PERSISTED_POSTS),
        };
        keysStored++;
        if (keysStored >= 4) break;
      }
      window.sessionStorage.setItem(SESSION_FEED_MAP_KEY, JSON.stringify(sessionSnapshot));
    } catch {
      // Fallback: save only the active filter key cleanly if storage quota is tight
      try {
        window.sessionStorage.setItem(
          SESSION_FEED_MAP_KEY,
          JSON.stringify({
            [filterKey]: {
              ...entry,
              posts: entry.posts.slice(0, MAX_SESSION_PERSISTED_POSTS),
            },
          })
        );
      } catch {
        // Ignore private mode / strict quota
      }
    }

    if (isDefaultFeedKey(filterKey) && entry.posts.length > 0) {
      writeStorageJson(window.localStorage, LOCAL_DEFAULT_FEED_KEY, {
        ...entry,
        posts: entry.posts.slice(0, MAX_LOCAL_PERSISTED_POSTS),
      });
    }
  }
}

export function getCachedBlogPost(slugOrId: string): { post: any; cachedAt: number } | null {
  hydrateSessionFeedsOnce();
  hydrateSessionPostsOnce();
  const exact = memoryPostCache.get(String(slugOrId));
  if (exact) return exact;

  for (const feed of memoryFeedCache.values()) {
    const found = feed.posts.find(
      (p) => String(p?.slug || '') === String(slugOrId) || String(p?.id || '') === String(slugOrId)
    );
    if (found) {
      const entry = { post: found, cachedAt: feed.cachedAt };
      memoryPostCache.set(String(slugOrId), entry);
      return entry;
    }
  }
  return null;
}

export function getCachedRelatedPosts(excludeSlugOrId: string, limit = 4): any[] {
  hydrateSessionFeedsOnce();
  const defaultFeed = memoryFeedCache.get('all|all|');
  const sourcePosts =
    defaultFeed?.posts && defaultFeed.posts.length > 0
      ? defaultFeed.posts
      : Array.from(memoryFeedCache.values())[0]?.posts || [];

  return sourcePosts
    .filter(
      (p) =>
        p &&
        String(p.slug || '') !== String(excludeSlugOrId) &&
        String(p.id || '') !== String(excludeSlugOrId)
    )
    .slice(0, limit);
}

export function getBlogViewState(): BlogViewState {
  hydrateViewStateOnce();
  return { ...memoryViewState };
}

export function updateBlogViewState(partial: Partial<BlogViewState>): void {
  hydrateViewStateOnce();
  memoryViewState = {
    ...memoryViewState,
    ...partial,
    savedAt: Date.now(),
  };
  if (typeof window !== 'undefined') {
    writeStorageJson(window.sessionStorage, SESSION_VIEW_STATE_KEY, memoryViewState);
  }
}

export function markBlogRestorePending(pending: boolean): void {
  updateBlogViewState({ shouldRestoreOnReturn: pending });
}

export function hasSavedBlogPosition(): boolean {
  hydrateViewStateOnce();
  return Boolean(memoryViewState.scrollY > 0 || memoryViewState.anchorPostId);
}

export function isBlogRestorePending(): boolean {
  hydrateViewStateOnce();
  return Boolean(memoryViewState.shouldRestoreOnReturn && hasSavedBlogPosition());
}

export function getSavedBlogScrollY(): number {
  hydrateViewStateOnce();
  return Math.max(0, Number(memoryViewState.scrollY) || 0);
}
