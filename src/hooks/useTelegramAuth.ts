import { useEffect, useState } from 'react';
import { db } from '../db';
import { safeParseResponseJson } from '../utils/network/safeFetchJson';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface UserProfile {
  id: string;
  uid: string;
  telegram_id: string | null;
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  username: string | null;
  profile_link?: string | null;
  avatar_url: string | null;
  photo_url?: string | null;
  telegram_photo?: string | null;
  avatar_source?: string | null;
  email: string | null;
  email_unsubscribed?: number;
  role: string;
  balance: number;
  balance_pay?: number;
  balance_free?: number;
  ballance_point?: number;
  balance_point?: number;
  total_points?: number;
  points?: number;
  balance_ref?: number;
  balance_start?: number;
  balance_admin?: number;
  balance_time?: number;
  balance_author?: number;
  balance_out?: number;
  balance_gift?: number;
  referral_reward_balance?: number;
  referred_by: string | null;
  author_status?: string;
  author_earnings?: number;
  created_at: string;
}

export type EntryMode = 'preview' | 'telegram' | 'browser';

export function detectEntryMode(): EntryMode {
  const hostname = window.location.hostname;
  const href = window.location.href;
  const hash = window.location.hash || '';

  const tg = (window as any).Telegram?.WebApp;
  if (tg?.initData && tg.initData.length > 0) {
    return 'telegram';
  }
  if (tg?.initDataUnsafe?.user) {
    return 'telegram';
  }
  if (hash.includes('tgWebAppData=') || href.includes('tgWebAppData=')) {
    return 'telegram';
  }

  try {
    if (window.self !== window.top) return 'preview';
  } catch (_) {
    return 'preview';
  }

  if (
    href.includes('id-preview--') ||
    hostname.includes('run.app') ||
    hostname.includes('preview')
  ) {
    return 'preview';
  }

  return 'browser';
}

export function resolveUserAvatar(data: any): string | null {
  if (!data) return null;
  const customAvatar = data.avatar_url || null;
  const tgPhoto = data.telegram_photo || null;
  const explicitSource = data.avatar_source || null;

  // If user explicitly switched back to Telegram photo and Telegram photo exists
  if (explicitSource === 'telegram' && tgPhoto) {
    return tgPhoto;
  }

  // Default priority: uploaded custom avatar first, then photo_url, then telegram_photo
  if (customAvatar && customAvatar !== tgPhoto) {
    return customAvatar;
  }

  return customAvatar || data.photo_url || tgPhoto || null;
}

export const DEV_SUPER_USER: UserProfile = {
  id: '10016926299',
  uid: '10016926299',
  telegram_id: '169262990',
  display_name: 'Тимошенко Денис',
  username: '@shishkarnem',
  profile_link: 'https://t.me/shishkarnem',
  avatar_url: null,
  photo_url: null,
  telegram_photo: null,
  avatar_source: 'custom',
  email: 'shishkarnem@gmail.com',
  role: 'admin',
  balance: 300,
  referral_reward_balance: 0,
  author_earnings: 0,
  author_status: 'none',
  referred_by: null,
  created_at: new Date().toISOString(),
};

function normalizeProfile(data: any): UserProfile {
  const bal = Number(data.balance ?? 0);
  const canonicalUid = String(data.uid || data.id || '10016926299');
  const isSuperAdmin = canonicalUid === '10016926299';

  // Prevent foreign super-admin Telegram account or cached admin role from leaking onto other UIDs
  const rawTgId = data.telegram_id ? String(data.telegram_id) : null;
  const safeTgId = !isSuperAdmin && rawTgId === '169262990' ? null : rawTgId;
  const rawUsername = data.username ? String(data.username) : null;
  const safeUsername =
    !isSuperAdmin && rawUsername && rawUsername.toLowerCase().replace(/^@/, '') === 'shishkarnem'
      ? null
      : rawUsername;
  const safeTgPhoto = !isSuperAdmin && rawTgId === '169262990' ? null : (data.telegram_photo || null);
  const safeRole = isSuperAdmin
    ? 'admin'
    : data.role === 'admin'
    ? 'player'
    : data.role || 'player';

  const sanitizedData = {
    ...data,
    telegram_id: safeTgId,
    username: safeUsername,
    telegram_photo: safeTgPhoto,
    role: safeRole,
  };

  const resolvedPhoto = resolveUserAvatar(sanitizedData);
  const resolvedSource =
    sanitizedData.avatar_source ||
    (sanitizedData.avatar_url && sanitizedData.avatar_url !== sanitizedData.telegram_photo ? 'custom' : 'telegram');
  return {
    id: String(data.id || canonicalUid),
    uid: canonicalUid,
    telegram_id: safeTgId,
    display_name: data.display_name || 'Игрок',
    first_name: data.first_name || null,
    last_name: data.last_name || null,
    username: safeUsername,
    profile_link: safeTgId ? (data.profile_link || null) : null,
    avatar_url: data.avatar_url || null,
    photo_url: resolvedPhoto,
    telegram_photo: safeTgPhoto,
    avatar_source: resolvedSource,
    email: data.email || null,
    email_unsubscribed: Number(data.email_unsubscribed ?? 0),
    role: safeRole,
    balance: bal,
    balance_pay: Number(data.balance_pay ?? 0),
    balance_free: Number(data.balance_free ?? 0),
    ballance_point: Number(data.ballance_point ?? data.balance_point ?? 0),
    balance_point: Number(data.ballance_point ?? data.balance_point ?? 0),
    total_points: Number(data.total_points ?? data.points ?? 0),
    points: Number(data.total_points ?? data.points ?? 0),
    balance_ref: Number(data.balance_ref ?? 0),
    balance_start: Number(data.balance_start ?? 0),
    balance_admin: Number(data.balance_admin ?? 0),
    balance_time: Number(data.balance_time ?? 0),
    balance_author: Number(data.balance_author ?? 0),
    balance_out: Number(data.balance_out ?? 0),
    balance_gift: Number(data.balance_gift ?? 0),
    referral_reward_balance: Number(data.referral_reward_balance ?? 0),
    referred_by: data.referred_by ? String(data.referred_by) : null,
    author_status: data.author_status || 'none',
    author_earnings: Number(data.author_earnings ?? 0),
    created_at: data.created_at || new Date().toISOString()
  };
}

export function useTelegramAuth() {
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [entryMode, setEntryMode] = useState<EntryMode>('browser');

  const clearTelegramSession = () => {
    setTelegramUser(null);
    setProfile(null);
    try {
      localStorage.setItem('tg_logged_out', '1');
      sessionStorage.setItem('tg_logged_out', '1');
      localStorage.removeItem('user_session');
      localStorage.removeItem('user_email_session');
      localStorage.removeItem('user_data');
      localStorage.removeItem('telegram_user');
      localStorage.removeItem('tg_user');
      localStorage.removeItem('qaiz_user_uid');
      localStorage.removeItem('qaiz_active_user_id');
      localStorage.removeItem('user_id');
      sessionStorage.removeItem('user_session');
      sessionStorage.removeItem('user_data');
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('tgWebAppData');
        url.searchParams.delete('tgWebAppStartParam');
        url.searchParams.delete('tgAuthResult');
        if (url.hash && url.hash.includes('tgWebAppData')) {
          url.hash = '';
        }
        window.history.replaceState({}, '', url.toString());
      }
    } catch (_) {}
  };

  const refetchProfile = async (targetUid?: string | number) => {
    const lookupUid = targetUid ? String(targetUid) : profile?.uid;
    if (!lookupUid) return;

    try {
      const res = await fetch(`/api/users/by-uid/${encodeURIComponent(lookupUid)}`);
      if (res.ok) {
        const json = await safeParseResponseJson(res);
        if (json?.data) {
          const norm = normalizeProfile(json.data);
          setProfile(norm);
          localStorage.setItem('user_session', JSON.stringify(norm));
          localStorage.setItem('user_data', JSON.stringify(norm));
          localStorage.setItem('qaiz_user_uid', String(norm.uid));
          localStorage.setItem('qaiz_active_user_id', String(norm.uid));
          localStorage.setItem('user_id', String(norm.uid));
        }
      }
    } catch (err) {
      console.warn('Error refetching profile:', err);
    }
  };

  useEffect(() => {
    // Capture referral UID from https://t.me/qaiz_aibot/app?startapp=UID or query params and persist in localStorage
    try {
      const params = new URLSearchParams(window.location.search);
      const hashStr = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hashStr);
      const tg = (window as any).Telegram?.WebApp;
      const rawRef =
        params.get('startapp') ||
        params.get('tgWebAppStartParam') ||
        hashParams.get('tgWebAppStartParam') ||
        tg?.initDataUnsafe?.start_param ||
        params.get('ref') ||
        params.get('start') ||
        '';

      if (rawRef && !String(rawRef).startsWith('link_')) {
        const cleanedRef = String(rawRef)
          .replace(/^.*startapp=/i, '')
          .replace(/^.*ref=/i, '')
          .replace(/^ref_/i, '')
          .trim();
        if (/^\d{11}$/.test(cleanedRef)) {
          localStorage.setItem('referral_uid', cleanedRef);
          if (
            params.get('startapp') ||
            params.get('tgWebAppStartParam') ||
            hashParams.get('tgWebAppStartParam') ||
            tg?.initDataUnsafe?.start_param
          ) {
            localStorage.setItem('utm_source', 'https://t.me/qaiz_aibot');
          }
        }
      }
    } catch (_) {}

    const init = async () => {
      const mode = detectEntryMode();
      setEntryMode(mode);

      const urlParams = new URLSearchParams(window.location.search);
      const tg = (window as any).Telegram?.WebApp;
      const rawStartParam =
        tg?.initDataUnsafe?.start_param ||
        urlParams.get('startapp') ||
        urlParams.get('tgWebAppStartParam') ||
        urlParams.get('start') ||
        undefined;
      const isExplicitLinkAction = Boolean(rawStartParam && String(rawStartParam).startsWith('link_'));
      const isTgLoggedOut =
        localStorage.getItem('tg_logged_out') === '1' ||
        sessionStorage.getItem('tg_logged_out') === '1';

      // 1. Telegram Mini App Mode (skip auto-login if user explicitly logged out, unless explicitly linking account)
      if (mode === 'telegram' && (!isTgLoggedOut || isExplicitLinkAction)) {
        try { tg?.ready?.(); tg?.expand?.(); } catch (_) {}

        let initData = tg?.initData || '';
        let unsafeUser = tg?.initDataUnsafe?.user || null;

        // Fallback: parse tgWebAppData from hash or search if WebApp SDK hasn't hydrated yet
        if (!initData && !unsafeUser) {
          try {
            const hashStr = window.location.hash.startsWith('#')
              ? window.location.hash.slice(1)
              : window.location.hash;
            const hashParams = new URLSearchParams(hashStr);
            const rawWebAppData =
              hashParams.get('tgWebAppData') ||
              new URLSearchParams(window.location.search).get('tgWebAppData');
            if (rawWebAppData) {
              initData = rawWebAppData;
              const innerParams = new URLSearchParams(rawWebAppData);
              const userJson = innerParams.get('user');
              if (userJson) {
                unsafeUser = JSON.parse(userJson);
              }
            }
          } catch (_) {}
        }

        const startParam = rawStartParam || localStorage.getItem('referral_uid') || undefined;

        if (initData || unsafeUser?.id) {
          try {
            const res = await fetch('/api/auth/telegram', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                initData,
                unsafeUser,
                startParam,
              })
            });

            if (res.ok) {
              const json = await safeParseResponseJson(res);
              if (json?.data) {
                localStorage.removeItem('tg_logged_out');
                sessionStorage.removeItem('tg_logged_out');
                const norm = normalizeProfile(json.data);
                setProfile(norm);
                if (unsafeUser) {
                  setTelegramUser(unsafeUser);
                }
                localStorage.setItem('user_session', JSON.stringify(norm));
                localStorage.setItem('user_data', JSON.stringify(norm));
                setIsLoading(false);
                return;
              }
            }
          } catch (err) {
            console.error('[TelegramAuth] Server validation failed:', err);
          }
        }

        // Fallback if server request failed offline
        if (unsafeUser) {
          setTelegramUser(unsafeUser);
          const { data: dbUser } = await db
            .from('users')
            .select('*')
            .eq('telegram_id', String(unsafeUser.id))
            .maybeSingle();

          if (dbUser) {
            const norm = normalizeProfile(dbUser);
            setProfile(norm);
            localStorage.setItem('user_session', JSON.stringify(norm));
            localStorage.setItem('user_data', JSON.stringify(norm));
            setIsLoading(false);
            return;
          }
        }
      }

      // 2. Browser / Preview Session check (normal session management)
      const storedSession = localStorage.getItem('user_session') || localStorage.getItem('user_email_session');
      if (storedSession) {
        let parsed: any = null;
        try {
          parsed = JSON.parse(storedSession);
        } catch (e) {
          console.warn('[BrowserAuth] Corrupted local session cleared:', e);
          localStorage.removeItem('user_session');
          localStorage.removeItem('user_email_session');
          localStorage.removeItem('user_data');
        }

        const uid = parsed?.uid || parsed?.id;
        if (uid) {
          try {
            const res = await fetch(`/api/users/by-uid/${encodeURIComponent(String(uid))}`);
            if (res.ok) {
              const json = await safeParseResponseJson(res);
              if (json?.data) {
                const norm = normalizeProfile(json.data);
                setProfile(norm);
                localStorage.setItem('user_session', JSON.stringify(norm));
                localStorage.setItem('user_data', JSON.stringify(norm));
                setIsLoading(false);
                return;
              }
            }
          } catch (_) {
            // Network/502 error — keep cached local session cleanly
          }
          const normFallback = normalizeProfile(parsed);
          setProfile(normFallback);
          localStorage.setItem('user_session', JSON.stringify(normFallback));
          localStorage.setItem('user_data', JSON.stringify(normFallback));
          setIsLoading(false);
          return;
        }
      }

      // Not logged in — ensure stale user_data is also removed
      localStorage.removeItem('user_data');
      setTelegramUser(null);
      setProfile(null);
      setIsLoading(false);
    };

    init();
  }, []);

  return {
    telegramUser,
    profile,
    setProfile,
    isLoading,
    entryMode,
    refetchProfile,
    clearTelegramSession,
  };
}
