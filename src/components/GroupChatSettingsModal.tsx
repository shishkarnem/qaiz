import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Users,
  Settings,
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  UserMinus,
  UserX,
  UserCheck,
  Crown,
  LogOut,
  UploadCloud,
  Check,
  Loader2,
  AlertCircle,
  Search,
  Save,
  Trash2,
  Lock
} from 'lucide-react';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { UserAvatar } from './UserAvatar';
import { getUploadService } from '../services/FileUploadService';
import { friendsService, UserListItem } from '../services/friends';
import {
  groupChatsService,
  GroupChatDetails,
  GroupChatMember,
} from '../services/groupChats';
import { Link } from 'react-router-dom';

interface GroupChatSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  currentUserUid: string;
  onChatUpdated?: () => void;
  onLeftChat?: () => void;
}

export const GroupChatSettingsModal: React.FC<GroupChatSettingsModalProps> = ({
  isOpen,
  onClose,
  chatId,
  currentUserUid,
  onChatUpdated,
  onLeftChat,
}) => {
  const [details, setDetails] = useState<GroupChatDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'add_members'>('info');

  // Edit fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add members
  const [friends, setFriends] = useState<UserListItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedFriendUids, setSelectedFriendUids] = useState<string[]>([]);
  const [addingFriends, setAddingFriends] = useState(false);
  const [membersSearch, setMembersSearch] = useState('');

  // Member action loading
  const [actionLoadingUid, setActionLoadingUid] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadChatDetails = async () => {
    try {
      setLoading(true);
      const data = await groupChatsService.fetchGroupChatDetails(chatId, currentUserUid);
      setDetails(data);
      setTitle(data.chat.title || '');
      setDescription(data.chat.description || '');
      setAvatarUrl(data.chat.avatar_url || null);
    } catch (e: any) {
      console.error('Failed to load chat details:', e);
      setErrorMsg(e.message || 'Ошибка загрузки данных чата');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && chatId) {
      loadChatDetails();
    }
  }, [isOpen, chatId, currentUserUid]);

  const loadFriendsToAdd = async () => {
    if (!currentUserUid) return;
    setLoadingFriends(true);
    try {
      const res = await friendsService.fetchUsers({
        userId: currentUserUid,
        filter: 'friends',
        limit: 100,
      });
      // Filter out those who are already members
      const existingUids = (details?.members || []).map((m) => m.user_id);
      const available = (res.data || []).filter((u) => !existingUids.includes(u.uid));
      setFriends(available);
    } catch (e) {
      console.warn('Failed to load friends to add:', e);
    } finally {
      setLoadingFriends(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'add_members') {
      loadFriendsToAdd();
    }
  }, [activeTab]);

  const myRole = details?.myMembership?.role || 'member';
  const isOwner = details?.chat.creator_id === currentUserUid || myRole === 'owner';
  const isAdmin = isOwner || myRole === 'admin';
  const [membersFilter, setMembersFilter] = useState<'all' | 'admins'>('all');

  const handleAvatarUpload = async (file: File) => {
    if (!file) return;
    setUploadingAvatar(true);
    setErrorMsg(null);
    try {
      const uploadService = getUploadService();
      const res = await uploadService.uploadAndStore(file, 'chat_media', undefined, currentUserUid);
      const newUrl = res.directUrl || res.url;
      setAvatarUrl(newUrl);
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      setErrorMsg('Не удалось загрузить аватарку.');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setErrorMsg('Название чата не может быть пустым');
      return;
    }

    setSavingSettings(true);
    setErrorMsg(null);
    try {
      await groupChatsService.updateGroupChat(chatId, {
        userId: currentUserUid,
        title: cleanTitle,
        description: description.trim() || undefined,
        avatar_url: avatarUrl || undefined,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      if (onChatUpdated) onChatUpdated();
      await loadChatDetails();
    } catch (e: any) {
      console.error('Save chat settings error:', e);
      setErrorMsg(e.message || 'Ошибка сохранения настроек');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddSelectedFriends = async () => {
    if (selectedFriendUids.length === 0) return;
    setAddingFriends(true);
    setErrorMsg(null);
    try {
      await groupChatsService.addGroupMembers(chatId, currentUserUid, selectedFriendUids);
      setSelectedFriendUids([]);
      setActiveTab('members');
      await loadChatDetails();
      if (onChatUpdated) onChatUpdated();
    } catch (e: any) {
      console.error('Add members error:', e);
      setErrorMsg(e.message || 'Ошибка добавления участников');
    } finally {
      setAddingFriends(false);
    }
  };

  const handleKickMember = async (targetUid: string) => {
    setActionLoadingUid(targetUid);
    try {
      await groupChatsService.removeGroupMember(chatId, targetUid, currentUserUid);
      await loadChatDetails();
      if (onChatUpdated) onChatUpdated();
    } catch (e: any) {
      setErrorMsg(e.message || 'Ошибка удаления участника');
    } finally {
      setActionLoadingUid(null);
    }
  };

  const handleToggleBan = async (targetUid: string, currentBanned: number) => {
    const nextBan = currentBanned === 0;
    setActionLoadingUid(targetUid);
    try {
      await groupChatsService.banGroupMember(chatId, targetUid, currentUserUid, nextBan);
      await loadChatDetails();
      if (onChatUpdated) onChatUpdated();
    } catch (e: any) {
      setErrorMsg(e.message || 'Ошибка блокировки участника');
    } finally {
      setActionLoadingUid(null);
    }
  };

  const handleToggleRole = async (targetUid: string, currentRole: string) => {
    if (!isOwner) return;
    const nextRole: 'admin' | 'member' = currentRole === 'admin' ? 'member' : 'admin';

    // Optimistically update in real-time immediately
    setDetails((prev) => {
      if (!prev) return prev;
      const updatedMembers = prev.members.map((m) =>
        m.user_id === targetUid ? { ...m, role: nextRole } : m
      );
      return {
        ...prev,
        members: updatedMembers,
      };
    });

    setActionLoadingUid(targetUid);
    try {
      await groupChatsService.setMemberRole(chatId, targetUid, currentUserUid, nextRole);
      await loadChatDetails();
      if (onChatUpdated) onChatUpdated();
    } catch (e: any) {
      console.error('Role update error:', e);
      await loadChatDetails();
      setErrorMsg(e.message || 'Ошибка изменения роли');
    } finally {
      setActionLoadingUid(null);
    }
  };

  const handleLeaveChat = async () => {
    const confirmMsg = isOwner
      ? 'Вы создатель этого чата. Если вы покинете его, управление перейдет администраторам. Выйти?'
      : 'Вы уверены, что хотите покинуть этот групповой чат?';
    if (!confirm(confirmMsg)) return;

    try {
      await groupChatsService.leaveGroupChat(chatId, currentUserUid);
      onClose();
      if (onLeftChat) onLeftChat();
    } catch (e: any) {
      setErrorMsg(e.message || 'Ошибка при выходе из чата');
    }
  };

  if (!isOpen) return null;

  const allMembers = details?.members || [];
  const adminMembers = allMembers.filter((m) => (m.role === 'owner' || m.role === 'admin') && !m.is_banned);

  const filteredMembers = allMembers.filter((m) => {
    if (membersFilter === 'admins' && m.role !== 'owner' && m.role !== 'admin') {
      return false;
    }
    if (!membersSearch.trim()) return true;
    const q = membersSearch.toLowerCase();
    const name = (m.display_name || m.username || '').toLowerCase();
    return name.includes(q) || m.user_id.toLowerCase().includes(q);
  });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-transparent backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl border border-primary/30 bg-transparent backdrop-blur-3xl shadow-2xl overflow-hidden">
        {/* Modal Header: Top row = Icon tabs (Инфо, Участники, Добавить друзей) + Close X icon; Bottom row = Chat title & member count */}
        <div className="p-3.5 sm:p-5 border-b border-primary/20 bg-transparent backdrop-blur-md flex flex-col gap-3 shrink-0">
          {/* Row 1: Top Action & Tab Icons (Info, Members, Add Friends) + Close X */}
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="flex items-center gap-2">
              <BubbleElement
                size="sm"
                active={activeTab === 'info'}
                onClick={() => setActiveTab('info')}
                icon={<Settings size={16} />}
                className="cursor-pointer !px-3 !py-2"
                title="Информация"
              />

              <BubbleElement
                size="sm"
                active={activeTab === 'members'}
                onClick={() => setActiveTab('members')}
                icon={<Users size={16} />}
                className="cursor-pointer !px-3 !py-2"
                title={`Участники (${details?.members_count || 0})`}
              />

              {isAdmin && (
                <BubbleElement
                  size="sm"
                  active={activeTab === 'add_members'}
                  onClick={() => setActiveTab('add_members')}
                  icon={<UserPlus size={16} />}
                  className="cursor-pointer !px-3 !py-2"
                  title="Добавить друзей"
                />
              )}
            </div>

            <BubbleElement
              size="sm"
              onClick={onClose}
              icon={<X size={18} />}
              className="cursor-pointer border-primary/20 hover:border-primary/40 shrink-0 !px-2.5 !py-2"
              title="Закрыть"
            />
          </div>

          {/* Row 2: Chat Title & Member Count underneath icons (without AI moderation label) */}
          <div className="min-w-0 w-full">
            <h3 className="text-base sm:text-lg font-black text-foreground break-words leading-snug">
              {details?.chat.title || 'Настройки беседы'}
            </h3>
            <p className="text-sm text-foreground/70 mt-0.5">
              {details?.members_count || 0} участников
            </p>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-sm">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-primary">
              <Loader2 size={28} className="animate-spin" />
              <span className="text-sm">Загрузка информации...</span>
            </div>
          ) : activeTab === 'info' ? (
            /* TAB 1: Chat Info & Edit */
            <form onSubmit={handleSaveSettings} className="space-y-5">
              {/* Avatar section */}
              <div className="flex items-center gap-4 p-4 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl">
                <div className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-primary/40 bg-transparent shrink-0 flex items-center justify-center">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Аватарка" className="w-full h-full object-cover" />
                  ) : (
                    <Users size={32} className="text-primary/60" />
                  )}

                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-background/60 backdrop-blur-xs flex items-center justify-center">
                      <Loader2 size={24} className="animate-spin text-primary" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5 min-w-0">
                  <span className="text-sm font-bold text-foreground block">
                    Аватарка группового чата
                  </span>
                  <p className="text-sm text-foreground/70">
                    {isAdmin ? 'Загрузите новую картинку для группы' : 'Аватарку могут менять только администраторы'}
                  </p>

                  {isAdmin && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleAvatarUpload(e.target.files[0]);
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
                        <span>Загрузить фото</span>
                      </LeafButton>

                      {avatarUrl && (
                        <BubbleElement
                          size="sm"
                          type="button"
                          onClick={() => setAvatarUrl(null)}
                          className="cursor-pointer border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-sm"
                        >
                          Удалить
                        </BubbleElement>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Title input */}
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground flex items-center justify-between">
                  <span>Название чата</span>
                  <span className="text-sm text-foreground/50 font-mono">{title.length}/60</span>
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  required
                  maxLength={60}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-primary/30 bg-transparent text-foreground text-sm focus:outline-none focus:border-primary backdrop-blur-md disabled:opacity-60"
                />
              </div>

              {/* Description input */}
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground flex items-center justify-between">
                  <span>Описание чата</span>
                  <span className="text-sm text-foreground/50 font-mono">{description.length}/200</span>
                </label>
                <textarea
                  disabled={!isAdmin}
                  maxLength={200}
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Добавьте описание тем или правил общения..."
                  className="w-full px-4 py-3 rounded-2xl border border-primary/30 bg-transparent text-foreground placeholder:text-foreground/45 text-sm focus:outline-none focus:border-primary backdrop-blur-md resize-none disabled:opacity-60"
                />
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-2xl border border-white/30 bg-white/5 backdrop-blur-md text-sm text-foreground flex items-center gap-2">
                  <AlertCircle size={18} className="shrink-0 text-primary" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {saveSuccess && (
                <div className="p-3.5 rounded-2xl border border-white/30 bg-white/5 backdrop-blur-md text-sm text-foreground flex items-center gap-2">
                  <Check size={18} className="shrink-0 text-primary" />
                  <span>Настройки чата успешно сохранены</span>
                </div>
              )}

              {/* Save button & Leave chat */}
              <div className="pt-2 flex items-center justify-between gap-3 border-t border-primary/20">
                <LeafButton
                  type="button"
                  variant="glass"
                  size="sm"
                  onClick={handleLeaveChat}
                  icon={<LogOut size={16} />}
                  className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-sm"
                >
                  Покинуть чат
                </LeafButton>

                {isAdmin && (
                  <LeafButton
                    variant="primary"
                    size="md"
                    type="submit"
                    disabled={savingSettings}
                    icon={savingSettings ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  >
                    <span>{savingSettings ? 'Сохранение...' : 'Сохранить изменения'}</span>
                  </LeafButton>
                )}
              </div>
            </form>
          ) : activeTab === 'members' ? (
            /* TAB 2: Members List */
            <div className="space-y-3">
              {/* Filter pills: All vs Admins */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMembersFilter('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all border ${
                    membersFilter === 'all'
                      ? 'bg-primary/20 border-primary text-primary shadow-sm'
                      : 'bg-transparent border-primary/20 text-foreground/70 hover:text-foreground'
                  }`}
                >
                  Все ({allMembers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMembersFilter('admins')}
                  className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all border flex items-center gap-1.5 ${
                    membersFilter === 'admins'
                      ? 'bg-primary/20 border-primary text-primary shadow-sm'
                      : 'bg-transparent border-primary/20 text-foreground/70 hover:text-foreground'
                  }`}
                >
                  <Shield size={14} />
                  <span>Администраторы ({adminMembers.length})</span>
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50" />
                <input
                  type="text"
                  value={membersSearch}
                  onChange={(e) => setMembersSearch(e.target.value)}
                  placeholder="Поиск по участникам..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-primary/25 bg-transparent text-foreground text-sm focus:outline-none focus:border-primary backdrop-blur-md"
                />
              </div>

              <div className="space-y-2">
                {filteredMembers.map((member, idx) => {
                  const isTargetMe = member.user_id === currentUserUid;
                  const isMemberOwner = member.role === 'owner';
                  const isMemberAdmin = member.role === 'admin';
                  const isBanned = Boolean(member.is_banned);
                  const isActionLoading = actionLoadingUid === member.user_id;
                  const memberUniqueKey = member.id || member.member_record_id || member.user_id || `member-${idx}`;

                  return (
                    <div
                      key={memberUniqueKey}
                      className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 backdrop-blur-md transition-all ${
                        isBanned
                          ? 'border-rose-500/30 bg-transparent opacity-75'
                          : 'border-primary/20 bg-transparent hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <UserAvatar
                            avatarUrl={member.avatar_url || member.photo_url || member.telegram_photo}
                            displayName={member.display_name || member.username || 'Участник'}
                            size="md"
                          />
                          {Boolean(member.is_online) && (
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary border border-background"></span>
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              to={`/profile${member.user_id}`}
                              className="font-bold text-foreground hover:text-primary transition-colors truncate block text-sm"
                            >
                              {member.display_name || member.username || `Игрок ${member.user_id.slice(0, 8)}`}
                            </Link>

                            {isTargetMe && (
                              <span className="text-xs px-2 py-0.5 rounded-md bg-primary/20 text-primary font-bold">
                                вы
                              </span>
                            )}

                            {isMemberOwner ? (
                              <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold flex items-center gap-1">
                                <Crown size={11} />
                                Создатель
                              </span>
                            ) : isMemberAdmin ? (
                              <span className="text-xs px-2 py-0.5 rounded-md bg-primary/20 text-primary font-bold flex items-center gap-1">
                                <Shield size={11} />
                                Админ
                              </span>
                            ) : null}

                            {isBanned && (
                              <span className="text-xs px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 font-bold flex items-center gap-1">
                                <Lock size={11} />
                                Заблокирован
                              </span>
                            )}
                          </div>

                          <span className="text-xs text-foreground/50 font-mono block mt-0.5">
                            UID: {member.user_id}
                          </span>
                        </div>
                      </div>

                      {/* Management actions */}
                      {!isTargetMe && (isAdmin || isOwner) && !isMemberOwner && (
                        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                          {isActionLoading ? (
                            <Loader2 size={18} className="animate-spin text-primary" />
                          ) : (
                            <>
                              {/* Toggle Admin (owner only) */}
                              {isOwner && (
                                <BubbleElement
                                  size="sm"
                                  onClick={() => handleToggleRole(member.user_id, member.role)}
                                  icon={isMemberAdmin ? <ShieldAlert size={14} /> : <Shield size={14} />}
                                  className="cursor-pointer text-xs"
                                  title={isMemberAdmin ? 'Снять админа' : 'Сделать админом'}
                                >
                                  {isMemberAdmin ? 'Снять админа' : 'Админ'}
                                </BubbleElement>
                              )}

                              {/* Ban / Unban */}
                              <BubbleElement
                                size="sm"
                                onClick={() => handleToggleBan(member.user_id, member.is_banned)}
                                icon={isBanned ? <UserCheck size={14} /> : <UserX size={14} />}
                                className={`cursor-pointer text-xs ${
                                  isBanned
                                    ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
                                    : 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                                }`}
                                title={isBanned ? 'Разблокировать участника' : 'Заблокировать в чате'}
                              >
                                {isBanned ? 'Разблок.' : 'Бан'}
                              </BubbleElement>

                              {/* Kick */}
                              <BubbleElement
                                size="sm"
                                onClick={() => handleKickMember(member.user_id)}
                                icon={<UserMinus size={14} />}
                                className="cursor-pointer text-xs border-primary/25 hover:border-rose-500/30 text-foreground/70 hover:text-rose-400"
                                title="Удалить из беседы"
                              >
                                Удалить
                              </BubbleElement>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* TAB 3: Add Friends */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    Выберите друзей для добавления
                  </h4>
                  <p className="text-xs text-foreground/60">
                    Добавленные друзья получат уведомление и смогут сразу общаться
                  </p>
                </div>

                {selectedFriendUids.length > 0 && (
                  <LeafButton
                    variant="primary"
                    size="sm"
                    disabled={addingFriends}
                    onClick={handleAddSelectedFriends}
                    icon={addingFriends ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  >
                    <span>Добавить ({selectedFriendUids.length})</span>
                  </LeafButton>
                )}
              </div>

              {loadingFriends ? (
                <div className="py-12 flex justify-center text-primary">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : friends.length > 0 ? (
                <div className="space-y-1.5 max-h-72 overflow-y-auto p-1 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md">
                  {friends.map((friend, idx) => {
                    const isSelected = selectedFriendUids.includes(friend.uid);
                    const friendKey = friend.uid || friend.id || `friend-${idx}`;
                    return (
                      <div
                        key={friendKey}
                        onClick={() => {
                          setSelectedFriendUids((prev) =>
                            prev.includes(friend.uid)
                              ? prev.filter((id) => id !== friend.uid)
                              : [...prev, friend.uid]
                          );
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                          isSelected
                            ? 'border-primary/50 bg-transparent backdrop-blur-md shadow-sm'
                            : 'border-transparent hover:border-primary/20'
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
                            <span className="text-xs text-foreground/50 font-mono block">
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
                <div className="p-6 rounded-2xl border border-primary/20 bg-transparent text-center backdrop-blur-md">
                  <p className="text-sm text-foreground/70">
                    Все ваши друзья уже добавлены в эту беседу!
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
