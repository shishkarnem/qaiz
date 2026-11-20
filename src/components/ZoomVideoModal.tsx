import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Monitor, 
  MonitorOff, 
  PhoneOff, 
  Users, 
  Settings, 
  Maximize2, 
  Minimize2, 
  CircleDot, 
  Square, 
  Pause,
  Download, 
  Copy, 
  Check, 
  Radio, 
  Play,
  Share2,
  Sparkles,
  Zap,
  MessageSquare,
  Globe,
  Crop,
  Maximize,
  UserPlus,
  UserCheck,
  Gamepad2,
  X
} from 'lucide-react';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { DeviceSettingsModal, UserMediaDeviceSettings } from './video/DeviceSettingsModal';
import { VideoInviteModal } from './video/VideoInviteModal';
import { CameraTile } from './video/CameraTile';
import { GameChat, ChatMessage, ChatAttachment } from './GameChat';
import { useScreenRecording } from '../context/ScreenRecordingContext';
import { audioSystem } from '../hooks/useSound';

interface ZoomVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    uid: string;
    display_name?: string;
    avatar_url?: string | null;
  };
  roomId?: string;
  roomTitle?: string;
  roomType?: 'chat' | 'blitz' | '100to1' | 'jeopardy' | 'general' | string;
  gameId?: string;
  maxPlayers?: number;
  onStartGame?: () => void;
}

interface RoomMember {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  is_camera_on: number;
  is_mic_on: number;
  is_screen_sharing: number;
}

export type ScreenShareMode = 'browser' | 'region' | 'monitor';

export const ZoomVideoModal: React.FC<ZoomVideoModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  roomId: initialRoomId = 'multiplayer_lobby',
  roomTitle: initialRoomTitle,
  roomType: initialRoomType = 'general',
  gameId,
  maxPlayers: propMaxPlayers,
  onStartGame
}) => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState<string>(initialRoomId);
  const [roomTitle, setRoomTitle] = useState<string>(initialRoomTitle || 'Видеокомната Квайз');
  const [roomType, setRoomType] = useState<string>(initialRoomType);
  const [roomMaxPlayers, setRoomMaxPlayers] = useState<number>(propMaxPlayers || 8);
  const [members, setMembers] = useState<RoomMember[]>([]);

  // Local media state
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareMode, setScreenShareMode] = useState<ScreenShareMode>('monitor');
  const [isScreenPickerOpen, setIsScreenPickerOpen] = useState(false);
  const [isRegionSelectorOpen, setIsRegionSelectorOpen] = useState(false);
  const [regionRect, setRegionRect] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 10,
    y: 10,
    w: 80,
    h: 80
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [addingSelfSecond, setAddingSelfSecond] = useState(false);

  // Sub-modals & Group Chat state (default closed so video & screen share are unobstructed)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const lastReadMsgCountRef = useRef<number>(0);
  const chatInitializedRef = useRef<boolean>(false);

  // User media devices (per-user preferences in localStorage)
  const [deviceSettings, setDeviceSettings] = useState<UserMediaDeviceSettings>(() => {
    try {
      const saved = localStorage.getItem(`qaiz_media_settings_${currentUser.uid}`);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {
      audioInputId: '',
      videoInputId: '',
      audioOutputId: ''
    };
  });

  // Global Screen Recording State (persists across route navigation and modal closure)
  const {
    isRecording,
    isPaused: isRecordingPaused,
    recordingSeconds,
    recordingUrl,
    recordingError,
    clearRecordingError,
    startRecording: startGlobalScreenRecording,
    togglePauseRecording,
    stopRecording: stopGlobalScreenRecording,
    downloadLastRecording
  } = useScreenRecording();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [leavingRoom, setLeavingRoom] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const [pcAspectNumeric, setPcAspectNumeric] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.screen?.width && window.screen?.height && window.screen.width > window.screen.height) {
      return Number((window.screen.width / window.screen.height).toFixed(4));
    }
    return 16 / 9;
  });
  const pcScreenAspect = `${pcAspectNumeric} / 1`;

  useEffect(() => {
    const updateViewportAndFullscreen = () => {
      if (typeof window === 'undefined') return;
      setIsMobileViewport(window.innerWidth < 640);
      setIsFullscreen(Boolean(document.fullscreenElement));
      const sw = window.screen?.width || 1920;
      const sh = window.screen?.height || 1080;
      if (sw > sh) {
        setPcAspectNumeric(Number((sw / sh).toFixed(4)));
      } else {
        setPcAspectNumeric(16 / 9);
      }
    };
    updateViewportAndFullscreen();
    window.addEventListener('resize', updateViewportAndFullscreen);
    document.addEventListener('fullscreenchange', updateViewportAndFullscreen);
    return () => {
      window.removeEventListener('resize', updateViewportAndFullscreen);
      document.removeEventListener('fullscreenchange', updateViewportAndFullscreen);
    };
  }, []);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const syntheticCanvasIntervalRef = useRef<any>(null);

  // Sync state if props change
  useEffect(() => {
    if (initialRoomId) setRoomId(initialRoomId);
    if (initialRoomTitle) setRoomTitle(initialRoomTitle);
    if (initialRoomType) setRoomType(initialRoomType);
  }, [initialRoomId, initialRoomTitle, initialRoomType]);

  // Track unread chat messages when in Video mode (!isChatOpen)
  useEffect(() => {
    if (!chatInitializedRef.current) {
      if (chatMessages.length > 0) {
        lastReadMsgCountRef.current = chatMessages.length;
        chatInitializedRef.current = true;
      }
      return;
    }
    if (isChatOpen) {
      lastReadMsgCountRef.current = chatMessages.length;
      setUnreadChatCount(0);
    } else if (chatMessages.length > lastReadMsgCountRef.current) {
      setUnreadChatCount(chatMessages.length - lastReadMsgCountRef.current);
    }
  }, [chatMessages.length, isChatOpen]);

  useEffect(() => {
    if (!isOpen) {
      chatInitializedRef.current = false;
      setUnreadChatCount(0);
    }
  }, [isOpen]);

  // Update browser URL address bar to reflect the room link when opened
  useEffect(() => {
    if (!isOpen) return;

    try {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('room', roomId);
      if (roomType) currentUrl.searchParams.set('type', roomType);
      if (gameId) currentUrl.searchParams.set('game', gameId);
      window.history.replaceState({}, '', currentUrl.toString());
    } catch (_) {}

    return () => {
      try {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('room');
        currentUrl.searchParams.delete('type');
        currentUrl.searchParams.delete('game');
        window.history.replaceState({}, '', currentUrl.toString());
      } catch (_) {}
    };
  }, [isOpen, roomId, roomType, gameId]);

  // 1. Initialize local media using chosen devices
  const initLocalMedia = useCallback(async (settings: UserMediaDeviceSettings) => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const isPc = typeof window !== 'undefined' && window.innerWidth >= 640;
      const videoConstraints: MediaTrackConstraints | boolean = settings.videoInputId
        ? {
            deviceId: { exact: settings.videoInputId },
            ...(isPc ? { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } } : {})
          }
        : isPc
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } }
        : true;

      const constraints: MediaStreamConstraints = {
        audio: settings.audioInputId ? { deviceId: { exact: settings.audioInputId } } : true,
        video: videoConstraints
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const vTracks = stream.getVideoTracks();
      if (vTracks.length > 0) vTracks[0].enabled = isCameraOn;
      const aTracks = stream.getAudioTracks();
      if (aTracks.length > 0) aTracks[0].enabled = isMicOn;
    } catch (err) {
      console.warn('Cannot access camera/mic with selected constraints:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localStreamRef.current = fallbackStream;
        setLocalStream(fallbackStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = fallbackStream;
          localVideoRef.current.play().catch(() => {});
        }
      } catch (err2) {
        console.warn('Fallback media access failed:', err2);
        setIsCameraOn(false);
        setIsMicOn(false);
      }
    }
  }, [isCameraOn, isMicOn]);

  const handleLeaveRoomCompletely = useCallback(async () => {
    if (leavingRoom) return;
    setLeavingRoom(true);
    try {
      const cleanMpId = roomId.replace(/^room_/, '');
      await Promise.all([
        fetch(`/api/zoom/rooms/${roomId}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.uid })
        }).catch(() => {}),
        fetch(`/api/zoom/rooms/${roomId}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: `${currentUser.uid}_self2` })
        }).catch(() => {}),
        fetch(`/api/multiplayer/rooms/${cleanMpId}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.uid })
        }).catch(() => {})
      ]);
    } finally {
      setLeavingRoom(false);
      onClose();
    }
  }, [leavingRoom, roomId, currentUser.uid, onClose]);

  const stopScreenStreamInternal = useCallback(() => {
    if (syntheticCanvasIntervalRef.current) {
      clearInterval(syntheticCanvasIntervalRef.current);
      syntheticCanvasIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    initLocalMedia(deviceSettings);

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      stopScreenStreamInternal();
      // Do NOT stop global screen recording when closing modal or navigating between pages
    };
  }, [isOpen, initLocalMedia, deviceSettings, stopScreenStreamInternal]);

  // Apply audio output device
  useEffect(() => {
    if (deviceSettings.audioOutputId && screenVideoRef.current && 'setSinkId' in screenVideoRef.current) {
      (screenVideoRef.current as any).setSinkId(deviceSettings.audioOutputId).catch(() => {});
    }
  }, [deviceSettings.audioOutputId]);

  // 2. Room polling, registration & ping presence
  const pingAndFetch = useCallback(async () => {
    if (!isOpen || !roomId) return;
    try {
      await fetch(`/api/zoom/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.uid,
          display_name: currentUser.display_name || 'Участник',
          avatar_url: currentUser.avatar_url,
          is_camera_on: isCameraOn ? 1 : 0,
          is_mic_on: isMicOn ? 1 : 0,
          is_screen_sharing: isScreenSharing ? 1 : 0
        })
      });

      const res = await fetch(`/api/zoom/rooms/${roomId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.members && Array.isArray(data.members)) {
          const uniqueMap = new Map<string, any>();
          for (const m of data.members) {
            const uid = String(m.user_id || m.id || '');
            if (uid && !uniqueMap.has(uid)) {
              uniqueMap.set(uid, m);
            }
          }
          setMembers(Array.from(uniqueMap.values()));
        }
        if (data.room) {
          if (data.room.title) setRoomTitle(data.room.title);
          if (data.room.room_type) setRoomType(data.room.room_type);
          if (Number(data.room.max_players) >= 2 && Number(data.room.max_players) <= 8) {
            setRoomMaxPlayers(Number(data.room.max_players));
          }
        }
        if (Array.isArray(data.messages)) {
          setChatMessages(
            data.messages.map((m: any, idx: number) => ({
              id: String(m.id || idx),
              senderId: String(m.senderId || m.user_id || ''),
              senderName: m.senderName || 'Участник',
              avatar: m.avatarUrl || undefined,
              text: m.text || '',
              isBot: false,
              timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
              file_url: m.file_url || undefined,
              file_name: m.file_name || undefined,
              file_type: m.file_type || undefined,
              file_size: m.file_size || undefined,
              audio_url: m.audio_url || undefined,
              audio_duration: m.audio_duration || undefined
            }))
          );
        }
      }
    } catch (err) {
      console.warn('Zoom ping error:', err);
    }
  }, [isOpen, roomId, currentUser.uid, currentUser.display_name, currentUser.avatar_url, isCameraOn, isMicOn, isScreenSharing]);

  const handleSendRoomChatMessage = async (text: string, attachment?: ChatAttachment) => {
    if ((!text.trim() && !attachment) || !roomId) return;
    const tempId = `local_${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      senderId: String(currentUser.uid),
      senderName: currentUser.display_name || 'Вы',
      avatar: currentUser.avatar_url || undefined,
      text: text.trim(),
      isBot: false,
      timestamp: Date.now(),
      file_url: attachment?.file_url,
      file_name: attachment?.file_name,
      file_type: attachment?.file_type,
      file_size: attachment?.file_size,
      audio_url: attachment?.audio_url,
      audio_duration: attachment?.audio_duration
    };
    setChatMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`/api/zoom/rooms/${roomId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.uid,
          sender_name: currentUser.display_name || 'Участник',
          avatar_url: currentUser.avatar_url,
          text: text.trim(),
          file_url: attachment?.file_url,
          file_name: attachment?.file_name,
          file_type: attachment?.file_type,
          file_size: attachment?.file_size,
          audio_url: attachment?.audio_url,
          audio_duration: attachment?.audio_duration
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setChatMessages((prev) => prev.filter((m) => m.id !== tempId));
        return {
          moderated: Boolean(errData.moderated),
          error: errData.error || errData.reason || 'Сообщение отклонено ИИ-модератором чата'
        };
      }
      await pingAndFetch();
    } catch (_) {}
  };

  useEffect(() => {
    if (!isOpen || !roomId) return;

    pingAndFetch();
    const interval = setInterval(pingAndFetch, 3000);

    return () => {
      clearInterval(interval);
      fetch(`/api/zoom/rooms/${roomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.uid })
      }).catch(() => {});
    };
  }, [isOpen, roomId, currentUser.uid, pingAndFetch]);

  const effectiveMaxPlayers = Math.min(8, Math.max(2, Number(propMaxPlayers || roomMaxPlayers) || 8));

  // Real other participants check: if someone else entered the lobby, remove duplicate _self2
  const realOtherMembers = members.filter(
    (m) => String(m.user_id) !== String(currentUser.uid) && !String(m.user_id).endsWith('_self2')
  );
  const visibleRemoteMembers = members
    .filter((m) => {
      if (String(m.user_id) === String(currentUser.uid)) return false;
      if (realOtherMembers.length > 0 && String(m.user_id).endsWith('_self2')) return false;
      return true;
    })
    .slice(0, Math.max(1, effectiveMaxPlayers - 1));

  // Add self as 2nd participant directly into the lobby (Requirement 4)
  const isSelfSecondJoined =
    realOtherMembers.length === 0 &&
    members.some((m) => String(m.user_id) === `${currentUser.uid}_self2`);

  const handleToggleSelfSecond = async () => {
    setAddingSelfSecond(true);
    try {
      const self2Id = `${currentUser.uid}_self2`;
      if (isSelfSecondJoined) {
        await fetch(`/api/zoom/rooms/${roomId}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: self2Id })
        });
      } else {
        await fetch(`/api/zoom/rooms/${roomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: self2Id,
            display_name: `${currentUser.display_name || 'Вы'} (2-й участник)`,
            avatar_url: currentUser.avatar_url,
            is_camera_on: isCameraOn ? 1 : 0,
            is_mic_on: 1,
            is_screen_sharing: 0
          })
        });
        // Also join multiplayer room if applicable
        await fetch(`/api/multiplayer/rooms/${roomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: self2Id,
            team_number: 2
          })
        }).catch(() => {});
      }
      await pingAndFetch();
    } catch (e) {
      console.warn('Self 2nd participant toggle error:', e);
    } finally {
      setAddingSelfSecond(false);
    }
  };

  // Toggle Camera
  const toggleCamera = () => {
    const nextState = !isCameraOn;
    audioSystem.playSlot('mp_video_cam_toggle');
    if (localStreamRef.current) {
      const vTracks = localStreamRef.current.getVideoTracks();
      if (vTracks.length > 0) {
        vTracks[0].enabled = nextState;
      }
    }
    setIsCameraOn(nextState);
  };

  // Toggle Mic
  const toggleMic = () => {
    const nextState = !isMicOn;
    audioSystem.playSlot('mp_video_mic_toggle');
    if (localStreamRef.current) {
      const aTracks = localStreamRef.current.getAudioTracks();
      if (aTracks.length > 0) {
        aTracks[0].enabled = nextState;
      }
    }
    setIsMicOn(nextState);
  };

  // Attach screen stream to video element reliably
  const setScreenVideoElement = useCallback((el: HTMLVideoElement | null) => {
    screenVideoRef.current = el;
    if (el && screenStreamRef.current) {
      el.srcObject = screenStreamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (isScreenSharing && screenStreamRef.current && screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
      screenVideoRef.current.play().catch(() => {});
    }
  }, [isScreenSharing, screenShareMode]);

  // Create live interactive canvas stream when native getDisplayMedia is restricted by iframe or when cropping region
  const createLiveScreenCanvasStream = useCallback(
    (
      mode: ScreenShareMode,
      sourceStream?: MediaStream | null,
      crop?: { x: number; y: number; w: number; h: number }
    ): MediaStream => {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');

      let sourceVideo: HTMLVideoElement | null = null;
      if (sourceStream && sourceStream.getVideoTracks().length > 0) {
        sourceVideo = document.createElement('video');
        sourceVideo.srcObject = sourceStream;
        sourceVideo.muted = true;
        sourceVideo.playsInline = true;
        sourceVideo.play().catch(() => {});
      }

      const activeCrop = crop || regionRect;

      const renderFrame = () => {
        if (!ctx) return;

        // If we have a real OS/browser video stream and mode === 'region', crop it live
        if (sourceVideo && sourceVideo.readyState >= 2 && sourceVideo.videoWidth > 0) {
          const vw = sourceVideo.videoWidth;
          const vh = sourceVideo.videoHeight;
          const sx = Math.max(0, Math.floor((activeCrop.x / 100) * vw));
          const sy = Math.max(0, Math.floor((activeCrop.y / 100) * vh));
          const sw = Math.max(64, Math.floor((activeCrop.w / 100) * vw));
          const sh = Math.max(64, Math.floor((activeCrop.h / 100) * vh));

          ctx.fillStyle = '#0e1117';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(sourceVideo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          return;
        }

        // Live in-app screen mirror (renders real live camera + active room UI + selected screen mode)
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#12161f');
        grad.addColorStop(0.5, '#181e29');
        grad.addColorStop(1, '#10141d');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle grid
        ctx.strokeStyle = 'rgba(202, 253, 0, 0.08)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx < canvas.width; gx += 64) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, canvas.height);
          ctx.stroke();
        }
        for (let gy = 0; gy < canvas.height; gy += 64) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(canvas.width, gy);
          ctx.stroke();
        }

        // Header bar
        ctx.fillStyle = 'rgba(202, 253, 0, 0.12)';
        ctx.fillRect(40, 32, canvas.width - 80, 72);
        ctx.strokeStyle = 'rgba(202, 253, 0, 0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(40, 32, canvas.width - 80, 72);

        const modeTitle =
          mode === 'browser'
            ? 'Демонстрация экрана: Вкладка браузера'
            : mode === 'region'
            ? `Демонстрация экрана: Выбранная область (${activeCrop.w}% × ${activeCrop.h}%)`
            : 'Демонстрация экрана: Весь экран';

        ctx.fillStyle = '#cafd00';
        ctx.font = 'bold 24px Inter, system-ui, sans-serif';
        ctx.fillText(modeTitle, 68, 76);

        const nowStr = new Date().toLocaleTimeString();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(nowStr, canvas.width - 180, 75);

        // Main stage content area
        const stageX = mode === 'region' ? 40 + ((activeCrop.x / 100) * 160) : 40;
        const stageY = 128;
        const stageW = canvas.width - stageX * 2;
        const stageH = canvas.height - 170;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(stageX, stageY, stageW, stageH);
        ctx.strokeStyle = 'rgba(202, 253, 0, 0.35)';
        ctx.strokeRect(stageX, stageY, stageW, stageH);

        // Draw live camera feed inside the shared screen if available
        if (localVideoRef.current && localVideoRef.current.readyState >= 2 && isCameraOn) {
          const camW = 460;
          const camH = 340;
          const camX = stageX + 36;
          const camY = stageY + 36;
          ctx.save();
          ctx.strokeStyle = '#cafd00';
          ctx.lineWidth = 3;
          ctx.strokeRect(camX - 2, camY - 2, camW + 4, camH + 4);
          ctx.drawImage(localVideoRef.current, camX, camY, camW, camH);
          ctx.restore();
        } else {
          const camX = stageX + 36;
          const camY = stageY + 36;
          ctx.fillStyle = 'rgba(202, 253, 0, 0.1)';
          ctx.fillRect(camX, camY, 460, 340);
          ctx.fillStyle = '#cafd00';
          ctx.font = 'bold 28px Inter, system-ui, sans-serif';
          ctx.fillText(currentUser.display_name || 'Ведущий', camX + 40, camY + 180);
        }

        // Draw active room & participants info on right side of shared screen
        const infoX = stageX + 530;
        let infoY = stageY + 70;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Inter, system-ui, sans-serif';
        ctx.fillText(roomTitle, infoX, infoY);

        infoY += 42;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.font = '20px Inter, system-ui, sans-serif';
        ctx.fillText(`ID комнаты: ${roomId}`, infoX, infoY);

        infoY += 48;
        ctx.fillStyle = '#cafd00';
        ctx.font = 'bold 22px Inter, system-ui, sans-serif';
        ctx.fillText(`Участники в комнате (${members.length || 1}):`, infoX, infoY);

        const list = members.length > 0 ? members : [{ display_name: currentUser.display_name || 'Вы', user_id: currentUser.uid }];
        list.slice(0, 6).forEach((m: any, idx: number) => {
          infoY += 38;
          ctx.fillStyle = '#ffffff';
          ctx.font = '20px Inter, system-ui, sans-serif';
          ctx.fillText(`${idx + 1}. ${m.display_name || 'Участник'}`, infoX + 12, infoY);
        });

        // Live pulsing indicator
        const pulse = (Math.sin(Date.now() / 250) + 1) / 2;
        ctx.beginPath();
        ctx.arc(stageX + stageW - 40, stageY + 40, 10 + pulse * 4, 0, Math.PI * 2);
        ctx.fillStyle = '#cafd00';
        ctx.fill();
      };

      renderFrame();
      if (syntheticCanvasIntervalRef.current) {
        clearInterval(syntheticCanvasIntervalRef.current);
      }
      syntheticCanvasIntervalRef.current = setInterval(renderFrame, 33);

      const captured = (canvas as any).captureStream ? (canvas as any).captureStream(30) : new MediaStream();
      if (sourceStream && sourceStream.getAudioTracks().length > 0) {
        sourceStream.getAudioTracks().forEach((t) => captured.addTrack(t));
      }
      return captured;
    },
    [regionRect, isCameraOn, currentUser.display_name, currentUser.uid, roomTitle, roomId, members]
  );

  // Start Screen Share with chosen mode (Requirement 5: браузер, область, весь)
  const startScreenShareWithMode = async (
    mode: ScreenShareMode,
    customCrop?: { x: number; y: number; w: number; h: number }
  ) => {
    audioSystem.playSlot('mp_video_screenshare');
    stopScreenStreamInternal();
    setScreenShareMode(mode);
    setIsScreenPickerOpen(false);
    setIsRegionSelectorOpen(false);

    try {
      let nativeStream: MediaStream | null = null;
      if (navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices) {
        const displaySurfaceHint =
          mode === 'browser' ? 'browser' : mode === 'region' ? 'window' : 'monitor';

        try {
          nativeStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: displaySurfaceHint
            },
            preferCurrentTab: mode === 'browser',
            audio: true
          } as any);
        } catch (errFirst) {
          // If user explicitly cancelled native dialog, don't force synthetic unless permissions policy blocked it
          const errMsg = String((errFirst as any)?.message || (errFirst as any)?.name || '').toLowerCase();
          const isPermissionPolicyBlocked =
            errMsg.includes('permission') ||
            errMsg.includes('policy') ||
            errMsg.includes('not allowed by the user agent') ||
            errMsg.includes('security') ||
            errMsg.includes('not supported');

          if (!isPermissionPolicyBlocked) {
            try {
              nativeStream = await navigator.mediaDevices.getDisplayMedia({
                video: true
              } as any);
            } catch (_) {}
          }
        }
      }

      let finalStream: MediaStream;
      if (nativeStream) {
        if (mode === 'region') {
          finalStream = createLiveScreenCanvasStream('region', nativeStream, customCrop || regionRect);
        } else {
          finalStream = nativeStream;
        }
        const videoTrack = nativeStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            stopScreenStreamInternal();
            setIsScreenSharing(false);
          };
        }
      } else {
        // Fallback live screen stream when iframe environment blocks native display-capture
        finalStream = createLiveScreenCanvasStream(mode, null, customCrop || regionRect);
      }

      screenStreamRef.current = finalStream;
      setIsScreenSharing(true);

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = finalStream;
        screenVideoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Screen share fallback activated:', err);
      const fallbackStream = createLiveScreenCanvasStream(mode, null, customCrop || regionRect);
      screenStreamRef.current = fallbackStream;
      setIsScreenSharing(true);
    }
  };

  const handleScreenShareButtonClick = () => {
    if (isScreenSharing) {
      stopScreenStreamInternal();
      setIsScreenSharing(false);
    } else {
      setIsScreenPickerOpen(true);
    }
  };

  // Start / Stop Global Full Screen & Sound Recording (persists when leaving video conference or navigating)
  const stopRecording = useCallback(() => {
    stopGlobalScreenRecording();
  }, [stopGlobalScreenRecording]);

  const startRecording = async () => {
    await startGlobalScreenRecording({
      existingScreenStream: screenStreamRef.current,
      existingAudioStream: localStreamRef.current,
      roomId
    });
  };

  const downloadRecording = () => {
    downloadLastRecording();
  };

  const copyRoomInvite = () => {
    const inviteText = `${window.location.origin}/zoom?room=${roomId}&type=${roomType}${gameId ? `&game=${gameId}` : ''}`;
    navigator.clipboard.writeText(inviteText);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Lobby metadata helper (only multiplayer games + chat/general)
  const getLobbyInfo = () => {
    switch (roomType) {
      case 'blitz':
        return {
          icon: <Zap size={16} className="text-yellow-400" />,
          title: 'Лобби: КвИИз',
          desc: 'Скоростной блиц-турнир',
          gameRoute: '/game/blitz'
        };
      case '100to1':
        return {
          icon: <Users size={16} className="text-emerald-400" />,
          title: 'Лобби: Сто Квадному',
          desc: 'Командная битва до 5 игроков',
          gameRoute: '/game/100to1'
        };
      case 'jeopardy':
        return {
          icon: <Sparkles size={16} className="text-amber-400" />,
          title: 'Лобби: Своя Икра',
          desc: 'Интеллектуальная битва тем и ставок',
          gameRoute: '/game/jeopardy'
        };
      case 'chat':
        return {
          icon: <MessageSquare size={16} className="text-primary" />,
          title: 'Видеочат',
          desc: 'Личная или групповая видеосвязь',
          gameRoute: null
        };
      default:
        return {
          icon: <Video size={16} className="text-primary" />,
          title: 'Видеокомната Квайз',
          desc: 'Онлайн видеоконференция',
          gameRoute: null
        };
    }
  };

  const lobbyInfo = getLobbyInfo();

  if (!isOpen) return null;

  const modalNode = (
    <AnimatePresence>
      <div 
        id="zoom-modal-backdrop"
        className={`fixed inset-0 z-[9999] flex items-center justify-center ${
          isFullscreen ? 'p-0' : 'p-2 sm:p-4'
        } bg-transparent backdrop-blur-2xl overflow-hidden`}
      >
        <motion.div
          id="zoom-modal-container"
          ref={containerRef}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className={`relative w-full ${
            isFullscreen
              ? 'w-screen h-screen max-w-none max-h-none rounded-none border-0'
              : 'max-w-6xl h-[94vh] rounded-3xl border border-primary/30'
          } flex flex-col bg-transparent backdrop-blur-3xl shadow-2xl overflow-hidden`}
        >
          {/* Top Bar with Apple Liquid Glass style — Row 1: percentage-width icons; Row 2: room title & participant count badge */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2.5 sm:px-4 py-2 sm:py-2.5 border-b border-primary/20 bg-transparent backdrop-blur-md shrink-0 gap-2">
            {/* Row 1 on Mobile (Right on Desktop): Action Icons calculated as percentage of device width */}
            <div className="flex items-center justify-between sm:justify-end gap-1 sm:gap-1.5 w-full sm:w-auto sm:order-2 shrink-0">
              {/* Optional Game Start Icon Button for Game Lobbies */}
              {lobbyInfo.gameRoute && (
                <BubbleElement
                  size="sm"
                  active
                  onClick={() => {
                    if (onStartGame) onStartGame();
                    else navigate(lobbyInfo.gameRoute!);
                  }}
                  icon={<Play size={15} />}
                  title="Начать игру"
                  className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5 sm:!py-2"
                />
              )}

              {/* Video Mode Icon */}
              <BubbleElement
                size="sm"
                active={!isChatOpen}
                onClick={() => setIsChatOpen(false)}
                icon={<Video size={15} />}
                title="Видео-режим"
                className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5 sm:!py-2"
              />

              {/* Chat Mode Icon with Unread Badge */}
              <div className="relative flex-1 sm:flex-initial min-w-0 flex">
                <BubbleElement
                  size="sm"
                  active={isChatOpen}
                  onClick={() => setIsChatOpen((prev) => !prev)}
                  icon={<MessageSquare size={15} />}
                  title="Открыть / скрыть чат"
                  className="w-full justify-center !px-0 sm:!px-2.5 !py-1.5 sm:!py-2"
                />
                {unreadChatCount > 0 && !isChatOpen && (
                  <span className="pointer-events-none absolute -top-1.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-background text-sm font-black flex items-center justify-center shadow-[0_0_10px_rgba(153,208,55,0.9)]">
                    {unreadChatCount}
                  </span>
                )}
              </div>

              {/* Game / Room Invite Icon Button in Header (Mobile & PC) */}
              <BubbleElement
                size="sm"
                active={isInviteModalOpen || copiedLink}
                onClick={() => setIsInviteModalOpen(true)}
                icon={<Gamepad2 size={15} />}
                title="Пригласить на игру или в видеокомнату"
                className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5 sm:!py-2"
              />

              {/* Add Self as 2nd Participant directly in lobby (icon only) */}
              {realOtherMembers.length === 0 && (
                <BubbleElement
                  size="sm"
                  active={isSelfSecondJoined}
                  disabled={addingSelfSecond}
                  onClick={handleToggleSelfSecond}
                  icon={isSelfSecondJoined ? <UserCheck size={15} /> : <UserPlus size={15} />}
                  title={isSelfSecondJoined ? 'Убрать 2-го участника' : 'Играть с собой (2-й участник)'}
                  className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5 sm:!py-2"
                />
              )}

              {/* Settings Icon Button */}
              <BubbleElement
                size="sm"
                onClick={() => setIsSettingsOpen(true)}
                icon={<Settings size={15} />}
                title="Настройки микрофона, камеры и динамиков"
                className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5 sm:!py-2"
              />

              {/* Fullscreen Icon Button */}
              <BubbleElement
                size="sm"
                onClick={toggleFullscreen}
                icon={isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                title="Полноэкранный режим"
                className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5 sm:!py-2"
              />

              {/* Leave Game Icon Button */}
              <BubbleElement
                size="sm"
                onClick={handleLeaveRoomCompletely}
                disabled={leavingRoom}
                icon={<PhoneOff size={15} className="text-red-400" />}
                className="flex-1 sm:flex-initial min-w-0 justify-center border-red-500/35 hover:border-red-500/60 text-red-400 !px-0 sm:!px-2.5 !py-1.5 sm:!py-2"
                title="Покинуть игру и удалиться из списка участников"
              />

              {/* Close Modal Icon Button */}
              <BubbleElement
                size="sm"
                onClick={onClose}
                icon={<X size={15} />}
                className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-2.5 !py-1.5 sm:!py-2"
                title="Закрыть окно, оставаясь в списке участников"
              />
            </div>

            {/* Row 2 on Mobile (Left on Desktop): Separate line for Room Title & Participant Count Badge so they never overlap icons */}
            <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0 w-full sm:w-auto sm:flex-1 sm:order-1 pt-1 sm:pt-0 border-t sm:border-t-0 border-primary/15">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl bg-primary/20 border border-primary/35 flex items-center justify-center text-primary shadow-sm shrink-0">
                  {lobbyInfo.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                    {roomTitle}
                  </h3>
                  <div className="hidden sm:flex items-center gap-2 text-sm text-foreground/60 font-mono truncate">
                    <span>{lobbyInfo.title}</span>
                    <span>•</span>
                    <span>ID: {roomId}</span>
                  </div>
                </div>
              </div>

              <BubbleElement
                isBadge
                active
                size="sm"
                icon={<Radio size={12} className="animate-pulse" />}
                className="shrink-0 !px-2.5 !py-0.5 !text-sm"
              >
                {Math.min(effectiveMaxPlayers, 1 + visibleRemoteMembers.length)}/{effectiveMaxPlayers}
              </BubbleElement>
            </div>
          </div>

          {recordingError && (
            <div className="px-4 py-2 border-b border-red-500/30 bg-transparent backdrop-blur-md flex items-center justify-between text-sm text-red-300 shrink-0">
              <span className="truncate">{recordingError}</span>
              <BubbleElement size="sm" onClick={clearRecordingError} icon={<X size={14} />} title="Скрыть" />
            </div>
          )}

          {/* Main Stage — Zoom-style Single Mobile Viewport without scroll; keeps user camera mounted & visible even when switched to Chat */}
          <div className="flex-1 p-2.5 sm:p-4 overflow-hidden min-h-0 flex flex-col lg:flex-row gap-2.5 sm:gap-4">
            {/* Video & Screen Share Stage — stays mounted in a compact top strip on mobile when Chat is open so you NEVER disappear from camera */}
            <div
              className={
                isChatOpen
                  ? 'h-28 sm:h-36 lg:h-full lg:flex-1 min-w-0 shrink-0 flex flex-col gap-2 overflow-hidden transition-all duration-200'
                  : 'flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col gap-2.5 sm:gap-3 transition-all duration-200'
              }
            >
              {isScreenSharing ? (
                <div
                  className={
                    isChatOpen
                      ? 'h-full flex flex-row gap-2 overflow-x-auto items-stretch'
                      : 'h-full min-h-0 flex flex-col landscape:flex-row lg:flex-col gap-2.5 sm:gap-3 overflow-hidden'
                  }
                >
                  {/* Screen Share View — horizontal with screen aspect ratio on PC/Fullscreen, alongside webcams without scrolling */}
                  <div
                    style={!isChatOpen && !isMobileViewport ? { containerType: 'size' } : undefined}
                    className={
                      isChatOpen
                        ? 'relative w-44 sm:w-64 h-full shrink-0 rounded-2xl border border-primary/35 bg-transparent overflow-hidden flex items-center justify-center'
                        : 'relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden'
                    }
                  >
                    <div
                      style={
                        !isChatOpen && !isMobileViewport
                          ? {
                              aspectRatio: pcScreenAspect,
                              width: `min(100cqw, calc(100cqh * ${pcAspectNumeric}))`
                            }
                          : undefined
                      }
                      className={
                        isChatOpen
                          ? 'relative w-full h-full flex items-center justify-center'
                          : 'relative w-full h-full rounded-3xl border border-primary/35 bg-transparent overflow-hidden flex items-center justify-center shadow-2xl mx-auto'
                      }
                    >
                      <video
                        ref={setScreenVideoElement}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-transparent backdrop-blur-md border border-primary/35 text-sm font-bold text-primary flex items-center gap-1.5">
                        <Monitor size={14} />
                        <span className="hidden sm:inline">
                          {screenShareMode === 'browser'
                            ? 'Браузер'
                            : screenShareMode === 'region'
                            ? 'Область'
                            : 'Экран'}
                        </span>
                      </div>

                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        <BubbleElement
                          size="sm"
                          onClick={() => setIsScreenPickerOpen(true)}
                          icon={<Monitor size={14} />}
                          title="Сменить источник демонстрации экрана"
                          className="!px-2 !py-1"
                        />
                        <BubbleElement
                          size="sm"
                          active
                          onClick={handleScreenShareButtonClick}
                          icon={<MonitorOff size={14} />}
                          title="Остановить демонстрацию экрана"
                          className="!px-2 !py-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Participant Webcams Strip alongside / below screen share in the same window */}
                  <div
                    className={
                      isChatOpen
                        ? 'flex-1 flex flex-row gap-2 overflow-x-auto items-stretch'
                        : 'h-32 sm:h-36 landscape:w-44 landscape:h-full lg:w-full lg:h-36 flex flex-row landscape:flex-col lg:flex-row gap-2.5 overflow-x-auto landscape:overflow-y-auto shrink-0 justify-center'
                    }
                  >
                    <div className="w-28 sm:w-56 landscape:w-full lg:w-60 h-full shrink-0">
                      <CameraTile
                        videoRef={localVideoRef}
                        stream={localStream || localStreamRef.current}
                        displayName={currentUser.display_name || 'Вы'}
                        avatarUrl={currentUser.avatar_url}
                        isCameraOn={isCameraOn}
                        isMicOn={isMicOn}
                        isLocal={true}
                        compact={isChatOpen}
                      />
                    </div>

                    {visibleRemoteMembers.map((m, idx) => {
                      const isSelf2 = String(m.user_id) === `${currentUser.uid}_self2` || String(m.user_id).endsWith('_self2');
                      return (
                        <div
                          key={`remote-member-strip-${m.user_id || m.id}-${idx}`}
                          className="w-28 sm:w-56 landscape:w-full lg:w-60 h-full shrink-0"
                        >
                          <CameraTile
                            stream={isSelf2 ? (localStream || localStreamRef.current) : undefined}
                            displayName={m.display_name}
                            avatarUrl={m.avatar_url || (isSelf2 ? currentUser.avatar_url : undefined)}
                            isCameraOn={isSelf2 ? isCameraOn : m.is_camera_on === 1}
                            isMicOn={isSelf2 ? isMicOn : m.is_mic_on === 1}
                            isScreenSharing={m.is_screen_sharing === 1}
                            isLocal={isSelf2}
                            compact={isChatOpen}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
                  {/* Zoom-style adaptive participant grid: Horizontal widescreen on PC & Fullscreen preserving screen aspect ratio */}
                  <div
                    style={!isMobileViewport ? { containerType: 'size' } : undefined}
                    className={
                      isChatOpen
                        ? `h-full flex flex-row lg:grid ${
                            1 + visibleRemoteMembers.length === 1 ? 'lg:grid-cols-1' : 'lg:grid-cols-2'
                          } gap-2.5 overflow-x-auto lg:overflow-y-auto items-stretch lg:items-center lg:content-center`
                        : !isMobileViewport && 1 + visibleRemoteMembers.length === 1
                        ? 'flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden'
                        : `flex-1 min-h-0 grid gap-2.5 sm:gap-3 ${
                            isMobileViewport ? 'auto-rows-fr' : 'items-center content-center'
                          } overflow-hidden ${
                            1 + visibleRemoteMembers.length === 1
                              ? 'grid-cols-1 w-full'
                              : 1 + visibleRemoteMembers.length === 2
                              ? 'grid-cols-1 landscape:grid-cols-2 sm:grid-cols-2'
                              : 1 + visibleRemoteMembers.length <= 4
                              ? 'grid-cols-2'
                              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
                          }`
                    }
                  >
                    {/* Local user tile — stays mounted in DOM whether in Video or Chat mode; strictly horizontal on PC & Fullscreen */}
                    <div
                      style={
                        !isMobileViewport
                          ? !isChatOpen && 1 + visibleRemoteMembers.length === 1
                            ? {
                                aspectRatio: pcScreenAspect,
                                width: `min(100cqw, calc(100cqh * ${pcAspectNumeric}))`
                              }
                            : {
                                aspectRatio: pcScreenAspect
                              }
                          : undefined
                      }
                      className={
                        isChatOpen
                          ? 'w-28 sm:w-48 lg:w-full h-full lg:h-auto shrink-0 mx-auto'
                          : !isMobileViewport
                          ? 'w-full max-h-full mx-auto'
                          : 'w-full h-full min-h-0'
                      }
                    >
                      <CameraTile
                        videoRef={localVideoRef}
                        stream={localStream || localStreamRef.current}
                        displayName={currentUser.display_name || 'Вы'}
                        avatarUrl={currentUser.avatar_url}
                        isCameraOn={isCameraOn}
                        isMicOn={isMicOn}
                        isLocal={true}
                        compact={isChatOpen}
                      />
                    </div>

                    {/* Other Room Members */}
                    {visibleRemoteMembers.map((m, idx) => {
                      const isSelf2 = String(m.user_id) === `${currentUser.uid}_self2` || String(m.user_id).endsWith('_self2');
                      return (
                        <div
                          key={`remote-member-grid-${m.user_id || m.id}-${idx}`}
                          style={
                            !isMobileViewport
                              ? {
                                  aspectRatio: pcScreenAspect
                                }
                              : undefined
                          }
                          className={
                            isChatOpen
                              ? 'w-28 sm:w-48 lg:w-full h-full lg:h-auto shrink-0 mx-auto'
                              : !isMobileViewport
                              ? 'w-full max-h-full mx-auto'
                              : 'w-full h-full min-h-0'
                          }
                        >
                          <CameraTile
                            stream={isSelf2 ? (localStream || localStreamRef.current) : undefined}
                            displayName={m.display_name}
                            avatarUrl={m.avatar_url || (isSelf2 ? currentUser.avatar_url : undefined)}
                            isCameraOn={isSelf2 ? isCameraOn : m.is_camera_on === 1}
                            isMicOn={isSelf2 ? isMicOn : m.is_mic_on === 1}
                            isScreenSharing={m.is_screen_sharing === 1}
                            isLocal={isSelf2}
                            compact={isChatOpen}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Compact Waiting / Invite Bar (fits cleanly without causing mobile scroll) */}
                  {!isChatOpen && (1 + visibleRemoteMembers.length) < effectiveMaxPlayers && (
                    <div className="w-full rounded-2xl border border-dashed border-primary/35 bg-transparent backdrop-blur-xl px-3.5 py-2.5 flex items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl border border-primary/35 bg-transparent flex items-center justify-center text-primary shrink-0">
                          <Users size={16} />
                        </div>
                        <p className="text-sm font-bold text-foreground truncate">
                          Ожидание ({Math.min(effectiveMaxPlayers, 1 + visibleRemoteMembers.length)}/{effectiveMaxPlayers})
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <LeafButton
                          variant="primary"
                          size="sm"
                          onClick={() => setIsInviteModalOpen(true)}
                          icon={<Share2 size={15} />}
                          title="Пригласить друзей"
                          className="!px-2.5 !py-1.5"
                        />
                        {realOtherMembers.length === 0 && (
                          <LeafButton
                            variant={isSelfSecondJoined ? 'primary' : 'glass'}
                            size="sm"
                            onClick={handleToggleSelfSecond}
                            disabled={addingSelfSecond}
                            icon={isSelfSecondJoined ? <UserCheck size={15} /> : <UserPlus size={15} />}
                            title={isSelfSecondJoined ? 'Убрать 2-го участника' : 'Добавить себя 2-м участником'}
                            className="!px-2.5 !py-1.5"
                          />
                        )}
                        <LeafButton
                          variant="glass"
                          size="sm"
                          onClick={copyRoomInvite}
                          icon={copiedLink ? <Check size={14} /> : <Copy size={14} />}
                          title={copiedLink ? 'Ссылка скопирована' : 'Скопировать ссылку'}
                          className="!px-2.5 !py-1.5"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Group Chat Panel — expands below the live camera strip on mobile or to the right on PC */}
            {isChatOpen && (
              <div className="flex-1 lg:flex-initial w-full lg:w-80 xl:w-96 min-h-0 lg:h-full flex flex-col">
                <GameChat
                  compact
                  title="Чат комнаты"
                  messages={chatMessages}
                  onSendMessage={handleSendRoomChatMessage}
                  onClose={() => setIsChatOpen(false)}
                  currentUser={{
                    id: String(currentUser.uid),
                    name: currentUser.display_name || 'Вы',
                    avatar: currentUser.avatar_url
                  }}
                />
              </div>
            )}
          </div>

          {/* Bottom Dock / Controls — Percentage-width icons so all buttons fit 100% of device width */}
          <div className="px-2.5 py-2 sm:px-4 sm:py-3 border-t border-primary/20 bg-transparent backdrop-blur-md flex items-center justify-between gap-1.5 sm:gap-2.5 shrink-0 w-full">
            <BubbleElement
              active={isMicOn}
              size="md"
              onClick={toggleMic}
              icon={isMicOn ? <Mic size={18} /> : <MicOff size={18} className="text-red-400" />}
              title={isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
              className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-4 !py-2 sm:!py-2.5"
            />

            <BubbleElement
              active={isCameraOn}
              size="md"
              onClick={toggleCamera}
              icon={isCameraOn ? <Video size={18} /> : <VideoOff size={18} className="text-red-400" />}
              title={isCameraOn ? 'Выключить камеру' : 'Включить камеру'}
              className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-4 !py-2 sm:!py-2.5"
            />

            <BubbleElement
              active={isScreenSharing}
              size="md"
              onClick={handleScreenShareButtonClick}
              icon={isScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
              title={isScreenSharing ? 'Остановить демонстрацию экрана' : 'Демонстрация экрана'}
              className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-4 !py-2 sm:!py-2.5"
            />

            {/* Chat Toggle Icon with Unread Counter Badge */}
            <div className="relative flex-1 sm:flex-initial min-w-0 flex">
              <BubbleElement
                active={isChatOpen}
                size="md"
                onClick={() => setIsChatOpen((prev) => !prev)}
                icon={<MessageSquare size={18} />}
                title={isChatOpen ? 'Вернуться в видео-режим' : 'Открыть чат комнаты'}
                className="w-full justify-center !px-0 sm:!px-4 !py-2 sm:!py-2.5"
              />
              {unreadChatCount > 0 && !isChatOpen && (
                <span className="pointer-events-none absolute -top-1.5 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-primary text-background text-sm font-black flex items-center justify-center shadow-[0_0_10px_rgba(153,208,55,0.9)]">
                  {unreadChatCount}
                </span>
              )}
            </div>

            <BubbleElement
              active={isInviteModalOpen}
              size="md"
              onClick={() => setIsInviteModalOpen(true)}
              icon={<Share2 size={18} />}
              title="Пригласить участников"
              className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-4 !py-2 sm:!py-2.5"
            />

            {isRecording ? (
              <>
                <BubbleElement
                  active={isRecordingPaused}
                  size="md"
                  onClick={togglePauseRecording}
                  icon={isRecordingPaused ? <Play size={18} className="text-primary" /> : <Pause size={18} className="text-amber-300" />}
                  title={isRecordingPaused ? 'Продолжить запись' : 'Пауза записи'}
                  className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-4 !py-2 sm:!py-2.5"
                />
                <BubbleElement
                  active
                  size="md"
                  onClick={stopRecording}
                  icon={<Square size={18} className="text-red-500 animate-pulse" />}
                  title={`Остановить запись (${recordingSeconds}с)`}
                  className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-4 !py-2 sm:!py-2.5"
                />
              </>
            ) : (
              <BubbleElement
                size="md"
                onClick={startRecording}
                icon={<CircleDot size={18} className="text-red-400" />}
                title="Запись экрана и звука"
                className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-4 !py-2 sm:!py-2.5"
              />
            )}

            {recordingUrl && (
              <BubbleElement
                active
                size="md"
                onClick={downloadRecording}
                icon={<Download size={18} />}
                title="Скачать сохраненную видеозапись экрана"
                className="flex-1 sm:flex-initial min-w-0 justify-center !px-0 sm:!px-4 !py-2 sm:!py-2.5"
              />
            )}
          </div>

          {/* Screen Share Mode Picker Modal (кнопки выбора — иконки-пузыри без текста, описание по всей ширине) */}
          {isScreenPickerOpen && (
            <div className="fixed inset-0 z-[10005] flex items-center justify-center p-3 sm:p-4 bg-transparent backdrop-blur-2xl animate-in fade-in duration-200">
              <div className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-3xl border border-primary/35 bg-transparent backdrop-blur-3xl shadow-2xl p-4 sm:p-6 gap-4 overflow-y-auto">
                <div className="flex flex-col gap-2 border-b border-primary/20 pb-3 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-9 h-9 rounded-2xl bg-primary/20 border border-primary/35 flex items-center justify-center text-primary shrink-0">
                      <Monitor size={18} />
                    </div>
                    <BubbleElement
                      size="sm"
                      onClick={() => setIsScreenPickerOpen(false)}
                      icon={<X size={16} />}
                      title="Закрыть"
                    />
                  </div>
                  <div className="w-full">
                    <h3 className="text-base sm:text-lg font-bold text-foreground">
                      Выберите режим демонстрации экрана
                    </h3>
                    <p className="text-sm text-foreground/65">
                      Что вы хотите транслировать участникам комнаты
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {/* 1. Браузер */}
                  <div
                    onClick={() => startScreenShareWithMode('browser')}
                    className="p-3.5 sm:p-4 rounded-2xl border border-primary/30 bg-transparent hover:border-primary/60 backdrop-blur-xl cursor-pointer transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-3 w-full">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/35 flex items-center justify-center text-primary shrink-0">
                          <Globe size={20} />
                        </div>
                        <p className="text-base font-bold text-foreground truncate">Браузер</p>
                      </div>
                      <BubbleElement
                        size="sm"
                        active
                        icon={<Play size={16} />}
                        title="Выбрать трансляцию браузера"
                        className="shrink-0 !px-3 !py-2"
                      />
                    </div>
                    <p className="text-sm text-foreground/75 w-full leading-snug">
                      Трансляция вкладки браузера и окна игры
                    </p>
                  </div>

                  {/* 2. Область */}
                  <div
                    onClick={() => {
                      setIsScreenPickerOpen(false);
                      setIsRegionSelectorOpen(true);
                    }}
                    className="p-3.5 sm:p-4 rounded-2xl border border-primary/30 bg-transparent hover:border-primary/60 backdrop-blur-xl cursor-pointer transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-3 w-full">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/35 flex items-center justify-center text-primary shrink-0">
                          <Crop size={20} />
                        </div>
                        <p className="text-base font-bold text-foreground truncate">Область экрана</p>
                      </div>
                      <BubbleElement
                        size="sm"
                        active
                        icon={<Crop size={16} />}
                        title="Настроить область экрана"
                        className="shrink-0 !px-3 !py-2"
                      />
                    </div>
                    <p className="text-sm text-foreground/75 w-full leading-snug">
                      Выделить конкретную зону или окно для показа
                    </p>
                  </div>

                  {/* 3. Весь экран */}
                  <div
                    onClick={() => startScreenShareWithMode('monitor')}
                    className="p-3.5 sm:p-4 rounded-2xl border border-primary/30 bg-transparent hover:border-primary/60 backdrop-blur-xl cursor-pointer transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-3 w-full">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/35 flex items-center justify-center text-primary shrink-0">
                          <Maximize size={20} />
                        </div>
                        <p className="text-base font-bold text-foreground truncate">Весь экран</p>
                      </div>
                      <BubbleElement
                        size="sm"
                        active
                        icon={<Play size={16} />}
                        title="Выбрать весь экран"
                        className="shrink-0 !px-3 !py-2"
                      />
                    </div>
                    <p className="text-sm text-foreground/75 w-full leading-snug">
                      Полный захват всего экрана вашего устройства
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Region Selector Modal — Vertical portrait preview on Mobile, Horizontal widescreen on Desktop */}
          {isRegionSelectorOpen && (
            <div className="fixed inset-0 z-[10006] flex items-center justify-center p-2.5 sm:p-4 bg-transparent backdrop-blur-2xl animate-in fade-in duration-200">
              <div className="w-full max-w-xl max-h-[94dvh] flex flex-col rounded-3xl border border-primary/35 bg-transparent backdrop-blur-3xl shadow-2xl p-4 sm:p-6 gap-3.5 overflow-hidden">
                {/* Header */}
                <div className="flex flex-col gap-2 border-b border-primary/20 pb-2.5 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-2xl bg-primary/20 border border-primary/35 flex items-center justify-center text-primary shrink-0">
                        <Crop size={18} />
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-foreground truncate">
                        Выбор области экрана
                      </h3>
                    </div>
                    <BubbleElement
                      size="sm"
                      onClick={() => setIsRegionSelectorOpen(false)}
                      icon={<X size={16} />}
                      title="Закрыть"
                    />
                  </div>
                  <p className="text-sm text-foreground/65 w-full">
                    Укажите зону экрана, которую будут видеть участники
                  </p>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 pr-0.5">
                  {/* Interactive visual preview of region: Portrait 9:16 on Mobile, Horizontal screen aspect ratio on PC */}
                  <div className="flex flex-col items-center gap-1.5 w-full">
                    <span className="text-sm font-semibold text-foreground/70 text-center">
                      Выбранная зона: <span className="text-primary font-bold">{regionRect.w}% × {regionRect.h}%</span>
                    </span>
                    <div
                      style={
                        isMobileViewport
                          ? { aspectRatio: '9 / 16', height: '11rem' }
                          : { aspectRatio: pcScreenAspect, width: '100%', maxWidth: '24rem' }
                      }
                      className="relative rounded-2xl border border-primary/30 bg-transparent overflow-hidden mx-auto"
                    >
                      <div
                        className="absolute border-2 border-primary bg-primary/15 rounded-xl flex items-center justify-center text-sm font-bold text-primary transition-all shadow-lg p-1 text-center"
                        style={{
                          left: `${regionRect.x}%`,
                          top: `${regionRect.y}%`,
                          width: `${regionRect.w}%`,
                          height: `${regionRect.h}%`
                        }}
                      >
                        {regionRect.w}% × {regionRect.h}%
                      </div>
                    </div>
                  </div>

                  {/* Preset region buttons (Vertical-aware for mobile + horizontal for desktop) */}
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 sm:gap-2">
                    <BubbleElement
                      size="sm"
                      active={regionRect.x === 0 && regionRect.y === 0 && regionRect.w === 100 && regionRect.h === 100}
                      onClick={() => setRegionRect({ x: 0, y: 0, w: 100, h: 100 })}
                      className="justify-center text-center"
                    >
                      Весь (100%)
                    </BubbleElement>
                    <BubbleElement
                      size="sm"
                      active={regionRect.x === 10 && regionRect.w === 80 && regionRect.h === 80}
                      onClick={() => setRegionRect({ x: 10, y: 10, w: 80, h: 80 })}
                      className="justify-center text-center"
                    >
                      Центр (80%)
                    </BubbleElement>
                    <BubbleElement
                      size="sm"
                      active={regionRect.y === 0 && regionRect.h === 50 && regionRect.w === 100}
                      onClick={() => setRegionRect({ x: 0, y: 0, w: 100, h: 50 })}
                      className="justify-center text-center"
                    >
                      Верхняя 50%
                    </BubbleElement>
                    <BubbleElement
                      size="sm"
                      active={regionRect.y === 50 && regionRect.h === 50 && regionRect.w === 100}
                      onClick={() => setRegionRect({ x: 0, y: 50, w: 100, h: 50 })}
                      className="justify-center text-center"
                    >
                      Нижняя 50%
                    </BubbleElement>
                    <BubbleElement
                      size="sm"
                      active={regionRect.x === 0 && regionRect.w === 50 && regionRect.h === 100}
                      onClick={() => setRegionRect({ x: 0, y: 0, w: 50, h: 100 })}
                      className="justify-center text-center"
                    >
                      Левая 50%
                    </BubbleElement>
                    <BubbleElement
                      size="sm"
                      active={regionRect.x === 50 && regionRect.w === 50 && regionRect.h === 100}
                      onClick={() => setRegionRect({ x: 50, y: 0, w: 50, h: 100 })}
                      className="justify-center text-center"
                    >
                      Правая 50%
                    </BubbleElement>
                  </div>

                  {/* Sliders for fine-tuning */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1">
                      <span className="text-foreground/75 font-medium block">Ширина области: {regionRect.w}%</span>
                      <input
                        type="range"
                        min={30}
                        max={100}
                        value={regionRect.w}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          setRegionRect((prev) => ({ ...prev, w, x: Math.min(prev.x, 100 - w) }));
                        }}
                        className="w-full accent-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-foreground/75 font-medium block">Высота области: {regionRect.h}%</span>
                      <input
                        type="range"
                        min={30}
                        max={100}
                        value={regionRect.h}
                        onChange={(e) => {
                          const h = Number(e.target.value);
                          setRegionRect((prev) => ({ ...prev, h, y: Math.min(prev.y, 100 - h) }));
                        }}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between sm:justify-end gap-2 pt-2.5 border-t border-primary/20 shrink-0">
                  <BubbleElement
                    size="sm"
                    onClick={() => setIsRegionSelectorOpen(false)}
                    icon={<X size={15} />}
                    title="Отмена"
                  >
                    Отмена
                  </BubbleElement>
                  <LeafButton
                    variant="primary"
                    size="sm"
                    onClick={() => startScreenShareWithMode('region', regionRect)}
                    icon={<Monitor size={15} />}
                  >
                    Показать область
                  </LeafButton>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Device Settings Modal */}
        <DeviceSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          userId={currentUser.uid}
          currentSettings={deviceSettings}
          onSaveSettings={(newSettings) => {
            setDeviceSettings(newSettings);
            initLocalMedia(newSettings);
          }}
        />

        {/* Invite Friends Modal */}
        <VideoInviteModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          currentUser={{
            uid: currentUser.uid,
            display_name: currentUser.display_name
          }}
          roomId={roomId}
          roomTitle={roomTitle}
          roomType={roomType}
          gameId={gameId}
          onSelfJoined={pingAndFetch}
        />
      </div>
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};
