import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Gamepad2,
  Sparkles,
  ArrowLeft,
  Search,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Layers,
  HelpCircle,
  Award,
  Bot,
  Percent,
  RefreshCw,
  Lock,
  User,
  Calendar,
  Copy,
  Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFrogSound } from '../hooks/useSound';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { UserAvatar } from '../components/UserAvatar';

interface FreePack {
  id: string;
  topic: string;
  game_title: string;
  original_game_title?: string;
  difficulty: string;
  question_count: number;
  author_uid?: string | null;
  author_name: string;
  author_avatar?: string | null;
  created_at?: string;
  status: 'not_played' | 'in_progress' | 'completed';
  is_completed: boolean;
  is_in_progress: boolean;
  current_step: number;
  total_steps: number;
  score?: number;
  correct_answers?: number;
  is_win?: boolean;
  can_play: boolean;
  can_resume: boolean;
}

export function FreeGamesPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { playCroak } = useFrogSound();

  const effectiveUserId = profile?.uid || localStorage.getItem('qaiz_active_user_id') || 'usr_guest';

  const [packs, setPacks] = useState<FreePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'available' | 'in_progress' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'topic' | 'difficulty' | 'questions'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const fetchFreePacks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/free-games/millionaire?user_id=${encodeURIComponent(effectiveUserId)}`);
      if (res.ok) {
        const json = await res.json();
        setPacks(Array.isArray(json.data) ? json.data : []);
      }
    } catch (err) {
      console.error('Error fetching free packs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFreePacks();
  }, [effectiveUserId]);

  const stats = useMemo(() => {
    const total = packs.length;
    const completed = packs.filter(p => p.status === 'completed').length;
    const inProgress = packs.filter(p => p.status === 'in_progress').length;
    const available = packs.filter(p => p.status === 'not_played').length;
    return { total, completed, inProgress, available };
  }, [packs]);

  const filteredPacks = useMemo(() => {
    let list = [...packs];

    // Status filter
    if (filterTab === 'available') {
      list = list.filter(p => p.status === 'not_played');
    } else if (filterTab === 'in_progress') {
      list = list.filter(p => p.status === 'in_progress');
    } else if (filterTab === 'completed') {
      list = list.filter(p => p.status === 'completed');
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p =>
        p.topic.toLowerCase().includes(q) ||
        (p.author_name && p.author_name.toLowerCase().includes(q)) ||
        (p.id && p.id.toLowerCase().includes(q))
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      }
      if (sortBy === 'topic') {
        const comp = a.topic.localeCompare(b.topic, 'ru');
        return sortOrder === 'desc' ? -comp : comp;
      }
      if (sortBy === 'difficulty') {
        const diffWeight: Record<string, number> = {
          dummy: 1, easy: 1, '1': 1,
          people: 2, medium: 2, '2': 2,
          genius: 3, hard: 3, '3': 3,
          god: 4, expert: 4, '4': 4
        };
        const wA = diffWeight[a.difficulty] || 2;
        const wB = diffWeight[b.difficulty] || 2;
        return sortOrder === 'desc' ? wB - wA : wA - wB;
      }
      if (sortBy === 'questions') {
        return sortOrder === 'desc' ? b.question_count - a.question_count : a.question_count - b.question_count;
      }
      return 0;
    });

    return list;
  }, [packs, filterTab, searchQuery, sortBy, sortOrder]);

  const handleStartGame = (pack: FreePack) => {
    playCroak();
    navigate(`/game/millionaire?free=1&packId=${encodeURIComponent(pack.id)}`, {
      state: {
        isFree: true,
        packId: pack.id,
        topic: pack.topic,
        difficulty: pack.difficulty
      }
    });
  };

  const handleResumeGame = (pack: FreePack) => {
    playCroak();
    navigate(`/game/millionaire?free=1&packId=${encodeURIComponent(pack.id)}`, {
      state: {
        isFree: true,
        packId: pack.id,
        resume: true,
        currentIndex: pack.current_step,
        topic: pack.topic,
        difficulty: pack.difficulty
      }
    });
  };

  const getDifficultyLabel = (diff?: string): string => {
    if (!diff) return 'Головастик';
    const lower = String(diff).toLowerCase().trim();
    if (lower === 'dummy' || lower === 'easy' || lower === 'икра' || lower === 'иикра' || lower === 'новичок' || lower === '1') return 'Икра';
    if (lower === 'people' || lower === 'medium' || lower === 'головастик' || lower === 'человек' || lower === 'любитель' || lower === '2') return 'Головастик';
    if (lower === 'genius' || lower === 'hard' || lower === 'квант' || lower === 'гений' || lower === 'профи' || lower === '3') return 'Квант';
    if (lower === 'god' || lower === 'expert' || lower === 'ляга' || lower === 'бог' || lower === 'эксперт' || lower === '4') return 'Ляга';
    return 'Головастик';
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-[2%] py-4 sm:py-6 space-y-5 sm:space-y-6 min-h-screen">
      {/* 1. Header Section */}
      <header className="relative w-full rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl px-[2%] py-4 sm:py-6 space-y-4 sm:space-y-5">
        <div className="flex items-center justify-between gap-1.5 sm:gap-3 w-full min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <LeafButton
              variant="glass"
              size="sm"
              onClick={() => {
                playCroak();
                navigate('/');
              }}
              icon={<ArrowLeft size={16} />}
              className="!px-2.5 sm:!px-4 !py-1.5 text-sm shrink-0"
            >
              На главную
            </LeafButton>

            <BubbleElement
              isBadge
              active
              size="sm"
              icon={<Sparkles size={15} />}
              className="!px-2.5 sm:!px-3.5 !py-1.5 text-sm shrink-0"
            >
              Бесплатно
            </BubbleElement>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mobile Filter & Sort Toggle Icon */}
            <BubbleElement
              size="sm"
              active={isMobileFiltersOpen || filterTab !== 'all' || Boolean(searchQuery.trim())}
              onClick={() => {
                playCroak();
                setIsMobileFiltersOpen(prev => !prev);
              }}
              icon={<SlidersHorizontal size={16} />}
              className="md:hidden !px-2.5 !py-1.5 shrink-0"
              title="Фильтры и сортировка"
            />

            {/* Mobile Refresh Icon Button */}
            <BubbleElement
              size="sm"
              onClick={() => {
                playCroak();
                fetchFreePacks();
              }}
              icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />}
              className="md:hidden !px-2.5 !py-1.5 shrink-0"
              title="Обновить список"
            />

            {/* Desktop Refresh Button with Text */}
            <LeafButton
              variant="glass"
              size="sm"
              onClick={() => {
                playCroak();
                fetchFreePacks();
              }}
              icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />}
              className="hidden md:inline-flex"
            >
              Обновить список
            </LeafButton>
          </div>
        </div>

        {/* Title and Quick Stats */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-t border-primary/15 pt-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl flex items-center justify-center text-primary shrink-0">
              <Gamepad2 size={24} />
            </div>
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-foreground tracking-tight">
              Freeлионер
            </h1>
          </div>

          {/* Quick Stats in Liquid Glass Bubbles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full md:w-auto">
            <div className="px-[2%] py-3 sm:px-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl text-center space-y-0.5">
              <span className="text-sm text-foreground/70 block">Всего игр</span>
              <span className="text-xl sm:text-2xl font-black text-primary">{stats.total}</span>
            </div>
            <div className="px-[2%] py-3 sm:px-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl text-center space-y-0.5">
              <span className="text-sm text-foreground/70 block">Доступно</span>
              <span className="text-xl sm:text-2xl font-black text-emerald-400">{stats.available}</span>
            </div>
            <div className="px-[2%] py-3 sm:px-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl text-center space-y-0.5">
              <span className="text-sm text-foreground/70 block">В процессе</span>
              <span className="text-xl sm:text-2xl font-black text-amber-300">{stats.inProgress}</span>
            </div>
            <div className="px-[2%] py-3 sm:px-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl text-center space-y-0.5">
              <span className="text-sm text-foreground/70 block">Сыграно вами</span>
              <span className="text-xl sm:text-2xl font-black text-foreground">{stats.completed}</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Controls & Search Bar (Collapsible on Mobile via Icon, Always Visible on Desktop) */}
      <section
        className={`${
          isMobileFiltersOpen ? 'block' : 'hidden'
        } md:block rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl px-[2%] py-4 sm:py-5 space-y-4`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          {/* Status Tabs */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
            <LeafButton
              active={filterTab === 'all'}
              variant={filterTab === 'all' ? 'primary' : 'glass'}
              size="sm"
              onClick={() => {
                playCroak();
                setFilterTab('all');
              }}
              icon={<Layers size={15} />}
              className="w-full sm:w-auto justify-center !px-2.5 sm:!px-4 text-sm"
            >
              Все игры ({stats.total})
            </LeafButton>

            <LeafButton
              active={filterTab === 'available'}
              variant={filterTab === 'available' ? 'primary' : 'glass'}
              size="sm"
              onClick={() => {
                playCroak();
                setFilterTab('available');
              }}
              icon={<Play size={15} />}
              className="w-full sm:w-auto justify-center !px-2.5 sm:!px-4 text-sm"
            >
              Доступные ({stats.available})
            </LeafButton>

            <LeafButton
              active={filterTab === 'in_progress'}
              variant={filterTab === 'in_progress' ? 'primary' : 'glass'}
              size="sm"
              onClick={() => {
                playCroak();
                setFilterTab('in_progress');
              }}
              icon={<Clock size={15} />}
              className="w-full sm:w-auto justify-center !px-2.5 sm:!px-4 text-sm"
            >
              В процессе ({stats.inProgress})
            </LeafButton>

            <LeafButton
              active={filterTab === 'completed'}
              variant={filterTab === 'completed' ? 'primary' : 'glass'}
              size="sm"
              onClick={() => {
                playCroak();
                setFilterTab('completed');
              }}
              icon={<CheckCircle2 size={15} />}
              className="w-full sm:w-auto justify-center !px-2.5 sm:!px-4 text-sm"
            >
              Сыгранные ({stats.completed})
            </LeafButton>
          </div>

          {/* Search Input */}
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50 pointer-events-none" size={17} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Поиск по теме или автору..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl text-foreground text-sm placeholder:text-foreground/50 focus:outline-none focus:border-primary transition-all"
            />
          </div>
        </div>

        {/* Sorting selection bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3.5 border-t border-primary/15 text-sm">
          <div className="flex items-center gap-2 text-foreground/75 font-medium">
            <SlidersHorizontal size={16} className="text-primary shrink-0" />
            <span>Сортировка:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <BubbleElement
              active={sortBy === 'date'}
              size="sm"
              onClick={() => {
                playCroak();
                if (sortBy === 'date') setSortOrder(o => o === 'desc' ? 'asc' : 'desc');
                else { setSortBy('date'); setSortOrder('desc'); }
              }}
            >
              По дате {sortBy === 'date' && (sortOrder === 'desc' ? '↓' : '↑')}
            </BubbleElement>

            <BubbleElement
              active={sortBy === 'topic'}
              size="sm"
              onClick={() => {
                playCroak();
                if (sortBy === 'topic') setSortOrder(o => o === 'desc' ? 'asc' : 'desc');
                else { setSortBy('topic'); setSortOrder('asc'); }
              }}
            >
              По названию {sortBy === 'topic' && (sortOrder === 'asc' ? 'А-Я' : 'Я-А')}
            </BubbleElement>

            <BubbleElement
              active={sortBy === 'difficulty'}
              size="sm"
              onClick={() => {
                playCroak();
                if (sortBy === 'difficulty') setSortOrder(o => o === 'desc' ? 'asc' : 'desc');
                else { setSortBy('difficulty'); setSortOrder('desc'); }
              }}
            >
              По сложности {sortBy === 'difficulty' && (sortOrder === 'desc' ? '↓' : '↑')}
            </BubbleElement>
          </div>
        </div>
      </section>

      {/* 3. Game Cards Grid */}
      <section className="space-y-4">
        {loading ? (
          <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl px-[2%] py-14 text-center space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.37)]">
            <div className="w-12 h-12 mx-auto rounded-2xl border border-primary/35 flex items-center justify-center text-primary animate-spin">
              <RefreshCw size={24} />
            </div>
            <p className="text-base text-foreground/80 font-medium">Загружаем список бесплатных игр...</p>
          </div>
        ) : filteredPacks.length === 0 ? (
          <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl px-[2%] py-14 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-3xl border border-primary/30 flex items-center justify-center text-primary/70">
              <HelpCircle size={32} />
            </div>
            <h3 className="text-2xl font-bold text-foreground">Игры не найдены</h3>
            <p className="text-base text-foreground/70 max-w-md mx-auto">
              По выбранным фильтрам и поисковому запросу ничего не найдено. Попробуйте сбросить параметры поиска.
            </p>
            <LeafButton
              variant="primary"
              size="md"
              onClick={() => {
                playCroak();
                setFilterTab('all');
                setSearchQuery('');
              }}
            >
              Показать все игры
            </LeafButton>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            <AnimatePresence>
              {filteredPacks.map((pack) => {
                const isCompleted = pack.status === 'completed';
                const isInProgress = pack.status === 'in_progress';

                return (
                  <motion.div
                    key={pack.id}
                    layout
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`relative rounded-3xl border transition-all duration-300 flex flex-col justify-between px-[2%] py-4 sm:py-5 bg-transparent backdrop-blur-2xl ${
                      isCompleted
                        ? 'border-primary/15 opacity-80 hover:opacity-100'
                        : isInProgress
                        ? 'border-amber-400/40 hover:border-amber-400'
                        : 'border-primary/30 hover:border-primary'
                    }`}
                  >
                    <div className="space-y-3.5">
                      {/* Row 1: Freeлионер on Left | Status + Difficulty on Right */}
                      <div className="flex items-start justify-between gap-2 w-full min-w-0">
                        <BubbleElement isBadge active={!isCompleted} size="sm" className="shrink-0">
                          Freeлионер
                        </BubbleElement>

                        <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
                          {isCompleted ? (
                            <BubbleElement isBadge active={false} size="sm" icon={<CheckCircle2 size={13} className="text-emerald-400" />}>
                              Пройдена
                            </BubbleElement>
                          ) : isInProgress ? (
                            <BubbleElement isBadge active size="sm" icon={<Clock size={13} className="text-amber-400" />}>
                              В процессе
                            </BubbleElement>
                          ) : (
                            <BubbleElement isBadge active={false} size="sm" icon={<Sparkles size={13} className="text-primary" />}>
                              Доступна
                            </BubbleElement>
                          )}

                          <BubbleElement isBadge active={false} size="sm">
                            {getDifficultyLabel(pack.difficulty)}
                          </BubbleElement>
                        </div>
                      </div>

                      {/* Row 2: Pack ID on Separate Full-Width Row */}
                      <BubbleElement
                        isBadge
                        active={false}
                        size="sm"
                        className="w-full justify-between font-mono text-sm text-foreground/80 flex items-center gap-1.5 cursor-pointer hover:border-primary/50 transition-colors !px-3 !py-1.5 rounded-2xl"
                        title="Нажмите, чтобы скопировать id игры"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard?.writeText(pack.id);
                          setCopiedId(pack.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                      >
                        <span className="flex items-center justify-between gap-2 w-full min-w-0">
                          <span className="break-all whitespace-normal text-left leading-tight">
                            id: {pack.id}
                          </span>
                          {copiedId === pack.id ? (
                            <Check size={14} className="text-emerald-400 shrink-0" />
                          ) : (
                            <Copy size={13} className="text-foreground/50 hover:text-primary shrink-0" />
                          )}
                        </span>
                      </BubbleElement>

                      {/* Topic Title */}
                      <div>
                        <h3 className="text-lg sm:text-xl font-bold text-foreground line-clamp-2 leading-snug break-words">
                          {pack.topic}
                        </h3>
                        <p className="text-sm text-foreground/60 mt-1 flex flex-wrap items-center gap-1.5">
                          <span>15 вопросов</span>
                          <span>•</span>
                          <span>Несгораемые суммы 1 000 и 32 000</span>
                        </p>
                      </div>

                      {/* Results display: Completed Result or Current Progress */}
                      {isCompleted ? (
                        <div className="px-[2%] py-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl space-y-1.5 text-sm">
                          <div className="flex items-center justify-between text-foreground/75">
                            <span>Результат прохождения:</span>
                            <span className="font-semibold text-foreground">
                              {pack.correct_answers ?? 15} из {pack.total_steps || 15} вопросов
                            </span>
                          </div>
                          <div className="flex items-center justify-between font-bold pt-1.5 border-t border-primary/10">
                            <span className="text-foreground/75">Итоговый выигрыш:</span>
                            <span className="text-primary font-black text-base">
                              {(pack.score && pack.score > 0 ? pack.score : 1000000).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ) : isInProgress ? (
                        <div className="px-[2%] py-3 rounded-2xl border border-amber-400/25 bg-transparent backdrop-blur-xl space-y-1.5 text-sm">
                          <div className="flex items-center justify-between text-foreground/75">
                            <span>Текущий результат:</span>
                            <span className="font-semibold text-amber-300">
                              Вопрос {pack.current_step + 1} из {pack.total_steps || 15}
                            </span>
                          </div>
                          <div className="flex items-center justify-between font-bold pt-1.5 border-t border-amber-400/15">
                            <span className="text-foreground/75">Текущий куш:</span>
                            <span className="text-amber-300 font-black text-base">
                              {(pack.score || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="px-[2%] py-3 rounded-2xl border border-primary/15 bg-transparent backdrop-blur-xl flex items-center justify-between text-sm">
                          <span className="text-foreground/70">Главный приз:</span>
                          <span className="font-black text-primary text-base">1 000 000</span>
                        </div>
                      )}

                      {/* Author & Pack Details */}
                      <div className="px-[2%] py-2.5 rounded-2xl border border-primary/15 bg-transparent backdrop-blur-xl flex items-center justify-between gap-2.5 text-sm">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playCroak();
                            navigate(`/profile/${pack.author_uid || '10016926299'}`);
                          }}
                          className="flex items-center gap-2 min-w-0 group text-left cursor-pointer"
                          title={`Открыть профиль автора: ${pack.author_name}`}
                        >
                          <UserAvatar
                            avatarUrl={pack.author_avatar}
                            displayName={pack.author_name}
                            size="xs"
                            className="border-primary/40 group-hover:border-primary transition-colors shrink-0"
                          />
                          <span className="text-foreground/90 font-semibold truncate group-hover:text-primary group-hover:underline transition-colors">
                            {pack.author_name}
                          </span>
                        </button>

                        {pack.created_at && (
                          <div className="flex items-center gap-1 text-foreground/60 shrink-0 text-sm">
                            <Calendar size={13} />
                            <span>{new Date(pack.created_at).toLocaleDateString('ru-RU')}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-3.5 mt-3.5 border-t border-primary/15">
                      {isCompleted ? (
                        <div className="flex justify-center">
                          <BubbleElement isBadge active={false} size="md" icon={<CheckCircle2 size={16} className="text-emerald-400" />}>
                            Игра уже сыграна
                          </BubbleElement>
                        </div>
                      ) : isInProgress ? (
                        <LeafButton
                          variant="glass"
                          size="md"
                          onClick={() => handleResumeGame(pack)}
                          icon={<RotateCcw size={18} className="text-amber-400" />}
                          className="w-full justify-center text-sm font-bold text-foreground hover:text-primary"
                        >
                          Продолжить с вопроса {pack.current_step + 1}
                        </LeafButton>
                      ) : (
                        <LeafButton
                          variant="glass"
                          size="md"
                          onClick={() => handleStartGame(pack)}
                          icon={<Play size={18} className="text-primary" />}
                          className="w-full justify-center text-sm font-bold text-primary hover:text-white"
                        >
                          Начать игру
                        </LeafButton>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>
    </div>
  );
}
