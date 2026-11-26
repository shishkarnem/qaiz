import { Router } from 'express';
import { getAll, getOne, runSql, generateId } from '../db';
import { sendTelegramMessage, sendTelegramPhoto, sendTelegramVoice, sendTelegramVideo, getTelegramBotConfig } from '../telegram';
import { encryptEmojiText, decryptEmojiText } from '../emojiCrypto';
import { moderateChatMessage } from '../function763Moderation';
import { sendWebPushToUser } from '../push';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';

const execPromise = util.promisify(exec);

export const friendsRouter = Router();

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper to fetch or read buffer for any media URL (data URL, storage key, disk file, or remote HTTP)
async function getMediaBuffer(mediaUrl: string): Promise<{ buffer: Buffer; mimeType?: string } | null> {
  try {
    if (!mediaUrl) return null;

    // 1. Data URL (Base64)
    if (mediaUrl.startsWith('data:')) {
      const matches = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        return { buffer: Buffer.from(matches[2], 'base64'), mimeType: matches[1] };
      }
    }

    // 2. Lookup in PostgreSQL file_storage for /file/:id or /api/files/:id
    const fileIdMatch = mediaUrl.match(/\/(?:file|api\/files)\/([a-zA-Z0-9_\-]+)/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      const fileRow = await getOne<{ original_url: string; mime_type: string }>(
        'SELECT original_url, mime_type FROM file_storage WHERE id::text = $1 OR file_key = $2',
        [fileId, fileId]
      );
      if (fileRow?.original_url) {
        if (fileRow.original_url.startsWith('data:')) {
          const m = fileRow.original_url.match(/^data:([^;]+);base64,(.+)$/);
          if (m) {
            return { buffer: Buffer.from(m[2], 'base64'), mimeType: fileRow.mime_type || m[1] };
          }
        } else if (fileRow.original_url.startsWith('http://') || fileRow.original_url.startsWith('https://')) {
          const r = await fetch(fileRow.original_url, { signal: AbortSignal.timeout(15000) });
          if (r.ok) {
            const ab = await r.arrayBuffer();
            return { buffer: Buffer.from(ab), mimeType: fileRow.mime_type || r.headers.get('content-type') || undefined };
          }
        }
      }
    }

    // 3. Local filesystem check
    if (mediaUrl.startsWith('/')) {
      const possiblePaths = [
        path.join(process.cwd(), mediaUrl),
        path.join(process.cwd(), 'public', mediaUrl),
        path.join(process.cwd(), 'uploads', mediaUrl)
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          const buf = await fs.promises.readFile(p);
          return { buffer: buf };
        }
      }
    }

    // 4. Remote HTTP/HTTPS fetch
    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
      const r = await fetch(mediaUrl, { signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const ab = await r.arrayBuffer();
        return { buffer: Buffer.from(ab), mimeType: r.headers.get('content-type') || undefined };
      }
    }

    return null;
  } catch (err) {
    console.warn('[Friends Router] getMediaBuffer error:', err);
    return null;
  }
}

// Convert any audio URL/buffer to OGG Opus for native Telegram voice message
async function convertAudioToOggOpus(audioUrl: string): Promise<Buffer | null> {
  let tmpInput: string | null = null;
  let tmpOutput: string | null = null;
  try {
    const media = await getMediaBuffer(audioUrl);
    if (!media || !media.buffer || media.buffer.length === 0) return null;

    const tmpId = generateId('voice_conv');
    tmpInput = path.join(os.tmpdir(), `${tmpId}_in.audio`);
    tmpOutput = path.join(os.tmpdir(), `${tmpId}_out.ogg`);

    await fs.promises.writeFile(tmpInput, media.buffer);
    // Convert to OGG Opus format with 48kHz and 1 channel, optimized for Telegram voice notes
    await execPromise(`ffmpeg -y -i "${tmpInput}" -c:a libopus -b:a 32k -vbr on -application voip "${tmpOutput}"`);
    const oggBuffer = await fs.promises.readFile(tmpOutput);
    return oggBuffer;
  } catch (err) {
    console.warn('[Friends Router] Voice conversion to OGG Opus failed:', err);
    return null;
  } finally {
    if (tmpInput && fs.existsSync(tmpInput)) {
      fs.unlink(tmpInput, () => {});
    }
    if (tmpOutput && fs.existsSync(tmpOutput)) {
      fs.unlink(tmpOutput, () => {});
    }
  }
}

// GET /api/friends/unread-count or /api/direct-messages/unread-count?userId=...
// Returns exact total unread direct messages count for the user
friendsRouter.get(['/unread-count', '/unread_count'], async (req, res) => {
  try {
    const userId = req.query.userId || req.query.user_id;
    if (!userId) {
      return res.status(400).json({ error: 'Параметр userId обязателен' });
    }

    const me = await getOne<{ uid: string; id: string }>(
      'SELECT uid, id FROM users WHERE uid = $1 OR id = $2',
      [String(userId), String(userId)]
    );
    if (!me) {
      return res.json({ unread_count: 0, unread_messages_count: 0, unread_friends_count: 0 });
    }

    const countRow = await getOne<{ cnt: number }>(
      `SELECT COUNT(*)::int as cnt FROM direct_messages WHERE receiver_id = $1 AND is_read = 0`,
      [me.uid]
    );

    const sendersRow = await getOne<{ cnt: number }>(
      `SELECT COUNT(DISTINCT sender_id)::int as cnt FROM direct_messages WHERE receiver_id = $1 AND is_read = 0`,
      [me.uid]
    );

    const totalUnreadMessages = Number(countRow?.cnt || 0);
    const totalUnreadSenders = Number(sendersRow?.cnt || 0);

    res.json({ 
      unread_count: totalUnreadMessages,
      unread_messages_count: totalUnreadMessages,
      unread_friends_count: totalUnreadSenders
    });
  } catch (err: any) {
    console.error('[Friends Router] Error in /unread-count:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/friends & /api/friends/direct-chats - Returns list of friends or all users for invite selectors
friendsRouter.get(['/', '/direct-chats'], async (req, res) => {
  try {
    const userId = req.query.userId || req.query.user_id;
    if (!userId) {
      return res.json({ data: [] });
    }

    const me = await getOne<{ id: string; uid: string }>(
      'SELECT id, uid FROM users WHERE uid = $1 OR id = $2',
      [String(userId), String(userId)]
    );
    if (!me) {
      return res.json({ data: [] });
    }

    // First try to get accepted friends (deduplicated by uid)
    const friends = await getAll<any>(
      `SELECT u.id, u.uid, u.display_name, u.username, u.photo_url, u.avatar_url, u.telegram_photo,
              CASE 
                WHEN u.last_seen IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - u.last_seen::timestamptz)) <= 180 THEN 1
                ELSE 0 
              END as is_online
       FROM users u
       WHERE u.uid IN (
         SELECT DISTINCT CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
         FROM friendships f
         WHERE (f.user_id = $2 OR f.friend_id = $3) AND f.status = 'accepted'
       ) AND u.uid != $4
       ORDER BY is_online DESC, u.display_name ASC`,
      [me.uid, me.uid, me.uid, me.uid]
    );

    if (friends && friends.length > 0) {
      return res.json({ data: friends });
    }

    // Fallback: return recent active users if no friends yet
    const fallbackUsers = await getAll<any>(
      `SELECT id, uid, display_name, username, photo_url, avatar_url, telegram_photo,
              CASE 
                WHEN last_seen IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - last_seen::timestamptz)) <= 180 THEN 1
                ELSE 0 
              END as is_online
       FROM users
       WHERE uid != $1 AND id != $2
       ORDER BY is_online DESC, last_seen DESC LIMIT 30`,
      [me.uid, me.id]
    );

    res.json({ data: fallbackUsers || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/friends/direct-message - Alias for sending direct message / invitation
friendsRouter.post('/direct-message', async (req, res) => {
  try {
    const senderId = req.body.sender_id || req.body.userId;
    const receiverId = req.body.receiver_id || req.body.recipient_id || req.body.targetUid;
    const message = req.body.message || req.body.content || '';
    const { game_invite, is_invite, media_url, media_type, file_name, file_size } = req.body;

    if (!senderId || !receiverId || (!message && !game_invite && !media_url)) {
      return res.status(400).json({ error: 'sender_id, receiver_id and message are required' });
    }

    const me = await getOne<{ uid: string; display_name: string; username: string }>(
      'SELECT uid, display_name, username FROM users WHERE uid = $1 OR id = $2',
      [senderId, senderId]
    );
    const target = await getOne<{ uid: string; telegram_id: number | null }>(
      'SELECT uid, telegram_id FROM users WHERE uid = $1 OR id = $2',
      [receiverId, receiverId]
    );

    if (!me || !target) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const cleanText = String(message || '').trim();
    const encryptedText = encryptEmojiText(cleanText);
    const msgId = generateId('dmsg');
    const gameInviteJson = game_invite
      ? typeof game_invite === 'string'
        ? game_invite
        : JSON.stringify(game_invite)
      : null;

    await runSql(
      `INSERT INTO direct_messages (
        id, sender_id, receiver_id, message, is_read, game_invite, media_url, media_type, file_name, file_size, created_at
      ) VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9, NOW())`,
      [
        msgId,
        me.uid,
        target.uid,
        encryptedText,
        gameInviteJson,
        media_url || null,
        media_type || (media_url ? 'file' : null),
        file_name || null,
        file_size ? Number(file_size) : null,
      ]
    );

    // Update last_seen
    await runSql(`UPDATE users SET last_seen = NOW() WHERE uid = $1`, [me.uid]).catch(() => {});

    // Create in-app notification so popup toast and notification center receive it
    const notifId = generateId('notif');
    const senderName = me.display_name || me.username || `Игрок ${me.uid}`;
    const notifType = (is_invite || game_invite) ? 'game_invite' : 'message';
    const notifTitle = notifType === 'game_invite' ? `Приглашение в игру от ${senderName}` : `Сообщение от ${senderName}`;
    await runSql(
      `INSERT INTO notifications (id, user_id, type, title, message, reference_id, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, NOW())`,
      [notifId, target.uid, notifType, notifTitle, (cleanText || 'Приглашение в игру!').slice(0, 180), me.uid]
    ).catch(() => {});

    sendWebPushToUser(target.uid, {
      title: notifTitle,
      body: (cleanText || 'Приглашение в игру!').slice(0, 180),
      type: notifType,
      referenceId: me.uid,
      tag: notifId,
    }).catch(() => {});

    // Send notification if not invite or if target has telegram
    if (target.telegram_id && cleanText) {
      sendTelegramMessage({
        chatId: target.telegram_id,
        text: `✉️ <b>Новое сообщение от ${escapeHtml(me.display_name || me.username || 'Игрок')}:</b>\n\n${escapeHtml(cleanText)}`,
        parseMode: 'HTML'
      }).catch(() => {});
    }

    res.json({
      success: true,
      message_id: msgId,
      message: cleanText,
      created_at: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[Friends Router] Error in /direct-message:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/friends/users
// Returns paginated list of users with filter (all, friends, invited, unsubscribed) and sorting
friendsRouter.get('/users', async (req, res) => {
  try {
    const { 
      userId, 
      filter = 'all', 
      search = '', 
      sort = 'online',
      limit = '20', 
      offset = '0' 
    } = req.query;

    const numLimit = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 20));
    const numOffset = Math.max(0, parseInt(String(offset), 10) || 0);
    const searchTrimmed = String(search || '').trim();

    // Get current user identifier (uid and id)
    let myUid = '';
    let myId = '';
    if (userId) {
      const me = await getOne<{ id: string; uid: string }>(
        'SELECT id, uid FROM users WHERE uid = $1 OR id = $2',
        [userId, userId]
      );
      if (me) {
        myUid = me.uid;
        myId = me.id;
      }
    }

    const whereConditions: string[] = [];
    const filterParams: any[] = [];
    let fIdx = 1;

    // Filter logic
    if (filter === 'unread') {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM direct_messages dm
        WHERE dm.sender_id = u.uid AND dm.receiver_id = $${fIdx++} AND dm.is_read = 0
      )`);
      filterParams.push(myUid || '__none__');
    } else if (filter === 'friends') {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM friendships f 
        WHERE ((f.user_id = $${fIdx} AND f.friend_id = u.uid) OR (f.user_id = u.uid AND f.friend_id = $${fIdx}))
          AND f.status = 'accepted'
      )`);
      fIdx++;
      filterParams.push(myUid || '__none__');
    } else if (filter === 'invited') {
      whereConditions.push(`u.referred_by = $${fIdx++}`);
      filterParams.push(myUid || '__none__');
    } else if (filter === 'unsubscribed') {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM friendships f 
        WHERE ((f.user_id = $${fIdx} AND f.friend_id = u.uid) OR (f.user_id = u.uid AND f.friend_id = $${fIdx}))
          AND f.status = 'removed'
      )`);
      fIdx++;
      filterParams.push(myUid || '__none__');
    }

    // Search logic
    if (searchTrimmed) {
      whereConditions.push(`(u.display_name ILIKE $${fIdx} OR u.username ILIKE $${fIdx} OR u.uid ILIKE $${fIdx} OR u.email ILIKE $${fIdx})`);
      fIdx++;
      filterParams.push(`%${searchTrimmed}%`);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Count total query
    const countSql = `
      SELECT COUNT(DISTINCT u.uid)::int as total
      FROM users u
      ${whereClause}
    `;
    const totalRow = await getOne<{ total: number }>(countSql, filterParams);
    const total = Number(totalRow?.total || 0);

    // Determine sorting
    const orderDir = (req.query.order as string)?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    let orderByClause = `ORDER BY is_online ${orderDir}, COALESCE(u.last_seen, u.last_login, u.created_at) ${orderDir}`;
    if (sort === 'points') {
      orderByClause = `ORDER BY COALESCE(u.total_points, u.points, 0) ${orderDir}, u.created_at DESC`;
    } else if (sort === 'balance') {
      orderByClause = `ORDER BY u.balance ${orderDir}, u.created_at DESC`;
    } else if (sort === 'created_at') {
      orderByClause = `ORDER BY u.created_at ${orderDir}`;
    } else if (sort === 'name') {
      orderByClause = `ORDER BY u.display_name ${orderDir}`;
    }

    const uidIdx = fIdx++;
    const limitIdx = fIdx++;
    const offsetIdx = fIdx++;

    // Data query with online status and bidirectional friendship status
    const dataSql = `
      SELECT 
        u.id,
        u.uid,
        u.display_name,
        u.username,
        u.photo_url,
        u.avatar_url,
        u.telegram_photo,
        u.bio,
        u.role,
        COALESCE(u.total_points, u.points, 0) as total_points,
        u.points,
        u.balance,
        u.referred_by,
        u.last_seen,
        u.last_login,
        u.created_at,
        CASE 
          WHEN u.last_seen IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - u.last_seen::timestamptz)) <= 180 THEN 1
          WHEN u.last_seen IS NULL AND u.last_login IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - u.last_login::timestamptz)) <= 180 THEN 1
          ELSE 0 
        END as is_online,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM friendships f 
            WHERE ((f.user_id = $${uidIdx} AND f.friend_id = u.uid) OR (f.user_id = u.uid AND f.friend_id = $${uidIdx}))
              AND f.status = 'accepted'
          ) THEN 1 
          ELSE 0 
        END as is_friend,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM friendships f 
            WHERE ((f.user_id = $${uidIdx} AND f.friend_id = u.uid) OR (f.user_id = u.uid AND f.friend_id = $${uidIdx}))
              AND f.status = 'removed'
          ) THEN 1 
          ELSE 0 
        END as is_unsubscribed,
        CASE 
          WHEN u.referred_by = $${uidIdx} THEN 1 
          ELSE 0 
        END as is_invited,
        (
          SELECT COUNT(*)::int 
          FROM direct_messages dm 
          WHERE dm.sender_id = u.uid AND dm.receiver_id = $${uidIdx} AND dm.is_read = 0
        ) as unread_messages
      FROM users u
      ${whereClause}
      ${orderByClause}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const selectParams = [
      ...filterParams,
      myUid || '',
      numLimit,
      numOffset
    ];
    const users = await getAll(dataSql, selectParams);

    res.json({
      data: users,
      total,
      limit: numLimit,
      offset: numOffset,
      has_more: numOffset + users.length < total
    });
  } catch (err: any) {
    console.error('[Friends Router] Error in /users:', err);
    res.status(500).json({ error: err.message || 'Ошибка загрузки пользователей' });
  }
});

// POST /api/friends/add
friendsRouter.post('/add', async (req, res) => {
  try {
    const { userId, targetUid } = req.body;
    if (!userId || !targetUid) {
      return res.status(400).json({ error: 'userId и targetUid обязательны' });
    }

    const me = await getOne<{ id: string; uid: string; display_name: string; username: string; email: string; telegram_id: string }>(
      'SELECT id, uid, display_name, username, email, telegram_id FROM users WHERE uid = $1 OR id = $2',
      [userId, userId]
    );
    if (!me) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const target = await getOne<{ id: string; uid: string; display_name: string; username: string; email: string; telegram_id: string }>(
      'SELECT id, uid, display_name, username, email, telegram_id FROM users WHERE uid = $1 OR id = $2',
      [targetUid, targetUid]
    );
    if (!target) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    // Insert or update friendship records for both directions (bidirectional acceptance)
    const id1 = `fr_${me.uid}_${target.uid}`;
    const id2 = `fr_${target.uid}_${me.uid}`;
    await runSql(
      `INSERT INTO friendships (id, user_id, friend_id, status, updated_at)
       VALUES ($1, $2, $3, 'accepted', NOW())
       ON CONFLICT(user_id, friend_id) DO UPDATE SET status = 'accepted', updated_at = NOW()`,
      [id1, me.uid, target.uid]
    );
    await runSql(
      `INSERT INTO friendships (id, user_id, friend_id, status, updated_at)
       VALUES ($1, $2, $3, 'accepted', NOW())
       ON CONFLICT(user_id, friend_id) DO UPDATE SET status = 'accepted', updated_at = NOW()`,
      [id2, target.uid, me.uid]
    );

    // Create in-app notification for the target user
    const notifId = generateId('notif');
    const myName = me.display_name || me.username || `Игрок ${me.uid}`;
    await runSql(
      `INSERT INTO notifications (id, user_id, type, title, message, reference_id, is_read, created_at)
       VALUES ($1, $2, 'friend', 'Новый друг', $3, $4, 0, NOW())`,
      [notifId, target.id, `${myName} добавил вас в друзья!`, me.uid]
    ).catch(() => {});

    sendWebPushToUser(target.uid || target.id, {
      title: 'Новый друг',
      body: `${myName} добавил вас в друзья!`,
      type: 'friend_request',
      referenceId: me.uid,
      tag: notifId,
    }).catch(() => {});

    // Send Telegram notification to target user if telegram_id is linked
    if (target.telegram_id) {
      const rawHost = req.headers.host || '';
      const protocol = req.protocol === 'http' && !rawHost.includes('localhost') ? 'https' : req.protocol || 'https';
      const appBaseUrl = `${protocol}://${rawHost}`.replace(/\/+$/, '');

      const senderTgHtml = me.username 
        ? `<a href="https://t.me/${escapeHtml(me.username.replace(/^@/, ''))}">@${escapeHtml(me.username.replace(/^@/, ''))}</a>`
        : me.telegram_id 
        ? `<a href="tg://user?id=${me.telegram_id}">Открыть диалог</a>`
        : 'Не привязан';

      const text = `🤝 <b>Новый друг в игре!</b>\n\n` +
        `Игрок <b>${escapeHtml(me.display_name || 'Игрок')}</b> добавил вас в список друзей.\n\n` +
        `👤 <b>Имя:</b> ${escapeHtml(me.display_name || 'Не указано')}\n` +
        `📧 <b>Почта:</b> ${me.email ? escapeHtml(me.email) : 'Не указана'}\n` +
        `📱 <b>Telegram:</b> ${senderTgHtml}\n` +
        `🆔 <b>UID:</b> <code>${me.uid}</code>`;

      sendTelegramMessage({
        chatId: target.telegram_id,
        text,
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: '🎮 Открыть профиль игрока',
                url: `${appBaseUrl}/profile${me.uid}`,
                style: 'success'
              }
            ]
          ]
        }
      }).catch(err => console.error('[Friends] Telegram notification error:', err.message));
    }

    res.json({ success: true, status: 'accepted' });
  } catch (err: any) {
    console.error('[Friends Router] Error in /add:', err);
    res.status(500).json({ error: err.message || 'Ошибка добавления в друзья' });
  }
});

// POST /api/friends/remove
friendsRouter.post('/remove', async (req, res) => {
  try {
    const { userId, targetUid } = req.body;
    if (!userId || !targetUid) {
      return res.status(400).json({ error: 'userId и targetUid обязательны' });
    }

    const me = await getOne<{ id: string; uid: string }>(
      'SELECT id, uid FROM users WHERE uid = $1 OR id = $2',
      [userId, userId]
    );
    if (!me) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const target = await getOne<{ id: string; uid: string }>(
      'SELECT id, uid FROM users WHERE uid = $1 OR id = $2',
      [targetUid, targetUid]
    );
    if (!target) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    // Mark friendship as removed in both directions
    await runSql(
      `UPDATE friendships 
       SET status = 'removed', updated_at = NOW()
       WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $3 AND friend_id = $4)`,
      [me.uid, target.uid, target.uid, me.uid]
    );

    res.json({ success: true, status: 'removed' });
  } catch (err: any) {
    console.error('[Friends Router] Error in /remove:', err);
    res.status(500).json({ error: err.message || 'Ошибка удаления из друзей' });
  }
});

// GET /api/friends/inviter
friendsRouter.get('/inviter', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId обязателен' });
    }

    const me = await getOne<{ referred_by: string | null }>(
      'SELECT referred_by FROM users WHERE uid = $1 OR id = $2',
      [userId, userId]
    );

    if (!me || !me.referred_by) {
      return res.json({ inviter: null });
    }

    const inviter = await getOne<any>(
      `SELECT 
        uid, id, display_name, username, photo_url, avatar_url, telegram_photo, bio, total_points,
        CASE 
          WHEN last_seen IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - last_seen::timestamptz)) <= 180 THEN 1 
          ELSE 0 
        END as is_online
       FROM users WHERE uid = $1 OR id = $2`,
      [me.referred_by, me.referred_by]
    );

    res.json({ inviter: inviter || null });
  } catch (err: any) {
    console.error('[Friends Router] Error in /inviter:', err);
    res.status(500).json({ error: err.message || 'Ошибка получения информации о пригласившем' });
  }
});

// GET/POST /api/friends/heartbeat or /api/messages/heartbeat
friendsRouter.all('/heartbeat', async (req, res) => {
  try {
    const userId =
      req.body?.userId ||
      req.body?.uid ||
      req.query?.userId ||
      req.query?.uid ||
      req.headers['x-user-uid'];
    if (userId) {
      const cleanUid = String(userId).trim();
      await runSql(
        `UPDATE users SET last_seen = NOW(), last_active_at = NOW() WHERE uid = $1 OR id = $2`,
        [cleanUid, cleanUid]
      );
    }
    res.json({ ok: true, timestamp: Date.now() });
  } catch (_err: any) {
    res.json({ ok: false });
  }
});

// GET /api/messages/:targetUid or /api/friends/messages/:targetUid
friendsRouter.get(['/messages/:targetUid', '/:targetUid'], async (req, res) => {
  try {
    const { targetUid } = req.params;
    const { userId } = req.query;

    if (!userId || !targetUid) {
      return res.status(400).json({ error: 'userId и targetUid обязательны' });
    }

    const me = await getOne<{ uid: string }>('SELECT uid FROM users WHERE uid = $1 OR id = $2', [userId, userId]);
    const target = await getOne<{ uid: string }>('SELECT uid FROM users WHERE uid = $1 OR id = $2', [targetUid, targetUid]);

    if (!me || !target) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Mark messages from target to me as read
    await runSql(
      `UPDATE direct_messages SET is_read = 1 WHERE sender_id = $1 AND receiver_id = $2 AND is_read = 0`,
      [target.uid, me.uid]
    );

    // Fetch conversation
    const messages = await getAll<any>(
      `SELECT * FROM direct_messages 
       WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $3 AND receiver_id = $4)
       ORDER BY created_at ASC LIMIT 100`,
      [me.uid, target.uid, target.uid, me.uid]
    );

    const decryptedMessages = (messages || []).map((m: any) => ({
      ...m,
      message: decryptEmojiText(m.message)
    }));

    res.json({ data: decryptedMessages });
  } catch (err: any) {
    console.error('[Friends Router] Error in GET /messages:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/:targetUid or /api/friends/messages/:targetUid
friendsRouter.post(['/messages/:targetUid', '/:targetUid'], async (req, res) => {
  try {
    const { targetUid } = req.params;
    const { userId, message, game_invite, media_url, media_type, file_name, file_size } = req.body;

    if (!userId || !targetUid || (!message && !game_invite && !media_url)) {
      return res.status(400).json({ error: 'userId, targetUid и содержимое сообщения обязательны' });
    }

    const me = await getOne<{ id: string; uid: string; display_name: string; username: string }>(
      'SELECT id, uid, display_name, username FROM users WHERE uid = $1 OR id = $2',
      [userId, userId]
    );
    const target = await getOne<{ 
      id: string; 
      uid: string; 
      telegram_id: string | null; 
      last_seen: string | null;
      last_login: string | null;
    }>(
      'SELECT id, uid, telegram_id, last_seen, last_login FROM users WHERE uid = $1 OR id = $2',
      [targetUid, targetUid]
    );

    if (!me || !target) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Check moderation with function 763 (do not run for game/room invitations as requested)
    const cleanText = String(message || '').trim();
    const isInvite = Boolean(
      req.body.is_invite || 
      req.body.game_invite || 
      cleanText.includes('/zoom') || 
      cleanText.includes('/multiplayer') || 
      cleanText.includes('Приглашение') ||
      cleanText.includes('приглашает вас')
    );

    if (cleanText && !isInvite) {
      const modResult = await moderateChatMessage(cleanText, `dm_${target.uid}`, me.uid, null, 'direct');
      if (!modResult.allowed) {
        return res.status(400).json({
          error: `Сообщение отклонено ИИ-модератором: ${modResult.reason || 'Нарушение правил общения'}`,
          moderation_reason: modResult.reason || 'Нарушение правил общения'
        });
      }
    }

    // Insert direct message with emoji encryption for stored text
    const msgId = generateId('msg');
    const encryptedText = encryptEmojiText(cleanText);
    const gameInviteJson = game_invite ? (typeof game_invite === 'string' ? game_invite : JSON.stringify(game_invite)) : null;

    await runSql(
      `INSERT INTO direct_messages (id, sender_id, receiver_id, message, game_invite, media_url, media_type, file_name, file_size, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, NOW())`,
      [
        msgId, 
        me.uid, 
        target.uid, 
        encryptedText, 
        gameInviteJson,
        media_url || null,
        media_type || (media_url ? 'file' : null),
        file_name || null,
        file_size ? Number(file_size) : null
      ]
    );

    // Update sender's last_seen
    await runSql(`UPDATE users SET last_seen = NOW() WHERE uid = $1`, [me.uid]);

    // Insert in-app notification for receiver
    const notifId = generateId('notif');
    const senderName = me.display_name || me.username || `Игрок ${me.uid}`;
    let previewText = cleanText;
    if (!previewText) {
      if (media_type === 'audio') previewText = '🎤 Голосовое сообщение';
      else if (media_type === 'image') previewText = '📷 Изображение';
      else if (media_url) previewText = '📎 Файл';
      else previewText = 'Приглашение в игру!';
    }
    
    const notifType = isInvite ? 'game_invite' : 'message';
    const notifTitle = isInvite ? `Приглашение в игру от ${senderName}` : `Сообщение от ${senderName}`;
    await runSql(
      `INSERT INTO notifications (id, user_id, type, title, message, reference_id, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, NOW())`,
      [notifId, target.uid, notifType, notifTitle, previewText.slice(0, 180), me.uid]
    );

    sendWebPushToUser(target.uid, {
      title: notifTitle,
      body: previewText.slice(0, 180),
      type: notifType,
      referenceId: me.uid,
      tag: notifId,
    }).catch(() => {});

    // Check online status of receiver
    const isTargetOnline = await getOne<{ is_online: number }>(
      `SELECT CASE 
        WHEN last_seen IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - last_seen::timestamptz)) <= 180 THEN 1 
        ELSE 0 
       END as is_online FROM users WHERE uid = $1`,
      [target.uid]
    );

    // If receiver is NOT online and has telegram_id, send Telegram notification!
    if (!isTargetOnline?.is_online && target.telegram_id) {
      try {
        const origin = req.headers.origin || req.headers.host || 'qaiz.ru';
        const siteUrl = origin.startsWith('http') ? origin : `https://${origin}`;
        const profileUrl = `${siteUrl}/profile${me.uid}`;
        const escapedSender = escapeHtml(senderName);

        // Telegram inline keyboard button with style: 'success'
        const inlineKeyboard = {
          inline_keyboard: [
            [
              {
                text: 'Открыть профиль игрока',
                url: profileUrl,
                style: 'success'
              }
            ]
          ]
        };

        const absoluteMediaUrl = media_url
          ? (media_url.startsWith('http') ? media_url : `${siteUrl}${media_url.startsWith('/') ? '' : '/'}${media_url}`)
          : null;

        // Auto-detect media type if not provided explicitly
        let detectedType = media_type;
        if (!detectedType && media_url) {
          if (/\.(webm|mp3|wav|ogg|m4a|aac|flac)($|\?)/i.test(media_url) || (file_name && /\.(webm|mp3|wav|ogg|m4a|aac|flac)$/i.test(file_name))) {
            detectedType = 'audio';
          } else if (/\.(png|jpe?g|gif|webp|svg)($|\?)/i.test(media_url) || (file_name && /\.(png|jpe?g|gif|webp|svg)$/i.test(file_name))) {
            detectedType = 'image';
          } else if (/\.(mp4|mov|avi|mkv)($|\?)/i.test(media_url) || (file_name && /\.(mp4|mov|avi|mkv)$/i.test(file_name))) {
            detectedType = 'video';
          }
        }

        if (detectedType === 'audio' && (media_url || absoluteMediaUrl)) {
          // Native Telegram voice message (converted to OGG Opus via ffmpeg)
          (async () => {
            try {
              const voiceBuffer = await convertAudioToOggOpus(media_url || absoluteMediaUrl!);
              const caption = cleanText
                ? `🎤 <b>Голосовое сообщение от ${escapedSender}</b>\n\n<blockquote>${escapeHtml(cleanText.slice(0, 700))}</blockquote>`
                : `🎤 <b>Голосовое сообщение от ${escapedSender}</b>`;

              if (voiceBuffer) {
                await sendTelegramVoice({
                  chatId: target.telegram_id,
                  voiceBuffer,
                  caption,
                  parseMode: 'HTML',
                  replyMarkup: inlineKeyboard
                });
              } else {
                await sendTelegramMessage({
                  chatId: target.telegram_id,
                  text: `${caption}\n\n<a href="${absoluteMediaUrl}">🔊 Прослушать запись</a>`,
                  parseMode: 'HTML',
                  replyMarkup: inlineKeyboard
                });
              }
            } catch (err: any) {
              console.warn('[Friends Router] Failed to send Telegram voice message:', err.message);
            }
          })();
        } else if (detectedType === 'image' && (media_url || absoluteMediaUrl)) {
          // Native Telegram photo with text caption
          (async () => {
            try {
              const caption = cleanText
                ? `📷 <b>Изображение от ${escapedSender}</b>\n\n<blockquote>${escapeHtml(cleanText.slice(0, 700))}</blockquote>`
                : `📷 <b>Изображение от ${escapedSender}</b>`;

              const media = await getMediaBuffer(media_url);
              if (media?.buffer) {
                await sendTelegramPhoto({
                  chatId: target.telegram_id,
                  photoBuffer: media.buffer,
                  filename: file_name || 'image.jpg',
                  caption,
                  parseMode: 'HTML',
                  replyMarkup: inlineKeyboard
                });
              } else if (absoluteMediaUrl) {
                await sendTelegramPhoto({
                  chatId: target.telegram_id,
                  photoUrl: absoluteMediaUrl,
                  caption,
                  parseMode: 'HTML',
                  replyMarkup: inlineKeyboard
                });
              }
            } catch (err: any) {
              console.warn('[Friends Router] sendTelegramPhoto failed, falling back to message:', err);
              const fallbackText = `📷 <b>Изображение от ${escapedSender}</b>\n\n<blockquote>${escapeHtml(cleanText || previewText)}</blockquote>\n\n<a href="${absoluteMediaUrl}">🖼 Открыть изображение</a>`;
              await sendTelegramMessage({
                chatId: target.telegram_id,
                text: fallbackText,
                parseMode: 'HTML',
                replyMarkup: inlineKeyboard
              });
            }
          })();
        } else if (detectedType === 'video' && (media_url || absoluteMediaUrl)) {
          // Native Telegram video with text caption
          (async () => {
            try {
              const caption = cleanText
                ? `🎬 <b>Видео от ${escapedSender}</b>\n\n<blockquote>${escapeHtml(cleanText.slice(0, 700))}</blockquote>`
                : `🎬 <b>Видео от ${escapedSender}</b>`;

              const media = await getMediaBuffer(media_url);
              if (media?.buffer) {
                await sendTelegramVideo({
                  chatId: target.telegram_id,
                  videoBuffer: media.buffer,
                  filename: file_name || 'video.mp4',
                  caption,
                  parseMode: 'HTML',
                  replyMarkup: inlineKeyboard
                });
              } else if (absoluteMediaUrl) {
                await sendTelegramVideo({
                  chatId: target.telegram_id,
                  videoUrl: absoluteMediaUrl,
                  caption,
                  parseMode: 'HTML',
                  replyMarkup: inlineKeyboard
                });
              }
            } catch (err: any) {
              console.warn('[Friends Router] sendTelegramVideo failed, falling back to message:', err);
              const fallbackText = `🎬 <b>Видео от ${escapedSender}</b>\n\n<blockquote>${escapeHtml(cleanText || previewText)}</blockquote>\n\n<a href="${absoluteMediaUrl}">🎬 Смотреть видео</a>`;
              await sendTelegramMessage({
                chatId: target.telegram_id,
                text: fallbackText,
                parseMode: 'HTML',
                replyMarkup: inlineKeyboard
              });
            }
          })();
        } else {
          // Regular text message or file attachment formatted as quote
          let bodyText = '';
          if (cleanText) {
            bodyText = `<blockquote>${escapeHtml(cleanText.slice(0, 1000))}</blockquote>`;
          } else if (file_name) {
            bodyText = `<blockquote>📎 Файл: ${escapeHtml(file_name)}</blockquote>`;
          } else {
            bodyText = `<blockquote>${escapeHtml(previewText)}</blockquote>`;
          }

          if (media_url && !cleanText?.includes(media_url)) {
            bodyText += `\n\n📎 <b>Вложение:</b> <a href="${absoluteMediaUrl || media_url}">${escapeHtml(file_name || 'Открыть файл')}</a>`;
          }

          const tgText = `💬 <b>Новое сообщение от ${escapedSender}</b>\n\n${bodyText}`;

          sendTelegramMessage({
            chatId: target.telegram_id,
            text: tgText,
            parseMode: 'HTML',
            replyMarkup: inlineKeyboard
          }).catch(err => console.warn('[Friends Router] Telegram notification warning:', err));
        }
      } catch (tgErr) {
        console.warn('[Friends Router] Telegram alert error:', tgErr);
      }
    }

    res.json({
      success: true,
      data: {
        id: msgId,
        sender_id: me.uid,
        receiver_id: target.uid,
        message: cleanText,
        game_invite: gameInviteJson,
        media_url: media_url || null,
        media_type: media_type || (media_url ? 'file' : null),
        file_name: file_name || null,
        file_size: file_size ? Number(file_size) : null,
        is_read: 0,
        created_at: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[Friends Router] Error in POST /messages:', err);
    res.status(500).json({ error: err.message });
  }
});
