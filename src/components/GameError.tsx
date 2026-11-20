import React from 'react';
import { motion } from 'motion/react';
import { AlertCircle, RotateCcw, Home, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LeafButton } from './ui/LeafButton';

interface GameErrorProps {
  message?: string;
  onRetry: () => void;
  onReturn?: () => void;
  returnText?: string;
}

export function GameError({ message, onRetry, onReturn, returnText = 'Вернуться' }: GameErrorProps) {
  const navigate = useNavigate();

  const handleReturn = () => {
    if (onReturn) {
      onReturn();
    } else {
      navigate('/');
    }
  };

  const isQuotaError = message?.includes('429') || message?.toLowerCase().includes('quota') || message?.includes('RESOURCE_EXHAUSTED');

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto max-w-lg rounded-3xl border border-amber-500/30 bg-transparent backdrop-blur-2xl p-8 text-center shadow-2xl"
    >
      <div className="mb-6 flex justify-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-transparent text-amber-400 border border-amber-500/40 backdrop-blur-md">
          <AlertCircle size={44} />
        </div>
      </div>
      
      <h2 className="text-2xl sm:text-3xl font-black text-amber-400">
        {isQuotaError ? 'Лимит ИИ исчерпан' : 'Ой! Ошибка ИИ'}
      </h2>
      <p className="mt-4 text-sm sm:text-base text-foreground/80 leading-relaxed font-medium">
        {isQuotaError 
          ? 'К сожалению, в данный момент ИИ перегружен или достигнут лимит запросов. Пожалуйста, попробуйте через минуту. Средства возвращены на ваш баланс.'
          : (message || 'Произошла ошибка при генерации вопросов. Потраченные средства возвращены на ваш баланс.')}
      </p>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row">
        <LeafButton
          variant="primary"
          size="md"
          onClick={onRetry}
          icon={<RotateCcw size={20} />}
          className="flex-1 justify-center text-sm font-bold"
        >
          Повторить
        </LeafButton>
        <LeafButton
          variant="glass"
          size="md"
          onClick={handleReturn}
          icon={returnText === 'Отменить' ? <X size={20} /> : <Home size={20} />}
          className="flex-1 justify-center text-sm font-bold"
        >
          {returnText}
        </LeafButton>
      </div>
    </motion.div>
  );
}
