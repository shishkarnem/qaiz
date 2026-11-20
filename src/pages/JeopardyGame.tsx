import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { CoinAnimation } from '../components/CoinAnimation';
import { useFrogSound, audioSystem } from '../hooks/useSound';
import { Trophy, Star, User, Zap, Gift, Gavel, Trash2, Info, X, CheckCircle2, XCircle, HelpCircle, SkipForward, FastForward, Loader2, Timer, Lightbulb, RotateCcw, Home, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { saveGameSession, saveGameProgress, getGameProgress, deleteGameProgress } from '../db';
import { protalkService } from '../services/protalk';
import { balanceService } from '../services/balanceService';
import { GameError } from '../components/GameError';
import { GenerationLoadingScreen } from '../components/GenerationLoadingScreen';
import { TopicRevealScreen } from '../components/TopicRevealScreen';
import { CheckingAnswerModal } from '../components/CheckingAnswerModal';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { VoiceInputBubble } from '../components/ui/VoiceInputBubble';
import { isExactOrCloseAnswerMatch, getRandomCheckSeconds, runSimulatedCheckCountdown, startAICheckCountdown } from '../utils/answerVerification';
import { ScoreCalculationCard } from '../components/ScoreCalculationCard';
import { InsufficientBalanceModal } from '../components/InsufficientBalanceModal';
import { fetchGameScoringRule, GameScoringRule, calculateAuthoritativeScoreClient, ScoreCalculationResult } from '../utils/gameScoring';

import { GameChat, ChatMessage, ChatMessageAttachment } from '../components/GameChat';
import { AI_TEMPLATES, AITemplate } from '../lib/gameHelpers';
import { VideoInviteModal } from '../components/video/VideoInviteModal';
import { ZoomVideoModal } from '../components/ZoomVideoModal';
import { MultiplayerGameWebcamStrip, MultiplayerParticipantInfo } from '../components/video/MultiplayerGameWebcamStrip';
import { MultiplayerCountdownOverlay } from '../components/ui/MultiplayerCountdownOverlay';
import { UserAvatar } from '../components/UserAvatar';
import { Users, Video, Sparkles, UserPlus, Play, Share2 } from 'lucide-react';

interface Question {
  id: string;
  db_id?: string;
  pack_id?: string;
  question_index?: number;
  category: string;
  value: number;
  question: string;
  answer: string;
  hint?: string;
  explanation?: string;
  isAnswered: boolean;
  type: 'normal' | 'cat' | 'auction';
}

interface Category {
  name: string;
  description: string;
  questions: Question[];
}

interface Player {
  id: string;
  name: string;
  score: number;
  isBot: boolean;
  avatar?: string;
  personality?: string;
  difficulty?: string;
}

const ROUND_CONFIGS = [
  { multiplier: 1, baseValues: [100, 200, 300, 400, 500], description: 'Первый раунд: Разминка. Стандартные вопросы.' },
  { multiplier: 2, baseValues: [100, 200, 300, 400, 500], description: 'Второй раунд: Ставки растут. Вопросы становятся сложнее.' },
  { multiplier: 3, baseValues: [100, 200, 300, 400, 500], description: 'Третий раунд: Финишная прямая. Максимальные баллы.' },
];

export const getTopicsForRound = (
  topics: { name: string; description: string; round?: number }[],
  roundNum: number
): { name: string; description: string; round?: number }[] => {
  if (!topics || !Array.isArray(topics) || topics.length === 0) return [];

  // 1. Если массив содержит 15 тем (или достаточно для текущего тура),
  // берем строго срез для соответствующего тура:
  // Раунд 1: 0..4, Раунд 2: 5..9, Раунд 3: 10..14
  const startIdx = Math.max(0, (roundNum - 1) * 5);
  if (topics.length >= startIdx + 5) {
    return topics.slice(startIdx, startIdx + 5).map(t => ({ ...t, round: roundNum }));
  }

  // 2. Поиск тем с явным указанием round (например { round: 3, name: ... })
  const matching = topics.filter(t => Number(t.round) === roundNum);
  if (matching.length >= 5) {
    return matching.slice(0, 5);
  }

  // 3. Если есть хоть какие-то с указанным round
  if (matching.length > 0) {
    return matching;
  }

  // 4. Если срез не пустой
  const chunk = topics.slice(startIdx, startIdx + 5);
  if (chunk.length > 0) {
    return chunk.map(t => ({ ...t, round: roundNum }));
  }

  // 5. Запасной вариант
  return topics.slice(0, 5).map(t => ({ ...t, round: roundNum }));
};

export const JeopardyGame: React.FC = () => {
  const { profile, user, demoBalance, spendBalance, openDemoExhaustedModal } = useAuth();
  const { playCroak } = useFrogSound();
  const location = useLocation();
  const navigate = useNavigate();
  const urlSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const urlRoomParam = urlSearchParams.get('room') || urlSearchParams.get('mp_room') || undefined;
  const urlPackParam = urlSearchParams.get('pack') || urlSearchParams.get('pack_id') || undefined;
  const urlModeParam = urlSearchParams.get('mode') || undefined;
  const rawOptions = location.state || { mode: 'lite', price: 76 };
  const options = useMemo(() => ({
    ...rawOptions,
    playMode: rawOptions?.playMode || (urlModeParam === 'multi' || urlRoomParam ? 'multi' : 'single'),
    mpRoomId: rawOptions?.mpRoomId || rawOptions?.roomId || urlRoomParam,
    packId: rawOptions?.packId || urlPackParam,
    price: rawOptions?.price ?? 76
  }), [rawOptions, urlModeParam, urlRoomParam, urlPackParam]);
  const isMultiplayer = options.playMode === 'multi';
  
  const [packId, setPackId] = useState<string>(() => {
    if (options?.packId && options.packId !== 'pack2') {
      return options.packId;
    }
    return `jeopardy_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  });

  const [round, setRound] = useState(1);
  const [players, setPlayers] = useState<Player[]>(() => {
    const p: Player[] = [{ id: '1', name: profile?.display_name || 'Игрок 1', score: 0, isBot: false }];
    if (options.playMode === 'ai' && options.aiOpponents) {
      options.aiOpponents.forEach((aiId: string, idx: number) => {
        const template = AI_TEMPLATES.find(t => t.id === aiId);
        if (template) {
          p.push({ 
            id: `bot-${idx}`, 
            name: template.name, 
            score: 0, 
            isBot: true,
            avatar: template.avatar,
            personality: template.personality,
            difficulty: template.difficulty
          });
        }
      });
    } else if (options.playMode === 'ai') {
      p.push({ id: '2', name: 'Кибер-Жаба', score: 0, isBot: true });
    }
    return p;
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [answeringPlayerIndex, setAnsweringPlayerIndex] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [showResult, setShowResult] = useState<'correct' | 'wrong' | null>(null);
  const [gameState, setGameState] = useState<'loading' | 'lobby' | 'mp_lobby' | 'mp_generating_round' | 'playing' | 'category_reveal' | 'special' | 'final_bet' | 'final_elimination' | 'final_generating' | 'final_countdown' | 'final_question' | 'final_reveal' | 'game_over' | 'finished' | 'feedback' | 'error'>(() => {
    return options?.resume || options?.isReplay || urlRoomParam ? 'loading' : 'lobby';
  });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; explanation: string; points?: number; answeringUserName?: string | null; userAnswer?: string } | null>(null);
  const [generatingQuestion, setGeneratingQuestion] = useState(false);
  const [generatingRound, setGeneratingRound] = useState(false);
  const [generationTimer, setGenerationTimer] = useState(240);
  const [checking, setChecking] = useState(false);
  const [checkTimer, setCheckTimer] = useState(0);
  const [isCheckTimedOut, setIsCheckTimedOut] = useState(false);
  const checkIntervalRef = useRef<any>(null);
  const checkingRef = useRef(false);
  const isStartingRef = useRef(false);
  const [scoringRule, setScoringRule] = useState<GameScoringRule | null>(null);
  const [scoreCalculation, setScoreCalculation] = useState<ScoreCalculationResult | null>(null);
  const [authoritativeScore, setAuthoritativeScore] = useState<number>(0);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [insufficientReason, setInsufficientReason] = useState('');
  const [insufficientAmount, setInsufficientAmount] = useState(1);
  const [mpJeopardyState, setMpJeopardyState] = useState<any>(null);
  const [mpActionPending, setMpActionPending] = useState(false);
  const hostGeneratingNextRoundRef = useRef<number | null>(null);
  const hostGeneratingFinalRef = useRef<boolean>(false);

  useEffect(() => {
    fetchGameScoringRule('jeopardy', options?.difficulty || 'people').then(rule => {
      if (rule) setScoringRule(rule);
    });
  }, [options?.difficulty]);

  useEffect(() => {
    if ((gameState === 'game_over' || gameState === 'finished') && !scoreCalculation) {
      const userPlayer = players.find(p => p.id === '1');
      const rawUserScore = userPlayer?.score || 0;
      const sorted = [...players].sort((a, b) => b.score - a.score);
      const isWin = sorted[0]?.id === '1';
      calculateAuthoritativeScoreClient({
        gameId: 'jeopardy',
        difficulty: options?.difficulty || 'people',
        score: rawUserScore,
        rawScore: rawUserScore,
        totalQuestions: 75,
        correctAnswers: isWin ? 25 : 10,
        isWin,
        mode: options?.mode
      }).then(res => {
        if (res) {
          setScoreCalculation(res);
          setAuthoritativeScore(res.authoritativeScore);
        }
      });
    }
  }, [gameState, scoreCalculation, players, options?.difficulty, options?.mode]);

  const startCheckTimer = (initialSec = 60) => {
    setCheckTimer(initialSec);
    setIsCheckTimedOut(false);
    if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    checkIntervalRef.current = setInterval(() => {
      setCheckTimer(prev => {
        if (prev <= 1) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
          setIsCheckTimedOut(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopCheckTimer = () => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
  };

  // Special Question States
  const [specialType, setSpecialType] = useState<'cat' | 'auction' | null>(null);
  const [auctionBet, setAuctionBet] = useState(0);
  const [auctionHighBidder, setAuctionHighBidder] = useState<number | null>(null);
  const [customBetInput, setCustomBetInput] = useState<string>('100');

  // Multi-round categories persistence and tracking across all 3 rounds + final
  const [pastRoundsCategories, setPastRoundsCategories] = useState<Record<number, Category[]>>({});

  // Main game topic selected when creating game in modal (default 'Обычные вопросы')
  const [gameTopic, setGameTopic] = useState<string>(() => {
    if (options?.topic && typeof options.topic === 'string' && !options.topic.includes('gq_')) {
      const clean = options.topic.split(',')[0].trim();
      return clean || 'Обычные вопросы';
    }
    return 'Обычные вопросы';
  });

  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
  const [coinAnimKey, setCoinAnimKey] = useState(0);

  const triggerCoinAnimation = useCallback(() => {
    setCoinAnimKey(k => k + 1);
    setShowCoinAnimation(false);
    setTimeout(() => {
      setShowCoinAnimation(true);
      setTimeout(() => setShowCoinAnimation(false), 1500);
    }, 10);
  }, []);

  // Accurate cumulative questions answered across all rounds
  const totalAnsweredCount = useMemo(() => {
    let count = 0;
    Object.values(pastRoundsCategories).forEach(cats => {
      cats.forEach(cat => {
        count += cat.questions.filter(q => q.isAnswered).length;
      });
    });
    categories.forEach(cat => {
      count += cat.questions.filter(q => q.isAnswered).length;
    });
    const baseline = (round - 1) * 25;
    const currentRoundAnswered = categories.flatMap(c => c.questions).filter(q => q.isAnswered).length;
    const computed = Math.max(count, baseline + currentRoundAnswered);
    if (gameState === 'game_over' && selectedQuestion?.id === 'final') {
      return Math.min(76, computed + 1);
    }
    return Math.min(76, computed);
  }, [pastRoundsCategories, categories, round, gameState, selectedQuestion]);

  // Handle hint purchase (cost: 1 AI-coin / ИИкра)
  const handleTakeHint = async () => {
    if (showHint) return;
    const currentBal = profile ? (profile.balance ?? 0) : demoBalance;
    if (currentBal < 1) {
      if (!profile) {
        openDemoExhaustedModal();
      } else {
        setInsufficientAmount(1);
        setInsufficientReason('подсказки в игре Своя Икра');
        setShowInsufficientModal(true);
      }
      return;
    }
    const success = await spendBalance(1, 'Подсказка в игре Своя Икра', packId, selectedQuestion?.id);
    if (success) {
      audioSystem.playSlot('jeopardy_hint_take');
      triggerCoinAnimation();
      setShowHint(true);
    }
  };

  // Handle confirming an auction bet with strict validation against player points
  const handleConfirmAuctionBet = (amount: number) => {
    audioSystem.playSlot('jeopardy_auction_bid_raise');
    const currentPlayer = players[currentPlayerIndex];
    const nominal = selectedQuestion?.value || (round * 100);
    const playerScore = currentPlayer?.score ?? 0;
    const isNegativeOrZero = playerScore <= 0;
    const maxAllowedBet = isNegativeOrZero ? nominal : Math.max(nominal, playerScore);
    const validAmount = isNegativeOrZero ? nominal : Math.max(nominal, Math.min(amount, maxAllowedBet));

    setAuctionBet(validAmount);
    setAnsweringPlayerIndex(currentPlayerIndex);
    setSelectedQuestion(prev => prev ? { ...prev, value: validAmount, type: 'auction' } : null);
    setGameState('playing');
    setTimeLeft(40);
  };

  // Final Round States
  const [finalCategories, setFinalCategories] = useState<string[]>([]);
  const [finalBets, setFinalBets] = useState<Record<string, number>>({});
  const [userFinalBet, setUserFinalBet] = useState<number>(0);
  const [finalQuestionLoading, setFinalQuestionLoading] = useState<boolean>(false);

  const [showCategoryInfo, setShowCategoryInfo] = useState<string | null>(null);

  // Store all 15 topics for 3 rounds
  const [allTopics, setAllTopics] = useState<{name: string, description: string}[]>([]);
  const [topicRevealIndex, setTopicRevealIndex] = useState(0);
  const [showTopicReveal, setShowTopicReveal] = useState(false);

  const [timeLeft, setTimeLeft] = useState(40);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    audioSystem.preloadGameBatch('jeopardy', Boolean(isMultiplayer));
    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [isMultiplayer]);

  const prevJeopardyPhaseRef = useRef<string | null>(null);
  const prevJeopardyRoundRef = useRef<number | null>(null);

  // Jeopardy background music & state transition sounds
  useEffect(() => {
    if (gameState === 'lobby' || gameState === 'category_reveal') {
      audioSystem.playBackground('jeopardy_bg_intro');
    } else if (gameState === 'mp_lobby') {
      audioSystem.playBackground('mp_bg_waiting_room');
    } else if (gameState === 'final_question') {
      audioSystem.playBackground('jeopardy_bg_final_think_30s');
    } else if (gameState === 'final_reveal') {
      audioSystem.playSlot('jeopardy_final_reveal_card');
    } else if (gameState === 'game_over') {
      audioSystem.playSlot('jeopardy_victory_fanfare');
    } else if (
      gameState === 'playing' ||
      gameState === 'special' ||
      gameState === 'feedback' ||
      gameState === 'final_elimination' ||
      gameState === 'final_bet'
    ) {
      const roundBg =
        round === 2
          ? 'jeopardy_bg_round_2'
          : round === 3
          ? 'jeopardy_bg_round_3'
          : 'jeopardy_bg_round_1';
      audioSystem.playBackground(roundBg);
      if (gameState === 'playing' && prevJeopardyRoundRef.current !== round) {
        prevJeopardyRoundRef.current = round;
        audioSystem.playSlot('jeopardy_board_fill');
      }
    }
    prevJeopardyPhaseRef.current = gameState;
  }, [gameState, round]);

  // Requirement 6: Always scroll to top when opening the page (single or multiplayer), starting a tour, or entering lobby/round states
  const scrollToTopOfPage = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    }
    if (typeof document !== 'undefined') {
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      const mainEl = document.querySelector('main');
      if (mainEl) mainEl.scrollTop = 0;
    }
  }, []);

  const handleResume = async () => {
    const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
    const resumePackId = options?.packId || packId;
    if (!resumePackId) {
      setGameState('lobby');
      return;
    }
    setLoading(true);
    try {
      const progress = await getGameProgress(String(activeUid), resumePackId, 'jeopardy');
      let loadedState = progress?.state;
      if (typeof loadedState === 'string') {
        try { loadedState = JSON.parse(loadedState); } catch (_) {}
      }

      if (loadedState) {
        if (loadedState.mpRoomId && !existingMpRoomId) {
          navigate(`/game/jeopardy?room=${encodeURIComponent(String(loadedState.mpRoomId))}&pack=${encodeURIComponent(String(resumePackId))}&mode=multi`, {
            replace: true,
            state: {
              ...options,
              playMode: 'multi',
              multiMode: 'online',
              mpRoomId: String(loadedState.mpRoomId),
              roomId: String(loadedState.mpRoomId),
              packId: String(resumePackId),
              resume: true,
              resumeMultiplayer: true
            }
          });
          return;
        }
        const loadedRound = Number(loadedState.round) || 1;
        setRound(loadedRound);
        if (Array.isArray(loadedState.players) && loadedState.players.length > 0) {
          setPlayers(loadedState.players);
        }
        if (loadedState.pastRoundsCategories) {
          setPastRoundsCategories(loadedState.pastRoundsCategories);
        }
        if (loadedState.gameTopic) {
          setGameTopic(loadedState.gameTopic);
        } else if (progress?.topic && !progress.topic.includes(',')) {
          setGameTopic(progress.topic);
        }
        setCurrentPlayerIndex(loadedState.currentPlayerIndex || 0);
        setChatMessages(loadedState.chatMessages || []);

        let loadedAllTopics = Array.isArray(loadedState.allTopics) ? loadedState.allTopics : [];
        if (loadedAllTopics.length === 0) {
          try {
            const cached = localStorage.getItem(`qaiz_jeopardy_all_topics_${resumePackId}`);
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) {
                loadedAllTopics = parsed;
              }
            }
          } catch (_) {}
        }
        if (loadedAllTopics.length > 0) {
          setAllTopics(loadedAllTopics);
        }

        let effectiveCategories = Array.isArray(loadedState.categories) ? loadedState.categories : [];

        // Если это раунд 2 или 3, и у нас есть 15 тем, проверяем соответствие категорий текущему раунду
        if (loadedAllTopics.length >= 15 && loadedRound > 1) {
          const expectedTopics = getTopicsForRound(loadedAllTopics, loadedRound);
          const expectedNames = new Set(expectedTopics.map(t => t.name));
          const currentNames = effectiveCategories.map((c: any) => c.name);
          const hasExpected = currentNames.some((name: string) => expectedNames.has(name));

          if (!hasExpected || effectiveCategories.length === 0) {
            effectiveCategories = expectedTopics.map((cat, catIdx) => {
              const questions = [100, 200, 300, 400, 500].map((val, qIdx) => {
                const globalIndex = (loadedRound - 1) * 25 + catIdx * 5 + qIdx + 1;
                const qId = `gq_${resumePackId}_${globalIndex}`;
                return {
                  id: qId,
                  db_id: qId,
                  pack_id: resumePackId,
                  question_index: globalIndex,
                  category: cat.name,
                  value: val * loadedRound,
                  question: '',
                  answer: '',
                  isAnswered: false,
                  type: 'normal' as const
                };
              });
              return { name: cat.name, description: cat.description, questions };
            });
          }
        }

        if (effectiveCategories.length > 0) {
          setCategories(effectiveCategories);
          const hasGeneratedQuestions = effectiveCategories.some((c: any) =>
            c.questions?.some((q: any) => q.question && q.question.trim().length > 0)
          );
          const targetState = loadedState.gameState || (hasGeneratedQuestions ? 'playing' : 'category_reveal');
          setGameState(targetState);
          return;
        }
      }

      // If state didn't have full categories, reconstruct from options.questions or server pack
      let packQuestions = options?.questions;
      if (!packQuestions || packQuestions.length === 0) {
        const packRes = await fetch(`/api/game-packs/${resumePackId}`).then(r => r.json()).catch(() => null);
        if (packRes?.data?.questions) {
          packQuestions = typeof packRes.data.questions === 'string' ? JSON.parse(packRes.data.questions) : packRes.data.questions;
        }
      }

      if (Array.isArray(packQuestions) && packQuestions.length > 0) {
        const catMap = new Map<string, any[]>();
        packQuestions.forEach((q: any, idx: number) => {
          const catName = q.category || q.categoryName || q.title || `Тема ${Math.floor(idx / 5) + 1}`;
          if (!catMap.has(catName)) catMap.set(catName, []);
          catMap.get(catName)!.push(q);
        });

        const reconstructedCats: Category[] = [];
        let rIdx = 0;
        for (const [catName, qList] of catMap.entries()) {
          if (rIdx >= 5) break;
          const desc = qList[0]?.category_description || qList[0]?.categoryDescription || `Вопросы по категории «${catName}»`;
          reconstructedCats.push({
            name: catName,
            description: desc,
            questions: qList.slice(0, 5).map((q: any, qIdx: number) => {
              const globalIndex = rIdx * 5 + qIdx + 1;
              const qId = q.id || `gq_${resumePackId}_${globalIndex}`;
              return {
                id: qId,
                db_id: qId,
                pack_id: resumePackId,
                question_index: q.question_index || globalIndex,
                category: catName,
                value: q.value || (qIdx + 1) * 100,
                question: q.question || q.text || '',
                answer: q.answer || q.correctAnswer || '',
                hint: q.hint || '',
                explanation: q.explanation || '',
                isAnswered: isMultiplayer
                  ? false
                  : Boolean(q.is_answered || q.times_correct > 0 || q.times_incorrect > 0 || q.times_skipped > 0 || q.user_answer),
                type: 'normal' as const
              };
            })
          });
          rIdx++;
        }

        if (reconstructedCats.length > 0) {
          setCategories(reconstructedCats);
          setRound(1);
          setGameState('playing');
          return;
        }
      }

      setGameState('lobby');
    } catch (error) {
      console.error('Error resuming game:', error);
      setGameState('lobby');
    } finally {
      setLoading(false);
    }
  };

  // Load progress on mount or handle replay / resume
  const existingMpRoomId = options?.mpRoomId || options?.roomId || urlRoomParam || undefined;
  const [mpRoomId] = useState<string>(() => existingMpRoomId || `mproom_jeopardy_${Date.now().toString(36)}`);
  const [mpRoomData, setMpRoomData] = useState<any>(null);
  const [mpParticipants, setMpParticipants] = useState<MultiplayerParticipantInfo[]>([]);
  const [isMpInviteOpen, setIsMpInviteOpen] = useState(false);
  const [isMpZoomOpen, setIsMpZoomOpen] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [readyStarting, setReadyStarting] = useState(false);
  const mpCountdownShownRef = useRef(false);
  const mpTopicRevealShownRef = useRef(false);
  const mpInviteTriggeredRef = useRef(false);
  const lastAuctionTurnKeyRef = useRef<string>('');

  useEffect(() => {
    scrollToTopOfPage();
    const t1 = setTimeout(scrollToTopOfPage, 60);
    const t2 = setTimeout(scrollToTopOfPage, 220);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [
    urlRoomParam,
    urlPackParam,
    urlModeParam,
    round,
    gameState,
    loading,
    generatingRound,
    showTopicReveal,
    showCountdown,
    mpRoomData?.status,
    mpJeopardyState?.phase,
    mpJeopardyState?.round,
    scrollToTopOfPage
  ]);

  const activeUidStr = String(profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299');
  const mySelf2Uid = `${activeUidStr}_self2`;
  const roomHostId = mpRoomData?.host_id;
  const isRoomHost = !roomHostId || String(roomHostId) === activeUidStr;
  const effectiveGeneratorUid = String(roomHostId || mpJeopardyState?.generatorUserId || activeUidStr);
  const isMyClientGenerator = effectiveGeneratorUid === activeUidStr || effectiveGeneratorUid === mySelf2Uid;

  const displayMpParticipants = useMemo(() => {
    const realOthers = mpParticipants.filter(
      p => String(p.user_id) !== activeUidStr && !String(p.user_id).endsWith('_self2')
    );
    return mpParticipants.filter(p => {
      if (realOthers.length > 0 && String(p.user_id).endsWith('_self2')) return false;
      return true;
    });
  }, [mpParticipants, activeUidStr]);

  const hasSelf2Participant = useMemo(
    () => displayMpParticipants.some(p => String(p.user_id) === mySelf2Uid || String(p.user_id).endsWith('_self2')),
    [displayMpParticipants, mySelf2Uid]
  );

  const canActAsMpUser = useCallback(
    (targetUid: string | null | undefined) => {
      if (!targetUid) return isRoomHost;
      const tStr = String(targetUid);
      if (tStr === activeUidStr) return true;
      if (profile?.uid && tStr === String(profile.uid)) return true;
      if (user?.id && tStr === String(user.id)) return true;
      if (hasSelf2Participant && (tStr === mySelf2Uid || tStr.endsWith('_self2'))) return true;
      if (displayMpParticipants.length === 1 && String(displayMpParticipants[0]?.user_id) === activeUidStr) return true;
      return false;
    },
    [activeUidStr, isRoomHost, profile?.uid, user?.id, hasSelf2Participant, mySelf2Uid, displayMpParticipants]
  );

  const getMpPlayerName = useCallback(
    (uid: string | null | undefined) => {
      if (!uid) return 'Игрок';
      const found = displayMpParticipants.find(p => String(p.user_id) === String(uid));
      if (found) return found.display_name || (found as any).username || 'Игрок';
      if (String(uid) === activeUidStr) return profile?.display_name || 'Вы';
      return 'Игрок';
    },
    [displayMpParticipants, activeUidStr, profile?.display_name]
  );

  // Sync multiplayer participants into `players` array so sidebar & game_over always reflect real participants
  useEffect(() => {
    if (!isMultiplayer || displayMpParticipants.length === 0) return;
    const mapped: Player[] = displayMpParticipants.map((p, idx) => ({
      id: String(p.user_id || p.id || idx + 1),
      name: p.display_name || (p as any).username || `Игрок ${idx + 1}`,
      score: Number(p.score) || 0,
      isBot: false,
      avatar: p.avatar_url || undefined
    }));
    setPlayers(mapped);
    if (mpJeopardyState?.choosingUserId) {
      const cIdx = mapped.findIndex(pl => String(pl.id) === String(mpJeopardyState.choosingUserId));
      if (cIdx >= 0) setCurrentPlayerIndex(cIdx);
    }
    if (mpJeopardyState?.answeringUserId) {
      const aIdx = mapped.findIndex(pl => String(pl.id) === String(mpJeopardyState.answeringUserId));
      setAnsweringPlayerIndex(aIdx >= 0 ? aIdx : null);
    } else {
      setAnsweringPlayerIndex(null);
    }
  }, [isMultiplayer, displayMpParticipants, mpJeopardyState?.choosingUserId, mpJeopardyState?.answeringUserId]);

  const triggerMpCountdownAndRevealCategories = useCallback(() => {
    if (mpCountdownShownRef.current) {
      return;
    }
    mpCountdownShownRef.current = true;
    setShowCountdown(true);
  }, []);

  // Helper to populate 5 categories with 25 AI-generated questions + Cat/Auction modifiers
  const populateCategoriesWithGeneratedQuestions = useCallback(
    async (
      targetCategories: Category[],
      targetRound: number,
      targetPackId: string,
      targetTopic: string,
      targetPastRounds: Record<number, Category[]>
    ): Promise<Category[]> => {
      const values = ROUND_CONFIGS[targetRound - 1].baseValues.map(v => v * targetRound);
      const pastAnswers: string[] = [];
      Object.values(targetPastRounds || {}).forEach(catList => {
        catList.forEach(c =>
          c.questions?.forEach(q => {
            if (q.answer && typeof q.answer === 'string' && q.answer.trim()) {
              pastAnswers.push(q.answer.trim());
            }
          })
        );
      });

      const allQuestionsData = await protalkService.generateAllJeopardyQuestions(
        targetCategories.map(c => ({ name: c.name, description: c.description })),
        targetRound,
        values,
        targetPackId,
        activeUidStr,
        targetTopic,
        pastAnswers,
        options?.note
      );

      if (!allQuestionsData || !Array.isArray(allQuestionsData) || allQuestionsData.length === 0) {
        throw new Error('Нейросеть не успела вернуть вопросы тура за 240 секунд.');
      }

      const allSlots: { catIdx: number; qIdx: number }[] = [];
      for (let c = 0; c < 5; c++) {
        for (let q = 0; q < 5; q++) {
          allSlots.push({ catIdx: c, qIdx: q });
        }
      }
      const shuffledSlots = [...allSlots].sort(() => Math.random() - 0.5);

      const numCats = targetRound >= 2 ? 2 : 1;
      const numAuctions = targetRound >= 2 ? 2 : 1;

      const specialTypeMap = new Map<string, 'cat' | 'auction'>();
      let slotIdx = 0;
      for (let i = 0; i < numCats && slotIdx < shuffledSlots.length; i++) {
        const slot = shuffledSlots[slotIdx++];
        specialTypeMap.set(`${slot.catIdx}_${slot.qIdx}`, 'cat');
      }
      for (let i = 0; i < numAuctions && slotIdx < shuffledSlots.length; i++) {
        const slot = shuffledSlots[slotIdx++];
        specialTypeMap.set(`${slot.catIdx}_${slot.qIdx}`, 'auction');
      }

      return targetCategories.map((cat, catIdx) => {
        const catData =
          allQuestionsData.find(d => d.categoryName?.trim().toLowerCase() === cat.name?.trim().toLowerCase()) ||
          allQuestionsData[catIdx];
        if (!catData || !Array.isArray(catData.questions) || catData.questions.length === 0) {
          throw new Error(`Не удалось сформировать вопросы для темы «${cat.name}».`);
        }

        return {
          ...cat,
          questions: cat.questions.map((q, idx) => {
            const data = catData?.questions?.find((qd: any) => qd.value === q.value) || catData?.questions?.[idx];
            const globalIndex = (targetRound - 1) * 25 + catIdx * 5 + idx + 1;
            const qDbId = `gq_${targetPackId}_${globalIndex}`;
            const type: 'normal' | 'cat' | 'auction' = specialTypeMap.get(`${catIdx}_${idx}`) || 'normal';

            const qText = String(data?.text || (data as any)?.question || '').trim();
            const qAns = String(data?.answer || '').trim();

            if (!qText || !qAns || qAns.toLowerCase() === cat.name.trim().toLowerCase()) {
              throw new Error(`Получен некорректный ответ на вопрос категории «${cat.name}».`);
            }

            return {
              ...q,
              id: qDbId,
              db_id: qDbId,
              pack_id: targetPackId,
              question_index: globalIndex,
              question: qText,
              answer: qAns,
              hint: data?.hint || `Обратите внимание на тему категории «${cat.name}»`,
              explanation: data?.explanation || `Вопрос раунда ${targetRound} по категории «${cat.name}».`,
              type,
              isAnswered: false
            };
          })
        };
      });
    },
    [activeUidStr]
  );

  // Apply server-authoritative Jeopardy multiplayer state
  const applyServerJeopardyState = useCallback(
    (jState: any, roomObj?: any, partsList?: any[]) => {
      if (!jState) return;
      setMpJeopardyState(jState);

      if (jState.packId && jState.packId !== packId) {
        setPackId(jState.packId);
      }
      if (typeof jState.round === 'number' && jState.round >= 1 && jState.round <= 3) {
        setRound(jState.round);
      }
      if (Array.isArray(jState.allTopics) && jState.allTopics.length > 0) {
        setAllTopics(jState.allTopics);
      }
      if (Array.isArray(jState.categories) && jState.categories.length > 0) {
        setCategories(jState.categories);
      }
      if (jState.pastRoundsCategories && typeof jState.pastRoundsCategories === 'object') {
        setPastRoundsCategories(jState.pastRoundsCategories);
      }

      const effectiveStatus = roomObj?.status || mpRoomData?.status || 'waiting';
      if (effectiveStatus === 'waiting') {
        setGameState('mp_lobby');
        return;
      }

      if (effectiveStatus === 'finished' || jState.phase === 'game_over') {
        setSelectedQuestion(null);
        setFeedback(null);
        setSpecialType(null);
        setGameState('game_over');
        return;
      }

      const phase = jState.phase || 'categories_intro';

      // If the server has already moved past categories_intro (e.g. into board), close intro overlays immediately for all players!
      if (phase !== 'categories_intro') {
        mpCountdownShownRef.current = true;
        mpTopicRevealShownRef.current = true;
        if (showCountdown) setShowCountdown(false);
        if (showTopicReveal) setShowTopicReveal(false);
      } else if (showCountdown || showTopicReveal) {
        // Still in categories_intro while local countdown or 15-category animation is playing
        return;
      }

      if (phase === 'categories_intro') {
        if (!mpCountdownShownRef.current) {
          triggerMpCountdownAndRevealCategories();
        } else if (!mpTopicRevealShownRef.current) {
          mpTopicRevealShownRef.current = true;
          setTopicRevealIndex(0);
          setShowTopicReveal(true);
        }
      } else if (phase === 'round_intro') {
        setSelectedQuestion(null);
        setFeedback(null);
        setSpecialType(null);
        setGameState('category_reveal');
      } else if (phase === 'board') {
        setSelectedQuestion(null);
        setFeedback(null);
        setSpecialType(null);
        setGameState('playing');
      } else if (phase === 'cat_select' || phase === 'special_cat') {
        const activeQ = jState.activeQuestion?.question || null;
        setSelectedQuestion(activeQ);
        setFeedback(null);
        setSpecialType('cat');
        setGameState('special');
      } else if (phase === 'auction' || phase === 'special_auction') {
        const activeQ = jState.activeQuestion?.question || null;
        setSelectedQuestion(activeQ);
        setFeedback(null);
        setSpecialType('auction');
        const minNextBid = jState.auctionState?.hasPlacedInitialBid
          ? (Number(jState.auctionState?.currentHighBid) || 100) + 100
          : Number(jState.auctionState?.nominalValue) || 100;
        const turnKey = `${activeQ?.id || ''}_${jState.auctionState?.currentBidderId || ''}_${minNextBid}`;
        if (lastAuctionTurnKeyRef.current !== turnKey) {
          lastAuctionTurnKeyRef.current = turnKey;
          setAuctionBet(minNextBid);
          setCustomBetInput(String(minNextBid));
        } else {
          setAuctionBet(prev => (prev < minNextBid ? minNextBid : prev));
        }
        setGameState('special');
      } else if (phase === 'question_buzz') {
        const activeQ = jState.activeQuestion?.question || null;
        if (activeQ) {
          setSelectedQuestion({
            ...activeQ,
            value: Number(jState.auctionBid || activeQ.value || 100)
          });
        }
        setSpecialType(null);
        setFeedback(null);
        if (typeof jState.liveQuestionTimeLeft === 'number') {
          setTimeLeft(jState.liveQuestionTimeLeft);
        }
        setGameState('playing');
      } else if (phase === 'question_answer') {
        const activeQ = jState.activeQuestion?.question || null;
        if (activeQ) {
          setSelectedQuestion({
            ...activeQ,
            value: Number(jState.auctionBid || activeQ.value || 100)
          });
        }
        setSpecialType(null);
        setFeedback(null);
        if (typeof jState.liveAnswerTimeLeft === 'number') {
          setTimeLeft(jState.liveAnswerTimeLeft);
        }
        setGameState('playing');
      } else if (phase === 'question_feedback') {
        const fb = jState.feedback;
        if (fb) {
          setFeedback({
            isCorrect: Boolean(fb.isCorrect),
            explanation: fb.explanation || `Правильный ответ: ${fb.correctAnswer || ''}`,
            points: fb.points ?? 0,
            answeringUserName: fb.answeringUserName || null,
            userAnswer: fb.userAnswer || ''
          });
        }
        setGameState('feedback');
      } else if (phase === 'generating_round') {
        setSelectedQuestion(null);
        setFeedback(null);
        setSpecialType(null);
        setGameState('mp_generating_round');
      } else if (phase === 'final_elimination') {
        setSelectedQuestion(null);
        setFeedback(null);
        setSpecialType(null);
        if (Array.isArray(jState.remainingFinalCategories)) {
          setFinalCategories(jState.remainingFinalCategories);
        }
        setGameState('final_elimination');
      } else if (phase === 'final_betting') {
        setSelectedQuestion(null);
        setFeedback(null);
        setSpecialType(null);
        if (jState.finalCategory) {
          setFinalCategories([jState.finalCategory]);
        } else if (Array.isArray(jState.remainingFinalCategories)) {
          setFinalCategories(jState.remainingFinalCategories);
        }
        if (typeof jState.liveFinalBettingTimeLeft === 'number') {
          setTimeLeft(jState.liveFinalBettingTimeLeft);
        }
        setGameState('final_bet');
      } else if (phase === 'final_generating') {
        setSelectedQuestion(null);
        setFeedback(null);
        setSpecialType(null);
        if (jState.finalCategory) {
          setFinalCategories([jState.finalCategory]);
        }
        setGameState('final_generating');
      } else if (phase === 'final_countdown') {
        setFeedback(null);
        setSpecialType(null);
        if (jState.finalQuestion) {
          setSelectedQuestion(jState.finalQuestion);
        }
        if (typeof jState.liveFinalCountdownLeft === 'number') {
          setTimeLeft(jState.liveFinalCountdownLeft);
        }
        setGameState('final_countdown');
      } else if (phase === 'final_question') {
        setFeedback(null);
        setSpecialType(null);
        if (jState.finalQuestion) {
          setSelectedQuestion(jState.finalQuestion);
        }
        if (typeof jState.liveFinalTimeLeft === 'number') {
          setTimeLeft(jState.liveFinalTimeLeft);
        }
        setGameState('final_question');
      } else if (phase === 'final_reveal') {
        setFeedback(null);
        setSpecialType(null);
        if (jState.finalQuestion) {
          setSelectedQuestion(jState.finalQuestion);
        }
        setGameState('final_reveal');
      }
    },
    [packId, mpRoomData?.status, showCountdown, showTopicReveal, triggerMpCountdownAndRevealCategories]
  );

  const syncJeopardyOp = useCallback(
    async (op: string, payload: Record<string, any> = {}, actingUserId?: string) => {
      if (!mpRoomId) return null;
      setMpActionPending(true);
      try {
        const res = await fetch(`/api/multiplayer/rooms/${mpRoomId}/jeopardy-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            op,
            user_id: actingUserId || activeUidStr,
            payload
          })
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data.participants)) {
          setMpParticipants(data.participants);
        }
        if (data.room_status && mpRoomData) {
          setMpRoomData((prev: any) => (prev ? { ...prev, status: data.room_status } : prev));
        }
        if (data.jeopardy_state) {
          applyServerJeopardyState(
            data.jeopardy_state,
            { ...(mpRoomData || {}), status: data.room_status || mpRoomData?.status || 'active' },
            data.participants || mpParticipants
          );
        }
        return data;
      } catch (e) {
        console.warn('syncJeopardyOp error:', e);
        return null;
      } finally {
        setMpActionPending(false);
      }
    },
    [mpRoomId, activeUidStr, mpRoomData, mpParticipants, applyServerJeopardyState]
  );

  const mpVisibility: 'public' | 'private' =
    options?.visibility === 'private' || options?.visibility === 'closed' ? 'private' : 'public';
  const mpMaxPlayers: number = Math.min(8, Math.max(2, Number(options?.maxPlayers) || 8));

  const registerJeopardyMultiplayerRoom = useCallback(
    async (initialAllTopics?: { name: string; description: string }[], initialRound1Categories?: Category[]) => {
      if (!isMultiplayer || mpInviteTriggeredRef.current) return;
      mpInviteTriggeredRef.current = true;
      const initialJState = {
        round: 1,
        phase: 'categories_intro',
        choosingUserId: activeUidStr,
        answeringUserId: null,
        allTopics: initialAllTopics || allTopics,
        categories: initialRound1Categories || categories,
        pastRoundsCategories: {},
        packId,
        totalAnsweredCount: 0,
        visibility: mpVisibility,
        maxPlayers: mpMaxPlayers
      };
      try {
        const res = await fetch('/api/multiplayer/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: mpRoomId,
            game_id: 'jeopardy',
            game_title: 'Своя Икра',
            host_id: activeUidStr,
            host_name: profile?.display_name || 'Ведущий',
            host_avatar: profile?.avatar_url || null,
            topic: gameTopic || options?.topic || 'Общие знания',
            difficulty: options?.difficulty || 'people',
            question_count: 76,
            pack_id: packId,
            visibility: mpVisibility,
            max_players: mpMaxPlayers,
            jeopardy_state: initialJState
          })
        });
        const rJson = await res.json().catch(() => null);
        if (rJson?.room) {
          setMpRoomData(rJson.room);
          if (rJson.room.jeopardy_state) {
            setMpJeopardyState(rJson.room.jeopardy_state);
          }
        }
      } catch (_) {}
      if (!existingMpRoomId) {
        setIsMpInviteOpen(true);
      }
    },
    [isMultiplayer, mpRoomId, activeUidStr, allTopics, categories, packId, profile?.display_name, profile?.avatar_url, gameTopic, options?.topic, options?.difficulty, existingMpRoomId, mpVisibility, mpMaxPlayers]
  );

  const handleToggleReadyOrStartJeopardy = async () => {
    if (!mpRoomId || readyStarting) return;
    const isHost = !roomHostId || String(roomHostId) === activeUidStr;
    setReadyStarting(true);
    try {
      if (isHost) {
        await fetch(`/api/multiplayer/rooms/${mpRoomId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'active',
            pack_id: packId,
            jeopardy_state: {
              ...(mpJeopardyState || {}),
              round: 1,
              phase: 'categories_intro',
              introStartedAt: Date.now(),
              allTopics,
              categories,
              packId
            }
          })
        });
        triggerMpCountdownAndRevealCategories();
      } else {
        const myPart = mpParticipants.find(p => String(p.user_id) === activeUidStr);
        const nextReady = Number(myPart?.is_ready) === 1 ? 0 : 1;
        await fetch(`/api/multiplayer/rooms/${mpRoomId}/ready`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: activeUidStr,
            display_name: profile?.display_name || 'Игрок 1',
            is_ready: nextReady
          })
        });
      }
    } catch (_) {
    } finally {
      setReadyStarting(false);
    }
  };

  // Requirement 8 & 14: When phase === 'generating_round' in Multiplayer, ONLY the active generator (host or fallback participant) generates the next round!
  useEffect(() => {
    if (!isMultiplayer || mpJeopardyState?.phase !== 'generating_round' || !isMyClientGenerator) return;
    const targetNextRound = Number(mpJeopardyState?.generatingNextRound) || (round + 1);
    if (targetNextRound > 3 || hostGeneratingNextRoundRef.current === targetNextRound) return;

    hostGeneratingNextRoundRef.current = targetNextRound;
    let isCancelled = false;

    const runHostNextRoundGen = async () => {
      setGeneratingRound(true);
      setGenerationTimer(240);
      const timer = setInterval(() => setGenerationTimer(prev => Math.max(0, prev - 1)), 1000);
      try {
        const topicsSource = (Array.isArray(mpJeopardyState?.allTopics) && mpJeopardyState.allTopics.length >= 15)
          ? mpJeopardyState.allTopics
          : allTopics;
        const roundTopics = getTopicsForRound(topicsSource, targetNextRound);
        const targetPackId = mpJeopardyState?.packId || packId;
        const skeletonCategories: Category[] = roundTopics.map((cat, catIdx) => {
          const questions = [100, 200, 300, 400, 500].map((val, qIdx) => {
            const globalIndex = (targetNextRound - 1) * 25 + catIdx * 5 + qIdx + 1;
            const qId = `gq_${targetPackId}_${globalIndex}`;
            return {
              id: qId,
              db_id: qId,
              pack_id: targetPackId,
              question_index: globalIndex,
              category: cat.name,
              value: val * targetNextRound,
              question: '',
              answer: '',
              isAnswered: false,
              type: 'normal' as const
            };
          });
          return { name: cat.name, description: cat.description, questions };
        });

        const populatedCats = await populateCategoriesWithGeneratedQuestions(
          skeletonCategories,
          targetNextRound,
          targetPackId,
          gameTopic || options?.topic || 'Общие знания',
          mpJeopardyState?.pastRoundsCategories || pastRoundsCategories
        );

        if (!isCancelled) {
          setRound(targetNextRound);
          setCategories(populatedCats);
          await syncJeopardyOp('set_generated_round', {
            round: targetNextRound,
            categories: populatedCats
          });
        }
      } catch (err: any) {
        console.error('Host error generating next multiplayer round:', err);
        hostGeneratingNextRoundRef.current = null;
      } finally {
        clearInterval(timer);
        setGeneratingRound(false);
      }
    };

    runHostNextRoundGen();
    return () => {
      isCancelled = true;
    };
  }, [isMultiplayer, mpJeopardyState?.phase, mpJeopardyState?.generatingNextRound, isMyClientGenerator, round, allTopics, packId, gameTopic, options?.topic, pastRoundsCategories, populateCategoriesWithGeneratedQuestions, syncJeopardyOp]);

  // Requirement 10 & 14: When phase === 'final_generating' in Multiplayer, ONLY the active generator generates the Superfinal question!
  useEffect(() => {
    if (!isMultiplayer || mpJeopardyState?.phase !== 'final_generating' || !isMyClientGenerator) return;
    if (mpJeopardyState?.finalQuestion || hostGeneratingFinalRef.current) return;

    hostGeneratingFinalRef.current = true;
    const finalCatName = mpJeopardyState?.finalCategory || finalCategories[0] || gameTopic || 'Супер-игра';
    const targetPackId = mpJeopardyState?.packId || packId;

    const runHostFinalQuestionGen = async () => {
      setFinalQuestionLoading(true);
      try {
        const pastAnswers: string[] = [];
        Object.values(mpJeopardyState?.pastRoundsCategories || pastRoundsCategories || {}).forEach((catList: any) => {
          if (Array.isArray(catList)) {
            catList.forEach(c =>
              c.questions?.forEach((q: any) => {
                if (q.answer) pastAnswers.push(q.answer);
              })
            );
          }
        });

        let finalQObj: Question;
        const finalQDbId = `gq_${targetPackId}_76`;
        try {
          const superQ = await protalkService.generateJeopardySuperQuestion(
            options?.topic || gameTopic || 'Общие знания',
            finalCatName,
            pastAnswers,
            targetPackId,
            1000,
            options?.note
          );
          finalQObj = {
            id: 'final',
            db_id: finalQDbId,
            pack_id: targetPackId,
            question_index: 76,
            category: finalCatName,
            value: 1000,
            question: superQ.question,
            answer: superQ.answer,
            hint: superQ.hint || '',
            explanation: superQ.explanation || '',
            isAnswered: false,
            type: 'normal'
          };
        } catch (_) {
          finalQObj = {
            id: 'final',
            db_id: finalQDbId,
            pack_id: targetPackId,
            question_index: 76,
            category: finalCatName,
            value: 1000,
            question: `Финальный вопрос супер-игры по теме «${finalCatName}»: назовите ключевое понятие или символ, лежащий в её основе.`,
            answer: finalCatName,
            hint: 'Связано непосредственно с темой супер-игры',
            explanation: 'Финальный раунд Своей Икры.',
            isAnswered: false,
            type: 'normal'
          };
        }

        protalkService.saveGeneratedQuestions(
          activeUidStr,
          'jeopardy',
          gameTopic || options?.topic || 'Общие знания',
          [finalQObj],
          'people',
          targetPackId
        );
        await syncJeopardyOp('set_final_question', { finalQuestion: finalQObj });
      } catch (e) {
        hostGeneratingFinalRef.current = false;
      } finally {
        setFinalQuestionLoading(false);
      }
    };

    runHostFinalQuestionGen();
  }, [isMultiplayer, mpJeopardyState?.phase, mpJeopardyState?.finalQuestion, mpJeopardyState?.finalCategory, isMyClientGenerator, finalCategories, gameTopic, options?.topic, packId, pastRoundsCategories, activeUidStr, syncJeopardyOp]);

  // Requirement 11 & 12: When final_reveal completes all 5s-per-player reveals, finalize scores and transition to game_over
  useEffect(() => {
    if (!isMultiplayer || mpJeopardyState?.phase !== 'final_reveal') return;
    const revealOrder = Array.isArray(mpJeopardyState?.finalRevealOrder) ? mpJeopardyState.finalRevealOrder : [];
    const liveIdx = Number(mpJeopardyState?.liveFinalRevealIndex ?? 0);
    if (revealOrder.length === 0 || liveIdx >= revealOrder.length) {
      const t = setTimeout(() => {
        syncJeopardyOp('finish_superfinal');
      }, 600);
      return () => clearTimeout(t);
    }
  }, [isMultiplayer, mpJeopardyState?.phase, mpJeopardyState?.finalRevealOrder, mpJeopardyState?.liveFinalRevealIndex, syncJeopardyOp]);

  // Auto-open Round 1 board for all multiplayer participants 5.5s after the 15-category reveal starts
  useEffect(() => {
    if (!isMultiplayer || !showTopicReveal) return;
    const t = setTimeout(() => {
      setShowTopicReveal(false);
      mpTopicRevealShownRef.current = true;
      syncJeopardyOp('start_round_board');
      setGameState('playing');
    }, 5500);
    return () => clearTimeout(t);
  }, [isMultiplayer, showTopicReveal, syncJeopardyOp]);

  // If joining an existing multiplayer room (via URL or MultiplayerRoomPage), load room state from server instead of generating a new game
  useEffect(() => {
    if (!isMultiplayer || !existingMpRoomId) return;
    let isCancelled = false;

    const initExistingMultiplayerRoom = async () => {
      setLoading(true);
      try {
        const joinRes = await fetch(`/api/multiplayer/rooms/${existingMpRoomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: activeUidStr,
            display_name: profile?.display_name || 'Игрок',
            avatar_url: profile?.avatar_url || null,
            team_number: 1
          })
        }).catch(() => null);

        if (joinRes && !joinRes.ok) {
          const errJson = await joinRes.json().catch(() => ({}));
          if (
            errJson?.code === 'GAME_ALREADY_STARTED' ||
            errJson?.code === 'ROOM_FULL' ||
            errJson?.code === 'INSUFFICIENT_BALANCE'
          ) {
            if (!isCancelled) {
              navigate(`/multiplayer/room/${existingMpRoomId}`);
            }
            return;
          }
        }

        const res = await fetch(`/api/multiplayer/rooms/${existingMpRoomId}`);
        if (!res.ok || isCancelled) return;
        const data = await res.json();
        if (data.room) {
          setMpRoomData(data.room);
          if (data.room.topic) setGameTopic(data.room.topic);
          if (data.room.pack_id) setPackId(data.room.pack_id);
        }
        if (Array.isArray(data.participants)) {
          setMpParticipants(data.participants);
        }
        const jState = data.jeopardy_state || data.room?.jeopardy_state;
        if (jState && Array.isArray(jState.categories) && jState.categories.length > 0) {
          applyServerJeopardyState(jState, data.room, data.participants);
        } else if (data.room?.status === 'waiting') {
          if (String(data.room?.host_id) === activeUidStr) {
            // Host created room shell without categories yet -> generate categories + Round 1 now
            await generateRoundCategories(1);
          } else {
            setGameState('mp_lobby');
          }
        } else if (data.room?.status === 'active') {
          await handleResume();
          if (!mpCountdownShownRef.current) {
            triggerMpCountdownAndRevealCategories();
          }
        }
      } catch (_) {
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    initExistingMultiplayerRoom();
    return () => {
      isCancelled = true;
    };
  }, [isMultiplayer, existingMpRoomId]);

  // Auto-start category + Round 1 generation when host creates a new multiplayer Jeopardy game
  useEffect(() => {
    if (isMultiplayer && !existingMpRoomId && gameState === 'lobby' && !hasProgress && !options?.resume && !loading && !generatingRound) {
      startLevel();
    }
  }, [isMultiplayer, existingMpRoomId, gameState, hasProgress, options?.resume, loading, generatingRound]);

  useEffect(() => {
    if (isMultiplayer && existingMpRoomId) return;
    let isCancelled = false;
    const loadProgress = async () => {
      const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
      if (options?.isReplay && options?.questions && Array.isArray(options.questions) && options.questions.length > 0) {
        setCategories(options.questions);
        setRound(1);
        setGameState('playing');
        return;
      }
      if (options?.resume && (options?.packId || packId)) {
        await handleResume();
        return;
      }
      const checkPackId = options?.packId || packId;
      if (!checkPackId) return;
      const progress = await getGameProgress(String(activeUid), checkPackId, 'jeopardy');
      if (!isCancelled && progress) {
        setHasProgress(true);
      }
    };
    loadProgress();
    return () => { isCancelled = true; };
  }, [isMultiplayer, existingMpRoomId, options?.resume, options?.isReplay, options?.packId]);

  // Save progress whenever state changes (single-player; multiplayer saves via /jeopardy-sync)
  useEffect(() => {
    if (isMultiplayer) return;
    const saveProgress = async () => {
      const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
      const allowedStates = ['playing', 'category_reveal', 'special', 'feedback', 'final_bet', 'final_elimination', 'final_question'];
      if (allowedStates.includes(gameState) && packId && (categories.length > 0 || allTopics.length > 0)) {
        await saveGameProgress({
          userId: String(activeUid),
          packId: packId,
          gameType: 'jeopardy',
          currentStep: totalAnsweredCount,
          totalSteps: 76,
          score: players[0]?.score || 0,
          topic: gameTopic,
          difficulty: 'people',
          state: {
            round,
            players,
            categories,
            pastRoundsCategories,
            totalAnsweredCount,
            currentPlayerIndex,
            chatMessages,
            allTopics,
            packId,
            gameTopic,
            gameState,
            isMultiplayer: false,
            playMode: 'single'
          }
        });
        if (allTopics && allTopics.length > 0) {
          try {
            localStorage.setItem(`qaiz_jeopardy_all_topics_${packId}`, JSON.stringify(allTopics));
          } catch (_) {}
        }
      }
    };
    saveProgress();
  }, [isMultiplayer, round, players, categories, pastRoundsCategories, totalAnsweredCount, currentPlayerIndex, gameState, packId, chatMessages, allTopics, gameTopic]);

  // Generate all 25 questions in one request (or start board if already generated in Multiplayer)
  const startRoundQuestions = async () => {
    const alreadyPopulated = categories.length > 0 && categories.every(c => c.questions?.every(q => q.question && q.question.trim().length > 0));
    if (isMultiplayer && alreadyPopulated) {
      await syncJeopardyOp('start_round_board');
      setGameState('playing');
      return;
    }

    setGeneratingRound(true);
    setGenerationTimer(240);
    const timer = setInterval(() => setGenerationTimer(prev => Math.max(0, prev - 1)), 1000);
    
    try {
      const updatedCategories = await populateCategoriesWithGeneratedQuestions(
        categories,
        round,
        packId,
        gameTopic,
        pastRoundsCategories
      );
      
      setCategories(updatedCategories);
      if (isMultiplayer) {
        await syncJeopardyOp('set_generated_round', { round, categories: updatedCategories });
        await syncJeopardyOp('start_round_board');
      }
      setGameState('playing');
    } catch (error: any) {
      console.error('Error generating jeopardy questions:', error);
      setErrorMessage(error?.message || 'Нейросеть не смогла сформировать вопросы за 150 секунд. Пожалуйста, повторите попытку или отмените.');
      setRetryAction(() => () => startRoundQuestions());
      setGameState('error');
    } finally {
      clearInterval(timer);
      setGeneratingRound(false);
    }
  };

  const startLevel = async () => {
    if (isStartingRef.current || loading || generatingRound) return;
    isStartingRef.current = true;

    const cost = Math.max(76, Number(options.price) || 76); 
    const currentBal = profile ? (profile.balance ?? 0) : demoBalance;

    if (currentBal < cost || currentBal <= 0) {
      if (!profile) {
        openDemoExhaustedModal();
      } else {
        setInsufficientAmount(cost);
        setInsufficientReason('создания игры Своя Икра (необходимо минимум 76 ИИкр на балансе)');
        setShowInsufficientModal(true);
      }
      setGameState('lobby');
      isStartingRef.current = false;
      return;
    }

    setGameState('loading');
    setLoading(true);
    try {
      await generateRoundCategories(1);
    } catch (error: any) {
      console.error('Error starting jeopardy:', error);
      setErrorMessage(error?.message || String(error));
      setRetryAction(() => () => startLevel());
      setGameState('error');
    } finally {
      setLoading(false);
      isStartingRef.current = false;
    }
  };

  const generateRoundCategories = useCallback(async (roundNum: number) => {
    if (roundNum > 3) return;
    setGeneratingRound(true);
    setGenerationTimer(240);
    const timer = setInterval(() => setGenerationTimer(prev => Math.max(0, prev - 1)), 1000);
    
    try {
      const topic = gameTopic || options.topic || 'Обычные вопросы';
      let availableTopics = allTopics;

      if (availableTopics.length === 0 && packId) {
        try {
          const cached = localStorage.getItem(`qaiz_jeopardy_all_topics_${packId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length >= 15) {
              availableTopics = parsed;
              setAllTopics(parsed);
            }
          }
        } catch (_) {}
      }
      
      if (availableTopics.length === 0) {
        const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
        const cats = await protalkService.generateJeopardyCategories(topic, 'auto', [], String(activeUid), options?.note);
        availableTopics = cats;
        setAllTopics(cats);
        if (packId) {
          try {
            localStorage.setItem(`qaiz_jeopardy_all_topics_${packId}`, JSON.stringify(cats));
          } catch (_) {}
        }
      }
      
      const roundTopics = getTopicsForRound(availableTopics, roundNum);
      
      let newCategories: Category[] = roundTopics.map((cat, catIdx) => {
        const questions = [100, 200, 300, 400, 500].map((val, qIdx) => {
          const globalIndex = (roundNum - 1) * 25 + catIdx * 5 + qIdx + 1;
          const qId = `gq_${packId}_${globalIndex}`;
          return {
            id: qId,
            db_id: qId,
            pack_id: packId,
            question_index: globalIndex,
            category: cat.name,
            value: val * roundNum,
            question: '',
            answer: '',
            isAnswered: false,
            type: 'normal' as const
          };
        });
        return { name: cat.name, description: cat.description, questions };
      });

      // Requirement 2: In Multiplayer Round 1, generate 15 categories AND Round 1's 25 questions BEFORE opening the lobby and inviting players!
      if (roundNum === 1 && isMultiplayer) {
        newCategories = await populateCategoriesWithGeneratedQuestions(
          newCategories,
          1,
          packId,
          topic,
          pastRoundsCategories
        );
      }

      setCategories(newCategories);
      setGeneratingRound(false);
      setLoading(false);
      clearInterval(timer);

      if (roundNum === 1 && isMultiplayer) {
        await registerJeopardyMultiplayerRoom(availableTopics, newCategories);
        setGameState('mp_lobby');
      } else {
        setGameState('category_reveal');
        if (roundNum === 1) {
          setTopicRevealIndex(0);
          setShowTopicReveal(true);
        }
      }

      const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
      if (packId && !isMultiplayer) {
        saveGameProgress({
          userId: String(activeUid),
          packId: packId,
          gameType: 'jeopardy',
          currentStep: (roundNum - 1) * 25,
          totalSteps: 76,
          score: players[0]?.score || 0,
          topic: topic,
          difficulty: 'people',
          state: {
            round: roundNum,
            players,
            categories: newCategories,
            pastRoundsCategories,
            totalAnsweredCount,
            currentPlayerIndex,
            chatMessages,
            allTopics: availableTopics,
            packId,
            gameTopic: topic,
            gameState: 'category_reveal',
            isMultiplayer: false,
            playMode: 'single'
          }
        }).catch(() => {});
      }
    } catch (error: any) {
      console.warn('Handling jeopardy categories generation error:', error);
      clearInterval(timer);
      setGeneratingRound(false);
      setLoading(false);
      setErrorMessage(error?.message || 'Не удалось сгенерировать категории и вопросы 1-го тура. Пожалуйста, повторите попытку.');
      setRetryAction(() => () => generateRoundCategories(roundNum));
      setGameState('error');
    } finally {
      clearInterval(timer);
      setGeneratingRound(false);
    }
  }, [options.topic, gameTopic, allTopics, packId, players, pastRoundsCategories, totalAnsweredCount, currentPlayerIndex, chatMessages, profile?.uid, user?.id, isMultiplayer, populateCategoriesWithGeneratedQuestions, registerJeopardyMultiplayerRoom]);

  // Timer for answering - with proper guards and pause during voice recognition
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const isMpFinalCountdown = isMultiplayer && gameState === 'final_countdown';
    const isMpFinalBet = isMultiplayer && gameState === 'final_bet';
    const hasActiveTimedPhase =
      (selectedQuestion && !showResult && gameState !== 'special' && gameState !== 'feedback' && gameState !== 'final_reveal') ||
      isMpFinalCountdown ||
      isMpFinalBet;

    if (hasActiveTimedPhase && timeLeft > 0 && !checking && !feedback && !isVoiceActive && !(isMultiplayer && mpJeopardyState?.answerCheckingInProgress)) {
      timer = setInterval(() => {
        setTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
    } else if (timeLeft === 0 && hasActiveTimedPhase && !checking && !feedback && !isVoiceActive && !(isMultiplayer && mpJeopardyState?.answerCheckingInProgress)) {
      handleTimeExpired();
    }
    return () => clearInterval(timer);
  }, [selectedQuestion, showResult, timeLeft, gameState, checking, feedback, isVoiceActive, isMultiplayer, mpJeopardyState?.answerCheckingInProgress]);

  const handleBuzz = async (actingUid?: string) => {
    if (!isMultiplayer || mpActionPending || mpJeopardyState?.phase !== 'question_buzz') return;
    audioSystem.playSlot('jeopardy_buzzer_press');
    const wrongList: string[] = Array.isArray(mpJeopardyState?.wrongUserIds) ? mpJeopardyState.wrongUserIds.map(String) : [];
    let targetUid = actingUid || activeUidStr;
    if (wrongList.includes(targetUid) && hasSelf2Participant && !wrongList.includes(mySelf2Uid)) {
      targetUid = mySelf2Uid;
    }
    if (wrongList.includes(targetUid)) return;
    setUserAnswer('');
    await syncJeopardyOp('buzz', {}, targetUid);
  };

  const handleTimeExpired = () => {
    if (feedback || checking || gameState === 'feedback' || mpActionPending) return;
    audioSystem.playSlot('jeopardy_no_one_buzzed');

    if (isMultiplayer) {
      const phase = mpJeopardyState?.phase;
      if (phase === 'question_buzz') {
        syncJeopardyOp('question_timeout');
      } else if (phase === 'question_answer') {
        syncJeopardyOp('answer_timeout', {}, mpJeopardyState?.answeringUserId || activeUidStr);
      } else if (phase === 'final_betting') {
        syncJeopardyOp('final_bet_timeout');
      } else if (phase === 'final_countdown') {
        syncJeopardyOp('start_final_answering');
      } else if (phase === 'final_question') {
        syncJeopardyOp('final_question_timeout');
      }
      return;
    }

    if (!selectedQuestion) return;
    
    // Mark question as answered with stats
    setCategories(prev => prev.map(cat => ({
      ...cat,
      questions: cat.questions.map(q => q.id === selectedQuestion.id ? {
        ...q,
        isAnswered: true,
        is_answered: 1,
        is_skipped: 1,
        user_answer: 'Время вышло',
        times_shown: Math.max(1, Number((q as any).times_shown) || 1),
        times_skipped: (Number((q as any).times_skipped) || 0) + 1
      } : q)
    })));

    // Track expired answer in database as skipped
    const isFinal = selectedQuestion.id === 'final' || gameState === 'final_question';
    const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
    fetch('/api/generated-questions/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedQuestion?.db_id || selectedQuestion?.id,
        pack_id: selectedQuestion?.pack_id || packId,
        question_index: selectedQuestion?.question_index || (isFinal ? 76 : 1),
        user_id: String(activeUid),
        user_answer: 'Время вышло',
        category: selectedQuestion?.category,
        topic: gameTopic || options?.topic || 'Общие знания',
        value: selectedQuestion?.value,
        is_correct: 0,
        is_skipped: 1
      })
    }).catch(() => {});

    // Special rule: For cat in the sack and auction, timeout or skipping DOES deduct points (exception to general rule)
    const isSpecialCatOrAuction = selectedQuestion.type === 'cat' || selectedQuestion.type === 'auction';
    let deductPoints = 0;

    if (isSpecialCatOrAuction) {
      deductPoints = selectedQuestion.type === 'auction' && auctionBet > 0 ? auctionBet : (selectedQuestion.value || 0);
      const targetPlayerIdx = answeringPlayerIndex !== null 
        ? answeringPlayerIndex 
        : (selectedQuestion.type === 'auction' && auctionHighBidder !== null ? auctionHighBidder : currentPlayerIndex);
      if (targetPlayerIdx !== null && targetPlayerIdx >= 0 && targetPlayerIdx < players.length) {
        setPlayers(prev => prev.map((p, idx) => 
          idx === targetPlayerIdx ? { ...p, score: p.score - deductPoints } : p
        ));
      }
    }

    setFeedback({
      isCorrect: false,
      explanation: isSpecialCatOrAuction 
        ? `Время вышло! Для ${selectedQuestion.type === 'cat' ? 'кота в мешке' : 'аукциона'} баллы (−${deductPoints}) списываются. Правильный ответ: ${selectedQuestion.answer}${selectedQuestion.explanation ? '. ' + selectedQuestion.explanation : ''}`
        : `Время вышло, никто не дал ответ. Правильный ответ: ${selectedQuestion.answer}${selectedQuestion.explanation ? '. ' + selectedQuestion.explanation : ''}`,
      points: -deductPoints
    });
    setGameState('feedback');
  };

  const handleSpeedUp = () => {
    if (!selectedQuestion || checking || feedback || gameState === 'feedback') return;
    if (isMultiplayer) {
      if (mpJeopardyState?.phase === 'question_buzz') {
        syncJeopardyOp('question_timeout');
      } else if (mpJeopardyState?.phase === 'question_answer' && canActAsMpUser(mpJeopardyState?.answeringUserId)) {
        syncJeopardyOp('answer_timeout', {}, mpJeopardyState?.answeringUserId);
      } else if (mpJeopardyState?.phase === 'final_question') {
        syncJeopardyOp('final_question_timeout');
      }
      return;
    }
    setTimeLeft(0);
    handleTimeExpired();
  };

  const handleSkipQuestion = () => {
    handleSpeedUp();
  };

  const handleDontKnow = async () => {
    if (!selectedQuestion || checking || feedback || gameState === 'feedback') return;

    if (isMultiplayer) {
      if (mpJeopardyState?.phase === 'question_answer' && canActAsMpUser(mpJeopardyState?.answeringUserId)) {
        await syncJeopardyOp('dont_know', {}, mpJeopardyState?.answeringUserId);
      } else if (mpJeopardyState?.phase === 'final_question') {
        const targetUid = !mpJeopardyState?.finalAnswers?.[activeUidStr]
          ? activeUidStr
          : hasSelf2Participant && !mpJeopardyState?.finalAnswers?.[mySelf2Uid]
          ? mySelf2Uid
          : activeUidStr;
        await syncJeopardyOp('submit_final_answer', {
          answer: 'Не знаю',
          is_correct: false
        }, targetUid);
      }
      return;
    }
    
    // Mark question as answered with stats
    setCategories(prev => prev.map(cat => ({
      ...cat,
      questions: cat.questions.map(q => q.id === selectedQuestion.id ? {
        ...q,
        isAnswered: true,
        is_answered: 1,
        is_skipped: 1,
        user_answer: 'Не знаю',
        times_shown: Math.max(1, Number((q as any).times_shown) || 1),
        times_skipped: (Number((q as any).times_skipped) || 0) + 1
      } : q)
    })));

    // "Не знаю" acts as an incorrect answer by the player without AI check
    const isFinal = selectedQuestion.id === 'final' || gameState === 'final_question';
    const playerIdx = answeringPlayerIndex !== null ? answeringPlayerIndex : currentPlayerIndex;
    const finalBetAmount = finalBets[players[playerIdx]?.id] ?? selectedQuestion.value ?? 0;
    const deductPoints = isFinal ? finalBetAmount : (selectedQuestion.type === 'auction' ? auctionBet : selectedQuestion.value);

    if (playerIdx !== null) {
      setPlayers(prev => prev.map((p, idx) => 
        idx === playerIdx ? { ...p, score: p.score - deductPoints } : p
      ));
    }

    try {
      const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
      await fetch('/api/generated-questions/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedQuestion?.db_id || selectedQuestion?.id,
          pack_id: selectedQuestion?.pack_id || packId,
          question_index: selectedQuestion?.question_index || (isFinal ? 76 : 1),
          user_id: String(activeUid),
          user_answer: 'Не знаю',
          category: selectedQuestion?.category,
          topic: gameTopic || options?.topic || 'Общие знания',
          value: selectedQuestion?.value,
          is_correct: 0,
          is_skipped: 1
        })
      });
    } catch (_) {}

    setFeedback({
      isCorrect: false,
      explanation: `Вы выбрали ответ «Не знаю». Правильный ответ: ${selectedQuestion.answer}${selectedQuestion.explanation ? '. ' + selectedQuestion.explanation : ''}`,
      points: -deductPoints
    });
    setGameState('feedback');
  };

  const handleQuestionSelect = async (q: Question) => {
    if (q.isAnswered || generatingQuestion || mpActionPending) return;
    const baseRow = Math.min(500, Math.max(100, Math.round((Number(q.value) || 100) / Math.max(1, round) / 100) * 100));
    audioSystem.playSlot(`jeopardy_cell_select_${baseRow}`);
    if (q.type === 'cat') {
      setTimeout(() => audioSystem.playSlot('jeopardy_special_cat_in_bag'), 200);
    } else if (q.type === 'auction') {
      setTimeout(() => audioSystem.playSlot('jeopardy_special_auction'), 200);
    }
    if (isMultiplayer) {
      const chooserId = mpJeopardyState?.choosingUserId || roomHostId || activeUidStr;
      if (!canActAsMpUser(chooserId)) return;
      setUserAnswer('');
      setShowHint(false);
      const resolvedCatIdx = categories.findIndex(
        c => c.name === q.category || c.questions?.some(item => String(item.id) === String(q.id))
      );
      const resolvedQIdx =
        resolvedCatIdx >= 0
          ? categories[resolvedCatIdx].questions.findIndex(
              item => String(item.id) === String(q.id) || Number(item.value) === Number(q.value)
            )
          : -1;
      await syncJeopardyOp(
        'select_question',
        {
          catIndex: resolvedCatIdx >= 0 ? resolvedCatIdx : 0,
          qIndex: resolvedQIdx >= 0 ? resolvedQIdx : 0,
          categoryName: q.category,
          questionId: q.id,
          question: q
        },
        chooserId
      );
      return;
    }

    setSelectedQuestion(q);
    setUserAnswer('');
    setFeedback(null);
    setShowResult(null);
    setShowHint(false);
    
    setTimeLeft(40);

    // Track question view in database and local state
    setCategories(prev => prev.map(cat => ({
      ...cat,
      questions: cat.questions.map(item => item.id === q.id ? {
        ...item,
        times_shown: Math.max(1, (Number((item as any).times_shown) || 0) + (options?.isReplay ? 1 : 0))
      } : item)
    })));
    const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
    fetch('/api/generated-questions/show', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: q?.db_id || q?.id,
        pack_id: q?.pack_id || packId,
        question_index: q?.question_index,
        user_id: String(activeUid),
        category: q?.category,
        topic: gameTopic || options?.topic || 'Общие знания',
        value: q?.value,
        is_replay: Boolean(options?.isReplay)
      })
    }).catch(() => {});
    
    if (q.type === 'normal') {
      setAnsweringPlayerIndex(currentPlayerIndex);
      setGameState('playing');
    } else {
      setSpecialType(q.type);
      setGameState('special');
      if (q.type === 'auction') {
        const nominal = q.value || (round * 100);
        setAuctionBet(nominal);
        setCustomBetInput(String(nominal));
        setAuctionHighBidder(currentPlayerIndex);
      }
    }
  };

  const handleCatTransfer = async (targetIdx: number) => {
    audioSystem.playSlot('jeopardy_special_cat_give');
    if (isMultiplayer) {
      const targetPlayer = players[targetIdx];
      if (!targetPlayer) return;
      // Requirement 5: Cannot transfer Cat in a Sack to yourself
      if (String(targetPlayer.id) === String(mpJeopardyState?.choosingUserId)) return;
      await syncJeopardyOp('cat_assign', { targetUserId: targetPlayer.id }, mpJeopardyState?.choosingUserId);
      return;
    }
    setAnsweringPlayerIndex(targetIdx);
    setGameState('playing');
    const randomValue = [100, 200, 300, 400, 500][Math.floor(Math.random() * 5)] * round;
    setSelectedQuestion(prev => prev ? { ...prev, value: randomValue, type: 'normal' } : null);
  };

  const handleAuctionBid = (amount: number) => {
    audioSystem.playSlot('jeopardy_auction_bid_raise');
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer) return;
    
    if (amount > currentPlayer.score + 1000) return;
    setAuctionBet(amount);
    setAuctionHighBidder(currentPlayerIndex);
    setTimeout(() => {}, 500);
  };

  const handleSendMessage = async (text: string, attachment?: ChatMessageAttachment | null) => {
    const activeUid = String(profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299');
    const newMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      senderId: options?.playMode === 'multi' ? activeUid : '1',
      senderName: profile?.display_name || 'Игрок 1',
      avatar: profile?.avatar_url || undefined,
      text,
      isBot: false,
      timestamp: Date.now(),
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null
    };
    setChatMessages(prev => [...prev, newMessage]);

    if (options?.playMode === 'multi' && mpRoomId) {
      try {
        const res = await fetch(`/api/multiplayer/rooms/${mpRoomId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: activeUid,
            action_type: 'chat',
            payload: {
              text,
              sender_name: profile?.display_name || 'Игрок 1',
              avatar_url: profile?.avatar_url || null,
              attachment_url: attachment?.url || null,
              attachment_name: attachment?.name || null,
              attachment_type: attachment?.type || null
            }
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setChatMessages(prev => prev.filter(m => m.id !== newMessage.id));
          return {
            moderated: Boolean(errData.moderated),
            error: errData.error || errData.reason || 'Сообщение отклонено ИИ-модератором чата'
          };
        }
      } catch (_) {}
    }
  };

  const addBotMessage = useCallback(async (botPlayer: Player, event: string, isCorrect: boolean) => {
    if (!botPlayer.personality) return;
    
    try {
      const comment = await protalkService.generateAIComment(
        botPlayer.personality,
        event,
        selectedQuestion?.question || '',
        selectedQuestion?.answer || '',
        isCorrect
      );
      
      const newMessage: ChatMessage = {
        id: `bot-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        senderId: botPlayer.id,
        senderName: botPlayer.name,
        text: comment,
        isBot: true,
        avatar: botPlayer.avatar,
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, newMessage]);
    } catch (error) {
      console.error('Error generating bot message:', error);
    }
  }, [selectedQuestion]);

  const submitAnswer = async (overrideAnswer?: string) => {
    const answerToSubmit = (overrideAnswer || userAnswer).trim();
    if (!selectedQuestion || checkingRef.current || !answerToSubmit) return;
    if (!isMultiplayer && answeringPlayerIndex === null) return;
    if (isMultiplayer && gameState !== 'final_question' && !canActAsMpUser(mpJeopardyState?.answeringUserId)) return;

    // Prevent duplicate submissions
    checkingRef.current = true;
    setChecking(true);
    setIsCheckTimedOut(false);

    if (isMultiplayer && mpJeopardyState?.phase === 'question_answer') {
      syncJeopardyOp('checking_answer', {}, mpJeopardyState?.answeringUserId || activeUidStr);
    }
    
    // Deduct 1 ruble per answer check
    const questionCost = options.isPurchased ? 0 : 1;
    try {
      if (!overrideAnswer && questionCost > 0) {
        await balanceService.deductBalance(
          profile?.uid ?? "", 
          questionCost, 
          `Своя Икра, проверка ответа на вопрос: "${selectedQuestion?.category || ''}" (${selectedQuestion?.value || 100})`, 
          'jeopardy'
        );
        triggerCoinAnimation();
        if (profile) (profile as any).balance = (profile.balance || 0) - 1;
      }

      const isExactMatch = isExactOrCloseAnswerMatch(answerToSubmit, selectedQuestion.answer);
      let result: { isCorrect: boolean; explanation: string };

      if (isExactMatch) {
        stopCheckTimer();
        setIsCheckTimedOut(false);
        const randomWaitSec = getRandomCheckSeconds(3, 10);
        await runSimulatedCheckCountdown(randomWaitSec, (remaining) => {
          setCheckTimer(remaining);
        });
        const factExpl = selectedQuestion.explanation || `Правильный ответ: ${selectedQuestion.answer}.`;
        result = {
          isCorrect: true,
          explanation: `Правильный ответ! ${factExpl}`
        };
      } else {
        stopCheckTimer();
        setIsCheckTimedOut(false);
        const stopAICountdown = startAICheckCountdown(
          (remaining) => {
            setCheckTimer(remaining);
          }, 
          60,
          () => {
            setIsCheckTimedOut(true);
          }
        );
        try {
          result = await protalkService.checkAnswer(
            selectedQuestion.question,
            answerToSubmit,
            selectedQuestion.answer,
            selectedQuestion.explanation,
            'jeopardy'
          );
        } finally {
          stopAICountdown();
        }
      }

      const isCorrect = result.isCorrect;
      audioSystem.playSlot(isCorrect ? 'jeopardy_answer_correct' : 'jeopardy_answer_wrong');
      const q = selectedQuestion;

      if (isMultiplayer) {
        stopCheckTimer();
        setUserAnswer('');
        if (gameState === 'final_question' || mpJeopardyState?.phase === 'final_question') {
          const targetUid = !mpJeopardyState?.finalAnswers?.[activeUidStr]
            ? activeUidStr
            : hasSelf2Participant && !mpJeopardyState?.finalAnswers?.[mySelf2Uid]
            ? mySelf2Uid
            : activeUidStr;
          await syncJeopardyOp(
            'submit_final_answer',
            {
              answer: answerToSubmit,
              is_correct: isCorrect,
              explanation: result.explanation || q.explanation || `Правильный ответ: ${q.answer}`
            },
            targetUid
          );
        } else {
          await syncJeopardyOp(
            'submit_answer',
            {
              answer: answerToSubmit,
              is_correct: isCorrect,
              explanation: result.explanation || q.explanation || `Правильный ответ: ${q.answer}`
            },
            mpJeopardyState?.answeringUserId || activeUidStr
          );
        }
        return;
      }

      const playerIdx = answeringPlayerIndex!;
      const currentPlayer = players[playerIdx];
      if (!currentPlayer) return;

      if (currentPlayer.isBot) {
        addBotMessage(currentPlayer, isCorrect ? 'ответил правильно' : 'ошибся в ответе', isCorrect);
      }
      
      if (gameState === 'final_question') {
        const player = players[playerIdx];
        const bet = finalBets[player.id] || 0;
        const newScore = isCorrect ? player.score + bet : player.score - bet;
        
        setPlayers(prev => prev.map((p, idx) => {
          if (idx === playerIdx) {
            return { ...p, score: newScore };
          }
          return p;
        }));

        // Track answer for final question in database
        const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
        fetch('/api/generated-questions/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: q?.db_id || q?.id,
            pack_id: q?.pack_id || packId,
            question_index: q?.question_index || 76,
            user_id: String(activeUid),
            user_answer: answerToSubmit,
            category: q?.category || finalCategories[0] || 'Суперфинал',
            topic: gameTopic || options?.topic || 'Общие знания',
            value: q?.value || 1000,
            is_correct: isCorrect ? 1 : 0,
            is_skipped: 0
          })
        }).catch(() => {});

        setFeedback({
          isCorrect,
          explanation: result.explanation || q.explanation || `Правильный ответ: ${q.answer}`,
          points: isCorrect ? bet : -bet
        });
        setGameState('feedback');
        stopCheckTimer();
        return;
      }

      const value = q.type === 'auction' ? auctionBet : q.value;
      
      setPlayers(prev => prev.map((p, idx) => {
        if (idx === playerIdx) {
          return { ...p, score: isCorrect ? p.score + value : p.score - value };
        }
        return p;
      }));

      setCategories(prev => prev.map(cat => ({
        ...cat,
        questions: cat.questions.map(question => question.id === q.id ? {
          ...question,
          isAnswered: true,
          is_answered: 1,
          is_correct: isCorrect ? 1 : 0,
          user_answer: answerToSubmit,
          times_shown: Math.max(1, Number((question as any).times_shown) || 1),
          times_correct: (Number((question as any).times_correct) || 0) + (isCorrect ? 1 : 0),
          times_incorrect: (Number((question as any).times_incorrect) || 0) + (isCorrect ? 0 : 1)
        } : question)
      })));

      // Track answer in database
      const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
      fetch('/api/generated-questions/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: q?.db_id || q?.id,
          pack_id: q?.pack_id || packId,
          question_index: q?.question_index,
          user_id: String(activeUid),
          user_answer: answerToSubmit,
          category: q?.category,
          topic: gameTopic || options?.topic || 'Общие знания',
          value: q?.value,
          is_correct: isCorrect ? 1 : 0,
          is_skipped: 0
        })
      }).catch(() => {});

      setFeedback({
        isCorrect,
        explanation: result.explanation || q.explanation || `Правильный ответ: ${q.answer}`,
        points: isCorrect ? value : -value
      });
      setGameState('feedback');
      stopCheckTimer();
    } catch (error) {
      console.error('Error checking answer:', error);
      if (!overrideAnswer && questionCost > 0) {
        await balanceService.addBalance(profile?.uid ?? "", questionCost);
      }
      stopCheckTimer();
    } finally {
      setChecking(false);
      checkingRef.current = false;
    }
  };

  // AI Logic Effect
  useEffect(() => {
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer || !currentPlayer.isBot || loading || generatingQuestion || checking || feedback) return;

    if (gameState === 'playing' && !selectedQuestion) {
      const timer = setTimeout(() => {
        const unasked = categories.flatMap(c => c.questions).filter(q => !q.isAnswered);
        if (unasked.length > 0) {
          audioSystem.playSlot('jeopardy_bot_turn_select');
          const randomQ = unasked[Math.floor(Math.random() * unasked.length)];
          handleQuestionSelect(randomQ);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }

    if (gameState === 'playing' && selectedQuestion && answeringPlayerIndex === currentPlayerIndex && !showResult) {
      const timer = setTimeout(() => {
        audioSystem.playSlot('jeopardy_buzzer_opponent');
        const difficulty = currentPlayer.difficulty || 'people';
        let successProbability = 0.5;
        switch(difficulty) {
          case 'dummy': successProbability = 0.3; break;
          case 'people': successProbability = 0.5; break;
          case 'genius': successProbability = 0.75; break;
          case 'god': successProbability = 0.9; break;
        }

        const shouldSucceed = Math.random() < successProbability;
        if (shouldSucceed) {
          submitAnswer(selectedQuestion.answer);
        } else {
          submitAnswer('Я не знаю, наверное это лягушка');
        }
      }, 3000);
      return () => clearTimeout(timer);
    }

    if (gameState === 'special') {
      const timer = setTimeout(() => {
        if (specialType === 'cat') {
          const others = players.map((_, i) => i).filter(i => i !== currentPlayerIndex);
          const target = others.includes(0) ? 0 : others[Math.floor(Math.random() * others.length)];
          handleCatTransfer(target);
        } else if (specialType === 'auction') {
          const nominal = selectedQuestion?.value || (round * 100);
          if (currentPlayer.score <= 0) {
            handleConfirmAuctionBet(nominal);
          } else {
            const maxPossible = Math.max(nominal, currentPlayer.score);
            const botBet = Math.min(maxPossible, Math.max(nominal, Math.floor((nominal + (maxPossible - nominal) * 0.5) / 100) * 100));
            handleConfirmAuctionBet(botBet);
          }
        }
      }, 2000);
      return () => clearTimeout(timer);
    }

    if (gameState === 'final_elimination') {
      const timer = setTimeout(() => {
        if (finalCategories.length > 1) {
          eliminateCategory(finalCategories[Math.floor(Math.random() * finalCategories.length)]);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }

    if (gameState === 'final_bet' && !finalBets[currentPlayer.id]) {
      const bet = Math.max(0, Math.floor(currentPlayer.score * 0.5));
      setFinalBets(prev => ({ ...prev, [currentPlayer.id]: bet }));
    }

    if (gameState === 'final_question' && answeringPlayerIndex === currentPlayerIndex) {
      const timer = setTimeout(() => {
        const difficulty = currentPlayer.difficulty || 'people';
        let successProbability = 0.5;
        switch(difficulty) {
          case 'dummy': successProbability = 0.2; break;
          case 'people': successProbability = 0.4; break;
          case 'genius': successProbability = 0.7; break;
          case 'god': successProbability = 0.9; break;
        }
        const shouldSucceed = Math.random() < successProbability;
        if (shouldSucceed) {
          submitAnswer(selectedQuestion?.answer || 'финал');
        } else {
          submitAnswer('Слишком сложно для жабы');
        }
      }, 3000);
      return () => clearTimeout(timer);
    }

  }, [currentPlayerIndex, gameState, selectedQuestion, answeringPlayerIndex, loading, generatingQuestion, checking, feedback, categories, specialType, auctionBet, finalCategories, finalBets]);

  const handleContinue = async () => {
    if (gameState === 'feedback') {
      if (isMultiplayer) {
        setFeedback(null);
        setSelectedQuestion(null);
        setUserAnswer('');
        await syncJeopardyOp('continue_after_feedback');
        return;
      }

      const wasCorrect = feedback?.isCorrect;
      const playerIdx = answeringPlayerIndex!;
      const isFinal = selectedQuestion?.id === 'final';
      
      if (isFinal) {
        setFeedback(null);
        if (playerIdx + 1 < players.length) {
          setAnsweringPlayerIndex(playerIdx + 1);
          setGameState('final_question');
          setUserAnswer('');
        } else {
          const userPlayer = players.find(p => p.id === '1');
          const rawUserScore = userPlayer?.score || 0;
          const mult = scoringRule?.multiplier ?? 1.0;
          const finalUserScore = Math.round(rawUserScore * mult);
          const isWin = rawUserScore > (players.find(p => p.id === '2')?.score || 0);
          
          const effectiveUid = profile?.uid || localStorage.getItem('qaiz_active_user_id') || '10016926299';
          const saved = await saveGameSession({
            userId: effectiveUid,
            gameId: 'jeopardy',
            gameTitle: 'Своя Икра',
            score: finalUserScore,
            rawScore: rawUserScore,
            totalQuestions: 75,
            correctAnswers: isWin ? 25 : 10,
            mode: options.mode,
            difficulty: options.difficulty || 'people',
            topic: gameTopic || options.topic || 'Общие знания',
            pricePaid: options.price,
            isWin,
            packId: options.packId || packId || `pack_jeopardy_${Date.now()}`
          });

          if (saved?.calculation) {
            setScoreCalculation(saved.calculation);
            setAuthoritativeScore(saved.score ?? saved.calculation.authoritativeScore);
          } else {
            const calc = await calculateAuthoritativeScoreClient({
              gameId: 'jeopardy',
              difficulty: options.difficulty || 'people',
              score: rawUserScore,
              rawScore: rawUserScore,
              totalQuestions: 75,
              correctAnswers: isWin ? 25 : 10,
              isWin,
              mode: options.mode
            });
            if (calc) {
              setScoreCalculation(calc);
              setAuthoritativeScore(calc.authoritativeScore);
            }
          }

          if (options.packId) {
            await deleteGameProgress(effectiveUid, options.packId, 'jeopardy');
          }
          setGameState('game_over');
          setSelectedQuestion(null);
        }
        return;
      }

      setSelectedQuestion(null);
      setGameState('playing');
      setSpecialType(null);
      setAnsweringPlayerIndex(null);
      setUserAnswer('');
      setFeedback(null);
      
      if (!wasCorrect) {
        setCurrentPlayerIndex((currentPlayerIndex + 1) % players.length);
      } else {
        setCurrentPlayerIndex(playerIdx);
      }

      const allAnswered = categories.every(c => c.questions.every(q => q.isAnswered));
      if (allAnswered) {
        audioSystem.playSlot('jeopardy_round_complete');
        setPastRoundsCategories(prev => ({
          ...prev,
          [round]: categories
        }));
        if (round < 3) {
          setRound(r => r + 1);
          generateRoundCategories(round + 1);
        } else {
          startFinalRound();
        }
      }
    }
  };

  const startFinalRound = () => {
    setGameState('final_elimination');
    setSelectedQuestion(null);
    let candidates: string[] = [];
    if (allTopics && allTopics.length >= 15) {
      candidates = allTopics.slice(0, 15).map(t => t.name);
    }
    if (candidates.length < 5) {
      candidates = [
        `Тайны темы «${options.topic || 'эрудиция'}»`,
        'Великие открытия и эпохи',
        'Парадоксы и загадки',
        'Золотой фонд мысли',
        'Кульминация знатоков'
      ];
    }
    setFinalCategories(candidates);
    const userScore = players[0]?.score || 0;
    setUserFinalBet(Math.max(0, Math.min(1000, userScore)));
  };

  const eliminateCategory = async (name: string) => {
    audioSystem.playSlot('jeopardy_final_theme_eliminate');
    if (isMultiplayer) {
      const elimUid = mpJeopardyState?.eliminatingUserId || activeUidStr;
      if (!canActAsMpUser(elimUid)) return;
      await syncJeopardyOp('eliminate_final_category', { categoryName: name }, elimUid);
      return;
    }
    const remaining = finalCategories.filter(c => c !== name);
    setFinalCategories(remaining);
    setCurrentPlayerIndex((currentPlayerIndex + 1) % players.length);
    
    if (remaining.length === 1) {
      setTimeout(() => audioSystem.playSlot('jeopardy_final_theme_chosen'), 250);
      setSelectedQuestion(null);
      setGameState('final_bet');
      const userScore = players[0]?.score || 0;
      setUserFinalBet(Math.max(0, Math.min(1000, userScore)));
    }
  };

  const handleConfirmFinalBet = async () => {
    audioSystem.playSlot('jeopardy_final_bet_locked');
    if (isMultiplayer) {
      const targetUid = mpJeopardyState?.finalBets?.[activeUidStr] === undefined
        ? activeUidStr
        : hasSelf2Participant && mpJeopardyState?.finalBets?.[mySelf2Uid] === undefined
        ? mySelf2Uid
        : activeUidStr;
      const myPart = displayMpParticipants.find(p => String(p.user_id) === targetUid);
      const maxAllowedBet = Math.max(0, Number(myPart?.score) || 0);
      const clampedBet = Math.max(0, Math.min(userFinalBet, maxAllowedBet));
      await syncJeopardyOp('place_final_bet', { bet: clampedBet }, targetUid);
      return;
    }
    setFinalQuestionLoading(true);
    const categoryName = finalCategories[0] || options.topic || 'Супер-игра';
    const userScore = players[0]?.score || 0;
    const maxAllowedBet = Math.max(0, userScore);
    const clampedBet = Math.max(0, Math.min(userFinalBet, maxAllowedBet));

    const betsMap: Record<string, number> = {
      [players[0].id]: clampedBet
    };
    players.slice(1).forEach(bot => {
      const botScore = Math.max(0, bot.score);
      betsMap[bot.id] = Math.max(0, Math.floor(botScore * (0.3 + Math.random() * 0.4)));
    });
    setFinalBets(betsMap);

    // Collect all answers from rounds 1, 2, and 3 to exclude duplicates in superfinal
    const pastAnswers: string[] = [];
    Object.values(pastRoundsCategories).forEach(catList => {
      catList.forEach(c => c.questions?.forEach(q => {
        if (q.answer) pastAnswers.push(q.answer);
      }));
    });
    categories.forEach(c => c.questions?.forEach(q => {
      if (q.answer) pastAnswers.push(q.answer);
    }));

    try {
      const superQ = await protalkService.generateJeopardySuperQuestion(
        options.topic || gameTopic || 'Общие знания',
        categoryName,
        pastAnswers,
        packId,
        clampedBet,
        options?.note
      );
      const finalQDbId = `gq_${packId}_76`;
      const finalQuestionObj: Question = {
        id: 'final',
        db_id: finalQDbId,
        pack_id: packId,
        question_index: 76,
        category: categoryName,
        value: clampedBet,
        question: superQ.question,
        answer: superQ.answer,
        hint: superQ.hint || '',
        explanation: superQ.explanation || '',
        isAnswered: false,
        type: 'normal'
      };

      const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
      protalkService.saveGeneratedQuestions(String(activeUid), 'jeopardy', categoryName, [finalQuestionObj], 'people', packId);

      // Track show in database
      fetch('/api/generated-questions/show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: finalQDbId,
          pack_id: packId,
          question_index: 76,
          user_id: String(activeUid),
          is_replay: Boolean(options?.isReplay)
        })
      }).catch(() => {});

      setSelectedQuestion(finalQuestionObj);
      setUserAnswer('');
      setFeedback(null);
      setTimeLeft(60); // Strictly 60-second timer as requested!
      setAnsweringPlayerIndex(0);
      setGameState('final_question');
    } catch (e) {
      console.error('Error generating super question:', e);
      const finalQDbId = `gq_${packId}_76`;
      const fallbackFinalObj: Question = {
        id: 'final',
        db_id: finalQDbId,
        pack_id: packId,
        question_index: 76,
        category: categoryName,
        value: clampedBet,
        question: `Финальный вопрос супер-игры по теме «${categoryName}»: назовите главное явление или концепт, лежащий в её основе.`,
        answer: categoryName,
        hint: 'Связано непосредственно с темой супер-игры',
        explanation: 'Финальный раунд Своей Икры.',
        isAnswered: false,
        type: 'normal'
      };

      const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
      protalkService.saveGeneratedQuestions(String(activeUid), 'jeopardy', categoryName, [fallbackFinalObj], 'people', packId);

      // Track show in database
      fetch('/api/generated-questions/show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: finalQDbId,
          pack_id: packId,
          question_index: 76,
          user_id: String(activeUid),
          is_replay: Boolean(options?.isReplay)
        })
      }).catch(() => {});

      setSelectedQuestion(fallbackFinalObj);
      setUserAnswer('');
      setFeedback(null);
      setTimeLeft(60);
      setAnsweringPlayerIndex(0);
      setGameState('final_question');
    } finally {
      setFinalQuestionLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-4 gap-8 px-2 md:px-0 pb-20">
      <CoinAnimation key={coinAnimKey} show={showCoinAnimation} />
      <MultiplayerCountdownOverlay
        isOpen={showCountdown || (isMultiplayer && gameState === 'final_countdown')}
        onComplete={() => {
          setShowCountdown(false);
          if (isMultiplayer && (gameState === 'final_countdown' || mpJeopardyState?.phase === 'final_countdown')) {
            syncJeopardyOp('start_final_answering');
            setGameState('final_question');
            return;
          }
          setGameState('category_reveal');
          setTopicRevealIndex(0);
          setShowTopicReveal(true);
        }}
        gameTitle={`Своя Икра: ${gameTopic || options?.topic || 'Общие знания'}`}
        subtitle={
          isMultiplayer && (gameState === 'final_countdown' || mpJeopardyState?.phase === 'final_countdown')
            ? 'Обратный отсчёт перед вопросом Суперфинала...'
            : 'Обратный отсчёт перед показом 15 категорий...'
        }
      />
      <div className="lg:col-span-3 space-y-4 md:space-y-8">
      {isMultiplayer && gameState === 'mp_lobby' && (
        <MultiplayerGameWebcamStrip
          roomId={mpRoomId}
          gameId="jeopardy"
          gameTitle={`Своя Икра: ${gameTopic || options?.topic || 'Общие знания'}`}
          isLobby={true}
          maxPlayers={Math.min(8, Math.max(2, Number(mpRoomData?.max_players || mpJeopardyState?.maxPlayers || mpMaxPlayers) || 8))}
          choosingUserId={mpJeopardyState?.choosingUserId || null}
          answeringUserId={mpJeopardyState?.answeringUserId || null}
          currentUser={{
            uid: String(profile?.uid || user?.id || '10016926299'),
            display_name: profile?.display_name || 'Игрок 1',
            avatar_url: profile?.avatar_url
          }}
          localRound={round}
          totalRounds={4}
          localScore={players[0]?.score || 0}
          localCorrectCount={totalAnsweredCount}
          localIsFinished={false}
          onOpenInvite={() => setIsMpInviteOpen(true)}
          onOpenZoomModal={() => setIsMpZoomOpen(true)}
          onRoomStateSync={(data) => {
            if (data.room) {
              setMpRoomData(data.room);
            }
            if (Array.isArray(data.participants)) {
              setMpParticipants(data.participants);
            }
            if (Array.isArray(data.chatMessages)) {
              setChatMessages(data.chatMessages);
            }
            const jState = (data as any).jeopardy_state || data.room?.jeopardy_state;
            if (jState) {
              applyServerJeopardyState(jState, data.room, data.participants);
            } else if (data.room?.status === 'active' && gameState === 'mp_lobby' && !showCountdown) {
              triggerMpCountdownAndRevealCategories();
            }
          }}
        />
      )}

      {gameState === 'mp_lobby' && (
        <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-foreground/10 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <BubbleElement size="sm" isBadge className="px-3 py-1 text-sm font-black text-primary border-primary/40 flex items-center gap-1.5">
                  <Sparkles size={14} />
                  Категории и 1-й тур сгенерированы • Ожидание игроков
                </BubbleElement>
                <BubbleElement size="sm" isBadge active className="px-3 py-1 text-sm font-bold">
                  {(mpRoomData?.visibility || mpJeopardyState?.visibility || mpVisibility) === 'private'
                    ? 'Закрытая (по приглашению)'
                    : 'Открытая игра'}
                </BubbleElement>
                <BubbleElement size="sm" isBadge className="px-3 py-1 text-sm font-bold text-primary">
                  Участников: {Math.max(1, mpParticipants.length)} из {Math.min(8, Math.max(2, Number(mpRoomData?.max_players || mpJeopardyState?.maxPlayers || mpMaxPlayers) || 8))}
                </BubbleElement>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-foreground">
                Лобби игры «Своя Икра»
              </h2>
              <p className="text-sm text-foreground/70">
                15 категорий и вопросы 1-го тура готовы! Пригласите друзей. Создатель нажимает «Начать игру», после чего пойдет обратный отсчет 5..1, анимация 15 категорий и откроется окно 1-го тура у всех.
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <LeafButton
                variant="glass"
                size="md"
                onClick={() => setIsMpInviteOpen(true)}
                className="text-sm font-bold px-4 py-2.5"
              >
                <UserPlus size={16} className="mr-1.5 text-primary" />
                Пригласить друзей
              </LeafButton>
              {(() => {
                const activeUid = String(profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299');
                const isHost = !roomHostId ? isMyClientGenerator : String(roomHostId) === activeUid;
                const myParticipant = mpParticipants.find(p => String(p.user_id) === activeUid);
                const isMyReady = Boolean(myParticipant?.is_ready);
                return isHost ? (
                  <LeafButton
                    variant="primary"
                    size="lg"
                    disabled={readyStarting}
                    onClick={handleToggleReadyOrStartJeopardy}
                    className="text-base font-black px-6 py-3 shadow-xl"
                  >
                    <Play size={18} className="mr-2 fill-current" />
                    Начать игру
                  </LeafButton>
                ) : (
                  <LeafButton
                    variant={isMyReady ? 'glass' : 'primary'}
                    size="lg"
                    disabled={readyStarting}
                    onClick={handleToggleReadyOrStartJeopardy}
                    className={`text-base font-black px-6 py-3 shadow-xl ${isMyReady ? 'border-emerald-400/50 text-emerald-300' : ''}`}
                  >
                    <CheckCircle2 size={18} className="mr-2" />
                    {isMyReady ? 'Подтверждено: Готов' : 'Готово'}
                  </LeafButton>
                );
              })()}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {(mpParticipants.length > 0
              ? mpParticipants
              : [
                  {
                    id: String(profile?.uid || user?.id || '10016926299'),
                    user_id: String(profile?.uid || user?.id || '10016926299'),
                    display_name: profile?.display_name || 'Вы',
                    avatar_url: profile?.avatar_url || null,
                    role: 'host',
                    is_ready: 1
                  }
                ]
            ).map((p, idx) => {
              const pIsHost = p.role === 'host' || String(p.user_id) === String(roomHostId || profile?.uid || user?.id || '10016926299');
              const pIsSelf2 = String(p.user_id).endsWith('_self2');
              const pIsReady = Boolean(p.is_ready) || pIsHost || pIsSelf2;
              return (
                <div
                  key={p.id || p.user_id || idx}
                  className="rounded-2xl border border-foreground/15 bg-transparent backdrop-blur-xl p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar avatarUrl={p.avatar_url} displayName={p.display_name} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-foreground truncate">{p.display_name || 'Игрок'}</div>
                      <div className="text-sm text-foreground/60">
                        {pIsHost && !pIsSelf2 ? 'Создатель лобби' : pIsReady ? 'Готов к игре' : 'Ожидает подтверждения'}
                      </div>
                    </div>
                  </div>
                  <BubbleElement
                    size="sm"
                    isBadge
                    className={`px-2.5 py-1 text-sm font-bold shrink-0 ${
                      pIsReady ? 'text-emerald-300 border-emerald-400/40' : 'text-amber-300 border-amber-400/40'
                    }`}
                  >
                    {pIsHost && !pIsSelf2 ? 'Хост' : pIsReady ? 'Готов' : 'Ждем'}
                  </BubbleElement>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {gameState === 'lobby' && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-8 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 shadow-2xl">
          <Trophy size={100} className="text-primary animate-pulse" />
          <h2 className="text-4xl font-black tracking-tight text-primary">Готовы к игре?</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            {hasProgress && (
              <LeafButton 
                variant="glass"
                size="lg"
                onClick={handleResume} 
                disabled={loading}
                className="justify-center"
              >
                {loading ? <Loader2 className="animate-spin mr-2" /> : <RotateCcw size={20} className="mr-2" />}
                Продолжить
              </LeafButton>
            )}
            <LeafButton 
              variant="primary"
              size="lg"
              onClick={startLevel} 
              disabled={loading}
              className="justify-center text-xl font-black"
            >
              {loading && !hasProgress && <Loader2 className="animate-spin mr-2" />}
              Начать игру
            </LeafButton>
          </div>
        </div>
      )}

      {gameState === 'error' && (
        <div className="flex min-h-[60vh] items-center justify-center p-4">
          <GameError 
            message={errorMessage}
            onRetry={() => {
              if (retryAction) {
                retryAction();
              } else if (categories && categories.length > 0) {
                startRoundQuestions();
              } else {
                startLevel();
              }
            }} 
            onReturn={() => {
              if (categories && categories.length > 0) {
                setGameState('category_reveal');
              } else {
                navigate('/');
              }
            }} 
            returnText="Отменить"
          />
        </div>
      )}

      {/* Requirement 8 & 10: Non-generator participants see inline waiting banner without blocking overlay so they can use the chat */}
      {isMultiplayer && !isMyClientGenerator && (gameState === 'mp_generating_round' || gameState === 'final_generating') && (
        <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 text-center space-y-4 shadow-2xl">
          <Loader2 size={44} className="mx-auto text-primary animate-spin" />
          <h2 className="text-2xl sm:text-3xl font-black text-primary">
            {gameState === 'final_generating'
              ? 'Идет подготовка вопроса Суперфинала...'
              : `Идет подготовка к следующему туру (${mpJeopardyState?.generatingNextRound || round + 1})...`}
          </h2>
          <p className="text-sm sm:text-base text-foreground/75 max-w-xl mx-auto leading-relaxed">
            Автор игры генерирует вопросы нового этапа. Вы можете пока общаться в групповом чате — экран переключится автоматически сразу после завершения генерации!
          </p>
        </div>
      )}

      {/* Loading Overlay (shown to single-player or ONLY to the generator in multiplayer) */}
      {!showTopicReveal && (!isMultiplayer || isMyClientGenerator || gameState === 'loading') && (gameState === 'loading' || loading || generatingRound || finalQuestionLoading || (isMultiplayer && isMyClientGenerator && (gameState === 'mp_generating_round' || gameState === 'final_generating'))) && (
        <GenerationLoadingScreen
          gameId="jeopardy"
          title={
            finalQuestionLoading || gameState === 'final_generating'
              ? "Своя Икра — Суперфинал"
              : generatingRound || gameState === 'mp_generating_round'
              ? `Своя Икра — Тур ${mpJeopardyState?.generatingNextRound || round}`
              : "Своя Икра"
          }
          maxSeconds={240}
          messages={finalQuestionLoading || gameState === 'final_generating'
            ? [
                'Подключаемся к нейросети proTalk...',
                `Анализируем тему финала «${finalCategories[0] || options.topic || gameTopic || 'Супер-игра'}»...`,
                'Исключаем все повторы из 3 предыдущих туров...',
                'Формулируем кульминационный вопрос за 60 секунд...',
                'Настраиваем решающий раунд...',
                'Почти готово...'
              ]
            : generatingRound || gameState === 'mp_generating_round'
            ? [
                'Подключаемся к нейросети proTalk (до 240 сек)...',
                `Формируем 25 вопросов для ${mpJeopardyState?.generatingNextRound || round}-го тура одним пакетом...`,
                'Настраиваем нарастающую сложность по номиналам...',
                'Проверяем уникальность ответов и исключаем повторы...',
                'Собираем игровое поле...',
                'Почти готово...',
              ]
            : [
                'Подключаемся к нейросети proTalk (до 240 сек)...',
                'Придумываем 15 категорий на 3 тура...',
                'Готовим колоритные описания тем...',
                'Настраиваем икряное поле...',
                'Почти готово...',
              ]}
          onCancel={() => {
            if (finalQuestionLoading) {
              setFinalQuestionLoading(false);
            } else if (generatingRound) {
              setGeneratingRound(false);
              setGameState('category_reveal');
            } else if (loading) {
              setLoading(false);
              setGameState('lobby');
            }
          }}
        />
      )}

      {/* Topic Reveal Animation (all 15 topics) */}
      {showTopicReveal && (
        <TopicRevealScreen 
          topics={allTopics}
          onComplete={() => {
            setShowTopicReveal(false);
            mpTopicRevealShownRef.current = true;
            if (!categories || categories.length === 0) {
              const roundTopics = getTopicsForRound(allTopics, round);
              const newCategories = roundTopics.map((cat, catIdx) => {
                const questions = [100, 200, 300, 400, 500].map((val, qIdx) => {
                  const globalIndex = (round - 1) * 25 + catIdx * 5 + qIdx + 1;
                  const qId = `gq_${packId}_${globalIndex}`;
                  return {
                    id: qId,
                    db_id: qId,
                    pack_id: packId,
                    question_index: globalIndex,
                    category: cat.name,
                    value: val * round,
                    question: '',
                    answer: '',
                    isAnswered: false,
                    type: 'normal' as const
                  };
                });
                return { name: cat.name, description: cat.description, questions };
              });
              setCategories(newCategories);
            }
            // Requirement 3: In multiplayer, after 5s countdown and 15-category animation, immediately open the Round 1 board for everyone!
            if (isMultiplayer) {
              syncJeopardyOp('start_round_board');
              setGameState('playing');
            } else {
              setGameState('category_reveal');
            }
          }}
        />
      )}

      {gameState === 'category_reveal' && !showTopicReveal && (
        <div className="space-y-8 py-10">
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-black tracking-tight text-primary">Тур {round}: Категории</h2>
            <p className="text-foreground/70 text-base">{ROUND_CONFIGS[round-1]?.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((cat, idx) => (
              <motion.div 
                key={`cat-reveal-${cat.name || idx}-${idx}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="group relative overflow-hidden rounded-3xl border border-primary/30 bg-transparent backdrop-blur-xl p-8 transition-all hover:border-primary/50 shadow-lg"
              >
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 blur-2xl transition-all group-hover:bg-primary/10" />
                <h3 className="relative z-10 text-2xl font-black tracking-tight text-primary">{cat.name}</h3>
                <p className="relative z-10 mt-4 text-sm leading-relaxed text-foreground/70">{cat.description}</p>
              </motion.div>
            ))}
          </div>

          <div className="flex justify-center pt-8">
            <LeafButton 
              variant="primary"
              size="lg"
              onClick={startRoundQuestions}
              className="text-2xl font-black px-16 py-5 justify-center"
            >
              {round === 1 ? 'Начать игру' : `Начать тур ${round}`}
            </LeafButton>
          </div>
        </div>
      )}

      {(gameState === 'playing' || (isMultiplayer && gameState === 'feedback')) && (
        <div
          className={`space-y-4 ${
            isMultiplayer &&
            (checking ||
              mpJeopardyState?.answerCheckingInProgress ||
              (gameState === 'feedback' && feedback) ||
              Boolean(selectedQuestion))
              ? 'md:hidden'
              : ''
          }`}
        >
          <div className="grid grid-cols-1 gap-2.5 md:gap-4">
            {categories.map((category, catIdx) => (
              <div key={`${category.name}-${catIdx}`} className="grid grid-cols-1 md:grid-cols-6 items-center gap-2.5 md:gap-4">
                <div className="col-span-1 w-full h-full flex items-center justify-center">
                  <LeafButton 
                    variant="glass"
                    size="md"
                    onClick={() => setShowCategoryInfo(category.name)}
                    className="w-full h-full min-h-[64px] sm:min-h-[74px] md:min-h-[82px] p-2.5 flex items-center justify-center text-center cursor-pointer transition-all hover:border-primary/60 shadow-md group"
                    title="Нажмите, чтобы открыть подробное описание темы"
                  >
                    <span className="text-sm font-bold text-foreground leading-tight line-clamp-2 text-center select-none group-hover:text-primary transition-colors">
                      {category.name}
                    </span>
                  </LeafButton>
                </div>
                <div className="col-span-1 md:col-span-5 grid grid-cols-5 gap-2 md:gap-4 items-center">
                  {category.questions.map((q, qIdx) => {
                    const canPick = !isMultiplayer || canActAsMpUser(mpJeopardyState?.choosingUserId);
                    return (
                      <div key={`jeopardy-q-${category.name}-${q.id || qIdx}-${qIdx}`} className="flex items-center justify-center">
                        <BubbleElement
                          isBadge={false}
                          disabled={q.isAnswered || generatingQuestion || !canPick || mpActionPending}
                          onClick={() => handleQuestionSelect(q)}
                          className={`!rounded-full aspect-square w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 p-0 flex items-center justify-center text-sm sm:text-xl md:text-2xl font-black transition-all duration-300 ${
                            q.isAnswered 
                              ? 'opacity-25 cursor-not-allowed !grayscale !border-foreground/15 text-foreground/40' 
                              : !canPick
                              ? 'opacity-70 cursor-not-allowed text-primary border-primary/30'
                              : 'cursor-pointer hover:scale-110 active:scale-95 shadow-lg text-primary border-primary/40 hover:border-primary/80 hover:shadow-primary/30'
                          }`}
                        >
                          {q.isAnswered ? '✓' : q.value}
                        </BubbleElement>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Special Question (Cat in a Bag & Auction) rendered inline in the categories & nominals board container for all players simultaneously */}
      <AnimatePresence>
        {gameState === 'special' && (
          <motion.div
            key="modal-special-question-jeopardy"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative w-full"
          >
            <div className="w-full text-center space-y-6 rounded-3xl border border-primary/35 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-2xl">
              {specialType === 'cat' ? (
                <>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <BubbleElement isBadge active size="sm">
                      Спецвопрос • Кот в мешке
                    </BubbleElement>
                    {selectedQuestion?.category && (
                      <BubbleElement isBadge size="sm">
                        Категория: {selectedQuestion.category} • {selectedQuestion.value} очков
                      </BubbleElement>
                    )}
                  </div>
                  <Gift size={64} className="mx-auto text-primary animate-bounce" />
                  <h2 className="text-3xl sm:text-4xl font-black text-primary">Кот в мешке!</h2>
                  {isMultiplayer && !canActAsMpUser(mpJeopardyState?.choosingUserId) ? (
                    <div className="max-w-xl mx-auto p-5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl space-y-2">
                      <p className="text-lg sm:text-xl text-foreground/90">
                        Участник <span className="text-primary font-black">{getMpPlayerName(mpJeopardyState?.choosingUserId)}</span> открыл «Кота в мешке» и сейчас выбирает, кому из соперников передать этот вопрос...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-w-xl mx-auto">
                      <p className="text-base sm:text-lg text-foreground/90 font-semibold">
                        Выберите другого игрока, которому отдать этот вопрос (себя выбрать нельзя):
                      </p>
                      <div className="flex justify-center flex-wrap gap-3.5">
                        {players.map((p, idx) => {
                          const isChooserSelf = isMultiplayer
                            ? String(p.id) === String(mpJeopardyState?.choosingUserId)
                            : idx === currentPlayerIndex;
                          if (isChooserSelf && players.length > 1) return null;
                          return (
                            <LeafButton
                              key={`${p.id}-${idx}`}
                              variant="primary"
                              size="md"
                              disabled={mpActionPending}
                              onClick={() => handleCatTransfer(idx)}
                            >
                              {p.name} ({p.score} очк.)
                            </LeafButton>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : isMultiplayer && mpJeopardyState?.auctionState ? (
                <>
                  {(() => {
                    const aState = mpJeopardyState.auctionState;
                    const currentBidderUid = aState.currentBidderId;
                    const highBidderUid = aState.highBidderId || aState.currentHighBidderId || mpJeopardyState.choosingUserId;
                    const nominal = Number(aState.nominalValue) || (round * 100);
                    const currentHighBid = Number(aState.currentHighBid) || nominal;
                    const hasInitial = Boolean(aState.hasPlacedInitialBid);
                    const onlyNominalAllowed = Boolean(aState.onlyNominalAllowed);
                    const passedIds: string[] = Array.isArray(aState.passedBidderIds) ? aState.passedBidderIds.map(String) : [];
                    const autoSkippedIds: string[] = Array.isArray(aState.autoSkippedBidderIds) ? aState.autoSkippedBidderIds.map(String) : [];
                    const bidderPlayer = players.find(pl => String(pl.id) === String(currentBidderUid));
                    const bidderScore = Number(bidderPlayer?.score) || 0;
                    const minNextBid = hasInitial ? currentHighBid + 100 : nominal;
                    const maxAllowedBet = bidderScore <= 0 ? nominal : Math.max(nominal, bidderScore);
                    const isMyBidTurn = canActAsMpUser(currentBidderUid);
                    const activeCatName =
                      mpJeopardyState?.activeQuestion?.categoryName ||
                      selectedQuestion?.category ||
                      'Аукцион';

                    // Build sequential turn order list starting from choosingUserId
                    const serverTurnOrder: any[] = Array.isArray(aState.turnOrder) && aState.turnOrder.length > 0
                      ? aState.turnOrder
                      : (() => {
                          const chooserId = String(mpJeopardyState?.choosingUserId || players[0]?.id || '');
                          const ordered = [...players];
                          const startIdx = Math.max(0, ordered.findIndex(pl => String(pl.id) === chooserId));
                          return ordered.map((_, offset) => {
                            const pl = ordered[(startIdx + offset) % ordered.length];
                            const uid = String(pl.id);
                            const pScore = Number(pl.score) || 0;
                            const isCur = Boolean(currentBidderUid && String(currentBidderUid) === uid);
                            const isHigh = Boolean(hasInitial && highBidderUid && String(highBidderUid) === uid);
                            const isAutoSkip = autoSkippedIds.includes(uid) || (!isHigh && !isCur && (onlyNominalAllowed || pScore < nominal || (hasInitial && pScore <= currentHighBid)));
                            const isPass = passedIds.includes(uid) && !isAutoSkip;
                            return {
                              order: offset + 1,
                              userId: uid,
                              displayName: pl.name,
                              avatarUrl: pl.avatar,
                              score: pScore,
                              status: isCur ? 'current' : isHigh ? 'high_bidder' : isAutoSkip ? 'auto_skipped' : isPass ? 'passed' : 'waiting'
                            };
                          });
                        })();

                    const otherEligibleCount = serverTurnOrder.filter(
                      item =>
                        String(item.userId) !== String(currentBidderUid) &&
                        !passedIds.includes(String(item.userId)) &&
                        Number(item.score) >= (hasInitial ? currentHighBid + 100 : nominal)
                    ).length;
                    const canPassTurn = hasInitial || otherEligibleCount > 0;
                    const bidHistoryList: any[] = Array.isArray(aState.bidHistory) ? aState.bidHistory : [];

                    return (
                      <div className="space-y-6 max-w-3xl mx-auto">
                        {/* Header Badges */}
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <BubbleElement isBadge active size="sm">
                            Вопрос-Аукцион • Поочерёдные торги
                          </BubbleElement>
                          <BubbleElement isBadge size="sm">
                            Категория: {activeCatName}
                          </BubbleElement>
                          <BubbleElement isBadge size="sm" className="text-amber-300 font-black">
                            Номинал: {nominal} очков
                          </BubbleElement>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                          <Gavel size={48} className="mx-auto text-primary" />
                          <h2 className="text-2xl sm:text-3xl font-black text-primary">
                            Аукцион! Делайте ваши ставки
                          </h2>
                          <p className="text-sm text-foreground/75 max-w-xl">
                            Ставки делаются поочерёдно по кругу, начиная с открывшего ячейку ({getMpPlayerName(mpJeopardyState?.choosingUserId)}). Максимальная ставка ограничена текущим банком очков игрока (Ва-банк).
                          </p>
                        </div>

                        {/* Current Turn & High Bid Banner */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-left">
                          <div className="p-4 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-xl space-y-1.5 shadow-lg">
                            <span className="text-sm text-foreground/70 font-semibold block">
                              Сейчас делает ставку:
                            </span>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-base sm:text-lg font-black text-primary truncate">
                                {getMpPlayerName(currentBidderUid)}
                              </span>
                              <BubbleElement isBadge active size="sm">
                                Банк: {bidderScore} очк.
                              </BubbleElement>
                            </div>
                          </div>

                          <div className="p-4 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl space-y-1.5">
                            <span className="text-sm text-foreground/70 font-semibold block">
                              {hasInitial ? 'Лидер торгов и текущая ставка:' : 'Начальная ставка (номинал):'}
                            </span>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-base sm:text-lg font-black text-amber-300 truncate">
                                {currentHighBid} очков
                              </span>
                              <BubbleElement isBadge size="sm">
                                {hasInitial ? `Лидер: ${getMpPlayerName(highBidderUid)}` : `Открыл: ${getMpPlayerName(mpJeopardyState?.choosingUserId)}`}
                              </BubbleElement>
                            </div>
                          </div>
                        </div>

                        {/* Sequential Turn-by-Turn Participant Order */}
                        <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 space-y-3 text-left">
                          <div className="flex items-center justify-between gap-2 border-b border-primary/15 pb-2">
                            <span className="text-sm font-bold text-primary">
                              Очередность ставок участников по правилам:
                            </span>
                            <span className="text-sm text-foreground/65">
                              Мин. шаг: +100 очк.
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {serverTurnOrder.map((item: any, idx: number) => {
                              const isCurrent = item.status === 'current';
                              const isHigh = item.status === 'high_bidder';
                              const isPassed = item.status === 'passed';
                              const isAutoSkip = item.status === 'auto_skipped';
                              return (
                                <div
                                  key={`auc-turn-${item.userId}-${idx}`}
                                  className={`flex items-center justify-between gap-2.5 p-3 rounded-2xl border transition-all backdrop-blur-md ${
                                    isCurrent
                                      ? 'border-primary shadow-[0_0_18px_rgba(153,208,55,0.3)]'
                                      : isHigh
                                      ? 'border-amber-400/50'
                                      : isPassed || isAutoSkip
                                      ? 'border-foreground/15 opacity-65'
                                      : 'border-primary/20'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="w-6 h-6 rounded-full border border-primary/40 flex items-center justify-center text-sm font-black text-primary shrink-0">
                                      {item.order || idx + 1}
                                    </span>
                                    <UserAvatar avatarUrl={item.avatarUrl} displayName={item.displayName} size="sm" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold text-foreground truncate">
                                        {item.displayName}
                                      </p>
                                      <p className="text-sm text-foreground/65">
                                        Банк: {item.score} очк.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="shrink-0">
                                    {isCurrent ? (
                                      <BubbleElement isBadge active size="sm">
                                        Делает ставку
                                      </BubbleElement>
                                    ) : isHigh ? (
                                      <BubbleElement isBadge size="sm" className="text-amber-300 border-amber-400/40">
                                        Лидер: {currentHighBid}
                                      </BubbleElement>
                                    ) : isPassed ? (
                                      <BubbleElement isBadge size="sm" className="text-rose-400 border-rose-500/30">
                                        Пас
                                      </BubbleElement>
                                    ) : isAutoSkip ? (
                                      <BubbleElement isBadge size="sm" className="text-foreground/60">
                                        Мало очков
                                      </BubbleElement>
                                    ) : (
                                      <BubbleElement isBadge size="sm">
                                        В очереди
                                      </BubbleElement>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Recent Bid History */}
                        {bidHistoryList.length > 0 && (
                          <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md p-3.5 text-left space-y-2">
                            <span className="text-sm font-bold text-foreground/75 block">
                              История торгов:
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {bidHistoryList.map((bh: any, bIdx: number) => (
                                <BubbleElement
                                  key={`bh-${bIdx}`}
                                  isBadge
                                  size="sm"
                                  className={bh.action === 'bid' ? 'text-primary' : 'text-foreground/70'}
                                >
                                  {bh.displayName}: {bh.action === 'bid' ? `${bh.amount} очк.` : 'Пас'}
                                </BubbleElement>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Active Bidder Controls OR Waiting Indicator for Other Players */}
                        {isMyBidTurn ? (
                          <div className="rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl p-5 space-y-4">
                            {hasSelf2Participant && (
                              <BubbleElement isBadge active size="sm" className="mx-auto">
                                Сейчас вы делаете ход за: {getMpPlayerName(currentBidderUid)}
                              </BubbleElement>
                            )}

                            {onlyNominalAllowed ? (
                              <div className="space-y-4">
                                <p className="text-sm text-foreground/85 leading-relaxed">
                                  Ни у одного из участников сейчас нет очков больше или равных номиналу ({nominal} очков). По правилам вопрос разыгрывается за номинал открывшим его игроком ({getMpPlayerName(currentBidderUid)}).
                                </p>
                                <LeafButton
                                  variant="primary"
                                  size="lg"
                                  disabled={mpActionPending}
                                  onClick={() => syncJeopardyOp('auction_bid', { action: 'bid', bid: nominal }, currentBidderUid)}
                                  className="w-full justify-center text-base font-black py-3.5"
                                >
                                  Играть за номинал ({nominal} очков)
                                </LeafButton>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {maxAllowedBet >= minNextBid && (
                                  <>
                                    <div className="flex items-center justify-between text-sm px-1">
                                      <span className="text-foreground/75 font-semibold">
                                        Доступная ставка от {minNextBid} до:
                                      </span>
                                      <span className="text-primary font-black">
                                        {maxAllowedBet} очков (Ва-банк)
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-center gap-3 flex-wrap">
                                      <span className="text-sm font-semibold text-foreground/75">Ваша ставка:</span>
                                      <input
                                        type="number"
                                        min={minNextBid}
                                        max={maxAllowedBet}
                                        step={100}
                                        value={customBetInput}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setCustomBetInput(val);
                                          const num = parseInt(val, 10);
                                          if (!isNaN(num)) {
                                            setAuctionBet(Math.max(minNextBid, Math.min(num, maxAllowedBet)));
                                          }
                                        }}
                                        onBlur={() => {
                                          const num = parseInt(customBetInput, 10);
                                          const valid = isNaN(num) ? minNextBid : Math.max(minNextBid, Math.min(num, maxAllowedBet));
                                          setAuctionBet(valid);
                                          setCustomBetInput(String(valid));
                                        }}
                                        className="w-40 text-center text-xl font-black bg-transparent border border-primary/40 rounded-2xl py-2 px-3 text-primary focus:outline-none focus:border-primary backdrop-blur-md"
                                      />
                                      <span className="text-sm font-bold text-primary">очков</span>
                                    </div>

                                    <div className="flex items-center justify-center gap-2 flex-wrap">
                                      {!hasInitial && (
                                        <LeafButton
                                          variant="glass"
                                          size="sm"
                                          onClick={() => {
                                            setAuctionBet(nominal);
                                            setCustomBetInput(String(nominal));
                                          }}
                                        >
                                          Номинал ({nominal})
                                        </LeafButton>
                                      )}
                                      <LeafButton
                                        variant="glass"
                                        size="sm"
                                        onClick={() => {
                                          const next = Math.min(maxAllowedBet, Math.max(minNextBid, auctionBet + 100));
                                          setAuctionBet(next);
                                          setCustomBetInput(String(next));
                                        }}
                                      >
                                        +100
                                      </LeafButton>
                                      {maxAllowedBet >= minNextBid + 100 && (
                                        <LeafButton
                                          variant="glass"
                                          size="sm"
                                          onClick={() => {
                                            const next = Math.min(maxAllowedBet, Math.max(minNextBid, auctionBet + 200));
                                            setAuctionBet(next);
                                            setCustomBetInput(String(next));
                                          }}
                                        >
                                          +200
                                        </LeafButton>
                                      )}
                                      <LeafButton
                                        variant="glass"
                                        size="sm"
                                        onClick={() => {
                                          setAuctionBet(maxAllowedBet);
                                          setCustomBetInput(String(maxAllowedBet));
                                        }}
                                      >
                                        Ва-банк ({maxAllowedBet})
                                      </LeafButton>
                                    </div>

                                    <LeafButton
                                      variant="primary"
                                      size="lg"
                                      disabled={mpActionPending}
                                      onClick={() => {
                                        audioSystem.playSlot('jeopardy_auction_bid_raise');
                                        syncJeopardyOp(
                                          'auction_bid',
                                          { action: 'bid', bid: Math.max(minNextBid, Math.min(auctionBet, maxAllowedBet)) },
                                          currentBidderUid
                                        );
                                      }}
                                      className="w-full justify-center text-base font-black py-3.5"
                                    >
                                      Сделать ставку ({Math.max(minNextBid, Math.min(auctionBet, maxAllowedBet))} очков)
                                    </LeafButton>
                                  </>
                                )}

                                {canPassTurn && (
                                  <LeafButton
                                    variant="glass"
                                    size="md"
                                    disabled={mpActionPending}
                                    onClick={() => {
                                      audioSystem.playSlot('jeopardy_auction_pass');
                                      syncJeopardyOp('auction_bid', { action: 'pass', pass: true }, currentBidderUid);
                                    }}
                                    className="w-full justify-center text-sm font-bold"
                                  >
                                    Пас (уступить ход следующему игроку)
                                  </LeafButton>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-5 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl space-y-2">
                            <p className="text-base sm:text-lg font-black text-primary">
                              Ожидаем ставку от участника {getMpPlayerName(currentBidderUid)}...
                            </p>
                            <p className="text-sm text-foreground/70">
                              Окно аукциона синхронизировано для всех игроков. Как только {getMpPlayerName(currentBidderUid)} сделает ставку или объявит «Пас», ход перейдет дальше по очереди!
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <>
                  <Gavel size={64} className="mx-auto text-primary" />
                  <h2 className="text-2xl sm:text-3xl font-black text-primary">Аукцион!</h2>
                  
                  {(() => {
                    const currentPlayer = players[currentPlayerIndex] || players[0];
                    const nominal = selectedQuestion?.value || (round * 100);
                    const playerScore = currentPlayer?.score ?? 0;
                    const isNegativeOrZero = playerScore <= 0;
                    const maxAllowedBet = isNegativeOrZero ? nominal : Math.max(nominal, playerScore);
                    const minAllowedBet = nominal;

                    return (
                      <div className="space-y-5 max-w-md mx-auto">
                        {/* Player Score & Nominal Info */}
                        <div className="p-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl space-y-2 text-left">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-foreground/70 font-semibold">Игрок:</span>
                            <span className="text-foreground font-bold">{currentPlayer.name}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-foreground/70 font-semibold">Текущие очки:</span>
                            <span className={`font-black ${playerScore > 0 ? 'text-primary' : playerScore < 0 ? 'text-rose-400' : 'text-foreground'}`}>
                              {playerScore > 0 ? `+${playerScore}` : playerScore} очков
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm border-t border-primary/10 pt-2">
                            <span className="text-foreground/70 font-semibold">Номинал вопроса:</span>
                            <span className="text-amber-300 font-bold">{nominal} очков</span>
                          </div>
                        </div>

                        {isNegativeOrZero ? (
                          /* Negative or zero score: only nominal is permitted */
                          <div className="space-y-4">
                            <BubbleElement isBadge size="md" className="p-3 text-sm text-foreground/80 leading-relaxed text-center">
                              При отрицательном или нулевом счете ({playerScore} очков) вы можете играть только за номинал вопроса без повышения ставки.
                            </BubbleElement>
                            <LeafButton
                              variant="primary"
                              size="lg"
                              onClick={() => handleConfirmAuctionBet(nominal)}
                              className="w-full justify-center text-base font-black py-3.5"
                            >
                              Играть за номинал ({nominal} очков)
                            </LeafButton>
                          </div>
                        ) : (
                          /* Positive score: custom bet up to maxAllowedBet or raise */
                          <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm px-1">
                              <span className="text-foreground/70 font-semibold">Максимальная ставка:</span>
                              <span className="text-primary font-black">{maxAllowedBet} очков</span>
                            </div>

                            {/* Custom Bet Input */}
                            <div className="flex items-center justify-center gap-3">
                              <span className="text-sm font-semibold text-foreground/70">Ставка:</span>
                              <input
                                type="number"
                                min={minAllowedBet}
                                max={maxAllowedBet}
                                step={100}
                                value={customBetInput}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomBetInput(val);
                                  const num = parseInt(val, 10);
                                  if (!isNaN(num)) {
                                    const clamped = Math.max(minAllowedBet, Math.min(num, maxAllowedBet));
                                    setAuctionBet(clamped);
                                  }
                                }}
                                onBlur={() => {
                                  const num = parseInt(customBetInput, 10);
                                  const valid = isNaN(num) ? minAllowedBet : Math.max(minAllowedBet, Math.min(num, maxAllowedBet));
                                  setAuctionBet(valid);
                                  setCustomBetInput(String(valid));
                                }}
                                className="w-36 text-center text-xl font-black bg-transparent border border-primary/40 rounded-2xl py-2 px-3 text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary backdrop-blur-md"
                              />
                              <span className="text-sm font-bold text-primary">очков</span>
                            </div>

                            {/* Quick Bet Buttons */}
                            <div className="flex items-center justify-center gap-2 flex-wrap">
                              <LeafButton
                                variant="glass"
                                size="sm"
                                onClick={() => {
                                  const newBet = Math.min(maxAllowedBet, auctionBet + 100);
                                  setAuctionBet(newBet);
                                  setCustomBetInput(String(newBet));
                                }}
                                disabled={auctionBet >= maxAllowedBet}
                                className="text-sm font-bold"
                              >
                                +100
                              </LeafButton>
                              {maxAllowedBet > nominal && (
                                <LeafButton
                                  variant="glass"
                                  size="sm"
                                  onClick={() => {
                                    setAuctionBet(maxAllowedBet);
                                    setCustomBetInput(String(maxAllowedBet));
                                  }}
                                  className="text-sm font-bold"
                                >
                                  Ва-банк ({maxAllowedBet})
                                </LeafButton>
                              )}
                              <LeafButton
                                variant="glass"
                                size="sm"
                                onClick={() => {
                                  setAuctionBet(nominal);
                                  setCustomBetInput(String(nominal));
                                }}
                                className="text-sm font-bold"
                              >
                                Номинал ({nominal})
                              </LeafButton>
                            </div>

                            {/* Play with Bid Button */}
                            <LeafButton
                              variant="primary"
                              size="lg"
                              onClick={() => handleConfirmAuctionBet(auctionBet)}
                              className="w-full justify-center text-base font-black py-3.5"
                            >
                              Играть со ставкой ({auctionBet} очков)
                            </LeafButton>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Final Round Elimination (Requirement 9: all 15 categories, highest-score player starts, players with <= 0 excluded) */}
      {gameState === 'final_elimination' && (
        <div className="space-y-6 text-center py-8 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-2xl">
          <h2 className="text-3xl md:text-4xl font-black text-primary">Суперфинал: Уберите лишние категории</h2>
          <p className="text-base sm:text-xl text-foreground/90 font-bold">
            Сейчас исключает категорию:{' '}
            <span className="text-primary">
              {isMultiplayer
                ? getMpPlayerName(mpJeopardyState?.eliminatingUserId)
                : players[currentPlayerIndex]?.name}
            </span>
          </p>
          {isMultiplayer && Array.isArray(mpJeopardyState?.eligibleFinalUserIds) && !mpJeopardyState.eligibleFinalUserIds.includes(activeUidStr) && !canActAsMpUser(mpJeopardyState?.eliminatingUserId) && (
            <BubbleElement isBadge size="md" className="p-3 text-sm text-rose-400 border-rose-500/30 mx-auto max-w-xl">
              Участники с балансом 0 или меньше очков не участвуют в Суперфинале и наблюдают за развязкой.
            </BubbleElement>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {finalCategories.map((cat, idx) => {
              const canElim = !isMultiplayer || canActAsMpUser(mpJeopardyState?.eliminatingUserId);
              return (
                <button
                  key={`${cat}-${idx}`}
                  disabled={!canElim || mpActionPending}
                  onClick={() => eliminateCategory(cat)}
                  className={`rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl p-4 sm:p-5 text-base sm:text-lg font-bold transition-all flex items-center justify-between group text-left ${
                    canElim
                      ? 'hover:bg-destructive/20 hover:text-destructive cursor-pointer'
                      : 'opacity-70 cursor-not-allowed'
                  }`}
                >
                  <span className="line-clamp-2">{cat}</span>
                  <Trash2 className="shrink-0 ml-2 opacity-40 group-hover:opacity-100 transition-opacity" size={18} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Final Round Betting (Requirement 10: simultaneous 60s betting for all eligible players) */}
      {gameState === 'final_bet' && (() => {
        const targetBetUid = isMultiplayer
          ? (mpJeopardyState?.finalBets?.[activeUidStr] === undefined
              ? activeUidStr
              : hasSelf2Participant && mpJeopardyState?.finalBets?.[mySelf2Uid] === undefined
              ? mySelf2Uid
              : activeUidStr)
          : '1';
        const myPart = isMultiplayer
          ? displayMpParticipants.find(p => String(p.user_id) === targetBetUid)
          : null;
        const currentBankScore = isMultiplayer
          ? Math.max(0, Number(myPart?.score) || 0)
          : Math.max(0, players[0]?.score || 0);
        const isEligibleForFinal = !isMultiplayer ||
          !Array.isArray(mpJeopardyState?.eligibleFinalUserIds) ||
          mpJeopardyState.eligibleFinalUserIds.includes(targetBetUid);
        const hasAlreadyPlacedBet = isMultiplayer && mpJeopardyState?.finalBets?.[targetBetUid] !== undefined;

        return (
          <div className="max-w-lg mx-auto space-y-6 text-center py-8 px-6 sm:px-8 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-2xl">
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <BubbleElement className="px-3.5 py-1 text-sm font-black text-primary">
                  Супер-игра: Финал
                </BubbleElement>
                {isMultiplayer && (
                  <BubbleElement size="sm" isBadge className="px-3 py-1 text-sm font-black text-amber-300 flex items-center gap-1.5">
                    <Timer size={15} />
                    Осталось на ставку: {timeLeft}с
                  </BubbleElement>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-foreground">
                Ставка на супер-игру
              </h2>
              <BubbleElement className="px-4 py-1.5 text-sm sm:text-base font-bold text-primary">
                Тема: {finalCategories[0] || options.topic || 'Супер-игра'}
              </BubbleElement>
            </div>

            {!isEligibleForFinal ? (
              <div className="p-5 rounded-2xl border border-rose-500/30 bg-transparent backdrop-blur-xl space-y-2">
                <p className="text-base font-bold text-rose-400">
                  У вас 0 или меньше очков — участие в Суперфинале недоступно.
                </p>
                <p className="text-sm text-foreground/70">
                  Ожидаем окончания ставок участников Суперфинала ({timeLeft}с)...
                </p>
              </div>
            ) : hasAlreadyPlacedBet ? (
              <div className="p-5 rounded-2xl border border-emerald-500/30 bg-transparent backdrop-blur-xl space-y-2">
                <p className="text-base font-bold text-emerald-400">
                  Ваша ставка ({mpJeopardyState?.finalBets?.[targetBetUid]} очков) принята!
                </p>
                <p className="text-sm text-foreground/70">
                  Ожидаем ставки остальных участников или окончания таймера ({timeLeft}с)...
                </p>
              </div>
            ) : (
              <>
                <div className="p-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground/70">
                      Банк ({isMultiplayer ? getMpPlayerName(targetBetUid) : 'Вы'}):
                    </span>
                    <span className="font-bold text-primary text-base">
                      {currentBankScore} очков
                    </span>
                  </div>
                  <p className="text-sm text-foreground/70 text-left leading-relaxed">
                    Все участники делают ставку одновременно за 60 секунд. Если не успеть сделать ставку, она будет равна 0.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold text-foreground/80">Сумма ставки:</span>
                      <span className="font-mono text-xl font-black text-primary">
                        {userFinalBet} очков
                      </span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={currentBankScore}
                      value={userFinalBet}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setUserFinalBet(Math.max(0, Math.min(val, currentBankScore)));
                      }}
                      className="w-full bg-transparent backdrop-blur-md rounded-xl border border-primary/30 p-3 text-center text-2xl font-bold text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  {currentBankScore > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                      <LeafButton
                        variant={userFinalBet === 0 ? 'primary' : 'glass'}
                        size="sm"
                        onClick={() => setUserFinalBet(0)}
                        className="w-full justify-center text-sm font-bold"
                      >
                        0 очков
                      </LeafButton>
                      <LeafButton
                        variant="glass"
                        size="sm"
                        onClick={() => setUserFinalBet(Math.max(0, Math.round(currentBankScore * 0.25)))}
                        className="w-full justify-center text-sm font-bold"
                      >
                        25%
                      </LeafButton>
                      <LeafButton
                        variant="glass"
                        size="sm"
                        onClick={() => setUserFinalBet(Math.max(0, Math.round(currentBankScore * 0.5)))}
                        className="w-full justify-center text-sm font-bold"
                      >
                        50%
                      </LeafButton>
                      <LeafButton
                        variant="glass"
                        size="sm"
                        onClick={() => setUserFinalBet(Math.max(0, Math.round(currentBankScore * 0.75)))}
                        className="w-full justify-center text-sm font-bold"
                      >
                        75%
                      </LeafButton>
                      <LeafButton
                        variant={userFinalBet === currentBankScore ? 'primary' : 'glass'}
                        size="sm"
                        onClick={() => setUserFinalBet(currentBankScore)}
                        className="w-full justify-center text-sm font-black col-span-2 sm:col-span-1"
                      >
                        Ва-банк
                      </LeafButton>
                    </div>
                  )}
                </div>

                <LeafButton
                  variant="primary"
                  size="lg"
                  onClick={handleConfirmFinalBet}
                  disabled={finalQuestionLoading || mpActionPending}
                  icon={finalQuestionLoading ? <Loader2 size={20} className="animate-spin" /> : <Flame size={20} />}
                  className="w-full justify-center py-4 text-base sm:text-lg font-black shadow-lg shadow-primary/25"
                >
                  {finalQuestionLoading ? 'Подготовка вопроса...' : 'Подтвердить ставку'}
                </LeafButton>
              </>
            )}
          </div>
        );
      })()}

      {/* Superfinal Sequential 5-Second Per-Player Reveal (Requirement 11) */}
      {isMultiplayer && gameState === 'final_reveal' && (() => {
        const revealOrder: any[] = Array.isArray(mpJeopardyState?.finalRevealOrder) ? mpJeopardyState.finalRevealOrder : [];
        const liveIdx = Math.min(
          Math.max(0, Number(mpJeopardyState?.liveFinalRevealIndex ?? 0)),
          Math.max(0, revealOrder.length - 1)
        );
        const currentReveal = revealOrder[liveIdx] || null;
        const stepElapsedMs = Number(mpJeopardyState?.liveFinalRevealStepElapsedMs ?? 0);
        const secRemainingInStep = Math.max(1, Math.ceil((5000 - stepElapsedMs) / 1000));

        return (
          <div className="max-w-2xl mx-auto rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-10 shadow-2xl space-y-6 text-center">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 pb-4">
              <BubbleElement size="sm" isBadge active className="px-3.5 py-1 text-sm font-black">
                Суперфинал • Вскрытие ответов ({Math.min(liveIdx + 1, revealOrder.length)} из {revealOrder.length})
              </BubbleElement>
              <BubbleElement size="sm" isBadge className="px-3 py-1 text-sm font-bold text-amber-300 flex items-center gap-1.5">
                <Timer size={15} />
                Следующий через {secRemainingInStep}с
              </BubbleElement>
            </div>

            {selectedQuestion && (
              <div className="p-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl space-y-1.5">
                <p className="text-sm text-foreground/70 font-semibold">
                  Вопрос Суперфинала ({selectedQuestion.category}):
                </p>
                <p className="text-base sm:text-lg font-bold text-foreground">
                  {selectedQuestion.question}
                </p>
                <p className="text-sm font-black text-primary pt-1">
                  Правильный ответ: {selectedQuestion.answer}
                </p>
              </div>
            )}

            {currentReveal && (
              <motion.div
                key={`final-reveal-card-${currentReveal.userId}-${liveIdx}`}
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="rounded-3xl border border-primary/40 bg-transparent backdrop-blur-2xl p-6 space-y-4 shadow-xl"
              >
                <div className="flex items-center justify-center gap-3">
                  <UserAvatar avatarUrl={currentReveal.avatarUrl} displayName={currentReveal.displayName} size="md" />
                  <div className="text-left">
                    <div className="text-lg sm:text-xl font-black text-foreground">{currentReveal.displayName}</div>
                    <div className="text-sm text-foreground/70">Ставка в Суперфинале: <span className="text-amber-300 font-black">{currentReveal.bet} очков</span></div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md space-y-2">
                  <div className="text-sm text-foreground/70 font-semibold">Ответ участника:</div>
                  <div className="text-xl font-black text-foreground">
                    «{currentReveal.answer || 'Нет ответа'}»
                  </div>
                  <div className="flex justify-center pt-1">
                    <BubbleElement
                      size="sm"
                      isBadge
                      className={`px-4 py-1 text-sm font-black ${
                        currentReveal.isCorrect ? 'text-emerald-400 border-emerald-500/40' : 'text-rose-400 border-rose-500/40'
                      }`}
                    >
                      {currentReveal.isCorrect ? 'Верный ответ!' : 'Неверный ответ'}
                    </BubbleElement>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2">
                  <div className="rounded-2xl border border-primary/20 bg-transparent p-3">
                    <div className="text-sm text-foreground/65">Было</div>
                    <div className="text-lg sm:text-xl font-black text-foreground">{currentReveal.scoreBefore}</div>
                  </div>
                  <div className="rounded-2xl border border-primary/20 bg-transparent p-3">
                    <div className="text-sm text-foreground/65">{currentReveal.delta >= 0 ? 'Прибавка' : 'Вычитание'}</div>
                    <div className={`text-lg sm:text-xl font-black ${currentReveal.delta > 0 ? 'text-emerald-400' : currentReveal.delta < 0 ? 'text-rose-400' : 'text-foreground/70'}`}>
                      {currentReveal.delta > 0 ? `+${currentReveal.delta}` : currentReveal.delta}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-primary/40 bg-transparent p-3">
                    <div className="text-sm text-primary font-bold">Итого</div>
                    <div className="text-lg sm:text-xl font-black text-primary">{currentReveal.scoreAfter}</div>
                  </div>
                </div>
              </motion.div>
            )}

            {revealOrder.length > 1 && (
              <div className="space-y-2 text-left pt-2">
                <div className="text-sm font-bold text-foreground/75 px-1">Уже открытые результаты:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {revealOrder.slice(0, liveIdx + 1).map((r, idx) => (
                    <div
                      key={`revealed-row-${r.userId}-${idx}`}
                      className="rounded-2xl border border-primary/20 bg-transparent px-3.5 py-2.5 flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-bold text-foreground truncate">{r.displayName}</span>
                      <span className="font-black text-primary shrink-0">
                        {r.scoreBefore} {r.delta >= 0 ? `+ ${r.delta}` : `- ${Math.abs(r.delta)}`} = {r.scoreAfter}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Question, Answer Checking, and Correct Answer Feedback Container (Inline in place of the board on Desktop in Multiplayer, Modal on Mobile & Single-Player) */}
      <CheckingAnswerModal
        key="modal-checking-jeopardy"
        inlineOnDesktop={isMultiplayer}
        isOpen={Boolean(checking || (isMultiplayer && mpJeopardyState?.answerCheckingInProgress))}
        timerSeconds={checkTimer}
        showTimeoutActions={isCheckTimedOut && checking}
        subtitle={
          isMultiplayer && mpJeopardyState?.answeringUserId
            ? `Отвечает: ${getMpPlayerName(mpJeopardyState.answeringUserId)}${checkTimer > 0 ? ` (${checkTimer}с)` : ''}`
            : undefined
        }
        onRetry={() => { checkingRef.current = false; setChecking(false); submitAnswer(); }}
        onSkip={() => {
          checkingRef.current = false;
          setChecking(false);
          setFeedback({ isCorrect: false, explanation: 'Проверка пропущена.', points: 0 });
          setGameState('feedback');
        }}
      />

      <AnimatePresence>
        {!checking && !(isMultiplayer && mpJeopardyState?.answerCheckingInProgress) && gameState === 'feedback' && feedback && (
          <motion.div 
            key="modal-feedback-jeopardy"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className={
              isMultiplayer
                ? 'max-md:fixed max-md:inset-0 max-md:top-0 max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:w-screen max-md:h-screen max-md:min-h-[100dvh] max-md:z-[300] max-md:flex max-md:items-center max-md:justify-center max-md:bg-transparent max-md:backdrop-blur-2xl max-md:p-4 max-md:m-0 max-md:overflow-y-auto md:relative md:w-full'
                : 'fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-[100dvh] z-[300] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 m-0 overflow-y-auto'
            }
          >
            <motion.div 
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              className={`w-full ${
                isMultiplayer ? 'max-md:max-w-lg md:max-w-none' : 'max-w-lg'
              } rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-2xl`}
            >
              <div className="flex flex-col items-center text-center">
                {feedback.isCorrect ? (
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                    <CheckCircle2 size={40} />
                  </div>
                ) : (
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <XCircle size={40} />
                  </div>
                )}
                
                <BubbleElement 
                  isBadge={true} 
                  className={`px-5 py-2 text-base font-black ${
                    feedback.isCorrect 
                      ? 'text-green-400 border-green-500/30' 
                      : feedback.points === 0 
                      ? 'text-amber-300 border-amber-500/30' 
                      : 'text-rose-400 border-rose-500/30'
                  }`}
                >
                  {feedback.isCorrect ? 'Правильно!' : feedback.points === 0 ? 'Время вышло' : 'Неверно'}
                </BubbleElement>

                {feedback.answeringUserName && (
                  <p className="mt-2 text-sm font-bold text-primary">
                    Отвечал: {feedback.answeringUserName}
                    {feedback.userAnswer ? ` — «${feedback.userAnswer}»` : ''}
                  </p>
                )}
                
                <div className="mt-4 max-h-48 overflow-y-auto p-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md text-sm leading-relaxed text-foreground/90 font-medium w-full">
                  {feedback.explanation}
                </div>

                {feedback.points !== undefined && feedback.points !== 0 && (
                  <p className={`mt-3 text-xl font-bold ${feedback.points > 0 ? 'text-green-400' : 'text-rose-400'}`}>
                    {feedback.points > 0 ? '+' : ''}{feedback.points} очков
                  </p>
                )}

                <div className="mt-8 w-full max-w-md mx-auto">
                  <LeafButton
                    variant="primary"
                    size="md"
                    onClick={handleContinue}
                    className="w-full justify-center"
                  >
                    Продолжить
                  </LeafButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {!checking && !(isMultiplayer && mpJeopardyState?.answerCheckingInProgress) && !(gameState === 'feedback' && feedback) && selectedQuestion && gameState !== 'special' && gameState !== 'final_bet' && gameState !== 'final_reveal' && gameState !== 'final_countdown' && (
          <motion.div 
            key={`modal-question-jeopardy-${selectedQuestion.id || selectedQuestion.category}-${selectedQuestion.value}`} 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className={
              isMultiplayer
                ? 'max-md:fixed max-md:inset-0 max-md:top-0 max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:w-screen max-md:h-screen max-md:min-h-[100dvh] max-md:z-[250] max-md:flex max-md:items-center max-md:justify-center max-md:bg-transparent max-md:backdrop-blur-2xl max-md:p-4 max-md:m-0 max-md:overflow-y-auto md:relative md:w-full'
                : 'fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-[100dvh] z-[250] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 m-0 overflow-y-auto'
            }
          >
            <div
              className={`w-full ${
                isMultiplayer ? 'max-md:max-w-2xl md:max-w-none' : 'max-w-2xl'
              } space-y-6 sm:space-y-8 text-center rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-10 shadow-2xl`}
            >
              <div className="flex justify-between items-center px-2 sm:px-4 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <BubbleElement size="sm" isBadge className="flex items-center gap-2 px-3.5 py-1.5 font-bold">
                    <Timer size={18} className={isVoiceActive ? 'animate-pulse text-amber-300' : timeLeft < 10 ? 'animate-pulse text-destructive' : 'text-primary'} />
                    <span className={`text-xl font-black ${isVoiceActive ? 'text-amber-300' : timeLeft < 10 ? 'text-destructive' : 'text-primary'}`}>
                      {timeLeft}с
                    </span>
                    {isMultiplayer && mpJeopardyState?.phase === 'question_buzz' && (
                      <span className="text-sm font-bold text-foreground/75 ml-1">на нажатие кнопки</span>
                    )}
                    {isMultiplayer && mpJeopardyState?.phase === 'question_answer' && (
                      <span className="text-sm font-bold text-amber-300 ml-1">на ответ (15с)</span>
                    )}
                    {(gameState === 'final_question' || selectedQuestion.id === 'final') && (
                      <span className="text-sm font-black text-amber-400 ml-1">Супер-игра (60с)</span>
                    )}
                    {isVoiceActive && (
                      <span className="text-sm px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-bold ml-1">
                        голос
                      </span>
                    )}
                  </BubbleElement>

                  {isMultiplayer && mpJeopardyState?.phase === 'question_answer' && selectedQuestion.type === 'normal' && (
                    <BubbleElement size="sm" isBadge className="px-3 py-1 text-sm font-semibold text-foreground/70">
                      Общий таймер на паузе: {mpJeopardyState?.questionTimeRemainingSec ?? 60}с
                    </BubbleElement>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <LeafButton 
                    variant="glass"
                    size="sm"
                    onClick={handleTakeHint}
                    disabled={showHint}
                    icon={<Lightbulb size={16} />}
                  >
                    {showHint ? 'Подсказка открыта' : 'Подсказка (1 ИИкра)'}
                  </LeafButton>

                  {!checking && !feedback && (!isMultiplayer || canActAsMpUser(mpJeopardyState?.answeringUserId) || mpJeopardyState?.phase === 'question_buzz') && (
                    <>
                      <LeafButton 
                        variant="glass"
                        size="sm"
                        onClick={handleSpeedUp}
                        icon={<FastForward size={16} />}
                        title="Пропустить таймер, если никто не хочет отвечать"
                      >
                        Ускорить
                      </LeafButton>

                      {(!isMultiplayer || mpJeopardyState?.phase === 'question_answer' || mpJeopardyState?.phase === 'final_question') && (
                        <LeafButton 
                          variant="glass"
                          size="sm"
                          onClick={handleDontKnow}
                          icon={<XCircle size={16} />}
                          title="Сдать вопрос как неверный"
                        >
                          Не знаю
                        </LeafButton>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-center flex-wrap gap-2">
                  <BubbleElement isBadge className="px-5 py-2 text-sm sm:text-base font-bold text-primary flex items-center gap-2">
                    <span>{selectedQuestion.category}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                    <span className="text-amber-300 font-black">
                      {selectedQuestion.type === 'auction' ? auctionBet : selectedQuestion.value} очков
                    </span>
                  </BubbleElement>
                  {isMultiplayer && mpJeopardyState?.phase === 'question_answer' && mpJeopardyState?.answeringUserId && (
                    <BubbleElement isBadge active className="px-4 py-2 text-sm sm:text-base font-black">
                      Отвечает: {getMpPlayerName(mpJeopardyState.answeringUserId)}
                    </BubbleElement>
                  )}
                </div>
                <h2 className="text-xl md:text-3xl font-bold leading-tight text-foreground">
                  {selectedQuestion.question}
                </h2>
              </div>

              {showHint && selectedQuestion.hint && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-transparent backdrop-blur-md p-4 rounded-2xl border border-primary/20">
                  <p className="text-sm italic text-primary/90 font-medium">Подсказка: {selectedQuestion.hint}</p>
                </motion.div>
              )}

              {!showResult ? (
                isMultiplayer && (mpJeopardyState?.phase === 'question_buzz' || (gameState !== 'final_question' && mpJeopardyState?.phase !== 'question_answer')) ? (
                  /* Requirement 4: 60s Buzz Phase — Any player who hasn't failed can press "Знаю ответ", without showing who answers before buzzing */
                  (() => {
                    const wrongList: string[] = Array.isArray(mpJeopardyState?.wrongUserIds)
                      ? mpJeopardyState.wrongUserIds.map(String)
                      : [];
                    const canMainBuzz = !wrongList.includes(activeUidStr);
                    const canSelf2Buzz = hasSelf2Participant && !wrongList.includes(mySelf2Uid);
                    const canBuzzNow = canMainBuzz || canSelf2Buzz;

                    return (
                      <div className="space-y-4 pt-2">
                        {wrongList.length > 0 && (
                          <div className="text-sm text-rose-400 font-semibold">
                            Уже ошиблись на этом вопросе (баллы сняты, таймер продолжен с {mpJeopardyState?.questionTimeRemainingSec}с):{' '}
                            {wrongList.map(uid => getMpPlayerName(uid)).join(', ')}
                          </div>
                        )}
                        {canBuzzNow ? (
                          <div className="flex items-center justify-center">
                            <LeafButton
                              variant="primary"
                              size="lg"
                              disabled={mpActionPending}
                              onClick={() => handleBuzz(canMainBuzz ? activeUidStr : mySelf2Uid)}
                              icon={<Zap size={22} />}
                              className="w-full sm:w-auto px-12 py-5 text-xl sm:text-2xl font-black justify-center shadow-2xl"
                            >
                              Знаю ответ!
                            </LeafButton>
                          </div>
                        ) : (
                          <BubbleElement isBadge size="md" className="p-4 text-sm sm:text-base font-bold text-rose-400 border-rose-500/30">
                            Вы уже отвечали на этот вопрос. Ожидаем остальных участников ({timeLeft}с)...
                          </BubbleElement>
                        )}
                      </div>
                    );
                  })()
                ) : isMultiplayer && mpJeopardyState?.phase === 'question_answer' && !canActAsMpUser(mpJeopardyState?.answeringUserId) ? (
                  /* Another player pressed "Знаю ответ" and has 15s to answer */
                  <div className="p-6 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl space-y-2">
                    <p className="text-lg sm:text-xl font-black text-primary">
                      Отвечает участник {getMpPlayerName(mpJeopardyState?.answeringUserId)} ({timeLeft}с)...
                    </p>
                    <p className="text-sm text-foreground/70">
                      Общий таймер (60с) поставлен на паузу на отметке {mpJeopardyState?.questionTimeRemainingSec ?? 60}с. Если игрок ошибется или не успеет за 15 секунд, вы сможете нажать «Знаю ответ!».
                    </p>
                  </div>
                ) : isMultiplayer && gameState === 'final_question' && (() => {
                  const eligIds: string[] = Array.isArray(mpJeopardyState?.eligibleFinalUserIds)
                    ? mpJeopardyState.eligibleFinalUserIds.map(String)
                    : [];
                  const mainEligible = eligIds.length === 0 || eligIds.includes(activeUidStr);
                  const self2Eligible = hasSelf2Participant && (eligIds.length === 0 || eligIds.includes(mySelf2Uid));
                  const mainSubmitted = Boolean(mpJeopardyState?.finalAnswers?.[activeUidStr]);
                  const self2Submitted = Boolean(mpJeopardyState?.finalAnswers?.[mySelf2Uid]);
                  const noControllableLeft = (!mainEligible || mainSubmitted) && (!self2Eligible || self2Submitted);
                  return noControllableLeft;
                })() ? (
                  <div className="p-6 rounded-2xl border border-emerald-500/30 bg-transparent backdrop-blur-xl space-y-2">
                    <p className="text-lg font-black text-emerald-400">
                      Ваш финальный ответ принят!
                    </p>
                    <p className="text-sm text-foreground/70">
                      Ожидаем ответов остальных участников или окончания таймера ({timeLeft}с), после чего начнется поочередный показ результатов по 5 секунд!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="relative flex items-center justify-center">
                      <input
                        autoFocus
                        type="text"
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder={answeringPlayerIndex !== null && players[answeringPlayerIndex]?.isBot ? "ИИ думает..." : "Ваш ответ..."}
                        disabled={checking || gameState === 'feedback' || (!isMultiplayer && answeringPlayerIndex !== null && players[answeringPlayerIndex]?.isBot)}
                        className="w-full border-b-2 border-primary bg-transparent py-4 pr-14 text-center text-xl md:text-4xl font-bold focus:outline-none disabled:opacity-50 text-foreground"
                        onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <VoiceInputBubble
                          onTranscript={(text) => setUserAnswer(text)}
                          onActiveChange={setIsVoiceActive}
                          disabled={checking || gameState === 'feedback' || (!isMultiplayer && answeringPlayerIndex !== null && players[answeringPlayerIndex]?.isBot)}
                          currentValue={userAnswer}
                          size="md"
                          tooltip="🎤 Начать запись"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      <LeafButton 
                        variant="primary"
                        size="lg"
                        onClick={() => submitAnswer()} 
                        disabled={checking || !userAnswer || (!isMultiplayer && answeringPlayerIndex !== null && players[answeringPlayerIndex]?.isBot)}
                        className="px-10 py-3.5 text-lg sm:text-xl justify-center font-bold"
                      >
                        Ответить
                      </LeafButton>

                      <LeafButton 
                        variant="dark"
                        size="md"
                        onClick={handleDontKnow}
                        disabled={checking}
                        icon={<XCircle size={18} />}
                        className="px-6 py-3 text-base justify-center font-bold"
                      >
                        Не знаю
                      </LeafButton>

                      <LeafButton 
                        variant="glass"
                        size="md"
                        onClick={handleSpeedUp}
                        disabled={checking}
                        icon={<FastForward size={18} />}
                        className="px-6 py-3 text-base justify-center font-bold"
                      >
                        Ускорить
                      </LeafButton>
                    </div>
                  </div>
                )
              ) : (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`p-8 rounded-3xl backdrop-blur-md border ${showResult === 'correct' ? 'border-green-500/30 bg-transparent text-green-400' : 'border-rose-500/30 bg-transparent text-rose-400'}`}>
                  <p className="text-2xl font-black">{showResult === 'correct' ? 'Правильно!' : 'Неверно!'}</p>
                  <p className="mt-2 text-base text-foreground/80 font-medium">Правильный ответ: {selectedQuestion.answer}</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {options?.playMode === 'multi' && gameState !== 'mp_lobby' && (
        <MultiplayerGameWebcamStrip
          roomId={mpRoomId}
          gameId="jeopardy"
          gameTitle={`Своя Икра: ${gameTopic || options?.topic || 'Общие знания'}`}
          isLobby={false}
          maxPlayers={Math.min(8, Math.max(2, Number(mpRoomData?.max_players || mpJeopardyState?.maxPlayers || mpMaxPlayers) || 8))}
          hideProgressBlock={true}
          choosingUserId={mpJeopardyState?.choosingUserId || null}
          answeringUserId={
            mpJeopardyState?.phase === 'question_answer'
              ? (mpJeopardyState?.answeringUserId || null)
              : mpJeopardyState?.phase === 'special_auction' || mpJeopardyState?.phase === 'auction'
              ? (mpJeopardyState?.auctionState?.currentBidderId || null)
              : null
          }
          currentUser={{
            uid: String(profile?.uid || user?.id || '10016926299'),
            display_name: profile?.display_name || 'Игрок 1',
            avatar_url: profile?.avatar_url
          }}
          localRound={round}
          totalRounds={4}
          localScore={players[0]?.score || 0}
          localCorrectCount={totalAnsweredCount}
          localIsFinished={gameState === 'game_over' || gameState === 'finished'}
          onOpenInvite={() => setIsMpInviteOpen(true)}
          onOpenZoomModal={() => setIsMpZoomOpen(true)}
          onRoomStateSync={(data) => {
            if (data.room) {
              setMpRoomData(data.room);
            }
            if (Array.isArray(data.participants)) {
              setMpParticipants(data.participants);
            }
            if (Array.isArray(data.chatMessages)) {
              setChatMessages(data.chatMessages);
            }
            const jState = (data as any).jeopardy_state || data.room?.jeopardy_state;
            if (jState) {
              applyServerJeopardyState(jState, data.room, data.participants);
            } else if (data.room?.status === 'active' && String(gameState) === 'mp_lobby' && !showCountdown) {
              triggerMpCountdownAndRevealCategories();
            }
          }}
        />
      )}

      {gameState === 'game_over' && (() => {
        const participantCount = isMultiplayer ? Math.max(1, displayMpParticipants.length || players.length) : 1;
        const playersWithMultipliedScores = players.map(p => {
          const mpPart = isMultiplayer ? displayMpParticipants.find(mp => String(mp.user_id) === String(p.id)) : null;
          const rawScore = Number(mpPart?.score ?? p.score) || 0;
          // Requirement 12: Every participant with positive score gets multiplied by number of participants
          const finalScore = isMultiplayer
            ? (mpPart?.awarded_score !== undefined && mpPart?.awarded_score !== null
                ? Number(mpPart.awarded_score)
                : rawScore > 0
                ? rawScore * participantCount
                : rawScore)
            : rawScore;
          return {
            ...p,
            rawScore,
            score: finalScore
          };
        });
        const sortedPlayers = [...playersWithMultipliedScores].sort((a, b) => b.score - a.score);
        const myPlayerId = isMultiplayer ? activeUidStr : '1';
        const userWon = String(sortedPlayers[0]?.id) === String(myPlayerId);
        const myFinalPlayer = sortedPlayers.find(p => String(p.id) === String(myPlayerId)) || sortedPlayers[0];

        return (
          <div className="mx-auto max-w-lg rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 sm:p-10 shadow-2xl text-center space-y-6">
            <div className="flex justify-center">
              {userWon ? (
                <BubbleElement className="flex items-center gap-2 px-5 py-2 text-base font-bold text-emerald-400">
                  <Trophy size={20} />
                  Победа в игре!
                </BubbleElement>
              ) : (
                <BubbleElement className="flex items-center gap-2 px-5 py-2 text-base font-bold text-rose-400">
                  <XCircle size={20} />
                  {sortedPlayers[0]?.name || 'Соперник'} занял первое место
                </BubbleElement>
              )}
            </div>

            <div>
              <h2 className="text-3xl font-black text-primary">
                {userWon ? 'Поздравляем с победой!' : 'Игра завершена!'}
              </h2>
              <p className="mt-2 text-sm text-foreground/70">
                {isMultiplayer
                  ? `Очки каждого участника с положительным балансом умножены на количество игроков (×${participantCount})!`
                  : userWon
                  ? 'Вы продемонстрировали превосходную эрудицию и реакцию!'
                  : 'Отличная игра, в следующий раз победа будет за вами!'}
              </p>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 space-y-3 text-left">
              <div className="space-y-1">
                <span className="text-sm font-bold text-primary/80">Итоговое распределение очков:</span>
                <p className="text-sm text-foreground/90 font-medium leading-relaxed">
                  {isMultiplayer
                    ? `Все положительные баллы участников умножены на ${participantCount} (количество участников в игре).`
                    : 'Набрать наибольшее количество очков среди всех участников за все раунды игры.'}
                </p>
              </div>

              <div className="pt-3 border-t border-primary/10 space-y-2">
                {sortedPlayers.map((p, idx) => (
                  <div 
                    key={`${p.id}-${idx}`} 
                    className={`flex justify-between items-center px-4 py-2.5 rounded-2xl border ${
                      idx === 0 
                        ? 'bg-primary/15 border-primary/40 font-black text-primary' 
                        : 'bg-transparent backdrop-blur-md border-primary/10 text-foreground/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-foreground/60">#{idx + 1}</span>
                      <span className="text-sm font-bold truncate">{p.name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-lg font-black">{p.score}</span>
                      {isMultiplayer && p.rawScore > 0 && participantCount > 1 && (
                        <span className="text-sm text-foreground/65 ml-1.5 font-semibold">
                          ({p.rawScore} × {participantCount})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <ScoreCalculationCard 
              score={isMultiplayer ? (myFinalPlayer?.score || 0) : (authoritativeScore || scoreCalculation?.authoritativeScore || (players.find(p => p.id === '1')?.score || 0))}
              calculation={scoreCalculation}
              gameTitle="Своя Икра"
              isWin={userWon}
            />

            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <LeafButton 
                variant="primary"
                size="md"
                onClick={async () => {
                  if (options.packId) {
                    if (user) await deleteGameProgress(profile?.uid ?? "", options.packId, 'jeopardy');
                    await fetch(`/api/game-packs/${options.packId}/play`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ user_id: profile?.uid, is_replay: true })
                    }).catch(() => {});
                  }
                  window.location.reload();
                }} 
                className="flex-1 justify-center"
              >
                Сыграть еще
              </LeafButton>
              <LeafButton 
                variant="glass"
                size="md"
                onClick={async () => {
                  if (user && options.packId) await deleteGameProgress(profile?.uid ?? "", options.packId, 'jeopardy');
                  navigate('/');
                }} 
                className="flex-1 justify-center"
              >
                В меню
              </LeafButton>
            </div>
          </div>
        );
      })()}
      </div>

      <div className="lg:col-span-1 space-y-4">
        {/* Game Info & Controls Block (moved from above the board to the right column above chat in all modes) */}
        <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-xl p-4 sm:p-5 space-y-3.5 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Star className="text-primary h-6 w-6 shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-primary truncate">Своя Икра</h1>
                <p className="text-sm text-foreground/75 truncate">
                  Тур {round} из 3 • {ROUND_CONFIGS[round - 1]?.description || 'Финал'}
                </p>
              </div>
            </div>
            <BubbleElement size="sm" isBadge className="px-2.5 py-1 text-sm font-bold text-primary shrink-0">
              {totalAnsweredCount} / 76
            </BubbleElement>
          </div>

          <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md px-3 py-2 flex items-center gap-2 text-sm">
            <HelpCircle className="text-primary shrink-0" size={16} />
            <span className="text-foreground/70 font-semibold shrink-0">Тема:</span>
            <span className="text-primary font-black truncate">{gameTopic}</span>
          </div>
        </div>

        {(options.playMode === 'ai' || options.playMode === 'multi') && (
          <div className="space-y-4 sticky top-24">
            <div className="h-[520px]">
              <GameChat 
                title="Групповой чат игры"
                messages={chatMessages} 
                onSendMessage={handleSendMessage} 
                currentUser={{
                  id: options.playMode === 'multi' ? String(profile?.uid || user?.id || '10016926299') : '1',
                  name: profile?.display_name || 'Игрок 1',
                  avatar: profile?.avatar_url
                }} 
              />
            </div>
          </div>
        )}
      </div>

      {options.playMode === 'multi' && (
        <>
          <VideoInviteModal
            isOpen={isMpInviteOpen}
            onClose={() => setIsMpInviteOpen(false)}
            currentUser={{
              uid: String(profile?.uid || user?.id || '10016926299'),
              display_name: profile?.display_name || 'Ведущий',
              avatar_url: profile?.avatar_url
            }}
            roomId={mpRoomId}
            roomTitle={`Своя Икра: ${gameTopic || options?.topic || 'Общие знания'}`}
            roomType="jeopardy"
            gameId="jeopardy"
            invitePath={`/multiplayer/room/${mpRoomId}`}
          />
          <ZoomVideoModal
            isOpen={isMpZoomOpen}
            onClose={() => setIsMpZoomOpen(false)}
            currentUser={{
              uid: String(profile?.uid || user?.id || '10016926299'),
              display_name: profile?.display_name || 'Ведущий',
              avatar_url: profile?.avatar_url
            }}
            roomId={mpRoomId}
            roomTitle={`Лобби Своя Икра: ${gameTopic || options?.topic || 'Общие знания'}`}
            roomType="jeopardy"
            gameId="jeopardy"
            maxPlayers={Math.min(8, Math.max(2, Number(mpRoomData?.max_players || mpJeopardyState?.maxPlayers || mpMaxPlayers) || 8))}
          />
        </>
      )}

      {/* Category Info Modal */}
      <AnimatePresence>
        {showCategoryInfo && (
          <motion.div 
            key={`modal-category-info-jeopardy-${showCategoryInfo}`}
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={() => setShowCategoryInfo(null)}
            className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-[100dvh] z-[300] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 m-0 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full bg-transparent backdrop-blur-2xl border border-primary/30 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <BubbleElement isBadge className="px-4 py-1.5 text-base font-black text-primary">
                  {showCategoryInfo}
                </BubbleElement>
                <button 
                  onClick={() => setShowCategoryInfo(null)} 
                  className="text-foreground/60 hover:text-foreground p-1 rounded-lg transition-colors"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="p-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md">
                <p className="text-sm sm:text-base text-foreground/90 leading-relaxed font-medium">
                  {categories.find(c => c.name === showCategoryInfo)?.description || 
                   allTopics.find(t => t.name === showCategoryInfo)?.description || 
                   'Увлекательная категория вопросов на общую эрудицию.'}
                </p>
              </div>
              <LeafButton variant="primary" size="md" onClick={() => setShowCategoryInfo(null)} className="w-full justify-center">
                Понятно
              </LeafButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <InsufficientBalanceModal
        isOpen={showInsufficientModal}
        onClose={() => setShowInsufficientModal(false)}
        requiredAmount={insufficientAmount}
        currentBalance={profile ? (profile.balance ?? 0) : demoBalance}
        actionDescription={insufficientReason}
      />
    </div>
  );
};
