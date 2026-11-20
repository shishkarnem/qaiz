import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  Trophy,
  Play,
  Send,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Sparkles,
  Loader2,
  Paperclip,
  FileText,
  X,
  Upload,
  Timer,
  RotateCcw,
  Lock,
  Download,
  ListOrdered,
  LogOut,
  MessageSquare,
  Video,
  Gamepad2,
  Shuffle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { VoiceInputBubble } from '../components/ui/VoiceInputBubble';
import { UserAvatar } from '../components/UserAvatar';
import { VideoInviteModal } from '../components/video/VideoInviteModal';
import { MultiplayerGameWebcamStrip } from '../components/video/MultiplayerGameWebcamStrip';
import { getUploadService } from '../services/FileUploadService';
import { audioSystem } from '../hooks/useSound';

const GAME_ROUTES: Record<string, string> = {
  blitz: '/game/blitz',
  '100to1': '/game/100to1',
  jeopardy: '/game/jeopardy'
};

export const MultiplayerRoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const urlQuestionParam = searchParams.get('question');
  const navigate = useNavigate();
  const { profile, effectiveUid: authEffectiveUid } = useAuth();
  const effectiveUid = String(profile?.uid || authEffectiveUid || '');
  const effectiveName = profile?.display_name || profile?.username || 'Игрок';

  const [room, setRoom] = useState<any>(null);
  const [roomQuestions, setRoomQuestions] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinBlockedReason, setJoinBlockedReason] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<number>(1);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [togglingReady, setTogglingReady] = useState(false);
  const [leavingGame, setLeavingGame] = useState(false);
  const [liveFinishSec, setLiveFinishSec] = useState<number | null>(null);
  const [liveHostTransferSec, setLiveHostTransferSec] = useState<number | null>(null);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const prevStatusRef = useRef<string | null>(null);
  const prevParticipantCountRef = useRef<number | null>(null);
  const prevAllReadyRef = useRef<boolean>(false);
  const preloadedGameIdRef = useRef<string | null>(null);
  const isNavigatingToGameRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastReadActionCountRef = useRef<number>(0);

  useEffect(() => {
    if (isMobileChatOpen) {
      lastReadActionCountRef.current = actions.length;
      setUnreadChatCount(0);
    } else {
      const diff = Math.max(0, actions.length - lastReadActionCountRef.current);
      setUnreadChatCount(diff);
    }
  }, [actions.length, isMobileChatOpen]);

  useEffect(() => {
    if (room?.game_id && preloadedGameIdRef.current !== room.game_id) {
      preloadedGameIdRef.current = room.game_id;
      audioSystem.preloadGameBatch(room.game_id, true);
    }
  }, [room?.game_id]);

  useEffect(() => {
    const serverSec = room?.finish_remaining_seconds;
    if (typeof serverSec === 'number' && serverSec > 0) {
      setLiveFinishSec(serverSec);
    } else if (room?.status === 'finished' || serverSec === null || serverSec === 0) {
      setLiveFinishSec(null);
    }
  }, [room?.finish_remaining_seconds, room?.status]);

  useEffect(() => {
    if (liveFinishSec === null || liveFinishSec <= 0) return;
    const t = setInterval(() => {
      setLiveFinishSec(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [liveFinishSec !== null && liveFinishSec > 0]);

  useEffect(() => {
    const serverHostSec = room?.host_transfer_remaining_seconds;
    if (room?.status === 'waiting' && typeof serverHostSec === 'number') {
      setLiveHostTransferSec(serverHostSec);
    } else {
      setLiveHostTransferSec(null);
    }
  }, [room?.host_transfer_remaining_seconds, room?.host_timer_paused, room?.status]);

  useEffect(() => {
    if (
      room?.status !== 'waiting' ||
      room?.host_timer_paused ||
      room?.is_host_in_lobby ||
      liveHostTransferSec === null ||
      liveHostTransferSec <= 0
    ) {
      return;
    }
    const t = setInterval(() => {
      setLiveHostTransferSec(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [room?.status, room?.host_timer_paused, room?.is_host_in_lobby, liveHostTransferSec !== null && liveHostTransferSec > 0]);

  const enterActiveGame = useCallback(async (
    roomData: any,
    customQuestionIdx?: number,
    justStartedFromLobby?: boolean,
    explicitQuestions?: any[],
    explicitParticipants?: any[]
  ) => {
    const gId = roomData?.game_id || 'blitz';
    const baseRoute = GAME_ROUTES[gId] || '/game/blitz';
    const resolvedRoomId = roomData?.id || roomId || '';
    let preloadedQuestions: any[] =
      Array.isArray(explicitQuestions) && explicitQuestions.length > 0
        ? explicitQuestions
        : Array.isArray(roomData?.questions) && roomData.questions.length > 0
        ? roomData.questions
        : roomQuestions;

    if (preloadedQuestions.length === 0 && roomData?.pack_id) {
      try {
        const packRes = await fetch(`/api/game-packs/${roomData.pack_id}?user_id=${encodeURIComponent(String(effectiveUid))}`);
        if (packRes.ok) {
          const packJson = await packRes.json();
          const packObj = packJson.data || packJson;
          if (Array.isArray(packObj?.questions) && packObj.questions.length > 0) {
            preloadedQuestions = packObj.questions;
          }
        }
      } catch (_) {}
    }

    const partsToSearch = Array.isArray(explicitParticipants) && explicitParticipants.length > 0
      ? explicitParticipants
      : participants;
    const mePart = partsToSearch.find(p => String(p.user_id) === String(effectiveUid));
    const savedRound1Based = Math.max(1, Number(mePart?.current_round) || 1);
    const urlQuestion1Based = urlQuestionParam ? Math.max(1, Number(urlQuestionParam) || 1) : null;
    const resolvedQuestionIdx = customQuestionIdx !== undefined
      ? Math.max(0, customQuestionIdx)
      : urlQuestion1Based !== null
      ? urlQuestion1Based - 1
      : Math.max(0, savedRound1Based - 1);

    const queryParams = new URLSearchParams();
    if (resolvedRoomId) {
      queryParams.set('room', resolvedRoomId);
      queryParams.set('mp_room', resolvedRoomId);
    }
    if (roomData?.pack_id) {
      queryParams.set('pack', roomData.pack_id);
      queryParams.set('pack_id', roomData.pack_id);
    }
    queryParams.set('mode', 'multi');

    navigate(`${baseRoute}?${queryParams.toString()}`, {
      state: {
        mode: 'lite',
        difficulty: roomData?.difficulty || 'people',
        topic: roomData?.topic || 'Общие знания',
        price: 0,
        playMode: 'multi',
        multiMode: 'online',
        mpRoomId: resolvedRoomId,
        roomId: resolvedRoomId,
        packId: roomData?.pack_id || undefined,
        questions: preloadedQuestions.length > 0 ? preloadedQuestions : undefined,
        preloadedQuestions: preloadedQuestions.length > 0 ? preloadedQuestions : undefined,
        currentIndex: resolvedQuestionIdx,
        savedRoundIndex: resolvedQuestionIdx,
        forcedQuestionIndex: customQuestionIdx !== undefined
          ? customQuestionIdx
          : urlQuestion1Based !== null
          ? urlQuestion1Based - 1
          : undefined,
        score: Number(mePart?.score) || 0,
        resume: !justStartedFromLobby,
        resumeMultiplayer: !justStartedFromLobby,
        justStartedFromLobby: Boolean(justStartedFromLobby),
        fromMultiplayerLobby: true,
        maxPlayers: Math.min(8, Math.max(2, Number(roomData?.max_players) || 8)),
        visibility: roomData?.visibility || 'public'
      }
    });
  }, [navigate, roomId, roomQuestions, participants, effectiveUid, urlQuestionParam]);

  const fetchRoomState = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await fetch(
        `/api/multiplayer/rooms/${roomId}?user_id=${encodeURIComponent(String(effectiveUid))}&in_lobby=1`
      );
      if (res.ok) {
        const data = await res.json();
        const prevStatus = prevStatusRef.current;
        const nextStatus = data.room?.status || null;
        prevStatusRef.current = nextStatus;

        const fetchedQuestions = Array.isArray(data.questions) && data.questions.length > 0
          ? data.questions
          : Array.isArray(data.room?.questions) && data.room.questions.length > 0
          ? data.room.questions
          : [];
        const fetchedParticipants = Array.isArray(data.participants) ? data.participants : [];

        if (prevParticipantCountRef.current !== null && nextStatus === 'waiting') {
          if (fetchedParticipants.length > prevParticipantCountRef.current) {
            audioSystem.playSlot('mp_player_join');
          } else if (fetchedParticipants.length < prevParticipantCountRef.current) {
            audioSystem.playSlot('mp_player_leave');
          }
        }
        prevParticipantCountRef.current = fetchedParticipants.length;

        const nonHost = fetchedParticipants.filter(
          (p: any) => String(p.user_id) !== String(data.room?.host_id) && !String(p.user_id).endsWith('_self2')
        );
        const nowAllReady = nonHost.length > 0 && nonHost.every((p: any) => Number(p.is_ready) === 1);
        if (nowAllReady && !prevAllReadyRef.current && nextStatus === 'waiting') {
          audioSystem.playSlot('mp_all_ready');
        }
        prevAllReadyRef.current = nowAllReady;

        if (prevStatus && prevStatus !== 'finished' && nextStatus === 'finished') {
          const sorted = fetchedParticipants.slice().sort((a: any, b: any) => (Number(b.score) || 0) - (Number(a.score) || 0));
          const topScore = Number(sorted[0]?.score) || 0;
          const secondScore = Number(sorted[1]?.score) || 0;
          const myPartObj = fetchedParticipants.find((p: any) => String(p.user_id) === String(effectiveUid));
          const myScoreVal = Number(myPartObj?.score) || 0;
          if (sorted.length > 1 && topScore === secondScore && myScoreVal === topScore) {
            audioSystem.playSlot('mp_match_draw');
          } else if (myScoreVal === topScore && topScore > 0) {
            audioSystem.playSlot('mp_match_victory');
          } else {
            audioSystem.playSlot('mp_match_defeat');
          }
        }

        setRoom(data.room);
        if (fetchedQuestions.length > 0) {
          setRoomQuestions(fetchedQuestions);
        }
        setParticipants(fetchedParticipants);
        setActions(data.actions || []);

        const amIParticipant = fetchedParticipants.some(
          (p: any) => String(p.user_id) === String(effectiveUid)
        );

        // If user clicked "Продолжить (вопрос X)" with ?question=X, enter the game immediately at that question
        if (urlQuestionParam && amIParticipant && !isNavigatingToGameRef.current && (nextStatus === 'active' || nextStatus === 'finished')) {
          isNavigatingToGameRef.current = true;
          const targetIdx = Math.max(0, (Number(urlQuestionParam) || 1) - 1);
          enterActiveGame(data.room, targetIdx, false, fetchedQuestions, fetchedParticipants);
          return;
        }

        // Auto-navigate into the game ONLY when the room transitions from 'waiting' to 'active' for existing participants
        if (prevStatus === 'waiting' && nextStatus === 'active' && amIParticipant && !isNavigatingToGameRef.current) {
          isNavigatingToGameRef.current = true;
          enterActiveGame(data.room, 0, true, fetchedQuestions, fetchedParticipants);
        }
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, [roomId, effectiveUid, enterActiveGame, urlQuestionParam]);

  const joinRoom = useCallback(async (teamNum: number) => {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/multiplayer/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: effectiveUid,
          display_name: effectiveName,
          avatar_url: profile?.avatar_url || null,
          team_number: teamNum
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (
          errData?.code === 'GAME_ALREADY_STARTED' ||
          errData?.code === 'ROOM_FULL' ||
          errData?.code === 'INSUFFICIENT_BALANCE'
        ) {
          setJoinBlockedReason(errData.error || 'Доступ в комнату ограничен');
        }
      } else {
        setJoinBlockedReason(null);
      }
      await fetchRoomState();
    } catch (_) {
      await fetchRoomState();
    }
  }, [roomId, effectiveUid, effectiveName, profile?.avatar_url, fetchRoomState]);

  useEffect(() => {
    joinRoom(1);
    const interval = setInterval(fetchRoomState, 2500);
    return () => {
      clearInterval(interval);
      if (roomId && effectiveUid && !isNavigatingToGameRef.current) {
        fetch(`/api/multiplayer/rooms/${roomId}/lobby-presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: effectiveUid, in_lobby: false })
        }).catch(() => {});
      }
    };
  }, [joinRoom, fetchRoomState, roomId, effectiveUid]);

  const handleToggleReady = async (targetUserId?: string, targetName?: string, nextReadyState?: number) => {
    if (!roomId || togglingReady) return;
    const uidToUpdate = targetUserId || effectiveUid;
    const currentPart = participants.find(p => String(p.user_id) === String(uidToUpdate));
    const desiredReady = nextReadyState !== undefined ? nextReadyState : (Number(currentPart?.is_ready) === 1 ? 0 : 1);
    if (desiredReady === 1) {
      audioSystem.playSlot('mp_player_ready');
    }

    setTogglingReady(true);
    try {
      await fetch(`/api/multiplayer/rooms/${roomId}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: uidToUpdate,
          display_name: targetName || currentPart?.display_name || effectiveName,
          is_ready: desiredReady
        })
      });
      await fetchRoomState();
    } catch (_) {
    } finally {
      setTogglingReady(false);
    }
  };

  const handleStartGame = async () => {
    if (!roomId || startingGame) return;
    const hostPresent = participants.some(p => String(p.user_id) === String(room?.host_id));
    const isCreator =
      String(room?.host_id) === String(effectiveUid) ||
      (!hostPresent && String(participants[0]?.user_id) === String(effectiveUid));
    if (!isCreator) return;

    audioSystem.playSlot('mp_match_start_go');
    setStartingGame(true);
    try {
      await fetch(`/api/multiplayer/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' })
      });
      await fetch(`/api/multiplayer/rooms/${roomId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: effectiveUid,
          action_type: 'start',
          payload: { text: `${effectiveName} запустил игру! Начинается обратный отсчёт...` }
        })
      });
      isNavigatingToGameRef.current = true;
      await enterActiveGame(room, 0, true);
    } catch (_) {
      setStartingGame(false);
    }
  };

  const handleLeaveGame = async () => {
    if (!roomId || leavingGame) return;
    audioSystem.playSlot('mp_player_leave');
    setLeavingGame(true);
    try {
      await fetch(`/api/multiplayer/rooms/${roomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: effectiveUid })
      });
    } catch (_) {
    } finally {
      setLeavingGame(false);
      navigate('/profile/multiplayer');
    }
  };

  const uploadSingleFile = async (file: File) => {
    setUploadingFile(true);
    try {
      const uploadService = getUploadService();
      const uploaded: any = await uploadService.uploadFromFile(file);
      const uploadedUrl = typeof uploaded === 'string' ? uploaded : uploaded?.url;
      if (uploadedUrl) {
        setAttachment({
          url: uploadedUrl,
          name: (typeof uploaded === 'object' && uploaded?.filename) || file.name,
          type: (typeof uploaded === 'object' && uploaded?.mimeType) || file.type || 'application/octet-stream'
        });
      }
    } catch (err) {
      console.error('Failed to upload file in room chat:', err);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadSingleFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) await uploadSingleFile(file);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await uploadSingleFile(file);
          break;
        }
      }
    }
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!chatInput.trim() && !attachment) || !roomId) return;
    const msg = chatInput.trim() || (attachment ? `Файл: ${attachment.name}` : '');
    const currentAttach = attachment;
    setChatInput('');
    setAttachment(null);
    try {
      await fetch(`/api/multiplayer/rooms/${roomId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: effectiveUid,
          action_type: 'chat',
          payload: {
            text: msg,
            sender_name: effectiveName,
            avatar_url: profile?.avatar_url || null,
            attachment_url: currentAttach?.url || null,
            attachment_name: currentAttach?.name || null,
            attachment_type: currentAttach?.type || null
          }
        })
      });
      fetchRoomState();
    } catch (_) {}
  };

  const formatDurationMs = (ms?: number | null) => {
    if (!ms || ms <= 0) return null;
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m}м ${s}с` : `${s}с`;
  };

  const formatCountdownSec = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const renderAttachment = (payload: any) => {
    const url = payload?.attachment_url || payload?.file_url;
    if (!url) return null;
    const type = String(payload?.attachment_type || payload?.file_type || '').toLowerCase();
    const name = payload?.attachment_name || payload?.file_name || 'Прикрепленный файл';

    if (type.startsWith('image/') || /^data:image\//i.test(url) || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download={name}
          className="block mt-2 rounded-2xl overflow-hidden border border-primary/30 max-w-[240px]"
        >
          <img src={url} alt={name} className="w-full max-h-44 object-cover" />
        </a>
      );
    }

    if (type.startsWith('video/') || /^data:video\//i.test(url) || /\.(mp4|webm|mov)$/i.test(url)) {
      return (
        <div className="mt-2 rounded-2xl overflow-hidden border border-primary/30 max-w-[260px]">
          <video src={url} controls className="w-full max-h-44 object-cover" />
        </div>
      );
    }

    if (type.startsWith('audio/') || /^data:audio\//i.test(url) || /\.(mp3|wav|ogg|m4a)$/i.test(url)) {
      return (
        <div className="mt-2">
          <audio src={url} controls className="max-w-[220px] h-9" />
        </div>
      );
    }

    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        download={name}
        className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-primary/30 text-sm font-semibold text-primary hover:border-primary/60 transition-all"
      >
        <FileText size={15} className="shrink-0" />
        <span className="truncate max-w-[180px]">{name}</span>
        <Download size={14} className="shrink-0" />
      </a>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-primary" size={36} />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl p-8 space-y-4">
          <p className="text-base font-bold text-foreground">Комната не найдена</p>
          <LeafButton variant="primary" size="md" onClick={() => navigate('/profile/multiplayer')}>
            Вернуться к списку комнат
          </LeafButton>
        </div>
      </div>
    );
  }

  const is100to1 = room.game_id === '100to1';
  const isBlitz = room.game_id === 'blitz';
  const totalQuestions = Number(room.question_count) || 10;
  const isCreator = String(room.host_id) === String(effectiveUid);
  const effectiveMaxPlayers = Math.min(8, Math.max(2, Number(room.max_players) || 8));

  // Requirement 4: Filter out duplicate _self2 if real other participants exist
  const realOtherParticipants = participants.filter(
    p => String(p.user_id) !== String(effectiveUid) && !String(p.user_id).endsWith('_self2')
  );
  const activeParticipants = participants
    .filter(p => !(realOtherParticipants.length > 0 && String(p.user_id).endsWith('_self2')))
    .slice(0, effectiveMaxPlayers);

  const myParticipant = activeParticipants.find(p => String(p.user_id) === String(effectiveUid));
  const myIsReady = isCreator ? true : Number(myParticipant?.is_ready) === 1;
  const myIsFinished = Number(myParticipant?.is_finished) === 1;

  // Requirement 1 & 9: Block non-participants from entering lobby once game has started or finished ("Не успел = не видишь")
  if ((room.status !== 'waiting' && !myParticipant) || joinBlockedReason) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 space-y-4 shadow-xl">
          <div className="w-14 h-14 mx-auto rounded-2xl border border-primary/40 flex items-center justify-center text-primary">
            <Lock size={28} />
          </div>
          <h2 className="text-xl font-black text-foreground">
            {joinBlockedReason || 'Игра уже началась без вас'}
          </h2>
          <p className="text-sm text-foreground/75 leading-relaxed">
            После запуска игры доступ к комнате и результатам открыт только для участников этого матча.
          </p>
          <div className="pt-2 flex justify-center">
            <LeafButton
              variant="primary"
              size="md"
              onClick={() => navigate('/profile/multiplayer')}
              icon={<ArrowLeft size={16} />}
            >
              Вернуться в мультиплеер
            </LeafButton>
          </div>
        </div>
      </div>
    );
  }

  const team1 = activeParticipants.filter(p => (p.team_number || 1) === 1);
  const team2 = activeParticipants.filter(p => p.team_number === 2);

  // Rank participants: for Blitz, primary = correct_count desc, secondary = finish_time_ms asc, tertiary = score desc
  const rankedParticipants = activeParticipants.slice().sort((a, b) => {
    if (isBlitz) {
      const aCorr = Number(a.correct_count) || 0;
      const bCorr = Number(b.correct_count) || 0;
      if (bCorr !== aCorr) return bCorr - aCorr;
      const aTime = a.finish_time_ms ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.finish_time_ms ?? Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
    }
    return (Number(b.score) || 0) - (Number(a.score) || 0);
  });

  const nonHostParticipants = activeParticipants.filter(
    p => String(p.user_id) !== String(room.host_id) && !String(p.user_id).endsWith('_self2')
  );
  const allInvitedReady = nonHostParticipants.every(p => Number(p.is_ready) === 1);
  const participantMultiplier = Math.max(1, activeParticipants.length);

  const myCurrentRound = Math.max(1, Math.min(totalQuestions, Number(myParticipant?.current_round) || 1));
  const targetResumeRound = urlQuestionParam
    ? Math.max(1, Math.min(totalQuestions, Number(urlQuestionParam) || myCurrentRound))
    : myCurrentRound;
  const finishTimerSec = liveFinishSec !== null ? liveFinishSec : room.finish_remaining_seconds;
  const anyOtherFinished = activeParticipants.some(p => Number(p.is_finished) === 1);
  const isNearFinish =
    room.status === 'active' &&
    ((typeof finishTimerSec === 'number' && finishTimerSec > 0) || anyOtherFinished || myIsFinished);

  const synchronizedStatusBadge =
    room.status === 'waiting'
      ? `Ожидает (${activeParticipants.length}/${effectiveMaxPlayers})`
      : room.status === 'finished'
      ? 'Завершена'
      : isNearFinish
      ? `На финише${typeof finishTimerSec === 'number' && finishTimerSec > 0 ? ` • ${formatCountdownSec(finishTimerSec)}` : ''}`
      : `Идет игра • Вопрос ${targetResumeRound}/${totalQuestions}`;

  const effectiveHostTimerSec =
    liveHostTransferSec !== null
      ? liveHostTransferSec
      : typeof room.host_transfer_remaining_seconds === 'number'
      ? room.host_transfer_remaining_seconds
      : 600;
  const isHostPresentInLobby = Boolean(room.is_host_in_lobby || room.host_timer_paused);
  const isHostFreeNow = Boolean(room.is_host_free || (!isHostPresentInLobby && effectiveHostTimerSec <= 0));

  return (
    <div className="max-w-6xl mx-auto px-2.5 sm:px-6 py-2.5 sm:py-6 pb-20 sm:pb-24 space-y-3 sm:space-y-6">
      {/* Unified Video Conference + Lobby Header: Row 1 on mobile = percentage-width icons; Row 2 on mobile = title & status badges */}
      <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-3 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xl">
        {/* Row 1 on Mobile (Right on Desktop): Percentage-width Action Icons */}
        <div className="flex items-center justify-between sm:justify-end gap-1 sm:gap-1.5 w-full sm:w-auto sm:order-2 shrink-0">
          {/* Mode Switcher on Mobile: Video vs Chat while staying in camera */}
          <BubbleElement
            size="sm"
            active={!isMobileChatOpen}
            onClick={() => setIsMobileChatOpen(false)}
            icon={<Video size={16} />}
            title="Видео-режим"
            className="lg:hidden flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-2"
          />
          <div className="relative flex-1 sm:flex-initial min-w-0 flex lg:hidden">
            <BubbleElement
              size="sm"
              active={isMobileChatOpen}
              onClick={() => setIsMobileChatOpen(prev => !prev)}
              icon={<MessageSquare size={16} />}
              title={isMobileChatOpen ? 'Закрыть чат' : 'Открыть чат комнаты'}
              className="w-full justify-center !px-0 sm:!px-2.5 !py-2"
            />
            {unreadChatCount > 0 && !isMobileChatOpen && (
              <span className="pointer-events-none absolute -top-1.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full border border-primary bg-primary text-background text-sm font-black flex items-center justify-center shadow-md">
                {unreadChatCount > 99 ? '99+' : unreadChatCount}
              </span>
            )}
          </div>

          {/* Game Invite Icon Button in Header (both Mobile and PC) */}
          <BubbleElement
            size="sm"
            active={isInviteModalOpen}
            onClick={() => setIsInviteModalOpen(true)}
            icon={<Gamepad2 size={16} />}
            title="Пригласить на игру"
            className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-2"
          />

          {/* Creator sees Start Game icon button in waiting mode; invited participants see Ready icon button */}
          {room.status === 'waiting' && isCreator && (
            <BubbleElement
              size="sm"
              active
              onClick={handleStartGame}
              disabled={startingGame}
              icon={startingGame ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              title={
                allInvitedReady || nonHostParticipants.length === 0
                  ? 'Начать игру'
                  : 'Начать игру (не все нажали Готово)'
              }
              className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-2"
            />
          )}

          {room.status === 'waiting' && !isCreator && (
            <BubbleElement
              size="sm"
              active={myIsReady}
              onClick={() => handleToggleReady()}
              disabled={togglingReady}
              icon={
                togglingReady ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} className={myIsReady ? 'text-primary' : ''} />
                )
              }
              title={myIsReady ? 'Вы готовы ✓ (нажмите, чтобы отменить)' : 'Готово'}
              className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-2"
            />
          )}

          {/* Synchronized Action Icon Button: Продолжить / Ждать / Результаты */}
          {room.status === 'active' && !myIsFinished && (
            <BubbleElement
              size="sm"
              active
              onClick={() => enterActiveGame(room, targetResumeRound - 1, false)}
              icon={<RotateCcw size={16} />}
              title={`Продолжить (вопрос ${targetResumeRound})`}
              className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-2"
            />
          )}

          {room.status === 'active' && myIsFinished && (
            <BubbleElement
              size="sm"
              disabled
              icon={<Timer size={16} className="text-primary animate-pulse" />}
              title="Ожидание остальных участников"
              className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-2"
            />
          )}

          {room.status === 'finished' && (
            <BubbleElement
              size="sm"
              onClick={() => {
                const el = document.getElementById('mp-results-banner');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              icon={<Trophy size={16} className="text-primary" />}
              title="Результаты"
              className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-2"
            />
          )}

          {/* Separate Leave Game (removes from participants) and Close (closes lobby view) icon buttons */}
          <BubbleElement
            size="sm"
            onClick={handleLeaveGame}
            disabled={leavingGame}
            icon={leavingGame ? <Loader2 size={16} className="animate-spin text-rose-400" /> : <LogOut size={16} className="text-rose-400" />}
            className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-2 border-rose-500/35 hover:border-rose-500/60 text-rose-400"
            title="Выйти из игры и удалиться из списка участников"
          />

          <BubbleElement
            size="sm"
            onClick={async () => {
              if (roomId && effectiveUid) {
                isNavigatingToGameRef.current = true;
                await fetch(`/api/multiplayer/rooms/${roomId}/lobby-presence`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: effectiveUid, in_lobby: false })
                }).catch(() => {});
              }
              navigate('/profile/multiplayer');
            }}
            icon={<X size={16} />}
            title="Закрыть лобби, оставаясь в списке участников"
            className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-2"
          />
        </div>

        {/* Row 2 on Mobile (Left on Desktop): Title & Status Badges */}
        <div className="space-y-1 min-w-0 w-full sm:w-auto sm:flex-1 sm:order-1 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-primary/15">
          <div className="flex flex-wrap items-center gap-1.5">
            <BubbleElement isBadge active size="sm">
              {room.game_title || room.game_id} • Видео-лобби
            </BubbleElement>
            <BubbleElement
              isBadge
              active={room.status === 'active' || room.status === 'waiting'}
              size="sm"
              icon={isNearFinish ? <Timer size={14} /> : undefined}
            >
              {synchronizedStatusBadge}
            </BubbleElement>
            {room.status === 'waiting' && (
              <BubbleElement
                isBadge
                active={!isHostPresentInLobby}
                size="sm"
                icon={<Timer size={14} className={!isHostPresentInLobby ? 'animate-pulse text-primary' : 'text-primary'} />}
                title={
                  isHostPresentInLobby
                    ? 'Создатель находится в лобби — 10-минутный таймер смены хоста поставлен на паузу'
                    : 'Если хост отсутствует 10 минут, права хоста переходят первому участнику в списке или первому вошедшему в пустое лобби'
                }
              >
                {isHostFreeNow
                  ? 'Игра свободна'
                  : isHostPresentInLobby
                  ? '10:00 пауза'
                  : formatCountdownSec(effectiveHostTimerSec)}
              </BubbleElement>
            )}
          </div>
          <h1 className="text-sm sm:text-xl font-black text-foreground break-words sm:truncate">
            Тема: <span className="text-primary">{room.topic || 'Общие знания'}</span>
          </h1>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Unified Mobile & Desktop Layout: on mobile, switching to Chat mode keeps the webcam strip mounted in compact mode at top so user stays in camera */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 items-start">
        <div className="lg:col-span-7 space-y-3 sm:space-y-5 min-w-0">
          {roomId && (
            <MultiplayerGameWebcamStrip
              roomId={roomId}
              gameId={room.game_id || 'blitz'}
              gameTitle={room.game_title || 'КвИИз'}
              currentUser={{
                uid: String(effectiveUid),
                display_name: effectiveName,
                avatar_url: profile?.avatar_url
              }}
              localRound={myCurrentRound}
              totalRounds={totalQuestions}
              localScore={Number(myParticipant?.score) || 0}
              localCorrectCount={Number(myParticipant?.correct_count) || 0}
              localIsFinished={myIsFinished}
              isLobby={room.status === 'waiting'}
              embeddedInRoomPage
              maxPlayers={effectiveMaxPlayers}
              hideProgressBlock={is100to1}
              compactMobileMode={isMobileChatOpen}
              isChatOpen={isMobileChatOpen}
              onToggleChat={() => setIsMobileChatOpen(prev => !prev)}
              unreadChatCount={unreadChatCount}
              onOpenInvite={() => setIsInviteModalOpen(true)}
            />
          )}

          {/* Interactive Questions Progress List inside Lobby when game is active */}
          {room.status === 'active' && roomQuestions.length > 0 && !myIsFinished && (
            <div className={`${isMobileChatOpen ? 'hidden lg:block' : ''} rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-4 sm:p-5 space-y-3.5 shadow-xl`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <ListOrdered size={18} className="text-primary" />
                  Вопросы мультиплеера (вопрос {targetResumeRound} из {roomQuestions.length})
                </h3>
                <BubbleElement
                  size="sm"
                  active
                  onClick={() => enterActiveGame(room, targetResumeRound - 1, false)}
                  icon={<Play size={15} />}
                  title={`Продолжить с вопроса ${targetResumeRound}`}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {roomQuestions.map((q: any, qIdx: number) => {
                  const qNum = qIdx + 1;
                  const isDone = qNum < myCurrentRound;
                  const isCurrent = qNum === targetResumeRound;
                  const qText = q.question || q.text || `Вопрос ${qNum}`;
                  return (
                    <div
                      key={`lobby-q-${qIdx}`}
                      onClick={() => enterActiveGame(room, qIdx, false)}
                      className={`cursor-pointer rounded-2xl border p-3 transition-all flex items-center justify-between gap-2 ${
                        isCurrent
                          ? 'border-primary bg-transparent shadow-[0_0_15px_rgba(153,208,55,0.2)]'
                          : isDone
                          ? 'border-primary/30 bg-transparent opacity-80 hover:opacity-100'
                          : 'border-primary/15 bg-transparent hover:border-primary/40'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-primary">#{qNum}</span>
                          <span className="text-sm font-semibold text-foreground truncate">{qText}</span>
                        </div>
                      </div>
                      <BubbleElement
                        isBadge
                        active={isCurrent || isDone}
                        size="sm"
                        className="shrink-0"
                        icon={isCurrent ? <Play size={14} /> : isDone ? <CheckCircle2 size={14} /> : <ArrowLeft size={14} className="rotate-180" />}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Team switcher ONLY for 100to1 */}
          {is100to1 && (
            <div className={`${isMobileChatOpen ? 'hidden lg:block' : ''} space-y-4`}>
              {room.status === 'waiting' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-4">
                  <div className="space-y-0.5">
                    <h3 className="text-base font-black text-foreground flex items-center gap-2">
                      <Users size={18} className="text-primary" />
                      Распределение участников на 2 команды
                    </h3>
                    <p className="text-sm text-foreground/70">
                      Выберите свою команду или распределите всех участников поровну перед запуском игры
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <BubbleElement
                      size="sm"
                      onClick={async () => {
                        await fetch(`/api/multiplayer/rooms/${roomId}/distribute-teams`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ mode: 'even' })
                        }).catch(() => {});
                        await fetchRoomState();
                      }}
                      icon={<Users size={15} />}
                      title="Распределить поровну"
                    />
                    <BubbleElement
                      size="sm"
                      onClick={async () => {
                        await fetch(`/api/multiplayer/rooms/${roomId}/distribute-teams`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ mode: 'random' })
                        }).catch(() => {});
                        await fetchRoomState();
                      }}
                      icon={<Shuffle size={15} />}
                      title="Случайно на 2 команды"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { num: 1, title: `Команда 1 (до ${Math.max(1, Math.ceil(effectiveMaxPlayers / 2))} чел.)`, list: team1 },
                  { num: 2, title: `Команда 2 (до ${Math.max(1, Math.ceil(effectiveMaxPlayers / 2))} чел.)`, list: team2 }
                ].map(team => (
                  <div
                    key={team.num}
                    className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Users size={16} className="text-primary" />
                        {team.title}
                      </h3>
                      {room.status === 'waiting' && (Number(myParticipant?.team_number) || 1) !== team.num && (
                        <BubbleElement
                          size="sm"
                          active
                          onClick={() => {
                            audioSystem.playSlot(team.num === 1 ? 'mp_team_join_1' : 'mp_team_join_2');
                            setSelectedTeam(team.num);
                            joinRoom(team.num);
                          }}
                          icon={<Users size={15} />}
                          title={`Вступить в Команду ${team.num}`}
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      {team.list.length === 0 ? (
                        <p className="text-sm text-foreground/50 py-2">Пока никого нет</p>
                      ) : (
                        team.list.map((p, idx) => {
                          const isHostUser = String(p.user_id) === String(room.host_id) || p.role === 'host';
                          const isReadyUser = isHostUser || Number(p.is_ready) === 1 || String(p.user_id).endsWith('_self2');
                          const otherTeamNum = team.num === 1 ? 2 : 1;
                          return (
                            <div
                              key={p.id || idx}
                              className="flex items-center justify-between gap-2 p-2.5 rounded-2xl border border-primary/15 bg-transparent backdrop-blur-md"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <UserAvatar
                                  avatarUrl={p.avatar_url || p.photo_url || p.telegram_photo}
                                  displayName={p.display_name || p.username}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-foreground truncate">
                                    {p.display_name || p.username || `Игрок ${idx + 1}`}
                                  </p>
                                  <p className="text-sm text-primary/80">
                                    {isHostUser && !String(p.user_id).endsWith('_self2')
                                      ? 'Создатель игры'
                                      : isReadyUser
                                      ? 'Готов к игре ✓'
                                      : 'Ожидание готовности...'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {room.status === 'waiting' && (isCreator || String(p.user_id) === String(effectiveUid) || String(p.user_id).endsWith('_self2')) && (
                                  <BubbleElement
                                    as="button"
                                    type="button"
                                    size="sm"
                                    onClick={async () => {
                                      await fetch(`/api/multiplayer/rooms/${roomId}/join`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          user_id: p.user_id,
                                          display_name: p.display_name,
                                          avatar_url: p.avatar_url || null,
                                          team_number: otherTeamNum
                                        })
                                      }).catch(() => {});
                                      await fetchRoomState();
                                    }}
                                    icon={<RotateCcw size={14} />}
                                    title={`Перевести в Команду ${otherTeamNum}`}
                                  />
                                )}
                                <BubbleElement isBadge active={isReadyUser} size="sm">
                                  {room.status === 'waiting'
                                    ? (isReadyUser ? '✓' : '…')
                                    : `${p.awarded_score ?? p.score ?? 0}`}
                                </BubbleElement>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right on Desktop / Below Compact Webcam Strip on Mobile when Chat Mode is active */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDraggingOver) setIsDraggingOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOver(false);
          }}
          onDrop={handleDrop}
          onPaste={handlePaste}
          className={`${
            isMobileChatOpen ? 'flex' : 'hidden lg:flex'
          } relative lg:col-span-5 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-3.5 sm:p-5 flex-col h-[50vh] lg:h-[600px] lg:sticky lg:top-4`}
        >
          {isDraggingOver && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-transparent backdrop-blur-2xl border-2 border-dashed border-primary rounded-3xl p-4 text-center pointer-events-none">
              <Upload size={32} className="text-primary animate-bounce mb-2" />
              <p className="text-sm font-bold text-primary">Отпустите файл для отправки в чат комнаты</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-primary/15">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              Чат и события комнаты
            </h3>
            <div className="flex items-center gap-1.5">
              <BubbleElement
                size="sm"
                onClick={() => setIsInviteModalOpen(true)}
                icon={<Gamepad2 size={15} />}
                title="Пригласить на игру"
              />
              <BubbleElement
                size="sm"
                onClick={() => setIsMobileChatOpen(false)}
                icon={<X size={15} />}
                className="lg:hidden"
                title="Закрыть чат и развернуть видео"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-2.5 pr-1">
            {actions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-sm text-foreground/50 text-center px-4 gap-3">
                <p>
                  Пригласите друзей в лобби, отправьте голосовое сообщение или прикрепите файл.
                </p>
                <BubbleElement
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  icon={<Upload size={15} />}
                  title="Загрузить файл в чат"
                />
              </div>
            ) : (
              actions.map((act, idx) => {
                let payload: any = {};
                try {
                  payload = typeof act.payload_json === 'string' ? JSON.parse(act.payload_json) : act.payload_json || {};
                } catch (_) {}

                const senderName = payload.sender_name || act.user_display_name || 'Участник';
                const isAnswer = act.action_type === 'answer';

                return (
                  <div
                    key={act.id || idx}
                    className="p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md text-sm flex items-start justify-between gap-2"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="font-bold text-primary mr-2">{senderName}:</span>
                      <span className="text-foreground/90 break-words">{payload.text || act.action_type}</span>
                      {renderAttachment(payload)}
                    </div>
                    {isAnswer && (
                      <span className="shrink-0">
                        {payload.is_correct ? (
                          <CheckCircle2 size={16} className="text-emerald-400" />
                        ) : (
                          <XCircle size={16} className="text-rose-400" />
                        )}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-2.5 border-t border-primary/15 space-y-2">
            {attachment && (
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-md">
                <div className="flex items-center gap-2 min-w-0">
                  {attachment.type.startsWith('image/') ? (
                    <img src={attachment.url} alt={attachment.name} className="w-8 h-8 rounded-lg object-cover border border-primary/30 shrink-0" />
                  ) : (
                    <FileText size={15} className="text-primary shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-foreground truncate">
                    {attachment.name}
                  </span>
                </div>
                <BubbleElement
                  size="sm"
                  onClick={() => setAttachment(null)}
                  icon={<X size={14} />}
                  title="Удалить файл"
                />
              </div>
            )}

            <form onSubmit={handleSendChat} className="flex items-center gap-1.5">
              <BubbleElement
                size="sm"
                active={Boolean(attachment)}
                disabled={uploadingFile}
                onClick={() => fileInputRef.current?.click()}
                icon={
                  uploadingFile ? (
                    <Loader2 size={16} className="animate-spin text-primary" />
                  ) : (
                    <Paperclip size={16} className="text-primary" />
                  )
                }
                title="Прикрепить файл или изображение"
                className="shrink-0"
              />

              <VoiceInputBubble
                onTranscript={(text) => setChatInput(text)}
                currentValue={chatInput}
                mode="append"
                size="sm"
                tooltip="Голосовой ввод"
              />

              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Сообщение..."
                className="flex-1 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary min-w-0"
              />

              <LeafButton
                type="submit"
                variant="primary"
                size="sm"
                disabled={!chatInput.trim() && !attachment}
                icon={<Send size={15} />}
                title="Отправить"
                className="shrink-0 !px-3"
              />
            </form>
          </div>
        </div>
      </div>

      {/* Invite Friends Modal */}
      {roomId && (
        <VideoInviteModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          currentUser={{
            uid: String(effectiveUid),
            display_name: effectiveName,
            avatar_url: profile?.avatar_url
          }}
          roomId={roomId}
          roomTitle={`${room.game_title || 'Игра'}: ${room.topic || 'Общие знания'}`}
          roomType={room.game_id || 'blitz'}
          gameId={room.game_id || 'blitz'}
          invitePath={`/multiplayer/room/${roomId}`}
        />
      )}
    </div>
  );
};
