import React from 'react';
import { 
  X, 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Clock, 
  CheckCircle2, 
  Trash2, 
  Coins, 
  Sparkles,
  Info,
  Gift
} from 'lucide-react';
import { BubbleCurrencyIcon } from './BubbleIcon';
import { getIikrWord } from '../lib/currency';
import { BubbleElement } from './ui/BubbleElement';
import { LeafButton } from './ui/LeafButton';

export interface AppNotification {
  id: number;
  user_id: string;
  type: string;
  title: string;
  message: string;
  amount: number;
  currency: string;
  reference_id?: string;
  is_read: number;
  created_at: string;
}

interface NotificationModalProps {
  notification: AppNotification | null;
  onClose: () => void;
  onDelete?: (id: number) => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  notification,
  onClose,
  onDelete
}) => {
  if (!notification) return null;

  const isFailedPayment =
    notification.type === 'payment_failed' ||
    String(notification.type || '').toLowerCase().includes('fail') ||
    /неудачная попытка оплаты|платеж отменен или отклонен/i.test(
      `${notification.title || ''} ${notification.message || ''}`
    );
  const isPositive = !isFailedPayment && Number(notification.amount) >= 0;
  const numAmount = Math.abs(Number(notification.amount) || 0);
  const formattedDate = new Date(notification.created_at || Date.now()).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const getTypeIcon = () => {
    if (isFailedPayment) {
      return <ArrowUpRight size={22} className="text-rose-400" />;
    }
    switch (notification.type) {
      case 'deposit':
      case 'topup':
        return <ArrowDownLeft size={22} className="text-emerald-400" />;
      case 'spend':
      case 'game_fee':
        return <ArrowUpRight size={22} className="text-destructive" />;
      case 'ref_bonus':
      case 'referral':
        return <Gift size={22} className="text-primary" />;
      case 'admin':
      case 'admin_manual':
        return <Sparkles size={22} className="text-amber-400" />;
      default:
        return isPositive ? <ArrowDownLeft size={22} className="text-emerald-400" /> : <ArrowUpRight size={22} className="text-destructive" />;
    }
  };

  const getTypeBadge = () => {
    if (isFailedPayment) return 'Отказ оплаты';
    switch (notification.type) {
      case 'deposit':
        return 'Пополнение';
      case 'spend':
        return 'Списание';
      case 'ref_bonus':
      case 'referral':
        return 'Партнерский бонус';
      case 'admin':
      case 'admin_manual':
        return 'Администрация';
      case 'game_win':
        return 'Выигрыш в игре';
      default:
        return isPositive ? 'Начисление' : 'Списание';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-transparent backdrop-blur-2xl transition-all animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-[0_16px_48px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col max-h-[85vh] text-foreground relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-2.5 p-4 sm:p-5 border-b border-primary/20 bg-transparent backdrop-blur-xl">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className={`p-2.5 rounded-2xl border bg-transparent backdrop-blur-md shrink-0 ${
              isPositive 
                ? 'border-emerald-500/35 text-emerald-400' 
                : 'border-rose-500/35 text-rose-400'
            }`}>
              {getTypeIcon()}
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="text-base font-black text-foreground break-words leading-snug">
                {notification.title || 'Уведомление'}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-foreground/65 font-mono">
                <Clock size={14} className="text-primary shrink-0" />
                <span>{formattedDate}</span>
              </div>
            </div>
          </div>

          <BubbleElement
            size="sm"
            onClick={onClose}
            icon={<X size={16} />}
            className="p-2 shrink-0"
            title="Закрыть"
          />
        </div>

        {/* Amount Banner (if non-zero) */}
        {numAmount > 0 && (
          <div className="px-4 py-3 mx-4 mt-3.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl flex items-center justify-between gap-2">
            <BubbleElement size="sm" isBadge className="text-sm">
              {getTypeBadge()}
            </BubbleElement>
            <div className="flex items-center gap-1.5">
              <span className={`text-xl font-black font-mono ${
                isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {isPositive ? `+${numAmount}` : `-${numAmount}`}
              </span>
              <BubbleCurrencyIcon className="w-4 h-4 shrink-0" />
            </div>
          </div>
        )}

        {/* Modal Body with Scrollable Area */}
        <div className="overflow-y-auto max-h-[45vh] p-4 sm:p-5 space-y-3 custom-scrollbar text-sm">
          <div className="p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/20 text-sm text-foreground/95 leading-relaxed whitespace-pre-wrap break-words select-text">
            {notification.message || notification.title || 'Операция зафиксирована в системе.'}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 border-t border-primary/20 bg-transparent backdrop-blur-xl">
          {onDelete ? (
            <BubbleElement
              size="sm"
              onClick={() => {
                onDelete(notification.id);
                onClose();
              }}
              icon={<Trash2 size={15} />}
              className="border-rose-500/35 text-rose-400 p-2"
              title="Удалить уведомление"
            />
          ) : <div />}

          <LeafButton
            variant="primary"
            size="sm"
            onClick={onClose}
          >
            Закрыть
          </LeafButton>
        </div>
      </div>
    </div>
  );
};
