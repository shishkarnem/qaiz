import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Info, User, Bot, Users, Monitor, Globe, Lock, HelpCircle, Search, Sparkles, RotateCcw, History, BookOpen } from 'lucide-react';
import { TopicCloud } from './TopicCloud';
import { DIFFICULTIES, getGameModes, formatPricePerQuestion, getGameDetailedRules } from '../lib/gameHelpers';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { VoiceInputBubble } from './ui/VoiceInputBubble';
import { MiniAudioField } from './ui/MiniAudioField';
import { useAuth } from '../context/AuthContext';
import { InsufficientBalanceModal } from './InsufficientBalanceModal';
import { addRecentTopic, sortTopicsWithRecent } from '../utils/recentTopics';
import { audioSystem } from '../hooks/useSound';

interface GameStartModalProps {
  game: any;
  onClose: () => void;
  onStart: (options: any) => void;
  initialPlayMode?: 'single' | 'multi';
}

export const GameStartModal: React.FC<GameStartModalProps> = ({ 
  game: initialGame, 
  onClose, 
  onStart,
  initialPlayMode
}) => {
  const navigate = useNavigate();
  const { profile, demoBalance, openDemoExhaustedModal } = useAuth();
  const [game, setGame] = useState(initialGame);
  const [playMode, setPlayMode] = useState<'single' | 'multi'>(initialPlayMode || 'single');
  const [mpVisibility, setMpVisibility] = useState<'public' | 'private'>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('visibility');
      if (p === 'private' || p === 'public') return p;
    }
    return 'public';
  });
  const [mpMaxPlayers, setMpMaxPlayers] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const m = Number(new URLSearchParams(window.location.search).get('max_players'));
      if (m >= 2 && m <= 8) return m;
    }
    return 8;
  });
  const [difficulty, setDifficulty] = useState('people');
  const [isDifficultyInfoOpen, setIsDifficultyInfoOpen] = useState(false);
  const [isInsufficientBalanceOpen, setIsInsufficientBalanceOpen] = useState(false);
  
  // Topic state - support multi-selection
  const [selectedTopics, setSelectedTopics] = useState<string[]>(['Общие знания']);
  const [searchTopic, setSearchTopic] = useState('');
  const [dbTopics, setDbTopics] = useState<string[]>([]);
  const [totalTopicsCount, setTotalTopicsCount] = useState<number>(0);
  const [isSearching, setIsSearching] = useState(false);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [gameNote, setGameNote] = useState('');

  const gameBlogSlugs: Record<string, string> = {
    blitz: 'kviiz-intellektualnaya-onlayn-viktorina-s-ii',
    millionaire: 'kvillioner-igra-kto-hochet-stat-millionerom-onlayn',
    '100to1': 'sto-kvadnomu-igra-100-k-1-onlayn-s-neurosetyu',
    whatwherewhen: 'chto-gde-kvada-intellektualnyy-klub-znatokov-chgk-onlayn',
    jeopardy: 'svoya-ikra-analog-svoey-igry-si-game-onlayn'
  };

  const supportedModes = getGameModes(game.id);

  useEffect(() => {
    audioSystem.playSlot('ui_modal_open');
    audioSystem.playBackground('menu_bg_editor');
    if (game?.id) {
      audioSystem.preloadGameBatch(game.id, playMode === 'multi');
    }
    return () => {
      const p = window.location.pathname.toLowerCase();
      if (
        !p.startsWith('/game/') &&
        !p.startsWith('/blitz') &&
        !p.startsWith('/100to1') &&
        !p.startsWith('/jeopardy') &&
        !p.startsWith('/millionaire') &&
        !p.startsWith('/whatwherewhen') &&
        !p.startsWith('/multiplayer/room/')
      ) {
        if (p.startsWith('/profile')) {
          audioSystem.playBackground('menu_bg_ambient_night');
        } else {
          audioSystem.playBackground('menu_bg_main');
        }
      }
    };
  }, []);

  useEffect(() => {
    if (game?.id) {
      audioSystem.preloadGameBatch(game.id, playMode === 'multi');
    }
  }, [game?.id, playMode]);

  // Auto-set valid mode when game changes
  useEffect(() => {
    if (!profile) {
      setPlayMode('single');
      return;
    }
    if (initialPlayMode && supportedModes.includes(initialPlayMode)) {
      setPlayMode(initialPlayMode);
    } else if (!supportedModes.includes(playMode)) {
      setPlayMode(supportedModes.includes('single') ? 'single' : (supportedModes[0] || 'single'));
    }
  }, [game.id, initialPlayMode, profile]);

  // Fetch complete game details from DB
  useEffect(() => {
    const fetchGameDetails = async () => {
      try {
        if (!initialGame?.id) return;
        const res = await fetch(`/api/games/${initialGame.id}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setGame(json.data);
          }
        }
      } catch (err) {
        console.error('Error fetching game details from DB:', err);
      }
    };
    fetchGameDetails();
  }, [initialGame?.id]);

  // Fetch topics with search filter from server DB
  useEffect(() => {
    const fetchTopics = async () => {
      setIsSearching(true);
      try {
        const query = searchTopic.trim();
        const activeUid = profile?.uid || profile?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
        const url = `/api/topics?limit=100${query ? `&q=${encodeURIComponent(query)}` : ''}&user_id=${encodeURIComponent(activeUid)}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            const topicNames = json.data.map((t: any) => t.name);
            const sortedNames = sortTopicsWithRecent(topicNames, json.recentTopics);
            setDbTopics(sortedNames);
            setTotalTopicsCount(json.totalCount || topicNames.length);
          }
        }
      } catch (error) {
        console.error('Error fetching topics from API:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(fetchTopics, 150);
    return () => clearTimeout(timer);
  }, [searchTopic, profile?.uid, profile?.id]);

  // Add custom topic entered by user immediately in real-time
  const handleAddCustomTopic = (rawTopic: string) => {
    const trimmed = rawTopic.trim();
    if (trimmed.length < 2) return;

    setCustomTopics(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
    setDbTopics(prev => [trimmed, ...prev.filter(t => t.toLowerCase() !== trimmed.toLowerCase())]);
    setTotalTopicsCount(prev => prev + 1);

    setSelectedTopics(prev => {
      if (game.id === 'jeopardy') {
        return [trimmed];
      }
      return prev.includes(trimmed) ? prev : [...prev, trimmed];
    });

    setSearchTopic('');

    // Persist custom topic to database in background
    fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, category: 'Пользовательские' }),
    }).catch(err => console.error('Error saving custom topic:', err));
  };

  // Toggle topic selection
  const handleToggleTopic = (topic: string) => {
    const trimmed = topic.trim();
    if (!trimmed) return;

    setSelectedTopics(prev => {
      if (game.id === 'jeopardy') {
        // Jeopardy requires single game-level topic from the database
        return prev.includes(trimmed) ? [] : [trimmed];
      }
      if (prev.includes(trimmed)) {
        return prev.filter(t => t !== trimmed);
      } else {
        return [...prev, trimmed];
      }
    });
    // Clear search input on topic selection to prevent leftover search queries
    setSearchTopic('');
  };

  const handleResetTopics = () => {
    setSelectedTopics([]);
    setSearchTopic('');
  };

  // Calculations from DB game object
  const questionCount = game.id === 'jeopardy' ? 76 : (game.question_count || game.questionCount || 10);
  const timeLimit = game.time_limit || 60;
  const pricePerQuestion = game.price_per_question ?? (game.id === 'whatwherewhen' ? 2 : game.id === 'melody' ? 10 : 1);
  const totalPrice = game.id === 'jeopardy' ? 76 : questionCount * pricePerQuestion;
  const showTopicSelection = ['blitz', 'millionaire', '100to1', 'whatwherewhen', 'melody', 'jeopardy'].includes(game.id);

  // Saved packs for replaying
  const [savedPacks, setSavedPacks] = useState<any[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [packSearch, setPackSearch] = useState('');
  const [activeModalTab, setActiveModalTab] = useState<'new' | 'saved'>('new');

  useEffect(() => {
    const fetchPacks = async () => {
      if (!game?.id) return;
      setLoadingPacks(true);
      try {
        const res = await fetch(`/api/game-packs?game_id=${game.id}&limit=30`);
        if (res.ok) {
          const json = await res.json();
          setSavedPacks(json.data || []);
        }
      } catch (_) {}
      finally {
        setLoadingPacks(false);
      }
    };
    fetchPacks();
  }, [game?.id]);

  const handleStartGame = async () => {
    if (!profile && demoBalance <= 0) {
      onClose();
      openDemoExhaustedModal();
      return;
    }

    if (profile && (profile.balance < totalPrice)) {
      setIsInsufficientBalanceOpen(true);
      return;
    }

    let finalTopic = 'Общие знания';
    const custom = searchTopic.trim();

    if (selectedTopics.length > 0) {
      // User explicitly picked topics from list (Jeopardy uses exactly 1 game-level topic)
      finalTopic = game.id === 'jeopardy' ? selectedTopics[0] : selectedTopics.join(', ');
    } else if (custom && custom.length >= 2) {
      // User typed a custom topic without selecting existing items
      const existingMatch = dbTopics.find(t => t.toLowerCase() === custom.toLowerCase());
      if (existingMatch) {
        finalTopic = existingMatch;
      } else {
        finalTopic = custom;
        try {
          await fetch('/api/topics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: custom, category: 'Пользовательские' }),
          });
        } catch (e) {
          console.error('Error saving custom topic:', e);
        }
      }
    }

    // Always clear search topic after starting
    setSearchTopic('');

    // Save selected topic to recent topics list
    if (finalTopic) {
      addRecentTopic(finalTopic);
    }

    if (game.id === 'melody' && dbTopics.length === 0) {
      alert('Игра "Уквакай Мелодию" временно недоступна.');
      return;
    }

    onStart({ 
      mode: 'lite', 
      difficulty: game.id === 'jeopardy' ? 'progressive' : difficulty, 
      price: totalPrice, 
      topic: finalTopic, 
      note: gameNote.trim(),
      playMode,
      multiMode: playMode === 'multi' ? 'online' : undefined,
      visibility: playMode === 'multi' ? mpVisibility : 'public',
      maxPlayers: playMode === 'multi' ? mpMaxPlayers : 1
    });
  };

  const handleStartSavedPack = (pack: any) => {
    if (pack?.topic) {
      addRecentTopic(pack.topic);
    }
    onStart({
      mode: 'lite',
      difficulty: pack.difficulty || 'people',
      price: 0, // Replaying saved packs is free
      topic: pack.topic,
      questions: pack.questions,
      preloadedQuestions: pack.questions,
      packId: pack.id,
      playMode: playMode as any,
      multiMode: playMode === 'multi' ? 'online' : undefined,
      visibility: playMode === 'multi' ? mpVisibility : 'public',
      maxPlayers: playMode === 'multi' ? mpMaxPlayers : 1,
      isReplay: true
    } as any);
  };

  const modalTree = (
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-transparent px-[2%] py-3 sm:p-4">
        <div className="w-full max-w-lg sm:max-w-[680px] lg:max-w-[720px] rounded-3xl border border-primary/35 bg-[#080a05]/72 shadow-[0_8px_32px_0_rgba(0,0,0,0.85)] overflow-hidden text-foreground transition-all flex flex-col max-h-[92vh]">
          
          {/* Header */}
          <div className="w-full bg-black/35 border-b border-primary/20 px-[2%] sm:px-5 md:px-7 py-3.5 relative flex items-center justify-center shrink-0 min-h-[52px]">
            <h2 className="text-base md:text-lg font-black tracking-tight text-center text-foreground drop-shadow-[0_0_10px_rgba(131,196,46,0.3)]">
              {game.title}
            </h2>

            <button
              onClick={() => {
                audioSystem.playSlot('ui_modal_close');
                onClose();
              }}
              className="absolute right-[2%] sm:right-5 md:right-7 rounded-xl p-2 bg-transparent backdrop-blur-md hover:bg-primary/15 border border-primary/25 transition-all text-foreground/80 hover:text-foreground"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="overflow-y-auto overflow-x-hidden px-[2%] py-4 sm:p-5 md:p-7 space-y-5 custom-scrollbar min-w-0">
            {/* Play Mode Selector: vertical list on mobile, grid on desktop */}
            <div className="space-y-2">
              <label className="block text-base font-bold text-foreground/90 text-center">Режим игры</label>
              <div className={`flex flex-col sm:grid ${profile ? (supportedModes.includes('multi') ? 'sm:grid-cols-3' : 'sm:grid-cols-2') : 'sm:grid-cols-1'} gap-2`}>
                {supportedModes.includes('single') && (
                  <LeafButton
                    type="button"
                    active={playMode === 'single'}
                    variant={playMode === 'single' ? 'primary' : 'dark'}
                    size="sm"
                    onClick={() => setPlayMode('single')}
                    icon={<User size={16} />}
                    className="w-full text-sm py-2.5"
                  >
                    Одиночная
                  </LeafButton>
                )}
                {Boolean(profile) && supportedModes.includes('multi') && (
                  <LeafButton
                    type="button"
                    active={playMode === 'multi'}
                    variant={playMode === 'multi' ? 'primary' : 'dark'}
                    size="sm"
                    onClick={() => setPlayMode('multi')}
                    icon={<Users size={16} />}
                    className="w-full text-sm py-2.5"
                  >
                    Мультиплеер
                  </LeafButton>
                )}
                {Boolean(profile) && (
                  <LeafButton
                    type="button"
                    active={false}
                    variant="dark"
                    size="sm"
                    onClick={() => {
                      onClose();
                      navigate(`/profile/history?game=${game.id}`);
                    }}
                    icon={<History size={16} />}
                    className="w-full text-sm py-2.5"
                  >
                    История игр
                  </LeafButton>
                )}
              </div>
            </div>

            {/* Multiplayer Lobby Settings: Open/Closed & Player Limit 2..8 */}
            {playMode === 'multi' && (
              <div className="rounded-2xl bg-black/40 border border-primary/35 px-[2%] py-3.5 sm:p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-bold text-primary flex items-center gap-1.5">
                      <Users size={16} />
                      <span>Вид мультиплеера</span>
                    </span>
                    <span className="text-sm text-foreground/70">
                      {mpVisibility === 'public'
                        ? 'Видна всем во вкладке Мультиплеер'
                        : 'Видна только вступившим по приглашению'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <LeafButton
                      type="button"
                      active={mpVisibility === 'public'}
                      variant={mpVisibility === 'public' ? 'primary' : 'dark'}
                      size="sm"
                      onClick={() => setMpVisibility('public')}
                      icon={<Globe size={16} />}
                      className="w-full text-sm py-2.5 justify-center"
                    >
                      Открытая (для всех)
                    </LeafButton>
                    <LeafButton
                      type="button"
                      active={mpVisibility === 'private'}
                      variant={mpVisibility === 'private' ? 'primary' : 'dark'}
                      size="sm"
                      onClick={() => setMpVisibility('private')}
                      icon={<Lock size={16} />}
                      className="w-full text-sm py-2.5 justify-center"
                    >
                      Закрытая (по приглашению)
                    </LeafButton>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-primary/20">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-bold text-primary">
                      Лимит игроков в лобби
                    </span>
                    <BubbleElement isBadge active size="sm">
                      Максимум: {mpMaxPlayers} уч.
                    </BubbleElement>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {[2, 3, 4, 5, 6, 7, 8].map(num => (
                      <BubbleElement
                        key={`mp-limit-${num}`}
                        as="button"
                        type="button"
                        active={mpMaxPlayers === num}
                        size="sm"
                        onClick={() => setMpMaxPlayers(num)}
                        className="w-full justify-center py-2 text-sm font-black"
                      >
                        {num}
                      </BubbleElement>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Rules Box (Dynamically switches between Single and Multiplayer rules) */}
            <div className="rounded-2xl bg-black/40 border border-primary/25 px-[2%] py-3.5 sm:p-4 space-y-3">
              
              {game.tag && (
                <div className="pb-1 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-bold px-3 py-1 rounded-full bg-transparent text-primary border border-primary/35 inline-block">
                    {game.tag}
                  </span>
                  <BubbleElement isBadge active size="sm">
                    <span className="text-sm font-bold">
                      {playMode === 'multi' ? 'Онлайн мультиплеер' : 'Одиночная игра'}
                    </span>
                  </BubbleElement>
                </div>
              )}

              <div className="flex items-center justify-between text-primary font-bold">
                <div className="flex items-center gap-2">
                  <Info size={18} />
                  <span className="text-base font-bold">
                    Правила ({playMode === 'multi' ? 'Мультиплеер' : 'Одиночная'})
                  </span>
                </div>
                
                <BubbleElement isBadge size="sm">
                  <span className="text-sm font-bold">{questionCount} вопросов</span>
                </BubbleElement>
              </div>

              <p className="text-sm text-foreground/90 leading-relaxed">
                {getGameDetailedRules(game.id, playMode, game.rules || game.description)}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-primary/15 text-sm">
                <div className="flex items-center gap-1.5 text-foreground/80">
                  <span>⏱️ Время на ответ:</span>
                  <span className="font-bold text-primary">{timeLimit} сек/вопр</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-foreground/80">Стоимость:</span>
                  <span className="text-primary font-bold bg-transparent border border-primary/35 px-2.5 py-0.5 rounded-full text-sm">
                    {formatPricePerQuestion(pricePerQuestion)}
                  </span>
                </div>
              </div>

              {gameBlogSlugs[game.id] && (
                <div className="pt-2 border-t border-primary/15 flex justify-end">
                  <BubbleElement
                    size="sm"
                    onClick={() => {
                      onClose();
                      navigate(`/blog/${gameBlogSlugs[game.id]}`);
                    }}
                    icon={<BookOpen size={14} />}
                    className="text-sm font-bold"
                  >
                    <span>Подробный обзор и секреты игры в блоге</span>
                  </BubbleElement>
                </div>
              )}
            </div>

            {/* Topic Selector & Server Search */}
            {showTopicSelection && (
              <div className="space-y-3">
                {/* Centered Inactive Bubble for Topic Counter */}
                <div className="flex justify-center w-full">
                  <BubbleElement isBadge active={false} size="sm" className="pointer-events-none cursor-default font-bold text-sm py-1 px-4 border border-primary/30">
                    Всего тем в базе: {totalTopicsCount}
                  </BubbleElement>
                </div>

                {/* Selected topics displayed ABOVE the container in real-time */}
                {selectedTopics.length > 0 && (
                  <div className="space-y-2 px-[2%] py-3 sm:p-3 rounded-2xl bg-black/40 border border-primary/30">
                    <div className="flex items-center justify-between text-sm font-bold text-foreground/90 px-1">
                      <span>{game.id === 'jeopardy' ? 'Главная тема игры:' : `Выбранные темы (${selectedTopics.length}):`}</span>
                      <button
                        type="button"
                        onClick={handleResetTopics}
                        className="text-primary hover:underline text-sm flex items-center gap-1 font-bold cursor-pointer"
                      >
                        <RotateCcw size={14} />
                        Сбросить
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {selectedTopics.map((t, idx) => {
                        const isCustom = customTopics.includes(t) || !dbTopics.some(d => d.toLowerCase() === t.toLowerCase());
                        return (
                          <BubbleElement
                            key={`sel-top-${t}-${idx}`}
                            type="button"
                            active={true}
                            size="sm"
                            onClick={() => handleToggleTopic(t)}
                            icon={<X size={14} />}
                            className="m-0.5 text-sm font-bold"
                          >
                            <span className="inline-flex items-center gap-1">
                              {isCustom && <Sparkles size={14} className="text-primary shrink-0 animate-pulse" />}
                              <span>{t}</span>
                              {isCustom && <span className="text-sm font-normal opacity-85">(своя)</span>}
                            </span>
                          </BubbleElement>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Initial Topic Container: Shows first rows without extra text captions, opens modal on click */}
                <div 
                  onClick={() => setIsTopicModalOpen(true)}
                  className="group relative cursor-pointer rounded-2xl border border-primary/30 bg-black/40 px-[2%] py-3 sm:p-3 transition-all hover:border-primary"
                >
                  <div className="max-h-[110px] overflow-hidden">
                    <TopicCloud 
                      topics={dbTopics.length > 0 ? dbTopics : ['Общие знания']}
                      selectedTopics={selectedTopics}
                      onToggle={handleToggleTopic}
                      maxHeightClass="max-h-[105px]"
                      hideHeader={true}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Difficulty Selection (Hidden for Millionaire, 100to1, and Jeopardy) */}
            {game.id === 'jeopardy' && (
              <div className="flex items-center justify-center px-[2%] py-3 sm:p-3 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl">
                <BubbleElement isBadge size="sm" className="text-sm font-semibold text-foreground/90 border border-primary/30">
                  Сложность растет с каждым туром и номиналом вопроса
                </BubbleElement>
              </div>
            )}

            {game.id !== 'millionaire' && game.id !== '100to1' && game.id !== 'jeopardy' && (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <label className="block text-base font-bold text-foreground/90 text-center">
                    Сложность игры
                  </label>
                  <BubbleElement
                    as="button"
                    type="button"
                    size="sm"
                    active={isDifficultyInfoOpen}
                    onClick={() => setIsDifficultyInfoOpen(true)}
                    className="!px-2 !py-1 text-primary"
                    title="Подробная информация об уровнях сложности"
                  >
                    <HelpCircle size={16} className="text-primary" />
                  </BubbleElement>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {DIFFICULTIES.map(d => (
                    <div key={d.id} className="relative group/diff">
                      <LeafButton
                        type="button"
                        active={difficulty === d.id}
                        variant={difficulty === d.id ? 'primary' : 'dark'}
                        onClick={() => setDifficulty(d.id)}
                        size="sm"
                        className="w-full text-sm py-2.5"
                      >
                        {d.name}
                      </LeafButton>

                      {/* Liquid Glass Info Tooltip on Hover */}
                      <div className="hidden sm:block pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-2xl border border-primary/45 bg-[#080a05]/95 backdrop-blur-3xl p-3 text-center text-sm opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.85)] transition-all duration-200 group-hover/diff:opacity-100 group-hover/diff:translate-y-0 translate-y-1 z-40">
                        <p className="font-black text-primary text-sm">{d.name} ({d.level})</p>
                        <p className="text-sm text-foreground/95 mt-1 leading-snug">{d.description}</p>
                        <p className="text-sm text-primary font-mono font-bold mt-1.5">Множитель очков: x{d.multiplier}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mini Audio Field for Game Note & 10 Prompt Style Bubbles */}
            {showTopicSelection && (
              <MiniAudioField
                value={gameNote}
                onChange={setGameNote}
                label="Примечание к игре (дополнение в промпт ИИ)"
                placeholder="Опишите свои пожелания к вопросам (или надиктуйте голосом / выберите шаблон стиля ниже)..."
              />
            )}

            {/* Start Game Action Button */}
            <div className="pt-2 space-y-2">
              {showTopicSelection && selectedTopics.length === 0 && searchTopic.trim().length < 2 && (
                <div className="flex justify-center">
                  <BubbleElement isBadge size="sm" className="text-sm font-bold text-amber-400 border border-amber-500/30">
                    Выберите хотя бы одну тему для старта игры
                  </BubbleElement>
                </div>
              )}
              <LeafButton
                type="button"
                variant={showTopicSelection && selectedTopics.length === 0 && searchTopic.trim().length < 2 ? 'dark' : 'primary'}
                size="lg"
                disabled={showTopicSelection && selectedTopics.length === 0 && searchTopic.trim().length < 2}
                onClick={handleStartGame}
                className="w-full font-black text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {game.id === 'melody' && dbTopics.length === 0 
                  ? 'Скоро' 
                  : (showTopicSelection && selectedTopics.length === 0 && searchTopic.trim().length < 2 
                      ? 'Выберите тему для старта' 
                      : 'Начать игру'
                    )
                }
              </LeafButton>
            </div>
          </div>
        </div>
      </div>

      {/* Separate Modal Window for Topic Selection with Scrolling & Sticky Close Icon */}
      {isTopicModalOpen && (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-transparent px-[2%] py-3 sm:p-5 animate-in fade-in">
          <div className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-3xl border border-primary/35 bg-[#080a05]/78 shadow-[0_16px_48px_0_rgba(0,0,0,0.85)] relative overflow-hidden text-foreground">
            
            {/* Sticky Header with Search & Sticky Close Icon following scroll */}
            <div className="sticky top-0 z-50 bg-black/45 border-b border-primary/20 px-[2%] py-3.5 sm:p-4 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-primary">Выбор тем для игры</h3>
                <button
                  type="button"
                  onClick={() => setIsTopicModalOpen(false)}
                  className="rounded-xl p-2 bg-transparent hover:bg-primary/15 border border-primary/25 text-primary transition-all font-bold cursor-pointer"
                  title="Закрыть выбор тем"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <input 
                    type="text"
                    value={searchTopic}
                    onChange={(e) => setSearchTopic(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = searchTopic.trim();
                        if (val.length >= 2) {
                          handleAddCustomTopic(val);
                        }
                      }
                    }}
                    placeholder="Поиск темы или введите свою..."
                    className="w-full rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl p-3 pr-10 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:border-primary transition-all shadow-inner"
                  />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-primary">
                    {isSearching ? <Sparkles size={16} className="animate-spin" /> : <Search size={16} />}
                  </div>
                </div>
                <VoiceInputBubble
                  onTranscript={(text) => setSearchTopic(text)}
                  currentValue={searchTopic}
                  mode="append"
                  size="sm"
                  tooltip="🎤 Начать запись"
                />
              </div>

              {/* Real-time Custom Topic Creation Badge if not in database */}
              {searchTopic.trim().length >= 2 && !dbTopics.some(t => t.toLowerCase() === searchTopic.trim().toLowerCase()) && (
                <div className="pt-1">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleAddCustomTopic(searchTopic.trim())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleAddCustomTopic(searchTopic.trim());
                      }
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-xl hover:border-primary text-foreground transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Sparkles size={16} className="text-primary animate-pulse shrink-0" />
                      <span className="text-left break-words">
                        Своя тема: <span className="text-primary font-black">«{searchTopic.trim()}»</span>
                      </span>
                    </div>
                    <BubbleElement isBadge active={true} size="sm" className="shrink-0 pointer-events-none ml-2 text-sm">
                      + Выбрать
                    </BubbleElement>
                  </div>
                </div>
              )}
            </div>

            {/* Scrollable Body containing all topics */}
            <div className="overflow-y-auto overflow-x-hidden px-[2%] py-3.5 sm:p-4 space-y-4 custom-scrollbar flex-1 min-w-0">
              {/* Selected topics displayed ABOVE the container in modal */}
              {selectedTopics.length > 0 && (
                <div className="space-y-2 px-[2%] py-3 sm:p-3 rounded-2xl bg-transparent border border-primary/30 backdrop-blur-xl">
                  <div className="flex items-center justify-between text-sm font-bold text-foreground/90 px-1">
                    <span>{game.id === 'jeopardy' ? 'Главная тема игры:' : `Выбранные темы (${selectedTopics.length}):`}</span>
                    <button
                      type="button"
                      onClick={handleResetTopics}
                      className="text-primary hover:underline text-sm flex items-center gap-1 font-bold cursor-pointer"
                    >
                      <RotateCcw size={14} />
                      Сбросить
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 max-h-[130px] overflow-y-auto custom-scrollbar">
                    {selectedTopics.map((t, idx) => {
                      const isCustom = customTopics.includes(t) || !dbTopics.some(d => d.toLowerCase() === t.toLowerCase());
                      return (
                        <BubbleElement
                          key={`sel-top-modal-${t}-${idx}`}
                          type="button"
                          active={true}
                          size="sm"
                          onClick={() => handleToggleTopic(t)}
                          icon={<X size={14} />}
                          className="m-0.5 text-sm font-bold"
                        >
                          <span className="inline-flex items-center gap-1">
                            {isCustom && <Sparkles size={14} className="text-primary shrink-0 animate-pulse" />}
                            <span>{t}</span>
                            {isCustom && <span className="text-sm font-normal opacity-85">(своя)</span>}
                          </span>
                        </BubbleElement>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-sm text-foreground/80 font-bold">
                <span>{game.id === 'jeopardy' ? 'Выберите 1 главную тему игры (из неё сгенерируются 15 категорий):' : 'Выберите одну или несколько тем:'}</span>
              </div>

              <TopicCloud 
                topics={dbTopics.length > 0 ? dbTopics : ['Общие знания']}
                selectedTopics={selectedTopics}
                onToggle={(t) => {
                  handleToggleTopic(t);
                }}
                maxHeightClass="max-h-[45vh]"
                hideHeader={true}
              />
            </div>

            {/* Modal Footer */}
            <div className="px-[2%] py-3.5 sm:p-4 border-t border-primary/20 bg-transparent backdrop-blur-2xl flex justify-end">
              <LeafButton
                type="button"
                variant="primary"
                size="md"
                onClick={() => {
                  if (searchTopic.trim().length >= 2 && selectedTopics.length === 0) {
                    handleAddCustomTopic(searchTopic.trim());
                  }
                  setIsTopicModalOpen(false);
                }}
                className="px-6 py-2.5 font-bold text-sm"
              >
                Готово ({selectedTopics.length > 0 ? selectedTopics.length : (searchTopic.trim().length >= 2 ? 1 : 0)})
              </LeafButton>
            </div>
          </div>
        </div>
      )}

      {/* Unified Difficulty Information Modal with Liquid Glass */}
      {isDifficultyInfoOpen && (
        <div
          className="fixed inset-0 z-[10010] flex items-center justify-center bg-transparent px-[2%] py-4 sm:p-5 animate-in fade-in"
          onClick={() => setIsDifficultyInfoOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-primary/40 bg-[#080a05]/78 p-5 sm:p-6 shadow-[0_16px_48px_rgba(0,0,0,0.85)] text-foreground space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-primary/25 pb-3">
              <div className="flex items-center gap-2.5">
                <HelpCircle size={20} className="text-primary shrink-0" />
                <h3 className="text-lg font-black text-primary">Уровни сложности игры</h3>
              </div>
              <BubbleElement
                as="button"
                type="button"
                size="sm"
                onClick={() => setIsDifficultyInfoOpen(false)}
                className="!p-2"
              >
                <X size={18} />
              </BubbleElement>
            </div>

            <div className="space-y-3 max-h-[65vh] overflow-y-auto custom-scrollbar pr-1">
              {DIFFICULTIES.map(d => {
                const isSelected = difficulty === d.id;
                return (
                  <div
                    key={`diff-info-${d.id}`}
                    onClick={() => {
                      setDifficulty(d.id);
                      setIsDifficultyInfoOpen(false);
                    }}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all space-y-1.5 backdrop-blur-xl ${
                      isSelected
                        ? 'border-primary bg-transparent shadow-[0_0_20px_rgba(182,255,46,0.2)]'
                        : 'border-primary/25 bg-transparent hover:border-primary/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-base font-black text-primary">
                        {d.name} ({d.level})
                      </span>
                      <BubbleElement isBadge active={isSelected} size="sm">
                        Множитель: x{d.multiplier}
                      </BubbleElement>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed">
                      {d.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-primary/20 flex justify-end">
              <LeafButton
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setIsDifficultyInfoOpen(false)}
              >
                Понятно
              </LeafButton>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient Balance Modal for registered users */}
      <InsufficientBalanceModal
        isOpen={isInsufficientBalanceOpen}
        onClose={() => setIsInsufficientBalanceOpen(false)}
        requiredAmount={totalPrice}
        currentBalance={profile ? profile.balance : 0}
      />
    </>
  );

  return typeof document !== 'undefined' ? createPortal(modalTree, document.body) : modalTree;
};
