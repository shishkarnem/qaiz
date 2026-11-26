import React from 'react';
import { motion } from 'motion/react';
import { DIRECT_MEDIA_URLS } from '../../../shared/mediaUrls';

interface BlogMascotLoaderProps {
  title?: string;
  subtitle?: string;
}

export function BlogMascotLoader({
  title = 'Загрузка статей блога...',
  subtitle = 'Подбираем свежие материалы и гайды Квайз',
}: BlogMascotLoaderProps) {
  return (
    <div className="w-full flex flex-col items-center justify-center py-16 sm:py-24 px-4 text-center">
      <div className="w-full max-w-md rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 sm:p-10 shadow-2xl flex flex-col items-center gap-6">
        <div className="relative w-40 h-40 flex items-center justify-center">
          {/* Outer clockwise rotating ring of bubbles */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 rounded-full border border-primary/25"
          >
            {[0, 60, 120, 180, 240, 300].map((deg, i) => {
              const rad = (deg * Math.PI) / 180;
              const radius = 72;
              const x = Math.cos(rad) * radius;
              const y = Math.sin(rad) * radius;
              const size = i % 2 === 0 ? 'w-4 h-4' : 'w-3 h-3';

              return (
                <motion.div
                  key={deg}
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.16 }}
                  style={{
                    position: 'absolute',
                    left: `calc(50% + ${x}px - 8px)`,
                    top: `calc(50% + ${y}px - 8px)`,
                  }}
                  className={`${size} rounded-full bg-[radial-gradient(circle_at_35%_35%,#c8fa50,#5a8a10)] border border-[#99d037] shadow-[0_0_10px_rgba(153,208,55,0.75)]`}
                />
              );
            })}
          </motion.div>

          {/* Inner counter-rotating dashed ring */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            className="absolute w-28 h-28 rounded-full border-2 border-dashed border-primary/45"
          />

          {/* Central Mascot Logo */}
          <motion.div
            animate={{ scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="relative z-10 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-primary/25 blur-2xl rounded-full scale-125 pointer-events-none" />
            <img
              src={DIRECT_MEDIA_URLS.HERO_LOGO}
              alt="Маскот Квайз"
              className="relative h-20 w-20 object-contain drop-shadow-[0_0_20px_rgba(153,208,55,0.65)] select-none pointer-events-none"
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            />
          </motion.div>
        </div>

        <div className="space-y-2 max-w-full">
          <p className="text-base sm:text-lg font-extrabold text-foreground break-words">
            {title}
          </p>
          <p className="text-sm text-foreground/75 break-words leading-relaxed">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
