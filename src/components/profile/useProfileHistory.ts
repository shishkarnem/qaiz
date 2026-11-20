import { useState, useEffect, useCallback, useRef } from 'react';
import { safeParseResponseJson } from '../../utils/network/safeFetchJson';

export interface QuestionStatsSummary {
  total_questions: number;
  answered_count: number;
  correct_count: number;
  incorrect_count: number;
  accuracy_rate: number;
  total_shown: number;
  total_skipped: number;
}

export interface SessionsAggregateStats {
  totalCount: number;
  wins: number;
  losses: number;
  winRate: number;
  totalScore: number;
  avgScore: number;
  overallTotal: number;
  overallWins: number;
  byGame: { game_id: string | null; game_title: string | null; cnt: number }[];
  byDifficulty: { difficulty: string | null; cnt: number }[];
}

export const PACKS_BATCH_SIZE = 9;
export const PROGRESS_BATCH_SIZE = 9;
export const SESSIONS_PER_PAGE = 10;

interface UseProfileHistoryOptions {
  targetUid?: string;
  isHistoryTabActive: boolean;
}

export function useProfileHistory({ targetUid, isHistoryTabActive }: UseProfileHistoryOptions) {
  const [gameHistory, setGameHistory] = useState<any[]>([]);
  const [savedPacks, setSavedPacks] = useState<any[]>([]);
  const [gameProgressList, setGameProgressList] = useState<any[]>([]);

  const [packsTotalCount, setPacksTotalCount] = useState<number>(0);
  const [progressTotalCount, setProgressTotalCount] = useState<number>(0);
  const [sessionsTotalCount, setSessionsTotalCount] = useState<number>(0);

  const [hasMorePacks, setHasMorePacks] = useState<boolean>(false);
  const [hasMoreProgress, setHasMoreProgress] = useState<boolean>(false);

  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [loadingMorePacks, setLoadingMorePacks] = useState<boolean>(false);
  const [loadingMoreProgress, setLoadingMoreProgress] = useState<boolean>(false);
  const [loadingSessionsPage, setLoadingSessionsPage] = useState<boolean>(false);

  const [questionStats, setQuestionStats] = useState<QuestionStatsSummary>({
    total_questions: 0,
    answered_count: 0,
    correct_count: 0,
    incorrect_count: 0,
    accuracy_rate: 0,
    total_shown: 0,
    total_skipped: 0
  });

  const [sessionStats, setSessionStats] = useState<SessionsAggregateStats>({
    totalCount: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalScore: 0,
    avgScore: 0,
    overallTotal: 0,
    overallWins: 0,
    byGame: [],
    byDifficulty: []
  });

  const [gameStats, setGameStats] = useState<{ totalGames: number; wins: number }>({ totalGames: 0, wins: 0 });

  const [historySubTab, setHistorySubTab] = useState<'packs' | 'progress' | 'sessions'>('packs');
  const [historyGameFilter, setHistoryGameFilter] = useState<string>('all');
  const [historyModeFilter, setHistoryModeFilter] = useState<'all' | 'single' | 'multi'>('all');
  const [historyDifficultyFilter, setHistoryDifficultyFilter] = useState<string>('all');
  const [historyResultFilter, setHistoryResultFilter] = useState<'all' | 'win' | 'loss'>('all');
  const [sessionsPage, setSessionsPage] = useState<number>(1);
  const [historyTopicFilter, setHistoryTopicFilter] = useState<string>('');
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historySortBy, setHistorySortBy] = useState<'date' | 'title' | 'topic' | 'gameType'>('date');
  const [historySortOrder, setHistorySortOrder] = useState<'desc' | 'asc'>('desc');

  const abortRef = useRef<AbortController | null>(null);
  const packsSentinelRef = useRef<HTMLDivElement | null>(null);
  const progressSentinelRef = useRef<HTMLDivElement | null>(null);

  const buildFilterParams = useCallback(
    (includeResult: boolean = false) => {
      const qs = new URLSearchParams();
      if (targetUid) qs.set('user_id', targetUid);
      if (historyGameFilter && historyGameFilter !== 'all') qs.set('game_id', historyGameFilter);
      if (historyModeFilter && historyModeFilter !== 'all') qs.set('mode', historyModeFilter);
      if (historyDifficultyFilter && historyDifficultyFilter !== 'all' && historyGameFilter !== 'jeopardy') {
        qs.set('difficulty', historyDifficultyFilter);
      }
      if (includeResult && historyResultFilter && historyResultFilter !== 'all') {
        qs.set('result', historyResultFilter);
      }
      if (historyTopicFilter.trim()) qs.set('topic', historyTopicFilter.trim());
      if (historySearch.trim()) qs.set('q', historySearch.trim());
      qs.set('sort_by', historySortBy);
      qs.set('sort_order', historySortOrder);
      return qs;
    },
    [
      targetUid,
      historyGameFilter,
      historyModeFilter,
      historyDifficultyFilter,
      historyResultFilter,
      historyTopicFilter,
      historySearch,
      historySortBy,
      historySortOrder
    ]
  );

  // Fast lightweight overview wins count when not inside History tab yet
  useEffect(() => {
    if (!targetUid) return;
    if (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out) return;
    let cancelled = false;
    fetch(`/api/game_sessions?user_id=${encodeURIComponent(targetUid)}&limit=1&include_stats=1`)
      .then(r => (r.ok ? safeParseResponseJson<any>(r) : null))
      .then(json => {
        if (cancelled || !json?.stats) return;
        setGameStats({
          totalGames: Number(json.stats.overallTotal || 0),
          wins: Number(json.stats.overallWins || 0)
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [targetUid]);

  // Initial batch load for all 3 sub-tabs when History tab is active or filters change
  const fetchHistory = useCallback(async () => {
    if (!targetUid) return;
    if (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingHistory(true);
    setSessionsPage(1);

    try {
      const packsQs = buildFilterParams(false);
      packsQs.set('summary', '1');
      packsQs.set('limit', String(PACKS_BATCH_SIZE));
      packsQs.set('offset', '0');

      const progressQs = buildFilterParams(false);
      progressQs.set('summary', '1');
      progressQs.set('limit', String(PROGRESS_BATCH_SIZE));
      progressQs.set('offset', '0');

      const sessionsQs = buildFilterParams(true);
      sessionsQs.set('limit', String(SESSIONS_PER_PAGE));
      sessionsQs.set('offset', '0');
      sessionsQs.set('include_stats', '1');

      const statsQs = new URLSearchParams();
      statsQs.set('user_id', targetUid);
      if (historyGameFilter && historyGameFilter !== 'all') statsQs.set('game_id', historyGameFilter);

      const [packsRes, progressRes, sessionsRes, qStatsRes] = await Promise.all([
        fetch(`/api/game-packs?${packsQs.toString()}`, { signal: controller.signal })
          .then(r => (r.ok ? safeParseResponseJson<any>(r) : null))
          .catch(() => null),
        fetch(`/api/game_progress?${progressQs.toString()}`, { signal: controller.signal })
          .then(r => (r.ok ? safeParseResponseJson<any>(r) : null))
          .catch(() => null),
        fetch(`/api/game_sessions?${sessionsQs.toString()}`, { signal: controller.signal })
          .then(r => (r.ok ? safeParseResponseJson<any>(r) : null))
          .catch(() => null),
        fetch(`/api/generated-questions/stats?${statsQs.toString()}`, { signal: controller.signal })
          .then(r => (r.ok ? safeParseResponseJson<any>(r) : null))
          .catch(() => null)
      ]);

      if (controller.signal.aborted) return;

      const rawPacks = Array.isArray(packsRes?.data) ? packsRes.data : [];
      const seenPackIds = new Set<string>();
      const packs: any[] = [];
      for (const p of rawPacks) {
        if (!p.id || seenPackIds.has(p.id)) continue;
        seenPackIds.add(p.id);
        packs.push(p);
      }

      const progress = Array.isArray(progressRes?.data) ? progressRes.data : [];
      const rawSessions = Array.isArray(sessionsRes?.data) ? sessionsRes.data : [];

      setSavedPacks(packs);
      setPacksTotalCount(Number(packsRes?.totalCount ?? packs.length));
      setHasMorePacks(Boolean(packsRes?.hasMore));

      setGameProgressList(progress);
      setProgressTotalCount(Number(progressRes?.totalCount ?? progress.length));
      setHasMoreProgress(Boolean(progressRes?.hasMore));

      setGameHistory(rawSessions);
      setSessionsTotalCount(Number(sessionsRes?.totalCount ?? rawSessions.length));

      if (sessionsRes?.stats) {
        setSessionStats({
          totalCount: Number(sessionsRes.stats.totalCount || 0),
          wins: Number(sessionsRes.stats.wins || 0),
          losses: Number(sessionsRes.stats.losses || 0),
          winRate: Number(sessionsRes.stats.winRate || 0),
          totalScore: Number(sessionsRes.stats.totalScore || 0),
          avgScore: Number(sessionsRes.stats.avgScore || 0),
          overallTotal: Number(sessionsRes.stats.overallTotal || 0),
          overallWins: Number(sessionsRes.stats.overallWins || 0),
          byGame: Array.isArray(sessionsRes.stats.byGame) ? sessionsRes.stats.byGame : [],
          byDifficulty: Array.isArray(sessionsRes.stats.byDifficulty) ? sessionsRes.stats.byDifficulty : []
        });
        setGameStats({
          totalGames: Number(sessionsRes.stats.overallTotal || 0),
          wins: Number(sessionsRes.stats.overallWins || 0)
        });
      }

      if (qStatsRes?.data) {
        setQuestionStats(qStatsRes.data);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Error fetching game history:', err);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingHistory(false);
      }
    }
  }, [targetUid, buildFilterParams, historyGameFilter]);

  useEffect(() => {
    if (!targetUid || !isHistoryTabActive) return;
    const delay = historySearch.trim() || historyTopicFilter.trim() ? 220 : 0;
    const timer = setTimeout(() => {
      fetchHistory();
    }, delay);
    return () => {
      clearTimeout(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [targetUid, isHistoryTabActive, fetchHistory, historySearch, historyTopicFilter]);

  const loadMorePacks = useCallback(async () => {
    if (!targetUid || loadingHistory || loadingMorePacks || !hasMorePacks) return;
    setLoadingMorePacks(true);
    try {
      const qs = buildFilterParams(false);
      qs.set('summary', '1');
      qs.set('limit', String(PACKS_BATCH_SIZE));
      qs.set('offset', String(savedPacks.length));

      const res = await fetch(`/api/game-packs?${qs.toString()}`);
      const json = res.ok ? await safeParseResponseJson<any>(res) : null;
      const incoming = Array.isArray(json?.data) ? json.data : [];

      setSavedPacks(prev => {
        const seen = new Set(prev.map(p => p.id));
        const next = [...prev];
        for (const item of incoming) {
          if (item?.id && !seen.has(item.id)) {
            seen.add(item.id);
            next.push(item);
          }
        }
        return next;
      });
      if (json?.totalCount !== undefined) setPacksTotalCount(Number(json.totalCount));
      setHasMorePacks(Boolean(json?.hasMore) && incoming.length > 0);
    } catch (err) {
      console.error('Error loading more packs:', err);
    } finally {
      setLoadingMorePacks(false);
    }
  }, [targetUid, loadingHistory, loadingMorePacks, hasMorePacks, buildFilterParams, savedPacks.length]);

  const loadMoreProgress = useCallback(async () => {
    if (!targetUid || loadingHistory || loadingMoreProgress || !hasMoreProgress) return;
    setLoadingMoreProgress(true);
    try {
      const qs = buildFilterParams(false);
      qs.set('summary', '1');
      qs.set('limit', String(PROGRESS_BATCH_SIZE));
      qs.set('offset', String(gameProgressList.length));

      const res = await fetch(`/api/game_progress?${qs.toString()}`);
      const json = res.ok ? await safeParseResponseJson<any>(res) : null;
      const incoming = Array.isArray(json?.data) ? json.data : [];

      setGameProgressList(prev => {
        const seen = new Set(prev.map(p => p.id || p.pack_id));
        const next = [...prev];
        for (const item of incoming) {
          const key = item?.id || item?.pack_id;
          if (key && !seen.has(key)) {
            seen.add(key);
            next.push(item);
          }
        }
        return next;
      });
      if (json?.totalCount !== undefined) setProgressTotalCount(Number(json.totalCount));
      setHasMoreProgress(Boolean(json?.hasMore) && incoming.length > 0);
    } catch (err) {
      console.error('Error loading more progress:', err);
    } finally {
      setLoadingMoreProgress(false);
    }
  }, [targetUid, loadingHistory, loadingMoreProgress, hasMoreProgress, buildFilterParams, gameProgressList.length]);

  const goToSessionsPage = useCallback(
    async (nextPage: number) => {
      if (!targetUid || loadingSessionsPage) return;
      const totalPages = Math.max(1, Math.ceil(sessionsTotalCount / SESSIONS_PER_PAGE));
      const clampedPage = Math.max(1, Math.min(totalPages, nextPage));
      setSessionsPage(clampedPage);
      setLoadingSessionsPage(true);
      try {
        const qs = buildFilterParams(true);
        qs.set('limit', String(SESSIONS_PER_PAGE));
        qs.set('offset', String((clampedPage - 1) * SESSIONS_PER_PAGE));

        const res = await fetch(`/api/game_sessions?${qs.toString()}`);
        const json = res.ok ? await safeParseResponseJson<any>(res) : null;
        if (Array.isArray(json?.data)) {
          setGameHistory(json.data);
          if (json.totalCount !== undefined) setSessionsTotalCount(Number(json.totalCount));
        }
      } catch (err) {
        console.error('Error fetching sessions page:', err);
      } finally {
        setLoadingSessionsPage(false);
      }
    },
    [targetUid, loadingSessionsPage, sessionsTotalCount, buildFilterParams]
  );

  // Auto-load next batch when scrolling down to the sentinel in Packs sub-tab
  useEffect(() => {
    if (!isHistoryTabActive || historySubTab !== 'packs' || !hasMorePacks || loadingHistory || loadingMorePacks) {
      return;
    }
    const el = packsSentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) {
          loadMorePacks();
        }
      },
      { rootMargin: '260px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isHistoryTabActive, historySubTab, hasMorePacks, loadingHistory, loadingMorePacks, loadMorePacks]);

  // Auto-load next batch when scrolling down to the sentinel in Progress sub-tab
  useEffect(() => {
    if (!isHistoryTabActive || historySubTab !== 'progress' || !hasMoreProgress || loadingHistory || loadingMoreProgress) {
      return;
    }
    const el = progressSentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) {
          loadMoreProgress();
        }
      },
      { rootMargin: '260px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isHistoryTabActive, historySubTab, hasMoreProgress, loadingHistory, loadingMoreProgress, loadMoreProgress]);

  return {
    gameHistory,
    setGameHistory,
    savedPacks,
    setSavedPacks,
    gameProgressList,
    setGameProgressList,
    packsTotalCount,
    progressTotalCount,
    sessionsTotalCount,
    hasMorePacks,
    hasMoreProgress,
    loadingHistory,
    loadingMorePacks,
    loadingMoreProgress,
    loadingSessionsPage,
    questionStats,
    sessionStats,
    gameStats,
    historySubTab,
    setHistorySubTab,
    historyGameFilter,
    setHistoryGameFilter,
    historyModeFilter,
    setHistoryModeFilter,
    historyDifficultyFilter,
    setHistoryDifficultyFilter,
    historyResultFilter,
    setHistoryResultFilter,
    sessionsPage,
    setSessionsPage,
    historyTopicFilter,
    setHistoryTopicFilter,
    historySearch,
    setHistorySearch,
    historySortBy,
    setHistorySortBy,
    historySortOrder,
    setHistorySortOrder,
    fetchHistory,
    loadMorePacks,
    loadMoreProgress,
    goToSessionsPage,
    packsSentinelRef,
    progressSentinelRef
  };
}
