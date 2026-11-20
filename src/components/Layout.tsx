import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Sparkles, Wallet, ArrowRight, RefreshCcw, X } from 'lucide-react';
import { Header, Navbar } from './Navigation';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { BackgroundAnimation } from './BackgroundAnimation';
import { GlobalChatToastNotifier } from './GlobalChatToastNotifier';
import { BubbleCurrencyIcon } from './BubbleIcon';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { formatIikr } from '../lib/currency';
import { audioSystem } from '../hooks/useSound';

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { profile, refetchProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const prevPathRef = useRef<string>(location.pathname);
  const [paymentBanner, setPaymentBanner] = useState<{
    status: 'success' | 'fail';
    invId?: string;
    outSum?: string;
    iikr?: string;
  } | null>(null);

  const isHome = location.pathname === '/';
  const isFreePage = location.pathname === '/free' || location.pathname.startsWith('/free?');
  const isTenPercentPaddingPage =
    location.pathname.startsWith('/profile') ||
    location.pathname.startsWith('/multiplayer') ||
    location.pathname.startsWith('/game/100to1') ||
    location.pathname.startsWith('/100to1') ||
    location.pathname.startsWith('/blog');

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const paymentStatus = sp.get('payment');
    const isDedicatedPaymentPage = location.pathname.startsWith('/payment/');

    if ((paymentStatus === 'success' || paymentStatus === 'fail') && !isDedicatedPaymentPage) {
      setPaymentBanner({
        status: paymentStatus,
        invId: sp.get('invId') || sp.get('InvId') || undefined,
        outSum: sp.get('outSum') || sp.get('OutSum') || undefined,
        iikr: sp.get('iikr') || sp.get('Shp_energy') || undefined,
      });
      if (paymentStatus === 'success') {
        audioSystem.playSlot('ui_iikr_receive');
        if (refetchProfile) refetchProfile();
      } else {
        audioSystem.playSlot('ui_error_alert');
      }
    }
  }, [location.search, location.pathname]);

  const closePaymentBanner = () => {
    setPaymentBanner(null);
    const sp = new URLSearchParams(location.search);
    sp.delete('payment');
    sp.delete('invId');
    sp.delete('InvId');
    sp.delete('outSum');
    sp.delete('OutSum');
    sp.delete('iikr');
    sp.delete('Shp_energy');
    const nextSearch = sp.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [location.pathname, location.search]);

  useEffect(() => {
    const p = location.pathname.toLowerCase();

    if (prevPathRef.current !== p) {
      prevPathRef.current = p;
      audioSystem.playSlot('ui_tab_switch');
    }

    const isDedicatedGameRoute =
      p.startsWith('/game/blitz') ||
      p === '/blitz' ||
      p.startsWith('/game/100to1') ||
      p === '/100to1' ||
      p.startsWith('/game/jeopardy') ||
      p === '/jeopardy' ||
      p.startsWith('/game/millionaire') ||
      p === '/millionaire' ||
      p.startsWith('/game/whatwherewhen') ||
      p === '/whatwherewhen' ||
      p.startsWith('/game/melody') ||
      p === '/melody' ||
      p.startsWith('/multiplayer/room/') ||
      (p.startsWith('/free/') && p.length > 6);

    if (isDedicatedGameRoute) {
      return;
    }

    if (p.startsWith('/rating')) {
      audioSystem.playBackground('menu_bg_leaderboard');
      audioSystem.preloadSections(['menu']);
    } else if (p.startsWith('/profile/exchange')) {
      audioSystem.playBackground('menu_bg_shop_wallet');
      audioSystem.preloadSections(['menu']);
    } else if (p.startsWith('/profile/multiplayer') || p.startsWith('/profile/lobby')) {
      audioSystem.playBackground('mp_bg_lobby_list');
      audioSystem.preloadSections(['multiplayer', 'menu']);
    } else if (p.startsWith('/game/create')) {
      audioSystem.playBackground('menu_bg_editor');
      audioSystem.preloadSections(['menu']);
    } else if (p.startsWith('/profile') || p.startsWith('/blog') || p.startsWith('/system-admin')) {
      audioSystem.playBackground('menu_bg_ambient_night');
      audioSystem.preloadSections(['menu']);
    } else {
      audioSystem.playBackground('menu_bg_main');
      audioSystem.preloadSections(['menu']);
    }

    audioSystem.ensureAudioUnlocked();
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen pb-12 md:pb-0">
      <BackgroundAnimation />
      <GlobalChatToastNotifier />
      <Header theme={theme} toggleTheme={toggleTheme} />

      {paymentBanner && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-transparent backdrop-blur-xl">
          <div
            className={`w-full max-w-md rounded-3xl border bg-transparent backdrop-blur-2xl p-6 sm:p-7 space-y-5 text-center relative shadow-2xl ${
              paymentBanner.status === 'success'
                ? 'border-amber-400/50 shadow-[0_0_45px_rgba(251,191,36,0.22)]'
                : 'border-rose-500/40 shadow-[0_0_35px_rgba(244,63,94,0.2)]'
            }`}
          >
            <BubbleElement
              onClick={closePaymentBanner}
              size="sm"
              icon={<X size={18} />}
              className="absolute top-4 right-4 p-2 cursor-pointer"
            />

            <div
              className={`mx-auto w-16 h-16 rounded-2xl border bg-transparent backdrop-blur-xl flex items-center justify-center ${
                paymentBanner.status === 'success'
                  ? 'border-amber-400/50 text-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.3)]'
                  : 'border-rose-500/40 text-rose-400'
              }`}
            >
              {paymentBanner.status === 'success' ? <CheckCircle2 size={36} /> : <XCircle size={36} />}
            </div>

            <div className="space-y-2">
              <div className="flex justify-center">
                <BubbleElement
                  isBadge
                  size="sm"
                  className={`!text-sm ${
                    paymentBanner.status === 'success'
                      ? 'border-amber-400/50 text-amber-300 font-bold'
                      : 'border-rose-500/40 text-rose-400 font-bold'
                  }`}
                >
                  {paymentBanner.status === 'success'
                    ? 'Золотое уведомление о зачислении ИИкры'
                    : 'Оплата через Робокассу не завершена'}
                </BubbleElement>
              </div>

              <h3 className="text-xl font-bold text-foreground">
                {paymentBanner.status === 'success'
                  ? 'Баланс успешно пополнен!'
                  : 'Платеж был отменен или отклонен'}
              </h3>

              <p className="text-sm text-foreground/80 leading-relaxed">
                {paymentBanner.status === 'success'
                  ? 'Ваш платеж через шлюз Робокассы подтвержден. ИИкра автоматически зачислена на ваш аккаунт.'
                  : 'Оплата не была завершена. Вы можете повторить попытку в магазине пополнения баланса.'}
              </p>
            </div>

            {(paymentBanner.invId || paymentBanner.iikr || paymentBanner.outSum) && (
              <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 text-left space-y-2 text-sm">
                {paymentBanner.invId && (
                  <div className="flex justify-between">
                    <span className="text-foreground/70">Номер заказа (InvId):</span>
                    <span className="font-mono font-bold text-foreground">№{paymentBanner.invId}</span>
                  </div>
                )}
                {paymentBanner.iikr && (
                  <div className="flex justify-between">
                    <span className="text-foreground/70">Начислено ИИкры:</span>
                    <span className="font-mono font-bold text-amber-300 flex items-center gap-1">
                      +{formatIikr(Number(paymentBanner.iikr))} <BubbleCurrencyIcon className="w-3.5 h-3.5 inline" />
                    </span>
                  </div>
                )}
                {paymentBanner.outSum && (
                  <div className="flex justify-between">
                    <span className="text-foreground/70">Сумма оплаты:</span>
                    <span className="font-mono font-bold text-foreground">{paymentBanner.outSum} ₽</span>
                  </div>
                )}
                {profile && (
                  <div className="flex justify-between pt-1.5 border-t border-primary/15">
                    <span className="text-foreground/70">Текущий баланс:</span>
                    <span className="font-mono font-bold text-primary flex items-center gap-1">
                      {formatIikr(profile.balance || 0)} <BubbleCurrencyIcon className="w-3.5 h-3.5 inline" />
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
              {paymentBanner.status === 'success' ? (
                <>
                  <LeafButton
                    variant="primary"
                    size="md"
                    onClick={closePaymentBanner}
                    icon={<Sparkles size={18} />}
                    className="w-full sm:w-auto justify-center"
                  >
                    Отлично, к играм!
                  </LeafButton>
                  <LeafButton
                    variant="glass"
                    size="md"
                    onClick={() => {
                      closePaymentBanner();
                      navigate('/profile/trans');
                    }}
                    icon={<Wallet size={18} />}
                    className="w-full sm:w-auto justify-center"
                  >
                    Транзакции
                  </LeafButton>
                </>
              ) : (
                <>
                  <LeafButton
                    variant="primary"
                    size="md"
                    onClick={() => {
                      closePaymentBanner();
                      navigate('/profile/exchange');
                    }}
                    icon={<RefreshCcw size={18} />}
                    className="w-full sm:w-auto justify-center"
                  >
                    Попробовать снова
                  </LeafButton>
                  <LeafButton
                    variant="glass"
                    size="md"
                    onClick={closePaymentBanner}
                    className="w-full sm:w-auto justify-center"
                  >
                    Закрыть
                  </LeafButton>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <main
        className={
          isHome
            ? 'relative w-full max-w-full p-0 m-0 pt-12 md:pt-16'
            : isFreePage
            ? 'relative w-full max-w-full p-0 m-0 pt-14 md:pt-20'
            : isTenPercentPaddingPage
            ? 'relative w-full max-w-none px-[2%] sm:px-[10%] py-8 pt-16 md:pt-20'
            : 'relative w-full max-w-none px-[2%] sm:px-6 py-8 pt-16 md:pt-20'
        }
      >
        {children}
      </main>
      <Navbar theme={theme} />
    </div>
  );
}

