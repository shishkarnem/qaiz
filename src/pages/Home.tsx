import React, { useState, useEffect, useRef, useId } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useFrogSound } from '../hooks/useSound';
import { AuthModal } from '../components/AuthModal';
import { GameStartModal } from '../components/GameStartModal';
import { BubbleElement } from '../components/ui/BubbleElement';
import { getGameModes, getModeLabel, formatPricePerQuestion, getGameShortRules } from '../lib/gameHelpers';
import { db } from '../db';
import { APP_VERSION } from '../shared/version';
import { safeParseResponseJson } from '../utils/network/safeFetchJson';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';
import { 
  Users, 
  ChevronRight,
  RotateCcw,
  Globe
} from 'lucide-react';

/* ========================================================================= */
/* 1. LILY PAD / WATER LILY LEAF SVG BUTTON (ЛИСТОК КУВШИНКИ)                */
/* ========================================================================= */
interface LilyPadButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  variant?: 'primary' | 'secondary' | 'dark';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const LilyPadButton = ({ 
  children, 
  onClick, 
  className = '', 
  variant = 'primary',
  size = 'md' 
}: LilyPadButtonProps) => {
  const clipId = useId();

  const getSolidColor = () => {
    if (variant === 'secondary') return { fill: '#507d2a', stroke: '#99d037' };
    if (variant === 'dark') return { fill: '#080a05', stroke: '#507d2a' };
    return { fill: '#99d037', stroke: '#ffffff' };
  };

  const colors = getSolidColor();
  const isXL = size === 'xl' || size === 'lg';

  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center justify-center group cursor-pointer border-none bg-transparent outline-none transition-transform duration-200 hover:scale-105 active:scale-95 ${
        isXL 
          ? 'min-w-[240px] sm:min-w-[340px] md:min-w-[400px] px-8 sm:px-14 py-5 sm:py-7' 
          : 'min-w-[150px] sm:min-w-[200px] px-5 sm:px-8 py-3.5'
      } ${className}`}
    >
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 220 80"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={clipId}>
            <path d="M 12,40 C 12,10 35,6 110,6 C 175,6 200,10 208,28 L 175,42 L 208,54 C 200,70 175,74 110,74 C 35,74 12,70 12,40 Z" />
          </clipPath>
        </defs>

        <path
          d="M 12,40 C 12,10 35,6 110,6 C 175,6 200,10 208,28 L 175,42 L 208,54 C 200,70 175,74 110,74 C 35,74 12,70 12,40 Z"
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth={isXL ? '3' : '2'}
        />
        <path
          d="M 175,42 L 110,40 M 175,42 L 140,20 M 175,42 L 140,62 M 175,42 L 70,22 M 175,42 L 70,58"
          stroke="#ffffff"
          strokeOpacity="0.3"
          strokeWidth="1.2"
          strokeDasharray="3 2"
          fill="none"
        />
      </svg>
      <span className={`relative z-10 flex items-center justify-center gap-2.5 font-bold text-black dark:text-white drop-shadow-md whitespace-nowrap ${
        isXL ? 'text-xl sm:text-3xl md:text-4xl' : 'text-sm sm:text-base'
      }`}>
        {children}
      </span>
    </button>
  );
};

/* ========================================================================= */
/* 2. MAIN HOMEPAGE COMPONENT                                                 */
/* ========================================================================= */
export const HomePage = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [selectedGameForModal, setSelectedGameForModal] = useState<any>(null);
  const [initialPlayMode, setInitialPlayMode] = useState<'single' | 'multi'>('single');
  const { playCroak } = useFrogSound();
  const [activeCategory, setActiveCategory] = useState<'all' | 'single' | 'multi'>('all');
  const [isMobileView, setIsMobileView] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    const checkViewport = () => {
      setIsMobileView(window.innerWidth < 640);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport, { passive: true });
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Reset cache and force dark theme on landing page enter
  useEffect(() => {
    try {
      localStorage.removeItem('design_tweaks_qaiz_v5');
      localStorage.removeItem('theme');
      sessionStorage.removeItem('pending_ref');
    } catch (e) {
      // ignore
    }
    const root = window.document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');
  }, []);

  // Simplified, lightweight scroll transforms (active on desktop only)
  const { scrollY } = useScroll();
  const headlineY = useTransform(scrollY, [0, 380], [0, 36]);
  const logoY = useTransform(scrollY, [0, 380], [0, -24]);

  const [dbGames, setDbGames] = useState<any[]>([]);
  const [appVersion, setAppVersion] = useState<string>(APP_VERSION);

  useEffect(() => {
    fetch(`/api/system-config/version?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? safeParseResponseJson(r) : null))
      .then((d) => {
        if (d?.version) setAppVersion(String(d.version));
      })
      .catch(() => {});

    const handleVersionEvent = (e: any) => {
      if (e?.detail?.version) setAppVersion(String(e.detail.version));
    };
    window.addEventListener('qaiz_version_updated', handleVersionEvent);

    const fetchGames = async () => {
      try {
        const res = await fetch('/api/games');
        if (!res.ok) return;
        const json = await safeParseResponseJson(res);
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          setDbGames(json.data.map((g: any) => ({
            id: g.id,
            title: g.title,
            subtitle: g.subtitle,
            description: g.description,
            image: g.image_url,
            category: g.category,
            questionCount: g.question_count,
            path: g.path,
            tag: g.tag,
            price: g.price_text,
            price_per_question: g.price_per_question,
            rules: g.rules,
            comingSoon: Boolean(g.coming_soon)
          })));
        }
      } catch (_) {}
    };
    fetchGames();
  }, []);

  const defaultGames = [
    {
      id: 'blitz',
      title: 'КвИИЗ',
      subtitle: 'Скоростной ИИ-спринт',
      description: 'Быстрые вопросы на время от нейросети.',
      image: '/file/18/blitz.png',
      category: 'single',
      questionCount: 10,
      path: '/game/blitz',
      tag: '🔥 Популярное',
      price: '1 ИИкра / вопр.',
      rules: 'Текстовый ввод ответов. 60 секунд на каждый вопрос, генерируемый нейросетью.',
    },
    {
      id: 'millionaire',
      title: 'Квиллионер',
      subtitle: '15 шагов к вершине',
      description: 'Классическая интеллектуальная лестница.',
      image: '/file/19/millionaire.png',
      category: 'single',
      questionCount: 15,
      path: '/game/millionaire',
      tag: '💎 Топ Режим',
      price: '1 ИИкра / вопр.',
      rules: 'Ответьте на 15 вопросов. Используйте подсказки: 50/50 и Помощь Нейросети.',
    },
    {
      id: '100to1',
      title: 'Сто Квадному',
      subtitle: 'Народная мудрость',
      description: 'Угадайте самые частые ответы участников на улице и в опросах.',
      image: '/file/16/100to1.png',
      category: 'single',
      questionCount: 24,
      path: '/game/100to1',
      tag: '🎯 Логика',
      price: '1 ИИкра / вопр.',
      rules: 'Угадывайте варианты ответов большинства людей за минимум времени.',
    },
    {
      id: 'whatwherewhen',
      title: 'Что? Где? Квада?',
      subtitle: 'Элитарный Клуб',
      description: 'Интеллектуальный вызов для знатоков.',
      image: '/file/20/whatwherewhen.png',
      category: 'single',
      questionCount: 11,
      path: '/game/whatwherewhen',
      tag: '🧠 Хардкор',
      price: '2 ИИкры / вопр.',
      rules: 'Глубокие вопросы на логику, ассоциации и нестандартное мышление.',
    },
    {
      id: 'jeopardy',
      title: 'Своя Икра',
      subtitle: 'Квазино Викторина',
      description: 'Выбирайте темы и стоимость вопросов.',
      image: '/file/17/jeopardy.png',
      category: 'single',
      questionCount: 76,
      path: '/game/jeopardy',
      tag: '⚔️ Азарт',
      price: '1 ИИкра / вопр.',
      rules: 'Сражение с соперниками за зачетные очки в произвольных категориях.',
    },
    {
      id: 'melody',
      title: 'Уквакай Мелодию',
      subtitle: 'Музыкальный Ринг',
      description: 'Угадайте трек или исполнителя по нескольким аккордам.',
      image: '/file/15/melody.png',
      category: 'single',
      questionCount: 25,
      path: '/game/melody',
      tag: '🎵 Музыкальный Квиз',
      price: 'Скоро',
      comingSoon: true,
      rules: 'Слушайте фрагмент мелодии и выбирайте правильный вариант ответа.',
    }
  ];

  const games = dbGames.length > 0 ? dbGames : defaultGames;

  // Check URL params for start_game and mode (e.g. from Multiplayer Lobby)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gameParam = params.get('start_game');
    const modeParam = params.get('mode') as 'single' | 'multi' | null;

    if (gameParam && games.length > 0) {
      const found = games.find((g: any) => g.id === gameParam);
      if (found) {
        if (profile && (modeParam === 'multi' || modeParam === 'single')) {
          setInitialPlayMode(modeParam);
        } else {
          setInitialPlayMode('single');
        }
        setSelectedGameForModal(found);
        params.delete('start_game');
        params.delete('mode');
        const newSearch = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''));
      }
    }
  }, [games, profile]);

  const filteredGames = games.filter(game => {
    if (activeCategory === 'all') return true;
    const modes = getGameModes(game.id);
    return modes.includes(activeCategory as 'single' | 'multi');
  });

  return (
    <div className="relative min-h-screen space-y-8 sm:space-y-12 pb-20 sm:pb-8 text-foreground">
      {/* =================================================================== */}
      {/* 1. HERO SECTION (OPTIMIZED & LIGHTWEIGHT)                           */}
      {/* =================================================================== */}
      <section className="relative w-full min-h-[68vh] sm:min-h-[82vh] flex flex-col items-center justify-between pt-2 sm:pt-4 pb-4 sm:pb-8 px-2 sm:px-4 bg-transparent border-none shadow-none z-10">
        
        {/* Title + Subtitle Container */}
        <motion.div 
          style={isMobileView ? undefined : { y: headlineY }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full text-center max-w-5xl mx-auto space-y-3.5 sm:space-y-4 pt-1 sm:pt-2 px-1"
        >
          <h1 className="text-3xl sm:text-6xl md:text-7xl font-black tracking-tight text-foreground leading-tight break-words flex flex-col items-center">
            <span>Интеллектуальные</span>
            <span className="text-primary underline decoration-primary/40 underline-offset-8">ИИ-Викторины</span>
          </h1>

          {/* Subtitle category filters */}
          <div className="flex flex-col items-center justify-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => {
                playCroak();
                setActiveCategory(prev => prev === 'single' ? 'all' : 'single');
              }}
              className={`text-base sm:text-xl font-extrabold transition-colors duration-200 cursor-pointer ${
                activeCategory === 'single'
                  ? 'text-primary underline decoration-primary decoration-2 underline-offset-4'
                  : 'text-foreground/90 hover:text-primary'
              }`}
            >
              Одиночные Игры
            </button>
            <button
              type="button"
              onClick={() => {
                playCroak();
                setActiveCategory(prev => prev === 'multi' ? 'all' : 'multi');
              }}
              className={`text-base sm:text-xl font-extrabold transition-colors duration-200 cursor-pointer ${
                activeCategory === 'multi'
                  ? 'text-primary underline decoration-primary decoration-2 underline-offset-4'
                  : 'text-foreground/90 hover:text-primary'
              }`}
            >
              Мультиплеер с друзьями
            </button>
            <button
              type="button"
              onClick={() => {
                playCroak();
                navigate('/free');
              }}
              className="text-base sm:text-xl font-extrabold transition-colors duration-200 cursor-pointer text-foreground/90 hover:text-primary flex items-center gap-2 pt-0.5"
            >
              <span>Бесплатные игры</span>
              <BubbleElement isBadge active size="sm" className="text-sm font-bold">
                Free
              </BubbleElement>
            </button>

            {/* 5 Game Bubbles below Free games */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-3 max-w-2xl mx-auto">
              {[
                { id: 'blitz', label: 'КвИИз' },
                { id: 'millionaire', label: 'Квиллионер' },
                { id: '100to1', label: 'Сто Квадному' },
                { id: 'whatwherewhen', label: 'Что? Где? Квада?' },
                { id: 'jeopardy', label: 'Своя Икра' },
              ].map((item) => {
                const matchedGame =
                  games.find((g: any) => g.id === item.id || (item.id === 'whatwherewhen' && g.id === 'chgk')) ||
                  defaultGames.find((g: any) => g.id === item.id);
                const modes = getGameModes(matchedGame?.id || item.id);
                const isHighlighted =
                  activeCategory !== 'all' && modes.includes(activeCategory as 'single' | 'multi');

                return (
                  <BubbleElement
                    key={item.id}
                    size="sm"
                    active={isHighlighted}
                    onClick={() => {
                      playCroak();
                      if (matchedGame) {
                        const targetMode =
                          profile && activeCategory === 'multi' && modes.includes('multi') ? 'multi' : 'single';
                        setInitialPlayMode(targetMode);
                        setSelectedGameForModal(matchedGame);
                      }
                    }}
                    className="cursor-pointer text-sm font-bold"
                  >
                    {item.label}
                  </BubbleElement>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* MASCOT LOGO (Lightweight scroll & entrance) */}
        <motion.div
          style={isMobileView ? undefined : { y: logoY }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative z-20 my-3 sm:my-4 flex items-center justify-center cursor-pointer pointer-events-auto will-change-transform"
        >
          <img 
            src={DIRECT_MEDIA_URLS.HERO_LOGO} 
            alt="QAIZ Logo" 
            className="relative z-20 h-[26vh] sm:h-[42vh] max-h-[380px] w-auto object-contain select-none pointer-events-none transition-transform duration-300 sm:hover:scale-105"
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          />
        </motion.div>

      </section>

      {/* =================================================================== */}
      {/* 2A. MOBILE OPTIMIZED GAME CARDS FEED (sm:hidden)                    */}
      {/* Native smooth scroll, zero sticky height-shrinking, Liquid Glass    */}
      {/* =================================================================== */}
      <section className="sm:hidden relative z-20 w-full px-1.5 space-y-5">
        {filteredGames.map((game, index) => (
          <MobileGameCard
            key={`mob-game-${game.id || index}-${index}`}
            game={game}
            onOpenModal={(selectedGame) => {
              const modes = getGameModes(selectedGame.id);
              const targetMode =
                profile && activeCategory === 'multi' && modes.includes('multi') ? 'multi' : 'single';
              setInitialPlayMode(targetMode);
              setSelectedGameForModal(selectedGame);
            }}
          />
        ))}
      </section>

      {/* =================================================================== */}
      {/* 2B. DESKTOP STICKY CARD DECK WITH ALTERNATING SCROLL INFO CARDS     */}
      {/* =================================================================== */}
      {!isMobileView && (() => {
        const stepVh = 105;
        const totalDeckHeightVh = filteredGames.length * stepVh + 100;
        return (
          <section className="hidden sm:block relative z-20 w-full max-w-none px-0 mx-0 pb-0 mb-0">
            <div 
              style={{ height: `${totalDeckHeightVh}vh` }} 
              className="relative w-full px-0 mx-0"
            >
              {filteredGames.map((game, index) => (
                <DesktopGameStackCard 
                  key={`desk-game-${game.id || index}-${index}`} 
                  game={game} 
                  index={index} 
                  stepVh={stepVh}
                  totalDeckHeightVh={totalDeckHeightVh}
                  onOpenModal={(selectedGame) => {
                    const modes = getGameModes(selectedGame.id);
                    const targetMode =
                      profile && activeCategory === 'multi' && modes.includes('multi') ? 'multi' : 'single';
                    setInitialPlayMode(targetMode);
                    setSelectedGameForModal(selectedGame);
                  }}
                />
              ))}
            </div>
          </section>
        );
      })()}

      {/* =================================================================== */}
      {/* 3. SIMPLIFIED LIQUID GLASS FOOTER (BOTH MOBILE & DESKTOP)           */}
      {/* =================================================================== */}
      <LandingFooter appVersion={appVersion} />

      {/* Game Start Modal */}
      {selectedGameForModal && (
        <GameStartModal
          game={selectedGameForModal}
          initialPlayMode={profile ? initialPlayMode : 'single'}
          onClose={() => {
            setSelectedGameForModal(null);
            setInitialPlayMode('single');
          }}
          onStart={(options) => {
            const game = selectedGameForModal;
            setSelectedGameForModal(null);
            setInitialPlayMode('single');
            playCroak();
            if (user && db) {
              db.from('game_sessions').insert({
                user_id: profile?.uid ?? "",
                game_id: game.id,
                topic: options.topic || 'General',
                difficulty: options.difficulty,
                mode: options.mode,
                score: 0,
                status: 'started',
                price_paid: options.price,
                created_at: new Date().toISOString()
              }).then(() => {}).catch(() => {});
            }
            navigate(game.path, { state: options });
          }}
        />
      )}

      {/* Auth Modal */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

    </div>
  );
};

/* ========================================================================= */
/* MOBILE GAME CARD (ULTRA-FAST NATIVE SCROLL + LIQUID GLASS)                */
/* ========================================================================= */
const MobileGameCard = ({
  game,
  onOpenModal
}: {
  game: any;
  onOpenModal: (game: any) => void;
}) => {
  const { playCroak } = useFrogSound();
  const isComingSoon = game.comingSoon || game.id === 'melody';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full rounded-3xl border-2 border-[#99d037]/80 bg-transparent backdrop-blur-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.35)] flex flex-col"
    >
      {/* Top Cover Image */}
      <div className="relative w-full aspect-[16/10] overflow-hidden border-b border-[#99d037]/40">
        <img
          src={game.image}
          alt={game.title}
          loading="lazy"
          className="w-full h-full object-cover object-center select-none pointer-events-none"
          referrerPolicy="no-referrer"
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        />

        {/* Top-left badges */}
        <div className="absolute top-2.5 left-2.5 z-10 flex flex-col items-start gap-1.5 max-w-[58%]">
          <BubbleElement isBadge size="sm" className="text-sm font-bold px-2.5 py-1">
            <span className="truncate">{game.tag || '🔥 Популярное'}</span>
          </BubbleElement>
          {getGameModes(game.id).map((mode, modeIdx) => (
            <BubbleElement
              key={`mob-mode-${game.id}-${mode}-${modeIdx}`}
              isBadge
              size="sm"
              className="text-sm font-bold px-2.5 py-1"
            >
              {getModeLabel(mode)}
            </BubbleElement>
          ))}
        </div>

        {/* Top-right badges */}
        <div className="absolute top-2.5 right-2.5 z-10 flex flex-col items-end gap-1.5 max-w-[42%]">
          <BubbleElement isBadge active size="sm" className="text-sm font-bold px-2.5 py-1">
            {game.price_per_question ? formatPricePerQuestion(game.price_per_question) : game.price}
          </BubbleElement>
          <BubbleElement isBadge size="sm" className="text-sm font-bold px-2.5 py-1">
            Вопросов: {game.questionCount ?? 10}
          </BubbleElement>
        </div>
      </div>

      {/* Bottom Darkened Content */}
      <div className="w-full p-4 flex flex-col items-center text-center space-y-3.5 bg-[#080a05]/90">
        <div className="space-y-1">
          <span className="text-sm font-mono font-bold text-[#99d037] tracking-wide block">
            {game.subtitle}
          </span>
          <h3 className="text-2xl font-black tracking-tight text-white break-words">
            {game.title}
          </h3>
        </div>

        {isComingSoon ? (
          <div className="py-1 flex items-center justify-center w-full">
            <LilyPadButton
              variant="primary"
              size="lg"
              className="cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-xl font-bold text-black">Скоро</span>
            </LilyPadButton>
          </div>
        ) : (
          <div className="py-1 flex items-center justify-center w-full">
            <LilyPadButton
              variant="primary"
              size="lg"
              onClick={(e) => {
                e.stopPropagation();
                playCroak();
                onOpenModal(game);
              }}
            >
              <span>Играть</span>
              <ChevronRight className="w-7 h-7 ml-1 text-black" />
            </LilyPadButton>
          </div>
        )}

        <div className="w-full p-3 rounded-2xl bg-black/65 border border-[#99d037]/45 text-sm text-white/95 space-y-1 text-center">
          <span className="text-sm font-bold text-[#99d037] block">Краткие правила:</span>
          <p className="text-sm leading-snug break-words">
            {getGameShortRules(game.id, game.rules)}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

/* ========================================================================= */
/* DESKTOP STICKY CARD COMPONENT WITH ALTERNATING SCROLL INFO CARDS          */
/* ========================================================================= */
const DesktopGameStackCard = ({ 
  game, 
  index,
  stepVh,
  totalDeckHeightVh,
  onOpenModal 
}: { 
  game: any; 
  index: number; 
  stepVh: number;
  totalDeckHeightVh: number;
  onOpenModal: (game: any) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { playCroak } = useFrogSound();

  const isComingSoon = game.comingSoon || game.id === 'melody';
  const isRightSide = index % 2 === 1;
  const pStartVh = index * stepVh;
  const containerHeightVh = Math.max(100, totalDeckHeightVh - pStartVh);
  const maxScrollDelta = Math.max(1, containerHeightVh - 100);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: index === 0 ? ["start 0.75", "end 0.999"] : ["start 0.001", "end 0.999"]
  });

  // Ensure JS scroll interpolation is used for opacity across all 6 cards (prevents CSS ViewTimeline contain inversion on tall sticky containers)
  if ((scrollYProgress as any)?.accelerate) {
    delete (scrollYProgress as any).accelerate;
  }

  const stepFraction = Math.max(0.08, Math.min(1, stepVh / maxScrollDelta));
  const cardArriveEnd = index === 0 ? 0 : Math.max(0.05, stepFraction * 0.42);

  const cardY = useTransform(
    scrollYProgress,
    index === 0 ? [0, 1] : [0, cardArriveEnd],
    index === 0 ? ['0vh', '0vh'] : ['88vh', '0vh']
  );

  // Game info card scroll appearance: starts after the card arrives so every card 1..6 starts at 10% opacity (90% transparency) in its bottom corner
  const infoStart = index === 0 ? 0.02 : cardArriveEnd;
  const infoEnd = index === 0
    ? Math.min(0.25, stepFraction * 0.72)
    : Math.min(0.96, Math.max(infoStart + 0.08, stepFraction * 0.90));

  const infoOpacity = useTransform(
    scrollYProgress,
    [0, infoStart, infoEnd, 1],
    [0.1, 0.1, 1, 1]
  );

  const infoScale = useTransform(
    scrollYProgress,
    [0, infoStart, infoEnd, 1],
    [0.6, 0.6, 1, 1]
  );

  const startCornerX = isRightSide ? '42%' : '-42%';
  const infoX = useTransform(
    scrollYProgress,
    [0, infoStart, infoEnd, 1],
    [startCornerX, startCornerX, '0%', '0%']
  );

  const infoY = useTransform(
    scrollYProgress,
    [0, infoStart, infoEnd, 1],
    ['42%', '42%', '0%', '0%']
  );

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'absolute',
        top: `${pStartVh}vh`,
        height: `${containerHeightVh}vh`,
        left: 0,
        right: 0
      }}
      className="w-full px-0 mx-0 pointer-events-none"
    >
      <motion.div 
        style={{ 
          zIndex: 10 + index,
          y: cardY,
        }}
        className="sticky top-16 h-[calc(100vh-64px)] w-full flex items-center justify-center px-4 pt-0 mx-0 overflow-hidden pointer-events-auto will-change-transform"
      >
        <div className="flex w-full max-w-[calc((100vh-88px)*16/9)] aspect-video max-h-[calc(100vh-88px)] mx-auto relative rounded-3xl border-2 border-[#99d037] overflow-hidden shadow-2xl bg-transparent items-center justify-center">
          <div className="relative w-full h-full bg-transparent border-none p-0 overflow-hidden rounded-3xl">
            <img 
              src={game.image} 
              alt={game.title} 
              loading="lazy"
              className="w-full h-full object-cover object-center rounded-3xl select-none pointer-events-none"
              referrerPolicy="no-referrer"
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            />

            {/* PINNED TOP BADGES (DESKTOP) */}
            <div className="absolute top-4 inset-x-6 z-30 flex flex-row items-start justify-between gap-2 pointer-events-none">
              <div className="flex flex-col items-start gap-1.5 pointer-events-auto">
                {getGameModes(game.id).map((mode, modeIdx) => (
                  <BubbleElement key={`desk-mode-${game.id}-${mode}-${modeIdx}`} isBadge size="md" className="text-sm font-bold px-3.5 py-1.5">
                    {getModeLabel(mode)}
                  </BubbleElement>
                ))}
              </div>

              <div className="flex flex-col items-end gap-1.5 pointer-events-auto">
                <BubbleElement isBadge size="md" className="text-sm font-bold px-3.5 py-1.5">
                  {game.tag || '🔥 Популярное'}
                </BubbleElement>
                <BubbleElement isBadge size="md" className="text-sm font-bold px-3.5 py-1.5">
                  Вопросов: {game.questionCount ?? 10}
                </BubbleElement>
                <BubbleElement isBadge active size="md" className="text-sm font-bold px-3.5 py-1.5">
                  {game.price_per_question ? formatPricePerQuestion(game.price_per_question) : game.price}
                </BubbleElement>
              </div>
            </div>

            {/* GAME INFO CARD OVERLAY: Moves from Bottom-Left / Bottom-Right Corner (x: ±42% -> 0%, y: 42% -> 0%) to Center with +40% Scale & 10%->100% Opacity */}
            <motion.div
              style={{
                opacity: infoOpacity,
                scale: infoScale,
                x: infoX,
                y: infoY,
              }}
              className="absolute inset-0 z-20 w-full h-full flex items-center justify-center p-6 pointer-events-none will-change-transform"
            >
              <div className="w-full max-w-md lg:max-w-lg pointer-events-auto">
                <div className="space-y-3.5 bg-[#080a05]/80 border-2 border-[#99d037]/80 p-5 lg:p-6 rounded-3xl text-white text-center flex flex-col items-center justify-center shadow-[0_14px_40px_rgba(0,0,0,0.85)]">
                  <div className="space-y-1 text-center">
                    <span className="text-sm font-mono font-bold text-[#99d037] tracking-wider block drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                      {game.subtitle}
                    </span>
                    <h3 className="text-3xl lg:text-4xl font-black tracking-tight text-white break-words drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                      {game.title}
                    </h3>
                  </div>

                  <div className="pt-1 flex items-center justify-center">
                    {isComingSoon ? (
                      <LilyPadButton 
                        variant="primary"
                        size="xl"
                        className="cursor-default"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-2xl sm:text-3xl font-black text-black tracking-wider">Скоро</span>
                      </LilyPadButton>
                    ) : (
                      <LilyPadButton 
                        variant="primary"
                        size="xl"
                        onClick={(e) => {
                          e.stopPropagation();
                          playCroak();
                          onOpenModal(game);
                        }}
                      >
                        <span>Играть</span>
                        <ChevronRight className="w-8 h-8 sm:w-9 sm:h-9 ml-2 text-black" />
                      </LilyPadButton>
                    )}
                  </div>

                  <div className="w-full p-3.5 rounded-2xl bg-black/55 border border-[#99d037]/50 text-sm text-white space-y-0.5 text-center shadow-lg">
                    <span className="text-sm font-bold text-[#99d037] block drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">Краткие правила:</span>
                    <p className="text-sm leading-snug drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{getGameShortRules(game.id, game.rules)}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

/* ========================================================================= */
/* 3. LANDING FOOTER (100% TRANSPARENT BACKGROUND & SCROLL RISE ANIMATION)   */
/* ========================================================================= */
const LandingFooter = ({ appVersion }: { appVersion: string }) => {
  const { playCroak } = useFrogSound();
  const footerRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: footerRef,
    offset: ["start 0.98", "start 0.45"]
  });

  if ((scrollYProgress as any)?.accelerate) {
    delete (scrollYProgress as any).accelerate;
  }

  const footerOpacity = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const footerY = useTransform(scrollYProgress, [0, 1], [96, 0]);

  return (
    <motion.footer
      ref={footerRef}
      style={{
        opacity: footerOpacity,
        y: footerY,
      }}
      className="relative z-30 w-full px-1.5 sm:px-4 pt-2 pb-4 will-change-transform"
    >
      <div className="bg-transparent border-2 border-[#99d037]/80 p-4 sm:p-6 rounded-3xl text-white space-y-4 shadow-[0_12px_36px_rgba(0,0,0,0.45)] max-w-4xl mx-auto">
        
        {/* 1. Leaf Buttons */}
        <div className="flex flex-col items-center justify-center gap-2.5 sm:gap-3 w-full">
          <div className="flex justify-center w-full">
            <LilyPadButton 
              variant="primary"
              onClick={() => {
                playCroak();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <span>В начало</span>
              <RotateCcw className="w-5 h-5 ml-1 text-white" />
            </LilyPadButton>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 w-full max-w-2xl mx-auto">
            <a 
              href="https://rent-rop.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <LilyPadButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">Продукт РентРОП</span>
                <Globe className="w-4 h-4 shrink-0 text-white" />
              </LilyPadButton>
            </a>

            <a 
              href="https://t.me/+Qr9hu55w7tEwNjZi" 
              target="_blank" 
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <LilyPadButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">Чат техподдержки</span>
                <Users className="w-4 h-4 shrink-0 text-white" />
              </LilyPadButton>
            </a>

            <a 
              href="https://hr-rr.ru" 
              target="_blank" 
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <LilyPadButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">Робот Рекрутер</span>
                <Globe className="w-4 h-4 shrink-0 text-white" />
              </LilyPadButton>
            </a>

            <a 
              href="https://ii-rr.ru" 
              target="_blank" 
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <LilyPadButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">ИИ Ревизор</span>
                <Globe className="w-4 h-4 shrink-0 text-white" />
              </LilyPadButton>
            </a>

            <a 
              href="https://iismm.ru" 
              target="_blank" 
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <LilyPadButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">ИИSMM</span>
                <Globe className="w-4 h-4 shrink-0 text-white" />
              </LilyPadButton>
            </a>

            <a 
              href="https://aihim.ru" 
              target="_blank" 
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <LilyPadButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">АлхимИИ</span>
                <Globe className="w-4 h-4 shrink-0 text-white" />
              </LilyPadButton>
            </a>
          </div>
        </div>

        {/* 2. Requisites & Legal Info */}
        <div className="border-t border-white/20 pt-4 text-center text-sm text-white/90 space-y-2 font-mono">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 font-bold text-[#99d037] text-sm font-sans">
            <span>© 2026 Квайз</span>
            <span>·</span>
            <span>ИИ-Игры для всех</span>
            <span>·</span>
            <span>ООО «РентРоп»</span>
            <span>·</span>
            <BubbleElement isBadge size="sm" className="text-sm font-bold">
              Версия {appVersion}
            </BubbleElement>
          </div>

          <p className="text-white/85 text-sm max-w-2xl mx-auto leading-relaxed font-sans break-words">
            Юридический адрес: 115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2
          </p>

          <p className="text-white/85 text-sm font-mono">
            ОГРН: 1217700234157 · ИНН: 7726477438
          </p>

          <p className="text-white/90 text-sm font-sans break-words">
            E-mail: <a href="mailto:info@arenda-ropa.com" className="text-[#99d037] underline hover:text-white font-semibold">info@arenda-ropa.com</a> ·{' '}
            <Link to="/oferta" className="text-[#99d037] underline hover:text-white font-semibold">
              Публичная оферта и пользовательское соглашение (152-ФЗ)
            </Link>
          </p>

          <p className="text-white/80 text-sm pt-0.5 font-sans">
            Принимаем к оплате: МИР · Visa · Mastercard
          </p>
        </div>

      </div>
    </motion.footer>
  );
};
