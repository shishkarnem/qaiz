import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Users, 
  Camera, 
  Sparkles, 
  Loader2, 
  Search, 
  Check, 
  AlertCircle,
  UploadCloud
} from 'lucide-react';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { UserAvatar } from './UserAvatar';
import { getUploadService } from '../services/FileUploadService';
import { friendsService, UserListItem } from '../services/friends';
import { groupChatsService } from '../services/groupChats';

interface CreateGroupChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserUid: string;
  onCreated: (chatId: string) => void;
}

export const CreateGroupChatModal: React.FC<CreateGroupChatModalProps> = ({
  isOpen,
  onClose,
  currentUserUid,
  onCreated,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Friends selection
  const [friends, setFriends] = useState<UserListItem[]>([]);
  const [selectedFriendUids, setSelectedFriendUids] = useState<string[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendsSearch, setFriendsSearch] = useState('');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setDescription('');
      setAvatarUrl(null);
      setAvatarPreviewUrl(null);
      setSelectedFriendUids([]);
      setErrorMessage(null);
      setUploadError(null);
      return;
    }

    // Load user's friends to select members
    setLoadingFriends(true);
    friendsService
      .fetchUsers({
        userId: currentUserUid,
        filter: 'friends',
        limit: 100,
      })
      .then((res) => {
        const unique = new Map<string, UserListItem>();
        for (const item of (res.data || [])) {
          const uid = String(item.uid || item.id || '');
          if (uid && !unique.has(uid)) {
            unique.set(uid, item);
          }
        }
        setFriends(Array.from(unique.values()));
      })
      .catch((err) => console.warn('Failed to load friends for chat creation:', err))
      .finally(() => setLoadingFriends(false));
  }, [isOpen, currentUserUid]);

  const handleAvatarSelect = async (file: File) => {
    if (!file) return;

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    const preview = URL.createObjectURL(file);
    setAvatarPreviewUrl(preview);
    setUploadingAvatar(true);
    setUploadError(null);

    const controller = new AbortController();
    uploadAbortRef.current = controller;

    try {
      const uploadService = getUploadService();
      const res = await uploadService.uploadAndStore(
        file,
        'chat_media',
        undefined,
        currentUserUid,
        controller.signal
      );
      setAvatarUrl(res.directUrl || res.url);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Avatar upload error:', err);
      setUploadError('Не удалось загрузить аватарку. Попробуйте другой файл.');
    } finally {
      setUploadingAvatar(false);
      uploadAbortRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCancelAvatarUpload = () => {
    if (uploadAbortRef.current) {
      uploadAbortRef.current.abort();
      uploadAbortRef.current = null;
    }
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(null);
    }
    setAvatarUrl(null);
    setUploadingAvatar(false);
  };

  const toggleFriend = (uid: string) => {
    setSelectedFriendUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setErrorMessage('Укажите название группового чата');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const chat = await groupChatsService.createGroupChat({
        userId: currentUserUid,
        title: cleanTitle,
        description: description.trim() || undefined,
        avatar_url: avatarUrl || undefined,
        initialMemberUids: selectedFriendUids,
      });

      onCreated(chat.id);
      onClose();
    } catch (err: any) {
      console.error('Create group chat error:', err);
      setErrorMessage(err.message || 'Ошибка создания группового чата');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const filteredFriends = friends.filter((f) => {
    if (!friendsSearch.trim()) return true;
    const q = friendsSearch.toLowerCase();
    const name = (f.display_name || f.username || '').toLowerCase();
    return name.includes(q) || f.uid.toLowerCase().includes(q);
  });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-transparent backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl border border-primary/30 bg-transparent backdrop-blur-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-primary/20 bg-transparent backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-transparent border border-primary/35 flex items-center justify-center text-primary backdrop-blur-md">
              <Users size={22} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-foreground">
                Создание группового чата
              </h3>
              <p className="text-sm text-foreground/70">
                Беседа с друзьями и эмодзи-шифрованием
              </p>
            </div>
          </div>

          <BubbleElement
            size="sm"
            onClick={onClose}
            icon={<X size={18} />}
            className="cursor-pointer border-primary/20 hover:border-primary/40 shrink-0 !p-2 sm:!px-3 sm:!py-1.5"
            title="Закрыть"
          >
            <span className="hidden sm:inline">Закрыть</span>
          </BubbleElement>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-sm">
          {/* Avatar Upload */}
          <div className="flex items-center gap-4 p-4 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl">
            <div className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-primary/40 bg-transparent shrink-0 flex items-center justify-center">
              {avatarPreviewUrl || avatarUrl ? (
                <img
                  src={avatarPreviewUrl || avatarUrl || ''}
                  alt="Аватарка чата"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Users size={32} className="text-primary/60" />
              )}

              {uploadingAvatar && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-xs flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-primary" />
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2 min-w-0">
              <span className="text-sm font-bold text-foreground block">
                Аватарка беседы
              </span>
              <p className="text-sm text-foreground/70">
                Загрузите изображение через встроенный загрузчик
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleAvatarSelect(e.target.files[0]);
                    }
                  }}
                />

                <LeafButton
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  icon={<UploadCloud size={16} />}
                >
                  <span>{avatarUrl ? 'Изменить' : 'Загрузить фото'}</span>
                </LeafButton>

                {(avatarPreviewUrl || avatarUrl) && (
                  <BubbleElement
                    size="sm"
                    onClick={handleCancelAvatarUpload}
                    className="cursor-pointer border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-sm"
                  >
                    Удалить
                  </BubbleElement>
                )}
              </div>
            </div>
          </div>

          {uploadError && (
            <div className="p-3 rounded-2xl border border-rose-500/30 bg-transparent backdrop-blur-md text-sm text-rose-400 flex items-center gap-2">
              <AlertCircle size={18} className="shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground flex items-center justify-between">
              <span>Название чата <span className="text-primary">*</span></span>
              <span className="text-sm text-foreground/50 font-mono">{title.length}/60</span>
            </label>
            <input
              type="text"
              required
              maxLength={60}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Клуб интеллектуалов, Друзья КвИИза..."
              className="w-full px-4 py-3 rounded-2xl border border-primary/30 bg-transparent text-foreground placeholder:text-foreground/45 text-sm focus:outline-none focus:border-primary backdrop-blur-md"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground flex items-center justify-between">
              <span>Описание беседы (необязательно)</span>
              <span className="text-sm text-foreground/50 font-mono">{description.length}/200</span>
            </label>
            <textarea
              maxLength={200}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="О чем этот чат, правила общения, общие темы..."
              className="w-full px-4 py-3 rounded-2xl border border-primary/30 bg-transparent text-foreground placeholder:text-foreground/45 text-sm focus:outline-none focus:border-primary backdrop-blur-md resize-none"
            />
          </div>

          {/* Friends Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                Пригласить друзей в чат ({selectedFriendUids.length})
              </span>
              {friends.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedFriendUids.length === friends.length) {
                      setSelectedFriendUids([]);
                    } else {
                      setSelectedFriendUids(friends.map((f) => f.uid));
                    }
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  {selectedFriendUids.length === friends.length ? 'Снять все' : 'Выбрать всех'}
                </button>
              )}
            </div>

            {/* Search friends */}
            {friends.length > 4 && (
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50" />
                <input
                  type="text"
                  value={friendsSearch}
                  onChange={(e) => setFriendsSearch(e.target.value)}
                  placeholder="Поиск среди друзей..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-primary/25 bg-transparent text-foreground text-sm focus:outline-none focus:border-primary backdrop-blur-md"
                />
              </div>
            )}

            {/* Friends list */}
            {loadingFriends ? (
              <div className="py-8 flex items-center justify-center gap-2 text-primary">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">Загрузка списка друзей...</span>
              </div>
            ) : filteredFriends.length > 0 ? (
              <div className="max-h-52 overflow-y-auto space-y-1.5 p-1 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md">
                {filteredFriends.map((friend, idx) => {
                  const isSelected = selectedFriendUids.includes(friend.uid);
                  return (
                    <div
                      key={`cg-friend-${friend.uid || friend.id}-${idx}`}
                      onClick={() => toggleFriend(friend.uid)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'border-primary/50 bg-transparent backdrop-blur-md shadow-sm'
                          : 'border-transparent hover:border-primary/20 hover:bg-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar
                          avatarUrl={friend.avatar_url || friend.photo_url || friend.telegram_photo}
                          displayName={friend.display_name || friend.username || 'Друг'}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">
                            {friend.display_name || friend.username || `Игрок ${friend.uid.slice(0, 8)}`}
                          </p>
                          <span className="text-xs text-foreground/60 font-mono block">
                            UID: {friend.uid}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all shrink-0 ${
                          isSelected
                            ? 'bg-primary border-primary text-background'
                            : 'border-primary/30 bg-transparent'
                        }`}
                      >
                        {isSelected && <Check size={14} className="stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-2xl border border-primary/20 bg-transparent text-center backdrop-blur-md">
                <p className="text-sm text-foreground/70">
                  {friends.length === 0
                    ? 'У вас пока нет добавленных друзей. Вы можете создать чат сейчас и пригласить участников позже!'
                    : 'Друзья по поисковому запросу не найдены.'}
                </p>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-2xl border border-rose-500/40 bg-transparent backdrop-blur-md text-sm text-rose-400 flex items-center gap-2">
              <AlertCircle size={18} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-primary/20 flex items-center justify-end gap-3 shrink-0">
            <BubbleElement
              size="md"
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="cursor-pointer text-sm"
            >
              Отмена
            </BubbleElement>

            <LeafButton
              variant="primary"
              size="md"
              type="submit"
              disabled={submitting || !title.trim()}
              icon={submitting ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            >
              <span>{submitting ? 'Создание...' : 'Создать чат'}</span>
            </LeafButton>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
