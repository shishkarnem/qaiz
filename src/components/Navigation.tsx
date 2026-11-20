import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, 
  Gamepad2, 
  Users, 
  User, 
  Newspaper, 
  LogIn,
  Sun,
  Moon,
  LogOut,
  ShoppingCart,
  ShoppingBag,
  Wallet,
  History,
  Radio,
  Menu,
  X,
  Trophy,
  Bell,
  Volume2,
  Volume1,
  VolumeX,
  CreditCard,
  Sparkles,
  Lock,
  Play
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../db';
import { useUserVolume, useFrogSound, audioSystem } from '../hooks/useSound';
import { calculateTopUpPriceRub, TOP_UP_DISCOUNT_TIERS, TOP_UP_PRESET_PACKS } from '../utils/pricing';
import { formatIikr, getIikrWord } from '../lib/currency';

import { useAuth } from '../context/AuthContext';
import { UserAvatar } from './UserAvatar';
import { AuthModal } from './AuthModal';
import { BubbleCurrencyIcon } from './BubbleIcon';
import { NotificationsCenterModal } from './NotificationsCenterModal';
import { BubbleElement } from './ui/BubbleElement';
import { LeafButton } from './ui/LeafButton';
import { BrandLogo } from './BrandLogo';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BubbleIconButtonProps {
  onClick?: () => void;
  to?: string;
  active?: boolean;
  title?: string;
  badge?: React.ReactNode;
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function BubbleIconButton({
  onClick,
  to,
  active = false,
  title,
  badge,
  size = 'md',
  children,
  className = '',
  id
}: BubbleIconButtonProps) {
  const sizeClasses = size === 'sm' ? 'w-9 h-9' : 'w-10 h-10';

  const containerClasses = cn(
    "relative flex items-center justify-center rounded-full transition-all duration-300 select-none",
    sizeClasses,
    "bg-[radial-gradient(circle_at_35%_35%,rgba(153,208,55,0.75),rgba(20,40,10,0.85)_60%,rgba(5,15,2,0.95)_100%)]",
    "shadow-[inset_2px_2px_4px_rgba(255,255,255,0.35)]",
    active
      ? "border-2 border-[#99d037] shadow-[0_0_20px_rgba(153,208,55,0.85),inset_2px_2px_5px_rgba(255,255,255,0.6)] scale-105 bg-[radial-gradient(circle_at_35%_35%,rgba(200,250,80,0.95),rgba(40,75,15,0.95)_60%,rgba(8,20,4,0.98)_100%)]"
      : "border border-[#99d037]/60 shadow-[0_0_10px_rgba(153,208,55,0.3)] opacity-90 hover:opacity-100 hover:scale-105 hover:border-[#99d037] hover:shadow-[0_0_16px_rgba(153,208,55,0.5),inset_2px_2px_5px_rgba(255,255,255,0.5)] active:scale-95",
    className
  );

  const innerContent = (
    <>
      <div className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] flex items-center justify-center w-full h-full">
        {children}
      </div>
      {badge}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        onClick={() => {
          audioSystem.playSlot('ui_btn_bubble_click');
          onClick?.();
        }}
        onMouseEnter={() => audioSystem.playSlot('ui_btn_hover')}
        className={containerClasses}
        title={title}
        id={id}
      >
        {innerContent}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        audioSystem.playSlot('ui_btn_bubble_click');
        onClick?.();
      }}
      onMouseEnter={() => audioSystem.playSlot('ui_btn_hover')}
      className={containerClasses}
      title={title}
      id={id}
    >
      {innerContent}
    </button>
  );
}

function HeaderVolumeControl({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { volume, muted, effectiveVolume, setVolume, toggleMute } = useUserVolume();
  const { playCroak } = useFrogSound();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const iconSize = size === 'sm' ? 16 : 19;
  const pct = Math.round(effectiveVolume * 100);

  return (
    <div ref={containerRef} className="relative">
      <BubbleIconButton
        size={size}
        active={open}
        onClick={() => setOpen(prev => !prev)}
        title={`Громкость звуков: ${pct}%`}
      >
        {muted || effectiveVolume === 0 ? (
          <VolumeX size={iconSize} className="text-rose-400" />
        ) : effectiveVolume < 0.5 ? (
          <Volume1 size={iconSize} />
        ) : (
          <Volume2 size={iconSize} />
        )}
      </BubbleIconButton>

      {open && (
        <div
          className="fixed inset-0 z-[140] flex items-start justify-center pt-16 md:pt-20 px-4 bg-transparent backdrop-blur-xl"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xs sm:max-w-sm mx-auto rounded-3xl border border-primary/40 bg-transparent backdrop-blur-2xl p-4 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_25px_rgba(153,208,55,0.22)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-foreground">Громкость звуков</span>
              <div className="flex items-center gap-1.5">
                <BubbleElement size="sm" isBadge active={pct > 0} className="px-2.5 py-0.5 text-sm font-black">
                  {pct}%
                </BubbleElement>
                <BubbleElement
                  size="sm"
                  onClick={() => setOpen(false)}
                  icon={<X size={15} />}
                  className="p-1.5"
                  title="Закрыть"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <BubbleElement
                size="sm"
                active={!muted && effectiveVolume > 0}
                onClick={() => {
                  toggleMute();
                  audioSystem.playSlot('ui_toggle_switch');
                }}
                title={muted || effectiveVolume === 0 ? 'Включить звук' : 'Выключить звук'}
                className="p-2 shrink-0"
              >
                {muted || effectiveVolume === 0 ? (
                  <VolumeX size={16} className="text-rose-400" />
                ) : (
                  <Volume2 size={16} />
                )}
              </BubbleElement>

              <div className="relative flex-1 flex items-center h-6 select-none">
                {/* Centered custom track */}
                <div className="w-full h-1.5 rounded-full bg-primary/25 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary shadow-[0_0_8px_rgba(153,208,55,0.7)] transition-all duration-75"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {/* Centered bubble thumb on the track */}
                <div
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[18px] h-[18px] rounded-full border-2 border-white bg-[radial-gradient(circle_at_35%_35%,#d4ff70_0%,#99d037_55%,#284b0f_100%)] shadow-[0_0_10px_rgba(153,208,55,0.9),inset_1px_1px_3px_rgba(255,255,255,0.6)] transition-all duration-75"
                  style={{ left: `calc(${pct}% + (${9 - pct * 0.18}px))` }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={pct}
                  onChange={(e) => {
                    const val = Number(e.target.value) / 100;
                    setVolume(val);
                  }}
                  onMouseUp={() => {
                    if (effectiveVolume > 0) playCroak();
                  }}
                  onTouchEnd={() => {
                    if (effectiveVolume > 0) playCroak();
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-1.5 pt-0.5">
              {[0, 25, 50, 75, 100].map((preset) => (
                <BubbleElement
                  key={preset}
                  size="sm"
                  active={Math.abs(pct - preset) <= 3 && (preset > 0 ? !muted : muted || pct === 0)}
                  onClick={() => {
                    setVolume(preset / 100);
                    if (preset > 0) setTimeout(() => playCroak(), 30);
                  }}
                  className="px-2 py-1 text-sm font-bold flex-1 justify-center"
                >
                  {preset}%
                </BubbleElement>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header({ toggleTheme, theme }: { toggleTheme: () => void, theme: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, entryMode, logout, demoBalance, demoUid, effectiveUid, openAuthModal, refetchProfile } = useAuth();
  const [displayBalance, setDisplayBalance] = useState<number>(profile?.balance ?? demoBalance);
  const [balanceFlash, setBalanceFlash] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isGuestTariffsOpen, setIsGuestTariffsOpen] = useState(false);
  const [guestTopUpAmount, setGuestTopUpAmount] = useState<number>(500);
  const [avatarImgError, setAvatarImgError] = useState(false);
  const prevBalance = useRef<number>(profile?.balance ?? demoBalance);

  const isProfileActive = location.pathname.startsWith('/profile') && location.pathname !== '/profile/exchange';
  const isCartActive = location.pathname === '/profile/exchange' || isGuestTariffsOpen;
  const activeAvatarUrl =
    profile?.avatar_source === 'telegram' && profile?.telegram_photo
      ? profile.telegram_photo
      : (profile?.avatar_url || profile?.photo_url || profile?.telegram_photo || null);

  useEffect(() => {
    setAvatarImgError(false);
  }, [activeAvatarUrl]);

  // Poll for balance and unread notifications changes and listen to balance events
  useEffect(() => {
    if (!profile?.uid) {
      setDisplayBalance(demoBalance);
      return;
    }

    const fetchUserData = async () => {
      try {
        const [userRes, notifRes] = await Promise.all([
          fetch(`/api/users/by-uid/${profile.uid}`),
          fetch(`/api/notifications/unread-count?user_id=${profile.uid}`)
        ]);

        if (userRes.ok) {
          const json = await userRes.json();
          if (json.data && json.data.balance !== undefined) {
            const newBal = Number(json.data.balance);
            setDisplayBalance(newBal);
            if (newBal !== prevBalance.current) {
              if (newBal < prevBalance.current) {
                setBalanceFlash(true);
                setTimeout(() => setBalanceFlash(false), 1000);
              }
              prevBalance.current = newBal;
              if (profile.balance !== newBal) {
                refetchProfile(profile.uid);
              }
            }
          }
        }

        if (notifRes.ok) {
          const notifJson = await notifRes.json();
          setUnreadCount(notifJson.unread_count || 0);
        }
      } catch (_) {}
    };

    fetchUserData();
    const interval = setInterval(fetchUserData, 3000);

    const handleBalanceEvent = () => {
      fetchUserData();
    };

    window.addEventListener('balance_updated', handleBalanceEvent);
    window.addEventListener('storage', handleBalanceEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener('balance_updated', handleBalanceEvent);
      window.removeEventListener('storage', handleBalanceEvent);
    };
  }, [profile?.uid]);

  // Sync when profile or demoBalance changes
  useEffect(() => {
    if (profile && profile.balance !== undefined) {
      setDisplayBalance(profile.balance);
      prevBalance.current = profile.balance;
    } else if (!profile) {
      setDisplayBalance(demoBalance);
      prevBalance.current = demoBalance;
    }
  }, [profile?.balance, demoBalance]);

  const guestCurrentAmount = Math.max(1, Number(guestTopUpAmount) || 0);
  const guestPricing = calculateTopUpPriceRub(guestCurrentAmount);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 w-full bg-transparent border-none shadow-none transition-all">
        <div className="container mx-auto px-3 md:px-4 relative z-10">
          {/* DESKTOP HEADER */}
          <div className="hidden md:flex items-center justify-between h-16 w-full relative">
            {/* LEFT: Logo + Title */}
            <Link to="/" className="flex items-center group shrink-0 z-10">
              <BrandLogo size="md" />
            </Link>

            {/* CENTER: Navigation Links (Strictly Centered Absolute Position) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-10 pointer-events-auto">
              <NavLinks theme={theme} />
            </div>

            {/* RIGHT: Balance, Sound, Bell, Cart, Profile or Login */}
            <div className="flex items-center gap-2.5 shrink-0 z-10 ml-auto">
              <HeaderVolumeControl size="md" />
              {profile ? (
                <>
                  {/* Balance Widget */}
                  <motion.div
                    animate={balanceFlash ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 0.6 }}
                  >
                    <Link to="/profile/trans" className="flex items-center gap-1.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(153,208,55,0.3),rgba(20,40,10,0.5)_60%,rgba(5,15,2,0.6)_100%)] backdrop-blur-md border border-primary/40 px-3.5 py-1.5 text-sm font-black text-primary hover:bg-primary/30 transition-all shadow-[0_0_12px_rgba(153,208,55,0.2)]" id="header-balance">
                      <span>{displayBalance}</span>
                      <BubbleCurrencyIcon className="w-4 h-4" />
                    </Link>
                  </motion.div>

                  {/* Notification Bell Bubble (Registered Users Only) */}
                  <BubbleIconButton
                    size="md"
                    onClick={() => setIsNotificationsOpen(true)}
                    title="Уведомления"
                    badge={
                      unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-primary text-background text-[11px] font-black shadow-lg animate-pulse">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )
                    }
                  >
                    <Bell size={19} />
                  </BubbleIconButton>

                  {/* Cart / Exchange Bubble */}
                  <BubbleIconButton
                    size="md"
                    to="/profile/exchange"
                    active={isCartActive}
                    title="Пополнение баланса"
                  >
                    <ShoppingCart size={19} />
                  </BubbleIconButton>

                  {/* Profile Bubble */}
                  <BubbleIconButton
                    size="md"
                    to="/profile"
                    active={isProfileActive}
                    title="Профиль"
                    className="overflow-hidden p-0.5"
                  >
                    {activeAvatarUrl && !avatarImgError ? (
                      <img 
                        src={activeAvatarUrl} 
                        alt={profile.display_name || 'Профиль'} 
                        className="w-full h-full object-cover rounded-full"
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarImgError(true)}
                      />
                    ) : (
                      <User size={19} />
                    )}
                  </BubbleIconButton>

                  {/* Logout button (browser mode) */}
                  {entryMode === 'browser' && (
                    <BubbleIconButton
                      size="md"
                      onClick={logout}
                      title="Выйти из аккаунта"
                      className="border-destructive/40 bg-[radial-gradient(circle_at_35%_35%,rgba(239,68,68,0.4),rgba(30,10,10,0.85)_60%,rgba(15,2,2,0.95)_100%)] shadow-[0_0_10px_rgba(239,68,68,0.3)] hover:border-destructive hover:shadow-[0_0_16px_rgba(239,68,68,0.6)]"
                    >
                      <LogOut size={18} />
                    </BubbleIconButton>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2.5">
                  {/* Guest Demo Balance & Demo UID Button */}
                  <button
                    onClick={() => openAuthModal('login')}
                    className="flex items-center gap-1.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(153,208,55,0.3),rgba(20,40,10,0.5)_60%,rgba(5,15,2,0.6)_100%)] backdrop-blur-md border border-primary/40 px-3.5 py-1.5 text-sm font-black text-primary hover:bg-primary/25 transition-all shadow-[0_0_12px_rgba(153,208,55,0.15)]"
                    title={`Демо ID: ${demoUid} · Ознакомительный баланс 100 ИИкр`}
                  >
                    <span className="text-sm font-normal opacity-85">Демо:</span>
                    <span>{demoBalance}</span>
                    <BubbleCurrencyIcon className="w-4 h-4" />
                  </button>

                  {/* Cart / Tariffs Calculator Modal Bubble for Unregistered Users */}
                  <BubbleIconButton
                    size="md"
                    onClick={() => setIsGuestTariffsOpen(true)}
                    active={isGuestTariffsOpen}
                    title="Тарифы и скидки ИИкры"
                  >
                    <ShoppingCart size={19} />
                  </BubbleIconButton>

                  <BubbleElement
                    active
                    icon={<LogIn size={18} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />}
                    size="md"
                    onClick={() => openAuthModal('login')}
                    className="cursor-pointer hover:scale-105 active:scale-95 transition-all text-sm font-bold px-5 py-2 shadow-[0_0_18px_rgba(153,208,55,0.7)]"
                  >
                    Войти
                  </BubbleElement>
                </div>
              )}
            </div>
          </div>

          {/* MOBILE HEADER */}
          <div className="flex md:hidden items-center justify-between h-14 w-full">
            {/* LEFT: Balance or Demo */}
            <div className="flex items-center justify-start min-w-[70px]">
              {profile ? (
                <motion.div
                  animate={balanceFlash ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.6 }}
                >
                  <Link to="/profile/trans" className="flex items-center gap-1 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(153,208,55,0.3),rgba(20,40,10,0.5)_60%,rgba(5,15,2,0.6)_100%)] backdrop-blur-md border border-primary/40 px-3 py-1 text-sm font-black text-primary hover:bg-primary/30 transition-all shadow-sm" id="header-balance-mobile">
                    <span>{displayBalance}</span>
                    <BubbleCurrencyIcon className="w-3.5 h-3.5" />
                  </Link>
                </motion.div>
              ) : (
                <button
                  onClick={() => openAuthModal('login')}
                  title={`Демо ID: ${demoUid}`}
                  className="flex items-center gap-1 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(153,208,55,0.3),rgba(20,40,10,0.5)_60%,rgba(5,15,2,0.6)_100%)] backdrop-blur-md border border-primary/40 px-2.5 py-1 text-sm font-black text-primary hover:bg-primary/25 transition-all shadow-sm"
                >
                  <span className="opacity-80 text-sm">Демо:</span>
                  <span>{demoBalance}</span>
                  <BubbleCurrencyIcon className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* CENTER: Title */}
            <div className="flex items-center justify-center">
              <Link to="/" className="flex items-center group">
                <BrandLogo size="sm" />
              </Link>
            </div>

            {/* RIGHT: Sound + (Bell only if registered) + Cart + Profile or Login */}
            <div className="flex items-center justify-end gap-2 min-w-[70px]">
              <HeaderVolumeControl size="sm" />

              {profile && (
                <BubbleIconButton
                  size="sm"
                  onClick={() => setIsNotificationsOpen(true)}
                  title="Уведомления"
                  badge={
                    unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex min-w-[15px] h-[15px] px-0.5 items-center justify-center rounded-full bg-primary text-background text-[10px] font-black shadow-lg animate-pulse">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )
                  }
                >
                  <Bell size={16} />
                </BubbleIconButton>
              )}

              <BubbleIconButton
                size="sm"
                to={profile ? "/profile/exchange" : undefined}
                onClick={!profile ? () => setIsGuestTariffsOpen(true) : undefined}
                active={isCartActive}
                title={profile ? "Пополнение баланса" : "Тарифы и скидки ИИкры"}
              >
                <ShoppingCart size={16} />
              </BubbleIconButton>

              {profile ? (
                <BubbleIconButton
                  size="sm"
                  to="/profile"
                  active={isProfileActive}
                  title="Профиль"
                  className="overflow-hidden p-0.5"
                >
                  {activeAvatarUrl && !avatarImgError ? (
                    <img 
                      src={activeAvatarUrl} 
                      alt={profile.display_name || 'Профиль'} 
                      className="w-full h-full object-cover rounded-full"
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarImgError(true)}
                    />
                  ) : (
                    <User size={16} />
                  )}
                </BubbleIconButton>
              ) : (
                <BubbleIconButton
                  size="sm"
                  onClick={() => openAuthModal('login')}
                  title="Войти"
                >
                  <LogIn size={15} />
                </BubbleIconButton>
              )}
            </div>
          </div>
        </div>

        {/* Glowing Apple Liquid Glass bottom border - Desktop Only */}
        <div className="hidden md:block absolute inset-0 rounded-b-3xl border-b-[1.5px] border-x-[1.5px] border-[#99d037]/80 pointer-events-none shadow-[0_4px_16px_rgba(153,208,55,0.35)]" />
      </header>

      {/* Global Notifications Modal (Registered Users Only) */}
      {profile && effectiveUid && (
        <NotificationsCenterModal
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          userId={effectiveUid}
          onUnreadCountChange={(c) => setUnreadCount(c)}
        />
      )}

      {/* Full-Screen Scrollable Tariffs & Discounts Calculator Modal for Unregistered Users */}
      {!profile && isGuestTariffsOpen && (
        <div
          className="fixed inset-0 z-[150] overflow-y-auto overflow-x-hidden bg-transparent backdrop-blur-2xl animate-fade-in"
          onClick={() => setIsGuestTariffsOpen(false)}
        >
          <div className="min-h-screen w-full px-[2%] sm:px-[6%] py-4 sm:py-8 flex flex-col items-center justify-start">
            <div
              className="w-full max-w-5xl rounded-3xl border border-primary/35 bg-transparent backdrop-blur-2xl p-4 sm:p-7 space-y-6 shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_30px_rgba(153,208,55,0.2)] text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Bar: Title + Rate Badge + Close Button */}
              <div className="flex items-start sm:items-center justify-between gap-3 pb-4 border-b border-primary/20">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-transparent backdrop-blur-md text-primary">
                    <CreditCard size={22} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-lg sm:text-xl font-black text-foreground leading-snug break-words">
                      Тарифы и калькулятор скидок ИИкры
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <BubbleElement isBadge size="sm" className="!text-sm">
                        1 ИИкра = 0.99 рубля
                      </BubbleElement>
                      <BubbleElement isBadge active size="sm" className="!text-sm">
                        Скидки до 25% за объем
                      </BubbleElement>
                    </div>
                  </div>
                </div>

                <BubbleElement
                  size="sm"
                  onClick={() => setIsGuestTariffsOpen(false)}
                  icon={<X size={18} />}
                  className="!px-2.5 !py-2 shrink-0"
                  title="Закрыть"
                />
              </div>

              {/* Free Games Freeлионер Banner */}
              <div className="rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-md text-primary shrink-0">
                    <Gamepad2 size={22} />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-base font-bold text-foreground">
                      Играйте бесплатно в режиме Freeлионер
                    </p>
                    <p className="hidden md:block text-sm text-foreground/75 leading-snug">
                      Все готовые игры сообщества доступны без списания ИИкры и без обязательной покупки.
                    </p>
                  </div>
                </div>

                <LeafButton
                  variant="primary"
                  size="sm"
                  icon={<Play size={16} />}
                  onClick={() => {
                    setIsGuestTariffsOpen(false);
                    navigate('/free');
                  }}
                  className="w-full sm:w-auto justify-center shrink-0"
                >
                  Бесплатные игры Freeлионер
                </LeafButton>
              </div>

              {/* Tiered Discounts Scale (Desktop Only) */}
              <div className="hidden md:block space-y-2.5">
                <div className="flex flex-col items-start sm:flex-row sm:items-center justify-between gap-2 text-sm">
                  <span className="font-bold text-foreground/85">
                    Шкала скидок за разовое пополнение (нажмите для расчета):
                  </span>
                  {guestPricing.discountPercent > 0 && (
                    <BubbleElement isBadge active size="sm" className="!text-sm font-mono">
                      Активная скидка: {guestPricing.discountPercent}%
                    </BubbleElement>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {TOP_UP_DISCOUNT_TIERS.map((tier, idx) => {
                    const isActiveTier = guestPricing.discountPercent === tier.percent && guestCurrentAmount >= tier.min;
                    return (
                      <button
                        key={`guest-tier-${idx}`}
                        type="button"
                        onClick={() => {
                          audioSystem.playSlot('ui_btn_bubble_click');
                          setGuestTopUpAmount(tier.min > 0 ? tier.min : 100);
                        }}
                        className={`p-3 rounded-2xl border text-center transition-all backdrop-blur-md cursor-pointer ${
                          isActiveTier
                            ? 'border-primary shadow-[0_0_15px_rgba(153,208,55,0.3)]'
                            : 'border-primary/20 hover:border-primary/45'
                        } bg-transparent`}
                      >
                        <p className="text-sm font-mono text-foreground/75">
                          {tier.range}
                        </p>
                        <p className={`text-sm font-bold font-mono mt-1 ${isActiveTier ? 'text-primary' : 'text-foreground'}`}>
                          {tier.percent === 0 ? 'Без скидки' : `Скидка ${tier.percent}%`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Main Calculator + Preset Packs + Calculation Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Left Column: Amount Input & Preset Tariff Packs */}
                <div className="lg:col-span-2 space-y-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-sm font-bold text-foreground/85 block">
                        Калькулятор количества ИИкры:
                      </label>
                      {guestPricing.discountPercent > 0 && (
                        <div className="md:hidden">
                          <BubbleElement isBadge active size="sm" className="!text-sm font-mono">
                            Активная скидка: {guestPricing.discountPercent}%
                          </BubbleElement>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        value={guestTopUpAmount || ''}
                        onChange={(e) => setGuestTopUpAmount(Math.max(1, Number(e.target.value)))}
                        placeholder="Например, 500"
                        className="w-full rounded-2xl border border-primary/30 bg-transparent p-3.5 pr-32 text-base font-mono font-bold text-foreground focus:outline-none focus:border-primary backdrop-blur-md"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                        <BubbleElement isBadge size="sm" className="!text-sm">
                          <BubbleCurrencyIcon className="w-3.5 h-3.5 inline mr-1" />
                          {getIikrWord(guestTopUpAmount || 1)}
                        </BubbleElement>
                      </div>
                    </div>
                  </div>

                  {/* Quick Preset Tariff Packs */}
                  <div className="space-y-2.5">
                    <span className="text-sm font-bold text-foreground/80 block">
                      Пакеты тарифов со скидкой:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {TOP_UP_PRESET_PACKS.map((pack) => {
                        const isSelected = guestTopUpAmount === pack.iikr;
                        return (
                          <button
                            key={`guest-pack-${pack.iikr}`}
                            type="button"
                            onClick={() => {
                              audioSystem.playSlot('ui_btn_bubble_click');
                              setGuestTopUpAmount(pack.iikr);
                            }}
                            className={`p-3.5 rounded-2xl border text-left transition-all backdrop-blur-md relative overflow-hidden cursor-pointer bg-transparent ${
                              isSelected
                                ? 'border-primary text-foreground shadow-[0_0_15px_rgba(153,208,55,0.28)]'
                                : 'border-primary/20 text-foreground/85 hover:border-primary/45'
                            }`}
                          >
                            {pack.discountPercent > 0 && (
                              <div className="absolute top-2 right-2">
                                <BubbleElement isBadge active={isSelected} size="sm" className="!text-sm !py-0.5 !px-2 border-primary/40">
                                  -{pack.discountPercent}%
                                </BubbleElement>
                              </div>
                            )}
                            <div className="flex items-center gap-1 font-mono font-bold text-base text-primary">
                              <span>{pack.iikr.toLocaleString('ru-RU')}</span>
                              <BubbleCurrencyIcon className="w-3.5 h-3.5 inline" />
                            </div>
                            <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                              <span className="text-sm font-bold text-foreground font-mono">
                                {pack.finalPriceRub.toFixed(2)} ₽
                              </span>
                              {pack.discountPercent > 0 && (
                                <span className="text-sm line-through text-foreground/50 font-mono">
                                  {pack.basePriceRub.toFixed(2)} ₽
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-foreground/65 mt-0.5">
                              {getIikrWord(pack.iikr)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Column: Live Calculation Summary & Registration Requirement */}
                <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 sm:p-5 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3 text-sm">
                    <h4 className="font-bold text-foreground text-base border-b border-primary/15 pb-2">
                      Расчет стоимости
                    </h4>
                    <div className="flex justify-between items-center">
                      <span className="text-foreground/75">Количество ИИкры:</span>
                      <span className="font-bold text-primary font-mono flex items-center gap-1">
                        +{formatIikr(guestCurrentAmount)} <BubbleCurrencyIcon className="w-3.5 h-3.5 inline" />
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-foreground/75">Базовая стоимость:</span>
                      <span className="font-bold text-foreground font-mono">
                        {guestPricing.basePriceRub.toFixed(2)} ₽
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-primary font-medium">
                      <span>Скидка ({guestPricing.discountPercent}%):</span>
                      <span className="font-mono font-bold">
                        -{guestPricing.discountRub.toFixed(2)} ₽
                      </span>
                    </div>
                    <div className="flex justify-between items-end pt-2.5 border-t border-primary/15">
                      <span className="font-bold text-foreground/90">Итого со скидкой:</span>
                      <span className="text-xl font-black text-primary font-mono">
                        {guestPricing.finalPriceRub.toFixed(2)} ₽
                      </span>
                    </div>

                    <div className="hidden md:block p-3 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md space-y-1.5 mt-3">
                      <div className="flex items-center gap-2 text-primary font-bold text-sm">
                        <Lock size={15} className="shrink-0" />
                        <span>Покупка после регистрации</span>
                      </div>
                      <p className="text-sm text-foreground/75 leading-snug">
                        В гостевом режиме доступен только калькулятор тарифов и скидок. Для пополнения баланса войдите или зарегистрируйтесь.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    <LeafButton
                      variant="primary"
                      size="md"
                      icon={<LogIn size={18} />}
                      onClick={() => {
                        setIsGuestTariffsOpen(false);
                        openAuthModal('register');
                      }}
                      className="w-full justify-center"
                    >
                      Зарегистрироваться для покупки
                    </LeafButton>

                    <LeafButton
                      variant="glass"
                      size="md"
                      icon={<Gamepad2 size={18} className="text-primary" />}
                      onClick={() => {
                        setIsGuestTariffsOpen(false);
                        navigate('/free');
                      }}
                      className="w-full justify-center"
                    >
                      Бесплатные игры Freeлионер
                    </LeafButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Navbar({ theme }: { theme: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const isRegistered = Boolean(profile);
  const pathnameLower = location.pathname.toLowerCase();
  const isProfilePage = pathnameLower.startsWith('/profile');

  useEffect(() => {
    setIsProfileMenuOpen(false);
  }, [location.pathname, isRegistered]);

  useEffect(() => {
    const handleToggle = () => {
      if (!isRegistered) return;
      setIsProfileMenuOpen((prev) => !prev);
    };
    window.addEventListener('toggle-profile-menu', handleToggle);
    return () => window.removeEventListener('toggle-profile-menu', handleToggle);
  }, [isRegistered]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('profile-menu-state', { detail: { open: isProfileMenuOpen } }));
  }, [isProfileMenuOpen]);

  const activeProfileSection = (() => {
    if (pathnameLower.startsWith('/profile/trans')) return 'trans';
    if (pathnameLower.startsWith('/profile/ref')) return 'ref';
    if (pathnameLower.startsWith('/profile/history')) return 'history';
    if (pathnameLower.startsWith('/profile/multiplayer') || pathnameLower.startsWith('/profile/lobby')) return 'multiplayer';
    if (pathnameLower.startsWith('/profile/notif')) return 'notifications';
    if (pathnameLower.startsWith('/profile/exchange')) return 'exchange';
    return 'profile';
  })();

  const profileSections = [
    { id: 'profile', label: 'Профиль', to: '/profile', icon: <User size={16} /> },
    { id: 'exchange', label: 'Магазин', to: '/profile/exchange', icon: <ShoppingBag size={16} /> },
    { id: 'trans', label: 'Транзакции', to: '/profile/trans', icon: <Wallet size={16} /> },
    { id: 'notifications', label: 'Уведомления', to: '/profile/notifications', icon: <Bell size={16} /> },
    { id: 'ref', label: 'Друзья', to: '/profile/ref', icon: <Users size={16} /> },
    { id: 'history', label: 'История игр', to: '/profile/history', icon: <History size={16} /> },
    { id: 'multiplayer', label: 'Мультиплеер', to: '/profile/multiplayer', icon: <Radio size={16} /> },
  ];

  return (
    <>
      <AnimatePresence>
        {isProfilePage && isRegistered && isProfileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden flex flex-col justify-end pb-20 px-3 bg-transparent backdrop-blur-xl">
            <div
              className="fixed inset-0"
              onClick={() => setIsProfileMenuOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-full rounded-3xl border border-primary/35 bg-transparent backdrop-blur-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_24px_rgba(153,208,55,0.2)] space-y-3"
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-primary/20">
                <BubbleElement size="sm" isBadge active className="text-sm font-bold">
                  Разделы профиля
                </BubbleElement>
                <BubbleElement
                  size="sm"
                  onClick={() => setIsProfileMenuOpen(false)}
                  icon={<X size={16} />}
                  className="p-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 w-full">
                {profileSections.map((sec) => {
                  const isActive = activeProfileSection === sec.id;
                  return (
                    <BubbleElement
                      key={sec.id}
                      size="md"
                      active={isActive}
                      icon={sec.icon}
                      onClick={() => {
                        if (!isRegistered) return;
                        navigate(sec.to);
                        setIsProfileMenuOpen(false);
                      }}
                      className={cn(
                        "w-full justify-start text-sm font-bold py-2.5 px-3.5 cursor-pointer",
                        sec.id === 'multiplayer' ? "col-span-2 justify-center" : ""
                      )}
                    >
                      <span className="truncate">{sec.label}</span>
                    </BubbleElement>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 z-50 w-full bg-transparent border-none backdrop-blur-none shadow-none md:hidden pointer-events-none pb-1.5">
        <div className="flex h-16 items-center justify-around px-2 pointer-events-auto">
          <MobileNavLink to="/" icon={<Gamepad2 size={18} />} label="Игры" theme={theme} />
          <MobileNavLink to="/blog" icon={<Newspaper size={18} />} label="Блог" theme={theme} />
          <MobileNavLink to="/rating" icon={<Trophy size={18} />} label="Рейтинг" theme={theme} />
          {isProfilePage && (
            <button
              type="button"
              disabled={!isRegistered}
              onClick={() => {
                if (!isRegistered) return;
                setIsProfileMenuOpen((prev) => !prev);
              }}
              title={isRegistered ? "Меню разделов профиля" : "Доступно только после авторизации"}
              className={cn(
                "relative flex flex-col items-center justify-center w-12 h-14 transition-all duration-300 focus:outline-none",
                !isRegistered ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
              )}
            >
              <div
                className={cn(
                  "relative flex items-center justify-center w-11 h-11 rounded-full transition-all duration-300",
                  "bg-[radial-gradient(circle_at_35%_35%,rgba(153,208,55,0.75),rgba(20,40,10,0.85)_60%,rgba(5,15,2,0.95)_100%)]",
                  "shadow-[inset_2px_2px_4px_rgba(255,255,255,0.35)]",
                  isProfileMenuOpen && isRegistered
                    ? "border-2 border-[#99d037] shadow-[0_0_20px_rgba(153,208,55,0.85),inset_2px_2px_5px_rgba(255,255,255,0.6)] scale-105 bg-[radial-gradient(circle_at_35%_35%,rgba(200,250,80,0.95),rgba(40,75,15,0.95)_60%,rgba(8,20,4,0.98)_100%)]"
                    : "border border-[#99d037]/60 shadow-[0_0_10px_rgba(153,208,55,0.3)] opacity-90 hover:opacity-100"
                )}
              >
                <div className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] flex items-center justify-center">
                  {isProfileMenuOpen && isRegistered ? <X size={18} /> : <Menu size={18} />}
                </div>
              </div>

              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-max px-0.5 bg-transparent z-10 pointer-events-none flex justify-center items-center">
                <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,1)] leading-none">
                  Меню
                </span>
              </div>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

function NavLinks({ theme }: { theme: string }) {
  const location = useLocation();

  const links = [
    { to: '/', label: 'Игры', icon: <Gamepad2 size={16} /> },
    { to: '/blog', label: 'Блог', icon: <Newspaper size={16} /> },
    { to: '/rating', label: 'Рейтинг', icon: <Trophy size={16} /> },
  ];

  return (
    <div className="flex items-center gap-3">
      {links.map((link) => {
        const isActive = link.to === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(link.to);

        return (
          <Link key={link.to} to={link.to} className="block select-none focus:outline-none">
            <BubbleElement
              isBadge
              active={isActive}
              icon={link.icon}
              size="md"
              className={cn(
                "cursor-pointer hover:scale-105 active:scale-95 transition-all text-sm font-bold px-4 py-2",
                isActive 
                  ? "shadow-[0_0_16px_rgba(153,208,55,0.7)] border-white/90" 
                  : "hover:border-primary/60 hover:shadow-[0_0_10px_rgba(153,208,55,0.3)]"
              )}
            >
              {link.label}
            </BubbleElement>
          </Link>
        );
      })}
    </div>
  );
}

function MobileNavLink({ to, icon, label, theme }: { to: string, icon: React.ReactNode, label: string, theme: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link 
      to={to} 
      className="relative flex flex-col items-center justify-center w-12 h-14 transition-all duration-300"
    >
      {/* Bubble Container */}
      <div 
        className={cn(
          "relative flex items-center justify-center w-11 h-11 rounded-full transition-all duration-300",
          "bg-[radial-gradient(circle_at_35%_35%,rgba(153,208,55,0.75),rgba(20,40,10,0.85)_60%,rgba(5,15,2,0.95)_100%)]",
          "shadow-[inset_2px_2px_4px_rgba(255,255,255,0.35)]",
          isActive 
            ? "border-2 border-[#99d037] shadow-[0_0_20px_rgba(153,208,55,0.85),inset_2px_2px_5px_rgba(255,255,255,0.6)] scale-105 bg-[radial-gradient(circle_at_35%_35%,rgba(200,250,80,0.95),rgba(40,75,15,0.95)_60%,rgba(8,20,4,0.98)_100%)]" 
            : "border border-[#99d037]/60 shadow-[0_0_10px_rgba(153,208,55,0.3)] opacity-85 hover:opacity-100 hover:scale-105"
        )}
      >
        <div className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] flex items-center justify-center">
          {icon}
        </div>
      </div>

      {/* Label container without uppercase */}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-max px-0.5 bg-transparent z-10 pointer-events-none flex justify-center items-center">
        <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,1)] leading-none">
          {label}
        </span>
      </div>
    </Link>
  );
}
