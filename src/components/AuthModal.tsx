import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Send, X, Sparkles, Gift, Users, Clock, FileText } from 'lucide-react';
import { useFrogSound } from '../hooks/useSound';
import { EmailAuthForm } from './EmailAuthForm';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register' | 'forgot';
  showReferralRules?: boolean;
  initialResetToken?: string | null;
}

export function AuthModal({ 
  isOpen, 
  onClose, 
  initialMode = 'login',
  initialResetToken = null,
}: AuthModalProps) {
  const { profile, setProfile, refetchProfile } = useAuth();
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

  if (!isOpen || (profile && !initialResetToken)) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto bg-transparent backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg p-6 sm:p-8 rounded-[2rem] border border-primary/30 bg-transparent backdrop-blur-2xl text-foreground shadow-[0_16px_40px_rgba(0,0,0,0.5)] my-auto animate-in zoom-in-95 duration-200">
        <BubbleElement
          as="button"
          type="button"
          size="sm"
          onClick={() => { playCroak(); onClose(); }}
          className="absolute right-5 top-5 !p-2"
          title="Закрыть"
        >
          <X size={20} />
        </BubbleElement>
        
        <div className="text-center mb-5">
          <img 
            src={DIRECT_MEDIA_URLS.MINI_LOGO} 
            alt="Logo" 
            className="mx-auto h-14 w-14 drop-shadow-[0_0_15px_rgba(153,208,55,0.4)] select-none pointer-events-none" 
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          />
          <h2 className="mt-3 text-2xl font-black tracking-tight text-primary drop-shadow-[0_0_10px_rgba(153,208,55,0.3)]">
            {initialMode === 'register' ? 'Регистрация в Квайз' : 'Вход в Квайз'}
          </h2>
          <p className="mt-1 text-sm text-foreground/75">
            Войдите по почте или откройте Telegram Mini App
          </p>
        </div>

        {/* Bonuses Card */}
        <div className="mb-5 p-4 rounded-2xl bg-transparent border border-primary/25 backdrop-blur-xl space-y-2 text-sm text-foreground">
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

        <EmailAuthForm 
          onSuccess={(loggedUser) => {
            if (loggedUser) {
              setProfile(loggedUser);
              if (loggedUser.uid) {
                refetchProfile(loggedUser.uid);
              }
            }
            onClose();
          }} 
          defaultMode={initialMode}
          initialResetToken={initialResetToken}
        />

        <div className="mt-6 pt-5 border-t border-primary/20 text-center space-y-3">
          <p className="text-sm text-foreground/75">Или откройте приложение через Telegram (автоматический вход)</p>
          <a
            href={tgUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => playCroak()}
            className="block w-full"
          >
            <LeafButton
              variant="primary"
              size="lg"
              className="w-full justify-center !text-sm font-bold"
              icon={<Send size={18} className="rotate-[-45deg]" />}
            >
              Открыть в Telegram Mini App
            </LeafButton>
          </a>
          <div className="pt-1">
            <Link
              to="/oferta"
              onClick={() => onClose()}
              className="inline-flex items-center gap-1.5 text-sm text-primary underline font-semibold hover:opacity-80"
            >
              <FileText size={14} />
              <span>Публичная оферта и пользовательское соглашение (152-ФЗ)</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

