import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { protalkService } from '../services/protalk';
import { balanceService } from '../services/balanceService';
import { CoinAnimation } from '../components/CoinAnimation';
import { HelpCircle, Zap, AlertCircle, CheckCircle2, X, Send, Loader2, RotateCcw, Trophy, Sparkles, Lightbulb, Flag, ArrowRight, Eye, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { saveGameSession, saveGameProgress, getGameProgress, deleteGameProgress } from '../db';
import { GameError } from '../components/GameError';
import { GenerationLoadingScreen } from '../components/GenerationLoadingScreen';
import { CheckingAnswerModal } from '../components/CheckingAnswerModal';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { VoiceInputBubble } from '../components/ui/VoiceInputBubble';
import { MultiplayerCountdownOverlay } from '../components/ui/MultiplayerCountdownOverlay';
import { getRandomCheckSeconds, runSimulatedCheckCountdown, startAICheckCountdown } from '../utils/answerVerification';
import { GameChat, ChatMessage, ChatMessageAttachment } from '../components/GameChat';
import { AI_TEMPLATES } from '../lib/gameHelpers';
import { ScoreCalculationCard } from '../components/ScoreCalculationCard';
import { InsufficientBalanceModal } from '../components/InsufficientBalanceModal';
import { fetchGameScoringRule, GameScoringRule, calculateAuthoritativeScoreClient, ScoreCalculationResult } from '../utils/gameScoring';
import { VideoInviteModal } from '../components/video/VideoInviteModal';
import { ZoomVideoModal } from '../components/ZoomVideoModal';
import { MultiplayerGameWebcamStrip, MultiplayerParticipantInfo } from '../components/video/MultiplayerGameWebcamStrip';
import { UserAvatar } from '../components/UserAvatar';
import { Users, Video, Play, Share2, Timer } from 'lucide-react';
import { audioSystem } from '../hooks/useSound';

interface Answer {
  text: string;
  points: number;
  revealed: boolean;
  revealedBy?: 'player' | 'host';
  hint?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
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

interface UnlockedHint {
  index: number;
  position: number;
  hint: string;
  points: number;
}

interface CompletedRound {
  round: number;
  roundTitle: string;
  question: string;
  answers: Answer[];
  mistakes: number;
  scoreEarned: number;
  unlockedHints: UnlockedHint[];
  isWin: boolean;
}

const ROUND_NAMES: Record<number, string> = {
  1: 'Простая игра',
  2: 'Двойная игра',
  3: 'Тройная игра',
  4: 'Игра наоборот'
};

export const REVERSE_ROUND_POINTS: Record<number, number> = {
  0: 15,  // 1-я строка (самый популярный) — 15 очков
  1: 30,  // 2-я строка — 30 очков
  2: 60,  // 3-я строка — 60 очков
  3: 120, // 4-я строка — 120 очков
  4: 180, // 5-я строка — 180 очков
  5: 240  // 6-я строка (самый непопулярный) — 240 очков
};

export function getRoundAnswerPoints(roundNum: number, answerIndex: number, originalPoints: number = 0): number {
  if (roundNum === 4) {
    return REVERSE_ROUND_POINTS[answerIndex] ?? 240;
  }
  const multiplier = roundNum === 2 ? 2 : roundNum === 3 ? 3 : 1;
  return (originalPoints || 0) * multiplier;
}

export function OneHundredToOneGame() {
  const { profile, user, demoBalance, openDemoExhaustedModal, refetchProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlRoomId = searchParams.get('room') || undefined;
  const urlPackId = searchParams.get('pack') || undefined;
  const urlMode = searchParams.get('mode') || undefined;
  const rawLocationState = (location.state as any) || {};
  const isMultiFromUrlOrState =
    urlMode === 'multi' ||
    Boolean(urlRoomId) ||
    rawLocationState.playMode === 'multi' ||
    rawLocationState.mode === 'multi' ||
    Boolean(rawLocationState.mpRoomId || rawLocationState.roomId);
  const options = {
    mode: rawLocationState.mode || 'lite',
    difficulty: rawLocationState.difficulty || 'people',
    price: rawLocationState.price ?? 40,
    ...rawLocationState,
    playMode: isMultiFromUrlOrState ? 'multi' : (rawLocationState.playMode || 'single'),
    mpRoomId: rawLocationState.mpRoomId || rawLocationState.roomId || urlRoomId,
    roomId: rawLocationState.roomId || rawLocationState.mpRoomId || urlRoomId,
    packId: rawLocationState.packId || urlPackId
  };

  const effectiveUserId = profile?.uid || (user ? String((user as any).id || (user as any).uid) : '') || localStorage.getItem('qaiz_active_user_id') || '10016926299';
  
  // Stable packId derivation to prevent DB bloat across re-renders
  const [currentPackId, setCurrentPackId] = useState<string>(() => {
    if (options.packId || urlPackId) return options.packId || urlPackId;
    const sessionKey = `100to1_active_pack_${effectiveUserId}`;
    const stored = sessionStorage.getItem(sessionKey);
    if (stored) return stored;
    const newId = `100to1_${Date.now()}`;
    sessionStorage.setItem(sessionKey, newId);
    return newId;
  });
  
  const [gameState, setGameState] = useState<'setup' | 'loading' | 'mp_lobby' | 'playing' | 'round_completed' | 'feedback' | 'result' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [topic, setTopic] = useState(options.topic || 'Общие знания');
  const [round, setRound] = useState(1);
  const [viewingRound, setViewingRound] = useState<number | null>(null);

  const normalizeTwoTeams = useCallback((raw?: Player[]): Player[] => {
    const score1 = Number(raw?.[0]?.score) || 0;
    const score2 = Number(raw?.[1]?.score) || 0;
    if (options.playMode === 'ai') {
      const aiTemplate = options.aiOpponents?.[0]
        ? AI_TEMPLATES.find((t: any) => t.id === options.aiOpponents[0])
        : null;
      return [
        { id: '1', name: 'Команда 1', score: score1, isBot: false },
        {
          id: 'bot-0',
          name: aiTemplate ? `Команда 2 (${aiTemplate.name})` : 'Команда 2 (Кибер-Жаба)',
          score: score2,
          isBot: true,
          avatar: aiTemplate?.avatar,
          personality: aiTemplate?.personality,
          difficulty: aiTemplate?.difficulty
        }
      ];
    }
    return [
      { id: '1', name: 'Команда 1', score: score1, isBot: false },
      { id: '2', name: 'Команда 2', score: score2, isBot: false }
    ];
  }, [options.playMode, options.aiOpponents]);

  const [players, setPlayers] = useState<Player[]>(() => normalizeTwoTeams());

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [question, setQuestion] = useState<string>('');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkTimer, setCheckTimer] = useState(0);
  const [isCheckTimedOut, setIsCheckTimedOut] = useState(false);
  const [checkInterval, setCheckInterval] = useState<any>(null);
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);

  // Accumulated AI hints
  const [unlockedHints, setUnlockedHints] = useState<UnlockedHint[]>([]);
  const [showAiHintModal, setShowAiHintModal] = useState(false);
  const [allHintsExhaustedModal, setAllHintsExhaustedModal] = useState(false);
  const [isGeneratingHint, setIsGeneratingHint] = useState(false);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [insufficientReason, setInsufficientReason] = useState('');
  const [insufficientAmount, setInsufficientAmount] = useState(1);

  // Completed rounds history for review
  const [completedRoundsHistory, setCompletedRoundsHistory] = useState<CompletedRound[]>([]);

  // Surrender & Cascade state
  const [showSurrenderModal, setShowSurrenderModal] = useState(false);
  const [isSurrendering, setIsSurrendering] = useState(false);
  const [cascadeReason, setCascadeReason] = useState<'surrender' | 'mistakes' | 'skip'>('surrender');
  const [surrenderIndex, setSurrenderIndex] = useState<number | null>(null);
  const [surrenderCountdown, setSurrenderCountdown] = useState<number>(0);
  const surrenderIntervalRef = useRef<any>(null);

  // Per-team mistakes, surrender flags, round base scores, and 60s multiplayer turn timer
  const [teamMistakes, setTeamMistakes] = useState<[number, number]>([0, 0]);
  const [teamSurrendered, setTeamSurrendered] = useState<[boolean, boolean]>([false, false]);
  const [roundBaseScores, setRoundBaseScores] = useState<[number, number]>([0, 0]);
  const [mpTurnDeadline, setMpTurnDeadline] = useState<number>(() => Date.now() + 60000);
  const [mpTurnTimeLeft, setMpTurnTimeLeft] = useState<number>(60);
  const timeoutHandledDeadlineRef = useRef<number>(0);
  const [scoringRule, setScoringRule] = useState<GameScoringRule | null>(null);
  const [scoreCalculation, setScoreCalculation] = useState<ScoreCalculationResult | null>(null);
  const [authoritativeScore, setAuthoritativeScore] = useState<number>(0);

  const [feedback, setFeedback] = useState<{ isCorrect: boolean; explanation: string; points?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const [roundsData, setRoundsData] = useState<any[]>([]);

  // Multiplayer lobby & invite modal state (declared BEFORE any useEffect that references mpParticipants!)
  const existingMpRoomId = options?.mpRoomId || options?.roomId || urlRoomId || undefined;
  const [mpRoomId] = useState<string>(() => existingMpRoomId || `mproom_100to1_${Date.now().toString(36)}`);
  const [mpRoomData, setMpRoomData] = useState<any>(null);
  const [mpParticipants, setMpParticipants] = useState<MultiplayerParticipantInfo[]>([]);
  const [isMpInviteOpen, setIsMpInviteOpen] = useState(false);
  const [isMpZoomOpen, setIsMpZoomOpen] = useState(false);
  const [showMpCountdown, setShowMpCountdown] = useState(false);
  const [togglingMpReady, setTogglingMpReady] = useState(false);
  const mpCountdownShownRef = useRef(false);
  const mpInviteTriggeredRef = useRef(false);

  useEffect(() => {
    fetchGameScoringRule('100to1', options?.difficulty || 'normal').then(rule => {
      if (rule) setScoringRule(rule);
    });
  }, [options?.difficulty]);

  useEffect(() => {
    if (gameState === 'result' && !scoreCalculation) {
      const myMpPart = mpParticipants.find(p => String(p.user_id) === String(effectiveUserId));
      const myTeamIdx = Number(myMpPart?.team_number) === 2 ? 1 : 0;
      const uScore = players[myTeamIdx]?.score || 0;
      const bScore = players[myTeamIdx === 0 ? 1 : 0]?.score || 0;
      const isWin = uScore >= bScore && uScore > 0;
      calculateAuthoritativeScoreClient({
        gameId: '100to1',
        difficulty: options?.difficulty || 'normal',
        score: uScore,
        rawScore: uScore,
        totalQuestions: 4,
        correctAnswers: isWin ? 3 : 1,
        isWin,
        mode: options?.mode
      }).then(res => {
        if (res) {
          setScoreCalculation(res);
          setAuthoritativeScore(res.authoritativeScore);
        }
      });
    }
  }, [gameState, scoreCalculation, players, mpParticipants, effectiveUserId, options?.difficulty, options?.mode]);

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

  const triggerMpCountdownAndOpenTour1 = useCallback(() => {
    const initialDeadline = Date.now() + 65000;
    setTeamMistakes([0, 0]);
    setTeamSurrendered([false, false]);
    setRoundBaseScores([0, 0]);
    setMpTurnDeadline(initialDeadline);
    setMpTurnTimeLeft(60);
    if (mpCountdownShownRef.current) {
      setGameState('playing');
      return;
    }
    mpCountdownShownRef.current = true;
    setShowMpCountdown(true);
  }, []);

  const mpVisibility: 'public' | 'private' =
    options?.visibility === 'private' || options?.visibility === 'closed' ? 'private' : 'public';
  const mpMaxPlayers: number = Math.min(
    8,
    Math.max(
      2,
      Number(mpRoomData?.max_players) ||
        Number(options?.maxPlayers) ||
        Number(options?.participantsCount) ||
        8
    )
  );
  const lastTeamSyncAtRef = useRef<number>(0);

  const pushTeamGameStateToServer = useCallback(
    async (override: Partial<{
      round: number;
      question: string;
      answers: Answer[];
      mistakes: number;
      team1_mistakes: number;
      team2_mistakes: number;
      team1_surrendered: boolean;
      team2_surrendered: boolean;
      round_base_scores: [number, number];
      turn_deadline: number;
      is_cascading: boolean;
      cascade_reason: 'surrender' | 'mistakes' | 'skip';
      active_team: number;
      team1_score: number;
      team2_score: number;
    }> = {}) => {
      if ((options?.playMode !== 'multi' && !existingMpRoomId) || !mpRoomId) return;
      const nowTs = Date.now();
      lastTeamSyncAtRef.current = nowTs;
      try {
        await fetch(`/api/multiplayer/rooms/${mpRoomId}/team-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(effectiveUserId),
            round: override.round ?? round,
            question: override.question ?? question,
            answers: override.answers ?? answers,
            mistakes: override.mistakes ?? mistakes,
            team1_mistakes: typeof override.team1_mistakes === 'number' ? override.team1_mistakes : teamMistakes[0],
            team2_mistakes: typeof override.team2_mistakes === 'number' ? override.team2_mistakes : teamMistakes[1],
            team1_surrendered: typeof override.team1_surrendered === 'boolean' ? override.team1_surrendered : teamSurrendered[0],
            team2_surrendered: typeof override.team2_surrendered === 'boolean' ? override.team2_surrendered : teamSurrendered[1],
            round_base_scores: override.round_base_scores ?? roundBaseScores,
            turn_deadline: override.turn_deadline ?? mpTurnDeadline,
            is_cascading: typeof override.is_cascading === 'boolean' ? override.is_cascading : isSurrendering,
            cascade_reason: override.cascade_reason ?? cascadeReason,
            active_team: override.active_team ?? (currentPlayerIndex % 2 === 1 ? 2 : 1),
            team1_score: override.team1_score ?? (players[0]?.score || 0),
            team2_score: override.team2_score ?? (players[1]?.score || 0),
            updated_at: nowTs
          })
        });
      } catch (_) {}
    },
    [
      options?.playMode,
      existingMpRoomId,
      mpRoomId,
      effectiveUserId,
      round,
      question,
      answers,
      mistakes,
      teamMistakes,
      teamSurrendered,
      roundBaseScores,
      mpTurnDeadline,
      isSurrendering,
      cascadeReason,
      currentPlayerIndex,
      players
    ]
  );

  const handleSetMpTeam = async (targetUserId: string, teamNumber: 1 | 2) => {
    if (!mpRoomId) return;
    try {
      const res = await fetch(`/api/multiplayer/rooms/${mpRoomId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: targetUserId,
          team_number: teamNumber,
          actor_id: String(effectiveUserId)
        })
      });
      const json = await res.json().catch(() => null);
      if (Array.isArray(json?.participants)) {
        setMpParticipants(json.participants);
      }
    } catch (_) {}
  };

  const handleDistributeMpTeams = async () => {
    if (!mpRoomId) return;
    try {
      const res = await fetch(`/api/multiplayer/rooms/${mpRoomId}/distribute-teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: String(effectiveUserId) })
      });
      const json = await res.json().catch(() => null);
      if (Array.isArray(json?.participants)) {
        setMpParticipants(json.participants);
      }
    } catch (_) {}
  };

  const registerMultiplayerLobbyRoom = useCallback(async () => {
    if (options?.playMode !== 'multi' || mpInviteTriggeredRef.current) return;
    mpInviteTriggeredRef.current = true;
    try {
      const res = await fetch('/api/multiplayer/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mpRoomId,
          game_id: '100to1',
          game_title: 'Сто Квадному',
          host_id: String(effectiveUserId),
          host_name: profile?.display_name || 'Ведущий',
          host_avatar: profile?.avatar_url || null,
          topic: topic || 'Общие знания',
          difficulty: options?.difficulty || 'people',
          question_count: 24,
          pack_id: currentPackId,
          visibility: mpVisibility,
          max_players: mpMaxPlayers,
          settings_json: {
            visibility: mpVisibility,
            max_players: mpMaxPlayers
          }
        })
      });
      const rJson = await res.json().catch(() => null);
      if (rJson?.room) setMpRoomData(rJson.room);
    } catch (_) {}
    if (!existingMpRoomId) {
      setIsMpInviteOpen(true);
    }
  }, [options?.playMode, mpRoomId, effectiveUserId, profile?.display_name, profile?.avatar_url, topic, options?.difficulty, currentPackId, existingMpRoomId, mpVisibility, mpMaxPlayers]);

  const handleToggleMpReady = async () => {
    if (!mpRoomId || togglingMpReady) return;
    const myPart = mpParticipants.find(p => String(p.user_id) === String(effectiveUserId));
    const nextReady = Number(myPart?.is_ready) === 1 ? 0 : 1;
    setTogglingMpReady(true);
    try {
      await fetch(`/api/multiplayer/rooms/${mpRoomId}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: String(effectiveUserId),
          display_name: profile?.display_name || 'Игрок 1',
          is_ready: nextReady
        })
      });
    } catch (_) {
    } finally {
      setTogglingMpReady(false);
    }
  };

  const handleStartMpGameFromLobby = async () => {
    const isCreator = !mpRoomData?.host_id || String(mpRoomData.host_id) === String(effectiveUserId);
    if (!isCreator) return;
    try {
      await fetch(`/api/multiplayer/rooms/${mpRoomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' })
      });
    } catch (_) {}
    await pushTeamGameStateToServer({
      round: 1,
      question,
      answers,
      mistakes: 0,
      active_team: 1,
      team1_score: players[0]?.score || 0,
      team2_score: players[1]?.score || 0
    });
    triggerMpCountdownAndOpenTour1();
  };

  // Helper to persist full round questions to generated_questions table
  const syncRoundAnswersToDB = useCallback(async (roundNumber: number, roundAnswers: Answer[]) => {
    if (!currentPackId) return;
    try {
      for (let i = 0; i < roundAnswers.length; i++) {
        const ans = roundAnswers[i];
        const specificQId = `gq_${currentPackId}_r${roundNumber}_a${i + 1}`;
        const isGuessed = ans.revealedBy === 'player' || (ans.revealed && ans.revealedBy !== 'host');
        
        // Only sync unrevealed/host-opened answers to avoid double incrementing user's correct answers
        if (!isGuessed) {
          await fetch('/api/generated-questions/answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: specificQId,
              pack_id: currentPackId,
              question_index: (roundNumber - 1) * 6 + (i + 1),
              user_id: effectiveUserId,
              user_answer: 'Открыто ведущим',
              is_correct: false
            })
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Failed syncing round answers:', e);
    }
  }, [currentPackId, effectiveUserId]);

  // Save progress whenever live state updates
  useEffect(() => {
    const saveProgress = async () => {
      if ((gameState === 'playing' || gameState === 'round_completed') && currentPackId && question !== '') {
        const userScore = players.find(p => !p.isBot)?.score || 0;
        // Total steps completed is calculated cleanly based on completed rounds plus current round answers
        const completedRoundsSteps = completedRoundsHistory.length * 6;
        const currentRoundGuessed = answers.filter(a => a.revealed && a.revealedBy === 'player').length;
        const currentProgressStep = Math.min(24, Math.max(completedRoundsSteps, (round - 1) * 6 + currentRoundGuessed));

        const totalPlayerCorrectCount = completedRoundsHistory.reduce(
          (acc, r) => acc + r.answers.filter(a => a.revealedBy === 'player').length, 
          0
        ) + currentRoundGuessed;

        await saveGameProgress({
          userId: effectiveUserId,
          packId: currentPackId,
          gameType: '100to1',
          currentStep: currentProgressStep,
          totalSteps: 24,
          isCompleted: false,
          score: userScore,
          correctAnswers: totalPlayerCorrectCount,
          topic: options.topic || topic,
          difficulty: options.difficulty || 'people',
          state: {
            round,
            players,
            question,
            answers,
            mistakes,
            currentPlayerIndex,
            chatMessages,
            topic,
            unlockedHints,
            roundsData,
            completedRoundsHistory,
            isMultiplayer: Boolean(options?.playMode === 'multi' || existingMpRoomId),
            mpRoomId: (options?.playMode === 'multi' || existingMpRoomId) ? mpRoomId : undefined,
            playMode: (options?.playMode === 'multi' || existingMpRoomId) ? 'multi' : (options?.playMode || 'single')
          }
        });
      }
    };
    saveProgress();
  }, [round, players, question, answers, mistakes, currentPlayerIndex, gameState, effectiveUserId, currentPackId, chatMessages, topic, unlockedHints, roundsData, completedRoundsHistory, options?.playMode, existingMpRoomId, mpRoomId]);

  const startingRef = useRef(false);

  const handleResume = useCallback(async () => {
    const pId = options.packId || currentPackId;
    if (!pId) return;
    setLoading(true);
    try {
      const progress = await getGameProgress(effectiveUserId, pId, '100to1');
      if (progress && progress.state) {
        const { 
          round: savedRound, 
          players: savedPlayers, 
          question: savedQuestion, 
          answers: savedAnswers, 
          mistakes: savedMistakes, 
          currentPlayerIndex: savedPlayerIdx, 
          chatMessages: savedChat, 
          topic: savedTopic, 
          unlockedHints: savedHints, 
          roundsData: savedRounds,
          completedRoundsHistory: savedHistory 
        } = progress.state;

        if (Array.isArray(savedRounds) && savedRounds.length > 0) {
          setRoundsData(savedRounds);
        }
        if (Array.isArray(savedHistory)) {
          setCompletedRoundsHistory(savedHistory);
        }
        if (savedQuestion && Array.isArray(savedAnswers) && savedAnswers.length > 0) {
          setRound(savedRound || 1);
          setPlayers(normalizeTwoTeams(savedPlayers));
          setQuestion(savedQuestion);
          setAnswers(savedAnswers);
          setMistakes(savedMistakes || 0);
          setCurrentPlayerIndex((savedPlayerIdx || 0) % 2);
          setChatMessages(savedChat || []);
          if (savedTopic) setTopic(savedTopic);
          if (Array.isArray(savedHints)) setUnlockedHints(savedHints);
          setGameState('playing');
          return;
        }
      }
      startLevel();
    } catch (error) {
      console.error('Error resuming game:', error);
      startLevel();
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, options.packId, currentPackId]);

  // Load existing multiplayer room and pack when joining or resuming a multiplayer 100to1 room
  useEffect(() => {
    if (!existingMpRoomId) return;
    let cancelled = false;
    const joinAndLoadMpRoom = async () => {
      try {
        const joinRes = await fetch(`/api/multiplayer/rooms/${existingMpRoomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(effectiveUserId),
            display_name: profile?.display_name || 'Игрок',
            avatar_url: profile?.avatar_url || null
          })
        }).catch(() => null);

        if (joinRes && !joinRes.ok) {
          const errJson = await joinRes.json().catch(() => ({}));
          if (errJson?.code === 'GAME_ALREADY_STARTED' || errJson?.code === 'ROOM_FULL') {
            navigate(`/multiplayer/room/${existingMpRoomId}`);
            return;
          }
        }

        const roomRes = await fetch(`/api/multiplayer/rooms/${existingMpRoomId}`).then(r => r.json()).catch(() => null);
        if (cancelled || !roomRes?.room) return;
        const roomObj = roomRes.room;
        setMpRoomData(roomObj);
        if (Array.isArray(roomRes.participants)) {
          setMpParticipants(roomRes.participants);
        }
        if (roomObj.topic) setTopic(roomObj.topic);
        const resolvedPack = roomObj.pack_id || options?.packId || urlPackId || currentPackId;
        if (resolvedPack) setCurrentPackId(resolvedPack);

        const progress = resolvedPack ? await getGameProgress(String(effectiveUserId), resolvedPack, '100to1').catch(() => null) : null;
        const st = progress?.state || null;
        const tState = roomObj.team_game_state || roomRes.team_game_state || null;

        let loadedRounds: any[] = [];
        if (Array.isArray(options?.questions) && options.questions.length > 0) {
          loadedRounds = options.questions;
        } else if (Array.isArray(roomRes?.questions) && roomRes.questions.length > 0) {
          loadedRounds = roomRes.questions;
        } else if (Array.isArray(st?.roundsData) && st.roundsData.length > 0) {
          loadedRounds = st.roundsData;
        } else if (resolvedPack) {
          const packRes = await fetch(`/api/game-packs/${resolvedPack}?user_id=${encodeURIComponent(String(effectiveUserId))}`).then(r => r.json()).catch(() => null);
          const rawQ = packRes?.data?.questions;
          const parsedQ = typeof rawQ === 'string' ? JSON.parse(rawQ) : rawQ;
          if (Array.isArray(parsedQ) && parsedQ.length > 0) {
            loadedRounds = parsedQ;
          }
        }

        if (!cancelled && loadedRounds.length > 0) {
          setRoundsData(loadedRounds);
        }
        if (!cancelled && Array.isArray(st?.completedRoundsHistory)) {
          setCompletedRoundsHistory(st.completedRoundsHistory);
        }
        if (!cancelled && Array.isArray(st?.unlockedHints)) {
          setUnlockedHints(st.unlockedHints);
        }

        const savedPlayersNorm = normalizeTwoTeams(st?.players);
        const team1Part = (roomRes.participants || []).find((p: any) => Number(p.team_number || 1) !== 2);
        const team2Part = (roomRes.participants || []).find((p: any) => Number(p.team_number) === 2);
        const resolvedTeam1Score =
          typeof tState?.team1_score === 'number'
            ? tState.team1_score
            : savedPlayersNorm[0]?.score || Number(team1Part?.score) || 0;
        const resolvedTeam2Score =
          typeof tState?.team2_score === 'number'
            ? tState.team2_score
            : savedPlayersNorm[1]?.score || Number(team2Part?.score) || 0;

        if (!cancelled) {
          setPlayers([
            {
              id: '1',
              name: roomObj.team1_name || 'Команда 1',
              score: resolvedTeam1Score,
              isBot: false
            },
            {
              id: '2',
              name: roomObj.team2_name || 'Команда 2',
              score: resolvedTeam2Score,
              isBot: false
            }
          ]);
        }

        // Priority 1: Server authoritative team_game_state
        if (!cancelled && tState?.question && Array.isArray(tState?.answers) && tState.answers.length > 0) {
          if (tState.updated_at) lastTeamSyncAtRef.current = Number(tState.updated_at);
          setRound(Number(tState.round) || st?.round || 1);
          setQuestion(tState.question);
          setAnswers(tState.answers);
          setMistakes(Number(tState.mistakes ?? st?.mistakes) || 0);
          setTeamMistakes([
            typeof tState.team1_mistakes === 'number' ? tState.team1_mistakes : 0,
            typeof tState.team2_mistakes === 'number' ? tState.team2_mistakes : 0
          ]);
          setTeamSurrendered([
            Boolean(tState.team1_surrendered),
            Boolean(tState.team2_surrendered)
          ]);
          if (Array.isArray(tState.round_base_scores) && tState.round_base_scores.length >= 2) {
            setRoundBaseScores([
              Number(tState.round_base_scores[0]) || 0,
              Number(tState.round_base_scores[1]) || 0
            ]);
          } else {
            setRoundBaseScores([resolvedTeam1Score, resolvedTeam2Score]);
          }
          const loadedDeadline =
            typeof tState.turn_deadline === 'number' && tState.turn_deadline > Date.now()
              ? tState.turn_deadline
              : Date.now() + 60000;
          setMpTurnDeadline(loadedDeadline);
          setMpTurnTimeLeft(Math.max(0, Math.ceil((loadedDeadline - Date.now()) / 1000)));
          const activeT = tState.active_team === 2 ? 1 : tState.active_team === 1 ? 0 : ((st?.currentPlayerIndex || 0) % 2);
          setCurrentPlayerIndex(activeT);
          setGameState(roomObj.status === 'waiting' ? 'mp_lobby' : 'playing');
          return;
        }

        // Priority 2: Saved local/DB progress state
        if (!cancelled && st?.question && Array.isArray(st?.answers) && st.answers.length > 0) {
          setRound(st.round || 1);
          setQuestion(st.question);
          setAnswers(st.answers);
          setMistakes(st.mistakes || 0);
          setCurrentPlayerIndex((st.currentPlayerIndex || 0) % 2);
          setGameState(roomObj.status === 'waiting' ? 'mp_lobby' : 'playing');
          return;
        }

        // Priority 3: Build from loadedRounds
        if (!cancelled && loadedRounds.length > 0) {
          const mePart = (roomRes.participants || []).find((p: any) => String(p.user_id) === String(effectiveUserId));
          const forcedStep = typeof options?.forcedQuestionIndex === 'number'
            ? options.forcedQuestionIndex
            : typeof options?.currentIndex === 'number'
            ? options.currentIndex
            : Math.max(0, (Number(mePart?.current_round) || 1) - 1);
          const resolvedRoundNum = loadedRounds.length <= 4
            ? Math.min(loadedRounds.length, Math.max(1, forcedStep >= 4 ? Math.ceil((forcedStep + 1) / 6) : forcedStep + 1))
            : 1;
          const rObj = loadedRounds[resolvedRoundNum - 1] || loadedRounds[0];
          let rawAns = rObj?.answers;
          if (typeof rawAns === 'string') {
            try { rawAns = JSON.parse(rawAns); } catch (_) {}
          }
          setRound(resolvedRoundNum);
          setQuestion(rObj?.question || rObj?.text || `Вопрос ${resolvedRoundNum}`);
          setAnswers(Array.isArray(rawAns) ? rawAns.map((a: any) => ({ ...a, revealed: false })) : []);
          setMistakes(0);
          setCurrentPlayerIndex(0);
          if (roomObj.status === 'waiting') {
            setGameState('mp_lobby');
          } else {
            setGameState('playing');
          }
        }
      } catch (_) {}
    };
    joinAndLoadMpRoom();
    return () => {
      cancelled = true;
    };
  }, [existingMpRoomId]);

  useEffect(() => {
    if (existingMpRoomId) return;
    const loadProgress = async () => {
      if (options?.isReplay && options?.questions && Array.isArray(options.questions) && options.questions.length > 0 && options?.playMode !== 'multi') {
        setRoundsData(options.questions);
        const firstQ = options.questions[0];
        if (firstQ && (firstQ.question || firstQ.title || firstQ.text)) {
          setQuestion(firstQ.question || firstQ.title || firstQ.text);
          let rawAnswers = firstQ.answers;
          if (typeof rawAnswers === 'string') {
            try { rawAnswers = JSON.parse(rawAnswers); } catch (_) {}
          }
          setAnswers(Array.isArray(rawAnswers) ? rawAnswers.map((a: any) => ({ ...a, revealed: false })) : []);
          setMistakes(0);
          setRound(1);
          setUnlockedHints([]);
          setShowAiHintModal(false);
          setGameState('playing');
          return;
        }
      }
      if (options?.resume && options?.packId) {
        await handleResume();
        return;
      }
      if (!options?.packId || options?.playMode === 'multi') return;
      const progress = await getGameProgress(String(effectiveUserId), options.packId, '100to1');
      if (progress) {
        setHasProgress(true);
        setGameState('setup');
      }
    };
    loadProgress();
  }, [effectiveUserId, options?.packId, options?.resume, options?.isReplay, options?.questions, options?.playMode, handleResume]);

  useEffect(() => {
    if (existingMpRoomId) return;
    if (gameState === 'loading' && question === '' && !hasProgress && !options?.resume) {
      if (startingRef.current) return;
      startingRef.current = true;
      startLevel();
    }
  }, [gameState, question, hasProgress, options?.resume]);

  const prevRoundSoundRef = useRef<number | null>(null);
  const prevTurnIdxSoundRef = useRef<number | null>(null);
  const timerTickPlayedDeadlineRef = useRef<number | null>(null);

  useEffect(() => {
    audioSystem.preloadGameBatch('100to1', Boolean(options?.playMode === 'multi' || existingMpRoomId));
    return () => {
      audioSystem.stopSlot('sto_turn_timer_60s_tick');
    };
  }, [options?.playMode, existingMpRoomId]);

  // Background music & round jingles for 100to1
  useEffect(() => {
    if (gameState === 'setup') {
      audioSystem.playBackground('sto_bg_intro');
    } else if (gameState === 'mp_lobby') {
      audioSystem.playBackground('mp_bg_waiting_room');
    } else if (gameState === 'playing' || gameState === 'feedback') {
      const roundBg =
        round === 2
          ? 'sto_bg_round_double'
          : round === 3
          ? 'sto_bg_round_triple'
          : round === 4
          ? 'sto_bg_round_reverse'
          : 'sto_bg_round_simple';
      audioSystem.playBackground(roundBg);
      if (prevRoundSoundRef.current !== round) {
        prevRoundSoundRef.current = round;
        audioSystem.playSlot('sto_round_start_jingle');
      }
    } else if (gameState === 'result') {
      audioSystem.stopSlot('sto_turn_timer_60s_tick');
      audioSystem.playSlot('sto_final_team_distribution');
    }
  }, [gameState, round]);

  // Turn transition sounds
  useEffect(() => {
    if (gameState !== 'playing') return;
    if (prevTurnIdxSoundRef.current !== null && prevTurnIdxSoundRef.current !== currentPlayerIndex) {
      audioSystem.playSlot('sto_turn_next_player');
      const isMp = options?.playMode === 'multi' || Boolean(existingMpRoomId);
      if (isMp) {
        const myPart = mpParticipants.find(p => String(p.user_id) === String(effectiveUserId));
        const myTeamIdx = Number(myPart?.team_number) === 2 ? 1 : 0;
        if (currentPlayerIndex % 2 === myTeamIdx) {
          setTimeout(() => audioSystem.playSlot('sto_turn_my_turn_alert'), 350);
        }
      } else if (!players[currentPlayerIndex]?.isBot) {
        setTimeout(() => audioSystem.playSlot('sto_turn_my_turn_alert'), 350);
      }
    }
    prevTurnIdxSoundRef.current = currentPlayerIndex;
  }, [currentPlayerIndex, gameState]);

  // 60s turn timer tick alert at 15s remaining
  useEffect(() => {
    if (gameState === 'playing' && mpTurnTimeLeft <= 15 && mpTurnTimeLeft > 0) {
      if (timerTickPlayedDeadlineRef.current !== mpTurnDeadline) {
        timerTickPlayedDeadlineRef.current = mpTurnDeadline;
        audioSystem.playSlot('sto_turn_timer_60s_tick');
      }
    } else if (mpTurnTimeLeft > 15 || gameState !== 'playing') {
      audioSystem.stopSlot('sto_turn_timer_60s_tick');
    }
  }, [mpTurnTimeLeft, mpTurnDeadline, gameState]);

  const startLevel = async () => {
    if (options?.questions && Array.isArray(options.questions) && options.questions.length > 0) {
      setRoundsData(options.questions);
      const gameData = options.questions[0];
      if (gameData && (gameData.question || gameData.text) && Array.isArray(gameData.answers)) {
        setQuestion(gameData.question || gameData.text);
        setAnswers(gameData.answers.map((a: any) => ({ ...a, revealed: false })));
        setMistakes(0);
        setRound(1);
        setUnlockedHints([]);
        setCompletedRoundsHistory([]);
        if (options.playMode === 'multi') {
          if (options.resumeMultiplayer) {
            setGameState('playing');
          } else if (options.fromMultiplayerLobby) {
            setGameState('mp_lobby');
            triggerMpCountdownAndOpenTour1();
          } else {
            await registerMultiplayerLobbyRoom();
            setGameState('mp_lobby');
          }
        } else {
          setGameState('playing');
        }
        if (options.packId) {
          fetch(`/api/game-packs/${options.packId}/play`, { method: 'POST' }).catch(() => {});
        }
        return;
      }
    }

    const cost = options.price || 40; 
    const currentBal = profile ? (profile.balance ?? 0) : demoBalance;

    if (currentBal < cost || currentBal <= 0) {
      startingRef.current = false;
      if (!profile) {
        openDemoExhaustedModal();
      } else {
        setInsufficientAmount(cost);
        setInsufficientReason('старта игры Сто Квадному');
        setShowInsufficientModal(true);
      }
      setGameState('setup');
      return;
    }

    setGameState('loading');
    try {
      const generated = await protalkService.generateQuestions(topic, options?.difficulty || 'people', 4, '100to1', undefined, currentPackId, effectiveUserId, options?.note);
      const roundsList = Array.isArray(generated) ? generated : [generated];
      
      if (!roundsList || roundsList.length === 0 || !roundsList[0]?.answers) {
        throw new Error('Нейросеть не смогла сформировать опрос для игры Сто Квадному. Попробуйте еще раз.');
      }

      setRoundsData(roundsList);
      const round1 = roundsList[0];
      setQuestion(round1.question || round1.text || 'Вопрос 1');
      setAnswers(round1.answers.map((a: any) => ({ ...a, revealed: false })));
      setMistakes(0);
      setRound(1);
      setUnlockedHints([]);
      setCompletedRoundsHistory([]);
      setShowAiHintModal(false);
      if (options.playMode === 'multi') {
        if (options.resumeMultiplayer) {
          setGameState('playing');
        } else if (options.fromMultiplayerLobby) {
          setGameState('mp_lobby');
          triggerMpCountdownAndOpenTour1();
        } else {
          await registerMultiplayerLobbyRoom();
          audioSystem.playSlot('sto_lobby_created_after_gen');
          setGameState('mp_lobby');
        }
      } else {
        setGameState('playing');
      }
    } catch (error: any) {
      startingRef.current = false;
      console.error('Error loading 100to1 game rounds:', error);
      setErrorMessage(error?.message || String(error));
      setGameState('error');
    }
  };

  const loadRound = async (roundNum: number, cachedRounds?: any[]) => {
    if (surrenderIntervalRef.current) {
      clearInterval(surrenderIntervalRef.current);
      surrenderIntervalRef.current = null;
    }
    setIsSurrendering(false);
    setSurrenderIndex(null);
    setSurrenderCountdown(0);
    setViewingRound(null);

    const listToUse = cachedRounds || roundsData;
    const roundIdx = roundNum - 1;

    const mapAnswers = (rawAnswers: any[]) => rawAnswers.map((a: any, idx: number) => ({
      ...a,
      points: roundNum === 4 ? (REVERSE_ROUND_POINTS[idx] ?? 240) : a.points,
      revealed: false
    }));

    if (listToUse && listToUse[roundIdx] && Array.isArray(listToUse[roundIdx].answers)) {
      const nextRoundData = listToUse[roundIdx];
      const nextQuestionStr = nextRoundData.question || nextRoundData.text || `Вопрос ${roundNum}`;
      const nextMappedAnswers = mapAnswers(nextRoundData.answers);
      const baseScores: [number, number] = [players[0]?.score || 0, players[1]?.score || 0];
      const nextDeadline = Date.now() + 60000;
      setQuestion(nextQuestionStr);
      setAnswers(nextMappedAnswers);
      setMistakes(0);
      setTeamMistakes([0, 0]);
      setTeamSurrendered([false, false]);
      setRoundBaseScores(baseScores);
      setMpTurnDeadline(nextDeadline);
      setMpTurnTimeLeft(60);
      setRound(roundNum);
      setUnlockedHints([]);
      setShowAiHintModal(false);
      setAllHintsExhaustedModal(false);
      setGameState('playing');
      setFeedback(null);
      setUserAnswer('');
      if ((options?.playMode === 'multi' || existingMpRoomId) && mpRoomId) {
        pushTeamGameStateToServer({
          round: roundNum,
          question: nextQuestionStr,
          answers: nextMappedAnswers,
          mistakes: 0,
          team1_mistakes: 0,
          team2_mistakes: 0,
          team1_surrendered: false,
          team2_surrendered: false,
          round_base_scores: baseScores,
          turn_deadline: nextDeadline,
          is_cascading: false,
          active_team: currentPlayerIndex % 2 === 1 ? 2 : 1
        });
      }
      return;
    }

    setGameState('loading');
    try {
      const data = await protalkService.generateQuestions(topic, options?.difficulty || 'people', 1, '100to1', undefined, currentPackId, effectiveUserId, options?.note);
      const gameData = Array.isArray(data) ? data[0] : data;
      
      if (!gameData || !gameData.question || !Array.isArray(gameData.answers)) {
        throw new Error('Нейросеть не смогла сформировать опрос для игры Сто Квадному. Попробуйте еще раз.');
      }

      const nextMappedAnswers = mapAnswers(gameData.answers);
      const baseScores: [number, number] = [players[0]?.score || 0, players[1]?.score || 0];
      const nextDeadline = Date.now() + 60000;
      setQuestion(gameData.question);
      setAnswers(nextMappedAnswers);
      setMistakes(0);
      setTeamMistakes([0, 0]);
      setTeamSurrendered([false, false]);
      setRoundBaseScores(baseScores);
      setMpTurnDeadline(nextDeadline);
      setMpTurnTimeLeft(60);
      setRound(roundNum);
      setUnlockedHints([]);
      setShowAiHintModal(false);
      setAllHintsExhaustedModal(false);
      setGameState('playing');
      setFeedback(null);
      setUserAnswer('');
      if ((options?.playMode === 'multi' || existingMpRoomId) && mpRoomId) {
        pushTeamGameStateToServer({
          round: roundNum,
          question: gameData.question,
          answers: nextMappedAnswers,
          mistakes: 0,
          team1_mistakes: 0,
          team2_mistakes: 0,
          team1_surrendered: false,
          team2_surrendered: false,
          round_base_scores: baseScores,
          turn_deadline: nextDeadline,
          is_cascading: false,
          active_team: currentPlayerIndex % 2 === 1 ? 2 : 1
        });
      }
    } catch (error: any) {
      console.error('Error loading round:', error);
      setErrorMessage(error?.message || 'Не удалось сгенерировать раунд. Попробуйте ещё раз.');
      setGameState('error');
      throw error;
    }
  };

  // Complete the current round, animate unrevealed answers onto the board sequentially, and sync progress
  const finishCurrentRound = useCallback(async (finalAnswersState: Answer[]) => {
    // 1. Sequentially reveal all remaining unrevealed answers with smooth animation
    const unrevealedIndices = finalAnswersState
      .map((a, i) => (!a.revealed ? i : -1))
      .filter(i => i !== -1);

    const updatedAnswers = [...finalAnswersState];

    if (unrevealedIndices.length > 0) {
      for (let step = 0; step < unrevealedIndices.length; step++) {
        const targetIdx = unrevealedIndices[step];
        updatedAnswers[targetIdx] = {
          ...updatedAnswers[targetIdx],
          revealed: true,
          revealedBy: updatedAnswers[targetIdx].revealedBy || 'host'
        };
      }
      setAnswers([...updatedAnswers]);
    }

    // 2. Calculate score earned this round
    const roundScore = updatedAnswers
      .map((a, idx) => ({ a, idx }))
      .filter(({ a }) => a.revealedBy === 'player')
      .reduce((sum, { a, idx }) => sum + getRoundAnswerPoints(round, idx, a.points), 0);

    // 3. Determine if round was won by player
    const userPlayer = players.find(p => !p.isBot);
    const botPlayer = players.find(p => p.isBot);
    const playerRevealed = updatedAnswers.filter(a => a.revealedBy === 'player').length;
    const botRevealed = updatedAnswers.filter(a => a.revealedBy === 'host').length;
    
    let roundIsWin = false;
    if (botPlayer) {
      roundIsWin = mistakes < 3 && (playerRevealed >= botRevealed || roundScore > 0);
    } else {
      roundIsWin = mistakes < 3 && roundScore > 0;
    }

    if (roundIsWin) {
      audioSystem.playSlot('sto_bank_transfer_team1');
    } else {
      audioSystem.playSlot('sto_bank_transfer_team2');
    }

    // Save to completed rounds history
    const roundSnapshot: CompletedRound = {
      round,
      roundTitle: ROUND_NAMES[round] || `Тур ${round}${round === 2 ? ' (x2)' : round === 3 ? ' (x3)' : round === 4 ? ' (наоборот)' : ''}`,
      question,
      answers: updatedAnswers,
      mistakes,
      scoreEarned: roundScore,
      unlockedHints: [...unlockedHints],
      isWin: roundIsWin
    };

    setCompletedRoundsHistory(prev => {
      const filtered = prev.filter(r => r.round !== round);
      return [...filtered, roundSnapshot].sort((a, b) => a.round - b.round);
    });

    // 4. Synchronize all 6 question rows to DB
    await syncRoundAnswersToDB(round, updatedAnswers);

      // 5. Update global step progress to exact round milestone (6, 12, 18, 24)
    if (currentPackId) {
      const myMpPart = mpParticipants.find(p => String(p.user_id) === String(effectiveUserId));
      const myTeamIdx = Number(myMpPart?.team_number) === 2 ? 1 : 0;
      const userScore = players[myTeamIdx]?.score || 0;
      const isMp = Boolean(options?.playMode === 'multi' || existingMpRoomId);
      if (isMp && mpRoomId) {
        pushTeamGameStateToServer({
          answers: updatedAnswers
        });
        fetch(`/api/multiplayer/rooms/${mpRoomId}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(effectiveUserId),
            display_name: profile?.display_name || 'Игрок 1',
            score: userScore,
            correct_count: round * 6,
            current_round: Math.min(24, round * 6 + 1),
            is_finished: round === 4 ? 1 : 0
          })
        }).catch(() => {});
      }
      await saveGameProgress({
        userId: effectiveUserId,
        packId: currentPackId,
        gameType: '100to1',
        currentStep: round * 6,
        totalSteps: 24,
        isCompleted: round === 4,
        score: userScore,
        correctAnswers: round * 6,
        topic: options.topic || topic,
        difficulty: options.difficulty,
        state: {
          round,
          players,
          question,
          answers: updatedAnswers,
          mistakes,
          currentPlayerIndex,
          chatMessages,
          topic,
          unlockedHints,
          roundsData,
          completedRoundsHistory: [...completedRoundsHistory.filter(r => r.round !== round), roundSnapshot],
          isMultiplayer: isMp,
          mpRoomId: isMp ? mpRoomId : undefined,
          playMode: isMp ? 'multi' : (options.playMode || 'single')
        }
      });
    }

    // 6. Transition to round completed summary view
    setGameState('round_completed');
  }, [round, question, mistakes, unlockedHints, completedRoundsHistory, currentPackId, effectiveUserId, players, currentPlayerIndex, chatMessages, topic, roundsData, options.difficulty, options.topic, syncRoundAnswersToDB]);

  // AI Hint: dynamic quiz-style logical riddle questions without revealing the answer
  const handleRequestAIHint = async () => {
    if (checking || isSurrendering || (gameState !== 'playing' && gameState !== 'feedback') || isGeneratingHint) return;

    // Filter unrevealed answers in current round
    const unrevealedItems = answers
      .map((a, index) => ({ answer: a, index, position: index + 1 }))
      .filter(item => !item.answer.revealed);

    if (unrevealedItems.length === 0) {
      setAllHintsExhaustedModal(true);
      setShowAiHintModal(true);
      return;
    }

    // Filter unrevealed answers whose hints are not yet unlocked
    const candidatesWithoutHint = unrevealedItems.filter(
      item => !unlockedHints.some(h => h.index === item.index)
    );

    if (candidatesWithoutHint.length === 0) {
      setAllHintsExhaustedModal(true);
      setShowAiHintModal(true);
      return;
    }

    const cost = 1;
    const currentBal = profile ? (profile.balance ?? 0) : demoBalance;

    if (currentBal < cost) {
      if (!profile) {
        openDemoExhaustedModal();
      } else {
        setInsufficientAmount(cost);
        setInsufficientReason('подсказки ИИ в игре Сто Квадному');
        setShowInsufficientModal(true);
      }
      return;
    }

    setIsGeneratingHint(true);
    try {
      const chosen = candidatesWithoutHint[0]; // Choose next most popular unhinted candidate

      await balanceService.deductBalance(
        effectiveUserId,
        cost,
        `Сто Квадному: подсказка ИИ к строке #${chosen.position} (тур ${round})`,
        '100to1'
      );
      audioSystem.playSlot('sto_team_iikr_deduct');
      setShowCoinAnimation(true);
      setTimeout(() => setShowCoinAnimation(false), 1500);
      if (profile) {
        (profile as any).balance = Math.max(0, (profile.balance || 0) - cost);
      }

      let hintText = chosen.answer.hint;
      if (!hintText || hintText.startsWith('Логический вопрос к скрытому ответу') || hintText.startsWith('Наводящая подсказка') || hintText.includes('???')) {
        hintText = await protalkService.generate100to1Hint(question, chosen.answer.text, topic);
      }

      const hintObj: UnlockedHint = {
        index: chosen.index,
        position: chosen.position,
        hint: hintText,
        points: getRoundAnswerPoints(round, chosen.index, chosen.answer.points)
      };

      audioSystem.playSlot('sto_hint_team_activate');
      setUnlockedHints(prev => [...prev, hintObj]);
      setAllHintsExhaustedModal(false);
      setShowAiHintModal(true);
    } catch (err) {
      console.error('Error requesting hint:', err);
    } finally {
      setIsGeneratingHint(false);
    }
  };

  // Fuzzy Answer Matcher (Extremely forgiving for typos, verb forms, cases, substrings and stems)
  const isFuzzyMatch = (userInput: string, answerText: string): boolean => {
    const clean = (s: string) => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
    const u = clean(userInput);
    const a = clean(answerText);
    if (!u || !a) return false;
    if (u === a) return true;

    // Direct substring containment
    if (u.length >= 3 && a.includes(u)) return true;
    if (a.length >= 3 && u.includes(a)) return true;

    const uWords = u.split(' ').filter(w => w.length >= 3);
    const aWords = a.split(' ').filter(w => w.length >= 3);

    for (const uw of uWords) {
      const uStem = uw.slice(0, Math.max(3, Math.floor(uw.length * 0.75)));
      for (const aw of aWords) {
        const aStem = aw.slice(0, Math.max(3, Math.floor(aw.length * 0.75)));
        if (uStem === aStem || uw.startsWith(aStem) || aw.startsWith(uStem)) {
          return true;
        }
      }
    }

    return false;
  };

  // Cascade reveal handler for surrender, 3 mistakes, or skip
  // Never deducts IIrkas when answers cascadely appear in unrevealed slots!
  const startCascadeReveal = async (
    reason: 'surrender' | 'mistakes' | 'skip' = 'surrender',
    overridePlayers?: Player[]
  ) => {
    setShowSurrenderModal(false);
    setFeedback(null);
    setGameState('playing');
    setIsSurrendering(true);
    setCascadeReason(reason);

    const effectivePlayers = overridePlayers || players;
    if (overridePlayers) {
      setPlayers(overridePlayers);
    }

    const unrevealed = answers
      .map((a, i) => ({ index: i, ...a }))
      .filter(a => !a.revealed);

    if ((options?.playMode === 'multi' || existingMpRoomId) && mpRoomId) {
      pushTeamGameStateToServer({
        is_cascading: true,
        cascade_reason: reason,
        team1_score: effectivePlayers[0]?.score || 0,
        team2_score: effectivePlayers[1]?.score || 0
      });
    }

    if (unrevealed.length === 0) {
      setIsSurrendering(false);
      await finishCurrentRound(answers);
      return;
    }

    let currentStepIndex = 0;
    const currentAnswersCopy = [...answers];

    const processStep = async () => {
      if (currentStepIndex >= unrevealed.length) {
        if (surrenderIntervalRef.current) {
          clearInterval(surrenderIntervalRef.current);
          surrenderIntervalRef.current = null;
        }
        setIsSurrendering(false);
        setSurrenderIndex(null);
        setSurrenderCountdown(0);
        if ((options?.playMode === 'multi' || existingMpRoomId) && mpRoomId) {
          pushTeamGameStateToServer({
            answers: [...currentAnswersCopy],
            is_cascading: false,
            team1_score: effectivePlayers[0]?.score || 0,
            team2_score: effectivePlayers[1]?.score || 0
          });
        }
        await finishCurrentRound(currentAnswersCopy);
        return;
      }

      const item = unrevealed[currentStepIndex];
      setSurrenderIndex(item.index);
      setSurrenderCountdown(5);

      // Reveal answer on board as host-opened (no IIrkas deducted!)
      audioSystem.playSlot('sto_board_reveal_unanswered');
      currentAnswersCopy[item.index] = {
        ...currentAnswersCopy[item.index],
        revealed: true,
        revealedBy: 'host'
      };
      setAnswers([...currentAnswersCopy]);

      if ((options?.playMode === 'multi' || existingMpRoomId) && mpRoomId) {
        pushTeamGameStateToServer({
          answers: [...currentAnswersCopy],
          is_cascading: true,
          cascade_reason: reason,
          team1_score: effectivePlayers[0]?.score || 0,
          team2_score: effectivePlayers[1]?.score || 0
        });
      }

      let secLeft = 5;
      const interval = setInterval(() => {
        secLeft -= 1;
        setSurrenderCountdown(secLeft);
        if (secLeft <= 0) {
          clearInterval(interval);
          currentStepIndex += 1;
          processStep();
        }
      }, 1000);

      surrenderIntervalRef.current = interval;
    };

    processStep();
  };

  // Handle "Сдаться" in multiplayer:
  // First team to surrender gets 3 mistakes in a row without opening the 6 fields, and turn passes to the other team (60s timer).
  // If the second team also surrenders (or already has 3 mistakes), everyone gets 0 for the round and nothing is deducted, then cascade reveal opens all unrevealed fields.
  const handleSurrenderAction = async () => {
    setShowSurrenderModal(false);
    const isMp = options?.playMode === 'multi' || Boolean(existingMpRoomId);
    if (!isMp) {
      await startCascadeReveal('surrender');
      return;
    }

    const activeIdx = currentPlayerIndex % 2;
    const otherIdx = activeIdx === 0 ? 1 : 0;
    const activeTeamName =
      activeIdx === 0
        ? mpRoomData?.team1_name || players[0]?.name || 'Команда 1'
        : mpRoomData?.team2_name || players[1]?.name || 'Команда 2';
    const otherTeamName =
      otherIdx === 0
        ? mpRoomData?.team1_name || players[0]?.name || 'Команда 1'
        : mpRoomData?.team2_name || players[1]?.name || 'Команда 2';

    const otherAlreadyOut = teamMistakes[otherIdx] >= 3 || teamSurrendered[otherIdx];

    if (!otherAlreadyOut) {
      const nextTeamMistakes: [number, number] =
        activeIdx === 0 ? [3, teamMistakes[1]] : [teamMistakes[0], 3];
      const nextTeamSurrendered: [boolean, boolean] =
        activeIdx === 0 ? [true, teamSurrendered[1]] : [teamSurrendered[0], true];
      const nextDeadline = Date.now() + 60000;

      setTeamMistakes(nextTeamMistakes);
      setTeamSurrendered(nextTeamSurrendered);
      setCurrentPlayerIndex(otherIdx);
      setMistakes(nextTeamMistakes[otherIdx]);
      setUserAnswer('');
      setMpTurnDeadline(nextDeadline);
      setMpTurnTimeLeft(60);

      if (mpRoomId) {
        await pushTeamGameStateToServer({
          active_team: otherIdx === 1 ? 2 : 1,
          mistakes: nextTeamMistakes[otherIdx],
          team1_mistakes: nextTeamMistakes[0],
          team2_mistakes: nextTeamMistakes[1],
          team1_surrendered: nextTeamSurrendered[0],
          team2_surrendered: nextTeamSurrendered[1],
          round_base_scores: roundBaseScores,
          turn_deadline: nextDeadline,
          is_cascading: false,
          team1_score: players[0]?.score || 0,
          team2_score: players[1]?.score || 0
        });
        fetch(`/api/multiplayer/rooms/${mpRoomId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(effectiveUserId || '1'),
            action_type: 'chat',
            payload: {
              text: `🏳️ ${activeTeamName} нажала «Сдаться»: засчитаны 3 ошибки подряд без открытия табло! Ход переходит команде «${otherTeamName}» (60 сек на ответ).`,
              sender_name: 'Ведущий'
            }
          })
        }).catch(() => {});
      }
      return;
    }

    // Both teams surrendered / failed -> everyone gets 0 points for this round, 0 IIrkas deducted, cascade reveal starts
    const nextTeamMistakes: [number, number] = [3, 3];
    const nextTeamSurrendered: [boolean, boolean] = [true, true];
    const resetPlayers = normalizeTwoTeams(players).map((p, idx) => ({
      ...p,
      score: roundBaseScores[idx] ?? 0
    }));

    setTeamMistakes(nextTeamMistakes);
    setTeamSurrendered(nextTeamSurrendered);
    setMistakes(3);
    setPlayers(resetPlayers);
    setUserAnswer('');

    if (mpRoomId) {
      await pushTeamGameStateToServer({
        mistakes: 3,
        team1_mistakes: 3,
        team2_mistakes: 3,
        team1_surrendered: true,
        team2_surrendered: true,
        round_base_scores: roundBaseScores,
        is_cascading: true,
        cascade_reason: 'surrender',
        team1_score: resetPlayers[0]?.score || 0,
        team2_score: resetPlayers[1]?.score || 0
      });
      fetch(`/api/multiplayer/rooms/${mpRoomId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: String(effectiveUserId || '1'),
          action_type: 'chat',
          payload: {
            text: `🏳️ Обе команды сдались в туре ${round}! Всем 0 очков за тур без списания ИИрок. Каскадно открываем неотвеченные поля...`,
            sender_name: 'Ведущий'
          }
        })
      }).catch(() => {});
    }

    await startCascadeReveal('surrender', resetPlayers);
  };

  // Handle 60-second turn timeout in multiplayer
  const handleTurnTimeout = useCallback(async () => {
    const isMp = options?.playMode === 'multi' || Boolean(existingMpRoomId);
    if (!isMp || gameState !== 'playing' || checking || isSurrendering) return;
    audioSystem.stopSlot('sto_turn_timer_60s_tick');
    audioSystem.playSlot('sto_turn_timeout_strike');

    const activeIdx = currentPlayerIndex % 2;
    const otherIdx = activeIdx === 0 ? 1 : 0;
    const activeTeamName =
      activeIdx === 0
        ? mpRoomData?.team1_name || players[0]?.name || 'Команда 1'
        : mpRoomData?.team2_name || players[1]?.name || 'Команда 2';
    const otherTeamName =
      otherIdx === 0
        ? mpRoomData?.team1_name || players[0]?.name || 'Команда 1'
        : mpRoomData?.team2_name || players[1]?.name || 'Команда 2';

    const otherAlreadyOut = teamSurrendered[otherIdx] || teamMistakes[otherIdx] >= 3;

    // If the other team already surrendered or has 3 mistakes, and now this team also fails to answer within 60s ->
    // everyone gets 0 for the round, nothing is deducted, and cascade reveal opens remaining answers.
    if (otherAlreadyOut) {
      const resetPlayers = normalizeTwoTeams(players).map((p, idx) => ({
        ...p,
        score: roundBaseScores[idx] ?? 0
      }));
      setTeamMistakes([3, 3]);
      setTeamSurrendered([true, true]);
      setMistakes(3);
      setPlayers(resetPlayers);
      setUserAnswer('');

      if (mpRoomId) {
        await pushTeamGameStateToServer({
          mistakes: 3,
          team1_mistakes: 3,
          team2_mistakes: 3,
          team1_surrendered: true,
          team2_surrendered: true,
          round_base_scores: roundBaseScores,
          is_cascading: true,
          cascade_reason: 'mistakes',
          team1_score: resetPlayers[0]?.score || 0,
          team2_score: resetPlayers[1]?.score || 0
        });
        fetch(`/api/multiplayer/rooms/${mpRoomId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(effectiveUserId || '1'),
            action_type: 'chat',
            payload: {
              text: `⏱️ Время (60 сек) истекло у команды «${activeTeamName}»! Обе команды не справились с туром — всем 0 очков без списания ИИрок. Открываем ответы...`,
              sender_name: 'Ведущий'
            }
          })
        }).catch(() => {});
      }

      await startCascadeReveal('mistakes', resetPlayers);
      return;
    }

    // Normal 60s timeout: skip turn without deducting IIrkas, count +1 mistake, and pass turn to the next team (even in 1v1)
    const newMistakeCount = Math.min(3, (teamMistakes[activeIdx] || 0) + 1);
    const nextTeamMistakes: [number, number] =
      activeIdx === 0 ? [newMistakeCount, teamMistakes[1]] : [teamMistakes[0], newMistakeCount];
    const nextDeadline = Date.now() + 60000;

    setTeamMistakes(nextTeamMistakes);
    setCurrentPlayerIndex(otherIdx);
    setMistakes(nextTeamMistakes[otherIdx] || 0);
    setUserAnswer('');
    setMpTurnDeadline(nextDeadline);
    setMpTurnTimeLeft(60);

    if (mpRoomId) {
      await pushTeamGameStateToServer({
        active_team: otherIdx === 1 ? 2 : 1,
        mistakes: nextTeamMistakes[otherIdx] || 0,
        team1_mistakes: nextTeamMistakes[0],
        team2_mistakes: nextTeamMistakes[1],
        team1_surrendered: teamSurrendered[0],
        team2_surrendered: teamSurrendered[1],
        round_base_scores: roundBaseScores,
        turn_deadline: nextDeadline,
        is_cascading: false,
        team1_score: players[0]?.score || 0,
        team2_score: players[1]?.score || 0
      });
      fetch(`/api/multiplayer/rooms/${mpRoomId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: String(effectiveUserId || '1'),
          action_type: 'chat',
          payload: {
            text: `⏱️ Время на ответ (60 сек) вышло! Пропуск хода без вычета ИИрок, команде «${activeTeamName}» засчитана ошибка (${newMistakeCount}/3). Ход переходит команде «${otherTeamName}»!`,
            sender_name: 'Ведущий'
          }
        })
      }).catch(() => {});
    }
  }, [
    options?.playMode,
    existingMpRoomId,
    gameState,
    checking,
    isSurrendering,
    currentPlayerIndex,
    mpRoomData,
    players,
    teamSurrendered,
    teamMistakes,
    roundBaseScores,
    mpRoomId,
    effectiveUserId,
    pushTeamGameStateToServer
  ]);

  // 60-second turn timer effect in multiplayer
  useEffect(() => {
    const isMp = options?.playMode === 'multi' || Boolean(existingMpRoomId);
    if (!isMp || gameState !== 'playing' || checking || isSurrendering || viewingRound !== null) {
      return;
    }

    const tick = () => {
      const now = Date.now();
      const remainingSec = Math.max(0, Math.ceil((mpTurnDeadline - now) / 1000));
      setMpTurnTimeLeft(remainingSec);

      if (remainingSec <= 0 && timeoutHandledDeadlineRef.current !== mpTurnDeadline) {
        const myPart = mpParticipants.find(p => String(p.user_id) === String(effectiveUserId));
        const myTeam: 1 | 2 = Number(myPart?.team_number) === 2 ? 2 : 1;
        const activeTurn: 1 | 2 = currentPlayerIndex % 2 === 1 ? 2 : 1;
        const isMyTeamTurn = myTeam === activeTurn || mpParticipants.length < 2;
        if (isMyTeamTurn || now >= mpTurnDeadline + 1500) {
          timeoutHandledDeadlineRef.current = mpTurnDeadline;
          handleTurnTimeout();
        }
      }
    };

    tick();
    const interval = setInterval(tick, 300);
    return () => clearInterval(interval);
  }, [
    options?.playMode,
    existingMpRoomId,
    gameState,
    checking,
    isSurrendering,
    viewingRound,
    mpTurnDeadline,
    mpParticipants,
    effectiveUserId,
    currentPlayerIndex,
    handleTurnTimeout
  ]);

  // Proceed to next round from round completed screen
  const handleProceedNextRound = async () => {
    if (surrenderIntervalRef.current) {
      clearInterval(surrenderIntervalRef.current);
      surrenderIntervalRef.current = null;
    }
    setIsSurrendering(false);
    setSurrenderIndex(null);
    setSurrenderCountdown(0);
    setFeedback(null);
    setUserAnswer('');
    setViewingRound(null);
    setMistakes(0);

    if (round < 4) {
      await loadRound(round + 1);
    } else {
      const myMpPart = mpParticipants.find(p => String(p.user_id) === String(effectiveUserId));
      const myTeamIdx = Number(myMpPart?.team_number) === 2 ? 1 : 0;
      const userScore = players[myTeamIdx]?.score || 0;
      const botScore = players[myTeamIdx === 0 ? 1 : 0]?.score || 0;
      // Score calculation based on database scoring rules
      const mult = scoringRule?.multiplier ?? 100;
      const finalSessionScore = Math.round(userScore * mult);

      let currentRounds = [...completedRoundsHistory];
      if (!currentRounds.some(r => r.round === 4) && round === 4) {
        const botPlayer = players.find(p => p.isBot);
        const playerRevealed = answers.filter(a => a.revealedBy === 'player').length;
        const botRevealed = answers.filter(a => a.revealedBy === 'host').length;
        const roundScore = answers
          .map((a, idx) => ({ a, idx }))
          .filter(({ a }) => a.revealedBy === 'player')
          .reduce((sum, { a, idx }) => sum + getRoundAnswerPoints(4, idx, a.points), 0);
        const roundIsWin = botPlayer
          ? (mistakes < 3 && (playerRevealed >= botRevealed || roundScore > 0))
          : (mistakes < 3 && roundScore > 0);
        currentRounds.push({
          round: 4,
          roundTitle: ROUND_NAMES[4] || 'Игра наоборот',
          question,
          answers,
          mistakes,
          scoreEarned: roundScore,
          unlockedHints: [...unlockedHints],
          isWin: roundIsWin
        });
      }

      const roundDetails = currentRounds.map(r => ({
        round: r.round,
        title: r.roundTitle,
        is_win: r.isWin,
        score: r.scoreEarned * 100,
        mistakes: r.mistakes
      }));
      const roundsWon = currentRounds.filter(r => r.isWin).length;
      const roundsLost = Math.max(0, 4 - roundsWon);

      const isMatchWin = roundsWon >= 2 || userScore > botScore;
      const saved = await saveGameSession({
        userId: effectiveUserId,
        gameId: '100to1',
        score: finalSessionScore,
        rawScore: userScore,
        totalQuestions: 4,
        correctAnswers: roundsWon,
        roundsWon: roundsWon,
        roundsLost: roundsLost,
        roundResults: roundDetails,
        mode: options.mode,
        difficulty: options.difficulty || 'normal',
        topic: options.topic || topic,
        pricePaid: options.price,
        isWin: isMatchWin,
        packId: currentPackId || `pack_100to1_${Date.now()}`
      });

      if (saved?.calculation) {
        setScoreCalculation(saved.calculation);
        setAuthoritativeScore(saved.score ?? saved.calculation.authoritativeScore);
      } else {
        const calc = await calculateAuthoritativeScoreClient({
          gameId: '100to1',
          difficulty: options.difficulty || 'normal',
          score: userScore,
          rawScore: userScore,
          totalQuestions: 4,
          correctAnswers: roundsWon,
          isWin: isMatchWin,
          mode: options.mode
        });
        if (calc) {
          setScoreCalculation(calc);
          setAuthoritativeScore(calc.authoritativeScore);
        }
      }

      if (currentPackId) {
        await saveGameProgress({
          userId: effectiveUserId,
          packId: currentPackId,
          gameType: '100to1',
          currentStep: 24,
          totalSteps: 24,
          isCompleted: true,
          score: finalSessionScore,
          correctAnswers: 24,
          topic: options.topic || topic,
          state: {
            isMultiplayer: options.playMode === 'multi',
            mpRoomId: options.playMode === 'multi' ? mpRoomId : undefined,
            playMode: options.playMode || 'single'
          }
        });
      }
      
      try {
        await refetchProfile?.();
      } catch (e) {
        console.error('Error refetching profile:', e);
      }

      setGameState('result');
    }
  };

  const handleSendMessage = async (text: string, attachment?: ChatMessageAttachment | null) => {
    const newMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      senderId: String(effectiveUserId || '1'),
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
        await fetch(`/api/multiplayer/rooms/${mpRoomId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(effectiveUserId || '1'),
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
      } catch (_) {}
    }
  };

  const addBotMessage = useCallback(async (botPlayer: Player, event: string, isCorrect: boolean) => {
    if (!botPlayer.personality) return;
    try {
      const comment = await protalkService.generateAIComment(
        botPlayer.personality,
        event,
        question,
        '',
        isCorrect
      );
      const newMessage: ChatMessage = {
        id: `bot-msg-${Date.now()}`,
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
  }, [question]);

  const handleAnswer = async (overrideAnswer?: string) => {
    const answerToSubmit = (overrideAnswer || userAnswer || '').trim();
    if (checking || isSurrendering || !answerToSubmit || gameState !== 'playing') return;

    const normSubmit = answerToSubmit.toLowerCase().replace(/ё/g, 'е');
    const alreadyRevealed = answers.find(a => a.revealed && (a.text.toLowerCase().replace(/ё/g, 'е') === normSubmit || isFuzzyMatch(answerToSubmit, a.text)));
    if (alreadyRevealed) {
      audioSystem.playSlot('sto_answer_already_opened');
      setFeedback({
        isCorrect: false,
        explanation: `Вариант «${alreadyRevealed.text}» уже открыт на табло! Назовите другой ответ.`
      });
      setGameState('feedback');
      return;
    }

    audioSystem.stopSlot('sto_turn_timer_60s_tick');
    setChecking(true);
    setIsCheckTimedOut(false);
    
    // Deduct 1 IIrka per answer attempt (human player)
    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer.isBot) {
      const attemptCost = 1;
      const currentBal = profile ? (profile.balance ?? 0) : demoBalance;
      if (currentBal >= attemptCost) {
        balanceService.deductBalance(
          effectiveUserId,
          attemptCost,
          `Сто Квадному: попытка ответа в туре ${round} («${answerToSubmit.slice(0, 20)}»)`,
          '100to1'
        ).catch(e => console.warn('Failed to deduct answer attempt balance:', e));
        audioSystem.playSlot('sto_team_iikr_deduct');
        setShowCoinAnimation(true);
        setTimeout(() => setShowCoinAnimation(false), 1500);
        if (profile) {
          (profile as any).balance = Math.max(0, (profile.balance || 0) - attemptCost);
        }
      }
    }
    
    let foundIndex = -1;
    let bestExplanation = '';

    try {
      // 1. Instant local exact and generous fuzzy match
      for (let i = 0; i < answers.length; i++) {
        if (answers[i].revealed) continue;
        if (isFuzzyMatch(answerToSubmit, answers[i].text)) {
          foundIndex = i;
          bestExplanation = `Правильный ответ! «${answers[i].text}» занимает ${i + 1}-е место по популярности среди опрошенных.`;
          break;
        }
      }

      if (foundIndex !== -1) {
        // Fast-path: Skip AI LLM call, simulate dramatic countdown overlay (3 to 10 seconds randomly)
        stopCheckTimer();
        setIsCheckTimedOut(false);
        const randomWaitSec = getRandomCheckSeconds(3, 10);
        await runSimulatedCheckCountdown(randomWaitSec, (remaining) => {
          setCheckTimer(remaining);
        });
      } else {
        // 2. AI semantic & flexible grammar match with 60s countdown
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

        let check: any;
        try {
          check = await protalkService.checkAnswer100to1(question, answerToSubmit, answers);
        } finally {
          stopAICountdown();
        }

        if (check.isCorrect && check.matchedIndex >= 0 && check.matchedIndex < answers.length) {
          if (answers[check.matchedIndex].revealed) {
            foundIndex = -1;
            bestExplanation = `Вариант «${answers[check.matchedIndex].text}» уже открыт на табло!`;
          } else {
            foundIndex = check.matchedIndex;
            bestExplanation = check.explanation || `Правильный ответ! «${answers[foundIndex].text}» есть на табло.`;
          }
        } else {
          bestExplanation = check.explanation || 'Среди 100 опрошенных такой ответ не вошел в топ-6 популярных.';
        }
      }

      const currentPlayer = players[currentPlayerIndex];
      if (currentPlayer.isBot) {
        addBotMessage(currentPlayer, foundIndex !== -1 ? 'ответил правильно' : 'ошибся в ответе', foundIndex !== -1);
      }

      if (foundIndex !== -1) {
        const lineNum = Math.min(6, Math.max(1, foundIndex + 1));
        audioSystem.playSlot(`sto_board_reveal_line_${lineNum}`);
        const newAnswers = [...answers];
        newAnswers[foundIndex] = {
          ...newAnswers[foundIndex],
          revealed: true,
          revealedBy: 'player'
        };
        if (newAnswers.every(a => a.revealed)) {
          setTimeout(() => audioSystem.playSlot('sto_board_all_6_cleared'), 450);
        }
        setAnswers(newAnswers);
        
        const points = getRoundAnswerPoints(round, foundIndex, newAnswers[foundIndex].points);
        const activeIdx = currentPlayerIndex % 2;
        const nextTeam1Score = (players[0]?.score || 0) + (activeIdx === 0 ? points : 0);
        const nextTeam2Score = (players[1]?.score || 0) + (activeIdx === 1 ? points : 0);
        
        setPlayers(prev => {
          const norm = normalizeTwoTeams(prev);
          return norm.map((p, idx) => (idx === activeIdx ? { ...p, score: p.score + points } : p));
        });
        
        setFeedback({ isCorrect: true, explanation: bestExplanation, points });

        if ((options?.playMode === 'multi' || existingMpRoomId) && mpRoomId) {
          pushTeamGameStateToServer({
            answers: newAnswers,
            team1_score: nextTeam1Score,
            team2_score: nextTeam2Score,
            active_team: activeIdx === 0 ? 1 : 2
          });
        }

        if ((options?.playMode === 'multi' || existingMpRoomId) && mpRoomId && !currentPlayer.isBot) {
          const newScore = Math.max(nextTeam1Score, nextTeam2Score);
          const totalGuessedNow = completedRoundsHistory.reduce(
            (acc, r) => acc + r.answers.filter(a => a.revealedBy === 'player').length,
            0
          ) + newAnswers.filter(a => a.revealed && a.revealedBy === 'player').length;
          const stepNow = Math.min(24, (round - 1) * 6 + newAnswers.filter(a => a.revealed && a.revealedBy === 'player').length);
          fetch(`/api/multiplayer/rooms/${mpRoomId}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: String(effectiveUserId),
              display_name: profile?.display_name || 'Игрок 1',
              score: newScore,
              correct_count: totalGuessedNow,
              current_round: Math.min(24, stepNow + 1),
              is_finished: 0
            })
          }).catch(() => {});
        }

        // Record single question row in DB
        const specificQId = `gq_${currentPackId}_r${round}_a${foundIndex + 1}`;
        fetch('/api/generated-questions/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: specificQId,
            pack_id: currentPackId,
            question_index: (round - 1) * 6 + (foundIndex + 1),
            user_id: effectiveUserId,
            user_answer: answerToSubmit,
            is_correct: true
          })
        }).catch(e => console.warn('Failed to update 100to1 question status:', e));
      } else {
        const isMp = options?.playMode === 'multi' || Boolean(existingMpRoomId);
        const activeIdx = currentPlayerIndex % 2;
        const nextTeamMistakes: [number, number] = [...teamMistakes] as [number, number];
        nextTeamMistakes[activeIdx] = Math.min(3, (nextTeamMistakes[activeIdx] || 0) + 1);
        setTeamMistakes(nextTeamMistakes);

        const nextMistakes = isMp ? nextTeamMistakes[activeIdx] : mistakes + 1;
        const strikeNum = Math.min(3, Math.max(1, nextMistakes));
        audioSystem.playSlot(`sto_strike_${strikeNum}`);
        setMistakes(nextMistakes);
        setFeedback({ isCorrect: false, explanation: bestExplanation });
        if (isMp && mpRoomId) {
          pushTeamGameStateToServer({
            mistakes: nextMistakes,
            team1_mistakes: nextTeamMistakes[0],
            team2_mistakes: nextTeamMistakes[1],
            active_team: activeIdx === 0 ? 1 : 2
          });
        }
      }

      setGameState('feedback');
      stopCheckTimer();
    } catch (error) {
      console.error('Error checking answer:', error);
      stopCheckTimer();
    } finally {
      setChecking(false);
    }
  };

  // Bot Turn Logic
  useEffect(() => {
    const currentPlayer = players[currentPlayerIndex];
    if (currentPlayer.isBot && gameState === 'playing' && !checking && !feedback && !isSurrendering) {
      const timer = setTimeout(async () => {
        const difficulty = currentPlayer.difficulty || options.difficulty || 'people';
        let successProbability = 0.5;
        
        switch(difficulty) {
          case 'dummy': successProbability = 0.2; break;
          case 'people': successProbability = 0.4; break;
          case 'genius': successProbability = 0.7; break;
          case 'god': successProbability = 0.9; break;
        }

        const shouldSucceed = Math.random() < successProbability;
        if (shouldSucceed) {
          const unrevealed = answers.filter(a => !a.revealed);
          if (unrevealed.length > 0) {
            const randomAnswer = unrevealed[Math.floor(Math.random() * unrevealed.length)];
            handleAnswer(randomAnswer.text);
          } else {
            handleAnswer('Я не знаю');
          }
        } else {
          handleAnswer('Лягушка в космосе');
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentPlayerIndex, gameState, checking, feedback, isSurrendering, answers, options.difficulty, players]);

  const handleContinueFromFeedback = async () => {
    setFeedback(null);
    setUserAnswer('');
    
    const allRevealed = answers.every(a => a.revealed);
    const isMp = options?.playMode === 'multi' || Boolean(existingMpRoomId);

    if (allRevealed) {
      await finishCurrentRound(answers);
      return;
    }

    if (isMp) {
      const activeIdx = currentPlayerIndex % 2;
      const otherIdx = activeIdx === 0 ? 1 : 0;
      const bothFailed =
        (teamMistakes[0] >= 3 || teamSurrendered[0]) &&
        (teamMistakes[1] >= 3 || teamSurrendered[1]);

      if (bothFailed) {
        const resetPlayers =
          teamSurrendered[0] || teamSurrendered[1]
            ? normalizeTwoTeams(players).map((p, idx) => ({
                ...p,
                score: roundBaseScores[idx] ?? 0
              }))
            : players;
        if (teamSurrendered[0] || teamSurrendered[1]) {
          setPlayers(resetPlayers);
        }
        await startCascadeReveal('mistakes', resetPlayers);
        return;
      }

      const nextIdx =
        teamMistakes[otherIdx] >= 3 || teamSurrendered[otherIdx] ? activeIdx : otherIdx;
      const nextDeadline = Date.now() + 60000;
      setCurrentPlayerIndex(nextIdx);
      setMistakes(teamMistakes[nextIdx] || 0);
      setMpTurnDeadline(nextDeadline);
      setMpTurnTimeLeft(60);
      setGameState('playing');
      if (mpRoomId) {
        pushTeamGameStateToServer({
          active_team: nextIdx === 1 ? 2 : 1,
          mistakes: teamMistakes[nextIdx] || 0,
          team1_mistakes: teamMistakes[0],
          team2_mistakes: teamMistakes[1],
          team1_surrendered: teamSurrendered[0],
          team2_surrendered: teamSurrendered[1],
          round_base_scores: roundBaseScores,
          turn_deadline: nextDeadline,
          is_cascading: false
        });
      }
      return;
    }

    const tooManyMistakes = mistakes >= 3;
    if (tooManyMistakes) {
      // Trigger cascade reveal animation for mistakes (no IIrka deduction)
      await startCascadeReveal('mistakes');
    } else {
      const nextIdx = (currentPlayerIndex + 1) % 2;
      setCurrentPlayerIndex(nextIdx);
      setGameState('playing');
    }
  };

  if (gameState === 'setup') {
    return (
      <div className="mx-auto max-w-2xl space-y-8 rounded-3xl border border-primary/20 bg-background/20 backdrop-blur-xl p-8 shadow-2xl">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-primary">Сто Квадному</h2>
          <p className="text-sm text-foreground/70">Простые вопросы и 6 популярных ответов в 4 захватывающих турах.</p>
        </div>
        <input 
          type="text" 
          value={topic} 
          onChange={e => setTopic(e.target.value)}
          placeholder="Тема игры..."
          className="w-full rounded-2xl border border-primary/20 bg-background/30 backdrop-blur-md p-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="flex flex-col sm:flex-row gap-4">
          {hasProgress && (
            <LeafButton 
              variant="glass"
              size="md"
              onClick={handleResume} 
              disabled={loading}
              className="flex-1 justify-center"
              icon={loading ? <Loader2 className="animate-spin" size={18} /> : <RotateCcw size={18} />}
            >
              Продолжить
            </LeafButton>
          )}
          <LeafButton 
            variant="primary"
            size="md"
            onClick={startLevel}
            disabled={loading}
            className="flex-1 justify-center"
            icon={loading && !hasProgress ? <Loader2 className="animate-spin" size={18} /> : undefined}
          >
            Начать игру
          </LeafButton>
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
    return (
      <GenerationLoadingScreen 
        gameId="100to1"
        title="Сто Квадному"
        messages={[
          'Опрашиваем 100 человек...',
          'Собираем популярные ответы...',
          'Подсчитываем баллы...',
          'Формируем табло...',
          'Почти готово...',
        ]}
      />
    );
  }

  if (gameState === 'error') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <GameError 
          message={errorMessage}
          onRetry={startLevel} 
          onReturn={() => navigate('/')} 
        />
      </div>
    );
  }

  if (gameState === 'mp_lobby') {
    const isLobbyHost = !mpRoomData?.host_id || String(mpRoomData.host_id) === String(effectiveUserId);
    const myPart = mpParticipants.find(p => String(p.user_id) === String(effectiveUserId));
    const myReady = isLobbyHost || Number(myPart?.is_ready) === 1;
    const lobbyList =
      mpParticipants.length >= 2
        ? mpParticipants
        : mpParticipants.length === 1
        ? [
            mpParticipants[0],
            {
              id: `${effectiveUserId}_self2`,
              user_id: `${effectiveUserId}_self2`,
              display_name: `${profile?.display_name || 'Вы'} (2-й участник)`,
              avatar_url: profile?.avatar_url || null,
              role: 'captain',
              team_number: Number(mpParticipants[0]?.team_number) === 2 ? 1 : 2,
              is_ready: 1
            } as any
          ]
        : [
            {
              id: String(effectiveUserId),
              user_id: String(effectiveUserId),
              display_name: profile?.display_name || 'Вы',
              avatar_url: profile?.avatar_url || null,
              role: 'host',
              team_number: 1,
              is_ready: 1
            } as any,
            {
              id: `${effectiveUserId}_self2`,
              user_id: `${effectiveUserId}_self2`,
              display_name: `${profile?.display_name || 'Вы'} (2-й участник)`,
              avatar_url: profile?.avatar_url || null,
              role: 'captain',
              team_number: 2,
              is_ready: 1
            } as any
          ];
    const team1Lobby = lobbyList.filter((p: any) => Number(p.team_number || 1) !== 2);
    const team2Lobby = lobbyList.filter((p: any) => Number(p.team_number || 1) === 2);
    const myTeamNum = Number(myPart?.team_number || 1) === 2 ? 2 : 1;

    return (
      <div className="w-full max-w-none space-y-6 text-foreground">
        <MultiplayerCountdownOverlay
          isOpen={showMpCountdown}
          gameTitle={`Сто Квадному: ${topic}`}
          subtitle="Обратный отсчёт перед открытием 1-го тура..."
          onComplete={() => {
            setShowMpCountdown(false);
            setGameState('playing');
          }}
        />

        <div className="rounded-3xl border border-primary/35 bg-transparent backdrop-blur-2xl p-6 shadow-2xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-primary/20 pb-4">
            <div className="space-y-1">
              <BubbleElement isBadge active size="sm">
                Лобби ожидания • Сто Квадному
              </BubbleElement>
              <h2 className="text-xl sm:text-2xl font-black text-foreground">
                Тема: {topic} (4 тура)
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <BubbleElement
                size="md"
                active
                onClick={() => setIsMpInviteOpen(true)}
                icon={<Share2 size={16} />}
              >
                Пригласить в игру
              </BubbleElement>
            </div>
          </div>

          {/* 2-Team Selection & Distribution for 100to1 */}
          <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-base font-bold text-primary flex items-center gap-2">
                  <Users size={18} />
                  Распределение на 2 команды ({lobbyList.length}/{mpMaxPlayers})
                </span>
                <p className="text-sm text-foreground/70">
                  Выберите свою команду перед стартом или распределите участников поровну
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <BubbleElement
                  as="button"
                  type="button"
                  size="sm"
                  active={myTeamNum === 1}
                  onClick={() => handleSetMpTeam(String(effectiveUserId), 1)}
                >
                  В Команду 1
                </BubbleElement>
                <BubbleElement
                  as="button"
                  type="button"
                  size="sm"
                  active={myTeamNum === 2}
                  onClick={() => handleSetMpTeam(String(effectiveUserId), 2)}
                >
                  В Команду 2
                </BubbleElement>
                {isLobbyHost && lobbyList.length >= 2 && (
                  <BubbleElement
                    as="button"
                    type="button"
                    size="sm"
                    active
                    onClick={handleDistributeMpTeams}
                  >
                    Поровну по командам
                  </BubbleElement>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Team 1 Column */}
              <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-primary/15 pb-2">
                  <span className="text-base font-black text-primary">
                    {mpRoomData?.team1_name || 'Команда 1'}
                  </span>
                  <BubbleElement isBadge active size="sm">
                    {team1Lobby.length} уч.
                  </BubbleElement>
                </div>
                <div className="space-y-2">
                  {team1Lobby.length === 0 ? (
                    <p className="text-sm text-foreground/50 py-2">Нет участников в Команде 1</p>
                  ) : (
                    team1Lobby.map((part: any, idx: number) => {
                      const isCreator = part.role === 'host' || String(part.user_id) === String(mpRoomData?.host_id || effectiveUserId);
                      const isSelf2 = String(part.user_id).endsWith('_self2');
                      const isPartReady = isCreator || isSelf2 || Number(part.is_ready) === 1;
                      const canSwitch = isLobbyHost || String(part.user_id) === String(effectiveUserId);
                      return (
                        <div
                          key={`100to1-t1-${part.id || idx}`}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <UserAvatar avatarUrl={part.avatar_url} displayName={part.display_name} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground truncate">{part.display_name || 'Игрок'}</p>
                              <p className="text-sm text-foreground/65">
                                {isCreator ? 'Создатель • Готов' : isPartReady ? 'Готов ✓' : 'Ожидание'}
                              </p>
                            </div>
                          </div>
                          {canSwitch && (
                            <BubbleElement
                              as="button"
                              type="button"
                              size="sm"
                              onClick={() => handleSetMpTeam(String(part.user_id), 2)}
                            >
                              → Команда 2
                            </BubbleElement>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Team 2 Column */}
              <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-primary/15 pb-2">
                  <span className="text-base font-black text-primary">
                    {mpRoomData?.team2_name || 'Команда 2'}
                  </span>
                  <BubbleElement isBadge active size="sm">
                    {team2Lobby.length} уч.
                  </BubbleElement>
                </div>
                <div className="space-y-2">
                  {team2Lobby.length === 0 ? (
                    <p className="text-sm text-foreground/50 py-2">
                      Нет участников в Команде 2 (при игре с самим собой ходы команд чередуются автоматически)
                    </p>
                  ) : (
                    team2Lobby.map((part: any, idx: number) => {
                      const isCreator = part.role === 'host' || String(part.user_id) === String(mpRoomData?.host_id || effectiveUserId);
                      const isSelf2 = String(part.user_id).endsWith('_self2');
                      const isPartReady = isCreator || isSelf2 || Number(part.is_ready) === 1;
                      const canSwitch = isLobbyHost || String(part.user_id) === String(effectiveUserId);
                      return (
                        <div
                          key={`100to1-t2-${part.id || idx}`}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <UserAvatar avatarUrl={part.avatar_url} displayName={part.display_name} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground truncate">{part.display_name || 'Игрок'}</p>
                              <p className="text-sm text-foreground/65">
                                {isCreator ? 'Создатель • Готов' : isPartReady ? 'Готов ✓' : 'Ожидание'}
                              </p>
                            </div>
                          </div>
                          {canSwitch && (
                            <BubbleElement
                              as="button"
                              type="button"
                              size="sm"
                              onClick={() => handleSetMpTeam(String(part.user_id), 1)}
                            >
                              ← Команда 1
                            </BubbleElement>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-foreground/75">
                {isLobbyHost
                  ? 'Распределите игроков на 2 команды и нажмите «Начать игру». Команды отвечают поочередно в реальном времени!'
                  : 'Выберите свою команду и нажмите «Готово». Игра начнется с отсчёта 5..1 после запуска создателем.'}
              </p>

              {isLobbyHost ? (
                <LeafButton
                  variant="primary"
                  size="lg"
                  onClick={handleStartMpGameFromLobby}
                  icon={<Play size={18} />}
                >
                  Начать игру
                </LeafButton>
              ) : (
                <LeafButton
                  variant={myReady ? 'glass' : 'primary'}
                  size="lg"
                  onClick={handleToggleMpReady}
                  disabled={togglingMpReady}
                  icon={togglingMpReady ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                >
                  {myReady ? 'Вы готовы ✓' : 'Готово'}
                </LeafButton>
              )}
            </div>
          </div>
        </div>

        <MultiplayerGameWebcamStrip
          roomId={mpRoomId}
          gameId="100to1"
          gameTitle={`Сто Квадному: ${topic}`}
          currentUser={{
            uid: String(effectiveUserId),
            display_name: profile?.display_name || 'Игрок 1',
            avatar_url: profile?.avatar_url
          }}
          localRound={1}
          totalRounds={4}
          localScore={0}
          localCorrectCount={0}
          localIsFinished={false}
          isLobby={true}
          maxPlayers={mpMaxPlayers}
          hideProgressBlock={true}
          onOpenInvite={() => setIsMpInviteOpen(true)}
          onRoomStateSync={(data) => {
            if (data.room) {
              setMpRoomData(data.room);
              if (data.room.status === 'active' && !showMpCountdown) {
                triggerMpCountdownAndOpenTour1();
              }
            }
            if (Array.isArray(data.participants)) setMpParticipants(data.participants);
            if (Array.isArray(data.chatMessages)) setChatMessages(data.chatMessages);
          }}
        />

        <div className="h-[380px]">
          <GameChat
            title="Групповой чат игры"
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            currentUser={{
              id: String(effectiveUserId || '1'),
              name: profile?.display_name || 'Игрок 1',
              avatar: profile?.avatar_url
            }}
          />
        </div>

        <VideoInviteModal
          isOpen={isMpInviteOpen}
          onClose={() => setIsMpInviteOpen(false)}
          currentUser={{
            uid: String(effectiveUserId),
            display_name: profile?.display_name || 'Ведущий',
            avatar_url: profile?.avatar_url
          }}
          roomId={mpRoomId}
          roomTitle={`Сто Квадному: ${topic}`}
          roomType="100to1"
          gameId="100to1"
          invitePath={`/multiplayer/room/${mpRoomId}`}
        />
        <ZoomVideoModal
          isOpen={isMpZoomOpen}
          onClose={() => setIsMpZoomOpen(false)}
          currentUser={{
            uid: String(effectiveUserId),
            display_name: profile?.display_name || 'Ведущий',
            avatar_url: profile?.avatar_url
          }}
          roomId={mpRoomId}
          roomTitle={`Лобби Сто Квадному: ${topic}`}
          roomType="100to1"
          gameId="100to1"
          maxPlayers={mpMaxPlayers}
          onStartGame={handleStartMpGameFromLobby}
        />
      </div>
    );
  }

  if (gameState === 'result') {
    const myMpPart = mpParticipants.find(p => String(p.user_id) === String(effectiveUserId));
    const myTeamIdx = Number(myMpPart?.team_number) === 2 ? 1 : 0;
    const userScore = players[myTeamIdx]?.score || 0;
    const botScore = players[myTeamIdx === 0 ? 1 : 0]?.score || 0;
    const isWin = userScore >= botScore && userScore > 0;

    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-primary/30 bg-background/25 backdrop-blur-2xl p-8 sm:p-10 shadow-2xl text-center space-y-6">
        <div className="flex justify-center">
          {isWin ? (
            <BubbleElement active isBadge size="md" icon={<Trophy size={18} />}>
              Победа вашей команды!
            </BubbleElement>
          ) : (
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold text-sm">
              <X size={18} />
              Поражение в матче
            </div>
          )}
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-primary">
            {isWin ? 'Блестящая победа!' : 'Команда соперников оказалась быстрее!'}
          </h2>
          <p className="mt-2 text-sm text-foreground/70">
            {isWin ? 'Вы отлично почувствовали самые популярные ответы людей.' : 'Сыграйте еще раз, чтобы взять реванш!'}
          </p>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 space-y-3 text-left">
          <div className="space-y-1">
            <span className="text-sm font-bold text-primary/80">Условие победы:</span>
            <p className="text-sm text-foreground/90 font-medium leading-relaxed">
              Набрать больше очков, чем команда соперника по сумме всех 4 раундов игры.
            </p>
          </div>

          <div className="pt-3 border-t border-primary/10 space-y-2">
            {players.map((p, pIdx) => (
              <div key={`player-res-${p.id || pIdx}-${pIdx}`} className="flex justify-between items-center px-4 py-2.5 rounded-2xl bg-transparent backdrop-blur-md border border-primary/10">
                <span className="text-sm font-bold text-foreground/90">{p.name}</span>
                <span className="text-xl font-black text-primary">{p.score} очков</span>
              </div>
            ))}
          </div>

        </div>

        <ScoreCalculationCard 
          score={authoritativeScore || scoreCalculation?.authoritativeScore || (userScore * 100)}
          calculation={scoreCalculation}
          gameTitle="100 к 1"
          isWin={isWin}
        />

        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          <LeafButton 
            variant="primary"
            size="md"
            onClick={async () => {
              if (currentPackId) {
                await deleteGameProgress(effectiveUserId, currentPackId, '100to1');
                await fetch(`/api/game-packs/${currentPackId}/play`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: effectiveUserId, is_replay: true })
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
              if (currentPackId) await deleteGameProgress(effectiveUserId, currentPackId, '100to1');
              navigate('/');
            }} 
            className="flex-1 justify-center"
          >
            В меню
          </LeafButton>
        </div>
      </div>
    );
  }

  const difficultyNames: Record<string, string> = {
    'dummy': 'ИИкра',
    'people': 'Головастик',
    'genius': 'Квант',
    'god': 'Ляга'
  };

  // Determine active board display data: either viewing a past completed round or current round
  const isViewingPastRound = viewingRound !== null && viewingRound !== round;
  const pastRoundData = isViewingPastRound ? completedRoundsHistory.find(r => r.round === viewingRound) : null;

  const displayQuestion = pastRoundData ? pastRoundData.question : question;
  const displayAnswers = pastRoundData ? pastRoundData.answers : answers;
  const displayRoundNum = pastRoundData ? pastRoundData.round : round;
  const displayMistakes = pastRoundData ? pastRoundData.mistakes : mistakes;
  const displayUnlockedHints = pastRoundData ? pastRoundData.unlockedHints : unlockedHints;

  const unrevealedCount = answers.filter(a => !a.revealed).length;
  const remainingCandidatesWithoutHint = answers.filter((a, i) => !a.revealed && !unlockedHints.some(h => h.index === i));

  const hasChat = options.playMode === 'ai' || options.playMode === 'multi';

  const activeTeamTurn: 1 | 2 = currentPlayerIndex % 2 === 1 ? 2 : 1;
  const team1ScoreVal = players[0]?.score || 0;
  const team2ScoreVal = players[1]?.score || 0;
  const team1LabelText = mpRoomData?.team1_name || players[0]?.name || 'Команда 1';
  const team2LabelText = mpRoomData?.team2_name || players[1]?.name || 'Команда 2';
  const isMultiplayerMatch = Boolean(options.playMode === 'multi' || existingMpRoomId);
  const myMpRecord = mpParticipants.find(p => String(p.user_id) === String(effectiveUserId));
  const myMpTeamNum: 1 | 2 = Number(myMpRecord?.team_number) === 2 ? 2 : 1;
  const activeTeamHasOtherRealPlayers =
    isMultiplayerMatch &&
    mpParticipants.some(
      p =>
        (Number(p.team_number) === 2 ? 2 : 1) === activeTeamTurn &&
        String(p.user_id) !== String(effectiveUserId) &&
        !String(p.user_id).endsWith('_self2')
    );
  const canCurrentUserAnswerThisTurn =
    !players[currentPlayerIndex % 2]?.isBot &&
    (!isMultiplayerMatch || myMpTeamNum === activeTeamTurn || !activeTeamHasOtherRealPlayers);

  const centerGameBoardNode = (
    <div className="w-full space-y-5">
      {/* Top Header Strip with Game Info, Active Turn, Multiplier and Round History Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <BubbleElement size="sm" isBadge icon={<HelpCircle size={16} />}>
            Тема: {topic}
          </BubbleElement>
          <BubbleElement size="sm" isBadge active>
            {displayRoundNum === 4 ? 'Игра наоборот' : `Множитель x${displayRoundNum}`}
          </BubbleElement>
          {!isViewingPastRound && (
            <BubbleElement size="sm" isBadge active>
              Сейчас отвечает: {activeTeamTurn === 1 ? team1LabelText : team2LabelText}
            </BubbleElement>
          )}
          {isMultiplayerMatch && !isViewingPastRound && gameState === 'playing' && !isSurrendering && (
            <BubbleElement
              size="sm"
              isBadge
              active={mpTurnTimeLeft <= 15}
              className={mpTurnTimeLeft <= 15 ? '!border-rose-500/60 !text-rose-300 animate-pulse' : ''}
            >
              ⏱️ {mpTurnTimeLeft} сек на ответ
            </BubbleElement>
          )}
        </div>

        {/* Interactive Rounds History Navigator Tabs as Leaf Buttons */}
        <div className="flex flex-wrap items-center gap-2 py-1 max-w-full">
          {[1, 2, 3, 4].map(roundIdx => {
            const isPastCompleted = completedRoundsHistory.some(r => r.round === roundIdx);
            const isCurrent = round === roundIdx;
            const isSelected = viewingRound === roundIdx || (viewingRound === null && isCurrent);
            const isAvailable = isPastCompleted || isCurrent;
            const roundName = ROUND_NAMES[roundIdx] || `Тур ${roundIdx}`;

            return (
              <LeafButton
                key={`round-tab-${roundIdx}`}
                variant={isSelected ? 'primary' : 'glass'}
                size="sm"
                disabled={!isAvailable}
                onClick={() => setViewingRound(roundIdx === round ? null : roundIdx)}
                className={`text-sm font-bold shrink-0 transition-all ${
                  !isAvailable ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
                }`}
                icon={isPastCompleted ? <Check size={14} strokeWidth={3} className="text-emerald-400" /> : undefined}
              >
                {roundName}
              </LeafButton>
            );
          })}
        </div>
      </div>

      {/* Cascade Indicator Banner (Surrender or 3 Mistakes) */}
      {isSurrendering && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-3xl border border-amber-500/35 bg-transparent backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-black text-sm">
              {surrenderCountdown}с
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {cascadeReason === 'mistakes' 
                  ? 'Завершение тура! Каскадное открытие ответов (без списания ИИрок)...'
                  : 'Каскадное открытие неотвеченных ответов (без списания ИИрок)...'}
              </p>
              <p className="text-sm text-amber-300">
                {surrenderIndex !== null ? `Открыта строка #${surrenderIndex + 1}: «${answers[surrenderIndex]?.text}»` : 'Подготовка...'}
              </p>
            </div>
          </div>

          <LeafButton
            variant="primary"
            size="sm"
            onClick={handleProceedNextRound}
            className="shrink-0 justify-center"
            icon={<ArrowRight size={16} />}
          >
            {round < 4 ? 'Перейти к следующему туру' : 'Завершить игру'}
          </LeafButton>
        </motion.div>
      )}

      {/* Round Completed Review Screen Banner */}
      {gameState === 'round_completed' && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-xl space-y-4"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-primary/20 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BubbleElement active isBadge size="sm">
                  Тур {round} завершён!
                </BubbleElement>
                <span className="text-sm font-bold text-green-400 flex items-center gap-1">
                  <CheckCircle2 size={14} /> Все 6 вариантов открыты на табло
                </span>
              </div>
              <p className="text-sm text-foreground/80 font-medium">
                Ознакомьтесь с результатами и ответами опроса перед переходом к следующему раунду.
              </p>
            </div>

            <LeafButton
              variant="primary"
              size="md"
              onClick={handleProceedNextRound}
              className="shrink-0 text-sm font-bold shadow-lg"
              icon={<ArrowRight size={16} />}
            >
              {round < 4 ? `Перейти к туру ${round + 1} →` : 'Посмотреть итоги игры →'}
            </LeafButton>
          </div>
        </motion.div>
      )}

      {/* Centered Question, Input & Answers Board */}
      <div className="space-y-5">
        {/* Round status & 3D Bubble Mistake Counter */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl p-4">
          <BubbleElement active isBadge size="md">
            {ROUND_NAMES[displayRoundNum] || `Тур ${displayRoundNum}`}
            {isViewingPastRound && ' [История]'}
          </BubbleElement>

          <div className="flex flex-wrap items-center gap-3">
            {isMultiplayerMatch && !isViewingPastRound && (
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80 mr-1">
                <span className={activeTeamTurn === 1 ? 'text-primary font-bold' : ''}>
                  {team1LabelText}: {teamMistakes[0]}/3
                </span>
                <span className="text-foreground/40">•</span>
                <span className={activeTeamTurn === 2 ? 'text-primary font-bold' : ''}>
                  {team2LabelText}: {teamMistakes[1]}/3
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground/70 mr-1">Промахи:</span>
              {[0, 1, 2].map((i) => {
                const activeMistakesCount =
                  isMultiplayerMatch && !isViewingPastRound
                    ? teamMistakes[activeTeamTurn === 2 ? 1 : 0]
                    : displayMistakes;
                const isMistake = i < activeMistakesCount;
              return (
                <div
                  key={`mistake-life-${displayRoundNum}-${i}`}
                  className={`relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ${
                    isMistake ? 'scale-105' : 'opacity-70'
                  }`}
                  style={{
                    background: isMistake
                      ? 'radial-gradient(circle at 35% 30%, rgba(239, 68, 68, 0.95) 0%, rgba(185, 28, 28, 0.7) 65%, rgba(40, 10, 10, 0.5) 100%)'
                      : 'radial-gradient(circle at 35% 30%, rgba(153, 208, 55, 0.25) 0%, rgba(80, 125, 42, 0.12) 60%, rgba(10, 15, 8, 0.2) 100%)',
                    boxShadow: isMistake
                      ? 'inset -2px -2px 6px rgba(0, 0, 0, 0.6), inset 2px 2px 4px rgba(255, 255, 255, 0.6), 0 0 12px rgba(239, 68, 68, 0.5)'
                      : 'inset -2px -2px 5px rgba(0, 0, 0, 0.4), inset 2px 2px 3px rgba(153, 208, 55, 0.3), 0 0 6px rgba(153, 208, 55, 0.1)',
                    border: isMistake ? '1.5px solid rgba(255, 255, 255, 0.8)' : '1px solid rgba(153, 208, 55, 0.35)',
                  }}
                >
                  <span className="absolute top-[12%] left-[12%] w-[25%] h-[25%] rounded-full bg-white/60 blur-[0.5px] pointer-events-none" />
                  <X 
                    size={16} 
                    className={`relative z-10 font-black ${isMistake ? 'text-white' : 'text-primary/40'}`} 
                    strokeWidth={3}
                  />
                </div>
              );
            })}
            </div>
          </div>
        </div>

        {/* Question Card */}
        <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-xl p-6 sm:p-7 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 pb-3">
            <BubbleElement size="sm" isBadge active>
              Вопрос • {ROUND_NAMES[displayRoundNum] || `Тур ${displayRoundNum}`}
            </BubbleElement>
            <BubbleElement size="sm" isBadge>
              {isViewingPastRound 
                ? 'Завершённый тур' 
                : unrevealedCount > 0 
                ? `Осталось отгадать: ${unrevealedCount}` 
                : 'Все открыты'}
            </BubbleElement>
          </div>

          <h3 className="text-lg sm:text-xl font-bold leading-relaxed text-foreground">
            {displayQuestion}
          </h3>

          {/* AI Hint Triggers inside question block */}
          {!isViewingPastRound && (
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-primary/15">
              <LeafButton
                variant="glass"
                size="sm"
                onClick={displayUnlockedHints.length > 0 ? () => setShowAiHintModal(true) : handleRequestAIHint}
                disabled={unrevealedCount === 0 || isSurrendering || isGeneratingHint}
                icon={isGeneratingHint ? <Loader2 size={16} className="animate-spin" /> : <Lightbulb size={16} className={displayUnlockedHints.length > 0 ? "text-primary fill-primary" : "text-primary"} />}
              >
                {displayUnlockedHints.length > 0 
                  ? `Показать подсказки ИИ (${displayUnlockedHints.length})` 
                  : 'Подсказка ИИ (1 ИИкра)'}
              </LeafButton>

              {displayUnlockedHints.length > 0 && remainingCandidatesWithoutHint.length > 0 && (
                <LeafButton
                  variant="glass"
                  size="sm"
                  onClick={handleRequestAIHint}
                  disabled={isSurrendering || isGeneratingHint}
                  className="text-sm"
                  icon={isGeneratingHint ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-primary" />}
                >
                  Ещё (+1 ИИкра)
                </LeafButton>
              )}
            </div>
          )}
        </div>

        {/* User Input & Controls - shown when actively playing current round */}
        {!isViewingPastRound && gameState === 'playing' ? (
          <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="block text-sm font-bold text-primary tracking-wide">
                Ответ для: {activeTeamTurn === 1 ? team1LabelText : team2LabelText}
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {isMultiplayerMatch && (
                  <BubbleElement
                    isBadge
                    active={mpTurnTimeLeft <= 15}
                    size="sm"
                    className={mpTurnTimeLeft <= 15 ? '!border-rose-500/60 !text-rose-300' : ''}
                  >
                    ⏱️ {mpTurnTimeLeft} сек
                  </BubbleElement>
                )}
                <BubbleElement isBadge active size="sm">
                  Поочерёдный ход команд
                </BubbleElement>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full">
              <input 
                type="text" 
                value={userAnswer}
                onChange={e => setUserAnswer(e.target.value)}
                placeholder={
                  players[currentPlayerIndex % 2]?.isBot
                    ? "ИИ думает над ответом..."
                    : !canCurrentUserAnswerThisTurn
                    ? `Сейчас отвечает ${activeTeamTurn === 1 ? team1LabelText : team2LabelText}...`
                    : `Введите ответ (${activeTeamTurn === 1 ? team1LabelText : team2LabelText})...`
                }
                disabled={checking || isSurrendering || !canCurrentUserAnswerThisTurn}
                className="w-full flex-1 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md px-4 py-3 text-sm sm:text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                onKeyDown={e => e.key === 'Enter' && canCurrentUserAnswerThisTurn && handleAnswer()}
              />
              <VoiceInputBubble
                onTranscript={(text) => setUserAnswer(text)}
                disabled={checking || isSurrendering || !canCurrentUserAnswerThisTurn}
                currentValue={userAnswer}
                size="md"
                tooltip="🎤 Начать запись"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 w-full">
              <LeafButton 
                variant="primary"
                size="md"
                onClick={() => handleAnswer()}
                disabled={!userAnswer || checking || isSurrendering || !canCurrentUserAnswerThisTurn}
                className="w-full justify-center text-sm font-bold shadow-md min-h-[44px]"
                icon={checking ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              >
                Ответить
              </LeafButton>

              <LeafButton
                variant="glass"
                size="md"
                onClick={() => setShowSurrenderModal(true)}
                disabled={checking || isSurrendering || unrevealedCount === 0}
                className="w-full justify-center text-sm font-bold text-foreground/80 hover:text-foreground border-primary/25 min-h-[44px]"
                icon={<Flag size={16} className="text-primary" />}
              >
                Сдаться
              </LeafButton>
            </div>

            {!canCurrentUserAnswerThisTurn && isMultiplayerMatch && (
              <p className="text-sm text-primary/90 font-semibold flex items-center gap-1.5 pt-1">
                <Users size={15} className="text-primary shrink-0" />
                <span>Сейчас ход команды «{activeTeamTurn === 1 ? team1LabelText : team2LabelText}». Ожидание их ответа...</span>
              </p>
            )}

            {players[currentPlayerIndex % 2]?.isBot && (
              <p className="text-sm text-primary/80 italic flex items-center gap-1.5 pt-1">
                <Sparkles size={14} className="animate-pulse text-primary" />
                Ход бота {players[currentPlayerIndex % 2]?.name}...
              </p>
            )}
          </div>
        ) : isViewingPastRound ? (
          <div className="rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 shadow-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-foreground/80">
              <Eye size={18} className="text-primary" />
              <span>Просмотр истории тура {displayRoundNum}</span>
            </div>
            <LeafButton
              variant="primary"
              size="sm"
              onClick={() => setViewingRound(null)}
              className="text-sm font-bold"
            >
              Вернуться к туру {round}
            </LeafButton>
          </div>
        ) : (
          <div className="rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 shadow-xl flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-foreground/80">
              Тур {round} завершён
            </span>
            <LeafButton
              variant="primary"
              size="sm"
              onClick={handleProceedNextRound}
              className="text-sm font-bold"
              icon={<ArrowRight size={14} />}
            >
              {round < 4 ? `Перейти к туру ${round + 1}` : 'Итоги игры'}
            </LeafButton>
          </div>
        )}

        {/* Answers Board Module as Bubble Components (Centered) */}
        <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-primary/15">
            <span className="text-sm font-bold text-primary">
              Табло популярных ответов
            </span>
            <BubbleElement size="sm" isBadge>
              {displayAnswers.filter(a => a.revealed).length} / 6 открыто
            </BubbleElement>
          </div>

          <div className="grid gap-3">
            {displayAnswers.map((answer, idx) => {
              const isPlayerGuessed = answer.revealed && answer.revealedBy === 'player';
              const isHostRevealed = answer.revealed && answer.revealedBy === 'host';
              const displayPoints = getRoundAnswerPoints(displayRoundNum, idx, answer.points);

              return (
                <motion.div 
                  key={`answer-slot-r${displayRoundNum}-${idx}-${answer.text || idx}`} 
                  initial={{ scale: 0.97, opacity: 0.8 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  className="space-y-2"
                >
                  <BubbleElement
                    isBadge
                    active={isPlayerGuessed}
                    size="md"
                    className={`w-full !justify-between !px-4 sm:!px-5 !py-3 min-h-[54px] sm:min-h-[58px] !rounded-full transition-all duration-300 ${
                      isPlayerGuessed
                        ? 'shadow-[0_0_20px_rgba(153,208,55,0.4)]'
                        : isHostRevealed
                        ? '!border-amber-500/40 !bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                        : answer.revealed
                        ? 'shadow-[0_0_12px_rgba(153,208,55,0.25)]'
                        : '!border-primary/20 !bg-transparent backdrop-blur-md opacity-85'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-3 z-10">
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <span className={`w-8 h-8 rounded-full font-black text-sm flex items-center justify-center shrink-0 border ${
                          isPlayerGuessed
                            ? 'bg-black/20 text-black border-black/30'
                            : isHostRevealed
                            ? 'bg-amber-500/25 text-amber-300 border-amber-500/40'
                            : answer.revealed
                            ? 'bg-primary/25 text-primary border-primary/40'
                            : 'bg-transparent text-foreground/40 border-primary/20'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className={`text-sm sm:text-base font-bold truncate ${
                          isPlayerGuessed 
                            ? 'text-black font-black' 
                            : isHostRevealed
                            ? 'text-amber-200'
                            : answer.revealed 
                            ? 'text-foreground font-black' 
                            : 'text-foreground/40 tracking-wider'
                        }`}>
                          {answer.revealed ? answer.text : '••••••••••••'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isHostRevealed && (
                          <span className="text-sm font-semibold text-amber-300/90 hidden sm:inline-block">
                            (открыто ведущим)
                          </span>
                        )}
                        <span className={`text-sm sm:text-base font-black px-2.5 py-1 rounded-full ${
                          isPlayerGuessed 
                            ? 'bg-black/20 text-black' 
                            : isHostRevealed 
                            ? 'bg-amber-500/25 text-amber-300' 
                            : answer.revealed 
                            ? 'bg-primary/25 text-primary' 
                            : 'text-foreground/30'
                        }`}>
                          {answer.revealed ? displayPoints : '—'}
                        </span>
                      </div>
                    </div>
                  </BubbleElement>
                  
                  <AnimatePresence>
                    {answer.revealed && answer.mediaUrl && (
                      <motion.div
                        key={`media-r${displayRoundNum}-${idx}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md"
                      >
                        {answer.mediaType === 'video' ? (
                          <video 
                            src={answer.mediaUrl} 
                            controls 
                            autoPlay 
                            className="w-full aspect-video object-cover"
                          />
                        ) : (
                          <img 
                            src={answer.mediaUrl} 
                            alt={answer.text} 
                            className="w-full h-40 object-cover"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const centerChatNode = hasChat ? (
    <div className="h-[380px] sm:h-[420px] w-full">
      <GameChat
        compact
        title="Чат игры"
        messages={chatMessages}
        onSendMessage={handleSendMessage}
        currentUser={{
          id: String(effectiveUserId || '1'),
          name: profile?.display_name || 'Игрок 1',
          avatar: profile?.avatar_url
        }}
      />
    </div>
  ) : null;

  return (
    <div className="w-full max-w-none transition-all duration-300 space-y-6">
      <CoinAnimation show={showCoinAnimation} />

      <AnimatePresence>
        {/* 1. Modal for Checking User Answer */}
        <CheckingAnswerModal
          key="modal-checking-100to1"
          isOpen={checking}
          timerSeconds={checkTimer}
          showTimeoutActions={isCheckTimedOut}
          onRetry={() => handleAnswer()}
          onSkip={() => {
            setChecking(false);
            setFeedback({ isCorrect: false, explanation: 'Проверка пропущена пользователем.' });
            setGameState('feedback');
          }}
        />

        {/* 2. Modal Showing Cumulative AI Hints */}
        {showAiHintModal && (
          <motion.div 
            key="modal-ai-hints-100to1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-[100dvh] z-[9998] flex items-center justify-center bg-transparent p-4 m-0 overflow-hidden"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-lg rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.4)] space-y-5 flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-primary/15 shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-primary animate-pulse" size={22} />
                  <h3 className="text-lg sm:text-xl font-black text-primary">
                    Подсказки ИИ ({unlockedHints.length})
                  </h3>
                </div>
                <BubbleElement isBadge size="sm" active>
                  Тур {round}
                </BubbleElement>
              </div>

              {allHintsExhaustedModal && (
                <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-sm font-semibold flex items-center gap-2.5 shrink-0">
                  <AlertCircle size={18} className="shrink-0 text-amber-400" />
                  <span>Все подсказки к неоткрытым ответам текущего тура уже получены!</span>
                </div>
              )}

              <div className="overflow-y-auto pr-1 space-y-3 flex-1 min-h-[120px]">
                {unlockedHints.length === 0 ? (
                  <p className="text-sm text-foreground/60 text-center py-6">
                    Подсказок пока нет. Нажмите «Получить подсказку», чтобы увидеть наводящий логический вопрос к одному из скрытых вариантов.
                  </p>
                ) : (
                  unlockedHints
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((h, idx) => {
                      const isRevealed = answers[h.index]?.revealed;
                      return (
                        <div 
                          key={`hint-${h.position}-${idx}`} 
                          className={`p-4 rounded-2xl border transition-all backdrop-blur-md space-y-2 ${
                            isRevealed 
                              ? 'border-primary/15 bg-transparent opacity-70' 
                              : 'border-primary/30 bg-primary/10 shadow-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <BubbleElement isBadge size="sm" active={!isRevealed}>
                                Ответ #{h.position}
                              </BubbleElement>
                              {isRevealed && (
                                <span className="text-sm font-bold text-green-400 flex items-center gap-1">
                                  <CheckCircle2 size={14} /> Открыт
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-bold text-primary/80">
                              +{h.points} очков
                            </span>
                          </div>
                          <p className="text-sm font-medium text-foreground leading-relaxed italic">
                            "{h.hint}"
                          </p>
                        </div>
                      );
                    })
                )}
              </div>

              <div className="pt-2 border-t border-primary/15 flex flex-col sm:flex-row gap-3 shrink-0">
                {remainingCandidatesWithoutHint.length > 0 && (
                  <LeafButton
                    variant="primary"
                    size="md"
                    onClick={handleRequestAIHint}
                    disabled={isGeneratingHint}
                    className="flex-1 justify-center text-sm"
                    icon={isGeneratingHint ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  >
                    Ещё подсказка (1 ИИкра)
                  </LeafButton>
                )}
                <LeafButton
                  variant="glass"
                  size="md"
                  onClick={() => {
                    setShowAiHintModal(false);
                    setAllHintsExhaustedModal(false);
                  }}
                  className="flex-1 justify-center text-sm"
                >
                  Вернуться к игре
                </LeafButton>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 3. Surrender Confirmation Modal */}
        {showSurrenderModal && (
          <motion.div 
            key="modal-surrender-100to1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-[100dvh] z-[9998] flex items-center justify-center bg-transparent p-4 m-0 overflow-hidden"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-6 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.4)] space-y-5"
            >
              <div className="flex items-center gap-3 pb-3 border-b border-primary/15">
                <div className="p-2.5 rounded-2xl bg-primary/15 text-primary border border-primary/30">
                  <Flag size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-foreground">
                    Сдаться в туре {round}?
                  </h3>
                  <p className="text-sm text-foreground/70">
                    Досрочное завершение текущего раунда
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-transparent backdrop-blur-md border border-white/10 text-sm text-foreground/90 font-medium leading-relaxed space-y-2">
                {isMultiplayerMatch ? (
                  <>
                    <p>
                      Вашей команде («<strong className="text-primary font-bold">{activeTeamTurn === 1 ? team1LabelText : team2LabelText}</strong>») будут засчитаны <strong className="text-primary font-bold">3 ошибки подряд</strong> без открытия всех 6 полей, а ход перейдёт другой команде (60 секунд на ответ).
                    </p>
                    <p className="text-primary/90 font-semibold">
                      Если вторая команда также нажмёт «Сдаться» или не ответит за 60 секунд — всем начисляется 0 очков за тур, а неоткрытые ответы откроются каскадно без списания ИИрок.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      Все неоткрытые ответы (<strong className="text-primary font-bold">{unrevealedCount}</strong> шт.) будут открыты каскадной анимацией (по 5 секунд на каждый ответ).
                    </p>
                    <p className="text-primary/90 font-semibold">
                      ИИрки за каскадное открытие неотвеченных полей не списываются.
                    </p>
                  </>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <LeafButton
                  variant="glass"
                  size="md"
                  onClick={() => setShowSurrenderModal(false)}
                  className="flex-1 justify-center text-sm"
                >
                  Отмена
                </LeafButton>
                <LeafButton
                  variant="primary"
                  size="md"
                  onClick={() => handleSurrenderAction()}
                  className="flex-1 justify-center text-sm"
                  icon={<Flag size={16} />}
                >
                  Да, сдаться
                </LeafButton>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 4. Feedback Modal */}
        {gameState === 'feedback' && feedback && (
          <motion.div 
            key="modal-feedback-100to1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-[100dvh] z-[9997] flex items-center justify-center bg-transparent p-4 m-0 overflow-hidden"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-lg rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.37)]"
            >
              <div className="flex flex-col items-center text-center">
                {feedback.isCorrect ? (
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                    <CheckCircle2 size={40} />
                  </div>
                ) : (
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <X size={40} />
                  </div>
                )}
                
                <h3 className={`text-2xl font-black ${feedback.isCorrect ? 'text-green-400' : 'text-rose-400'}`}>
                  {feedback.isCorrect ? 'Верно!' : 'Неверно!'}
                </h3>
                
                {feedback.isCorrect && feedback.points && (
                  <p className="mt-2 text-xl font-bold text-primary">
                    +{feedback.points} очков ({activeTeamTurn === 1 ? team1LabelText : team2LabelText})
                  </p>
                )}

                <div className="mt-4 max-h-48 overflow-y-auto pr-2 text-sm leading-relaxed text-foreground/80 font-medium">
                  {feedback.explanation}
                </div>

                <div className="mt-8 w-full">
                  <LeafButton
                    variant="primary"
                    size="md"
                    onClick={handleContinueFromFeedback}
                    className="w-full justify-center"
                  >
                    Продолжить (ход переходит к {activeTeamTurn === 1 ? team2LabelText : team1LabelText})
                  </LeafButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main 3-Column Layout: Left Team 1, Center Question/Answers + Chat, Right Team 2 */}
      {options.playMode === 'multi' || Boolean(existingMpRoomId) ? (
        <MultiplayerGameWebcamStrip
          roomId={mpRoomId}
          gameId="100to1"
          gameTitle={`Сто Квадному: ${topic}`}
          currentUser={{
            uid: String(effectiveUserId),
            display_name: profile?.display_name || 'Игрок 1',
            avatar_url: profile?.avatar_url
          }}
          localRound={round}
          totalRounds={4}
          localScore={Math.max(team1ScoreVal, team2ScoreVal)}
          localCorrectCount={answers.filter(a => a.revealed && a.revealedBy === 'player').length}
          localIsFinished={false}
          isLobby={false}
          maxPlayers={mpMaxPlayers}
          hideProgressBlock={true}
          teamSplitLayout={true}
          team1Score={team1ScoreVal}
          team2Score={team2ScoreVal}
          activeTeamTurn={activeTeamTurn}
          team1Label={team1LabelText}
          team2Label={team2LabelText}
          centerContent={centerGameBoardNode}
          chatWidget={centerChatNode}
          onOpenInvite={() => setIsMpInviteOpen(true)}
          onRoomStateSync={(data) => {
            if (data.room) {
              setMpRoomData(data.room);
              const tState = (data.room as any).team_game_state;
              if (tState && Number(tState.updated_at) > lastTeamSyncAtRef.current) {
                lastTeamSyncAtRef.current = Number(tState.updated_at);
                if (typeof tState.round === 'number' && tState.round >= 1 && tState.round <= 4) {
                  setRound(tState.round);
                }
                if (typeof tState.question === 'string' && tState.question) {
                  setQuestion(tState.question);
                }
                if (Array.isArray(tState.answers) && tState.answers.length > 0) {
                  setAnswers(tState.answers);
                }
                if (typeof tState.mistakes === 'number') {
                  setMistakes(tState.mistakes);
                }
                if (typeof tState.team1_mistakes === 'number' || typeof tState.team2_mistakes === 'number') {
                  setTeamMistakes(prev => [
                    typeof tState.team1_mistakes === 'number' ? tState.team1_mistakes : prev[0],
                    typeof tState.team2_mistakes === 'number' ? tState.team2_mistakes : prev[1]
                  ]);
                }
                if (typeof tState.team1_surrendered === 'boolean' || typeof tState.team2_surrendered === 'boolean') {
                  setTeamSurrendered(prev => [
                    typeof tState.team1_surrendered === 'boolean' ? tState.team1_surrendered : prev[0],
                    typeof tState.team2_surrendered === 'boolean' ? tState.team2_surrendered : prev[1]
                  ]);
                }
                if (Array.isArray(tState.round_base_scores) && tState.round_base_scores.length >= 2) {
                  setRoundBaseScores([
                    Number(tState.round_base_scores[0]) || 0,
                    Number(tState.round_base_scores[1]) || 0
                  ]);
                }
                if (typeof tState.turn_deadline === 'number' && tState.turn_deadline > 0) {
                  setMpTurnDeadline(tState.turn_deadline);
                  setMpTurnTimeLeft(Math.max(0, Math.ceil((tState.turn_deadline - Date.now()) / 1000)));
                }
                if (typeof tState.is_cascading === 'boolean') {
                  if (tState.is_cascading && !isSurrendering) {
                    setCascadeReason(tState.cascade_reason === 'mistakes' ? 'mistakes' : 'surrender');
                    setIsSurrendering(true);
                  } else if (!tState.is_cascading && isSurrendering) {
                    setIsSurrendering(false);
                    setSurrenderIndex(null);
                  }
                }
                if (tState.active_team === 1 || tState.active_team === 2) {
                  setCurrentPlayerIndex(tState.active_team === 2 ? 1 : 0);
                }
                if (typeof tState.team1_score === 'number' || typeof tState.team2_score === 'number') {
                  setPlayers(prev => {
                    const norm = normalizeTwoTeams(prev);
                    return [
                      { ...norm[0], score: typeof tState.team1_score === 'number' ? tState.team1_score : norm[0].score },
                      { ...norm[1], score: typeof tState.team2_score === 'number' ? tState.team2_score : norm[1].score }
                    ];
                  });
                }
              }
            }
            if (Array.isArray(data.participants)) {
              setMpParticipants(data.participants);
            }
            if (Array.isArray(data.chatMessages)) {
              setChatMessages(data.chatMessages);
            }
          }}
        />
      ) : (
        <div className="w-full flex flex-col lg:flex-row items-start gap-6">
          {/* Left Column: Team 1 Score & Card */}
          <div className="w-full lg:w-[270px] xl:w-[310px] 2xl:w-[340px] shrink-0 space-y-3 order-2 lg:order-1">
            <div
              className={`rounded-3xl border p-4 backdrop-blur-2xl transition-all ${
                activeTeamTurn === 1 && !isViewingPastRound
                  ? 'border-primary bg-primary/10 shadow-[0_0_25px_rgba(153,208,55,0.25)]'
                  : 'border-primary/25 bg-transparent'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="text-base font-black text-primary block">{team1LabelText}</span>
                  <span className="text-sm font-semibold text-foreground/70 block">
                    {activeTeamTurn === 1 && !isViewingPastRound ? 'Сейчас отвечает' : 'Ожидание хода'}
                  </span>
                </div>
                <div className="px-4 py-2 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-md text-right">
                  <span className="text-sm text-foreground/70 block">Очки</span>
                  <span className="text-2xl font-black text-primary font-mono">{team1ScoreVal}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
              <div className="relative aspect-square rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-4 flex flex-col items-center justify-center text-center gap-3">
                <UserAvatar avatarUrl={profile?.avatar_url} displayName={profile?.display_name || 'Вы'} size="lg" />
                <div>
                  <p className="text-base font-black text-foreground">{profile?.display_name || 'Вы'}</p>
                  <p className="text-sm text-primary font-semibold">{team1LabelText}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Center Column: Question, Input, Answers Board, and Chat below */}
          <div className="w-full flex-1 min-w-0 space-y-5 order-1 lg:order-2">
            {centerGameBoardNode}
            {centerChatNode}
          </div>

          {/* Right Column: Team 2 Score & Card */}
          <div className="w-full lg:w-[270px] xl:w-[310px] 2xl:w-[340px] shrink-0 space-y-3 order-3">
            <div
              className={`rounded-3xl border p-4 backdrop-blur-2xl transition-all ${
                activeTeamTurn === 2 && !isViewingPastRound
                  ? 'border-primary bg-primary/10 shadow-[0_0_25px_rgba(153,208,55,0.25)]'
                  : 'border-primary/25 bg-transparent'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="text-base font-black text-primary block">{team2LabelText}</span>
                  <span className="text-sm font-semibold text-foreground/70 block">
                    {activeTeamTurn === 2 && !isViewingPastRound ? 'Сейчас отвечает' : 'Ожидание хода'}
                  </span>
                </div>
                <div className="px-4 py-2 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-md text-right">
                  <span className="text-sm text-foreground/70 block">Очки</span>
                  <span className="text-2xl font-black text-primary font-mono">{team2ScoreVal}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
              <div className="relative aspect-square rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-4 flex flex-col items-center justify-center text-center gap-3">
                <UserAvatar
                  avatarUrl={players[1]?.avatar || profile?.avatar_url}
                  displayName={players[1]?.isBot ? players[1].name : (profile?.display_name || 'Команда 2')}
                  size="lg"
                />
                <div>
                  <p className="text-base font-black text-foreground">
                    {players[1]?.isBot ? players[1].name : `${profile?.display_name || 'Вы'} (2-я команда)`}
                  </p>
                  <p className="text-sm text-primary font-semibold">{team2LabelText}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(options.playMode === 'multi' || Boolean(existingMpRoomId)) && (
        <>
          <VideoInviteModal
            isOpen={isMpInviteOpen}
            onClose={() => setIsMpInviteOpen(false)}
            currentUser={{
              uid: String(effectiveUserId),
              display_name: profile?.display_name || 'Ведущий',
              avatar_url: profile?.avatar_url
            }}
            roomId={mpRoomId}
            roomTitle={`Сто Квадному: ${topic}`}
            roomType="100to1"
            gameId="100to1"
            invitePath={`/multiplayer/room/${mpRoomId}`}
          />
          <ZoomVideoModal
            isOpen={isMpZoomOpen}
            onClose={() => setIsMpZoomOpen(false)}
            currentUser={{
              uid: String(effectiveUserId),
              display_name: profile?.display_name || 'Ведущий',
              avatar_url: profile?.avatar_url
            }}
            roomId={mpRoomId}
            roomTitle={`Лобби Сто Квадному: ${topic}`}
            roomType="100to1"
            gameId="100to1"
            maxPlayers={mpMaxPlayers}
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
