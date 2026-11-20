import React from 'react';
import { motion } from 'motion/react';
import { audioSystem } from '../hooks/useSound';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', className = '' }) => {
  const isSmall = size === 'sm';
  const imgSize = isSmall ? 'h-7 w-7' : 'h-10 w-10';
  const textSize = isSmall ? 'text-xl' : 'text-2xl';
  const bubbleSize = isSmall ? 32 : 44;

  return (
    <div
      onClick={() => audioSystem.playSlot('ui_frog_croak')}
      className={`relative flex items-center gap-2 group select-none cursor-pointer ${className}`}
    >
      {/* Animated SVG Bubble Glare sweeping horizontally across the logo and brand name */}
      <motion.div
        className="absolute pointer-events-none z-20 mix-blend-screen -top-1 bottom-0 flex items-center justify-center"
        initial={{ left: '-15%' }}
        animate={{
          left: ['-15%', '105%', '-15%'],
        }}
        transition={{
          duration: 4.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{ width: bubbleSize, height: bubbleSize }}
      >
        <svg
          viewBox="0 0 60 60"
          width="100%"
          height="100%"
          className="overflow-visible drop-shadow-[0_0_12px_rgba(153,208,55,0.9)]"
        >
          <defs>
            <radialGradient id="headerBubbleGlow" cx="40%" cy="35%" r="55%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="30%" stopColor="#99d037" stopOpacity="0.75" />
              <stop offset="70%" stopColor="#507d2a" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#99d037" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bubbleHighlight" cx="30%" cy="25%" r="35%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <filter id="bubbleBlur" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.5" />
            </filter>
          </defs>

          {/* Outer Soft Glow Halo */}
          <circle
            cx="30"
            cy="30"
            r="26"
            fill="url(#headerBubbleGlow)"
            className="animate-pulse"
          />

          {/* Liquid Glass Bubble Body */}
          <circle
            cx="30"
            cy="30"
            r="18"
            fill="none"
            stroke="rgba(153, 208, 55, 0.7)"
            strokeWidth="1.5"
            style={{ filter: 'drop-shadow(0 0 4px rgba(153,208,55,0.8))' }}
          />

          {/* Upper Specular Glare Arc */}
          <ellipse
            cx="24"
            cy="20"
            rx="8"
            ry="4"
            transform="rotate(-25 24 20)"
            fill="url(#bubbleHighlight)"
          />

          {/* Secondary micro glint */}
          <circle
            cx="36"
            cy="38"
            r="2"
            fill="#ffffff"
            opacity="0.7"
          />
        </svg>
      </motion.div>

      {/* Cyclic breathing background glow */}
      <motion.div
        className="absolute inset-0 -inset-x-2 rounded-2xl bg-primary/10 blur-xl pointer-events-none"
        animate={{
          opacity: [0.25, 0.6, 0.25],
          scale: [0.95, 1.05, 0.95]
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />

      {/* Logo Image */}
      <div className="relative shrink-0">
        <motion.img 
          src={DIRECT_MEDIA_URLS.MINI_LOGO} 
          alt="Logo" 
          className={`${imgSize} object-contain select-none pointer-events-none drop-shadow-[0_0_10px_rgba(153,208,55,0.55)] group-hover:drop-shadow-[0_0_16px_rgba(153,208,55,0.85)] transition-all duration-300`}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          animate={{
            filter: [
              'drop-shadow(0 0 8px rgba(153,208,55,0.5))',
              'drop-shadow(0 0 16px rgba(153,208,55,0.9))',
              'drop-shadow(0 0 8px rgba(153,208,55,0.5))'
            ]
          }}
          transition={{
            duration: 4.5,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      </div>

      {/* Brand Name with "ай" highlighted in primary yellow-green */}
      <span className={`${textSize} font-black tracking-tight text-foreground drop-shadow-[0_0_8px_rgba(153,208,55,0.4)] group-hover:drop-shadow-[0_0_16px_rgba(153,208,55,0.7)] transition-all duration-300 relative z-10`}>
        Кв<span className="text-primary drop-shadow-[0_0_10px_rgba(153,208,55,0.85)]">ай</span>з
      </span>
    </div>
  );
};
