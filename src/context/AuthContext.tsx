import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTelegramAuth, TelegramUser, UserProfile, EntryMode } from '../hooks/useTelegramAuth';
import { db } from '../db';
import { AuthModal } from '../components/AuthModal';
import { DemoExhaustedModal } from '../components/DemoExhaustedModal';
import { audioSystem } from '../hooks/useSound';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';

interface AuthContextType {
  user: TelegramUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  entryMode: EntryMode;
  demoBalance: number;
  demoUid: string;
  effectiveUid: string;
  effectiveBalance: number;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  updateBalance: (newBalance: number) => Promise<void>;
  spendBalance: (amount: number, description?: string, referenceId?: string, questionId?: string) => Promise<boolean>;
  purchaseGames: (gameIds: string[], totalPrice: number) => Promise<void>;
  markGameAsPlayed: (gameId: string) => Promise<void>;
  logout: () => void;
  refetchProfile: (targetUid?: string | number) => Promise<void>;
  resetDemoBalance: () => void;
  openAuthModal: (mode?: 'login' | 'register', showReferralRules?: boolean) => void;
  closeAuthModal: () => void;
  openDemoExhaustedModal: () => void;
  closeDemoExhaustedModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { telegramUser, profile, setProfile, isLoading, entryMode, refetchProfile, clearTelegramSession } = useTelegramAuth();

  // 11-digit local UID for guest / demo users
  const [demoUid] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('guest_demo_uid');
      if (stored && /^\d{11}$/.test(stored)) {
        return stored;
      }
      const generated = String(Math.floor(10000000000 + Math.random() * 90000000000));
      localStorage.setItem('guest_demo_uid', generated);
      return generated;
    } catch (_) {
      return '10000000001';
    }
  });

  // Demo balance for unregistered users (default 100 IIKR)
  const [demoBalance, setDemoBalance] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('guest_demo_balance');
      if (stored !== null) {
        const val = Number(stored);
        if (!isNaN(val) && val > 0) return val;
      }
      localStorage.setItem('guest_demo_balance', '100');
    } catch (_) {}
    return 100;
  });

  // Modal states
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [initialResetToken, setInitialResetToken] = useState<string | null>(null);
  const [showReferralRulesInAuthModal, setShowReferralRulesInAuthModal] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [unsubscribeMessage, setUnsubscribeMessage] = useState<string | null>(null);

  // Detect password reset link (?reset_token=...) or email unsubscribe link (?unsubscribe_email=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const rToken = params.get('reset_token');
      const unsubToken = params.get('unsubscribe_email');

      if (rToken) {
        setInitialResetToken(rToken);
        setAuthModalMode('forgot');
        setIsAuthModalOpen(true);
      }

      if (unsubToken) {
        fetch(`/api/auth/unsubscribe-email?token=${encodeURIComponent(unsubToken)}`)
          .then((r) => r.json())
          .then((data) => {
            setUnsubscribeMessage(
              data.message || 'Вы успешно отписались от еженедельных email-напоминаний Квайз.'
            );
            const url = new URL(window.location.href);
            url.searchParams.delete('unsubscribe_email');
            window.history.replaceState({}, '', url.toString());
          })
          .catch(() => {
            setUnsubscribeMessage('Настройки почтовых уведомлений обновлены.');
          });
      }
    } catch (_) {}
  }, []);

  // Synchronize active user ID and keep demo balance preserved
  useEffect(() => {
    if (profile?.uid) {
      const canonicalUid = String(profile.uid);
      localStorage.setItem('qaiz_active_user_id', canonicalUid);
      localStorage.setItem('qaiz_user_uid', canonicalUid);
      localStorage.setItem('user_id', canonicalUid);

      // Periodic heartbeat to maintain online presence
      const ping = () => {
        fetch('/api/users/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: canonicalUid })
        }).catch(() => {});
      };

      ping();
      const interval = setInterval(ping, 60000);
      return () => clearInterval(interval);
    } else if (!isLoading && demoUid) {
      localStorage.removeItem('qaiz_user_uid');
      localStorage.setItem('qaiz_active_user_id', demoUid);
      localStorage.setItem('user_id', demoUid);
    }
  }, [profile?.uid, demoUid, isLoading]);

  const resetDemoBalance = () => {
    setDemoBalance(0);
    try {
      localStorage.setItem('guest_demo_balance', '0');
    } catch (_) {}
  };

  const openAuthModal = (mode: 'login' | 'register' = 'login', showRules: boolean = false) => {
    setAuthModalMode(mode);
    setShowReferralRulesInAuthModal(showRules);
    setIsAuthModalOpen(true);
    audioSystem.playSlot('ui_auth_required_modal');
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    audioSystem.playSlot('ui_modal_close');
  };

  const openDemoExhaustedModal = () => {
    setIsDemoModalOpen(true);
    audioSystem.playSlot('ui_auth_required_modal');
  };

  const closeDemoExhaustedModal = () => {
    setIsDemoModalOpen(false);
    audioSystem.playSlot('ui_modal_close');
  };

  const effectiveBalance = profile ? (profile.balance ?? 0) : demoBalance;
  const effectiveUid = profile?.uid || demoUid;

  const updateBalance = async (newBalance: number) => {
    const prevBal = profile ? (profile.balance ?? 0) : demoBalance;
    if (newBalance > prevBal) {
      audioSystem.playSlot('ui_iikr_receive');
    } else if (newBalance < prevBal) {
      audioSystem.playSlot('ui_iikr_spend');
    }

    if (!profile) {
      const clamped = Math.max(0, newBalance);
      setDemoBalance(clamped);
      localStorage.setItem('guest_demo_balance', String(clamped));
      return;
    }

    const { error } = await db
      .from('users')
      .update({ balance: newBalance })
      .eq('uid', profile.uid);

    if (error) {
      console.error('Error updating balance:', error);
    } else {
      setProfile((prev) => prev ? { ...prev, balance: newBalance } : null);
    }
  };

  const spendBalance = async (amount: number, description?: string, referenceId?: string, questionId?: string): Promise<boolean> => {
    const cost = Math.abs(amount);

    // Authenticated user
    if (profile) {
      if (profile.balance < cost) {
        audioSystem.playSlot('ui_insufficient_balance');
        return false;
      }
      const newBal = profile.balance - cost;
      audioSystem.playSlot('ui_iikr_spend');
      await db
        .from('users')
        .update({ balance: newBal })
        .eq('uid', profile.uid);

      await db.from('transactions').insert({
        id: `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        user_id: profile.uid,
        amount: -cost,
        currency: 'ИИкр',
        type: 'spend_game',
        description: description || 'КвИИз, проверка ответа на вопрос',
        reference_id: referenceId || 'game',
        question_id: questionId || null,
        timestamp: Date.now()
      });

      setProfile((prev) => prev ? { ...prev, balance: newBal } : null);
      return true;
    }

    // Guest / Demo user
    if (demoBalance < cost || demoBalance <= 0) {
      openDemoExhaustedModal();
      return false;
    }

    const newDemoBal = Math.max(0, demoBalance - cost);
    setDemoBalance(newDemoBal);
    localStorage.setItem('guest_demo_balance', String(newDemoBal));

    if (newDemoBal <= 0) {
      openDemoExhaustedModal();
    }

    return true;
  };

  const purchaseGames = async (gameIds: string[], totalPrice: number) => {
    if (!profile) return;
    const newBalance = profile.balance - totalPrice;

    await db
      .from('users')
      .update({ balance: newBalance })
      .eq('uid', profile.uid);

    await db.from('transactions').insert({
      id: `tx_${Date.now()}`,
      user_id: profile.uid,
      amount: -Math.abs(totalPrice),
      currency: 'IIKR',
      type: 'purchase',
      description: `Покупка игр (${gameIds.join(', ')})`,
      timestamp: Date.now()
    });

    setProfile((prev) => prev ? { ...prev, balance: newBalance } : null);
  };

  const markGameAsPlayed = async (_gameId: string) => {
    // Game session tracked via /api/game_sessions
  };

  const logout = () => {
    if (typeof window !== 'undefined') {
      (window as any).__qaiz_is_logging_out = true;
    }
    clearTelegramSession();
    localStorage.removeItem('user_session');
    localStorage.removeItem('user_email_session');
    localStorage.removeItem('user_data');
    let savedDemoBal = 100;
    try {
      const stored = localStorage.getItem('guest_demo_balance');
      if (stored !== null) {
        const val = Number(stored);
        if (!isNaN(val)) savedDemoBal = val;
      }
    } catch (_) {}
    setDemoBalance(savedDemoBal);
    if (demoUid) {
      localStorage.setItem('qaiz_active_user_id', demoUid);
    }
    window.location.href = '/';
  };

  const canonicalUser = profile
    ? {
        ...(telegramUser || {}),
        id: String(profile.uid),
        uid: String(profile.uid),
        telegram_id: telegramUser?.id
      }
    : telegramUser
    ? {
        ...telegramUser,
        id: String(effectiveUid || telegramUser.id),
        uid: String(effectiveUid || telegramUser.id),
        telegram_id: telegramUser.id
      }
    : null;

  return (
    <AuthContext.Provider value={{
      user: canonicalUser as any,
      profile,
      setProfile,
      loading: isLoading,
      isAuthReady: !isLoading,
      entryMode,
      demoBalance,
      demoUid,
      effectiveUid,
      effectiveBalance,
      updateBalance,
      spendBalance,
      purchaseGames,
      markGameAsPlayed,
      logout,
      refetchProfile,
      resetDemoBalance,
      openAuthModal,
      closeAuthModal,
      openDemoExhaustedModal,
      closeDemoExhaustedModal
    }}>
      {children}

      {/* Global Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setInitialResetToken(null);
          closeAuthModal();
        }}
        initialMode={authModalMode}
        showReferralRules={showReferralRulesInAuthModal}
        initialResetToken={initialResetToken}
      />

      {/* Global Email Unsubscribe Confirmation Modal */}
      {unsubscribeMessage && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-transparent backdrop-blur-2xl">
          <div className="w-full max-w-md rounded-3xl border border-primary/35 bg-transparent backdrop-blur-2xl p-6 text-center space-y-4 shadow-2xl">
            <img
              src={DIRECT_MEDIA_URLS.MINI_LOGO}
              alt="Квайз"
              className="mx-auto h-14 w-14 object-contain"
            />
            <h3 className="text-lg font-bold text-primary">Управление рассылкой Квайз</h3>
            <p className="text-sm text-foreground/90 leading-relaxed">{unsubscribeMessage}</p>
            <button
              type="button"
              onClick={() => setUnsubscribeMessage(null)}
              className="w-full py-2.5 px-6 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-xl text-sm font-bold text-primary hover:border-primary transition-all cursor-pointer"
            >
              Понятно
            </button>
          </div>
        </div>
      )}

      {/* Global Demo Exhausted Modal */}
      <DemoExhaustedModal
        isOpen={isDemoModalOpen}
        onClose={closeDemoExhaustedModal}
        onOpenRegister={() => openAuthModal('register', true)}
        onOpenLogin={() => openAuthModal('login', false)}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

