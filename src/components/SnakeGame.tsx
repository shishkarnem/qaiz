import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCcw, Trophy, X } from 'lucide-react';
import { BubbleElement } from './ui/BubbleElement';
import { LeafButton } from './ui/LeafButton';
import { useFrogSound, audioSystem } from '../hooks/useSound';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';

interface Point {
  x: number;
  y: number;
}

const GRID_SIZE = 14;
const INITIAL_SPEED = 140;

interface SnakeGameProps {
  onClose?: () => void;
}

export function SnakeGame({ onClose }: SnakeGameProps) {
  const [snake, setSnake] = useState<Point[]>([
    { x: 5, y: 7 },
    { x: 4, y: 7 },
    { x: 3, y: 7 }
  ]);
  const [food, setFood] = useState<Point>({ x: 10, y: 7 });
  const [direction, setDirection] = useState<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>('RIGHT');
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try {
      return Number(localStorage.getItem('qaiz_snake_high_score')) || 0;
    } catch {
      return 0;
    }
  });

  const { playCroak } = useFrogSound();
  const dirRef = useRef(direction);
  dirRef.current = direction;

  const generateFood = useCallback((currentSnake: Point[]): Point => {
    let newFood: Point;
    let collision: boolean;
    do {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE)
      };
      collision = currentSnake.some(seg => seg.x === newFood.x && seg.y === newFood.y);
    } while (collision);
    return newFood;
  }, []);

  const resetGame = () => {
    const initSnake = [
      { x: 5, y: 7 },
      { x: 4, y: 7 },
      { x: 3, y: 7 }
    ];
    setSnake(initSnake);
    setDirection('RIGHT');
    dirRef.current = 'RIGHT';
    setFood(generateFood(initSnake));
    setIsGameOver(false);
    setScore(0);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (['ArrowUp', 'KeyW'].includes(e.code)) {
      e.preventDefault();
      if (dirRef.current !== 'DOWN') setDirection('UP');
    } else if (['ArrowDown', 'KeyS'].includes(e.code)) {
      e.preventDefault();
      if (dirRef.current !== 'UP') setDirection('DOWN');
    } else if (['ArrowLeft', 'KeyA'].includes(e.code)) {
      e.preventDefault();
      if (dirRef.current !== 'RIGHT') setDirection('LEFT');
    } else if (['ArrowRight', 'KeyD'].includes(e.code)) {
      e.preventDefault();
      if (dirRef.current !== 'LEFT') setDirection('RIGHT');
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (isGameOver) return;

    const interval = setInterval(() => {
      setSnake(prevSnake => {
        const head = { ...prevSnake[0] };
        const currentDir = dirRef.current;

        if (currentDir === 'UP') head.y -= 1;
        else if (currentDir === 'DOWN') head.y += 1;
        else if (currentDir === 'LEFT') head.x -= 1;
        else if (currentDir === 'RIGHT') head.x += 1;

        // Check wall collision
        if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
          setIsGameOver(true);
          return prevSnake;
        }

        // Check self collision
        if (prevSnake.some(seg => seg.x === head.x && seg.y === head.y)) {
          setIsGameOver(true);
          return prevSnake;
        }

        // Check food collision
        const ateFood = head.x === food.x && head.y === food.y;
        const newSnake = [head, ...prevSnake];

        if (ateFood) {
          if (!audioSystem.playSlot('fx_snake_minigame_eat')) {
            playCroak();
          }
          setScore(s => {
            const nextScore = s + 1;
            if (nextScore > highScore) {
              setHighScore(nextScore);
              try {
                localStorage.setItem('qaiz_snake_high_score', String(nextScore));
              } catch (_) {}
            }
            return nextScore;
          });
          setFood(generateFood(newSnake));
        } else {
          newSnake.pop();
        }

        return newSnake;
      });
    }, INITIAL_SPEED);

    return () => clearInterval(interval);
  }, [isGameOver, food, generateFood, highScore, playCroak]);

  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-2xl max-w-sm w-full mx-auto">
      {/* Top Header */}
      <div className="w-full flex items-center justify-between pb-2 border-b border-primary/15 mb-2 px-1">
        <div className="flex items-center gap-2">
          <BubbleElement size="sm" isBadge icon={<Trophy size={14} className="text-primary" />}>
            Счет: {score}
          </BubbleElement>
          <span className="text-xs text-foreground/60 font-semibold">
            Рекорд: {highScore}
          </span>
        </div>
        {onClose && (
          <BubbleElement size="sm" onClick={onClose} icon={<X size={14} />}>
            Свернуть
          </BubbleElement>
        )}
      </div>

      {/* Game Board */}
      <div 
        className="relative grid rounded-2xl border border-primary/30 bg-transparent backdrop-blur-md overflow-hidden shadow-inner select-none touch-none"
        style={{
          width: '260px',
          height: '260px',
          gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${GRID_SIZE}, minmax(0, 1fr))`
        }}
      >
        {/* Render Grid Cells */}
        {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
          const x = i % GRID_SIZE;
          const y = Math.floor(i / GRID_SIZE);
          const isHead = snake[0]?.x === x && snake[0]?.y === y;
          const isBody = snake.slice(1).some(seg => seg.x === x && seg.y === y);
          const isFood = food.x === x && food.y === y;

          return (
            <div key={i} className="flex items-center justify-center relative p-0.5">
              {isHead && (
                <div 
                  className="w-full h-full rounded-full transition-all duration-75 relative z-10"
                  style={{
                    background: 'radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.9) 0%, rgba(153, 208, 55, 0.95) 55%, rgba(90, 150, 20, 1) 100%)',
                    boxShadow: '0 0 10px rgba(153, 208, 55, 0.9), inset 1px 1px 2px rgba(255, 255, 255, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.8)'
                  }}
                >
                  <span className="absolute top-[18%] left-[22%] w-[30%] h-[30%] rounded-full bg-white/90" />
                </div>
              )}
              {isBody && (
                <div 
                  className="w-full h-full rounded-full transition-all duration-75 relative"
                  style={{
                    background: 'radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.5) 0%, rgba(153, 208, 55, 0.7) 60%, rgba(110, 170, 25, 0.95) 100%)',
                    boxShadow: '0 0 6px rgba(153, 208, 55, 0.6), inset 1px 1px 2px rgba(255, 255, 255, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.6)'
                  }}
                >
                  <span className="absolute top-[18%] left-[22%] w-[25%] h-[25%] rounded-full bg-white/70" />
                </div>
              )}
              {isFood && (
                <div className="w-full h-full p-0.5 flex items-center justify-center relative z-10">
                  <img 
                    src={DIRECT_MEDIA_URLS.MINI_LOGO} 
                    alt="Food" 
                    className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(153,208,55,0.95)] animate-bounce select-none pointer-events-none"
                    draggable={false}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Game Over Overlay */}
        {isGameOver && (
          <div className="absolute inset-0 bg-transparent backdrop-blur-xl flex flex-col items-center justify-center p-3 gap-2.5 z-20">
            <p className="text-base font-bold text-amber-400">Игра окончена!</p>
            <p className="text-sm text-foreground/80 font-medium">Счет: {score}</p>
            <LeafButton
              variant="primary"
              size="sm"
              onClick={resetGame}
              icon={<RotateCcw size={16} />}
              className="text-sm font-bold"
            >
              Снова
            </LeafButton>
          </div>
        )}
      </div>

      {/* Mobile Touch D-Pad */}
      <div className="mt-3 flex flex-col items-center gap-1">
        <BubbleElement 
          size="sm" 
          onClick={() => { if (dirRef.current !== 'DOWN') setDirection('UP'); }}
          className="w-10 h-10 p-0 flex items-center justify-center"
        >
          <ArrowUp size={18} className="text-primary" />
        </BubbleElement>
        <div className="flex items-center gap-4">
          <BubbleElement 
            size="sm" 
            onClick={() => { if (dirRef.current !== 'RIGHT') setDirection('LEFT'); }}
            className="w-10 h-10 p-0 flex items-center justify-center"
          >
            <ArrowLeft size={18} className="text-primary" />
          </BubbleElement>
          <BubbleElement 
            size="sm" 
            onClick={() => { if (dirRef.current !== 'UP') setDirection('DOWN'); }}
            className="w-10 h-10 p-0 flex items-center justify-center"
          >
            <ArrowDown size={18} className="text-primary" />
          </BubbleElement>
          <BubbleElement 
            size="sm" 
            onClick={() => { if (dirRef.current !== 'LEFT') setDirection('RIGHT'); }}
            className="w-10 h-10 p-0 flex items-center justify-center"
          >
            <ArrowRight size={18} className="text-primary" />
          </BubbleElement>
        </div>
      </div>
      <p className="text-xs text-foreground/50 mt-2 font-medium">
        Управление: стрелки на клавиатуре или кнопки
      </p>
    </div>
  );
}
