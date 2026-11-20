import { Router } from 'express';
import { getAll, getOne, runSql } from '../db';
import {
  getVapidPublicKey,
  upsertPushSubscription,
  removePushSubscription,
  countUserPushSubscriptions,
  sendWebPushToUser,
} from '../push';

export const notificationsRouter = Router();

// GET /api/notifications?user_id=...&limit=20&offset=0&unread_only=false
notificationsRouter.get('/', async (req, res) => {
  try {
    const { user_id, limit = '20', offset = '0', unread_only = 'false' } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'Параметр user_id обязателен' });
    }

    const numLimit = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 20));
    const numOffset = Math.max(0, parseInt(String(offset), 10) || 0);
    const unreadFilter = String(unread_only) === 'true';

    // Count total overall for user
    const totalAllRes = await getOne<{ cnt: number }>(
      'SELECT COUNT(*)::int as cnt FROM notifications WHERE (user_id = $1 OR user_id IN (SELECT id FROM users WHERE uid = $2))',
      [user_id, user_id]
    );
    const totalAll = Number(totalAllRes?.cnt || 0);

    // Count unread
    const unreadCountRes = await getOne<{ cnt: number }>(
      'SELECT COUNT(*)::int as cnt FROM notifications WHERE (user_id = $1 OR user_id IN (SELECT id FROM users WHERE uid = $2)) AND is_read = 0',
      [user_id, user_id]
    );
    const unreadCount = Number(unreadCountRes?.cnt || 0);
    const readCount = Math.max(0, totalAll - unreadCount);

    // Total count for current query
    let countSql = 'SELECT COUNT(*)::int as cnt FROM notifications WHERE (user_id = $1 OR user_id IN (SELECT id FROM users WHERE uid = $2))';
    const countParams: any[] = [user_id, user_id];
    if (unreadFilter) {
      countSql += ' AND is_read = 0';
    }
    const totalCountRes = await getOne<{ cnt: number }>(countSql, countParams);
    const total = Number(totalCountRes?.cnt || 0);

    // Select paginated items
    let selectSql = 'SELECT * FROM notifications WHERE (user_id = $1 OR user_id IN (SELECT id FROM users WHERE uid = $2))';
    const selectParams: any[] = [user_id, user_id];
    if (unreadFilter) {
      selectSql += ' AND is_read = 0';
    }
    selectSql += ' ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4';
    selectParams.push(numLimit, numOffset);

    const items = await getAll(selectSql, selectParams);

    res.json({
      data: items,
      total,
      total_all: totalAll,
      unread_count: unreadCount,
      read_count: readCount,
      limit: numLimit,
      offset: numOffset,
      has_more: numOffset + items.length < total
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications/unread-count?user_id=...
notificationsRouter.get('/unread-count', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'Параметр user_id обязателен' });
    }

    const totalCountRes = await getOne<{ cnt: number }>(
      'SELECT COUNT(*)::int as cnt FROM notifications WHERE (user_id = $1 OR user_id IN (SELECT id FROM users WHERE uid = $2))',
      [user_id, user_id]
    );
    const totalCount = Number(totalCountRes?.cnt || 0);

    const unreadCountRes = await getOne<{ cnt: number }>(
      'SELECT COUNT(*)::int as cnt FROM notifications WHERE (user_id = $1 OR user_id IN (SELECT id FROM users WHERE uid = $2)) AND is_read = 0',
      [user_id, user_id]
    );
    const unreadCount = Number(unreadCountRes?.cnt || 0);
    const readCount = Math.max(0, totalCount - unreadCount);

    res.json({ 
      unread_count: unreadCount,
      total_count: totalCount,
      read_count: readCount
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/mark-read
notificationsRouter.post('/mark-read', async (req, res) => {
  try {
    const { id, user_id, all } = req.body;

    if (all && user_id) {
      await runSql(
        'UPDATE notifications SET is_read = 1 WHERE user_id = $1 OR user_id IN (SELECT id FROM users WHERE uid = $2)',
        [user_id, user_id]
      );
      return res.json({ success: true, message: 'Все уведомления прочитаны' });
    }

    if (id) {
      await runSql('UPDATE notifications SET is_read = 1 WHERE id = $1', [id]);
      return res.json({ success: true, message: 'Уведомление отмечено прочитанным' });
    }

    res.status(400).json({ error: 'Необходимо указать id или all с user_id' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/delete
notificationsRouter.post('/delete', async (req, res) => {
  try {
    const { id, user_id, all } = req.body;

    if (all && user_id) {
      await runSql(
        'DELETE FROM notifications WHERE user_id = $1 OR user_id IN (SELECT id FROM users WHERE uid = $2)',
        [user_id, user_id]
      );
      return res.json({ success: true, message: 'Все уведомления удалены' });
    }

    if (id) {
      await runSql('DELETE FROM notifications WHERE id = $1', [id]);
      return res.json({ success: true, message: 'Уведомление удалено' });
    }

    res.status(400).json({ error: 'Необходимо указать id или all с user_id' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const DEFAULT_CHANNELS = {
  direct_messages: { inapp: true, toast: true, telegram: true, push: true },
  group_replies: { inapp: true, toast: true, telegram: true, push: true },
  game_invites: { inapp: true, toast: true, telegram: true, push: true },
  friend_requests: { inapp: true, toast: true, telegram: true, push: true },
  achievements: { inapp: true, toast: true, telegram: false, push: true },
  transactions: { inapp: true, toast: true, telegram: true, push: true },
  system_news: { inapp: true, toast: true, telegram: true, push: true },
};

const DEFAULT_REMINDERS = {
  daily_bonus: true,
  streak_loss: true,
  tournaments: true,
  unanswered_duels: true,
  unread_messages: true,
  weekly_digest: true,
};

// GET /api/notifications/settings?user_id=...
notificationsRouter.get('/settings', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'Параметр user_id обязателен' });
    }

    const userRow = await getOne<any>(
      'SELECT uid, email_unsubscribed FROM users WHERE uid = $1 OR id = $2',
      [user_id, user_id]
    ).catch(() => null);

    const row = await getOne<any>(
      'SELECT * FROM user_notification_settings WHERE user_id = $1 OR user_id IN (SELECT id FROM users WHERE uid = $2)',
      [user_id, user_id]
    );

    if (!row) {
      return res.json({
        success: true,
        settings: {
          user_id,
          sound_enabled: true,
          toast_enabled: true,
          push_enabled: true,
          telegram_notifications_enabled: true,
          telegram_reminders_enabled: userRow?.email_unsubscribed ? false : true,
          channels: DEFAULT_CHANNELS,
          reminders: DEFAULT_REMINDERS,
        },
      });
    }

    let parsedChannels = { ...DEFAULT_CHANNELS };
    try {
      if (row.channels_json) {
        const rawCh = JSON.parse(row.channels_json);
        parsedChannels = {
          direct_messages: { ...DEFAULT_CHANNELS.direct_messages, ...(rawCh.direct_messages || {}) },
          group_replies: { ...DEFAULT_CHANNELS.group_replies, ...(rawCh.group_replies || {}) },
          game_invites: { ...DEFAULT_CHANNELS.game_invites, ...(rawCh.game_invites || {}) },
          friend_requests: { ...DEFAULT_CHANNELS.friend_requests, ...(rawCh.friend_requests || {}) },
          achievements: { ...DEFAULT_CHANNELS.achievements, ...(rawCh.achievements || {}) },
          transactions: { ...DEFAULT_CHANNELS.transactions, ...(rawCh.transactions || {}) },
          system_news: { ...DEFAULT_CHANNELS.system_news, ...(rawCh.system_news || {}) },
        };
      }
    } catch (_) {}

    let parsedReminders = { ...DEFAULT_REMINDERS };
    try {
      if (row.reminders_json) {
        parsedReminders = { ...DEFAULT_REMINDERS, ...JSON.parse(row.reminders_json) };
      }
    } catch (_) {}

    res.json({
      success: true,
      settings: {
        user_id: row.user_id,
        sound_enabled: Boolean(row.sound_enabled ?? 1),
        toast_enabled: Boolean(row.toast_enabled ?? 1),
        push_enabled: Boolean(row.push_enabled ?? 1),
        telegram_notifications_enabled: Boolean(row.telegram_notifications_enabled ?? 1),
        telegram_reminders_enabled: Boolean(row.telegram_reminders_enabled ?? 1),
        channels: parsedChannels,
        reminders: parsedReminders,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/settings
notificationsRouter.post('/settings', async (req, res) => {
  try {
    const {
      user_id,
      sound_enabled = true,
      toast_enabled = true,
      push_enabled = true,
      telegram_notifications_enabled = true,
      telegram_reminders_enabled = true,
      channels,
      reminders,
    } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'Параметр user_id обязателен' });
    }

    const channelsJson = JSON.stringify(channels || DEFAULT_CHANNELS);
    const remindersJson = JSON.stringify(reminders || DEFAULT_REMINDERS);

    await runSql(
      `INSERT INTO user_notification_settings (
        user_id, sound_enabled, toast_enabled, push_enabled, telegram_notifications_enabled, telegram_reminders_enabled, channels_json, reminders_json, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        sound_enabled = EXCLUDED.sound_enabled,
        toast_enabled = EXCLUDED.toast_enabled,
        push_enabled = EXCLUDED.push_enabled,
        telegram_notifications_enabled = EXCLUDED.telegram_notifications_enabled,
        telegram_reminders_enabled = EXCLUDED.telegram_reminders_enabled,
        channels_json = EXCLUDED.channels_json,
        reminders_json = EXCLUDED.reminders_json,
        updated_at = NOW()`,
      [
        user_id,
        sound_enabled ? 1 : 0,
        toast_enabled ? 1 : 0,
        push_enabled ? 1 : 0,
        telegram_notifications_enabled ? 1 : 0,
        telegram_reminders_enabled ? 1 : 0,
        channelsJson,
        remindersJson,
      ]
    );

    // Sync email_unsubscribed flag on users table with reminders preference
    await runSql(
      `UPDATE users SET email_unsubscribed = $1 WHERE uid = $2 OR id = $3`,
      [telegram_reminders_enabled ? 0 : 1, user_id, user_id]
    ).catch(() => {});

    res.json({ success: true, message: 'Настройки уведомлений успешно сохранены' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications/push/vapid-public-key
notificationsRouter.get('/push/vapid-public-key', async (_req, res) => {
  try {
    const publicKey = await getVapidPublicKey();
    res.json({ success: true, publicKey });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Ошибка получения VAPID ключа' });
  }
});

// GET /api/notifications/push/status?user_id=...
notificationsRouter.get('/push/status', async (req, res) => {
  try {
    const userId = String(req.query.user_id || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'Параметр user_id обязателен' });
    }
    const count = await countUserPushSubscriptions(userId);
    res.json({ success: true, subscribedCount: count, isSubscribed: count > 0 });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Ошибка проверки push статуса' });
  }
});

// POST /api/notifications/push/subscribe
notificationsRouter.post('/push/subscribe', async (req, res) => {
  try {
    const { user_id, subscription, platform } = req.body || {};
    const endpoint = String(subscription?.endpoint || '').trim();
    const p256dh = String(subscription?.keys?.p256dh || '').trim();
    const auth = String(subscription?.keys?.auth || '').trim();

    if (!user_id || !endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: 'Требуются user_id и ключи подписки Web Push' });
    }

    await upsertPushSubscription({
      userId: String(user_id),
      endpoint,
      p256dh,
      auth,
      userAgent: String(req.get('user-agent') || '').slice(0, 500),
      platform: platform ? String(platform).slice(0, 120) : undefined,
    });

    const count = await countUserPushSubscriptions(String(user_id));
    res.json({ success: true, subscribedCount: count });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Ошибка сохранения подписки Web Push' });
  }
});

// POST /api/notifications/push/unsubscribe
notificationsRouter.post('/push/unsubscribe', async (req, res) => {
  try {
    const { user_id, endpoint } = req.body || {};
    if (!endpoint) {
      return res.status(400).json({ error: 'Параметр endpoint обязателен' });
    }
    await removePushSubscription(String(endpoint), user_id ? String(user_id) : undefined);
    const count = user_id ? await countUserPushSubscriptions(String(user_id)) : 0;
    res.json({ success: true, subscribedCount: count });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Ошибка отключения подписки Web Push' });
  }
});

// POST /api/notifications/push/test
notificationsRouter.post('/push/test', async (req, res) => {
  try {
    const { user_id } = req.body || {};
    if (!user_id) {
      return res.status(400).json({ error: 'Параметр user_id обязателен' });
    }
    const pushRes = await sendWebPushToUser(String(user_id), {
      title: 'Проверка пуш-уведомлений Квайз',
      body: 'Устройство подключено! Теперь важные сообщения и приглашения в игры будут приходить мгновенно.',
      type: 'system_news',
      url: '/profile/notifications',
      tag: 'qaiz-push-test',
      force: true,
    });
    res.json({ success: true, ...pushRes });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Ошибка тестовой отправки Web Push' });
  }
});

// POST /api/notifications/create - Create a notification for a user (or test toast popup)
notificationsRouter.post('/create', async (req, res) => {
  try {
    const { user_id, type = 'system_news', title, message, amount, currency, reference_id } = req.body;
    if (!user_id || !title || !message) {
      return res.status(400).json({ error: 'user_id, title и message обязательны' });
    }

    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await runSql(
      `INSERT INTO notifications (id, user_id, type, title, message, amount, currency, reference_id, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, NOW())`,
      [id, String(user_id), String(type), String(title), String(message), amount ?? null, currency ?? null, reference_id ?? null]
    );

    sendWebPushToUser(String(user_id), {
      title: String(title),
      body: String(message),
      type: String(type),
      referenceId: reference_id ? String(reference_id) : undefined,
      tag: id,
    }).catch(() => {});

    const created = await getOne<any>('SELECT * FROM notifications WHERE id = $1', [id]);
    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications/recent-chat-alerts?user_id=...&since=...
// Returns all recent unread notifications across all channels so cascading popup windows work for every action
notificationsRouter.get('/recent-chat-alerts', async (req, res) => {
  try {
    const { user_id, since } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'Параметр user_id обязателен' });
    }

    let sql = `
      SELECT n.*, 
             u.display_name as sender_name,
             u.username as sender_username,
             u.photo_url as sender_photo,
             u.avatar_url as sender_avatar,
             u.telegram_photo as sender_tg_photo
      FROM notifications n
      LEFT JOIN users u ON (u.uid = n.reference_id OR u.id = n.reference_id)
      WHERE (n.user_id = $1 OR n.user_id IN (SELECT id FROM users WHERE uid = $2))
        AND n.is_read = 0
    `;

    const params: any[] = [user_id, user_id];

    if (since) {
      sql += ` AND n.created_at >= $3::timestamptz`;
      params.push(String(since));
    } else {
      sql += ` AND n.created_at >= NOW() - INTERVAL '15 minutes'`;
    }

    sql += ` ORDER BY n.created_at DESC, n.id DESC LIMIT 12`;

    const alerts = await getAll<any>(sql, params);
    res.json({ success: true, alerts: alerts || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

