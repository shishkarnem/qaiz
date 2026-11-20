import React, { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  Download,
  BellRing,
  CheckCircle2,
  SlidersHorizontal,
  Send,
  Loader2,
  Info,
  BellOff,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import {
  DevicePushStatus,
  getDevicePushStatus,
  subscribeDeviceToPush,
  unsubscribeDeviceFromPush,
  sendTestDevicePush,
} from '../../services/pwa/pushNotifications';
import { LeafButton } from '../ui/LeafButton';
import { BubbleElement } from '../ui/BubbleElement';
import { IOSInstallGuideModal } from './IOSInstallGuideModal';

interface PWAInstallAndPushCardProps {
  userId: string;
  compact?: boolean;
  onOpenNotificationSettings?: () => void;
}

export const PWAInstallAndPushCard: React.FC<PWAInstallAndPushCardProps> = ({
  userId,
  compact = false,
  onOpenNotificationSettings,
}) => {
  const {
    canNativeInstall,
    isInstalled,
    installing,
    showInstallGuide,
    setShowInstallGuide,
    triggerInstall,
    isIOS,
    isAndroid,
  } = usePWAInstall();

  const [pushStatus, setPushStatus] = useState<DevicePushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshStatus = useCallback(async () => {
    const status = await getDevicePushStatus(userId);
    setPushStatus(status);
  }, [userId]);

  useEffect(() => {
    refreshStatus();
    const onUpdated = () => refreshStatus();
    window.addEventListener('notification_settings_updated', onUpdated);
    return () => window.removeEventListener('notification_settings_updated', onUpdated);
  }, [refreshStatus]);

  const handleEnablePush = async () => {
    setPushBusy(true);
    setFeedback(null);
    const res = await subscribeDeviceToPush(userId);
    setPushBusy(false);
    if (res.ok) {
      setFeedback({
        type: 'success',
        text: 'Устройство подписано! Теперь пуш-уведомления будут приходить прямо на экран мобильного или ПК.',
      });
      await refreshStatus();
      window.dispatchEvent(new CustomEvent('notification_settings_updated'));
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Не удалось включить пуш-уведомления.',
      });
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    setFeedback(null);
    const res = await unsubscribeDeviceFromPush(userId);
    setPushBusy(false);
    if (res.ok) {
      setFeedback({
        type: 'success',
        text: 'Пуш-уведомления отключены для этого устройства.',
      });
      await refreshStatus();
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Не удалось отключить подписку.',
      });
    }
  };

  const handleTestPush = async () => {
    setTestingPush(true);
    setFeedback(null);
    if (!pushStatus?.hasLocalSubscription) {
      const subRes = await subscribeDeviceToPush(userId);
      if (!subRes.ok) {
        setTestingPush(false);
        setFeedback({ type: 'error', text: subRes.error || 'Сначала разрешите пуши на устройстве.' });
        return;
      }
      await refreshStatus();
    }
    const res = await sendTestDevicePush(userId);
    setTestingPush(false);
    if (res.ok && (res.sent || 0) > 0) {
      setFeedback({
        type: 'success',
        text: 'Тестовое пуш-уведомление отправлено на ваше устройство!',
      });
    } else if (res.ok) {
      setFeedback({
        type: 'error',
        text: 'Подписка неактивна на этом устройстве. Нажмите «Включить пуши на устройстве».',
      });
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Ошибка отправки тестового пуш-уведомления.',
      });
    }
  };

  const isDeviceSubscribed = Boolean(
    pushStatus?.hasLocalSubscription && pushStatus?.permission === 'granted'
  );

  return (
    <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 sm:p-6 space-y-4 w-full min-w-0 overflow-hidden shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <BubbleElement
            isBadge
            active={isInstalled || isDeviceSubscribed}
            size="sm"
            icon={<Smartphone size={18} />}
            className="shrink-0 !p-2"
          />
          <div className="min-w-0">
            <h4 className="text-base font-bold text-foreground leading-snug break-words">
              Приложение на телефон и пуш-уведомления
            </h4>
            <p className="text-sm text-foreground/70 break-words">
              Быстрый запуск с рабочего стола Android и iPhone без открытого браузера
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {isInstalled ? (
            <BubbleElement isBadge active size="sm" icon={<CheckCircle2 size={14} className="text-black" />}>
              Установлено
            </BubbleElement>
          ) : (
            <BubbleElement isBadge size="sm" className="text-primary border-primary/35">
              {isIOS ? 'Для iPhone и Android' : 'Веб-приложение (PWA)'}
            </BubbleElement>
          )}
        </div>
      </div>

      {!compact && (
        <div className="p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md text-sm text-foreground/85 leading-relaxed space-y-1.5 break-words">
          <p className="font-semibold text-primary flex items-center gap-2">
            <Info size={16} className="shrink-0" />
            <span>Зачем устанавливать приложение и включать пуши</span>
          </p>
          <p>
            Когда Квайз добавлен иконкой на главный экран смартфона, игры открываются в полноэкранном режиме приложения, а приглашения в дуэль, сообщения от друзей, подарки ИИкры и ответы в чатах приходят как системные пуш-уведомления на экран телефона — даже если браузер закрыт.
          </p>
          {isIOS && !isInstalled && (
            <p className="text-primary/90 font-medium">
              На iPhone Apple разрешает системные пуш-уведомления только после установки сайта на экран «Домой» через Safari.
            </p>
          )}
        </div>
      )}

      {feedback && (
        <div
          className={`p-3 rounded-2xl border bg-transparent backdrop-blur-md text-sm font-medium break-words ${
            feedback.type === 'success'
              ? 'border-emerald-500/35 text-emerald-400'
              : 'border-rose-500/35 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full min-w-0">
        {/* Column 1: Install PWA Card */}
        <div className="p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md flex flex-col justify-between gap-3 min-w-0">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-sm font-bold text-foreground flex items-center gap-2 min-w-0">
                <Download size={16} className="text-primary shrink-0" />
                <span className="break-words">Иконка на рабочий стол</span>
              </span>
            </div>
            <p className="text-sm text-foreground/75 break-words leading-snug">
              {isInstalled
                ? 'Вы уже используете установленное приложение Квайз.'
                : canNativeInstall
                ? 'Браузер готов установить приложение Квайз в один клик.'
                : isIOS
                ? 'Добавьте иконку через меню «Поделиться» в Safari (iPhone / iPad).'
                : 'Установите на рабочий стол Android, iOS или ПК.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 w-full min-w-0">
            {isInstalled ? (
              <BubbleElement
                isBadge
                active
                size="sm"
                icon={<CheckCircle2 size={14} className="text-black" />}
                className="w-full justify-center py-2 text-sm"
              >
                Приложение установлено
              </BubbleElement>
            ) : (
              <LeafButton
                type="button"
                variant="primary"
                size="sm"
                disabled={installing}
                onClick={triggerInstall}
                icon={installing ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                className="w-full justify-center text-sm font-bold"
              >
                {installing
                  ? 'Установка...'
                  : isIOS
                  ? 'Установить на iPhone / iPad'
                  : canNativeInstall
                  ? 'Установить приложение'
                  : 'Как установить на экран'}
              </LeafButton>
            )}
          </div>
        </div>

        {/* Column 2: Push Notifications Card */}
        <div className="p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md flex flex-col justify-between gap-3 min-w-0">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-1.5 min-w-0">
              <span className="text-sm font-bold text-foreground flex items-center gap-2 min-w-0">
                <BellRing size={16} className="text-primary shrink-0" />
                <span className="break-words">Пуши на этом устройстве</span>
              </span>
              {isDeviceSubscribed && (
                <BubbleElement isBadge active size="sm" icon={<CheckCircle2 size={13} className="text-black" />}>
                  Активны
                </BubbleElement>
              )}
            </div>
            <p className="text-sm text-foreground/75 break-words leading-snug">
              {pushStatus?.permission === 'denied'
                ? 'Доступ к уведомлениям запрещён в настройках браузера.'
                : !pushStatus?.supported
                ? isIOS
                  ? 'Чтобы включить пуши на iPhone, сначала установите приложение на экран «Домой».'
                  : 'Откройте сайт в современном браузере или установленном приложении.'
                : isDeviceSubscribed
                ? `Устройство подключено к пуш-серверу (${pushStatus?.serverSubscribedCount || 1} устр.).`
                : 'Разрешите уведомления, чтобы получать сообщения и приглашения прямо на мобильный.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
            {isDeviceSubscribed ? (
              <>
                <BubbleElement
                  size="sm"
                  onClick={handleTestPush}
                  icon={testingPush ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  className="flex-1 justify-center !py-2 !px-3 text-sm cursor-pointer min-w-[120px]"
                >
                  {testingPush ? 'Отправка...' : 'Тест пуша'}
                </BubbleElement>
                <BubbleElement
                  size="sm"
                  onClick={handleDisablePush}
                  icon={pushBusy ? <Loader2 size={14} className="animate-spin" /> : <BellOff size={14} />}
                  className="justify-center !py-2 !px-3 text-sm cursor-pointer border-rose-500/35 text-rose-300"
                  title="Отключить пуши на этом устройстве"
                >
                  Откл
                </BubbleElement>
              </>
            ) : (
              <LeafButton
                type="button"
                variant="primary"
                size="sm"
                disabled={pushBusy}
                onClick={handleEnablePush}
                icon={pushBusy ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />}
                className="flex-1 justify-center text-sm font-bold min-w-[160px]"
              >
                {pushBusy ? 'Подключение...' : 'Включить пуш на устройстве'}
              </LeafButton>
            )}

            {onOpenNotificationSettings && (
              <BubbleElement
                size="sm"
                onClick={onOpenNotificationSettings}
                icon={<SlidersHorizontal size={14} />}
                className="w-full justify-center !py-2 !px-3 text-sm cursor-pointer"
              >
                Настроить какие пуши присылать
              </BubbleElement>
            )}
          </div>
        </div>
      </div>

      <IOSInstallGuideModal
        isOpen={showInstallGuide}
        onClose={() => setShowInstallGuide(false)}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </div>
  );
};
