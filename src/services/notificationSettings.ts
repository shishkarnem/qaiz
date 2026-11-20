export interface ChannelSettings {
  inapp: boolean;
  toast: boolean;
  push: boolean;
  telegram: boolean;
}

export interface NotificationChannels {
  direct_messages: ChannelSettings;
  group_replies: ChannelSettings;
  game_invites: ChannelSettings;
  friend_requests: ChannelSettings;
  achievements: ChannelSettings;
  transactions: ChannelSettings;
  system_news: ChannelSettings;
}

export interface TelegramReminders {
  daily_bonus: boolean;
  streak_loss: boolean;
  tournaments: boolean;
  unanswered_duels: boolean;
  unread_messages: boolean;
  weekly_digest: boolean;
}

export interface UserNotificationSettings {
  user_id: string;
  sound_enabled: boolean;
  toast_enabled: boolean;
  push_enabled: boolean;
  telegram_notifications_enabled: boolean;
  telegram_reminders_enabled: boolean;
  channels: NotificationChannels;
  reminders: TelegramReminders;
}

export interface ChatAlertNotification {
  id: string;
  user_id: string;
  type: 'message' | 'group_reply' | 'group_message' | 'game_invite' | 'friend' | 'friend_request' | 'achievement' | 'transaction' | 'gift' | 'system_news' | string;
  title: string;
  message: string;
  amount?: number;
  currency?: string;
  reference_id?: string;
  created_at: string;
  sender_name?: string;
  sender_username?: string;
  sender_photo?: string;
  sender_avatar?: string;
  sender_tg_photo?: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: UserNotificationSettings = {
  user_id: '',
  sound_enabled: true,
  toast_enabled: true,
  push_enabled: true,
  telegram_notifications_enabled: true,
  telegram_reminders_enabled: true,
  channels: {
    direct_messages: { inapp: true, toast: true, push: true, telegram: true },
    group_replies: { inapp: true, toast: true, push: true, telegram: true },
    game_invites: { inapp: true, toast: true, push: true, telegram: true },
    friend_requests: { inapp: true, toast: true, push: true, telegram: true },
    achievements: { inapp: true, toast: true, push: true, telegram: false },
    transactions: { inapp: true, toast: true, push: true, telegram: true },
    system_news: { inapp: true, toast: true, push: true, telegram: true },
  },
  reminders: {
    daily_bonus: true,
    streak_loss: true,
    tournaments: true,
    unanswered_duels: true,
    unread_messages: true,
    weekly_digest: true,
  },
};

export function resolveChannelKeyForType(type?: string): keyof NotificationChannels {
  const t = String(type || '').toLowerCase();
  if (t === 'message' || t === 'direct_message') return 'direct_messages';
  if (t === 'group_reply' || t === 'group_message') return 'group_replies';
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
    t.includes('pay')
  ) {
    return 'transactions';
  }
  return 'system_news';
}

export function triggerCascadingToast(alert: Partial<ChatAlertNotification> & { title: string; message: string }) {
  if (typeof window === 'undefined') return;
  const fullAlert: ChatAlertNotification = {
    id: alert.id || `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: alert.user_id || '',
    type: alert.type || 'system_news',
    title: alert.title,
    message: alert.message,
    amount: alert.amount,
    currency: alert.currency,
    reference_id: alert.reference_id,
    created_at: alert.created_at || new Date().toISOString(),
    sender_name: alert.sender_name,
    sender_username: alert.sender_username,
    sender_photo: alert.sender_photo,
    sender_avatar: alert.sender_avatar,
    sender_tg_photo: alert.sender_tg_photo,
  };
  window.dispatchEvent(new CustomEvent('qaiz_toast_notification', { detail: fullAlert }));
}

function isTransientNetworkError(err: any): boolean {
  if (!err) return true;
  if (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out) return true;
  const msg = String(err?.message || err || '');
  return (
    err?.name === 'AbortError' ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('Unexpected end of JSON') ||
    msg.includes("Unexpected token '<'") ||
    msg.includes('<!doctype') ||
    msg.includes('Failed to execute') ||
    msg.includes('JSON.parse')
  );
}

function parseJsonSafely(res: Response, rawText: string): any | null {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const trimmed = (rawText || '').trim();
  if (!trimmed || trimmed.startsWith('<')) return null;
  if (ct && !ct.includes('application/json') && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export async function fetchNotificationSettings(userId: string): Promise<UserNotificationSettings> {
  if (
    !userId ||
    userId === 'usr_guest' ||
    userId.startsWith('demo_') ||
    (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out)
  ) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS, user_id: userId };
  }
  try {
    const res = await fetch(`/api/notifications/settings?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) return { ...DEFAULT_NOTIFICATION_SETTINGS, user_id: userId };
    const text = await res.text();
    const data = parseJsonSafely(res, text);
    if (data?.success && data?.settings) {
      const srvCh = data.settings.channels || {};
      return {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...data.settings,
        push_enabled: data.settings.push_enabled !== undefined ? Boolean(data.settings.push_enabled) : true,
        channels: {
          direct_messages: { ...DEFAULT_NOTIFICATION_SETTINGS.channels.direct_messages, ...(srvCh.direct_messages || {}) },
          group_replies: { ...DEFAULT_NOTIFICATION_SETTINGS.channels.group_replies, ...(srvCh.group_replies || {}) },
          game_invites: { ...DEFAULT_NOTIFICATION_SETTINGS.channels.game_invites, ...(srvCh.game_invites || {}) },
          friend_requests: { ...DEFAULT_NOTIFICATION_SETTINGS.channels.friend_requests, ...(srvCh.friend_requests || {}) },
          achievements: { ...DEFAULT_NOTIFICATION_SETTINGS.channels.achievements, ...(srvCh.achievements || {}) },
          transactions: { ...DEFAULT_NOTIFICATION_SETTINGS.channels.transactions, ...(srvCh.transactions || {}) },
          system_news: { ...DEFAULT_NOTIFICATION_SETTINGS.channels.system_news, ...(srvCh.system_news || {}) },
        },
        reminders: { ...DEFAULT_NOTIFICATION_SETTINGS.reminders, ...(data.settings.reminders || {}) },
      };
    }
  } catch (err) {
    if (!isTransientNetworkError(err)) {
      console.warn('Error fetching notification settings:', err);
    }
  }
  return { ...DEFAULT_NOTIFICATION_SETTINGS, user_id: userId };
}

export async function saveNotificationSettings(
  settings: Partial<UserNotificationSettings> & { user_id: string }
): Promise<boolean> {
  try {
    const res = await fetch('/api/notifications/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) return false;
    const text = await res.text();
    const data = parseJsonSafely(res, text);
    return Boolean(data?.success);
  } catch (err) {
    if (!isTransientNetworkError(err)) {
      console.warn('Error saving notification settings:', err);
    }
    return false;
  }
}

export async function fetchRecentChatAlerts(userId: string, since?: string): Promise<ChatAlertNotification[]> {
  if (
    !userId ||
    userId === 'usr_guest' ||
    userId.startsWith('demo_') ||
    (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out)
  ) {
    return [];
  }
  try {
    const url = since
      ? `/api/notifications/recent-chat-alerts?user_id=${encodeURIComponent(userId)}&since=${encodeURIComponent(since)}`
      : `/api/notifications/recent-chat-alerts?user_id=${encodeURIComponent(userId)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    const data = parseJsonSafely(res, text);
    if (data?.success && Array.isArray(data?.alerts)) {
      return data.alerts;
    }
  } catch (err) {
    if (!isTransientNetworkError(err)) {
      console.warn('Error fetching chat alerts:', err);
    }
  }
  return [];
}
