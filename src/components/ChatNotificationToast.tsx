import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  MessageSquare,
  Reply,
  X,
  ArrowRight,
  Gamepad2,
  UserPlus,
  Trophy,
  Wallet,
  Bell,
  Gift,
} from 'lucide-react';
import { ChatAlertNotification, resolveChannelKeyForType } from '../services/notificationSettings';
import { UserAvatar } from './UserAvatar';
import { BubbleElement } from './ui/BubbleElement';
import { LeafButton } from './ui/LeafButton';

interface ChatNotificationToastProps {
  alert: ChatAlertNotification;
  index?: number;
  onClose: (id: string) => void;
  onOpenMessage: (alert: ChatAlertNotification) => void;
}

export const ChatNotificationToast: React.FC<ChatNotificationToastProps> = ({
  alert,
  index = 0,
  onClose,
  onOpenMessage,
}) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    setProgress(100);
    const duration = 8500;
    const intervalTime = 60;
    const startTime = Date.now();

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const nextProgress = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(nextProgress);

      if (elapsed >= duration) {
        clearInterval(timer);
        onClose(alert.id);
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [alert.id, onClose]);

  const channelKey = resolveChannelKeyForType(alert.type);
  const avatarUrl = alert.sender_avatar || alert.sender_photo || alert.sender_tg_photo;

  const getChannelMeta = () => {
    switch (channelKey) {
      case 'group_replies':
        return {
          icon: <Reply size={16} />,
          headerTitle: alert.title || 'Ответ в беседе',
          actionLabel: 'Перейти к ответу',
        };
      case 'direct_messages':
        return {
          icon: <MessageSquare size={16} />,
          headerTitle: alert.title || 'Новое личное сообщение',
          actionLabel: 'Открыть диалог',
        };
      case 'game_invites':
        return {
          icon: <Gamepad2 size={16} />,
          headerTitle: alert.title || 'Приглашение в игру',
          actionLabel: 'Перейти к приглашению',
        };
      case 'friend_requests':
        return {
          icon: <UserPlus size={16} />,
          headerTitle: alert.title || 'Друзья и контакты',
          actionLabel: 'Открыть друзей',
        };
      case 'achievements':
        return {
          icon: <Trophy size={16} />,
          headerTitle: alert.title || 'Новое достижение',
          actionLabel: 'Посмотреть профиль',
        };
      case 'transactions':
        return {
          icon: String(alert.type).includes('gift') ? <Gift size={16} /> : <Wallet size={16} />,
          headerTitle: alert.title || 'Операция по балансу',
          actionLabel: 'Открыть баланс',
        };
      default:
        return {
          icon: <Bell size={16} />,
          headerTitle: alert.title || 'Уведомление Квайз',
          actionLabel: 'Открыть уведомления',
        };
    }
  };

  const meta = getChannelMeta();
  const hasSender = Boolean(alert.sender_name || avatarUrl);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -18, scale: 0.94, x: 24 }}
      animate={{ opacity: 1, y: 0, scale: 1 - index * 0.015, x: 0 }}
      exit={{ opacity: 0, y: -14, scale: 0.92, x: 24 }}
      transition={{ type: 'spring', damping: 24, stiffness: 320 }}
      className="w-full pointer-events-auto select-none"
    >
      {/* Apple Liquid Glass Outer Container (Strictly transparent + blur, no solid background fill) */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/45 bg-transparent backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.75)] p-3.5 sm:p-4 transition-all">
        {/* Header Row */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <BubbleElement isBadge active size="sm" icon={meta.icon} className="shrink-0" />
            <span className="text-sm font-extrabold text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] truncate">
              {meta.headerTitle}
            </span>
          </div>

          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => onClose(alert.id)}
            icon={<X size={15} />}
            title="Закрыть уведомление"
            className="shrink-0 p-1.5 cursor-pointer"
          />
        </div>

        {/* Inner Liquid Glass Content Card */}
        <div className="p-3 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl flex items-start gap-3">
          {hasSender && (
            <div className="shrink-0 pt-0.5">
              <UserAvatar
                avatarUrl={avatarUrl}
                displayName={alert.sender_name || meta.headerTitle}
                size="sm"
              />
            </div>
          )}

          <div className="min-w-0 flex-1">
            {alert.sender_name && (
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-sm font-bold text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] truncate block">
                  {alert.sender_name}
                </span>
                <span className="text-sm text-foreground/70 shrink-0">сейчас</span>
              </div>
            )}
            <p className="text-sm text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] line-clamp-3 leading-snug break-words">
              {alert.message}
            </p>
            {typeof alert.amount === 'number' && alert.amount !== 0 && (
              <div className="mt-1.5">
                <BubbleElement isBadge active={alert.amount > 0} size="sm" className="!text-sm font-extrabold">
                  {alert.amount > 0 ? `+${alert.amount}` : alert.amount} {alert.currency || 'ИИкр'}
                </BubbleElement>
              </div>
            )}
          </div>
        </div>

        {/* Action Button Row */}
        <div className="mt-3 flex items-center justify-end">
          <LeafButton
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onOpenMessage(alert)}
            icon={<ArrowRight size={15} />}
            className="w-full justify-center !text-sm font-bold py-2"
          >
            {meta.actionLabel}
          </LeafButton>
        </div>

        {/* Progress countdown bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-transparent">
          <div
            className="h-full bg-primary transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
};
