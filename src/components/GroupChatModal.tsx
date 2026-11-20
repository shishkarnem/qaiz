import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Send,
  Paperclip,
  Mic,
  Users,
  Settings,
  Reply,
  Edit2,
  Trash2,
  ShieldCheck,
  Gamepad2,
  Play,
  Loader2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  CheckCheck,
  Check,
  Share2,
  CornerDownRight,
  ExternalLink,
  ChevronDown,
  Video,
  Archive,
  Lock
} from 'lucide-react';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { UserAvatar } from './UserAvatar';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { VoiceInputBubble } from './ui/VoiceInputBubble';
import { getUploadService } from '../services/FileUploadService';
import {
  groupChatsService,
  GroupChatMessage,
  GroupChatDetails,
} from '../services/groupChats';
import { GroupChatSettingsModal } from './GroupChatSettingsModal';
import { ZoomVideoModal } from './ZoomVideoModal';
import { Link, useNavigate } from 'react-router-dom';
import { audioSystem } from '../hooks/useSound';

interface GroupChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  initialMessageId?: string;
  currentUser: {
    uid: string;
    id?: string;
    display_name?: string;
    username?: string;
    photo_url?: string | null;
    avatar_url?: string | null;
    telegram_photo?: string | null;
  };
  onChatUpdated?: () => void;
}

export const GroupChatModal: React.FC<GroupChatModalProps> = ({
  isOpen,
  onClose,
  chatId,
  initialMessageId,
  currentUser,
  onChatUpdated,
}) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [chatDetails, setChatDetails] = useState<GroupChatDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Reply state
  const [replyingTo, setReplyingTo] = useState<GroupChatMessage | null>(null);

  // Edit state
  const [editingMessage, setEditingMessage] = useState<GroupChatMessage | null>(null);

  // Media upload & preview (unified with DirectChat)
  const [pendingMedia, setPendingMedia] = useState<{
    url: string;
    type: 'image' | 'video' | 'audio' | 'file';
    name: string;
    size?: number;
    transcript?: string;
    previewUrl?: string;
  } | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Game invite modal
  const [showGamePicker, setShowGamePicker] = useState(false);

  // Moderation warning
  const [moderationError, setModerationError] = useState<string | null>(null);

  // Video call state
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomRoomId, setZoomRoomId] = useState('');

  const handleStartGroupVideoCall = async () => {
    const roomId = `vroom_group_${chatId}_${Date.now().toString(36)}`;
    const roomTitle = `Видеокомната: ${chatDetails?.chat.title || 'Беседа'}`;
    setZoomRoomId(roomId);

    try {
      await fetch('/api/zoom/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: roomId,
          title: roomTitle,
          room_type: 'chat',
          host_id: currentUser.uid,
          target_id: chatId
        })
      });
    } catch (_) {}

    // Send invitation message in group chat (bypasses moderation via is_invite: true, no raw link)
    try {
      await groupChatsService.sendGroupMessage(chatId, {
        userId: currentUser.uid,
        message: 'Создан видеозвонок',
        is_invite: true,
        game_invite: {
          is_video_call: true,
          room_id: roomId,
          type: 'chat',
          title: roomTitle
        }
      });
      loadMessagesAndDetails();
    } catch (_) {}

    setIsZoomOpen(true);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  const loadMessagesAndDetails = useCallback(async () => {
    if (!chatId || !currentUser.uid) return;
    try {
      const [msgs, details] = await Promise.all([
        groupChatsService.fetchGroupMessages(chatId, currentUser.uid),
        groupChatsService.fetchGroupChatDetails(chatId, currentUser.uid),
      ]);
      setMessages(msgs);
      setChatDetails(details);
    } catch (err: any) {
      console.warn('Polling error in group chat:', err);
    } finally {
      setLoading(false);
    }
  }, [chatId, currentUser.uid]);

  // Initial load and polling
  useEffect(() => {
    if (!isOpen || !chatId) return;

    setLoading(true);
    loadMessagesAndDetails().then(() => {
      const targetMes = initialMessageId || sessionStorage.getItem('open_chat_mes_id');
      if (targetMes) {
        setTimeout(() => {
          const el = document.getElementById(`chat-msg-${targetMes}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-primary', 'shadow-lg');
            setTimeout(() => {
              el.classList.remove('ring-2', 'ring-primary', 'shadow-lg');
            }, 3000);
            sessionStorage.removeItem('open_chat_mes_id');
          } else {
            scrollToBottom(false);
          }
        }, 250);
      } else {
        setTimeout(() => scrollToBottom(false), 150);
      }
    });

    const interval = setInterval(loadMessagesAndDetails, 3500);
    return () => clearInterval(interval);
  }, [isOpen, chatId, initialMessageId, loadMessagesAndDetails]);

  // Handle media file upload
  const handleUploadFile = async (file: File) => {
    if (!file) return;
    setUploadingMedia(true);
    setModerationError(null);
    try {
      const uploadService = getUploadService();
      const res = await uploadService.uploadAndStore(file, 'chat_media', undefined, currentUser.uid);
      const url = res.directUrl || res.url;
      let mediaType: 'image' | 'video' | 'audio' | 'file' = 'file';
      if (file.type.startsWith('image/')) mediaType = 'image';
      else if (file.type.startsWith('video/')) mediaType = 'video';
      else if (file.type.startsWith('audio/')) mediaType = 'audio';

      let previewUrl = '';
      if (mediaType === 'image' || mediaType === 'video') {
        previewUrl = URL.createObjectURL(file);
      }

      setPendingMedia({
        url,
        type: mediaType,
        name: file.name,
        size: file.size,
        previewUrl: previewUrl || url,
      });
    } catch (uploadErr: any) {
      setModerationError('Не удалось загрузить файл. Попробуйте еще раз.');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files[0]) {
      e.preventDefault();
      handleUploadFile(e.clipboardData.files[0]);
    }
  };

  // Send or Edit message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    setModerationError(null);

    // If in edit mode
    if (editingMessage) {
      const newText = inputValue.trim();
      if (!newText) return;
      setSending(true);
      try {
        await groupChatsService.editGroupMessage(chatId, editingMessage.id, currentUser.uid, newText);
        setEditingMessage(null);
        setInputValue('');
        setModerationError(null);
        await loadMessagesAndDetails();
      } catch (err: any) {
        const isModerated = err.moderated || (err.message && err.message.toLowerCase().includes('модератор'));
        if (isModerated) {
          setModerationError(err.message || 'Отредактированное сообщение отклонено ИИ-модератором');
        } else {
          setModerationError(err.message || 'Ошибка редактирования сообщения');
        }
      } finally {
        setSending(false);
      }
      return;
    }

    // New message
    const cleanText = inputValue.trim();
    if (!cleanText && !pendingMedia) return;

    setSending(true);

    try {
      await groupChatsService.sendGroupMessage(chatId, {
        userId: currentUser.uid,
        message: cleanText || (pendingMedia?.transcript ? pendingMedia.transcript : undefined),
        reply_to_id: replyingTo?.id || null,
        media_url: pendingMedia?.url || undefined,
        media_type: pendingMedia?.type || undefined,
        file_name: pendingMedia?.name || undefined,
        file_size: pendingMedia?.size || undefined,
      });

      audioSystem.playSlot('ui_direct_msg_send');
      setInputValue('');
      setReplyingTo(null);
      setModerationError(null);
      if (pendingMedia?.previewUrl) {
        try {
          URL.revokeObjectURL(pendingMedia.previewUrl);
        } catch (_) {}
      }
      setPendingMedia(null);
      await loadMessagesAndDetails();
      setTimeout(() => scrollToBottom(true), 100);
      if (onChatUpdated) onChatUpdated();
    } catch (err: any) {
      const isModerated = err.moderated || (err.message && err.message.toLowerCase().includes('модератор'));
      if (isModerated) {
        audioSystem.playSlot('mp_chat_ai_moderated');
        setModerationError(err.message || 'Сообщение отклонено ИИ-модератором');
      } else {
        audioSystem.playSlot('ui_error_alert');
        setModerationError(err.message || 'Ошибка отправки сообщения');
      }
    } finally {
      setSending(false);
    }
  };

  // Create multiplayer game and open invite modal after AI generates pack
  const handleSendGameInvite = (gameType: string) => {
    setShowGamePicker(false);
    onClose();
    navigate(`/?start_game=${gameType}&mode=multi`);
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await groupChatsService.deleteGroupMessage(chatId, messageId, currentUser.uid);
      await loadMessagesAndDetails();
    } catch (err: any) {
      setModerationError(err.message || 'Ошибка удаления сообщения');
    }
  };

  const [archiving, setArchiving] = useState(false);

  const handleArchiveChat = async () => {
    if (archiving) return;
    setArchiving(true);
    try {
      await groupChatsService.archiveGroupChat(chatId, currentUser.uid);
      await loadMessagesAndDetails();
      if (onChatUpdated) onChatUpdated();
    } catch (err: any) {
      setModerationError(err.message || 'Не удалось перенести беседу в архив');
    } finally {
      setArchiving(false);
    }
  };

  if (!isOpen) return null;

  const myRole = chatDetails?.myMembership?.role || 'member';
  const isBanned = Boolean(chatDetails?.myMembership?.is_banned);
  const isArchived = Boolean(chatDetails?.chat.is_archived);
  const isOwner =
    myRole === 'owner' ||
    String(chatDetails?.chat.creator_id) === String(currentUser.uid) ||
    (currentUser.id && String(chatDetails?.chat.creator_id) === String(currentUser.id));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-transparent backdrop-blur-2xl animate-in fade-in duration-200">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={`w-full max-w-2xl h-[92vh] max-h-[850px] flex flex-col rounded-3xl border transition-colors relative bg-transparent backdrop-blur-3xl shadow-2xl overflow-hidden ${
          isDragging ? 'border-primary shadow-primary/30' : 'border-primary/30'
        }`}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-md flex flex-col items-center justify-center gap-3 pointer-events-none border-2 border-dashed border-primary">
            <Paperclip size={36} className="text-primary animate-bounce" />
            <span className="text-base font-bold text-primary">Отпустите файл для отправки в беседу</span>
          </div>
        )}
        {/* Chat Header: Mobile = Row 1 icons, Row 2 chat title & participant count; Desktop = single row */}
        <div className="p-3 sm:p-4 border-b border-primary/20 bg-transparent backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0">
          {/* Row 1 on Mobile (Right side on Desktop): Avatar on mobile + Action Icons */}
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto sm:order-2 shrink-0">
            <div className="relative shrink-0 sm:hidden">
              <div className="w-9 h-9 rounded-2xl overflow-hidden border border-primary/40 bg-transparent flex items-center justify-center">
                {chatDetails?.chat.avatar_url ? (
                  <img
                    src={chatDetails.chat.avatar_url}
                    alt="Аватарка группы"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Users size={18} className="text-primary" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 justify-end ml-auto sm:ml-0">
              {isArchived ? (
                <BubbleElement
                  size="sm"
                  isBadge
                  icon={<Archive size={15} className="text-primary" />}
                  title="В архиве"
                  className="border-primary/35 !px-2.5 !py-2"
                />
              ) : (
                <>
                  {!isBanned && (
                    <BubbleElement
                      size="sm"
                      active={showGamePicker}
                      icon={<Gamepad2 size={16} />}
                      onClick={() => setShowGamePicker((prev) => !prev)}
                      className="cursor-pointer border-primary/25 hover:border-primary/40 !px-2.5 !py-2"
                      title="Пригласить на игру"
                    />
                  )}
                  <BubbleElement
                    size="sm"
                    icon={<Video size={16} className="text-primary" />}
                    onClick={handleStartGroupVideoCall}
                    className="cursor-pointer border-primary/25 hover:border-primary/40 !px-2.5 !py-2"
                    title="Видеокомната беседы"
                  />
                  {isOwner && (
                    <BubbleElement
                      size="sm"
                      onClick={handleArchiveChat}
                      icon={archiving ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      className="cursor-pointer border-primary/25 hover:border-primary/45 !px-2.5 !py-2"
                      title="Удалить беседу в архив"
                    />
                  )}
                </>
              )}

              <BubbleElement
                size="sm"
                onClick={() => setIsSettingsOpen(true)}
                icon={<Settings size={16} />}
                className="cursor-pointer border-primary/25 hover:border-primary/40 !px-2.5 !py-2"
                title="Настройки беседы"
              />

              <BubbleElement
                size="sm"
                onClick={onClose}
                icon={<X size={16} />}
                className="cursor-pointer border-primary/20 hover:border-primary/40 !px-2.5 !py-2"
                title="Закрыть"
              />
            </div>
          </div>

          {/* Row 2 on Mobile (Left side on Desktop): Chat Title & Participant Count */}
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto sm:order-1">
            <div className="hidden sm:block relative shrink-0">
              <div className="w-11 h-11 rounded-2xl overflow-hidden border border-primary/40 bg-transparent flex items-center justify-center">
                {chatDetails?.chat.avatar_url ? (
                  <img
                    src={chatDetails.chat.avatar_url}
                    alt="Аватарка группы"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Users size={22} className="text-primary" />
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-sm sm:text-lg font-black text-foreground break-words sm:truncate leading-snug">
                {chatDetails?.chat.title || 'Групповой чат'}
              </h3>
              <div className="flex items-center gap-2 text-sm text-foreground/70 truncate">
                <span>{chatDetails?.members_count || 0} участников</span>
              </div>
            </div>
          </div>
        </div>

        {/* Game Picker Dropdown opened from the top header (Mobile & PC) */}
        {showGamePicker && !isArchived && !isBanned && (
          <div className="px-4 py-3 border-b border-primary/25 bg-transparent backdrop-blur-2xl space-y-2 shrink-0 animate-in fade-in slide-in-from-top-2">
            <div className="text-sm font-semibold text-foreground/85 flex items-center justify-between">
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
              <BubbleElement
                size="sm"
                onClick={() => handleSendGameInvite('blitz')}
                className="cursor-pointer text-sm justify-between w-full"
                icon={<Play size={14} className="text-primary" />}
              >
                <span>КвИИз</span>
              </BubbleElement>
              <BubbleElement
                size="sm"
                onClick={() => handleSendGameInvite('100to1')}
                className="cursor-pointer text-sm justify-between w-full"
                icon={<Play size={14} className="text-primary" />}
              >
                <span>Сто Квадному</span>
              </BubbleElement>
              <BubbleElement
                size="sm"
                onClick={() => handleSendGameInvite('jeopardy')}
                className="cursor-pointer text-sm justify-between w-full"
                icon={<Play size={14} className="text-primary" />}
              >
                <span>Своя Икра</span>
              </BubbleElement>
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

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3.5 text-sm">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-2 text-primary">
              <Loader2 size={28} className="animate-spin" />
              <span className="text-sm">Загрузка сообщений...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-foreground/60 text-center gap-2">
              <Users size={36} className="text-primary/40 mb-1" />
              <p className="text-sm font-bold text-foreground">В беседе пока нет сообщений</p>
              <p className="text-sm text-foreground/60 max-w-xs">
                Будьте первым! Напишите приветствие или отправьте приглашение в игру.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === currentUser.uid;
              const isOwner = msg.sender_role === 'owner';
              const isAdmin = msg.sender_role === 'admin';

              return (
                <div
                  key={msg.id}
                  id={`chat-msg-${msg.id}`}
                  className={`flex gap-2.5 max-w-[88%] sm:max-w-[78%] group rounded-2xl transition-all duration-500 ${
                    isMine ? 'ml-auto flex-row-reverse' : 'mr-auto'
                  }`}
                >
                  {/* Sender Avatar */}
                  {!isMine && (
                    <div className="relative shrink-0 self-end">
                      <Link to={`/profile${msg.sender_id}`} title={msg.sender_name || 'Профиль'}>
                        <UserAvatar
                          avatarUrl={msg.sender_avatar || msg.sender_photo || msg.sender_tg_photo}
                          displayName={msg.sender_name || 'Участник'}
                          size="sm"
                        />
                      </Link>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div
                    className={`rounded-2xl p-3 sm:p-3.5 border transition-all backdrop-blur-xl space-y-1.5 ${
                      isMine
                        ? 'border-primary/45 bg-transparent shadow-sm'
                        : 'border-primary/20 bg-transparent'
                    }`}
                  >
                    {/* Header: Sender Name & Role */}
                    {!isMine && (
                      <div className="flex items-center gap-1.5 flex-wrap pb-0.5">
                        <Link
                          to={`/profile${msg.sender_id}`}
                          className="text-xs font-bold text-primary hover:underline truncate"
                        >
                          {msg.sender_name || 'Участник'}
                        </Link>
                        {isOwner ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                            Создатель
                          </span>
                        ) : isAdmin ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary/20 text-primary font-bold">
                            Админ
                          </span>
                        ) : null}
                      </div>
                    )}

                    {/* Quoted Reply if any */}
                    {msg.reply_to_id && (
                      <div className="p-2 rounded-xl border border-primary/25 bg-transparent backdrop-blur-md text-xs space-y-0.5 opacity-85">
                        <div className="flex items-center gap-1 text-primary font-bold">
                          <CornerDownRight size={12} />
                          <span>{msg.reply_sender_name || 'Ответ'}:</span>
                        </div>
                        <p className="line-clamp-2 text-foreground/75 italic">
                          {msg.reply_message || 'Вложение'}
                        </p>
                      </div>
                    )}

                    {/* Media Attachments */}
                    {msg.media_url && (
                      <div className="pt-1">
                        {/* Audio / Voice message - NO VIDEO DUPLICATION! Uses VoiceMessagePlayer */}
                        {msg.media_type === 'audio' ||
                        msg.media_url.endsWith('.webm') ||
                        msg.media_url.endsWith('.mp3') ||
                        msg.media_url.endsWith('.ogg') ||
                        msg.media_url.endsWith('.m4a') ? (
                          <VoiceMessagePlayer audioUrl={msg.media_url} isMine={isMine} />
                        ) : msg.media_type === 'video' ||
                          msg.media_url.endsWith('.mp4') ||
                          msg.media_url.endsWith('.mov') ? (
                          <div className="rounded-xl overflow-hidden border border-primary/25 max-w-full">
                            <video
                              src={msg.media_url}
                              controls
                              playsInline
                              className="max-h-64 sm:max-h-80 w-full object-contain bg-black/40"
                            />
                          </div>
                        ) : msg.media_type === 'image' ||
                          msg.media_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          <a
                            href={msg.media_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-xl overflow-hidden border border-primary/25 max-w-full group/img"
                          >
                            <img
                              src={msg.media_url}
                              alt="Изображение"
                              className="max-h-64 sm:max-h-80 w-full object-cover group-hover/img:scale-102 transition-transform duration-200"
                            />
                          </a>
                        ) : (
                          <a
                            href={msg.media_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-primary/25 bg-transparent backdrop-blur-md hover:border-primary/50 transition-all text-xs"
                          >
                            <FileText size={16} className="text-primary shrink-0" />
                            <span className="truncate max-w-[180px] font-mono">
                              {msg.file_name || 'Скачать файл'}
                            </span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Video Call or Game Invite Box */}
                    {msg.game_invite && (() => {
                      let parsedInvite: any = msg.game_invite;
                      if (typeof parsedInvite === 'string') {
                        try {
                          parsedInvite = JSON.parse(parsedInvite);
                        } catch (_) {}
                      }

                      const isVideoCallInvite = Boolean(
                        parsedInvite &&
                        (parsedInvite.is_video_call ||
                         parsedInvite.type === 'chat' ||
                         parsedInvite.type === 'general' ||
                         (parsedInvite.room_id && String(parsedInvite.room_id).startsWith('vroom_')) ||
                         (!parsedInvite.gameId && !parsedInvite.game_type && msg.message && msg.message.toLowerCase().includes('видео')))
                      );

                      if (isVideoCallInvite) {
                        return (
                          <div className="p-3.5 rounded-2xl border border-primary/40 bg-primary/10 backdrop-blur-xl space-y-2.5">
                            <div className="flex items-center gap-2 text-primary font-bold text-sm">
                              <Video size={18} />
                              <span>Создан видеозвонок</span>
                            </div>
                            <p className="text-sm font-bold text-foreground">
                              {parsedInvite?.title || `Видеокомната: ${chatDetails?.chat.title || 'Беседа'}`}
                            </p>
                            <LeafButton
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                const callRoomId = parsedInvite?.room_id || `vroom_group_${chatId}`;
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

                      const targetPath =
                        parsedInvite?.gamePath ||
                        (parsedInvite?.room_id
                          ? `/multiplayer/room/${parsedInvite.room_id}`
                          : `/games/${parsedInvite?.gameId || parsedInvite?.game_type || 'blitz'}/create?mode=multi`);

                      return (
                        <div className="p-3.5 rounded-2xl border border-primary/40 bg-primary/10 backdrop-blur-xl space-y-2.5">
                          <div className="flex items-center gap-2 text-primary font-bold text-sm">
                            <Gamepad2 size={18} />
                            <span>Приглашение в лобби игры</span>
                          </div>
                          <p className="text-sm font-bold text-foreground">
                            {parsedInvite?.gameTitle || parsedInvite?.game_title || parsedInvite?.title || 'КвИИз'}
                          </p>
                          <LeafButton
                            variant="primary"
                            size="sm"
                            onClick={() => {
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

                    {/* Text Message (cleaned of raw /zoom links when invite card is rendered) */}
                    {msg.message && (() => {
                      const cleanedMsg = msg.game_invite
                        ? msg.message.replace(/https?:\/\/[^\s]+\/zoom\?[^\s]+/gi, '').replace(/Присоединяйтесь:\s*$/i, '').trim()
                        : msg.message;
                      if (!cleanedMsg) return null;
                      return (
                        <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                          {cleanedMsg}
                        </p>
                      );
                    })()}

                    {/* AI Moderation Status Badge */}
                    {msg.moderation_status === 'pending' ? (
                      <div className="mt-1 flex items-center gap-1.5 text-sm text-primary font-medium bg-transparent backdrop-blur-md px-2.5 py-1 rounded-xl border border-primary/25 w-fit animate-pulse">
                        <Loader2 size={14} className="animate-spin text-primary shrink-0" />
                        <span>Идет ИИ-модерация...</span>
                      </div>
                    ) : msg.moderation_status === 'rejected' ? (
                      <div className="mt-1 p-2.5 rounded-xl bg-transparent backdrop-blur-md border border-primary/30 text-foreground text-sm space-y-0.5">
                        <div className="flex items-center gap-1.5 font-bold text-foreground">
                          <AlertCircle size={14} className="shrink-0 text-primary" />
                          <span>Отклонено ИИ-модератором</span>
                        </div>
                        {msg.moderation_reason && (
                          <p className="text-sm text-foreground/80 pl-5 break-words whitespace-normal">{msg.moderation_reason}</p>
                        )}
                      </div>
                    ) : null}

                    {/* Message Footer: Timestamp, Edited flag & Action Toolbar */}
                    <div className="flex items-center justify-between gap-3 pt-1 text-[11px] text-foreground/50">
                      <div className="flex items-center gap-1.5">
                        <span>
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {Boolean(msg.is_edited) && <span className="italic">(изменено)</span>}
                      </div>

                      {/* Action buttons (Copy link, Reply, Edit, Delete) */}
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        {/* Copy Deep Link to message */}
                        <button
                          type="button"
                          onClick={() => {
                            const link = `${window.location.origin}/chat-${chatId}-mes${msg.id}`;
                            navigator.clipboard.writeText(link);
                            setCopiedMessageId(msg.id);
                            setTimeout(() => setCopiedMessageId(null), 2000);
                          }}
                          className="p-1 hover:text-primary transition-colors"
                          title="Копировать прямую ссылку на сообщение (/chat-...-mes...)"
                        >
                          {copiedMessageId === msg.id ? (
                            <Check size={13} className="text-emerald-400" />
                          ) : (
                            <Share2 size={13} />
                          )}
                        </button>

                        {!isArchived && (
                          <>
                            {/* Reply */}
                            <button
                              type="button"
                              onClick={() => {
                                setReplyingTo(msg);
                                setEditingMessage(null);
                              }}
                              className="p-1 hover:text-primary transition-colors"
                              title="Ответить"
                            >
                              <Reply size={13} />
                            </button>

                            {/* Edit (own message only) */}
                            {isMine && !msg.media_url && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMessage(msg);
                                  setInputValue(msg.message);
                                  setReplyingTo(null);
                                }}
                                className="p-1 hover:text-primary transition-colors"
                                title="Редактировать"
                              >
                                <Edit2 size={13} />
                              </button>
                            )}

                            {/* Delete (own, or admin/owner) */}
                            {(isMine || myRole === 'owner' || myRole === 'admin') && (
                              <button
                                type="button"
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="p-1 hover:text-rose-400 transition-colors"
                                title="Удалить"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Copied Feedback Toast */}
        {copiedMessageId && (
          <div className="px-4 py-1.5 bg-emerald-500/20 border-t border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-1.5 font-bold">
              <Check size={13} />
              Ссылка на сообщение скопирована в буфер обмена
            </span>
            <span className="font-mono text-[11px] opacity-80 truncate">
              /chat-{chatId}-mes{copiedMessageId}
            </span>
          </div>
        )}

        {/* Quoted Reply Banner */}
        {replyingTo && (
          <div className="px-4 py-2 border-t border-primary/20 bg-transparent backdrop-blur-md flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0 text-xs">
              <Reply size={14} className="text-primary shrink-0" />
              <div className="min-w-0">
                <span className="font-bold text-primary block truncate">
                  Ответ для {replyingTo.sender_name || 'Участника'}:
                </span>
                <span className="text-foreground/70 truncate block">
                  {replyingTo.message || 'Вложение'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setReplyingTo(null)}
              className="p-1 hover:text-foreground text-foreground/50"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Editing Message Banner */}
        {editingMessage && (
          <div className="px-4 py-2 border-t border-primary/20 bg-transparent backdrop-blur-md flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0 text-xs text-primary">
              <Edit2 size={14} className="shrink-0" />
              <span className="font-bold truncate">Редактирование своего сообщения</span>
            </div>

            <button
              onClick={() => {
                setEditingMessage(null);
                setInputValue('');
              }}
              className="p-1 hover:text-foreground text-foreground/50"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Pending Media Miniature Preview (Direct Chat style) */}
        {pendingMedia && (
          <div className="px-4 py-2.5 border-t border-primary/20 bg-background/30 backdrop-blur-xl flex items-center justify-between gap-3 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden relative">
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
                <p className="text-sm font-bold text-foreground truncate max-w-xs">
                  {pendingMedia.name}
                </p>
                <p className="text-xs text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
                  <Check size={13} />
                  <span>
                    {pendingMedia.type === 'video'
                      ? 'Видео готово к отправке'
                      : pendingMedia.type === 'image'
                      ? 'Фото готово к отправке'
                      : pendingMedia.type === 'audio'
                      ? (pendingMedia.transcript ? `Текст: «${pendingMedia.transcript.slice(0, 30)}...»` : 'Голосовое готово к отправке')
                      : 'Файл готов к отправке'}
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
              className="p-2 rounded-xl text-foreground/50 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0 cursor-pointer"
              title="Удалить вложение"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}

        {/* Sending Banner when AI Moderation is running */}
        {sending && (
          <div className="px-4 py-2 bg-white/5 border-t border-white/20 text-sm text-primary flex items-center gap-2 animate-pulse">
            <Loader2 size={15} className="animate-spin shrink-0 text-primary" />
            <span>Идет отправка и ИИ-модерация...</span>
          </div>
        )}

        {/* Input Bar (Unified with DirectChatModal) */}
        <div className="p-3 sm:p-4 border-t border-primary/20 bg-transparent backdrop-blur-md shrink-0">
          {isArchived ? (
            <div className="p-3 text-center rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl text-sm text-foreground/80 flex items-center justify-center gap-2">
              <Lock size={16} className="text-primary shrink-0" />
              <span>Беседа находится в архиве. Доступен только просмотр истории сообщений.</span>
            </div>
          ) : isBanned ? (
            <div className="p-3 text-center rounded-2xl border border-white/30 bg-transparent backdrop-blur-md text-sm text-foreground/80">
              Вы заблокированы в этой беседе создателем или администратором.
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              {/* Attachment Button */}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleUploadFile(e.target.files[0]);
                  }
                }}
              />
              <BubbleElement
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingMedia || sending}
                icon={uploadingMedia ? <Loader2 size={18} className="animate-spin text-primary" /> : <Paperclip size={18} className="text-primary" />}
                className="shrink-0 !p-2.5"
                title="Прикрепить файл или фото"
              />

              {/* Text Input */}
              <div className="flex-1 min-w-0 relative">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={
                    editingMessage
                      ? 'Отредактируйте сообщение...'
                      : replyingTo
                      ? 'Ваш ответ...'
                      : 'Написать сообщение...'
                  }
                  className="w-full px-4 py-2.5 text-sm rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary/60 transition-all"
                />
              </div>

              {/* Voice Input Bubble (Identical to DirectChatModal) */}
              <VoiceInputBubble
                size="md"
                mode="append"
                currentValue={inputValue}
                onTranscript={(text) => {
                  if (text) {
                    setInputValue((prev) => (prev ? `${prev} ${text}` : text));
                  }
                }}
                onAudioRecorded={(audioUrl, transcript) => {
                  setPendingMedia({
                    url: audioUrl,
                    type: 'audio',
                    name: 'Голосовое сообщение',
                    transcript: transcript || inputValue,
                  });
                }}
              />

              {/* Send / Save Icon Button */}
              <LeafButton
                variant="primary"
                size="md"
                type="submit"
                disabled={sending || uploadingMedia || (!inputValue.trim() && !pendingMedia && !editingMessage)}
                icon={
                  sending || uploadingMedia ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )
                }
                title={editingMessage ? 'Сохранить' : 'Отправить'}
                className="shrink-0 !px-3.5"
              />
            </form>
          )}
        </div>
      </div>

      {/* Lightbox Modal for photos */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-150"
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImage}
              alt="Просмотр"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl border border-primary/30"
            />
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute -top-3 -right-3 p-2 rounded-full bg-background/80 border border-primary/30 text-foreground hover:bg-background transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Settings & Info Modal */}
      {isSettingsOpen && (
        <GroupChatSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          chatId={chatId}
          currentUserUid={currentUser.uid}
          onChatUpdated={() => {
            loadMessagesAndDetails();
            if (onChatUpdated) onChatUpdated();
          }}
          onLeftChat={() => {
            setIsSettingsOpen(false);
            onClose();
            if (onChatUpdated) onChatUpdated();
          }}
        />
      )}
      {/* Video Call Modal */}
      {isZoomOpen && (
        <ZoomVideoModal
          isOpen={isZoomOpen}
          onClose={() => setIsZoomOpen(false)}
          currentUser={{
            uid: currentUser.uid,
            avatar_url: currentUser.avatar_url
          }}
          roomId={zoomRoomId}
          roomTitle={`Видеокомната: ${chatDetails?.chat.title || 'Беседа'}`}
          roomType="chat"
        />
      )}
    </div>,
    document.body
  );
};
