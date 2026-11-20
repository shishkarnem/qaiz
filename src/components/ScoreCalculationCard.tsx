import React, { useEffect } from 'react';
import { Calculator, Award, CheckCircle2, Flame } from 'lucide-react';
import { BubbleElement } from './ui/BubbleElement';
import { ScoreCalculationResult } from '../utils/gameScoring';
import { audioSystem } from '../hooks/useSound';

export interface ScoreCalculationCardProps {
  score: number;
  calculation?: ScoreCalculationResult | null;
  gameTitle?: string;
  isWin?: boolean;
  className?: string;
}

export const ScoreCalculationCard: React.FC<ScoreCalculationCardProps> = ({
  score,
  calculation,
  gameTitle,
  isWin,
  className = ''
}) => {
  const displayScore = calculation?.authoritativeScore ?? score;

  useEffect(() => {
    audioSystem.playSlot('fx_score_counter_rollup');
  }, []);

  return (
    <div className={`w-full space-y-3.5 text-left ${className}`}>
      {/* Top Header Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BubbleElement 
          isBadge 
          size="md" 
          icon={<Calculator size={16} className="text-primary" />}
        >
          Калькуляция набранных очков
        </BubbleElement>

        {calculation?.difficultyName && (
          <BubbleElement 
            isBadge 
            size="sm" 
            icon={<Award size={14} className="text-primary" />}
          >
            {calculation.difficultyName}
          </BubbleElement>
        )}
      </div>

      {/* Main Authoritative Score Display */}
      <div className="rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="space-y-1 min-w-0">
          <span className="text-sm font-semibold text-foreground/80 block">
            Итого начислено в рейтинг:
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-black text-primary tracking-tight">
              +{displayScore.toLocaleString('ru-RU')}
            </span>
            <span className="text-sm font-bold text-primary/80">
              очков
            </span>
          </div>
        </div>

        <BubbleElement 
          isBadge 
          active={Boolean(isWin)}
          size="md" 
          icon={isWin ? <CheckCircle2 size={16} /> : <Flame size={16} />}
        >
          {isWin ? 'Победный раунд' : 'Результат зафиксирован'}
        </BubbleElement>
      </div>

      {/* Breakdown rows */}
      {calculation?.breakdown && calculation.breakdown.length > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 space-y-2.5">
          <span className="text-sm font-bold text-primary block pb-1 border-b border-primary/15">
            Детализация начисления:
          </span>
          
          <div className="space-y-2">
            {calculation.breakdown.map((item, idx) => (
              <div 
                key={`breakdown-${item.label}-${idx}`}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 p-2.5 rounded-xl border transition-all ${
                  item.highlight 
                    ? 'border-primary/40 bg-transparent' 
                    : 'border-primary/10 bg-transparent'
                }`}
              >
                <div className="min-w-0">
                  <span className={`text-sm leading-snug block ${
                    item.highlight ? 'font-bold text-foreground' : 'font-medium text-foreground/85'
                  }`}>
                    {item.label}
                  </span>
                  {item.sublabel && (
                    <span className="text-sm text-foreground/60 block mt-0.5">
                      {item.sublabel}
                    </span>
                  )}
                </div>

                <div className="shrink-0 self-start sm:self-auto">
                  <BubbleElement
                    isBadge
                    active={Boolean(item.highlight)}
                    size="sm"
                    className="font-bold text-sm"
                  >
                    {item.value}
                  </BubbleElement>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formula Explanation */}
      {calculation?.formula && (
        <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-3.5 space-y-1">
          <span className="text-sm font-bold text-primary/90 block">
            Формула начисления:
          </span>
          <p className="text-sm font-medium text-foreground/90 break-words leading-relaxed">
            {calculation.formula}
          </p>
        </div>
      )}
    </div>
  );
};
