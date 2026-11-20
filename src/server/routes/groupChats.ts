import { Router } from 'express';
import { getAll, getOne, runSql, generateId } from '../db';
import { sendTelegramMessage } from '../telegram';
import { encryptEmojiText, decryptEmojiText } from '../emojiCrypto';
import { moderateGroupMessageWithProTalk } from '../protalkModeration';
import { resolveDirectFileUrl } from './files';
import { sendWebPushToUser } from '../push';

export const groupChatsRouter = Router();

let groupChatColumnsEnsured = false;

export async function ensureGroupChatArchiveColumns() {
  if (groupChatColumnsEnsured) return;
  try {
    await runSql(`ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS members_json TEXT`).catch(() => {});
    await runSql(`ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS admins_json TEXT`).catch(() => {});
    await runSql(`ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS banned_json TEXT`).catch(() => {});
    await runSql(`ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS members_count INTEGER DEFAULT 1`).catch(() => {});
    await runSql(`ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS is_archived INTEGER DEFAULT 0`).catch(() => {});
    await runSql(`ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`).catch(() => {});
    await runSql(`ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS archive_reason TEXT`).catch(() => {});
    await runSql(`ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS linked_room_id TEXT`).catch(() => {});
    await runSql(`ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS game_id TEXT`).catch(() => {});
    await runSql(`ALTER TABLE group_chat_messages ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'approved'`).catch(() => {});
    await runSql(`ALTER TABLE group_chat_messages ADD COLUMN IF NOT EXISTS moderation_reason TEXT`).catch(() => {});
    groupChatColumnsEnsured = true;
  } catch (_) {}
}

export async function syncMultiplayerRoomsIntoGroupChats(userUid: string, userDbId?: string) {
  try {
    await ensureGroupChatArchiveColumns();
    const uidStr = String(userUid || '');
    const dbIdStr = String(userDbId || userUid || '');
    if (!uidStr) return;

    // Find multiplayer rooms where this user is host or participant
    const userRooms = await getAll<any>(
      `SELECT DISTINCT mr.*
       FROM multiplayer_rooms mr
       LEFT JOIN multiplayer_participants mp ON mp.room_id = mr.id
       WHERE mr.host_id = $1 OR mr.host_id = $2 OR mp.user_id = $3 OR mp.user_id = $4
       ORDER BY mr.created_at DESC
       LIMIT 60`,
      [uidStr, dbIdStr, uidStr, dbIdStr]
    ).catch(() => []);

    for (const room of userRooms) {
      if (!room?.id) continue;
      const roomId = String(room.id);
      const isRoomEnded = room.status === 'finished' || room.status === 'cancelled';
      const archiveReason = room.status === 'cancelled' ? 'lobby_closed' : (room.status === 'finished' ? 'game_completed' : null);

      let gchat = await getOne<any>(
        `SELECT * FROM group_chats WHERE linked_room_id = $1 OR id = $2 LIMIT 1`,
        [roomId, `gchat_room_${roomId}`]
      );

      const roomParts = await getAll<any>(
        `SELECT user_id, role, joined_at FROM multiplayer_participants WHERE room_id = $1`,
        [roomId]
      ).catch(() => []);

      if (!gchat) {
        const chatId = `gchat_room_${roomId}`;
        const gTitleBase = room.game_title || (room.game_id === 'jeopardy' ? 'Своя Икра' : room.game_id === '100to1' ? 'Сто Квадному' : 'КвИИз');
        const chatTitle = room.topic ? `${gTitleBase}: ${room.topic}` : `Игровой чат: ${gTitleBase}`;
        const chatDesc = `Чат лобби и игры (${gTitleBase})`;
        const hostUid = String(room.host_id || uidStr);

        await runSql(
          `INSERT INTO group_chats (
            id, title, description, creator_id, ai_moderation_enabled, is_archived, archived_at, archive_reason, linked_room_id, game_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, 1, $5, $6::timestamptz, $7, $8, $9, COALESCE($10::timestamptz, NOW()), COALESCE($11::timestamptz, NOW()))
          ON CONFLICT DO NOTHING`,
          [
            chatId,
            chatTitle,
            chatDesc,
            hostUid,
            isRoomEnded ? 1 : 0,
            isRoomEnded ? (room.finished_at || room.created_at || new Date().toISOString()) : null,
            archiveReason,
            roomId,
            room.game_id || 'blitz',
            room.created_at || null,
            room.finished_at || room.created_at || null
          ]
        ).catch(() => {});

        // Add host & participants to group_chat_members
        const memberIds = new Set<string>([hostUid]);
        for (const p of roomParts) {
          const pid = String(p.user_id || '');
          if (pid && !pid.endsWith('_self2')) memberIds.add(pid);
        }
        memberIds.add(uidStr);

        for (const mUid of memberIds) {
          const mRole = mUid === hostUid ? 'owner' : 'member';
          await runSql(
            `INSERT INTO group_chat_members (id, chat_id, user_id, role, is_banned, joined_at)
             VALUES ($1, $2, $3, $4, 0, COALESCE($5::timestamptz, NOW()))
             ON CONFLICT DO NOTHING`,
            [`gcm_${chatId}_${mUid}`, chatId, mUid, mRole, room.created_at || null]
          ).catch(() => {});
        }

        gchat = { id: chatId, is_archived: isRoomEnded ? 1 : 0, linked_room_id: roomId };
      } else {
        // Ensure current user and participants are members so they can see the chat in /profile/ref
        const hostUid = String(room.host_id || gchat.creator_id || uidStr);
        const memberIds = new Set<string>([hostUid, uidStr]);
        for (const p of roomParts) {
          const pid = String(p.user_id || '');
          if (pid && !pid.endsWith('_self2')) memberIds.add(pid);
        }
        for (const mUid of memberIds) {
          const existingMem = await getOne<any>(
            `SELECT id FROM group_chat_members WHERE chat_id = $1 AND user_id = $2`,
            [gchat.id, mUid]
          );
          if (!existingMem) {
            const mRole = mUid === hostUid ? 'owner' : 'member';
            await runSql(
              `INSERT INTO group_chat_members (id, chat_id, user_id, role, is_banned, joined_at)
               VALUES ($1, $2, $3, $4, 0, NOW())
               ON CONFLICT DO NOTHING`,
              [`gcm_${gchat.id}_${mUid}`, gchat.id, mUid, mRole]
            ).catch(() => {});
          }
        }

        if (isRoomEnded && Number(gchat.is_archived) !== 1) {
          await runSql(
            `UPDATE group_chats
             SET is_archived = 1,
                 archived_at = COALESCE(archived_at, $1::timestamptz, NOW()),
                 archive_reason = COALESCE(archive_reason, $2),
                 updated_at = NOW()
             WHERE id = $3`,
            [room.finished_at || null, archiveReason || 'game_completed', gchat.id]
          ).catch(() => {});
        }
      }

      // Sync chat messages from multiplayer_actions into group_chat_messages
      const roomChatActions = await getAll<any>(
        `SELECT id, user_id, action_type, payload_json, created_at
         FROM multiplayer_actions
         WHERE room_id = $1 AND action_type IN ('chat', 'start')
         ORDER BY created_at ASC`,
        [roomId]
      ).catch(() => []);

      for (const act of roomChatActions) {
        const syncedMsgId = `gmsg_mp_${act.id}`;
        const existingMsg = await getOne<any>(
          `SELECT id FROM group_chat_messages WHERE id = $1`,
          [syncedMsgId]
        );
        if (!existingMsg) {
          let p: any = {};
          try {
            p = typeof act.payload_json === 'string' ? JSON.parse(act.payload_json) : (act.payload_json || {});
          } catch (_) {}
          const rawText = String(p.text || p.message || '').trim();
          if (!rawText && !p.attachment_url) continue;
          const senderUid = String(act.user_id || room.host_id || uidStr).replace(/_self2$/, '');
          const encText = encryptEmojiText(rawText || 'Вложение');
          await runSql(
            `INSERT INTO group_chat_messages (
              id, chat_id, sender_id, message, is_edited, media_url, media_type, file_name, moderation_status, created_at
            ) VALUES ($1, $2, $3, $4, 0, $5, $6, $7, 'approved', COALESCE($8::timestamptz, NOW()))
            ON CONFLICT DO NOTHING`,
            [
              syncedMsgId,
              gchat.id,
              senderUid,
              encText,
              p.attachment_url || null,
              p.attachment_type || null,
              p.attachment_name || null,
              act.created_at || null
            ]
          ).catch(() => {});
        }
      }
    }

    // Also auto-archive any group_chats whose linked_room_id is finished/cancelled or deleted
    const linkedChats = await getAll<any>(
      `SELECT gc.id, gc.linked_room_id, mr.status, mr.finished_at
       FROM group_chats gc
       LEFT JOIN multiplayer_rooms mr ON mr.id = gc.linked_room_id
       WHERE gc.linked_room_id IS NOT NULL AND gc.linked_room_id != '' AND COALESCE(gc.is_archived, 0) = 0`
    ).catch(() => []);

    for (const lc of linkedChats) {
      if (!lc.status || lc.status === 'finished' || lc.status === 'cancelled') {
        const reason = !lc.status || lc.status === 'cancelled' ? 'lobby_closed' : 'game_completed';
        await runSql(
          `UPDATE group_chats
           SET is_archived = 1,
               archived_at = COALESCE(archived_at, $1::timestamptz, NOW()),
               archive_reason = COALESCE(archive_reason, $2),
               updated_at = NOW()
           WHERE id = $3`,
          [lc.finished_at || null, reason, lc.id]
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[GroupChats Router] syncMultiplayerRoomsIntoGroupChats warn:', err);
  }
}

// Helper to keep members_json, admins_json, and members_count in sync on group_chats table
export async function syncGroupChatJsonData(chatId: string) {
  try {
    await ensureGroupChatArchiveColumns();

    const members = await getAll<any>(
      `SELECT 
        m.id,
        m.id as member_record_id,
        m.chat_id,
        m.user_id,
        m.role,
        m.is_banned,
        m.banned_at,
        m.banned_by,
        m.joined_at,
        u.id as user_db_id,
        u.uid,
        u.display_name,
        u.username,
        u.photo_url,
        u.avatar_url,
        u.telegram_photo,
        CASE 
          WHEN u.last_seen IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - u.last_seen::timestamptz)) <= 180 THEN 1 
          ELSE 0 
        END as is_online
      FROM group_chat_members m
      JOIN users u ON (u.uid = m.user_id OR u.id = m.user_id)
      WHERE m.chat_id = $1
      ORDER BY 
        CASE m.role 
          WHEN 'owner' THEN 1 
          WHEN 'admin' THEN 2 
          ELSE 3 
        END,
        m.joined_at ASC`,
      [chatId]
    );

    const activeMembers = members.filter((m) => !m.is_banned);
    const admins = members.filter((m) => (m.role === 'admin' || m.role === 'owner') && !m.is_banned);
    const banned = members.filter((m) => Boolean(m.is_banned));

    await runSql(
      `UPDATE group_chats 
       SET members_json = $1, admins_json = $2, banned_json = $3, members_count = $4, updated_at = NOW()
       WHERE id = $5`,
      [
        JSON.stringify(activeMembers),
        JSON.stringify(admins),
        JSON.stringify(banned),
        activeMembers.length,
        chatId,
      ]
    );
  } catch (err) {
    console.warn('[GroupChats Router] syncGroupChatJsonData warn:', err);
  }
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// GET /api/group-chats?userId=...
// Lists all group chats that the user is a member of (and not banned)
groupChatsRouter.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId обязателен' });
    }

    const me = await getOne<{ id: string; uid: string }>('SELECT id, uid FROM users WHERE uid = $1 OR id = $2', [
      userId,
      userId,
    ]);
    if (!me) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    await ensureGroupChatArchiveColumns();
    await syncMultiplayerRoomsIntoGroupChats(me.uid, me.id);

    const chats = await getAll<any>(
      `SELECT 
        gc.id,
        gc.title,
        gc.description,
        gc.avatar_url,
        gc.creator_id,
        gc.ai_moderation_enabled,
        COALESCE(gc.is_archived, 0) as is_archived,
        gc.archived_at,
        gc.archive_reason,
        gc.linked_room_id,
        gc.game_id,
        gc.created_at,
        gc.updated_at,
        gcm.role,
        gcm.joined_at,
        gcm.last_read_at,
        (
          SELECT COUNT(*)::int FROM group_chat_members 
          WHERE chat_id = gc.id AND is_banned = 0
        ) as members_count,
        (
          SELECT COUNT(*)::int FROM group_chat_messages 
          WHERE chat_id = gc.id AND created_at > COALESCE(gcm.last_read_at, '1970-01-01'::timestamptz)
            AND sender_id != $1
        ) as unread_count,
        (
          SELECT message FROM group_chat_messages 
          WHERE chat_id = gc.id 
          ORDER BY created_at DESC LIMIT 1
        ) as last_message_raw,
        (
          SELECT created_at FROM group_chat_messages 
          WHERE chat_id = gc.id 
          ORDER BY created_at DESC LIMIT 1
        ) as last_message_time,
        (
          SELECT u.display_name FROM group_chat_messages m
          JOIN users u ON (u.uid = m.sender_id OR u.id = m.sender_id)
          WHERE m.chat_id = gc.id 
          ORDER BY m.created_at DESC LIMIT 1
        ) as last_message_sender_name
      FROM group_chats gc
      JOIN group_chat_members gcm ON gcm.chat_id = gc.id
      WHERE (gcm.user_id = $2 OR gcm.user_id = $3) AND gcm.is_banned = 0
      ORDER BY COALESCE(last_message_time, gc.created_at) DESC`,
      [me.uid, me.uid, me.id]
    );

    const excludeArchived =
      req.query.exclude_archived === '1' ||
      req.query.exclude_archived === 'true' ||
      req.query.invite_only === '1' ||
      req.query.invite_only === 'true';
    const onlyGroupChats =
      req.query.only_group_chats === '1' ||
      req.query.only_group_chats === 'true' ||
      req.query.invite_only === '1' ||
      req.query.invite_only === 'true';

    const filteredChats = (chats || []).filter((chat) => {
      if (excludeArchived) {
        if (Number(chat.is_archived) === 1 || Boolean(chat.archived_at) || Boolean(chat.archive_reason)) {
          return false;
        }
      }
      if (onlyGroupChats) {
        if (Boolean(chat.linked_room_id) || String(chat.id || '').startsWith('gchat_room_')) {
          return false;
        }
      }
      return true;
    });

    const formatted = filteredChats.map((chat) => ({
      ...chat,
      last_message: decryptEmojiText(chat.last_message_raw),
    }));

    res.json({ data: formatted });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in GET /:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/group-chats
// Create a new group chat
groupChatsRouter.post('/', async (req, res) => {
  try {
    const {
      userId,
      title,
      description,
      avatar_url,
      ai_moderation_enabled,
      initialMemberUids,
    } = req.body;

    if (!userId || !title || !String(title).trim()) {
      return res.status(400).json({ error: 'userId и название чата обязательны' });
    }

    const me = await getOne<{ id: string; uid: string; display_name: string; username: string }>(
      'SELECT id, uid, display_name, username FROM users WHERE uid = $1 OR id = $2',
      [userId, userId]
    );
    if (!me) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const chatId = generateId('grp');
    const cleanTitle = String(title).trim();
    const cleanDesc = description ? String(description).trim() : null;
    const rawAvatar = avatar_url ? String(avatar_url).trim() : null;
    const cleanAvatar = rawAvatar && rawAvatar.includes('/file/') ? await resolveDirectFileUrl(rawAvatar) : rawAvatar;
    const isAiMod = 1; // AI-модератор работает всегда

    await runSql(
      `INSERT INTO group_chats (id, title, description, avatar_url, creator_id, ai_moderation_enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [chatId, cleanTitle, cleanDesc, cleanAvatar, me.uid, isAiMod]
    );

    // Add creator as owner
    await runSql(
      `INSERT INTO group_chat_members (id, chat_id, user_id, role, is_banned, joined_at, last_read_at)
       VALUES ($1, $2, $3, 'owner', 0, NOW(), NOW())`,
      [generateId('gcm'), chatId, me.uid]
    );

    // Add initial members if provided
    if (Array.isArray(initialMemberUids) && initialMemberUids.length > 0) {
      for (const targetUid of initialMemberUids) {
        if (!targetUid || targetUid === me.uid) continue;
        const target = await getOne<{ id: string; uid: string; telegram_id: string | null }>(
          'SELECT id, uid, telegram_id FROM users WHERE uid = $1 OR id = $2',
          [targetUid, targetUid]
        );
        if (target) {
          await runSql(
            `INSERT INTO group_chat_members (id, chat_id, user_id, role, is_banned, joined_at, last_read_at)
             VALUES ($1, $2, $3, 'member', 0, NOW(), NOW())
             ON CONFLICT (chat_id, user_id) DO NOTHING`,
            [generateId('gcm'), chatId, target.uid]
          );

          // In-app notification
          await runSql(
            `INSERT INTO notifications (id, user_id, type, title, message, reference_id, is_read, created_at)
             VALUES ($1, $2, 'group_chat', $3, $4, $5, 0, NOW())`,
            [
              generateId('notif'),
              target.id,
              'Вас добавили в групповой чат',
              `${me.display_name || 'Друг'} добавил вас в группу «${cleanTitle}»`,
              chatId,
            ]
          ).catch(() => {});

          sendWebPushToUser(target.uid || target.id, {
            title: 'Вас добавили в групповой чат',
            body: `${me.display_name || 'Друг'} добавил вас в группу «${cleanTitle}»`,
            type: 'group_message',
            referenceId: chatId,
          }).catch(() => {});

          // Telegram alert if linked
          if (target.telegram_id) {
            const tgMsg = `👥 <b>Приглашение в групповой чат!</b>\n\nИгрок <b>${escapeHtml(
              me.display_name || 'Друг'
            )}</b> добавил вас в беседу «<b>${escapeHtml(cleanTitle)}</b>».`;
            sendTelegramMessage({
              chatId: target.telegram_id,
              text: tgMsg,
              parseMode: 'HTML',
            }).catch(() => {});
          }
        }
      }
    }

    await syncGroupChatJsonData(chatId);

    res.json({
      success: true,
      chat: {
        id: chatId,
        title: cleanTitle,
        description: cleanDesc,
        avatar_url: cleanAvatar,
        creator_id: me.uid,
        ai_moderation_enabled: isAiMod,
      },
    });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in POST /:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/group-chats/:chatId?userId=...
// Full chat metadata and member details
groupChatsRouter.get('/:chatId', async (req, res) => {
  try {
    await ensureGroupChatArchiveColumns();
    const { chatId } = req.params;
    const { userId } = req.query;

    if (userId) {
      await syncMultiplayerRoomsIntoGroupChats(String(userId), String(userId));
    }

    const chat = await getOne<any>('SELECT * FROM group_chats WHERE id = $1', [chatId]);
    if (!chat) {
      return res.status(404).json({ error: 'Групповой чат не найден' });
    }

    let myMembership: any = null;
    if (userId) {
      myMembership = await getOne<any>(
        'SELECT * FROM group_chat_members WHERE chat_id = $1 AND (user_id = $2 OR user_id = (SELECT uid FROM users WHERE id = $3))',
        [chatId, userId, userId]
      );
    }

    const members = await getAll<any>(
      `SELECT 
        m.id,
        m.id as member_record_id,
        m.chat_id,
        m.user_id,
        m.role,
        m.is_banned,
        m.banned_at,
        m.banned_by,
        m.joined_at,
        u.id as user_db_id,
        u.uid,
        u.display_name,
        u.username,
        u.photo_url,
        u.avatar_url,
        u.telegram_photo,
        CASE 
          WHEN u.last_seen IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - u.last_seen::timestamptz)) <= 180 THEN 1 
          ELSE 0 
        END as is_online
      FROM group_chat_members m
      JOIN users u ON (u.uid = m.user_id OR u.id = m.user_id)
      WHERE m.chat_id = $1
      ORDER BY 
        CASE m.role 
          WHEN 'owner' THEN 1 
          WHEN 'admin' THEN 2 
          ELSE 3 
        END,
        m.joined_at ASC`,
      [chatId]
    );

    const activeMembers = (members || []).filter((m) => !m.is_banned);
    const admins = (members || []).filter((m) => (m.role === 'admin' || m.role === 'owner') && !m.is_banned);

    res.json({
      chat: {
        ...chat,
        members_count: activeMembers.length,
        members_json: JSON.stringify(activeMembers),
        admins_json: JSON.stringify(admins),
      },
      myMembership,
      members,
      admins,
      members_count: activeMembers.length,
    });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in GET /:chatId:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/group-chats/:chatId
// Edit chat details (owner or admin only)
groupChatsRouter.put('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId, title, description, avatar_url, ai_moderation_enabled } = req.body;

    const me = await getOne<{ uid: string }>('SELECT uid FROM users WHERE uid = $1 OR id = $2', [userId, userId]);
    if (!me) return res.status(404).json({ error: 'Пользователь не найден' });

    const member = await getOne<{ role: string; is_banned: number }>(
      'SELECT role, is_banned FROM group_chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, me.uid]
    );

    if (!member || member.is_banned || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Только владелец или администратор может редактировать настройки чата' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (title !== undefined && String(title).trim()) {
      updates.push(`title = $${pIdx++}`);
      params.push(String(title).trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${pIdx++}`);
      params.push(String(description || '').trim() || null);
    }
    if (avatar_url !== undefined) {
      const rawAv = String(avatar_url || '').trim() || null;
      const normAv = rawAv && rawAv.includes('/file/') ? await resolveDirectFileUrl(rawAv) : rawAv;
      updates.push(`avatar_url = $${pIdx++}`);
      params.push(normAv);
    }
    // AI-модератор в групповых чатах активен всегда
    updates.push(`ai_moderation_enabled = $${pIdx++}`);
    params.push(1);

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(chatId);
      await runSql(`UPDATE group_chats SET ${updates.join(', ')} WHERE id = $${pIdx}`, params);
      await syncGroupChatJsonData(chatId);
    }

    const updatedChat = await getOne('SELECT * FROM group_chats WHERE id = $1', [chatId]);
    res.json({ success: true, chat: updatedChat });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in PUT /:chatId:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/group-chats/:chatId/members
// Add one or more members
groupChatsRouter.post('/:chatId/members', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId, targetUids } = req.body;

    const me = await getOne<{ uid: string; display_name: string }>('SELECT uid, display_name FROM users WHERE uid = $1 OR id = $2', [
      userId,
      userId,
    ]);
    if (!me) return res.status(404).json({ error: 'Пользователь не найден' });

    const member = await getOne<{ role: string; is_banned: number }>(
      'SELECT role, is_banned FROM group_chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, me.uid]
    );
    if (!member || member.is_banned) {
      return res.status(403).json({ error: 'Вы не являетесь активным участником этого чата' });
    }

    const chat = await getOne<{ title: string }>('SELECT title FROM group_chats WHERE id = $1', [chatId]);
    const added: string[] = [];

    const uids: string[] = Array.isArray(targetUids) ? targetUids : [targetUids];
    for (const uid of uids) {
      if (!uid) continue;
      const targetUser = await getOne<{ id: string; uid: string; telegram_id: string | null }>(
        'SELECT id, uid, telegram_id FROM users WHERE uid = $1 OR id = $2',
        [uid, uid]
      );
      if (!targetUser) continue;

      await runSql(
        `INSERT INTO group_chat_members (id, chat_id, user_id, role, is_banned, joined_at, last_read_at)
         VALUES ($1, $2, $3, 'member', 0, NOW(), NOW())
         ON CONFLICT(chat_id, user_id) DO UPDATE SET is_banned = 0`,
        [generateId('gcm'), chatId, targetUser.uid]
      );
      added.push(targetUser.uid);

      // Notification
      await runSql(
        `INSERT INTO notifications (id, user_id, type, title, message, reference_id, is_read, created_at)
         VALUES ($1, $2, 'group_chat', $3, $4, $5, 0, NOW())`,
        [
          generateId('notif'),
          targetUser.id,
          'Вас добавили в групповой чат',
          `${me.display_name || 'Друг'} добавил вас в беседу «${chat?.title || 'Групповой чат'}»`,
          chatId,
        ]
      ).catch(() => {});

      sendWebPushToUser(targetUser.uid || targetUser.id, {
        title: 'Вас добавили в групповой чат',
        body: `${me.display_name || 'Друг'} добавил вас в беседу «${chat?.title || 'Групповой чат'}»`,
        type: 'group_message',
        referenceId: chatId,
      }).catch(() => {});

      if (targetUser.telegram_id) {
        sendTelegramMessage({
          chatId: targetUser.telegram_id,
          text: `👥 <b>Новая беседа!</b>\n\nИгрок <b>${escapeHtml(
            me.display_name || 'Друг'
          )}</b> добавил вас в групповой чат «<b>${escapeHtml(chat?.title || 'Групповой чат')}</b>».`,
          parseMode: 'HTML',
        }).catch(() => {});
      }
    }

    await syncGroupChatJsonData(chatId);
    res.json({ success: true, added });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in POST /:chatId/members:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/group-chats/:chatId/members/:targetUid
// Remove a member or leave chat
groupChatsRouter.delete('/:chatId/members/:targetUid', async (req, res) => {
  try {
    const { chatId, targetUid } = req.params;
    const { userId } = req.query;

    const me = await getOne<{ uid: string }>('SELECT uid FROM users WHERE uid = $1 OR id = $2', [userId, userId]);
    if (!me) return res.status(404).json({ error: 'Пользователь не найден' });

    const isLeavingSelf = me.uid === targetUid;

    if (!isLeavingSelf) {
      // Must be owner or admin to kick
      const myMembership = await getOne<{ role: string; is_banned: number }>(
        'SELECT role, is_banned FROM group_chat_members WHERE chat_id = $1 AND user_id = $2',
        [chatId, me.uid]
      );
      if (!myMembership || myMembership.is_banned || !['owner', 'admin'].includes(myMembership.role)) {
        return res.status(403).json({ error: 'Недостаточно прав для удаления участника' });
      }

      const targetMembership = await getOne<{ role: string }>(
        'SELECT role FROM group_chat_members WHERE chat_id = $1 AND user_id = $2',
        [chatId, targetUid]
      );
      if (targetMembership?.role === 'owner') {
        return res.status(403).json({ error: 'Нельзя удалить создателя чата' });
      }
    }

    await runSql('DELETE FROM group_chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, targetUid]);
    await syncGroupChatJsonData(chatId);

    res.json({ success: true, message: isLeavingSelf ? 'Вы покинули чат' : 'Участник удален' });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in DELETE /:chatId/members:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/group-chats/:chatId/members/:targetUid/ban
// Ban or unban a user (owner or admin)
groupChatsRouter.post('/:chatId/members/:targetUid/ban', async (req, res) => {
  try {
    const { chatId, targetUid } = req.params;
    const { userId, is_banned } = req.body;

    const me = await getOne<{ uid: string }>('SELECT uid FROM users WHERE uid = $1 OR id = $2', [userId, userId]);
    if (!me) return res.status(404).json({ error: 'Пользователь не найден' });

    const myMembership = await getOne<{ role: string; is_banned: number }>(
      'SELECT role, is_banned FROM group_chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, me.uid]
    );
    if (!myMembership || myMembership.is_banned || !['owner', 'admin'].includes(myMembership.role)) {
      return res.status(403).json({ error: 'Только владелец или администратор может блокировать участников' });
    }

    const targetMembership = await getOne<{ role: string }>(
      'SELECT role FROM group_chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, targetUid]
    );
    if (targetMembership?.role === 'owner') {
      return res.status(403).json({ error: 'Нельзя заблокировать создателя чата' });
    }

    const banValue = is_banned ? 1 : 0;
    await runSql(
      `UPDATE group_chat_members 
       SET is_banned = $1, banned_at = CASE WHEN $2::int = 1 THEN NOW() ELSE NULL END, banned_by = CASE WHEN $3::int = 1 THEN $4 ELSE NULL END
       WHERE chat_id = $5 AND user_id = $6`,
      [banValue, banValue, banValue, me.uid, chatId, targetUid]
    );
    await syncGroupChatJsonData(chatId);

    res.json({ success: true, is_banned: banValue });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in ban member:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/group-chats/:chatId/members/:targetUid/role
// Promote to admin or demote to member (owner or creator)
groupChatsRouter.post('/:chatId/members/:targetUid/role', async (req, res) => {
  try {
    const { chatId, targetUid } = req.params;
    const { userId, role } = req.body;

    const me = await getOne<{ uid: string }>('SELECT uid FROM users WHERE uid = $1 OR id = $2', [userId, userId]);
    if (!me) return res.status(404).json({ error: 'Пользователь не найден' });

    const chat = await getOne<{ creator_id: string }>('SELECT creator_id FROM group_chats WHERE id = $1', [chatId]);
    const myMembership = await getOne<{ role: string }>('SELECT role FROM group_chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, me.uid]);
    
    const isOwner = chat?.creator_id === me.uid || myMembership?.role === 'owner';
    if (!isOwner) {
      return res.status(403).json({ error: 'Только создатель чата может назначать администраторов' });
    }

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Недопустимая роль' });
    }

    await runSql('UPDATE group_chat_members SET role = $1 WHERE chat_id = $2 AND user_id = $3', [role, chatId, targetUid]);
    await syncGroupChatJsonData(chatId);

    const updatedMembers = await getAll<any>(
      `SELECT 
        m.id,
        m.id as member_record_id,
        m.chat_id,
        m.user_id,
        m.role,
        m.is_banned,
        m.banned_at,
        m.banned_by,
        m.joined_at,
        u.id as user_db_id,
        u.uid,
        u.display_name,
        u.username,
        u.photo_url,
        u.avatar_url,
        u.telegram_photo,
        CASE 
          WHEN u.last_seen IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - u.last_seen::timestamptz)) <= 180 THEN 1 
          ELSE 0 
        END as is_online
      FROM group_chat_members m
      JOIN users u ON (u.uid = m.user_id OR u.id = m.user_id)
      WHERE m.chat_id = $1
      ORDER BY 
        CASE m.role 
          WHEN 'owner' THEN 1 
          WHEN 'admin' THEN 2 
          ELSE 3 
        END,
        m.joined_at ASC`,
      [chatId]
    );

    res.json({ success: true, role, members: updatedMembers });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in update role:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/group-chats/:chatId/messages?userId=...
// Fetch messages in chat
groupChatsRouter.get('/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.query;

    if (!userId) return res.status(400).json({ error: 'userId обязателен' });

    const me = await getOne<{ uid: string }>('SELECT uid FROM users WHERE uid = $1 OR id = $2', [userId, userId]);
    if (!me) return res.status(404).json({ error: 'Пользователь не найден' });

    const member = await getOne<{ is_banned: number }>(
      'SELECT is_banned FROM group_chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, me.uid]
    );
    if (!member) {
      return res.status(403).json({ error: 'Вы не состоите в этом чате' });
    }

    // Update last_read_at
    await runSql(`UPDATE group_chat_members SET last_read_at = NOW() WHERE chat_id = $1 AND user_id = $2`, [
      chatId,
      me.uid,
    ]);

    const messages = await getAll<any>(
      `SELECT 
        m.*,
        u.display_name as sender_name,
        u.username as sender_username,
        u.photo_url as sender_photo,
        u.avatar_url as sender_avatar,
        u.telegram_photo as sender_tg_photo,
        gcm.role as sender_role,
        reply.message as reply_message_raw,
        reply_u.display_name as reply_sender_name
      FROM group_chat_messages m
      LEFT JOIN users u ON (u.uid = m.sender_id OR u.id = m.sender_id)
      LEFT JOIN group_chat_members gcm ON (gcm.chat_id = m.chat_id AND gcm.user_id = m.sender_id)
      LEFT JOIN group_chat_messages reply ON (reply.id = m.reply_to_id)
      LEFT JOIN users reply_u ON (reply_u.uid = reply.sender_id OR reply_u.id = reply.sender_id)
      WHERE m.chat_id = $1
      ORDER BY m.created_at ASC
      LIMIT 150`,
      [chatId]
    );

    const decrypted = (messages || []).map((msg) => ({
      ...msg,
      message: decryptEmojiText(msg.message),
      reply_message: msg.reply_message_raw ? decryptEmojiText(msg.reply_message_raw) : null,
    }));

    res.json({ data: decrypted });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in GET /:chatId/messages:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/group-chats/:chatId/messages
// Send a message to the group chat
groupChatsRouter.post('/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId, message, reply_to_id, media_url, media_type, file_name, file_size, game_invite } = req.body;

    if (!userId || (!message && !media_url && !game_invite)) {
      return res.status(400).json({ error: 'userId и содержимое сообщения обязательны' });
    }

    const me = await getOne<{ id: string; uid: string; display_name: string; username: string }>(
      'SELECT id, uid, display_name, username FROM users WHERE uid = $1 OR id = $2',
      [userId, userId]
    );
    if (!me) return res.status(404).json({ error: 'Пользователь не найден' });

    const member = await getOne<{ is_banned: number }>(
      'SELECT is_banned FROM group_chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, me.uid]
    );
    if (!member) {
      return res.status(403).json({ error: 'Вы не состоите в этом чате' });
    }
    if (member.is_banned) {
      return res.status(403).json({ error: 'Вы заблокированы в этом чате и не можете отправлять сообщения' });
    }

    const chat = await getOne<any>('SELECT * FROM group_chats WHERE id = $1', [chatId]);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (Number(chat.is_archived) === 1) {
      return res.status(403).json({ error: 'Этот чат находится в архиве. В архивном чате нельзя писать сообщения.' });
    }

    const cleanText = String(message || '').trim();

    // AI Moderation check: runs for group messages unless it is an invitation (as requested)
    let moderationStatus: 'approved' | 'rejected' = 'approved';
    let moderationReason: string | null = null;

    const isInvite = Boolean(
      req.body.is_invite || 
      req.body.game_invite || 
      cleanText.includes('/zoom') || 
      cleanText.includes('/multiplayer') || 
      cleanText.includes('Приглашение') ||
      cleanText.includes('приглашает вас')
    );

    if (cleanText && !isInvite) {
      const moderationResult = await moderateGroupMessageWithProTalk(cleanText, chatId, me.uid, null);
      if (!moderationResult.allowed) {
        return res.status(400).json({
          error: `Сообщение отклонено ИИ-модератором: ${moderationResult.reason || 'Нарушение правил общения'}`,
          moderation_reason: moderationResult.reason || 'Нарушение правил общения',
          moderated: true,
        });
      }
      moderationStatus = 'approved';
      moderationReason = moderationResult.reason || null;
    }

    // Encrypt the text into emoji runes for database storage
    const encryptedText = encryptEmojiText(cleanText);
    const msgId = generateId('gmsg');
    const gameInviteJson = game_invite
      ? typeof game_invite === 'string'
        ? game_invite
        : JSON.stringify(game_invite)
      : null;

    await runSql(
      `INSERT INTO group_chat_messages (
        id, chat_id, sender_id, message, reply_to_id, is_edited, media_url, media_type, file_name, file_size, game_invite, moderation_status, moderation_reason, created_at
      ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12, NOW())`,
      [
        msgId,
        chatId,
        me.uid,
        encryptedText,
        reply_to_id || null,
        media_url || null,
        media_type || (media_url ? 'file' : null),
        file_name || null,
        file_size ? Number(file_size) : null,
        gameInviteJson,
        moderationStatus,
        moderationReason,
      ]
    );

    // Update last_seen
    await runSql(`UPDATE users SET last_seen = NOW() WHERE uid = $1`, [me.uid]);
    // Update sender's last_read_at
    await runSql(`UPDATE group_chat_members SET last_read_at = NOW() WHERE chat_id = $1 AND user_id = $2`, [
      chatId,
      me.uid,
    ]);

    // Fetch reply info if any
    let replySenderName: string | null = null;
    let replyText: string | null = null;
    let parentSenderId: string | null = null;
    if (reply_to_id) {
      const parentMsg = await getOne<any>(
        `SELECT m.sender_id, m.message, u.display_name 
         FROM group_chat_messages m
         LEFT JOIN users u ON (u.uid = m.sender_id OR u.id = m.sender_id)
         WHERE m.id = $1`,
        [reply_to_id]
      );
      if (parentMsg) {
        parentSenderId = parentMsg.sender_id;
        replySenderName = parentMsg.display_name;
        replyText = decryptEmojiText(parentMsg.message);
      }
    }

    // Direct link to chat and message for Telegram deep linking
    const reqHost = req.get('host') || 'qaiz.ru';
    const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const siteUrl = `${proto}://${reqHost}`;
    const chatDirectLink = `${siteUrl}/chat-${chatId}-mes${msgId}`;

    // Notify other members
    (async () => {
      try {
        const previewText = cleanText || (media_type === 'audio' ? '🎤 Голосовое сообщение' : '📎 Вложение');

        // Check if replied to a specific user
        if (parentSenderId && parentSenderId !== me.uid) {
          const repliedUser = await getOne<any>(
            `SELECT u.id, u.uid, u.telegram_id,
              CASE 
                WHEN u.last_seen IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - u.last_seen::timestamptz)) <= 180 THEN 1 
                ELSE 0 
              END as is_online
             FROM users u WHERE u.uid = $1 OR u.id = $2`,
            [parentSenderId, parentSenderId]
          );

          if (repliedUser) {
            // High-priority in-app notification for replied user
            await runSql(
              `INSERT INTO notifications (id, user_id, type, title, message, reference_id, is_read, created_at)
               VALUES ($1, $2, 'group_reply', $3, $4, $5, 0, NOW())`,
              [
                generateId('notif'),
                repliedUser.id,
                `Ответ на ваше сообщение в «${chat.title}»`,
                `${me.display_name || 'Участник'}: ${previewText.slice(0, 120)}`,
                `chat-${chatId}-mes${msgId}`,
              ]
            ).catch(() => {});

            sendWebPushToUser(repliedUser.uid || repliedUser.id, {
              title: `Ответ в «${chat.title}»`,
              body: `${me.display_name || 'Участник'}: ${previewText.slice(0, 120)}`,
              type: 'group_reply',
              referenceId: `chat-${chatId}-mes${msgId}`,
            }).catch(() => {});

            if (!repliedUser.is_online && repliedUser.telegram_id) {
              const replyTgText = `💬 <b>Вам ответили в беседе «${escapeHtml(chat.title)}»!</b>\n\n` +
                `👤 <b>${escapeHtml(me.display_name || 'Участник')}:</b> ${escapeHtml(previewText.slice(0, 300))}\n\n` +
                `🔗 <a href="${chatDirectLink}">Перейти к ответу</a>`;

              sendTelegramMessage({
                chatId: repliedUser.telegram_id,
                text: replyTgText,
                parseMode: 'HTML',
                replyMarkup: {
                  inline_keyboard: [
                    [{ text: '💬 Открыть ответ', url: chatDirectLink, style: 'success' }]
                  ]
                }
              }).catch(() => {});
            }
          }
        }

        const otherMembers = await getAll<any>(
          `SELECT u.id, u.uid, u.telegram_id, 
            CASE 
              WHEN u.last_seen IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - u.last_seen::timestamptz)) <= 180 THEN 1 
              ELSE 0 
            END as is_online
           FROM group_chat_members gcm
           JOIN users u ON (u.uid = gcm.user_id OR u.id = gcm.user_id)
           WHERE gcm.chat_id = $1 AND gcm.user_id != $2 AND gcm.is_banned = 0`,
          [chatId, me.uid]
        );

        for (const om of otherMembers || []) {
          // Skip general notification if user already received group_reply
          if (parentSenderId && (om.uid === parentSenderId || om.id === parentSenderId)) {
            continue;
          }

          // In-app notification
          await runSql(
            `INSERT INTO notifications (id, user_id, type, title, message, reference_id, is_read, created_at)
             VALUES ($1, $2, 'group_message', $3, $4, $5, 0, NOW())`,
            [
              generateId('notif'),
              om.id,
              `Сообщение в «${chat.title}»`,
              `${me.display_name || 'Участник'}: ${previewText.slice(0, 100)}`,
              chatId,
            ]
          ).catch(() => {});

          sendWebPushToUser(om.uid || om.id, {
            title: `Сообщение в «${chat.title}»`,
            body: `${me.display_name || 'Участник'}: ${previewText.slice(0, 100)}`,
            type: 'group_message',
            referenceId: chatId,
          }).catch(() => {});

          // Telegram alert if offline (skip if already notified via reply)
          if (!om.is_online && om.telegram_id && (!parentSenderId || om.uid !== parentSenderId)) {
            const tgBody = `💬 <b>Новое сообщение в «${escapeHtml(chat.title)}»</b>\n\n` +
              `👤 <b>${escapeHtml(me.display_name || 'Участник')}:</b> ${escapeHtml(previewText.slice(0, 300))}\n\n` +
              `🔗 <a href="${chatDirectLink}">Перейти в чат</a>`;

            sendTelegramMessage({
              chatId: om.telegram_id,
              text: tgBody,
              parseMode: 'HTML',
              replyMarkup: {
                inline_keyboard: [
                  [{ text: '💬 Открыть беседу', url: chatDirectLink, style: 'success' }]
                ]
              }
            }).catch(() => {});
          }
        }
      } catch (notifErr) {
        console.warn('[GroupChats Router] Notification warning:', notifErr);
      }
    })();

    res.json({
      success: true,
      message: {
        id: msgId,
        chat_id: chatId,
        sender_id: me.uid,
        sender_name: me.display_name,
        message: cleanText,
        reply_to_id: reply_to_id || null,
        reply_sender_name: replySenderName,
        reply_message: replyText,
        media_url: media_url || null,
        media_type: media_type || (media_url ? 'file' : null),
        file_name: file_name || null,
        file_size: file_size ? Number(file_size) : null,
        game_invite: gameInviteJson,
        moderation_status: moderationStatus,
        moderation_reason: moderationReason,
        is_edited: 0,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in POST /:chatId/messages:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/group-chats/:chatId/messages/:messageId
// Edit an existing message (only sender)
groupChatsRouter.put('/:chatId/messages/:messageId', async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { userId, message } = req.body;

    const me = await getOne<{ uid: string }>('SELECT uid FROM users WHERE uid = $1 OR id = $2', [userId, userId]);
    if (!me) return res.status(404).json({ error: 'Пользователь не найден' });

    const msg = await getOne<{ sender_id: string; chat_id: string }>(
      'SELECT sender_id, chat_id FROM group_chat_messages WHERE id = $1',
      [messageId]
    );
    if (!msg || msg.chat_id !== chatId) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    if (msg.sender_id !== me.uid) {
      return res.status(403).json({ error: 'Вы можете редактировать только свои сообщения' });
    }

    const parentChat = await getOne<any>('SELECT is_archived FROM group_chats WHERE id = $1', [chatId]);
    if (Number(parentChat?.is_archived) === 1) {
      return res.status(403).json({ error: 'Чат находится в архиве. Редактирование сообщений недоступно.' });
    }

    const cleanText = String(message || '').trim();
    if (!cleanText) {
      return res.status(400).json({ error: 'Текст сообщения не может быть пустым' });
    }

    const moderationResult = await moderateGroupMessageWithProTalk(cleanText, chatId, me.uid, null);
    if (!moderationResult.allowed) {
      return res.status(400).json({
        error: `Отредактированное сообщение отклонено ИИ-модератором: ${moderationResult.reason || 'Нарушение правил'}`,
        moderated: true,
      });
    }

    const encryptedText = encryptEmojiText(cleanText);

    await runSql(
      `UPDATE group_chat_messages 
       SET message = $1, is_edited = 1, edited_at = NOW()
       WHERE id = $2`,
      [encryptedText, messageId]
    );

    res.json({
      success: true,
      message: {
        id: messageId,
        chat_id: chatId,
        message: cleanText,
        is_edited: 1,
      },
    });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in edit message:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/group-chats/:chatId/messages/:messageId
// Delete a message (sender, or chat owner/admin)
groupChatsRouter.delete('/:chatId/messages/:messageId', async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { userId } = req.query;

    const me = await getOne<{ uid: string }>('SELECT uid FROM users WHERE uid = $1 OR id = $2', [userId, userId]);
    if (!me) return res.status(404).json({ error: 'Пользователь не найден' });

    const msg = await getOne<{ sender_id: string; chat_id: string }>(
      'SELECT sender_id, chat_id FROM group_chat_messages WHERE id = $1',
      [messageId]
    );
    if (!msg || msg.chat_id !== chatId) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    const myMembership = await getOne<{ role: string; is_banned: number }>(
      'SELECT role, is_banned FROM group_chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, me.uid]
    );

    const isSender = msg.sender_id === me.uid;
    const isPrivileged = myMembership && !myMembership.is_banned && ['owner', 'admin'].includes(myMembership.role);

    if (!isSender && !isPrivileged) {
      return res.status(403).json({ error: 'Недостаточно прав для удаления этого сообщения' });
    }

    const parentChat = await getOne<any>('SELECT is_archived FROM group_chats WHERE id = $1', [chatId]);
    if (Number(parentChat?.is_archived) === 1) {
      return res.status(403).json({ error: 'Чат находится в архиве. Изменение сообщений недоступно.' });
    }

    await runSql('DELETE FROM group_chat_messages WHERE id = $1', [messageId]);

    res.json({ success: true, message: 'Сообщение удалено' });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in delete message:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/group-chats/:chatId?userId=...
// Moves a group chat to Archive (only the chat owner/creator can do this)
groupChatsRouter.delete('/:chatId', async (req, res) => {
  try {
    await ensureGroupChatArchiveColumns();
    const { chatId } = req.params;
    const userId = String(req.query.userId || req.body?.userId || '');
    if (!userId) {
      return res.status(400).json({ error: 'userId обязателен' });
    }

    const me = await getOne<{ id: string; uid: string }>('SELECT id, uid FROM users WHERE uid = $1 OR id = $2', [
      userId,
      userId,
    ]);
    if (!me) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const chat = await getOne<any>('SELECT * FROM group_chats WHERE id = $1', [chatId]);
    if (!chat) {
      return res.status(404).json({ error: 'Групповой чат не найден' });
    }

    const myMembership = await getOne<{ role: string }>(
      'SELECT role FROM group_chat_members WHERE chat_id = $1 AND (user_id = $2 OR user_id = $3)',
      [chatId, me.uid, me.id]
    );

    const isOwner =
      String(chat.creator_id) === String(me.uid) ||
      String(chat.creator_id) === String(me.id) ||
      myMembership?.role === 'owner';

    if (!isOwner) {
      return res.status(403).json({ error: 'Удалить чат в архив может только владелец (создатель) чата' });
    }

    await runSql(
      `UPDATE group_chats
       SET is_archived = 1,
           archived_at = COALESCE(archived_at, NOW()),
           archive_reason = COALESCE(archive_reason, 'deleted_by_owner'),
           updated_at = NOW()
       WHERE id = $1`,
      [chatId]
    );

    res.json({ success: true, message: 'Чат перенесён в архив' });
  } catch (err: any) {
    console.error('[GroupChats Router] Error in DELETE /:chatId:', err);
    res.status(500).json({ error: err.message });
  }
});
