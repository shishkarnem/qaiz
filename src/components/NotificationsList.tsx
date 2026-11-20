import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  CheckCheck, 
  RefreshCcw, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Gift, 
  Sparkles, 
  Clock, 
  Loader2, 
  CheckCircle2,
  ChevronRight,
  Filter,
  Inbox,
  Settings
} from 'lucide-react';
import { AppNotification } from './NotificationModal';
import { BubbleCurrencyIcon } from './BubbleIcon';
import { getIikrWord } from '../lib/currency';
import { BubbleElement } from './ui/BubbleElement';
import { LeafButton } from './ui/LeafButton';
import { NotificationSettingsModal } from './NotificationSettingsModal';

interface NotificationsListProps {
  userId: string;
  onSelectNotification: (notif: AppNotification) => void;
  onUnreadCountChange?: (count: number) => void;
}

export const NotificationsList: React.FC<NotificationsListProps> = ({
  userId,
  onSelectNotification,
  onUnreadCountChange
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalAllCount, setTotalAllCount] = useState(0);
  const [readCount, setReadCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const fetchNotifications = async (reset = false) => {
    if (!userId) return;
    if (reset) {
      setLoading(true);
      setOffset(0);
    } else {
      setLoadingMore(true);
    }

    try {
      const currentOffset = reset ? 0 : offset;
      const unreadParam = filter === 'unread' ? 'true' : 'false';
      const res = await fetch(
        `/api/notifications?user_id=${userId}&limit=20&offset=${currentOffset}&unread_only=${unreadParam}`
      );

      if (!res.ok) throw new Error('Не удалось загрузить уведомления');

      const data = await res.json();
      const items: AppNotification[] = data.data || [];

      if (reset) {
        setNotifications(items);
      } else {
        setNotifications(prev => [...prev, ...items]);
      }

      const totAll = data.total_all ?? data.total ?? 0;
      const unread = data.unread_count ?? 0;
      const read = data.read_count ?? Math.max(0, totAll - unread);

      setOffset(currentOffset + items.length);
      setHasMore(Boolean(data.has_more));
      setTotalCount(data.total || 0);
      setTotalAllCount(totAll);
      setUnreadCount(unread);
      setReadCount(read);

      if (onUnreadCountChange) {
        onUnreadCountChange(unread);
      }
    } catch (err: any) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchNotifications(true);
  }, [userId, filter]);

  const handleMarkAllAsRead = async () => {
    if (!userId || unreadCount === 0) return;
    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, all: true })
      });

      if (!res.ok) throw new Error('Ошибка сервера');

      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setReadCount(prev => prev + unreadCount);
      setUnreadCount(0);
      if (onUnreadCountChange) onUnreadCountChange(0);
      setStatusMsg({ type: 'success', text: 'Все уведомления отмечены как прочитанные' });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Ошибка обновления' });
    }
  };

  const handleClickItem = (notif: AppNotification) => {
    if (notif.is_read === 0) {
      // Optimistically update
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => {
        const next = Math.max(0, prev - 1);
        if (onUnreadCountChange) onUnreadCountChange(next);
        return next;
      });
      setReadCount(prev => prev + 1);

      // Call API
      fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notif.id })
      }).catch(err => console.error('Error marking read:', err));
    }

    onSelectNotification({ ...notif, is_read: 1 });
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

  const getItemIcon = (notif: AppNotification) => {
    if (isNotifFailedPayment(notif)) {
      return <ArrowUpRight size={18} className="text-rose-400" />;
    }
    const isPositive = Number(notif.amount) >= 0;
    switch (notif.type) {
      case 'deposit':
      case 'topup':
        return <ArrowDownLeft size={18} className="text-emerald-400" />;
      case 'spend':
      case 'game_fee':
        return <ArrowUpRight size={18} className="text-destructive" />;
      case 'ref_bonus':
      case 'referral':
        return <Gift size={18} className="text-primary" />;
      case 'admin':
      case 'admin_manual':
        return <Sparkles size={18} className="text-amber-400" />;
      default:
        return isPositive ? <ArrowDownLeft size={18} className="text-emerald-400" /> : <ArrowUpRight size={18} className="text-destructive" />;
    }
  };

  return (
    <div className="space-y-5 text-sm">
      {/* Header with Title, Filter, Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-primary/15">
        <div>
          <h3 className="text-xl font-black text-foreground flex items-center gap-2.5">
            <Bell size={22} className="text-primary" />
            <span>Уведомления о транзакциях</span>
            {unreadCount > 0 && (
              <BubbleElement isBadge active size="sm" className="text-background font-black">
                {unreadCount} новых
              </BubbleElement>
            )}
          </h3>
          <p className="text-sm text-foreground/70 mt-1">
            История начислений, бонусов и финансовых операций аккаунта
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Filter Tag Cloud */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-background/30 border border-primary/20 p-1 backdrop-blur-md">
            <BubbleElement
              size="sm"
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              title="Показать все уведомления"
            >
              Все
            </BubbleElement>
            <BubbleElement
              size="sm"
              active={filter === 'unread'}
              onClick={() => setFilter('unread')}
              title="Показать только непрочитанные уведомления"
            >
              Непрочитанные
            </BubbleElement>
          </div>

          {/* Settings button */}
          <LeafButton
            variant="glass"
            size="sm"
            onClick={() => setIsSettingsOpen(true)}
            icon={<Settings size={16} />}
            title="Настройки уведомлений и напоминаний"
          >
            Настройки
          </LeafButton>

          {/* Mark all read button */}
          {unreadCount > 0 && (
            <LeafButton
              variant="glass"
              size="sm"
              onClick={handleMarkAllAsRead}
              icon={<CheckCheck size={16} />}
              title="Отметить все как прочитанные"
            >
              Прочитать все
            </LeafButton>
          )}

          {/* Refresh button */}
          <BubbleElement
            size="sm"
            onClick={() => fetchNotifications(true)}
            icon={<RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />}
            title="Обновить список"
          />
        </div>
      </div>

      {/* Notification Statistics (Total, Read, Unread) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div 
          onClick={() => setFilter('all')}
          className={`cursor-pointer rounded-2xl border p-4 backdrop-blur-xl transition-all shadow-sm flex items-center justify-between ${
            filter === 'all' ? 'border-primary/50 bg-primary/10' : 'border-primary/20 bg-transparent hover:border-primary/35'
          }`}
        >
          <div>
            <div className="text-sm font-medium text-foreground/70">Всего уведомлений</div>
            <div className="text-2xl font-black text-foreground mt-0.5">{totalAllCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-primary/15 text-primary">
            <Inbox size={22} />
          </div>
        </div>

        <div 
          onClick={() => setFilter('all')}
          className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 shadow-sm flex items-center justify-between"
        >
          <div>
            <div className="text-sm font-medium text-foreground/70">Прочитано</div>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">{readCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 size={22} />
          </div>
        </div>

        <div 
          onClick={() => setFilter('unread')}
          className={`cursor-pointer rounded-2xl border p-4 backdrop-blur-xl transition-all shadow-sm flex items-center justify-between ${
            filter === 'unread' ? 'border-primary/50 bg-primary/10' : 'border-primary/20 bg-transparent hover:border-primary/35'
          }`}
        >
          <div>
            <div className="text-sm font-medium text-foreground/70">Не прочитано</div>
            <div className="text-2xl font-black text-primary mt-0.5">{unreadCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-primary/15 text-primary">
            <Clock size={22} />
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-2xl text-sm font-medium flex items-center gap-2 border border-white/20 bg-white/5 backdrop-blur-md text-foreground">
          <CheckCircle2 size={16} className="text-primary shrink-0" />
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Notifications List Body */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="animate-spin text-primary" size={32} />
          <p className="text-sm text-foreground/60">Загрузка уведомлений...</p>
        </div>
      ) : notifications.length > 0 ? (
        <div className="space-y-3">
          <div className="divide-y divide-primary/10 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md overflow-hidden shadow-sm">
            {notifications.map((notif, notifIdx) => {
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

              return (
                <div
                  key={`notif-${notif.id || notifIdx}-${notifIdx}`}
                  onClick={() => handleClickItem(notif)}
                  className={`p-4 flex items-center justify-between gap-4 cursor-pointer transition-all hover:border-primary/40 group bg-transparent ${
                    isUnread ? 'border-l-2 border-l-primary' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Unread indicator dot */}
                    <div className="relative shrink-0">
                      <div className={`p-2.5 rounded-xl border bg-transparent backdrop-blur-md ${
                        isFailed ? 'border-rose-500/35 text-rose-400' : 'border-primary/25 text-primary'
                      }`}>
                        {getItemIcon(notif)}
                      </div>
                      {isUnread && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full border-2 border-background animate-pulse" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm truncate ${isFailed ? 'font-black text-rose-300' : isUnread ? 'font-black text-foreground' : 'font-semibold text-foreground/90'}`}>
                          {notif.title || (isFailed ? 'Неудачная попытка оплаты' : 'Уведомление')}
                        </p>
                        {isUnread && (
                          <BubbleElement isBadge size="sm" className="text-sm font-bold text-primary border-primary/35">
                            Новое
                          </BubbleElement>
                        )}
                      </div>
                      <p className="text-sm text-foreground/70 truncate mt-0.5 max-w-md">
                        {notif.message}
                      </p>
                      <span className="text-sm text-foreground/50 flex items-center gap-1 mt-1 font-mono">
                        <Clock size={13} />
                        {dateStr}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <div>
                      {isFailed ? (
                        <span className="text-sm font-black font-mono flex items-center justify-end gap-1 text-rose-300">
                          Не оплачено
                        </span>
                      ) : (
                        <span className="text-sm font-black font-mono flex items-center justify-end gap-1 text-foreground">
                          {isPositive ? `+${numAmount}` : `-${numAmount}`} {getIikrWord(numAmount)}
                          <BubbleCurrencyIcon className="w-4 h-4 inline" />
                        </span>
                      )}
                      <span className="text-sm text-foreground/50 block">
                        Нажмите для деталей
                      </span>
                    </div>
                    <ChevronRight size={18} className="text-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show More Button (Pagination: 20 per page) */}
          {hasMore && (
            <div className="flex justify-center pt-3">
              <LeafButton
                variant="primary"
                size="md"
                onClick={() => fetchNotifications(false)}
                disabled={loadingMore}
                icon={loadingMore ? <Loader2 size={16} className="animate-spin" /> : undefined}
              >
                Показать еще (+20)
              </LeafButton>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-foreground/40 rounded-2xl border border-primary/15 bg-transparent backdrop-blur-md">
          <Bell size={44} className="mb-3 opacity-30 text-primary" />
          <p className="text-sm font-semibold text-foreground/70">
            {filter === 'unread' ? 'У вас нет непрочитанных уведомлений' : 'История уведомлений пуста'}
          </p>
          <p className="text-sm text-foreground/50 mt-1 max-w-xs text-center">
            Здесь будут отображаться оповещения о начислениях, победах и транзакциях
          </p>
        </div>
      )}

      {/* Notification and Reminder Settings Modal */}
      <NotificationSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userId={userId}
      />
    </div>
  );
};
