import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BubbleCurrencyIcon } from './BubbleIcon';

interface CoinAnimationProps {
  show: boolean;
  amount?: number;
}

export function CoinAnimation({ show, amount = 1 }: CoinAnimationProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1, x: '50vw', y: '50vh', scale: 1.0, translateX: '-50%', translateY: '-50%' }}
          animate={{ opacity: 0, x: '50vw', y: '25vh', scale: 1.7, translateX: '-50%', translateY: '-50%' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          className="fixed z-[100000] pointer-events-none select-none"
        >
          <div className="flex items-center gap-2 bg-transparent backdrop-blur-2xl border border-primary/50 rounded-full px-5 py-2.5 text-primary font-black text-lg shadow-[0_0_35px_rgba(132,204,22,0.4)]">
            <span className="text-primary font-mono text-xl font-black tracking-wider">−{amount}</span>
            <BubbleCurrencyIcon className="w-6 h-6 animate-pulse" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

