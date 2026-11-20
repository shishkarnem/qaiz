import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { protalkService } from '../services/protalk';
import { balanceService } from '../services/balanceService';
import { CoinAnimation } from '../components/CoinAnimation';
import { Timer, Music, Send, AlertCircle, CheckCircle2, XCircle, RotateCcw, Home, Loader2, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { saveGameSession, saveGameProgress, getGameProgress, deleteGameProgress } from '../db';
import { GameError } from '../components/GameError';
import { CheckingAnswerModal } from '../components/CheckingAnswerModal';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { VoiceInputBubble } from '../components/ui/VoiceInputBubble';
import { ScoreCalculationCard } from '../components/ScoreCalculationCard';
import { InsufficientBalanceModal } from '../components/InsufficientBalanceModal';
import { calculateAuthoritativeScoreClient, ScoreCalculationResult } from '../utils/gameScoring';

import { GenerationLoadingScreen } from '../components/GenerationLoadingScreen';

export function MelodyGame() {
  const { profile, user, demoBalance, openDemoExhaustedModal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const options = location.state || { mode: 'human', difficulty: 'people', price: 30 };
  
  const [gameState, setGameState] = useState<'setup' | 'loading' | 'playing' | 'result' | 'error'>(options ? 'loading' : 'setup');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [topic, setTopic] = useState(options.topic || 'Популярные хиты');
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [insufficientReason, setInsufficientReason] = useState('');
  const [insufficientAmount, setInsufficientAmount] = useState(1);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [currentPoints, setCurrentPoints] = useState(1000);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean, explanation: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkTimer, setCheckTimer] = useState(0);
  const [checkInterval, setCheckInterval] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [isBuzzed, setIsBuzzed] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [buzzerPlayer, setBuzzerPlayer] = useState<string | null>(null);
  const [scoreCalculation, setScoreCalculation] = useState<ScoreCalculationResult | null>(null);
  const [authoritativeScore, setAuthoritativeScore] = useState<number>(0);

  useEffect(() => {
    if (gameState === 'result' && !scoreCalculation) {
      const isWin = correctCount >= 13;
      calculateAuthoritativeScoreClient({
        gameId: 'melody',
        difficulty: options?.difficulty || 'people',
        score: score,
        rawScore: score,
        totalQuestions: 25,
        correctAnswers: correctCount,
        isWin,
        mode: options?.mode
      }).then(res => {
        if (res) {
          setScoreCalculation(res);
          setAuthoritativeScore(res.authoritativeScore);
        }
      });
    }
  }, [gameState, scoreCalculation, score, correctCount, options?.difficulty, options?.mode]);

  const startCheckTimer = () => {
    setCheckTimer(30);
    if (checkInterval) clearInterval(checkInterval);
    const interval = setInterval(() => {
      setCheckTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setCheckInterval(interval);
  };

  const stopCheckTimer = () => {
    if (checkInterval) clearInterval(checkInterval);
    setCheckTimer(0);
  };

  // Load progress on mount or handle replay / resume
  useEffect(() => {
    const loadProgress = async () => {
      const activeUid = profile?.uid || user?.id || localStorage.getItem('qaiz_active_user_id') || '10016926299';
      if (options?.isReplay && options?.questions && Array.isArray(options.questions) && options.questions.length > 0) {
        setQuestions(options.questions);
        setCurrentIndex(0);
        setScore(0);
        setCorrectCount(0);
        setTopic(options.topic || 'Популярная музыка');
        setGameState('playing');
        setCurrentPoints(1000);
        return;
      }
      if (options?.resume && options?.packId) {
        await handleResume();
        return;
      }
      if (!options?.packId) return;
      const progress = await getGameProgress(String(activeUid), options.packId, 'melody');
      if (progress) {
        setHasProgress(true);
      }
    };
    loadProgress();
  }, [user, profile?.uid, options]);

  // Save progress whenever state changes
  useEffect(() => {
    const saveProgress = async () => {
      if (gameState === 'playing' && user && options.packId && questions.length > 0) {
        await saveGameProgress({
          userId: profile?.uid ?? "",
          packId: options.packId,
          gameType: 'melody',
          currentStep: currentIndex,
          totalSteps: questions.length,
          state: {
            questions,
            currentIndex,
            score,
            correctCount,
            topic
          }
        });
      }
    };
    saveProgress();
  }, [currentIndex, score, correctCount, gameState, user, options.packId, questions, topic]);

  const handleResume = async () => {
    if (!user || !options.packId) return;
    setLoading(true);
    try {
      const progress = await getGameProgress(profile?.uid ?? "", options.packId, 'melody');
      if (progress && progress.state) {
        const { questions, currentIndex, score, correctCount, topic } = progress.state;
        setQuestions(questions);
        setCurrentIndex(currentIndex);
        setScore(score);
        setCorrectCount(correctCount);
        setTopic(topic);
        setGameState('playing');
        setCurrentPoints(1000);
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

  useEffect(() => {
    if (options && gameState === 'loading' && questions.length === 0) {
      startLevel();
    }
  }, [gameState, questions.length]);

  const startLevel = async () => {
    const cost = options.price || 3;
    const currentBal = profile ? (profile.balance ?? 0) : demoBalance;

    if (currentBal < cost || currentBal <= 0) {
      if (!profile) {
        openDemoExhaustedModal();
      } else {
        setInsufficientAmount(cost);
        setInsufficientReason('старта игры Укавкай мелодию');
        setShowInsufficientModal(true);
      }
      setGameState('setup');
      return;
    }

    setGameState('loading');
    try {
      // 25 questions: 5 categories x 5 questions
      const generated = await protalkService.generateQuestions(topic, options.difficulty || 'people', 25, 'melody');
      setQuestions(generated);
      setGameState('playing');
      setCurrentPoints(1000);
      setAudioLoaded(false);
    } catch (error: any) {
      console.error('Error generating questions:', error);
      setErrorMessage(error?.message || String(error));
      setGameState('error');
    }
  };

  const handleAnswer = async () => {
    if (checking || feedback) return;
    setChecking(true);
    startCheckTimer();
    
    const currentQuestion = questions[currentIndex];
    const questionCost = options.isPurchased ? 0 : 10;

    try {
      if (questionCost > 0) {
        await balanceService.deductBalance(
          profile?.uid ?? "", 
          questionCost, 
          `Уквакай Мелодию, проверка ответа на вопрос #${currentIndex + 1}`, 
          'melody'
        );
        setShowCoinAnimation(true);
        setTimeout(() => setShowCoinAnimation(false), 1500);
      }

      const result = await protalkService.checkAnswer(
        currentQuestion.text,
        userAnswer,
        currentQuestion.correctAnswer,
        currentQuestion.explanation,
        'melody'
      );
      
      setFeedback(result);
      if (result.isCorrect) {
        setScore(s => s + currentPoints);
        setCorrectCount(c => c + 1);
      } else {
        // Subtract points if incorrect
        setScore(s => Math.max(0, s - currentPoints));
      }
      
      setChecking(false);
      stopCheckTimer();

      setTimeout(async () => {
        if (currentIndex < questions.length - 1) {
          setCurrentIndex(i => i + 1);
          setCurrentPoints(1000);
          setUserAnswer('');
          setFeedback(null);
          setAudioLoaded(false);
          setIsBuzzed(false);
          setBuzzerPlayer(null);
        } else {
          // Save session
          const finalScore = score + (result.isCorrect ? currentPoints : (result.isCorrect === false ? -currentPoints : 0));
          const finalCorrectCount = correctCount + (result.isCorrect ? 1 : 0);
          const isWin = finalCorrectCount >= Math.ceil(questions.length * 0.6);
          const effectiveUid = profile?.uid || localStorage.getItem('qaiz_active_user_id') || '10016926299';
          
          const saved = await saveGameSession({
            userId: effectiveUid,
            gameId: 'melody',
            score: Math.max(0, finalScore),
            rawScore: Math.max(0, finalScore),
            totalQuestions: questions.length,
            correctAnswers: finalCorrectCount,
            mode: options.mode,
            difficulty: options.difficulty,
            topic: options.topic || topic,
            pricePaid: options.price,
            isWin,
            packId: options.packId || `pack_melody_${Date.now()}`
          });

          if (saved?.calculation) {
            setScoreCalculation(saved.calculation);
            setAuthoritativeScore(saved.score ?? saved.calculation.authoritativeScore);
          } else {
            const calc = await calculateAuthoritativeScoreClient({
              gameId: 'melody',
              difficulty: options.difficulty || 'people',
              score: Math.max(0, finalScore),
              rawScore: Math.max(0, finalScore),
              totalQuestions: questions.length,
              correctAnswers: finalCorrectCount,
              isWin,
              mode: options.mode
            });
            if (calc) {
              setScoreCalculation(calc);
              setAuthoritativeScore(calc.authoritativeScore);
            }
          }

          if (options.packId) {
            await deleteGameProgress(effectiveUid, options.packId, 'melody');
          }
          setGameState('result');
        }
      }, 3000);
    } catch (error) {
      console.error('Error checking answer:', error);
      // Refund if AI check failed
      if (questionCost > 0) {
        await balanceService.addBalance(profile?.uid ?? "", questionCost);
      }
      setChecking(false);
      stopCheckTimer();
    }
  };

  useEffect(() => {
    if (gameState === 'playing' && currentPoints > 0 && !feedback && audioLoaded && !isBuzzed && !isVoiceActive) {
      const timer = setInterval(() => {
        setCurrentPoints(p => Math.max(0, p - 1));
      }, 30); // 1000 points over 30s is ~33.3ms per point (30ms is close enough)
      return () => clearInterval(timer);
    } else if (currentPoints === 0 && gameState === 'playing' && !feedback && !isBuzzed && !isVoiceActive) {
      setFeedback({ isCorrect: false, explanation: 'Время вышло!' });
    }
  }, [currentPoints, gameState, feedback, audioLoaded, isBuzzed, isVoiceActive]);

  if (gameState === 'setup') {
    return (
      <div className="mx-auto max-w-2xl space-y-8 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 shadow-2xl">
        <div className="text-center">
          <h2 className="text-4xl font-black tracking-tight text-primary">Уквадай Мелодию</h2>
          <p className="mt-2 text-sm text-foreground/70">Угадывание 25 мелодий на время. Очки тают каждую секунду!</p>
        </div>
        <input 
          type="text" 
          value={topic} 
          onChange={e => setTopic(e.target.value)}
          placeholder="Тема (например, Хиты 90-х)..."
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
        title="Уквадай Мелодию"
        messages={[
          'Подключаемся к нейросети...',
          'Подбираем мелодии...',
          'Готовим подсказки и ответы...',
          'Настраиваем музыкальный раунд...',
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
    const isWin = correctCount >= 13;
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 sm:p-10 shadow-2xl text-center space-y-6">
        <div className="flex justify-center">
          {isWin ? (
            <BubbleElement className="flex items-center gap-2 px-5 py-2 text-base font-bold text-emerald-400">
              <Trophy size={20} />
              Великолепный результат!
            </BubbleElement>
          ) : (
            <BubbleElement className="flex items-center gap-2 px-5 py-2 text-base font-bold text-rose-400">
              <XCircle size={20} />
              Игра завершена
            </BubbleElement>
          )}
        </div>

        <div>
          <h2 className="text-3xl font-black text-primary">
            {isWin ? 'Музыкальный триумф!' : 'Хорошая попытка!'}
          </h2>
          <p className="mt-2 text-sm text-foreground/70">
            {isWin ? 'Ваш музыкальный слух и эрудиция на высоте!' : 'Попробуйте сыграть снова, чтобы улучшить свой счет!'}
          </p>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 space-y-3 text-left">
          <div className="space-y-1">
            <span className="text-sm font-bold text-primary/80">Условие победы:</span>
            <p className="text-sm text-foreground/90 font-medium leading-relaxed">
              Угадать большинство мелодий (13+ из 25) и набрать максимальное количество баллов за скорость.
            </p>
          </div>

          <div className="pt-3 border-t border-primary/10 flex justify-around items-center text-center">
            <div>
              <p className="text-sm text-foreground/60">Итоговые баллы</p>
              <p className="text-3xl font-black text-primary">{score}</p>
            </div>
            <div className="text-2xl font-black text-foreground/30">•</div>
            <div>
              <p className="text-sm text-foreground/60">Угадано треков</p>
              <p className="text-3xl font-black text-emerald-400">{correctCount} / 25</p>
            </div>
          </div>
        </div>

        <ScoreCalculationCard 
          score={authoritativeScore || scoreCalculation?.authoritativeScore || score}
          calculation={scoreCalculation}
          gameTitle="Уквадай Мелодию"
          isWin={isWin}
        />

        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          <LeafButton 
            variant="primary"
            size="md"
            onClick={async () => {
              if (options.packId) {
                if (user) await deleteGameProgress(profile?.uid ?? "", options.packId, 'melody');
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
              if (user && options.packId) await deleteGameProgress(profile?.uid ?? "", options.packId, 'melody');
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

  const handleBuzzer = () => {
    if (isBuzzed || !audioLoaded || feedback) return;
    setIsBuzzed(true);
    setBuzzerPlayer('user');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AnimatePresence>
        <CheckingAnswerModal
          isOpen={checking}
          timerSeconds={checkTimer}
          showTimeoutActions={checkTimer === 0}
          onRetry={() => handleAnswer()}
          onSkip={() => {
            setChecking(false);
            setFeedback({ isCorrect: false, explanation: 'Проверка пропущена пользователем.' });
          }}
        />
      </AnimatePresence>

      <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl p-6 shadow-lg">
        <div className="flex items-center gap-2">
          <BubbleElement className="px-3 py-1 text-sm font-bold text-foreground/80">
            Мелодия <span className="text-primary font-black ml-1">{currentIndex + 1}/25</span>
          </BubbleElement>
        </div>
        <div className="flex flex-col items-end">
          <p className="text-sm font-medium text-foreground/60">Текущие баллы</p>
          <p className="text-3xl font-black text-primary">{currentPoints}</p>
        </div>
      </div>

      <div className="relative flex min-h-[250px] flex-col items-center justify-center rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-10 shadow-2xl overflow-hidden">
        {questions[currentIndex]?.audioUrl && (
          <audio 
            src={questions[currentIndex].audioUrl} 
            autoPlay 
            onCanPlayThrough={() => setAudioLoaded(true)}
            onEnded={() => setFeedback({ isCorrect: false, explanation: 'Время вышло!' })}
          />
        )}
        
        {!audioLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-transparent backdrop-blur-md z-10">
            <Loader2 className="animate-spin text-primary mb-2" size={32} />
            <p className="text-sm font-bold text-primary">Загрузка аудио...</p>
          </div>
        )}

        <div className={`flex h-24 w-24 items-center justify-center rounded-full transition-all ${audioLoaded ? 'bg-transparent border border-primary/40 text-primary backdrop-blur-md animate-pulse' : 'bg-transparent border border-white/10 text-foreground/30'}`}>
          <Music size={48} />
        </div>
        
        <p className="mt-6 text-center text-xl font-bold italic text-foreground/70">
          {audioLoaded ? (isBuzzed ? 'Отвечаете!' : 'Играет мелодия...') : 'Подготовка...'}
        </p>

        {questions[currentIndex]?.category && (
          <BubbleElement className="mt-3 px-4 py-1.5 text-sm font-bold text-primary">
            Категория: {questions[currentIndex].category}
          </BubbleElement>
        )}
        
        {feedback && (
          <div className={`mt-8 flex items-start gap-4 rounded-2xl p-6 border ${
            feedback.isCorrect ? 'bg-transparent border-green-500/40 text-green-400 backdrop-blur-xl' : 'bg-transparent border-rose-500/40 text-rose-400 backdrop-blur-xl'
          }`}>
            {feedback.isCorrect ? <CheckCircle2 size={32} /> : <XCircle size={32} />}
            <div>
              <p className="text-xl font-bold">{feedback.isCorrect ? 'Верно!' : 'Не совсем...'}</p>
              <div className="mt-1 max-h-32 overflow-y-auto pr-2 text-sm opacity-90">
                {feedback.explanation}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {!isBuzzed ? (
          <LeafButton 
            variant="primary"
            size="lg"
            onClick={handleBuzzer}
            disabled={!audioLoaded || !!feedback || checking}
            className="w-full justify-center py-6 text-2xl font-black shadow-lg"
          >
            Я знаю!
          </LeafButton>
        ) : (
          <>
            <input 
              type="text" 
              value={userAnswer}
              onChange={e => setUserAnswer(e.target.value)}
              placeholder="Название песни или исполнитель..."
              autoFocus
              disabled={!!feedback || checking}
              className="flex-1 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-md p-5 text-lg text-foreground focus:outline-none focus:border-primary transition-all"
              onKeyDown={e => e.key === 'Enter' && handleAnswer()}
            />
            <VoiceInputBubble
              onTranscript={(text) => setUserAnswer(text)}
              onActiveChange={setIsVoiceActive}
              disabled={!!feedback || checking}
              currentValue={userAnswer}
              size="lg"
              tooltip="🎤 Начать запись"
            />
            <LeafButton 
              variant="primary"
              size="md"
              onClick={handleAnswer}
              disabled={!userAnswer || !!feedback || checking}
              className="h-16 w-16 p-0 flex items-center justify-center shrink-0"
            >
              {checking ? <Loader2 className="animate-spin" /> : <Send size={24} />}
            </LeafButton>
          </>
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
