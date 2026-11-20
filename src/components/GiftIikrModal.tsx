import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { LeafButton } from './ui/LeafButton';
import { BubbleCurrencyIcon } from './BubbleIcon';
import { UserAvatar } from './UserAvatar';
import { audioSystem } from '../hooks/useSound';

interface GiftIikrModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    uid: string;
    display_name?: string;
    balance?: number;
  };
  targetUser: {
    uid: string;
    display_name?: string;
    username?: string;
    avatar_url?: string | null;
    photo_url?: string | null;
    telegram_photo?: string | null;
  };
  onSuccess?: (newBalance: number) => void;
}

export const GiftIikrModal: React.FC<GiftIikrModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  targetUser,
  onSuccess
}) => {
  const [amount, setAmount] = useState<number>(10);
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      audioSystem.playSlot('ui_modal_open');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentBalance = currentUser.balance || 0;
  const quickAmounts = [5, 10, 25, 50, 100];

  const handleSendGift = async () => {
    setError(null);
    if (!amount || amount <= 0) {
      setError('Укажите корректную сумму подарка (минимум 1 ИИкра)');
      audioSystem.playSlot('ui_error_alert');
      return;
    }
    if (amount > currentBalance) {
      setError(`Недостаточно средств. Ваш баланс: ${currentBalance} ИИкр`);
      audioSystem.playSlot('ui_insufficient_balance');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/users/gift-iikr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-uid': currentUser.uid
        },
        body: JSON.stringify({
          target_uid: targetUser.uid,
          amount,
          message: message.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось отправить подарок');
      }

      audioSystem.playSlot('ui_iikr_gift_send');
      setSuccessResult(data.message || 'Подарок успешно отправлен другу!');
      if (onSuccess && typeof data.new_balance === 'number') {
        onSuccess(data.new_balance);
      }
      window.dispatchEvent(new CustomEvent('balance_updated', {
        detail: {
          balance: data.new_balance,
          balance_gift: data.balance_gift,
          balance_out: data.balance_out
        }
      }));
    } catch (err: any) {
      audioSystem.playSlot('ui_error_alert');
      setError(err.message || 'Ошибка отправки подарка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div 
        id="gift-iikr-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-transparent backdrop-blur-md overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget && !loading) {
            onClose();
          }
        }}
      >
        <motion.div
          id="gift-iikr-modal-container"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md rounded-3xl border border-primary/25 bg-background/30 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-primary/15 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-sm">
                <Gift size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Подарить ИИрки</h3>
                <p className="text-xs text-foreground/60">Перевод ИИрок со своего баланса другу</p>
              </div>
            </div>
            <button
              id="gift-iikr-close-btn"
              onClick={onClose}
              disabled={loading}
              className="p-1.5 rounded-xl border border-primary/20 bg-background/40 hover:bg-primary/15 text-foreground/70 hover:text-foreground transition-all"
            >
              <X size={18} />
            </button>
          </div>

          {/* Success State */}
          {successResult ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 text-primary flex items-center justify-center mx-auto shadow-lg shadow-primary/15">
                <CheckCircle2 size={32} />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-foreground">Подарок успешно отправлен!</h4>
                <p className="text-sm text-foreground/75">{successResult}</p>
              </div>
              <div className="pt-2">
                <LeafButton
                  id="gift-iikr-finish-btn"
                  variant="primary"
                  size="md"
                  onClick={onClose}
                  className="w-full justify-center"
                >
                  <span>Отлично</span>
                </LeafButton>
              </div>
            </div>
          ) : (
            <>
              {/* Recipient info */}
              <div className="p-3.5 rounded-2xl border border-primary/20 bg-background/25 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    avatarUrl={targetUser.avatar_url || targetUser.photo_url || targetUser.telegram_photo}
                    displayName={targetUser.display_name || targetUser.username || 'Друг'}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {targetUser.display_name || targetUser.username || 'Друг'}
                    </p>
                    <p className="text-xs text-foreground/60 font-mono">
                      UID: {targetUser.uid}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-foreground/60">Ваш баланс</p>
                  <p className="text-sm font-bold text-primary flex items-center justify-end gap-1">
                    {currentBalance} <BubbleCurrencyIcon className="w-3.5 h-3.5" />
                  </p>
                </div>
              </div>

              {/* Error Box */}
              {error && (
                <div className="p-3 rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Amount Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground/75 block">
                  Количество ИИрок для подарка:
                </label>
                <div className="relative">
                  <input
                    id="gift-iikr-amount-input"
                    type="number"
                    min="1"
                    max={currentBalance}
                    value={amount || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setAmount(isNaN(val) ? 0 : val);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-primary/25 bg-background/40 text-foreground text-sm font-bold focus:outline-none focus:border-primary placeholder:text-foreground/40 pr-10"
                    placeholder="10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <BubbleCurrencyIcon className="w-4 h-4 text-primary" />
                  </div>
                </div>

                {/* Quick select buttons */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {quickAmounts.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setAmount(q)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all border ${
                        amount === q
                          ? 'bg-primary text-background border-primary shadow-sm'
                          : 'bg-background/25 border-primary/20 text-foreground/75 hover:bg-primary/10'
                      }`}
                    >
                      +{q}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAmount(currentBalance)}
                    disabled={currentBalance <= 0}
                    className="px-2.5 py-1 rounded-xl text-xs font-bold transition-all border bg-background/25 border-primary/20 text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    Все ({currentBalance})
                  </button>
                </div>
              </div>

              {/* Message Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground/75 block">
                  Текст пожелания (необязательно):
                </label>
                <textarea
                  id="gift-iikr-message-input"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={160}
                  placeholder="Держи ИИрки на победу в квизе! 🎉"
                  className="w-full px-3.5 py-2 rounded-2xl border border-primary/25 bg-background/40 text-foreground text-xs focus:outline-none focus:border-primary placeholder:text-foreground/40 resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <LeafButton
                  id="gift-iikr-cancel-btn"
                  variant="glass"
                  size="md"
                  onClick={onClose}
                  disabled={loading}
                >
                  <span>Отмена</span>
                </LeafButton>

                <LeafButton
                  id="gift-iikr-submit-btn"
                  variant="primary"
                  size="md"
                  onClick={handleSendGift}
                  disabled={loading || amount <= 0 || amount > currentBalance}
                  icon={loading ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}
                >
                  <span>{loading ? 'Отправка...' : `Подарить ${amount} ИИкр`}</span>
                </LeafButton>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
