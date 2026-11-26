import React, { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Globe, RotateCcw, Users } from 'lucide-react';
import { BubbleElement } from '../ui/BubbleElement';
import { useFrogSound } from '../../hooks/useSound';
import { APP_VERSION } from '../../shared/version';
import { safeParseResponseJson } from '../../utils/network/safeFetchJson';

interface FooterLeafButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  variant?: 'primary' | 'secondary';
}

function FooterLeafButton({
  children,
  onClick,
  className = '',
  variant = 'primary',
}: FooterLeafButtonProps) {
  const clipId = useId();
  const colors =
    variant === 'secondary'
      ? { fill: '#507d2a', stroke: '#99d037' }
      : { fill: '#99d037', stroke: '#ffffff' };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center justify-center group cursor-pointer border-none bg-transparent outline-none transition-transform duration-200 hover:scale-105 active:scale-95 min-w-[150px] sm:min-w-[200px] px-5 sm:px-8 py-3.5 ${className}`}
    >
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 220 80"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={clipId}>
            <path d="M 12,40 C 12,10 35,6 110,6 C 175,6 200,10 208,28 L 175,42 L 208,54 C 200,70 175,74 110,74 C 35,74 12,70 12,40 Z" />
          </clipPath>
        </defs>

        <path
          d="M 12,40 C 12,10 35,6 110,6 C 175,6 200,10 208,28 L 175,42 L 208,54 C 200,70 175,74 110,74 C 35,74 12,70 12,40 Z"
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth="2"
        />
        <path
          d="M 175,42 L 110,40 M 175,42 L 140,20 M 175,42 L 140,62 M 175,42 L 70,22 M 175,42 L 70,58"
          stroke="#ffffff"
          strokeOpacity="0.3"
          strokeWidth="1.2"
          strokeDasharray="3 2"
          fill="none"
        />
      </svg>
      <span
        className={`relative z-10 flex items-center justify-center gap-2.5 font-bold whitespace-nowrap text-sm sm:text-base ${
          variant === 'primary'
            ? 'text-[#080a05] dark:text-white drop-shadow-sm'
            : 'text-white drop-shadow-md'
        }`}
      >
        {children}
      </span>
    </button>
  );
}

interface SiteFooterProps {
  appVersion?: string;
}

export function SiteFooter({ appVersion: propVersion }: SiteFooterProps) {
  const { playCroak } = useFrogSound();
  const [appVersion, setAppVersion] = useState<string>(propVersion || APP_VERSION);

  useEffect(() => {
    if (propVersion) {
      setAppVersion(propVersion);
      return;
    }

    let cancelled = false;
    fetch(`/api/system-config/version?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? safeParseResponseJson(r) : null))
      .then((d) => {
        if (!cancelled && d?.version) {
          setAppVersion(String(d.version));
        }
      })
      .catch(() => {});

    const handleVersionEvent = (e: any) => {
      if (e?.detail?.version) setAppVersion(String(e.detail.version));
    };
    window.addEventListener('qaiz_version_updated', handleVersionEvent);

    return () => {
      cancelled = true;
      window.removeEventListener('qaiz_version_updated', handleVersionEvent);
    };
  }, [propVersion]);

  return (
    <motion.footer
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-30 w-full pt-4 pb-4"
    >
      <div className="bg-transparent backdrop-blur-2xl border-2 border-[#99d037]/80 p-4 sm:p-6 rounded-3xl text-foreground space-y-4 shadow-[0_12px_36px_rgba(0,0,0,0.2)] max-w-4xl mx-auto">
        {/* 1. Leaf Buttons */}
        <div className="flex flex-col items-center justify-center gap-2.5 sm:gap-3 w-full">
          <div className="flex justify-center w-full">
            <FooterLeafButton
              variant="primary"
              onClick={() => {
                playCroak();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <span>В начало</span>
              <RotateCcw className="w-5 h-5 ml-1" />
            </FooterLeafButton>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 w-full max-w-2xl mx-auto">
            <a
              href="https://rent-rop.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <FooterLeafButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">Продукт РентРОП</span>
                <Globe className="w-4 h-4 shrink-0 text-white" />
              </FooterLeafButton>
            </a>

            <a
              href="https://t.me/+Qr9hu55w7tEwNjZi"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <FooterLeafButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">Чат техподдержки</span>
                <Users className="w-4 h-4 shrink-0 text-white" />
              </FooterLeafButton>
            </a>

            <a
              href="https://hr-rr.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <FooterLeafButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">Робот Рекрутер</span>
                <Globe className="w-4 h-4 shrink-0 text-white" />
              </FooterLeafButton>
            </a>

            <a
              href="https://ii-rr.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <FooterLeafButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">ИИ Ревизор</span>
                <Globe className="w-4 h-4 shrink-0 text-white" />
              </FooterLeafButton>
            </a>

            <a
              href="https://iismm.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <FooterLeafButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">ИИSMM</span>
                <Globe className="w-4 h-4 shrink-0 text-white" />
              </FooterLeafButton>
            </a>

            <a
              href="https://aihim.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline w-full flex justify-center"
            >
              <FooterLeafButton variant="secondary" className="!min-w-0 w-full !px-4 sm:!px-6 !py-3">
                <span className="truncate">АлхимИИ</span>
                <Globe className="w-4 h-4 shrink-0 text-white" />
              </FooterLeafButton>
            </a>
          </div>
        </div>

        {/* 2. Requisites & Legal Info */}
        <div className="border-t border-primary/25 pt-4 text-center text-sm text-foreground/90 space-y-2 font-mono">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 font-bold text-primary text-sm font-sans">
            <span>© 2026 Квайз</span>
            <span>·</span>
            <span>ИИ-Игры для всех</span>
            <span>·</span>
            <span>ООО «РентРоп»</span>
            <span>·</span>
            <BubbleElement isBadge size="sm" className="text-sm font-bold">
              Версия {appVersion}
            </BubbleElement>
          </div>

          <p className="text-foreground/85 text-sm max-w-2xl mx-auto leading-relaxed font-sans break-words">
            Юридический адрес: 115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2
          </p>

          <p className="text-foreground/85 text-sm font-mono">
            ОГРН: 1217700234157 · ИНН: 7726477438
          </p>

          <p className="text-foreground/90 text-sm font-sans break-words">
            E-mail:{' '}
            <a
              href="mailto:info@arenda-ropa.com"
              className="text-primary underline hover:opacity-80 font-semibold"
            >
              info@arenda-ropa.com
            </a>{' '}
            ·{' '}
            <Link to="/oferta" className="text-primary underline hover:opacity-80 font-semibold">
              Публичная оферта и пользовательское соглашение (152-ФЗ)
            </Link>
          </p>

          <p className="text-foreground/80 text-sm pt-0.5 font-sans">
            Принимаем к оплате: МИР · Visa · Mastercard
          </p>
        </div>
      </div>
    </motion.footer>
  );
}
