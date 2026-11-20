import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  CircleDot,
  Square,
  Pause,
  Play,
  UserPlus,
  UserCheck,
  Trophy,
  Zap,
  Users,
  Timer,
  Settings,
  Share2,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Gamepad2,
  MessageSquare
} from 'lucide-react';
import { BubbleElement } from '../ui/BubbleElement';
import { LeafButton } from '../ui/LeafButton';
import { UserAvatar } from '../UserAvatar';
import { ChatMessage } from '../GameChat';
import { DeviceSettingsModal, UserMediaDeviceSettings } from './DeviceSettingsModal';
import {
  MicEqualizerBubbleOverlay,
  LiveCameraVideo,
  useMicAudioAnalyzer
} from './MicEqualizerBubbleOverlay';
import { useScreenRecording } from '../../context/ScreenRecordingContext';
import { audioSystem } from '../../hooks/useSound';

export interface MultiplayerParticipantInfo {
  id: string;
  user_id: string;
  display_name?: string;
  username?: string;
  avatar_url?: string | null;
  photo_url?: string | null;
  telegram_photo?: string | null;
  role?: string;
  team_number?: number;
  score?: number;
  awarded_score?: number | null;
  correct_count?: number;
  wrong_count?: number;
  current_round?: number;
  is_finished?: number;
  is_ready?: number;
  finish_time_ms?: number | null;
  is_camera_on?: number;
  is_mic_on?: number;
  is_screen_sharing?: number;
}

interface MultiplayerGameWebcamStripProps {
  roomId: string;
  gameId: string;
  gameTitle: string;
  currentUser: {
    uid: string;
    display_name: string;
    avatar_url?: string | null;
  };
  localRound: number;
  totalRounds?: number;
  localScore: number;
  localCorrectCount?: number;
  localIsFinished?: boolean;
  isLobby?: boolean;
  embeddedInRoomPage?: boolean;
  choosingUserId?: string | null;
  answeringUserId?: string | null;
  controlsPortalId?: string;
  hideProgressBlock?: boolean;
  maxPlayers?: number;
  teamSplitLayout?: boolean;
  team1Score?: number;
  team2Score?: number;
  activeTeamNumber?: 1 | 2;
  activeTeamTurn?: 1 | 2;
  team1Label?: string;
  team2Label?: string;
  centerColumnContent?: React.ReactNode;
  centerContent?: React.ReactNode;
  bottomChatContent?: React.ReactNode;
  chatWidget?: React.ReactNode;
  onOpenInvite?: () => void;
  onOpenZoomModal?: () => void;
  compactMobileMode?: boolean;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
  unreadChatCount?: number;
  onRoomStateSync?: (data: {
    room: any;
    participants: any[];
    actions: any[];
    chatMessages: ChatMessage[];
  }) => void;
}

const MAX_ROOM_PARTICIPANTS = 8;

export const MultiplayerGameWebcamStrip: React.FC<MultiplayerGameWebcamStripProps> = ({
  roomId,
  gameId,
  gameTitle,
  currentUser,
  localRound,
  totalRounds = 10,
  localScore,
  localCorrectCount = 0,
  localIsFinished = false,
  isLobby = false,
  embeddedInRoomPage = false,
  choosingUserId = null,
  answeringUserId = null,
  controlsPortalId,
  hideProgressBlock = false,
  maxPlayers,
  teamSplitLayout = false,
  team1Score = 0,
  team2Score = 0,
  activeTeamNumber = 1,
  activeTeamTurn,
  team1Label,
  team2Label,
  centerColumnContent,
  centerContent,
  bottomChatContent,
  chatWidget,
  onOpenInvite,
  compactMobileMode = false,
  isChatOpen = false,
  onToggleChat,
  unreadChatCount = 0,
  onRoomStateSync
}) => {
  const effectiveActiveTeam = activeTeamTurn ?? activeTeamNumber ?? 1;
  const effectiveCenterContent = centerContent ?? centerColumnContent;
  const effectiveBottomChat = chatWidget ?? bottomChatContent;
  const effectiveTeam1Label = team1Label || 'Команда 1';
  const effectiveTeam2Label = team2Label || 'Команда 2';
  const [participants, setParticipants] = useState<any[]>([]);
  const [roomData, setRoomData] = useState<any>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const {
    isRecording,
    isPaused: isRecordingPaused,
    recordingSeconds,
    startRecording: startGlobalRecording,
    togglePauseRecording: toggleGlobalPauseRecording,
    stopRecording: stopGlobalRecording
  } = useScreenRecording();
  const [initialSynced, setInitialSynced] = useState(false);
  const [addingSelfSecond, setAddingSelfSecond] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [deviceSettings, setDeviceSettings] = useState<UserMediaDeviceSettings>({
    audioInputId: 'default',
    videoInputId: 'default',
    audioOutputId: 'default',
    mirrorVideo: true,
    noiseSuppression: true,
    echoCancellation: true
  });

  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const onRoomStateSyncRef = useRef(onRoomStateSync);
  onRoomStateSyncRef.current = onRoomStateSync;

  const zoomRoomId = roomId.startsWith('room_') ? roomId : `room_${roomId}`;

  // Real-time microphone audio analyzer for bubble equalizer around square webcam/avatar
  const micAudio = useMicAudioAnalyzer(isMicOn, localStream);

  // Sync local progress to backend ONLY after initial room state has been loaded (skip for Jeopardy which uses server-authoritative /jeopardy-sync)
  useEffect(() => {
    if (!roomId || !currentUser?.uid || !initialSynced || isLobby || gameId === 'jeopardy') return;
    fetch(`/api/multiplayer/rooms/${roomId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.uid,
        current_round: localRound,
        score: localScore,
        correct_count: localCorrectCount,
        is_finished: localIsFinished ? 1 : 0
      })
    }).catch(() => {});
  }, [roomId, currentUser?.uid, localRound, localScore, localCorrectCount, localIsFinished, initialSynced, isLobby, gameId]);

  const fetchRoomState = useCallback(async () => {
    if (!roomId) return;
    try {
      const lobbyFlag = isLobby ? '1' : '0';
      const res = await fetch(
        `/api/multiplayer/rooms/${roomId}?user_id=${encodeURIComponent(String(currentUser?.uid || ''))}&in_lobby=${lobbyFlag}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.room) setRoomData(data.room);
      if (Array.isArray(data.participants)) {
        setParticipants(data.participants);
      }
      setInitialSynced(true);
      if (onRoomStateSyncRef.current) {
        const rawActions = Array.isArray(data.actions) ? data.actions : [];
        const chatMessages: ChatMessage[] = rawActions
          .filter((a: any) => a.action_type === 'chat')
          .map((a: any, idx: number) => {
            let p: any = {};
            try {
              p = typeof a.payload_json === 'string' ? JSON.parse(a.payload_json) : a.payload_json || {};
            } catch (_) {}
            return {
              id: a.id || `mp-chat-${idx}`,
              senderId: String(a.user_id || ''),
              senderName: p.sender_name || a.user_display_name || 'Игрок',
              text: p.text || '',
              isBot: false,
              avatar: p.avatar_url || a.user_avatar_url || undefined,
              timestamp: a.created_at ? new Date(a.created_at).getTime() : Date.now(),
              attachment_url: p.attachment_url || p.file_url || null,
              attachment_name: p.attachment_name || p.file_name || null,
              attachment_type: p.attachment_type || p.file_type || null
            };
          });
        onRoomStateSyncRef.current({
          room: data.room,
          participants: data.participants || [],
          actions: rawActions,
          chatMessages
        });
      }
    } catch (_) {}
  }, [roomId, currentUser?.uid, isLobby]);

  // Poll multiplayer room state (faster in Jeopardy real-time multiplayer)
  useEffect(() => {
    fetchRoomState();
    const pollMs = gameId === 'jeopardy' ? 900 : 2000;
    const interval = setInterval(fetchRoomState, pollMs);
    return () => {
      clearInterval(interval);
      if (isLobby && roomId && currentUser?.uid) {
        fetch(`/api/multiplayer/rooms/${roomId}/lobby-presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.uid, in_lobby: false })
        }).catch(() => {});
      }
    };
  }, [fetchRoomState, gameId, isLobby, roomId, currentUser?.uid]);

  // Start local camera & mic stream
  const startLocalMedia = useCallback(async (customSettings?: UserMediaDeviceSettings) => {
    const activeSettings = customSettings || deviceSettings;
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (!isCamOn && !isMicOn) {
        localStreamRef.current = null;
        setLocalStream(null);
        return;
      }
      const videoConstraints: any = isCamOn
        ? {
            width: { ideal: 480 },
            height: { ideal: 480 },
            ...(activeSettings.videoInputId && activeSettings.videoInputId !== 'default'
              ? { deviceId: { exact: activeSettings.videoInputId } }
              : {})
          }
        : false;
      const audioConstraints: any = isMicOn
        ? {
            noiseSuppression: activeSettings.noiseSuppression,
            echoCancellation: activeSettings.echoCancellation,
            ...(activeSettings.audioInputId && activeSettings.audioInputId !== 'default'
              ? { deviceId: { exact: activeSettings.audioInputId } }
              : {})
          }
        : false;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
    } catch (_) {
      // Fallback: try video only or audio only if combined request failed
      try {
        if (isCamOn) {
          const vStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          localStreamRef.current = vStream;
          setLocalStream(vStream);
          return;
        }
      } catch (_) {}
      setIsCamOn(false);
    }
  }, [isCamOn, isMicOn, deviceSettings]);

  useEffect(() => {
    startLocalMedia();
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (screenStreamRef.current && screenVideoRef.current && isScreenSharing) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
    }
  }, [isScreenSharing]);

  const syncZoomStatus = async (cam: boolean, mic: boolean, screen: boolean) => {
    const isKnownParticipant =
      !roomData ||
      roomData.status === 'waiting' ||
      String(roomData.host_id) === String(currentUser.uid) ||
      participants.some((p) => String(p.user_id) === String(currentUser.uid));
    if (!isKnownParticipant) return;
    try {
      await fetch(`/api/zoom/rooms/${zoomRoomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.uid,
          display_name: currentUser.display_name,
          avatar_url: currentUser.avatar_url,
          is_camera_on: cam,
          is_mic_on: mic,
          is_screen_sharing: screen,
          game_type: gameId,
          title: gameTitle
        })
      });
    } catch (_) {}
  };

  const toggleMic = async () => {
    const next = !isMicOn;
    setIsMicOn(next);
    audioSystem.playSlot('mp_video_mic_toggle');
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = next;
      });
    }
    await syncZoomStatus(isCamOn, next, isScreenSharing);
  };

  const toggleCam = async () => {
    const next = !isCamOn;
    setIsCamOn(next);
    audioSystem.playSlot('mp_video_cam_toggle');
    if (next) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 480 }, height: { ideal: 480 } },
          audio: isMicOn
        });
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
        }
        localStreamRef.current = s;
        setLocalStream(s);
      } catch (_) {
        setIsCamOn(false);
        return;
      }
    } else if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.enabled = false;
        t.stop();
      });
      setLocalStream(null);
    }
    await syncZoomStatus(next, isMicOn, isScreenSharing);
  };

  const toggleScreenShare = async () => {
    audioSystem.playSlot('mp_video_screenshare');
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
      setIsScreenSharing(false);
      await syncZoomStatus(isCamOn, isMicOn, false);
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: true
      });
      screenStreamRef.current = displayStream;
      setIsScreenSharing(true);
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = displayStream;
      }
      displayStream.getVideoTracks()[0].onended = () => {
        screenStreamRef.current = null;
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
        setIsScreenSharing(false);
        syncZoomStatus(isCamOn, isMicOn, false);
      };
      await syncZoomStatus(isCamOn, isMicOn, true);
    } catch (_) {}
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopGlobalRecording();
      return;
    }
    await startGlobalRecording({
      existingScreenStream: screenStreamRef.current,
      micStream: localStreamRef.current,
      isMicOn,
      roomTitle: gameTitle || roomData?.topic || roomId
    });
  };

  const formatDurationMs = (ms?: number | null) => {
    if (!ms || ms <= 0) return null;
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m}м ${s}с` : `${s}с`;
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const effectiveMaxPlayers = Math.min(
    MAX_ROOM_PARTICIPANTS,
    Math.max(
      2,
      Number(
        maxPlayers ||
          roomData?.max_players ||
          roomData?.jeopardy_state?.maxPlayers
      ) || MAX_ROOM_PARTICIPANTS
    )
  );

  // Requirement 4: If any real other participant joined, remove duplicate _self2
  const rawParticipants = participants.length > 0
    ? participants
    : [
        {
          id: 'local_host',
          user_id: currentUser.uid,
          display_name: currentUser.display_name,
          avatar_url: currentUser.avatar_url,
          team_number: 1,
          current_round: localRound,
          score: localScore,
          correct_count: localCorrectCount,
          is_finished: localIsFinished ? 1 : 0,
          is_ready: 1,
          is_camera_on: isCamOn ? 1 : 0,
          is_mic_on: isMicOn ? 1 : 0
        }
      ];

  const realOtherParticipants = rawParticipants.filter(
    (p) => String(p.user_id) !== String(currentUser.uid) && !String(p.user_id).endsWith('_self2')
  );

  const displayParticipants = rawParticipants
    .filter((p) => {
      if (realOtherParticipants.length > 0 && String(p.user_id).endsWith('_self2')) {
        return false;
      }
      return true;
    })
    .slice(0, effectiveMaxPlayers);

  const isSelfSecondJoined =
    realOtherParticipants.length === 0 &&
    displayParticipants.some((p) => String(p.user_id) === `${currentUser.uid}_self2` || String(p.user_id).endsWith('_self2'));

  const handleToggleSelfSecond = async () => {
    if (!roomId || !currentUser.uid) return;
    setAddingSelfSecond(true);
    try {
      const self2Id = `${currentUser.uid}_self2`;
      if (isSelfSecondJoined) {
        await fetch(`/api/multiplayer/rooms/${roomId}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: self2Id })
        });
        await fetch(`/api/zoom/rooms/${zoomRoomId}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: self2Id })
        }).catch(() => {});
      } else {
        await fetch(`/api/multiplayer/rooms/${roomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: self2Id,
            display_name: `${currentUser.display_name || 'Вы'} (2-й участник)`,
            avatar_url: currentUser.avatar_url || null,
            team_number: 2
          })
        });
        await fetch(`/api/multiplayer/rooms/${roomId}/ready`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: self2Id,
            is_ready: 1,
            display_name: `${currentUser.display_name || 'Вы'} (2-й участник)`
          })
        }).catch(() => {});
        await fetch(`/api/zoom/rooms/${zoomRoomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: self2Id,
            display_name: `${currentUser.display_name || 'Вы'} (2-й участник)`,
            avatar_url: currentUser.avatar_url || null,
            is_camera_on: 1,
            is_mic_on: 1
          })
        }).catch(() => {});
      }
      await fetchRoomState();
    } catch (_) {
    } finally {
      setAddingSelfSecond(false);
    }
  };

  const handleCopyInviteLink = () => {
    const url = `${window.location.origin}/multiplayer/room/${roomId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const [liveFinishSec, setLiveFinishSec] = useState<number | null>(null);
  const [liveHostTransferSec, setLiveHostTransferSec] = useState<number | null>(null);

  useEffect(() => {
    const serverSec = roomData?.finish_remaining_seconds;
    if (typeof serverSec === 'number' && serverSec > 0) {
      setLiveFinishSec(serverSec);
    } else if (roomData?.status === 'finished' || serverSec === null || serverSec === 0) {
      setLiveFinishSec(null);
    }
  }, [roomData?.finish_remaining_seconds, roomData?.status]);

  useEffect(() => {
    if (liveFinishSec === null || liveFinishSec <= 0) return;
    const t = setInterval(() => {
      setLiveFinishSec(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [liveFinishSec !== null && liveFinishSec > 0]);

  useEffect(() => {
    const serverHostSec = roomData?.host_transfer_remaining_seconds;
    if ((isLobby || roomData?.status === 'waiting') && typeof serverHostSec === 'number') {
      setLiveHostTransferSec(serverHostSec);
    } else {
      setLiveHostTransferSec(null);
    }
  }, [roomData?.host_transfer_remaining_seconds, roomData?.host_timer_paused, roomData?.status, isLobby]);

  useEffect(() => {
    if (
      !(isLobby || roomData?.status === 'waiting') ||
      roomData?.host_timer_paused ||
      roomData?.is_host_in_lobby ||
      liveHostTransferSec === null ||
      liveHostTransferSec <= 0
    ) {
      return;
    }
    const t = setInterval(() => {
      setLiveHostTransferSec(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [isLobby, roomData?.status, roomData?.host_timer_paused, roomData?.is_host_in_lobby, liveHostTransferSec !== null && liveHostTransferSec > 0]);

  const finishRemainingSec = liveFinishSec;
  const isWaitingLobby = isLobby || roomData?.status === 'waiting';
  const anyParticipantFinished = displayParticipants.some(
    p => (String(p.user_id) === String(currentUser.uid) && localIsFinished) || Number(p.is_finished) === 1
  );

  // Synchronized status badge label (Запуск / Идет игра / На финише / Завершена)
  const roomStatusLabel =
    roomData?.status === 'finished'
      ? 'Завершена'
      : isWaitingLobby
      ? 'Запуск'
      : (typeof finishRemainingSec === 'number' && finishRemainingSec > 0) || anyParticipantFinished
      ? `На финише${typeof finishRemainingSec === 'number' && finishRemainingSec > 0 ? ` • ${formatTime(finishRemainingSec)}` : ''}`
      : 'Идет игра';

  const isJeopardyGame = gameId === 'jeopardy' || roomData?.game_id === 'jeopardy';
  const jState = roomData?.jeopardy_state || null;
  const effectiveChoosingUid =
    choosingUserId ||
    (jState?.phase === 'final_elimination'
      ? jState?.eliminatingUserId || jState?.choosingUserId
      : jState?.phase === 'auction' || jState?.phase === 'special_auction'
      ? jState?.auctionState?.currentBidderId || jState?.choosingUserId
      : jState?.choosingUserId) ||
    roomData?.host_id ||
    null;
  const effectiveAnsweringUid =
    !isJeopardyGame || jState?.phase === 'question_answer'
      ? answeringUserId || jState?.answeringUserId || null
      : null;

  // Sort webcam tiles so the active player (answering or choosing) is ALWAYS first in the 4-in-a-row strip
  const orderedWebcamParticipants = useMemo(() => {
    const list = [...displayParticipants];
    if (isWaitingLobby) return list;
    return list.sort((a, b) => {
      const aAns = effectiveAnsweringUid && String(a.user_id) === String(effectiveAnsweringUid) ? 1 : 0;
      const bAns = effectiveAnsweringUid && String(b.user_id) === String(effectiveAnsweringUid) ? 1 : 0;
      if (aAns !== bAns) return bAns - aAns;
      const aCh = effectiveChoosingUid && String(a.user_id) === String(effectiveChoosingUid) ? 1 : 0;
      const bCh = effectiveChoosingUid && String(b.user_id) === String(effectiveChoosingUid) ? 1 : 0;
      if (aCh !== bCh) return bCh - aCh;
      return 0;
    });
  }, [displayParticipants, isWaitingLobby, effectiveAnsweringUid, effectiveChoosingUid]);

  // Ranked participants for compact progress under webcam block
  const rankedParticipants = displayParticipants.slice().sort((a, b) => {
    if (isJeopardyGame) {
      const aScore = Number(a.score) || 0;
      const bScore = Number(b.score) || 0;
      if (bScore !== aScore) return bScore - aScore;
      const aCorr = Number(a.correct_count) || 0;
      const bCorr = Number(b.correct_count) || 0;
      return bCorr - aCorr;
    }
    const aCorr = String(a.user_id) === String(currentUser.uid) ? Math.max(localCorrectCount, Number(a.correct_count) || 0) : Number(a.correct_count) || 0;
    const bCorr = String(b.user_id) === String(currentUser.uid) ? Math.max(localCorrectCount, Number(b.correct_count) || 0) : Number(b.correct_count) || 0;
    if (bCorr !== aCorr) return bCorr - aCorr;
    const aTime = a.finish_time_ms ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.finish_time_ms ?? Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    const aScore = String(a.user_id) === String(currentUser.uid) ? Math.max(localScore, Number(a.score) || 0) : Number(a.score) || 0;
    const bScore = String(b.user_id) === String(currentUser.uid) ? Math.max(localScore, Number(b.score) || 0) : Number(b.score) || 0;
    return bScore - aScore;
  });

  const portalTarget =
    typeof document !== 'undefined' && controlsPortalId
      ? document.getElementById(controlsPortalId)
      : null;

  const headerControlsBlock = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-primary/20 pb-2.5">
      {/* Row 1 on Mobile (Right on Desktop): Media & Room Control Icons with percentage width */}
      <div className="flex items-center justify-between sm:justify-end gap-1 sm:gap-1.5 w-full sm:w-auto sm:order-2">
        <BubbleElement
          size="sm"
          active={isMicOn}
          onClick={toggleMic}
          icon={isMicOn ? <Mic size={15} /> : <MicOff size={15} className="text-rose-400" />}
          title={isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
          className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5"
        />

        <BubbleElement
          size="sm"
          active={isCamOn}
          onClick={toggleCam}
          icon={isCamOn ? <Video size={15} /> : <VideoOff size={15} className="text-rose-400" />}
          title={isCamOn ? 'Выключить камеру' : 'Включить камеру'}
          className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5"
        />

        <BubbleElement
          size="sm"
          active={isScreenSharing}
          onClick={toggleScreenShare}
          icon={isScreenSharing ? <MonitorOff size={15} /> : <Monitor size={15} />}
          title="Демонстрация экрана"
          className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5"
        />

        {onToggleChat && (
          <div className="relative flex-1 sm:flex-initial min-w-0 flex lg:hidden">
            <BubbleElement
              size="sm"
              active={isChatOpen}
              onClick={onToggleChat}
              icon={<MessageSquare size={15} />}
              title={isChatOpen ? 'Переключить в видео-режим' : 'Открыть чат'}
              className="w-full justify-center !px-0 sm:!px-2.5 !py-1.5"
            />
            {unreadChatCount > 0 && !isChatOpen && (
              <span className="pointer-events-none absolute -top-1.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full border border-primary bg-primary text-background text-sm font-black flex items-center justify-center shadow-md">
                {unreadChatCount > 99 ? '99+' : unreadChatCount}
              </span>
            )}
          </div>
        )}

        {onOpenInvite && (
          <BubbleElement
            size="sm"
            onClick={onOpenInvite}
            icon={<Gamepad2 size={15} />}
            title="Пригласить на игру"
            className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5"
          />
        )}

        {isRecording && (
          <BubbleElement
            size="sm"
            active={isRecordingPaused}
            onClick={toggleGlobalPauseRecording}
            icon={isRecordingPaused ? <Play size={14} className="text-primary" /> : <Pause size={14} className="text-amber-300" />}
            title={isRecordingPaused ? 'Продолжить запись' : 'Пауза записи'}
            className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5"
          />
        )}

        <BubbleElement
          size="sm"
          active={isRecording}
          onClick={toggleRecording}
          icon={
            isRecording ? (
              <Square size={13} className="text-rose-400" />
            ) : (
              <CircleDot size={15} />
            )
          }
          title={isRecording ? `Остановить запись (${formatTime(recordingSeconds)})` : 'Запись экрана и звука'}
          className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5"
        />

        <BubbleElement
          size="sm"
          onClick={() => setIsSettingsOpen(true)}
          icon={<Settings size={15} />}
          title="Настройки камеры, микрофона и звука"
          className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5"
        />
      </div>

      {/* Row 2 on Mobile (Left on Desktop): Video Room Count & Status Badges */}
      {!(isJeopardyGame && !isWaitingLobby) ? (
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:order-1">
          <BubbleElement isBadge active size="sm" icon={<Users size={14} />}>
            Видеозал ({displayParticipants.length}/{effectiveMaxPlayers})
          </BubbleElement>
          {!embeddedInRoomPage && (
            <BubbleElement
              isBadge
              active={roomStatusLabel.startsWith('На финише') || roomStatusLabel === 'Идет игра'}
              size="sm"
              icon={roomStatusLabel.startsWith('На финише') ? <Timer size={14} /> : <Zap size={14} />}
            >
              {roomStatusLabel}
            </BubbleElement>
          )}
          {!embeddedInRoomPage && isWaitingLobby && roomData && (
            <BubbleElement
              isBadge
              active={!roomData.is_host_in_lobby && !roomData.host_timer_paused}
              size="sm"
              icon={<Timer size={14} className={!roomData.is_host_in_lobby && !roomData.host_timer_paused ? 'animate-pulse text-primary' : 'text-primary'} />}
              title={
                roomData.is_host_in_lobby || roomData.host_timer_paused
                  ? 'Создатель находится в лобби — 10-минутный таймер смены хоста поставлен на паузу'
                  : 'Если хост отсутствует 10 минут, права хоста переходят первому в списке или первому вошедшему в пустое лобби'
              }
            >
              {roomData.is_host_free || (!roomData.is_host_in_lobby && !roomData.host_timer_paused && (liveHostTransferSec ?? 600) <= 0)
                ? 'Игра свободна • 1-й вошедший станет хостом'
                : roomData.is_host_in_lobby || roomData.host_timer_paused
                ? 'Хост в лобби • 10:00 на паузе'
                : `Смена хоста через ${formatTime(liveHostTransferSec ?? roomData.host_transfer_remaining_seconds ?? 600)}`}
            </BubbleElement>
          )}
        </div>
      ) : (
        <div className="hidden sm:block sm:order-1" />
      )}
    </div>
  );

  const renderSquareWebcamCard = (p: any, idx: number, customScoreOverride?: number, isTeamActiveTurn?: boolean) => {
    const isMe = String(p.user_id) === String(currentUser.uid);
    const isSelf2 = String(p.user_id) === `${currentUser.uid}_self2` || String(p.user_id).endsWith('_self2');
    const activeMediaStream = localStream || localStreamRef.current;
    const showLiveVideo = Boolean((isMe || isSelf2) && isCamOn && activeMediaStream);
    const isSpeakingTile = Boolean((isMe || isSelf2) && isMicOn && micAudio.isSpeaking);
    const pName = p.display_name || p.username || `Игрок ${idx + 1}`;
    const pAvatar = p.avatar_url || p.photo_url || p.telegram_photo || (isMe || isSelf2 ? currentUser.avatar_url : null);
    const isHostUser = String(p.user_id) === String(roomData?.host_id) || p.role === 'host';
    const isReadyUser = isHostUser || isSelf2 || Number(p.is_ready) === 1;
    const isAnsweringThisTile =
      (!isWaitingLobby &&
        isJeopardyGame &&
        jState?.phase === 'question_answer' &&
        effectiveAnsweringUid &&
        String(p.user_id) === String(effectiveAnsweringUid)) ||
      Boolean(isTeamActiveTurn);
    const isChoosingThisTile =
      !isWaitingLobby &&
      isJeopardyGame &&
      (!jState?.phase || jState?.phase === 'board' || jState?.phase === 'final_elimination') &&
      effectiveChoosingUid &&
      String(p.user_id) === String(effectiveChoosingUid);
    const pTileScore =
      customScoreOverride !== undefined
        ? customScoreOverride
        : p.awarded_score !== null && p.awarded_score !== undefined && Number(p.awarded_score) > 0
        ? Number(p.awarded_score)
        : isJeopardyGame
        ? Number(p.score) || 0
        : isMe
        ? Math.max(localScore, Number(p.score) || 0)
        : Number(p.score) || 0;
    const savedUserStats = jState?.savedScoresByUser?.[String(p.user_id)];
    const pFinishedTile = isMe
      ? (localIsFinished || Number(p.is_finished) === 1 || roomData?.status === 'finished')
      : (Number(p.is_finished) === 1 || roomData?.status === 'finished');
    const pRoundTile = isMe ? Math.max(localRound, Number(p.current_round) || 1) : Math.max(1, Number(p.current_round) || 1);
    const completedStepsTile = pFinishedTile ? totalRounds : Math.max(0, pRoundTile - 1);
    const rawCorrectTile = isMe ? Math.max(localCorrectCount, Number(p.correct_count) || 0) : Number(p.correct_count) || 0;
    const pTileCorrect = isJeopardyGame
      ? Number(p.correct_count ?? savedUserStats?.correct_count) || 0
      : (pFinishedTile ? rawCorrectTile : Math.min(rawCorrectTile, completedStepsTile));
    const pTileWrong = isJeopardyGame
      ? Number((p as any).wrong_count ?? savedUserStats?.wrong_count) || 0
      : Number((p as any).wrong_count) > 0
      ? Number((p as any).wrong_count)
      : Math.max(0, completedStepsTile - pTileCorrect);

    const topStatusBadges = isWaitingLobby ? (
      <>
        <BubbleElement isBadge active={isReadyUser} size="sm" className="!px-2 !py-0.5 !text-sm">
          {isReadyUser ? 'Готов ✓' : 'Ждём'}
        </BubbleElement>
        {gameId === '100to1' && (
          <BubbleElement isBadge size="sm" className="!px-2 !py-0.5 !text-sm">
            К{Number(p.team_number) === 2 ? 2 : 1}
          </BubbleElement>
        )}
      </>
    ) : isJeopardyGame && (isAnsweringThisTile || isChoosingThisTile) ? (
      <>
        {isAnsweringThisTile && (
          <BubbleElement isBadge active size="sm" className="!px-2 !py-0.5 !text-sm">
            Отвечает{typeof jState?.liveAnswerTimeLeft === 'number' && jState?.phase === 'question_answer' ? ` • ${jState.liveAnswerTimeLeft}с` : ''}
          </BubbleElement>
        )}
        {isChoosingThisTile && !isAnsweringThisTile && (
          <BubbleElement isBadge active size="sm" className="!px-2 !py-0.5 !text-sm">
            Выбирает{typeof jState?.liveBoardTimeLeft === 'number' && jState?.phase === 'board' ? ` • ${jState.liveBoardTimeLeft}с` : ''}
          </BubbleElement>
        )}
      </>
    ) : teamSplitLayout && isTeamActiveTurn ? (
      <BubbleElement isBadge active size="sm" className="!px-2 !py-0.5 !text-sm">
        Ход команды
      </BubbleElement>
    ) : null;

    return (
      <div
        key={`webcam-square-${p.id || p.user_id || idx}`}
        className="flex flex-col gap-1 min-w-0 w-full"
      >
        {/* Mobile Top Info Bar — OUTSIDE above the video card so it never covers the user */}
        {!compactMobileMode && topStatusBadges && (
          <div className="flex sm:hidden items-center justify-between gap-1 px-0.5 min-w-0 flex-wrap">
            {topStatusBadges}
          </div>
        )}

        {/* Video Card — NO backdrop-blur on the video container so there is zero blur when mic/camera works */}
        <div
          className={`relative aspect-square w-full rounded-2xl sm:rounded-3xl border bg-transparent flex flex-col items-center justify-center shadow-xl group transition-all duration-200 ${
            isAnsweringThisTile || isSpeakingTile
              ? 'border-primary shadow-[0_0_24px_rgba(153,208,55,0.55)] ring-1 ring-primary/60'
              : isChoosingThisTile
              ? 'border-primary/80 shadow-[0_0_16px_rgba(153,208,55,0.35)] ring-1 ring-primary/40'
              : 'border-primary/35'
          }`}
        >
          {/* Bubble Equalizer around the square webcam/avatar when speaking into microphone */}
          <MicEqualizerBubbleOverlay
            isSpeaking={isSpeakingTile}
            level={micAudio.level}
            bands={micAudio.bands}
          />

          <div className="relative w-full h-full rounded-2xl sm:rounded-3xl overflow-hidden flex items-center justify-center">
            {showLiveVideo ? (
              <LiveCameraVideo
                stream={activeMediaStream}
                className={`w-full h-full object-cover ${deviceSettings.mirrorVideo ? 'scale-x-[-1]' : ''}`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 p-2 sm:pb-8">
                <UserAvatar
                  avatarUrl={pAvatar}
                  displayName={pName}
                  size={compactMobileMode ? 'sm' : 'lg'}
                  className="border-2 border-primary/50 shadow-lg"
                />
              </div>
            )}

            {/* Desktop Top Overlay Badges (hidden on mobile where they sit outside above the card) */}
            {topStatusBadges && (
              <div className="hidden sm:flex absolute top-2 left-2 right-2 flex-wrap items-center justify-between gap-1 pointer-events-none z-10">
                {topStatusBadges}
              </div>
            )}

            {/* Desktop Bottom Overlay: Score + Correct/Wrong Icons & Numbers ABOVE Player Name (hidden on mobile) */}
            <div className="hidden sm:flex absolute bottom-2 left-2 right-2 flex-col gap-0.5 rounded-2xl border border-primary/25 bg-transparent px-3 py-1.5 z-10">
              {!teamSplitLayout && (
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-sm font-black text-primary truncate">
                    {pTileScore} очк.
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="inline-flex items-center gap-0.5 text-sm font-black text-emerald-400"
                      title="Правильные ответы"
                    >
                      <CheckCircle2 size={14} className="shrink-0" />
                      <span>{pTileCorrect}</span>
                    </span>
                    <span
                      className="inline-flex items-center gap-0.5 text-sm font-black text-rose-400"
                      title="Неправильные ответы"
                    >
                      <XCircle size={14} className="shrink-0" />
                      <span>{pTileWrong}</span>
                    </span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-bold text-foreground truncate">
                  {pName} {isMe ? '(вы)' : ''}
                </span>
                {isHostUser && !isSelf2 && (
                  <span className="text-sm font-bold text-primary/85 shrink-0">
                    Хост
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Info Bar — OUTSIDE below the video card so it never covers the user */}
        <div className="flex sm:hidden flex-col gap-0.5 rounded-xl border border-primary/25 bg-transparent px-2 py-1 min-w-0">
          {!compactMobileMode && !teamSplitLayout && (
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-black text-primary truncate">
                {pTileScore} очк.
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="inline-flex items-center gap-0.5 text-sm font-black text-emerald-400">
                  <CheckCircle2 size={13} className="shrink-0" />
                  <span>{pTileCorrect}</span>
                </span>
                <span className="inline-flex items-center gap-0.5 text-sm font-black text-rose-400">
                  <XCircle size={13} className="shrink-0" />
                  <span>{pTileWrong}</span>
                </span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-1 min-w-0">
            <span className="text-sm font-bold text-foreground truncate">
              {pName} {isMe ? '(вы)' : ''}
            </span>
            {isHostUser && !isSelf2 && !compactMobileMode && (
              <span className="text-sm font-bold text-primary/85 shrink-0">
                Хост
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (teamSplitLayout && !isWaitingLobby) {
    const rawTeam1Members = displayParticipants.filter(p => Number(p.team_number || 1) !== 2);
    const rawTeam2Members = displayParticipants.filter(p => Number(p.team_number) === 2);
    const team1Members =
      rawTeam1Members.length > 0
        ? rawTeam1Members
        : [
            {
              id: 'virtual_team1_self',
              user_id: String(currentUser.uid),
              display_name: `${currentUser.display_name || 'Вы'} (Команда 1)`,
              avatar_url: currentUser.avatar_url,
              team_number: 1,
              score: team1Score,
              is_ready: 1,
              is_camera_on: isCamOn ? 1 : 0,
              is_mic_on: isMicOn ? 1 : 0
            }
          ];
    const team2Members =
      rawTeam2Members.length > 0
        ? rawTeam2Members
        : [
            {
              id: 'virtual_team2_self',
              user_id: `${currentUser.uid}_self2`,
              display_name: `${currentUser.display_name || 'Вы'} (Команда 2)`,
              avatar_url: currentUser.avatar_url,
              team_number: 2,
              score: team2Score,
              is_ready: 1,
              is_camera_on: isCamOn ? 1 : 0,
              is_mic_on: isMicOn ? 1 : 0
            }
          ];

    return (
      <div className="w-full space-y-5">
        {/* Top Media Controls Bar */}
        <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl px-4 py-3 shadow-xl">
          {portalTarget ? createPortal(headerControlsBlock, portalTarget) : headerControlsBlock}
          {isScreenSharing && (
            <div className="mt-3 relative rounded-2xl overflow-hidden border border-primary/40 bg-transparent backdrop-blur-xl aspect-video max-h-44 w-full">
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
              <div className="absolute top-2 left-2">
                <BubbleElement isBadge active size="sm">
                  Демонстрация вашего экрана
                </BubbleElement>
              </div>
            </div>
          )}
        </div>

        {/* 3-Column Layout: Left = Team 1 (1 per row PC, 2 per row mobile), Center = Questions & Answers + Chat below, Right = Team 2 (1 per row PC, 2 per row mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
          {/* LEFT COLUMN: Team 1 Score Header + Vertical Large Square Webcams (1 per row on PC, 2 per row on Mobile) */}
          <div className="lg:col-span-3 order-2 lg:order-1 space-y-4 w-full">
            <div
              className={`rounded-3xl border p-4 bg-transparent backdrop-blur-2xl transition-all ${
                effectiveActiveTeam === 1
                  ? 'border-primary shadow-[0_0_24px_rgba(153,208,55,0.35)]'
                  : 'border-primary/25'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-base font-black text-foreground flex items-center gap-2">
                  <Users size={18} className="text-primary shrink-0" />
                  <span>{effectiveTeam1Label}</span>
                </span>
                <BubbleElement isBadge active={effectiveActiveTeam === 1} size="sm">
                  {effectiveActiveTeam === 1 ? 'Отвечает ▶' : 'Ожидание'}
                </BubbleElement>
              </div>
              <div className="flex items-baseline justify-between pt-2 border-t border-primary/20">
                <span className="text-sm font-semibold text-foreground/75">Текущие очки:</span>
                <span className="text-2xl sm:text-3xl font-black text-primary">{team1Score}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-1 gap-4 w-full">
              {team1Members.map((p, idx) =>
                renderSquareWebcamCard(p, idx, team1Score, effectiveActiveTeam === 1)
              )}
            </div>
          </div>

          {/* CENTER COLUMN: Question & Answer Input + 6 Answers Board + Chat at Bottom Center */}
          <div className="lg:col-span-6 order-1 lg:order-2 space-y-6 min-w-0 w-full">
            {effectiveCenterContent}
            {effectiveBottomChat && (
              <div className="w-full pt-2">
                {effectiveBottomChat}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Team 2 Score Header + Vertical Large Square Webcams (1 per row on PC, 2 per row on Mobile) */}
          <div className="lg:col-span-3 order-3 lg:order-3 space-y-4 w-full">
            <div
              className={`rounded-3xl border p-4 bg-transparent backdrop-blur-2xl transition-all ${
                effectiveActiveTeam === 2
                  ? 'border-primary shadow-[0_0_24px_rgba(153,208,55,0.35)]'
                  : 'border-primary/25'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-base font-black text-foreground flex items-center gap-2">
                  <Users size={18} className="text-primary shrink-0" />
                  <span>{effectiveTeam2Label}</span>
                </span>
                <BubbleElement isBadge active={effectiveActiveTeam === 2} size="sm">
                  {effectiveActiveTeam === 2 ? 'Отвечает ▶' : 'Ожидание'}
                </BubbleElement>
              </div>
              <div className="flex items-baseline justify-between pt-2 border-t border-primary/20">
                <span className="text-sm font-semibold text-foreground/75">Текущие очки:</span>
                <span className="text-2xl sm:text-3xl font-black text-primary">{team2Score}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-1 gap-4 w-full">
              {team2Members.map((p, idx) =>
                renderSquareWebcamCard(p, idx, team2Score, effectiveActiveTeam === 2)
              )}
            </div>
          </div>
        </div>

        {/* Device Settings Modal */}
        <DeviceSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          userId={currentUser.uid}
          currentSettings={deviceSettings}
          onSaveSettings={(newSettings) => {
            setDeviceSettings(newSettings);
            startLocalMedia(newSettings);
          }}
        />
      </div>
    );
  }

  return (
    <div id="mp-results-banner" className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-3.5 sm:p-4 space-y-3.5 shadow-xl">
      {/* Compact Header & Media Controls (portaled to right column when controlsPortalId is set) */}
      {portalTarget ? createPortal(headerControlsBlock, portalTarget) : headerControlsBlock}

      {/* Screen Share Preview if active */}
      {isScreenSharing && (
        <div className="relative rounded-2xl overflow-hidden border border-primary/40 bg-transparent aspect-video max-h-44 w-full">
          <video
            ref={screenVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
          <div className="absolute top-2 left-2">
            <BubbleElement isBadge active size="sm">
              Демонстрация вашего экрана
            </BubbleElement>
          </div>
        </div>
      )}

      {/* Square Webcam Windows Grid — in compactMobileMode shows up to 4 in one row on mobile so user stays in camera while chatting */}
      <div
        className={`grid ${
          compactMobileMode
            ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-2'
            : embeddedInRoomPage
            ? 'grid-cols-2'
            : 'grid-cols-2 sm:grid-cols-4'
        } gap-2 sm:gap-3`}
      >
        {orderedWebcamParticipants.map((p, idx) => renderSquareWebcamCard(p, idx))}
      </div>

      {/* Requirement 4: Unified Results & Progress directly UNDER the webcam modules (hidden on mobile when compactMobileMode is active) */}
      {!hideProgressBlock && gameId !== '100to1' && displayParticipants.length > 0 && (
        <div className={`${compactMobileMode ? 'hidden lg:block' : ''} rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-3 space-y-2.5`}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-foreground/85 px-1">
            <span className="flex items-center gap-1.5 text-primary">
              <Trophy size={15} />
              <span>
                {roomData?.status === 'finished'
                  ? `Итоговые результаты (${displayParticipants.length}/${effectiveMaxPlayers})`
                  : `Прогресс и результаты (${displayParticipants.length}/${effectiveMaxPlayers})`}
              </span>
            </span>
            <span className="text-foreground/70 text-sm">
              {isWaitingLobby
                ? 'Готовность к старту'
                : displayParticipants.length > 1
                ? (isJeopardyGame ? `Умножение очков ×${displayParticipants.length}` : `Банк победителя ×${displayParticipants.length}`)
                : `Вопрос из ${totalRounds}`}
            </span>
          </div>

          <div className={`grid grid-cols-1 ${embeddedInRoomPage ? '' : 'sm:grid-cols-2'} gap-2`}>
            {rankedParticipants.map((p, idx) => {
              const isMe = String(p.user_id) === String(currentUser.uid);
              const isSelf2 = String(p.user_id) === `${currentUser.uid}_self2` || String(p.user_id).endsWith('_self2');
              const isHostUser = String(p.user_id) === String(roomData?.host_id) || p.role === 'host';
              const isReadyUser = isHostUser || isSelf2 || Number(p.is_ready) === 1;
              const pName = p.display_name || p.username || `Игрок ${idx + 1}`;
              const pFinished = isMe
                ? (localIsFinished || Number(p.is_finished) === 1 || roomData?.status === 'finished')
                : (Number(p.is_finished) === 1 || roomData?.status === 'finished');
              const pRound = isMe ? Math.max(localRound, Number(p.current_round) || 1) : Math.max(1, Number(p.current_round) || 1);
              const completedSteps = pFinished ? totalRounds : Math.max(0, pRound - 1);
              const rawCorrect = isMe ? Math.max(localCorrectCount, Number(p.correct_count) || 0) : Number(p.correct_count) || 0;
              const pCorrect = isJeopardyGame ? Number(p.correct_count) || 0 : (pFinished ? rawCorrect : Math.min(rawCorrect, completedSteps));
              const pScore = p.awarded_score !== null && p.awarded_score !== undefined && Number(p.awarded_score) > 0
                ? Number(p.awarded_score)
                : isJeopardyGame
                ? Number(p.score) || 0
                : isMe
                ? Math.max(localScore, Number(p.score) || 0)
                : Number(p.score) || 0;
              const durText = formatDurationMs(p.finish_time_ms);
              const isWinner = roomData?.status === 'finished' && idx === 0 && (pCorrect > 0 || pScore > 0);
              const showScoreMult = displayParticipants.length > 1 && (isJeopardyGame ? (roomData?.status === 'finished' && pScore > 0) : isWinner);
              const pct = isWaitingLobby
                ? (isReadyUser ? 100 : 25)
                : pFinished
                ? 100
                : Math.min(100, Math.round((pRound / totalRounds) * 100));

              return (
                <div
                  key={`under-webcam-progress-${p.id || p.user_id || idx}`}
                  className={`rounded-xl border bg-transparent px-3 py-2 space-y-1.5 ${
                    isWinner ? 'border-primary/60 shadow-[0_0_16px_rgba(153,208,55,0.2)]' : 'border-primary/20'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-bold text-foreground truncate">
                      #{idx + 1} {pName} {isMe ? '(вы)' : ''}
                    </span>
                    {isWaitingLobby ? (
                      <span className={`font-bold ${isReadyUser ? 'text-primary' : 'text-foreground/60'}`}>
                        {isHostUser ? 'Создатель ✓' : isReadyUser ? 'Готов ✓' : 'Ожидание'}
                      </span>
                    ) : (
                      <BubbleElement isBadge active={pFinished} size="sm" className="!px-2.5 !py-0.5 !text-sm">
                        {pFinished ? 'Финиш' : isJeopardyGame ? `Тур ${Math.min(pRound, 4)}/4` : `Прогресс: ${Math.min(pRound, totalRounds)}/${totalRounds}`}
                      </BubbleElement>
                    )}
                  </div>

                  {!isWaitingLobby && (
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm pt-0.5">
                      <span className="text-primary font-bold">
                        {isJeopardyGame ? `Верных: ${pCorrect}` : `Верных: ${pCorrect}/${totalRounds}`}
                      </span>
                      <span className="text-foreground/75 font-semibold">
                        Время: {durText || (pFinished ? '—' : 'в игре')}
                      </span>
                      <span className="text-foreground font-black">
                        Очков: {pScore}{showScoreMult ? ` (×${displayParticipants.length})` : ''}
                      </span>
                    </div>
                  )}

                  <div className="h-1.5 w-full rounded-full border border-primary/25 bg-transparent overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Requirement 1: Waiting / Invite Block BELOW webcam + progress with icon actions */}
      {isWaitingLobby && displayParticipants.length < effectiveMaxPlayers && (
        <div className={`${compactMobileMode ? 'hidden lg:flex' : 'flex'} w-full rounded-2xl border border-dashed border-primary/35 bg-transparent backdrop-blur-xl p-3 sm:p-4 flex-col sm:flex-row items-center justify-between gap-3`}>
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="w-10 h-10 rounded-2xl border border-primary/35 bg-transparent flex items-center justify-center text-primary shrink-0">
              <Users size={20} />
            </div>
            <div>
              <p className="text-sm sm:text-base font-bold text-foreground">
                Ожидание собеседников ({displayParticipants.length}/{effectiveMaxPlayers})
              </p>
              <p className="text-sm text-foreground/70">
                Пригласите друзей или добавьте себя 2-м участником
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 shrink-0">
            {onOpenInvite && (
              <BubbleElement
                size="md"
                active
                onClick={onOpenInvite}
                icon={<Share2 size={16} />}
                title="Пригласить друзей"
              />
            )}

            {realOtherParticipants.length === 0 && (
              <BubbleElement
                size="md"
                active={isSelfSecondJoined}
                disabled={addingSelfSecond}
                onClick={handleToggleSelfSecond}
                icon={isSelfSecondJoined ? <UserCheck size={16} /> : <UserPlus size={16} />}
                title={isSelfSecondJoined ? 'Убрать 2-го участника' : 'Добавить себя 2-м участником'}
              />
            )}

            <BubbleElement
              size="md"
              active={copiedLink}
              onClick={handleCopyInviteLink}
              icon={copiedLink ? <Check size={16} /> : <Copy size={16} />}
              title={copiedLink ? 'Ссылка скопирована' : 'Скопировать ссылку'}
            />
          </div>
        </div>
      )}

      {/* Device Settings Modal */}
      <DeviceSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userId={currentUser.uid}
        currentSettings={deviceSettings}
        onSaveSettings={(newSettings) => {
          setDeviceSettings(newSettings);
          startLocalMedia(newSettings);
        }}
      />
    </div>
  );
};
