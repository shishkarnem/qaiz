export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getNotificationPermissionState(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as PushPermissionState;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getActiveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  let existing = await navigator.serviceWorker.getRegistration();
  if (!existing) {
    existing = await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }

  const readyReg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration | null>((resolve) =>
      setTimeout(() => resolve(existing || null), 5000)
    ),
  ]);

  return readyReg || existing || null;
}

export interface DevicePushStatus {
  supported: boolean;
  permission: PushPermissionState;
  hasLocalSubscription: boolean;
  serverSubscribedCount: number;
  endpoint?: string;
}

export async function getDevicePushStatus(userId?: string): Promise<DevicePushStatus> {
  const supported = isWebPushSupported();
  const permission = getNotificationPermissionState();

  let hasLocalSubscription = false;
  let endpoint: string | undefined;

  if (supported) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        hasLocalSubscription = true;
        endpoint = sub.endpoint;
      }
    } catch (_) {}
  }

  let serverSubscribedCount = 0;
  if (userId && userId !== 'usr_guest' && !userId.startsWith('demo_')) {
    try {
      const res = await fetch(`/api/notifications/push/status?user_id=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          const data = JSON.parse(text);
          serverSubscribedCount = Number(data?.subscribedCount || 0);
        }
      }
    } catch (_) {}
  }

  return {
    supported,
    permission,
    hasLocalSubscription,
    serverSubscribedCount,
    endpoint,
  };
}

function detectPlatformLabel(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios-pwa';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'macos';
  return 'web';
}

export async function subscribeDeviceToPush(userId: string): Promise<{
  ok: boolean;
  error?: string;
  subscribedCount?: number;
}> {
  if (!userId || userId === 'usr_guest' || userId.startsWith('demo_')) {
    return { ok: false, error: 'Сначала авторизуйтесь в аккаунте Квайз.' };
  }

  if (!isWebPushSupported()) {
    return {
      ok: false,
      error: 'Браузер не поддерживает Web Push. На iPhone установите приложение через «Поделиться» → «На экран «Домой»».',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      error:
        permission === 'denied'
          ? 'Уведомления заблокированы в настройках браузера. Разрешите их в настройках сайта.'
          : 'Разрешение на уведомления не выдано.',
    };
  }

  const reg = await getActiveServiceWorkerRegistration();
  if (!reg) {
    return { ok: false, error: 'Не удалось активировать фоновую службу приложения.' };
  }

  const vapidRes = await fetch('/api/notifications/push/vapid-public-key');
  const vapidData = await vapidRes.json().catch(() => ({}));
  if (!vapidRes.ok || !vapidData?.publicKey) {
    return { ok: false, error: vapidData?.error || 'Не удалось получить ключ подписки сервера.' };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(String(vapidData.publicKey)),
    });
  }

  const saveRes = await fetch('/api/notifications/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      subscription: sub.toJSON(),
      platform: detectPlatformLabel(),
    }),
  });
  const saveData = await saveRes.json().catch(() => ({}));
  if (!saveRes.ok || !saveData?.success) {
    return { ok: false, error: saveData?.error || 'Ошибка сохранения подписки на сервере.' };
  }

  return {
    ok: true,
    subscribedCount: Number(saveData.subscribedCount || 1),
  };
}

export async function unsubscribeDeviceFromPush(userId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    const endpoint = sub?.endpoint;

    if (sub) {
      await sub.unsubscribe().catch(() => {});
    }

    if (endpoint && userId) {
      await fetch('/api/notifications/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, endpoint }),
      });
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Ошибка отключения подписки' };
  }
}

export async function sendTestDevicePush(userId: string): Promise<{
  ok: boolean;
  sent?: number;
  error?: string;
}> {
  try {
    const res = await fetch('/api/notifications/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { ok: false, error: data?.error || 'Не удалось отправить тестовый пуш' };
    }
    return { ok: true, sent: Number(data.sent || 0) };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Ошибка сети при проверке пуш-уведомления' };
  }
}
