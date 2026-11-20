import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../db';
import { LeafButton } from '../components/ui/LeafButton';

export function PostRegistrationPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [checking, setChecking] = useState(true);

  const uid = profile?.uid || sessionStorage.getItem('post_reg_uid') || '';

  useEffect(() => {
    const checkTelegram = async () => {
      if (!uid) {
        setChecking(false);
        return;
      }
      const { data } = await db
        .from('users')
        .select('telegram_id')
        .eq('uid', uid)
        .maybeSingle();

      if (data?.telegram_id) {
        navigate('/', { replace: true });
      } else {
        setChecking(false);
      }
    };

    checkTelegram();
  }, [uid, navigate]);

  const tgLink = uid
    ? `https://t.me/qaiz_aibot/app?startapp=link_${uid}`
    : 'https://t.me/qaiz_aibot';

  const handleSkip = () => {
    sessionStorage.setItem('skip_telegram_link', 'true');
    navigate('/', { replace: true });
  };

  if (checking) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-8 p-8 text-center">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col items-center gap-6 max-w-sm w-full"
      >
        <div className="text-6xl">🎉</div>
        <div>
          <h1 className="text-3xl font-black title-glow text-primary">Вы вошли!</h1>
          <p className="mt-2 text-sm text-foreground/70">
            Аккаунт Google успешно создан
          </p>
        </div>

        <div className="w-full rounded-[2rem] border border-primary/30 bg-transparent backdrop-blur-2xl p-8 space-y-5 shadow-xl">
          {/* Bonus badge */}
          <div className="rounded-2xl bg-primary/10 border border-primary/20 px-4 py-3">
            <p className="text-sm font-bold text-primary">+100 ИИкр бонус</p>
            <p className="text-sm text-foreground/70 mt-1">
              Привяжите Telegram — и мы начислим ещё 100 ИИкр на счёт
            </p>
          </div>

          <p className="text-sm font-semibold text-foreground/70">
            Хотите также войти через Telegram?
          </p>

          {/* Open Telegram button */}
          <a
            href={tgLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full"
          >
            <LeafButton
              variant="primary"
              size="lg"
              className="w-full justify-center gap-3"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
                </svg>
              }
            >
              Привязать Telegram
            </LeafButton>
          </a>

          <p className="text-sm text-foreground/60 px-2 leading-relaxed">
            Нажмите кнопку, войдите в Telegram-бота и ваши аккаунты объединятся автоматически
          </p>

          <div className="pt-2 border-t border-primary/20">
            <LeafButton
              variant="glass"
              size="md"
              onClick={handleSkip}
              className="w-full justify-center"
            >
              Пропустить →
            </LeafButton>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
