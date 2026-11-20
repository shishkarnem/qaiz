import { Router } from 'express';
import { getAll, getOne, runSql } from '../db';
import { processGameAnswerCheck } from '../gameAnswerChecker';

export const gamesRouter = Router();

// POST check answer using 3-tier cascade (local -> function 763 -> llm fallback)
gamesRouter.post('/check-answer', async (req, res) => {
  try {
    const {
      gameId = 'blitz',
      question = '',
      correctAnswer = '',
      userAnswer = '',
      explanation = '',
      userId,
      answers100to1
    } = req.body;

    const result = await processGameAnswerCheck({
      gameId,
      question,
      correctAnswer,
      userAnswer,
      explanation,
      userId,
      answers100to1
    });

    res.json(result);
  } catch (err: any) {
    console.error('[check-answer Error]:', err);
    res.status(500).json({
      isCorrect: false,
      explanation: 'Ошибка при проверке ответа',
      error: err.message
    });
  }
});

// GET all games
gamesRouter.get('/', async (_req, res) => {
  try {
    const games = await getAll('SELECT * FROM games ORDER BY created_at ASC');
    res.json({ data: games });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET game by id
gamesRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const game = await getOne('SELECT * FROM games WHERE id = $1', [id]);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json({ data: game });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update game
gamesRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      subtitle,
      description,
      image_url,
      category,
      question_count,
      path,
      tag,
      price_per_question,
      price_text,
      rules,
      coming_soon
    } = req.body;

    const existing = await getOne('SELECT * FROM games WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Game not found' });
    }

    await runSql(
      `UPDATE games SET 
        title = COALESCE($1, title),
        subtitle = COALESCE($2, subtitle),
        description = COALESCE($3, description),
        image_url = COALESCE($4, image_url),
        category = COALESCE($5, category),
        question_count = COALESCE($6, question_count),
        path = COALESCE($7, path),
        tag = COALESCE($8, tag),
        price_per_question = COALESCE($9, price_per_question),
        price_text = COALESCE($10, price_text),
        rules = COALESCE($11, rules),
        coming_soon = COALESCE($12, coming_soon),
        updated_at = NOW()
      WHERE id = $13`,
      [
        title,
        subtitle,
        description,
        image_url,
        category,
        question_count,
        path,
        tag,
        price_per_question,
        price_text,
        rules,
        coming_soon,
        id
      ]
    );

    const updated = await getOne('SELECT * FROM games WHERE id = $1', [id]);
    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
