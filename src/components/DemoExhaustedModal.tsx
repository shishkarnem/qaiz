import React, { useState, useEffect } from 'react';
import { Sparkles, Gift, Users, Clock, LogIn, UserPlus, X, Send } from 'lucide-react';
import { useFrogSound } from '../hooks/useSound';
import { BubbleCurrencyIcon } from './BubbleIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenRegister: () => void;
  onOpenLogin: () => void;
}

export function DemoExhaustedModal({ isOpen, onClose, onOpenRegister, onOpenLogin }: Props) {
  const { playCroak } = useFrogSound();
  const [tgUrl, setTgUrl] = useState('https://t.me/qaiz_aibot/app');

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const rawRef =
        params.get('startapp') ||
        params.get('tgWebAppStartParam') ||
        params.get('ref') ||
        params.get('start') ||
        (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param ||
        localStorage.getItem('referral_uid');
      const cleanedRef = rawRef && !String(rawRef).startsWith('link_')
        ? String(rawRef).replace(/^ref_/, '').trim()
        : '';
      if (cleanedRef && /^\d{11}$/.test(cleanedRef)) {
        localStorage.setItem('referral_uid', cleanedRef);
        setTgUrl(`https://t.me/qaiz_aibot/app?startapp=${cleanedRef}`);
      } else {
        setTgUrl('https://t.me/qaiz_aibot/app');
      }
    } catch (_) {}
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-y-auto bg-black/40 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg p-6 sm:p-8 rounded-[2rem] border border-primary/35 bg-card/20 backdrop-blur-2xl text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.6)] my-auto animate-in zoom-in-95 duration-200">
        <button
          onClick={() => { playCroak(); onClose(); }}
          className="absolute right-5 top-5 p-2 rounded-xl text-foreground/70 hover:bg-primary/10 hover:text-primary transition-colors"
          title="Закрыть"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 rounded-3xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-[0_0_20px_rgba(153,208,55,0.3)] mb-4">
            <Sparkles size={32} />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Ознакомительный баланс исчерпан
          </h2>
          <p className="mt-2 text-sm text-foreground/80 leading-relaxed max-w-md mx-auto">
            Вы использовали 100 бесплатных ознакомительных ИИкр. Чтобы продолжить играть и зарабатывать награды, зарегистрируйтесь и получите сразу <strong className="text-primary font-black">+300 ИИкр</strong> на баланс!
          </p>
        </div>

        {/* Benefits Box */}
        <div className="mb-6 p-4 rounded-2xl bg-primary/10 border border-primary/25 backdrop-blur-md space-y-2 text-sm text-foreground">
          <h4 className="font-bold text-primary flex items-center gap-1.5 text-sm">
            <Gift size={18} />
            Бонусы
          </h4>
          <div className="grid gap-2 text-sm text-foreground/90 pt-1">
            <div className="flex items-start gap-2">
              <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
              <span><strong>+300 ИИкр</strong> при первой регистрации аккаунта</span>
            </div>
            <div className="flex items-start gap-2">
              <Clock size={16} className="text-primary shrink-0 mt-0.5" />
              <span><strong>+300 ИИкр</strong> ежемесячный бонус за активность</span>
            </div>
            <div className="flex items-start gap-2">
              <Users size={16} className="text-primary shrink-0 mt-0.5" />
              <span><strong>+300 ИИкр</strong> за каждого приглашенного друга</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => {
              playCroak();
              onClose();
              onOpenRegister();
            }}
            className="btn-primary w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold shadow-[0_0_25px_rgba(153,208,55,0.4)] hover:scale-[1.02] transition-transform"
          >
            <UserPlus size={18} />
            Зарегистрироваться (+300 ИИкр)
          </button>

          <a
            href={tgUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => playCroak()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-primary/30 bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 transition-colors shadow-sm"
          >
            <Send size={16} className="rotate-[-45deg]" />
            Открыть в Telegram Mini App
          </a>

          <button
            onClick={() => {
              playCroak();
              onClose();
              onOpenLogin();
            }}
            className="w-full text-center py-2 text-sm text-foreground/70 hover:text-primary transition-colors flex items-center justify-center gap-1.5"
          >
            <LogIn size={15} />
            Уже есть аккаунт? Войти
          </button>
        </div>
      </div>
    </div>
  );
}
