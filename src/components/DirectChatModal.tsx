import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Send, 
  Gamepad2, 
  Loader2, 
  Sparkles, 
  Check, 
  CheckCheck, 
  User, 
  ExternalLink,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Download,
  Play,
  Pause,
  Mic,
  Trash2,
  Video,
  AlertCircle
} from 'lucide-react';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { VoiceInputBubble } from './ui/VoiceInputBubble';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { getUploadService } from '../services/FileUploadService';
import { useNavigate, Link } from 'react-router-dom';
import { ZoomVideoModal } from './ZoomVideoModal';
import { audioSystem } from '../hooks/useSound';

export interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  game_invite?: string | null;
  media_url?: string | null;
  media_type?: 'audio' | 'image' | 'video' | 'file' | string | null;
  file_name?: string | null;
  file_size?: number | null;
  is_read: number;
  created_at: string;
}

interface DirectChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserUid: string;
  currentUserAvatar?: string | null;
  targetUser: {
    uid: string;
    display_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    photo_url?: string | null;
    telegram_photo?: string | null;
    is_online?: number | boolean;
  };
}

interface PendingAttachment {
  url: string;
  previewUrl?: string;
  type: 'audio' | 'image' | 'video' | 'file' | string;
  name: string;
  size?: number;
  transcript?: string;
}

interface UploadPreviewState {
  file: File;
  previewUrl: string;
  type: 'image' | 'video' | 'audio' | 'file';
  name: string;
  size: number;
}

const GAME_INVITE_OPTIONS = [
  { id: 'blitz', title: 'КвИИз', path: '/?start_game=blitz&mode=multi' },
  { id: '100to1', title: 'Сто Квадному', path: '/?start_game=100to1&mode=multi' },
  { id: 'jeopardy', title: 'Своя Икра', path: '/?start_game=jeopardy&mode=multi' }
];

export const DirectChatModal: React.FC<DirectChatModalProps> = ({
  isOpen,
  onClose,
  currentUserUid,
  currentUserAvatar,
  targetUser
}) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingAttachment | null>(null);
  const [uploadPreview, setUploadPreview] = useState<UploadPreviewState | null>(null);
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomRoomId, setZoomRoomId] = useState('');

  const [liveTargetUser, setLiveTargetUser] = useState(targetUser);
  const [myAvatar, setMyAvatar] = useState<string | null>(currentUserAvatar || null);

  const handleStartVideoCall = async () => {
    // Generate unique video room ID so each call is registered in DB
    const roomId = `vroom_chat_${currentUserUid}_${targetUser.uid}_${Date.now().toString(36)}`;
    const roomTitle = `Видеочат: ${liveTargetUser.display_name || liveTargetUser.username || 'Друг'}`;
    setZoomRoomId(roomId);

    try {
      await fetch('/api/zoom/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: roomId,
          title: roomTitle,
          room_type: 'chat',
          host_id: currentUserUid,
          target_id: targetUser.uid
        })
      });
    } catch (_) {}

    // Send invitation message in chat (bypasses moderation via is_invite: true, no raw URL link)
    try {
      const payload = {
        userId: currentUserUid,
        sender_id: currentUserUid,
        receiver_id: targetUser.uid,
        message: 'Создан видеозвонок',
        is_invite: true,
        game_invite: {
          is_video_call: true,
          room_id: roomId,
          type: 'chat',
          title: roomTitle
        }
      };

      let res = await fetch(`/api/messages/${targetUser.uid}`, {
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
      fetchMessages();
    } catch (_) {}

    setIsZoomOpen(true);
  };

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const initialScrollDoneRef = useRef(false);

  useEffect(() => {
    setLiveTargetUser(targetUser);
  }, [targetUser]);

  useEffect(() => {
    if (!isOpen) return;
    // Fetch target user latest profile to get fresh avatar
    if (targetUser.uid) {
      fetch(`/api/users/public/${encodeURIComponent(targetUser.uid)}`)
        .then(r => r.ok ? r.json() : null)
        .then(res => {
          if (res?.data) {
            setLiveTargetUser(prev => ({
              ...prev,
              ...res.data,
              avatar_url: res.data.avatar_url || res.data.photo_url || res.data.telegram_photo,
              photo_url: res.data.photo_url,
              telegram_photo: res.data.telegram_photo
            }));
          }
        })
        .catch(() => {});
    }
    // If currentUserAvatar not passed, fetch current user's profile
    if (!currentUserAvatar && currentUserUid) {
      fetch(`/api/users/public/${encodeURIComponent(currentUserUid)}`)
        .then(r => r.ok ? r.json() : null)
        .then(res => {
          if (res?.data) {
            setMyAvatar(res.data.avatar_url || res.data.photo_url || res.data.telegram_photo || null);
          }
        })
        .catch(() => {});
    } else if (currentUserAvatar) {
      setMyAvatar(currentUserAvatar);
    }
  }, [isOpen, targetUser.uid, currentUserUid, currentUserAvatar]);

  const targetName = liveTargetUser.display_name || liveTargetUser.username || `Игрок ${liveTargetUser.uid}`;
  const targetAvatar = liveTargetUser.avatar_url || liveTargetUser.photo_url || liveTargetUser.telegram_photo;
  const isTargetOnline = Boolean(liveTargetUser.is_online);

  // Cleanup upload preview URL
  useEffect(() => {
    return () => {
      if (uploadPreview?.previewUrl) {
        URL.revokeObjectURL(uploadPreview.previewUrl);
      }
      if (uploadAbortControllerRef.current) {
        uploadAbortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCancelUpload = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }
    if (uploadPreview?.previewUrl) {
      URL.revokeObjectURL(uploadPreview.previewUrl);
    }
    setUploadPreview(null);
    setUploadingFile(false);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const prevMsgsLenRef = useRef<number>(0);

  const fetchMessages = async (isInitial = false) => {
    if (!currentUserUid || !targetUser.uid) return;
    try {
      let res = await fetch(`/api/messages/${targetUser.uid}?userId=${currentUserUid}`);
      if (!res.ok) {
        res = await fetch(`/api/friends/messages/${targetUser.uid}?userId=${currentUserUid}`);
      }
      if (res.ok) {
        const json = await res.json();
        const newMsgs: DirectMessage[] = json.data || [];
        if (!isInitial && newMsgs.length > prevMsgsLenRef.current) {
          const latestMsg = newMsgs[newMsgs.length - 1];
          if (latestMsg && String(latestMsg.sender_id) !== String(currentUserUid)) {
            audioSystem.playSlot('ui_direct_msg_receive');
          }
        }
        prevMsgsLenRef.current = newMsgs.length;
        setMessages(newMsgs);
        if (isInitial) {
          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
          }, 60);
        }
      }
    } catch (e) {
      console.error('Failed to fetch messages:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      initialScrollDoneRef.current = false;
      return;
    }
    setLoading(true);
    fetchMessages(true);
    const interval = setInterval(() => fetchMessages(false), 3500);
    return () => clearInterval(interval);
  }, [isOpen, currentUserUid, targetUser.uid]);

  // Initial scroll to bottom once messages load for the first time
  useEffect(() => {
    if (isOpen && messages.length > 0 && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }
  }, [messages, isOpen]);

  // Upload file to file gallery via FileUploadService with miniature preview & cancel support
  const handleUploadFile = async (file: File) => {
    if (!file) return;

    // Create local preview URL immediately for miniature preview
    const previewUrl = URL.createObjectURL(file);
    const mimeType = file.type || '';
    let mediaType: 'image' | 'video' | 'audio' | 'file' = 'file';
    if (mimeType.startsWith('image/')) {
      mediaType = 'image';
    } else if (mimeType.startsWith('video/')) {
      mediaType = 'video';
    } else if (mimeType.startsWith('audio/')) {
      mediaType = 'audio';
    }

    const previewState: UploadPreviewState = {
      file,
      previewUrl,
      type: mediaType,
      name: file.name,
      size: file.size
    };

    setUploadPreview(previewState);
    setUploadingFile(true);
    setUploadError(null);

    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;

    try {
      const uploadService = getUploadService();
      const result = await uploadService.uploadAndStore(
        file,
        'chat_media',
        undefined,
        currentUserUid,
        controller.signal
      );

      const fileUrl = result.directUrl || result.url;

      setPendingMedia({
        url: fileUrl,
        previewUrl,
        type: mediaType,
        name: file.name,
        size: file.size
      });
      setUploadPreview(null);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('отменена') || err?.message?.includes('aborted')) {
        console.log('File upload was canceled by user');
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setUploadPreview(null);
        return;
      }
      console.error('File upload error:', err);
      setUploadError('Не удалось загрузить файл. Попробуйте снова.');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setUploadPreview(null);
    } finally {
      setUploadingFile(false);
      uploadAbortControllerRef.current = null;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Drag & drop support
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleUploadFile(files[0]);
    }
  };

  // Clipboard paste support (screenshots and files)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleUploadFile(file);
          break;
        }
      }
    }
  };

  const handleSend = async (customGameInvite?: { gameId: string; gameTitle: string; gamePath: string }) => {
    const textToSend = inputText.trim();
    if (!textToSend && !customGameInvite && !pendingMedia) return;
    if (sending) return;

    setSending(true);
    try {
      let defaultMsg = textToSend;
      if (!defaultMsg) {
        if (customGameInvite) {
          defaultMsg = `Приглашаю сыграть в игру «${customGameInvite.gameTitle}»!`;
        } else if (pendingMedia?.type === 'audio') {
          defaultMsg = pendingMedia.transcript || '';
        }
      }

      const payload: any = {
        userId: currentUserUid,
        message: defaultMsg
      };

      if (customGameInvite) {
        payload.game_invite = customGameInvite;
      }

      if (pendingMedia) {
        payload.media_url = pendingMedia.url;
        payload.media_type = pendingMedia.type;
        payload.file_name = pendingMedia.name;
        payload.file_size = pendingMedia.size;
      }

      let res = await fetch(`/api/messages/${targetUser.uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        res = await fetch(`/api/friends/messages/${targetUser.uid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        if (customGameInvite) {
          audioSystem.playSlot('ui_friend_request');
        } else {
          audioSystem.playSlot('ui_direct_msg_send');
        }
        setModerationError(null);
        setInputText('');
        if (pendingMedia?.previewUrl) {
          try {
            URL.revokeObjectURL(pendingMedia.previewUrl);
          } catch (_) {}
        }
        setPendingMedia(null);
        setShowGamePicker(false);
        await fetchMessages(false);
        // Scroll to bottom when user sends a new message
        setTimeout(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        }, 50);
      } else {
        const errData = await res.json().catch(() => null);
        const errMsg = errData?.error || errData?.moderation_reason || 'Сообщение отклонено ИИ-модератором';
        audioSystem.playSlot('mp_chat_ai_moderated');
        setModerationError(errMsg);
      }
    } catch (e: any) {
      audioSystem.playSlot('ui_error_alert');
      setModerationError(e?.message || 'Ошибка отправки сообщения');
    } finally {
      setSending(false);
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-transparent backdrop-blur-2xl"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div 
        className="w-full max-w-2xl h-[88vh] max-h-[720px] flex flex-col rounded-3xl border border-primary/30 bg-transparent backdrop-blur-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative"
        onPaste={handlePaste}
      >
        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-40 bg-background/85 backdrop-blur-2xl flex flex-col items-center justify-center p-6 border-2 border-dashed border-primary animate-in fade-in duration-150">
            <div className="p-4 rounded-3xl bg-primary/15 text-primary border border-primary/30 mb-3 animate-bounce">
              <Paperclip size={36} />
            </div>
            <p className="text-base font-bold text-foreground">
              Отпустите файл для загрузки
            </p>
            <p className="text-sm text-foreground/60 text-center max-w-xs mt-1">
              Файл сохранится в галерею и прикрепится к сообщению
            </p>
          </div>
        )}

        {/* Header: Mobile = Row 1 icons, Row 2 user name & status; Desktop = single row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-primary/20 bg-transparent backdrop-blur-md shrink-0">
          {/* Row 1 on Mobile (Right side on Desktop): Avatar on mobile + Action Icons */}
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto sm:order-2 shrink-0">
            <Link
              to={`/profile${targetUser.uid}`}
              className="relative group shrink-0 sm:hidden transition-transform active:scale-95 focus:outline-none"
              title={`Перейти в профиль: ${targetName}`}
            >
              <div className="w-9 h-9 rounded-2xl overflow-hidden border border-primary/30 bg-primary/10 flex items-center justify-center">
                {targetAvatar ? (
                  <img
                    src={targetAvatar}
                    alt={targetName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <User size={18} className="text-primary/70" />
                )}
              </div>
              {isTargetOnline && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary border-2 border-background"></span>
                </span>
              )}
            </Link>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
              <BubbleElement
                size="sm"
                active={showGamePicker}
                icon={<Gamepad2 size={16} />}
                onClick={() => setShowGamePicker((prev) => !prev)}
                title="Пригласить на игру"
                className="!px-2.5 !py-2"
              />
              <BubbleElement
                size="sm"
                icon={<Video size={16} className="text-primary" />}
                onClick={handleStartVideoCall}
                title="Видеозвонок (Zoom)"
                className="!px-2.5 !py-2"
              />
              <BubbleElement
                size="sm"
                icon={<X size={16} />}
                onClick={onClose}
                title="Закрыть"
                className="!px-2.5 !py-2"
              />
            </div>
          </div>

          {/* Row 2 on Mobile (Left side on Desktop): User Name & Status */}
          <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto sm:order-1">
            <Link 
              to={`/profile${targetUser.uid}`}
              className="hidden sm:block relative group shrink-0 transition-transform active:scale-95 focus:outline-none"
              title={`Перейти в профиль: ${targetName}`}
            >
              <div className="w-12 h-12 rounded-2xl overflow-hidden border border-primary/30 bg-primary/10 flex items-center justify-center group-hover:border-primary group-hover:shadow-[0_0_12px_rgba(202,253,0,0.35)] transition-all">
                {targetAvatar ? (
                  <img 
                    src={targetAvatar} 
                    alt={targetName} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <User size={24} className="text-primary/70 group-hover:text-primary transition-colors" />
                )}
              </div>
              {/* Online indicator */}
              {isTargetOnline && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary border-2 border-background"></span>
                </span>
              )}
            </Link>

            <div className="min-w-0 flex-1">
              <Link 
                to={`/profile${targetUser.uid}`}
                className="text-sm sm:text-base font-bold text-foreground break-words sm:truncate hover:text-primary transition-colors block"
                title={`Перейти в профиль: ${targetName}`}
              >
                {targetName}
              </Link>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-foreground/50 font-mono">
                  UID: {targetUser.uid}
                </span>
                <span className="font-semibold">
                  {isTargetOnline ? (
                    <span className="text-primary">онлайн</span>
                  ) : (
                    <span className="text-foreground/45">не в сети</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Game invite picker opened from the top header (Mobile & PC) */}
        {showGamePicker && (
          <div className="px-4 py-3 border-b border-primary/25 bg-transparent backdrop-blur-2xl space-y-2 shrink-0 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between text-sm text-foreground/85 font-semibold">
              <span className="flex items-center gap-1.5">
                <Gamepad2 size={16} className="text-primary" />
                <span>Пригласить в игру:</span>
              </span>
              <BubbleElement
                size="sm"
                onClick={() => setShowGamePicker(false)}
                icon={<X size={14} />}
                title="Закрыть"
                className="!px-2 !py-1"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {GAME_INVITE_OPTIONS.map((g) => (
                <BubbleElement
                  key={g.id}
                  size="sm"
                  onClick={() => {
                    setShowGamePicker(false);
                    onClose();
                    navigate(g.path);
                  }}
                  className="justify-between w-full"
                  icon={<Play size={14} className="text-primary" />}
                >
                  <span className="truncate">{g.title}</span>
                </BubbleElement>
              ))}
            </div>
          </div>
        )}

        {/* AI Moderation Error Banner */}
        {moderationError && (
          <div className="p-3.5 sm:p-4 bg-transparent border-b border-primary/35 backdrop-blur-xl flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <BubbleElement size="sm" isBadge active className="shrink-0 mt-0.5" icon={<AlertCircle size={16} />}>
                Модерация
              </BubbleElement>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Сообщение отклонено ИИ-модератором
                </p>
                <p className="text-sm text-foreground/80 mt-1 break-words whitespace-normal leading-relaxed">
                  {moderationError}
                </p>
              </div>
            </div>
            <BubbleElement
              size="sm"
              onClick={() => setModerationError(null)}
              title="Закрыть оповещение"
              icon={<X size={16} />}
              className="shrink-0"
            />
          </div>
        )}

        {/* Message history */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5"
        >
          {loading && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-foreground/50 gap-2.5">
              <Loader2 size={32} className="animate-spin text-primary" />
              <span className="text-sm font-medium">Загрузка сообщений...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-foreground/40 text-center px-4 space-y-2.5">
              <Sparkles size={40} className="text-primary/45" />
              <p className="text-base font-bold text-foreground">
                Начните диалог с другом
              </p>
              <p className="text-sm text-foreground/60 max-w-sm leading-relaxed">
                Делитесь мыслями, голосовыми сообщениями, скриншотами и файлами. Если игрок не на сайте, ему придет уведомление в Telegram!
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === currentUserUid;
              let parsedInvite: any = null;
              if (msg.game_invite) {
                try {
                  parsedInvite = typeof msg.game_invite === 'string' ? JSON.parse(msg.game_invite) : msg.game_invite;
                } catch (_) {}
              }

              const isAudioMedia =
                msg.media_type === 'audio' ||
                (msg.media_url &&
                  msg.media_type !== 'video' &&
                  (/\.(mp3|wav|ogg|m4a|aac|flac)($|\?)/i.test(msg.media_url) ||
                    (/\.webm($|\?)/i.test(msg.media_url) &&
                      (msg.file_name?.toLowerCase().includes('голос') ||
                        msg.file_name?.toLowerCase().includes('audio') ||
                        msg.media_type === 'audio'))));

              const isVideoMedia =
                !isAudioMedia &&
                (msg.media_type === 'video' ||
                  (msg.media_url && /\.(mp4|mov|mkv|avi)($|\?)/i.test(msg.media_url)) ||
                  (msg.media_url &&
                    /\.webm($|\?)/i.test(msg.media_url) &&
                    msg.media_type !== 'audio' &&
                    !msg.file_name?.toLowerCase().includes('голос') &&
                    !msg.file_name?.toLowerCase().includes('audio')));

              const isImageMedia =
                !isAudioMedia &&
                !isVideoMedia &&
                (msg.media_type === 'image' ||
                  (msg.media_url && /\.(png|jpe?g|gif|webp|svg)($|\?)/i.test(msg.media_url)));

              const isOtherFile = msg.media_url && !isAudioMedia && !isImageMedia && !isVideoMedia;

              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2.5 ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Incoming user avatar */}
                  {!isMine && (
                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-primary/25 bg-background/50 backdrop-blur-md mb-1 shadow-sm">
                      {targetAvatar ? (
                        <img
                          src={targetAvatar}
                          alt={targetName}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-xs text-primary bg-primary/10">
                          {targetName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    className={`max-w-[84%] sm:max-w-[80%] rounded-3xl p-3.5 sm:p-4 text-sm transition-all shadow-sm ${
                      isMine
                        ? 'bg-primary/20 border border-primary/45 text-foreground rounded-br-sm'
                        : 'bg-background/35 border border-primary/20 text-foreground rounded-bl-sm backdrop-blur-xl'
                    }`}
                  >
                    {/* Video call or Game invite card inside message */}
                    {parsedInvite && (() => {
                      const isVideoCallInvite = Boolean(
                        parsedInvite.is_video_call ||
                        parsedInvite.type === 'chat' ||
                        parsedInvite.type === 'general' ||
                        (parsedInvite.room_id && String(parsedInvite.room_id).startsWith('vroom_')) ||
                        (!parsedInvite.gameId && !parsedInvite.game_type && msg.message && msg.message.toLowerCase().includes('видео'))
                      );

                      if (isVideoCallInvite) {
                        return (
                          <div className="mb-3 p-3.5 rounded-2xl border border-primary/35 bg-primary/10 backdrop-blur-xl space-y-2.5">
                            <div className="flex items-center gap-2 text-primary font-bold text-sm">
                              <Video size={16} />
                              <span>Создан видеозвонок</span>
                            </div>
                            <p className="text-sm font-bold text-foreground">
                              {parsedInvite.title || 'Видеочат'}
                            </p>
                            <LeafButton
                              variant="primary"
                              size="sm"
                              className="w-full py-2 text-sm"
                              onClick={() => {
                                const callRoomId = parsedInvite.room_id || `vroom_chat_${currentUserUid}_${targetUser.uid}`;
                                setZoomRoomId(callRoomId);
                                setIsZoomOpen(true);
                              }}
                              icon={<Video size={15} />}
                            >
                              <span>Войти в видеозвонок</span>
                            </LeafButton>
                          </div>
                        );
                      }

                      return (
                        <div className="mb-3 p-3.5 rounded-2xl border border-primary/35 bg-primary/10 backdrop-blur-xl space-y-2.5">
                          <div className="flex items-center gap-2 text-primary font-bold text-sm">
                            <Gamepad2 size={16} />
                            <span>Приглашение в лобби игры</span>
                          </div>
                          <p className="text-sm font-bold text-foreground">
                            {parsedInvite.gameTitle || parsedInvite.game_title || parsedInvite.title || 'Мультиплеерная игра'}
                          </p>
                          <LeafButton
                            variant="primary"
                            size="sm"
                            className="w-full py-2 text-sm"
                            onClick={() => {
                              const targetPath =
                                parsedInvite.gamePath ||
                                (parsedInvite.room_id
                                  ? `/multiplayer/room/${parsedInvite.room_id}`
                                  : `/games/${parsedInvite.gameId || parsedInvite.game_type || 'blitz'}/create?mode=multi`);
                              onClose();
                              navigate(targetPath);
                            }}
                            icon={<Play size={15} />}
                          >
                            <span>Войти в лобби игры</span>
                          </LeafButton>
                        </div>
                      );
                    })()}

                    {/* Audio Player */}
                    {isAudioMedia && msg.media_url && (
                      <div className="mb-2">
                        <VoiceMessagePlayer
                          audioUrl={msg.media_url}
                          transcript={msg.message}
                          isMine={isMine}
                        />
                      </div>
                    )}

                    {/* Video Player */}
                    {isVideoMedia && msg.media_url && (
                      <div className="mb-2.5 space-y-1.5 max-w-sm">
                        <div className="overflow-hidden rounded-2xl border border-primary/30 bg-black/40 shadow-inner">
                          <video
                            src={msg.media_url}
                            controls
                            playsInline
                            preload="metadata"
                            className="w-full max-h-72 object-contain bg-black/40 rounded-2xl"
                          />
                        </div>
                        {msg.file_name && (
                          <div className="flex items-center justify-between text-xs text-foreground/60 px-1">
                            <span className="truncate">{msg.file_name}</span>
                            {msg.file_size ? (
                              <span className="shrink-0 font-mono ml-2">
                                {formatFileSize(msg.file_size)}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Image Attachment */}
                    {isImageMedia && msg.media_url && (
                      <div className="mb-2">
                        <div 
                          onClick={() => setLightboxImage(msg.media_url || null)}
                          className="cursor-pointer overflow-hidden rounded-2xl border border-primary/30 max-h-64 max-w-sm hover:opacity-95 transition-opacity"
                        >
                          <img
                            src={msg.media_url}
                            alt={msg.file_name || 'Изображение'}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>
                    )}

                    {/* Document / Generic File Attachment */}
                    {isOtherFile && msg.media_url && (
                      <div className="mb-2 p-3 rounded-2xl bg-background/30 border border-primary/25 backdrop-blur-md flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-xl bg-primary/15 text-primary shrink-0">
                            <FileText size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">
                              {msg.file_name || 'Файл'}
                            </p>
                            {msg.file_size && (
                              <p className="text-xs text-foreground/50">
                                {formatFileSize(msg.file_size)}
                              </p>
                            )}
                          </div>
                        </div>
                        <a
                          href={msg.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={msg.file_name || true}
                          className="p-2 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary transition-all shrink-0"
                          title="Скачать файл"
                        >
                          <Download size={16} />
                        </a>
                      </div>
                    )}

                    {/* Text message (cleaned of raw /zoom links when invite card is rendered) */}
                    {(!isAudioMedia || !msg.media_url) && msg.message && (() => {
                      const cleanedMsg = parsedInvite
                        ? msg.message.replace(/https?:\/\/[^\s]+\/zoom\?[^\s]+/gi, '').replace(/Присоединяйтесь:\s*$/i, '').trim()
                        : msg.message;
                      if (!cleanedMsg) return null;
                      return (
                        <p className="whitespace-pre-wrap break-words leading-relaxed text-sm">
                          {cleanedMsg}
                        </p>
                      );
                    })()}

                    {/* Time & Read status */}
                    <div className="flex items-center justify-end gap-1.5 mt-1.5 text-xs text-foreground/50 font-mono">
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMine && (
                        msg.is_read ? (
                          <CheckCheck size={14} className="text-primary" />
                        ) : (
                          <Check size={14} className="text-foreground/45" />
                        )
                      )}
                    </div>
                  </div>

                  {/* Outgoing user avatar */}
                  {isMine && (
                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-primary/35 bg-primary/20 backdrop-blur-md mb-1 shadow-sm">
                      {myAvatar ? (
                        <img
                          src={myAvatar}
                          alt="Вы"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-xs text-primary">
                          Я
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Miniature preview during upload with Cancel button */}
        {uploadingFile && uploadPreview && (
          <div className="px-4 py-3 border-t border-primary/20 bg-background/40 backdrop-blur-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-1">
            <div className="flex items-center gap-3 min-w-0">
              {/* Miniature preview thumbnail */}
              <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-primary/30 bg-background/50 shrink-0 flex items-center justify-center">
                {uploadPreview.type === 'image' ? (
                  <img
                    src={uploadPreview.previewUrl}
                    alt="Миниатюра"
                    className="w-full h-full object-cover"
                  />
                ) : uploadPreview.type === 'video' ? (
                  <>
                    <video
                      src={uploadPreview.previewUrl}
                      className="w-full h-full object-cover"
                      muted
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Play size={16} className="text-primary fill-primary" />
                    </div>
                  </>
                ) : (
                  <FileText size={22} className="text-primary" />
                )}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {uploadPreview.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-primary font-medium mt-0.5">
                  <Loader2 size={13} className="animate-spin" />
                  <span>Загрузка... {formatFileSize(uploadPreview.size)}</span>
                </div>
              </div>
            </div>

            {/* Cancel Upload Button */}
            <BubbleElement
              size="sm"
              onClick={handleCancelUpload}
              icon={<X size={14} />}
              className="border-rose-500/30 text-rose-400 hover:bg-rose-500/15 shrink-0 cursor-pointer"
            >
              Отменить
            </BubbleElement>
          </div>
        )}

        {/* Pending attachment preview bar before sending */}
        {pendingMedia && !uploadingFile && (
          <div className="px-4 py-3 border-t border-primary/20 bg-background/40 backdrop-blur-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-1">
            <div className="flex items-center gap-3 min-w-0">
              {/* Miniature preview thumbnail */}
              <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-primary/30 bg-background/50 shrink-0 flex items-center justify-center">
                {pendingMedia.type === 'image' ? (
                  <img
                    src={pendingMedia.previewUrl || pendingMedia.url}
                    alt="Миниатюра"
                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setLightboxImage(pendingMedia.previewUrl || pendingMedia.url)}
                  />
                ) : pendingMedia.type === 'video' ? (
                  <>
                    <video
                      src={pendingMedia.previewUrl || pendingMedia.url}
                      className="w-full h-full object-cover"
                      muted
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                      <Play size={16} className="text-primary fill-primary" />
                    </div>
                  </>
                ) : pendingMedia.type === 'audio' ? (
                  <Mic size={22} className="text-primary" />
                ) : (
                  <FileText size={22} className="text-primary" />
                )}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {pendingMedia.name}
                </p>
                <p className="text-xs text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
                  <Check size={13} />
                  <span>
                    {pendingMedia.type === 'video'
                      ? `Видео готово к отправке (${formatFileSize(pendingMedia.size)})`
                      : pendingMedia.type === 'image'
                      ? `Фото готово к отправке (${formatFileSize(pendingMedia.size)})`
                      : pendingMedia.type === 'audio'
                      ? (pendingMedia.transcript ? `Текст: «${pendingMedia.transcript.slice(0, 35)}...»` : 'Голосовое готово')
                      : `Файл готов к отправке (${formatFileSize(pendingMedia.size)})`}
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (pendingMedia.previewUrl) {
                  try {
                    URL.revokeObjectURL(pendingMedia.previewUrl);
                  } catch (_) {}
                }
                setPendingMedia(null);
              }}
              className="p-2 rounded-xl text-foreground/50 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
              title="Удалить вложение"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}

        {/* Uploading File Spinner without preview fallback */}
        {uploadingFile && !uploadPreview && (
          <div className="px-4 py-2.5 border-t border-primary/20 bg-background/30 backdrop-blur-md flex items-center justify-between gap-2.5 text-xs text-primary font-medium">
            <div className="flex items-center gap-2">
              <Loader2 size={15} className="animate-spin" />
              <span>Загрузка файла в медиа-галерею...</span>
            </div>
            <BubbleElement
              size="sm"
              onClick={handleCancelUpload}
              icon={<X size={14} />}
              className="border-rose-500/30 text-rose-400 hover:bg-rose-500/15 shrink-0 cursor-pointer"
            >
              Отменить
            </BubbleElement>
          </div>
        )}

        {uploadError && (
          <div className="px-4 py-2 border-t border-rose-500/30 bg-rose-500/10 text-xs text-rose-400 font-medium flex items-center justify-between">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="underline ml-2">Скрыть</button>
          </div>
        )}

        {/* Input Bar */}
        <div className="p-3 sm:p-4 border-t border-primary/20 bg-background/30 backdrop-blur-md shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleUploadFile(e.target.files[0]);
                }
              }}
            />

            {/* Attach file button */}
            <BubbleElement
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              icon={<Paperclip size={18} className="text-primary" />}
              title="Прикрепить файл или фото"
              className="shrink-0 !p-2.5"
            />

            {/* Text input */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Напишите сообщение или вставьте скриншот..."
              className="flex-1 min-w-0 px-4 py-2.5 text-sm rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary/60 transition-all"
            />

            {/* Voice Input Bubble */}
            <VoiceInputBubble
              size="md"
              mode="append"
              currentValue={inputText}
              onTranscript={(text) => {
                if (text) {
                  setInputText((prev) => (prev ? `${prev} ${text}` : text));
                }
              }}
              onAudioRecorded={(audioUrl, transcript) => {
                setPendingMedia({
                  url: audioUrl,
                  type: 'audio',
                  name: 'Голосовое сообщение',
                  transcript: transcript || inputText
                });
              }}
            />

            {/* Send button (icon only) */}
            <LeafButton
              variant="primary"
              size="md"
              type="submit"
              disabled={sending || (!inputText.trim() && !pendingMedia && !showGamePicker)}
              icon={sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              title="Отправить сообщение"
              className="shrink-0 !px-3.5"
            />
          </form>
        </div>
      </div>

      {/* Full Size Image Lightbox */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-60 bg-background/90 backdrop-blur-3xl flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-5 right-5 p-3 rounded-full bg-background/40 border border-primary/30 text-foreground hover:bg-primary/20 transition-colors"
            title="Закрыть просмотр"
          >
            <X size={24} />
          </button>
          <img
            src={lightboxImage}
            alt="Просмотр"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl border border-primary/30 shadow-2xl"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {isZoomOpen && (
        <ZoomVideoModal
          isOpen={isZoomOpen}
          onClose={() => setIsZoomOpen(false)}
          currentUser={{
            uid: currentUserUid,
            avatar_url: myAvatar
          }}
          roomId={zoomRoomId}
          roomTitle={`Видеочат: ${liveTargetUser.display_name || liveTargetUser.username || 'Собеседник'}`}
          roomType="chat"
        />
      )}
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
