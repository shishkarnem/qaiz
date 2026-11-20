export interface UserListItem {
  id: string;
  uid: string;
  display_name?: string | null;
  username?: string | null;
  photo_url?: string | null;
  avatar_url?: string | null;
  telegram_photo?: string | null;
  bio?: string | null;
  role?: string;
  total_points?: number;
  points?: number;
  balance?: number;
  referred_by?: string | null;
  last_seen?: string | null;
  last_login?: string | null;
  created_at?: string;
  is_online?: number | boolean;
  is_friend?: number | boolean;
  is_unsubscribed?: number | boolean;
  is_invited?: number | boolean;
  unread_messages?: number;
}

export interface FetchUsersResponse {
  data: UserListItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export const friendsService = {
  async fetchUsers(params: {
    userId?: string;
    filter?: 'all' | 'friends' | 'invited' | 'unsubscribed' | 'unread';
    sort?: 'online' | 'points' | 'balance' | 'created_at' | 'name';
    order?: 'asc' | 'desc';
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<FetchUsersResponse> {
    const q = new URLSearchParams();
    if (params.userId) q.set('userId', params.userId);
    if (params.filter) q.set('filter', params.filter);
    if (params.sort) q.set('sort', params.sort);
    if (params.order) q.set('order', params.order);
    if (params.search) q.set('search', params.search);
    q.set('limit', String(params.limit ?? 20));
    q.set('offset', String(params.offset ?? 0));

    const res = await fetch(`/api/friends/users?${q.toString()}`);
    if (!res.ok) {
      throw new Error('Ошибка загрузки списка пользователей');
    }
    return res.json();
  },

  async fetchUnreadCount(userId: string): Promise<{ unread_count: number; unread_messages_count?: number; unread_friends_count?: number }> {
    if (!userId) return { unread_count: 0, unread_messages_count: 0, unread_friends_count: 0 };
    try {
      const res = await fetch(`/api/friends/unread-count?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) return { unread_count: 0, unread_messages_count: 0, unread_friends_count: 0 };
      const data = await res.json();
      const messagesCount = data.unread_messages_count !== undefined ? data.unread_messages_count : (data.unread_count || 0);
      return {
        unread_count: messagesCount,
        unread_messages_count: messagesCount,
        unread_friends_count: data.unread_friends_count || 0
      };
    } catch (_) {
      return { unread_count: 0, unread_messages_count: 0, unread_friends_count: 0 };
    }
  },

  async addFriend(userId: string, targetUid: string): Promise<{ success: boolean; status: string }> {
    const res = await fetch('/api/friends/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, targetUid })
    });
    if (!res.ok) {
      throw new Error('Ошибка добавления в друзья');
    }
    return res.json();
  },

  async removeFriend(userId: string, targetUid: string): Promise<{ success: boolean; status: string }> {
    const res = await fetch('/api/friends/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, targetUid })
    });
    if (!res.ok) {
      throw new Error('Ошибка удаления из друзей');
    }
    return res.json();
  },

  async fetchInviter(userId: string): Promise<{ inviter: UserListItem | null }> {
    const res = await fetch(`/api/friends/inviter?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return { inviter: null };
    return res.json();
  },

  async sendHeartbeat(userId: string): Promise<void> {
    if (!userId) return;
    try {
      await fetch('/api/users/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
    } catch (_) {}
  }
};
