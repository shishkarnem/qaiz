import { Router } from 'express';
import { getAll, getOne, runSql, generateId, recalculateUserBalancesFromTransactions, getIikrWord } from '../db';
import { isSuperAdminRecord } from '../authMiddleware';
import { sendCustomTelegramNotification, escapeHtml } from '../telegramNotifier';
import { resolveDirectFileUrl, getDirectFileUrlMap, replaceFilePathWithMap } from './files';
import { sendWebPushToUser } from '../push';

export const usersRouter = Router();

usersRouter.get('/', async (_req, res) => {
  try {
    const users = await getAll('SELECT * FROM users ORDER BY created_at DESC');
    const needsFileMap = users.some(
      (u) =>
        String(u.avatar_url || '').includes('/file/') ||
        String(u.photo_url || '').includes('/file/') ||
        String(u.telegram_photo || '').includes('/file/')
    );
    const fileUrlMap = needsFileMap ? await getDirectFileUrlMap() : null;
    users.forEach((p) => {
      delete p.password;
      if (fileUrlMap) {
        if (p.avatar_url) p.avatar_url = replaceFilePathWithMap(p.avatar_url, fileUrlMap);
        if (p.photo_url) p.photo_url = replaceFilePathWithMap(p.photo_url, fileUrlMap);
        if (p.telegram_photo) p.telegram_photo = replaceFilePathWithMap(p.telegram_photo, fileUrlMap);
      }
    });
    res.json({ data: users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Leaderboard with stats endpoint
usersRouter.get('/leaderboard', async (req, res) => {
  try {
    const sortBy = (req.query.sort as string) || 'balance';
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
    const gameId = (req.query.game_id as string) || (req.query.game as string) || '';
    const difficulty = (req.query.difficulty as string) || '';
    const topic = (req.query.topic as string) || '';

    let joinCondition = '(gs.user_id = u.uid OR gs.user_id = u.id)';
    joinCondition += " AND (gs.game_id IS NULL OR (gs.game_id != 'free_millionaire' AND gs.game_id NOT LIKE 'free_%')) AND (gs.mode IS NULL OR gs.mode != 'free') AND (gs.game_title IS NULL OR (gs.game_title NOT ILIKE '%Freeлионер%' AND gs.game_title NOT ILIKE '%Free%'))";
    const params: any[] = [];
    let pIdx = 1;

    if (gameId && gameId !== 'all') {
      joinCondition += ` AND (gs.game_id = $${pIdx} OR gs.game_id ILIKE $${pIdx + 1})`;
      params.push(gameId, `%${gameId}%`);
      pIdx += 2;
    }

    if (difficulty && difficulty !== 'all') {
      joinCondition += ` AND (LOWER(gs.difficulty) = $${pIdx} OR LOWER(gs.difficulty) LIKE $${pIdx + 1})`;
      params.push(difficulty.toLowerCase(), `%${difficulty.toLowerCase()}%`);
      pIdx += 2;
    }

    if (topic && topic !== 'all' && topic.trim()) {
      joinCondition += ` AND LOWER(gs.topic) LIKE $${pIdx}`;
      params.push(`%${topic.toLowerCase().trim()}%`);
      pIdx += 1;
    }

    const users = await getAll(`
      SELECT 
        u.id,
        u.uid,
        u.telegram_id,
        u.first_name,
        u.last_name,
        u.display_name,
        u.username,
        u.photo_url,
        u.avatar_url,
        u.telegram_photo,
        u.email,
        u.role,
        u.balance,
        u.balance_pay,
        u.balance_free,
        u.balance_ref,
        u.balance_gift,
        u.balance_out,
        u.last_seen,
        u.last_login,
        COALESCE(u.total_points, u.points, 0) AS total_points,
        CASE 
          WHEN u.last_seen IS NOT NULL AND TRIM(u.last_seen::text) != '' AND EXTRACT(EPOCH FROM (NOW() - u.last_seen::timestamptz)) <= 180 THEN 1
          WHEN (u.last_seen IS NULL OR TRIM(u.last_seen::text) = '') AND u.last_login IS NOT NULL AND TRIM(u.last_login::text) != '' AND EXTRACT(EPOCH FROM (NOW() - u.last_login::timestamptz)) <= 180 THEN 1
          ELSE 0 
        END AS is_online,
        u.created_at,
        COUNT(gs.id)::int AS games_played,
        COALESCE(SUM(CASE WHEN gs.is_win = 1 THEN 1 ELSE 0 END), 0)::int AS games_won
      FROM users u
      LEFT JOIN game_sessions gs ON ${joinCondition}
      GROUP BY
        u.id, u.uid, u.telegram_id, u.first_name, u.last_name, u.display_name,
        u.username, u.photo_url, u.avatar_url, u.telegram_photo, u.email, u.role,
        u.balance, u.balance_pay, u.balance_free, u.balance_ref, u.balance_gift, u.balance_out,
        u.last_seen, u.last_login, u.total_points, u.points, u.created_at
    `, params);

    const needsFileMap = users.some(
      (u) =>
        String(u.avatar_url || '').includes('/file/') ||
        String(u.photo_url || '').includes('/file/') ||
        String(u.telegram_photo || '').includes('/file/')
    );
    const fileUrlMap = needsFileMap ? await getDirectFileUrlMap() : null;
    const safeUsers = users.map(u => {
      const gPlayed = Number(u.games_played || 0);
      const gWon = Number(u.games_won || 0);
      const winRate = gPlayed > 0 ? Math.round((gWon / gPlayed) * 100) : 0;
      const resolvedAvatar = fileUrlMap ? replaceFilePathWithMap(u.avatar_url, fileUrlMap) : u.avatar_url;
      const resolvedPhoto = fileUrlMap ? replaceFilePathWithMap(u.photo_url, fileUrlMap) : u.photo_url;
      const resolvedTgPhoto = fileUrlMap ? replaceFilePathWithMap(u.telegram_photo, fileUrlMap) : u.telegram_photo;
      return {
        id: u.id,
        uid: u.uid || u.id,
        telegram_id: u.telegram_id,
        first_name: u.first_name,
        last_name: u.last_name,
        display_name: u.display_name || 'Игрок',
        username: u.username,
        photo_url: resolvedPhoto || resolvedAvatar || resolvedTgPhoto,
        avatar_url: resolvedAvatar,
        telegram_photo: resolvedTgPhoto,
        email: u.email,
        role: u.role || 'player',
        balance: Number(u.balance || 0),
        balance_pay: Number(u.balance_pay || 0),
        balance_free: Number(u.balance_free || 0),
        balance_gift: Number(u.balance_gift || 0),
        balance_out: Number(u.balance_out || 0),
        total_points: Number(u.total_points || 0),
        points: Number(u.total_points || 0),
        created_at: u.created_at,
        last_seen: u.last_seen || null,
        is_online: Boolean(u.is_online),
        games_played: gPlayed,
        games_won: gWon,
        win_rate: winRate
      };
    });

    safeUsers.sort((a, b) => {
      if (sortBy === 'points' || sortBy === 'total_points') {
        return order === 'ASC' ? a.total_points - b.total_points : b.total_points - a.total_points;
      }
      if (sortBy === 'games_played') {
        return order === 'ASC' ? a.games_played - b.games_played : b.games_played - a.games_played;
      }
      if (sortBy === 'games_won') {
        return order === 'ASC' ? a.games_won - b.games_won : b.games_won - a.games_won;
      }
      if (sortBy === 'created_at') {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return order === 'ASC' ? timeA - timeB : timeB - timeA;
      }
      return order === 'ASC' ? a.balance - b.balance : b.balance - a.balance;
    });

    res.json({ data: safeUsers });
  } catch (err: any) {
    console.error('Error fetching leaderboard:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public profile endpoint
usersRouter.get('/public/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const cleanUid = String(uid).replace(/^profile/i, '');
    const user = await getOne(
      'SELECT * FROM users WHERE uid = $1 OR id = $2 OR telegram_id::text = $3',
      [cleanUid, cleanUid, cleanUid]
    );

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const canonicalUid = user.uid || user.id;
    await recalculateUserBalancesFromTransactions(canonicalUid);

    const freshUser = await getOne(
      'SELECT * FROM users WHERE uid = $1 OR id = $2',
      [canonicalUid, user.id]
    );

    const targetUser = freshUser || user;

    const stats = await getOne(`
      SELECT 
        COUNT(id)::int as games_played,
        COALESCE(SUM(CASE WHEN is_win = 1 THEN 1 ELSE 0 END), 0)::int as games_won,
        COALESCE(SUM(score), 0) as total_score
      FROM game_sessions
      WHERE (user_id = $1 OR user_id = $2)
        AND (game_id IS NULL OR (game_id != 'free_millionaire' AND game_id NOT LIKE 'free_%'))
        AND (mode IS NULL OR mode != 'free')
        AND (game_title IS NULL OR (game_title NOT ILIKE '%Freeлионер%' AND game_title NOT ILIKE '%Free%'))
    `, [canonicalUid, targetUser.id]);

    const lastSeenTime = targetUser.last_seen || targetUser.last_login;
    let isOnline = false;
    if (lastSeenTime) {
      const diffSeconds = Math.abs(Date.now() - new Date(lastSeenTime).getTime()) / 1000;
      isOnline = diffSeconds <= 180;
    }

    const resolvedAvatar = targetUser.avatar_url && String(targetUser.avatar_url).includes('/file/')
      ? await resolveDirectFileUrl(targetUser.avatar_url)
      : (targetUser.avatar_url || null);
    const resolvedPhoto = targetUser.photo_url && String(targetUser.photo_url).includes('/file/')
      ? await resolveDirectFileUrl(targetUser.photo_url)
      : (targetUser.photo_url || null);
    const resolvedTgPhoto = targetUser.telegram_photo && String(targetUser.telegram_photo).includes('/file/')
      ? await resolveDirectFileUrl(targetUser.telegram_photo)
      : (targetUser.telegram_photo || null);

    const publicData = {
      uid: targetUser.uid || canonicalUid,
      id: targetUser.id,
      display_name: targetUser.display_name || 'Игрок',
      role: targetUser.role || 'player',
      username: targetUser.username || null,
      photo_url: resolvedPhoto || resolvedAvatar || resolvedTgPhoto || null,
      avatar_url: resolvedAvatar,
      telegram_photo: resolvedTgPhoto,
      telegram_id: targetUser.telegram_id || null,
      email: targetUser.email || null,
      first_name: targetUser.first_name || null,
      last_name: targetUser.last_name || null,
      balance: Number(targetUser.balance || 0),
      balance_pay: Number(targetUser.balance_pay || 0),
      balance_free: Number(targetUser.balance_free || 0),
      balance_gift: Number(targetUser.balance_gift || 0),
      balance_out: Number(targetUser.balance_out || 0),
      games_played: Number(stats?.games_played || 0),
      games_won: Number(stats?.games_won || 0),
      total_score: Number(stats?.total_score || 0),
      last_seen: targetUser.last_seen || null,
      is_online: isOnline ? 1 : 0,
      created_at: targetUser.created_at
    };

    res.json({ data: publicData });
  } catch (err: any) {
    console.error('Error fetching public profile:', err);
    res.status(500).json({ error: err.message });
  }
});

usersRouter.get('/by-uid/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const cleanUid = String(uid).replace(/^profile/i, '');
    const user = await getOne(
      'SELECT * FROM users WHERE uid = $1 OR id = $2 OR telegram_id::text = $3',
      [cleanUid, cleanUid, cleanUid]
    );
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const canonicalUid = user.uid || user.id;
    await recalculateUserBalancesFromTransactions(canonicalUid);
    const freshUser = await getOne(
      'SELECT * FROM users WHERE uid = $1 OR id = $2',
      [canonicalUid, user.id]
    );

    const stats = await getOne(`
      SELECT 
        COUNT(id)::int as games_played,
        COALESCE(SUM(CASE WHEN is_win = 1 THEN 1 ELSE 0 END), 0)::int as games_won
      FROM game_sessions
      WHERE (user_id = $1 OR user_id = $2)
        AND (game_id IS NULL OR (game_id != 'free_millionaire' AND game_id NOT LIKE 'free_%'))
        AND (mode IS NULL OR mode != 'free')
        AND (game_title IS NULL OR (game_title NOT ILIKE '%Freeлионер%' AND game_title NOT ILIKE '%Free%'))
    `, [canonicalUid, user.id]);

    const result = { ...(freshUser || user) };
    delete result.password;
    if (result.avatar_url && String(result.avatar_url).includes('/file/')) {
      result.avatar_url = await resolveDirectFileUrl(result.avatar_url);
    }
    if (result.photo_url && String(result.photo_url).includes('/file/')) {
      result.photo_url = await resolveDirectFileUrl(result.photo_url);
    }
    if (result.telegram_photo && String(result.telegram_photo).includes('/file/')) {
      result.telegram_photo = await resolveDirectFileUrl(result.telegram_photo);
    }
    result.games_played = Number(stats?.games_played || 0);
    result.games_won = Number(stats?.games_won || 0);

    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Referral stats & list endpoint
usersRouter.get('/referrals/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const user = await getOne('SELECT * FROM users WHERE uid = $1 OR id = $2', [uid, uid]);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const canonicalUid = user.uid || user.id;

    // Get referrals list
    const referrals = await getAll(
      `SELECT uid, id, display_name, username, photo_url, avatar_url, first_name, last_name, created_at, role
       FROM users WHERE referred_by = $1 OR referred_by = $2 ORDER BY created_at DESC`,
      [canonicalUid, user.id]
    );

    // Calculate total referral bonus earned from transactions
    const totalEarningsResult = await getOne(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = $1 AND type LIKE 'ref_id:%'`,
      [canonicalUid]
    );
    const totalEarnings = Number(totalEarningsResult?.total || 0);

    // Get inviter (who invited this user)
    let referrer = null;
    if (user.referred_by) {
      referrer = await getOne(
        `SELECT uid, id, display_name, username, photo_url, avatar_url, first_name, last_name FROM users WHERE uid = $1 OR id = $2`,
        [user.referred_by, user.referred_by]
      );
    }

    // Get bot config for link templates
    const config = await getOne('SELECT * FROM bot_config WHERE id = 1').catch(() => null);
    const rawTemplate = config?.ref_link_template || 'https://t.me/qaiz_aibot/app?startapp={uid}';
    const template = String(rawTemplate)
      .replace(/SAV_AIbot/gi, 'qaiz_aibot')
      .replace(/qaiz_AIbot/g, 'qaiz_aibot');
    const directSiteUrl = config?.direct_site_url || 'https://qaiz.ru/';
    const referralLinkTma = template.replace('{uid}', canonicalUid).replace('{telegram_id}', canonicalUid);
    const referralLinkDirect = String(config?.web_app_url || 'https://t.me/qaiz_aibot/app')
      .replace(/SAV_AIbot/gi, 'qaiz_aibot')
      .replace(/qaiz_AIbot/g, 'qaiz_aibot');
    const referralLinkWeb = `${directSiteUrl.replace(/\/+$/, '')}/?ref=${canonicalUid}`;

    res.json({
      data: {
        user_uid: canonicalUid,
        referrals,
        referral_count: referrals.length,
        referral_earnings: totalEarnings,
        referral_reward_balance: user.referral_reward_balance || totalEarnings,
        referrer,
        referral_link_tma: referralLinkTma,
        referral_link_direct: referralLinkDirect,
        referral_link_web: referralLinkWeb,
        direct_site_url: directSiteUrl
      }
    });
  } catch (err: any) {
    console.error('Error fetching referral stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// Transfer / Gift IIRok from current user to a friend/referral
usersRouter.post('/gift-iikr', async (req, res) => {
  try {
    const senderUid = (req.headers['x-user-uid'] || req.body.sender_uid) as string;
    const { target_uid, amount, message } = req.body;

    if (!senderUid) {
      return res.status(401).json({ error: 'Требуется авторизация отправителя' });
    }

    const numAmount = Math.floor(Number(amount));
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Укажите корректное количество ИИрок (минимум 1)' });
    }

    // 1. Fetch sender
    const sender = await getOne<any>(
      'SELECT id, uid, display_name, username, balance FROM users WHERE uid = $1 OR id = $2',
      [senderUid, senderUid]
    );
    if (!sender) {
      return res.status(404).json({ error: 'Отправитель не найден' });
    }

    const canonicalSenderUid = sender.uid || sender.id;

    // 2. Fetch recipient
    const recipient = await getOne<any>(
      'SELECT id, uid, display_name, username, balance, telegram_id FROM users WHERE uid = $1 OR id = $2',
      [target_uid, target_uid]
    );
    if (!recipient) {
      return res.status(404).json({ error: 'Получатель подарка не найден' });
    }

    const canonicalRecipientUid = recipient.uid || recipient.id;

    if (canonicalSenderUid === canonicalRecipientUid) {
      return res.status(400).json({ error: 'Нельзя дарить ИИрки самому себе' });
    }

    // 3. Check sender balance
    if ((sender.balance || 0) < numAmount) {
      return res.status(400).json({ 
        error: `Недостаточно ИИрок на балансе. Доступно: ${sender.balance || 0} ИИкр, необходимо: ${numAmount} ИИкр` 
      });
    }

    const txSenderId = generateId('tx_gift_out_');
    const txRecipientId = generateId('tx_gift_in_');
    const notifId = generateId('notif_gift_');
    const now = Date.now();

    const senderName = sender.display_name || sender.username || 'Друг';
    const recipientName = recipient.display_name || recipient.username || 'Игрок';

    const wordSender = getIikrWord(numAmount);
    const wordRecipient = getIikrWord(numAmount);

    // 4. Create debit transaction for sender
    await runSql(
      `INSERT INTO transactions (id, user_id, type, amount, currency, description, reference_id, timestamp, created_at)
       VALUES ($1, $2, 'gift_sent', $3, 'ИИкр', $4, $5, $6, NOW())`,
      [
        txSenderId,
        canonicalSenderUid,
        -numAmount,
        `Подарок другу ${recipientName} (${numAmount} ${wordSender})${message ? ': ' + message : ''}`,
        canonicalRecipientUid,
        now
      ]
    );

    // 5. Create credit transaction for recipient (credited to balance & tracked in balance_gift)
    await runSql(
      `INSERT INTO transactions (id, user_id, type, amount, currency, description, reference_id, timestamp, created_at)
       VALUES ($1, $2, 'gift_received', $3, 'ИИкр', $4, $5, $6, NOW())`,
      [
        txRecipientId,
        canonicalRecipientUid,
        numAmount,
        `Подарок от ${senderName} (+${numAmount} ${wordRecipient})${message ? ': ' + message : ''}`,
        canonicalSenderUid,
        now
      ]
    );

    // 6. Create in-app notification for recipient
    await runSql(
      `INSERT INTO notifications (id, user_id, title, message, type, amount, currency, reference_id, is_read, created_at)
       VALUES ($1, $2, $3, $4, 'gift', $5, 'ИИкр', $6, 0, NOW())`,
      [
        notifId,
        canonicalRecipientUid,
        '🎁 Подарок ИИрок от друга!',
        `${senderName} подарил вам ${numAmount} ${wordRecipient}!${message ? '\nСообщение: ' + message : ''}`,
        numAmount,
        txRecipientId
      ]
    );

    sendWebPushToUser(canonicalRecipientUid, {
      title: 'Подарок ИИкр от друга!',
      body: `${senderName} подарил вам ${numAmount} ${wordRecipient}!`,
      type: 'gift',
      referenceId: txRecipientId,
      tag: notifId,
    }).catch(() => {});

    // 6b. Create in-app notification for sender
    const notifSenderId = generateId('notif_gift_out_');
    await runSql(
      `INSERT INTO notifications (id, user_id, title, message, type, amount, currency, reference_id, is_read, created_at)
       VALUES ($1, $2, $3, $4, 'gift', $5, 'ИИкр', $6, 0, NOW())`,
      [
        notifSenderId,
        canonicalSenderUid,
        '🎁 Подарок другу отправлен',
        `Вы подарили ${numAmount} ${wordSender} пользователю ${recipientName}.${message ? '\nСообщение: ' + message : ''}`,
        -numAmount,
        txSenderId
      ]
    );

    // 7. Recalculate balances safely
    await recalculateUserBalancesFromTransactions(canonicalSenderUid);
    await recalculateUserBalancesFromTransactions(canonicalRecipientUid);

    // 8. Send Telegram notification to recipient if linked (RichMessage format with green button)
    if (recipient.telegram_id) {
      const escapedSender = escapeHtml(senderName);
      const cleanMsg = typeof message === 'string' ? message.trim() : '';
      const escapedMsg = cleanMsg ? escapeHtml(cleanMsg) : '';

      const giftMessage = [
        `Вам отправлен подарок от друга <b>${escapedSender}</b>!`,
        ``,
        `⚡️ <b>Сумма подарка:</b> <code>+${numAmount} ${wordRecipient}</code>`,
        escapedMsg ? `💬 <b>Сообщение:</b>\n<blockquote>${escapedMsg}</blockquote>` : '',
        ``,
        `Баланс автоматически пополнен, вы можете использовать подаренные ИИрки во всех играх и квизах!`
      ].filter(Boolean).join('\n');

      sendCustomTelegramNotification({
        userId: canonicalRecipientUid,
        telegramId: recipient.telegram_id,
        title: '🎁 Подарок ИИрок в Квайз!',
        message: giftMessage,
        isHtml: true,
        actionText: '🎮 Открыть Квайз',
        notificationId: notifId
      }).catch(e => console.error('Error notifying telegram of gift:', e));
    }

    const updatedSender = await getOne<any>('SELECT balance, balance_gift, balance_out FROM users WHERE uid = $1 OR id = $2', [canonicalSenderUid, canonicalSenderUid]);

    res.json({
      success: true,
      message: `Вы успешно подарили ${numAmount} ${wordSender} пользователю ${recipientName}!`,
      new_balance: updatedSender?.balance || 0,
      balance_gift: updatedSender?.balance_gift || 0,
      balance_out: updatedSender?.balance_out || 0,
      gift_amount: numAmount
    });
  } catch (err: any) {
    console.error('Error executing gift-iikr:', err);
    res.status(500).json({ error: err.message || 'Ошибка отправки подарка' });
  }
});

usersRouter.put('/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const body = req.body || {};

    // Check if requester is super admin
    const candidateUid = (req.headers['x-user-uid'] || req.headers['x-admin-uid']) as string | undefined;
    let isSuperAdmin = false;
    if (candidateUid) {
      const cleanAdminUid = String(candidateUid).trim();
      const adminUser = await getOne(
        'SELECT * FROM users WHERE uid = $1 OR id = $2 OR telegram_id::text = $3 OR LOWER(email) = $4',
        [cleanAdminUid, cleanAdminUid, cleanAdminUid, cleanAdminUid.toLowerCase()]
      );
      if (adminUser && isSuperAdminRecord(adminUser)) {
        isSuperAdmin = true;
      }
    }

    const updates: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    const allowedFields = [
      'first_name', 'last_name', 'display_name', 'username', 'avatar_url', 'photo_url', 'telegram_photo', 'avatar_source', 'phone',
      'email', 'bio', 'author_status', 'referred_by', 'email_unsubscribed'
    ];

    if (isSuperAdmin) {
      allowedFields.push('role');
    }

    if (body.email) {
      body.email = body.email.trim().toLowerCase();
      const existing = await getOne('SELECT uid FROM users WHERE LOWER(email) = $1 AND uid != $2 AND id != $3', [body.email, uid, uid]);
      if (existing) {
        return res.status(400).json({ error: 'Этот email уже используется другим пользователем' });
      }
    }

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        let val = body[key];
        if ((key === 'avatar_url' || key === 'photo_url' || key === 'telegram_photo') && typeof val === 'string' && val.includes('/file/')) {
          val = await resolveDirectFileUrl(val);
        }
        updates.push(`${key} = $${pIdx++}`);
        params.push(val);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    params.push(uid, uid, uid);
    await runSql(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE uid = $${pIdx++} OR id = $${pIdx++} OR telegram_id::text = $${pIdx++}`,
      params
    );

    await recalculateUserBalancesFromTransactions(uid);

    const updated = await getOne('SELECT * FROM users WHERE uid = $1 OR id = $2 OR telegram_id::text = $3', [uid, uid, uid]);
    if (updated) delete updated.password;

    res.json({ data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Exchange points to IIKR endpoint (10 000 points = 1 IIKR)
usersRouter.post('/exchange-points', async (req, res) => {
  try {
    const { userId, pointsToExchange } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Идентификатор пользователя обязателен' });
    }
    const pointsNum = Math.floor(Number(pointsToExchange) || 0);
    if (pointsNum < 10000) {
      return res.status(400).json({ error: 'Минимальное количество для обмена — 10 000 очков' });
    }

    const cleanUid = String(userId).replace(/^profile/i, '');
    const user = await getOne<any>(
      'SELECT * FROM users WHERE uid = $1 OR id = $2 OR telegram_id::text = $3',
      [cleanUid, cleanUid, cleanUid]
    );
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const targetUid = user.uid || user.id;

    await recalculateUserBalancesFromTransactions(targetUid);
    const freshUser = await getOne<any>('SELECT * FROM users WHERE uid = $1 OR id = $2', [targetUid, user.id]);
    const availablePoints = Number(freshUser?.total_points || 0);

    if (pointsNum > availablePoints) {
      return res.status(400).json({
        error: `Недостаточно очков для обмена. У вас ${availablePoints.toLocaleString('ru-RU')} очков, запрошено ${pointsNum.toLocaleString('ru-RU')}`
      });
    }

    const iikrEarned = Math.floor(pointsNum / 10000);
    const actualPointsDeducted = iikrEarned * 10000;

    const txId = generateId('tx_pts');
    const now = Date.now();
    await runSql(
      `INSERT INTO transactions (id, user_id, amount, currency, type, description, reference_id, timestamp, created_at)
       VALUES ($1, $2, $3, $4, 'point_exchange', $5, $6, $7, NOW())`,
      [
        txId,
        targetUid,
        iikrEarned,
        getIikrWord(iikrEarned),
        `Обмен ${actualPointsDeducted.toLocaleString('ru-RU')} очков на ${iikrEarned} ${getIikrWord(iikrEarned)}`,
        String(actualPointsDeducted),
        now
      ]
    );

    await recalculateUserBalancesFromTransactions(targetUid);
    const updatedUser = await getOne<any>('SELECT * FROM users WHERE uid = $1 OR id = $2', [targetUid, user.id]);
    if (updatedUser) delete updatedUser.password;

    res.json({
      success: true,
      data: updatedUser,
      exchangedPoints: actualPointsDeducted,
      iikrEarned,
      newBalance: updatedUser?.balance,
      newBallancePoint: updatedUser?.ballance_point,
      remainingPoints: updatedUser?.total_points
    });
  } catch (err: any) {
    console.error('Error exchanging points:', err);
    res.status(500).json({ error: err.message });
  }
});

// Heartbeat endpoint to record active session and shift 7-day reminder schedule
usersRouter.post('/heartbeat', async (req, res) => {
  try {
    const uid = req.body?.uid || req.headers['x-user-uid'];
    if (!uid) {
      return res.json({ ok: false });
    }
    const cleanUid = String(uid).trim();
    await runSql(
      `UPDATE users
       SET last_seen = NOW(),
           last_active_at = NOW(),
           next_reminder_at = NOW() + INTERVAL '7 days'
       WHERE uid = $1 OR id = $2 OR telegram_id::text = $3`,
      [cleanUid, cleanUid, cleanUid]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.json({ ok: false });
  }
});
