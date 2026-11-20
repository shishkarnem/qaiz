// Client-side helper to fetch and use scoring rules from the PostgreSQL database
export interface ScoreBreakdownItem {
  label: string;
  value: string;
  sublabel?: string;
  highlight?: boolean;
  isPositive?: boolean;
  isNegative?: boolean;
}

export interface ScoreCalculationResult {
  authoritativeScore: number;
  gameId: string;
  gameTitle: string;
  difficultyId: string;
  difficultyName: string;
  hasDifficulty: boolean;
  scoreMultiplier: number;
  multiplier: number;
  pointsPerCorrect: number;
  pointsPerIncorrect: number;
  winBonus: number;
  minScore: number;
  correctAnswers: number;
  totalQuestions: number;
  rawScore?: number;
  isWin: boolean;
  formula: string;
  breakdown: ScoreBreakdownItem[];
}

export interface GameScoringRule {
  id: string;
  game_id: string;
  game_title: string;
  difficulty_id: string;
  difficulty_name: string;
  multiplier: number;
  points_per_correct: number;
  points_per_incorrect: number;
  win_bonus: number;
  min_score: number;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

let cachedRules: GameScoringRule[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

export async function fetchAllGameScoringRules(forceRefresh = false): Promise<GameScoringRule[]> {
  const now = Date.now();
  if (!forceRefresh && cachedRules && now - cacheTime < CACHE_TTL) {
    return cachedRules;
  }

  try {
    const res = await fetch('/api/game-scoring/rules');
    if (!res.ok) throw new Error('Failed to fetch scoring rules');
    const data = await res.json();
    if (data.success && Array.isArray(data.rules)) {
      cachedRules = data.rules;
      cacheTime = now;
      return cachedRules;
    }
  } catch (err) {
    console.warn('[GameScoring] Fetch failed, using fallback:', err);
  }

  return cachedRules || [];
}

export async function fetchGameScoringRule(gameId: string, difficulty?: string): Promise<GameScoringRule | null> {
  const normGame = normalizeGameIdClient(gameId);
  const normDiff = normalizeDifficultyClient(difficulty);

  const rules = await fetchAllGameScoringRules();
  const matched = rules.find(r => r.game_id === normGame && r.difficulty_id === normDiff);
  if (matched) return matched;

  // Fallback to server direct endpoint
  try {
    const res = await fetch(`/api/game-scoring/rule?game_id=${encodeURIComponent(normGame)}&difficulty=${encodeURIComponent(normDiff)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.rule) return data.rule;
    }
  } catch (_) {}

  // Local fallback
  return getFallbackScoringRule(normGame, normDiff);
}

export function normalizeGameIdClient(gameId: string): string {
  const g = (gameId || '').toLowerCase().trim();
  if (g === 'blitz' || g === 'quiz' || g === 'квииз' || g === 'квиз') return 'blitz';
  if (g === 'whatwherewhen' || g === 'chgk' || g === 'чтогдекдвада' || g === 'чтогдекогда') return 'whatwherewhen';
  if (g === 'millionaire' || g === 'free_millionaire' || g === 'квиллионер' || g === 'миллионер') return 'millionaire';
  if (g === '100to1' || g === '100_to_1' || g === 'стоквадному' || g === 'стокодному') return '100to1';
  if (g === 'jeopardy' || g === 'svoikra' || g === 'свояикра' || g === 'свояигра') return 'jeopardy';
  return g;
}

export function normalizeDifficultyClient(difficulty?: string): string {
  const d = (difficulty || 'people').toLowerCase().trim();
  if (d === 'dummy' || d === 'икра' || d === 'иикра' || d === 'easy' || d === 'легкий' || d === 'простой' || d === '1' || d === '1/4') return 'dummy';
  if (d === 'people' || d === 'головастик' || d === 'normal' || d === 'medium' || d === 'средний' || d === '2' || d === '2/4') return 'people';
  if (d === 'genius' || d === 'квант' || d === 'hard' || d === 'сложный' || d === '3' || d === '3/4') return 'genius';
  if (d === 'god' || d === 'ляга' || d === 'expert' || d === 'эксперт' || d === '4' || d === '4/4') return 'god';
  return d;
}

export function getFallbackScoringRule(gameId: string, difficulty: string): GameScoringRule {
  const normGame = normalizeGameIdClient(gameId);
  const normDiff = normalizeDifficultyClient(difficulty);

  const multMap: Record<string, number> = {
    dummy: 1,
    people: 10,
    genius: 100,
    god: 1000
  };

  const diffNames: Record<string, string> = {
    dummy: 'Икра',
    people: 'Головастик',
    genius: 'Квант',
    god: 'Ляга'
  };

  if (normGame === 'blitz') {
    return {
      id: `blitz_${normDiff}`,
      game_id: 'blitz',
      game_title: 'КвИИз',
      difficulty_id: normDiff,
      difficulty_name: diffNames[normDiff] || 'Головастик',
      multiplier: multMap[normDiff] ?? 10,
      points_per_correct: 100,
      points_per_incorrect: 0,
      win_bonus: 0,
      min_score: 0,
      description: '100 очков за верный ответ'
    };
  }

  if (normGame === 'whatwherewhen') {
    return {
      id: `whatwherewhen_${normDiff}`,
      game_id: 'whatwherewhen',
      game_title: 'ЧтоГдеКвада',
      difficulty_id: normDiff,
      difficulty_name: diffNames[normDiff] || 'Головастик',
      multiplier: multMap[normDiff] ?? 10,
      points_per_correct: 200,
      points_per_incorrect: 200,
      win_bonus: 0,
      min_score: 0,
      description: '+200 за верный, -200 за неверный'
    };
  }

  if (normGame === 'millionaire') {
    const millMult: Record<string, number> = {
      dummy: 0.05,
      people: 0.1,
      genius: 0.15,
      god: 0.2
    };
    return {
      id: `millionaire_${normDiff}`,
      game_id: 'millionaire',
      game_title: 'Квиллионер',
      difficulty_id: normDiff,
      difficulty_name: diffNames[normDiff] || 'Головастик',
      multiplier: millMult[normDiff] ?? 0.1,
      points_per_correct: 0,
      points_per_incorrect: 0,
      win_bonus: 0,
      min_score: 0,
      description: 'Коэффициент от выигранной суммы'
    };
  }

  if (normGame === '100to1') {
    const oneHundredMult: Record<string, number> = {
      dummy: 50,
      people: 100,
      genius: 150,
      god: 200
    };
    return {
      id: `100to1_${normDiff}`,
      game_id: '100to1',
      game_title: 'Сто Квадному',
      difficulty_id: normDiff,
      difficulty_name: diffNames[normDiff] || 'Головастик',
      multiplier: oneHundredMult[normDiff] ?? 100,
      points_per_correct: 100,
      points_per_incorrect: 0,
      win_bonus: 0,
      min_score: 0,
      description: 'Множитель к сумме очков раундов'
    };
  }

  return {
    id: `jeopardy_${normDiff}`,
    game_id: 'jeopardy',
    game_title: 'Своя Икра',
    difficulty_id: normDiff,
    difficulty_name: diffNames[normDiff] || 'Головастик',
    multiplier: normDiff === 'god' ? 2.0 : normDiff === 'genius' ? 1.5 : 1.0,
    points_per_correct: 0,
    points_per_incorrect: 0,
    win_bonus: 0,
    min_score: 0,
    description: 'Множитель к очкам раундов'
  };
}

export async function calculateAuthoritativeScoreClient(params: {
  gameId: string;
  difficulty?: string;
  score?: number;
  correctAnswers?: number;
  totalQuestions?: number;
  isWin?: boolean;
  rawScore?: number;
  mode?: string;
}): Promise<ScoreCalculationResult | null> {
  try {
    const res = await fetch('/api/game-scoring/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.success && json.calculation) {
      return json.calculation;
    }
    return null;
  } catch (err) {
    console.warn('[GameScoring] Calculation client error:', err);
    return null;
  }
}

