import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Users, 
  Video, 
  Gamepad2, 
  Plus, 
  Radio, 
  Play, 
  RefreshCw, 
  Copy, 
  Check, 
  MessageSquare, 
  X,
  UserCheck,
  UserPlus,
  RotateCcw,
  Timer,
  Trophy,
  Eye,
  LogOut,
  Globe,
  Lock
} from 'lucide-react';
import { LeafButton } from '../ui/LeafButton';
import { BubbleElement } from '../ui/BubbleElement';
import { useAuth } from '../../context/AuthContext';
import { ZoomVideoModal } from '../ZoomVideoModal';
import { groupChatsService } from '../../services/groupChats';

interface MultiplayerRoom {
  id: string;
  game_id: string;
  game_title: string;
  host_id: string;
  host_name?: string;
  host_avatar?: string | null;
  topic?: string;
  difficulty?: string;
  status: 'waiting' | 'active' | 'finished';
  question_count?: number;
  pack_id?: string | null;
  finish_remaining_seconds?: number | null;
  is_host_in_lobby?: boolean;
  online_in_lobby_count?: number;
  host_transfer_remaining_seconds?: number | null;
  host_timer_paused?: boolean;
  is_host_free?: boolean;
  invited_user_ids?: string[];
  saved_user_ids?: string[];
  saved_user_scores?: Record<string, any>;
  participants?: any[];
  room_type?: string;
  visibility?: 'public' | 'private';
  max_players?: number;
  maxPlayers?: number;
  created_at: string;
}

export const ProfileMultiplayerView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, effectiveUid: authEffectiveUid, openAuthModal } = useAuth();
  const effectiveUid = String(profile?.uid || authEffectiveUid || '');

  const [rooms, setRooms] = useState<MultiplayerRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGameFilter, setSelectedGameFilter] = useState<string>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(0);

  // Create lobby modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState<'game' | 'chat'>('game');
  const [createVisibility, setCreateVisibility] = useState<'public' | 'private'>('public');
  const [createMaxPlayers, setCreateMaxPlayers] = useState<number>(4);
  const [chatList, setChatList] = useState<{ id: string; title: string; type: 'group' | 'direct'; avatar?: string | null }[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);

  // Video Room Modal state (only for non-game chat video calls)
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomRoomId, setZoomRoomId] = useState('');
  const [zoomRoomTitle, setZoomRoomTitle] = useState('Видеокомната');
  const [zoomRoomType, setZoomRoomType] = useState('general');

  // Tick every second when any active room has a 5-minute countdown OR any waiting room has an active 10-minute host timer
  useEffect(() => {
    const hasActiveTimer = rooms.some(
      r =>
        (r.status === 'active' && typeof r.finish_remaining_seconds === 'number' && r.finish_remaining_seconds > 0) ||
        (r.status === 'waiting' &&
          !r.host_timer_paused &&
          typeof r.host_transfer_remaining_seconds === 'number' &&
          r.host_transfer_remaining_seconds > 0)
    );
    if (!hasActiveTimer) return;
    const t = setInterval(() => setNowTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [rooms]);

  // Check URL query parameters (?room=...&type=...)
  useEffect(() => {
    const roomParam = searchParams.get('room');
    const typeParam = searchParams.get('type') || 'general';
    if (roomParam) {
      const cleanId = roomParam.replace(/^room_/, '');
      if (cleanId.startsWith('mproom_') || ['blitz', '100to1', 'jeopardy'].includes(typeParam)) {
        navigate(`/multiplayer/room/${cleanId}`, { replace: true });
        return;
      }
      setZoomRoomId(roomParam);
      setZoomRoomType(typeParam);
      setZoomRoomTitle(
        typeParam === 'chat' ? 'Видеокомната чата' : 'Видеокомната'
      );
      setIsZoomOpen(true);
    }
  }, [searchParams, navigate]);

  // Fetch multiplayer rooms (manual refresh or filter change only — no 5s auto-refresh blinking)
  const fetchRooms = async () => {
    try {
      setLoading(true);
      const qp = new URLSearchParams();
      if (selectedGameFilter !== 'all') {
        qp.set('game_id', selectedGameFilter);
      }
      if (effectiveUid) {
        qp.set('user_id', String(effectiveUid));
      }
      if (visibilityFilter !== 'all') {
        qp.set('visibility', visibilityFilter);
      }
      const url = `/api/multiplayer/rooms?${qp.toString()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setNowTick(0);
        setRooms(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch rooms:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [selectedGameFilter, visibilityFilter, effectiveUid]);

  // Load chats for "Для чата" selection (only active group chats, excluding archives and personal chats)
  const loadChatsForLobby = async () => {
    if (!profile?.uid) return;
    setLoadingChats(true);
    try {
      const items: { id: string; title: string; type: 'group' | 'direct'; avatar?: string | null }[] = [];

      try {
        const groups = await groupChatsService.fetchInviteableGroupChats(profile.uid);
        for (const g of groups) {
          if (
            Number(g.is_archived) === 1 ||
            Boolean(g.archived_at) ||
            Boolean(g.archive_reason) ||
            Boolean(g.linked_room_id) ||
            String(g.id || '').startsWith('gchat_room_')
          ) {
            continue;
          }
          items.push({
            id: g.id,
            title: g.title || 'Беседа',
            type: 'group',
            avatar: g.avatar_url
          });
        }
      } catch (_) {}

      // Deduplicate group chats
      const uniqueMap = new Map<string, { id: string; title: string; type: 'group' | 'direct'; avatar?: string | null }>();
      for (const item of items) {
        const key = `${item.type}-${item.id}`;
        if (item.id && !uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      }

      setChatList(Array.from(uniqueMap.values()));
    } catch (e) {
      console.error('Error loading chats:', e);
    } finally {
      setLoadingChats(false);
    }
  };

  useEffect(() => {
    if (isCreateModalOpen && createCategory === 'chat') {
      loadChatsForLobby();
    }
  }, [isCreateModalOpen, createCategory]);

  // Start Video Room (generate unique ID, save to DB, add to link)
  const handleStartVideoRoom = async (customRoomId?: string, title?: string, type = 'general') => {
    if (!profile) {
      openAuthModal('login');
      return;
    }

    const roomId = customRoomId || `vroom_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const roomTitle = title || 'Видеокомната';

    try {
      await fetch('/api/zoom/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: roomId,
          title: roomTitle,
          room_type: type,
          host_id: profile.uid
        })
      });
    } catch (_) {}

    setZoomRoomId(roomId);
    setZoomRoomTitle(roomTitle);
    setZoomRoomType(type);
    setIsZoomOpen(true);

    const newParams = new URLSearchParams(searchParams);
    newParams.set('room', roomId);
    newParams.set('type', type);
    setSearchParams(newParams, { replace: true });
  };

  // Close Zoom Modal
  const handleCloseZoom = () => {
    setIsZoomOpen(false);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('room');
    newParams.delete('type');
    newParams.delete('game');
    setSearchParams(newParams, { replace: true });
  };

  // Handle Game Selection: redirect to Home with game constructor pre-selected for multiplayer
  const handleSelectGameForLobby = (gameId: string) => {
    setIsCreateModalOpen(false);
    navigate(`/?start_game=${gameId}&mode=multi&visibility=${createVisibility}&max_players=${createMaxPlayers}`);
  };

  // Handle Chat Selection: immediately create room in DB, post invite message to chat (without AI moderation and without raw text link), open room
  const handleSelectChatForLobby = async (chat: { id: string; title: string; type: 'group' | 'direct' }) => {
    if (!profile) return;
    setIsCreateModalOpen(false);

    const roomId = `vroom_chat_${chat.id}_${Date.now().toString(36)}`;
    const roomTitle = `Видеокомната: ${chat.title}`;

    try {
      await fetch('/api/zoom/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: roomId,
          title: roomTitle,
          room_type: 'chat',
          host_id: profile.uid,
          target_id: chat.id
        })
      });
    } catch (_) {}

    if (chat.type === 'group') {
      try {
        await groupChatsService.sendGroupMessage(chat.id, {
          userId: profile.uid,
          message: `📹 Создан видеозвонок беседы «${chat.title}»`,
          is_invite: true,
          game_invite: {
            invite_type: 'video_call',
            room_id: roomId,
            type: 'chat',
            title: roomTitle
          }
        });
      } catch (_) {}
    } else {
      try {
        const payload = {
          userId: profile.uid,
          sender_id: profile.uid,
          receiver_id: chat.id,
          message: `📹 Создан видеозвонок`,
          is_invite: true,
          game_invite: {
            invite_type: 'video_call',
            room_id: roomId,
            type: 'chat',
            title: roomTitle
          }
        };
        const res = await fetch(`/api/messages/${chat.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          await fetch('/api/friends/direct-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
      } catch (_) {}
    }

    setZoomRoomId(roomId);
    setZoomRoomTitle(roomTitle);
    setZoomRoomType('chat');
    setIsZoomOpen(true);

    const newParams = new URLSearchParams(searchParams);
    newParams.set('room', roomId);
    newParams.set('type', 'chat');
    setSearchParams(newParams, { replace: true });
  };

  // Requirement 4: Add self as 2nd participant directly into the lobby without opening a second browser window
  const handlePlayWithSelf = async (targetRoomId?: string) => {
    if (!profile) {
      openAuthModal('login');
      return;
    }

    const self2Uid = `${profile.uid}_self2`;
    const self2Name = `${profile.display_name || 'Вы'} (2-й участник)`;

    if (targetRoomId) {
      // Join the existing multiplayer room as 2nd participant and navigate into it
      try {
        await fetch(`/api/multiplayer/rooms/${targetRoomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: self2Uid,
            team_number: 2
          })
        });
        await fetch(`/api/zoom/rooms/room_${targetRoomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: self2Uid,
            display_name: self2Name,
            avatar_url: profile.avatar_url,
            is_camera_on: 1,
            is_mic_on: 1
          })
        });
      } catch (_) {}
      await fetchRooms();
      navigate(`/multiplayer/room/${targetRoomId}`);
      return;
    }

    // Create/open video lobby and add self as 2nd participant right inside it
    const roomId = zoomRoomId || `vroom_solo_${profile.uid}_${Date.now().toString(36)}`;
    const roomTitle = 'Лобби: Игра с собой (2 участника)';

    try {
      await fetch('/api/zoom/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: roomId,
          title: roomTitle,
          room_type: 'general',
          host_id: profile.uid
        })
      });
      await fetch(`/api/zoom/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: self2Uid,
          display_name: self2Name,
          avatar_url: profile.avatar_url,
          is_camera_on: 1,
          is_mic_on: 1
        })
      });
    } catch (_) {}

    setZoomRoomId(roomId);
    setZoomRoomTitle(roomTitle);
    setZoomRoomType('general');
    setIsZoomOpen(true);

    const newParams = new URLSearchParams(searchParams);
    newParams.set('room', roomId);
    newParams.set('type', 'general');
    setSearchParams(newParams, { replace: true });
  };

  const copyRoomLink = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = `${window.location.origin}/multiplayer/room/${roomId}`;
    navigator.clipboard.writeText(link);
    setCopiedRoomId(roomId);
    setTimeout(() => setCopiedRoomId(null), 2000);
  };

  const formatTimerSec = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleLeaveRoomFromCard = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/multiplayer/rooms/${roomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: effectiveUid })
      });
      await fetchRooms();
    } catch (_) {}
  };

  // Requirement 2: Only games with multiplayer support
  const gameOptions = [
    { id: 'blitz', title: 'КвИИз', desc: 'Блиц-викторина на скорость и эрудицию', tag: 'Популярное' },
    { id: '100to1', title: 'Сто Квадному', desc: 'Командное соревнование: 2 команды до 5 игроков', tag: 'Команды' },
    { id: 'jeopardy', title: 'Своя Икра', desc: 'Темы, ставки и игра на опережение', tag: 'Тактика' }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Controls */}
      <div className="relative rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-6 sm:p-7 overflow-hidden shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <BubbleElement isBadge active size="sm" icon={<Radio size={14} className="animate-pulse" />}>
                Онлайн мультиплеер
              </BubbleElement>
              <BubbleElement isBadge size="sm">
                Видеокомнаты и лобби
              </BubbleElement>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-foreground">
              Мультиплеерные комнаты и видеозвонки
            </h3>
            <p className="text-sm text-foreground/75 leading-relaxed">
              Играйте с друзьями в реальном времени, создавайте видеокомнаты для командного общения или тренируйтесь в режиме с самим собой.
            </p>
          </div>

          {/* Action Leaf Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <LeafButton
              variant="primary"
              size="md"
              onClick={() => setIsCreateModalOpen(true)}
              icon={<Plus size={18} />}
              title="Создать новое игровое лобби или комнату чата"
            >
              Создать лобби
            </LeafButton>
          </div>
        </div>
      </div>

      {/* Filter Tabs by Game or Chat & Open/Closed Visibility */}
      <div className="flex flex-col gap-3 p-3.5 rounded-2xl bg-transparent border border-primary/20 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-foreground/70 mr-1.5 shrink-0">Категория:</span>
            {[
              { id: 'all', label: 'Все комнаты' },
              { id: 'blitz', label: 'КвИИз' },
              { id: '100to1', label: 'Сто Квадному' },
              { id: 'jeopardy', label: 'Своя Икра' },
              { id: 'chat', label: 'Чаты' }
            ].map((tab) => (
              <BubbleElement
                key={tab.id}
                size="sm"
                active={selectedGameFilter === tab.id}
                onClick={() => setSelectedGameFilter(tab.id)}
              >
                {tab.label}
              </BubbleElement>
            ))}
          </div>

          <BubbleElement
            size="sm"
            onClick={() => {
              setNowTick(0);
              fetchRooms();
            }}
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            title="Обновить список активных комнат"
          >
            Обновить
          </BubbleElement>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-primary/15">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-foreground/70 mr-1.5 shrink-0">Вид доступа:</span>
            <BubbleElement
              size="sm"
              active={visibilityFilter === 'all'}
              onClick={() => setVisibilityFilter('all')}
            >
              Все игры
            </BubbleElement>
            <BubbleElement
              size="sm"
              active={visibilityFilter === 'public'}
              onClick={() => setVisibilityFilter('public')}
              icon={<Globe size={14} />}
            >
              Открытые
            </BubbleElement>
            <BubbleElement
              size="sm"
              active={visibilityFilter === 'private'}
              onClick={() => setVisibilityFilter('private')}
              icon={<Lock size={14} />}
            >
              Закрытые (по приглашению)
            </BubbleElement>
          </div>
          <span className="text-sm text-foreground/60">
            {visibilityFilter === 'private'
              ? 'Показаны закрытые игры, в которые вы вступили'
              : visibilityFilter === 'public'
              ? 'Показаны открытые игры, доступные всем игрокам'
              : 'Открытые игры видны всем, закрытые — только вступившим'}
          </span>
        </div>
      </div>

      {/* Rooms Grid */}
      {(() => {
        const visibleRooms = rooms.filter((room) => {
          const roomVis = room.visibility === 'private' ? 'private' : 'public';
          const myPart = (room.participants || []).find(
            (p: any) =>
              String(p.user_id) === String(effectiveUid) ||
              String(p.user_id) === `${effectiveUid}_self2`
          );
          const hasSavedProgress =
            Boolean(room.saved_user_scores?.[String(effectiveUid)]) ||
            (Array.isArray(room.saved_user_ids) && room.saved_user_ids.includes(String(effectiveUid)));
          const isParticipant =
            Boolean(myPart) ||
            hasSavedProgress ||
            (room.status === 'waiting' && String(room.host_id) === String(effectiveUid));
          const isInvited =
            Array.isArray(room.invited_user_ids) &&
            room.invited_user_ids.map(String).includes(String(effectiveUid));

          // Requirement 1:
          // - If status !== 'waiting' (game already started or finished), hide from everyone who is NOT a participant
          //   (even for open games, and even for closed games where the user was invited: "Не успел = не видишь").
          if (room.status !== 'waiting') {
            if (!isParticipant) return false;
          } else {
            // In 'waiting' status: closed rooms are visible only to participants or invited users
            if (roomVis === 'private' && !isParticipant && !isInvited) {
              return false;
            }
          }

          if (visibilityFilter !== 'all' && roomVis !== visibilityFilter) {
            return false;
          }
          return true;
        });

        if (loading && visibleRooms.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-16 text-foreground/50 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl">
              <RefreshCw className="animate-spin text-primary mb-3" size={32} />
              <p className="text-sm font-semibold">Загрузка комнат мультиплеера...</p>
            </div>
          );
        }

        if (visibleRooms.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-16 text-foreground/50 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl text-center p-6 space-y-4">
              <div className="w-14 h-14 rounded-full bg-transparent border border-primary/30 flex items-center justify-center text-primary">
                <Users size={28} />
              </div>
              <div className="space-y-1">
                <p className="text-base font-bold text-foreground">
                  {visibilityFilter === 'private'
                    ? 'Нет закрытых игр с вашим участием'
                    : visibilityFilter === 'public'
                    ? 'Сейчас нет открытых лобби'
                    : 'Сейчас нет активных лобби'}
                </p>
                <p className="text-sm text-foreground/60 max-w-md">
                  {visibilityFilter === 'private'
                    ? 'Закрытые игры отображаются здесь только после того, как вы вступили в них по приглашению или создали их.'
                    : 'Создайте собственное открытое или закрытое лобби для игры с друзьями в реальном времени!'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <LeafButton
                  variant="primary"
                  size="sm"
                  onClick={() => setIsCreateModalOpen(true)}
                  icon={<Plus size={16} />}
                >
                  Создать лобби
                </LeafButton>
              </div>
            </div>
          );
        }

        return (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleRooms.map((room) => {
              const isCopied = copiedRoomId === room.id;
              const participantsCount = room.participants?.length || 1;
              const rawMax = Number(room.max_players || room.maxPlayers) || 4;
              const maxParticipants = Math.min(8, Math.max(2, rawMax));
              const roomVis = room.visibility === 'private' ? 'private' : 'public';
              const isRoomFull = participantsCount >= maxParticipants;
              const totalQ = Number(room.question_count) || 10;
              const myPart = (room.participants || []).find((p: any) => String(p.user_id) === String(effectiveUid));
              const isMyRoom = Boolean(myPart) || String(room.host_id) === String(effectiveUid);
              const myFinished = Number(myPart?.is_finished) === 1;
              const myRound = Math.max(1, Math.min(totalQ, Number(myPart?.current_round) || 1));
              const myScore = myPart?.awarded_score !== null && myPart?.awarded_score !== undefined
                ? Number(myPart.awarded_score)
                : Number(myPart?.score) || 0;
              const myCorrect = Number(myPart?.correct_count) || 0;
              const remSec = room.status === 'active' && typeof room.finish_remaining_seconds === 'number' && room.finish_remaining_seconds > 0
                ? Math.max(0, room.finish_remaining_seconds - nowTick)
                : null;
              const hostTransferRemSec =
                room.status === 'waiting' && typeof room.host_transfer_remaining_seconds === 'number'
                  ? room.host_timer_paused
                    ? room.host_transfer_remaining_seconds
                    : Math.max(0, room.host_transfer_remaining_seconds - nowTick)
                  : null;
              const isRoomHostFree =
                room.status === 'waiting' &&
                (Boolean(room.is_host_free) || (!room.host_timer_paused && hostTransferRemSec !== null && hostTransferRemSec <= 0));
              const anyFinishedInRoom = (room.participants || []).some((p: any) => Number(p.is_finished) === 1);
              const isNearFinish = room.status === 'active' && ((remSec !== null && remSec > 0) || anyFinishedInRoom || myFinished);

              const cardStatusLabel =
                room.status === 'waiting'
                  ? `Ожидает (${participantsCount} из ${maxParticipants})`
                  : room.status === 'finished'
                  ? 'Завершена'
                  : isNearFinish
                  ? `На финише${remSec !== null && remSec > 0 ? ` • ${formatTimerSec(remSec)}` : ''}`
                  : `Идет игра • Вопрос ${myRound}/${totalQ}`;

              return (
                <div
                  key={room.id}
                  className="p-5 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-xl hover:border-primary/45 transition-all flex flex-col justify-between gap-4 shadow-lg group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-primary">
                            {room.game_title || 'Викторина'}
                          </span>
                          <BubbleElement
                            isBadge
                            size="sm"
                            active={roomVis === 'public'}
                            icon={roomVis === 'private' ? <Lock size={13} /> : <Globe size={13} />}
                            title={
                              roomVis === 'private'
                                ? 'Закрытая игра (по приглашению — видна только вступившим)'
                                : 'Открытая игра (видна всем во вкладке мультиплеера)'
                            }
                          >
                            {roomVis === 'private' ? 'Закрытая' : 'Открытая'}
                          </BubbleElement>
                        </div>
                        {room.topic && (
                          <p className="text-sm font-semibold text-foreground/80 mt-1 truncate">
                            Тема: {room.topic}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <BubbleElement
                          isBadge
                          active={room.status === 'active' || room.status === 'waiting'}
                          size="sm"
                          icon={isNearFinish ? <Timer size={13} /> : undefined}
                        >
                          {cardStatusLabel}
                        </BubbleElement>
                      </div>
                    </div>

                    {/* Requirement 2: 10-minute host availability / transfer timer for waiting rooms */}
                    {room.status === 'waiting' && (
                      <div className="rounded-2xl border border-primary/25 bg-transparent px-3 py-2 text-sm space-y-1">
                        {isRoomHostFree ? (
                          <div className="flex items-center justify-between gap-2 text-primary font-bold">
                            <span className="flex items-center gap-1.5">
                              <Timer size={14} className="shrink-0" />
                              Игра свободна:
                            </span>
                            <span className="text-right">1-й вошедший станет хостом</span>
                          </div>
                        ) : room.host_timer_paused || room.is_host_in_lobby ? (
                          <div className="flex items-center justify-between gap-2 text-foreground/80">
                            <span className="flex items-center gap-1.5">
                              <Timer size={14} className="text-primary shrink-0" />
                              Хост в лобби (таймер на паузе):
                            </span>
                            <span className="font-bold text-primary">10:00</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 text-amber-300 font-semibold">
                            <span className="flex items-center gap-1.5">
                              <Timer size={14} className="shrink-0 animate-pulse" />
                              Свободный хост через:
                            </span>
                            <span className="font-bold">
                              {formatTimerSec(hostTransferRemSec ?? 600)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Participant progress info for active/finished rooms */}
                    {(myPart || room.status !== 'waiting') && (
                      <div className="rounded-2xl border border-primary/25 bg-transparent px-3 py-2 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-foreground/75">
                            {room.status === 'finished'
                              ? 'Статус игры:'
                              : myFinished
                              ? 'Вы завершили все вопросы:'
                              : 'Вы остановились:'}
                          </span>
                          <span className="font-bold text-primary">
                            {room.status === 'finished'
                              ? `Итог: ${myScore} очк.`
                              : myFinished
                              ? 'Ожидание остальных'
                              : `Вопрос ${myRound} из ${totalQ}`}
                          </span>
                        </div>
                        {(myCorrect > 0 || myScore > 0) && (
                          <div className="flex items-center justify-between text-foreground/70">
                            <span>Верных ответов: {myCorrect}/{totalQ}</span>
                            <span>Очки: {myScore}</span>
                          </div>
                        )}
                        {remSec !== null && remSec > 0 && (
                          <div className="flex items-center justify-between text-primary font-bold pt-0.5 border-t border-primary/15">
                            <span>Завершение у всех через:</span>
                            <span>{formatTimerSec(remSec)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm text-foreground/70 pt-2 border-t border-primary/15 flex-wrap gap-2">
                      <span className="flex items-center gap-1.5">
                        <Users size={15} className="text-primary" />
                        Вступило участников: <strong className="text-foreground font-bold">{participantsCount} из {maxParticipants}</strong>
                      </span>
                      <BubbleElement
                        size="sm"
                        onClick={(e) => copyRoomLink(room.id, e)}
                        icon={isCopied ? <Check size={14} /> : <Copy size={14} />}
                        title="Скопировать прямую ссылку на лобби"
                      >
                        {isCopied ? 'Скопировано' : 'Ссылка'}
                      </BubbleElement>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-primary/15">
                    {room.status === 'active' ? (
                      isMyRoom ? (
                        <>
                          {!myFinished ? (
                            <LeafButton
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                const targetIdx = Math.max(0, myRound - 1);
                                const gPath =
                                  room.game_id === 'jeopardy'
                                    ? '/game/jeopardy'
                                    : room.game_id === '100to1'
                                    ? '/game/100to1'
                                    : '/game/blitz';
                                const qp = new URLSearchParams();
                                qp.set('room', room.id);
                                if (room.pack_id) qp.set('pack', room.pack_id);
                                qp.set('mode', 'multi');
                                navigate(`${gPath}?${qp.toString()}`, {
                                  state: {
                                    mode: 'lite',
                                    playMode: 'multi',
                                    multiMode: 'online',
                                    mpRoomId: room.id,
                                    roomId: room.id,
                                    packId: room.pack_id || undefined,
                                    resume: true,
                                    resumeMultiplayer: true,
                                    fromMultiplayerLobby: true,
                                    currentIndex: targetIdx,
                                    savedRoundIndex: targetIdx,
                                    forcedQuestionIndex: targetIdx,
                                    score: myScore,
                                    topic: room.topic || 'Общие знания',
                                    difficulty: room.difficulty || 'people'
                                  }
                                });
                              }}
                              icon={<RotateCcw size={15} />}
                              className="flex-1 justify-center text-sm py-2"
                            >
                              Продолжить (вопрос {myRound})
                            </LeafButton>
                          ) : (
                            <LeafButton
                              variant="primary"
                              size="sm"
                              onClick={() => navigate(`/multiplayer/room/${room.id}`)}
                              icon={<Eye size={15} />}
                              className="flex-1 justify-center text-sm py-2"
                            >
                              Ждать{remSec ? ` (${formatTimerSec(remSec)})` : ''}
                            </LeafButton>
                          )}
                          <LeafButton
                            variant="glass"
                            size="sm"
                            onClick={(e) => handleLeaveRoomFromCard(room.id, e)}
                            icon={<LogOut size={14} className="text-rose-400" />}
                            className="shrink-0 text-rose-400 border-rose-500/35"
                            title="Выйти из игры (удалиться из списка участников)"
                          >
                            Выйти из игры
                          </LeafButton>
                        </>
                      ) : (
                        <LeafButton
                          variant="glass"
                          size="sm"
                          disabled
                          className="flex-1 justify-center text-sm py-2 opacity-60"
                        >
                          Идет игра
                        </LeafButton>
                      )
                    ) : room.status === 'finished' ? (
                      <LeafButton
                        variant="glass"
                        size="sm"
                        onClick={() => navigate(`/multiplayer/room/${room.id}`)}
                        icon={<Trophy size={15} className="text-primary" />}
                        className="flex-1 justify-center text-sm py-2"
                      >
                        Результаты
                      </LeafButton>
                    ) : (
                      <>
                        {!isMyRoom && isRoomFull ? (
                          <LeafButton
                            variant="glass"
                            size="sm"
                            disabled
                            className="flex-1 justify-center text-sm py-2 opacity-60"
                          >
                            Мест нет ({participantsCount} из {maxParticipants})
                          </LeafButton>
                        ) : (
                          <LeafButton
                            variant="primary"
                            size="sm"
                            onClick={() => navigate(`/multiplayer/room/${room.id}`)}
                            icon={<Play size={15} className="fill-current" />}
                            className="flex-1 justify-center text-sm py-2"
                          >
                            {isMyRoom ? 'Открыть лобби' : 'Войти'}
                          </LeafButton>
                        )}

                        {!isRoomFull && (
                          <BubbleElement
                            size="sm"
                            onClick={() => handlePlayWithSelf(room.id)}
                            icon={<UserPlus size={14} />}
                            title="Добавить себя вторым участником в это лобби"
                            className="shrink-0"
                          >
                            + Я (2-й)
                          </BubbleElement>
                        )}

                        {isMyRoom && (
                          <LeafButton
                            variant="glass"
                            size="sm"
                            onClick={(e) => handleLeaveRoomFromCard(room.id, e)}
                            icon={<LogOut size={14} className="text-rose-400" />}
                            className="shrink-0 text-rose-400 border-rose-500/35"
                            title="Выйти из игры (удалиться из списка участников)"
                          >
                            Выйти из игры
                          </LeafButton>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Creation Modal rendered via Portal to center on current viewport over all windows */}
      {isCreateModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-transparent backdrop-blur-2xl animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-3xl border border-primary/30 bg-transparent backdrop-blur-3xl shadow-2xl p-5 sm:p-7 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-primary/20">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-transparent border border-primary/35 flex items-center justify-center text-primary">
                  <Gamepad2 size={22} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-foreground">
                    Создать лобби
                  </h3>
                  <p className="text-sm text-foreground/70">
                    Выберите назначение: для игры или для беседы
                  </p>
                </div>
              </div>

              <BubbleElement
                size="sm"
                onClick={() => setIsCreateModalOpen(false)}
                icon={<X size={18} />}
                title="Закрыть"
              />
            </div>

            {/* Category Switcher: Для игры / Для чата */}
            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-transparent border border-primary/20 backdrop-blur-xl">
              <LeafButton
                type="button"
                variant={createCategory === 'game' ? 'primary' : 'glass'}
                size="sm"
                onClick={() => setCreateCategory('game')}
                icon={<Gamepad2 size={16} />}
                className="w-full justify-center"
              >
                Для игры
              </LeafButton>

              <LeafButton
                type="button"
                variant={createCategory === 'chat' ? 'primary' : 'glass'}
                size="sm"
                onClick={() => setCreateCategory('chat')}
                icon={<MessageSquare size={16} />}
                className="w-full justify-center"
              >
                Для чата
              </LeafButton>
            </div>

            {/* Content: Game list (Only multiplayer games: КвИИз, Сто Квадному, Своя Икра) */}
            {createCategory === 'game' && (
              <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                {/* Visibility & Player Limit settings */}
                <div className="p-3.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl space-y-3">
                  <div className="space-y-1.5">
                    <span className="text-sm font-bold text-foreground block">
                      Вид мультиплеерной игры
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <LeafButton
                        type="button"
                        variant={createVisibility === 'public' ? 'primary' : 'glass'}
                        size="sm"
                        onClick={() => setCreateVisibility('public')}
                        icon={<Globe size={15} />}
                        className="w-full justify-center text-sm"
                      >
                        Открытая (видна всем)
                      </LeafButton>
                      <LeafButton
                        type="button"
                        variant={createVisibility === 'private' ? 'primary' : 'glass'}
                        size="sm"
                        onClick={() => setCreateVisibility('private')}
                        icon={<Lock size={15} />}
                        className="w-full justify-center text-sm"
                      >
                        Закрытая (по приглашению)
                      </LeafButton>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-primary/15">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">
                        Лимит игроков в лобби
                      </span>
                      <span className="text-sm font-bold text-primary">
                        До {createMaxPlayers} игроков
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[2, 3, 4, 5, 6, 7, 8].map((num) => (
                        <BubbleElement
                          key={num}
                          size="sm"
                          active={createMaxPlayers === num}
                          onClick={() => setCreateMaxPlayers(num)}
                        >
                          {num} игр.
                        </BubbleElement>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-foreground/80">
                  Выберите мультиплеерную викторину (КвИИз, Сто Квадному, Своя Икра):
                </p>
                <div className="grid gap-2.5">
                  {gameOptions.map((g) => (
                    <div
                      key={g.id}
                      onClick={() => handleSelectGameForLobby(g.id)}
                      className="p-3.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl hover:border-primary/60 transition-all flex items-center justify-between text-left group cursor-pointer"
                    >
                      <div className="space-y-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                            {g.title}
                          </span>
                          <BubbleElement isBadge size="sm">
                            {g.tag}
                          </BubbleElement>
                        </div>
                        <p className="text-sm text-foreground/70">
                          {g.desc}
                        </p>
                      </div>
                      <BubbleElement
                        size="sm"
                        active
                        icon={<Play size={14} />}
                        className="shrink-0"
                      >
                        Выбрать
                      </BubbleElement>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Content: Chat list */}
            {createCategory === 'chat' && (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                <p className="text-sm text-foreground/80">
                  Выберите активный групповой чат (архивные чаты исключены). Будет создана видеокомната и сразу отправлено приглашение в беседу:
                </p>

                {loadingChats ? (
                  <div className="flex items-center justify-center py-8 text-foreground/70">
                    <RefreshCw className="animate-spin text-primary mr-2" size={18} />
                    <span className="text-sm">Загрузка групповых чатов...</span>
                  </div>
                ) : chatList.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl text-center space-y-2">
                    <MessageSquare size={28} className="mx-auto text-primary opacity-60" />
                    <p className="text-sm font-bold text-foreground">Активные групповые чаты не найдены</p>
                    <p className="text-sm text-foreground/60">
                      Создайте групповую беседу в разделе «Друзья», чтобы приглашать участников.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {chatList.map((chat, idx) => (
                      <div
                        key={`lobby-chat-${chat.type}-${chat.id}-${idx}`}
                        onClick={() => handleSelectChatForLobby(chat)}
                        className="p-3.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl hover:border-primary/60 transition-all flex items-center justify-between text-left group cursor-pointer gap-2"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-transparent border border-primary/35 flex items-center justify-center text-primary font-bold text-sm shrink-0 overflow-hidden">
                            {chat.avatar ? (
                              <img src={chat.avatar} alt={chat.title} className="w-full h-full object-cover" />
                            ) : (
                              (chat.title[0] || 'Ч')
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                              {chat.title}
                            </p>
                            <span className="text-sm text-foreground/60">
                              {chat.type === 'group' ? 'Групповая беседа' : 'Личный чат'}
                            </span>
                          </div>
                        </div>

                        <BubbleElement
                          size="sm"
                          active
                          icon={<Video size={14} />}
                          className="shrink-0"
                        >
                          Создать звонок
                        </BubbleElement>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Zoom Video Call Modal */}
      {profile && (
        <ZoomVideoModal
          isOpen={isZoomOpen}
          onClose={handleCloseZoom}
          currentUser={{
            uid: profile.uid,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url
          }}
          roomId={zoomRoomId}
          roomTitle={zoomRoomTitle}
          roomType={zoomRoomType}
        />
      )}
    </div>
  );
};
