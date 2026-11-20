import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Users, MessageSquare, Copy, Check, Search, X, Send, UserPlus, UserCheck } from 'lucide-react';
import { BubbleElement } from '../ui/BubbleElement';
import { LeafButton } from '../ui/LeafButton';
import { UserAvatar } from '../UserAvatar';

interface VideoInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    uid: string;
    display_name?: string;
    avatar_url?: string | null;
  };
  roomId: string;
  roomTitle: string;
  roomType?: string;
  gameId?: string;
  invitePath?: string;
  onSelfJoined?: () => void;
}

export const VideoInviteModal: React.FC<VideoInviteModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  roomId,
  roomTitle,
  roomType = 'general',
  gameId,
  invitePath,
  onSelfJoined
}) => {
  const [friends, setFriends] = useState<any[]>([]);
  const [groupChats, setGroupChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<'friends' | 'groups'>('friends');
  const [selfJoined, setSelfJoined] = useState(false);
  const [joiningSelf, setJoiningSelf] = useState(false);

  const isGameLobby = Boolean(
    gameId ||
    roomType === 'blitz' ||
    roomType === '100to1' ||
    roomType === 'jeopardy' ||
    (invitePath && invitePath.includes('/multiplayer/room/'))
  );

  const resolvedGamePath =
    invitePath ||
    (isGameLobby
      ? `/multiplayer/room/${roomId}`
      : `/zoom?room=${roomId}&type=${roomType}`);

  const inviteLink = `${window.location.origin}${resolvedGamePath}`;

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        let loadedFriends: any[] = [];
        try {
          const friendsRes = await fetch(`/api/friends?userId=${currentUser.uid}`);
          if (friendsRes.ok) {
            const data = await friendsRes.json();
            loadedFriends = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
          }
        } catch (_) {}

        if (loadedFriends.length === 0) {
          try {
            const usersRes = await fetch(`/api/friends/users?userId=${currentUser.uid}&filter=friends`);
            if (usersRes.ok) {
              const uData = await usersRes.json();
              loadedFriends = Array.isArray(uData.data) ? uData.data : [];
            }
          } catch (_) {}
        }

        if (loadedFriends.length === 0) {
          try {
            const allUsersRes = await fetch(`/api/friends/users?userId=${currentUser.uid}&filter=all&limit=30`);
            if (allUsersRes.ok) {
              const aData = await allUsersRes.json();
              loadedFriends = (Array.isArray(aData.data) ? aData.data : []).filter((u: any) => u.uid !== currentUser.uid);
            }
          } catch (_) {}
        }

        const uniqueFriendsMap = new Map<string, any>();
        for (const f of loadedFriends) {
          const uid = String(f.uid || f.id || '');
          if (uid && uid !== currentUser.uid && !uniqueFriendsMap.has(uid)) {
            uniqueFriendsMap.set(uid, f);
          }
        }
        setFriends(Array.from(uniqueFriendsMap.values()));

        try {
          const groupsRes = await fetch(
            `/api/group-chats?userId=${encodeURIComponent(currentUser.uid)}&exclude_archived=1&only_group_chats=1`
          );
          if (groupsRes.ok) {
            const groupsData = await groupsRes.json();
            const list = Array.isArray(groupsData.data) ? groupsData.data : Array.isArray(groupsData) ? groupsData : [];
            const uniqueGroupsMap = new Map<string, any>();
            for (const g of list) {
              const gid = String(g.id || '');
              const isArchived =
                Number(g.is_archived) === 1 ||
                Boolean(g.archived_at) ||
                Boolean(g.archive_reason);
              const isGameRoomLog =
                Boolean(g.linked_room_id) ||
                gid.startsWith('gchat_room_');
              if (gid && !isArchived && !isGameRoomLog && !uniqueGroupsMap.has(gid)) {
                uniqueGroupsMap.set(gid, g);
              }
            }
            setGroupChats(Array.from(uniqueGroupsMap.values()));
          }
        } catch (_) {}
      } catch (e) {
        console.warn('Failed to load friends/groups for invite:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, currentUser.uid]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Requirement 4: Add self as 2nd participant directly in lobby without opening a second browser window
  const handleAddSelfSecondParticipant = async () => {
    setJoiningSelf(true);
    try {
      const self2Id = `${currentUser.uid}_self2`;
      await fetch(`/api/zoom/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: self2Id,
          display_name: `${currentUser.display_name || 'Вы'} (2-й участник)`,
          avatar_url: currentUser.avatar_url,
          is_camera_on: 1,
          is_mic_on: 1,
          is_screen_sharing: 0
        })
      }).catch(() => {});

      await fetch(`/api/multiplayer/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: self2Id,
          team_number: 2
        })
      }).catch(() => {});

      setSelfJoined(true);
      if (onSelfJoined) onSelfJoined();
    } catch (e) {
      console.warn('Failed to add self as 2nd participant:', e);
    } finally {
      setJoiningSelf(false);
    }
  };

  const getLobbyLabel = () => {
    switch (roomType) {
      case 'blitz': return 'КвИИз';
      case '100to1': return 'Сто Квадному';
      case 'jeopardy': return 'Своя Икра';
      case 'chat': return 'Видеочат';
      default: return isGameLobby ? 'Лобби игры' : 'Видеокомната';
    }
  };

  const buildInvitePayload = () => {
    if (isGameLobby) {
      const resolvedGameId = gameId || (['blitz', '100to1', 'jeopardy'].includes(roomType) ? roomType : 'blitz');
      return {
        message: `Приглашаю в лобби игры «${roomTitle}» (${getLobbyLabel()})`,
        is_invite: true,
        game_invite: {
          is_video_call: false,
          room_id: roomId,
          game_type: resolvedGameId,
          gameId: resolvedGameId,
          game_title: roomTitle,
          gameTitle: roomTitle,
          gamePath: resolvedGamePath,
          type: resolvedGameId,
          title: roomTitle
        }
      };
    }

    return {
      message: 'Создан видеозвонок',
      is_invite: true,
      game_invite: {
        is_video_call: true,
        room_id: roomId,
        type: 'chat',
        title: roomTitle
      }
    };
  };

  const handleSendToFriend = async (friendUid: string) => {
    try {
      setSentMap((prev) => ({ ...prev, [friendUid]: true }));
      if (isGameLobby && roomId) {
        fetch(`/api/multiplayer/rooms/${roomId}/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invited_user_id: friendUid })
        }).catch(() => {});
      }
      const base = buildInvitePayload();
      const payload = {
        userId: currentUser.uid,
        sender_id: currentUser.uid,
        receiver_id: friendUid,
        ...base
      };

      let res = await fetch(`/api/messages/${friendUid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        res = await fetch('/api/friends/direct-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    } catch (e) {
      console.warn('Failed to send invite:', e);
    }
  };

  const handleSendToGroup = async (chatId: string) => {
    try {
      setSentMap((prev) => ({ ...prev, [chatId]: true }));
      const base = buildInvitePayload();

      await fetch(`/api/group-chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.uid,
          ...base
        })
      });
    } catch (e) {
      console.warn('Failed to send group invite:', e);
    }
  };

  const filteredFriends = friends.filter((f) => {
    const name = f.display_name || f.username || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredGroups = groupChats.filter((g) => {
    const title = g.title || '';
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const modalContent = (
    <div className="fixed inset-0 z-[10010] flex items-center justify-center p-2 sm:p-4 bg-transparent backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg h-[96dvh] max-h-[96dvh] sm:h-[90vh] sm:max-h-[850px] flex flex-col justify-between rounded-3xl border border-primary/30 bg-transparent backdrop-blur-3xl shadow-2xl overflow-hidden">
        {/* Header: Top row icons, second row full-width title & room info */}
        <div className="p-3 sm:p-4 border-b border-primary/20 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="w-9 h-9 rounded-2xl bg-primary/20 border border-primary/35 flex items-center justify-center text-primary shrink-0">
              <Users size={18} />
            </div>
            <BubbleElement
              size="sm"
              onClick={onClose}
              icon={<X size={18} />}
              title="Закрыть"
              className="shrink-0 !px-2.5 !py-2"
            />
          </div>
          <div className="min-w-0 w-full">
            <h3 className="text-base sm:text-lg font-bold text-foreground break-words leading-snug">
              {isGameLobby ? 'Пригласить друзей в лобби игры' : 'Пригласить в видеокомнату'}
            </h3>
            <p className="text-sm text-foreground/65 break-words leading-snug mt-0.5">
              {getLobbyLabel()} • {roomTitle}
            </p>
          </div>
        </div>

        {/* Copy Link Row */}
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 bg-transparent border-b border-primary/15 shrink-0 space-y-1.5">
          <span className="text-sm font-semibold text-foreground/75 block">
            Прямая ссылка на лобби:
          </span>
          <div className="flex items-center gap-2 w-full">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="flex-1 min-w-0 text-sm font-mono bg-transparent border border-primary/25 rounded-2xl px-3 py-2 text-foreground/90 select-all focus:outline-none"
            />
            <BubbleElement
              size="sm"
              active={copiedLink}
              onClick={handleCopy}
              icon={copiedLink ? <Check size={16} /> : <Copy size={16} />}
              title={copiedLink ? 'Ссылка скопирована' : 'Копировать ссылку'}
              className="shrink-0 !px-3 !py-2"
            />
          </div>
        </div>

        {/* Tabs: Friends vs Groups + Search */}
        <div className="px-3 py-2.5 sm:px-4 border-b border-primary/15 flex flex-col gap-2 shrink-0">
          <div className="grid grid-cols-2 gap-2 w-full">
            <BubbleElement
              size="sm"
              active={activeTab === 'friends'}
              onClick={() => setActiveTab('friends')}
              icon={<Users size={15} />}
              className="w-full justify-center"
            >
              Друзья ({friends.length})
            </BubbleElement>
            <BubbleElement
              size="sm"
              active={activeTab === 'groups'}
              onClick={() => setActiveTab('groups')}
              icon={<MessageSquare size={15} />}
              className="w-full justify-center"
            >
              Беседы ({groupChats.length})
            </BubbleElement>
          </div>

          <div className="relative w-full">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input
              type="text"
              placeholder={activeTab === 'friends' ? 'Поиск по друзьям...' : 'Поиск по беседам...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-sm pl-9 pr-4 py-2 rounded-2xl border border-primary/25 bg-transparent text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Scrollable List — flex-1 min-h-0 ensures it fits inside the full-height modal without pushing the footer off screen */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-foreground/50">
              Загрузка контактов...
            </div>
          ) : activeTab === 'friends' ? (
            <div className="space-y-2">
              {/* Option 0: Add Self as 2nd participant in lobby */}
              <div className="flex items-center justify-between p-3 rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl shadow-sm gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary text-sm font-black shrink-0">
                    2x
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground break-words leading-snug">
                      Вы (2-й участник — играть с собой)
                    </p>
                    <p className="text-sm text-foreground/60 break-words leading-snug">
                      Добавиться 2-м участником без второго окна
                    </p>
                  </div>
                </div>

                <BubbleElement
                  size="sm"
                  active={selfJoined}
                  disabled={joiningSelf || selfJoined}
                  onClick={handleAddSelfSecondParticipant}
                  icon={selfJoined ? <UserCheck size={16} /> : <UserPlus size={16} />}
                  title={selfJoined ? 'Вы в лобби (2-й участник)' : 'Добавиться 2-м участником'}
                  className="shrink-0 !px-3 !py-2"
                />
              </div>

              {filteredFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-foreground/50 space-y-2">
                  <Users size={28} className="text-foreground/30" />
                  <p className="text-sm font-semibold">Друзья пока не добавлены</p>
                  <p className="text-sm text-foreground/45 max-w-xs">
                    Скопируйте ссылку выше или пригласите участников через беседы
                  </p>
                </div>
              ) : (
                filteredFriends.map((f, idx) => {
                  const isSent = Boolean(sentMap[f.uid || f.id]);
                  return (
                    <div
                      key={`invite-friend-${f.uid || f.id}-${idx}`}
                      className="flex items-center justify-between p-3 rounded-2xl border border-primary/20 bg-transparent hover:border-primary/45 transition-all gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <UserAvatar
                          avatarUrl={f.avatar_url || f.photo_url}
                          displayName={f.display_name || f.username}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-foreground break-words leading-snug">
                            {f.display_name || f.username || 'Игрок'}
                          </p>
                          <p className="text-sm text-foreground/55 truncate">
                            {f.is_online ? 'В сети' : 'Не в сети'}
                          </p>
                        </div>
                      </div>

                      <BubbleElement
                        size="sm"
                        active={isSent}
                        disabled={isSent}
                        onClick={() => handleSendToFriend(f.uid || f.id)}
                        icon={isSent ? <Check size={16} /> : <Send size={16} />}
                        title={isSent ? 'Отправлено' : 'Пригласить'}
                        className="shrink-0 !px-3 !py-2"
                      />
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            filteredGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-foreground/50 space-y-2">
                <MessageSquare size={28} className="text-foreground/30" />
                <p className="text-sm font-semibold">Беседы не найдены</p>
                <p className="text-sm text-foreground/45 max-w-xs">
                  Вы пока не состоите в беседах
                </p>
              </div>
            ) : (
              filteredGroups.map((g, idx) => {
                const isSent = Boolean(sentMap[g.id]);
                return (
                  <div
                    key={`invite-group-${g.id}-${idx}`}
                    className="flex items-center justify-between p-3 rounded-2xl border border-primary/20 bg-transparent hover:border-primary/45 transition-all gap-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                        <MessageSquare size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground break-words leading-snug">
                          {g.title || 'Беседа'}
                        </p>
                        <p className="text-sm text-foreground/55 truncate">
                          {g.members_count || 1} участников
                        </p>
                      </div>
                    </div>

                    <BubbleElement
                      size="sm"
                      active={isSent}
                      disabled={isSent}
                      onClick={() => handleSendToGroup(g.id)}
                      icon={isSent ? <Check size={16} /> : <Send size={16} />}
                      title={isSent ? 'Отправлено' : 'Отправить в беседу'}
                      className="shrink-0 !px-3 !py-2"
                    />
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Footer — shrink-0 guarantees the bottom button is always visible */}
        <div className="p-3 sm:p-3.5 border-t border-primary/20 bg-transparent backdrop-blur-md flex justify-end shrink-0">
          <LeafButton
            variant="primary"
            size="sm"
            onClick={onClose}
            icon={<Check size={15} />}
          >
            Готово
          </LeafButton>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
