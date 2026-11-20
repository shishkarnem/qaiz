import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, Paperclip, FileText, X, Loader2, Upload, Image as ImageIcon, Download, ShieldCheck, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VoiceInputBubble } from './ui/VoiceInputBubble';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { UserAvatar } from './UserAvatar';
import { getUploadService } from '../services/FileUploadService';
import { audioSystem } from '../hooks/useSound';

export interface ChatMessageAttachment {
  url: string;
  name: string;
  type: string;
  size?: number;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  audio_url?: string;
  audio_duration?: number;
}

export type ChatAttachment = ChatMessageAttachment;

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  isBot: boolean;
  avatar?: string;
  timestamp: number;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  audio_url?: string | null;
  audio_duration?: number | null;
  actionType?: string;
  isCorrect?: boolean;
  scoreDelta?: number;
}

interface GameChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, attachment?: ChatMessageAttachment | null) => void | Promise<any>;
  currentUser: { id: string; name: string; avatar?: string | null };
  title?: string;
  placeholder?: string;
  compact?: boolean;
  moderationError?: string | null;
  onClearModerationError?: () => void;
  onClose?: () => void;
}

export const GameChat = ({
  messages,
  onSendMessage,
  currentUser,
  title = 'Групповой чат',
  placeholder = 'Сообщение в чат...',
  compact = false,
  moderationError: externalModError,
  onClearModerationError,
  onClose
}: GameChatProps) => {
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<ChatMessageAttachment | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localModError, setLocalModError] = useState<string | null>(null);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveModError = externalModError || localModError;
  const prevMsgCountRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      audioSystem.playSlot('mp_chat_message');
    }
    prevMsgCountRef.current = messages.length;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (effectiveModError) {
      audioSystem.playSlot('mp_chat_ai_moderated');
    }
  }, [effectiveModError]);

  const uploadSingleFile = async (file: File) => {
    setUploadingFile(true);
    setUploadError(null);
    try {
      const uploadService = getUploadService();
      const uploaded: any = await uploadService.uploadFromFile(file);
      const uploadedUrl = typeof uploaded === 'string' ? uploaded : uploaded?.url;
      if (uploadedUrl) {
        const fname = (typeof uploaded === 'object' && uploaded?.filename) || file.name;
        const ftype = (typeof uploaded === 'object' && uploaded?.mimeType) || file.type || 'application/octet-stream';
        const fsize = (typeof uploaded === 'object' && uploaded?.size) || file.size;
        setAttachment({
          url: uploadedUrl,
          name: fname,
          type: ftype,
          size: fsize,
          file_url: uploadedUrl,
          file_name: fname,
          file_type: ftype,
          file_size: fsize
        });
      }
    } catch (err: any) {
      console.error('Failed to upload file in GameChat:', err);
      setUploadError('Не удалось прикрепить файл');
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      await uploadSingleFile(file);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await uploadSingleFile(file);
          break;
        }
      }
    }
  };

  const handleSend = async () => {
    if ((!inputText.trim() && !attachment) || sendingMsg) return;
    const textToSend = inputText.trim() || (attachment ? `Файл: ${attachment.name}` : '');
    const currentAttachment = attachment;
    setInputText('');
    setAttachment(null);
    setUploadError(null);
    setLocalModError(null);
    if (onClearModerationError) onClearModerationError();

    setSendingMsg(true);
    try {
      const res = await onSendMessage(textToSend, currentAttachment);
      if (res && (res.moderated || res.error)) {
        setLocalModError(res.error || res.reason || 'Сообщение отклонено ИИ-модератором чата');
      }
    } catch (err: any) {
      setLocalModError(err?.message || 'Сообщение отклонено ИИ-модератором чата');
    } finally {
      setSendingMsg(false);
    }
  };

  const renderAttachment = (msg: ChatMessage, isMine: boolean) => {
    const url = msg.attachment_url || msg.file_url || msg.audio_url;
    if (!url) return null;
    const type = String(msg.attachment_type || msg.file_type || (msg.audio_url ? 'audio/webm' : '')).toLowerCase();
    const name = msg.attachment_name || msg.file_name || 'Прикрепленный файл';

    if (type.startsWith('image/') || /^data:image\//i.test(url) || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download={name}
          className="block mt-2 rounded-2xl overflow-hidden border border-primary/30 max-w-[220px]"
        >
          <img
            src={url}
            alt={name}
            className="w-full max-h-40 object-cover hover:scale-105 transition-transform"
          />
        </a>
      );
    }

    if (type.startsWith('video/') || /^data:video\//i.test(url) || /\.(mp4|webm|mov)$/i.test(url)) {
      return (
        <div className="mt-2 rounded-2xl overflow-hidden border border-primary/30 max-w-[240px]">
          <video src={url} controls className="w-full max-h-40 object-cover" />
        </div>
      );
    }

    if (type.startsWith('audio/') || /^data:audio\//i.test(url) || /\.(mp3|wav|ogg|m4a)$/i.test(url)) {
      return (
        <div className="mt-2">
          <audio src={url} controls className="max-w-[210px] h-9" />
        </div>
      );
    }

    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        download={name}
        className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
          isMine
            ? 'border-background/30 text-background hover:opacity-90'
            : 'border-primary/30 text-primary hover:border-primary/60'
        }`}
      >
        <FileText size={16} className="shrink-0" />
        <span className="truncate max-w-[160px]">{name}</span>
        <Download size={14} className="shrink-0 ml-auto" />
      </a>
    );
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      className="relative flex flex-col h-full bg-transparent backdrop-blur-2xl rounded-3xl border border-primary/30 overflow-hidden shadow-xl"
    >
      {isDraggingOver && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-transparent backdrop-blur-2xl border-2 border-dashed border-primary rounded-3xl p-4 text-center pointer-events-none">
          <Upload size={32} className="text-primary animate-bounce mb-2" />
          <p className="text-sm font-bold text-primary">Отпустите файл для прикрепления в чат</p>
        </div>
      )}

      <div className="px-3.5 py-2.5 border-b border-primary/20 bg-transparent flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-bold text-primary flex items-center gap-2 truncate">
            <MessageSquare size={16} className="shrink-0" />
            <span className="truncate">{title}</span>
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-sm font-semibold text-foreground/60">
            {messages.length}
          </span>
          {onClose && (
            <BubbleElement
              size="sm"
              onClick={onClose}
              icon={<X size={14} />}
              title="Закрыть чат"
              className="!px-2 !py-1"
            />
          )}
        </div>
      </div>

      {effectiveModError && (
        <div className="mx-3 mt-2.5 px-3.5 py-2.5 rounded-2xl border border-rose-500/45 bg-transparent backdrop-blur-2xl flex items-start justify-between gap-2 text-sm text-rose-300 font-semibold shrink-0">
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <span className="break-words">{effectiveModError}</span>
          </div>
          <BubbleElement
            size="sm"
            onClick={() => {
              setLocalModError(null);
              if (onClearModerationError) onClearModerationError();
            }}
            icon={<X size={13} />}
          />
        </div>
      )}

      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-hide ${compact ? 'min-h-[100px]' : 'min-h-[120px]'}`}
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-3 text-sm text-foreground/60 gap-2">
            <p>Напишите сообщение, используйте голосовой ввод или прикрепите файл</p>
            <BubbleElement
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              icon={<Upload size={15} />}
              title="Загрузить файл в чат"
            />
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => {
              const isMine = String(msg.senderId) === String(currentUser.id);
              return (
                <motion.div
                  key={`chat-msg-${msg.id || idx}-${idx}`}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  <div className={`flex items-center gap-1.5 mb-1 ${isMine ? 'flex-row-reverse' : ''}`}>
                    <UserAvatar
                      avatarUrl={msg.avatar || (isMine ? currentUser.avatar : undefined)}
                      displayName={msg.senderName}
                      size="xs"
                    />
                    <span className="text-sm font-semibold text-foreground/75 truncate max-w-[140px]">
                      {msg.senderName}
                    </span>
                  </div>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm font-medium shadow-sm backdrop-blur-md break-words ${
                      isMine
                        ? 'bg-primary text-background font-bold rounded-tr-none'
                        : 'bg-transparent text-foreground border border-primary/30 rounded-tl-none'
                    }`}
                  >
                    {msg.text && <div>{msg.text}</div>}
                    {renderAttachment(msg, isMine)}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <div className="p-2.5 bg-transparent border-t border-primary/20 space-y-2 shrink-0">
        {uploadError && (
          <div className="text-sm text-red-400 px-2 flex items-center justify-between">
            <span>{uploadError}</span>
            <button type="button" onClick={() => setUploadError(null)} className="text-foreground/60 hover:text-foreground">
              <X size={14} />
            </button>
          </div>
        )}

        {attachment && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-md">
            <div className="flex items-center gap-2 min-w-0">
              {attachment.type.startsWith('image/') ? (
                <img src={attachment.url} alt={attachment.name} className="w-8 h-8 rounded-lg object-cover border border-primary/30 shrink-0" />
              ) : (
                <FileText size={16} className="text-primary shrink-0" />
              )}
              <span className="text-sm font-semibold text-foreground truncate">
                {attachment.name}
              </span>
            </div>
            <BubbleElement
              size="sm"
              onClick={() => setAttachment(null)}
              icon={<X size={14} />}
              title="Удалить вложение"
            />
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
            onChange={handleFileChange}
            className="hidden"
          />

          <BubbleElement
            size="sm"
            active={Boolean(attachment)}
            disabled={uploadingFile}
            onClick={() => fileInputRef.current?.click()}
            icon={
              uploadingFile ? (
                <Loader2 size={15} className="animate-spin text-primary" />
              ) : (
                <Paperclip size={15} className="text-primary" />
              )
            }
            title="Прикрепить файл или фото"
            className="shrink-0"
          />

          <VoiceInputBubble
            onTranscript={(text) => setInputText(text)}
            currentValue={inputText}
            mode="append"
            size="sm"
            tooltip="Голосовой ввод"
          />

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent backdrop-blur-md rounded-2xl py-2 px-3 text-sm text-foreground placeholder:text-foreground/45 border border-primary/30 focus:outline-none focus:border-primary transition-all"
          />

          <LeafButton
            variant="primary"
            size="sm"
            onClick={handleSend}
            disabled={!inputText.trim() && !attachment}
            icon={<Send size={15} />}
            className="shrink-0"
          >
            <span className="sr-only">Отправить</span>
          </LeafButton>
        </div>
      </div>
    </div>
  );
};
