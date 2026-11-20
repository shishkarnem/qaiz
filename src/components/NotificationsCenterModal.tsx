import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  X, 
  CheckCheck, 
  RefreshCcw, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Gift, 
  Sparkles, 
  Trash2, 
  Loader2, 
  CheckCircle2, 
  Search,
  ListFilter,
  Clock
} from 'lucide-react';
import { AppNotification, NotificationModal } from './NotificationModal';
import { BubbleCurrencyIcon } from './BubbleIcon';
import { BubbleElement } from './ui/BubbleElement';

interface NotificationsCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onUnreadCountChange?: (count: number) => void;
}

export const NotificationsCenterModal: React.FC<NotificationsCenterModalProps> = ({
  isOpen,
  onClose,
  userId,
  onUnreadCountChange
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'income' | 'expense'>('all');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedDetail, setSelectedDetail] = useState<AppNotification | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchNotifications = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const unreadParam = filter === 'unread' ? 'true' : 'false';
      const res = await fetch(
        `/api/notifications?user_id=${userId}&limit=50&offset=0&unread_only=${unreadParam}`
      );
      if (!res.ok) throw new Error('Не удалось загрузить уведомления');

      const data = await res.json();
      const items: AppNotification[] = data.data || [];
      setNotifications(items);
      const unread = data.unread_count || 0;
      setUnreadCount(unread);
      if (onUnreadCountChange) {
        onUnreadCountChange(unread);
      }
    } catch (err: any) {
      console.error('Ошибка загрузки уведомлений:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      fetchNotifications();
    }
  }, [isOpen, userId, filter]);

  if (!isOpen) return null;

  const handleMarkAllAsRead = async () => {
    if (!userId) return;
    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, all: true })
      });

      if (!res.ok) throw new Error('Ошибка сервера');

      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
      if (onUnreadCountChange) onUnreadCountChange(0);
      setStatusMsg({ type: 'success', text: 'Все уведомления прочитаны' });
      setTimeout(() => setStatusMsg(null), 2500);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Ошибка обновления' });
    }
  };

  const handleClickItem = (notif: AppNotification) => {
    if (notif.is_read === 0) {
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: 1 } : n));
      const nextUnread = Math.max(0, unreadCount - 1);
      setUnreadCount(nextUnread);
      if (onUnreadCountChange) onUnreadCountChange(nextUnread);

      fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notif.id })
      }).catch(err => console.error('Error marking read:', err));
    }

    setSelectedDetail({ ...notif, is_read: 1 });
  };

  const handleDeleteItem = async (id: number) => {
    try {
      await fetch('/api/notifications/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (selectedDetail?.id === id) {
        setSelectedDetail(null);
      }
    } catch (err) {
      console.error('Ошибка удаления уведомления:', err);
    }
  };

  const isNotifFailedPayment = (notif: AppNotification) => {
    const t = String(notif.type || '').toLowerCase();
    const txt = `${notif.title || ''} ${notif.message || ''}`.toLowerCase();
    return (
      t === 'payment_failed' ||
      t.includes('fail') ||
      txt.includes('неудачная попытка оплаты') ||
      txt.includes('платеж отменен или отклонен')
    );
  };

  const filteredItems = notifications.filter(n => {
    const failed = isNotifFailedPayment(n);
    if (filter === 'income' && (Number(n.amount) < 0 || failed)) return false;
    if (filter === 'expense' && (Number(n.amount) >= 0 && !failed)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.message && n.message.toLowerCase().includes(q)) ||
      (n.type && n.type.toLowerCase().includes(q))
    );
  });

  const getItemIcon = (notif: AppNotification) => {
    if (isNotifFailedPayment(notif)) {
      return <ArrowUpRight size={16} className="text-rose-400" />;
    }
    const isPositive = Number(notif.amount) >= 0;
    switch (notif.type) {
      case 'deposit':
      case 'topup':
        return <ArrowDownLeft size={16} className="text-emerald-400" />;
      case 'spend':
      case 'game_fee':
        return <ArrowUpRight size={16} className="text-rose-400" />;
      case 'ref_bonus':
      case 'referral':
        return <Gift size={16} className="text-primary" />;
      case 'admin':
      case 'admin_manual':
        return <Sparkles size={16} className="text-amber-400" />;
      default:
        return isPositive ? <ArrowDownLeft size={16} className="text-emerald-400" /> : <ArrowUpRight size={16} className="text-rose-400" />;
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-transparent backdrop-blur-2xl animate-fade-in"
        onClick={onClose}
      >
        <div 
          className="w-full max-w-xl rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.75),0_0_25px_rgba(153,208,55,0.18)] flex flex-col max-h-[85vh] text-foreground relative overflow-hidden min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Compact Top Header + Proportional 7-Icon Filters Row */}
          <div className="p-3 sm:p-4 border-b border-primary/20 bg-transparent backdrop-blur-xl space-y-2.5">
            {/* Row 1: Modal Title + Count on Left, Close Button on Right */}
            <div className="flex items-center justify-between gap-2 w-full min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 rounded-xl bg-transparent backdrop-blur-md border border-primary/30 text-primary shrink-0">
                  <Bell size={18} />
                </div>
                <h3 className="text-base sm:text-lg font-black text-foreground truncate">
                  Уведомления
                </h3>
                {unreadCount > 0 && (
                  <BubbleElement size="sm" isBadge active className="!px-2.5 !py-0.5 text-sm font-black shrink-0">
                    {unreadCount}
                  </BubbleElement>
                )}
              </div>

              <BubbleElement
                size="sm"
                onClick={onClose}
                icon={<X size={16} />}
                className="!px-2.5 !py-1.5 shrink-0"
                title="Закрыть"
              />
            </div>

            {/* Row 2: 7 Filter & Action Icons in Proportional Widths (100% / 7 each, no horizontal scroll) */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 w-full">
              <BubbleElement
                size="sm"
                active={filter === 'all'}
                onClick={() => setFilter('all')}
                icon={<ListFilter size={15} />}
                className="w-full !px-0 !py-2 justify-center min-w-0"
                title="Все уведомления"
              />
              <BubbleElement
                size="sm"
                active={filter === 'unread'}
                onClick={() => setFilter(prev => prev === 'unread' ? 'all' : 'unread')}
                icon={<Bell size={15} />}
                className="w-full !px-0 !py-2 justify-center min-w-0"
                title="Непрочитанные"
              />
              <BubbleElement
                size="sm"
                active={filter === 'income'}
                onClick={() => setFilter(prev => prev === 'income' ? 'all' : 'income')}
                icon={<ArrowDownLeft size={15} />}
                className="w-full !px-0 !py-2 justify-center min-w-0"
                title="Начисления и бонусы"
              />
              <BubbleElement
                size="sm"
                active={filter === 'expense'}
                onClick={() => setFilter(prev => prev === 'expense' ? 'all' : 'expense')}
                icon={<ArrowUpRight size={15} />}
                className="w-full !px-0 !py-2 justify-center min-w-0"
                title="Списания"
              />
              <BubbleElement
                size="sm"
                active={isSearchOpen || Boolean(searchQuery.trim())}
                onClick={() => {
                  setIsSearchOpen(prev => {
                    if (prev) setSearchQuery('');
                    return !prev;
                  });
                }}
                icon={<Search size={15} />}
                className="w-full !px-0 !py-2 justify-center min-w-0"
                title="Поиск"
              />
              <BubbleElement
                size="sm"
                active={false}
                disabled={unreadCount === 0}
                onClick={handleMarkAllAsRead}
                icon={<CheckCheck size={15} />}
                className={`w-full !px-0 !py-2 justify-center min-w-0 ${unreadCount === 0 ? 'opacity-45 cursor-default' : ''}`}
                title="Прочитать все"
              />
              <BubbleElement
                size="sm"
                onClick={() => fetchNotifications()}
                icon={<RefreshCcw size={15} className={loading ? 'animate-spin' : ''} />}
                className="w-full !px-0 !py-2 justify-center min-w-0"
                title="Обновить"
              />
            </div>

            {/* Collapsible Search Bar */}
            {isSearchOpen && (
              <div className="relative w-full">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary/70" />
                <input
                  type="text"
                  placeholder="Поиск по тексту уведомления..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Status Message */}
          {statusMsg && (
            <div className={`mx-3.5 mt-2.5 p-2.5 rounded-2xl text-sm font-medium flex items-center gap-2 bg-transparent backdrop-blur-xl border ${
              statusMsg.type === 'success'
                ? 'text-emerald-300 border-emerald-500/35'
                : 'text-rose-300 border-rose-500/35'
            }`}>
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Compact Modal Body: Notifications List */}
          <div className="p-2.5 sm:p-3.5 overflow-y-auto overflow-x-hidden flex-1 space-y-2 custom-scrollbar min-w-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2.5">
                <Loader2 className="animate-spin text-primary" size={28} />
                <p className="text-sm text-foreground/65">Загрузка...</p>
              </div>
            ) : filteredItems.length > 0 ? (
              <div className="space-y-2">
                {filteredItems.map((notif, notifIdx) => {
                  const isFailed = isNotifFailedPayment(notif);
                  const isPositive = !isFailed && Number(notif.amount) >= 0;
                  const numAmount = Math.abs(Number(notif.amount) || 0);
                  const isUnread = notif.is_read === 0;
                  const dateStr = new Date(notif.created_at || Date.now()).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  const headerTitle =
                    notif.title?.trim() ||
                    (isFailed
                      ? 'Неудачная попытка оплаты'
                      : notif.type === 'deposit' || notif.type === 'topup'
                      ? 'Пополнение баланса'
                      : notif.type === 'spend' || notif.type === 'game_fee'
                      ? 'Списание с баланса'
                      : notif.type === 'ref_bonus' || notif.type === 'referral'
                      ? 'Реферальный бонус'
                      : 'Уведомление');
                  const mainText = notif.message || notif.title || 'Системное уведомление';

                  return (
                    <div
                      key={`notif-modal-${notif.id || notifIdx}-${notifIdx}`}
                      onClick={() => handleClickItem(notif)}
                      className={`p-3 sm:p-3.5 rounded-2xl border bg-transparent backdrop-blur-xl flex flex-col gap-2 cursor-pointer transition-all hover:border-primary/50 w-full min-w-0 ${
                        isFailed
                          ? 'border-rose-500/35'
                          : isUnread
                          ? 'border-primary/45 shadow-[0_0_14px_rgba(153,208,55,0.15)]'
                          : 'border-primary/20'
                      }`}
                    >
                      {/* Row 1: Icon + Notification Title on Left | Amount + Delete Icon on Right */}
                      <div className="flex items-center justify-between gap-2 w-full min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`p-1.5 sm:p-2 rounded-xl border bg-transparent backdrop-blur-md shrink-0 ${
                            isFailed
                              ? 'border-rose-500/35 text-rose-400'
                              : isPositive 
                              ? 'border-emerald-500/35 text-emerald-400' 
                              : 'border-rose-500/35 text-rose-400'
                          }`}>
                            {getItemIcon(notif)}
                          </div>

                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-sm leading-tight break-words ${isFailed ? 'font-black text-rose-300' : isUnread ? 'font-black text-primary' : 'font-bold text-foreground/90'}`}>
                              {headerTitle}
                            </span>
                            {isUnread && (
                              <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                            )}
                          </div>
                        </div>

                        {/* Right of Title: Amount Badge + Delete Icon Bubble */}
                        <div className="shrink-0 flex items-center gap-1.5">
                          {isFailed ? (
                            <BubbleElement
                              size="sm"
                              isBadge
                              className="!px-2 !py-0.5 text-sm font-black shrink-0 border-rose-500/40 text-rose-300"
                            >
                              Не оплачено
                            </BubbleElement>
                          ) : (
                            numAmount > 0 && (
                              <BubbleElement
                                size="sm"
                                isBadge
                                className={`!px-2 !py-0.5 text-sm font-black font-mono shrink-0 ${
                                  isPositive
                                    ? 'border-emerald-500/40 text-emerald-300'
                                    : 'border-rose-500/40 text-rose-300'
                                }`}
                              >
                                <span className="inline-flex items-center gap-1">
                                  <span>{isPositive ? `+${numAmount}` : `-${numAmount}`}</span>
                                  <BubbleCurrencyIcon className="w-3.5 h-3.5 inline shrink-0" />
                                </span>
                              </BubbleElement>
                            )
                          )}

                          <BubbleElement
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteItem(notif.id);
                            }}
                            icon={<Trash2 size={14} />}
                            className="!px-2 !py-1 shrink-0"
                            title="Удалить уведомление"
                          />
                        </div>
                      </div>

                      {/* Row 2: Notification Text Spanning Full Width */}
                      <p className={`w-full text-sm leading-snug break-words ${isUnread ? 'font-semibold text-foreground' : 'text-foreground/85'}`}>
                        {mainText}
                      </p>

                      {/* Row 3: Date in Bottom-Right Corner */}
                      <div className="flex items-center justify-end gap-1.5 w-full text-sm text-foreground/60 font-mono">
                        <Clock size={13} className="text-primary/70 shrink-0" />
                        <span>{dateStr}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-foreground/60 rounded-2xl border border-primary/15 bg-transparent backdrop-blur-xl text-center p-4">
                <Bell size={32} className="mb-2 opacity-50 text-primary" />
                <p className="text-sm font-bold text-foreground/85">Уведомлений нет</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Individual Detail Modal when an item is selected */}
      {selectedDetail && (
        <NotificationModal
          notification={selectedDetail}
          onClose={() => setSelectedDetail(null)}
          onDelete={(id) => {
            handleDeleteItem(id);
            setSelectedDetail(null);
          }}
        />
      )}
    </>
  );
};
