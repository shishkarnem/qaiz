import React from 'react';
import { motion } from 'motion/react';

export const BackgroundAnimation: React.FC = () => {
  const bubbles = [
    // 5 Large Bubbles
    { id: 1, left: '4%', size: '26vw', minSize: '160px', duration: 18, delay: 0 },
    { id: 2, left: '28%', size: '46vw', minSize: '280px', duration: 24, delay: -6 },
    { id: 3, left: '62%', size: '22vw', minSize: '140px', duration: 16, delay: -12 },
    { id: 4, left: '12%', size: '50vw', minSize: '300px', duration: 26, delay: -4 },
    { id: 5, left: '76%', size: '30vw', minSize: '180px', duration: 20, delay: -10 },
    // 5 Small Bubbles (floating all the way past top -125vh)
    { id: 6, left: '20%', size: '9vw', minSize: '50px', duration: 8, delay: -2, isSmall: true },
    { id: 7, left: '50%', size: '8vw', minSize: '45px', duration: 7, delay: -5, isSmall: true },
    { id: 8, left: '84%', size: '10vw', minSize: '55px', duration: 9, delay: -1, isSmall: true },
    { id: 9, left: '38%', size: '7vw', minSize: '40px', duration: 10, delay: -7, isSmall: true },
    { id: 10, left: '92%', size: '8vw', minSize: '48px', duration: 8, delay: -3, isSmall: true },
  ];

  return (
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-full h-full pointer-events-none z-0 overflow-hidden m-0 p-0">
      {bubbles.map((b) => (
        <motion.div
          key={b.id}
          initial={{ y: '115vh', opacity: 0 }}
          animate={{
            y: ['115vh', '-125vh'],
            x: [0, 25, -20, 0],
            opacity: [0, 0.45, 0.45, 0.45, 0],
          }}
          transition={{
            duration: b.duration,
            repeat: Infinity,
            delay: b.delay,
            ease: 'linear',
          }}
          style={{
            left: b.left,
            bottom: 0,
            width: b.size,
            height: b.size,
            minWidth: b.minSize,
            minHeight: b.minSize,
            maxWidth: b.isSmall ? '140px' : '520px',
            maxHeight: b.isSmall ? '140px' : '520px',
            background: 'radial-gradient(circle at 35% 30%, rgba(153, 208, 55, 0.45) 0%, rgba(80, 125, 42, 0.18) 55%, rgba(8, 10, 5, 0.02) 85%)',
            boxShadow: 'inset -6px -6px 16px rgba(0, 0, 0, 0.5), inset 6px 6px 14px rgba(153, 208, 55, 0.35), 0 0 20px rgba(153, 208, 55, 0.2)',
            border: '1px solid rgba(153, 208, 55, 0.3)',
            borderRadius: '50%',
          }}
          className="absolute pointer-events-none flex items-start justify-start p-3"
        >
          {/* Animated 3D Glare Highlight */}
          <motion.div
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.75, 0.3],
            }}
            transition={{
              duration: 3 + (b.id % 4),
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="w-[22%] h-[22%] rounded-full bg-white/50 blur-[1px] shadow-[0_0_8px_rgba(255,255,255,0.8)] ml-[12%] mt-[10%]"
          />
        </motion.div>
      ))}
    </div>
  );
};
