import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';
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
  Check
} from 'lucide-react';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';

const GAME_FILTERS = [
  { id: 'all', label: 'Все статьи блога' },
  { id: 'blitz', label: 'КвИИз (Блиц)' },
  { id: 'millionaire', label: 'Квиллионер' },
  { id: '100to1', label: 'Сто Квадному (100 к 1)' },
  { id: 'whatwherewhen', label: 'Что? Где? Квада? (ЧГК)' },
  { id: 'jeopardy', label: 'Своя Икра (SI Game)' }
];

const GAME_META: Record<string, { title: string; route: string; badge: string }> = {
  blitz: { title: 'КвИИз', route: '/?start_game=blitz', badge: 'Скоростной ИИ-спринт' },
  millionaire: { title: 'Квиллионер', route: '/?start_game=millionaire', badge: '15 шагов к вершине' },
  '100to1': { title: 'Сто Квадному', route: '/?start_game=100to1', badge: 'Народный опрос 100 к 1' },
  whatwherewhen: { title: 'Что? Где? Квада?', route: '/?start_game=whatwherewhen', badge: 'Элитарный клуб знатоков' },
  jeopardy: { title: 'Своя Икра', route: '/?start_game=jeopardy', badge: 'Аналог Своей Игры и SI Game' }
};

export function BlogPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';

  useEffect(() => {
    fetchPosts();
  }, []);

  // SEO Meta & Structured Data for Blog Index
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Блог и энциклопедия ИИ-викторин — КвИИз, Своя Икра (SI Game), Квиллионер, Сто Квадному, ЧГК';

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
      name: 'Блог платформы интеллектуальных ИИ-викторин КвИИз',
      description:
        'Подробные гайды, правила, стратегии победы и обзоры онлайн-викторин с нейросетью: Своя Икра (аналог Своей Игры и SI Game Владимира Хиля), Квиллионер, Сто Квадному (100 к 1), Что? Где? Квада? и КвИИз.',
      url: `${window.location.origin}/blog`,
      blogPost: posts.map(p => ({
        '@type': 'BlogPosting',
        headline: p.title,
        description: p.seo_description || p.excerpt || '',
        url: `${window.location.origin}/blog/${p.slug || p.id}`,
        datePublished: p.created_at
      }))
    };

    scriptEl.textContent = JSON.stringify(blogSchema);

    return () => {
      document.title = prevTitle;
      const existing = document.getElementById(scriptId);
      if (existing) existing.remove();
    };
  }, [posts]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/posts');
      const json = await res.json();
      setPosts(Array.isArray(json.data) ? json.data : []);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      if (selectedGame !== 'all' && p.game_id !== selectedGame) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${p.title || ''} ${p.excerpt || ''} ${p.seo_keywords || ''} ${p.content || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [posts, selectedGame, searchQuery]);

  const handleSharePost = (post: any) => {
    const postUrl = `${window.location.origin}/blog/${post.slug || post.id}`;
    if (navigator.share) {
      navigator
        .share({
          title: post.title,
          text: post.excerpt || post.seo_description || post.title,
          url: postUrl
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(postUrl);
      setCopiedId(post.id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-base font-medium text-foreground/75">Загрузка статей блога...</p>
      </div>
    );
  }

  // Asymmetric comic-panel style presets: varied outer container sizes, image heights, and border directions
  const COMIC_PANEL_PRESETS = [
    {
      radius: 'rounded-[2.4rem_0.8rem_2.1rem_0.9rem]',
      innerAccent: 'rounded-[2.2rem_0.6rem_1.9rem_0.7rem]',
      transform: 'lg:-rotate-[0.45deg]',
      borderStyle: 'border-2 border-primary/45 shadow-[6px_6px_0px_rgba(153,208,55,0.18)]',
      imgHeightLeft: 'h-64 sm:h-96',
      imgHeightRight: 'h-48 sm:h-60',
      padLeft: 'p-6 sm:p-9',
      padRight: 'p-5 sm:p-6',
      cornerAccent: 'top-0 left-0 w-24 h-24 border-t-4 border-l-4 border-primary/60 rounded-tl-[2.2rem]'
    },
    {
      radius: 'rounded-[0.9rem_2.5rem_0.8rem_2.3rem]',
      innerAccent: 'rounded-[0.7rem_2.3rem_0.6rem_2.1rem]',
      transform: 'lg:rotate-[0.55deg]',
      borderStyle: 'border-2 border-primary/40 shadow-[-6px_7px_0px_rgba(153,208,55,0.16)]',
      imgHeightLeft: 'h-60 sm:h-80',
      imgHeightRight: 'h-52 sm:h-68',
      padLeft: 'p-6 sm:p-8',
      padRight: 'p-5 sm:p-7',
      cornerAccent: 'top-0 right-0 w-28 h-20 border-t-4 border-r-4 border-primary/60 rounded-tr-[2.3rem]'
    },
    {
      radius: 'rounded-[2.1rem_1.2rem_0.9rem_2.6rem]',
      innerAccent: 'rounded-[1.9rem_1rem_0.7rem_2.4rem]',
      transform: 'lg:rotate-[0.35deg]',
      borderStyle: 'border-2 border-primary/50 shadow-[7px_-5px_0px_rgba(153,208,55,0.2)]',
      imgHeightLeft: 'h-68 sm:h-[420px]',
      imgHeightRight: 'h-44 sm:h-56',
      padLeft: 'p-7 sm:p-10',
      padRight: 'p-5 sm:p-6',
      cornerAccent: 'bottom-0 left-0 w-28 h-24 border-b-4 border-l-4 border-primary/60 rounded-bl-[2.4rem]'
    },
    {
      radius: 'rounded-[1.1rem_2.2rem_2.5rem_0.8rem]',
      innerAccent: 'rounded-[0.9rem_2rem_2.3rem_0.6rem]',
      transform: 'lg:-rotate-[0.6deg]',
      borderStyle: 'border-2 border-primary/35 shadow-[-5px_-6px_0px_rgba(153,208,55,0.15)]',
      imgHeightLeft: 'h-56 sm:h-76',
      imgHeightRight: 'h-56 sm:h-72',
      padLeft: 'p-6 sm:p-8',
      padRight: 'p-5 sm:p-7',
      cornerAccent: 'bottom-0 right-0 w-24 h-24 border-b-4 border-r-4 border-primary/60 rounded-br-[2.3rem]'
    },
    {
      radius: 'rounded-[2.6rem_0.9rem_1.4rem_2.2rem]',
      innerAccent: 'rounded-[2.4rem_0.7rem_1.2rem_2rem]',
      transform: 'lg:rotate-[0.4deg]',
      borderStyle: 'border-2 border-primary/45 shadow-[8px_5px_0px_rgba(153,208,55,0.18)]',
      imgHeightLeft: 'h-64 sm:h-88',
      imgHeightRight: 'h-48 sm:h-64',
      padLeft: 'p-6 sm:p-9',
      padRight: 'p-5 sm:p-6',
      cornerAccent: 'top-0 left-0 w-32 h-16 border-t-4 border-l-4 border-primary/65 rounded-tl-[2.4rem]'
    }
  ];

  // Split posts into asymmetric Left (wider & larger) and Right (narrower & more compact) comic columns
  const leftColumnPosts = filteredPosts.filter((_, idx) => idx % 2 === 0);
  const rightColumnPosts = filteredPosts.filter((_, idx) => idx % 2 === 1);

  const renderComicPostCard = (post: any, globalIdx: number, columnSide: 'left' | 'right') => {
    const gameMeta = GAME_META[post.game_id] || GAME_META.blitz;
    const charCount = (post.content || '').length;
    const readingMinutes = Math.max(4, Math.ceil(charCount / 1100));
    const postSlugOrId = post.slug || post.id;
    const preset = COMIC_PANEL_PRESETS[globalIdx % COMIC_PANEL_PRESETS.length];
    const isLeft = columnSide === 'left';

    return (
      <article
        key={`blog-post-${post.id || globalIdx}-${globalIdx}`}
        className={`relative overflow-hidden bg-transparent backdrop-blur-2xl transition-all duration-300 hover:border-primary/80 ${preset.radius} ${preset.borderStyle} ${preset.transform} ${
          isLeft ? 'lg:mr-1' : 'lg:ml-1'
        }`}
      >
        {/* Angled Comic Corner Direction Accent */}
        <div className={`pointer-events-none absolute z-20 ${preset.cornerAccent}`} />

        {post.image_url && (
          <Link
            to={`/blog/${postSlugOrId}`}
            className={`block relative w-full ${
              isLeft ? preset.imgHeightLeft : preset.imgHeightRight
            } overflow-hidden border-b-2 border-primary/30 group`}
          >
            <img
              src={post.image_url}
              alt={post.title}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
            <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2">
              <BubbleElement isBadge active size="sm" icon={<Sparkles size={14} />}>
                {gameMeta.title} • {gameMeta.badge}
              </BubbleElement>
              <BubbleElement isBadge size="sm">
                Выпуск #{globalIdx + 1}
              </BubbleElement>
            </div>
          </Link>
        )}

        <div className={`${isLeft ? preset.padLeft : preset.padRight} space-y-4`}>
          {/* Meta badges */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/75">
            <BubbleElement isBadge size="sm" icon={<Calendar size={14} />}>
              {new Date(post.created_at || Date.now()).toLocaleDateString('ru-RU')}
            </BubbleElement>
            <BubbleElement isBadge size="sm" icon={<User size={14} />}>
              {post.author_name || 'Редакция КвИИз'}
            </BubbleElement>
            <BubbleElement isBadge size="sm" icon={<Clock size={14} />}>
              ~{readingMinutes} мин ({charCount} симв.)
            </BubbleElement>
          </div>

          {/* Title */}
          <Link to={`/blog/${postSlugOrId}`} className="no-underline block group">
            <h2
              className={`${
                isLeft ? 'text-xl sm:text-3xl lg:text-4xl' : 'text-lg sm:text-2xl'
              } font-black text-foreground group-hover:text-primary transition-colors leading-snug`}
            >
              {post.title}
            </h2>
          </Link>

          {/* Excerpt */}
          {post.excerpt && (
            <p className={`${isLeft ? 'text-base sm:text-lg' : 'text-sm sm:text-base'} text-foreground/85 leading-relaxed`}>
              {post.excerpt}
            </p>
          )}

          {/* Actions Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/20 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <LeafButton
                variant="primary"
                size="sm"
                onClick={() => navigate(`/blog/${postSlugOrId}`)}
                icon={<BookOpen size={15} />}
              >
                Открыть статью полностью
              </LeafButton>

              <LeafButton
                variant="glass"
                size="sm"
                onClick={() => navigate(gameMeta.route)}
                icon={<Play size={15} />}
              >
                Играть в «{gameMeta.title}»
              </LeafButton>
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
      </article>
    );
  };

  return (
    <div className="w-full max-w-none py-4 pb-24 space-y-7">
      {/* Hidden SEO Heading & Summary (invisible visually, preserved for search engines) */}
      <div className="sr-only">
        <span>Блог и энциклопедия игр — SEO-обзоры и гайды ({posts.length})</span>
        <h1>Блог интеллектуальных ИИ-викторин КвИИз</h1>
        <p>
          Полные руководства по всем 5 играм платформы: правила, тактики победы, голосовые примечания для нейросети, мультиплеер с видеосвязью и сравнение с легендарными аналогами (Своя Игра, SI Game Владимира Хиля, Квиллионер, Сто к одному, Что? Где? Когда?).
        </p>
      </div>

      {/* Search & Game Filter Bubbles Bar */}
      <div className="rounded-[2rem_0.9rem_2.2rem_1rem] border-2 border-primary/35 bg-transparent backdrop-blur-2xl p-4 sm:p-6 shadow-xl space-y-3.5">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/70 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск по статьям, правилам, играм (например: Своя Икра, SI Game, 100 к 1, примечание для ИИ)..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary transition-all"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {GAME_FILTERS.map(gf => (
            <BubbleElement
              key={gf.id}
              as="button"
              type="button"
              active={selectedGame === gf.id}
              size="sm"
              onClick={() => setSelectedGame(gf.id)}
            >
              {gf.label}
            </BubbleElement>
          ))}
        </div>
      </div>

      {/* Asymmetric Comic-Book Columns: Left Column is Larger & Wider (7/12), Right Column is Narrower (5/12) */}
      {filteredPosts.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-start w-full">
          {/* Left Larger & Wider Comic Column */}
          <div className="lg:col-span-7 xl:col-span-7 space-y-7 xl:space-y-9 min-w-0">
            {leftColumnPosts.map((post, idx) => renderComicPostCard(post, idx * 2, 'left'))}
          </div>

          {/* Right Narrower Asymmetric Comic Column (offset top on desktop for non-symmetric comic rhythm) */}
          <div className="lg:col-span-5 xl:col-span-5 space-y-6 xl:space-y-8 lg:mt-8 min-w-0">
            {rightColumnPosts.map((post, idx) => renderComicPostCard(post, idx * 2 + 1, 'right'))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-foreground/60 text-base rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-8">
          По вашему запросу статей не найдено. Попробуйте выбрать другую категорию игры.
        </div>
      )}
    </div>
  );
}
