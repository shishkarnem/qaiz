import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Share2,
  Calendar,
  User,
  Loader2,
  BookOpen,
  Play,
  Sparkles,
  Search,
  Clock,
  Check,
  ExternalLink,
  ChevronDown,
  Layers,
  Pin,
} from 'lucide-react';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import {
  sanitizeBlogUrl,
  isVideoMediaUrl,
  normalizeDisplayCaps,
} from '../components/blog/urlSafety';

const INITIAL_BATCH_LIMIT = 20;
const SCROLL_BATCH_LIMIT = 10;

const GAME_FILTERS = [
  { id: 'all', label: 'Все статьи' },
  { id: 'blitz', label: 'КвИИз (Блиц)' },
  { id: 'millionaire', label: 'Квиллионер' },
  { id: '100to1', label: 'Сто Квадному (100 к 1)' },
  { id: 'whatwherewhen', label: 'Что? Где? Квада? (ЧГК)' },
  { id: 'jeopardy', label: 'Своя Икра (SI Game)' },
];

const PRIORITY_GAME_IDS = ['blitz', 'millionaire', '100to1', 'whatwherewhen', 'jeopardy'];

const GAME_META: Record<string, { title: string; route: string; badge: string }> = {
  blitz: { title: 'КвИИз', route: '/?start_game=blitz', badge: 'Скоростной ИИ-спринт' },
  millionaire: { title: 'Квиллионер', route: '/?start_game=millionaire', badge: '15 шагов к вершине' },
  '100to1': { title: 'Сто Квадному', route: '/?start_game=100to1', badge: 'Народный опрос 100 к 1' },
  whatwherewhen: { title: 'Что? Где? Квада?', route: '/?start_game=whatwherewhen', badge: 'Элитарный клуб знатоков' },
  jeopardy: { title: 'Своя Икра', route: '/?start_game=jeopardy', badge: 'Аналог Своей Игры и SI Game' },
};

const COMIC_PANEL_PRESETS = [
  {
    radius: 'rounded-[2.4rem_0.8rem_2.1rem_0.9rem]',
    transform: 'lg:-rotate-[0.35deg]',
    borderStyle: 'border-2 border-primary/45 shadow-[6px_6px_0px_rgba(153,208,55,0.18)]',
    mediaHeightLeft: 'h-64 sm:h-96',
    mediaHeightRight: 'h-48 sm:h-60',
    padLeft: 'p-5 sm:p-8',
    padRight: 'p-5 sm:p-6',
    cornerAccent: 'top-0 left-0 w-24 h-24 border-t-4 border-l-4 border-primary/60 rounded-tl-[2.2rem]',
  },
  {
    radius: 'rounded-[0.9rem_2.5rem_0.8rem_2.3rem]',
    transform: 'lg:rotate-[0.4deg]',
    borderStyle: 'border-2 border-primary/40 shadow-[-6px_7px_0px_rgba(153,208,55,0.16)]',
    mediaHeightLeft: 'h-60 sm:h-80',
    mediaHeightRight: 'h-52 sm:h-68',
    padLeft: 'p-5 sm:p-8',
    padRight: 'p-5 sm:p-7',
    cornerAccent: 'top-0 right-0 w-28 h-20 border-t-4 border-r-4 border-primary/60 rounded-tr-[2.3rem]',
  },
  {
    radius: 'rounded-[2.1rem_1.2rem_0.9rem_2.6rem]',
    transform: 'lg:rotate-[0.3deg]',
    borderStyle: 'border-2 border-primary/50 shadow-[7px_-5px_0px_rgba(153,208,55,0.2)]',
    mediaHeightLeft: 'h-68 sm:h-[420px]',
    mediaHeightRight: 'h-44 sm:h-56',
    padLeft: 'p-6 sm:p-9',
    padRight: 'p-5 sm:p-6',
    cornerAccent: 'bottom-0 left-0 w-28 h-24 border-b-4 border-l-4 border-primary/60 rounded-bl-[2.4rem]',
  },
  {
    radius: 'rounded-[1.1rem_2.2rem_2.5rem_0.8rem]',
    transform: 'lg:-rotate-[0.45deg]',
    borderStyle: 'border-2 border-primary/35 shadow-[-5px_-6px_0px_rgba(153,208,55,0.15)]',
    mediaHeightLeft: 'h-56 sm:h-76',
    mediaHeightRight: 'h-56 sm:h-72',
    padLeft: 'p-5 sm:p-8',
    padRight: 'p-5 sm:p-7',
    cornerAccent: 'bottom-0 right-0 w-24 h-24 border-b-4 border-r-4 border-primary/60 rounded-br-[2.3rem]',
  },
  {
    radius: 'rounded-[2.6rem_0.9rem_1.4rem_2.2rem]',
    transform: 'lg:rotate-[0.35deg]',
    borderStyle: 'border-2 border-primary/45 shadow-[8px_5px_0px_rgba(153,208,55,0.18)]',
    mediaHeightLeft: 'h-64 sm:h-88',
    mediaHeightRight: 'h-48 sm:h-64',
    padLeft: 'p-5 sm:p-8',
    padRight: 'p-5 sm:p-6',
    cornerAccent: 'top-0 left-0 w-32 h-16 border-t-4 border-l-4 border-primary/65 rounded-tl-[2.4rem]',
  },
];

interface CategoryStat {
  category: string;
  cnt: number;
}

export function BlogPage() {
  const navigate = useNavigate();

  const [posts, setPosts] = useState<any[]>([]);
  const [totalPosts, setTotalPosts] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const isFetchingMoreRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktopLayout(e.matches);
    setIsDesktopLayout(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Debounce search input to optimize server queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchBatch = useCallback(
    async (opts: { offset: number; limit: number; append: boolean }) => {
      if (opts.append && isFetchingMoreRef.current) return;
      if (!opts.append && activeAbortRef.current) {
        activeAbortRef.current.abort();
      }

      const controller = new AbortController();
      if (!opts.append) {
        activeAbortRef.current = controller;
        setInitialLoading(true);
      } else {
        isFetchingMoreRef.current = true;
        setLoadingMore(true);
      }

      try {
        const params = new URLSearchParams();
        params.set('limit', String(opts.limit));
        params.set('offset', String(opts.offset));
        if (selectedGame && selectedGame !== 'all') {
          params.set('game_id', selectedGame);
        }
        if (selectedCategory && selectedCategory !== 'all') {
          params.set('category', selectedCategory);
        }
        if (debouncedQuery) {
          params.set('q', debouncedQuery);
        }

        const res = await fetch(`/api/posts?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const incoming: any[] = Array.isArray(json.data) ? json.data : [];
        if (opts.append) {
          setPosts((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const uniqueNew = incoming.filter((item) => !existingIds.has(item.id));
            return [...prev, ...uniqueNew];
          });
        } else {
          setPosts(incoming);
        }

        setTotalPosts(Number(json.total ?? incoming.length));
        setHasMore(Boolean(json.hasMore));
        if (Array.isArray(json.categories)) {
          setCategories(json.categories);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Error fetching blog batch:', err);
        }
      } finally {
        if (!opts.append) {
          setInitialLoading(false);
        } else {
          isFetchingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    [selectedGame, selectedCategory, debouncedQuery]
  );

  // Initial load & filter changes -> max 20 items per initial page load
  useEffect(() => {
    fetchBatch({ offset: 0, limit: INITIAL_BATCH_LIMIT, append: false });
    return () => {
      activeAbortRef.current?.abort();
    };
  }, [fetchBatch]);

  const handleLoadNextBatch = useCallback(() => {
    if (!hasMore || initialLoading || loadingMore || isFetchingMoreRef.current) return;
    fetchBatch({
      offset: posts.length,
      limit: SCROLL_BATCH_LIMIT,
      append: true,
    });
  }, [hasMore, initialLoading, loadingMore, posts.length, fetchBatch]);

  // Smooth infinite scroll observer: loads next 10 articles cleanly before user reaches footer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || initialLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          handleLoadNextBatch();
        }
      },
      { rootMargin: '420px 0px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, initialLoading, handleLoadNextBatch]);

  // SEO Meta & Structured Data for Blog Index
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Блог КвИИз и SAV AI — ИИ-новости, кейсы и энциклопедия викторин';

    const scriptId = 'qaiz-blog-index-jsonld';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = scriptId;
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }

    const blogSchema = {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Блог платформы КвИИз и SAV AI',
      description:
        'Актуальные материалы по искусственному интеллекту, автоматизации бизнеса от SAV AI и подробные руководства по интеллектуальным викторинам КвИИз.',
      url: `${window.location.origin}/blog`,
      blogPost: posts.slice(0, 20).map((p) => ({
        '@type': 'TechArticle',
        headline: normalizeDisplayCaps(p.title),
        description: normalizeDisplayCaps(p.seo_description || p.excerpt || ''),
        url: `${window.location.origin}/blog/${p.slug || p.id}`,
        datePublished: p.published_at || p.created_at,
      })),
    };

    scriptEl.textContent = JSON.stringify(blogSchema);

    return () => {
      document.title = prevTitle;
      const existing = document.getElementById(scriptId);
      if (existing) existing.remove();
    };
  }, [posts]);

  const handleSharePost = (post: any) => {
    const postUrl = `${window.location.origin}/blog/${post.slug || post.id}`;
    const displayTitle = normalizeDisplayCaps(post.title);
    if (navigator.share) {
      navigator
        .share({
          title: displayTitle,
          text: normalizeDisplayCaps(post.excerpt || post.seo_description || displayTitle),
          url: postUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(postUrl);
      setCopiedId(post.id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  const leftColumnPosts = posts.filter((_, idx) => idx % 2 === 0);
  const rightColumnPosts = posts.filter((_, idx) => idx % 2 === 1);

  const renderComicPostCard = (post: any, globalIdx: number, columnSide: 'left' | 'right') => {
    const isGamePost = Boolean(post.game_id && GAME_META[post.game_id]);
    const gameMeta = isGamePost ? GAME_META[post.game_id] : null;
    const displayTitle = normalizeDisplayCaps(post.title);
    const displayExcerpt = normalizeDisplayCaps(post.excerpt);
    const categoryLabel = gameMeta
      ? `${gameMeta.title} • ${gameMeta.badge}`
      : normalizeDisplayCaps(post.category || 'SAV AI • ИИ-кейсы и новости');

    const charCount = (post.content || '').length;
    const readingMinutes = Math.max(1, Number(post.reading_time) || Math.ceil(charCount / 1100));
    const postSlugOrId = post.slug || post.id;
    const preset = COMIC_PANEL_PRESETS[globalIdx % COMIC_PANEL_PRESETS.length];
    const isLeft = columnSide === 'left';

    const coverVideoUrl = sanitizeBlogUrl(post.cover_video_url);
    const rawCoverImage = sanitizeBlogUrl(post.cover_image_url || post.image_url);
    const coverImageUrl = rawCoverImage && !isVideoMediaUrl(rawCoverImage) ? rawCoverImage : '';
    const hasCardMedia = Boolean(coverVideoUrl || coverImageUrl);
    const telegramUrl = sanitizeBlogUrl(post.telegram_post_url || post.source_url);
    const publishedDate = new Date(post.published_at || post.created_at || Date.now()).toLocaleDateString('ru-RU');
    const priorityRank = !post.external_id ? PRIORITY_GAME_IDS.indexOf(String(post.game_id || '')) + 1 : 0;
    const isPinnedPost = Number(post.is_pinned || 0) === 1;

    return (
      <motion.article
        key={`blog-post-${post.id || globalIdx}`}
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.34,
          delay: Math.min((globalIdx % SCROLL_BATCH_LIMIT) * 0.04, 0.28),
          ease: [0.22, 1, 0.36, 1],
        }}
        whileHover={{ y: -3 }}
        className={`relative overflow-hidden bg-transparent backdrop-blur-2xl transition-colors duration-300 hover:border-primary/80 ${preset.radius} ${preset.borderStyle} ${preset.transform} ${
          isLeft ? 'lg:mr-1' : 'lg:ml-1'
        }`}
      >
        <div className={`pointer-events-none absolute z-20 ${preset.cornerAccent}`} />

        {hasCardMedia && (
          <Link
            to={`/blog/${postSlugOrId}`}
            className={`block relative w-full ${
              isLeft ? preset.mediaHeightLeft : preset.mediaHeightRight
            } overflow-hidden border-b-2 border-primary/30 group`}
          >
            {coverVideoUrl ? (
              <video
                src={coverVideoUrl}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                className="w-full h-full object-cover object-center block"
              />
            ) : (
              <img
                src={coverImageUrl}
                alt={displayTitle}
                loading="lazy"
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 block"
                referrerPolicy="no-referrer"
              />
            )}

            <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
              <BubbleElement
                isBadge
                active
                size="sm"
                icon={<Sparkles size={14} />}
                className="max-w-full whitespace-normal"
              >
                {categoryLabel}
              </BubbleElement>
              <div className="flex flex-wrap items-center gap-1.5">
                {priorityRank > 0 && (
                  <BubbleElement isBadge active size="sm" icon={<Pin size={13} />}>
                    Топ #{priorityRank}
                  </BubbleElement>
                )}
                {priorityRank === 0 && isPinnedPost && (
                  <BubbleElement isBadge active size="sm" icon={<Pin size={13} />}>
                    Закреплено
                  </BubbleElement>
                )}
                <BubbleElement isBadge size="sm">
                  Выпуск #{globalIdx + 1}
                </BubbleElement>
              </div>
            </div>
          </Link>
        )}

        <div className={`${isLeft ? preset.padLeft : preset.padRight} space-y-4 min-w-0`}>
          {!hasCardMedia && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <BubbleElement
                isBadge
                active
                size="sm"
                icon={<Sparkles size={14} />}
                className="max-w-full whitespace-normal"
              >
                {categoryLabel}
              </BubbleElement>
              <div className="flex flex-wrap items-center gap-1.5">
                {priorityRank > 0 && (
                  <BubbleElement isBadge active size="sm" icon={<Pin size={13} />}>
                    Топ #{priorityRank}
                  </BubbleElement>
                )}
                {priorityRank === 0 && isPinnedPost && (
                  <BubbleElement isBadge active size="sm" icon={<Pin size={13} />}>
                    Закреплено
                  </BubbleElement>
                )}
                <BubbleElement isBadge size="sm">
                  Выпуск #{globalIdx + 1}
                </BubbleElement>
              </div>
            </div>
          )}

          {/* Meta badges */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/80">
            <BubbleElement isBadge size="sm" icon={<Calendar size={14} />}>
              {publishedDate}
            </BubbleElement>
            <BubbleElement isBadge size="sm" icon={<User size={14} />} className="max-w-full whitespace-normal">
              {post.author_name || 'Редакция КвИИз'}
            </BubbleElement>
            <BubbleElement isBadge size="sm" icon={<Clock size={14} />}>
              ~{readingMinutes} мин
            </BubbleElement>
          </div>

          {/* Title */}
          <Link to={`/blog/${postSlugOrId}`} className="no-underline block group">
            <h2
              className={`${
                isLeft ? 'text-xl sm:text-3xl' : 'text-lg sm:text-2xl'
              } font-black text-foreground group-hover:text-primary transition-colors leading-snug break-words`}
            >
              {displayTitle}
            </h2>
          </Link>

          {/* Excerpt */}
          {displayExcerpt && (
            <p
              className={`${
                isLeft ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
              } text-foreground/85 leading-relaxed break-words line-clamp-4`}
            >
              {displayExcerpt}
            </p>
          )}

          {/* Actions Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/20 pt-4">
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <LeafButton
                variant="primary"
                size="sm"
                onClick={() => navigate(`/blog/${postSlugOrId}`)}
                icon={<BookOpen size={15} />}
              >
                Открыть статью полностью
              </LeafButton>

              {gameMeta ? (
                <LeafButton
                  variant="glass"
                  size="sm"
                  onClick={() => navigate(gameMeta.route)}
                  icon={<Play size={15} />}
                >
                  Играть в «{gameMeta.title}»
                </LeafButton>
              ) : (
                telegramUrl && (
                  <a
                    href={telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-underline max-w-full"
                  >
                    <BubbleElement
                      as="div"
                      size="sm"
                      icon={<ExternalLink size={14} />}
                      className="max-w-full whitespace-normal"
                    >
                      Оригинал в Telegram
                    </BubbleElement>
                  </a>
                )
              )}
            </div>

            <BubbleElement
              as="button"
              type="button"
              size="sm"
              onClick={() => handleSharePost(post)}
              icon={copiedId === post.id ? <Check size={14} /> : <Share2 size={14} />}
            >
              {copiedId === post.id ? 'Ссылка скопирована' : 'Поделиться'}
            </BubbleElement>
          </div>
        </div>
      </motion.article>
    );
  };

  return (
    <div className="w-full max-w-none py-4 pb-24 space-y-6">
      {/* Hidden SEO Heading & Summary */}
      <div className="sr-only">
        <h1>Блог интеллектуальных ИИ-викторин КвИИз и новостей SAV AI</h1>
        <p>
          Подборки кейсов автоматизации бизнеса от SAV AI, обзоры нейросетей и подробные гайды по 5 интеллектуальным викторинам КвИИз.
        </p>
      </div>

      {/* Search & Filter Liquid Glass Bar */}
      <div className="rounded-[2rem_0.9rem_2.2rem_1rem] border-2 border-primary/35 bg-transparent backdrop-blur-2xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/70 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по статьям, кейсам SAV AI, играм и ключевым темам..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:border-primary transition-all"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <BubbleElement isBadge size="sm" icon={<Layers size={14} />}>
              Показано {posts.length} из {totalPosts}
            </BubbleElement>

            <div className="md:hidden">
              <BubbleElement
                as="button"
                type="button"
                size="sm"
                active={mobileFiltersOpen}
                onClick={() => setMobileFiltersOpen((prev) => !prev)}
                icon={<ChevronDown size={15} className={`transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} />}
              >
                Фильтры
              </BubbleElement>
            </div>
          </div>
        </div>

        {/* Filter Bubbles (collapsible on mobile, wrapping cleanly with zero horizontal scrollbars) */}
        <div className={`${mobileFiltersOpen ? 'block' : 'hidden'} md:block space-y-3 pt-1`}>
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-sm font-semibold text-foreground/75">Рубрики статей:</div>
              <div className="flex flex-wrap gap-2">
                <BubbleElement
                  as="button"
                  type="button"
                  active={selectedCategory === 'all'}
                  size="sm"
                  onClick={() => setSelectedCategory('all')}
                >
                  Все рубрики
                </BubbleElement>
                {categories.map((cat) => (
                  <BubbleElement
                    key={`cat-${cat.category}`}
                    as="button"
                    type="button"
                    active={selectedCategory === cat.category}
                    size="sm"
                    onClick={() => setSelectedCategory(cat.category)}
                    className="max-w-full whitespace-normal"
                  >
                    {normalizeDisplayCaps(cat.category)} ({cat.cnt})
                  </BubbleElement>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="text-sm font-semibold text-foreground/75">Разделы игр платформы:</div>
            <div className="flex flex-wrap gap-2">
              {GAME_FILTERS.map((gf) => (
                <BubbleElement
                  key={gf.id}
                  as="button"
                  type="button"
                  active={selectedGame === gf.id}
                  size="sm"
                  onClick={() => setSelectedGame(gf.id)}
                  className="max-w-full whitespace-normal"
                >
                  {gf.label}
                </BubbleElement>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {initialLoading ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 text-base font-medium text-foreground/80">
            Загрузка первой подборки статей...
          </p>
        </div>
      ) : posts.length > 0 ? (
        <>
          {isDesktopLayout ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-start w-full">
              <div className="lg:col-span-7 xl:col-span-7 space-y-7 xl:space-y-9 min-w-0">
                {leftColumnPosts.map((post, idx) => renderComicPostCard(post, idx * 2, 'left'))}
              </div>

              <div className="lg:col-span-5 xl:col-span-5 space-y-6 xl:space-y-8 lg:mt-8 min-w-0">
                {rightColumnPosts.map((post, idx) => renderComicPostCard(post, idx * 2 + 1, 'right'))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 w-full">
              {posts.map((post, idx) =>
                renderComicPostCard(post, idx, idx % 2 === 0 ? 'left' : 'right')
              )}
            </div>
          )}

          {/* Infinite Scroll Sentinel & Load More Fallback */}
          <div ref={sentinelRef} className="pt-4 flex flex-col items-center justify-center gap-3 text-center">
            {loadingMore && (
              <div className="inline-flex items-center gap-2.5 rounded-full border border-primary/35 bg-transparent backdrop-blur-xl px-5 py-2.5 text-sm font-semibold text-primary">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Подгружаем следующие 10 статей...</span>
              </div>
            )}

            {hasMore && !loadingMore && (
              <LeafButton
                variant="glass"
                size="md"
                onClick={handleLoadNextBatch}
                icon={<Sparkles size={16} />}
              >
                Загрузить ещё 10 статей (осталось {Math.max(0, totalPosts - posts.length)})
              </LeafButton>
            )}

            {!hasMore && totalPosts > 0 && (
              <BubbleElement isBadge size="sm">
                Показаны все {posts.length} статей
              </BubbleElement>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-foreground/75 text-base rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-8 space-y-4">
          <p>По выбранному фильтру или поисковому запросу статей пока не найдено.</p>
          <div className="flex justify-center">
            <LeafButton
              variant="glass"
              size="sm"
              onClick={() => {
                setSelectedGame('all');
                setSelectedCategory('all');
                setSearchQuery('');
              }}
            >
              Сбросить фильтры
            </LeafButton>
          </div>
        </div>
      )}
    </div>
  );
}
