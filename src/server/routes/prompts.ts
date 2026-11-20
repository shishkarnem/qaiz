import { Router } from 'express';
import { getAll, getOne, runSql } from '../db';
import { requireSuperAdmin } from '../authMiddleware';

export const promptsRouter = Router();

// GET all note style templates from database
promptsRouter.get('/note-styles', async (_req, res) => {
  try {
    const rows = await getAll(
      `SELECT id, label, icon, description, prompt_text, sort_order, is_active, updated_at
       FROM note_style_templates
       WHERE is_active = 1 OR is_active IS NULL
       ORDER BY sort_order ASC, id ASC`
    );
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message, data: [] });
  }
});

promptsRouter.get('/note-style-templates', async (_req, res) => {
  try {
    const rows = await getAll(
      `SELECT id, label, icon, description, prompt_text, sort_order, is_active, updated_at
       FROM note_style_templates
       ORDER BY sort_order ASC, id ASC`
    );
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message, data: [] });
  }
});

// GET all prompts from PostgreSQL
promptsRouter.get('/', async (_req, res) => {
  try {
    const promptsList = await getAll('SELECT * FROM prompts ORDER BY game_id ASC');
    const promptsMap: Record<string, string> = {};
    for (const p of promptsList) {
      if (p.game_id) {
        promptsMap[p.game_id] = p.content;
      }
    }

    res.json({ data: promptsMap, list: promptsList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk update prompts
promptsRouter.put('/', requireSuperAdmin, async (req, res) => {
  try {
    const { prompts } = req.body;
    if (!prompts || typeof prompts !== 'object') {
      return res.status(400).json({ error: 'Неверный формат данных промптов' });
    }

    for (const [game_id, content] of Object.entries(prompts)) {
      if (typeof content === 'string' && content.trim()) {
        const desc = `Промпт для ${game_id}`;
        await runSql(
          `INSERT INTO prompts (game_id, content, description, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (game_id) DO UPDATE SET
             content = EXCLUDED.content,
             updated_at = NOW()`,
          [game_id, content, desc]
        );
        if (game_id === 'chat_moderation') {
          await runSql(
            `UPDATE moderation_config SET instruction = $1, updated_at = NOW() WHERE id = 1`,
            [content]
          ).catch(() => {});
        }
      }
    }

    const updatedList = await getAll('SELECT * FROM prompts ORDER BY game_id ASC');
    res.json({ message: 'Все промпты успешно сохранены в базе данных', list: updatedList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Synchronize prompts & moderation_config from PostgreSQL
promptsRouter.post('/reset', requireSuperAdmin, async (req, res) => {
  try {
    const { game_id } = req.body || {};

    if (!game_id || game_id === 'chat_moderation') {
      const modPrompt = await getOne<{ content: string }>(
        `SELECT content FROM prompts WHERE game_id = 'chat_moderation' LIMIT 1`
      ).catch(() => null);
      if (modPrompt?.content) {
        await runSql(
          `UPDATE moderation_config SET instruction = $1, updated_at = NOW() WHERE id = 1`,
          [modPrompt.content]
        ).catch(() => {});
      }
    }

    const updatedList = await getAll('SELECT * FROM prompts ORDER BY game_id ASC');
    const promptsMap: Record<string, string> = {};
    for (const p of updatedList) {
      if (p.game_id) {
        promptsMap[p.game_id] = p.content;
      }
    }

    res.json({ message: 'Промпты синхронизированы из базы данных', data: promptsMap, list: updatedList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update or insert single prompt
promptsRouter.put('/:game_id', requireSuperAdmin, async (req, res) => {
  try {
    const { game_id } = req.params;
    const { content, description } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Промпт не может быть пустым' });
    }

    const existing = await getOne<any>('SELECT game_id, description FROM prompts WHERE game_id = $1', [game_id]);
    const descToUse = description || existing?.description || `Промпт для ${game_id}`;

    await runSql(
      `INSERT INTO prompts (game_id, content, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (game_id) DO UPDATE SET
         content = EXCLUDED.content,
         description = COALESCE(NULLIF($3::text, ''), prompts.description),
         updated_at = NOW()`,
      [game_id, content, descToUse]
    );

    if (game_id === 'chat_moderation') {
      await runSql(
        `UPDATE moderation_config SET instruction = $1, updated_at = NOW() WHERE id = 1`,
        [content]
      ).catch(() => {});
    }

    const updatedPrompt = await getOne('SELECT * FROM prompts WHERE game_id = $1', [game_id]);
    res.json({ message: `Промпт для ${game_id} сохранен`, prompt: updatedPrompt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
