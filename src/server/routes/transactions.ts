import { Router } from 'express';
import { getAll, getOne, runSql, generateId, recalculateUserBalancesFromTransactions, getIikrWord } from '../db';
import { sendTelegramTransactionNotification } from '../telegramNotifier';

export const transactionsRouter = Router();

transactionsRouter.get('/', async (req, res) => {
  try {
    const { user_id } = req.query;
    let sql = 'SELECT * FROM transactions';
    const params: any[] = [];
    if (user_id) {
      sql += ' WHERE user_id = $1';
      params.push(user_id);
    }
    sql += ' ORDER BY timestamp DESC, created_at DESC';
    const txs = await getAll(sql, params);
    res.json({ data: txs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

transactionsRouter.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await recalculateUserBalancesFromTransactions(userId);
    const txs = await getAll(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY timestamp DESC, created_at DESC',
      [userId]
    );
    res.json({ data: txs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

transactionsRouter.post('/', async (req, res) => {
  try {
    const { user_id, amount, currency, type, description, reference_id, question_id } = req.body;
    if (!user_id || amount === undefined) {
      return res.status(400).json({ error: 'user_id и amount обязательны' });
    }

    const numAmount = Number(amount);
    const id = generateId('tx');
    const curr = currency || getIikrWord(numAmount);
    const txType = type || (numAmount >= 0 ? 'deposit' : 'spend');
    const ts = Date.now();

    await runSql(
      `INSERT INTO transactions (id, user_id, amount, currency, type, description, reference_id, question_id, timestamp, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [id, user_id, numAmount, curr, txType, description || null, reference_id || null, question_id || null, ts]
    );

    await recalculateUserBalancesFromTransactions(user_id);

    // Asynchronously send telegram notification if user has telegram_id (and to admin if payment)
    sendTelegramTransactionNotification(
      user_id,
      {
        id,
        amount: numAmount,
        currency: curr,
        type: txType,
        description: description || null,
        reference_id: reference_id || null,
        timestamp: ts
      },
      { req }
    ).catch(err => console.error('Telegram notification error:', err));

    const created = await getOne('SELECT * FROM transactions WHERE id = $1', [id]);
    res.json({ data: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
