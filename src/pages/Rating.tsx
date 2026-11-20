import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Trophy, 
  Medal, 
  Search, 
  Gamepad2, 
  Wallet, 
  Calendar, 
  Flame, 
  User as UserIcon, 
  Sparkles, 
  ArrowUpRight, 
  Loader2,
  Filter,
  CheckCircle2,
  Award,
  Clock,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  X
} from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';
import { BubbleCurrencyIcon } from '../components/BubbleIcon';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { formatIikr, getIikrWord } from '../lib/currency';
import { useAuth } from '../context/AuthContext';
import { formatLastSeen } from '../utils/formatLastSeen';

type SortFilter = 'points' | 'balance' | 'games_played' | 'games_won' | 'created_at';

interface LeaderUser {
  id: string;
  uid: string;
  telegram_id: string | null;
  display_name: string;
  username: string | null;
  photo_url: string | null;
  avatar_url: string | null;
  telegram_photo: string | null;
  role: string;
  total_points?: number;
  points?: number;
  balance: number;
  balance_pay: number;
  balance_free: number;
  games_played: number;
  games_won: number;
  win_rate: number;
  created_at: string;
  last_seen?: string | null;
  is_online?: number | boolean;
}

export const RatingPage = () => {
  const { profile: myProfile } = useAuth();
  const navigate = useNavigate();

  const [leaders, setLeaders] = useState<LeaderUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSort, setActiveSort] = useState<SortFilter>('balance');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [gameFilter, setGameFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const activeRatingFiltersCount =
    (activeSort !== 'balance' || sortOrder !== 'desc' ? 1 : 0) +
    (gameFilter !== 'all' ? 1 : 0) +
    (difficultyFilter !== 'all' && gameFilter !== 'jeopardy' ? 1 : 0) +
    (topicFilter.trim() ? 1 : 0);

  const resetRatingFilters = () => {
    setActiveSort('balance');
    setSortOrder('desc');
    setGameFilter('all');
    setDifficultyFilter('all');
    setTopicFilter('');
  };

  const handleSortClick = (sort: SortFilter) => {
    if (activeSort === sort) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setActiveSort(sort);
      setSortOrder('desc');
    }
  };

  const fetchLeaders = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        sort: activeSort,
        order: sortOrder,
        game_id: gameFilter,
        difficulty: gameFilter === 'jeopardy' ? 'all' : difficultyFilter,
        topic: topicFilter
      });
      const res = await fetch(`/api/users/leaderboard?${queryParams.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setLeaders(json.data || []);
      }
    } catch (error) {
      console.error('Error fetching leaders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaders();
  }, [activeSort, sortOrder, gameFilter, difficultyFilter, topicFilter]);

  // Filter leaders by search
  const filteredLeaders = useMemo(() => {
    if (!searchQuery.trim()) return leaders;
    const q = searchQuery.toLowerCase().trim();
    return leaders.filter(user => 
      (user.display_name && user.display_name.toLowerCase().includes(q)) ||
      (user.username && user.username.toLowerCase().includes(q)) ||
      (user.uid && user.uid.toLowerCase().includes(q)) ||
      (user.telegram_id && user.telegram_id.toLowerCase().includes(q))
    );
  }, [leaders, searchQuery]);

  // Find user's own rank in full leaderboard
  const myRankIndex = useMemo(() => {
    if (!myProfile) return -1;
    const targetUid = myProfile.uid || myProfile.id;
    return leaders.findIndex(u => u.uid === targetUid || u.id === targetUid);
  }, [leaders, myProfile]);

  const myRankData = myRankIndex !== -1 ? leaders[myRankIndex] : null;

  const getSortTitle = (sort: SortFilter) => {
    const dir = sortOrder === 'desc' ? 'по убыванию' : 'по возрастанию';
    switch (sort) {
      case 'points': return `по набранным очкам (${dir})`;
      case 'balance': return `по балансу ИИкры (${dir})`;
      case 'games_played': return `по сыгранным играм (${dir})`;
      case 'games_won': return `по количеству побед (${dir})`;
      case 'created_at': return `по дате регистрации (${dir})`;
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 max-w-5xl mx-auto pb-16 text-sm min-w-0 overflow-x-hidden">
      {/* Page Header */}
      <div className="text-center py-2 sm:py-4">
        <h1 className="text-2xl sm:text-3xl font-black text-foreground drop-shadow-[0_0_10px_rgba(153,208,55,0.4)] flex items-center justify-center gap-3">
          <Trophy className="text-primary shrink-0" size={30} />
          <span>Рейтинг игроков</span>
        </h1>
      </div>

      {/* Your Rank Glass Card (if logged in) */}
      {myProfile && (
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/30 bg-transparent backdrop-blur-2xl px-[2%] py-5 sm:p-6 shadow-[0_8px_32px_rgba(153,208,55,0.15)]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-col gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-transparent border border-primary/40 text-primary shrink-0 shadow-inner">
                  <span className="text-sm font-semibold text-foreground/70">Место</span>
                  <span className="text-xl font-black">{myRankIndex !== -1 ? `#${myRankIndex + 1}` : '—'}</span>
                </div>

                <div className="relative shrink-0">
                  <UserAvatar
                    avatarUrl={myProfile.photo_url || myProfile.avatar_url || myProfile.telegram_photo}
                    displayName={myProfile.display_name}
                    size="md"
                    className="border-2 border-primary"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-base sm:text-lg text-foreground break-words">{myProfile.display_name}</p>
                    <BubbleElement isBadge active size="sm" className="!px-2.5 !py-0.5 !text-sm">
                      Вы
                    </BubbleElement>
                  </div>
                  <p className="text-sm text-foreground/60 font-mono truncate">UID: {myProfile.uid}</p>
                </div>
              </div>

              {/* Кнопка "Мой профиль" под аватаркой с именем */}
              <div className="flex justify-start">
                <Link to={`/profile${myProfile.uid}`} className="w-full sm:w-auto">
                  <LeafButton
                    variant="primary"
                    size="sm"
                    icon={<ArrowUpRight size={16} />}
                    className="w-full sm:w-auto justify-center text-sm py-2"
                  >
                    Мой профиль
                  </LeafButton>
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3 sm:gap-6 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-t-0 pt-3 lg:pt-0 border-primary/20">
              <div className="text-center sm:text-right">
                <p className="text-sm font-semibold text-foreground/60">Баланс</p>
                <p className="text-base font-black text-primary flex items-center gap-1 justify-center sm:justify-end">
                  {myProfile.balance} <BubbleCurrencyIcon className="w-4 h-4" />
                </p>
              </div>

              {myRankData && (
                <>
                  <div className="text-center sm:text-right">
                    <p className="text-sm font-semibold text-foreground/60">Очки</p>
                    <p className="text-base font-black text-amber-400 flex items-center justify-center sm:justify-end gap-1">
                      <Sparkles size={14} />
                      {(myRankData.total_points ?? myRankData.points ?? 0).toLocaleString('ru-RU')}
                    </p>
                  </div>

                  <div className="text-center sm:text-right">
                    <p className="text-sm font-semibold text-foreground/60">Побед</p>
                    <p className="text-base font-black text-foreground">{myRankData.games_won}</p>
                  </div>

                  <div className="text-center sm:text-right">
                    <p className="text-sm font-semibold text-foreground/60">Сыграно</p>
                    <p className="text-base font-black text-foreground">{myRankData.games_played}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Control Bar: Search & Filter Tabs */}
      <div className="space-y-3 sm:space-y-4 min-w-0">
        {/* Search Input + Mobile Compact Filter Button */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40" size={18} />
            <input
              type="text"
              placeholder="Поиск по имени, @username, UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-3 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary/50 transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-sm font-bold text-foreground/50 hover:text-foreground"
                title="Очистить поиск"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <BubbleElement
            size="sm"
            active={isMobileFiltersOpen || activeRatingFiltersCount > 0}
            onClick={() => setIsMobileFiltersOpen((prev) => !prev)}
            icon={<Filter size={17} />}
            className="md:hidden shrink-0 !px-3 !py-3 rounded-2xl"
            title="Фильтры и сортировка рейтинга"
          >
            <span className="text-sm font-bold">
              Фильтры{activeRatingFiltersCount > 0 ? ` (${activeRatingFiltersCount})` : ''}
            </span>
          </BubbleElement>
        </div>

        {/* Collapsible Filters & Sorting Container (Always visible on Desktop, toggled by button on Mobile) */}
        <div className={`${isMobileFiltersOpen ? 'block' : 'hidden md:block'} space-y-3.5 min-w-0`}>
          {activeRatingFiltersCount > 0 && (
            <div className="flex md:hidden items-center justify-between gap-2 p-2.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl">
              <span className="text-sm font-bold text-primary">
                Выбрано фильтров: {activeRatingFiltersCount}
              </span>
              <BubbleElement
                size="sm"
                onClick={resetRatingFilters}
                icon={<RotateCcw size={14} />}
                className="!px-2.5 !py-1 !text-sm"
              >
                Сбросить
              </BubbleElement>
            </div>
          )}

          {/* Sort Filter Buttons */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 p-2 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl min-w-0">
            {[
              { id: 'points' as SortFilter, label: 'По очкам', icon: <Sparkles size={15} /> },
              { id: 'balance' as SortFilter, label: 'Баланс ИИкры', icon: <Wallet size={15} /> },
              { id: 'games_played' as SortFilter, label: 'Сыграно игр', icon: <Gamepad2 size={15} /> },
              { id: 'games_won' as SortFilter, label: 'Побед в играх', icon: <Trophy size={15} /> },
              { id: 'created_at' as SortFilter, label: 'По дате', icon: <Calendar size={15} /> }
            ].map((sOpt) => {
              const isAct = activeSort === sOpt.id;
              return (
                <BubbleElement
                  key={sOpt.id}
                  size="sm"
                  active={isAct}
                  icon={sOpt.icon}
                  onClick={() => handleSortClick(sOpt.id)}
                  className="w-full sm:flex-1 justify-center !py-2 !px-2.5 text-sm rounded-xl min-w-0"
                >
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <span className="truncate">{sOpt.label}</span>
                    {isAct && (
                      sortOrder === 'asc' ? <ArrowUp size={14} className="shrink-0" /> : <ArrowDown size={14} className="shrink-0" />
                    )}
                  </span>
                </BubbleElement>
              );
            })}
          </div>

          {/* Secondary Filters: Game, Difficulty, Topic */}
          <div className="px-3.5 py-3.5 sm:p-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl space-y-3.5 min-w-0">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3.5 min-w-0">
              {/* Game Type Filter */}
              <div className="space-y-2 flex-1 min-w-0">
                <span className="text-sm font-bold text-foreground/70 block">Игра:</span>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 min-w-0">
                  {[
                    { id: 'all', label: 'Все игры' },
                    { id: 'blitz', label: 'КвИИз' },
                    { id: 'millionaire', label: 'Квиллионер' },
                    { id: '100to1', label: '100 к 1' },
                    { id: 'whatwherewhen', label: 'ЧГК' },
                    { id: 'melody', label: 'Мелодия' },
                    { id: 'jeopardy', label: 'Своя игра' }
                  ].map(g => (
                    <BubbleElement
                      key={g.id}
                      size="sm"
                      active={gameFilter === g.id}
                      onClick={() => setGameFilter(g.id)}
                      className="w-full sm:w-auto justify-center text-sm"
                    >
                      {g.label}
                    </BubbleElement>
                  ))}
                </div>
              </div>

              {/* Topic Filter Input */}
              <div className="flex flex-col gap-1.5 w-full md:w-auto md:min-w-[220px]">
                <span className="text-sm font-bold text-foreground/70 shrink-0">Тема:</span>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="Фильтр по теме..."
                    value={topicFilter}
                    onChange={e => setTopicFilter(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-transparent border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary placeholder:text-foreground/40 backdrop-blur-md"
                  />
                  {topicFilter && (
                    <button
                      onClick={() => setTopicFilter('')}
                      className="absolute right-3 text-sm text-foreground/50 hover:text-foreground shrink-0"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Difficulty Level Filter: Tiles 2 per row (Not applicable to Jeopardy) */}
            {gameFilter !== 'jeopardy' && (
              <div className="border-t border-primary/15 pt-3 space-y-2 min-w-0">
                <span className="text-sm font-bold text-foreground/70 block">Сложность:</span>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 min-w-0">
                  {[
                    { id: 'all', label: 'Все' },
                    { id: 'dummy', label: 'ИИкра' },
                    { id: 'people', label: 'Головастик' },
                    { id: 'genius', label: 'Квант' },
                    { id: 'god', label: 'Ляга' }
                  ].map(d => (
                    <BubbleElement
                      key={d.id}
                      size="sm"
                      active={difficultyFilter === d.id}
                      onClick={() => setDifficultyFilter(d.id)}
                      className="w-full sm:w-auto justify-center text-sm py-2"
                    >
                      {d.label}
                    </BubbleElement>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leaderboard Table List */}
      <div className="space-y-3 min-w-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-primary" size={38} />
            <p className="text-sm text-foreground/60">Загрузка рейтинговой таблицы...</p>
          </div>
        ) : filteredLeaders.length > 0 ? (
          filteredLeaders.map((user, index) => {
            const isMe = myProfile && (myProfile.uid === user.uid || myProfile.id === user.uid);
            const rank = index + 1;

            return (
              <div
                key={`leader-${user.uid || user.id || index}-${index}`}
                onClick={() => navigate(`/profile${user.uid}`)}
                className={`group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-5 rounded-2xl border bg-transparent backdrop-blur-xl transition-all duration-300 cursor-pointer shadow-sm min-w-0 overflow-hidden ${
                  isMe
                    ? 'border-primary/60 shadow-[0_0_20px_rgba(153,208,55,0.2)]'
                    : rank === 1
                    ? 'border-yellow-500/40 hover:border-yellow-500/60'
                    : rank === 2
                    ? 'border-slate-300/40 hover:border-slate-300/60'
                    : rank === 3
                    ? 'border-amber-600/40 hover:border-amber-600/60'
                    : 'border-primary/20 hover:border-primary/40'
                }`}
              >
                {/* Left: Rank, Avatar, User Info */}
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  {/* Rank Indicator */}
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl shrink-0 font-black text-sm relative">
                    {rank === 1 ? (
                      <div className="flex items-center justify-center w-full h-full rounded-2xl bg-transparent text-yellow-400 border border-yellow-500/40">
                        <Trophy size={20} />
                      </div>
                    ) : rank === 2 ? (
                      <div className="flex items-center justify-center w-full h-full rounded-2xl bg-transparent text-slate-300 border border-slate-300/40">
                        <Medal size={20} />
                      </div>
                    ) : rank === 3 ? (
                      <div className="flex items-center justify-center w-full h-full rounded-2xl bg-transparent text-amber-500 border border-amber-600/40">
                        <Medal size={20} />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center w-full h-full rounded-2xl bg-transparent text-foreground/70 border border-primary/20">
                        #{rank}
                      </div>
                    )}
                  </div>

                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <UserAvatar
                      avatarUrl={user.photo_url || user.avatar_url || user.telegram_photo}
                      displayName={user.display_name}
                      size="md"
                      className="border border-primary/30 group-hover:scale-105 transition-transform"
                    />
                    {Boolean(user.is_online) && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3" title="В сети">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary border-2 border-background"></span>
                      </span>
                    )}
                  </div>

                  {/* Name & Metadata */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                      <p className="font-black text-base text-foreground group-hover:text-primary transition-colors break-words">
                        {user.display_name}
                      </p>
                      {isMe && (
                        <BubbleElement isBadge active size="sm" className="!px-2 !py-0.5 !text-sm shrink-0">
                          Вы
                        </BubbleElement>
                      )}
                      <BubbleElement isBadge size="sm" className="!px-2 !py-0.5 !text-sm text-foreground/70 shrink-0">
                        {user.role === 'superadmin' ? 'Супер-админ' : user.role === 'admin' ? 'Админ' : user.role === 'author' ? 'Автор' : 'Игрок'}
                      </BubbleElement>
                    </div>

                    <div className="flex items-center gap-x-3 gap-y-1 text-sm text-foreground/60 mt-0.5 flex-wrap min-w-0">
                      {user.username && (
                        <span className="text-primary font-medium truncate max-w-[160px]">{user.username.startsWith('@') ? user.username : `@${user.username}`}</span>
                      )}
                      <span className="font-mono text-foreground/50">UID: {user.uid}</span>
                      <span className="flex items-center gap-1 text-sm text-foreground/60">
                        <Clock size={13} className="text-foreground/40 shrink-0" />
                        <span>{formatLastSeen(user.last_seen, user.is_online)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Stats depending on chosen filter */}
                <div className="mt-3 sm:mt-0 grid grid-cols-4 sm:flex items-center justify-between sm:justify-end gap-2 sm:gap-6 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-primary/15 min-w-0">
                  {/* Points Stat */}
                  <div className="text-left sm:text-right min-w-0">
                    <p className="text-sm font-semibold text-foreground/50 truncate">Очки</p>
                    <p className="text-sm sm:text-base font-black text-amber-400 flex items-center sm:justify-end gap-1">
                      <Sparkles size={13} className="shrink-0" />
                      <span className="truncate">{(user.total_points ?? user.points ?? 0).toLocaleString('ru-RU')}</span>
                    </p>
                  </div>

                  {/* Balance Stat */}
                  <div className="text-left sm:text-right min-w-0">
                    <p className="text-sm font-semibold text-foreground/50 truncate">ИИкры</p>
                    <p className="text-sm sm:text-base font-black text-primary flex items-center sm:justify-end gap-1">
                      <span className="truncate">{user.balance}</span>
                      <BubbleCurrencyIcon className="w-4 h-4 shrink-0" />
                    </p>
                  </div>

                  {/* Games Played */}
                  <div className="text-center sm:text-right min-w-0">
                    <p className="text-sm font-semibold text-foreground/50 truncate">Сыграно</p>
                    <p className="text-sm sm:text-base font-black text-foreground">{user.games_played}</p>
                  </div>

                  {/* Games Won */}
                  <div className="text-right min-w-0">
                    <p className="text-sm font-semibold text-foreground/50 truncate">Побед</p>
                    <p className="text-sm sm:text-base font-black text-foreground flex items-center justify-end gap-1 flex-wrap">
                      <span>{user.games_won}</span>
                      {user.games_played > 0 && (
                        <span className="text-sm font-bold text-primary">
                          ({user.win_rate}%)
                        </span>
                      )}
                    </p>
                  </div>

                  {/* View Profile Icon */}
                  <div className="hidden md:flex p-2 rounded-xl bg-transparent border border-primary/25 text-primary group-hover:bg-primary group-hover:text-background transition-colors">
                    <ArrowUpRight size={18} />
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-8">
            <Search size={40} className="text-foreground/40" />
            <p className="text-base font-bold text-foreground">Игроки не найдены</p>
            <p className="text-sm text-foreground/60">
              По запросу «{searchQuery}» нет результатов. Попробуйте изменить параметры поиска.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
