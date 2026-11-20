import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Image as ImageIcon, 
  Video, 
  Music, 
  Save, 
  Type, 
  CheckCircle2, 
  XCircle,
  HelpCircle,
  Layout,
  Settings as SettingsIcon,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Scissors,
  MicOff,
  Wand2,
  MessageSquare,
  Send,
  X,
  Globe,
  Lock,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../db';
import { Game, Question, GameMode, Difficulty } from '../types';
import { TopicCloud } from '../components/TopicCloud';
import { generateContent } from '../services/protalk';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { MiniAudioField } from '../components/ui/MiniAudioField';
import { getGameDetailedRules, getGameModes, DIFFICULTIES } from '../lib/gameHelpers';

const DEFAULT_TOPICS = [
  'Общие знания',
  'История',
  'География',
  'Кино и ТВ',
  'Музыка',
  'Наука и природа',
  'Спорт',
  'Искусство',
  'Литература',
  'Технологии',
  'Игры'
];

type GameType = 'blitz' | 'millionaire' | '100to1' | 'whatwherewhen' | 'melody' | 'jeopardy' | 'iqbox';

export const GameCreationPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Game Basic Info
  const [gameInfo, setGameInfo] = useState({
    type: 'blitz' as GameType,
    playMode: 'single' as 'single' | 'multi',
    visibility: 'public' as 'public' | 'private',
    maxPlayers: 8,
    title: '',
    description: '',
    difficulty: 'people' as Difficulty,
    topic: '',
    note: '',
    costPerQuestion: 1
  });
  const [isDifficultyInfoOpen, setIsDifficultyInfoOpen] = useState(false);

  // Questions
  const [questions, setQuestions] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiTimer, setAiTimer] = useState(0);
  const [aiTimerInterval, setAiTimerInterval] = useState<any>(null);

  const startAiTimer = (seconds: number) => {
    setAiTimer(seconds);
    if (aiTimerInterval) clearInterval(aiTimerInterval);
    const interval = setInterval(() => {
      setAiTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setAiTimerInterval(interval);
  };

  const stopAiTimer = () => {
    if (aiTimerInterval) clearInterval(aiTimerInterval);
    setAiTimer(0);
  };

  // Initialize questions based on game type
  React.useEffect(() => {
    if (step === 2 && questions.length === 0) {
      let initialQuestions: any[] = [];
      
      if (gameInfo.type === 'blitz') {
        initialQuestions = Array.from({ length: 10 }, (_, i) => ({
          id: Math.random().toString(36).substr(2, 9),
          text: '',
          correctAnswer: '',
          points: 0,
          mediaUrl: '',
          mediaType: 'image'
        }));
      } else if (gameInfo.type === 'millionaire') {
        const millionairePoints = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
        initialQuestions = Array.from({ length: 15 }, (_, i) => ({
          id: Math.random().toString(36).substr(2, 9),
          text: '',
          correctAnswer: '',
          options: ['', '', '', ''],
          points: millionairePoints[i],
          level: i + 1,
          mediaUrl: '',
          mediaType: 'image'
        }));
      } else if (gameInfo.type === '100to1') {
        initialQuestions = Array.from({ length: 4 }, (_, i) => ({
          id: Math.random().toString(36).substr(2, 9),
          text: '',
          round: i + 1,
          answers: i < 3 
            ? [35, 25, 15, 10, 7, 3].map(p => ({ text: '', points: p, hint: '', mediaUrl: '', mediaType: 'image' }))
            : [15, 30, 60, 90, 120, 150].map(p => ({ text: '', points: p, hint: '', mediaUrl: '', mediaType: 'image' })),
        }));
      } else if (gameInfo.type === 'whatwherewhen') {
        initialQuestions = Array.from({ length: 11 }, (_, i) => ({
          id: Math.random().toString(36).substr(2, 9),
          text: '',
          correctAnswer: '',
          viewerName: '',
          viewerAddress: '',
          mediaUrl: '',
          mediaType: 'image'
        }));
      } else if (gameInfo.type === 'jeopardy') {
        // 3 rounds * 25 questions + 1 final
        for (let r = 1; r <= 3; r++) {
          for (let c = 1; c <= 5; c++) {
            for (let v = 1; v <= 5; v++) {
              initialQuestions.push({
                id: Math.random().toString(36).substr(2, 9),
                text: '',
                correctAnswer: '',
                category: `Категория ${c}`,
                points: v * 100 * r,
                round: r,
                questionType: 'normal',
                mediaUrl: '',
                mediaType: 'image'
              });
            }
          }
        }
        // Final
        initialQuestions.push({
          id: Math.random().toString(36).substr(2, 9),
          text: '',
          correctAnswer: '',
          category: 'ФИНАЛ',
          points: 0,
          round: 4,
          questionType: 'auction',
          mediaUrl: '',
          mediaType: 'image'
        });
      } else if (gameInfo.type === 'melody') {
        for (let c = 1; c <= 5; c++) {
          for (let q = 1; q <= 5; q++) {
            initialQuestions.push({
              id: Math.random().toString(36).substr(2, 9),
              text: 'Вопрос',
              correctAnswer: '',
              category: `Категория ${c}`,
              mediaUrl: '',
              mediaType: 'audio',
              audioStart: 0,
              audioEnd: 30
            });
          }
        }
      } else {
        initialQuestions = Array.from({ length: 10 }, (_, i) => ({
          id: Math.random().toString(36).substr(2, 9),
          text: '',
          correctAnswer: '',
          options: ['', '', '', ''],
          points: 100,
          mediaUrl: '',
          mediaType: 'image'
        }));
      }
      setQuestions(initialQuestions);
    }
  }, [step, gameInfo.type]);

  const handleAiImprove = async (index: number) => {
    const q = questions[index];
    setIsGenerating(true);
    try {
      let gameSpecificPrompt = '';
      switch (gameInfo.type) {
        case 'millionaire':
          gameSpecificPrompt = 'Это игра "Квиллионер" (аналог "Кто хочет стать миллионером"). Вопрос должен иметь 4 варианта ответа, один из которых правильный. Сложность должна расти.';
          break;
        case '100to1':
          gameSpecificPrompt = 'Это игра "Сто Квадному" (аналог "100 к 1"). Нужно 6 самых популярных ответов с баллами (100, 80, 60, 40, 20, 10).';
          break;
        case 'melody':
          gameSpecificPrompt = 'Это игра "Уквадай Мелодию". Вопрос - это название песни или исполнитель. Если есть варианты, предложи 4 похожих исполнителя/песни.';
          break;
        case 'jeopardy':
          gameSpecificPrompt = 'Это игра "Своя Иква" (аналог "Своя Игра"). Вопрос должен соответствовать категории и стоимости.';
          break;
        case 'whatwherewhen':
          gameSpecificPrompt = 'Это игра "Что? Где? Квада?" (аналог "Что? Где? Когда?"). Вопрос должен быть на логику, с интересным фактом и пояснением.';
          break;
        default:
          gameSpecificPrompt = 'Это блиц-вопрос с коротким ответом.';
      }

      const prompt = `Улучши вопрос для игры "${gameInfo.type}" на тему "${gameInfo.topic}".
      ${gameInfo.note ? `Примечание автора: "${gameInfo.note}".` : ''}
      ${gameSpecificPrompt}
      Текущий вопрос: "${q.text}"
      Текущий ответ: "${q.correctAnswer}"
      Сделай его более интересным, добавь юмора в стиле "Квада" (лягушки, болото, ирония, кваканье).
      Верни JSON с полями: text, correctAnswer, options (массив строк, если нужно), explanation, hint.`;
      
      const response = await generateContent({ contents: prompt });
      const improved = JSON.parse(response.text || '{}');
      
      const newQuestions = [...questions];
      newQuestions[index] = { ...newQuestions[index], ...improved };
      setQuestions(newQuestions);
    } catch (err) {
      console.error('AI Improvement error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const [pendingAiQuestions, setPendingAiQuestions] = useState<any[] | null>(null);

  const handleAiAssistant = async () => {
    if (!aiInput.trim()) return;
    const message = aiInput;
    setAiInput('');
    setIsGenerating(true);
    setPendingAiQuestions(null);
    setAiMessage('');
    startAiTimer(100);
    try {
      const currentQuestionsContext = questions
        .filter(q => q.text !== '')
        .map((q, i) => `${i+1}. ${q.text} (Ответ: ${q.correctAnswer})`)
        .join('\n');

      const prompt = `Ты - помощник конструктора игр "Квада". 
      Пользователь создает игру типа "${gameInfo.type}" на тему "${gameInfo.topic}" со сложностью "${gameInfo.difficulty}".
      ${gameInfo.note ? `Примечание пользователя к стилю и содержанию: "${gameInfo.note}".` : ''}
      Уже заполнено вопросов: ${questions.filter(q => q.text !== '').length} из ${questions.length}.
      Текущие вопросы:\n${currentQuestionsContext}
      
      Запрос пользователя: "${message}"
      
      Помоги ему составить вопросы. Предложи варианты или заполни пустые поля.
      Учитывай стиль "Квада" (лягушачья тематика, болото, ирония).
      Верни ответ в свободном стиле, но если предлагаешь вопросы, ОБЯЗАТЕЛЬНО используй формат JSON в конце.
      JSON формат: { "suggestedQuestions": [{ "text": "...", "correctAnswer": "...", "options": [...], "explanation": "...", "points": 100 }] }
      Для "100to1" добавь поле "answers": [{"text": "...", "points": 100, "mediaUrl": "...", "mediaType": "image|video"}, ...] (6 штук).`;
      
      const response = await generateContent({ contents: prompt });
      const text = response.text || '';
      
      const jsonMatch = text.match(/\{.*\}/s);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[0]);
          if (data.suggestedQuestions) {
            setPendingAiQuestions(data.suggestedQuestions);
          }
        } catch (e) {
          console.error('JSON parse error', e);
        }
      }
      setAiMessage(text.replace(/\{.*\}/s, '').trim());
      stopAiTimer();
    } catch (err) {
      console.error('AI Assistant error:', err);
      setAiMessage('Произошла ошибка при обращении к ИИ.');
      stopAiTimer();
    } finally {
      setIsGenerating(false);
    }
  };

  const applyAiSuggestions = () => {
    if (!pendingAiQuestions) return;
    
    const newQuestions = [...questions];
    let qIdx = 0;
    pendingAiQuestions.forEach((sq: any) => {
      // Find first empty or mostly empty question
      while (qIdx < newQuestions.length && newQuestions[qIdx].text !== '') {
        qIdx++;
      }
      if (qIdx < newQuestions.length) {
        newQuestions[qIdx] = { ...newQuestions[qIdx], ...sq };
      }
    });
    setQuestions(newQuestions);
    setPendingAiQuestions(null);
    setAiMessage(prev => prev + '\n\n✅ Вопросы добавлены в конструктор!');
  };

  const handleAudioUpload = async (index: number, file: File) => {
    const url = URL.createObjectURL(file);
    updateQuestion(index, { mediaUrl: url, mediaType: 'audio' });
  };

  const handleRemoveVocal = async (index: number) => {
    const q = questions[index];
    if (!q.mediaUrl) return alert('Сначала загрузите аудио-файл');
    
    setIsGenerating(true);
    try {
      // In a real app, we would call an API like LALAL.AI or a RapidAPI service
      // For now, we simulate the process and explain the best free options
      const prompt = `Пользователь хочет удалить вокал из песни для игры "Уквадай Мелодию".
      Песня: "${q.text || 'Неизвестно'}".
      Посоветуй лучший бесплатный способ или API для этого (например, Spleeter, VocalRemover.org, или RapidAPI Vocal Remover).
      Ответь кратко и вежливо в стиле лягушки-помощника.`;
      
      const response = await generateContent({ contents: prompt });
      alert(response.text || 'Используйте инструментальные версии треков или сервис VocalRemover.org для подготовки файлов.');
    } catch (err) {
      console.error('Vocal removal error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const addQuestion = () => {
    setQuestions([...questions, { 
      id: Math.random().toString(36).substr(2, 9), 
      text: '', 
      options: ['', '', '', ''], 
      correctAnswer: '', 
      points: 100 
    }]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    setQuestions(newQuestions);
  };

  const handleSaveGame = async () => {
    if (!user || !profile) return;
    if (!gameInfo.topic) return alert('Заполните основные поля игры');
    
    setLoading(true);
    try {
      const gameId = crypto.randomUUID();
      const playModeStr = String(gameInfo.playMode);
      const isMultiplayer =
        playModeStr === 'multi' ||
        playModeStr === 'multiplayer' ||
        playModeStr === 'public_multiplayer' ||
        playModeStr === 'private_multiplayer';
      const visibility =
        gameInfo.visibility === 'private' ||
        (gameInfo as any).mpVisibility === 'private' ||
        playModeStr === 'private_multiplayer'
          ? 'private'
          : 'public';
      const maxPlayers = Math.min(8, Math.max(2, Number(gameInfo.maxPlayers) || 4));

      const gameData = {
        id: gameId,
        title: gameInfo.title || gameInfo.topic,
        description: gameInfo.description || `Игра на тему ${gameInfo.topic}`,
        authorId: profile?.uid ?? "",
        mode: 'human',
        difficulty: gameInfo.difficulty,
        type: gameInfo.type,
        topic: gameInfo.topic,
        questions: questions as Question[],
        isMultiplayer,
        visibility,
        maxPlayers,
        costPerQuestion: gameInfo.costPerQuestion,
        isAI: false,
        createdAt: Date.now()
      };

      const authorName =
        profile?.display_name || (profile as any)?.displayName || profile?.email || 'Автор';
      const authorAvatar =
        profile?.photo_url || profile?.avatar_url || (profile as any)?.photoURL || '';

      await fetch('/api/game-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: gameId,
          game_type: gameInfo.type,
          title: gameData.title,
          topic: gameInfo.topic,
          difficulty: gameInfo.difficulty,
          author_id: profile?.uid ?? "",
          author_name: authorName,
          question_count: questions.length,
          is_public: visibility === 'public',
          questions: questions as Question[]
        })
      }).catch(() => {});

      if (isMultiplayer) {
        await fetch('/api/multiplayer/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameType: gameInfo.type,
            packId: gameId,
            title: gameData.title,
            topic: gameInfo.topic,
            difficulty: gameInfo.difficulty,
            hostId: profile?.uid ?? "",
            hostName: authorName,
            hostAvatar: authorAvatar,
            maxPlayers,
            visibility,
            questions: questions as Question[]
          })
        }).catch(() => {});
      }

      console.log('Game created:', gameData);
      navigate(isMultiplayer ? '/profile/multiplayer' : '/system-admin');
    } catch (error) {
      console.error('Error saving game:', error);
    } finally {
      setLoading(false);
    }
  };

  if (profile?.role !== 'admin' && profile?.role !== 'superadmin' && profile?.role !== 'author') {
    return <div className="p-20 text-center">Доступ запрещен</div>;
  }

  return (
    <div className="max-w-5xl lg:max-w-[1340px] mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-primary/20 bg-transparent p-6 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="rounded-full p-2 hover:bg-primary/10 text-primary">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-primary">Конструктор Игры</h1>
            <p className="text-sm text-foreground/60">Шаг {step} из 2: {step === 1 ? 'Основные настройки' : 'Вопросы и контент'}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <LeafButton 
            variant="glass"
            size="md"
            onClick={() => setShowAiAssistant(true)}
            icon={<Sparkles size={20} />}
          >
            ИИ-Помощник
          </LeafButton>
          {step === 2 && (
            <LeafButton 
              variant="primary"
              size="md"
              onClick={handleSaveGame}
              disabled={loading}
              icon={loading ? <Plus className="animate-spin" size={20} /> : <Save size={20} />}
            >
              Сохранить игру
            </LeafButton>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="max-w-2xl lg:max-w-[900px] mx-auto space-y-8"
          >
            <div className="space-y-8 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 shadow-xl">
              {/* Game Type */}
              <div className="space-y-4">
                <label className="text-sm font-bold text-primary">1. Тип Игры и Режим</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'blitz', label: 'КвИИз' },
                    { id: 'millionaire', label: 'Квиллионер' },
                    { id: '100to1', label: 'Сто Квадному' },
                    { id: 'whatwherewhen', label: 'Что? Где? Квада?' },
                    { id: 'melody', label: 'Уквадай Мелодию' },
                    { id: 'jeopardy', label: 'Своя Икра' }
                  ].map((type) => (
                    <BubbleElement
                      key={type.id}
                      as="button"
                      type="button"
                      active={gameInfo.type === type.id}
                      size="sm"
                      onClick={() => {
                        const modes = getGameModes(type.id);
                        setGameInfo(prev => ({
                          ...prev,
                          type: type.id as GameType,
                          playMode: modes.includes(prev.playMode) ? prev.playMode : 'single'
                        }));
                      }}
                    >
                      {type.label}
                    </BubbleElement>
                  ))}
                </div>

                {/* Mode Selector (Single vs Multiplayer) */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <LeafButton
                    type="button"
                    size="sm"
                    active={gameInfo.playMode === 'single'}
                    variant={gameInfo.playMode === 'single' ? 'primary' : 'glass'}
                    onClick={() => setGameInfo(prev => ({ ...prev, playMode: 'single' }))}
                  >
                    Одиночная
                  </LeafButton>
                  {Boolean(profile) && getGameModes(gameInfo.type).includes('multi') && (
                    <LeafButton
                      type="button"
                      size="sm"
                      active={gameInfo.playMode === 'multi'}
                      variant={gameInfo.playMode === 'multi' ? 'primary' : 'glass'}
                      onClick={() => setGameInfo(prev => ({ ...prev, playMode: 'multi' }))}
                    >
                      Мультиплеер
                    </LeafButton>
                  )}
                </div>

                {/* Multiplayer Settings: Open/Closed & Player Limit 2..8 */}
                {gameInfo.playMode === 'multi' && (
                  <div className="rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl p-4 space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-bold text-primary flex items-center gap-1.5">
                          <Users size={16} />
                          <span>Вид мультиплеера</span>
                        </span>
                        <span className="text-sm text-foreground/70">
                          {gameInfo.visibility === 'public'
                            ? 'Видна всем во вкладке Мультиплеер'
                            : 'Видна только вступившим по приглашению'}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <LeafButton
                          type="button"
                          size="sm"
                          active={gameInfo.visibility === 'public'}
                          variant={gameInfo.visibility === 'public' ? 'primary' : 'glass'}
                          onClick={() => setGameInfo(prev => ({ ...prev, visibility: 'public' }))}
                          icon={<Globe size={16} />}
                          className="w-full justify-center"
                        >
                          Открытая (для всех)
                        </LeafButton>
                        <LeafButton
                          type="button"
                          size="sm"
                          active={gameInfo.visibility === 'private'}
                          variant={gameInfo.visibility === 'private' ? 'primary' : 'glass'}
                          onClick={() => setGameInfo(prev => ({ ...prev, visibility: 'private' }))}
                          icon={<Lock size={16} />}
                          className="w-full justify-center"
                        >
                          Закрытая (по приглашению)
                        </LeafButton>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-primary/20">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-bold text-primary">Лимит игроков в лобби (от 2 до 8)</span>
                        <BubbleElement isBadge active size="sm">
                          Максимум: {gameInfo.maxPlayers} уч.
                        </BubbleElement>
                      </div>
                      <div className="grid grid-cols-7 gap-1.5">
                        {[2, 3, 4, 5, 6, 7, 8].map(num => (
                          <BubbleElement
                            key={`create-mp-limit-${num}`}
                            as="button"
                            type="button"
                            active={gameInfo.maxPlayers === num}
                            size="sm"
                            onClick={() => setGameInfo(prev => ({ ...prev, maxPlayers: num }))}
                            className="w-full justify-center py-2 text-sm font-black"
                          >
                            {num}
                          </BubbleElement>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Detailed Rules for Selected Game Type & Mode */}
                <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-primary">
                      Подробные правила ({gameInfo.playMode === 'multi' ? 'Мультиплеер' : 'Одиночная игра'}):
                    </span>
                  </div>
                  <p className="text-foreground/90 leading-relaxed">
                    {getGameDetailedRules(gameInfo.type, gameInfo.playMode)}
                  </p>
                </div>
              </div>

              {/* Title & Description */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <label className="text-sm font-bold text-primary">2. Название Игры</label>
                  <input 
                    type="text" 
                    value={gameInfo.title}
                    onChange={(e) => setGameInfo(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Например: Ква-Квиз про лягушек"
                    className="w-full rounded-xl border border-primary/30 bg-transparent backdrop-blur-md px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-all" 
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-sm font-bold text-primary">3. Описание</label>
                  <input 
                    type="text" 
                    value={gameInfo.description}
                    onChange={(e) => setGameInfo(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Краткое описание игры..."
                    className="w-full rounded-xl border border-primary/30 bg-transparent backdrop-blur-md px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-all" 
                  />
                </div>
              </div>

              {/* Topic */}
              <div className="space-y-4">
                <label className="text-sm font-bold text-primary">4. Тема</label>
                <div className="max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  <TopicCloud 
                    topics={DEFAULT_TOPICS}
                    selectedTopic={gameInfo.topic}
                    onSelect={(topic) => setGameInfo(prev => ({ ...prev, topic }))}
                  />
                </div>
                <input 
                  type="text" 
                  value={gameInfo.topic}
                  onChange={(e) => setGameInfo(prev => ({ ...prev, topic: e.target.value }))}
                  placeholder="Или введите свою тему..."
                  className="w-full rounded-xl border border-primary/30 bg-transparent backdrop-blur-md px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-all" 
                />
                <div className="space-y-2 pt-2">
                  <label className="text-sm font-bold text-primary">Примечание для ИИ (голосом или текстом)</label>
                  <MiniAudioField
                    value={gameInfo.note}
                    onChange={(val) => setGameInfo(prev => ({ ...prev, note: val }))}
                    placeholder="Уточните пожелания к вопросам (эпоха, стиль, акценты)..."
                    multiline
                    rows={2}
                  />
                </div>
              </div>

              {/* Difficulty */}
              {gameInfo.type !== 'millionaire' && gameInfo.type !== '100to1' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-bold text-primary">5. Сложность игры</label>
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DIFFICULTIES.map((diff) => (
                      <div key={diff.id} className="relative group/diff">
                        <LeafButton
                          type="button"
                          size="sm"
                          active={gameInfo.difficulty === diff.id}
                          variant={gameInfo.difficulty === diff.id ? 'primary' : 'glass'}
                          onClick={() => setGameInfo(prev => ({ ...prev, difficulty: diff.id as Difficulty }))}
                          className="w-full justify-center py-2.5 text-sm"
                        >
                          {diff.name}
                        </LeafButton>
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-2xl border border-primary/45 bg-transparent backdrop-blur-3xl p-3 text-center text-sm opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.65)] transition-all duration-200 group-hover/diff:opacity-100 group-hover/diff:translate-y-0 translate-y-1 z-40">
                          <p className="font-black text-primary text-sm">{diff.name} ({diff.level})</p>
                          <p className="text-sm text-foreground/95 mt-1 leading-snug">{diff.description}</p>
                          <p className="text-sm text-primary font-mono font-bold mt-1.5">Множитель очков: x{diff.multiplier}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Price */}
              <div className="space-y-4">
                <label className="text-sm font-bold text-primary">6. Стоимость за 1 вопрос</label>
                <div className="relative">
                  <input 
                    type="number" 
                    min="1"
                    step="1"
                    value={gameInfo.costPerQuestion}
                    onChange={(e) => setGameInfo(prev => ({ ...prev, costPerQuestion: Math.max(1, Math.floor(Number(e.target.value))) }))}
                    className="w-full rounded-xl border border-primary/30 bg-transparent backdrop-blur-md px-4 py-4 text-xl font-bold text-foreground outline-none focus:border-primary transition-all" 
                  />
                </div>
              </div>

              <LeafButton 
                variant="primary"
                size="lg"
                onClick={() => {
                  if (!gameInfo.topic) return alert('Выберите или введите тему игры');
                  setStep(2);
                }}
                className="w-full justify-center gap-3"
              >
                <span>Далее к вопросам</span>
                <ChevronRight size={20} />
              </LeafButton>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-primary">Вопросы игры ({questions.length})</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-foreground/60">
                  <span>Тип: <span className="text-primary">{gameInfo.type}</span></span>
                  <span>Тема: <span className="text-primary">{gameInfo.topic}</span></span>
                  <span>Название: <span className="text-primary">{gameInfo.title}</span></span>
                  {gameInfo.type !== 'millionaire' && gameInfo.type !== '100to1' && (
                    <span>Сложность: <span className="text-primary">{gameInfo.difficulty}</span></span>
                  )}
                  <span className="w-full mt-1">Описание: <span className="text-primary">{gameInfo.description}</span></span>
                </div>
              </div>
              <button onClick={() => setStep(1)} className="text-sm font-bold text-foreground/60 hover:text-primary flex items-center gap-1">
                <ChevronLeft size={18} />
                Назад к настройкам
              </button>
            </div>

            <div className="space-y-6">
              {questions.map((q, index) => (
                <motion.div 
                  key={q.id ? `q-${q.id}-${index}` : `q-idx-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 space-y-6 relative group shadow-xl"
                >
                  {gameInfo.type === 'iqbox' && (
                    <button 
                      onClick={() => removeQuestion(index)}
                      className="absolute right-6 top-6 text-foreground/40 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}

                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-background font-black shrink-0">
                      {gameInfo.type === 'jeopardy' ? (q.round === 4 ? 'Ф' : `Т${q.round}`) : (gameInfo.type === 'millionaire' ? `L${index + 1}` : (gameInfo.type === '100to1' ? `Т${q.round}` : index + 1))}
                    </div>
                    <div className="flex-1 flex items-center gap-4">
                      <input 
                        type="text" 
                        value={q.text}
                        onChange={(e) => updateQuestion(index, { text: e.target.value })}
                        placeholder={gameInfo.type === 'melody' ? "Введите вопрос про песню" : "Введите текст вопроса..."}
                        className="flex-1 bg-transparent text-xl font-bold text-primary outline-none border-b border-primary/20 pb-2 focus:border-primary transition-colors"
                      />
                      <LeafButton 
                        variant="glass"
                        size="sm"
                        onClick={() => handleAiImprove(index)}
                        disabled={isGenerating}
                        icon={<Wand2 size={16} />}
                      >
                        ИИ-Улучшение
                      </LeafButton>
                    </div>
                  </div>

                  <div className={gameInfo.type === '100to1' ? "space-y-6" : "grid grid-cols-1 md:grid-cols-2 gap-8"}>
                    {/* Media & Points */}
                    {gameInfo.type !== '100to1' && (
                      <div className="space-y-4">
                        {gameInfo.type === 'melody' ? (
                        <div className="space-y-4 p-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md">
                          <label className="text-sm font-bold text-primary">Монтажное окно аудио</label>
                          <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-4">
                              <input 
                                type="file" 
                                accept="audio/*"
                                onChange={(e) => e.target.files?.[0] && handleAudioUpload(index, e.target.files[0])}
                                className="hidden"
                                id={`audio-upload-${index}`}
                              />
                              <label 
                                htmlFor={`audio-upload-${index}`}
                                className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 p-4 cursor-pointer hover:border-primary transition-all"
                              >
                                <Music size={20} className="text-primary" />
                                <span className="text-sm font-bold text-primary">
                                  {q.mediaUrl ? 'Файл выбран' : 'Загрузить аудио'}
                                </span>
                              </label>
                              <button 
                                onClick={() => handleRemoveVocal(index)}
                                className="flex items-center gap-2 rounded-xl bg-transparent border border-primary/30 px-4 py-4 text-sm font-bold text-primary hover:bg-primary/10"
                                title="Удалить голос (ИИ)"
                              >
                                <MicOff size={18} />
                                <span className="hidden sm:inline text-sm">Удалить голос</span>
                              </button>
                            </div>
                            
                            {q.mediaUrl && (
                              <div className="space-y-4 bg-transparent p-4 rounded-xl border border-primary/20 backdrop-blur-sm">
                                <div className="flex items-center justify-between gap-4">
                                  <audio controls src={q.mediaUrl} className="flex-1 h-10" />
                                  <div className="flex items-center gap-2 text-sm text-primary font-bold">
                                    <Scissors size={16} />
                                    30 сек
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <label className="text-sm font-bold text-foreground/60">Начало (сек)</label>
                                    <input 
                                      type="number" 
                                      value={q.audioStart || 0}
                                      onChange={(e) => {
                                        const start = Number(e.target.value);
                                        updateQuestion(index, { audioStart: start, audioEnd: start + 30 });
                                      }}
                                      className="w-full rounded-lg border border-primary/30 bg-transparent px-3 py-2 text-sm font-bold text-foreground"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-sm font-bold text-foreground/60">Конец (авто +30с)</label>
                                    <input 
                                      type="number" 
                                      readOnly
                                      value={(q.audioStart || 0) + 30}
                                      className="w-full rounded-lg border border-primary/20 bg-transparent px-3 py-2 text-sm font-bold text-foreground/50"
                                    />
                                  </div>
                                </div>
                                <div className="h-2 bg-primary/20 rounded-full relative overflow-hidden">
                                  <div 
                                    className="absolute h-full bg-primary/60 transition-all"
                                    style={{ 
                                      left: `${(q.audioStart || 0) / 3}%`, 
                                      width: '10%'
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground/60">Медиа-контент (URL)</label>
                            <div className="flex gap-2">
                              <div className="flex-1 relative">
                                <input 
                                  type="text" 
                                  value={q.mediaUrl || ''}
                                  onChange={(e) => updateQuestion(index, { mediaUrl: e.target.value })}
                                  placeholder="https://..."
                                  className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 pl-10 text-sm text-foreground outline-none focus:border-primary"
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/60">
                                  {q.mediaType === 'image' && <ImageIcon size={16} />}
                                  {q.mediaType === 'video' && <Video size={16} />}
                                  {q.mediaType === 'audio' && <Music size={16} />}
                                  {!q.mediaType && <HelpCircle size={16} />}
                                </div>
                              </div>
                              <select 
                                value={q.mediaType || ''}
                                onChange={(e) => updateQuestion(index, { mediaType: e.target.value as any })}
                                className="rounded-xl border border-primary/30 bg-transparent px-3 text-sm text-foreground outline-none focus:border-primary"
                              >
                                <option value="" className="bg-background text-foreground">Нет</option>
                                <option value="image" className="bg-background text-foreground">Фото</option>
                                <option value="video" className="bg-background text-foreground">Видео</option>
                                <option value="audio" className="bg-background text-foreground">Аудио</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {gameInfo.type !== 'blitz' && gameInfo.type !== 'whatwherewhen' && gameInfo.type !== 'melody' && (
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-foreground/60">Баллы за ответ</label>
                          <input 
                            type="number" 
                            value={q.points}
                            readOnly={gameInfo.type === 'millionaire' || gameInfo.type === 'jeopardy'}
                            onChange={(e) => updateQuestion(index, { points: Number(e.target.value) })}
                            className={`w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm text-foreground outline-none ${gameInfo.type === 'millionaire' || gameInfo.type === 'jeopardy' ? 'opacity-50 cursor-not-allowed' : 'focus:border-primary'}`}
                          />
                        </div>
                      )}

                      {gameInfo.type !== 'blitz' && gameInfo.type !== 'whatwherewhen' && gameInfo.type !== 'melody' && gameInfo.type !== 'jeopardy' && (
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-foreground/60">Подсказка (необязательно)</label>
                          <input 
                            type="text" 
                            value={q.hint || ''}
                            onChange={(e) => updateQuestion(index, { hint: e.target.value })}
                            placeholder="Дайте игроку наводку..."
                            className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                          />
                        </div>
                      )}
                    </div>
                    )}

                    {/* Specialized Fields based on Game Type */}
                    <div className="space-y-4">
                      {gameInfo.type === '100to1' ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-bold text-foreground/70">Популярные ответы (Тур {q.round})</label>
                            {q.round < 4 && (
                              <div className="text-sm font-bold text-primary">Множитель: x{q.round}</div>
                            )}
                          </div>
                          <div className="grid gap-4">
                            {(q.answers || []).map((ans: any, ansIndex: number) => (
                              <div key={`q-${index}-ans-${ansIndex}`} className="space-y-2 p-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-sm">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-bold w-4 text-primary">{ansIndex + 1}</span>
                                  <input 
                                    type="text" 
                                    value={ans.text}
                                    onChange={(e) => {
                                      const newAns = [...(q.answers || [])];
                                      newAns[ansIndex] = { ...newAns[ansIndex], text: e.target.value };
                                      updateQuestion(index, { answers: newAns });
                                    }}
                                    placeholder={`Вариант ${ansIndex + 1}`}
                                    className="flex-1 rounded-xl border border-primary/30 bg-transparent px-4 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors"
                                  />
                                  <input 
                                    type="text" 
                                    value={ans.hint || ''}
                                    onChange={(e) => {
                                      const newAns = [...(q.answers || [])];
                                      newAns[ansIndex] = { ...newAns[ansIndex], hint: e.target.value };
                                      updateQuestion(index, { answers: newAns });
                                    }}
                                    placeholder="Наводка"
                                    className="flex-1 rounded-xl border border-primary/30 bg-transparent px-4 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors"
                                  />
                                  <div className="flex items-center gap-1">
                                    <input 
                                      type="number" 
                                      value={ans.points}
                                      onChange={(e) => {
                                        const newAns = [...(q.answers || [])];
                                        newAns[ansIndex] = { ...newAns[ansIndex], points: Number(e.target.value) };
                                        updateQuestion(index, { answers: newAns });
                                      }}
                                      className="w-16 rounded-xl border border-primary/30 bg-transparent px-2 py-2 text-sm font-bold text-foreground outline-none"
                                    />
                                    {q.round < 4 && (
                                      <span className="text-sm font-bold text-foreground/60">x{q.round} = {ans.points * q.round}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 pl-7">
                                  <div className="flex-1 relative">
                                    <input 
                                      type="text" 
                                      value={ans.mediaUrl || ''}
                                      onChange={(e) => {
                                        const newAns = [...(q.answers || [])];
                                        newAns[ansIndex] = { ...newAns[ansIndex], mediaUrl: e.target.value };
                                        updateQuestion(index, { answers: newAns });
                                      }}
                                      placeholder="Медиа URL (показывается при открытии ответа)"
                                      className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-2 pl-8 text-sm text-foreground outline-none focus:border-primary transition-colors"
                                    />
                                    <div className="absolute left-2 top-1/2 -translate-y-1/2 text-foreground/50">
                                      {ans.mediaType === 'video' ? <Video size={14} /> : <ImageIcon size={14} />}
                                    </div>
                                  </div>
                                  <select 
                                    value={ans.mediaType || 'image'}
                                    onChange={(e) => {
                                      const newAns = [...(q.answers || [])];
                                      newAns[ansIndex] = { ...newAns[ansIndex], mediaType: e.target.value as any };
                                      updateQuestion(index, { answers: newAns });
                                    }}
                                    className="rounded-xl border border-primary/30 bg-transparent px-3 py-2 text-sm text-foreground outline-none"
                                  >
                                    <option value="image" className="bg-background text-foreground">Фото</option>
                                    <option value="video" className="bg-background text-foreground">Видео</option>
                                  </select>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : gameInfo.type === 'whatwherewhen' ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-foreground/70">ФИО Телезрителя</label>
                              <input 
                                type="text" 
                                value={q.viewerName || ''}
                                onChange={(e) => updateQuestion(index, { viewerName: e.target.value })}
                                placeholder="Иванов И.И."
                                className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-foreground/70">Адрес Телезрителя</label>
                              <input 
                                type="text" 
                                value={q.viewerAddress || ''}
                                onChange={(e) => updateQuestion(index, { viewerAddress: e.target.value })}
                                placeholder="г. Москва"
                                className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground/70">Правильный ответ</label>
                            <input 
                              type="text" 
                              value={q.correctAnswer}
                              onChange={(e) => updateQuestion(index, { correctAnswer: e.target.value })}
                              placeholder="Текст правильного ответа"
                              className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm text-foreground outline-none focus:border-primary transition-colors"
                            />
                          </div>
                        </div>
                      ) : gameInfo.type === 'melody' || gameInfo.type === 'blitz' ? (
                        <div className="space-y-4">
                          {gameInfo.type === 'melody' && (
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-foreground/70">Категория {Math.floor(index / 5) + 1}</label>
                              <input 
                                type="text" 
                                value={q.category || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const catIdx = Math.floor(index / 5);
                                  const blockStartIdx = catIdx * 5;
                                  
                                  const newQuestions = [...questions];
                                  for (let i = 0; i < 5; i++) {
                                    newQuestions[blockStartIdx + i] = { ...newQuestions[blockStartIdx + i], category: val };
                                  }
                                  setQuestions(newQuestions);
                                }}
                                placeholder="Название категории для всего блока"
                                className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                              />
                            </div>
                          )}
                          <label className="text-sm font-bold text-foreground/70">Правильный ответ</label>
                          <input 
                            type="text" 
                            value={q.correctAnswer}
                            onChange={(e) => updateQuestion(index, { correctAnswer: e.target.value })}
                            placeholder={gameInfo.type === 'melody' ? "Тут правильный ответ про песню" : "Введите правильный ответ"}
                            className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm text-foreground outline-none focus:border-primary transition-colors"
                          />
                        </div>
                      ) : gameInfo.type === 'jeopardy' ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-foreground/70">Тур</label>
                              <div className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm font-bold text-primary">
                                {q.round === 4 ? 'Финал' : `${q.round} Тур`}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-foreground/70">Тип вопроса</label>
                              <select 
                                value={q.round === 4 ? 'auction' : (q.questionType || 'normal')}
                                disabled={q.round === 4}
                                onChange={(e) => updateQuestion(index, { questionType: e.target.value as any })}
                                className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm text-foreground outline-none disabled:opacity-50"
                              >
                                <option value="normal" className="bg-background text-foreground">Обычный</option>
                                <option value="cat_in_bag" className="bg-background text-foreground">Кот в мешке</option>
                                <option value="auction" className="bg-background text-foreground">Аукцион</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground/70">
                              {q.round === 4 ? 'Введите категорию' : `Категория ${Math.floor((index % 25) / 5) + 1}`}
                            </label>
                            {q.round < 4 ? (
                              <input 
                                type="text" 
                                value={q.category || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const roundStartIdx = (q.round - 1) * 25;
                                  const catIdx = Math.floor((index % 25) / 5);
                                  const blockStartIdx = roundStartIdx + (catIdx * 5);
                                  
                                  const newQuestions = [...questions];
                                  for (let i = 0; i < 5; i++) {
                                    newQuestions[blockStartIdx + i] = { ...newQuestions[blockStartIdx + i], category: val };
                                  }
                                  setQuestions(newQuestions);
                                }}
                                placeholder="Название категории для всего блока"
                                className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                              />
                            ) : (
                              <input 
                                type="text" 
                                value={q.category || ''}
                                onChange={(e) => updateQuestion(index, { category: e.target.value })}
                                placeholder="Название категории"
                                className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
                              />
                            )}
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground/70">Правильный ответ</label>
                            <input 
                              type="text" 
                              value={q.correctAnswer}
                              onChange={(e) => updateQuestion(index, { correctAnswer: e.target.value })}
                              placeholder="Текст правильного ответа"
                              className="w-full rounded-xl border border-primary/30 bg-transparent px-4 py-3 text-sm text-foreground outline-none focus:border-primary transition-colors"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <label className="text-sm font-bold text-foreground/70">Варианты ответов</label>
                          <div className="grid gap-3">
                            {q.options?.map((opt: string, optIndex: number) => (
                              <div key={`q-${index}-opt-${optIndex}`} className="flex items-center gap-2">
                                <button 
                                  onClick={() => updateQuestion(index, { correctAnswer: opt })}
                                  className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    q.correctAnswer === opt && opt !== '' ? 'bg-primary border-primary text-background' : 'border-primary/30 text-transparent'
                                  }`}
                                >
                                  <CheckCircle2 size={14} />
                                </button>
                                <input 
                                  type="text" 
                                  value={opt}
                                  onChange={(e) => {
                                    const newOpts = [...(q.options || [])];
                                    newOpts[optIndex] = e.target.value;
                                    updateQuestion(index, { options: newOpts });
                                  }}
                                  placeholder={`Вариант ${optIndex + 1}`}
                                  className="flex-1 rounded-xl border border-primary/30 bg-transparent px-4 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors"
                                />
                              </div>
                            ))}
                          </div>
                          <p className="text-sm text-foreground/60 italic">* Нажмите на круг, чтобы отметить верный ответ</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {gameInfo.type === 'iqbox' && (
              <button 
                onClick={addQuestion}
                className="w-full py-8 rounded-3xl border-2 border-dashed border-primary/30 text-primary hover:border-primary hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-2"
              >
                <Plus size={32} />
                <span className="font-bold text-base">Добавить вопрос</span>
              </button>
            )}

            <div className="flex gap-4 pt-8">
              <LeafButton 
                variant="glass"
                size="lg"
                onClick={() => setStep(1)} 
                className="flex-1 justify-center"
              >
                Назад
              </LeafButton>
              <LeafButton 
                variant="primary"
                size="lg"
                onClick={handleSaveGame} 
                className="flex-1 justify-center"
              >
                Завершить и сохранить
              </LeafButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unified Difficulty Information Modal with Darkening */}
      {isDifficultyInfoOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-2xl p-4"
          onClick={() => setIsDifficultyInfoOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-primary/40 bg-black/85 backdrop-blur-3xl p-5 sm:p-6 shadow-[0_16px_48px_rgba(0,0,0,0.85)] text-foreground space-y-4"
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
                const isSelected = gameInfo.difficulty === d.id;
                return (
                  <div
                    key={`create-diff-info-${d.id}`}
                    onClick={() => {
                      setGameInfo(prev => ({ ...prev, difficulty: d.id as Difficulty }));
                      setIsDifficultyInfoOpen(false);
                    }}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all space-y-1.5 ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(182,255,46,0.15)]'
                        : 'border-primary/25 bg-black/50 hover:border-primary/60'
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

      {/* AI Assistant Modal */}
      <AnimatePresence>
        {showAiAssistant && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end bg-transparent p-4 backdrop-blur-2xl">
            <motion.div 
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              className="w-full max-w-md h-full bg-transparent backdrop-blur-2xl border border-primary/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-primary/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-background">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-primary">ИИ-Помощник</h3>
                    <p className="text-sm text-foreground/60">Твой креативный напарник</p>
                  </div>
                </div>
                <button onClick={() => setShowAiAssistant(false)} className="text-foreground/60 hover:text-primary">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {aiMessage ? (
                  <div className="space-y-4">
                    <div className="bg-transparent border border-primary/20 backdrop-blur-md rounded-2xl p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                      {aiMessage}
                    </div>
                    {pendingAiQuestions && (
                      <LeafButton 
                        variant="primary"
                        size="md"
                        onClick={applyAiSuggestions}
                        icon={<Save size={18} />}
                        className="w-full justify-center"
                      >
                        Заполнить вопросы
                      </LeafButton>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-10 space-y-4">
                    <div className="h-16 w-16 rounded-full bg-transparent border border-primary/20 flex items-center justify-center mx-auto text-primary">
                      <MessageSquare size={32} />
                    </div>
                    <p className="text-sm text-foreground/70 leading-relaxed">
                      Привет! Я помогу тебе придумать вопросы для игры. <br/>
                      Просто напиши, о чем должна быть игра или попроси предложить варианты.
                    </p>
                  </div>
                )}
                {isGenerating && (
                  <div className="flex flex-col items-center gap-4 py-10">
                    <div className="flex items-center gap-2 text-primary text-sm font-bold animate-pulse">
                      <Sparkles size={16} className="animate-spin" />
                      Ква-ква-думаю... ({aiTimer}с)
                    </div>
                    {aiTimer === 0 && (
                      <div className="text-center space-y-4">
                        <p className="text-sm text-red-400 font-bold">ИИ немного думает дольше обычного</p>
                        <div className="flex gap-2">
                          <LeafButton 
                            variant="primary"
                            size="sm"
                            onClick={handleAiAssistant}
                          >
                            Еще раз
                          </LeafButton>
                          <LeafButton 
                            variant="glass"
                            size="sm"
                            onClick={() => {
                              setIsGenerating(false);
                              setShowAiAssistant(false);
                            }}
                          >
                            Пропустить
                          </LeafButton>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-primary/20 bg-transparent">
                <div className="relative">
                  <input 
                    type="text" 
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAiAssistant()}
                    placeholder="Напиши запрос..."
                    className="w-full rounded-2xl border border-primary/30 bg-transparent px-4 py-4 pr-12 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <button 
                    onClick={handleAiAssistant}
                    disabled={isGenerating || !aiInput.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-primary text-background flex items-center justify-center disabled:opacity-50 transition-transform hover:scale-105"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
