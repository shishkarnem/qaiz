import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { protalkService } from '../services/protalk';
import { balanceService } from '../services/balanceService';
import { CoinAnimation } from '../components/CoinAnimation';
import { Timer, Send, AlertCircle, CheckCircle2, XCircle, Users, User, HelpCircle, Zap, Loader2, RotateCcw, Home, Trophy, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { saveGameSession, saveGameProgress, getGameProgress, deleteGameProgress } from '../db';
import { SpinningTable } from '../components/SpinningTable';
import { GenerationLoadingScreen } from '../components/GenerationLoadingScreen';
import { GameError } from '../components/GameError';
import { CheckingAnswerModal } from '../components/CheckingAnswerModal';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { VoiceInputBubble } from '../components/ui/VoiceInputBubble';
import { ScoreCalculationCard } from '../components/ScoreCalculationCard';
import { InsufficientBalanceModal } from '../components/InsufficientBalanceModal';
import { isExactOrCloseAnswerMatch, getRandomCheckSeconds, runSimulatedCheckCountdown, startAICheckCountdown } from '../utils/answerVerification';
import { GameChat, ChatMessage } from '../components/GameChat';
import { fetchGameScoringRule, GameScoringRule, calculateAuthoritativeScoreClient, ScoreCalculationResult } from '../utils/gameScoring';
import { audioSystem } from '../hooks/useSound';

export function WhatWhereWhenGame() {
  const { profile, user, demoBalance, openDemoExhaustedModal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const options = location.state || { mode: 'human', difficulty: 'genius', price: 33 };

  const currentUserId = String(profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299');

  const [packId, setPackId] = useState<string>(() => {
    return options?.packId || `pack_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  });

  const [gameState, setGameState] = useState<'setup' | 'loading' | 'playing' | 'feedback' | 'result' | 'error'>(() => {
    if (options?.resume && Array.isArray(options?.questions) && options.questions.length > 0) return 'playing';
    return options ? 'loading' : 'setup';
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [topic, setTopic] = useState(options.topic || 'Логика и факты');
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [insufficientReason, setInsufficientReason] = useState('');
  const [insufficientAmount, setInsufficientAmount] = useState(1);
  const [expertScore, setExpertScore] = useState<number>(() => {
    if (options?.resume && typeof options.score === 'number') return options.score;
    return 0;
  });
  const [viewerScore, setViewerScore] = useState<number>(() => {
    if (options?.resume && typeof options.viewerScore === 'number') return options.viewerScore;
    return 0;
  });
  const [questions, setQuestions] = useState<any[]>(() => {
    if (options?.resume && Array.isArray(options?.questions) && options.questions.length > 0) {
      return options.questions;
    }
    return [];
  });
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (options?.resume && typeof options.currentIndex === 'number') {
      return options.currentIndex;
    }
    return 0;
  });
  const [userAnswer, setUserAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; explanation: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkTimer, setCheckTimer] = useState<number>(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isTableCentered, setIsTableCentered] = useState(false);
  const [answeredIndices, setAnsweredIndices] = useState<number[]>(() => {
    if (options?.resume && Array.isArray(options?.questions)) {
      const ans: number[] = [];
      options.questions.forEach((q: any, idx: number) => {
        if (q.is_answered === 1 || !!q.user_answer || (q.times_correct && q.times_correct > 0) || (q.times_incorrect && q.times_incorrect > 0) || q.is_skipped === 1) {
          ans.push(idx);
        }
      });
      return ans;
    }
    return [];
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
  const [earnedScore, setEarnedScore] = useState<number | null>(null);
  const [scoringRule, setScoringRule] = useState<GameScoringRule | null>(null);
  const [scoreCalculation, setScoreCalculation] = useState<ScoreCalculationResult | null>(null);

  useEffect(() => {
    fetchGameScoringRule('whatwherewhen', options?.difficulty || 'genius').then(rule => {
      if (rule) setScoringRule(rule);
    });
  }, [options?.difficulty]);

  useEffect(() => {
    if (gameState === 'result' && !scoreCalculation) {
      const expertWon = expertScore >= 6;
      const basePoints = Math.max(0, (expertScore * 200) - (viewerScore * 200));
      calculateAuthoritativeScoreClient({
        gameId: 'whatwherewhen',
        difficulty: options?.difficulty || 'genius',
        score: basePoints,
        correctAnswers: expertScore,
        totalQuestions: expertScore + viewerScore,
        isWin: expertWon,
        mode: options?.mode || 'human'
      }).then(res => {
        if (res) {
          setScoreCalculation(res);
          setEarnedScore(res.authoritativeScore);
        }
      });
    }
  }, [gameState, scoreCalculation, expertScore, viewerScore, options?.difficulty, options?.mode]);

  const startingRef = useRef(false);
  const timeoutHandledRef = useRef<number | null>(null);
  const trackedQuestionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    audioSystem.preloadGameBatch('whatwherewhen', false);
  }, []);

  useEffect(() => {
    if (gameState === 'setup') {
      audioSystem.playBackground('www_bg_hall');
    } else if (gameState === 'playing') {
      if (isSpinning) {
        audioSystem.playBackground('www_bg_hall');
      } else {
        audioSystem.playBackground('www_bg_thinking_minute');
      }
    } else if (gameState === 'result') {
      if (expertScore >= 6) {
        audioSystem.playSlot('www_victory_6_points');
      } else {
        audioSystem.playSlot('www_defeat_6_points');
      }
    }
  }, [gameState, isSpinning, expertScore, viewerScore]);

  useEffect(() => {
    timeoutHandledRef.current = null;
  }, [currentIndex]);

  const handleSpinEnd = () => {
    setIsSpinning(false);
    setTimeout(() => {
      setIsTableCentered(false);
      audioSystem.playSlot('www_minute_start_signal');
    }, 600);
  };

  // Synchronize packId if changed in navigation options
  useEffect(() => {
    if (options?.packId && options.packId !== packId) {
      setPackId(options.packId);
    }
  }, [options?.packId, packId]);

  // Load progress on mount or handle replay / resume
  useEffect(() => {
    const loadProgress = async () => {
      const targetPackId = options?.packId || packId;

      if (options?.isReplay && options?.questions && Array.isArray(options.questions) && options.questions.length > 0) {
        setQuestions(options.questions);
        setExpertScore(0);
        setViewerScore(0);
        setCurrentIndex(0);
        setAnsweredIndices([]);
        setChatMessages([]);
        setGameState('playing');
        setIsSpinning(true);
        setIsTableCentered(true);
        setTimeLeft(60);
        if (targetPackId) {
          deleteGameProgress(currentUserId, targetPackId, 'whatwherewhen').catch(() => {});
        }
        return;
      }

      if (options?.resume) {
        let restoredQuestions = (options.questions && options.questions.length > 0) ? options.questions : [];
        let restoredExpertScore = typeof options.score === 'number' ? options.score : 0;
        let restoredViewerScore = typeof options.viewerScore === 'number' ? options.viewerScore : 0;
        let restoredCurrentIndex = typeof options.currentIndex === 'number' ? options.currentIndex : 0;
        let restoredAnsweredIndices: number[] = [];

        // Check if progress exists in database
        const prog = await getGameProgress(currentUserId, targetPackId, 'whatwherewhen');
        if (prog && prog.state) {
          const st = typeof prog.state === 'string' ? JSON.parse(prog.state) : prog.state;
          if (Array.isArray(st.questions) && st.questions.length > 0 && restoredQuestions.length === 0) {
            restoredQuestions = st.questions;
          }
          if (typeof st.expertScore === 'number' && typeof options.score !== 'number') restoredExpertScore = st.expertScore;
          if (typeof st.viewerScore === 'number' && typeof options.viewerScore !== 'number') restoredViewerScore = st.viewerScore;
          if (Array.isArray(st.answeredIndices)) restoredAnsweredIndices = st.answeredIndices;
          if (typeof st.currentIndex === 'number' && typeof options.currentIndex !== 'number') {
            restoredCurrentIndex = st.currentIndex;
          }
          if (st.topic) setTopic(st.topic);
          if (Array.isArray(st.chatMessages)) setChatMessages(st.chatMessages);
        }

        // Cross-reference with question counters using difference between shown and answered
        const answeredSet = new Set<number>(restoredAnsweredIndices);
        restoredQuestions.forEach((q: any, idx: number) => {
          const timesShown = Number(q.times_shown || 0);
          const timesAnswered = Number(q.times_correct || 0) + Number(q.times_incorrect || 0) + Number(q.times_skipped || 0);
          // If shown count exceeds answered count, the question was shown in this playthrough and awaits an answer
          if (timesShown > timesAnswered) {
            return;
          }
          if (restoredAnsweredIndices.includes(idx) || (timesAnswered >= timesShown && timesAnswered > 0)) {
            answeredSet.add(idx);
          }
        });
        restoredAnsweredIndices = Array.from(answeredSet);

        // If target index was already answered, jump to the first question awaiting an answer
        if (answeredSet.has(restoredCurrentIndex) || typeof options.currentIndex !== 'number') {
          const firstUnanswered = restoredQuestions.findIndex((q: any, idx: number) => {
            const timesShown = Number(q.times_shown || 0);
            const timesAnswered = Number(q.times_correct || 0) + Number(q.times_incorrect || 0) + Number(q.times_skipped || 0);
            if (timesShown > timesAnswered) return true;
            return !answeredSet.has(idx);
          });
          if (firstUnanswered !== -1) {
            restoredCurrentIndex = firstUnanswered;
          }
        }

        // Calculate scores from questions if both are 0 but questions have answers
        if (restoredExpertScore === 0 && restoredViewerScore === 0 && restoredAnsweredIndices.length > 0) {
          let exp = 0;
          let view = 0;
          restoredQuestions.forEach((q: any, idx: number) => {
            if (answeredSet.has(idx)) {
              if (Number(q.is_correct) === 1 || (q.times_correct && q.times_correct > 0)) {
                exp++;
              } else {
                view++;
              }
            }
          });
          restoredExpertScore = exp;
          restoredViewerScore = view;
        }

        if (restoredQuestions.length > 0) {
          // If a specific unanswered index was requested via options, prefer it
          if (typeof options.currentIndex === 'number' && !restoredAnsweredIndices.includes(options.currentIndex)) {
            restoredCurrentIndex = options.currentIndex;
          } else if (restoredAnsweredIndices.includes(restoredCurrentIndex)) {
            // Find first truly unanswered question
            const nextUnanswered = Array.from({ length: restoredQuestions.length }, (_, i) => i)
              .find(i => !restoredAnsweredIndices.includes(i));
            if (nextUnanswered !== undefined) {
              restoredCurrentIndex = nextUnanswered;
            }
          }

          setQuestions(restoredQuestions);
          setExpertScore(restoredExpertScore);
          setViewerScore(restoredViewerScore);
          setAnsweredIndices(restoredAnsweredIndices);
          setCurrentIndex(restoredCurrentIndex);

          setGameState('playing');
          setIsSpinning(false);
          setIsTableCentered(false);
          setTimeLeft(60);
          return;
        }
      }

      if (targetPackId) {
        const progress = await getGameProgress(currentUserId, targetPackId, 'whatwherewhen');
        if (progress) {
          setHasProgress(true);
        }
      }
    };

    loadProgress();
  }, [user, profile?.uid, options, currentUserId, packId]);

  // Save progress whenever game state updates
  useEffect(() => {
    const saveProgress = async () => {
      if ((gameState === 'playing' || gameState === 'feedback') && packId && questions.length > 0 && expertScore < 6 && viewerScore < 6) {
        await saveGameProgress({
          userId: currentUserId,
          packId: packId,
          gameType: 'whatwherewhen',
          currentStep: expertScore + viewerScore,
          totalSteps: 11,
          score: expertScore,
          topic: options?.topic || topic,
          difficulty: options?.difficulty || 'genius',
          state: {
            expertScore,
            viewerScore,
            questions,
            currentIndex,
            answeredIndices,
            chatMessages,
            topic,
            difficulty: options?.difficulty || 'genius',
            price: options?.price
          }
        });
      }
    };
    saveProgress();
  }, [expertScore, viewerScore, questions, currentIndex, answeredIndices, gameState, packId, currentUserId, chatMessages, topic, options]);

  // Track question view (/api/generated-questions/show)
  useEffect(() => {
    if (gameState === 'playing' && !isSpinning && questions && questions[currentIndex]) {
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
            user_id: currentUserId,
            is_replay: Boolean(options?.isReplay)
          })
        }).catch(() => {});
      }
    }
  }, [gameState, isSpinning, currentIndex, questions, packId, currentUserId]);

  const handleResume = async () => {
    setLoading(true);
    try {
      const targetPackId = options?.packId || packId;
      const progress = await getGameProgress(currentUserId, targetPackId, 'whatwherewhen');
      if (progress && progress.state) {
        const { expertScore: exSc, viewerScore: viSc, questions: qList, currentIndex: cIdx, answeredIndices: ansIdxs, chatMessages: chats, topic: top } = progress.state;
        setExpertScore(exSc || 0);
        setViewerScore(viSc || 0);
        setQuestions(qList || []);
        setCurrentIndex(cIdx || 0);
        setAnsweredIndices(ansIdxs || []);
        setChatMessages(chats || []);
        if (top) setTopic(top);
        setGameState('playing');
        setIsSpinning(false);
        setTimeLeft(60);
      } else {
        startLevel();
      }
    } catch (error) {
      console.error('Error resuming game:', error);
      startLevel();
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = (text: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      senderId: '1',
      senderName: profile?.display_name || 'Игрок 1',
      text,
      isBot: false,
      timestamp: Date.now()
    };
    setChatMessages(prev => [...prev, newMessage]);
  };

  useEffect(() => {
    if (options && gameState === 'loading' && (!questions || questions.length === 0)) {
      if (options.resume || options.isReplay) return;
      if (startingRef.current) return;
      startingRef.current = true;
      startLevel();
    }
  }, [gameState, questions?.length, options]);

  const startLevel = async () => {
    if (options?.questions && Array.isArray(options.questions) && options.questions.length > 0) {
      setQuestions(options.questions);
      setAnsweredIndices([]);
      setIsSpinning(true);
      setGameState('playing');
      setTimeLeft(60);
      if (options.packId) {
        fetch(`/api/game-packs/${options.packId}/play`, { method: 'POST' }).catch(() => {});
      }
      return;
    }

    const cost = options.price || 33; 
    const currentBal = profile ? (profile.balance ?? 0) : demoBalance;

    if (currentBal < cost || currentBal <= 0) {
      startingRef.current = false;
      if (!profile) {
        openDemoExhaustedModal();
      } else {
        setInsufficientAmount(cost);
        setInsufficientReason('старта игры Что? Где? Квада?');
        setShowInsufficientModal(true);
      }
      setGameState('setup');
      return;
    }

    setGameState('loading');
    try {
      const generated: any = await protalkService.generateQuestions(
        topic, 
        options?.difficulty || 'genius', 
        11, 
        'whatwherewhen', 
        undefined, 
        packId, 
        currentUserId,
        options?.note
      );
      const questionsList = Array.isArray(generated) ? generated : (generated?.questions || []);
      if (!Array.isArray(questionsList) || questionsList.length === 0) {
        throw new Error('Нейросеть не смогла сформировать вопросы для игры Что? Где? Квада?. Попробуйте еще раз.');
      }
      setQuestions(questionsList);
      setAnsweredIndices([]);
      setIsSpinning(true);
      setGameState('playing');
      setTimeLeft(60);
    } catch (error) {
      startingRef.current = false;
      console.error('Error generating questions:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось сгенерировать игру.');
      setGameState('error');
    }
  };

  const handleAnswer = async () => {
    if (checking || feedback || gameState !== 'playing') return;
    audioSystem.playSlot('www_attention_correct_answer');
    setChecking(true);
    setCheckTimer(0);
    
    const currentQuestion = questions[currentIndex];
    const questionCost = options.isPurchased ? 0 : 2;
    if (questionCost > 0) {
      await balanceService.deductBalance(
        currentUserId, 
        questionCost, 
        `Что? Где? Квада?, проверка ответа на вопрос #${currentIndex + 1}`, 
        'whatwherewhen'
      );
      setShowCoinAnimation(true);
      setTimeout(() => setShowCoinAnimation(false), 1500);
      if (profile) (profile as any).balance = (profile.balance || 0) - questionCost;
    }

    const isExactMatch = isExactOrCloseAnswerMatch(userAnswer, currentQuestion.correctAnswer);
    let result: { isCorrect: boolean; explanation: string };

    if (isExactMatch) {
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
      const stopAICountdown = startAICheckCountdown((remaining) => {
        setCheckTimer(remaining);
      }, 60);
      try {
        result = await protalkService.checkAnswer(
          currentQuestion.text,
          userAnswer,
          currentQuestion.correctAnswer,
          currentQuestion.explanation,
          'whatwherewhen'
        );
      } finally {
        stopAICountdown();
      }
    }

    // Update in-memory question status
    const updatedQuestions = questions.map((q, idx) => {
      if (idx === currentIndex) {
        return {
          ...q,
          is_answered: 1,
          user_answer: userAnswer,
          is_correct: result.isCorrect ? 1 : 0,
          is_skipped: 0
        };
      }
      return q;
    });
    setQuestions(updatedQuestions);

    // Sync database counters
    if (currentQuestion?.id || packId) {
      fetch('/api/generated-questions/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentQuestion?.id,
          pack_id: packId,
          question_index: currentIndex + 1,
          user_id: currentUserId,
          user_answer: userAnswer,
          is_correct: result.isCorrect ? 1 : 0,
          is_skipped: 0
        })
      }).catch(() => {});
    }

    setAnsweredIndices(prev => prev.includes(currentIndex) ? prev : [...prev, currentIndex]);
    setFeedback(result);
    
    if (result.isCorrect) {
      audioSystem.playSlot('www_point_players');
      setExpertScore(s => s + 1);
    } else {
      audioSystem.playSlot('www_point_ai_viewers');
      setViewerScore(s => s + 1);
    }

    setChecking(false);
    setGameState('feedback');
  };

  // Button "Не знаю": records incorrect answer, deducts 2 coins, adds score to viewers
  const handleDontKnow = async () => {
    if (checking || feedback || gameState !== 'playing') return;
    audioSystem.playSlot('www_attention_correct_answer');
    setTimeout(() => audioSystem.playSlot('www_point_ai_viewers'), 350);

    const currentQuestion = questions[currentIndex];
    const questionCost = options.isPurchased ? 0 : 2;
    if (questionCost > 0) {
      await balanceService.deductBalance(
        currentUserId, 
        questionCost, 
        `Что? Где? Квада?, ответ «Не знаю» на вопрос #${currentIndex + 1}`, 
        'whatwherewhen'
      );
      setShowCoinAnimation(true);
      setTimeout(() => setShowCoinAnimation(false), 1500);
      if (profile) (profile as any).balance = (profile.balance || 0) - questionCost;
    }

    // Update in-memory question status
    const updatedQuestions = questions.map((q, idx) => {
      if (idx === currentIndex) {
        return {
          ...q,
          is_answered: 1,
          user_answer: 'Не знаю',
          is_correct: 0,
          is_skipped: 1
        };
      }
      return q;
    });
    setQuestions(updatedQuestions);

    // Sync database counters
    if (currentQuestion?.id || packId) {
      fetch('/api/generated-questions/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentQuestion?.id,
          pack_id: packId,
          question_index: currentIndex + 1,
          user_id: currentUserId,
          user_answer: 'Не знаю',
          is_correct: 0,
          is_skipped: 1
        })
      }).catch(() => {});
    }

    setAnsweredIndices(prev => prev.includes(currentIndex) ? prev : [...prev, currentIndex]);
    setViewerScore(s => s + 1);

    const factExpl = currentQuestion?.explanation ? ` ${currentQuestion.explanation}` : '';
    setFeedback({
      isCorrect: false,
      explanation: `Ответ не дан («Не знаю»). Правильный ответ: ${currentQuestion?.correctAnswer || ''}.${factExpl}`
    });
    setGameState('feedback');
  };

  const handleContinue = async () => {
    setFeedback(null);
    setUserAnswer('');
    
    if (expertScore >= 6 || viewerScore >= 6) {
      const expertWon = expertScore >= 6;
      const basePoints = Math.max(0, (expertScore * 200) - (viewerScore * 200));

      // Save finished game session (server calculates authoritative score & breakdown)
      const saved = await saveGameSession({
        userId: currentUserId,
        gameId: 'whatwherewhen',
        score: 0,
        rawScore: basePoints,
        totalQuestions: expertScore + viewerScore,
        correctAnswers: expertScore,
        mode: options.mode || 'human',
        difficulty: options.difficulty || 'genius',
        topic: options.topic || topic,
        pricePaid: options.price || 33,
        isWin: expertWon,
        packId: packId
      });

      if (saved?.calculation) {
        setScoreCalculation(saved.calculation);
        setEarnedScore(saved.score ?? saved.calculation.authoritativeScore);
      } else {
        const calc = await calculateAuthoritativeScoreClient({
          gameId: 'whatwherewhen',
          difficulty: options?.difficulty || 'genius',
          score: basePoints,
          correctAnswers: expertScore,
          totalQuestions: expertScore + viewerScore,
          isWin: expertWon,
          mode: options?.mode || 'human'
        });
        if (calc) {
          setScoreCalculation(calc);
          setEarnedScore(calc.authoritativeScore);
        }
      }

      // Clear unfinished progress since game is now completed
      if (packId) {
        await deleteGameProgress(currentUserId, packId, 'whatwherewhen');
      }

      setGameState('result');
    } else {
      const updatedAnswered = answeredIndices.includes(currentIndex) ? answeredIndices : [...answeredIndices, currentIndex];
      setAnsweredIndices(updatedAnswered);
      
      // Randomly pick next index from unasked questions
      const totalCount = questions.length > 0 ? questions.length : 11;
      const unasked = Array.from({ length: totalCount }, (_, i) => i).filter(i => !updatedAnswered.includes(i));
      if (unasked.length > 0) {
        const nextIndex = unasked[Math.floor(Math.random() * unasked.length)];
        setCurrentIndex(nextIndex);
      } else {
        setCurrentIndex(i => (i + 1) % totalCount);
      }
      
      setIsTableCentered(true);
      setIsSpinning(true);
      setTimeLeft(60);
      setGameState('playing');
    }
  };

  // Timer effect
  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0 && !feedback && !checking && !isSpinning && !isVoiceActive) {
      const timer = setInterval(() => {
        setTimeLeft(t => {
          const next = t - 1;
          if (next === 10) {
            audioSystem.playSlot('www_minute_10s_warning');
          } else if (next === 0) {
            audioSystem.playSlot('www_minute_end_signal');
          }
          return next;
        });
      }, 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && gameState === 'playing' && !feedback && !checking && !isSpinning && !isVoiceActive) {
      if (timeoutHandledRef.current === currentIndex) return;
      timeoutHandledRef.current = currentIndex;

      if (userAnswer.trim()) {
        handleAnswer();
      } else {
        audioSystem.playSlot('www_point_ai_viewers');
        const currentQuestion = questions[currentIndex];
        const questionCost = options.isPurchased ? 0 : 2;
        if (questionCost > 0) {
          balanceService.deductBalance(
            currentUserId, 
            questionCost, 
            `Что? Где? Квада?, время вышло на вопрос #${currentIndex + 1}`, 
            'whatwherewhen'
          ).catch((e) => console.error('Error deducting on timeout:', e));
          setShowCoinAnimation(true);
          setTimeout(() => setShowCoinAnimation(false), 1500);
          if (profile) (profile as any).balance = Math.max(0, (profile.balance || 0) - questionCost);
        }
        
        // Update in-memory question
        const updatedQuestions = questions.map((q, idx) => {
          if (idx === currentIndex) {
            return {
              ...q,
              is_answered: 1,
              user_answer: 'Время вышло',
              is_correct: 0,
              is_skipped: 1
            };
          }
          return q;
        });
        setQuestions(updatedQuestions);

        // Sync database counters
        if (currentQuestion?.id || packId) {
          fetch('/api/generated-questions/answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: currentQuestion?.id,
              pack_id: packId,
              question_index: currentIndex + 1,
              user_id: currentUserId,
              user_answer: 'Время вышло',
              is_correct: 0,
              is_skipped: 1
            })
          }).catch(() => {});
        }

        setFeedback({ 
          isCorrect: false, 
          explanation: `Время вышло! Очко уходит телезрителям. Правильный ответ: ${currentQuestion?.correctAnswer || 'Не определён'}${currentQuestion?.explanation ? '. ' + currentQuestion.explanation : ''}` 
        });
        setAnsweredIndices(prev => prev.includes(currentIndex) ? prev : [...prev, currentIndex]);
        setViewerScore(v => v + 1);
        setGameState('feedback');
      }
    }
  }, [timeLeft, gameState, feedback, checking, userAnswer, isSpinning, isVoiceActive, currentIndex, questions, packId, currentUserId, options.isPurchased, profile]);

  const handleExitGame = async () => {
    if (packId && questions.length > 0 && expertScore < 6 && viewerScore < 6) {
      await saveGameProgress({
        userId: currentUserId,
        packId: packId,
        gameType: 'whatwherewhen',
        currentStep: expertScore + viewerScore,
        totalSteps: 11,
        score: expertScore,
        topic: options?.topic || topic,
        difficulty: options?.difficulty || 'genius',
        state: {
          expertScore,
          viewerScore,
          questions,
          currentIndex,
          answeredIndices,
          chatMessages,
          topic,
          difficulty: options?.difficulty || 'genius',
          price: options?.price
        }
      });
    }
    navigate('/profile/history');
  };

  if (gameState === 'setup') {
    return (
      <div className="mx-auto max-w-2xl space-y-8 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 shadow-2xl">
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-primary">Что? Где? Квада?</h2>
          <p className="mt-2 text-sm text-foreground/70">Логические вопросы от телезрителей. Игра до 6 побед.</p>
        </div>
        <input 
          type="text" 
          value={topic} 
          onChange={e => setTopic(e.target.value)}
          placeholder="Тема игры..."
          className="w-full rounded-2xl border border-primary/30 bg-transparent backdrop-blur-md p-4 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
        />
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
            className="flex-1 justify-center text-lg"
          >
            {loading && !hasProgress && <Loader2 className="animate-spin mr-2" />}
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
        gameId="whatwherewhen"
        title="Что? Где? Квада?"
        messages={[
          'Ищем телезрителей...',
          'Формулируем вопросы...',
          'Проверяем логику ответов...',
          'Настраиваем волчок...',
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

  if (gameState === 'result') {
    const expertWon = expertScore >= 6;
    const authoritativeScoreToDisplay = earnedScore ?? scoreCalculation?.authoritativeScore ?? 0;

    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
        <div className="flex justify-center">
          {expertWon ? (
            <BubbleElement active isBadge size="md" icon={<Trophy size={18} />}>
              Победа знатоков!
            </BubbleElement>
          ) : (
            <BubbleElement isBadge size="md" icon={<XCircle size={18} className="text-rose-400" />}>
              Победа телезрителей
            </BubbleElement>
          )}
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-primary">
            {expertWon ? 'Знатоки одержали победу!' : 'Телезрители оказались хитрее!'}
          </h2>
          <p className="mt-2 text-sm text-foreground/75 leading-relaxed">
            {expertWon ? 'Отличная демонстрация логики и командного духа!' : 'В следующий раз удача обязательно будет на вашей стороне!'}
          </p>
        </div>

        {/* Match score summary */}
        <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 sm:p-5 space-y-3 text-left">
          <div className="flex justify-around items-center text-center pb-3 border-b border-primary/15">
            <div>
              <p className="text-sm font-bold text-foreground/65">Знатоки</p>
              <p className="text-3xl font-black text-primary">{expertScore}</p>
            </div>
            <div className="text-2xl font-black text-foreground/30">:</div>
            <div>
              <p className="text-sm font-bold text-foreground/65">Зрители</p>
              <p className="text-3xl font-black text-rose-400">{viewerScore}</p>
            </div>
          </div>
          <div className="pt-1 text-center">
            <span className="text-sm font-medium text-foreground/80">
              Условие победы: набрать 6 победных очков раньше телезрителей
            </span>
          </div>
        </div>

        {/* Authoritative Score Calculation Card with breakdown */}
        <ScoreCalculationCard 
          score={authoritativeScoreToDisplay}
          calculation={scoreCalculation}
          gameTitle="ЧтоГдеКвада"
          isWin={expertWon}
        />

        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          <LeafButton 
            variant="primary"
            size="md"
            onClick={async () => {
              if (packId) {
                await deleteGameProgress(currentUserId, packId, 'whatwherewhen');
                await fetch(`/api/game-packs/${packId}/play`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: currentUserId, is_replay: true })
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
              if (packId) await deleteGameProgress(currentUserId, packId, 'whatwherewhen');
              navigate('/profile/history');
            }}
            className="flex-1 justify-center"
          >
            К истории игр
          </LeafButton>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex] || { text: 'Вопрос подготавливается...' };

  const difficultyNames: Record<string, string> = {
    'dummy': 'ИИкра (x1)',
    'people': 'Головастик (x10)',
    'genius': 'Квант (x100)',
    'god': 'Ляга (x1000)'
  };

  return (
    <div className="mx-auto max-w-7xl w-full space-y-6 px-3 sm:px-6">
      {/* Coin Animation Overlay */}
      <CoinAnimation 
        show={showCoinAnimation}
        amount={2} 
      />

      <AnimatePresence>
        <CheckingAnswerModal
          key="modal-checking-whatwherewhen"
          isOpen={checking}
          timerSeconds={checkTimer}
          title="ИИ проверяет ваш ответ..."
          subtitle={checkTimer > 0 ? `Анализ и оценка ответа (${checkTimer}с)` : 'Анализ логики и ключевых смыслов вопроса'}
        />

        {gameState === 'feedback' && feedback && (
          <motion.div 
            key="modal-feedback-whatwherewhen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-lg rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center">
                {feedback.isCorrect ? (
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-transparent text-green-400 border border-green-500/40 backdrop-blur-md">
                    <CheckCircle2 size={40} />
                  </div>
                ) : (
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-transparent text-rose-400 border border-rose-500/40 backdrop-blur-md">
                    <XCircle size={40} />
                  </div>
                )}
                
                <h3 className={`text-2xl font-black ${feedback.isCorrect ? 'text-green-400' : 'text-rose-400'}`}>
                  {feedback.isCorrect ? 'Правильно!' : 'Неверно!'}
                </h3>
                
                <div className="mt-4 max-h-48 overflow-y-auto pr-2 text-sm leading-relaxed text-foreground/80 font-medium">
                  {feedback.explanation}
                </div>

                <div className="mt-8 w-full">
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

      {/* Top Header Bar: Topic, Difficulty, and Exit Button */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl p-4 shadow-lg">
        <div className="flex items-center gap-2">
          <HelpCircle className="text-primary" size={20} />
          <span className="text-sm font-bold text-primary/70">Тема:</span>
          <span className="text-sm font-black text-primary">{topic}</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap className="text-primary" size={20} />
            <span className="text-sm font-bold text-primary/70">Сложность:</span>
            <span className="text-sm font-black text-primary">{difficultyNames[options.difficulty] || options.difficulty}</span>
          </div>

          <LeafButton
            variant="glass"
            size="sm"
            onClick={handleExitGame}
            className="text-foreground/75 hover:text-foreground"
          >
            <LogOut size={16} className="mr-1.5" />
            Выйти
          </LeafButton>
        </div>
      </div>

      {/* Main Game Layout: Side-by-side on Desktop (Question Left, Table Right), Stacked on Mobile (Table Top, Question Bottom) */}
      <div className="flex flex-col lg:flex-row items-start gap-6 w-full">
        {/* Left Column (Desktop) / Bottom (Mobile): Question Card & Chat */}
        <div className="w-full lg:flex-1 min-w-0 space-y-6 order-2 lg:order-1">
          {/* Question Card: contains Scores and Timer at the top of the container */}
          <div className="relative min-h-[340px] rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-2xl overflow-hidden">
            {/* Scores & Timer placed inside the Question Card container at the top */}
            <div className="flex items-center justify-between gap-4 pb-5 mb-6 border-b border-primary/20">
              <div className="flex items-center gap-3">
                <BubbleElement className="flex items-center gap-2 px-3 py-1.5 font-bold text-sm text-primary">
                  <Users size={18} className="text-primary" />
                  <span>Знатоки</span>
                  <span className="text-lg font-black text-primary ml-1">{expertScore}</span>
                </BubbleElement>
                <span className="text-lg font-black text-foreground/30">:</span>
                <BubbleElement className="flex items-center gap-2 px-3 py-1.5 font-bold text-sm text-amber-400">
                  <User size={18} className="text-amber-400" />
                  <span>Зрители</span>
                  <span className="text-lg font-black text-amber-400 ml-1">{viewerScore}</span>
                </BubbleElement>
              </div>

              <BubbleElement className={`flex items-center gap-2 px-4 py-1.5 font-bold text-base ${
                isVoiceActive ? 'text-amber-300 border border-amber-400/40 bg-amber-500/10' : 'text-primary'
              }`}>
                <Timer size={18} className={isVoiceActive ? 'animate-pulse text-amber-300' : ''} />
                <span>{timeLeft}с</span>
                {isVoiceActive && (
                  <span className="text-sm px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-bold ml-1">
                    пауза (голос)
                  </span>
                )}
              </BubbleElement>
            </div>

            <AnimatePresence mode="wait">
              {isSpinning ? (
                <motion.div
                  key="spinning-text"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex flex-col items-center justify-center h-full py-16 text-center"
                >
                  <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                  <p className="text-xl font-bold text-primary animate-pulse">
                    Выбираем вопрос...
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="question-content"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <BubbleElement className="inline-block text-sm font-bold text-primary px-4 py-1.5">
                      Вопрос #{currentIndex + 1} от телезрителя
                    </BubbleElement>
                  </div>

                  <h3 className="text-lg font-bold leading-tight sm:text-xl">{currentQuestion.text}</h3>
                  
                  <div className="mt-8 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-primary block">Ваш ответ</label>
                      <LeafButton
                        variant="glass"
                        size="sm"
                        onClick={handleDontKnow}
                        disabled={checking || gameState !== 'playing'}
                        className="text-amber-300 border-amber-400/30 hover:border-amber-400/60"
                      >
                        <HelpCircle size={16} className="mr-1.5 text-amber-400" />
                        Не знаю
                      </LeafButton>
                    </div>

                    <div className="flex items-center gap-3">
                      <input 
                        type="text" 
                        value={userAnswer}
                        onChange={e => setUserAnswer(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAnswer()}
                        disabled={checking || gameState !== 'playing'}
                        placeholder="Введите ответ..."
                        className="flex-1 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-md p-4 text-base text-foreground focus:outline-none focus:border-primary transition-all"
                        autoFocus
                      />
                      <VoiceInputBubble
                        onTranscript={(text) => setUserAnswer(text)}
                        onActiveChange={setIsVoiceActive}
                        disabled={checking || gameState !== 'playing'}
                        currentValue={userAnswer}
                        size="md"
                        tooltip="🎤 Начать запись"
                      />
                      <LeafButton 
                        variant="primary"
                        size="md"
                        onClick={handleAnswer}
                        disabled={checking || !userAnswer.trim() || gameState !== 'playing'}
                        className="h-14 w-14 p-0 flex items-center justify-center shrink-0"
                      >
                        {checking ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                      </LeafButton>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Column (Desktop) / Top (Mobile): Spinning Table */}
        <div className="w-full lg:w-[460px] xl:w-[500px] shrink-0 order-1 lg:order-2 flex flex-col items-center">
          <div className="w-full relative min-h-[360px] sm:min-h-[440px] flex items-center justify-center">
            {!isTableCentered && (
              <motion.div
                layoutId="spinning-table-board"
                className="w-full flex items-center justify-center"
                transition={{ type: "spring", stiffness: 80, damping: 18 }}
              >
                <SpinningTable 
                  currentIndex={currentIndex} 
                  isSpinning={isSpinning} 
                  onSpinEnd={handleSpinEnd}
                  answeredIndices={answeredIndices}
                />
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Centered Modal Overlay while Table is Spinning */}
      <AnimatePresence>
        {isTableCentered && (
          <motion.div
            key="spinning-table-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-transparent backdrop-blur-2xl"
          >
            <div className="mb-6 text-center">
              <BubbleElement className="text-primary font-black text-lg px-6 py-2.5 inline-flex items-center gap-3 shadow-2xl border border-primary/40">
                <Loader2 className="animate-spin text-primary" size={22} />
                <span>Вращается волчок... Выбираем вопрос</span>
              </BubbleElement>
            </div>
            <motion.div
              layoutId="spinning-table-board"
              className="w-full max-w-[480px] aspect-square flex items-center justify-center"
              transition={{ type: "spring", stiffness: 80, damping: 18 }}
            >
              <SpinningTable 
                currentIndex={currentIndex} 
                isSpinning={isSpinning} 
                onSpinEnd={handleSpinEnd}
                answeredIndices={answeredIndices}
              />
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
}
