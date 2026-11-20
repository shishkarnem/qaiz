import { Router } from 'express';
import { getAll, getOne, runSql, generateId } from '../db';
import { moderateGroupMessageWithProTalk } from '../protalkModeration';

export const zoomVideoRouter = Router();

const MAX_VIDEO_ROOM_MEMBERS = 8;

async function cleanupDuplicateSelfMembers(zoomRoomId: string) {
  try {
    const normalizedMpId = zoomRoomId.startsWith('room_') ? zoomRoomId.replace(/^room_/, '') : zoomRoomId;
    const zMembers = await getAll<any>(
      'SELECT user_id FROM zoom_room_members WHERE room_id = $1 OR room_id = $2',
      [zoomRoomId, `room_${normalizedMpId}`]
    );
    const mpMembers = await getAll<any>(
      'SELECT user_id FROM multiplayer_participants WHERE room_id = $1',
      [normalizedMpId]
    );

    const realUids = new Set<string>();
    let hasSelf2 = false;

    for (const m of [...zMembers, ...mpMembers]) {
      const uid = String(m.user_id || '');
      if (!uid) continue;
      if (uid.endsWith('_self2')) {
        hasSelf2 = true;
      } else {
        realUids.add(uid);
      }
    }

    // Requirement 4: If another real participant has joined, remove the duplicate 2nd self participant
    if (realUids.size > 1 && hasSelf2) {
      await runSql(
        "DELETE FROM zoom_room_members WHERE (room_id = $1 OR room_id = $2) AND user_id LIKE '%_self2'",
        [zoomRoomId, `room_${normalizedMpId}`]
      );
      await runSql(
        "DELETE FROM multiplayer_participants WHERE room_id = $1 AND user_id LIKE '%_self2'",
        [normalizedMpId]
      );
    }
  } catch (_) {}
}

// 1. Get or list active video rooms
zoomVideoRouter.get('/rooms', async (req, res) => {
  try {
    const rooms = await getAll<any>(
      `SELECT zvr.*, u.display_name as host_name, u.avatar_url as host_avatar,
              (SELECT COUNT(*)::int FROM zoom_room_members zrm WHERE zrm.room_id = zvr.id) as members_count
       FROM zoom_video_rooms zvr
       LEFT JOIN users u ON (u.uid = zvr.host_id OR u.id = zvr.host_id)
       WHERE zvr.is_active = 1
       ORDER BY zvr.created_at DESC`
    );
    res.json(rooms);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create or ensure room
zoomVideoRouter.post('/rooms', async (req, res) => {
  try {
    const { id: customId, title, host_id, password, room_type = 'general', target_id = null } = req.body;
    if (!host_id) return res.status(400).json({ error: 'host_id is required' });

    const roomId = customId || generateId('zoom_');
    const roomTitle = title || (
      room_type === 'chat' ? 'Видеочат' :
      room_type === 'blitz' ? 'Видеокомната: КвИИз' :
      room_type === '100to1' ? 'Видеокомната: Сто Квадному' :
      room_type === 'jeopardy' ? 'Видеокомната: Своя Икра' :
      'Видеокомната Квайз'
    );

    await runSql(
      `INSERT INTO zoom_video_rooms (id, title, host_id, password, room_type, target_id, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         is_active = 1,
         title = COALESCE(EXCLUDED.title, zoom_video_rooms.title),
         room_type = COALESCE(EXCLUDED.room_type, zoom_video_rooms.room_type),
         target_id = COALESCE(EXCLUDED.target_id, zoom_video_rooms.target_id)`,
      [roomId, roomTitle, host_id, password || null, room_type, target_id]
    );

    const room = await getOne('SELECT * FROM zoom_video_rooms WHERE id = $1', [roomId]);
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get single video room state (auto-registers if standard room pattern) + unified group chat messages
zoomVideoRouter.get('/rooms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let room = await getOne<any>('SELECT * FROM zoom_video_rooms WHERE id = $1', [id]);
    
    if (!room) {
      let inferredTitle = 'Видеокомната Квайз';
      let inferredType = 'general';
      if (id === 'multiplayer_lobby') {
        inferredTitle = 'Видеокомната Квайз';
        inferredType = 'general';
      } else if (id.startsWith('chat_') || id.startsWith('vroom_')) {
        inferredTitle = 'Видеочат';
        inferredType = 'chat';
      } else if (id.includes('blitz')) {
        inferredTitle = 'Видеокомната: КвИИз';
        inferredType = 'blitz';
      } else if (id.includes('100to1')) {
        inferredTitle = 'Видеокомната: Сто Квадному';
        inferredType = '100to1';
      } else if (id.includes('jeopardy')) {
        inferredTitle = 'Видеокомната: Своя Икра';
        inferredType = 'jeopardy';
      }

      await runSql(
        `INSERT INTO zoom_video_rooms (id, title, host_id, room_type, is_active, created_at)
         VALUES ($1, $2, 'system', $3, 1, NOW())
         ON CONFLICT (id) DO UPDATE SET is_active = 1`,
        [id, inferredTitle, inferredType]
      );
      room = await getOne<any>('SELECT * FROM zoom_video_rooms WHERE id = $1', [id]);
    }

    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    await cleanupDuplicateSelfMembers(id);

    const members = await getAll<any>(
      `SELECT zrm.*, 
              COALESCE(zrm.display_name, u.display_name, u.username, 'Участник') as display_name,
              u.username, 
              COALESCE(zrm.avatar_url, u.avatar_url, u.photo_url, u.telegram_photo) as avatar_url,
              u.photo_url, 
              u.telegram_photo
       FROM zoom_room_members zrm
       LEFT JOIN users u ON (
         u.uid = zrm.user_id OR 
         u.id = zrm.user_id OR 
         u.uid = REPLACE(zrm.user_id, '_self2', '') OR 
         u.id = REPLACE(zrm.user_id, '_self2', '')
       )
       WHERE zrm.room_id = $1
       ORDER BY zrm.joined_at ASC
       LIMIT 8`,
      [id]
    );

    // Fetch unified group chat messages for this room (supports both room_X and X)
    const normalizedMpId = id.startsWith('room_') ? id.replace(/^room_/, '') : id;
    const rawChatActions = await getAll<any>(
      `SELECT ma.*,
              COALESCE(u.display_name, u.username, 'Участник') as user_display_name,
              COALESCE(u.avatar_url, u.photo_url, u.telegram_photo) as user_avatar_url
       FROM multiplayer_actions ma
       LEFT JOIN users u ON (
         u.uid = ma.user_id OR
         u.id = ma.user_id OR
         u.uid = REPLACE(ma.user_id, '_self2', '') OR
         u.id = REPLACE(ma.user_id, '_self2', '')
       )
       WHERE (ma.room_id = $1 OR ma.room_id = $2) AND ma.action_type = 'chat'
       ORDER BY ma.created_at DESC LIMIT 60`,
      [id, normalizedMpId]
    );

    const messages = rawChatActions.reverse().map((act: any) => {
      let parsed: any = {};
      try {
        parsed = JSON.parse(act.payload_json || '{}');
      } catch (_) {}
      return {
        id: act.id,
        senderId: String(act.user_id),
        senderName: parsed.sender_name || act.user_display_name || 'Участник',
        avatarUrl: parsed.avatar_url || act.user_avatar_url || null,
        text: parsed.text || '',
        attachment_url: parsed.attachment_url || null,
        attachment_name: parsed.attachment_name || null,
        attachment_type: parsed.attachment_type || null,
        created_at: act.created_at
      };
    });

    res.json({ room, members, messages, max_members: MAX_VIDEO_ROOM_MEMBERS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3b. Post message to video conference / lobby group chat (with file and voice attachments + AI Moderation)
zoomVideoRouter.post('/rooms/:id/chat', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, sender_name, avatar_url, text, attachment_url, attachment_name, attachment_type, file_url, file_name, file_type, audio_url } = req.body;
    const effectiveAttachmentUrl = attachment_url || file_url || audio_url || null;
    const effectiveAttachmentName = attachment_name || file_name || null;
    const effectiveAttachmentType = attachment_type || file_type || (audio_url ? 'audio/webm' : null);

    if (!user_id || ((!text || !String(text).trim()) && !effectiveAttachmentUrl)) {
      return res.status(400).json({ error: 'user_id and text or attachment are required' });
    }

    const normalizedMpId = id.startsWith('room_') ? id.replace(/^room_/, '') : id;
    const cleanText = String(text || (effectiveAttachmentName ? `Файл: ${effectiveAttachmentName}` : '')).trim();

    // AI Chat Moderation (Function 763 / ProTalk Moderator, same as group chats)
    if (text && String(text).trim().length > 0) {
      const modResult = await moderateGroupMessageWithProTalk({
        chatId: normalizedMpId,
        userId: String(user_id),
        messageText: String(text).trim()
      });
      if (!modResult.allowed) {
        return res.status(400).json({
          error: modResult.reason || 'Сообщение отклонено ИИ-модератором чата',
          moderated: true,
          reason: modResult.reason
        });
      }
    }

    const actionId = generateId('mpa_');
    const payload = {
      text: cleanText,
      sender_name: sender_name || 'Участник',
      avatar_url: avatar_url || null,
      attachment_url: effectiveAttachmentUrl,
      attachment_name: effectiveAttachmentName,
      attachment_type: effectiveAttachmentType
    };

    await runSql(
      `INSERT INTO multiplayer_actions (id, room_id, user_id, action_type, payload_json, created_at)
       VALUES ($1, $2, $3, 'chat', $4, NOW())`,
      [actionId, normalizedMpId, user_id, JSON.stringify(payload)]
    );

    res.json({
      success: true,
      message: {
        id: actionId,
        senderId: String(user_id),
        senderName: payload.sender_name,
        avatarUrl: payload.avatar_url,
        text: payload.text,
        attachment_url: payload.attachment_url,
        attachment_name: payload.attachment_name,
        attachment_type: payload.attachment_type,
        created_at: new Date().toISOString()
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Join room / Ping presence (enforces max 8 members and removes _self2 duplicate if real users join)
zoomVideoRouter.post('/rooms/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, display_name, avatar_url, is_camera_on = 1, is_mic_on = 1, is_screen_sharing = 0 } = req.body;

    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const isSelf2Request = String(user_id).endsWith('_self2');
    const normalizedMpId = id.startsWith('room_') ? id.replace(/^room_/, '') : id;

    // Requirement 4: If trying to join as _self2 when another real user is already in the room, ignore and clean up
    if (isSelf2Request) {
      const currentMembers = await getAll<any>(
        'SELECT user_id FROM zoom_room_members WHERE room_id = $1',
        [id]
      );
      const mpMembers = await getAll<any>(
        'SELECT user_id FROM multiplayer_participants WHERE room_id = $1',
        [normalizedMpId]
      );
      const realUids = new Set<string>();
      for (const m of [...currentMembers, ...mpMembers]) {
        const uid = String(m.user_id || '');
        if (uid && !uid.endsWith('_self2')) realUids.add(uid);
      }
      if (realUids.size > 1) {
        await cleanupDuplicateSelfMembers(id);
        return res.json({ success: true, removed_duplicate: true });
      }
    }

    const existing = await getOne<any>(
      'SELECT id FROM zoom_room_members WHERE room_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (existing) {
      await runSql(
        `UPDATE zoom_room_members 
         SET last_ping = NOW(),
             display_name = COALESCE($1, display_name),
             avatar_url = COALESCE($2, avatar_url),
             is_camera_on = $3,
             is_mic_on = $4,
             is_screen_sharing = $5
         WHERE id = $6`,
        [display_name || null, avatar_url || null, is_camera_on ? 1 : 0, is_mic_on ? 1 : 0, is_screen_sharing ? 1 : 0, existing.id]
      );
    } else {
      // Remove any _self2 duplicate if a new real user is joining
      if (!isSelf2Request) {
        await runSql(
          "DELETE FROM zoom_room_members WHERE (room_id = $1 OR room_id = $2) AND user_id LIKE '%_self2' AND user_id != $3",
          [id, `room_${normalizedMpId}`, `${user_id}_self2`]
        );
        await runSql(
          "DELETE FROM multiplayer_participants WHERE room_id = $1 AND user_id LIKE '%_self2' AND user_id != $2",
          [normalizedMpId, `${user_id}_self2`]
        );
      }

      const activeMembers = await getAll<any>(
        'SELECT id, user_id FROM zoom_room_members WHERE room_id = $1',
        [id]
      );

      // Requirement 2: Maximum 8 participants in video room
      if (activeMembers.length >= MAX_VIDEO_ROOM_MEMBERS) {
        return res.status(400).json({
          error: `В видеокомнате уже максимальное количество участников (${MAX_VIDEO_ROOM_MEMBERS} из ${MAX_VIDEO_ROOM_MEMBERS})`,
          code: 'ROOM_FULL'
        });
      }

      const memberId = generateId('zrm_');
      await runSql(
        `INSERT INTO zoom_room_members (id, room_id, user_id, display_name, avatar_url, is_camera_on, is_mic_on, is_screen_sharing, joined_at, last_ping)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [memberId, id, user_id, display_name || 'Участник', avatar_url || null, is_camera_on ? 1 : 0, is_mic_on ? 1 : 0, is_screen_sharing ? 1 : 0]
      );
    }

    await cleanupDuplicateSelfMembers(id);

    // Keep self-second participant alive while main user pings (only if alone)
    if (!String(user_id).endsWith('_self2')) {
      await runSql(
        `UPDATE zoom_room_members 
         SET last_ping = NOW()
         WHERE room_id = $1 AND user_id = $2`,
        [id, `${user_id}_self2`]
      ).catch(() => {});
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Leave room
zoomVideoRouter.post('/rooms/:id/leave', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, only_self2 } = req.body;

    if (only_self2) {
      await runSql(
        'DELETE FROM zoom_room_members WHERE room_id = $1 AND user_id = $2',
        [id, `${user_id}_self2`]
      );
    } else {
      await runSql(
        'DELETE FROM zoom_room_members WHERE room_id = $1 AND (user_id = $2 OR user_id = $3)',
        [id, user_id, `${user_id}_self2`]
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Signaling (WebRTC offers, answers, ICE candidates)
zoomVideoRouter.post('/rooms/:id/signal', async (req, res) => {
  try {
    const { id } = req.params;
    const { sender_id, target_id, type, payload } = req.body;

    if (!sender_id || !type) {
      return res.status(400).json({ error: 'sender_id and type are required' });
    }

    const signalId = generateId('zs_');
    await runSql(
      `INSERT INTO zoom_signaling (id, room_id, sender_id, target_id, type, payload_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [signalId, id, sender_id, target_id || null, type, JSON.stringify(payload || {})]
    );

    await runSql("DELETE FROM zoom_signaling WHERE created_at < NOW() - INTERVAL '2 minutes'");

    res.json({ success: true, signal_id: signalId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get signals for user
zoomVideoRouter.get('/rooms/:id/signals', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, since } = req.query;

    let query = 'SELECT * FROM zoom_signaling WHERE room_id = $1 AND sender_id != $2';
    const params: any[] = [id, user_id || ''];
    let pIdx = 3;

    if (user_id) {
      query += ` AND (target_id = $${pIdx++} OR target_id IS NULL)`;
      params.push(user_id);
    }

    if (since) {
      query += ` AND created_at > $${pIdx++}::timestamptz`;
      params.push(since);
    }

    query += ' ORDER BY created_at ASC LIMIT 100';
    const signals = await getAll<any>(query, params);

    res.json(signals.map(s => ({
      ...s,
      payload: JSON.parse(s.payload_json || '{}')
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
