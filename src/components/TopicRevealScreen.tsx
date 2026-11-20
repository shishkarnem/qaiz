import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star, Sparkles } from 'lucide-react';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { audioSystem } from '../hooks/useSound';

interface TopicItem {
  name: string;
  description: string;
  round?: number;
}

interface TopicRevealScreenProps {
  topics: TopicItem[];
  onComplete: () => void;
}

export function TopicRevealScreen({ topics, onComplete }: TopicRevealScreenProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [isAllRevealed, setIsAllRevealed] = useState(false);

  useEffect(() => {
    return () => {
      audioSystem.stopSlot('jeopardy_board_fill');
    };
  }, []);

  useEffect(() => {
    if (revealedCount < topics.length) {
      const timer = setTimeout(() => {
        setRevealedCount(prev => {
          const next = prev + 1;
          if (next % 3 === 1) {
            audioSystem.playSlot('jeopardy_topic_reveal_step');
          }
          return next;
        });
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setIsAllRevealed(true);
    }
  }, [revealedCount, topics.length]);

  const handleRevealAll = () => {
    setRevealedCount(topics.length);
    setIsAllRevealed(true);
  };

  const roundGroups = [
    { round: 1, title: '1 тур: Базовый', items: topics.slice(0, 5) },
    { round: 2, title: '2 тур: Продвинутый', items: topics.slice(5, 10) },
    { round: 3, title: '3 тур: Экспертный', items: topics.slice(10, 15) }
  ];

  return (
    <div className="fixed inset-0 z-[350] flex flex-col items-center justify-start bg-transparent backdrop-blur-2xl p-4 overflow-y-auto">
      <div className="w-full max-w-5xl space-y-6 py-6 md:py-10">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <BubbleElement className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-primary">
              <Sparkles size={16} />
              Пакет тем сформирован
            </BubbleElement>
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-primary">
            15 тем для игры
          </h2>
          <p className="text-sm md:text-base text-foreground/70 font-medium">
            По 5 оригинальных тем для каждого из трех туров
          </p>
        </div>

        <div className="space-y-6">
          {roundGroups.map((group) => {
            const startIndex = (group.round - 1) * 5;
            const hasVisibleItems = startIndex < revealedCount;
            if (!hasVisibleItems && !isAllRevealed) return null;

            return (
              <div key={`round-group-${group.round}`} className="space-y-3">
                <div className="flex items-center gap-3">
                  <BubbleElement className="px-3 py-1 text-sm font-black text-primary">
                    {group.title}
                  </BubbleElement>
                  <div className="h-px flex-1 bg-primary/20" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <AnimatePresence>
                    {group.items.map((topic, localIdx) => {
                      const globalIdx = startIndex + localIdx;
                      if (globalIdx >= revealedCount && !isAllRevealed) return null;

                      return (
                        <motion.div
                          key={`topic-card-${globalIdx}-${topic.name}`}
                          initial={{ opacity: 0, scale: 0.9, y: 15 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                          className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 space-y-2 shadow-lg hover:border-primary/50 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-black text-primary border border-primary/30">
                              {globalIdx + 1}
                            </span>
                            <h3 className="text-sm md:text-base font-bold text-primary leading-tight line-clamp-2">
                              {topic.name}
                            </h3>
                          </div>
                          {topic.description && (
                            <p className="text-sm text-foreground/75 leading-relaxed line-clamp-2">
                              {topic.description}
                            </p>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 pb-12">
          {!isAllRevealed && revealedCount < topics.length && (
            <LeafButton
              variant="glass"
              size="md"
              onClick={handleRevealAll}
              className="px-6 py-3 text-sm font-bold justify-center"
            >
              Показать все сразу
            </LeafButton>
          )}

          <LeafButton
            variant="primary"
            size="lg"
            onClick={onComplete}
            className="px-12 py-4 text-lg md:text-xl font-black justify-center shadow-xl shadow-primary/20"
          >
            Начать игру
          </LeafButton>
        </div>
      </div>
    </div>
  );
}
