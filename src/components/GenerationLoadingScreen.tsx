import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Gamepad2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GlassBubblesAnimation } from './GlassBubblesAnimation';
import { BubbleElement } from './ui/BubbleElement';
import { SnakeGame } from './SnakeGame';
import { audioSystem } from '../hooks/useSound';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';

interface GenerationLoadingScreenProps {
  title?: string;
  messages?: string[];
  maxSeconds?: number;
  gameId?: 'blitz' | 'millionaire' | '100to1' | 'whatwherewhen' | 'jeopardy' | string;
  onCancel?: () => void;
}

const DEFAULT_MESSAGES = [
  'Подключаемся к нейросети...',
  'Генерируем уникальные вопросы...',
  'Проверяем корректность ответов...',
  'Формируем игровой пакет...',
  'Почти готово...',
];

function resolveGenerationAudioSlot(gameId?: string, title?: string): string {
  const rawId = (gameId || '').toLowerCase();
  const rawTitle = (title || '').toLowerCase();
  const pathname = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';

  if (rawId === 'millionaire' || rawTitle.includes('квиллионер') || pathname.includes('millionaire')) {
    return 'mill_bg_generation';
  }
  if (rawId === '100to1' || rawTitle.includes('сто квадному') || pathname.includes('100-to-1') || pathname.includes('100to1')) {
    return 'sto_bg_generation';
  }
  if (rawId === 'whatwherewhen' || rawTitle.includes('чтогдекв') || rawTitle.includes('что? где?') || pathname.includes('what-where-when') || pathname.includes('whatwherewhen')) {
    return 'www_bg_generation';
  }
  if (rawId === 'jeopardy' || rawTitle.includes('своя икра') || pathname.includes('jeopardy')) {
    return 'jeopardy_bg_generation';
  }
  if (rawId === 'blitz' || rawTitle.includes('квииз') || pathname.includes('blitz')) {
    return 'blitz_bg_generation';
  }
  return 'blitz_bg_generation';
}

export function GenerationLoadingScreen({ 
  title = 'Генерация игры', 
  messages = DEFAULT_MESSAGES,
  maxSeconds = 240,
  gameId,
  onCancel
}: GenerationLoadingScreenProps) {
  const [seconds, setSeconds] = useState(maxSeconds);
  const [msgIndex, setMsgIndex] = useState(0);
  const [showSnake, setShowSnake] = useState(false);
  const cancelledRef = React.useRef(false);
  const navigate = useNavigate();
  const generationSlotKey = resolveGenerationAudioSlot(gameId, title);

  useEffect(() => {
    audioSystem.playBackground(generationSlotKey);
    return () => {
      audioSystem.stopSlot(generationSlotKey);
    };
  }, [generationSlotKey]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => {
      setSeconds(s => s - 1);
      if (seconds % Math.floor(maxSeconds / messages.length) === 0 && msgIndex < messages.length - 1) {
        setMsgIndex(i => i + 1);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [seconds, maxSeconds, messages.length, msgIndex]);

  const progress = ((maxSeconds - seconds) / maxSeconds) * 100;

  const handleCancelClick = () => {
    cancelledRef.current = true;
    if (onCancel) {
      onCancel();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-[100dvh] z-[300] flex flex-col items-center justify-center bg-transparent backdrop-blur-3xl text-center p-3 sm:p-4 m-0 overflow-y-auto">
      {/* If playing snake, render compact header and Snake game */}
      {showSnake ? (
        <div className="w-full max-w-md flex flex-col items-center gap-3 my-auto py-2">
          {/* Compact Generation Status */}
          <div className="w-full max-w-xs space-y-1.5 px-2">
            <div className="flex items-center justify-between text-xs text-foreground/80 font-bold">
              <span className="text-primary truncate">{title}</span>
              <span>{seconds > 0 ? `~${seconds} сек` : 'Финал...'}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-primary/20 overflow-hidden border border-primary/20">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000 ease-linear shadow-[0_0_12px_rgba(153,208,55,0.6)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[13px] text-foreground/70 truncate">
              {messages[msgIndex]}
            </p>
          </div>

          {/* Snake Game Component */}
          <SnakeGame onClose={() => setShowSnake(false)} />

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-1">
            <BubbleElement
              onClick={() => setShowSnake(false)}
              size="sm"
              icon={<Gamepad2 size={15} className="text-primary shrink-0" />}
            >
              Скрыть змейку
            </BubbleElement>
            <BubbleElement
              onClick={handleCancelClick}
              size="sm"
              icon={<X size={15} className="text-primary shrink-0" />}
            >
              Отмена
            </BubbleElement>
          </div>
        </div>
      ) : (
        <>
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
              className="relative flex aspect-square w-[34vw] min-w-[160px] max-w-[280px] items-center justify-center"
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

          <div className="mt-5 flex flex-col items-center gap-2 max-w-sm w-full">
            <h2 className="text-xl md:text-2xl font-black text-primary">
              {title}
            </h2>
            <p className="text-sm text-foreground/80 min-h-[1.5rem] transition-all duration-500 font-medium">
              {messages[msgIndex]}
            </p>
          </div>

          <div className="mt-5 w-full max-w-xs space-y-2">
            <div className="h-2.5 w-full rounded-full bg-primary/20 overflow-hidden border border-primary/20">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000 ease-linear shadow-[0_0_12px_rgba(153,208,55,0.6)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between items-center px-1">
              <p className="text-sm text-foreground/60 font-medium">
                {seconds > 0 ? `~${seconds} сек` : 'Завершение...'}
              </p>
              <p className="text-sm text-foreground/50 font-medium">
                Может завершиться раньше
              </p>
            </div>
          </div>

          {/* Controls: Play Snake & Cancel */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <BubbleElement
              onClick={() => setShowSnake(true)}
              size="md"
              icon={<Gamepad2 size={17} className="text-primary shrink-0" />}
              className="px-5 py-2.5 text-sm font-bold shadow-lg"
            >
              Играть в змейку пока ждем
            </BubbleElement>

            <BubbleElement
              onClick={handleCancelClick}
              size="md"
              icon={<X size={16} className="text-primary shrink-0" />}
              className="px-5 py-2.5 text-sm font-bold shadow-lg"
            >
              Отмена
            </BubbleElement>
          </div>
        </>
      )}
    </div>
  );
}
