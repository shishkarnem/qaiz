import * as webpushPkg from 'web-push';
const webpush: typeof import('web-push') = (webpushPkg as any).default || webpushPkg;
import {
  getAll,
  getOne,
  runSql,
  generateId,
  getProtectedSettingAsync,
  setProtectedSetting,
} from './db';

let pushSchemaInitialized = false;
let vapidConfigured = false;
let cachedPublicKey = '';

export type PushChannelKey =
  | 'direct_messages'
  | 'group_replies'
  | 'game_invites'
  | 'friend_requests'
  | 'achievements'
  | 'transactions'
  | 'system_news';

export function resolvePushChannelKey(type?: string): PushChannelKey {
  const t = String(type || '').toLowerCase();
  if (t === 'message' || t === 'direct_message') return 'direct_messages';
  if (t === 'group_reply' || t === 'group_message' || t === 'group_chat') return 'group_replies';
  if (t.includes('invite') || t === 'duel' || t === 'multiplayer') return 'game_invites';
  if (t.includes('friend')) return 'friend_requests';
  if (t.includes('achieve') || t === 'win' || t === 'level_up' || t === 'rating') return 'achievements';
  if (
    t.includes('trans') ||
    t.includes('gift') ||
    t.includes('ref') ||
    t.includes('start') ||
    t.includes('point') ||
    t.includes('bonus') ||
    t.includes('spend') ||
    t.includes('pay') ||
    t === 'deposit' ||
    t === 'topup' ||
    t === 'robokassa'
  ) {
    return 'transactions';
  }
  return 'system_news';
}

export function resolvePushTargetUrl(type?: string, referenceId?: string): string {
  const ch = resolvePushChannelKey(type);
  const ref = String(referenceId || '').trim();
  if (ch === 'group_replies' && ref) {
    const chatMesMatch = ref.match(/^chat-([^-]+)-mes(.+)$/);
    if (chatMesMatch) {
      return `/profile/ref?chat=${encodeURIComponent(chatMesMatch[1])}&mes=${encodeURIComponent(chatMesMatch[2])}`;
    }
    if (ref.includes(':')) {
      const [cid, mid] = ref.split(':');
      return `/profile/ref?chat=${encodeURIComponent(cid)}&mes=${encodeURIComponent(mid)}`;
    }
    return `/profile/ref?chat=${encodeURIComponent(ref)}`;
  }
  if (ch === 'direct_messages' || ch === 'game_invites' || ch === 'friend_requests') {
    return '/profile/ref';
  }
  if (ch === 'transactions') {
    return '/profile/trans';
  }
  if (ch === 'achievements') {
    return '/profile/history';
  }
  return '/profile/notifications';
}

export async function ensurePushInfrastructure(): Promise<void> {
  if (!pushSchemaInitialized) {
    await runSql(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        platform TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await runSql(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)
    `).catch(() => {});
    await runSql(`
      ALTER TABLE user_notification_settings ADD COLUMN IF NOT EXISTS push_enabled INTEGER DEFAULT 1
    `).catch(() => {});
    pushSchemaInitialized = true;
  }

  if (!vapidConfigured) {
    let publicKey = (await getProtectedSettingAsync('vapid_public_key', '')).trim();
    let privateKey = (await getProtectedSettingAsync('vapid_private_key', '')).trim();

    if (!publicKey || !privateKey) {
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;
      await setProtectedSetting('vapid_public_key', publicKey, false);
      await setProtectedSetting('vapid_private_key', privateKey, true);
      console.log('[WebPush] Generated and persisted new VAPID keypair in PostgreSQL.');
    }

    webpush.setVapidDetails('mailto:support@qaiz.ru', publicKey, privateKey);
    cachedPublicKey = publicKey;
    vapidConfigured = true;
  }
}

export async function getVapidPublicKey(): Promise<string> {
  await ensurePushInfrastructure();
  return cachedPublicKey;
}

export async function resolveCanonicalUid(userIdentifier: string): Promise<string> {
  const clean = String(userIdentifier || '').trim();
  if (!clean) return '';
  const user = await getOne<{ uid: string; id: string }>(
    'SELECT uid, id FROM users WHERE uid = $1 OR id = $1 OR telegram_id = $1 LIMIT 1',
    [clean]
  ).catch(() => null);
  return String(user?.uid || user?.id || clean);
}

export async function upsertPushSubscription(params: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  platform?: string;
}): Promise<void> {
  await ensurePushInfrastructure();
  const canonicalUid = await resolveCanonicalUid(params.userId);
  if (!canonicalUid || !params.endpoint || !params.p256dh || !params.auth) {
    throw new Error('Некорректные данные подписки Web Push');
  }

  const subId = generateId('pushsub');
  await runSql(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, platform, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       platform = EXCLUDED.platform,
       updated_at = NOW()`,
    [
      subId,
      canonicalUid,
      params.endpoint,
      params.p256dh,
      params.auth,
      params.userAgent || null,
      params.platform || null,
    ]
  );
}

export async function removePushSubscription(endpoint: string, userId?: string): Promise<void> {
  await ensurePushInfrastructure();
  if (userId) {
    const canonicalUid = await resolveCanonicalUid(userId);
    await runSql(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 AND (user_id = $2 OR user_id = $3)',
      [endpoint, canonicalUid, userId]
    );
  } else {
    await runSql('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
  }
}

export async function countUserPushSubscriptions(userId: string): Promise<number> {
  await ensurePushInfrastructure();
  const canonicalUid = await resolveCanonicalUid(userId);
  const row = await getOne<{ cnt: number }>(
    'SELECT COUNT(*)::int AS cnt FROM push_subscriptions WHERE user_id = $1 OR user_id = $2',
    [canonicalUid, userId]
  ).catch(() => null);
  return Number(row?.cnt || 0);
}

export interface SendPushPayload {
  title: string;
  body: string;
  type?: string;
  url?: string;
  tag?: string;
  referenceId?: string;
  force?: boolean;
}

export async function sendWebPushToUser(
  userId: string,
  payload: SendPushPayload
): Promise<{ sent: number; failed: number; skippedReason?: string }> {
  try {
    await ensurePushInfrastructure();
    const canonicalUid = await resolveCanonicalUid(userId);
    if (!canonicalUid) {
      return { sent: 0, failed: 0, skippedReason: 'user_not_found' };
    }

    if (!payload.force) {
      const settingsRow = await getOne<{
        push_enabled?: number | null;
        channels_json?: string | null;
      }>(
        `SELECT push_enabled, channels_json FROM user_notification_settings
         WHERE user_id = $1 OR user_id = $2 OR user_id IN (SELECT id FROM users WHERE uid = $1)
         LIMIT 1`,
        [canonicalUid, userId]
      ).catch(() => null);

      if (settingsRow && settingsRow.push_enabled === 0) {
        return { sent: 0, failed: 0, skippedReason: 'push_master_disabled' };
      }

      if (settingsRow?.channels_json) {
        try {
          const channels = JSON.parse(settingsRow.channels_json);
          const chKey = resolvePushChannelKey(payload.type);
          if (channels?.[chKey] && channels[chKey].push === false) {
            return { sent: 0, failed: 0, skippedReason: `channel_${chKey}_disabled` };
          }
        } catch (_) {}
      }
    }

    const subscriptions = await getAll<{
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }>(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions
       WHERE user_id = $1 OR user_id = $2 OR user_id IN (SELECT id FROM users WHERE uid = $1)`,
      [canonicalUid, userId]
    );

    if (!subscriptions || subscriptions.length === 0) {
      return { sent: 0, failed: 0, skippedReason: 'no_subscriptions' };
    }

    const targetUrl = payload.url || resolvePushTargetUrl(payload.type, payload.referenceId);
    const serialized = JSON.stringify({
      title: payload.title || 'Квайз (qAIz)',
      body: payload.body || '',
      url: targetUrl,
      tag: payload.tag || `qaiz-${resolvePushChannelKey(payload.type)}-${Date.now()}`,
      type: payload.type || 'system_news',
      icon: '/pwa-192x192.png',
      badge: '/icon-96x96.png',
      timestamp: Date.now(),
    });

    let sent = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            serialized,
            { TTL: 86400 }
          );
          sent += 1;
        } catch (err: any) {
          failed += 1;
          const statusCode = Number(err?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            await runSql('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
          } else {
            console.warn('[WebPush Send Warning]:', statusCode, err?.message || err);
          }
        }
      })
    );

    return { sent, failed };
  } catch (err: any) {
    console.warn('[WebPush Dispatch Warning]:', err?.message || err);
    return { sent: 0, failed: 1, skippedReason: err?.message };
  }
}
