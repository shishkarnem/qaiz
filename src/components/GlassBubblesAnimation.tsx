import React from 'react';
import { motion } from 'motion/react';

interface OrbitBubble {
  id: number;
  size: number;
  angle: number; // in degrees
  radius: number; // distance in px from center
  opacity: number;
  scaleVariation: [number, number, number];
}

// 3 orbital rings with bubbles placed at distinct angles around the perimeter
const ORBIT_TRACK_1: OrbitBubble[] = [
  { id: 101, size: 28, angle: 0, radius: 110, opacity: 0.9, scaleVariation: [0.9, 1.15, 0.9] },
  { id: 102, size: 20, angle: 90, radius: 115, opacity: 0.75, scaleVariation: [0.85, 1.1, 0.85] },
  { id: 103, size: 32, angle: 180, radius: 112, opacity: 0.85, scaleVariation: [0.95, 1.2, 0.95] },
  { id: 104, size: 18, angle: 270, radius: 110, opacity: 0.7, scaleVariation: [0.8, 1.05, 0.8] },
];

const ORBIT_TRACK_2: OrbitBubble[] = [
  { id: 201, size: 24, angle: 45, radius: 145, opacity: 0.85, scaleVariation: [0.9, 1.15, 0.9] },
  { id: 202, size: 36, angle: 135, radius: 140, opacity: 0.9, scaleVariation: [0.95, 1.2, 0.95] },
  { id: 203, size: 16, angle: 225, radius: 150, opacity: 0.75, scaleVariation: [0.85, 1.1, 0.85] },
  { id: 204, size: 26, angle: 315, radius: 142, opacity: 0.8, scaleVariation: [0.9, 1.12, 0.9] },
];

const ORBIT_TRACK_3: OrbitBubble[] = [
  { id: 301, size: 14, angle: 30, radius: 175, opacity: 0.65, scaleVariation: [0.8, 1.1, 0.8] },
  { id: 302, size: 30, angle: 150, radius: 170, opacity: 0.85, scaleVariation: [0.9, 1.18, 0.9] },
  { id: 303, size: 22, angle: 270, radius: 180, opacity: 0.75, scaleVariation: [0.85, 1.1, 0.85] },
];

interface GlassBubblesAnimationProps {
  children?: React.ReactNode;
  className?: string;
  glowIntensity?: 'normal' | 'high';
}

function renderBubbleSphere(bubble: OrbitBubble, index: number, trackName: string) {
  const rad = (bubble.angle * Math.PI) / 180;
  const x = Math.round(Math.cos(rad) * bubble.radius);
  const y = Math.round(Math.sin(rad) * bubble.radius);

  return (
    <motion.div
      key={`bubble-${trackName}-${bubble.id}-${index}`}
      animate={{
        scale: bubble.scaleVariation,
        opacity: [bubble.opacity * 0.7, bubble.opacity, bubble.opacity * 0.7],
      }}
      transition={{
        duration: 3 + (bubble.id % 3) * 0.8,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      style={{
        position: 'absolute',
        width: `${bubble.size}px`,
        height: `${bubble.size}px`,
        left: `calc(50% + ${x}px - ${bubble.size / 2}px)`,
        top: `calc(50% + ${y}px - ${bubble.size / 2}px)`,
        pointerEvents: 'none',
      }}
    >
      {/* Authentic Apple Liquid Glass Bubble Sphere */}
      <div
        className="w-full h-full rounded-full relative"
        style={{
          background:
            'radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.85) 0%, rgba(153, 208, 55, 0.4) 45%, rgba(153, 208, 55, 0.12) 75%, rgba(20, 35, 10, 0.3) 100%)',
          boxShadow:
            'inset -2px -2px 5px rgba(0, 0, 0, 0.45), inset 2px 2px 4px rgba(255, 255, 255, 0.85), 0 0 14px rgba(153, 208, 55, 0.45)',
          border: '1px solid rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(3px)',
        }}
      >
        {/* Top Specular Glare */}
        <span
          className="absolute rounded-full bg-white/95 pointer-events-none"
          style={{
            top: '14%',
            left: '18%',
            width: '32%',
            height: '24%',
            filter: 'blur(0.3px)',
            transform: 'rotate(-25deg)',
          }}
        />
        {/* Secondary Refraction Accent */}
        <span
          className="absolute rounded-full bg-primary/60 pointer-events-none"
          style={{
            bottom: '12%',
            right: '16%',
            width: '22%',
            height: '18%',
            filter: 'blur(0.5px)',
          }}
        />
      </div>
    </motion.div>
  );
}

export const GlassBubblesAnimation: React.FC<GlassBubblesAnimationProps> = ({
  children,
  className = '',
  glowIntensity = 'normal',
}) => {
  return (
    <div className={`relative flex items-center justify-center p-8 sm:p-12 ${className}`}>
      {/* Central Ambient Halo */}
      <div 
        className={`absolute inset-0 rounded-full bg-primary/20 blur-3xl pointer-events-none ${
          glowIntensity === 'high' ? 'opacity-80 animate-pulse' : 'opacity-50'
        }`} 
      />

      {/* Orbit Ring 1: Inner Clockwise Revolving Track */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
        animate={{ rotate: 360 }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        {ORBIT_TRACK_1.map((b, i) => renderBubbleSphere(b, i, 'orbit1'))}
      </motion.div>

      {/* Orbit Ring 2: Middle Counter-Clockwise Revolving Track */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
        animate={{ rotate: -360 }}
        transition={{
          duration: 24,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        {ORBIT_TRACK_2.map((b, i) => renderBubbleSphere(b, i, 'orbit2'))}
      </motion.div>

      {/* Orbit Ring 3: Outer Clockwise Revolving Track */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
        animate={{ rotate: 360 }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        {ORBIT_TRACK_3.map((b, i) => renderBubbleSphere(b, i, 'orbit3'))}
      </motion.div>

      {/* Main Central Image / Content (clean, unobstructed) */}
      <div className="relative z-10 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
};
