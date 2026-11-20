import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Square, Loader2, AlertCircle } from 'lucide-react';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { MicrophonePermissionModal } from './MicrophonePermissionModal';
import { BubbleElement } from './BubbleElement';
import { audioSystem } from '../../hooks/useSound';

interface VoiceInputBubbleProps {
  onTranscript: (text: string, isFinal?: boolean) => void;
  onAudioRecorded?: (audioUrl: string, transcript: string) => void;
  onActiveChange?: (isActive: boolean) => void;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  mode?: 'append' | 'replace';
  currentValue?: string;
  tooltip?: string;
}

export const VoiceInputBubble: React.FC<VoiceInputBubbleProps> = ({
  onTranscript,
  onAudioRecorded,
  onActiveChange,
  className = '',
  disabled = false,
  size = 'md',
  mode = 'append',
  currentValue = '',
  tooltip = '🎤 Начать запись'
}) => {
  const onTranscriptPropRef = React.useRef(onTranscript);
  onTranscriptPropRef.current = onTranscript;

  const currentValueRef = React.useRef(currentValue);
  currentValueRef.current = currentValue;

  const modeRef = React.useRef(mode);
  modeRef.current = mode;

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [popupAlign, setPopupAlign] = React.useState<'left' | 'right'>('right');
  const [popupMaxWidth, setPopupMaxWidth] = React.useState<number>(250);

  const {
    isRecording,
    isRecognizing,
    isSupported,
    isPermissionModalOpen,
    permissionModalMode,
    permissionErrorType,
    permissionErrorMessage,
    audioLevel,
    recordingSeconds,
    recognitionSeconds,
    statusLabel,
    toggleListening,
    requestPermissionAndStart,
    retryPermission,
    closePermissionModal,
    clearError,
    error,
    errorStep,
    errorReason
  } = useVoiceInput({
    onActiveChange,
    onAudioRecorded,
    onTranscript: (text, isFinal) => {
      if (text && text.trim()) {
        const fresh = text.trim();
        const curr = typeof currentValueRef.current === 'string' ? currentValueRef.current : '';
        if (modeRef.current === 'append' && curr.trim()) {
          onTranscriptPropRef.current(`${curr.trim()} ${fresh}`, isFinal);
        } else {
          onTranscriptPropRef.current(fresh, isFinal);
        }
      }
    }
  });

  const updatePopupPlacement = React.useCallback(() => {
    const el = wrapperRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const outerContainer = el.closest('.rounded-3xl, .rounded-2xl, form, [role="dialog"]') as HTMLElement | null;
    const containerRect = outerContainer
      ? outerContainer.getBoundingClientRect()
      : { left: 8, right: window.innerWidth - 8 };

    const safeLeft = Math.max(8, containerRect.left + 8);
    const safeRight = Math.min(window.innerWidth - 8, containerRect.right - 8);
    const spaceToLeft = Math.floor(rect.right - safeLeft);
    const spaceToRight = Math.floor(safeRight - rect.left);

    if (spaceToLeft >= spaceToRight) {
      setPopupAlign('right');
      setPopupMaxWidth(Math.max(140, Math.min(290, spaceToLeft)));
    } else {
      setPopupAlign('left');
      setPopupMaxWidth(Math.max(140, Math.min(290, spaceToRight)));
    }
  }, []);

  React.useLayoutEffect(() => {
    if (isRecording || isRecognizing || error) {
      updatePopupPlacement();
      window.addEventListener('resize', updatePopupPlacement);
      window.addEventListener('scroll', updatePopupPlacement, true);
      return () => {
        window.removeEventListener('resize', updatePopupPlacement);
        window.removeEventListener('scroll', updatePopupPlacement, true);
      };
    }
  }, [isRecording, isRecognizing, error, updatePopupPlacement]);

  const wasRecordingRef = React.useRef(false);
  React.useEffect(() => {
    if (isRecording && !wasRecordingRef.current) {
      wasRecordingRef.current = true;
      audioSystem.playSlot('ui_voice_input_start');
    } else if (!isRecording && wasRecordingRef.current) {
      wasRecordingRef.current = false;
      audioSystem.playSlot('ui_voice_input_stop');
    }
  }, [isRecording]);

  // Автоматическое закрытие ошибки при клике вне или на экране
  React.useEffect(() => {
    if (!error) return;
    const handleGlobalDismiss = () => {
      clearError();
    };
    window.addEventListener('click', handleGlobalDismiss, { capture: true });
    window.addEventListener('pointerdown', handleGlobalDismiss, { capture: true });
    return () => {
      window.removeEventListener('click', handleGlobalDismiss, { capture: true });
      window.removeEventListener('pointerdown', handleGlobalDismiss, { capture: true });
    };
  }, [error, clearError]);

  const sizeDimensions = {
    sm: { button: 'w-10 h-10', icon: 16, sphere: 36 },
    md: { button: 'w-12 h-12', icon: 20, sphere: 44 },
    lg: { button: 'w-14 h-14', icon: 24, sphere: 52 },
  };

  const currentSize = sizeDimensions[size] || sizeDimensions.md;

  if (!isSupported) {
    return null;
  }

  // Динамическое масштабирование и свечение
  const dynamicScale = isRecording ? 1 + audioLevel * 0.45 : isRecognizing ? 1.05 : 1;
  const glowShadow = isRecording
    ? `0 0 ${16 + audioLevel * 25}px rgba(153, 208, 55, ${0.7 + audioLevel * 0.3}), inset 0 0 12px rgba(255, 255, 255, 0.9)`
    : isRecognizing
    ? '0 0 20px rgba(153, 208, 55, 0.6), inset 0 0 8px rgba(255, 255, 255, 0.7)'
    : '0 0 10px rgba(153, 208, 55, 0.25), inset 0 0 6px rgba(255, 255, 255, 0.4)';

  return (
    <>
      <div
        ref={wrapperRef}
        className={`relative inline-flex items-center justify-center select-none ${className}`}
      >
        {/* Внешние звуковые кольца во время записи */}
        <AnimatePresence>
          {isRecording && (
            <>
              {/* Кольцо 1 */}
              <motion.div
                initial={{ scale: 0.9, opacity: 0.8 }}
                animate={{
                  scale: [1, 1.6 + audioLevel * 0.5, 1.8 + audioLevel * 0.8],
                  opacity: [0.8, 0.35, 0]
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: 'easeOut'
                }}
                className="absolute inset-0 rounded-full border border-primary pointer-events-none"
                style={{
                  boxShadow: '0 0 16px rgba(153, 208, 55, 0.6)'
                }}
              />

              {/* Кольцо 2 */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0.6 }}
                animate={{
                  scale: [1, 1.4 + audioLevel * 0.3, 1.6 + audioLevel * 0.5],
                  opacity: [0.6, 0.2, 0]
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 1.6,
                  delay: 0.4,
                  repeat: Infinity,
                  ease: 'easeOut'
                }}
                className="absolute inset-0 rounded-full border border-primary/60 pointer-events-none"
              />
            </>
          )}
        </AnimatePresence>

        {/* Кнопка-сфера Liquid Glass Apple */}
        <motion.button
          type="button"
          onClick={toggleListening}
          disabled={disabled || isRecognizing}
          title={isRecording ? '⏹️ Остановить запись' : isRecognizing ? 'Распознавание...' : tooltip}
          aria-label={isRecording ? 'Остановить запись' : tooltip}
          animate={{
            scale: dynamicScale
          }}
          transition={{ type: 'spring', stiffness: 350, damping: 20 }}
          className={`relative ${currentSize.button} rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed z-10 overflow-visible`}
          style={{
            background: isRecording
              ? 'radial-gradient(circle at 35% 30%, rgba(153, 208, 55, 0.95) 0%, rgba(131, 196, 46, 0.85) 55%, rgba(65, 110, 20, 0.7) 100%)'
              : isRecognizing
              ? 'radial-gradient(circle at 35% 30%, rgba(153, 208, 55, 0.6) 0%, rgba(131, 196, 46, 0.4) 60%, rgba(255, 255, 255, 0.1) 100%)'
              : 'radial-gradient(circle at 35% 30%, rgba(153, 208, 55, 0.25) 0%, rgba(131, 196, 46, 0.12) 60%, rgba(255, 255, 255, 0.06) 100%)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: isRecording
              ? '1.5px solid rgba(255, 255, 255, 0.95)'
              : isRecognizing
              ? '1.5px solid rgba(153, 208, 55, 0.8)'
              : '1px solid rgba(153, 208, 55, 0.45)',
            boxShadow: glowShadow
          }}
        >
          {/* Верхний 3D блик */}
          <span
            className="absolute rounded-full bg-white/80 pointer-events-none"
            style={{
              top: '12%',
              left: '16%',
              width: '28%',
              height: '24%',
              filter: 'blur(0.4px)',
              transform: 'rotate(-25deg)'
            }}
          />

          {/* Орбитальная подсветка при активности */}
          {(isRecording || isRecognizing) && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: isRecognizing ? 1.5 : 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-[-4px] rounded-full pointer-events-none"
            >
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#fff]" />
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(153,208,55,1)]" />
            </motion.div>
          )}

          {/* Иконка статуса */}
          <div className={`relative z-20 flex items-center justify-center transition-colors ${
            isRecording ? 'text-black' : 'text-primary'
          }`}>
            {isRecording ? (
              <Square size={currentSize.icon - 2} className="fill-black" />
            ) : isRecognizing ? (
              <Loader2 size={currentSize.icon} className="animate-spin text-primary" />
            ) : (
              <Mic size={currentSize.icon} />
            )}
          </div>
        </motion.button>

        {/* Плашка статуса во время записи и распознавания (строго в рамках внешнего контейнера и экрана) */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              style={{ maxWidth: `${popupMaxWidth}px` }}
              className={`absolute bottom-full mb-2 z-30 pointer-events-none w-max ${
                popupAlign === 'right' ? 'right-0 left-auto' : 'left-0 right-auto'
              }`}
            >
              <BubbleElement
                isBadge={true}
                className="w-max max-w-full whitespace-normal rounded-2xl px-3 py-1.5 text-sm font-semibold text-primary border border-primary/40 bg-transparent backdrop-blur-2xl shadow-xl flex items-center gap-2 text-left"
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(153,208,55,1)] animate-ping shrink-0" />
                  <span className="break-words leading-snug">Идет запись... {recordingSeconds}с</span>
                </span>
              </BubbleElement>
            </motion.div>
          )}

          {isRecognizing && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              style={{ maxWidth: `${popupMaxWidth}px` }}
              className={`absolute bottom-full mb-2 z-30 pointer-events-none w-max ${
                popupAlign === 'right' ? 'right-0 left-auto' : 'left-0 right-auto'
              }`}
            >
              <BubbleElement
                isBadge={true}
                className="w-max max-w-full whitespace-normal rounded-2xl px-3 py-1.5 text-sm font-semibold text-primary border border-primary/40 bg-transparent backdrop-blur-2xl shadow-xl flex items-center gap-2 text-left"
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <Loader2 size={16} className="animate-spin text-primary shrink-0" />
                  <span className="break-words leading-snug">
                    {statusLabel || `Распознавание (${recognitionSeconds}с)`}
                  </span>
                </span>
              </BubbleElement>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                clearError();
              }}
              style={{ maxWidth: `${popupMaxWidth}px` }}
              className={`absolute top-full mt-2 z-30 w-72 p-3 rounded-2xl border border-amber-500/40 bg-transparent backdrop-blur-2xl text-amber-300 shadow-2xl flex flex-col gap-1.5 cursor-pointer hover:border-amber-500/70 transition-all text-left ${
                popupAlign === 'right' ? 'right-0 left-auto' : 'left-0 right-auto'
              }`}
              title="Нажмите, чтобы закрыть"
            >
              <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 pb-1">
                <div className="flex items-center gap-1.5 text-sm font-bold text-amber-400 min-w-0">
                  <AlertCircle size={16} className="shrink-0 text-amber-400" />
                  <span className="break-words">{errorStep || 'Шаг: Распознавание'}</span>
                </div>
                <span className="text-sm text-foreground/50 hover:text-foreground shrink-0">✕</span>
              </div>
              <div className="text-sm font-semibold text-foreground/95 leading-tight break-words">
                {error}
              </div>
              {errorReason && (
                <div className="text-sm text-foreground/75 leading-normal font-normal break-words">
                  {errorReason}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Модальное окно двойного UX и инструкция при ограничении доступа */}
      <MicrophonePermissionModal
        isOpen={isPermissionModalOpen}
        mode={permissionModalMode}
        errorType={permissionErrorType}
        errorMessage={permissionErrorMessage}
        onAllow={requestPermissionAndStart}
        onRetry={retryPermission}
        onCancel={closePermissionModal}
      />
    </>
  );
};
