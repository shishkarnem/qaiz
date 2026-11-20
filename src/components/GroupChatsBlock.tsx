import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Plus,
  MessageSquare,
  ShieldCheck,
  Crown,
  Shield,
  Loader2,
  Clock,
  Settings,
  Archive,
  Trash2,
  Gamepad2,
  Lock
} from 'lucide-react';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { CreateGroupChatModal } from './CreateGroupChatModal';
import { GroupChatModal } from './GroupChatModal';
import { GroupChatSettingsModal } from './GroupChatSettingsModal';
import {
  groupChatsService,
  GroupChatListItem,
} from '../services/groupChats';

interface GroupChatsBlockProps {
  currentUser: {
    uid: string;
    id?: string;
    display_name?: string;
    username?: string;
    photo_url?: string | null;
    avatar_url?: string | null;
    telegram_photo?: string | null;
  };
  onTotalUnreadChange?: (count: number) => void;
}

export const GroupChatsBlock: React.FC<GroupChatsBlockProps> = ({
  currentUser,
  onTotalUnreadChange,
}) => {
  const [chats, setChats] = useState<GroupChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'active' | 'archive'>('active');
  const [archivingChatId, setArchivingChatId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const chatParam = params.get('chat');
    const sessionChat = sessionStorage.getItem('open_chat_id');
    const target = chatParam || sessionChat;
    if (target && target.startsWith('gchat_')) {
      if (sessionChat) sessionStorage.removeItem('open_chat_id');
      return target;
    }
    return null;
  });
  const [settingsChatId, setSettingsChatId] = useState<string | null>(null);

  const loadGroupChats = useCallback(async () => {
    if (!currentUser.uid) return;
    try {
      const data = await groupChatsService.fetchUserGroupChats(currentUser.uid);
      setChats(data);
      const totalUnread = data
        .filter((c) => !Number(c.is_archived))
        .reduce((acc, c) => acc + (c.unread_count || 0), 0);
      if (onTotalUnreadChange) {
        onTotalUnreadChange(totalUnread);
      }
    } catch (err) {
      console.warn('Failed to fetch group chats:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.uid, onTotalUnreadChange]);

  useEffect(() => {
    loadGroupChats();
    const interval = setInterval(loadGroupChats, 6000);
    return () => clearInterval(interval);
  }, [loadGroupChats]);

  const handleCreated = (newChatId: string) => {
    setActiveSection('active');
    loadGroupChats();
    setActiveChatId(newChatId);
  };

  const handleArchiveChat = async (chat: GroupChatListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser.uid || archivingChatId) return;
    setArchivingChatId(chat.id);
    try {
      await groupChatsService.archiveGroupChat(chat.id, currentUser.uid);
      await loadGroupChats();
    } catch (err) {
      console.warn('Failed to archive chat:', err);
    } finally {
      setArchivingChatId(null);
    }
  };

  const activeChats = useMemo(
    () => chats.filter((c) => !Number(c.is_archived)),
    [chats]
  );

  const archivedChats = useMemo(
    () => chats.filter((c) => Number(c.is_archived) === 1),
    [chats]
  );

  const displayedChats = activeSection === 'archive' ? archivedChats : activeChats;

  const getArchiveReasonLabel = (chat: GroupChatListItem) => {
    if (chat.archive_reason === 'game_completed') return 'Завершённая игра';
    if (chat.archive_reason === 'lobby_closed') return 'Закрытое лобби';
    if (chat.archive_reason === 'deleted_by_owner') return 'Удалён владельцем';
    if (chat.linked_room_id) return 'Игровой чат в архиве';
    return 'В архиве';
  };

  return (
    <div className="p-4 sm:p-6 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-xl space-y-4 sm:space-y-5 w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 w-full min-w-0">
        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
          <div className="p-2.5 sm:p-3 rounded-2xl bg-transparent text-primary border border-primary/30 backdrop-blur-xl shrink-0">
            <Users size={22} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h3 className="text-base sm:text-lg font-black text-foreground break-words leading-tight">
                Групповые чаты и архив игр
              </h3>
              <BubbleElement isBadge size="sm" className="!text-sm shrink-0">
                {activeChats.length} активных • {archivedChats.length} в архиве
              </BubbleElement>
            </div>
            <p className="text-sm text-foreground/70 break-words leading-snug">
              Беседы с друзьями, чаты лобби и архив переписок завершённых игр и удалённых бесед
            </p>
          </div>
        </div>

        <LeafButton
          variant="primary"
          size="sm"
          onClick={() => setCreateModalOpen(true)}
          icon={<Plus size={16} />}
          className="w-full sm:w-auto max-w-full justify-center shrink-0"
        >
          <span>Создать чат</span>
        </LeafButton>
      </div>

      {/* Section Switcher: Активные чаты / Архив */}
      <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 p-2 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl w-full min-w-0">
        <BubbleElement
          size="md"
          active={activeSection === 'active'}
          onClick={() => setActiveSection('active')}
          icon={<MessageSquare size={15} />}
          className="w-full sm:w-auto justify-center cursor-pointer text-sm"
        >
          Активные чаты ({activeChats.length})
        </BubbleElement>

        <BubbleElement
          size="md"
          active={activeSection === 'archive'}
          onClick={() => setActiveSection('archive')}
          icon={<Archive size={15} />}
          className="w-full sm:w-auto justify-center cursor-pointer text-sm"
        >
          Архив ({archivedChats.length})
        </BubbleElement>
      </div>

      {/* List of Group Chats */}
      {loading ? (
        <div className="py-10 flex flex-col items-center justify-center gap-2 text-primary">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-sm">Загрузка ваших бесед...</span>
        </div>
      ) : displayedChats.length === 0 ? (
        <div className="p-5 sm:p-6 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl text-center space-y-3 w-full min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-transparent border border-primary/25 flex items-center justify-center text-primary mx-auto">
            {activeSection === 'archive' ? <Archive size={24} /> : <MessageSquare size={24} />}
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-base font-bold text-foreground break-words">
              {activeSection === 'archive'
                ? 'В архиве пока нет чатов'
                : 'У вас еще нет активных групповых чатов'}
            </p>
            <p className="text-sm text-foreground/65 max-w-md mx-auto break-words">
              {activeSection === 'archive'
                ? 'Сюда автоматически переносятся чаты и переписки из завершённых игр, закрытых лобби и удалённых владельцем бесед.'
                : 'Создайте беседу, пригласите друзей из списка или запустите мультиплеерную игру — игровой чат появится здесь автоматически!'}
            </p>
          </div>
          {activeSection === 'active' && (
            <LeafButton
              variant="glass"
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              icon={<Plus size={16} />}
              className="mx-auto max-w-full justify-center"
            >
              <span>Создать первую беседу</span>
            </LeafButton>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full min-w-0">
          {displayedChats.map((chat) => {
            const isOwner =
              chat.role === 'owner' ||
              String(chat.creator_id) === String(currentUser.uid) ||
              (currentUser.id && String(chat.creator_id) === String(currentUser.id));
            const isAdmin = chat.role === 'admin';
            const isArchived = Number(chat.is_archived) === 1;
            const isGameChat = Boolean(chat.linked_room_id);

            return (
              <div
                key={chat.id}
                className="p-3.5 sm:p-4 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl hover:border-primary/50 transition-all flex flex-col justify-between gap-3 group w-full min-w-0 overflow-hidden"
              >
                <div className="flex items-start justify-between gap-2 w-full min-w-0">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl overflow-hidden border border-primary/35 bg-transparent shrink-0 flex items-center justify-center">
                      {chat.avatar_url ? (
                        <img
                          src={chat.avatar_url}
                          alt={chat.title}
                          className="w-full h-full object-cover"
                        />
                      ) : isGameChat ? (
                        <Gamepad2 size={22} className="text-primary" />
                      ) : (
                        <Users size={22} className="text-primary/80" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <h4 className="text-sm font-bold text-foreground break-words leading-snug group-hover:text-primary transition-colors min-w-0">
                          {chat.title}
                        </h4>
                        {isOwner ? (
                          <BubbleElement isBadge size="sm" icon={<Crown size={12} />} className="!px-2 !py-0.5 !text-sm shrink-0">
                            Владелец
                          </BubbleElement>
                        ) : isAdmin ? (
                          <BubbleElement isBadge size="sm" icon={<Shield size={12} />} className="!px-2 !py-0.5 !text-sm shrink-0">
                            Админ
                          </BubbleElement>
                        ) : null}
                        {isArchived && (
                          <BubbleElement isBadge size="sm" icon={<Lock size={12} />} className="!px-2 !py-0.5 !text-sm shrink-0">
                            {getArchiveReasonLabel(chat)}
                          </BubbleElement>
                        )}
                      </div>

                      <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap text-sm text-foreground/65 min-w-0">
                        <span className="shrink-0">👥 {chat.members_count || 1} уч.</span>
                        {isGameChat && !isArchived && (
                          <span className="text-primary flex items-center gap-1 font-semibold shrink-0">
                            <Gamepad2 size={13} />
                            <span>Игровое лобби</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Unread Counter Badge */}
                  {!isArchived && chat.unread_count > 0 && (
                    <BubbleElement isBadge active size="sm" className="shrink-0 !px-2 !py-0.5 !text-sm">
                      +{chat.unread_count}
                    </BubbleElement>
                  )}
                </div>

                {/* Last Message Snippet */}
                {chat.last_message ? (
                  <div className="p-2.5 rounded-xl bg-transparent border border-primary/20 backdrop-blur-md text-sm text-foreground/85 w-full min-w-0 overflow-hidden break-words line-clamp-2 leading-snug">
                    <span className="font-bold text-primary mr-1">
                      {chat.last_message_sender_name || 'Участник'}:
                    </span>
                    <span className="break-words">{chat.last_message}</span>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-transparent border border-primary/15 backdrop-blur-md text-sm text-foreground/55 w-full min-w-0 break-words">
                    {isArchived ? 'Архив переписки (только чтение)' : 'Нет сообщений'}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t border-primary/15 w-full min-w-0">
                  <span className="text-sm text-foreground/60 flex items-center gap-1 min-w-0">
                    <Clock size={13} className="shrink-0" />
                    <span className="truncate">
                      {chat.last_message_time
                        ? new Date(chat.last_message_time).toLocaleDateString([], {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Создан'}
                    </span>
                  </span>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end min-w-0">
                    {!isArchived && (
                      <BubbleElement
                        size="sm"
                        onClick={() => setSettingsChatId(chat.id)}
                        icon={<Settings size={14} />}
                        className="cursor-pointer text-sm shrink-0"
                        title="Настройки чата"
                      >
                        Инфо
                      </BubbleElement>
                    )}

                    {!isArchived && isOwner && (
                      <BubbleElement
                        size="sm"
                        onClick={(e) => handleArchiveChat(chat, e)}
                        icon={
                          archivingChatId === chat.id ? (
                            <Loader2 size={14} className="animate-spin text-rose-400" />
                          ) : (
                            <Trash2 size={14} className="text-rose-400" />
                          )
                        }
                        className="cursor-pointer text-sm text-rose-400 border-rose-500/35 shrink-0"
                        title="Удалить групповой чат в архив (в чате больше нельзя будет писать)"
                      >
                        В архив
                      </BubbleElement>
                    )}

                    <LeafButton
                      variant={isArchived ? 'glass' : 'primary'}
                      size="sm"
                      onClick={() => setActiveChatId(chat.id)}
                      icon={isArchived ? <Archive size={14} /> : <MessageSquare size={14} />}
                      className="flex-1 sm:flex-initial max-w-full justify-center"
                    >
                      <span>{isArchived ? 'Переписка' : 'Открыть чат'}</span>
                    </LeafButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <CreateGroupChatModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        currentUserUid={currentUser.uid}
        onCreated={handleCreated}
      />

      {activeChatId && (
        <GroupChatModal
          isOpen={Boolean(activeChatId)}
          onClose={() => {
            setActiveChatId(null);
            loadGroupChats();
          }}
          chatId={activeChatId}
          currentUser={currentUser}
          onChatUpdated={loadGroupChats}
        />
      )}

      {settingsChatId && (
        <GroupChatSettingsModal
          isOpen={Boolean(settingsChatId)}
          onClose={() => setSettingsChatId(null)}
          chatId={settingsChatId}
          currentUserUid={currentUser.uid}
          onChatUpdated={loadGroupChats}
          onLeftChat={() => {
            setSettingsChatId(null);
            loadGroupChats();
          }}
        />
      )}
    </div>
  );
};
