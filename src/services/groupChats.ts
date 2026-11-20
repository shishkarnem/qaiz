export interface GroupChatListItem {
  id: string;
  title: string;
  description: string | null;
  avatar_url: string | null;
  creator_id: string;
  ai_moderation_enabled: number;
  is_archived?: number;
  archived_at?: string | null;
  archive_reason?: string | null;
  linked_room_id?: string | null;
  game_id?: string | null;
  created_at: string;
  updated_at: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  last_read_at: string | null;
  members_count: number;
  unread_count: number;
  last_message: string | null;
  last_message_time: string | null;
  last_message_sender_name: string | null;
}

export interface GroupChatMember {
  id: string;
  member_record_id?: string;
  chat_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  is_banned: number;
  joined_at: string;
  display_name: string | null;
  username: string | null;
  photo_url: string | null;
  avatar_url: string | null;
  telegram_photo: string | null;
  is_online: number;
  last_seen: string | null;
}

export interface GroupChatMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_name?: string | null;
  sender_username?: string | null;
  sender_photo?: string | null;
  sender_avatar?: string | null;
  sender_tg_photo?: string | null;
  sender_role?: 'owner' | 'admin' | 'member' | null;
  message: string;
  reply_to_id?: string | null;
  reply_sender_name?: string | null;
  reply_message?: string | null;
  is_edited: number;
  media_url?: string | null;
  media_type?: 'audio' | 'image' | 'video' | 'file' | string | null;
  file_name?: string | null;
  file_size?: number | null;
  game_invite?: any;
  moderation_status?: 'pending' | 'approved' | 'rejected' | null;
  moderation_reason?: string | null;
  created_at: string;
}

export interface GroupChatDetails {
  chat: {
    id: string;
    title: string;
    description: string | null;
    avatar_url: string | null;
    creator_id: string;
    ai_moderation_enabled: number;
    is_archived?: number;
    archived_at?: string | null;
    archive_reason?: string | null;
    linked_room_id?: string | null;
    game_id?: string | null;
    created_at: string;
    updated_at: string;
    members_json?: string | null;
    admins_json?: string | null;
    members_count?: number;
  };
  myMembership: {
    role: 'owner' | 'admin' | 'member';
    is_banned: number;
  } | null;
  members: GroupChatMember[];
  admins?: GroupChatMember[];
  members_count: number;
}

class GroupChatsService {
  async fetchUserGroupChats(userId: string): Promise<GroupChatListItem[]> {
    const res = await fetch(`/api/group-chats?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) {
      throw new Error(`Ошибка загрузки групповых чатов: ${res.statusText}`);
    }
    const data = await res.json();
    return data.data || [];
  }

  async fetchInviteableGroupChats(userId: string): Promise<GroupChatListItem[]> {
    const res = await fetch(
      `/api/group-chats?userId=${encodeURIComponent(userId)}&exclude_archived=1&only_group_chats=1`
    );
    if (!res.ok) {
      throw new Error(`Ошибка загрузки групповых чатов: ${res.statusText}`);
    }
    const data = await res.json();
    const list: GroupChatListItem[] = Array.isArray(data.data) ? data.data : [];
    return list.filter(
      (g) =>
        Number(g.is_archived) !== 1 &&
        !g.archived_at &&
        !g.archive_reason &&
        !g.linked_room_id &&
        !String(g.id || '').startsWith('gchat_room_')
    );
  }

  async archiveGroupChat(chatId: string, userId: string): Promise<void> {
    const res = await fetch(
      `/api/group-chats/${encodeURIComponent(chatId)}?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Не удалось перенести чат в архив');
    }
  }

  async createGroupChat(payload: {
    userId: string;
    title: string;
    description?: string;
    avatar_url?: string;
    ai_moderation_enabled?: boolean;
    initialMemberUids?: string[];
  }): Promise<{ id: string; title: string }> {
    const res = await fetch('/api/group-chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Не удалось создать групповой чат');
    }
    return data.chat;
  }

  async fetchGroupChatDetails(chatId: string, userId: string): Promise<GroupChatDetails> {
    const res = await fetch(`/api/group-chats/${encodeURIComponent(chatId)}?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) {
      throw new Error(`Ошибка загрузки данных чата: ${res.statusText}`);
    }
    return await res.json();
  }

  async updateGroupChat(
    chatId: string,
    payload: {
      userId: string;
      title?: string;
      description?: string;
      avatar_url?: string;
      ai_moderation_enabled?: boolean;
    }
  ): Promise<any> {
    const res = await fetch(`/api/group-chats/${encodeURIComponent(chatId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Не удалось обновить настройки чата');
    }
    return data.chat;
  }

  async addGroupMembers(chatId: string, userId: string, targetUids: string[]): Promise<void> {
    const res = await fetch(`/api/group-chats/${encodeURIComponent(chatId)}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, targetUids }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Не удалось добавить участников');
    }
  }

  async removeGroupMember(chatId: string, targetUid: string, userId: string): Promise<void> {
    const res = await fetch(
      `/api/group-chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(targetUid)}?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Не удалось удалить участника');
    }
  }

  async banGroupMember(chatId: string, targetUid: string, userId: string, is_banned: boolean): Promise<void> {
    const res = await fetch(
      `/api/group-chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(targetUid)}/ban`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, is_banned }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Не удалось изменить статус блокировки');
    }
  }

  async setMemberRole(
    chatId: string,
    targetUid: string,
    userId: string,
    role: 'admin' | 'member'
  ): Promise<void> {
    const res = await fetch(
      `/api/group-chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(targetUid)}/role`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Не удалось изменить роль');
    }
  }

  async fetchGroupMessages(chatId: string, userId: string): Promise<GroupChatMessage[]> {
    const res = await fetch(
      `/api/group-chats/${encodeURIComponent(chatId)}/messages?userId=${encodeURIComponent(userId)}`
    );
    if (!res.ok) {
      throw new Error(`Ошибка загрузки сообщений: ${res.statusText}`);
    }
    const data = await res.json();
    return data.data || [];
  }

  async sendGroupMessage(
    chatId: string,
    payload: {
      userId: string;
      message?: string;
      reply_to_id?: string | null;
      media_url?: string | null;
      media_type?: string | null;
      file_name?: string | null;
      file_size?: number | null;
      is_invite?: boolean;
      game_invite?: any;
    }
  ): Promise<GroupChatMessage> {
    const res = await fetch(`/api/group-chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      const err: any = new Error(data.error || 'Не удалось отправить сообщение');
      err.moderated = data.moderated;
      err.moderation_reason = data.moderation_reason;
      throw err;
    }
    return data.message;
  }

  async editGroupMessage(chatId: string, messageId: string, userId: string, message: string): Promise<void> {
    const res = await fetch(
      `/api/group-chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, message }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      const err: any = new Error(data.error || 'Не удалось отредактировать сообщение');
      err.moderated = data.moderated;
      throw err;
    }
  }

  async deleteGroupMessage(chatId: string, messageId: string, userId: string): Promise<void> {
    const res = await fetch(
      `/api/group-chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Не удалось удалить сообщение');
    }
  }

  async leaveGroupChat(chatId: string, userId: string): Promise<void> {
    return this.removeGroupMember(chatId, userId, userId);
  }
}

export const groupChatsService = new GroupChatsService();
