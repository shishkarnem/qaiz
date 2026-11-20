import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { EmailAuthForm } from '../components/EmailAuthForm';
import { APP_VERSION } from '../shared/version';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';

export function BrowserLoginPage() {
  const [appVersion, setAppVersion] = useState<string>(APP_VERSION);

  useEffect(() => {
    fetch(`/api/system-config/version?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.version) setAppVersion(String(d.version));
      })
      .catch(() => {});

    const handleVersionEvent = (e: any) => {
      if (e?.detail?.version) setAppVersion(String(e.detail.version));
    };
    window.addEventListener('qaiz_version_updated', handleVersionEvent);
    return () => window.removeEventListener('qaiz_version_updated', handleVersionEvent);
  }, []);

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-8 p-4 md:p-8 text-center">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col items-center gap-6 max-w-md w-full"
      >
        {/* Animated Logo */}
        <motion.div
          animate={{ 
            y: [0, -10, 0],
            rotate: [0, -3, 3, -3, 0]
          }}
          transition={{ 
            duration: 3, 
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          className="relative"
        >
          <div className="absolute inset-0 bg-primary/20 blur-[20px] rounded-full scale-75 opacity-50" />
          <img 
            src={DIRECT_MEDIA_URLS.MINI_LOGO} 
            alt="Квайз" 
            className="relative h-28 md:h-36 w-auto drop-shadow-[0_0_15px_rgba(131,196,46,0.4)] select-none pointer-events-none" 
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          />
        </motion.div>

        <motion.h1
          className="text-3xl md:text-4xl font-black tracking-tight text-primary drop-shadow-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          Квайз
        </motion.h1>

        <p className="text-sm text-foreground/75">
          Войдите по Email или зарегистрируйтесь, чтобы играть
        </p>

        <div className="w-full rounded-[2rem] border border-primary/25 bg-transparent backdrop-blur-2xl p-6 shadow-xl">
          <EmailAuthForm />
        </div>

        <div className="text-sm text-foreground/60 space-y-1">
          <p>© 2026 Квайз · ООО «РентРоп» · Версия {appVersion}</p>
          <p>
            <Link to="/oferta" className="text-primary underline font-semibold hover:opacity-80">
              Публичная оферта и пользовательское соглашение (152-ФЗ)
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

