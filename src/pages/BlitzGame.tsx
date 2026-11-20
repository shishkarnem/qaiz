import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { protalkService } from '../services/protalk';
import { CoinAnimation } from '../components/CoinAnimation';
import { 
  Timer, 
  Send, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Zap, 
  Loader2, 
  RotateCcw, 
  Pause, 
  Play, 
  LogOut, 
  Lightbulb, 
  FastForward, 
  Sparkles,
  ShoppingBag,
  Coins,
  X,
  Trophy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { saveGameSession, saveGameProgress, getGameProgress, deleteGameProgress } from '../db';
import { GameError } from '../components/GameError';
import { GameChat, ChatMessage, ChatMessageAttachment } from '../components/GameChat';
import { GenerationLoadingScreen } from '../components/GenerationLoadingScreen';
import { GlassBubblesAnimation } from '../components/GlassBubblesAnimation';
import { CheckingAnswerModal } from '../components/CheckingAnswerModal';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { VoiceInputBubble } from '../components/ui/VoiceInputBubble';
import { MultiplayerCountdownOverlay } from '../components/ui/MultiplayerCountdownOverlay';
import { ScoreCalculationCard } from '../components/ScoreCalculationCard';
import { InsufficientBalanceModal } from '../components/InsufficientBalanceModal';
import { VideoInviteModal } from '../components/video/VideoInviteModal';
import { ZoomVideoModal } from '../components/ZoomVideoModal';
import { MultiplayerGameWebcamStrip, MultiplayerParticipantInfo } from '../components/video/MultiplayerGameWebcamStrip';
import { UserAvatar } from '../components/UserAvatar';
import { Users, Video, UserPlus, UserCheck, Share2, Radio } from 'lucide-react';
import { isExactOrCloseAnswerMatch, getRandomCheckSeconds, runSimulatedCheckCountdown, startAICheckCountdown } from '../utils/answerVerification';
import { fetchGameScoringRule, GameScoringRule, calculateAuthoritativeScoreClient, ScoreCalculationResult } from '../utils/gameScoring';
import { audioSystem } from '../hooks/useSound';

export const getDifficultyMultiplier = (diff?: string): number => {
  switch (diff) {
    case 'dummy': return 1;
    case 'people': return 10;
    case 'genius': return 100;
    case 'god': return 1000;
    default: return 10;
  }
};

function normalizeBlitzQuestions(rawList: any[]): any[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map((q: any, idx: number) => {
    const qText = q.text || q.question || q.prompt || '';
    const qAnswer = q.correctAnswer || q.correct_answer || q.answer || '';
    let opts: string[] = [];
    if (Array.isArray(q.options)) {
      opts = q.options;
    } else if (q.options_json) {
      try {
        const parsed = JSON.parse(q.options_json);
        if (Array.isArray(parsed)) opts = parsed;
      } catch (_) {}
    }
    return {
      ...q,
      id: q.id || `gq_${idx + 1}`,
      text: qText,
      question: qText,
      correctAnswer: qAnswer,
      answer: qAnswer,
      options: opts,
      hint: q.hint || '',
      explanation: q.explanation || q.comment || ''
    };
  });
}

export function BlitzGame() {
  const { profile, effectiveUid, demoBalance, openDemoExhaustedModal, spendBalance } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlRoomId = searchParams.get('room');
  const urlPackId = searchParams.get('pack');
  const urlMode = searchParams.get('mode');

  const options = location.state || {
    mode: 'lite',
    difficulty: 'people',
    price: 10,
    playMode: urlMode === 'multi' || urlRoomId ? 'multi' : 'single',
    roomId: urlRoomId || undefined,
    packId: urlPackId || undefined
  };
  const [detectedMpRoomId, setDetectedMpRoomId] = useState<string | undefined>(
    () => options?.mpRoomId || options?.roomId || urlRoomId || undefined
  );
  const existingRoomId = detectedMpRoomId || options?.mpRoomId || options?.roomId || urlRoomId || undefined;
  const isMultiplayer = Boolean(options?.playMode === 'multi' || urlMode === 'multi' || existingRoomId);
  const initialPreloaded = options?.questions || options?.preloadedQuestions;
  
  const [gameState, setGameState] = useState<'setup' | 'loading' | 'lobby' | 'playing' | 'feedback' | 'result' | 'error'>(
    options?.resume && !isMultiplayer ? 'playing' : options ? 'loading' : 'setup'
  );
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [topic, setTopic] = useState(options.topic || 'Общие знания');
  const [difficulty, setDifficulty] = useState(options.difficulty || 'people');
  const [questions, setQuestions] = useState<any[]>(initialPreloaded ? normalizeBlitzQuestions(initialPreloaded) : []);
  const [currentIndex, setCurrentIndex] = useState(options?.currentIndex || 0);
  const [userAnswer, setUserAnswer] = useState('');
  const [score, setScore] = useState(options?.score || 0);
  const [savedMpCorrectCount, setSavedMpCorrectCount] = useState<number>(0);
  const [showMpCountdown, setShowMpCountdown] = useState<boolean>(false);
  const [togglingMpReady, setTogglingMpReady] = useState<boolean>(false);
  const mpCountdownShownRef = useRef<boolean>(false);
  const [timeLeft, setTimeLeft] = useState(options?.timeLeft ?? 60);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean, explanation: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkTimer, setCheckTimer] = useState(0);
  const [isCheckTimedOut, setIsCheckTimedOut] = useState(false);
  const [checkInterval, setCheckInterval] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hasProgress, setHasProgress] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);

  // Advanced game controls state
  const [isPaused, setIsPaused] = useState(false);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [skipsLeft, setSkipsLeft] = useState(options?.skipsLeft ?? 5);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [isBuyingSkips, setIsBuyingSkips] = useState(false);
  const [scoringRule, setScoringRule] = useState<GameScoringRule | null>(null);
  const [scoreCalculation, setScoreCalculation] = useState<ScoreCalculationResult | null>(null);
  const [finalEarnedScore, setFinalEarnedScore] = useState<number>(0);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [insufficientReason, setInsufficientReason] = useState('');
  const [insufficientAmount, setInsufficientAmount] = useState(1);

  useEffect(() => {
    fetchGameScoringRule('blitz', options?.difficulty || difficulty).then(rule => {
      if (rule) setScoringRule(rule);
    });
  }, [options?.difficulty, difficulty]);

  useEffect(() => {
    if (gameState === 'result' && !scoreCalculation) {
      const currentList = questions || [];
      const correctCount = Math.max(savedMpCorrectCount, currentList.filter(q => q.is_correct === 1).length);
      calculateAuthoritativeScoreClient({
        gameId: 'blitz',
        difficulty: options?.difficulty || difficulty,
        correctAnswers: correctCount,
        totalQuestions: currentList.length || 10,
        isWin: correctCount >= 6,
        mode: options?.mode || 'lite'
      }).then(res => {
        if (res) {
          setScoreCalculation(res);
          setFinalEarnedScore(res.authoritativeScore);
        }
      });
    }
  }, [gameState, scoreCalculation, questions, savedMpCorrectCount, options?.difficulty, difficulty, options?.mode]);
  const [isBuyingHint, setIsBuyingHint] = useState(false);

  const [packId, setPackId] = useState<string>(options?.packId || urlPackId || `pack_${Date.now()}`);
  const currentUserId = effectiveUid || profile?.uid || '10016926299';
  const trackedQuestionsRef = useRef<Set<string>>(new Set());

  // Multiplayer lobby, participants & invite modal state
  const [fallbackMpRoomId] = useState<string>(() => `mproom_blitz_${Date.now().toString(36)}`);
  const mpRoomId = existingRoomId || fallbackMpRoomId;
  const [mpRoomData, setMpRoomData] = useState<any>(null);
  const [mpParticipants, setMpParticipants] = useState<MultiplayerParticipantInfo[]>([]);
  const [isMpInviteOpen, setIsMpInviteOpen] = useState(false);
  const [isMpZoomOpen, setIsMpZoomOpen] = useState(false);
  const mpInviteTriggeredRef = useRef(false);
  const prevRoomStatusRef = useRef<string | null>(null);

  const triggerMultiplayerCountdownAndStart = useCallback(() => {
    if (mpCountdownShownRef.current) {
      setGameState('playing');
      return;
    }
    mpCountdownShownRef.current = true;
    setShowMpCountdown(true);
  }, []);

  // Register room and open invite modal once AI question pack is ready in multiplayer lobby
  const registerMultiplayerLobbyRoom = useCallback(async (qCount: number, activePackId: string, activeTopic: string, activeDiff: string) => {
    if (!isMultiplayer || mpInviteTriggeredRef.current) return;
    mpInviteTriggeredRef.current = true;
    try {
      const res = await fetch('/api/multiplayer/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mpRoomId,
          game_id: 'blitz',
          game_title: 'КвИИз',
          host_id: String(currentUserId),
          host_name: profile?.display_name || 'Ведущий',
          host_avatar: profile?.avatar_url || null,
          topic: activeTopic || 'Общие знания',
          difficulty: activeDiff || 'people',
          question_count: qCount || 10,
          pack_id: activePackId,
          visibility: options?.visibility === 'private' || options?.visibility === 'closed' ? 'private' : 'public',
          max_players: Math.min(8, Math.max(2, Number(options?.maxPlayers) || 8)),
          settings_json: {
            visibility: options?.visibility === 'private' || options?.visibility === 'closed' ? 'private' : 'public',
            max_players: Math.min(8, Math.max(2, Number(options?.maxPlayers) || 8))
          }
        })
      });
      const rJson = await res.json().catch(() => null);
      if (rJson?.room) setMpRoomData(rJson.room);
    } catch (_) {}
    // Open invite modal automatically right after generation finishes (unless joining an existing room)
    if (!existingRoomId) {
      setIsMpInviteOpen(true);
    }
  }, [isMultiplayer, mpRoomId, currentUserId, profile?.display_name, profile?.avatar_url, existingRoomId, options?.visibility, options?.maxPlayers]);

  const handleRoomStateSync = useCallback((data: {
    room: any;
    participants: MultiplayerParticipantInfo[];
    chatMessages: ChatMessage[];
  }) => {
    if (data.room) {
      const prevStatus = prevRoomStatusRef.current;
      prevRoomStatusRef.current = data.room.status || null;
      setMpRoomData(data.room);
      // 1. If an invited player is waiting in the lobby and the creator pressed "Начать игру", run 5..1 countdown then open Question 1
      if (data.room.status === 'active' && gameState === 'lobby' && !showMpCountdown) {
        setCurrentIndex(0);
        setTimeLeft(60);
        setHintRevealed(false);
        triggerMultiplayerCountdownAndStart();
      }
      // 2. Requirement 5: If the room transitioned from 'active' to 'finished' while local player is playing, finish immediately
      if (prevStatus === 'active' && data.room.status === 'finished' && (gameState === 'playing' || gameState === 'feedback')) {
        setFeedback(null);
        setChecking(false);
        setGameState('result');
      }
    }
    if (Array.isArray(data.participants)) {
      setMpParticipants(data.participants);
    }
    if (Array.isArray(data.chatMessages)) {
      setChatMessages(data.chatMessages);
    }
  }, [gameState, showMpCountdown, triggerMultiplayerCountdownAndStart]);

  const handleToggleMultiplayerReady = async () => {
    if (!mpRoomId || togglingMpReady) return;
    const myPart = mpParticipants.find(p => String(p.user_id) === String(currentUserId));
    const nextReady = Number(myPart?.is_ready) === 1 ? 0 : 1;
    setTogglingMpReady(true);
    try {
      await fetch(`/api/multiplayer/rooms/${mpRoomId}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: String(currentUserId),
          display_name: profile?.display_name || 'Игрок',
          is_ready: nextReady
        })
      });
    } catch (_) {
    } finally {
      setTogglingMpReady(false);
    }
  };

  const handleStartMultiplayerGameFromLobby = async () => {
    const isCreator = !mpRoomData?.host_id || String(mpRoomData.host_id) === String(currentUserId);
    if (!isCreator) return;
    try {
      await fetch(`/api/multiplayer/rooms/${mpRoomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active', current_question_index: 0 })
      });
    } catch (_) {}
    setCurrentIndex(0);
    setTimeLeft(60);
    setHintRevealed(false);
    triggerMultiplayerCountdownAndStart();
  };

  // If joining or returning to an existing multiplayer room (via URL ?room=... or location.state.mpRoomId)
  useEffect(() => {
    if (!existingRoomId) return;
    let cancelled = false;
    const joinExistingRoom = async () => {
      try {
        const roomRes = await fetch(`/api/multiplayer/rooms/${existingRoomId}`).then(r => r.json()).catch(() => null);
        const roomObj = roomRes?.room;
        const partsList: any[] = Array.isArray(roomRes?.participants) ? roomRes.participants : [];
        if (roomObj) setMpRoomData(roomObj);
        if (partsList.length > 0) setMpParticipants(partsList);

        const resolvedPack = urlPackId || options?.packId || roomObj?.pack_id;
        if (roomObj?.topic) setTopic(roomObj.topic);
        if (roomObj?.difficulty) setDifficulty(roomObj.difficulty);
        if (resolvedPack) setPackId(resolvedPack);

        const joinRes = await fetch(`/api/multiplayer/rooms/${existingRoomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(currentUserId),
            display_name: profile?.display_name || 'Игрок',
            avatar_url: profile?.avatar_url || null,
            team_number: 1
          })
        }).catch(() => null);

        if (joinRes && !joinRes.ok) {
          const errJson = await joinRes.json().catch(() => ({}));
          if (errJson?.code === 'GAME_ALREADY_STARTED' || errJson?.code === 'ROOM_FULL') {
            navigate(`/multiplayer/room/${existingRoomId}`);
            return;
          }
        }

        let loadedQuestions: any[] = [];
        let packRes: any = null;
        if (resolvedPack) {
          packRes = await fetch(`/api/game-packs/${resolvedPack}?user_id=${encodeURIComponent(String(currentUserId))}`).then(r => r.json()).catch(() => null);
          const rawQuestions = packRes?.data?.questions;
          const parsedQuestions = typeof rawQuestions === 'string' ? JSON.parse(rawQuestions) : rawQuestions;
          if (Array.isArray(parsedQuestions) && parsedQuestions.length > 0) {
            loadedQuestions = normalizeBlitzQuestions(parsedQuestions);
          }
        }
        if (loadedQuestions.length === 0 && Array.isArray(roomRes?.questions) && roomRes.questions.length > 0) {
          loadedQuestions = normalizeBlitzQuestions(roomRes.questions);
        }
        if (loadedQuestions.length === 0 && Array.isArray(initialPreloaded) && initialPreloaded.length > 0) {
          loadedQuestions = normalizeBlitzQuestions(initialPreloaded);
        }

        const progress = resolvedPack ? await getGameProgress(currentUserId, resolvedPack, 'blitz').catch(() => null) : null;
        if (loadedQuestions.length === 0 && progress?.state && Array.isArray((progress.state as any).questions)) {
          loadedQuestions = normalizeBlitzQuestions((progress.state as any).questions);
        }
        if (loadedQuestions.length === 0) {
          try {
            const generated = await protalkService.generateQuestions(
              roomObj?.topic || options?.topic || 'Общие знания',
              roomObj?.difficulty || options?.difficulty || 'people',
              Number(roomObj?.question_count) || 10,
              'blitz',
              undefined,
              resolvedPack,
              String(currentUserId)
            );
            if (Array.isArray(generated) && generated.length > 0) {
              loadedQuestions = normalizeBlitzQuestions(generated);
            }
          } catch (_) {}
        }

        if (!cancelled && loadedQuestions.length > 0) {
          const me = partsList.find(p => String(p.user_id) === String(currentUserId)) || null;
          const meFinished = Number(me?.is_finished) === 1;
          const meRound = Math.max(1, Number(me?.current_round) || 1);
          const meCompletedSteps = meFinished ? loadedQuestions.length : Math.max(0, meRound - 1);
          const meCorrect = meFinished
            ? Number(me?.correct_count || 0)
            : Math.min(Number(me?.correct_count || 0), meCompletedSteps);
          const meScore = Number(me?.score) || 0;

          const progressStep = Number(progress?.current_step || (progress?.state as any)?.currentIndex || 0);
          const packStep = Number(packRes?.data?.current_step || 0);
          const optIdx = typeof options?.currentIndex === 'number'
            ? options.currentIndex
            : typeof options?.savedRoundIndex === 'number'
            ? options.savedRoundIndex
            : 0;
          const forcedIdx = typeof options?.forcedQuestionIndex === 'number' ? options.forcedQuestionIndex : null;
          const targetStep = forcedIdx !== null
            ? Math.min(loadedQuestions.length - 1, Math.max(0, forcedIdx))
            : Math.min(
                loadedQuestions.length - 1,
                Math.max(0, meCompletedSteps, progressStep, packStep, optIdx)
              );

          // Mark answered questions only for the current user's completed steps, and clear any leaked answers on future steps
          setSavedMpCorrectCount(meCorrect);
          loadedQuestions = loadedQuestions.map((q, idx) => {
            if (idx < targetStep) {
              return {
                ...q,
                is_answered: 1,
                is_correct: q.is_correct !== undefined ? Number(q.is_correct) : (idx < meCorrect ? 1 : 0)
              };
            }
            if (!meFinished) {
              return {
                ...q,
                is_answered: 0,
                is_correct: 0,
                user_answer: ''
              };
            }
            return q;
          });
          setQuestions(loadedQuestions);
          const bestCorrect = meFinished
            ? Math.max(meCorrect, loadedQuestions.filter(q => Number(q.is_correct) === 1).length)
            : Math.min(targetStep, Math.max(meCorrect, loadedQuestions.slice(0, targetStep).filter(q => Number(q.is_correct) === 1).length));
          if (bestCorrect > 0 || meScore > 0) {
            setScore(bestCorrect);
            setFinalEarnedScore(meScore || bestCorrect);
          }

          if (forcedIdx !== null || (options?.resume && !meFinished)) {
            mpCountdownShownRef.current = true;
            setCurrentIndex(targetStep);
            setTimeLeft(60);
            setGameState('playing');
          } else if (meFinished || roomObj?.status === 'finished') {
            mpCountdownShownRef.current = true;
            setCurrentIndex(loadedQuestions.length - 1);
            setGameState('result');
          } else if (roomObj?.status === 'active') {
            if (options?.justStartedFromLobby && targetStep === 0 && !options?.resumeMultiplayer) {
              // Game just started from waiting lobby -> run 5..1 countdown on bubble background
              setCurrentIndex(0);
              setTimeLeft(60);
              setGameState('lobby');
              triggerMultiplayerCountdownAndStart();
            } else {
              // Returning to active game -> resume immediately at saved question with all participants
              mpCountdownShownRef.current = true;
              setCurrentIndex(targetStep);
              setTimeLeft(60);
              setGameState('playing');
            }
          } else {
            setCurrentIndex(0);
            setTimeLeft(60);
            setGameState('lobby');
          }
          return;
        }
      } catch (_) {}
    };
    joinExistingRoom();
    return () => {
      cancelled = true;
    };
  }, [existingRoomId, urlPackId, currentUserId, profile?.display_name, profile?.avatar_url]);

  // If resumed with pre-supplied questions or replaying a saved pack, initialize immediately
  useEffect(() => {
    if (existingRoomId) return;
    const initGame = async () => {
      if (options?.isReplay) {
        if (options?.questions && Array.isArray(options.questions) && options.questions.length > 0) {
          setQuestions(normalizeBlitzQuestions(options.questions));
          setCurrentIndex(0);
          setScore(0);
          setTopic(options.topic || 'Общие знания');
          setDifficulty(options.difficulty || 'people');
          setTimeLeft(60);
          setSkipsLeft(5);
          setGameState('playing');
          if (options.packId) {
            fetch(`/api/game-packs/${options.packId}/play`, { method: 'POST' }).catch(() => {});
          }
          return;
        }

        if (options?.packId) {
          try {
            const packRes = await fetch(`/api/game-packs/${options.packId}`).then(r => r.json()).catch(() => null);
            if (packRes?.data?.questions && Array.isArray(packRes.data.questions) && packRes.data.questions.length > 0) {
              setQuestions(normalizeBlitzQuestions(packRes.data.questions));
              setCurrentIndex(0);
              setScore(0);
              setTopic(packRes.data.topic || options.topic || 'Общие знания');
              setDifficulty(packRes.data.difficulty || options.difficulty || 'people');
              setTimeLeft(60);
              setSkipsLeft(5);
              setGameState('playing');
              fetch(`/api/game-packs/${options.packId}/play`, { method: 'POST' }).catch(() => {});
              return;
            }
          } catch (_) {}
        }
      } else if (options?.resume) {
        if (options?.packId) {
          try {
            const packRes = await fetch(`/api/game-packs/${options.packId}?user_id=${encodeURIComponent(String(currentUserId))}`).then(r => r.json()).catch(() => null);
            if (packRes?.data?.is_multiplayer && packRes?.data?.mp_room_id) {
              setDetectedMpRoomId(packRes.data.mp_room_id);
              return;
            }
          } catch (_) {}
        }
        if (options?.questions && Array.isArray(options.questions) && options.questions.length > 0) {
          setQuestions(normalizeBlitzQuestions(options.questions));
          setCurrentIndex(options.currentIndex !== undefined ? options.currentIndex : 0);
          setScore(options.score || 0);
          setTopic(options.topic || 'Общие знания');
          setDifficulty(options.difficulty || 'people');
          setTimeLeft(options.timeLeft ?? 60);
          setSkipsLeft(options.skipsLeft ?? 5);
          setGameState('playing');
          return;
        }

        if (options?.packId) {
          try {
            const progress = await getGameProgress(currentUserId, options.packId, 'blitz');
            if (progress && progress.state) {
              const s = progress.state as any;
              if (Array.isArray(s.questions) && s.questions.length > 0) {
                setQuestions(normalizeBlitzQuestions(s.questions));
                setCurrentIndex(options.currentIndex !== undefined ? options.currentIndex : (s.currentIndex !== undefined ? s.currentIndex : (progress.current_step || 0)));
                setScore(s.score || 0);
                setTopic(s.topic || options.topic || 'Общие знания');
                setDifficulty(s.difficulty || options.difficulty || 'people');
                setTimeLeft(s.timeLeft || 60);
                setSkipsLeft(s.skipsLeft !== undefined ? s.skipsLeft : 5);
                setGameState('playing');
                return;
              }
            }

            const packRes = await fetch(`/api/game-packs/${options.packId}?user_id=${encodeURIComponent(String(currentUserId))}`).then(r => r.json()).catch(() => null);
            if (packRes?.data?.questions && Array.isArray(packRes.data.questions) && packRes.data.questions.length > 0) {
              setQuestions(normalizeBlitzQuestions(packRes.data.questions));
              setCurrentIndex(options.currentIndex !== undefined ? options.currentIndex : (packRes.data.current_step || progress?.current_step || 0));
              setTopic(packRes.data.topic || options.topic || 'Общие знания');
              setDifficulty(packRes.data.difficulty || options.difficulty || 'people');
              setTimeLeft(60);
              setSkipsLeft(5);
              setGameState('playing');
              return;
            }
          } catch (_) {}
        }
      }
    };

    initGame();
  }, [options, currentUserId, existingRoomId]);

  // Load progress on mount if not already loaded
  useEffect(() => {
    const loadProgress = async () => {
      if (!currentUserId || !options?.packId || (questions && questions.length > 0) || options?.isReplay || options?.resume) return;
      const progress = await getGameProgress(currentUserId, options.packId, 'blitz');
      if (progress && progress.state) {
        setHasProgress(true);
      }
    };
    loadProgress();
  }, [currentUserId, options?.packId, options?.isReplay, options?.resume, questions]);

  // Persist game progress whenever question or score advances
  useEffect(() => {
    const doSave = async () => {
      if (gameState === 'playing' && currentUserId && questions && questions.length > 0) {
        await saveGameProgress({
          userId: currentUserId,
          packId: packId,
          gameType: 'blitz',
          currentStep: currentIndex,
          totalSteps: questions.length || 10,
          state: { 
            questions, 
            currentIndex, 
            score, 
            topic, 
            difficulty, 
            timeLeft, 
            skipsLeft,
            isMultiplayer: Boolean(isMultiplayer),
            mpRoomId: isMultiplayer ? mpRoomId : undefined,
            playMode: isMultiplayer ? 'multi' : 'single'
          }
        });
      }
    };
    doSave();
  }, [currentIndex, score, gameState, questions, currentUserId, packId, skipsLeft, topic, difficulty, timeLeft]);

  const handleResume = async () => {
    if (!currentUserId || !options?.packId) return;
    setLoadingProgress(true);
    try {
      const progress = await getGameProgress(currentUserId, options.packId, 'blitz');
      if (progress && progress.state) {
        const s = progress.state as any;
        setQuestions(Array.isArray(s.questions) ? s.questions : []);
        setCurrentIndex(s.currentIndex || 0);
        setScore(s.score || 0);
        setTopic(s.topic || 'Общие знания');
        setDifficulty(s.difficulty || 'people');
        setTimeLeft(s.timeLeft || 60);
        setSkipsLeft(s.skipsLeft !== undefined ? s.skipsLeft : 5);
        setGameState('playing');
      } else {
        startLevel();
      }
    } catch {
      startLevel();
    } finally {
      setLoadingProgress(false);
    }
  };

  const startCheckTimer = (initialSec = 60) => {
    setCheckTimer(initialSec);
    setIsCheckTimedOut(false);
    if (checkInterval) clearInterval(checkInterval);
    const interval = setInterval(() => {
      setCheckTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsCheckTimedOut(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setCheckInterval(interval);
  };

  const stopCheckTimer = () => {
    if (checkInterval) clearInterval(checkInterval);
    setCheckInterval(null);
  };

  const handleSendMessage = async (text: string, attachment?: ChatMessageAttachment | null) => {
    const tempId = Date.now().toString();
    const newMessage: ChatMessage = {
      id: tempId,
      senderId: String(currentUserId),
      senderName: profile?.display_name || 'Игрок',
      avatar: profile?.avatar_url || undefined,
      text,
      isBot: false,
      timestamp: Date.now(),
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null
    };
    setChatMessages(prev => [...prev, newMessage]);

    if (isMultiplayer && mpRoomId) {
      try {
        const res = await fetch(`/api/multiplayer/rooms/${mpRoomId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(currentUserId),
            action_type: 'chat',
            payload: {
              text,
              sender_name: profile?.display_name || 'Игрок',
              avatar_url: profile?.avatar_url || null,
              attachment_url: attachment?.url || null,
              attachment_name: attachment?.name || null,
              attachment_type: attachment?.type || null
            }
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setChatMessages(prev => prev.filter(m => m.id !== tempId));
          return {
            moderated: Boolean(errData.moderated),
            error: errData.error || errData.reason || 'Сообщение отклонено ИИ-модератором чата'
          };
        }
      } catch (_) {}
    }
  };

  const startingRef = useRef(false);
  const consecutiveStreakRef = useRef(0);
  const prevQuestionIdxSoundRef = useRef<number | null>(null);
  const prevPausedSoundRef = useRef<boolean>(false);
  const prevFinishAlertSoundRef = useRef<boolean>(false);

  useEffect(() => {
    audioSystem.preloadGameBatch('blitz', Boolean(isMultiplayer));
    return () => {
      audioSystem.stopSlot('blitz_timer_tick');
      audioSystem.stopSlot('blitz_timer_critical');
    };
  }, [isMultiplayer]);

  // Background music per gameState & difficulty
  useEffect(() => {
    if (gameState === 'lobby') {
      audioSystem.playBackground('mp_bg_waiting_room');
    } else if (gameState === 'playing' || gameState === 'feedback') {
      const diffKey =
        difficulty === 'dummy'
          ? 'blitz_bg_easy'
          : difficulty === 'genius'
          ? 'blitz_bg_hard'
          : difficulty === 'god'
          ? 'blitz_bg_god'
          : 'blitz_bg_medium';
      audioSystem.playBackground(diffKey);
    }
  }, [gameState, difficulty]);

  // Round start jingle & question appear sound
  useEffect(() => {
    if (gameState === 'playing' && prevQuestionIdxSoundRef.current !== currentIndex) {
      prevQuestionIdxSoundRef.current = currentIndex;
      const roundNum = Math.min(10, Math.max(1, currentIndex + 1));
      audioSystem.playSlot(`blitz_round_${roundNum}`);
      if (currentIndex > 0) {
        setTimeout(() => {
          audioSystem.playSlot('blitz_question_appear');
        }, 350);
      }
    }
  }, [gameState, currentIndex]);

  // Pause / resume sound
  useEffect(() => {
    if (gameState !== 'playing') return;
    if (isPaused && !prevPausedSoundRef.current) {
      prevPausedSoundRef.current = true;
      audioSystem.playSlot('fx_pause_game');
    } else if (!isPaused && prevPausedSoundRef.current) {
      prevPausedSoundRef.current = false;
      audioSystem.playSlot('fx_resume_game');
    }
  }, [isPaused, gameState]);

  // Opponent finished 5-minute alert in multiplayer
  useEffect(() => {
    const finishRemainingSec = mpRoomData?.finish_remaining_seconds;
    const hasFinishCountdown = typeof finishRemainingSec === 'number' && finishRemainingSec > 0;
    if (hasFinishCountdown && !prevFinishAlertSoundRef.current) {
      prevFinishAlertSoundRef.current = true;
      audioSystem.playSlot('blitz_opponent_finished_5min');
    }
  }, [mpRoomData?.finish_remaining_seconds]);

  // Game result sounds
  useEffect(() => {
    if (gameState === 'result') {
      audioSystem.stopSlot('blitz_timer_tick');
      audioSystem.stopSlot('blitz_timer_critical');
      const corrCount = Math.max(savedMpCorrectCount, (questions || []).filter((q: any) => Number(q.is_correct) === 1).length, score);
      if (corrCount >= 7) {
        if (!audioSystem.playSlot('blitz_win_7plus')) {
          audioSystem.playSlot('blitz_result_win');
        }
      } else if (corrCount >= 6) {
        audioSystem.playSlot('blitz_result_win');
      } else {
        audioSystem.playSlot('blitz_result_lose');
      }
    }
  }, [gameState]);

  useEffect(() => {
    if (existingRoomId) return; // Handled by joinExistingRoom effect
    if (options && !options?.resume && gameState === 'loading' && (!questions || questions.length === 0)) {
      if (startingRef.current) return;
      startingRef.current = true;
      startLevel();
    }
  }, [gameState, questions?.length, options, existingRoomId]);

  const startLevel = async () => {
    // If questions were pre-supplied from history / saved pack, use them directly
    if (options?.questions && Array.isArray(options.questions) && options.questions.length > 0) {
      const normalized = normalizeBlitzQuestions(options.questions);
      setQuestions(normalized);
      setCurrentIndex(options.currentIndex || 0);
      setTimeLeft(60);
      setHintRevealed(false);
      if (isMultiplayer) {
        await registerMultiplayerLobbyRoom(normalized.length, packId, topic, difficulty);
        setGameState('lobby');
      } else {
        setGameState('playing');
      }
      if (options.packId) {
        fetch(`/api/game-packs/${options.packId}/play`, { method: 'POST' }).catch(() => {});
      }
      return;
    }

    const cost = options?.price || 10;
    const currentBal = profile ? (profile.balance ?? 0) : demoBalance;

    if (currentBal < cost) {
      startingRef.current = false;
      if (!profile) {
        openDemoExhaustedModal();
      } else {
        setInsufficientAmount(cost);
        setInsufficientReason('старта игры КвИИз');
        setShowInsufficientModal(true);
      }
      setGameState('setup');
      return;
    }

    setGameState('loading');
    try {
      const generated: any = await protalkService.generateQuestions(topic, difficulty, 10, 'blitz', undefined, packId, currentUserId, options?.note);
      const questionsList = Array.isArray(generated) ? generated : (generated?.questions || []);
      if (!Array.isArray(questionsList) || questionsList.length === 0) {
        throw new Error('Нейросеть не смогла сформировать вопросы для КвИИЗа. Попробуйте еще раз.');
      }
      const normalized = normalizeBlitzQuestions(questionsList);
      setQuestions(normalized);
      setCurrentIndex(0);
      setTimeLeft(60);
      setHintRevealed(false);

      if (isMultiplayer) {
        // Multiplayer flow: after generation -> open invite modal & enter waiting lobby before Question 1 opens!
        await registerMultiplayerLobbyRoom(normalized.length, packId, topic, difficulty);
        setGameState('lobby');
      } else {
        setGameState('playing');
      }
    } catch (error: any) {
      startingRef.current = false;
      console.error('Error generating questions:', error);
      setErrorMessage(error?.message || String(error));
      setGameState('error');
    }
  };

  // Track question display in database (once per question in current session)
  useEffect(() => {
    if (gameState === 'playing' && questions && questions[currentIndex]) {
      const q = questions[currentIndex];
      const qIndex = q.question_index || (currentIndex + 1);
      const trackKey = `${packId}_${q.id || qIndex}`;
      if (!trackedQuestionsRef.current.has(trackKey)) {
        trackedQuestionsRef.current.add(trackKey);
        fetch('/api/generated-questions/show', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: q.id,
            pack_id: q.pack_id || packId,
            question_index: qIndex,
            user_id: effectiveUid,
            is_replay: Boolean(options?.isReplay)
          })
        }).catch(() => {});
      }
    }
  }, [gameState, currentIndex, questions, packId, effectiveUid]);

  const handleNext = useCallback(async () => {
    if (checking || gameState !== 'playing' || isPaused) return;
    audioSystem.stopSlot('blitz_timer_tick');
    audioSystem.stopSlot('blitz_timer_critical');
    audioSystem.playSlot('blitz_answer_submit');
    setChecking(true);
    setIsCheckTimedOut(false);
    
    const answeredIndex = currentIndex;
    const submittedAnswer = userAnswer;
    const currentQuestion = (questions && questions[answeredIndex]) || { text: '', correctAnswer: '', explanation: '', id: `gq_${packId}_${answeredIndex + 1}` };
    const questionCost = options?.isPurchased ? 0 : 1;

    try {
      if (questionCost > 0) {
        const deducted = await spendBalance(
          questionCost, 
          `КвИИз, проверка ответа на вопрос #${answeredIndex + 1}`,
          'blitz',
          currentQuestion.id
        );
        if (!deducted) {
          stopCheckTimer();
          setChecking(false);
          return;
        }
        setShowCoinAnimation(true);
        setTimeout(() => setShowCoinAnimation(false), 1500);
      }
      
      const isExactMatch = isExactOrCloseAnswerMatch(submittedAnswer, currentQuestion.correctAnswer);
      let result: { isCorrect: boolean; explanation: string };

      if (isExactMatch) {
        // Fast-path: Skip AI LLM call, simulate dramatic check overlay (3 to 10 seconds randomly)
        stopCheckTimer();
        setIsCheckTimedOut(false);
        const randomWaitSec = getRandomCheckSeconds(3, 10);
        await runSimulatedCheckCountdown(randomWaitSec, (remaining) => {
          setCheckTimer(remaining);
        });
        const factExpl = currentQuestion.explanation || `Правильный ответ: ${currentQuestion.correctAnswer}.`;
        result = {
          isCorrect: true,
          explanation: `Правильный ответ! ${factExpl}`
        };
      } else {
        // Fallback to AI evaluation with 60-second countdown
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
            currentQuestion.text, 
            submittedAnswer, 
            currentQuestion.correctAnswer,
            currentQuestion.explanation,
            'blitz'
          );
        } finally {
          stopAICountdown();
        }
      }
      
      // Update in-memory questions list with answer record for the exact answeredIndex
      const updatedQuestions = (questions || []).map((q, idx) => {
        if (idx === answeredIndex) {
          return {
            ...q,
            is_answered: 1,
            user_answer: submittedAnswer,
            is_correct: result.isCorrect ? 1 : 0,
            is_skipped: 0
          };
        }
        return q;
      });
      setQuestions(updatedQuestions);

      // Update question answer and counters in DB
      fetch('/api/generated-questions/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentQuestion.id,
          pack_id: packId,
          question_index: answeredIndex + 1,
          user_id: currentUserId,
          user_answer: submittedAnswer,
          is_correct: result.isCorrect ? 1 : 0,
          is_skipped: 0
        })
      }).catch(() => {});

      const rawExpl = result.explanation || currentQuestion.explanation || '';
      const rightAns = currentQuestion.correctAnswer || currentQuestion.answer || '';
      const hasRightAnsInExpl = rightAns && rawExpl.toLowerCase().includes(String(rightAns).toLowerCase());
      const explanationText = hasRightAnsInExpl
        ? rawExpl
        : `Правильный ответ: ${rightAns}.${rawExpl ? ' ' + rawExpl : ''}`;

      stopCheckTimer();
      setChecking(false);
      if (result.isCorrect) {
        consecutiveStreakRef.current += 1;
        audioSystem.playSlot('blitz_answer_correct');
        if (consecutiveStreakRef.current === 3) {
          setTimeout(() => audioSystem.playSlot('blitz_streak_3'), 450);
        } else if (consecutiveStreakRef.current >= 5) {
          setTimeout(() => audioSystem.playSlot('blitz_streak_5'), 450);
        }
      } else {
        consecutiveStreakRef.current = 0;
        audioSystem.playSlot('blitz_answer_wrong');
      }
      setFeedback({
        isCorrect: result.isCorrect,
        explanation: explanationText
      });
      
      const newCorrectCount = Math.max(savedMpCorrectCount, updatedQuestions.filter(q => q.is_correct === 1).length);
      setScore(newCorrectCount);

      const nextStepAfterAnswer = Math.min((updatedQuestions.length || 10) - 1, answeredIndex + 1);
      const nextRoundAfterAnswer = Math.min(updatedQuestions.length || 10, answeredIndex + 2);

      // Immediately save game progress with updated questions and advanced step
      if (packId) {
        saveGameProgress({
          userId: currentUserId,
          packId,
          gameType: 'blitz',
          currentStep: nextStepAfterAnswer,
          totalSteps: updatedQuestions.length || 10,
          state: {
            questions: updatedQuestions,
            currentIndex: nextStepAfterAnswer,
            score: newCorrectCount,
            topic,
            difficulty,
            timeLeft: 60,
            skipsLeft,
            isMultiplayer: Boolean(isMultiplayer),
            mpRoomId: isMultiplayer ? mpRoomId : undefined,
            playMode: isMultiplayer ? 'multi' : 'single'
          }
        }).catch(() => {});
      }

      if (isMultiplayer && mpRoomId) {
        const mult = scoringRule?.points_per_correct || getDifficultyMultiplier(difficulty) * 10;
        fetch(`/api/multiplayer/rooms/${mpRoomId}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(currentUserId),
            current_round: nextRoundAfterAnswer,
            correct_count: newCorrectCount,
            score: newCorrectCount * mult,
            is_finished: 0
          })
        }).catch(() => {});
      }
      
      setGameState('feedback');
    } catch (error) {
      console.error('Error checking answer:', error);
      stopCheckTimer();
    } finally {
      setChecking(false);
    }
  }, [currentIndex, questions, userAnswer, checking, gameState, isPaused, options?.isPurchased, spendBalance, currentUserId, packId, savedMpCorrectCount, isMultiplayer, mpRoomId, scoringRule, difficulty, startCheckTimer, stopCheckTimer]);

  const handleContinue = async () => {
    setFeedback(null);
    setUserAnswer('');
    setHintRevealed(false);
    
    if (currentIndex < (questions?.length || 0) - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setTimeLeft(60);
      setGameState('playing');
      if (isMultiplayer && mpRoomId) {
        const currentCorrect = Math.max(savedMpCorrectCount, (questions || []).filter(q => q.is_correct === 1).length);
        const mult = scoringRule?.points_per_correct || getDifficultyMultiplier(difficulty) * 10;
        fetch(`/api/multiplayer/rooms/${mpRoomId}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(currentUserId),
            current_round: nextIdx + 1,
            correct_count: currentCorrect,
            score: currentCorrect * mult,
            is_finished: 0
          })
        }).catch(() => {});
      }
    } else {
      // Calculate final score using database scoring rule
      const currentList = questions || [];
      const correctCount = Math.max(savedMpCorrectCount, currentList.filter(q => q.is_correct === 1).length);
      const isWin = correctCount >= 6;

      let computedAuthScore = correctCount * (scoringRule?.points_per_correct || getDifficultyMultiplier(difficulty) * 10);

      if (isMultiplayer && mpRoomId) {
        // Requirement 1 & 5: In multiplayer, prize points are awarded ONLY when the entire game finishes by all participants!
        // Winner's prize points are multiplied by participant count; losers receive standard single-player points.
        const calc = await calculateAuthoritativeScoreClient({
          gameId: 'blitz',
          difficulty: options?.difficulty || difficulty,
          correctAnswers: correctCount,
          totalQuestions: currentList.length || 10,
          isWin,
          mode: options?.mode || 'lite'
        });
        if (calc) {
          setScoreCalculation(calc);
          computedAuthScore = calc.authoritativeScore;
          setFinalEarnedScore(computedAuthScore);
        }

        const progRes = await fetch(`/api/multiplayer/rooms/${mpRoomId}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(currentUserId),
            current_round: currentList.length || 10,
            correct_count: correctCount,
            score: computedAuthScore || correctCount,
            is_finished: 1
          })
        }).catch(() => null);
        if (progRes && progRes.ok) {
          const progData = await progRes.json().catch(() => null);
          if (progData?.room) setMpRoomData(progData.room);
          if (Array.isArray(progData?.participants)) setMpParticipants(progData.participants);
        } else if (correctCount >= 7) {
          setMpRoomData((prev: any) => (prev ? { ...prev, status: 'finished', finish_remaining_seconds: null } : prev));
        }
      } else {
        const saved = await saveGameSession({
          userId: currentUserId,
          gameId: 'blitz',
          score: 0,
          rawScore: correctCount,
          totalQuestions: currentList.length || 10,
          correctAnswers: correctCount,
          mode: options?.mode || 'lite',
          difficulty: options?.difficulty || difficulty,
          topic: options?.topic || topic,
          pricePaid: options?.price || 10,
          isWin,
          packId: packId
        });

        if (saved?.calculation) {
          setScoreCalculation(saved.calculation);
          computedAuthScore = saved.score ?? saved.calculation.authoritativeScore;
          setFinalEarnedScore(computedAuthScore);
        } else {
          const calc = await calculateAuthoritativeScoreClient({
            gameId: 'blitz',
            difficulty: options?.difficulty || difficulty,
            correctAnswers: correctCount,
            totalQuestions: currentList.length || 10,
            isWin,
            mode: options?.mode || 'lite'
          });
          if (calc) {
            setScoreCalculation(calc);
            computedAuthScore = calc.authoritativeScore;
            setFinalEarnedScore(computedAuthScore);
          }
        }
      }

      await deleteGameProgress(currentUserId, packId, 'blitz');
      setGameState('result');
    }
  };

  // Handle "Не знаю ответ" immediately showing solution without AI checking fee
  // Decrements from 5 skips limit. If 0 left, prompts to buy 5 skips for 1 IIkr.
  const handleDontKnowAnswer = async () => {
    consecutiveStreakRef.current = 0;
    audioSystem.stopSlot('blitz_timer_tick');
    audioSystem.stopSlot('blitz_timer_critical');
    audioSystem.playSlot('blitz_question_skip');
    setIsAutoPaused(false);
    const currentQuestion = (questions && questions[currentIndex]) || { text: '', correctAnswer: '', explanation: '', id: `gq_${packId}_${currentIndex + 1}` };
    
    // Update in-memory questions list as skipped
    const updatedQuestions = (questions || []).map((q, idx) => {
      if (idx === currentIndex) {
        return {
          ...q,
          is_answered: 1,
          user_answer: 'Не знаю ответ',
          is_correct: 0,
          is_skipped: 1
        };
      }
      return q;
    });
    setQuestions(updatedQuestions);

    if (skipsLeft > 0) {
      const remainingSkips = skipsLeft - 1;
      setSkipsLeft(remainingSkips);

      if (currentQuestion.id) {
        fetch('/api/generated-questions/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentQuestion.id,
            pack_id: packId,
            question_index: currentIndex + 1,
            user_id: currentUserId,
            user_answer: 'Не знаю ответ',
            is_correct: 0,
            is_skipped: 1
          })
        }).catch(() => {});
      }

      setFeedback({
        isCorrect: false,
        explanation: `Ответ не дан (пропусков осталось: ${remainingSkips}). Правильный ответ: ${currentQuestion.correctAnswer || 'Не указан'}.${currentQuestion.explanation ? ` ${currentQuestion.explanation}` : ''}`
      });
      setGameState('feedback');
    } else {
      // Skips exhausted: prompt to buy 5 skips for 1 IIkr
      setIsBuyingSkips(true);
      try {
        const paid = await spendBalance(1, 'Покупка 5 пропусков для КвИИЗа', 'blitz_skips', currentQuestion.id);
        if (paid) {
          setSkipsLeft(4); // 5 bought - 1 used immediately
          if (currentQuestion.id) {
            fetch('/api/generated-questions/answer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: currentQuestion.id,
                pack_id: packId,
                question_index: currentIndex + 1,
                user_id: currentUserId,
                user_answer: 'Не знаю ответ',
                is_correct: 0,
                is_skipped: 1
              })
            }).catch(() => {});
          }
          setShowCoinAnimation(true);
          setTimeout(() => setShowCoinAnimation(false), 1200);
          setFeedback({
            isCorrect: false,
            explanation: `Куплено 5 пропусков за 1 ИИрку (осталось: 4). Правильный ответ: ${currentQuestion.correctAnswer || 'Не указан'}.${currentQuestion.explanation ? ` ${currentQuestion.explanation}` : ''}`
          });
          setGameState('feedback');
        } else {
          setFeedback({
            isCorrect: false,
            explanation: `Лимит 5 бесплатных пропусков исчерпан. Для дополнительных 5 пропусков требуется 1 ИИкра. Правильный ответ: ${currentQuestion.correctAnswer || 'Не указан'}.${currentQuestion.explanation ? ` ${currentQuestion.explanation}` : ''}`
          });
          setGameState('feedback');
        }
      } finally {
        setIsBuyingSkips(false);
      }
    }
  };

  // Close game with progress save (does not remove from multiplayer participants)
  const handleExitGame = async () => {
    if (questions && questions.length > 0) {
      const isCurrentAnswered = gameState === 'feedback' || Number(questions[currentIndex]?.is_answered) === 1 || Boolean(questions[currentIndex]?.user_answer);
      const effectiveStep = isCurrentAnswered
        ? Math.min((questions.length || 10) - 1, currentIndex + 1)
        : currentIndex;
      await saveGameProgress({
        userId: currentUserId,
        packId: packId,
        gameType: 'blitz',
        currentStep: effectiveStep,
        totalSteps: questions.length || 10,
        state: { 
          questions, 
          currentIndex: effectiveStep, 
          score, 
          topic, 
          difficulty, 
          timeLeft, 
          skipsLeft,
          isMultiplayer: Boolean(isMultiplayer),
          mpRoomId: isMultiplayer ? mpRoomId : undefined,
          playMode: isMultiplayer ? 'multi' : 'single'
        }
      });
      if (isMultiplayer && mpRoomId) {
        const mult = scoringRule?.points_per_correct || getDifficultyMultiplier(difficulty) * 10;
        await fetch(`/api/multiplayer/rooms/${mpRoomId}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(currentUserId),
            current_round: Math.min(questions.length || 10, effectiveStep + 1),
            correct_count: score,
            score: score * mult,
            is_finished: 0
          })
        }).catch(() => {});
      }
    }
    if (isMultiplayer && mpRoomId) {
      navigate(`/multiplayer/room/${mpRoomId}`);
    } else {
      navigate('/');
    }
  };

  // Leave game completely (removes participant from multiplayer room)
  const handleLeaveGameCompletely = async () => {
    if (isMultiplayer && mpRoomId) {
      await fetch(`/api/multiplayer/rooms/${mpRoomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: String(currentUserId) })
      }).catch(() => {});
      navigate('/profile/multiplayer');
      return;
    }
    await handleExitGame();
  };

  // Reveal Hint (costs 1 IIkr)
  const handleBuyHint = async () => {
    if (hintRevealed || isBuyingHint) return;
    setIsBuyingHint(true);
    try {
      const currentQuestion = (questions && questions[currentIndex]) || {};
      const paid = await spendBalance(
        1,
        `КвИИз, подсказка к вопросу #${currentIndex + 1}`,
        'blitz_hint',
        currentQuestion.id
      );
      if (paid) {
        audioSystem.playSlot('blitz_hint_use');
        setHintRevealed(true);
        setShowCoinAnimation(true);
        setTimeout(() => setShowCoinAnimation(false), 1200);
      }
    } finally {
      setIsBuyingHint(false);
    }
  };

  // Skip question
  const handleSkipQuestion = async () => {
    consecutiveStreakRef.current = 0;
    audioSystem.stopSlot('blitz_timer_tick');
    audioSystem.stopSlot('blitz_timer_critical');
    audioSystem.playSlot('blitz_question_skip');
    setIsAutoPaused(false);
    const currentQuestion = (questions && questions[currentIndex]) || { text: '', correctAnswer: '', explanation: '', id: `gq_${packId}_${currentIndex + 1}` };

    if (skipsLeft > 0) {
      const remainingSkips = skipsLeft - 1;
      setSkipsLeft(remainingSkips);

      if (currentQuestion.id) {
        fetch('/api/generated-questions/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentQuestion.id,
            pack_id: packId,
            question_index: currentIndex + 1,
            user_id: currentUserId,
            user_answer: 'Вопрос пропущен',
            is_correct: 0,
            is_skipped: 1
          })
        }).catch(() => {});
      }

      setFeedback({ 
        isCorrect: false, 
        explanation: `Вопрос пропущен (пропусков осталось: ${remainingSkips}). Правильный ответ: ${currentQuestion.correctAnswer || 'Не указан'}.${currentQuestion.explanation ? ` ${currentQuestion.explanation}` : ''}` 
      });
      setGameState('feedback');
    } else {
      // Prompt to buy 5 skips for 1 IIkr
      setIsBuyingSkips(true);
      try {
        const paid = await spendBalance(1, 'Покупка 5 пропусков для КвИИЗа', 'blitz_skips', currentQuestion.id);
        if (paid) {
          setSkipsLeft(4); // 5 purchased minus 1 used immediately
          if (currentQuestion.id) {
            fetch('/api/generated-questions/answer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: currentQuestion.id,
                pack_id: packId,
                question_index: currentIndex + 1,
                user_id: currentUserId,
                user_answer: 'Вопрос пропущен',
                is_correct: 0,
                is_skipped: 1
              })
            }).catch(() => {});
          }
          setShowCoinAnimation(true);
          setTimeout(() => setShowCoinAnimation(false), 1200);
          setFeedback({ 
            isCorrect: false, 
            explanation: `Куплено 5 пропусков за 1 ИИкру (осталось: 4). Вопрос пропущен. Правильный ответ: ${currentQuestion.correctAnswer || 'Не указан'}.${currentQuestion.explanation ? ` ${currentQuestion.explanation}` : ''}` 
          });
          setGameState('feedback');
        } else {
          setFeedback({ 
            isCorrect: false, 
            explanation: `Лимит 5 бесплатных пропусков исчерпан. Для дополнительных 5 пропусков требуется 1 ИИкра. Правильный ответ: ${currentQuestion.correctAnswer || 'Не указан'}.${currentQuestion.explanation ? ` ${currentQuestion.explanation}` : ''}` 
          });
          setGameState('feedback');
        }
      } finally {
        setIsBuyingSkips(false);
      }
    }
  };

  // 60-second question countdown with Auto-Pause on expiration (and pause during voice recognition)
  useEffect(() => {  
    if (gameState === 'playing' && timeLeft > 0 && !feedback && !checking && !isPaused && !isAutoPaused && !isVoiceActive) {
      if (timeLeft === 15) {
        audioSystem.playSlot('blitz_timer_tick');
      } else if (timeLeft === 5) {
        audioSystem.stopSlot('blitz_timer_tick');
        audioSystem.playSlot('blitz_timer_critical');
      }
      const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && gameState === 'playing' && !feedback && !checking && !isPaused && !isAutoPaused && !isVoiceActive) {
      // Auto-pause when 60 seconds expire
      audioSystem.stopSlot('blitz_timer_tick');
      audioSystem.stopSlot('blitz_timer_critical');
      audioSystem.playSlot('blitz_timer_expired');
      setIsAutoPaused(true);
    }
  }, [timeLeft, gameState, feedback, checking, isPaused, isAutoPaused, isVoiceActive]);

  if (gameState === 'setup') {
    return (
      <div className="mx-auto max-w-2xl space-y-8 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-2xl">
        <div className="text-center">
          <h2 className="text-4xl font-black tracking-tight text-primary">КвИИЗ</h2>
          <p className="mt-2 text-sm text-foreground/70">10 вопросов по 60 секунд. Текстовый ввод.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold tracking-normal text-primary">Тема игры</label>
            <input 
              type="text" 
              value={topic} 
              onChange={e => setTopic(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-primary/30 bg-transparent backdrop-blur-md p-4 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
            />
          </div>
          
          <div>
            <label className="text-sm font-bold tracking-normal text-primary">Сложность</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                { id: 'dummy', label: 'ИИкра (x1)' },
                { id: 'people', label: 'Головастик (x10)' },
                { id: 'genius', label: 'Квант (x100)' },
                { id: 'god', label: 'Ляга (x1000)' }
              ].map(d => (
                <LeafButton 
                  key={d.id}
                  variant={difficulty === d.id ? 'primary' : 'glass'}
                  size="md"
                  onClick={() => setDifficulty(d.id)}
                  className="w-full justify-center"
                >
                  {d.label}
                </LeafButton>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <LeafButton 
            variant="primary"
            size="lg"
            onClick={startLevel}
            className="w-full justify-center text-lg"
          >
            Начать игру (10 ИИкр)
          </LeafButton>
          
          {hasProgress && (
            <LeafButton 
              variant="outline"
              size="md"
              onClick={handleResume}
              disabled={loadingProgress}
              className="w-full justify-center"
            >
              {loadingProgress ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}
              Продолжить незавершенную игру
            </LeafButton>
          )}
        </div>
        <InsufficientBalanceModal
          isOpen={showInsufficientModal}
          onClose={() => setShowInsufficientModal(false)}
          requiredAmount={insufficientAmount}
          currentBalance={profile ? (profile.balance ?? 0) : demoBalance}
          actionDescription={insufficientReason}
        />
      </div>
    );
  }

  if (gameState === 'loading') {
    return <GenerationLoadingScreen gameId="blitz" title="Генерация КвИИЗа" onCancel={() => navigate('/')} />;
  }

  if (gameState === 'error') {
    return (
      <GameError 
        message={errorMessage || 'Не удалось сгенерировать вопросы. Попробуйте еще раз.'}
        onRetry={() => {
          setGameState('loading');
          startLevel();
        }}
        onReturn={() => navigate('/')}
      />
    );
  }

  // Step 4 of Multiplayer Flow: Waiting Lobby with Participant List, Square Webcam Windows, Group Chat & Host Start Button
  if (gameState === 'lobby') {
    const isLobbyHost = !mpRoomData?.host_id || String(mpRoomData.host_id) === String(currentUserId);
    const totalQuestionsCount = questions?.length || 10;

    return (
      <div className="mx-auto max-w-5xl space-y-6 text-foreground">
        {/* Lobby Header Card */}
        <div className="rounded-3xl border border-primary/35 bg-transparent backdrop-blur-2xl p-5 sm:p-6 shadow-2xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-primary/20 pb-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <BubbleElement isBadge active size="sm" icon={<Radio size={14} className="animate-pulse" />}>
                  <span>Лобби ожидания • КвИИз</span>
                </BubbleElement>
                <span className="text-sm font-mono text-foreground/60">ID: {mpRoomId}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-foreground">
                Тема: {topic} ({totalQuestionsCount} вопросов на скорость)
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <BubbleElement
                size="md"
                active
                onClick={() => setIsMpInviteOpen(true)}
                icon={<Share2 size={16} />}
              >
                <span>Пригласить в игру</span>
              </BubbleElement>

              <LeafButton
                variant="outline"
                size="sm"
                onClick={handleLeaveGameCompletely}
                icon={<LogOut size={16} className="text-rose-400" />}
                className="text-rose-400 border-rose-500/35 hover:border-rose-500/60"
                title="Покинуть игру и удалиться из списка участников"
              >
                <span>Выйти из игры</span>
              </LeafButton>

              <LeafButton
                variant="glass"
                size="sm"
                onClick={() => navigate('/profile/multiplayer')}
                icon={<XCircle size={16} className="text-primary" />}
                title="Закрыть лобби без удаления из участников"
              >
                <span>Закрыть</span>
              </LeafButton>
            </div>
          </div>

          {/* Start Game CTA for Lobby Creator vs "Готово" for Participants (Participant list is shown compactly under the webcam block below) */}
          <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-foreground/75">
                {isLobbyHost
                  ? 'Когда приглашенные участники нажмут «Готово», нажмите «Начать игру». Начнется обратный отсчёт от 5 до 1 на фоне пузыря, после чего откроется 1-й вопрос.'
                  : 'Нажмите «Готово», чтобы подтвердить участие. После того как создатель нажмёт «Начать игру», начнется обратный отсчёт от 5 до 1.'}
              </div>

              {isLobbyHost ? (
                <LeafButton
                  variant="primary"
                  size="lg"
                  onClick={handleStartMultiplayerGameFromLobby}
                  icon={<Play size={18} />}
                  className="w-full sm:w-auto justify-center shrink-0"
                >
                  <span>Начать игру</span>
                </LeafButton>
              ) : (
                <LeafButton
                  variant={
                    Number(mpParticipants.find(p => String(p.user_id) === String(currentUserId))?.is_ready) === 1
                      ? 'glass'
                      : 'primary'
                  }
                  size="lg"
                  onClick={handleToggleMultiplayerReady}
                  disabled={togglingMpReady}
                  icon={
                    togglingMpReady ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={18} />
                    )
                  }
                  className="w-full sm:w-auto justify-center shrink-0"
                >
                  <span>
                    {Number(mpParticipants.find(p => String(p.user_id) === String(currentUserId))?.is_ready) === 1
                      ? 'Вы готовы ✓'
                      : 'Готово'}
                  </span>
                </LeafButton>
              )}
            </div>
          </div>
        </div>

        <MultiplayerCountdownOverlay
          isOpen={showMpCountdown}
          gameTitle={`КвИИз: ${topic}`}
          subtitle="Обратный отсчёт перед 1-м вопросом..."
          onComplete={() => {
            setShowMpCountdown(false);
            setCurrentIndex(0);
            setTimeLeft(60);
            setHintRevealed(false);
            setGameState('playing');
          }}
        />

        {/* Square Webcam Windows of Participants in Lobby (up to 8) + Horizontal Waiting Bar below */}
        <MultiplayerGameWebcamStrip
          roomId={mpRoomId}
          gameId="blitz"
          gameTitle={`Лобби КвИИз: ${topic}`}
          currentUser={{
            uid: String(currentUserId),
            display_name: profile?.display_name || 'Игрок',
            avatar_url: profile?.avatar_url
          }}
          localRound={1}
          totalRounds={totalQuestionsCount}
          localScore={0}
          localCorrectCount={0}
          localIsFinished={false}
          isLobby={true}
          maxPlayers={Math.min(8, Math.max(2, Number(mpRoomData?.max_players || options?.maxPlayers) || 8))}
          onOpenInvite={() => setIsMpInviteOpen(true)}
          onRoomStateSync={handleRoomStateSync}
        />

        {/* Group Chat in Lobby */}
        <div className="h-[380px]">
          <GameChat
            title="Групповой чат лобби и игры"
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            currentUser={{
              id: String(currentUserId),
              name: profile?.display_name || 'Игрок',
              avatar: profile?.avatar_url
            }}
          />
        </div>

        <VideoInviteModal
          isOpen={isMpInviteOpen}
          onClose={() => setIsMpInviteOpen(false)}
          currentUser={{
            uid: String(currentUserId),
            display_name: profile?.display_name || 'Ведущий',
            avatar_url: profile?.avatar_url
          }}
          roomId={mpRoomId}
          roomTitle={`КвИИз: ${topic}`}
          roomType="blitz"
          gameId="blitz"
          invitePath={`/game/blitz?room=${mpRoomId}&pack=${packId}&mode=multi`}
        />

        <ZoomVideoModal
          isOpen={isMpZoomOpen}
          onClose={() => setIsMpZoomOpen(false)}
          currentUser={{
            uid: String(currentUserId),
            display_name: profile?.display_name || 'Ведущий',
            avatar_url: profile?.avatar_url
          }}
          roomId={mpRoomId}
          roomTitle={`Лобби КвИИз: ${topic}`}
          roomType="blitz"
          gameId="blitz"
          maxPlayers={Math.min(8, Math.max(2, Number(mpRoomData?.max_players || options?.maxPlayers) || 8))}
          onStartGame={handleStartMultiplayerGameFromLobby}
        />
      </div>
    );
  }

  if (gameState === 'result') {
    const totalQ = questions?.length || 10;
    const correctCount = Math.max(savedMpCorrectCount, (questions || []).filter(q => q.is_correct === 1).length);
    const incorrectCount = Math.max(0, totalQ - correctCount);
    const baseSingleScore = finalEarnedScore || scoreCalculation?.authoritativeScore || (correctCount * (scoringRule?.points_per_correct || getDifficultyMultiplier(difficulty) * 10));

    // Requirement 5: In multiplayer Blitz, rank primarily by correct_count, secondarily by speed (finish_time_ms)
    const rankedMpList = isMultiplayer && mpParticipants.length > 0
      ? mpParticipants.slice().sort((a, b) => {
          const aCorr = String(a.user_id) === String(currentUserId) ? Math.max(correctCount, Number(a.correct_count) || 0) : Number(a.correct_count) || 0;
          const bCorr = String(b.user_id) === String(currentUserId) ? Math.max(correctCount, Number(b.correct_count) || 0) : Number(b.correct_count) || 0;
          if (bCorr !== aCorr) return bCorr - aCorr;
          const aTime = a.finish_time_ms ?? Number.MAX_SAFE_INTEGER;
          const bTime = b.finish_time_ms ?? Number.MAX_SAFE_INTEGER;
          if (aTime !== bTime) return aTime - bTime;
          return (Number(b.score) || 0) - (Number(a.score) || 0);
        })
      : [];

    const isWin = isMultiplayer && rankedMpList.length > 1
      ? String(rankedMpList[0]?.user_id) === String(currentUserId) && correctCount > 0
      : correctCount >= 6;

    const myMpRecord = rankedMpList.find(p => String(p.user_id) === String(currentUserId));
    const mpMultiplier = Math.max(1, rankedMpList.length);
    const authoritativeScoreToDisplay = isMultiplayer
      ? myMpRecord?.awarded_score !== null && myMpRecord?.awarded_score !== undefined
        ? Number(myMpRecord.awarded_score)
        : isWin && mpRoomData?.status === 'finished'
        ? baseSingleScore * mpMultiplier
        : baseSingleScore
      : baseSingleScore;

    return (
      <div className="mx-auto max-w-4xl space-y-6">
      {isMultiplayer && (
        <MultiplayerGameWebcamStrip
          roomId={mpRoomId}
          gameId="blitz"
          gameTitle={`КвИИз: ${topic}`}
          currentUser={{
            uid: String(currentUserId),
            display_name: profile?.display_name || 'Игрок',
            avatar_url: profile?.avatar_url
          }}
          localRound={totalQ}
          totalRounds={totalQ}
          localScore={authoritativeScoreToDisplay}
          localCorrectCount={correctCount}
          localIsFinished={true}
          maxPlayers={Math.min(8, Math.max(2, Number(mpRoomData?.max_players || options?.maxPlayers) || 8))}
          onOpenInvite={() => setIsMpInviteOpen(true)}
          onOpenZoomModal={() => setIsMpZoomOpen(true)}
          onRoomStateSync={handleRoomStateSync}
        />
      )}
      <div className="mx-auto max-w-lg rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
        <div className="flex justify-center">
          {isWin ? (
            <BubbleElement active isBadge size="md" icon={<Trophy size={18} />}>
              Победа
            </BubbleElement>
          ) : (
            <BubbleElement isBadge size="md" icon={<XCircle size={18} className="text-amber-400" />}>
              Игра завершена
            </BubbleElement>
          )}
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-primary">КвИИз завершен!</h2>
          <p className="mt-2 text-sm text-foreground/75 leading-relaxed">
            {isMultiplayer && correctCount >= 7
              ? 'Вы набрали 7 и более верных ответов из 10 — игра моментально завершена у всех участников!'
              : isMultiplayer && mpRoomData?.status === 'active' && typeof mpRoomData?.finish_remaining_seconds === 'number' && correctCount < 7
              ? `Вы набрали менее 7 из 10 верных ответов. Включён 5-минутный таймер ожидания остальных участников (${Math.floor(mpRoomData.finish_remaining_seconds / 60)}:${String(mpRoomData.finish_remaining_seconds % 60).padStart(2, '0')}).`
              : isWin 
              ? 'Превосходная эрудиция и отличная скорость мышления!' 
              : 'Хорошая попытка! Тренируйтесь дальше, чтобы побеждать чаще.'
            }
          </p>
        </div>
        
        <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 sm:p-5 space-y-3.5 text-left">
          <div className="space-y-1">
            <span className="text-sm font-bold text-primary/85 block">Условие победы:</span>
            <p className="text-sm text-foreground/90 font-medium leading-relaxed">
              {isMultiplayer
                ? 'В первую очередь учитывается количество правильных ответов из 10, во вторую — скорость. При 7+ правильных ответах игра завершается у всех досрочно; иначе включается таймер 5 минут для остальных.'
                : 'Дать не менее 6 правильных ответов из 10 вопросов раунда.'}
            </p>
          </div>

          <div className="pt-2 border-t border-primary/15 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-primary/20 bg-transparent p-3">
              <span className="text-sm font-semibold text-foreground/70 block">Правильных ответов:</span>
              <span className="text-xl font-extrabold text-primary">{correctCount} из {totalQ}</span>
            </div>
            <div className="rounded-xl border border-primary/20 bg-transparent p-3">
              <span className="text-sm font-semibold text-foreground/70 block">Неправильных:</span>
              <span className="text-xl font-extrabold text-amber-300">{incorrectCount} из {totalQ}</span>
            </div>
          </div>

          {isMultiplayer && rankedMpList.length > 0 && (
            <div className="pt-3 border-t border-primary/15 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-primary">Рейтинг участников мультиплеера:</span>
                <span className="text-sm font-semibold text-foreground/75">
                  {mpRoomData?.status === 'finished'
                    ? `Очки начислены (победителю ×${mpMultiplier})`
                    : `Начисление после финиша всех (победителю ×${mpMultiplier})`}
                </span>
              </div>
              {rankedMpList.map((p, idx) => {
                const isMe = String(p.user_id) === String(currentUserId);
                const pCorr = isMe ? Math.max(correctCount, Number(p.correct_count) || 0) : Number(p.correct_count) || 0;
                const pScore = p.awarded_score !== null && p.awarded_score !== undefined
                  ? Number(p.awarded_score)
                  : isMe
                  ? Math.max(authoritativeScoreToDisplay, Number(p.score) || 0)
                  : Number(p.score) || 0;
                const sec = p.finish_time_ms ? Math.round(p.finish_time_ms / 1000) : null;
                return (
                  <div
                    key={`mp-res-${p.id || idx}`}
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-2xl border text-sm ${
                      idx === 0 ? 'border-primary/60 text-primary font-bold' : 'border-primary/20 text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span>#{idx + 1}</span>
                      <span className="truncate">{p.display_name || 'Игрок'} {isMe ? '(вы)' : ''}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span>Верных: {pCorr}/{totalQ}</span>
                      {sec !== null && <span>{sec}с</span>}
                      <span>
                        {pScore} очк. {mpRoomData?.status === 'finished' && idx === 0 && mpMultiplier > 1 ? `(×${mpMultiplier})` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Authoritative Score Calculation Card with full transparent breakdown */}
        <ScoreCalculationCard 
          score={authoritativeScoreToDisplay}
          calculation={scoreCalculation}
          gameTitle="КвИИз"
          isWin={isWin}
        />

        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 pt-2">
          {isMultiplayer && mpRoomId && (
            <LeafButton
              variant="primary"
              size="md"
              onClick={() => navigate(`/multiplayer/room/${mpRoomId}`)}
            >
              Лобби и результаты
            </LeafButton>
          )}
          <LeafButton 
            variant="primary"
            size="md"
            onClick={async () => {
              if (packId) {
                await deleteGameProgress(currentUserId, packId, 'blitz');
                await fetch(`/api/game-packs/${packId}/play`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: currentUserId, is_replay: true })
                }).catch(() => {});
              }
              window.location.reload();
            }}
          >
            Сыграть еще
          </LeafButton>
          <LeafButton 
            variant="glass"
            size="md"
            onClick={() => navigate('/profile/history')}
          >
            История сессий
          </LeafButton>
          <LeafButton 
            variant="glass"
            size="md"
            onClick={() => navigate('/')}
          >
            На главную
          </LeafButton>
        </div>
      </div>
      {isMultiplayer && (
        <div className="h-[360px]">
          <GameChat
            title="Групповой чат игры"
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            currentUser={{
              id: String(currentUserId),
              name: profile?.display_name || 'Игрок',
              avatar: profile?.avatar_url
            }}
          />
        </div>
      )}
      </div>
    );
  }

  const currentQuestion = (questions && questions[currentIndex]) || { text: '', correctAnswer: '', hint: '', explanation: '' };

  const difficultyNames: Record<string, string> = {
    'dummy': 'ИИкра',
    'people': 'Головастик',
    'genius': 'Квант',
    'god': 'Ляга'
  };

  const localCorrectCount = Math.max(savedMpCorrectCount, (questions || []).filter((q) => q.is_correct === 1).length);
  const localPointsEstimate = localCorrectCount * (scoringRule?.points_per_correct || getDifficultyMultiplier(difficulty) * 10);

  return (
    <div className={`mx-auto ${isMultiplayer ? 'max-w-7xl' : 'max-w-5xl'} space-y-5 text-foreground`}>
      <CoinAnimation show={showCoinAnimation} />
      <MultiplayerCountdownOverlay
        isOpen={showMpCountdown}
        gameTitle={`КвИИз: ${topic}`}
        subtitle="Обратный отсчёт перед 1-м вопросом..."
        onComplete={() => {
          setShowMpCountdown(false);
          setGameState('playing');
        }}
      />

      {/* Requirement 3: Desktop = Question + Webcams (4 per row) & Compact Progress on Left, Compact Vertical Chat on Right.
          Mobile = Question -> Webcams (2 per row) & Compact Progress -> Chat at the bottom */}
      <div className="flex flex-col lg:flex-row items-start gap-5">
        <div className="flex-1 min-w-0 w-full space-y-5">
          {/* Top Header Bar: Exit, Pause, Topic & Timer */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl p-3.5 shadow-lg">
            <div className="flex flex-wrap items-center gap-2">
              {isMultiplayer && (
                <LeafButton
                  variant="outline"
                  size="sm"
                  onClick={handleLeaveGameCompletely}
                  className="text-rose-400 border-rose-500/35 hover:border-rose-500/60"
                  title="Покинуть игру и удалиться из списка участников"
                >
                  <LogOut size={16} className="text-rose-400 mr-1.5" />
                  <span>Выйти из игры</span>
                </LeafButton>
              )}

              <LeafButton
                variant="glass"
                size="sm"
                onClick={handleExitGame}
                title={isMultiplayer ? 'Закрыть и сохранить прогресс без удаления из участников' : 'Выйти и сохранить прогресс'}
              >
                <XCircle size={16} className="text-primary mr-1.5" />
                <span>{isMultiplayer ? 'Закрыть' : 'Выйти из игры'}</span>
              </LeafButton>

              <LeafButton
                variant={isPaused ? 'primary' : 'glass'}
                size="sm"
                onClick={() => setIsPaused(!isPaused)}
              >
                {isPaused ? <Play size={16} className="mr-1.5" /> : <Pause size={16} className="mr-1.5 text-primary" />}
                <span>{isPaused ? 'Возобновить' : 'Пауза'}</span>
              </LeafButton>
            </div>

            <div className="flex items-center gap-3">
              <BubbleElement className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-primary">
                <HelpCircle size={15} />
                <span className="max-w-[140px] truncate">{topic}</span>
              </BubbleElement>

              <BubbleElement className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-primary">
                <Zap size={15} />
                <span>{difficultyNames[difficulty] || difficulty}</span>
              </BubbleElement>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-sm font-bold text-foreground/60">Вопрос </span>
                <span className="text-base font-black text-primary">{currentIndex + 1}/10</span>
              </div>

              <BubbleElement className={`flex items-center gap-1.5 px-3.5 py-1.5 font-bold ${
                isVoiceActive
                  ? 'text-amber-300 border border-amber-400/40 bg-amber-500/10'
                  : timeLeft <= 10 
                  ? 'text-rose-400 border border-rose-500/40 animate-pulse' 
                  : 'text-primary'
              }`}>
                <Timer size={16} className={isVoiceActive ? 'animate-pulse text-amber-300' : ''} />
                <span className="text-base font-black">{timeLeft}с</span>
                {isVoiceActive && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-bold ml-1">
                    пауза (голос)
                  </span>
                )}
              </BubbleElement>
            </div>
          </div>

          {/* Main Question Card with Apple Liquid Glass styling */}
          <div className="relative rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            {/* Question Text */}
            <div className="min-h-[100px] flex items-center">
              <h3 className="text-lg sm:text-xl font-extrabold leading-relaxed text-foreground">
                {currentQuestion.text}
              </h3>
            </div>

            {/* Action Controls: Hint & Skip / Don't Know */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-primary/20">
              <div className="flex items-center gap-2">
                {!hintRevealed ? (
                  <LeafButton
                    variant="glass"
                    size="sm"
                    onClick={handleBuyHint}
                    disabled={isBuyingHint || checking || gameState !== 'playing'}
                  >
                    {isBuyingHint ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Lightbulb size={15} className="text-primary mr-1.5" />}
                    <span>Подсказка (-1 ИИкра)</span>
                  </LeafButton>
                ) : (
                  <BubbleElement className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-amber-300 border-amber-500/40">
                    <Lightbulb size={15} />
                    <span>Подсказка: {currentQuestion.hint || 'Внимательно читайте вопрос!'}</span>
                  </BubbleElement>
                )}
              </div>

              <div className="flex items-center gap-2">
                <LeafButton
                  variant="outline"
                  size="sm"
                  onClick={handleDontKnowAnswer}
                  disabled={isBuyingSkips || checking || gameState !== 'playing'}
                  className="text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                >
                  <span>Не знаю ответ</span>
                </LeafButton>

                <LeafButton
                  variant="glass"
                  size="sm"
                  onClick={handleSkipQuestion}
                  disabled={isBuyingSkips || checking || gameState !== 'playing'}
                >
                  {isBuyingSkips ? (
                    <Loader2 size={14} className="animate-spin text-primary mr-1.5" />
                  ) : skipsLeft > 0 ? (
                    <>
                      <FastForward size={15} className="text-primary mr-1.5" />
                      <span>Пропустить ({skipsLeft} ост.)</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag size={15} className="text-primary mr-1.5" />
                      <span>Купить 5 пропусков (1 ИИкра)</span>
                    </>
                  )}
                </LeafButton>
              </div>
            </div>

            {/* Answer Input Section */}
            <div className="space-y-2 pt-2">
              <label className="text-sm font-bold text-primary">Ваш ответ</label>
              <div className="flex items-center gap-3">
                <input 
                  type="text" 
                  value={userAnswer} 
                  onChange={e => setUserAnswer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNext()}
                  disabled={checking || gameState !== 'playing' || isPaused}
                  placeholder="Введите ответ..."
                  className="flex-1 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-md p-4 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-all min-w-0"
                  autoFocus
                />
                <VoiceInputBubble
                  onTranscript={(text) => setUserAnswer(text)}
                  onActiveChange={setIsVoiceActive}
                  disabled={checking || gameState !== 'playing' || isPaused}
                  currentValue={userAnswer}
                  size="md"
                  tooltip="🎤 Начать запись"
                />
                <LeafButton 
                  variant="primary"
                  size="md"
                  onClick={handleNext}
                  disabled={checking || !userAnswer.trim() || gameState !== 'playing' || isPaused}
                  className="h-14 w-14 p-0 flex items-center justify-center shrink-0"
                  title="Отправить ответ"
                >
                  {checking ? <Loader2 className="animate-spin" /> : <Send size={22} />}
                </LeafButton>
              </div>
            </div>
          </div>

          {/* Requirement 3: Square Webcam Avatars (4 per row on PC, 2 per row on mobile) + Compact Progress right below the Answer Input button */}
          {isMultiplayer && (
            <MultiplayerGameWebcamStrip
              roomId={mpRoomId}
              gameId="blitz"
              gameTitle={`КвИИз: ${topic}`}
              currentUser={{
                uid: String(currentUserId),
                display_name: profile?.display_name || 'Игрок',
                avatar_url: profile?.avatar_url
              }}
              localRound={currentIndex + 1}
              totalRounds={questions?.length || 10}
              localScore={localPointsEstimate}
              localCorrectCount={localCorrectCount}
              localIsFinished={false}
              isLobby={false}
              maxPlayers={Math.min(8, Math.max(2, Number(mpRoomData?.max_players || options?.maxPlayers) || 8))}
              onOpenInvite={() => setIsMpInviteOpen(true)}
              onRoomStateSync={handleRoomStateSync}
            />
          )}
        </div>

        {/* Requirement 3: Compact Vertical Chat to the right of Question Block on PC, and below Webcams on Mobile */}
        {isMultiplayer && (
          <div className="w-full lg:w-80 xl:w-88 shrink-0 h-[400px] lg:h-[640px] lg:sticky lg:top-4">
            <GameChat
              compact
              title="Чат игры"
              messages={chatMessages}
              onSendMessage={handleSendMessage}
              currentUser={{
                id: String(currentUserId),
                name: profile?.display_name || 'Игрок',
                avatar: profile?.avatar_url
              }}
            />
          </div>
        )}
      </div>

      {/* Manual Pause Overlay Modal */}
      <AnimatePresence>
        {isPaused && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4"
          >
            <div className="w-full max-w-md rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 text-center space-y-6 shadow-2xl">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-transparent border border-primary/30 backdrop-blur-md flex items-center justify-center text-primary">
                  <Pause size={32} />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-black text-primary">Игра на паузе</h3>
                <p className="text-sm text-foreground/70 mt-1">Таймер остановлен. Прогресс сохранен.</p>
              </div>

              <div className="space-y-3 pt-2">
                <LeafButton
                  variant="primary"
                  size="md"
                  onClick={() => setIsPaused(false)}
                  className="w-full justify-center"
                >
                  Продолжить игру
                </LeafButton>
                {isMultiplayer && (
                  <LeafButton
                    variant="outline"
                    size="md"
                    onClick={handleLeaveGameCompletely}
                    className="w-full justify-center text-rose-400 border-rose-500/35 hover:border-rose-500/60"
                  >
                    Выйти из игры
                  </LeafButton>
                )}
                <LeafButton
                  variant="glass"
                  size="md"
                  onClick={handleExitGame}
                  className="w-full justify-center"
                >
                  {isMultiplayer ? 'Закрыть' : 'Выйти из игры'}
                </LeafButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auto-Pause on 60s Expiration Modal */}
      <AnimatePresence>
        {isAutoPaused && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4"
          >
            <div className="w-full max-w-md rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 text-center space-y-6 shadow-2xl">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-transparent border border-amber-500/30 backdrop-blur-md flex items-center justify-center text-amber-400">
                  <Timer size={32} />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-amber-400">Время вышло (60с)</h3>
                <p className="text-sm text-foreground/70 mt-1">Игра автоматически поставлена на паузу.</p>
              </div>

              <div className="space-y-3 pt-2">
                {userAnswer.trim() && (
                  <LeafButton
                    variant="primary"
                    size="md"
                    onClick={() => {
                      setIsAutoPaused(false);
                      handleNext();
                    }}
                    className="w-full justify-center"
                  >
                    Проверить введенный ответ
                  </LeafButton>
                )}
                <LeafButton
                  variant="outline"
                  size="md"
                  onClick={handleDontKnowAnswer}
                  className="w-full justify-center text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                >
                  Не знаю ответ
                </LeafButton>
                <LeafButton
                  variant="glass"
                  size="md"
                  onClick={() => {
                    setIsAutoPaused(false);
                    handleSkipQuestion();
                  }}
                  className="w-full justify-center"
                >
                  Пропустить вопрос
                </LeafButton>
                <LeafButton
                  variant="outline"
                  size="sm"
                  onClick={handleExitGame}
                  className="w-full justify-center"
                >
                  Сохранить и выйти
                </LeafButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Answer Checking Modal */}
      <CheckingAnswerModal
        isOpen={checking}
        timerSeconds={checkTimer}
        showTimeoutActions={isCheckTimedOut}
        onRetry={() => handleNext()}
        onSkip={() => {
          stopCheckTimer();
          setChecking(false);
          setFeedback({ isCorrect: false, explanation: 'Проверка пропущена пользователем.' });
          setGameState('feedback');
        }}
      />

      {/* Feedback Overlay */}
      <AnimatePresence>
        {gameState === 'feedback' && feedback && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-lg rounded-3xl border border-primary/30 bg-background/25 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.37)]"
            >
              <div className="flex flex-col items-center text-center">
                {feedback.isCorrect ? (
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-transparent border border-green-500/40 text-green-400 backdrop-blur-md">
                    <CheckCircle2 size={40} />
                  </div>
                ) : (
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-transparent border border-rose-500/40 text-rose-400 backdrop-blur-md">
                    <XCircle size={40} />
                  </div>
                )}
                
                <h3 className={`text-2xl font-black ${feedback.isCorrect ? 'text-green-400' : 'text-rose-400'}`}>
                  {feedback.isCorrect ? 'Верно!' : 'Неверно!'}
                </h3>
                
                <div className="mt-4 max-h-48 overflow-y-auto pr-2 text-sm leading-relaxed text-foreground/80 font-medium">
                  {feedback.explanation}
                </div>

                <div className="mt-6 w-full">
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
      </AnimatePresence>

      {isMultiplayer && (
        <>
          <VideoInviteModal
            isOpen={isMpInviteOpen}
            onClose={() => setIsMpInviteOpen(false)}
            currentUser={{
              uid: String(currentUserId),
              display_name: profile?.display_name || 'Ведущий',
              avatar_url: profile?.avatar_url
            }}
            roomId={mpRoomId}
            roomTitle={`КвИИз: ${topic}`}
            roomType="blitz"
            gameId="blitz"
            invitePath={`/game/blitz?room=${mpRoomId}&pack=${packId}&mode=multi`}
          />
          <ZoomVideoModal
            isOpen={isMpZoomOpen}
            onClose={() => setIsMpZoomOpen(false)}
            currentUser={{
              uid: String(currentUserId),
              display_name: profile?.display_name || 'Ведущий',
              avatar_url: profile?.avatar_url
            }}
            roomId={mpRoomId}
            roomTitle={`Лобби КвИИз: ${topic}`}
            roomType="blitz"
            gameId="blitz"
          />
        </>
      )}
      <InsufficientBalanceModal
        isOpen={showInsufficientModal}
        onClose={() => setShowInsufficientModal(false)}
        requiredAmount={insufficientAmount}
        currentBalance={profile ? (profile.balance ?? 0) : demoBalance}
        actionDescription={insufficientReason}
      />
    </div>
  );
}
