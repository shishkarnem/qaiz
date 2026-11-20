import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GlassBubblesAnimation } from './GlassBubblesAnimation';
import { RefreshCw, SkipForward } from 'lucide-react';
import { LeafButton } from './ui/LeafButton';
import { audioSystem } from '../hooks/useSound';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';

interface CheckingAnswerModalProps {
  isOpen: boolean;
  onRetry?: () => void;
  onSkip?: () => void;
  showTimeoutActions?: boolean;
  timerSeconds?: number;
  title?: string;
  subtitle?: string;
  inlineOnDesktop?: boolean;
}

export function CheckingAnswerModal({
  isOpen,
  onRetry,
  onSkip,
  showTimeoutActions = false,
  timerSeconds,
  title = 'ИИ проверяет ваш ответ...',
  subtitle,
  inlineOnDesktop = false
}: CheckingAnswerModalProps) {
  useEffect(() => {
    if (isOpen) {
      audioSystem.playSlot('blitz_ai_checking_loop');
      return () => {
        audioSystem.stopSlot('blitz_ai_checking_loop');
      };
    } else {
      audioSystem.stopSlot('blitz_ai_checking_loop');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="checking-answer-modal-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={
          inlineOnDesktop
            ? 'max-md:fixed max-md:inset-0 max-md:top-0 max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:w-screen max-md:h-screen max-md:min-h-[100dvh] max-md:z-[9999] max-md:p-4 max-md:m-0 md:relative md:w-full md:rounded-3xl md:border md:border-primary/30 md:py-10 md:px-6 md:shadow-2xl flex flex-col items-center justify-center bg-transparent backdrop-blur-2xl text-center overflow-hidden'
            : 'fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-[100dvh] z-[9999] flex flex-col items-center justify-center bg-transparent backdrop-blur-xl text-center p-4 m-0 overflow-hidden'
        }
      >
        <GlassBubblesAnimation glowIntensity="high">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ 
              opacity: 1,
              scale: [0.88, 1.02, 0.94, 1],
              rotate: [0, 2, -2, 0]
            }}
            transition={{ 
              duration: 4.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className={`relative flex aspect-square items-center justify-center ${
              inlineOnDesktop
                ? 'max-md:w-[36vw] max-md:min-w-[170px] max-md:max-w-[320px] md:w-44 md:h-44'
                : 'w-[36vw] min-w-[170px] max-w-[320px]'
            }`}
          >
            {/* Central Neural Glass Sphere enclosing Brand Logo */}
            <div 
              className="relative w-full h-full rounded-full flex items-center justify-center overflow-hidden"
              style={{
                background: 'radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.28) 0%, rgba(153, 208, 55, 0.18) 50%, rgba(153, 208, 55, 0.05) 85%, transparent 100%)',
                boxShadow: 'inset -3px -3px 8px rgba(0, 0, 0, 0.4), inset 3px 3px 8px rgba(255, 255, 255, 0.8), 0 0 25px rgba(153, 208, 55, 0.45)',
                border: '1.5px solid rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
              }}
            >
              {/* Specular Highlight Arc */}
              <span
                className="absolute top-[10%] left-[16%] w-[34%] h-[24%] rounded-full bg-white/90 pointer-events-none"
                style={{
                  filter: 'blur(0.5px)',
                  transform: 'rotate(-25deg)'
                }}
              />

              {/* Logo inside Neural Sphere */}
              <motion.img 
                src={DIRECT_MEDIA_URLS.MINI_LOGO} 
                alt="Logo" 
                className="relative w-[75%] h-[75%] object-contain drop-shadow-[0_0_18px_rgba(153,208,55,0.85)] select-none pointer-events-none"
                referrerPolicy="no-referrer"
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
                animate={{
                  scale: [0.95, 1.05, 0.95]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
              />
            </div>
          </motion.div>
        </GlassBubblesAnimation>

        <div className="mt-6 flex flex-col items-center gap-2 max-w-sm w-full">
          <h2 className="text-xl md:text-2xl font-black text-primary animate-pulse">
            {title}
          </h2>
          <p className="text-sm text-foreground/80 font-medium">
            {subtitle ? subtitle : (
              timerSeconds !== undefined && timerSeconds > 0 
                ? `Оценка точности формулировки (${timerSeconds}с)` 
                : 'Оцениваем логику и точность формулировки...'
            )}
          </p>
        </div>

        {showTimeoutActions && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 flex flex-col items-center gap-3"
          >
            <p className="text-sm text-amber-400 font-medium">
              Нейросеть отвечает дольше обычного
            </p>
            <div className="flex items-center gap-3">
              {onRetry && (
                <LeafButton
                  variant="primary"
                  size="sm"
                  onClick={onRetry}
                >
                  <RefreshCw size={16} className="mr-1.5" />
                  Повторить запрос
                </LeafButton>
              )}
              {onSkip && (
                <LeafButton
                  variant="outline"
                  size="sm"
                  onClick={onSkip}
                >
                  <SkipForward size={16} className="mr-1.5" />
                  Пропустить
                </LeafButton>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
