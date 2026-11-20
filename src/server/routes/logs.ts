import { Router } from 'express';
import { getAll, runSql } from '../db';

export const logsRouter = Router();

logsRouter.get('/', async (_req, res) => {
  try {
    const logs = await getAll('SELECT * FROM logs ORDER BY created_at DESC LIMIT 200');
    res.json({ data: logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

logsRouter.post('/', async (req, res) => {
  try {
    const {
      channel_id, user_social_id, user_message, bot_reply,
      channel_name, bot_id, llm, tokens_total, tokens_in_source,
      tokens_out_source, tokens_user, rub, function_error,
      function_call_params, server_name, chat_id, social_id, user_id
    } = req.body;

    const finalChannelId = channel_id || channel_name || 'qaiz';
    const finalUserSocialId = user_social_id || social_id || user_id || null;
    const finalParams = function_call_params || (chat_id ? JSON.stringify({ chat_id }) : null);
    const calculatedRub = rub !== undefined ? rub : ((Number(tokens_total || 0) / 10000000.0) * 300.0);

    await runSql(
      `INSERT INTO logs (
        channel_id, user_social_id, user_message, bot_reply,
        channel_name, bot_id, llm, tokens_total, tokens_in_source,
        tokens_out_source, tokens_user, rub, function_error,
        function_call_params, server_name, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
      [
        finalChannelId,
        finalUserSocialId,
        user_message || null,
        bot_reply || null,
        channel_name || 'qaiz',
        bot_id ? String(bot_id) : '60381',
        llm || 'protalk',
        Number(tokens_total || 0),
        Number(tokens_in_source || 0),
        Number(tokens_out_source || 0),
        Number(tokens_user || 0),
        calculatedRub,
        function_error || null,
        finalParams,
        server_name || 'miniapp'
      ]
    );

    res.json({ message: 'Лог сохранен' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
