import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  MessageSquare, 
  Share2, 
  Copy, 
  Check, 
  Search, 
  Loader2, 
  ExternalLink, 
  Sparkles, 
  Gift, 
  UserCheck, 
  UserX, 
  ShieldCheck,
  Radio,
  Send,
  Globe,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  User as UserIcon,
  Filter,
  RotateCcw
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { BubbleCurrencyIcon } from './BubbleIcon';
import { GiftIikrModal } from './GiftIikrModal';
import { DirectChatModal } from './DirectChatModal';
import { GroupChatsBlock } from './GroupChatsBlock';
import { friendsService, UserListItem } from '../services/friends';
import { formatLastSeen } from '../utils/formatLastSeen';
import { Link } from 'react-router-dom';
import { audioSystem } from '../hooks/useSound';

interface FriendsTabProps {
  currentUser: {
    uid: string;
    id: string;
    display_name?: string;
    username?: string;
    balance?: number;
    referred_by?: string | null;
    photo_url?: string | null;
    avatar_url?: string | null;
    telegram_photo?: string | null;
  };
  onUnreadCountChange?: (count: number) => void;
}

type FilterType = 'all' | 'friends' | 'invited' | 'unsubscribed' | 'unread';
type SortType = 'online' | 'points' | 'balance' | 'created_at' | 'name';

export const FriendsTab: React.FC<FriendsTabProps> = ({ currentUser, onUnreadCountChange }) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [activeSort, setActiveSort] = useState<SortType>('online');
  const [activeOrder, setActiveOrder] = useState<'desc' | 'asc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [inviter, setInviter] = useState<UserListItem | null>(null);
  const [totalUnreadMessages, setTotalUnreadMessages] = useState<number>(0);
  const [groupUnreadMessages, setGroupUnreadMessages] = useState<number>(0);

  const handleSortClick = (sortId: SortType) => {
    if (activeSort === sortId) {
      setActiveOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setActiveSort(sortId);
      setActiveOrder(sortId === 'name' ? 'asc' : 'desc');
    }
  };

  // Copy state
  const [copiedDirectLink, setCopiedDirectLink] = useState(false);
  const [copiedTmaLink, setCopiedTmaLink] = useState(false);
  const [copiedProfileLink, setCopiedProfileLink] = useState(false);

  // Active chat modal
  const [chatTarget, setChatTarget] = useState<UserListItem | null>(null);
  const [giftTarget, setGiftTarget] = useState<UserListItem | null>(null);
  const [friendActionLoading, setFriendActionLoading] = useState<string | null>(null);

  // Mobile collapsible sections state (4 buttons in a row: Друзья, Чаты, Ссылки, Фильтры)
  const [isMobileFriendsOpen, setIsMobileFriendsOpen] = useState(true);
  const [isMobileChatsOpen, setIsMobileChatsOpen] = useState(false);
  const [isMobileLinksOpen, setIsMobileLinksOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const activeFiltersCount =
    (activeFilter !== 'all' ? 1 : 0) +
    (activeSort !== 'online' || activeOrder !== 'desc' ? 1 : 0);

  // Dynamic URLs
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://qaiz.ru';
  const directWebRefLink = `${currentOrigin}/?ref=${currentUser.uid}`;
  const telegramTmaRefLink = `https://t.me/qaiz_aibot/app?startapp=${currentUser.uid}`;
  const profilePublicLink = `${currentOrigin}/profile${currentUser.uid}`;

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  // Fetch Inviter & Unread messages count
  const refreshUnreadCount = useCallback(async () => {
    if (!currentUser.uid) return;
    try {
      const res = await friendsService.fetchUnreadCount(currentUser.uid);
      setTotalUnreadMessages(res.unread_count || 0);
    } catch (_) {}
  }, [currentUser.uid]);

  useEffect(() => {
    if (onUnreadCountChange) {
      onUnreadCountChange(totalUnreadMessages + groupUnreadMessages);
    }
  }, [totalUnreadMessages, groupUnreadMessages, onUnreadCountChange]);

  useEffect(() => {
    if (currentUser.uid) {
      friendsService.fetchInviter(currentUser.uid)
        .then((res) => setInviter(res.inviter))
        .catch(() => {});
      refreshUnreadCount();
      const interval = setInterval(refreshUnreadCount, 7000);
      return () => clearInterval(interval);
    }
  }, [currentUser.uid, refreshUnreadCount]);

  // Load users (offset = 0)
  const deduplicateUsers = (list: UserListItem[]) => {
    const seen = new Set<string>();
    return list.filter((u) => {
      const id = String(u.uid || u.id || '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };

  const loadInitialUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await friendsService.fetchUsers({
        userId: currentUser.uid,
        filter: activeFilter,
        sort: activeSort,
        order: activeOrder,
        search: searchQuery.trim(),
        limit: 20,
        offset: 0
      });
      setUsers(deduplicateUsers(res.data));
      setTotalUsers(res.total);
      setHasMore(res.has_more);
      refreshUnreadCount();
    } catch (err) {
      console.error('Error loading users list:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.uid, activeFilter, activeSort, activeOrder, searchQuery, refreshUnreadCount]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadInitialUsers();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadInitialUsers]);

  // Load more users
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await friendsService.fetchUsers({
        userId: currentUser.uid,
        filter: activeFilter,
        sort: activeSort,
        order: activeOrder,
        search: searchQuery.trim(),
        limit: 20,
        offset: users.length
      });
      setUsers((prev) => deduplicateUsers([...prev, ...res.data]));
      setTotalUsers(res.total);
      setHasMore(res.has_more);
    } catch (err) {
      console.error('Error loading more users:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Toggle friend action
  const handleToggleFriend = async (targetUser: UserListItem) => {
    setFriendActionLoading(targetUser.uid);
    try {
      if (targetUser.is_friend) {
        await friendsService.removeFriend(currentUser.uid, targetUser.uid);
        setUsers((prev) =>
          prev.map((u) => (u.uid === targetUser.uid ? { ...u, is_friend: 0 } : u))
        );
      } else {
        await friendsService.addFriend(currentUser.uid, targetUser.uid);
        audioSystem.playSlot('ui_friend_request');
        setUsers((prev) =>
          prev.map((u) => (u.uid === targetUser.uid ? { ...u, is_friend: 1 } : u))
        );
      }
    } catch (err) {
      console.error('Error toggling friend:', err);
    } finally {
      setFriendActionLoading(null);
    }
  };

  const filterButtons: { id: FilterType; label: string; count?: number }[] = [
    { id: 'all', label: 'Все' },
    { id: 'friends', label: 'Друзья' },
    { id: 'unread', label: 'Непрочитанные', count: totalUnreadMessages },
    { id: 'invited', label: 'Приглашенные' },
    { id: 'unsubscribed', label: 'Отписались' }
  ];

  return (
    <div className="space-y-4 sm:space-y-6 text-sm w-full min-w-0 overflow-hidden">
      {/* Mobile 4-Icon Row: Друзья, Чаты, Ссылки, Фильтры */}
      <div className="grid grid-cols-4 gap-1.5 md:hidden w-full min-w-0">
        <BubbleElement
          size="sm"
          active={isMobileFriendsOpen}
          onClick={() => setIsMobileFriendsOpen((prev) => !prev)}
          className="w-full !px-1.5 !py-2 rounded-2xl justify-center min-w-0"
          title="Показать или скрыть список друзей и пользователей"
        >
          <span className="flex flex-col items-center justify-center gap-1 w-full min-w-0">
            <span className="relative flex items-center justify-center">
              <Users size={16} className={isMobileFriendsOpen ? 'text-black' : 'text-primary'} />
              {totalUnreadMessages > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-sm font-black leading-none ${
                    isMobileFriendsOpen ? 'bg-black text-primary' : 'bg-primary text-black'
                  }`}
                >
                  {totalUnreadMessages}
                </span>
              )}
            </span>
            <span className="text-sm font-bold leading-tight truncate max-w-full">Друзья</span>
          </span>
        </BubbleElement>

        <BubbleElement
          size="sm"
          active={isMobileChatsOpen}
          onClick={() => setIsMobileChatsOpen((prev) => !prev)}
          className="w-full !px-1.5 !py-2 rounded-2xl justify-center min-w-0"
          title="Открыть или свернуть групповые чаты и архив"
        >
          <span className="flex flex-col items-center justify-center gap-1 w-full min-w-0">
            <span className="relative flex items-center justify-center">
              <MessageSquare size={16} className={isMobileChatsOpen ? 'text-black' : 'text-primary'} />
              {groupUnreadMessages > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-sm font-black leading-none ${
                    isMobileChatsOpen ? 'bg-black text-primary' : 'bg-primary text-black'
                  }`}
                >
                  {groupUnreadMessages}
                </span>
              )}
            </span>
            <span className="text-sm font-bold leading-tight truncate max-w-full">Чаты</span>
          </span>
        </BubbleElement>

        <BubbleElement
          size="sm"
          active={isMobileLinksOpen}
          onClick={() => setIsMobileLinksOpen((prev) => !prev)}
          className="w-full !px-1.5 !py-2 rounded-2xl justify-center min-w-0"
          title="Открыть или свернуть приглашение друзей и реферальные ссылки"
        >
          <span className="flex flex-col items-center justify-center gap-1 w-full min-w-0">
            <Share2 size={16} className={isMobileLinksOpen ? 'text-black' : 'text-primary'} />
            <span className="text-sm font-bold leading-tight truncate max-w-full">Ссылки</span>
          </span>
        </BubbleElement>

        <BubbleElement
          size="sm"
          active={isMobileFiltersOpen}
          onClick={() => {
            setIsMobileFiltersOpen((prev) => {
              const next = !prev;
              if (next) setIsMobileFriendsOpen(true);
              return next;
            });
          }}
          className="w-full !px-1.5 !py-2 rounded-2xl justify-center min-w-0"
          title="Открыть или свернуть фильтры и сортировку"
        >
          <span className="flex flex-col items-center justify-center gap-1 w-full min-w-0">
            <span className="relative flex items-center justify-center">
              <Filter size={16} className={isMobileFiltersOpen ? 'text-black' : 'text-primary'} />
              {activeFiltersCount > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-sm font-black leading-none ${
                    isMobileFiltersOpen ? 'bg-black text-primary' : 'bg-primary text-black'
                  }`}
                >
                  {activeFiltersCount}
                </span>
              )}
            </span>
            <span className="text-sm font-bold leading-tight truncate max-w-full">Фильтры</span>
          </span>
        </BubbleElement>
      </div>

      {/* 1 & 2. Inviter Banner + Referral & Profile Links (Collapsible on mobile via "Ссылки") */}
      <div className={`${isMobileLinksOpen ? 'block' : 'hidden md:block'} space-y-4 sm:space-y-6 w-full min-w-0`}>
        {/* 1. Inviter Banner (who invited me) */}
        {inviter && (
          <div className="p-4 sm:p-5 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-xl w-full min-w-0 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  <UserAvatar
                    avatarUrl={inviter.avatar_url || inviter.photo_url || inviter.telegram_photo}
                    displayName={inviter.display_name || inviter.username || 'Пригласивший'}
                    size="md"
                  />
                  {Boolean(inviter.is_online) && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary border border-background"></span>
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-foreground/60 block break-words">
                    Вас пригласил в игру:
                  </span>
                  <Link 
                    to={`/profile${inviter.uid}`}
                    className="text-base font-bold text-foreground hover:text-primary transition-colors break-words block"
                  >
                    {inviter.display_name || inviter.username || `Игрок ${inviter.uid}`}
                  </Link>
                  <span className="text-sm font-mono text-primary block break-all">
                    UID: {inviter.uid}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
                <LeafButton
                  variant="primary"
                  size="sm"
                  onClick={() => setChatTarget(inviter)}
                  icon={<MessageSquare size={16} />}
                  className="flex-1 sm:flex-initial justify-center"
                >
                  <span>Написать</span>
                </LeafButton>

                <Link to={`/profile${inviter.uid}`} className="flex-1 sm:flex-initial">
                  <LeafButton
                    variant="glass"
                    size="sm"
                    icon={<ExternalLink size={16} />}
                    className="w-full justify-center"
                  >
                    <span>Профиль</span>
                  </LeafButton>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* 2. Referral & Profile Links with Liquid Glass styling */}
        <div className="p-4 sm:p-6 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-xl space-y-4 w-full min-w-0 overflow-hidden">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-2.5 sm:p-3 rounded-2xl bg-transparent backdrop-blur-md text-primary border border-primary/25 shrink-0">
              <Share2 size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg font-black text-foreground break-words leading-tight">
                Приглашение друзей и ссылки
              </h3>
              <p className="text-sm text-foreground/70 mt-1 break-words leading-snug">
                Делитесь ссылкой на свой профиль или приглашайте друзей и получайте по 300 ИИкр за каждого нового игрока!
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-1 w-full min-w-0">
            {/* Public Profile Link */}
            <div className="p-3.5 rounded-2xl bg-transparent border border-primary/20 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0 overflow-hidden">
              <div className="min-w-0 flex-1 w-full">
                <span className="text-sm font-bold text-foreground/80 block break-words">
                  Ссылка на ваш профиль для друзей:
                </span>
                <span className="text-sm font-mono text-primary break-all block mt-0.5 leading-snug">
                  {profilePublicLink}
                </span>
              </div>
              <LeafButton
                variant="primary"
                size="sm"
                onClick={() => copyToClipboard(profilePublicLink, setCopiedProfileLink)}
                icon={copiedProfileLink ? <Check size={16} /> : <Copy size={16} />}
                className="w-full sm:w-auto max-w-full justify-center shrink-0"
              >
                <span>{copiedProfileLink ? 'Скопировано' : 'Копировать'}</span>
              </LeafButton>
            </div>

            {/* Telegram TMA Link */}
            <div className="p-3.5 rounded-2xl bg-transparent border border-primary/20 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0 overflow-hidden">
              <div className="min-w-0 flex-1 w-full">
                <span className="text-sm font-bold text-foreground/80 block break-words">
                  Реферальная ссылка для Telegram:
                </span>
                <span className="text-sm font-mono text-primary break-all block mt-0.5 leading-snug">
                  {telegramTmaRefLink}
                </span>
              </div>
              <LeafButton
                variant="primary"
                size="sm"
                onClick={() => copyToClipboard(telegramTmaRefLink, setCopiedTmaLink)}
                icon={copiedTmaLink ? <Check size={16} /> : <Copy size={16} />}
                className="w-full sm:w-auto max-w-full justify-center shrink-0"
              >
                <span>{copiedTmaLink ? 'Скопировано' : 'Копировать'}</span>
              </LeafButton>
            </div>

            {/* Direct Web Link based on current domain */}
            <div className="p-3.5 rounded-2xl bg-transparent border border-primary/20 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full min-w-0 overflow-hidden">
              <div className="min-w-0 flex-1 w-full">
                <span className="text-sm font-bold text-foreground/80 block break-words">
                  Реферальная ссылка на этот сайт:
                </span>
                <span className="text-sm font-mono text-primary break-all block mt-0.5 leading-snug">
                  {directWebRefLink}
                </span>
              </div>
              <LeafButton
                variant="primary"
                size="sm"
                onClick={() => copyToClipboard(directWebRefLink, setCopiedDirectLink)}
                icon={copiedDirectLink ? <Check size={16} /> : <Copy size={16} />}
                className="w-full sm:w-auto max-w-full justify-center shrink-0"
              >
                <span>{copiedDirectLink ? 'Скопировано' : 'Копировать'}</span>
              </LeafButton>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Group Chats Section (Collapsible on mobile via "Чаты") */}
      <div className={`${isMobileChatsOpen ? 'block' : 'hidden md:block'} w-full min-w-0`}>
        <GroupChatsBlock
          currentUser={currentUser}
          onTotalUnreadChange={setGroupUnreadMessages}
        />
      </div>

      {/* 4. Community Users & Friends Section (Collapsible on mobile via "Друзья") */}
      <div className={`${isMobileFriendsOpen ? 'block' : 'hidden md:block'} space-y-4 w-full min-w-0`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <Users size={22} className="text-primary shrink-0" />
            <h3 className="text-base sm:text-lg font-black text-foreground break-words">
              Пользователи и друзья
            </h3>
            <BubbleElement isBadge size="sm" className="!text-sm font-bold">
              {totalUsers}
            </BubbleElement>
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-72 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по имени или UID..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-all"
            />
          </div>
        </div>

        {/* Filters & Sorting Container (Collapsible on mobile via "Фильтры") */}
        <div className={`${isMobileFiltersOpen ? 'block' : 'hidden md:block'} space-y-3 p-3.5 md:p-0 rounded-2xl md:rounded-none border border-primary/25 md:border-none bg-transparent backdrop-blur-xl md:backdrop-blur-none w-full min-w-0`}>
          {activeFiltersCount > 0 && (
            <div className="flex md:hidden items-center justify-between gap-2 pb-2 border-b border-primary/15">
              <span className="text-sm font-bold text-primary">Активные фильтры ({activeFiltersCount})</span>
              <BubbleElement
                size="sm"
                onClick={() => {
                  setActiveFilter('all');
                  setActiveSort('online');
                  setActiveOrder('desc');
                }}
                icon={<RotateCcw size={13} />}
                className="!px-2.5 !py-1 !text-sm"
              >
                Сбросить
              </BubbleElement>
            </div>
          )}

          {/* Filters - Responsive Grid / Bubble list without horizontal scrolling */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-1 w-full min-w-0">
            {filterButtons.map((fb) => (
              <LeafButton
                key={fb.id}
                active={activeFilter === fb.id}
                variant={activeFilter === fb.id ? 'primary' : 'glass'}
                size="sm"
                className="w-full max-w-full justify-center text-sm py-2.5 relative"
                onClick={() => setActiveFilter(fb.id)}
              >
                <span className="flex items-center gap-1.5">
                  <span>{fb.label}</span>
                  {fb.count !== undefined && fb.count > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-sm font-bold ${
                      activeFilter === fb.id 
                        ? 'bg-background text-primary' 
                        : 'bg-primary text-background'
                    }`}>
                      {fb.count}
                    </span>
                  )}
                </span>
              </LeafButton>
            ))}
          </div>

          {/* Sorting selection row - responsive wrap without horizontal scrolling */}
          <div className="flex flex-wrap items-center gap-2 py-1 w-full min-w-0">
            <span className="text-sm font-semibold text-foreground/60 shrink-0 flex items-center gap-1.5 mr-1">
              <ArrowUpDown size={15} /> Сортировка:
            </span>
            {[
              { id: 'online', label: 'По онлайну' },
              { id: 'points', label: 'По очкам' },
              { id: 'balance', label: 'По балансу' },
              { id: 'created_at', label: 'По дате' },
              { id: 'name', label: 'По имени' }
            ].map((s) => (
              <BubbleElement
                key={s.id}
                size="sm"
                active={activeSort === s.id}
                onClick={() => handleSortClick(s.id as SortType)}
                className="cursor-pointer !text-sm"
              >
                <span>{s.label}</span>
                {activeSort === s.id && (
                  activeOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                )}
              </BubbleElement>
            ))}
          </div>
        </div>

        {/* User Cards List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="animate-spin text-primary" size={36} />
            <span className="text-sm font-medium text-foreground/60">Загрузка списка пользователей...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="p-6 sm:p-8 text-center rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl space-y-2 w-full min-w-0">
            <UserIcon size={36} className="text-primary/40 mx-auto" />
            <p className="text-sm font-bold text-foreground">
              Пользователи не найдены
            </p>
            <p className="text-sm text-foreground/60 max-w-sm mx-auto break-words">
              {activeFilter === 'friends'
                ? 'В вашем списке друзей пока никого нет. Добавьте друзей из вкладки «Все» или отправьте ссылку на свой профиль!'
                : activeFilter === 'invited'
                ? 'Вы еще никого не пригласили. Отправьте друзьям реферальную ссылку!'
                : activeFilter === 'unsubscribed'
                ? 'Никто из ваших друзей пока не отписался.'
                : 'По вашему запросу пользователей не найдено.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 w-full min-w-0">
            {users.map((u, index) => {
              const isMe = u.uid === currentUser.uid;
              const isOnline = Boolean(u.is_online);
              const isFriend = Boolean(u.is_friend);
              const isInvited = Boolean(u.is_invited);
              const isUnsubscribed = Boolean(u.is_unsubscribed);

              return (
                <div
                  key={`friends-tab-user-${u.uid || u.id}-${index}`}
                  className="p-3.5 sm:p-5 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl shadow-md hover:border-primary/45 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 w-full min-w-0 overflow-hidden"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <UserAvatar
                        avatarUrl={u.avatar_url || u.photo_url || u.telegram_photo}
                        displayName={u.display_name || u.username || 'Игрок'}
                        size="md"
                      />
                      {/* Online Status Indicator */}
                      {isOnline ? (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5" title="В сети онлайн">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary border-2 border-background"></span>
                        </span>
                      ) : (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-foreground/25 border-2 border-background" title="Не в сети" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <Link
                          to={`/profile${u.uid}`}
                          className="font-bold text-sm sm:text-base text-foreground hover:text-primary transition-colors break-words block"
                        >
                          {u.display_name || u.username || `Игрок ${u.uid}`}
                        </Link>

                        {/* Status Badges */}
                        {isMe && (
                          <BubbleElement isBadge active size="sm" className="!px-2 !py-0.5 !text-sm shrink-0">
                            Вы
                          </BubbleElement>
                        )}
                        {Boolean(u.unread_messages && u.unread_messages > 0) && (
                          <BubbleElement isBadge active size="sm" className="!px-2 !py-0.5 !text-sm shrink-0" icon={<MessageSquare size={12} />}>
                            +{u.unread_messages}
                          </BubbleElement>
                        )}
                        {isInvited && (
                          <BubbleElement isBadge size="sm" className="!px-2 !py-0.5 !text-sm shrink-0">
                            Реферал (+300)
                          </BubbleElement>
                        )}
                        {isFriend && (
                          <BubbleElement isBadge size="sm" className="!px-2 !py-0.5 !text-sm text-blue-300 border-blue-500/35 shrink-0">
                            В друзьях
                          </BubbleElement>
                        )}
                        {isUnsubscribed && (
                          <BubbleElement isBadge size="sm" className="!px-2 !py-0.5 !text-sm text-destructive border-destructive/35 shrink-0">
                            Отписался
                          </BubbleElement>
                        )}
                      </div>

                      <div className="flex items-center gap-x-3 gap-y-1 text-sm text-foreground/65 flex-wrap min-w-0">
                        <span className="font-mono text-primary font-medium break-all">UID: {u.uid}</span>
                        <span className={`flex items-center gap-1 ${isOnline ? 'text-primary font-bold' : 'text-foreground/60'}`}>
                          <Clock size={13} className={isOnline ? 'text-primary shrink-0' : 'text-foreground/40 shrink-0'} />
                          <span>{formatLastSeen(u.last_seen, isOnline)}</span>
                        </span>
                        {u.total_points !== undefined && (
                          <span className="text-amber-400 font-medium flex items-center gap-1">
                            <Sparkles size={13} className="shrink-0" />
                            <span>{u.total_points} очков</span>
                          </span>
                        )}
                        {u.balance !== undefined && (
                          <span className="text-primary font-medium flex items-center gap-1">
                            <span>{u.balance}</span>
                            <BubbleCurrencyIcon className="w-3.5 h-3.5 shrink-0" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Area */}
                  {!isMe ? (
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 flex-wrap min-w-0">
                      {/* Add / Remove Friend */}
                      <LeafButton
                        variant={isFriend ? 'glass' : 'primary'}
                        size="sm"
                        onClick={() => handleToggleFriend(u)}
                        disabled={friendActionLoading === u.uid}
                        icon={
                          friendActionLoading === u.uid ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : isFriend ? (
                            <UserMinus size={16} />
                          ) : (
                            <UserPlus size={16} />
                          )
                        }
                      >
                        <span>{isFriend ? 'В друзьях' : 'В друзья'}</span>
                      </LeafButton>

                      {/* Chat Button: Only available when added to friends! */}
                      {isFriend && (
                        <>
                          <LeafButton
                            variant={u.unread_messages && u.unread_messages > 0 ? 'primary' : 'glass'}
                            size="sm"
                            onClick={() => setChatTarget(u)}
                            icon={<MessageSquare size={16} />}
                            className="relative"
                          >
                            <span className="flex items-center gap-1.5">
                              <span>Чат</span>
                              {Boolean(u.unread_messages && u.unread_messages > 0) && (
                                <span className="px-1.5 py-0.5 rounded-full text-sm font-bold bg-background text-primary">
                                  {u.unread_messages}
                                </span>
                              )}
                            </span>
                          </LeafButton>

                          {/* Gift IIRok button */}
                          <LeafButton
                            variant="glass"
                            size="sm"
                            onClick={() => setGiftTarget(u)}
                            icon={<Gift size={16} className="text-primary" />}
                            title="Подарить ИИрки"
                          >
                            <span className="hidden sm:inline">Подарить</span>
                          </LeafButton>
                        </>
                      )}

                      {/* View Profile */}
                      <Link to={`/profile${u.uid}`}>
                        <LeafButton
                          variant="glass"
                          size="sm"
                          icon={<ExternalLink size={16} />}
                          title="Открыть профиль"
                        >
                          <span className="hidden sm:inline">Профиль</span>
                        </LeafButton>
                      </Link>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                      <Link to={`/profile${u.uid}`} className="w-full sm:w-auto">
                        <LeafButton
                          variant="glass"
                          size="sm"
                          icon={<ExternalLink size={16} />}
                          className="w-full sm:w-auto justify-center"
                        >
                          <span>Мой профиль</span>
                        </LeafButton>
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 4. Pagination / Load More Button */}
        {hasMore && !loading && (
          <div className="flex flex-col items-center justify-center pt-4 gap-2">
            <LeafButton
              variant="primary"
              size="md"
              onClick={handleLoadMore}
              disabled={loadingMore}
              icon={loadingMore ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />}
            >
              <span>{loadingMore ? 'Загрузка...' : `Показать еще (загрузить следующие 20)`}</span>
            </LeafButton>
            <span className="text-sm text-foreground/50">
              Показано {users.length} из {totalUsers}
            </span>
          </div>
        )}
      </div>

      {/* 5. Direct Chat Modal */}
      {chatTarget && (
        <DirectChatModal
          isOpen={Boolean(chatTarget)}
          onClose={() => {
            setChatTarget(null);
            refreshUnreadCount();
            loadInitialUsers();
          }}
          currentUserUid={currentUser.uid}
          currentUserAvatar={currentUser.photo_url || currentUser.avatar_url || currentUser.telegram_photo}
          targetUser={{
            uid: chatTarget.uid,
            display_name: chatTarget.display_name,
            username: chatTarget.username,
            avatar_url: chatTarget.avatar_url,
            photo_url: chatTarget.photo_url,
            telegram_photo: chatTarget.telegram_photo,
            is_online: chatTarget.is_online
          }}
        />
      )}

      {/* 6. Gift IIRok Modal */}
      {giftTarget && (
        <GiftIikrModal
          isOpen={Boolean(giftTarget)}
          onClose={() => setGiftTarget(null)}
          currentUser={{
            uid: currentUser.uid,
            display_name: currentUser.display_name,
            balance: currentUser.balance
          }}
          targetUser={{
            uid: giftTarget.uid,
            display_name: giftTarget.display_name,
            username: giftTarget.username,
            avatar_url: giftTarget.avatar_url,
            photo_url: giftTarget.photo_url,
            telegram_photo: giftTarget.telegram_photo
          }}
          onSuccess={(newBal) => {
            if (currentUser) {
              currentUser.balance = newBal;
            }
            loadInitialUsers();
          }}
        />
      )}
    </div>
  );
};
