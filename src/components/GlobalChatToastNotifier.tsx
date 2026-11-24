import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { ChatNotificationToast } from './ChatNotificationToast';
import {
  ChatAlertNotification,
  fetchNotificationSettings,
  fetchRecentChatAlertsResult,
  UserNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
  resolveChannelKeyForType,
} from '../services/notificationSettings';
import { playNotificationSound } from '../utils/notificationSound';
import { DirectChatModal } from './DirectChatModal';
import { GroupChatModal } from './GroupChatModal';

function toUtcIsoTimestamp(date: Date): string {
  return date.toISOString();
}

export const GlobalChatToastNotifier: React.FC = () => {
  const { user, profile, effectiveUid } = useAuth();
  const navigate = useNavigate();
  const currentUid = String(profile?.uid || effectiveUid || '');
  const [activeAlerts, setActiveAlerts] = useState<ChatAlertNotification[]>([]);
  const [settings, setSettings] = useState<UserNotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);

  // Modals state for direct action from notification
  const [directChatTarget, setDirectChatTarget] = useState<any | null>(null);
  const [groupChatConfig, setGroupChatConfig] = useState<{ chatId: string; messageId?: string } | null>(null);

  const seenIdsRef = useRef<Set<string>>(new Set<string>());
  const lastCheckTimeRef = useRef<string>(toUtcIsoTimestamp(new Date(Date.now() - 30000)));
  const isFirstRunRef = useRef<boolean>(true);

  const pushAlertsToCascade = useCallback(
    (incoming: ChatAlertNotification[], currentSettings: UserNotificationSettings) => {
      if (!currentSettings.toast_enabled) return;

      const allowedIncoming = incoming.filter((a) => {
        const chKey = resolveChannelKeyForType(a.type);
        const ch = currentSettings.channels?.[chKey];
        return ch ? ch.toast !== false : true;
      });

      if (allowedIncoming.length === 0) return;

      setActiveAlerts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const fresh = allowedIncoming.filter((a) => !existingIds.has(a.id));
        if (fresh.length === 0) return prev;
        return [...fresh, ...prev].slice(0, 4);
      });

      if (currentSettings.sound_enabled) {
        playNotificationSound();
      }
    },
    []
  );

  const isRealAuthenticatedUid =
    Boolean(currentUid) &&
    currentUid !== 'usr_guest' &&
    !currentUid.startsWith('demo_');

  // Load user settings
  useEffect(() => {
    if (!isRealAuthenticatedUid || (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out)) return;
    fetchNotificationSettings(currentUid).then((s) => {
      setSettings(s);
    });

    const handleSettingsUpdated = () => {
      if (isRealAuthenticatedUid && !(typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out)) {
        fetchNotificationSettings(currentUid).then((s) => setSettings(s));
      }
    };
    window.addEventListener('notification_settings_updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('notification_settings_updated', handleSettingsUpdated);
    };
  }, [currentUid, isRealAuthenticatedUid]);

  // Listen to immediate client-side cascading toast events
  useEffect(() => {
    const handleCustomToast = (e: Event) => {
      const customEvent = e as CustomEvent<ChatAlertNotification>;
      if (customEvent.detail) {
        seenIdsRef.current.add(customEvent.detail.id);
        pushAlertsToCascade([customEvent.detail], settings);
      }
    };
    window.addEventListener('qaiz_toast_notification', handleCustomToast);
    return () => {
      window.removeEventListener('qaiz_toast_notification', handleCustomToast);
    };
  }, [pushAlertsToCascade, settings]);

  const consecutiveFailuresRef = useRef<number>(0);

  // Poll for recent alerts from server
  const checkAlerts = useCallback(async (): Promise<boolean> => {
    if (!isRealAuthenticatedUid || (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out)) return true;
    if (!settings.toast_enabled) return true;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return true;

    try {
      const { ok, alerts } = await fetchRecentChatAlertsResult(currentUid, lastCheckTimeRef.current);
      if (!ok) {
        return false;
      }
      if (alerts && alerts.length > 0) {
        const newAlerts = alerts.filter((a) => !seenIdsRef.current.has(a.id));

        for (const a of newAlerts) {
          seenIdsRef.current.add(a.id);
        }

        if (newAlerts.length > 0) {
          lastCheckTimeRef.current = toUtcIsoTimestamp(new Date(Date.now() - 2000));

          if (!isFirstRunRef.current) {
            pushAlertsToCascade(newAlerts, settings);
          } else {
            // On first load, if there's a brand-new notification created within the last 25 seconds, show it
            const veryRecent = newAlerts.filter((a) => {
              const createdMs = new Date((a.created_at || '').replace(' ', 'T') + (a.created_at?.includes('Z') ? '' : 'Z')).getTime();
              return !isNaN(createdMs) && Date.now() - createdMs <= 25000;
            });
            if (veryRecent.length > 0) {
              pushAlertsToCascade(veryRecent, settings);
            }
          }
        }
      }
      isFirstRunRef.current = false;
      return true;
    } catch (_) {
      return false;
    }
  }, [currentUid, isRealAuthenticatedUid, settings, pushAlertsToCascade]);

  useEffect(() => {
    if (!isRealAuthenticatedUid || (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = (delayMs: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(runPoll, delayMs);
    };

    const runPoll = async () => {
      if (cancelled) return;
      const ok = await checkAlerts();
      if (cancelled) return;
      if (ok) {
        consecutiveFailuresRef.current = 0;
        scheduleNext(4000);
      } else {
        consecutiveFailuresRef.current = Math.min(4, consecutiveFailuresRef.current + 1);
        const backoffMs = Math.min(60000, 10000 * Math.pow(2, consecutiveFailuresRef.current - 1));
        scheduleNext(backoffMs);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        consecutiveFailuresRef.current = 0;
        scheduleNext(300);
      }
    };

    runPoll();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUid, isRealAuthenticatedUid, checkAlerts]);

  const handleCloseAlert = useCallback((id: string) => {
    setActiveAlerts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Handle clicking action button on toast
  const handleOpenMessage = async (alert: ChatAlertNotification) => {
    handleCloseAlert(alert.id);

    // Mark as read on server
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alert.id }),
      });
    } catch (_) {}

    const chKey = resolveChannelKeyForType(alert.type);

    if (chKey === 'group_replies') {
      const ref = alert.reference_id || '';
      let targetChatId = ref;
      let targetMsgId: string | undefined = undefined;

      const chatMesMatch = ref.match(/^chat-([^-]+)-mes(.+)$/);
      if (chatMesMatch) {
        targetChatId = chatMesMatch[1];
        targetMsgId = chatMesMatch[2];
      } else if (ref.includes(':')) {
        const parts = ref.split(':');
        targetChatId = parts[0];
        targetMsgId = parts[1];
      }

      if (targetMsgId) {
        sessionStorage.setItem('open_chat_mes_id', targetMsgId);
      }

      setGroupChatConfig({
        chatId: targetChatId,
        messageId: targetMsgId,
      });
    } else if (chKey === 'direct_messages' || chKey === 'game_invites') {
      const targetUid = alert.reference_id;
      if (targetUid && /^\d{8,15}$/.test(targetUid)) {
        setDirectChatTarget({
          uid: targetUid,
          display_name: alert.sender_name || 'Собеседник',
          username: alert.sender_username,
          avatar_url: alert.sender_avatar,
          photo_url: alert.sender_photo,
          telegram_photo: alert.sender_tg_photo,
        });
      } else {
        navigate('/profile/ref');
      }
    } else if (chKey === 'friend_requests') {
      navigate('/profile/ref');
    } else if (chKey === 'transactions') {
      navigate('/profile/trans');
    } else if (chKey === 'achievements') {
      navigate('/profile/history');
    } else {
      navigate('/profile/notifications');
    }
  };

  const currentUserAvatar = profile?.photo_url || profile?.avatar_url || profile?.telegram_photo || user?.photo_url;
  const currentDisplayName = profile?.display_name || user?.first_name || 'Пользователь';

  return (
    <>
      {/* Cascading Toast Stack in top-right right below the Bell icon on PC & Mobile */}
      <div className="fixed top-16 right-3 sm:right-4 z-[99990] flex flex-col gap-2.5 w-[calc(100vw-1.5rem)] sm:w-96 max-w-sm pointer-events-none">
        <AnimatePresence mode="popLayout">
          {activeAlerts.map((alertItem, idx) => (
            <ChatNotificationToast
              key={alertItem.id}
              alert={alertItem}
              index={idx}
              onClose={handleCloseAlert}
              onOpenMessage={handleOpenMessage}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Direct Chat Modal opened from alert */}
      {directChatTarget && currentUid && (
        <DirectChatModal
          isOpen={true}
          onClose={() => setDirectChatTarget(null)}
          currentUserUid={currentUid}
          currentUserAvatar={currentUserAvatar}
          targetUser={directChatTarget}
        />
      )}

      {/* Group Chat Modal opened from reply alert */}
      {groupChatConfig && currentUid && (
        <GroupChatModal
          isOpen={true}
          onClose={() => setGroupChatConfig(null)}
          chatId={groupChatConfig.chatId}
          initialMessageId={groupChatConfig.messageId}
          currentUser={{
            uid: currentUid,
            id: currentUid,
            display_name: currentDisplayName,
            photo_url: currentUserAvatar,
          }}
        />
      )}
    </>
  );
};
