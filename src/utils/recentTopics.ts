const STORAGE_KEY = 'qaiz_recent_topics';

/**
 * Get recent topics array from local storage (most recent first)
 */
export function getRecentTopics(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(t => typeof t === 'string' && t.trim().length > 0) : [];
  } catch {
    return [];
  }
}

/**
 * Record one or more topics as recently chosen
 */
export function addRecentTopic(topicInput: string | string[]): void {
  try {
    const current = getRecentTopics();
    const toAdd: string[] = [];

    if (Array.isArray(topicInput)) {
      topicInput.forEach(t => {
        if (typeof t === 'string' && t.trim()) {
          t.split(',').forEach(sub => {
            const clean = sub.trim();
            if (clean) toAdd.push(clean);
          });
        }
      });
    } else if (typeof topicInput === 'string' && topicInput.trim()) {
      topicInput.split(',').forEach(sub => {
        const clean = sub.trim();
        if (clean) toAdd.push(clean);
      });
    }

    if (toAdd.length === 0) return;

    // Filter out duplicates, maintaining newly added at the top
    const updated: string[] = [];
    const seen = new Set<string>();

    for (const t of toAdd) {
      const lower = t.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        updated.push(t);
      }
    }

    for (const t of current) {
      const lower = t.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        updated.push(t);
      }
    }

    // Keep up to 50 recent topics
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(0, 50)));
  } catch (err) {
    console.warn('Failed to save recent topic to localStorage:', err);
  }
}

/**
 * Sort a list of topic names with recent topics first (in recency order),
 * followed by all other topics in Russian/English alphabetical order.
 */
export function sortTopicsWithRecent(
  allTopics: string[],
  serverRecentTopics?: string[]
): string[] {
  if (!allTopics || allTopics.length === 0) return [];

  // Combine local and server recent topics, preserving recency order
  const localRecents = getRecentTopics();
  const recentOrderMap = new Map<string, number>();

  let rank = 0;
  // Local recents have highest recency priority
  localRecents.forEach(t => {
    const lower = t.trim().toLowerCase();
    if (!recentOrderMap.has(lower)) {
      recentOrderMap.set(lower, rank++);
    }
  });

  // Server recents follow
  if (Array.isArray(serverRecentTopics)) {
    serverRecentTopics.forEach(t => {
      const lower = t.trim().toLowerCase();
      if (!recentOrderMap.has(lower)) {
        recentOrderMap.set(lower, rank++);
      }
    });
  }

  // Deduplicate and trim input topics
  const uniqueTopics = Array.from(new Set(allTopics.map(t => t.trim()).filter(Boolean)));

  return uniqueTopics.sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();

    const aRank = recentOrderMap.has(aLower) ? recentOrderMap.get(aLower)! : -1;
    const bRank = recentOrderMap.has(bLower) ? recentOrderMap.get(bLower)! : -1;

    if (aRank !== -1 && bRank !== -1) {
      return aRank - bRank;
    }
    if (aRank !== -1) return -1;
    if (bRank !== -1) return 1;

    // Alphabetical order for the rest
    return a.localeCompare(b, 'ru', { sensitivity: 'base' });
  });
}
