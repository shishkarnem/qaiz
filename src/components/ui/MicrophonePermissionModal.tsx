import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Sparkles, X, RotateCcw, AlertTriangle, Settings2, Sliders } from 'lucide-react';
import { LeafButton } from './LeafButton';
import { BubbleElement } from './BubbleElement';

export interface MicrophonePermissionModalProps {
  isOpen: boolean;
  mode?: 'prompt' | 'instruction';
  errorType?: 'denied' | 'not_found' | 'not_readable' | null;
  errorMessage?: string | null;
  onAllow: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

export const MicrophonePermissionModal: React.FC<MicrophonePermissionModalProps> = ({
  isOpen,
  mode = 'prompt',
  errorType = null,
  errorMessage = null,
  onAllow,
  onRetry,
  onCancel
}) => {
  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-transparent backdrop-blur-xl">
          {/* Backdrop Click Dismiss */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-transparent"
          />

          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            className="relative w-full max-w-lg rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] text-center z-10 overflow-hidden"
          >
            {/* Top Close Button */}
            <BubbleElement
              size="sm"
              onClick={onCancel}
              className="absolute top-4 right-4 !p-2"
              icon={<X size={18} />}
              title="Закрыть"
              aria-label="Закрыть"
            />

            {mode === 'prompt' ? (
              <>
                {/* Neural Sphere Icon */}
                <div className="relative mx-auto mb-5 w-20 h-20 flex items-center justify-center">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center border-2 border-primary/50 shadow-[0_0_25px_rgba(153,208,55,0.4)] backdrop-blur-xl relative overflow-hidden"
                    style={{
                      background: 'radial-gradient(circle at 35% 30%, rgba(153, 208, 55, 0.45) 0%, rgba(131, 196, 46, 0.25) 60%, rgba(255, 255, 255, 0.1) 100%)'
                    }}
                  >
                    {/* 3D Glass Glare */}
                    <span
                      className="absolute rounded-full bg-white/70 pointer-events-none"
                      style={{
                        top: '12%',
                        left: '18%',
                        width: '30%',
                        height: '25%',
                        filter: 'blur(0.5px)',
                        transform: 'rotate(-25deg)'
                      }}
                    />
                    <Mic size={32} className="text-primary animate-pulse relative z-10" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-transparent border border-primary/60 backdrop-blur-md flex items-center justify-center text-primary">
                    <Sparkles size={14} />
                  </span>
                </div>

                {/* Content */}
                <h3 className="text-xl sm:text-2xl font-black text-foreground mb-3 tracking-tight">
                  Разрешите доступ к микрофону
                </h3>

                <p className="text-sm sm:text-base text-foreground/80 leading-relaxed mb-6">
                  Для распознавания голосового ввода браузер запросит доступ к микрофону. Нажмите кнопку ниже и подтвердите запрос в окне браузера.
                </p>

                {/* Action Buttons */}
                <div className="flex items-center justify-center gap-3">
                  <LeafButton
                    variant="outline"
                    size="md"
                    onClick={onCancel}
                    className="flex-1 text-sm font-semibold"
                  >
                    Отмена
                  </LeafButton>
                  <LeafButton
                    variant="primary"
                    size="md"
                    onClick={onAllow}
                    className="flex-1 text-sm font-bold shadow-[0_0_20px_rgba(153,208,55,0.45)]"
                  >
                    🎤 Начать запись
                  </LeafButton>
                </div>
              </>
            ) : (
              <>
                {/* Warning / Instruction Mode */}
                <div className="relative mx-auto mb-5 w-20 h-20 flex items-center justify-center">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center border-2 border-amber-400/50 shadow-[0_0_25px_rgba(251,191,36,0.35)] backdrop-blur-xl relative overflow-hidden"
                    style={{
                      background: 'radial-gradient(circle at 35% 30%, rgba(251, 191, 36, 0.45) 0%, rgba(217, 119, 6, 0.25) 60%, rgba(255, 255, 255, 0.1) 100%)'
                    }}
                  >
                    <span
                      className="absolute rounded-full bg-white/70 pointer-events-none"
                      style={{
                        top: '12%',
                        left: '18%',
                        width: '30%',
                        height: '25%',
                        filter: 'blur(0.5px)',
                        transform: 'rotate(-25deg)'
                      }}
                    />
                    <AlertTriangle size={32} className="text-amber-300 relative z-10" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-transparent border border-amber-400/60 backdrop-blur-md flex items-center justify-center text-amber-300">
                    <Sliders size={14} />
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-foreground mb-2 tracking-tight">
                  {errorType === 'not_found'
                    ? 'Микрофон не обнаружен'
                    : 'Включите доступ к микрофону'}
                </h3>

                <p className="text-sm text-foreground/80 leading-relaxed mb-4">
                  {errorMessage || (errorType === 'not_found'
                    ? 'Убедитесь, что гарнитура или микрофон подключены к вашему устройству.'
                    : 'Доступ был отклонен или заблокирован в браузере. Включите его по инструкции ниже без обновления страницы:')}
                </p>

                {/* Steps in Liquid Glass Apple style */}
                <div className="space-y-2.5 mb-6 text-left">
                  <BubbleElement isBadge={true} className="w-full justify-start gap-3 py-2.5 px-3.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md">
                    <span className="w-6 h-6 rounded-full border border-primary/60 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                      1
                    </span>
                    <span className="text-sm text-foreground/90 font-medium">
                      Нажмите на значок замочка или параметров сайта <Settings2 size={14} className="inline mx-1 text-primary" /> слева в адресной строке
                    </span>
                  </BubbleElement>

                  <BubbleElement isBadge={true} className="w-full justify-start gap-3 py-2.5 px-3.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md">
                    <span className="w-6 h-6 rounded-full border border-primary/60 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                      2
                    </span>
                    <span className="text-sm text-foreground/90 font-medium">
                      В пункте «Микрофон» переведите переключатель в положение «Разрешить»
                    </span>
                  </BubbleElement>

                  <BubbleElement isBadge={true} className="w-full justify-start gap-3 py-2.5 px-3.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md">
                    <span className="w-6 h-6 rounded-full border border-primary/60 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                      3
                    </span>
                    <span className="text-sm text-foreground/90 font-medium">
                      Нажмите кнопку «Повторить попытку» ниже без перезагрузки страницы
                    </span>
                  </BubbleElement>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-center gap-3">
                  <LeafButton
                    variant="outline"
                    size="md"
                    onClick={onCancel}
                    className="flex-1 text-sm font-semibold"
                  >
                    Закрыть
                  </LeafButton>
                  <LeafButton
                    variant="primary"
                    size="md"
                    onClick={onRetry}
                    className="flex-1 text-sm font-bold shadow-[0_0_20px_rgba(153,208,55,0.45)] flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={16} />
                    <span>Повторить попытку</span>
                  </LeafButton>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
