import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CreditCard, Users, Gift, X, ChevronRight, Gamepad2 } from 'lucide-react';
import { useFrogSound, audioSystem } from '../hooks/useSound';
import { BubbleCurrencyIcon } from './BubbleIcon';
import { formatIikr, getIikrWord } from '../lib/currency';
import { LeafButton } from './ui/LeafButton';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  requiredAmount: number;
  currentBalance: number;
  actionDescription?: string;
}

export function InsufficientBalanceModal({
  isOpen,
  onClose,
  requiredAmount,
  currentBalance,
  actionDescription
}: Props) {
  const navigate = useNavigate();
  const { playCroak } = useFrogSound();

  useEffect(() => {
    if (isOpen) {
      audioSystem.playSlot('ui_insufficient_balance');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const diff = Math.max(0, requiredAmount - currentBalance);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-y-auto bg-transparent backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg p-6 sm:p-8 rounded-[2rem] border border-primary/35 bg-transparent backdrop-blur-2xl text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.6)] my-auto animate-in zoom-in-95 duration-200">
        <button
          onClick={() => {
            playCroak();
            onClose();
          }}
          className="absolute right-5 top-5 p-2 rounded-xl text-foreground/70 hover:bg-primary/10 hover:text-primary transition-colors"
          title="Закрыть"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 rounded-3xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-[0_0_20px_rgba(153,208,55,0.3)] mb-4">
            <CreditCard size={30} />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">
            Недостаточно {getIikrWord(diff || requiredAmount)}
          </h2>
          <p className="mt-2 text-sm text-foreground/80 leading-relaxed">
            {actionDescription ? (
              <>{actionDescription}. Требуется <strong className="text-primary font-black">{formatIikr(requiredAmount)}</strong>. На вашем балансе сейчас <strong className="text-foreground font-black">{formatIikr(currentBalance)}</strong> (не хватает {formatIikr(diff)}).</>
            ) : (
              <>Для действия требуется <strong className="text-primary font-black">{formatIikr(requiredAmount)}</strong>. На вашем балансе сейчас <strong className="text-foreground font-black">{formatIikr(currentBalance)}</strong> (не хватает {formatIikr(diff)}).</>
            )}
          </p>
        </div>

        {/* Free games prompt leaf block */}
        <div className="mb-6 p-4 rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl space-y-3">
          <div className="flex items-center gap-2.5 text-primary text-sm font-bold">
            <Gamepad2 size={20} className="shrink-0" />
            <span>Не хотите тратить ИИкру? Играйте бесплатно!</span>
          </div>
          <p className="text-sm text-foreground/75 leading-relaxed">
            В режиме «Freeлионер» доступны все сыгранные викторины без списания баланса и без ограничений по времени.
          </p>
          <LeafButton
            variant="primary"
            size="md"
            onClick={() => {
              playCroak();
              onClose();
              navigate('/free');
            }}
            icon={<Gamepad2 size={18} />}
            className="w-full justify-center text-sm font-bold"
          >
            Перейти к бесплатным играм (Freeлионер)
          </LeafButton>
        </div>

        {/* Ways to get balance */}
        <div className="space-y-3 mb-6">
          <div className="text-sm font-bold text-primary flex items-center gap-1.5 px-1">
            <Gift size={18} />
            Способы пополнить баланс и получить ИИкру:
          </div>

          <button
            onClick={() => {
              playCroak();
              onClose();
              navigate('/profile/exchange');
            }}
            className="w-full text-left p-3.5 rounded-2xl bg-transparent hover:bg-primary/10 border border-primary/30 backdrop-blur-md transition-all flex items-center justify-between group shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
                <CreditCard size={20} />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                  Пополнить баланс ИИкры
                  <BubbleCurrencyIcon className="w-4 h-4 inline" />
                </div>
                <div className="text-sm text-foreground/70">
                  Накопительные скидки и бонусы
                </div>
              </div>
            </div>
            <ChevronRight size={18} className="text-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </button>

          <button
            onClick={() => {
              playCroak();
              onClose();
              navigate('/profile/ref');
            }}
            className="w-full text-left p-3.5 rounded-2xl bg-transparent hover:bg-primary/10 border border-primary/20 backdrop-blur-md transition-all flex items-center justify-between group shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
                <Users size={20} />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                  Пригласить друзей (+300 {getIikrWord(300)})
                </div>
                <div className="text-sm text-foreground/70">
                  Получайте по +300 {getIikrWord(300)} за каждого нового игрока
                </div>
              </div>
            </div>
            <ChevronRight size={18} className="text-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <button
            onClick={() => {
              playCroak();
              onClose();
              navigate('/profile/exchange');
            }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold bg-primary text-black hover:brightness-110 shadow-[0_0_20px_rgba(153,208,55,0.35)] hover:scale-[1.02] transition-all"
          >
            <CreditCard size={18} />
            Пополнить баланс в магазине
          </button>

          <button
            onClick={() => {
              playCroak();
              onClose();
            }}
            className="w-full text-center py-2 text-sm text-foreground/70 hover:text-foreground transition-colors"
          >
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}
