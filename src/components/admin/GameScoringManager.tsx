import React, { useState, useEffect } from 'react';
import { 
  Leaf, 
  Sparkles, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Sliders, 
  Database, 
  Calculator, 
  Layers, 
  ShieldCheck,
  Trophy,
  HelpCircle,
  Flame,
  Award,
  CircleDot
} from 'lucide-react';
import { BubbleCurrencyIcon } from '../BubbleIcon';

export interface ScoringSetting {
  id: string;
  game_id: string;
  game_title: string;
  score_multiplier: number;
  points_per_correct: number;
  points_per_incorrect: number;
  multiplier_ikra: number;
  multiplier_golovastik: number;
  multiplier_kvant: number;
  multiplier_lyaga: number;
  win_bonus?: number;
  has_difficulty?: number;
  description: string;
  updated_at?: string;
}

interface GameScoringManagerProps {
  onOpenTable?: (tableName: string) => void;
  adminFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

// 1. Игры со ступенчатой сложностью (выбор Икра, Головастик, Квант, Ляга)
const DIFFICULTY_BASED_GAMES = [
  { 
    id: 'blitz', 
    title: 'КвИИз', 
    badge: '4 уровня сложности',
    desc: 'Множители: Икра x1, Головастик x10, Квант x100, Ляга x1000' 
  },
  { 
    id: 'whatwherewhen', 
    title: 'ЧтоГдеКвада', 
    badge: '4 уровня сложности',
    desc: 'Множители: Икра x1, Головастик x10, Квант x100, Ляга x1000' 
  },
  { 
    id: 'melody', 
    title: 'Уквакай мелодию', 
    badge: '4 уровня сложности',
    desc: 'Множители: Икра x1, Головастик x10, Квант x100, Ляга x1000' 
  }
];

// 2. Игры с внутренней/бесуровневой механикой сложности
const LADDER_AND_ROUND_GAMES = [
  { 
    id: 'millionaire', 
    title: 'Квиллионер', 
    badge: '15 вопросов лестницы',
    desc: 'Сложность растет с каждым вопросом. Уровни сложности не используются.' 
  },
  { 
    id: '100to1', 
    title: 'Сто Квадному', 
    badge: '5 туров опросов',
    desc: 'Сложность определяется популярностью ответов и турами. Уровни не используются.' 
  },
  { 
    id: 'jeopardy', 
    title: 'Своя Икра', 
    badge: 'Номиналы тем и туров',
    desc: 'Сложность возрастает вместе с номиналами вопросов. Уровни не используются.' 
  }
];

const MILLIONAIRE_LADDER = [
  { q: 1, prize: 100, fireproof: false },
  { q: 2, prize: 200, fireproof: false },
  { q: 3, prize: 300, fireproof: false },
  { q: 4, prize: 500, fireproof: false },
  { q: 5, prize: 1000, fireproof: true },
  { q: 6, prize: 2000, fireproof: false },
  { q: 7, prize: 4000, fireproof: false },
  { q: 8, prize: 8000, fireproof: false },
  { q: 9, prize: 16000, fireproof: false },
  { q: 10, prize: 32000, fireproof: true },
  { q: 11, prize: 64000, fireproof: false },
  { q: 12, prize: 125000, fireproof: false },
  { q: 13, prize: 250000, fireproof: false },
  { q: 14, prize: 500000, fireproof: false },
  { q: 15, prize: 1000000, fireproof: true }
];

export const GameScoringManager: React.FC<GameScoringManagerProps> = ({ onOpenTable, adminFetch }) => {
  const [settings, setSettings] = useState<ScoringSetting[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('blitz');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state for active game
  const [formData, setFormData] = useState<ScoringSetting | null>(null);

  // Simulation calculator states
  // 1. Difficulty games (blitz, whatwherewhen, melody)
  const [simDifficulty, setSimDifficulty] = useState<string>('people');
  const [simCorrect, setSimCorrect] = useState<number>(6);
  const [simTotal, setSimTotal] = useState<number>(6);

  // 2. Квиллионер (ladder)
  const [simMillionaireQ, setSimMillionaireQ] = useState<number>(10);
  const [simMillionaireAction, setSimMillionaireAction] = useState<'walk' | 'wrong' | 'jackpot'>('walk');

  // 3. Сто Квадному (survey points)
  const [sim100to1Points, setSim100to1Points] = useState<number>(350);
  const [sim100to1Win, setSim100to1Win] = useState<boolean>(true);

  // 4. Своя Икра (game score)
  const [simJeopardyScore, setSimJeopardyScore] = useState<number>(3200);
  const [simJeopardyWin, setSimJeopardyWin] = useState<boolean>(true);

  // Calculation results
  const [simResult, setSimResult] = useState<number | null>(null);
  const [simLadderPrize, setSimLadderPrize] = useState<number | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const isDifficultyGame = DIFFICULTY_BASED_GAMES.some(g => g.id === selectedGameId);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const doFetch = async (url: string, init?: RequestInit) => {
    if (adminFetch) return adminFetch(url, init);
    const uid = localStorage.getItem('qaiz_user_uid') || '10016926299';
    const headers = new Headers(init?.headers);
    if (!headers.has('x-user-uid')) headers.set('x-user-uid', uid);
    return fetch(url, { ...init, headers });
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await doFetch('/api/game-scoring/matrix');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setSettings(data.data);
        const current = data.data.find((item: ScoringSetting) => item.game_id === selectedGameId || item.id === selectedGameId);
        if (current) {
          setFormData({ ...current });
        }
      } else {
        showNotification('Не удалось загрузить настройки очков из базы данных', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'Ошибка сети при загрузке настроек', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const current = settings.find(item => item.game_id === selectedGameId || item.id === selectedGameId);
    if (current) {
      setFormData({ ...current });
    }
  }, [selectedGameId, settings]);

  const handleFieldChange = (field: keyof ScoringSetting, val: any) => {
    if (!formData) return;
    setFormData({
      ...formData,
      [field]: val
    });
  };

  const handleSaveToDatabase = async () => {
    if (!formData) return;
    setSaving(true);
    try {
      const res = await doFetch(`/api/game-scoring/${formData.game_id || formData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Настройки успешно зафиксированы в базе данных и синхронизированы', 'success');
        await loadSettings();
        handleSimulate();
      } else {
        showNotification(data.error || 'Ошибка сохранения в базу данных', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'Сетевая ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSimulate = async () => {
    setSimLoading(true);
    try {
      const bodyPayload: any = {
        gameId: selectedGameId
      };

      if (selectedGameId === 'millionaire') {
        bodyPayload.millionaireQuestion = simMillionaireQ;
        bodyPayload.millionaireOutcome = simMillionaireAction;
      } else if (selectedGameId === '100to1') {
        bodyPayload.surveyPoints = sim100to1Points;
        bodyPayload.isWin = sim100to1Win;
      } else if (selectedGameId === 'jeopardy') {
        bodyPayload.jeopardyScore = simJeopardyScore;
        bodyPayload.isWin = simJeopardyWin;
      } else {
        bodyPayload.difficulty = simDifficulty;
        bodyPayload.correctAnswers = simCorrect;
        bodyPayload.totalQuestions = simTotal;
        bodyPayload.isWin = simCorrect >= (selectedGameId === 'whatwherewhen' ? 6 : 1);
      }

      const res = await doFetch('/api/game-scoring/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (data.success) {
        setSimResult(data.calculatedScore);
        if (data.simulatedLadderPrize !== undefined) {
          setSimLadderPrize(data.simulatedLadderPrize);
        } else {
          setSimLadderPrize(null);
        }
      }
    } catch (_) {
    } finally {
      setSimLoading(false);
    }
  };

  useEffect(() => {
    handleSimulate();
  }, [
    selectedGameId, 
    simDifficulty, 
    simCorrect, 
    simTotal, 
    simMillionaireQ, 
    simMillionaireAction, 
    sim100to1Points, 
    sim100to1Win, 
    simJeopardyScore, 
    simJeopardyWin, 
    settings
  ]);

  return (
    <div className="space-y-6">
      {/* Top Header Card in Liquid Glass style */}
      <div className="p-5 rounded-2xl border border-white/10 bg-transparent backdrop-blur-xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border border-primary/30 text-primary">
              <Leaf size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                Управление очками и коэффициентами
              </h2>
              <p className="text-sm text-foreground/70">
                Истина хранится в базе данных PostgreSQL в таблицах game_scoring_settings и game_scoring_rules
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {onOpenTable && (
            <>
              <button
                type="button"
                onClick={() => onOpenTable('game_scoring_settings')}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-white/10 bg-transparent backdrop-blur-xl hover:border-primary/40 text-foreground font-semibold text-sm transition-all flex items-center gap-2"
              >
                <Database size={16} className="text-primary" />
                <span>Таблица game_scoring_settings</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenTable('game_scoring_rules')}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-white/10 bg-transparent backdrop-blur-xl hover:border-primary/40 text-foreground font-semibold text-sm transition-all flex items-center gap-2"
              >
                <Layers size={16} className="text-primary" />
                <span>Таблица game_scoring_rules</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={loadSettings}
            disabled={loading}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-white/10 bg-transparent backdrop-blur-xl hover:border-primary/40 text-foreground font-semibold text-sm transition-all flex items-center gap-2"
          >
            <RefreshCw size={16} className={`text-primary ${loading ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </div>
      </div>

      {/* Notification banner */}
      {statusMsg && (
        <div className={`p-4 rounded-xl border backdrop-blur-xl flex items-center gap-3 text-sm font-semibold transition-all ${
          statusMsg.type === 'success'
            ? 'border-primary/40 text-primary'
            : 'border-red-500/40 text-red-400'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Game Selector Section - Distinct Groups */}
      <div className="p-5 rounded-2xl border border-white/10 bg-transparent backdrop-blur-xl shadow-lg space-y-5">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Leaf size={16} className="text-primary" />
          <span>Разделение игр по структуре начисления очков</span>
        </div>

        {/* Group 1: Difficulty Based Games */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
              <BubbleCurrencyIcon className="w-4 h-4" />
              <span>Игры со ступенчатыми уровнями сложности (Икра, Головастик, Квант, Ляга)</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DIFFICULTY_BASED_GAMES.map(g => {
              const isSelected = selectedGameId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGameId(g.id)}
                  className={`min-h-[56px] p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-primary text-primary shadow-sm ring-1 ring-primary/40'
                      : 'border-white/10 hover:border-white/25 text-foreground/85'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-sm truncate">{g.title}</span>
                    <Leaf size={15} className={isSelected ? 'text-primary' : 'text-foreground/40'} />
                  </div>
                  <span className="text-sm opacity-70 mt-1">{g.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Group 2: Games without Ikra/Golovastik/Kvant/Lyaga */}
        <div className="space-y-2.5 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              <span>Игры с внутренней механикой сложности (без выбора сложности Икра, Головастик, Квант, Ляга)</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {LADDER_AND_ROUND_GAMES.map(g => {
              const isSelected = selectedGameId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGameId(g.id)}
                  className={`min-h-[56px] p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-primary text-primary shadow-sm ring-1 ring-primary/40'
                      : 'border-white/10 hover:border-white/25 text-foreground/85'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-sm truncate">{g.title}</span>
                    <BubbleCurrencyIcon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'opacity-40'}`} />
                  </div>
                  <span className="text-sm opacity-70 mt-1">{g.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Game Configuration Form */}
      {formData && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Parameters Panel */}
          <div className="lg:col-span-8 space-y-6">
            <div className="p-6 rounded-2xl border border-white/10 bg-transparent backdrop-blur-xl shadow-lg space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl border border-primary/30 text-primary">
                    <Sliders size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      {formData.game_title}
                    </h3>
                    <p className="text-sm text-foreground/70">
                      {isDifficultyGame 
                        ? 'Настройка 4 уровней сложности (Икра, Головастик, Квант, Ляга) и очков'
                        : selectedGameId === 'millionaire'
                          ? 'Нарастающая лестница выигрыша (15 вопросов), множитель конвертации и бонусы'
                          : selectedGameId === '100to1'
                            ? 'Коэффициенты опросов раундов (простая, двойная, тройная, наоборот, большая игра)'
                            : 'Счёт по номиналам категорий раундов и итоговый коэффициент конвертации'
                      }
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border border-primary/30 text-primary">
                  <Leaf size={14} />
                  <span>База данных PostgreSQL</span>
                </span>
              </div>

              {/* 1. DIFFICULTY BASED GAMES: Show 4 multipliers */}
              {isDifficultyGame && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Leaf size={16} className="text-primary" />
                    <h4 className="text-base font-bold text-foreground">
                      Множители по уровням сложности (Икра, Головастик, Квант, Ляга)
                    </h4>
                  </div>
                  <p className="text-sm text-foreground/70">
                    Умножают базовые очки игры при соответствующей выбранной сложности игроком
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Икра */}
                    <div className="p-4 rounded-xl border border-white/10 bg-transparent backdrop-blur-xl space-y-2">
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span className="text-foreground">Икра (dummy)</span>
                        <span className="text-sm px-2 py-0.5 rounded-full border border-white/10 text-foreground/80">x</span>
                      </div>
                      <input
                        type="number"
                        step="any"
                        value={formData.multiplier_ikra}
                        onChange={e => handleFieldChange('multiplier_ikra', parseFloat(e.target.value) || 0)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-base font-semibold focus:outline-none focus:border-primary transition-all"
                      />
                      <span className="text-sm text-foreground/50 block">Начальный уровень</span>
                    </div>

                    {/* Головастик */}
                    <div className="p-4 rounded-xl border border-white/10 bg-transparent backdrop-blur-xl space-y-2">
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span className="text-foreground">Головастик (people)</span>
                        <span className="text-sm px-2 py-0.5 rounded-full border border-primary/30 text-primary">x</span>
                      </div>
                      <input
                        type="number"
                        step="any"
                        value={formData.multiplier_golovastik}
                        onChange={e => handleFieldChange('multiplier_golovastik', parseFloat(e.target.value) || 0)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-base font-semibold focus:outline-none focus:border-primary transition-all"
                      />
                      <span className="text-sm text-foreground/50 block">Стандартный уровень</span>
                    </div>

                    {/* Квант */}
                    <div className="p-4 rounded-xl border border-white/10 bg-transparent backdrop-blur-xl space-y-2">
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span className="text-foreground">Квант (genius)</span>
                        <span className="text-sm px-2 py-0.5 rounded-full border border-white/10 text-foreground/80">x</span>
                      </div>
                      <input
                        type="number"
                        step="any"
                        value={formData.multiplier_kvant}
                        onChange={e => handleFieldChange('multiplier_kvant', parseFloat(e.target.value) || 0)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-base font-semibold focus:outline-none focus:border-primary transition-all"
                      />
                      <span className="text-sm text-foreground/50 block">Повышенный уровень</span>
                    </div>

                    {/* Ляга */}
                    <div className="p-4 rounded-xl border border-white/10 bg-transparent backdrop-blur-xl space-y-2">
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span className="text-foreground">Ляга (god)</span>
                        <span className="text-sm px-2 py-0.5 rounded-full border border-primary/30 text-primary">x</span>
                      </div>
                      <input
                        type="number"
                        step="any"
                        value={formData.multiplier_lyaga}
                        onChange={e => handleFieldChange('multiplier_lyaga', parseFloat(e.target.value) || 0)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-base font-semibold focus:outline-none focus:border-primary transition-all"
                      />
                      <span className="text-sm text-foreground/50 block">Экспертный уровень</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. КВИЛЛИОНЕР: Information Card & Visual Ladder */}
              {selectedGameId === 'millionaire' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-primary/25 bg-transparent backdrop-blur-xl space-y-2">
                    <div className="flex items-center gap-2 text-primary font-bold text-sm">
                      <Flame size={16} />
                      <span>Внутренняя лестничная сложность игры Квиллионер</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      Сложность в Квиллионере нарастает от вопроса 1 к вопросу 15.
                      Выбор сложности Икра, Головастик, Квант и Ляга здесь не используется.
                      Игрок получает сумму по лестнице, которая умножается на коэффициент конвертации в баланс, плюс бонус за победу.
                    </p>
                  </div>

                  {/* Visual Ladder Preview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                      <span className="flex items-center gap-1.5">
                        <Trophy size={16} className="text-primary" />
                        <span>Структура несгораемых сумм лестницы (15 вопросов)</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 font-mono text-sm">
                      {MILLIONAIRE_LADDER.map(step => (
                        <div 
                          key={step.q} 
                          className={`p-2 rounded-lg border text-center transition-all ${
                            step.fireproof 
                              ? 'border-primary/50 text-primary font-bold shadow-sm' 
                              : 'border-white/10 text-foreground/75'
                          }`}
                        >
                          <div className="text-sm opacity-60">#{step.q}</div>
                          <div className="font-bold">{step.prize.toLocaleString('ru-RU')}</div>
                          {step.fireproof && (
                            <div className="text-sm text-primary pt-0.5 font-sans">
                              {step.q === 15 ? 'суперприз' : 'несгораемая'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. СТО КВАДНОМУ: Structure Card */}
              {selectedGameId === '100to1' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-primary/25 bg-transparent backdrop-blur-xl space-y-2">
                    <div className="flex items-center gap-2 text-primary font-bold text-sm">
                      <BubbleCurrencyIcon className="w-4 h-4" />
                      <span>Опросная система туров игры Сто Квадному</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      В игре Сто Квадному сложность определяется распределением голосов респондентов и множителями туров. 
                      Выбор сложности Икра, Головастик, Квант и Ляга исключен, так как игра использует классический командный опросный регламент.
                    </p>
                  </div>

                  {/* Rounds description cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono text-sm">
                    {[
                      { r: 1, name: 'Простая игра', mult: 'x1' },
                      { r: 2, name: 'Двойная игра', mult: 'x2' },
                      { r: 3, name: 'Тройная игра', mult: 'x3' },
                      { r: 4, name: 'Игра наоборот', mult: 'x5' },
                      { r: 5, name: 'Большая игра', mult: 'финал' }
                    ].map(round => (
                      <div key={round.r} className="p-3 rounded-lg border border-white/10 text-center">
                        <div className="text-sm text-primary font-bold">{round.mult}</div>
                        <div className="font-semibold text-sm text-foreground truncate mt-1">{round.name}</div>
                        <div className="text-sm text-foreground/50">тур #{round.r}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. СВОЯ ИКРА: Structure Card */}
              {selectedGameId === 'jeopardy' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-primary/25 bg-transparent backdrop-blur-xl space-y-2">
                    <div className="flex items-center gap-2 text-primary font-bold text-sm">
                      <Award size={16} />
                      <span>Возрастающие номиналы игры Своя Икра</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      В игре Своя Икра сложность заложена в сетку номиналов тем каждого раунда.
                      Выбор сложности Икра, Головастик, Квант и Ляга исключен.
                      Игровые очки переводятся в баланс по коэффициенту игры.
                    </p>
                  </div>

                  {/* Rounds nominal cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-sm">
                    {[
                      { round: '1 раунд', nominals: '100 – 500' },
                      { round: '2 раунд', nominals: '200 – 1 000' },
                      { round: '3 раунд', nominals: '300 – 1 500' },
                      { round: 'Финал', nominals: 'ставка аукциона' }
                    ].map((r, i) => (
                      <div key={i} className="p-3 rounded-lg border border-white/10 text-center">
                        <div className="text-sm text-primary font-bold">{r.round}</div>
                        <div className="font-semibold text-sm text-foreground mt-1">{r.nominals}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* General Points & Coefficients Section */}
              <div className="space-y-3 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <BubbleCurrencyIcon className="w-5 h-5" />
                  <h4 className="text-base font-bold text-foreground">
                    {isDifficultyGame 
                      ? 'Очки за ответы и общий коэффициент' 
                      : 'Параметры конвертации и бонусные очки'
                    }
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Общий коэффициент игры */}
                  <div className="p-4 rounded-xl border border-white/10 bg-transparent backdrop-blur-xl space-y-2">
                    <label className="text-sm font-semibold text-foreground block">
                      Коэффициент игры (score_multiplier)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.score_multiplier}
                      onChange={e => handleFieldChange('score_multiplier', parseFloat(e.target.value) || 0)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-base font-semibold focus:outline-none focus:border-primary transition-all"
                    />
                    <span className="text-sm text-foreground/50 block">
                      {selectedGameId === 'millionaire' 
                        ? '0.1 (10% от суммы выигрыша)' 
                        : selectedGameId === '100to1'
                          ? '100 (коэф. очков опросов)'
                          : 'Множитель к набранным очкам'
                      }
                    </span>
                  </div>

                  {/* Очки за верный ответ / шаг */}
                  <div className="p-4 rounded-xl border border-white/10 bg-transparent backdrop-blur-xl space-y-2">
                    <label className="text-sm font-semibold text-foreground block">
                      {selectedGameId === 'millionaire' 
                        ? 'Бонус за верный шаг лестницы' 
                        : 'Очки за верный ответ (правильный)'
                      }
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.points_per_correct}
                      onChange={e => handleFieldChange('points_per_correct', parseFloat(e.target.value) || 0)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-base font-semibold focus:outline-none focus:border-primary transition-all"
                    />
                    <span className="text-sm text-foreground/50 block">
                      {selectedGameId === 'millionaire' ? 'Дополнительные очки за вопрос' : 'Базовые очки за вопрос'}
                    </span>
                  </div>

                  {/* Бонус за победу / 15 вопрос / 1 место */}
                  <div className="p-4 rounded-xl border border-white/10 bg-transparent backdrop-blur-xl space-y-2">
                    <label className="text-sm font-semibold text-foreground block">
                      {selectedGameId === 'millionaire' 
                        ? 'Бонус за взятие 15-го вопроса' 
                        : selectedGameId === 'jeopardy'
                          ? 'Бонус за 1-е место в игре'
                          : 'Бонус за победу в игре (win_bonus)'
                      }
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.win_bonus ?? 0}
                      onChange={e => handleFieldChange('win_bonus', parseFloat(e.target.value) || 0)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-base font-semibold focus:outline-none focus:border-primary transition-all"
                    />
                    <span className="text-sm text-foreground/50 block">
                      Начисляется при победе
                    </span>
                  </div>

                  {/* Штраф за неверный ответ (если применимо) */}
                  {(isDifficultyGame || selectedGameId === 'jeopardy') && (
                    <div className="p-4 rounded-xl border border-white/10 bg-transparent backdrop-blur-xl space-y-2 sm:col-span-3">
                      <label className="text-sm font-semibold text-foreground block">
                        Штраф за неверный ответ (points_per_incorrect)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={formData.points_per_incorrect}
                        onChange={e => handleFieldChange('points_per_incorrect', parseFloat(e.target.value) || 0)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-base font-semibold focus:outline-none focus:border-primary transition-all"
                      />
                      <span className="text-sm text-foreground/50 block">
                        Используется при штрафовании в ЧтоГдеКвада и Своей Икре
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Description field */}
              <div className="space-y-2 pt-2">
                <label className="text-sm font-semibold text-foreground block">
                  Описание формулы и логики начисления
                </label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={e => handleFieldChange('description', e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-transparent text-foreground text-sm focus:outline-none focus:border-primary transition-all"
                  placeholder="Описание формулы..."
                />
              </div>

              {/* Save Button Card */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10 flex-wrap gap-3">
                <div className="text-sm text-foreground/70 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-primary" />
                  <span>Изменения сразу фиксируются в таблицах PostgreSQL на сервере</span>
                </div>

                <button
                  type="button"
                  onClick={handleSaveToDatabase}
                  disabled={saving}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl border border-primary text-primary font-bold text-sm hover:bg-primary/10 active:scale-[0.98] transition-all flex items-center gap-2.5 shadow-md"
                >
                  <Leaf size={16} />
                  <span>{saving ? 'Сохранение в базу...' : 'Сохранить в базу данных'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Real-time Formula Simulator Panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="p-6 rounded-2xl border border-white/10 bg-transparent backdrop-blur-xl shadow-lg space-y-5">
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <div className="p-2.5 rounded-xl border border-primary/30 text-primary">
                  <Calculator size={18} />
                </div>
                <div>
                  <h4 className="text-base font-bold text-foreground">
                    Проверка начисления
                  </h4>
                  <p className="text-sm text-foreground/70">
                    Тест серверной формулы из базы данных
                  </p>
                </div>
              </div>

              {/* 1. DIFFICULTY BASED GAMES TEST INPUTS */}
              {isDifficultyGame && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground block">
                      Сложность раунда
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'dummy', name: 'Икра' },
                        { id: 'people', name: 'Головастик' },
                        { id: 'genius', name: 'Квант' },
                        { id: 'god', name: 'Ляга' }
                      ].map(d => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setSimDifficulty(d.id)}
                          className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all flex items-center justify-between ${
                            simDifficulty === d.id
                              ? 'border-primary text-primary shadow-sm ring-1 ring-primary/40'
                              : 'border-white/10 text-foreground/70 hover:border-white/25'
                          }`}
                        >
                          <span>{d.name}</span>
                          <Leaf size={14} className={simDifficulty === d.id ? 'text-primary' : 'text-foreground/30'} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground block">
                        Правильных ответов
                      </label>
                      <input
                        type="number"
                        value={simCorrect}
                        onChange={e => setSimCorrect(parseInt(e.target.value) || 0)}
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-sm"
                      />
                    </div>

                    {selectedGameId === 'whatwherewhen' && (
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-foreground block">
                          Всего раундов (знатоки + зрители)
                        </label>
                        <input
                          type="number"
                          value={simTotal}
                          onChange={e => setSimTotal(parseInt(e.target.value) || 0)}
                          className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2. КВИЛЛИОНЕР TEST INPUTS */}
              {selectedGameId === 'millionaire' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg border border-white/10 text-sm text-foreground/80 space-y-1">
                    <div className="font-semibold text-primary flex items-center gap-1.5">
                      <CircleDot size={14} />
                      <span>Без уровней сложности</span>
                    </div>
                    <p className="text-sm opacity-80">
                      Сложность задается пройденным вопросом лестницы от 1 до 15.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground block">
                      Вопрос лестницы (1–15)
                    </label>
                    <select
                      value={simMillionaireQ}
                      onChange={e => setSimMillionaireQ(parseInt(e.target.value) || 1)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-white/10 bg-transparent text-foreground font-semibold text-sm"
                    >
                      {MILLIONAIRE_LADDER.map(s => (
                        <option key={s.q} value={s.q} className="bg-neutral-900 text-foreground">
                          Вопрос #{s.q} — {s.prize.toLocaleString('ru-RU')} {s.fireproof ? (s.q === 15 ? '(суперприз)' : '(несгораемая)') : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground block">
                      Действие игрока
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => setSimMillionaireAction('walk')}
                        className={`min-h-[40px] px-3 py-2 rounded-lg border text-sm font-semibold text-left transition-all flex items-center justify-between ${
                          simMillionaireAction === 'walk'
                            ? 'border-primary text-primary ring-1 ring-primary/40'
                            : 'border-white/10 text-foreground/70'
                        }`}
                      >
                        <span>Забрал деньги на вопросе #{simMillionaireQ}</span>
                        <Leaf size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setSimMillionaireAction('wrong')}
                        className={`min-h-[40px] px-3 py-2 rounded-lg border text-sm font-semibold text-left transition-all flex items-center justify-between ${
                          simMillionaireAction === 'wrong'
                            ? 'border-primary text-primary ring-1 ring-primary/40'
                            : 'border-white/10 text-foreground/70'
                        }`}
                      >
                        <span>Ошибся на #{simMillionaireQ} (откат к несгораемой)</span>
                        <Leaf size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSimMillionaireQ(15);
                          setSimMillionaireAction('jackpot');
                        }}
                        className={`min-h-[40px] px-3 py-2 rounded-lg border text-sm font-semibold text-left transition-all flex items-center justify-between ${
                          simMillionaireAction === 'jackpot'
                            ? 'border-primary text-primary ring-1 ring-primary/40'
                            : 'border-white/10 text-foreground/70'
                        }`}
                      >
                        <span>Взял суперприз (15 вопросов)</span>
                        <Sparkles size={14} />
                      </button>
                    </div>
                  </div>

                  {simLadderPrize !== null && (
                    <div className="p-3 rounded-lg border border-white/10 text-sm flex items-center justify-between">
                      <span className="text-foreground/70">Выигрыш по лестнице:</span>
                      <span className="font-mono font-bold text-foreground">{simLadderPrize.toLocaleString('ru-RU')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 3. СТО КВАДНОМУ TEST INPUTS */}
              {selectedGameId === '100to1' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg border border-white/10 text-sm text-foreground/80 space-y-1">
                    <div className="font-semibold text-primary flex items-center gap-1.5">
                      <CircleDot size={14} />
                      <span>Без уровней сложности</span>
                    </div>
                    <p className="text-sm opacity-80">
                      Сложность определена суммами совпадений опроса во всех 5 раундах.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground block">
                      Набранные очки опросов в раундах
                    </label>
                    <input
                      type="number"
                      value={sim100to1Points}
                      onChange={e => setSim100to1Points(parseFloat(e.target.value) || 0)}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setSim100to1Win(!sim100to1Win)}
                      className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border text-sm font-semibold transition-all flex items-center justify-between ${
                        sim100to1Win 
                          ? 'border-primary text-primary' 
                          : 'border-white/10 text-foreground/70'
                      }`}
                    >
                      <span>{sim100to1Win ? 'Победа команды (бонус включен)' : 'Поражение команды (без бонуса)'}</span>
                      <Leaf size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* 4. СВОЯ ИКРА TEST INPUTS */}
              {selectedGameId === 'jeopardy' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg border border-white/10 text-sm text-foreground/80 space-y-1">
                    <div className="font-semibold text-primary flex items-center gap-1.5">
                      <CircleDot size={14} />
                      <span>Без уровней сложности</span>
                    </div>
                    <p className="text-sm opacity-80">
                      Сложность определяется номиналами тем в раундах и ставками финала.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground block">
                      Итоговый счёт раундов игрока
                    </label>
                    <input
                      type="number"
                      value={simJeopardyScore}
                      onChange={e => setSimJeopardyScore(parseFloat(e.target.value) || 0)}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-white/10 bg-transparent text-foreground font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setSimJeopardyWin(!simJeopardyWin)}
                      className={`w-full min-h-[44px] px-3.5 py-2 rounded-lg border text-sm font-semibold transition-all flex items-center justify-between ${
                        simJeopardyWin 
                          ? 'border-primary text-primary' 
                          : 'border-white/10 text-foreground/70'
                      }`}
                    >
                      <span>{simJeopardyWin ? '1-е место в игре (бонус победы)' : '2–3 место (без бонуса)'}</span>
                      <BubbleCurrencyIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Result display */}
              <div className="p-4 rounded-xl border border-primary/30 bg-transparent backdrop-blur-xl space-y-2">
                <div className="flex items-center justify-between text-sm font-semibold text-foreground/80">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={15} className="text-primary" />
                    <span>Итоговые очки в баланс</span>
                  </span>
                  <span className="text-sm px-2 py-0.5 rounded-full border border-primary/30 text-primary">
                    PostgreSQL
                  </span>
                </div>
                <div className="text-2xl font-mono font-bold text-primary flex items-center gap-2">
                  <BubbleCurrencyIcon className="w-6 h-6" />
                  <span>{simResult !== null ? simResult.toLocaleString('ru-RU') : '...'}</span>
                </div>
                <span className="text-sm text-foreground/60 block pt-1">
                  Рассчитано строго серверной функцией из базы PostgreSQL
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
