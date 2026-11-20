import { Router } from 'express';
import { getAll, getOne, runSql } from '../db';
import {
  GameScoringRule,
  getGameScoringRules,
  getGameScoringRule,
  updateGameScoringRule,
  calculateAuthoritativeScore,
  calculateAuthoritativeScoreWithBreakdown,
  normalizeGameId,
  normalizeDifficulty,
  syncScoringFromSettingsToRules
} from '../db';

export const gameScoringRouter = Router();

// GET all scoring rules (both format compatible)
gameScoringRouter.get('/', async (_req, res) => {
  try {
    const rules = await getGameScoringRules();
    res.json({ success: true, data: rules, rules });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /rules -> for frontend client cache
gameScoringRouter.get('/rules', async (req, res) => {
  try {
    const gameId = req.query.game_id ? String(req.query.game_id) : undefined;
    const rules = await getGameScoringRules(gameId);
    res.json({ success: true, rules });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /rule?game_id=...&difficulty=...
gameScoringRouter.get('/rule', async (req, res) => {
  try {
    const gameId = String(req.query.game_id || 'blitz');
    const difficulty = req.query.difficulty ? String(req.query.difficulty) : undefined;
    const rule = await getGameScoringRule(gameId, difficulty);
    res.json({ success: true, rule });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /matrix -> returns game_scoring_settings table
gameScoringRouter.get('/matrix', async (_req, res) => {
  try {
    const rows = await getAll('SELECT * FROM game_scoring_settings ORDER BY id ASC');
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET rule for specific game (single game rules or matrix row)
gameScoringRouter.get('/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const norm = normalizeGameId(gameId);
    const rules = await getGameScoringRules(norm);
    if (rules && rules.length > 0) {
      return res.json({ success: true, data: rules[0], rules });
    }
    const matrixRow = await getOne('SELECT * FROM game_scoring_settings WHERE id = $1 OR game_id = $2', [norm, norm]);
    res.json({ success: true, data: matrixRow });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /rule/:id -> update specific rule in game_scoring_rules
gameScoringRouter.put('/rule/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await updateGameScoringRule(id, req.body || {});
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Правило не найдено' });
    }
    res.json({ success: true, data: updated, rule: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /:gameId -> update in game_scoring_settings or bulk
gameScoringRouter.put('/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const key = normalizeGameId(gameId);
    const body = req.body || {};

    const allowedFields = [
      'game_title',
      'score_multiplier',
      'points_per_correct',
      'points_per_incorrect',
      'multiplier_ikra',
      'multiplier_golovastik',
      'multiplier_kvant',
      'multiplier_lyaga',
      'win_bonus',
      'has_difficulty',
      'description'
    ];

    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = $${pIdx++}`);
        let val = body[field];
        if (field.includes('multiplier') || field.includes('points') || field === 'win_bonus' || field === 'has_difficulty') {
          val = Number(val);
        }
        params.push(val);
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = NOW()');
      params.push(key, key);
      await runSql(
        `UPDATE game_scoring_settings SET ${setClauses.join(', ')} WHERE id = $${pIdx++} OR game_id = $${pIdx++}`,
        params
      );

      // Trigger bidirectional sync
      await syncScoringFromSettingsToRules(key);
    }

    const updated = await getOne('SELECT * FROM game_scoring_settings WHERE id = $1 OR game_id = $2', [key, key]);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /simulate -> calculates authoritative score using current database rules
gameScoringRouter.post('/simulate', async (req, res) => {
  try {
    const { 
      gameId, 
      difficulty, 
      score, 
      correctAnswers, 
      totalQuestions, 
      isWin, 
      rawScore, 
      mode,
      millionaireQuestion,
      millionaireOutcome,
      surveyPoints,
      jeopardyScore
    } = req.body || {};
    
    const norm = normalizeGameId(gameId || 'blitz');

    let effectiveRawScore = rawScore !== undefined ? Number(rawScore) : undefined;
    let effectiveCorrect = Number(correctAnswers || 0);
    let effectiveIsWin = Boolean(isWin);

    // Dynamic resolution for Квиллионер (ladder-based)
    if (norm === 'millionaire' && millionaireQuestion !== undefined) {
      const q = Math.min(15, Math.max(1, Number(millionaireQuestion)));
      const LADDER = [0, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
      
      if (millionaireOutcome === 'jackpot' || q >= 15) {
        effectiveRawScore = 1000000;
        effectiveCorrect = 15;
        effectiveIsWin = true;
      } else if (millionaireOutcome === 'wrong') {
        if (q >= 10) effectiveRawScore = 32000;
        else if (q >= 5) effectiveRawScore = 1000;
        else effectiveRawScore = 0;
        effectiveCorrect = Math.max(0, q - 1);
        effectiveIsWin = false;
      } else {
        // 'walk' / take money
        effectiveRawScore = LADDER[q] || 0;
        effectiveCorrect = q;
        effectiveIsWin = false;
      }
    }

    // Dynamic resolution for Сто Квадному (survey points)
    if (norm === '100to1' && surveyPoints !== undefined) {
      effectiveRawScore = Number(surveyPoints);
    }

    // Dynamic resolution for Своя Икра (game score)
    if (norm === 'jeopardy' && jeopardyScore !== undefined) {
      effectiveRawScore = Number(jeopardyScore);
    }

    const calcResult = await calculateAuthoritativeScoreWithBreakdown({
      gameId: norm,
      difficulty,
      score: Number(score || 0),
      correctAnswers: effectiveCorrect,
      totalQuestions: Number(totalQuestions || 0),
      isWin: effectiveIsWin,
      rawScore: effectiveRawScore,
      mode
    });
    const rule = await getGameScoringRule(norm, difficulty);
    const setting = await getOne('SELECT * FROM game_scoring_settings WHERE id = $1 OR game_id = $2', [norm, norm]);
    res.json({ 
      success: true, 
      calculatedScore: calcResult.authoritativeScore, 
      calculation: calcResult,
      formula: calcResult.formula,
      breakdown: calcResult.breakdown,
      rule, 
      setting, 
      simulatedLadderPrize: effectiveRawScore 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /calculate -> direct endpoint for authoritative game score and calculation breakdown
gameScoringRouter.post('/calculate', async (req, res) => {
  try {
    const calcResult = await calculateAuthoritativeScoreWithBreakdown(req.body || {});
    res.json({
      success: true,
      calculatedScore: calcResult.authoritativeScore,
      calculation: calcResult
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

