import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { BubbleElement } from './BubbleElement';
import { audioSystem } from '../../hooks/useSound';

interface MultiplayerCountdownOverlayProps {
  isOpen: boolean;
  onComplete: () => void;
  gameTitle?: string;
  subtitle?: string;
}

export const MultiplayerCountdownOverlay: React.FC<MultiplayerCountdownOverlayProps> = ({
  isOpen,
  onComplete,
  gameTitle = 'Мультиплеер',
  subtitle = 'Приготовьтесь! Игра начинается...'
}) => {
  const [count, setCount] = useState<number>(5);

  useEffect(() => {
    if (!isOpen) {
      setCount(5);
      audioSystem.stopSlot('mp_countdown_tick');
      return;
    }

    setCount(5);
    audioSystem.playSlot('mp_countdown_tick');
    const interval = setInterval(() => {
      setCount((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimeout(() => {
            audioSystem.stopSlot('mp_countdown_tick');
            audioSystem.playSlot('mp_match_start_go');
            onComplete();
          }, 850);
          return 1;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      audioSystem.stopSlot('mp_countdown_tick');
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="mp-countdown-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-[100dvh] z-[9999] flex flex-col items-center justify-center bg-transparent backdrop-blur-3xl p-4 m-0 overflow-hidden select-none"
        >
          {/* Floating ambient liquid bubbles */}
          <div className="relative flex flex-col items-center justify-center gap-8 max-w-md w-full text-center">
            <BubbleElement isBadge active size="md" icon={<Sparkles size={16} />}>
              {gameTitle}
            </BubbleElement>

            {/* Main Animated 3D Bubble Container */}
            <div className="relative flex items-center justify-center w-64 h-64 sm:w-80 sm:h-80">
              {/* Outer pulsing liquid glass rings */}
              <motion.div
                animate={{
                  scale: [1, 1.18, 1],
                  rotate: [0, 180, 360],
                  opacity: [0.35, 0.7, 0.35]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
                className="absolute inset-0 rounded-full border-2 border-primary/40 backdrop-blur-xl pointer-events-none"
                style={{
                  boxShadow:
                    '0 0 50px rgba(153, 208, 55, 0.35), inset 0 0 35px rgba(153, 208, 55, 0.25)'
                }}
              />

              <motion.div
                animate={{
                  scale: [1.08, 0.94, 1.08],
                  rotate: [360, 180, 0]
                }}
                transition={{
                  duration: 2.4,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
                className="absolute inset-4 rounded-full border border-primary/50 backdrop-blur-2xl pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle at 30% 25%, rgba(153, 208, 55, 0.28) 0%, rgba(153, 208, 55, 0.08) 55%, transparent 100%)',
                  boxShadow:
                    'inset -8px -8px 24px rgba(0, 0, 0, 0.45), inset 8px 8px 20px rgba(255, 255, 255, 0.35), 0 0 40px rgba(153, 208, 55, 0.4)'
                }}
              />

              {/* Orbiting mini bubbles */}
              {[0, 1, 2, 3].map((idx) => (
                <motion.div
                  key={`orbit-bubble-${idx}`}
                  animate={{
                    y: [0, -14, 0, 14, 0],
                    x: [0, 10, 0, -10, 0],
                    scale: [0.9, 1.15, 0.9]
                  }}
                  transition={{
                    duration: 2 + idx * 0.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: idx * 0.3
                  }}
                  className="absolute w-7 h-7 rounded-full border border-primary/50 backdrop-blur-md pointer-events-none"
                  style={{
                    top: idx === 0 ? '4%' : idx === 1 ? '82%' : idx === 2 ? '15%' : '75%',
                    left: idx === 0 ? '15%' : idx === 1 ? '78%' : idx === 2 ? '80%' : '12%',
                    background:
                      'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.65) 0%, rgba(153,208,55,0.3) 50%, transparent 100%)',
                    boxShadow: '0 0 14px rgba(153, 208, 55, 0.45)'
                  }}
                />
              ))}

              {/* Specular highlight */}
              <div className="absolute top-[14%] left-[18%] w-16 h-8 rounded-full bg-white/30 blur-[2px] -rotate-30 pointer-events-none" />

              {/* Giant Countdown Number */}
              <AnimatePresence mode="wait">
                <motion.span
                  key={`countdown-num-${count}`}
                  initial={{ scale: 0.3, opacity: 0, rotate: -12 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 1.6, opacity: 0, rotate: 12 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                  className="relative z-20 text-8xl sm:text-9xl font-black text-primary tracking-tight"
                  style={{
                    textShadow:
                      '0 0 35px rgba(153, 208, 55, 0.85), 0 6px 20px rgba(0, 0, 0, 0.6)'
                  }}
                >
                  {count}
                </motion.span>
              </AnimatePresence>
            </div>

            <BubbleElement isBadge size="md" className="px-6 py-2.5 text-sm sm:text-base font-bold text-foreground">
              {subtitle}
            </BubbleElement>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
