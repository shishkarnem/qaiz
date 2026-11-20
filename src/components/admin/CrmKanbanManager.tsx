import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Sparkles,
  Send,
  Mail,
  Coins,
  Gamepad2,
  Crown,
  Moon,
  Ban,
  UserPlus,
  GripVertical,
  Edit2,
  Check,
  X,
  Bell,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sliders,
  ChevronDown
} from 'lucide-react';
import { LeafButton } from '../ui/LeafButton';
import { BubbleElement } from '../ui/BubbleElement';
import { UserAvatar } from '../UserAvatar';
import { BubbleCurrencyIcon } from '../BubbleIcon';
import { formatIikr } from '../../lib/currency';

export type CrmStatusId = 'new' | 'playing' | 'paying' | 'vip' | 'sleeping' | 'blocked';

export interface CrmClientCard {
  uid: string;
  id: string;
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
  telegram_id?: string | null;
  photo_url?: string | null;
  avatar_url?: string | null;
  telegram_photo?: string | null;
  role: string;
  crm_status: CrmStatusId;
  crm_notes?: string | null;
  crm_order: number;
  crm_updated_at?: string | null;
  crm_manual_override: number;
  balance: number;
  balance_pay: number;
  balance_free: number;
  balance_ref: number;
  balance_admin: number;
  total_points: number;
  ballance_point: number;
  games_count: number;
  referrals_count: number;
  topup_total: number;
  last_active_at?: string | null;
  last_seen?: string | null;
  last_login?: string | null;
  created_at?: string | null;
  next_reminder_at?: string | null;
  last_reminder_sent_at?: string | null;
  reminder_count: number;
  telegram_bot_blocked: number;
}

interface ColumnConfig {
  id: CrmStatusId;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accentBorder: string;
}

export const CRM_COLUMNS: ColumnConfig[] = [
  {
    id: 'new',
    title: 'Новые регистрации',
    subtitle: 'Недавно вошли, стартовый баланс',
    icon: <UserPlus size={18} className="text-primary" />,
    accentBorder: 'border-primary/30'
  },
  {
    id: 'playing',
    title: 'Активно играют',
    subtitle: 'Проходят викторины и копят очки',
    icon: <Gamepad2 size={18} className="text-emerald-400" />,
    accentBorder: 'border-emerald-400/30'
  },
  {
    id: 'paying',
    title: 'Платящие (Пополнения)',
    subtitle: 'Покупали пакеты ИИкры за рубли',
    icon: <Coins size={18} className="text-amber-400" />,
    accentBorder: 'border-amber-400/30'
  },
  {
    id: 'vip',
    title: 'Лидеры и Амбассадоры',
    subtitle: 'Крупные пополнения или 2+ рефералов',
    icon: <Crown size={18} className="text-purple-400" />,
    accentBorder: 'border-purple-400/30'
  },
  {
    id: 'sleeping',
    title: 'Спящие (7+ дней)',
    subtitle: 'Получают rich-напоминание раз в 7 дней',
    icon: <Moon size={18} className="text-sky-400" />,
    accentBorder: 'border-sky-400/30'
  },
  {
    id: 'blocked',
    title: 'Бот заблокирован',
    subtitle: 'Остановили бота, рассылка отключена',
    icon: <Ban size={18} className="text-rose-400" />,
    accentBorder: 'border-rose-400/30'
  }
];

interface CrmKanbanManagerProps {
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onOpenBalanceModal?: (user: {
    uid: string;
    display_name?: string;
    email?: string;
    balance?: number;
    balance_free?: number;
    balance_admin?: number;
    balance_pay?: number;
  }) => void;
}

export const CrmKanbanManager: React.FC<CrmKanbanManagerProps> = ({
  adminFetch,
  onOpenBalanceModal
}) => {
  const [clients, setClients] = useState<CrmClientCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'telegram' | 'email' | 'both'>('all');
  const [mobileActiveColumn, setMobileActiveColumn] = useState<CrmStatusId | 'all'>('all');
  const [isMobileColumnMenuOpen, setIsMobileColumnMenuOpen] = useState<boolean>(false);

  // Drag and drop state
  const [draggedUid, setDraggedUid] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<CrmStatusId | null>(null);

  // Selected client for detailed inspector modal
  const [selectedClient, setSelectedClient] = useState<CrmClientCard | null>(null);
  const [notesDraft, setNotesDraft] = useState<string>('');
  const [savingCard, setSavingCard] = useState<boolean>(false);

  // Reminder cascade runner state
  const [runningReminders, setRunningReminders] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
  };

  const fetchCrmClients = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await adminFetch('/api/admin/system/crm');
      const data = await res.json();
      if (data.success && Array.isArray(data.clients)) {
        setClients(data.clients);
        if (selectedClient) {
          const updatedSelected = data.clients.find((c: CrmClientCard) => c.uid === selectedClient.uid);
          if (updatedSelected) setSelectedClient(updatedSelected);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка загрузки карточек CRM', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCrmClients(false);
    const interval = setInterval(() => fetchCrmClients(true), 12000);
    return () => clearInterval(interval);
  }, []);

  const handleMoveCard = async (
    uid: string,
    targetStatus: CrmStatusId,
    manualOverride: boolean = true
  ) => {
    // Optimistic UI update
    setClients((prev) =>
      prev.map((c) =>
        c.uid === uid
          ? {
              ...c,
              crm_status: targetStatus,
              crm_manual_override: manualOverride ? 1 : 0,
              telegram_bot_blocked: targetStatus === 'blocked' ? 1 : 0
            }
          : c
      )
    );

    try {
      const res = await adminFetch('/api/admin/system/crm/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          crm_status: targetStatus,
          crm_manual_override: manualOverride ? 1 : 0
        })
      });
      const data = await res.json();
      if (data.success) {
        const colTitle = CRM_COLUMNS.find((c) => c.id === targetStatus)?.title || targetStatus;
        showToast(`Клиент UID ${uid} перемещен в статус «${colTitle}»`);
        fetchCrmClients(true);
      } else {
        showToast(data.error || 'Не удалось обновить статус клиента', 'error');
        fetchCrmClients(true);
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка сети при перемещении карточки', 'error');
      fetchCrmClients(true);
    }
  };

  const handleAutoSyncAll = async (forceAll: boolean) => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/system/crm/auto-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceAll })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Статусы воронки CRM автоматически обновлены');
        await fetchCrmClients(true);
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка авто-синхронизации CRM', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRunReminderCascade = async (forceTestUid?: string) => {
    setRunningReminders(true);
    try {
      const res = await adminFetch('/api/admin/system/reminders/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 30,
          forceTestUid
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Каскадная рассылка напоминаний выполнена');
        await fetchCrmClients(true);
      } else {
        showToast(data.error || 'Ошибка запуска напоминаний', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка запуска каскада напоминаний', 'error');
    } finally {
      setRunningReminders(false);
    }
  };

  const handleSaveClientNotes = async () => {
    if (!selectedClient) return;
    setSavingCard(true);
    try {
      const res = await adminFetch(`/api/admin/system/crm/card/${selectedClient.uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crm_notes: notesDraft
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Заметка по клиенту сохранена в базе данных');
        await fetchCrmClients(true);
      } else {
        showToast(data.error || 'Ошибка сохранения заметки', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка сохранения', 'error');
    } finally {
      setSavingCard(false);
    }
  };

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (channelFilter === 'telegram' && !c.telegram_id) return false;
      if (channelFilter === 'email' && !c.email) return false;
      if (channelFilter === 'both' && (!c.telegram_id || !c.email)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchUid = String(c.uid || '').toLowerCase().includes(q);
        const matchName = String(c.display_name || '').toLowerCase().includes(q);
        const matchUser = String(c.username || '').toLowerCase().includes(q);
        const matchEmail = String(c.email || '').toLowerCase().includes(q);
        const matchTg = String(c.telegram_id || '').toLowerCase().includes(q);
        const matchNotes = String(c.crm_notes || '').toLowerCase().includes(q);
        if (!matchUid && !matchName && !matchUser && !matchEmail && !matchTg && !matchNotes) {
          return false;
        }
      }
      return true;
    });
  }, [clients, channelFilter, searchQuery]);

  const clientsByStatus = useMemo(() => {
    const map: Record<CrmStatusId, CrmClientCard[]> = {
      new: [],
      playing: [],
      paying: [],
      vip: [],
      sleeping: [],
      blocked: []
    };
    for (const c of filteredClients) {
      const status = map[c.crm_status] ? c.crm_status : 'new';
      map[status].push(c);
    }
    return map;
  }, [filteredClients]);

  const formatShortDate = (raw?: string | null) => {
    if (!raw) return '—';
    try {
      const d = new Date(raw.includes('T') ? raw : `${raw}Z`);
      if (isNaN(d.getTime())) return raw;
      return d.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return raw;
    }
  };

  return (
    <div className="space-y-6 text-sm">
      {/* Top CRM Control Bar */}
      <div className="rounded-[2rem] border border-primary/25 bg-transparent backdrop-blur-2xl p-5 sm:p-6 space-y-5 shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl text-primary shrink-0">
              <Users size={26} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-foreground flex flex-wrap items-center gap-2">
                <span>CRM-канбан клиентов и воронка активности</span>
                <BubbleElement isBadge active size="sm" className="!text-sm">
                  Всего: {clients.length}
                </BubbleElement>
              </h2>
              <p className="text-sm text-foreground/75 mt-1">
                Перетаскивайте карточки клиентов мышью (Drag & Drop) между колонками или используйте автоматическое движение по триггерам активности, оплат и 7-дневных напоминаний.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <LeafButton
              variant="primary"
              size="sm"
              onClick={() => handleRunReminderCascade()}
              disabled={runningReminders}
              icon={<Bell size={16} />}
              className="!text-sm"
            >
              {runningReminders ? 'Отправка каскада...' : 'Запустить каскад 7-дн. напоминаний'}
            </LeafButton>

            <LeafButton
              variant="glass"
              size="sm"
              onClick={() => handleAutoSyncAll(true)}
              disabled={loading}
              icon={<Sparkles size={16} />}
              className="!text-sm"
            >
              Авто-распределение всех
            </LeafButton>

            <BubbleElement
              as="button"
              type="button"
              size="sm"
              onClick={() => fetchCrmClients(false)}
              className="!text-sm flex items-center gap-1.5"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin text-primary' : ''} />
              <span>Обновить</span>
            </BubbleElement>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-primary/20">
          <div className="md:col-span-6 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск клиента по UID, имени, @username, почте, TG ID или заметке..."
              className="w-full rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary"
            />
          </div>

          <div className="md:col-span-6 flex flex-wrap items-center gap-2">
            <BubbleElement
              as="button"
              type="button"
              size="sm"
              active={channelFilter === 'all'}
              onClick={() => setChannelFilter('all')}
              className="!text-sm"
            >
              Все ({clients.length})
            </BubbleElement>
            <BubbleElement
              as="button"
              type="button"
              size="sm"
              active={channelFilter === 'telegram'}
              onClick={() => setChannelFilter('telegram')}
              className="!text-sm flex items-center gap-1.5"
            >
              <Send size={14} className="text-sky-400" />
              <span>С Telegram ({clients.filter((c) => Boolean(c.telegram_id)).length})</span>
            </BubbleElement>
            <BubbleElement
              as="button"
              type="button"
              size="sm"
              active={channelFilter === 'email'}
              onClick={() => setChannelFilter('email')}
              className="!text-sm flex items-center gap-1.5"
            >
              <Mail size={14} className="text-primary" />
              <span>С почтой ({clients.filter((c) => Boolean(c.email)).length})</span>
            </BubbleElement>
            <BubbleElement
              as="button"
              type="button"
              size="sm"
              active={channelFilter === 'both'}
              onClick={() => setChannelFilter('both')}
              className="!text-sm flex items-center gap-1.5"
            >
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span>Объединенные ({clients.filter((c) => Boolean(c.telegram_id && c.email)).length})</span>
            </BubbleElement>
          </div>
        </div>

        {/* Mobile Dropdown Selector for Columns (No Horizontal Scroll on Mobile) */}
        <div className="block lg:hidden pt-2 border-t border-primary/20 space-y-2">
          <p className="text-sm font-bold text-foreground/80">Выберите колонку воронки (мобильный режим):</p>
          <BubbleElement
            as="button"
            type="button"
            size="md"
            active
            onClick={() => setIsMobileColumnMenuOpen(!isMobileColumnMenuOpen)}
            className="w-full justify-between !text-sm font-bold"
          >
            <span>
              {mobileActiveColumn === 'all'
                ? `Все колонки вертикально (${filteredClients.length})`
                : `${CRM_COLUMNS.find((col) => col.id === mobileActiveColumn)?.title} (${
                    clientsByStatus[mobileActiveColumn]?.length || 0
                  })`}
            </span>
            <ChevronDown size={18} className={`transition-transform ${isMobileColumnMenuOpen ? 'rotate-180' : ''}`} />
          </BubbleElement>

          {isMobileColumnMenuOpen && (
            <div className="grid grid-cols-1 gap-2 p-3 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-2xl">
              <BubbleElement
                as="button"
                type="button"
                size="sm"
                active={mobileActiveColumn === 'all'}
                onClick={() => {
                  setMobileActiveColumn('all');
                  setIsMobileColumnMenuOpen(false);
                }}
                className="w-full justify-between !text-sm"
              >
                <span>Показать все колонки</span>
                <span>{filteredClients.length}</span>
              </BubbleElement>
              {CRM_COLUMNS.map((col) => (
                <BubbleElement
                  key={col.id}
                  as="button"
                  type="button"
                  size="sm"
                  active={mobileActiveColumn === col.id}
                  onClick={() => {
                    setMobileActiveColumn(col.id);
                    setIsMobileColumnMenuOpen(false);
                  }}
                  className="w-full justify-between !text-sm"
                >
                  <span className="flex items-center gap-2">
                    {col.icon}
                    <span>{col.title}</span>
                  </span>
                  <span>{clientsByStatus[col.id]?.length || 0}</span>
                </BubbleElement>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border backdrop-blur-2xl flex items-center justify-between gap-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-500/40 text-emerald-300'
              : 'border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{feedback.text}</span>
          </div>
          <BubbleElement as="button" type="button" size="sm" onClick={() => setFeedback(null)} className="!p-1.5">
            <X size={15} />
          </BubbleElement>
        </div>
      )}

      {/* Kanban Board Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4 items-start">
        {CRM_COLUMNS.filter((col) => mobileActiveColumn === 'all' || mobileActiveColumn === col.id).map((col) => {
          const colClients = clientsByStatus[col.id] || [];
          const isOver = dragOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverColumn !== col.id) setDragOverColumn(col.id);
              }}
              onDragLeave={() => {
                if (dragOverColumn === col.id) setDragOverColumn(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverColumn(null);
                const droppedUid = e.dataTransfer.getData('text/plain') || draggedUid;
                if (droppedUid) {
                  handleMoveCard(droppedUid, col.id, true);
                }
                setDraggedUid(null);
              }}
              className={`rounded-3xl border transition-all bg-transparent backdrop-blur-2xl p-4 space-y-3.5 min-h-[420px] ${
                isOver
                  ? 'border-primary shadow-[0_0_25px_rgba(153,208,55,0.35)] scale-[1.01]'
                  : col.accentBorder
              }`}
            >
              {/* Column Header */}
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-primary/20">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-bold text-foreground text-sm">
                    {col.icon}
                    <span className="truncate">{col.title}</span>
                  </div>
                  <p className="text-sm text-foreground/60 mt-0.5 leading-snug">{col.subtitle}</p>
                </div>
                <BubbleElement isBadge active={colClients.length > 0} size="sm" className="!text-sm shrink-0">
                  {colClients.length}
                </BubbleElement>
              </div>

              {/* Cards Container */}
              <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
                {colClients.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-dashed border-primary/20 text-center text-sm text-foreground/50">
                    Перетащите карточку клиента сюда
                  </div>
                ) : (
                  colClients.map((client) => {
                    const isDragging = draggedUid === client.uid;
                    return (
                      <div
                        key={client.uid}
                        draggable
                        onDragStart={(e) => {
                          setDraggedUid(client.uid);
                          e.dataTransfer.setData('text/plain', client.uid);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDraggedUid(null);
                          setDragOverColumn(null);
                        }}
                        onClick={() => {
                          setSelectedClient(client);
                          setNotesDraft(client.crm_notes || '');
                        }}
                        className={`group rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-3.5 space-y-2.5 cursor-grab active:cursor-grabbing hover:border-primary/60 transition-all shadow-sm ${
                          isDragging ? 'opacity-50 scale-95 border-primary' : ''
                        }`}
                      >
                        {/* Top Row: Avatar + Name + Drag Handle */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <UserAvatar
                              avatarUrl={client.photo_url || client.avatar_url || client.telegram_photo}
                              displayName={client.display_name}
                              size="sm"
                              className="shrink-0 border border-primary/30"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-foreground text-sm truncate">
                                {client.display_name || 'Игрок'}
                              </div>
                              <div className="text-sm text-primary font-mono truncate">
                                UID: {client.uid}
                              </div>
                            </div>
                          </div>
                          <GripVertical size={16} className="text-foreground/40 group-hover:text-primary shrink-0 mt-1" />
                        </div>

                        {/* Contact Badges */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {client.telegram_id && (
                            <BubbleElement isBadge size="sm" className="!text-sm !px-2 !py-0.5 flex items-center gap-1">
                              <Send size={12} className="text-sky-400" />
                              <span className="truncate max-w-[110px]">
                                {client.username || client.telegram_id}
                              </span>
                            </BubbleElement>
                          )}
                          {client.email && (
                            <BubbleElement isBadge size="sm" className="!text-sm !px-2 !py-0.5 flex items-center gap-1">
                              <Mail size={12} className="text-primary" />
                              <span className="truncate max-w-[120px]">{client.email}</span>
                            </BubbleElement>
                          )}
                          {client.crm_manual_override === 1 && (
                            <BubbleElement isBadge active size="sm" className="!text-sm !px-2 !py-0.5">
                              Ручной
                            </BubbleElement>
                          )}
                        </div>

                        {/* Balance & Metrics */}
                        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-primary/15 text-sm">
                          <div className="flex items-center gap-1 text-foreground/90 font-semibold">
                            <span>Баланс:</span>
                            <span className="text-primary font-bold">{formatIikr(client.balance)}</span>
                            <BubbleCurrencyIcon className="w-3.5 h-3.5 inline" />
                          </div>
                          <div className="text-right text-foreground/75">
                            Игр: <strong className="text-foreground">{client.games_count}</strong>
                          </div>
                          {client.topup_total > 0 && (
                            <div className="col-span-2 text-amber-400 font-semibold">
                              Пополнено: +{formatIikr(client.topup_total)} ИИкр
                            </div>
                          )}
                        </div>

                        {/* Activity & Reminder Info */}
                        <div className="text-sm text-foreground/65 space-y-0.5 pt-1 border-t border-primary/10">
                          <div className="flex items-center justify-between">
                            <span>Вход:</span>
                            <span className="text-foreground/85">
                              {formatShortDate(client.last_active_at || client.last_login || client.created_at)}
                            </span>
                          </div>
                          {client.telegram_id && (
                            <div className="flex items-center justify-between">
                              <span>След. пуш:</span>
                              <span className="text-primary">
                                {client.telegram_bot_blocked
                                  ? 'Заблокирован'
                                  : formatShortDate(client.next_reminder_at)}
                              </span>
                            </div>
                          )}
                        </div>

                        {client.crm_notes && (
                          <div className="p-2 rounded-xl border border-primary/20 bg-transparent text-sm text-foreground/85 break-words">
                            📝 {client.crm_notes}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Client Inspector & Quick Move Modal (Transparent Liquid Glass) */}
      {selectedClient && (
        <div
          onClick={() => setSelectedClient(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent backdrop-blur-2xl"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-[2rem] border border-primary/35 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-[0_16px_48px_rgba(0,0,0,0.55)] space-y-5 max-h-[90vh] overflow-y-auto text-sm"
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-primary/20">
              <div className="flex items-center gap-3.5 min-w-0">
                <UserAvatar
                  avatarUrl={selectedClient.photo_url || selectedClient.avatar_url || selectedClient.telegram_photo}
                  displayName={selectedClient.display_name}
                  size="lg"
                  className="border-2 border-primary shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="text-xl font-black text-foreground truncate">
                    {selectedClient.display_name}
                  </h3>
                  <p className="text-sm font-mono text-primary">UID: {selectedClient.uid}</p>
                  {selectedClient.username && (
                    <p className="text-sm text-foreground/75">{selectedClient.username}</p>
                  )}
                </div>
              </div>
              <BubbleElement
                as="button"
                type="button"
                size="sm"
                onClick={() => setSelectedClient(null)}
                className="!p-2"
              >
                <X size={18} />
              </BubbleElement>
            </div>

            {/* Move Status Buttons */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-foreground text-sm">Статус в воронке CRM:</span>
                {selectedClient.crm_manual_override === 1 && (
                  <BubbleElement
                    as="button"
                    type="button"
                    size="sm"
                    onClick={() => handleMoveCard(selectedClient.uid, selectedClient.crm_status, false)}
                    className="!text-sm text-primary"
                  >
                    Вернуть авто-определение статуса
                  </BubbleElement>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {CRM_COLUMNS.map((col) => (
                  <BubbleElement
                    key={col.id}
                    as="button"
                    type="button"
                    size="sm"
                    active={selectedClient.crm_status === col.id}
                    onClick={() => handleMoveCard(selectedClient.uid, col.id, true)}
                    className="!text-sm flex items-center gap-1.5"
                  >
                    {col.icon}
                    <span>{col.title}</span>
                  </BubbleElement>
                ))}
              </div>
            </div>

            {/* Client Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
                <div className="text-foreground/60 text-sm">Общий баланс</div>
                <div className="text-lg font-black text-primary mt-0.5">
                  {formatIikr(selectedClient.balance)} ИИкр
                </div>
              </div>
              <div className="p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
                <div className="text-foreground/60 text-sm">Пополнено (Pay)</div>
                <div className="text-lg font-black text-amber-400 mt-0.5">
                  {formatIikr(selectedClient.topup_total)} ИИкр
                </div>
              </div>
              <div className="p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
                <div className="text-foreground/60 text-sm">Сыграно / Пакетов</div>
                <div className="text-lg font-black text-foreground mt-0.5">
                  {selectedClient.games_count}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
                <div className="text-foreground/60 text-sm">Приглашено друзей</div>
                <div className="text-lg font-black text-emerald-400 mt-0.5">
                  {selectedClient.referrals_count}
                </div>
              </div>
            </div>

            {/* 7-Day Inactivity Reminder Info */}
            <div className="p-4 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-primary flex items-center gap-2 text-sm">
                  <Clock size={16} />
                  <span>Система 7-дневных напоминаний в Telegram</span>
                </span>
                {selectedClient.telegram_id && (
                  <LeafButton
                    variant="glass"
                    size="sm"
                    disabled={runningReminders}
                    onClick={() => handleRunReminderCascade(selectedClient.uid)}
                    icon={<Send size={14} />}
                    className="!text-sm"
                  >
                    Отправить rich-напоминание сейчас
                  </LeafButton>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-foreground/80">
                <div>
                  Последний вход:{' '}
                  <strong className="text-foreground">
                    {formatShortDate(selectedClient.last_active_at || selectedClient.last_login)}
                  </strong>
                </div>
                <div>
                  Отправлено пушей: <strong className="text-foreground">{selectedClient.reminder_count || 0}</strong>
                </div>
                <div>
                  Следующая отправка:{' '}
                  <strong className="text-primary">
                    {selectedClient.telegram_bot_blocked
                      ? 'Бот заблокирован'
                      : formatShortDate(selectedClient.next_reminder_at)}
                  </strong>
                </div>
              </div>
            </div>

            {/* CRM Notes */}
            <div className="space-y-2">
              <label className="block font-bold text-foreground text-sm">
                Заметка менеджера по клиенту:
              </label>
              <textarea
                rows={3}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Добавьте комментарий по клиенту, договоренностям или активности..."
                className="w-full rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md p-3.5 text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  {onOpenBalanceModal && (
                    <LeafButton
                      variant="glass"
                      size="sm"
                      onClick={() => {
                        onOpenBalanceModal({
                          uid: selectedClient.uid,
                          display_name: selectedClient.display_name,
                          email: selectedClient.email || undefined,
                          balance: selectedClient.balance,
                          balance_free: selectedClient.balance_free,
                          balance_admin: selectedClient.balance_admin,
                          balance_pay: selectedClient.balance_pay
                        });
                      }}
                      icon={<Coins size={16} />}
                      className="!text-sm"
                    >
                      Начислить / Списать ИИкр
                    </LeafButton>
                  )}
                  <a
                    href={`/profile/${selectedClient.uid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <BubbleElement as="div" size="sm" className="!text-sm flex items-center gap-1.5">
                      <ExternalLink size={14} />
                      <span>Профиль игрока</span>
                    </BubbleElement>
                  </a>
                </div>

                <LeafButton
                  variant="primary"
                  size="sm"
                  disabled={savingCard}
                  onClick={handleSaveClientNotes}
                  icon={<Check size={16} />}
                  className="!text-sm"
                >
                  {savingCard ? 'Сохранение...' : 'Сохранить заметку'}
                </LeafButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
