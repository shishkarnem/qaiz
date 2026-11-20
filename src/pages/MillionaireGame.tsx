import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { protalkService } from '../services/protalk';
import { balanceService } from '../services/balanceService';
import { HelpCircle, AlertCircle, CheckCircle2, XCircle, RotateCcw, Coins, Sparkles, Trophy, ArrowRight, Gamepad2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { saveGameSession, saveGameProgress, getGameProgress, deleteGameProgress } from '../db';
import { GameError } from '../components/GameError';
import { GenerationLoadingScreen } from '../components/GenerationLoadingScreen';
import { CheckingAnswerModal } from '../components/CheckingAnswerModal';
import { InsufficientBalanceModal } from '../components/InsufficientBalanceModal';
import { CoinAnimation } from '../components/CoinAnimation';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { BubbleCurrencyIcon } from '../components/BubbleIcon';
import { ScoreCalculationCard } from '../components/ScoreCalculationCard';
import { fetchGameScoringRule, GameScoringRule, calculateAuthoritativeScoreClient, ScoreCalculationResult } from '../utils/gameScoring';
import { audioSystem } from '../hooks/useSound';

const PRIZES = [
  100, 200, 300, 500, 1000,
  2000, 4000, 8000, 16000, 32000,
  64000, 125000, 250000, 500000, 1000000
];

const SAFE_LEVELS = [4, 9]; // indices of fireproof levels (1000 and 32000)

const HOST_PHRASES = [
  "Хм, интересный выбор...",
  "Вы уверены? Давайте подумаем ещё раз...",
  "Это ваш окончательный ответ?",
  "Зал замер в ожидании...",
  "Камеры направлены на вас...",
  "Ваш ответ заставляет задуматься...",
  "Давайте проверим, что скажет компьютер...",
  "Напряжение нарастает...",
  "Один неверный шаг — и всё может измениться...",
  "Публика затаила дыхание...",
  "Интуиция или знание? Сейчас узнаем...",
  "Этот вопрос стоил многим участникам победы...",
  "Вижу сомнение в ваших глазах...",
  "Время покажет, правы ли вы...",
  "Ставки высоки, а ответ — рядом...",
  "Мурашки по коже от этого момента...",
  "Помните, вы всегда можете забрать деньги...",
  "Какой поворот событий!",
  "Я бы на вашем месте тоже волновался...",
  "Последний шанс передумать...",
  "Компьютер обрабатывает ваш ответ...",
  "Сердце бьётся быстрее, не так ли?",
  "Этот вопрос — один из самых коварных...",
  "Все глаза устремлены на табло...",
  "Момент истины приближается...",
  "Какая развязка нас ждёт?",
  "Зрители дома тоже переживают за вас...",
  "Внимание, сейчас будет ответ...",
  "Судьба миллиона решается прямо сейчас...",
  "Ваш выбор может войти в историю...",
  "Дрожь в руках — это нормально...",
  "Нервы из стали? Проверим!",
  "Три... два... один...",
  "Барабанная дробь!",
  "Ответ принят. Обрабатываем...",
  "Сможете ли вы удержать эту сумму?",
  "Аплодисменты или вздох разочарования?",
  "В студии повисла тишина...",
  "Каждая секунда — как вечность...",
  "Готовы узнать результат?"
];

function getRandomPhrases(count: number): string[] {
  const shuffled = [...HOST_PHRASES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function cleanOptionText(text: any): string {
  if (!text || typeof text !== 'string') return '';
  let str = text.trim();

  // 1. Never strip standalone acronyms or abbreviations with dots (e.g. "Щ.И.Т.", "С.Ш.А.", "U.S.A.", "Р.Ф.")
  if (/^[a-zA-Zа-яА-ЯёЁ]\.([a-zA-Zа-яА-ЯёЁ]\.?)+$/i.test(str)) {
    return str;
  }

  // 2. If it starts with initials (e.g. "А. С. Пушкин" or "А.С. Пушкин"), keep it
  // unless explicitly prefixed by an option marker like "А. А. С. Пушкин"
  if (/^[a-zA-Zа-яА-ЯёЁ]\.\s*[a-zA-Zа-яА-ЯёЁ]\.\s+[a-zA-Zа-яА-ЯёЁ]+/i.test(str)) {
    if (!/^[a-dA-Dа-гА-Г1-4][\)\.\:\-]\s+[a-zA-Zа-яА-ЯёЁ]\.\s*[a-zA-Zа-яА-ЯёЁ]\./i.test(str)) {
      return str;
    }
  }

  // 3. Remove "Вариант А: " / "Вариант 1. "
  str = str.replace(/^вариант\s+[a-dA-Dа-гА-Г1-4][\:\.\-]?\s+/i, '');

  // 4. Remove [A] or (A) prefixes: "[А] Париж" -> "Париж"
  str = str.replace(/^\[[a-dA-Dа-гА-Г1-4]\]\s+/i, '');
  str = str.replace(/^\([a-dA-Dа-гА-Г1-4]\)\s+/i, '');

  // 5. Remove single option letter/number prefix ONLY if it's A-D, А-Г, 1-4
  // followed by dot/paren/colon/dash AND mandatory whitespace (\s+)
  str = str.replace(/^[a-dA-Dа-гА-Г1-4][\)\.\:\-]\s+/i, '');

  return str.trim();
}

function sanitizeAndShuffleMillionaireQuestions(rawList: any[], shouldShuffle: boolean = true): any[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map((q: any) => {
    let rawOptions: string[] = [];
    if (Array.isArray(q.options)) {
      rawOptions = q.options;
    } else if (q.options_json) {
      try {
        const parsed = JSON.parse(q.options_json);
        if (Array.isArray(parsed)) rawOptions = parsed;
      } catch (_) {}
    }

    const qText = q.text || q.question || q.prompt || '';
    let rawCorrect = q.correctAnswer || q.correct_answer || q.answer || '';
    
    // Heal corrupted acronyms if explanation has original acronym (e.g. Щ.И.Т.)
    const expText = q.explanation || q.comment || q.fact || '';
    if (expText.includes('Щ.И.Т.')) {
      rawOptions = rawOptions.map(o => (o === 'И.Т.' || o === 'Т.') ? 'Щ.И.Т.' : o);
      if (rawCorrect === 'И.Т.' || rawCorrect === 'Т.') {
        rawCorrect = 'Щ.И.Т.';
      }
    }

    const trimmed = String(rawCorrect).trim();
    const letterMap: Record<string, number> = {
      'a': 0, 'а': 0, '1': 0,
      'b': 1, 'б': 1, '2': 1,
      'c': 2, 'в': 2, '3': 2,
      'd': 3, 'г': 3, '4': 3
    };
    
    if (trimmed.length === 1 && letterMap[trimmed.toLowerCase()] !== undefined && rawOptions[letterMap[trimmed.toLowerCase()]]) {
      rawCorrect = rawOptions[letterMap[trimmed.toLowerCase()]];
    } else if (trimmed.length <= 3 && /^[a-dA-Dа-гА-Г1-4][\)\.\:\-]?$/.test(trimmed)) {
      const char = trimmed[0].toLowerCase();
      if (letterMap[char] !== undefined && rawOptions[letterMap[char]]) {
        rawCorrect = rawOptions[letterMap[char]];
      }
    }

    const cleanedCorrect = cleanOptionText(rawCorrect);
    const cleanedOpts = rawOptions.map(cleanOptionText).filter(Boolean);

    let opts = [...cleanedOpts];
    if (cleanedCorrect && !opts.some(o => o.toLowerCase() === cleanedCorrect.toLowerCase())) {
      if (opts.length >= 4) {
        opts[0] = cleanedCorrect;
      } else {
        opts.push(cleanedCorrect);
      }
    }
    while (opts.length < 4) {
      opts.push(`Вариант ${opts.length + 1}`);
    }
    opts = opts.slice(0, 4);

    if (shouldShuffle) {
      // Shuffle options randomly
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
    }

    return {
      ...q,
      text: qText,
      question: qText,
      options: opts,
      correctAnswer: cleanedCorrect || opts[0],
      answer: cleanedCorrect || opts[0],
      hint: q.hint || '',
      explanation: q.explanation || q.comment || ''
    };
  });
}

export function MillionaireGame() {
  const { profile, demoBalance, openDemoExhaustedModal, refetchProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const options = location.state || { mode: 'lite', difficulty: 'people', price: 30 };
  
  const isFreeMode = Boolean(options.isFree || searchParams.get('free') === '1');
  const targetPackId = options.packId || searchParams.get('packId');

  const [currentPackId, setCurrentPackId] = useState<string>(targetPackId || `pack_millionaire_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
  const effectiveUserId = profile?.uid || localStorage.getItem('qaiz_active_user_id') || '10016926299';

  const [gameState, setGameState] = useState<'setup' | 'loading' | 'playing' | 'dramatic_pause' | 'feedback' | 'result' | 'error' | 'already_completed'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [topic, setTopic] = useState(options.topic || 'Общие знания');
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [gameOutcome, setGameOutcome] = useState<{
    isWin: boolean;
    isSuperPrize: boolean;
    finalScore: number;
    earnedPoints?: number;
    correctCount: number;
    totalQuestions: number;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; explanation: string; earnedPrize: number } | null>(null);
  const [hints, setHints] = useState({ fiftyFifty: true, aiHint: true, chatHelp: !isFreeMode });
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
  const [chatHelpLoading, setChatHelpLoading] = useState(false);
  const [chatHelpMessages, setChatHelpMessages] = useState<string[] | null>(null);
  const [showChatHelpInfo, setShowChatHelpInfo] = useState(false);
  const [chatHelpTimer, setChatHelpTimer] = useState(60);
  const chatHelpIntervalRef = useRef<any>(null);

  // Insufficient balance modal
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [insufficientReason, setInsufficientReason] = useState('');

  // Dramatic pause state
  const [pauseTimer, setPauseTimer] = useState(5);
  const [hostPhrase, setHostPhrase] = useState('');
  const pauseIntervalRef = useRef<any>(null);
  const deductedRef = useRef(false);
  const trackedQuestionsRef = useRef<Set<string>>(new Set());

  const [disabledOptions, setDisabledOptions] = useState<string[]>([]);
  const [aiHintText, setAiHintText] = useState<string | null>(null);
  const [hasProgress, setHasProgress] = useState(false);
  const [scoringRule, setScoringRule] = useState<GameScoringRule | null>(null);
  const [scoreCalculation, setScoreCalculation] = useState<ScoreCalculationResult | null>(null);

  useEffect(() => {
    fetchGameScoringRule('millionaire', options?.difficulty || 'people').then(rule => {
      if (rule) setScoringRule(rule);
    });
  }, [options?.difficulty]);

  useEffect(() => {
    if (gameState === 'result' && !scoreCalculation && !isFreeMode) {
      const displayScore = gameOutcome?.finalScore ?? score;
      const displayCorrect = gameOutcome?.correctCount ?? currentIndex;
      calculateAuthoritativeScoreClient({
        gameId: 'millionaire',
        difficulty: options?.difficulty || 'people',
        score: displayScore,
        rawScore: displayScore,
        correctAnswers: displayCorrect,
        totalQuestions: 15,
        isWin: Boolean(gameOutcome?.isWin),
        mode: options?.mode || 'lite'
      }).then(res => {
        if (res) {
          setScoreCalculation(res);
          setGameOutcome(prev => prev ? { ...prev, earnedPoints: res.authoritativeScore } : prev);
        }
      });
    }
  }, [gameState, scoreCalculation, isFreeMode, gameOutcome, score, currentIndex, options?.difficulty, options?.mode]);

  const originalQuestionsRef = useRef<any[]>([]);
  const prevMillIndexRef = useRef<number | null>(null);

  // Preload millionaire audio batch and clear timers on unmount
  useEffect(() => {
    audioSystem.preloadGameBatch('millionaire', false);
    if (isFreeMode) {
      audioSystem.playSlot('mill_free_mode_start');
    }
    return () => {
      if (pauseIntervalRef.current) clearInterval(pauseIntervalRef.current);
      if (chatHelpIntervalRef.current) clearInterval(chatHelpIntervalRef.current);
    };
  }, [isFreeMode]);

  // Millionaire background music & question appear sounds
  useEffect(() => {
    if (gameState === 'setup') {
      audioSystem.playBackground('mill_bg_questions_1_5');
    } else if (gameState === 'playing' || gameState === 'dramatic_pause' || gameState === 'feedback') {
      const bgSlot =
        currentIndex === 14
          ? 'mill_bg_question_15_final'
          : currentIndex >= 10
          ? 'mill_bg_questions_11_14'
          : currentIndex >= 5
          ? 'mill_bg_questions_6_10'
          : 'mill_bg_questions_1_5';
      audioSystem.playBackground(bgSlot);

      if (gameState === 'playing' && prevMillIndexRef.current !== currentIndex) {
        if (prevMillIndexRef.current === null && !isFreeMode) {
          audioSystem.playSlot('mill_lets_play_intro');
        } else {
          audioSystem.playSlot('mill_question_appear');
        }
        prevMillIndexRef.current = currentIndex;
      }
    }
  }, [gameState, currentIndex, isFreeMode]);

  const closeChatHelp = () => {
    if (chatHelpIntervalRef.current) {
      clearInterval(chatHelpIntervalRef.current);
      chatHelpIntervalRef.current = null;
    }
    setChatHelpMessages(null);
  };

  const handleResume = useCallback(async (targetId?: string, forceIndex?: number) => {
    const pId = targetId || options.packId || currentPackId;
    if (!pId) return;
    setGameState('loading');
    try {
      const progress = await getGameProgress(effectiveUserId, pId, 'millionaire');
      let targetIdx = typeof forceIndex === 'number' ? forceIndex : (typeof options.currentIndex === 'number' ? options.currentIndex : undefined);

      if (progress && progress.state) {
        const { questions: savedQ, currentIndex: savedIdx, hints: savedHints, score: savedScore, topic: savedTopic } = progress.state;
        if (Array.isArray(savedQ) && savedQ.length > 0) {
          originalQuestionsRef.current = savedQ;
          setQuestions(savedQ);
          const savedStep = typeof savedIdx === 'number' ? savedIdx : (progress.current_step || 0);
          const finalIdx = (typeof targetIdx === 'number' && targetIdx > 0)
            ? targetIdx
            : (savedStep > 0 ? savedStep : (typeof targetIdx === 'number' ? targetIdx : 0));
          setCurrentIndex(finalIdx);
          if (savedHints) setHints(savedHints);
          if (typeof savedScore === 'number') setScore(savedScore);
          if (savedTopic) setTopic(savedTopic);
          setCurrentPackId(pId);
          setGameState('playing');
          return;
        }
      }

      // If passed questions in options
      if (options?.questions && Array.isArray(options.questions) && options.questions.length > 0) {
        originalQuestionsRef.current = options.questions;
        const sanitized = sanitizeAndShuffleMillionaireQuestions(options.questions);
        setQuestions(sanitized);
        const savedStep = progress?.current_step || 0;
        const finalIdx = (typeof targetIdx === 'number' && targetIdx > 0)
          ? targetIdx
          : (savedStep > 0 ? savedStep : (typeof targetIdx === 'number' ? targetIdx : 0));
        setCurrentIndex(finalIdx);
        setCurrentPackId(pId);
        if (options.topic) setTopic(options.topic);
        setGameState('playing');
        return;
      }

      // Try fetching pack directly from database
      const packRes = await fetch(`/api/game-packs/${pId}`).then(r => r.json()).catch(() => null);
      if (packRes?.data?.questions && Array.isArray(packRes.data.questions) && packRes.data.questions.length > 0) {
        originalQuestionsRef.current = packRes.data.questions;
        const sanitized = sanitizeAndShuffleMillionaireQuestions(packRes.data.questions);
        setQuestions(sanitized);
        const finalIdx = targetIdx !== undefined ? targetIdx : (progress?.current_step || 0);
        setCurrentIndex(finalIdx);
        setCurrentPackId(pId);
        if (packRes.data.topic) setTopic(packRes.data.topic);
        setGameState('playing');
        return;
      }

      startLevel();
    } catch (error) {
      console.error('Error resuming game:', error);
      startLevel();
    }
  }, [effectiveUserId, options.packId, options.questions, options.currentIndex, options.topic, currentPackId]);

  const handleRestartSamePack = async () => {
    const pId = currentPackId || options.packId;
    setGameState('loading');
    setErrorMessage('');
    try {
      if (pId) {
        await deleteGameProgress(effectiveUserId, pId, isFreeMode ? 'free_millionaire' : 'millionaire');
        fetch(`/api/game-packs/${pId}/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: effectiveUserId, is_replay: true })
        }).catch(() => {});
      }

      // 1. Take questions from original unmutated ref or state or options
      let sourceQuestions = (originalQuestionsRef.current && originalQuestionsRef.current.length > 0)
        ? originalQuestionsRef.current
        : (questions && questions.length > 0 ? questions : (options?.questions || []));

      // 2. If not in memory, fetch saved pack from DB by packId
      if ((!sourceQuestions || sourceQuestions.length === 0) && pId) {
        const packRes = await fetch(`/api/game-packs/${pId}`).then(r => r.json()).catch(() => null);
        if (packRes?.data?.questions && Array.isArray(packRes.data.questions) && packRes.data.questions.length > 0) {
          sourceQuestions = packRes.data.questions;
          originalQuestionsRef.current = packRes.data.questions;
        }
      }

      if (sourceQuestions && sourceQuestions.length > 0) {
        const sanitized = sanitizeAndShuffleMillionaireQuestions(sourceQuestions);
        setQuestions(sanitized);
        setCurrentIndex(0);
        setScore(0);
        setHints({ fiftyFifty: true, aiHint: true, chatHelp: !isFreeMode });
        setSelectedOption(null);
        setFeedback(null);
        setDisabledOptions([]);
        setAiHintText(null);
        setGameOutcome(null);
        trackedQuestionsRef.current.clear();
        setGameState('playing');
        return;
      }

      // Strictly never call ProTalk when replaying; report issue if questions truly not found
      setErrorMessage('Не удалось загрузить вопросы текущего пака для перезапуска.');
      setGameState('error');
    } catch (err) {
      console.error('Error restarting pack:', err);
      if (questions && questions.length > 0) {
        const sanitized = sanitizeAndShuffleMillionaireQuestions(questions);
        setQuestions(sanitized);
        setCurrentIndex(0);
        setScore(0);
        setHints({ fiftyFifty: true, aiHint: true, chatHelp: !isFreeMode });
        setSelectedOption(null);
        setFeedback(null);
        setDisabledOptions([]);
        setAiHintText(null);
        setGameOutcome(null);
        trackedQuestionsRef.current.clear();
        setGameState('playing');
      } else {
        setErrorMessage('Не удалось перезапустить игру.');
        setGameState('error');
      }
    }
  };

  const handlePlayAgainSavedPack = handleRestartSamePack;

  // Load progress or determine start state on mount
  useEffect(() => {
    const loadProgress = async () => {
      if (isFreeMode) {
        const freePack = targetPackId || options?.packId;
        if (!freePack) {
          navigate('/free');
          return;
        }
        setGameState('loading');
        try {
          const res = await fetch(`/api/free-games/millionaire/${encodeURIComponent(freePack)}?user_id=${encodeURIComponent(effectiveUserId)}`).then(r => r.json());
          const packData = res?.data?.pack || res?.data;
          if (!packData || !packData.id) {
            navigate('/free');
            return;
          }
          if (res?.data?.is_completed) {
            setGameState('already_completed');
            return;
          }
          const loadedQuestions = packData.questions || res?.data?.questions || [];
          if (!loadedQuestions || loadedQuestions.length === 0) {
            navigate('/free');
            return;
          }
          originalQuestionsRef.current = loadedQuestions;
          const sanitized = sanitizeAndShuffleMillionaireQuestions(loadedQuestions);
          setQuestions(sanitized);
          setCurrentPackId(freePack);
          setTopic(packData.topic || options?.topic || 'Общие знания');

          const step = res?.data?.progress?.current_step || (options?.resume ? (options?.currentIndex || 0) : 0);
          setCurrentIndex(step);
          setScore(0);
          setSelectedOption(null);
          setFeedback(null);
          setDisabledOptions([]);
          setAiHintText(null);
          setHints({ fiftyFifty: true, aiHint: true, chatHelp: false });
          setGameState('playing');
          return;
        } catch (err) {
          console.error('Error loading free game pack:', err);
          navigate('/free');
          return;
        }
      }

      if (options?.resume && options?.packId) {
        await handleResume(options.packId, options.currentIndex);
        return;
      }

      if (options?.isReplay) {
        if (options?.questions && Array.isArray(options.questions) && options.questions.length > 0) {
          originalQuestionsRef.current = options.questions;
          const sanitized = sanitizeAndShuffleMillionaireQuestions(options.questions);
          setQuestions(sanitized);
          setCurrentIndex(0);
          setScore(0);
          setHints({ fiftyFifty: true, aiHint: true, chatHelp: true });
          setSelectedOption(null);
          setFeedback(null);
          setDisabledOptions([]);
          setAiHintText(null);
          if (options.packId) setCurrentPackId(options.packId);
          if (options.topic) setTopic(options.topic);
          setGameState('playing');
          if (options.packId) {
            fetch(`/api/game-packs/${options.packId}/play`, { method: 'POST' }).catch(() => {});
          }
          return;
        }

        if (options?.packId) {
          const packRes = await fetch(`/api/game-packs/${options.packId}`).then(r => r.json()).catch(() => null);
          if (packRes?.data?.questions && Array.isArray(packRes.data.questions) && packRes.data.questions.length > 0) {
            originalQuestionsRef.current = packRes.data.questions;
            const sanitized = sanitizeAndShuffleMillionaireQuestions(packRes.data.questions);
            setQuestions(sanitized);
            setCurrentIndex(0);
            setScore(0);
            setHints({ fiftyFifty: true, aiHint: true, chatHelp: true });
            setSelectedOption(null);
            setFeedback(null);
            setDisabledOptions([]);
            setAiHintText(null);
            setCurrentPackId(options.packId);
            if (packRes.data.topic) setTopic(packRes.data.topic);
            setGameState('playing');
            fetch(`/api/game-packs/${options.packId}/play`, { method: 'POST' }).catch(() => {});
            return;
          }
        }
      }

      if (!options?.packId) return;
      const progress = await getGameProgress(effectiveUserId, options.packId, 'millionaire');
      if (progress && progress.state && Number(progress.is_completed || 0) === 0 && (progress.current_step || 0) > 0) {
        setHasProgress(true);
        setGameState('setup');
      } else {
        setHasProgress(false);
        setGameState('setup');
      }
    };
    loadProgress();
  }, [effectiveUserId, isFreeMode, targetPackId, options?.packId, options?.resume, options?.isReplay, options?.questions, options?.currentIndex, options?.topic, handleResume]);

  const startingRef = useRef(false);

  useEffect(() => {
    if (isFreeMode || targetPackId) return;
    if (gameState === 'loading' && questions.length === 0 && !hasProgress && !options?.resume && !options?.isReplay && !options?.packId) {
      if (startingRef.current) return;
      startingRef.current = true;
      startLevel();
    }
  }, [gameState, questions.length, hasProgress, options?.resume, options?.isReplay, options?.packId, isFreeMode, targetPackId]);

  // Record question view in generated_questions (strictly once per question per session)
  useEffect(() => {
    if (gameState === 'playing' && currentPackId && questions.length > 0 && currentIndex < questions.length) {
      const trackKey = `${currentPackId}_${currentIndex + 1}`;
      if (!trackedQuestionsRef.current.has(trackKey)) {
        trackedQuestionsRef.current.add(trackKey);
        fetch('/api/generated-questions/show', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pack_id: currentPackId,
            question_index: currentIndex + 1,
            user_id: effectiveUserId,
            is_replay: Boolean(options?.isReplay)
          })
        }).catch(() => {});
      }
    }
  }, [currentIndex, gameState, currentPackId, questions.length, effectiveUserId]);

  // Save progress immediately and on every state change (including question 1 / step 0)
  useEffect(() => {
    const saveProgress = async () => {
      if (gameState === 'playing' && currentPackId && questions.length > 0) {
        if (isFreeMode) {
          try {
            await fetch('/api/free-games/millionaire/progress', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: effectiveUserId,
                pack_id: currentPackId,
                current_step: currentIndex,
                total_steps: 15,
                state: {
                  questions,
                  currentIndex,
                  hints,
                  score,
                  topic,
                  difficulty: options.difficulty || 'people'
                },
                is_completed: 0,
                score,
                correct_answers: currentIndex,
                topic
              })
            });
          } catch (e) {
            console.error('Error saving free game progress:', e);
          }
          return;
        }

        await saveGameProgress({
          userId: effectiveUserId,
          packId: currentPackId,
          gameType: 'millionaire',
          currentStep: currentIndex,
          totalSteps: 15,
          state: {
            questions,
            currentIndex,
            hints,
            score,
            topic,
            difficulty: options.difficulty || 'people'
          }
        });
      }
    };
    saveProgress();
  }, [currentIndex, hints, score, gameState, questions, currentPackId, topic, effectiveUserId, options.difficulty, isFreeMode]);

  const checkAndDeductHintCost = async (hintName: string): Promise<boolean> => {
    if (isFreeMode) {
      return true;
    }
    const currentBal = profile ? (profile.balance ?? 0) : demoBalance;
    if (currentBal < 1) {
      setInsufficientReason(`Для использования подсказки «${hintName}» требуется 1 ИИкра`);
      setShowInsufficientModal(true);
      return false;
    }

    try {
      await balanceService.deductBalance(
        effectiveUserId,
        1,
        `Квиллионер: подсказка "${hintName}"`,
        'millionaire'
      );
      triggerCoinAnimation();
      if (profile) {
        (profile as any).balance = Math.max(0, (profile.balance || 0) - 1);
      }
      return true;
    } catch (e: any) {
      setInsufficientReason(`Для использования подсказки «${hintName}» требуется 1 ИИкра`);
      setShowInsufficientModal(true);
      return false;
    }
  };

  const useFiftyFifty = async () => {
    if (!hints.fiftyFifty || selectedOption || gameState !== 'playing') return;
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;

    const ok = await checkAndDeductHintCost('50:50');
    if (!ok) return;

    audioSystem.playSlot('mill_lifeline_5050');
    const correctAnswer = currentQuestion.correctAnswer;
    const incorrectOptions = currentQuestion.options.filter((opt: string) => opt !== correctAnswer);
    // Remove 2 incorrect options
    const toDisable = incorrectOptions.slice(0, 2);
    setDisabledOptions(toDisable);
    setHints(h => ({ ...h, fiftyFifty: false }));
  };

  const useAiHint = async () => {
    if (!hints.aiHint || selectedOption || gameState !== 'playing') return;
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;

    const ok = await checkAndDeductHintCost('Подсказка ИИ');
    if (!ok) return;

    audioSystem.playSlot('mill_lifeline_ai_call');
    setHints(h => ({ ...h, aiHint: false }));
    const hint = currentQuestion.hint || `Обратите внимание на логику вопроса. Скорее всего правильный ответ связан с «${currentQuestion.correctAnswer?.slice(0, 3)}...»`;
    setAiHintText(hint);
  };

  const useChatHelp = async () => {
    setShowChatHelpInfo(false);
    if (!hints.chatHelp || selectedOption || gameState !== 'playing') return;
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;

    const ok = await checkAndDeductHintCost('Помощь чата');
    if (!ok) return;

    audioSystem.playSlot('mill_lifeline_audience');
    setHints(h => ({ ...h, chatHelp: false }));
    setChatHelpLoading(true);
    setChatHelpTimer(60);

    if (chatHelpIntervalRef.current) {
      clearInterval(chatHelpIntervalRef.current);
    }

    chatHelpIntervalRef.current = setInterval(() => {
      setChatHelpTimer(prev => {
        if (prev <= 1) {
          if (chatHelpIntervalRef.current) {
            clearInterval(chatHelpIntervalRef.current);
            chatHelpIntervalRef.current = null;
          }
          setChatHelpMessages(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const chatPrompt = `Вопрос из викторины Квиллионер: "${currentQuestion.text}"
Варианты ответов: ${currentQuestion.options.join(', ')}
Правильный ответ: "${currentQuestion.correctAnswer}"

Ты эмулируешь чат прямого эфира телеигры. Сгенерируй ровно 3 коротких реалистичных комментария от зрителей чата (каждое с ником в формате "Ник: комментарий"). 
Один зритель должен быть уверен в правильном ответе, второй сомневаться или спорить, третий шутить.
Верни только массив из 3 строк в JSON формате: ["Ник1: текст", "Ник2: текст", "Ник3: текст"].`;

      const aiResponse = await protalkService.generateCustomPrompt(chatPrompt, 'chat_help');

      let messages: string[] = [];
      try {
        if (Array.isArray(aiResponse)) {
          messages = aiResponse;
        } else if (typeof aiResponse === 'string') {
          const match = aiResponse.match(/\[[\s\S]*\]/);
          if (match) {
            messages = JSON.parse(match[0]);
          } else {
            messages = aiResponse.split('\n').filter(Boolean).slice(0, 3);
          }
        }
      } catch (parseErr) {
        messages = [
          `Зритель_77: Я точно знаю, это "${currentQuestion.correctAnswer}"!`,
          `Скептик: Не уверен, тут может быть подвох...`,
          `Мемолог: Ставлю свой чай на то, что это правильный ответ 😂`
        ];
      }

      if (!messages || messages.length === 0) {
        messages = [
          `Зритель_77: Я точно знаю, это "${currentQuestion.correctAnswer}"!`,
          `Скептик: Не уверен, тут может быть подвох...`,
          `Мемолог: Ставлю свой чай на то, что это правильный ответ 😂`
        ];
      }

      setChatHelpMessages(messages);
    } catch (err) {
      setChatHelpMessages([
        `Зритель_77: Я точно знаю, это "${currentQuestion.correctAnswer}"!`,
        `Скептик: Не уверен, тут может быть подвох...`,
        `Мемолог: Ставлю свой чай на то, что это правильный ответ 😂`
      ]);
    } finally {
      setChatHelpLoading(false);
    }
  };

  const startLevel = async () => {
    setGameState('loading');
    setErrorMessage('');
    setScore(0);
    setHints({ fiftyFifty: true, aiHint: true, chatHelp: true });
    setSelectedOption(null);
    setFeedback(null);
    setDisabledOptions([]);
    setAiHintText(null);
    trackedQuestionsRef.current.clear();

    const newPackId = `pack_millionaire_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    setCurrentPackId(newPackId);

    try {
      const allQuestions = await protalkService.generateQuestions(
        topic,
        options.difficulty || 'people',
        15,
        'millionaire',
        undefined,
        newPackId,
        effectiveUserId,
        options?.note
      );

      if (!allQuestions || allQuestions.length === 0) {
        throw new Error('Не удалось сгенерировать вопросы. Пожалуйста, попробуйте другую тему.');
      }
      originalQuestionsRef.current = allQuestions;
      const sanitized = sanitizeAndShuffleMillionaireQuestions(allQuestions);
      setQuestions(sanitized);
      setCurrentIndex(0);
      setGameState('playing');
    } catch (error: any) {
      console.error('Error generating questions:', error);
      setErrorMessage(error?.message || String(error));
      setGameState('error');
    }
  };

  const triggerCoinAnimation = () => {
    setShowCoinAnimation(true);
    setTimeout(() => setShowCoinAnimation(false), 1500);
  };

  const handleOptionClick = async (option: string) => {
    if (feedback || selectedOption || gameState !== 'playing') return;
    
    // Check balance for paid questions if not already purchased and not free mode
    const questionCost = (options.isPurchased || isFreeMode) ? 0 : 1;
    if (questionCost > 0) {
      const currentBal = profile ? (profile.balance ?? 0) : demoBalance;
      if (currentBal < 1) {
        setInsufficientReason('Для ответа на вопрос требуется 1 ИИкра');
        setShowInsufficientModal(true);
        return;
      }
    }

    setSelectedOption(option);
    audioSystem.playSlot('mill_option_lock_yellow');
    deductedRef.current = false;
    
    if (questionCost > 0) {
      try {
        await balanceService.deductBalance(
          effectiveUserId, 
          questionCost, 
          `Квиллионер: проверка ответа на вопрос #${currentIndex + 1}`, 
          'millionaire'
        );
        triggerCoinAnimation();
        // Update local profile balance
        if (profile) {
          (profile as any).balance = Math.max(0, (profile.balance || 0) - 1);
        }
        deductedRef.current = true;
      } catch (err) {
        console.error('Error deducting balance for question:', err);
        setInsufficientReason('Для ответа на вопрос требуется 1 ИИкра');
        setShowInsufficientModal(true);
        setSelectedOption(null);
        return;
      }
    }

    // Start dramatic pause with randomized 3 to 10 seconds
    const phrases = getRandomPhrases(2);
    setHostPhrase('');
    const randomDuration = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
    setPauseTimer(randomDuration);
    setGameState('dramatic_pause');

    setTimeout(() => setHostPhrase(phrases[0]), 1000);
    if (randomDuration > 5) {
      setTimeout(() => setHostPhrase(phrases[1]), 4000);
    }

    const currentQuestion = questions[currentIndex];
    let countdown = randomDuration;
    if (pauseIntervalRef.current) clearInterval(pauseIntervalRef.current);
    pauseIntervalRef.current = setInterval(() => {
      countdown--;
      setPauseTimer(countdown);
      if (countdown <= 0) {
        clearInterval(pauseIntervalRef.current);
        pauseIntervalRef.current = null;
        
        const normalizeAnswer = (s: string) => {
          if (!s || typeof s !== 'string') return '';
          const cleaned = cleanOptionText(s);
          return cleaned
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[\s\.,\/#!$%\^&\*;:{}=\-_`~()«»""'']/g, '')
            .trim();
        };

        const normOpt = normalizeAnswer(option);
        const normCorrect = normalizeAnswer(currentQuestion.correctAnswer);
        const isCorrect = normOpt === normCorrect || 
                          (normOpt.length > 3 && normCorrect.includes(normOpt)) || 
                          (normCorrect.length > 3 && normOpt.includes(normCorrect));

        // Record question answer in generated_questions analytics
        if (currentPackId) {
          fetch('/api/generated-questions/answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pack_id: currentPackId,
              question_index: currentIndex + 1,
              user_id: effectiveUserId,
              user_answer: option,
              is_correct: isCorrect
            })
          }).catch(() => {});
        }

        const earned = isCorrect ? PRIZES[currentIndex] : 0;
        if (isCorrect) {
          setScore(earned);
          audioSystem.playSlot('mill_answer_correct');
          if (currentIndex === 4) {
            setTimeout(() => audioSystem.playSlot('mill_milestone_5_reached'), 350);
          } else if (currentIndex === 9) {
            setTimeout(() => audioSystem.playSlot('mill_milestone_10_reached'), 350);
          }
        } else {
          audioSystem.playSlot('mill_answer_wrong');
        }

        const factText = currentQuestion.explanation || currentQuestion.comment || currentQuestion.fact || '';
        setFeedback({
          isCorrect,
          earnedPrize: earned,
          explanation: isCorrect
            ? (factText ? `Правильно! ${factText}` : 'Правильно!')
            : `Неверно. Правильный ответ: ${currentQuestion.correctAnswer}.${factText ? ` ${factText}` : ''}`
        });
        setGameState('feedback');
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (pauseIntervalRef.current) clearInterval(pauseIntervalRef.current);
    };
  }, []);

  const handleContinueToNextQuestion = () => {
    if (currentIndex < 14) {
      setCurrentIndex(i => i + 1);
      setSelectedOption(null);
      setFeedback(null);
      setDisabledOptions([]);
      setAiHintText(null);
      setGameState('playing');
    } else {
      // Completed all 15 questions!
      finishGame(true, PRIZES[14], 15);
    }
  };

  const handleTakeMoney = async () => {
    audioSystem.playSlot('mill_take_money');
    const currentPrize = PRIZES[currentIndex];
    // Answered currentIndex + 1 questions correctly
    await finishGame(true, currentPrize, currentIndex + 1);
  };

  const handleTakeMoneyFromGame = async () => {
    if (currentIndex === 0) return;
    audioSystem.playSlot('mill_take_money');
    const currentPrize = PRIZES[currentIndex - 1];
    // Answered currentIndex questions correctly (from 0 to currentIndex - 1)
    await finishGame(true, currentPrize, currentIndex);
  };

  const handleDefeatFinish = async () => {
    let finalScore = 0;
    if (currentIndex >= 10) finalScore = PRIZES[9];
    else if (currentIndex >= 5) finalScore = PRIZES[4];
    await finishGame(false, finalScore, currentIndex);
  };

  const finishGame = async (isWin: boolean, finalScore: number, explicitCorrectCount?: number) => {
    const correctCount = typeof explicitCorrectCount === 'number' 
      ? explicitCorrectCount 
      : (isWin ? Math.min(15, currentIndex + 1) : currentIndex);

    const isTopPrize = finalScore >= 1000000 || correctCount >= 15;
    const finalWin = isWin || isTopPrize || finalScore >= 32000;
    if (isFreeMode) {
      audioSystem.playSlot('mill_free_mode_complete');
    } else if (isTopPrize || finalWin) {
      audioSystem.playSlot('mill_win_million');
    } else {
      audioSystem.playSlot('mill_answer_wrong');
    }
    const mult = scoringRule?.multiplier ?? 0.1;
    const earnedPoints = isFreeMode ? 0 : Math.round(finalScore * mult);

    setGameOutcome({
      isWin: finalWin,
      isSuperPrize: isTopPrize,
      finalScore,
      earnedPoints,
      correctCount,
      totalQuestions: 15
    });
    setScore(finalScore);

    if (isFreeMode) {
      try {
        await fetch('/api/free-games/millionaire/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: effectiveUserId,
            pack_id: currentPackId,
            current_step: 15,
            total_steps: 15,
            is_completed: 1,
            score: finalScore,
            correct_answers: correctCount,
            is_win: isTopPrize || finalWin ? 1 : 0,
            topic: options.topic || topic
          })
        });
      } catch (err) {
        console.error('Error recording free game completion:', err);
      }
      setGameState('result');
      return;
    }

    // Save definitive session in database (earned points calculated by database multiplier)
    const saved = await saveGameSession({
      userId: effectiveUserId,
      gameId: 'millionaire',
      score: earnedPoints,
      rawScore: finalScore,
      totalQuestions: 15,
      correctAnswers: correctCount,
      mode: options.mode || 'lite',
      difficulty: options.difficulty || 'people',
      topic: options.topic || topic,
      pricePaid: options.price || 0,
      isWin: finalWin,
      packId: currentPackId
    });

    if (saved?.calculation) {
      setScoreCalculation(saved.calculation);
      if (saved.score !== undefined) {
        setGameOutcome(prev => prev ? { ...prev, earnedPoints: saved.score } : prev);
      }
    } else {
      const calc = await calculateAuthoritativeScoreClient({
        gameId: 'millionaire',
        difficulty: options.difficulty || 'people',
        score: finalScore,
        rawScore: finalScore,
        correctAnswers: correctCount,
        totalQuestions: 15,
        isWin: finalWin,
        mode: options.mode || 'lite'
      });
      if (calc) {
        setScoreCalculation(calc);
        setGameOutcome(prev => prev ? { ...prev, earnedPoints: calc.authoritativeScore } : prev);
      }
    }

    // Clean up active progress so game is strictly marked as finished
    if (currentPackId) {
      await deleteGameProgress(effectiveUserId, currentPackId, 'millionaire');
    }

    try {
      await refetchProfile?.();
    } catch (e) {
      console.error('Error refetching profile:', e);
    }

    setGameState('result');
  };

  if (gameState === 'already_completed') {
    return (
      <div className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.37)] text-center">
        <div className="w-16 h-16 mx-auto rounded-3xl border border-primary/35 bg-transparent backdrop-blur-xl flex items-center justify-center text-primary shadow-[0_0_20px_rgba(153,208,55,0.3)]">
          <CheckCircle2 size={36} className="text-emerald-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-foreground">Игра Freeлионер уже сыграна</h2>
          <p className="text-base text-foreground/75 max-w-md mx-auto leading-relaxed">
            По правилам бесплатных игр, завершенные викторины нельзя перепроходить заново. Выберите другую интересную тему в каталоге Freeлионер!
          </p>
        </div>
        <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
          <LeafButton
            variant="primary"
            size="md"
            onClick={() => navigate('/free')}
            icon={<Gamepad2 size={18} />}
          >
            В каталог бесплатных игр
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
    );
  }

  if (gameState === 'setup') {
    return (
      <div className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-primary/25 bg-background/25 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.37)]">
        <div className="text-center space-y-2">
          <h2 className="text-3xl sm:text-4xl font-black text-primary">Квиллионер</h2>
          <p className="text-sm text-foreground/70">15 вопросов с 4 вариантами ответов и несгораемыми суммами.</p>
        </div>
        <input 
          type="text" 
          value={topic} 
          onChange={e => setTopic(e.target.value)}
          placeholder="Тема игры..."
          className="w-full rounded-2xl border border-primary/25 bg-background/40 p-4 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
        />
        <div className="flex flex-col gap-3 pt-2">
          {hasProgress ? (
            <>
              <LeafButton 
                variant="glass"
                size="lg"
                onClick={() => handleResume()}
                icon={<RotateCcw size={20} />}
                className="w-full justify-center text-amber-300 border-amber-500/40"
              >
                Продолжить прошлую игру (вопрос {currentIndex + 1}/15)
              </LeafButton>
              <LeafButton 
                variant="glass"
                size="lg"
                onClick={handlePlayAgainSavedPack}
                icon={<RotateCcw size={20} />}
                className="w-full justify-center"
              >
                Заново прошлую игру
              </LeafButton>
            </>
          ) : (
            (options?.packId || questions.length > 0) && (
              <LeafButton 
                variant="glass"
                size="lg"
                onClick={handlePlayAgainSavedPack}
                icon={<RotateCcw size={20} />}
                className="w-full justify-center"
              >
                Заново прошлую игру
              </LeafButton>
            )
          )}
          <LeafButton 
            variant="primary"
            size="lg"
            onClick={startLevel}
            icon={<Sparkles size={20} />}
            className="w-full justify-center"
          >
            Начать новую игру
          </LeafButton>
        </div>
      </div>
    );
  }

  if (gameState === 'loading') {
    if (isFreeMode || targetPackId) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-4">
          <div className="w-full max-w-md p-8 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl border border-primary/30 flex items-center justify-center text-primary animate-spin">
              <Sparkles size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-foreground">Загрузка игры...</h3>
              <p className="text-sm text-foreground/60">Подготавливаем 15 вопросов Freeлионера</p>
            </div>
          </div>
        </div>
      );
    }
    return (
      <GenerationLoadingScreen 
        gameId="millionaire"
        title="Квиллионер"
        messages={[
          'Подключаемся к ИИ...',
          'Генерируем 15 вопросов...',
          'Калибруем сложность...',
          'Проверяем варианты ответов...',
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
          onRetry={currentPackId || options?.packId ? handleRestartSamePack : startLevel} 
          onReturn={() => navigate('/')} 
        />
      </div>
    );
  }

  if (gameState === 'result') {
    const isSuperPrize = gameOutcome?.isSuperPrize ?? (score >= 1000000 || (gameOutcome?.correctCount ?? 0) >= 15);
    const isWin = gameOutcome?.isWin ?? (isSuperPrize || score >= 32000);
    const displayScore = gameOutcome?.finalScore ?? score;
    const displayCorrect = gameOutcome?.correctCount ?? (isSuperPrize ? 15 : currentIndex + (isWin ? 1 : 0));
    const gameName = isFreeMode ? 'Freeлионере' : 'Квиллионере';

    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-8 sm:p-12 text-center space-y-6">
        <div className="flex justify-center">
          {isSuperPrize ? (
            <BubbleElement isBadge size="md" icon={<Trophy size={18} className="text-primary" />}>
              Суперприз!
            </BubbleElement>
          ) : isWin ? (
            <BubbleElement isBadge size="md" icon={<Trophy size={18} className="text-emerald-400" />}>
              Победа!
            </BubbleElement>
          ) : (
            <BubbleElement isBadge size="md" icon={<XCircle size={18} className="text-rose-400" />}>
              Игра завершена
            </BubbleElement>
          )}
        </div>

        <div>
          <h2 className="text-3xl sm:text-4xl font-black text-primary">
            {isSuperPrize 
              ? 'Вы выиграли 1 000 000!'
              : isWin 
              ? 'Вы сорвали куш!' 
              : 'Игра завершена'
            }
          </h2>
          <p className="mt-2 text-sm text-foreground/75 leading-relaxed max-w-md mx-auto">
            {isSuperPrize
              ? `Поздравляем с триумфом! Вы правильно ответили на все 15 вопросов в ${gameName}!`
              : isWin 
              ? `Отличный результат! Ваш выигрыш зафиксирован в ${gameName}.`
              : 'Не расстраивайтесь! Следующая попытка обязательно будет победной.'
            }
          </p>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 space-y-4 text-left">
          <div className="space-y-1">
            <span className="text-sm font-bold text-primary/80">Несгораемые суммы:</span>
            <p className="text-sm text-foreground/90 font-medium leading-relaxed">
              1 000 (вопрос 5) и 32 000 (вопрос 10). Суперприз: 1 000 000.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-primary/10">
            <div>
              <span className="text-sm text-foreground/60 block">Выигрыш в викторине:</span>
              <p className="text-2xl sm:text-3xl font-black text-primary">{displayScore.toLocaleString('ru-RU')}</p>
            </div>
            <div>
              <span className="text-sm text-foreground/60 block">Пройдено вопросов:</span>
              <p className="text-2xl sm:text-3xl font-black text-foreground">{displayCorrect}/15</p>
            </div>
          </div>
        </div>

        {!isFreeMode && (
          <ScoreCalculationCard 
            score={gameOutcome?.earnedPoints ?? scoreCalculation?.authoritativeScore ?? Math.round(displayScore * 0.1)}
            calculation={scoreCalculation}
            gameTitle="Квиллионер"
            isWin={isWin}
          />
        )}

        <div className="flex flex-col sm:flex-row justify-center gap-3.5 pt-4">
          {isFreeMode ? (
            <>
              <LeafButton 
                variant="primary"
                size="md"
                onClick={() => navigate('/free')}
                icon={<Gamepad2 size={18} />}
                className="justify-center text-sm font-bold"
              >
                В каталог Freeлионер
              </LeafButton>
              <LeafButton 
                variant="glass"
                size="md"
                onClick={() => navigate('/')}
                className="justify-center text-sm font-bold"
              >
                На главную
              </LeafButton>
            </>
          ) : (
            <>
              <LeafButton 
                variant="glass"
                size="md"
                onClick={() => navigate('/profile/history')}
                className="justify-center text-sm font-bold"
              >
                История сессий
              </LeafButton>
              <LeafButton 
                variant="primary"
                size="md"
                onClick={handleRestartSamePack}
                icon={<RotateCcw size={18} />}
                className="justify-center text-sm font-bold"
              >
                Заново
              </LeafButton>
            </>
          )}
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];

  // Prize ladder component with compact 1-line format & BubbleCurrencyIcon
  const PrizeLadder = ({ mobile = false }: { mobile?: boolean }) => {
    if (mobile) {
      return (
        <div className="lg:hidden rounded-3xl border border-primary/20 bg-background/25 backdrop-blur-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground/80">Вопрос {currentIndex + 1}/15</span>
            <BubbleElement isBadge active size="sm" className="px-3 py-1 text-sm">
              <span className="flex items-center gap-1.5">
                <BubbleCurrencyIcon className="w-3.5 h-3.5" />
                <span>{PRIZES[currentIndex].toLocaleString()}</span>
              </span>
            </BubbleElement>
          </div>
          <div className="grid grid-cols-5 gap-1.5 pt-1">
            {PRIZES.map((prize, i) => {
              const isCurrent = i === currentIndex;
              const isPassed = i < currentIndex;
              const isSafe = SAFE_LEVELS.includes(i);
              return (
                <BubbleElement
                  key={`millionaire-mob-prize-${i}`}
                  isBadge
                  active={isCurrent}
                  size="sm"
                  className={`w-full justify-center py-1 px-1 text-sm font-bold ${
                    isCurrent
                      ? 'scale-105 z-10'
                      : isPassed
                        ? 'opacity-90 text-primary border-primary/40'
                        : isSafe
                          ? 'border-primary/50 text-primary font-black'
                          : 'opacity-40 text-foreground/60'
                  }`}
                >
                  {i + 1}
                </BubbleElement>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="hidden lg:block">
        <div className="sticky top-20 rounded-3xl border border-primary/20 bg-background/25 backdrop-blur-2xl p-3.5 space-y-1 shadow-xl">
          <p className="text-sm font-black text-primary text-center mb-2">Лестница призов</p>
          <div className="flex flex-col gap-1">
            {[...PRIZES].reverse().map((prize, reverseIdx) => {
              const i = 14 - reverseIdx;
              const isCurrent = i === currentIndex;
              const isPassed = i < currentIndex;
              const isSafe = SAFE_LEVELS.includes(i);
              const prizeText = prize.toLocaleString();

              return (
                <div
                  key={`millionaire-desk-prize-${i}`}
                  className={`relative flex items-center justify-between gap-1.5 px-2.5 py-1 rounded-full border transition-all duration-200 select-none ${
                    isCurrent
                      ? 'border-white/80 shadow-[0_0_14px_rgba(153,208,55,0.8)] scale-[1.03] z-10'
                      : isPassed
                        ? 'border-primary/35 text-primary opacity-85'
                        : isSafe
                          ? 'border-primary/45 text-primary font-bold opacity-100'
                          : 'border-white/10 text-foreground/70 opacity-60'
                  }`}
                  style={{
                    background: isCurrent
                      ? 'radial-gradient(circle at 35% 30%, rgba(153, 208, 55, 0.95) 0%, rgba(90, 140, 40, 0.75) 65%, rgba(15, 25, 10, 0.5) 100%)'
                      : isPassed
                        ? 'rgba(153, 208, 55, 0.12)'
                        : isSafe
                          ? 'rgba(153, 208, 55, 0.08)'
                          : 'rgba(255, 255, 255, 0.03)',
                    boxShadow: isCurrent
                      ? 'inset -1px -1px 4px rgba(0, 0, 0, 0.5), inset 1px 1px 3px rgba(255, 255, 255, 0.6)'
                      : 'none'
                  }}
                >
                  {/* Glare for current bubble row */}
                  {isCurrent && (
                    <span className="absolute top-[15%] left-[8%] w-[16%] h-[24%] rounded-full bg-white/60 blur-[0.4px] pointer-events-none" />
                  )}

                  {/* 1. Step number + safe milestone indicator */}
                  <div className="flex items-center gap-1 min-w-[26px] shrink-0">
                    <span className={`text-sm font-black ${isCurrent ? 'text-black font-black' : isSafe ? 'text-primary' : 'text-foreground/80'}`}>
                      {i + 1}
                    </span>
                    {isSafe && <span className={`text-xs leading-none ${isCurrent ? 'text-black' : 'text-primary'}`}>◆</span>}
                  </div>

                  {/* 2. Bubble icon */}
                  <BubbleCurrencyIcon className="w-3.5 h-3.5 shrink-0" />

                  {/* 3. Prize amount strictly on 1 line */}
                  <span className={`text-sm font-mono font-bold tracking-tight text-right flex-1 whitespace-nowrap ${
                    isCurrent ? 'text-black font-black' : isSafe ? 'text-primary font-black' : 'text-foreground/90'
                  }`}>
                    {prizeText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
      {/* Coin fly animation */}
      <CoinAnimation show={showCoinAnimation} amount={1} />

      {/* Main game area */}
      <div className="space-y-6">
        <AnimatePresence>
          {/* Dramatic pause - Checking Answer */}
          {gameState === 'dramatic_pause' && (
            <CheckingAnswerModal
              key="checking-modal-millionaire"
              isOpen={true}
              title="ИИ проверяет ваш ответ..."
              subtitle={hostPhrase ? `«${hostPhrase}» (${pauseTimer}с)` : `Ожидание решения ведущего (${pauseTimer}с)`}
            />
          )}

          {/* Unified Merged Feedback & Choice Modal */}
          {gameState === 'feedback' && feedback && (
            <motion.div 
              key="feedback-modal-millionaire"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4"
            >
              <motion.div 
                key="feedback-modal-millionaire-inner"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-lg rounded-3xl border border-primary/30 bg-background/25 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.37)] space-y-6 text-center"
              >
                {/* Result Status Header */}
                <div className="flex flex-col items-center">
                  {feedback.isCorrect ? (
                    <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 size={40} />
                    </div>
                  ) : (
                    <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      <XCircle size={40} />
                    </div>
                  )}
                  
                  <h3 className={`text-2xl sm:text-3xl font-black ${feedback.isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {feedback.isCorrect ? 'Правильно!' : 'Неверно!'}
                  </h3>

                  {feedback.isCorrect && (
                    <p className="text-2xl font-black text-primary mt-1">
                      +{PRIZES[currentIndex].toLocaleString()}
                    </p>
                  )}
                </div>

                {/* If incorrect: explicitly display the actual correct answer */}
                {!feedback.isCorrect && (
                  <div className="rounded-2xl border border-rose-500/30 bg-transparent backdrop-blur-md p-4 text-center space-y-1">
                    <span className="text-sm font-bold text-rose-400 block">
                      Правильный ответ:
                    </span>
                    <p className="text-base font-black text-foreground">
                      {currentQuestion.correctAnswer}
                    </p>
                  </div>
                )}

                {/* Explanation text */}
                {feedback.explanation && (
                  <div className="max-h-40 overflow-y-auto rounded-2xl bg-transparent backdrop-blur-md border border-primary/15 p-4 text-sm leading-relaxed text-foreground/80 font-medium text-left">
                    <span className="text-sm text-primary font-bold block mb-1">
                      {feedback.isCorrect ? 'Пояснение:' : 'Факты и предыстория:'}
                    </span>
                    {feedback.explanation}
                  </div>
                )}

                {/* Safe level note if applicable */}
                {feedback.isCorrect && SAFE_LEVELS.includes(currentIndex) && (
                  <BubbleElement isBadge active size="md" className="px-4 py-2 text-sm font-bold w-full justify-center">
                    ◆ Поздравляем! Достигнута несгораемая сумма {PRIZES[currentIndex].toLocaleString()}!
                  </BubbleElement>
                )}

                {/* Unified Action Buttons */}
                <div className="space-y-3 pt-2">
                  {feedback.isCorrect ? (
                    currentIndex < 14 ? (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <LeafButton
                          variant="primary"
                          size="md"
                          onClick={handleContinueToNextQuestion}
                          icon={<ArrowRight size={18} />}
                          className="flex-1 justify-center"
                        >
                          Играть дальше (на {PRIZES[currentIndex + 1].toLocaleString()})
                        </LeafButton>
                        <LeafButton
                          variant="glass"
                          size="md"
                          onClick={handleTakeMoney}
                          className="flex-1 justify-center text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10"
                        >
                          Забрать {PRIZES[currentIndex].toLocaleString()}
                        </LeafButton>
                      </div>
                    ) : (
                      <LeafButton
                        variant="primary"
                        size="md"
                        onClick={handleContinueToNextQuestion}
                        icon={<Trophy size={18} />}
                        className="w-full justify-center"
                      >
                        Завершить игру и забрать суперприз 1 000 000!
                      </LeafButton>
                    )
                  ) : (
                    <LeafButton
                      variant="primary"
                      size="md"
                      onClick={handleDefeatFinish}
                      className="w-full justify-center"
                    >
                      Завершить игру
                    </LeafButton>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Question Card */}
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-primary/20 bg-background/25 backdrop-blur-2xl p-6 md:p-8 shadow-2xl"
        >
          <div className="text-center mb-4">
            <span className="text-sm font-black text-primary/70">Вопрос {currentIndex + 1}/15</span>
            <span className="mx-2 text-primary/30">•</span>
            <span className="text-sm font-black text-primary">{PRIZES[currentIndex].toLocaleString()}</span>
          </div>
          <p className="text-center text-lg md:text-xl font-bold leading-relaxed">{currentQuestion?.text}</p>
        </motion.div>

        {/* 4 Options as LeafButton */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {currentQuestion?.options?.map((opt: string, i: number) => {
            const isDisabled = disabledOptions.includes(opt);
            const isSelected = selectedOption === opt;
            const letter = ['А', 'Б', 'В', 'Г'][i] || ['A', 'B', 'C', 'D'][i];
            
            return (
              <LeafButton
                key={`millionaire-option-q${currentIndex}-idx${i}-${opt}`}
                active={isSelected}
                variant={isSelected ? 'primary' : 'glass'}
                size="lg"
                disabled={isDisabled || !!selectedOption}
                onClick={() => handleOptionClick(opt)}
                className={`w-full text-left justify-start px-6 py-4 min-h-[64px] transition-all ${
                  isDisabled ? 'opacity-25 pointer-events-none' : ''
                }`}
              >
                <div className="flex items-center gap-3 w-full">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-black shrink-0 ${
                    isSelected ? 'bg-black/30 text-black' : 'bg-primary/20 text-primary'
                  }`}>
                    {letter}
                  </span>
                  <span className={`font-bold text-sm sm:text-base leading-snug flex-1 ${
                    isSelected ? 'text-black' : 'text-foreground'
                  }`}>
                    {opt}
                  </span>
                </div>
              </LeafButton>
            );
          })}
        </div>

        {/* Hints as BubbleElement */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <BubbleElement
            size="md"
            onClick={useFiftyFifty}
            disabled={!hints.fiftyFifty || !!selectedOption}
            active={!hints.fiftyFifty}
            className="text-sm py-2"
            title={isFreeMode ? "Убрать 2 неверных варианта (бесплатно)" : "Убрать 2 неверных варианта (1 ИИкра)"}
          >
            {isFreeMode ? "50:50" : "50:50 (1 ИИкра)"}
          </BubbleElement>
          <BubbleElement
            size="md"
            onClick={useAiHint}
            disabled={!hints.aiHint || !!selectedOption}
            active={!hints.aiHint}
            className="text-sm py-2"
            title={isFreeMode ? "Получить подсказку ИИ (бесплатно)" : "Получить подсказку ИИ (1 ИИкра)"}
          >
            {isFreeMode ? "Подсказка ИИ" : "Подсказка ИИ (1 ИИкра)"}
          </BubbleElement>
          {!isFreeMode && (
            <BubbleElement
              size="md"
              onClick={() => setShowChatHelpInfo(true)}
              disabled={!hints.chatHelp || !!selectedOption}
              active={!hints.chatHelp}
              className="text-sm py-2"
              title="Сообщения из чата зрителей (1 ИИкра)"
            >
              💬 Помощь чата (1 ИИкра)
            </BubbleElement>
          )}
          {currentIndex > 0 && !isFreeMode && (
            <BubbleElement
              size="md"
              onClick={handleTakeMoneyFromGame}
              disabled={!!selectedOption}
              className="text-sm py-2 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/15"
            >
              Забрать {PRIZES[currentIndex - 1].toLocaleString()}
            </BubbleElement>
          )}
        </div>

        {/* AI Hint text */}
        {aiHintText && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-primary/20 bg-background/25 backdrop-blur-xl p-4 text-center"
          >
            <p className="text-sm font-bold text-primary">Подсказка ИИ:</p>
            <p className="mt-1 text-sm text-foreground/80 font-medium">{aiHintText}</p>
          </motion.div>
        )}

        {/* Chat Help Info Modal */}
        <AnimatePresence>
          {showChatHelpInfo && (
            <motion.div key="chat-help-info-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4">
              <motion.div key="chat-help-info-modal-inner" initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full max-w-md rounded-3xl border border-primary/30 bg-background/25 backdrop-blur-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.37)] space-y-4">
                <h3 className="text-xl font-bold text-primary">Помощь зрительского чата (1 ИИкра)</h3>
                <p className="text-sm text-foreground/80 leading-relaxed font-medium">
                  ИИ сгенерирует 3 последних сообщения из зрительского чата по текущему вопросу. 
                  Сообщения могут содержать явные подсказки, намёки или шутки. Стоимость: 1 ИИкра.
                </p>
                <div className="flex gap-3 pt-2">
                  <LeafButton variant="primary" size="sm" onClick={useChatHelp} className="flex-1 justify-center">Использовать (1 ИИкра)</LeafButton>
                  <BubbleElement size="sm" onClick={() => setShowChatHelpInfo(false)} className="flex-1 justify-center">Отмена</BubbleElement>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Chat Help Loading */}
          {chatHelpLoading && (
            <CheckingAnswerModal
              key="chat-help-checking-modal"
              isOpen={true}
              title="Загружаем чат зрителей..."
              subtitle={`Анализ сообщений зрителей (${chatHelpTimer}с)`}
            />
          )}

          {/* Chat Help Result */}
          {chatHelpMessages && !chatHelpLoading && (
            <motion.div key="chat-help-result-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4">
              <motion.div key="chat-help-result-modal-inner" initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full max-w-md rounded-3xl border border-primary/30 bg-background/25 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.37)] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-primary">💬 Сообщения из чата</h3>
                  <BubbleElement size="sm" isBadge className="px-3 py-1 text-sm font-mono font-bold text-primary border-primary/30">
                    ⏱ {chatHelpTimer}с
                  </BubbleElement>
                </div>
                <div className="space-y-2.5">
                  {chatHelpMessages.map((msg, i) => (
                    <motion.div key={`chat-msg-${i}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.2 }} className="rounded-2xl bg-primary/10 border border-primary/20 p-3.5">
                      <p className="text-sm text-foreground/90 font-medium leading-relaxed">{msg}</p>
                    </motion.div>
                  ))}
                </div>
                <LeafButton variant="primary" size="sm" onClick={closeChatHelp} className="w-full justify-center">
                  Закрыть ({chatHelpTimer}с)
                </LeafButton>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Prize Ladder */}
      <PrizeLadder />
      <PrizeLadder mobile />

      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        isOpen={showInsufficientModal}
        onClose={() => setShowInsufficientModal(false)}
        requiredAmount={1}
        currentBalance={profile ? (profile.balance ?? 0) : demoBalance}
        actionDescription={insufficientReason}
      />
    </div>
  );
}
