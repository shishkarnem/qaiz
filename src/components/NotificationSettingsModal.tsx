import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Bell,
  Volume2,
  VolumeX,
  Send,
  Sparkles,
  Check,
  Loader2,
  MessageSquare,
  Reply,
  Gamepad2,
  UserPlus,
  Trophy,
  Coins,
  Megaphone,
  Calendar,
  Flame,
  Swords,
  Layers,
  HelpCircle,
  Smartphone,
  BellRing,
  Download,
} from 'lucide-react';
import {
  fetchNotificationSettings,
  saveNotificationSettings,
  UserNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
  triggerCascadingToast,
} from '../services/notificationSettings';
import {
  DevicePushStatus,
  getDevicePushStatus,
  subscribeDeviceToPush,
  sendTestDevicePush,
} from '../services/pwa/pushNotifications';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { IOSInstallGuideModal } from './pwa/IOSInstallGuideModal';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  isOpen,
  onClose,
  userId,
}) => {
  const [settings, setSettings] = useState<UserNotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'main' | 'channels' | 'reminders'>('main');
  const [openHelpKey, setOpenHelpKey] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<DevicePushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const {
    isInstalled,
    isIOS,
    isAndroid,
    canNativeInstall,
    showInstallGuide,
    setShowInstallGuide,
    triggerInstall,
  } = usePWAInstall();

  const toggleHelp = (key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setOpenHelpKey((prev) => (prev === key ? null : key));
  };

  const handleTestCascadingToast = () => {
    const sampleEvents = [
      {
        type: 'message',
        title: 'Новое сообщение в чате',
        message: 'Привет! Пойдем сыграем партию в викторину?',
        sender_name: 'Алексей Квайз',
      },
      {
        type: 'game_invite',
        title: 'Приглашение в игру',
        message: 'Вас приглашают за игровой стол в Своя Икра!',
        sender_name: 'Мария',
      },
      {
        type: 'transaction',
        title: 'Пополнение баланса',
        message: 'На ваш игровой счет зачислено +50 ИИкр за активность!',
        sender_name: 'Банк Квайз',
      },
      {
        type: 'achievement',
        title: 'Новое достижение',
        message: 'Вы открыли награду за серию побед на арене Квайз!',
        sender_name: 'Квайз Арена',
      },
    ];
    const pick = sampleEvents[Math.floor(Math.random() * sampleEvents.length)];
    triggerCascadingToast({
      user_id: userId,
      type: pick.type,
      title: pick.title,
      message: pick.message,
      sender_name: pick.sender_name,
    });
  };

  useEffect(() => {
    if (!isOpen || !userId) return;
    setLoading(true);
    setSavedSuccess(false);
    setOpenHelpKey(null);
    setPushMsg(null);
    Promise.all([
      fetchNotificationSettings(userId),
      getDevicePushStatus(userId),
    ]).then(([res, pStatus]) => {
      setSettings(res);
      setPushStatus(pStatus);
      setLoading(false);
    });
  }, [isOpen, userId]);

  const handleActivateDevicePush = async () => {
    setPushBusy(true);
    setPushMsg(null);
    const res = await subscribeDeviceToPush(userId);
    setPushBusy(false);
    if (res.ok) {
      setSettings((prev) => ({ ...prev, push_enabled: true }));
      const nextStatus = await getDevicePushStatus(userId);
      setPushStatus(nextStatus);
      setPushMsg('Устройство подключено к пуш-уведомлениям!');
    } else {
      setPushMsg(res.error || 'Не удалось включить пуши на устройстве.');
    }
  };

  const handleTestDevicePush = async () => {
    setPushBusy(true);
    setPushMsg(null);
    if (!pushStatus?.hasLocalSubscription) {
      const subRes = await subscribeDeviceToPush(userId);
      if (!subRes.ok) {
        setPushBusy(false);
        setPushMsg(subRes.error || 'Сначала подключите пуш-уведомления на устройстве.');
        return;
      }
      setPushStatus(await getDevicePushStatus(userId));
    }
    const res = await sendTestDevicePush(userId);
    setPushBusy(false);
    setPushMsg(
      res.ok && (res.sent || 0) > 0
        ? 'Тестовое пуш-уведомление отправлено на устройство!'
        : res.error || 'Сначала нажмите «Подключить устройство».'
    );
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    setSavedSuccess(false);

    const success = await saveNotificationSettings({
      ...settings,
      user_id: userId,
    });

    setSaving(false);
    if (success) {
      setSavedSuccess(true);
      window.dispatchEvent(new CustomEvent('notification_settings_updated'));
      setTimeout(() => {
        setSavedSuccess(false);
      }, 3000);
    }
  };

  const updateMaster = (
    key: keyof Pick<
      UserNotificationSettings,
      'sound_enabled' | 'toast_enabled' | 'push_enabled' | 'telegram_notifications_enabled' | 'telegram_reminders_enabled'
    >
  ) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const updateChannel = (
    channelKey: keyof UserNotificationSettings['channels'],
    field: 'inapp' | 'toast' | 'push' | 'telegram'
  ) => {
    setSettings((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channelKey]: {
          ...prev.channels[channelKey],
          [field]: !prev.channels[channelKey][field],
        },
      },
    }));
  };

  const updateReminder = (reminderKey: keyof UserNotificationSettings['reminders']) => {
    setSettings((prev) => ({
      ...prev,
      reminders: {
        ...prev.reminders,
        [reminderKey]: !prev.reminders[reminderKey],
      },
    }));
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const mainItems = [
    {
      key: 'sound_enabled' as const,
      title: 'Звуковые сигналы',
      desc: 'Приятный хрустальный звуковой сигнал при получении нового сообщения или события.',
      icon: settings.sound_enabled ? <Volume2 size={16} /> : <VolumeX size={16} />,
      enabled: settings.sound_enabled,
    },
    {
      key: 'toast_enabled' as const,
      title: 'Всплывающие окна',
      desc: 'Каскадные карточки уведомлений рядом с иконкой колокольчика в правом верхнем углу экрана.',
      icon: <Bell size={16} />,
      enabled: settings.toast_enabled,
      hasTest: true,
    },
    {
      key: 'push_enabled' as const,
      title: 'Пуш-уведомления на устройстве',
      desc: 'Системные пуши прямо на экран телефона или компьютера (даже когда вкладка закрыта). Для надёжной доставки на Android и iPhone установите Квайз как приложение на рабочий стол.',
      icon: <Smartphone size={16} />,
      enabled: settings.push_enabled,
      hasPushSetup: true,
    },
    {
      key: 'telegram_notifications_enabled' as const,
      title: 'Уведомления в Telegram',
      desc: 'Мгновенные сообщения через официального бота, когда вы не в сети.',
      icon: <Send size={16} />,
      enabled: settings.telegram_notifications_enabled,
    },
    {
      key: 'telegram_reminders_enabled' as const,
      title: 'Напоминания (TG и Email)',
      desc: 'Напоминания об играх в Telegram или раз в неделю на почту (для аккаунтов без Telegram).',
      icon: <Sparkles size={16} />,
      enabled: settings.telegram_reminders_enabled,
    },
  ];

  const channelItems = [
    {
      key: 'direct_messages' as const,
      label: 'Личные сообщения',
      icon: <MessageSquare size={16} />,
      desc: 'Входящие сообщения от друзей и собеседников в личных диалогах.',
    },
    {
      key: 'group_replies' as const,
      label: 'Ответы в беседах',
      icon: <Reply size={16} />,
      desc: 'Оповещения, когда вам отвечают на реплику в групповом чате или лобби.',
    },
    {
      key: 'game_invites' as const,
      label: 'Приглашения в игры',
      icon: <Gamepad2 size={16} />,
      desc: 'Вызовы в интеллектуальные игры, квизы и мультиплеерные комнаты.',
    },
    {
      key: 'friend_requests' as const,
      label: 'Запросы в друзья',
      icon: <UserPlus size={16} />,
      desc: 'Новые заявки и подтверждения добавления в список друзей.',
    },
    {
      key: 'achievements' as const,
      label: 'Достижения и ранги',
      icon: <Trophy size={16} />,
      desc: 'Открытие новых значков, побед и повышение игрового статуса.',
    },
    {
      key: 'transactions' as const,
      label: 'Финансовые операции',
      icon: <Coins size={16} />,
      desc: 'Начисления ИИкры, обмен очков, выигрыши и подарки от друзей.',
    },
    {
      key: 'system_news' as const,
      label: 'Системные анонсы',
      icon: <Megaphone size={16} />,
      desc: 'Важные новости платформы, турниры и обновления сервиса.',
    },
  ];

  const reminderItems = [
    {
      key: 'daily_bonus' as const,
      title: 'Ежедневный бонус',
      desc: 'Напоминание о доступности награды за ежедневный вход в игру.',
      icon: <Calendar size={16} />,
    },
    {
      key: 'streak_loss' as const,
      title: 'Риск потери серии',
      desc: 'Предупреждение за несколько часов до сгорания непрерывной серии дней.',
      icon: <Flame size={16} />,
    },
    {
      key: 'tournaments' as const,
      title: 'Старт турниров',
      desc: 'Оповещение перед началом соревнований с призовым фондом.',
      icon: <Trophy size={16} />,
    },
    {
      key: 'unanswered_duels' as const,
      title: 'Ходы в играх',
      desc: 'Напоминание о партиях, где соперник ожидает ваш ответ.',
      icon: <Swords size={16} />,
    },
    {
      key: 'unread_messages' as const,
      title: 'Непрочитанные чаты',
      desc: 'Сводка сообщений в личных чатах, если вы не заходили более суток.',
      icon: <MessageSquare size={16} />,
    },
    {
      key: 'weekly_digest' as const,
      title: 'Недельный дайджест',
      desc: 'Итоги вашей недели, заработанный рейтинг и статистика побед.',
      icon: <Sparkles size={16} />,
    },
  ];

  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[999999] flex items-center justify-center p-2.5 sm:p-5 bg-transparent backdrop-blur-2xl pointer-events-auto overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-xl max-h-[88vh] flex flex-col rounded-3xl border border-primary/35 bg-transparent backdrop-blur-3xl shadow-2xl overflow-hidden text-foreground min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Compact Minimalist Modal Header */}
          <div className="p-3.5 sm:p-4 border-b border-primary/20 bg-transparent backdrop-blur-md shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <BubbleElement isBadge active size="sm" icon={<Bell size={16} />} className="!p-2 shrink-0" />
                <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight truncate">
                  Настройки уведомлений
                </h3>
                <BubbleElement
                  size="sm"
                  active={openHelpKey === 'header_help'}
                  onClick={(e) => toggleHelp('header_help', e)}
                  icon={<HelpCircle size={14} />}
                  title="Описание раздела"
                  className="!p-1.5 shrink-0 cursor-pointer"
                />
              </div>

              <BubbleElement
                isBadge={false}
                size="sm"
                onClick={onClose}
                icon={<X size={16} />}
                title="Закрыть настройки"
                className="shrink-0 !p-2 cursor-pointer"
              />
            </div>

            {openHelpKey === 'header_help' && (
              <div className="p-2.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl text-sm text-foreground/85 leading-snug break-words">
                Персональная настройка звука, всплывающих окон на экране и уведомлений в Telegram. Нажмите на иконку «?» возле любого пункта, чтобы посмотреть подробную подсказку.
              </div>
            )}
          </div>

          {/* Compact Navigation Tabs */}
          <div className="px-3 sm:px-5 py-2.5 border-b border-primary/15 bg-transparent shrink-0">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full min-w-0">
              <BubbleElement
                size="sm"
                active={activeTab === 'main'}
                onClick={() => setActiveTab('main')}
                icon={<Bell size={14} className="hidden sm:inline-block" />}
                className="w-full justify-center !px-2 !py-2 text-sm cursor-pointer min-w-0"
              >
                <span className="truncate">Основные</span>
              </BubbleElement>

              <BubbleElement
                size="sm"
                active={activeTab === 'channels'}
                onClick={() => setActiveTab('channels')}
                icon={<Layers size={14} className="hidden sm:inline-block" />}
                className="w-full justify-center !px-2 !py-2 text-sm cursor-pointer min-w-0"
              >
                <span className="truncate">Каналы</span>
              </BubbleElement>

              <BubbleElement
                size="sm"
                active={activeTab === 'reminders'}
                onClick={() => setActiveTab('reminders')}
                icon={<Send size={14} className="hidden sm:inline-block" />}
                className="w-full justify-center !px-2 !py-2 text-sm cursor-pointer min-w-0"
              >
                <span className="truncate">Напоминания</span>
              </BubbleElement>
            </div>
          </div>

          {/* Modal Scrollable Body */}
          <div className="p-3 sm:p-5 overflow-y-auto overflow-x-hidden flex-1 space-y-2.5 custom-scrollbar min-w-0">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-foreground/60">
                <Loader2 size={28} className="animate-spin text-primary" />
                <span className="text-sm">Загрузка настроек...</span>
              </div>
            ) : (
              <>
                {/* TAB 1: MAIN TOGGLES */}
                {activeTab === 'main' && (
                  <div className="space-y-2.5 min-w-0">
                    {mainItems.map((item) => (
                      <div
                        key={item.key}
                        className="p-3 sm:p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md space-y-2 w-full min-w-0 overflow-hidden"
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <BubbleElement
                              isBadge
                              active={item.enabled}
                              size="sm"
                              icon={item.icon}
                              className="shrink-0 !p-2"
                            />
                            <span className="text-sm font-bold text-foreground leading-snug break-words min-w-0">
                              {item.title}
                            </span>
                            <BubbleElement
                              size="sm"
                              active={openHelpKey === item.key}
                              onClick={(e) => toggleHelp(item.key, e)}
                              icon={<HelpCircle size={14} />}
                              title="Показать подсказку"
                              className="shrink-0 !p-1.5 cursor-pointer"
                            />
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.hasTest && (
                              <BubbleElement
                                size="sm"
                                onClick={handleTestCascadingToast}
                                icon={<Sparkles size={13} className="text-primary" />}
                                title="Проверить всплывающее окно"
                                className="shrink-0 !px-2.5 !py-1.5 text-sm cursor-pointer"
                              >
                                Тест
                              </BubbleElement>
                            )}
                            <BubbleElement
                              size="sm"
                              active={item.enabled}
                              onClick={() => updateMaster(item.key)}
                              icon={item.enabled ? <Check size={14} className="text-black" /> : undefined}
                              className="shrink-0 !px-3 !py-1.5 text-sm cursor-pointer"
                            >
                              {item.enabled ? 'Вкл' : 'Выкл'}
                            </BubbleElement>
                          </div>
                        </div>

                        {openHelpKey === item.key && (
                          <div className="p-2.5 rounded-xl border border-primary/20 bg-transparent backdrop-blur-xl text-sm text-foreground/80 leading-snug break-words">
                            {item.desc}
                          </div>
                        )}

                        {'hasPushSetup' in item && item.hasPushSetup && (
                          <div className="pt-2 border-t border-primary/15 space-y-2 min-w-0">
                            <p className="text-sm text-foreground/80 leading-snug break-words">
                              Чтобы уведомления приходили как пуши на экран мобильного даже при закрытом браузере, подключите это устройство и желательно установите приложение Квайз на рабочий стол.
                            </p>
                            {pushMsg && (
                              <p className="text-sm font-medium text-primary break-words">{pushMsg}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 w-full min-w-0">
                              <BubbleElement
                                size="sm"
                                active={Boolean(pushStatus?.hasLocalSubscription && pushStatus?.permission === 'granted')}
                                onClick={handleActivateDevicePush}
                                icon={pushBusy ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
                                className="!px-3 !py-1.5 text-sm cursor-pointer"
                              >
                                {pushStatus?.hasLocalSubscription && pushStatus?.permission === 'granted'
                                  ? 'Устройство подключено'
                                  : 'Подключить это устройство'}
                              </BubbleElement>
                              <BubbleElement
                                size="sm"
                                onClick={handleTestDevicePush}
                                icon={<Send size={13} className="text-primary" />}
                                className="!px-3 !py-1.5 text-sm cursor-pointer"
                              >
                                Тест пуша
                              </BubbleElement>
                              {!isInstalled && (
                                <BubbleElement
                                  size="sm"
                                  onClick={() => triggerInstall()}
                                  icon={<Download size={13} className="text-primary" />}
                                  className="!px-3 !py-1.5 text-sm cursor-pointer"
                                >
                                  {isIOS
                                    ? 'Установить на iPhone'
                                    : canNativeInstall
                                    ? 'Установить приложение'
                                    : 'Как установить'}
                                </BubbleElement>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 2: CHANNELS PER EVENT */}
                {activeTab === 'channels' && (
                  <div className="space-y-2.5 min-w-0">
                    {channelItems.map((item) => {
                      const isAnyActive = Boolean(
                        settings.channels[item.key]?.inapp ||
                          settings.channels[item.key]?.toast ||
                          settings.channels[item.key]?.push ||
                          settings.channels[item.key]?.telegram
                      );
                      return (
                        <div
                          key={item.key}
                          className="p-3 sm:p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md space-y-2.5 w-full min-w-0 overflow-hidden"
                        >
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <BubbleElement
                                isBadge
                                active={isAnyActive}
                                size="sm"
                                icon={item.icon}
                                className="shrink-0 !p-2"
                              />
                              <span className="text-sm font-bold text-foreground leading-snug break-words min-w-0">
                                {item.label}
                              </span>
                            </div>

                            <BubbleElement
                              size="sm"
                              active={openHelpKey === item.key}
                              onClick={(e) => toggleHelp(item.key, e)}
                              icon={<HelpCircle size={14} />}
                              title="Показать подсказку"
                              className="shrink-0 !p-1.5 cursor-pointer"
                            />
                          </div>

                          {openHelpKey === item.key && (
                            <div className="p-2.5 rounded-xl border border-primary/20 bg-transparent backdrop-blur-xl text-sm text-foreground/80 leading-snug break-words">
                              {item.desc}
                            </div>
                          )}

                          {/* Responsive 2x2 mobile / 4-col desktop channel toggles */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-2 border-t border-primary/15 w-full min-w-0">
                            <BubbleElement
                              size="sm"
                              active={Boolean(settings.channels[item.key]?.inapp)}
                              onClick={() => updateChannel(item.key, 'inapp')}
                              icon={
                                settings.channels[item.key]?.inapp ? (
                                  <Check size={13} className="text-black" />
                                ) : (
                                  <Bell size={13} />
                                )
                              }
                              className="w-full justify-center !py-1.5 !px-2 text-sm cursor-pointer min-w-0"
                            >
                              <span className="truncate">В центре</span>
                            </BubbleElement>

                            <BubbleElement
                              size="sm"
                              active={Boolean(settings.channels[item.key]?.toast)}
                              onClick={() => updateChannel(item.key, 'toast')}
                              icon={
                                settings.channels[item.key]?.toast ? (
                                  <Check size={13} className="text-black" />
                                ) : (
                                  <Sparkles size={13} />
                                )
                              }
                              className="w-full justify-center !py-1.5 !px-2 text-sm cursor-pointer min-w-0"
                            >
                              <span className="truncate">Окно</span>
                            </BubbleElement>

                            <BubbleElement
                              size="sm"
                              active={Boolean(settings.channels[item.key]?.push)}
                              onClick={() => updateChannel(item.key, 'push')}
                              icon={
                                settings.channels[item.key]?.push ? (
                                  <Check size={13} className="text-black" />
                                ) : (
                                  <Smartphone size={13} />
                                )
                              }
                              className="w-full justify-center !py-1.5 !px-2 text-sm cursor-pointer min-w-0"
                            >
                              <span className="truncate">Пуш</span>
                            </BubbleElement>

                            <BubbleElement
                              size="sm"
                              active={Boolean(settings.channels[item.key]?.telegram)}
                              onClick={() => updateChannel(item.key, 'telegram')}
                              icon={
                                settings.channels[item.key]?.telegram ? (
                                  <Check size={13} className="text-black" />
                                ) : (
                                  <Send size={13} />
                                )
                              }
                              className="w-full justify-center !py-1.5 !px-2 text-sm cursor-pointer min-w-0"
                            >
                              <span className="truncate">Telegram</span>
                            </BubbleElement>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* TAB 3: TELEGRAM REMINDERS */}
                {activeTab === 'reminders' && (
                  <div className="space-y-2.5 min-w-0">
                    {reminderItems.map((item) => {
                      const isEnabled = Boolean(settings.reminders[item.key]);
                      return (
                        <div
                          key={item.key}
                          className="p-3 sm:p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md space-y-2 w-full min-w-0 overflow-hidden"
                        >
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <BubbleElement
                                isBadge
                                active={isEnabled}
                                size="sm"
                                icon={item.icon}
                                className="shrink-0 !p-2"
                              />
                              <span className="text-sm font-bold text-foreground leading-snug break-words min-w-0">
                                {item.title}
                              </span>
                              <BubbleElement
                                size="sm"
                                active={openHelpKey === item.key}
                                onClick={(e) => toggleHelp(item.key, e)}
                                icon={<HelpCircle size={14} />}
                                title="Показать подсказку"
                                className="shrink-0 !p-1.5 cursor-pointer"
                              />
                            </div>

                            <BubbleElement
                              size="sm"
                              active={isEnabled}
                              onClick={() => updateReminder(item.key)}
                              icon={isEnabled ? <Check size={14} className="text-black" /> : undefined}
                              className="shrink-0 !px-3 !py-1.5 text-sm cursor-pointer"
                            >
                              {isEnabled ? 'Вкл' : 'Выкл'}
                            </BubbleElement>
                          </div>

                          {openHelpKey === item.key && (
                            <div className="p-2.5 rounded-xl border border-primary/20 bg-transparent backdrop-blur-xl text-sm text-foreground/80 leading-snug break-words">
                              {item.desc}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Compact Modal Footer */}
          <div className="p-3 sm:p-4 border-t border-primary/20 bg-transparent backdrop-blur-md flex flex-col gap-2 shrink-0 min-w-0">
            {savedSuccess && (
              <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-primary">
                <Check size={15} />
                <span>Настройки сохранены</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 w-full min-w-0">
              <LeafButton
                variant="glass"
                size="sm"
                onClick={onClose}
                className="flex-1 justify-center text-sm"
              >
                Закрыть
              </LeafButton>

              <LeafButton
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={saving || loading}
                icon={saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                className="flex-1 justify-center text-sm"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </LeafButton>
            </div>
          </div>
        </motion.div>

        <IOSInstallGuideModal
          isOpen={showInstallGuide}
          onClose={() => setShowInstallGuide(false)}
          isIOS={isIOS}
          isAndroid={isAndroid}
        />
      </div>
    </AnimatePresence>,
    document.body
  );
};
