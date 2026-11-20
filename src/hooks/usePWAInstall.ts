import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(evt: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((cb) => cb(globalDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    promptListeners.forEach((cb) => cb(null));
  });
}

export function detectIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  );
}

export function detectPlatformFlags() {
  if (typeof window === 'undefined') {
    return { isIOS: false, isAndroid: false, isSafari: false, isTelegramMiniApp: false };
  }
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const isTelegramMiniApp = Boolean((window as any).Telegram?.WebApp?.initData);
  return { isIOS, isAndroid, isSafari, isTelegramMiniApp };
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    globalDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(detectIsStandalone);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);
  const [installing, setInstalling] = useState<boolean>(false);

  const platform = detectPlatformFlags();

  useEffect(() => {
    const syncInstalled = () => setIsInstalled(detectIsStandalone());
    syncInstalled();

    const mql = window.matchMedia('(display-mode: standalone)');
    const onMqlChange = () => syncInstalled();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onMqlChange);
    }

    const onPromptChange = (evt: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(evt);
      syncInstalled();
    };
    promptListeners.add(onPromptChange);

    const onAppInstalled = () => {
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
      setShowInstallGuide(false);
    };
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      promptListeners.delete(onPromptChange);
      window.removeEventListener('appinstalled', onAppInstalled);
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', onMqlChange);
      }
    };
  }, []);

  const triggerInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'guide'> => {
    const activePrompt = deferredPrompt || globalDeferredPrompt;
    if (activePrompt) {
      setInstalling(true);
      try {
        await activePrompt.prompt();
        const choice = await activePrompt.userChoice;
        if (choice.outcome === 'accepted') {
          globalDeferredPrompt = null;
          setDeferredPrompt(null);
          setIsInstalled(true);
        }
        return choice.outcome;
      } catch {
        setShowInstallGuide(true);
        return 'guide';
      } finally {
        setInstalling(false);
      }
    }

    setShowInstallGuide(true);
    return 'guide';
  }, [deferredPrompt]);

  return {
    canNativeInstall: Boolean(deferredPrompt || globalDeferredPrompt),
    isInstalled,
    installing,
    showInstallGuide,
    setShowInstallGuide,
    triggerInstall,
    ...platform,
  };
}
