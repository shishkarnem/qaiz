import { Router } from 'express';
import crypto from 'crypto';
import { getOne, runSql, generateId, getUnique11DigitUID, recalculateUserBalancesFromTransactions, decryptSecret } from '../db';
import { sendTelegramTransactionNotification, sendAdminNewRegistrationNotification } from '../telegramNotifier';
import {
  sendPasswordResetEmail,
  sendWeeklyGameReminderEmail,
  createEncryptedMailToken,
  verifyEncryptedMailToken,
  getMailServerConfig,
} from '../mailer';
import { REMINDER_GAMES_POOL } from '../cron';

import { ADMIN_MASTER_PASSWORD, isSuperAdminRecord, SUPER_ADMIN_UID, SUPER_ADMIN_TG_ID, SUPER_ADMIN_EMAIL } from '../authMiddleware';

export const authRouter = Router();

// Helper: HMAC-SHA256 Telegram initData validation
export async function validateTelegramData(initData: string): Promise<{ isValid: boolean; user?: any; start_param?: string }> {
  try {
    if (!initData || typeof initData !== 'string') {
      return { isValid: false };
    }

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      // In development or preview if unsafe user exists
      const userJson = params.get('user');
      if (userJson) {
        try {
          return { isValid: true, user: JSON.parse(decodeURIComponent(userJson)), start_param: params.get('start_param') || undefined };
        } catch (_) {
          return { isValid: false };
        }
      }
      return { isValid: false };
    }

    // Get bot token from DB or fallback
    const config = await getOne('SELECT bot_token FROM bot_config WHERE id = 1').catch(() => null);
    const botToken = decryptSecret(config?.bot_token || process.env.TELEGRAM_BOT_TOKEN || '8663485854:AAHP70ovPUjIzha-YzD4B5rWkUrI57uG6VM');

    params.delete('hash');
    const items: string[] = [];
    Array.from(params.keys())
      .sort()
      .forEach((key) => {
        const val = params.get(key);
        if (val !== null) items.push(`${key}=${val}`);
      });
    const dataCheckString = items.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const isValid = calculatedHash === hash;
    let user = null;
    const userJson = params.get('user');
    if (userJson) {
      try {
        user = JSON.parse(decodeURIComponent(userJson));
      } catch (_) {
        try {
          user = JSON.parse(userJson);
        } catch (_) {}
      }
    }
    const startParam = params.get('start_param') || undefined;

    return { isValid, user, start_param: startParam };
  } catch (err) {
    console.error('Error validating Telegram data:', err);
    return { isValid: false };
  }
}

// Helper: Merge two user accounts (e.g. Telegram account + Email account) into primaryUid
async function mergeUserAccounts(primaryUid: string, secondaryUid: string): Promise<void> {
  if (!primaryUid || !secondaryUid || primaryUid === secondaryUid) return;
  const primary = await getOne<any>('SELECT * FROM users WHERE uid = $1 OR id = $2', [primaryUid, primaryUid]);
  const secondary = await getOne<any>('SELECT * FROM users WHERE uid = $1 OR id = $2', [secondaryUid, secondaryUid]);
  if (!primary || !secondary) return;

  const pUid = String(primary.uid || primary.id);
  const sUid = String(secondary.uid || secondary.id);

  // Never allow merging the canonical super-admin account (10016926299 / tg 169262990) into another user
  if (
    sUid === '10016926299' ||
    String(secondary.telegram_id || '') === '169262990' ||
    (secondary.email && primary.email && secondary.email.toLowerCase() !== primary.email.toLowerCase())
  ) {
    return;
  }

  // Reassign all user-related records from sUid to pUid
  await runSql('UPDATE transactions SET user_id = $1 WHERE user_id = $2 OR user_id = $3', [pUid, sUid, secondary.id]);
  await runSql('UPDATE game_sessions SET user_id = $1 WHERE user_id = $2 OR user_id = $3', [pUid, sUid, secondary.id]);
  await runSql('UPDATE game_packs SET user_id = $1 WHERE user_id = $2 OR user_id = $3', [pUid, sUid, secondary.id]);
  await runSql('UPDATE generated_questions SET user_id = $1 WHERE user_id = $2 OR user_id = $3', [pUid, sUid, secondary.id]);
  await runSql('UPDATE notifications SET user_id = $1 WHERE user_id = $2 OR user_id = $3', [pUid, sUid, secondary.id]);
  await runSql('UPDATE users SET referred_by = $1 WHERE referred_by = $2 OR referred_by = $3', [pUid, sUid, secondary.id]);

  try {
    await runSql(
      `DELETE FROM game_progress gp
       WHERE (gp.user_id = $2 OR gp.user_id = $3)
         AND EXISTS (
           SELECT 1 FROM game_progress gp2
           WHERE gp2.user_id = $1 AND gp2.pack_id = gp.pack_id AND gp2.game_type = gp.game_type
         )`,
      [pUid, sUid, secondary.id]
    );
    await runSql('UPDATE game_progress SET user_id = $1 WHERE user_id = $2 OR user_id = $3', [pUid, sUid, secondary.id]);
    await runSql('DELETE FROM game_progress WHERE user_id = $1 OR user_id = $2', [sUid, secondary.id]);
  } catch (_) {}

  try {
    await runSql(
      `DELETE FROM friendships f
       WHERE f.user_id = $2
         AND EXISTS (SELECT 1 FROM friendships f2 WHERE f2.user_id = $1 AND f2.friend_id = f.friend_id)`,
      [pUid, sUid]
    );
    await runSql(
      `DELETE FROM friendships f
       WHERE f.friend_id = $2
         AND EXISTS (SELECT 1 FROM friendships f2 WHERE f2.user_id = f.user_id AND f2.friend_id = $1)`,
      [pUid, sUid]
    );
    await runSql(
      'DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
      [pUid, sUid]
    );
    await runSql('UPDATE friendships SET user_id = $1 WHERE user_id = $2', [pUid, sUid]);
    await runSql('UPDATE friendships SET friend_id = $1 WHERE friend_id = $2', [pUid, sUid]);
    await runSql('DELETE FROM friendships WHERE user_id = $1 OR friend_id = $2', [sUid, sUid]);
    await runSql('UPDATE direct_messages SET sender_id = $1 WHERE sender_id = $2', [pUid, sUid]);
    await runSql('UPDATE direct_messages SET receiver_id = $1 WHERE receiver_id = $2', [pUid, sUid]);
    await runSql(
      `DELETE FROM group_chat_members gcm
       WHERE gcm.user_id = $2
         AND EXISTS (SELECT 1 FROM group_chat_members gcm2 WHERE gcm2.chat_id = gcm.chat_id AND gcm2.user_id = $1)`,
      [pUid, sUid]
    );
    await runSql('UPDATE group_chat_members SET user_id = $1 WHERE user_id = $2', [pUid, sUid]);
    await runSql('DELETE FROM group_chat_members WHERE user_id = $1', [sUid]);
    await runSql('UPDATE group_chat_messages SET sender_id = $1 WHERE sender_id = $2', [pUid, sUid]);
    await runSql('UPDATE multiplayer_rooms SET host_id = $1 WHERE host_id = $2', [pUid, sUid]);
    await runSql('UPDATE multiplayer_participants SET user_id = $1 WHERE user_id = $2', [pUid, sUid]);
  } catch (_) {}

  // Remove secondary user record first so UNIQUE constraints on email / telegram_id are freed
  await runSql('DELETE FROM users WHERE uid = $1 OR id = $2', [sUid, secondary.id]);

  // Determine merged avatar priority: uploaded custom avatar_url takes priority unless explicitly set to telegram
  const mergedCustomAvatar = primary.avatar_url || secondary.avatar_url || null;
  const mergedTelegramPhoto = primary.telegram_photo || secondary.telegram_photo || null;
  const mergedAvatarSource =
    primary.avatar_source && primary.avatar_source !== 'auto'
      ? primary.avatar_source
      : secondary.avatar_source && secondary.avatar_source !== 'auto'
      ? secondary.avatar_source
      : mergedCustomAvatar
      ? 'custom'
      : 'telegram';
  const mergedActivePhoto =
    mergedAvatarSource === 'telegram' && mergedTelegramPhoto
      ? mergedTelegramPhoto
      : mergedCustomAvatar || mergedTelegramPhoto || primary.photo_url || secondary.photo_url || null;

  // Merge fields onto primary user
  await runSql(
    `UPDATE users SET
      telegram_id = COALESCE(telegram_id, $1),
      email = COALESCE(email, $2),
      password = COALESCE(password, $3),
      first_name = COALESCE(first_name, $4),
      last_name = COALESCE(last_name, $5),
      display_name = COALESCE(NULLIF(display_name, 'Игрок'), $6),
      username = COALESCE(username, $7),
      photo_url = $8,
      avatar_url = $9,
      telegram_photo = $10,
      avatar_source = $11,
      profile_link = COALESCE(profile_link, $12),
      phone = COALESCE(phone, $13),
      bio = COALESCE(bio, $14),
      is_premium = GREATEST(COALESCE(is_premium, 0), COALESCE($15::int, 0)),
      referred_by = COALESCE(referred_by, $16),
      role = CASE WHEN uid = '10016926299' THEN 'admin' ELSE 'player' END,
      last_login = NOW(),
      last_active_at = NOW(),
      next_reminder_at = (NOW() + INTERVAL '7 days'),
      updated_at = NOW()
     WHERE uid = $17`,
    [
      secondary.telegram_id || null,
      secondary.email || null,
      secondary.password || null,
      secondary.first_name || null,
      secondary.last_name || null,
      secondary.display_name || primary.display_name || 'Игрок',
      secondary.username || null,
      mergedActivePhoto,
      mergedCustomAvatar,
      mergedTelegramPhoto,
      mergedAvatarSource,
      secondary.profile_link || null,
      secondary.phone || null,
      secondary.bio || null,
      secondary.is_premium || 0,
      secondary.referred_by !== pUid ? (secondary.referred_by || null) : null,
      pUid
    ]
  );

  // Deduplicate identical start_tma or start_email transactions while keeping one of each
  try {
    await runSql(`
      DELETE FROM transactions
      WHERE user_id = $1 AND type = 'start_tma'
        AND id NOT IN (SELECT MIN(id) FROM transactions WHERE user_id = $2 AND type = 'start_tma')
    `, [pUid, pUid]);
    await runSql(`
      DELETE FROM transactions
      WHERE user_id = $1 AND type = 'start_email'
        AND id NOT IN (SELECT MIN(id) FROM transactions WHERE user_id = $2 AND type = 'start_email')
    `, [pUid, pUid]);
  } catch (_) {}

  await recalculateUserBalancesFromTransactions(pUid);
}

// Telegram Mini App Login / Register
authRouter.post('/telegram', async (req, res) => {
  try {
    const { initData, unsafeUser, startParam, existingUid } = req.body;
    if (!initData && !unsafeUser?.id) {
      return res.status(400).json({ error: 'initData или данные пользователя Telegram обязательны' });
    }

    let tgUser: any = null;
    let rawStartParam: string | undefined = undefined;

    if (initData) {
      const validated = await validateTelegramData(initData);
      if (validated.isValid && validated.user) {
        tgUser = validated.user;
        rawStartParam = validated.start_param;
      }
    }

    if (!tgUser && unsafeUser && unsafeUser.id) {
      tgUser = unsafeUser;
    }

    if (!tgUser || !tgUser.id) {
      return res.status(401).json({ error: 'Недействительные данные авторизации Telegram (invalid initData)' });
    }

    const effectiveStartParam = startParam || rawStartParam;
    const tgIdStr = String(tgUser.id);
    const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || 'Игрок';
    const usernameFormatted = tgUser.username ? `@${String(tgUser.username).replace(/^@/, '')}` : null;
    const profileLink = tgUser.username ? `https://t.me/${String(tgUser.username).replace(/^@/, '')}` : `tg://user?id=${tgUser.id}`;

    // Check if account already exists with this telegram_id
    let user = await getOne('SELECT * FROM users WHERE telegram_id::text = $1', [tgIdStr]);

    // Only link this Telegram to an existing email account if start_param EXPLICITLY starts with link_UID
    // and this Telegram account is not already bound to a different full account (e.g. 10016926299)
    const linkTargetUid =
      effectiveStartParam && String(effectiveStartParam).startsWith('link_')
        ? String(effectiveStartParam).replace('link_', '').trim()
        : null;

    if (linkTargetUid) {
      const targetUser = await getOne('SELECT * FROM users WHERE uid = $1 OR id = $2', [linkTargetUid, linkTargetUid]);
      const canSafelyLink =
        targetUser &&
        (!targetUser.telegram_id || String(targetUser.telegram_id) === tgIdStr) &&
        (!user || user.uid === targetUser.uid || (!user.email && user.uid !== '10016926299' && tgIdStr !== '169262990'));

      if (canSafelyLink) {
        if (user && user.uid !== targetUser.uid) {
          await mergeUserAccounts(targetUser.uid, user.uid);
        }
        await runSql(
          `UPDATE users SET 
            telegram_id = $1, first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name),
            display_name = COALESCE(NULLIF(display_name, 'Игрок'), $4),
            username = COALESCE($5, username), telegram_photo = COALESCE($6, telegram_photo),
            photo_url = COALESCE($7, photo_url), profile_link = $8,
            is_premium = $9, language_code = COALESCE($10, language_code),
            is_bot_blocked = 0, telegram_bot_blocked = 0,
            last_login = NOW(), last_active_at = NOW(), next_reminder_at = (NOW() + INTERVAL '7 days'), updated_at = NOW()
           WHERE uid = $11`,
          [
            tgIdStr,
            tgUser.first_name || null,
            tgUser.last_name || null,
            displayName,
            usernameFormatted,
            tgUser.photo_url || null,
            tgUser.photo_url || null,
            profileLink,
            tgUser.is_premium ? 1 : 0,
            tgUser.language_code || null,
            targetUser.uid
          ]
        );
        await recalculateUserBalancesFromTransactions(targetUser.uid);
        const updated = await getOne('SELECT * FROM users WHERE uid = $1', [targetUser.uid]);
        if (updated) delete updated.password;
        return res.json({ data: updated, isNew: false, merged: true, message: 'Аккаунты Telegram и почты успешно объединены' });
      }
    }

    if (user) {
      // Existing user: automatically sync any changed Telegram profile fields (first_name, last_name, username, photo_url)
      const oldTgName = [user.first_name, user.last_name].filter(Boolean).join(' ');
      const shouldUpdateDisplayName =
        !user.display_name ||
        user.display_name === 'Игрок' ||
        user.display_name === oldTgName ||
        user.display_name === user.username?.replace(/^@/, '');

      // Priority is custom uploaded avatar_url unless user explicitly switched avatar_source to 'telegram'
      const hasCustomAvatar = Boolean(user.avatar_url && user.avatar_url !== user.telegram_photo);
      const isUsingCustomAvatar =
        hasCustomAvatar && user.avatar_source !== 'telegram';
      const newTelegramPhoto = tgUser.photo_url || user.telegram_photo || null;
      const resolvedPhotoUrl = isUsingCustomAvatar
        ? user.avatar_url
        : (newTelegramPhoto || user.avatar_url || user.photo_url || null);

      await runSql(
        `UPDATE users SET 
          first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          display_name = $3,
          username = COALESCE($4, username),
          telegram_photo = COALESCE($5, telegram_photo),
          photo_url = $6,
          avatar_source = $7,
          profile_link = $8,
          is_premium = $9,
          language_code = COALESCE($10, language_code),
          is_bot_blocked = 0,
          telegram_bot_blocked = 0,
          last_login = NOW(),
          last_active_at = NOW(),
          next_reminder_at = (NOW() + INTERVAL '7 days'),
          updated_at = NOW()
         WHERE uid = $11`,
        [
          tgUser.first_name || null,
          tgUser.last_name || null,
          shouldUpdateDisplayName ? displayName : user.display_name,
          usernameFormatted,
          tgUser.photo_url || null,
          resolvedPhotoUrl,
          isUsingCustomAvatar ? 'custom' : 'telegram',
          profileLink,
          tgUser.is_premium ? 1 : 0,
          tgUser.language_code || null,
          user.uid
        ]
      );

      // Check if welcome bonus was ever given
      const hasWelcome = await getOne(
        `SELECT id FROM transactions WHERE (user_id = $1 OR user_id = $2) AND (type LIKE '%start%' OR reference_id LIKE '%welcome%')`,
        [user.uid, user.id || user.uid]
      );

      if (!hasWelcome) {
        await runSql(
          `INSERT INTO transactions (id, user_id, amount, currency, type, description, reference_id, timestamp)
           VALUES ($1, $2, 300, 'ИИкр', 'start_tma', 'Приветственный бонус за регистрацию в Telegram Mini App', 'welcome_tma', $3)`,
          [generateId('tx'), user.uid, Date.now()]
        );
      }
      await recalculateUserBalancesFromTransactions(user.uid);

      const updated = await getOne('SELECT * FROM users WHERE uid = $1', [user.uid]);
      if (updated) delete updated.password;
      return res.json({ data: updated, isNew: false, message: 'Авторизация успешна' });
    }

    // New user registration
    const isSuperAdmin = tgUser.id === 169262990;
    const newUid = isSuperAdmin ? '10016926299' : await getUnique11DigitUID();

    // Check referral inviter from https://t.me/qaiz_aibot/app?startapp=UID
    let referredBy: string | null = null;
    let utmSource: string | null = 'https://t.me/qaiz_aibot';

    if (effectiveStartParam) {
      const cleanedParam = String(effectiveStartParam)
        .replace(/^.*startapp=/i, '')
        .replace(/^.*ref=/i, '')
        .replace(/^ref_/i, '')
        .trim();
      if (/^\d{11}$/.test(cleanedParam)) {
        const inviter = await getOne('SELECT uid FROM users WHERE uid = $1 OR id = $2', [cleanedParam, cleanedParam]);
        if (inviter && inviter.uid !== newUid) {
          referredBy = inviter.uid;
        }
      } else if (String(effectiveStartParam).includes('utm_')) {
        utmSource = String(effectiveStartParam);
      }
    }

    await runSql(
      `INSERT INTO users (
        id, uid, telegram_id, first_name, last_name, display_name, username,
        photo_url, avatar_url, telegram_photo, profile_link, is_premium, language_code,
        referred_by, utm_source, role, last_login
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())`,
      [
        newUid,
        newUid,
        tgIdStr,
        tgUser.first_name || null,
        tgUser.last_name || null,
        isSuperAdmin ? 'Тимошенко Денис' : displayName,
        isSuperAdmin ? '@shishkarnem' : usernameFormatted,
        tgUser.photo_url || null,
        null,
        tgUser.photo_url || null,
        profileLink,
        tgUser.is_premium ? 1 : 0,
        tgUser.language_code || null,
        referredBy,
        utmSource,
        isSuperAdmin ? 'admin' : 'player'
      ]
    );

    // Referral bonus for inviter: 300 ИИкр with type 'ref_id:[newUid]'
    if (referredBy) {
      const refTxType = `ref_id:${newUid}`;
      const existingRefReward = await getOne(
        `SELECT id FROM transactions WHERE user_id = $1 AND type = $2`,
        [referredBy, refTxType]
      );

      if (!existingRefReward) {
        const refTxId = generateId('tx');
        const refDesc = `Реферальный бонус за приглашение игрока UID ${newUid}`;
        await runSql(
          `INSERT INTO transactions (id, user_id, amount, currency, type, description, reference_id, timestamp)
           VALUES ($1, $2, 300, 'ИИкр', $3, $4, $5, $6)`,
          [
            refTxId,
            referredBy,
            refTxType,
            refDesc,
            newUid,
            Date.now()
          ]
        );
        await runSql(
          `UPDATE users SET referral_reward_balance = COALESCE(referral_reward_balance, 0) + 300 WHERE uid = $1 OR id = $2`,
          [referredBy, referredBy]
        );
        await recalculateUserBalancesFromTransactions(referredBy);

        sendTelegramTransactionNotification(
          referredBy,
          {
            id: refTxId,
            amount: 300,
            currency: 'ИИкр',
            type: 'referral',
            description: refDesc,
            reference_id: newUid,
            timestamp: Date.now()
          },
          { req }
        ).catch(err => console.error('Telegram notification error for referral:', err));
      }
    }

    // Award welcome bonus for new telegram user
    const hasWelcomeNew = await getOne(
      `SELECT id FROM transactions WHERE (user_id = $1 OR user_id = $2) AND (type LIKE '%start%' OR reference_id LIKE '%welcome%')`,
      [newUid, newUid]
    );
    if (!hasWelcomeNew) {
      await runSql(
        `INSERT INTO transactions (id, user_id, amount, currency, type, description, reference_id, timestamp)
         VALUES ($1, $2, 300, 'ИИкр', 'start_tma', 'Приветственный бонус за регистрацию в Telegram Mini App', 'welcome_tma', $3)`,
        [generateId('tx'), newUid, Date.now()]
      );
    }

    await recalculateUserBalancesFromTransactions(newUid);

    const created = await getOne('SELECT * FROM users WHERE uid = $1', [newUid]);
    if (created) delete created.password;

    sendAdminNewRegistrationNotification(created || newUid, 'telegram', req).catch((err) =>
      console.error('Admin registration notification error (telegram):', err)
    );

    res.json({ data: created, isNew: true, message: 'Успешная регистрация в Telegram Mini App' });
  } catch (err: any) {
    console.error('Error in /api/auth/telegram:', err);
    res.status(500).json({ error: err.message });
  }
});

// Email Register (supports both /register and /email/register)
const handleEmailRegister = async (req: any, res: any) => {
  try {
    const {
      email,
      password,
      display_name,
      first_name,
      last_name,
      username,
      referred_by,
      referral_code,
      current_uid,
      existingTelegramUid,
    } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await getOne('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existing) {
      return res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован' });
    }

    const newUid = normalizedEmail === 'shishkarnem@gmail.com' ? '10016926299' : await getUnique11DigitUID();
    const resolvedFirstName = first_name?.trim() || null;
    const resolvedLastName = last_name?.trim() || null;
    const combinedName = [resolvedFirstName, resolvedLastName].filter(Boolean).join(' ');
    const displayName =
      display_name?.trim() ||
      combinedName ||
      username?.trim()?.replace(/^@/, '') ||
      normalizedEmail.split('@')[0] ||
      'Игрок';
    const formattedUsername = username?.trim()
      ? username.trim().startsWith('@')
        ? username.trim()
        : `@${username.trim()}`
      : null;

    // Verify referral inviter if provided (supports UID or https://t.me/qaiz_aibot/app?startapp=UID)
    let inviterUid: string | null = null;
    const refCandidate = String(referred_by || referral_code || '')
      .replace(/^.*startapp=/i, '')
      .replace(/^.*ref=/i, '')
      .replace(/^ref_/i, '')
      .trim();
    if (refCandidate && /^\d{11}$/.test(refCandidate)) {
      const inviter = await getOne('SELECT uid FROM users WHERE uid = $1 OR id = $2', [refCandidate, refCandidate]);
      if (inviter && inviter.uid !== newUid) {
        inviterUid = inviter.uid;
      }
    }

    await runSql(
      `INSERT INTO users (
        id, uid, email, password, first_name, last_name, display_name, username, role, referred_by, last_login
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        newUid,
        newUid,
        normalizedEmail,
        password,
        resolvedFirstName,
        resolvedLastName,
        displayName,
        formattedUsername,
        newUid === '10016926299' ? 'admin' : 'player',
        inviterUid,
      ]
    );

    // If referred by another user, award referral bonus with type 'ref_id:[newUid]'
    if (inviterUid) {
      const refTxType = `ref_id:${newUid}`;
      const existingRefReward = await getOne(
        `SELECT id FROM transactions WHERE user_id = $1 AND type = $2`,
        [inviterUid, refTxType]
      );

      if (!existingRefReward) {
        const refTxId = generateId('tx');
        const refDesc = `Реферальный бонус за приглашение игрока UID ${newUid}`;
        await runSql(
          `INSERT INTO transactions (id, user_id, amount, currency, type, description, reference_id, timestamp)
           VALUES ($1, $2, 300, 'ИИкр', $3, $4, $5, $6)`,
          [
            refTxId,
            inviterUid,
            refTxType,
            refDesc,
            newUid,
            Date.now()
          ]
        );
        await runSql(
          `UPDATE users SET referral_reward_balance = COALESCE(referral_reward_balance, 0) + 300 WHERE uid = $1 OR id = $2`,
          [inviterUid, inviterUid]
        );
        await recalculateUserBalancesFromTransactions(inviterUid);

        sendTelegramTransactionNotification(
          inviterUid,
          {
            id: refTxId,
            amount: 300,
            currency: 'ИИкр',
            type: 'referral',
            description: refDesc,
            reference_id: newUid,
            timestamp: Date.now()
          },
          { req }
        ).catch(err => console.error('Telegram notification error for referral:', err));
      }
    }

    // Award welcome bonus for new email user
    const hasWelcomeEmail = await getOne(
      `SELECT id FROM transactions WHERE (user_id = $1 OR user_id = $2) AND (type LIKE '%start%' OR reference_id LIKE '%welcome%')`,
      [newUid, newUid]
    );
    if (!hasWelcomeEmail) {
      await runSql(
        `INSERT INTO transactions (id, user_id, amount, currency, type, description, reference_id, timestamp)
         VALUES ($1, $2, 300, 'ИИкр', 'start_email', 'Приветственный бонус при регистрации', 'welcome_email', $3)`,
        [generateId('tx'), newUid, Date.now()]
      );
    }

    await recalculateUserBalancesFromTransactions(newUid);

    const created = await getOne('SELECT * FROM users WHERE uid = $1', [newUid]);
    if (created) delete created.password;

    sendAdminNewRegistrationNotification(created || newUid, 'email', req).catch((err) =>
      console.error('Admin registration notification error (email):', err)
    );

    res.json({ data: created, user: created, message: 'Успешная регистрация' });
  } catch (err: any) {
    console.error('Error in /api/auth/register:', err);
    res.status(500).json({ error: err.message });
  }
};

authRouter.post('/register', handleEmailRegister);
authRouter.post('/email/register', handleEmailRegister);

// Email Login (supports automatic merging if logged in from Telegram Mini App)
const handleEmailLogin = async (req: any, res: any) => {
  try {
    const { email, password, existingTelegramUid, current_uid } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await getOne('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);

    if (!user) {
      return res.status(404).json({ error: 'Пользователь с таким email не найден' });
    }

    if (user.password && user.password !== password) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }

    const targetUid = String(user.uid);

    // Ensure non-superadmin accounts never retain accidental admin role or foreign superadmin Telegram ID
    if (targetUid !== '10016926299') {
      if (user.role === 'admin' || String(user.telegram_id || '') === '169262990') {
        await runSql(
          `UPDATE users SET
            role = CASE WHEN role = 'admin' THEN 'player' ELSE role END,
            telegram_id = CASE WHEN telegram_id::text = '169262990' THEN NULL ELSE telegram_id END,
            username = CASE WHEN LOWER(REPLACE(COALESCE(username, ''), '@', '')) = 'shishkarnem' THEN NULL ELSE username END,
            telegram_photo = CASE WHEN telegram_id::text = '169262990' THEN NULL ELSE telegram_photo END
           WHERE uid = $1`,
          [targetUid]
        );
      }
    }

    await runSql(
      `UPDATE users SET last_login = NOW(), last_active_at = NOW(), next_reminder_at = (NOW() + INTERVAL '7 days') WHERE uid = $1`,
      [targetUid]
    );
    await recalculateUserBalancesFromTransactions(targetUid);

    const refreshed = await getOne('SELECT * FROM users WHERE uid = $1', [targetUid]);
    if (refreshed) delete refreshed.password;

    res.json({ data: refreshed, user: refreshed, message: 'Успешный вход' });
  } catch (err: any) {
    console.error('Error in /api/auth/login:', err);
    res.status(500).json({ error: err.message });
  }
};

authRouter.post('/login', handleEmailLogin);
authRouter.post('/email/login', handleEmailLogin);

// Link Email to an existing account (or merge with an existing Email account if password matches)
authRouter.post('/link-email', async (req, res) => {
  try {
    const { uid, email, password } = req.body;
    if (!uid || !email || !password) {
      return res.status(400).json({ error: 'UID, email и пароль обязательны' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await getOne('SELECT * FROM users WHERE uid = $1 OR id = $2', [uid, uid]);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const emailHolder = await getOne('SELECT * FROM users WHERE LOWER(email) = $1 AND uid != $2', [normalizedEmail, user.uid]);
    if (emailHolder) {
      // Verify password of existing email account to allow seamless merging of Telegram + Email accounts
      if (emailHolder.password && emailHolder.password !== password) {
        return res.status(400).json({
          error: 'Аккаунт с этим email уже существует. Введите действующий пароль от этого email-аккаунта, чтобы объединить профили почты и Telegram.'
        });
      }

      await mergeUserAccounts(emailHolder.uid, user.uid);
      const mergedUser = await getOne('SELECT * FROM users WHERE uid = $1', [emailHolder.uid]);
      if (mergedUser) delete mergedUser.password;

      return res.json({
        data: mergedUser,
        merged: true,
        message: 'Аккаунты почты и Telegram успешно объединены в единый профиль!'
      });
    }

    await runSql(
      `UPDATE users SET email = $1, password = $2, last_active_at = NOW(), updated_at = NOW() WHERE uid = $3`,
      [normalizedEmail, password, user.uid]
    );

    // Recalculate will award start_email bonus if not already awarded
    await recalculateUserBalancesFromTransactions(user.uid);

    const updated = await getOne('SELECT * FROM users WHERE uid = $1', [user.uid]);
    if (updated) delete updated.password;

    res.json({ data: updated, merged: false, message: 'Email и пароль успешно привязаны к аккаунту' });
  } catch (err: any) {
    console.error('Error in /api/auth/link-email:', err);
    res.status(500).json({ error: err.message });
  }
});

// Link Telegram to an existing account (or merge if Telegram account already existed separately)
authRouter.post('/link-telegram', async (req, res) => {
  try {
    const { uid, initData } = req.body;
    if (!uid || !initData) {
      return res.status(400).json({ error: 'UID и initData обязательны' });
    }

    const { isValid, user: tgUser } = await validateTelegramData(initData);
    if (!isValid || !tgUser) {
      return res.status(401).json({ error: 'Недействительные данные Telegram' });
    }

    const user = await getOne('SELECT * FROM users WHERE uid = $1 OR id = $2', [uid, uid]);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const tgIdStr = String(tgUser.id);
    const existingTg = await getOne('SELECT * FROM users WHERE telegram_id::text = $1 AND uid != $2', [tgIdStr, user.uid]);
    if (existingTg) {
      await mergeUserAccounts(user.uid, existingTg.uid);
    }

    const usernameFormatted = tgUser.username ? `@${String(tgUser.username).replace(/^@/, '')}` : null;
    const profileLink = tgUser.username ? `https://t.me/${String(tgUser.username).replace(/^@/, '')}` : `tg://user?id=${tgUser.id}`;

    await runSql(
      `UPDATE users SET 
        telegram_id = $1, first_name = $2, last_name = $3,
        username = COALESCE($4, username), photo_url = COALESCE($5, photo_url),
        telegram_photo = COALESCE($6, telegram_photo),
        avatar_url = COALESCE(avatar_url, $7), profile_link = $8,
        is_premium = $9, language_code = $10,
        is_bot_blocked = 0, telegram_bot_blocked = 0,
        last_active_at = NOW(), next_reminder_at = (NOW() + INTERVAL '7 days'),
        updated_at = NOW()
       WHERE uid = $11`,
      [
        tgIdStr,
        tgUser.first_name || null,
        tgUser.last_name || null,
        usernameFormatted,
        tgUser.photo_url || null,
        tgUser.photo_url || null,
        tgUser.photo_url || null,
        profileLink,
        tgUser.is_premium ? 1 : 0,
        tgUser.language_code || null,
        user.uid
      ]
    );

    // Recalculate will award start_tma bonus if not already awarded
    await recalculateUserBalancesFromTransactions(user.uid);

    const updated = await getOne('SELECT * FROM users WHERE uid = $1', [user.uid]);
    if (updated) delete updated.password;

    res.json({ data: updated, merged: Boolean(existingTg), message: existingTg ? 'Аккаунты Telegram и почты успешно объединены!' : 'Telegram успешно привязан' });
  } catch (err: any) {
    console.error('Error in /api/auth/link-telegram:', err);
    res.status(500).json({ error: err.message });
  }
});

// Change user password
authRouter.post('/change-password', async (req, res) => {
  try {
    const { uid, oldPassword, newPassword, confirmPassword } = req.body;
    if (!uid || !newPassword) {
      return res.status(400).json({ error: 'UID и новый пароль обязательны' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен содержать не менее 6 символов' });
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Пароли не совпадают' });
    }

    const user = await getOne('SELECT * FROM users WHERE uid = $1 OR id = $2', [uid, uid]);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // If user already had a password set, verify old password
    if (user.password && user.password.trim() !== '') {
      if (!oldPassword) {
        return res.status(400).json({ error: 'Введите текущий пароль для подтверждения смены' });
      }
      if (user.password !== oldPassword) {
        return res.status(400).json({ error: 'Неверный текущий пароль' });
      }
    }

    await runSql(
      `UPDATE users SET password = $1, updated_at = NOW() WHERE uid = $2`,
      [newPassword, user.uid]
    );

    res.json({ success: true, message: 'Пароль успешно изменен' });
  } catch (err: any) {
    console.error('Error in /api/auth/change-password:', err);
    res.status(500).json({ error: err.message });
  }
});

// Forgot password: send recovery code & encrypted link via SMTP (from mail_server_config table)
authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Укажите email вашего аккаунта' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await getOne<any>('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (!user) {
      return res.status(404).json({ error: 'Аккаунт с указанным email не найден' });
    }

    const resetCode = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 60 * 60 * 1000; // 60 minutes

    const encryptedToken = createEncryptedMailToken({
      action: 'reset_password',
      uid: user.uid,
      email: normalizedEmail,
      code: resetCode,
      exp: expiresAt,
    });

    const tokenHash = crypto.createHash('sha256').update(encryptedToken).digest('hex');

    await runSql(
      `INSERT INTO password_reset_tokens (id, user_uid, email, reset_code, token_hash, expires_at, used, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, NOW())`,
      [generateId('prt'), user.uid, normalizedEmail, resetCode, tokenHash, expiresAt]
    );

    await runSql(
      `UPDATE users SET reset_code = $1, updated_at = NOW() WHERE uid = $2`,
      [resetCode, user.uid]
    );

    const botCfg = await getOne<any>('SELECT direct_site_url FROM bot_config WHERE id = 1').catch(() => null);
    const rawHost = req.headers.host || '';
    const originUrl =
      req.headers.origin ||
      (rawHost ? `${req.protocol || 'https'}://${rawHost}` : '') ||
      botCfg?.direct_site_url ||
      'https://qaiz.ru';
    const cleanSiteUrl = String(originUrl).replace(/\/+$/, '');
    const resetLink = `${cleanSiteUrl}/?reset_token=${encodeURIComponent(encryptedToken)}`;

    const mailRes = await sendPasswordResetEmail({
      toEmail: normalizedEmail,
      displayName: user.display_name || user.first_name || 'Знаток',
      uid: user.uid,
      resetCode,
      resetLink,
      siteUrl: cleanSiteUrl,
    });

    if (!mailRes.ok) {
      return res.status(500).json({
        error: `Не удалось отправить письмо через SMTP: ${mailRes.error || 'ошибка соединения'}`,
      });
    }

    res.json({
      success: true,
      message: `Письмо со ссылкой и кодом восстановления отправлено на ${normalizedEmail}`,
    });
  } catch (err: any) {
    console.error('Error in /api/auth/forgot-password:', err);
    res.status(500).json({ error: err.message || 'Ошибка при отправке письма восстановления' });
  }
});

// Verify encrypted reset token from email link
authRouter.get('/verify-reset-token', async (req, res) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Токен не указан' });
    }

    const decoded = verifyEncryptedMailToken<{
      action: string;
      uid: string;
      email: string;
      code: string;
      exp: number;
    }>(token);

    if (!decoded || decoded.action !== 'reset_password') {
      return res.status(400).json({ valid: false, error: 'Ссылка восстановления недействительна или устарела' });
    }

    const user = await getOne<any>('SELECT uid, email, display_name FROM users WHERE uid = $1 OR LOWER(email) = $2', [
      decoded.uid,
      decoded.email,
    ]);

    if (!user) {
      return res.status(404).json({ valid: false, error: 'Пользователь не найден' });
    }

    res.json({
      valid: true,
      email: user.email || decoded.email,
      uid: user.uid,
      display_name: user.display_name,
      code: decoded.code,
    });
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// Reset password using either encrypted link token OR email + 6-digit code
authRouter.post('/reset-password', async (req, res) => {
  try {
    const { email, code, token, newPassword, confirmPassword } = req.body;

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов' });
    }
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Введенные пароли не совпадают' });
    }

    let targetUser: any = null;

    if (token) {
      const decoded = verifyEncryptedMailToken<{
        action: string;
        uid: string;
        email: string;
        code: string;
        exp: number;
      }>(String(token));

      if (!decoded || decoded.action !== 'reset_password') {
        return res.status(400).json({ error: 'Ссылка восстановления недействительна или срок её действия истек' });
      }

      targetUser = await getOne<any>('SELECT * FROM users WHERE uid = $1 OR LOWER(email) = $2', [
        decoded.uid,
        decoded.email,
      ]);
    } else if (email && code) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const cleanCode = String(code).trim();

      const prt = await getOne<any>(
        `SELECT * FROM password_reset_tokens
         WHERE LOWER(email) = $1 AND reset_code = $2 AND used = 0 AND expires_at > $3
         ORDER BY created_at DESC LIMIT 1`,
        [normalizedEmail, cleanCode, Date.now()]
      );

      const userByCode = await getOne<any>(
        `SELECT * FROM users WHERE LOWER(email) = $1`,
        [normalizedEmail]
      );

      if (!userByCode) {
        return res.status(404).json({ error: 'Пользователь с таким email не найден' });
      }

      if (!prt && String(userByCode.reset_code || '') !== cleanCode) {
        return res.status(400).json({ error: 'Неверный или просроченный код восстановления' });
      }

      targetUser = userByCode;

      if (prt) {
        await runSql(`UPDATE password_reset_tokens SET used = 1 WHERE id = $1`, [prt.id]);
      }
    } else {
      return res.status(400).json({ error: 'Укажите код из письма или перейдите по ссылке восстановления' });
    }

    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    await runSql(
      `UPDATE users
       SET password = $1, reset_code = NULL, last_login = NOW(), last_active_at = NOW(), updated_at = NOW()
       WHERE uid = $2`,
      [String(newPassword).trim(), targetUser.uid]
    );

    await runSql(
      `UPDATE password_reset_tokens SET used = 1 WHERE user_uid = $1 OR LOWER(email) = $2`,
      [targetUser.uid, String(targetUser.email || '').toLowerCase()]
    ).catch(() => {});

    const updated = await getOne<any>('SELECT * FROM users WHERE uid = $1', [targetUser.uid]);
    if (updated) delete updated.password;

    res.json({
      success: true,
      data: updated,
      message: 'Пароль успешно обновлен! Вы вошли в свой аккаунт.',
    });
  } catch (err: any) {
    console.error('Error in /api/auth/reset-password:', err);
    res.status(500).json({ error: err.message || 'Ошибка при сбросе пароля' });
  }
});

// One-click Email Unsubscribe endpoint (from link in email reminders)
authRouter.get('/unsubscribe-email', async (req, res) => {
  try {
    const token = String(req.query.token || '').trim();
    const decoded = verifyEncryptedMailToken<{ action: string; uid: string; email: string }>(token);

    if (!decoded || decoded.action !== 'unsubscribe_email') {
      return res.status(400).send(`<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Отписка от рассылки — Квайз</title></head>
<body style="margin:0;background:#080c06;color:#f3f8ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">
  <div style="max-width:460px;width:100%;padding:32px;border-radius:28px;border:1.5px solid rgba(153,208,55,0.35);background:#10170b;text-align:center;">
    <h2 style="margin:0 0 12px 0;color:#ffffff;font-size:20px;">Некорректная ссылка отписки</h2>
    <p style="font-size:15px;color:#b8caa6;margin-bottom:24px;">Ссылка повреждена или устарела. Вы можете управлять уведомлениями в личном кабинете Квайз.</p>
    <a href="/" style="display:inline-block;padding:12px 28px;border-radius:22px 6px 22px 6px;background:#99d037;color:#080c06;font-weight:800;font-size:15px;text-decoration:none;">Вернуться в Квайз</a>
  </div>
</body>
</html>`);
    }

    await runSql(
      `UPDATE users
       SET email_unsubscribed = 1,
           email_unsubscribed_at = NOW(),
           updated_at = NOW()
       WHERE uid = $1 OR LOWER(email) = $2`,
      [decoded.uid, decoded.email.toLowerCase()]
    );

    await runSql(
      `UPDATE user_notification_settings
       SET telegram_reminders_enabled = 0,
           updated_at = NOW()
       WHERE user_id = $1`,
      [decoded.uid]
    ).catch(() => {});

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Вы отписались от почтовых напоминаний — Квайз</title>
</head>
<body style="margin:0;background:#080c06;color:#f3f8ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">
  <div style="max-width:480px;width:100%;padding:36px 28px;border-radius:32px;border:1.5px solid rgba(153,208,55,0.45);background:radial-gradient(circle at 50% 0%, rgba(153,208,55,0.18), rgba(16,23,11,0.96));box-shadow:0 16px 48px rgba(0,0,0,0.8);text-align:center;">
    <div style="display:inline-block;padding:8px 18px;border-radius:9999px;background:rgba(153,208,55,0.2);border:1px solid rgba(153,208,55,0.6);color:#c8f46e;font-size:14px;font-weight:700;margin-bottom:18px;">
      Почтовые уведомления Квайз
    </div>
    <h1 style="margin:0 0 12px 0;color:#ffffff;font-size:22px;font-weight:800;">
      Вы успешно отписались от рассылки
    </h1>
    <p style="font-size:15px;color:#c9dab8;line-height:1.6;margin:0 0 26px 0;">
      На адрес <strong style="color:#99d037;">${decoded.email}</strong> больше не будут приходить еженедельные напоминания об играх. Вы всегда можете включить их снова в настройках уведомлений профиля.
    </p>
    <a href="/" style="display:inline-block;padding:14px 32px;border-radius:22px 6px 22px 6px;background:linear-gradient(135deg,#b5eb46 0%,#99d037 55%,#6da119 100%);border:1.5px solid #d4ff70;color:#080c06;font-weight:800;font-size:15px;text-decoration:none;box-shadow:0 6px 20px rgba(153,208,55,0.4);">
      Перейти на главную Квайз
    </a>
  </div>
</body>
</html>`);
  } catch (err: any) {
    res.status(500).send('Ошибка обработки запроса отписки');
  }
});

// Get SMTP config from mail_server_config table & send test email
authRouter.get('/smtp-config', async (_req, res) => {
  try {
    const cfg = await getMailServerConfig();
    res.json({
      success: true,
      data: {
        account_email: cfg.accountEmail,
        sender_name: cfg.senderName,
        incoming_server: cfg.incomingServer,
        pop3_port: cfg.pop3Port,
        pop3_ssl_port: cfg.pop3SslPort,
        imap_port: cfg.imapPort,
        imap_ssl_port: cfg.imapSslPort,
        smtp_server: cfg.smtpServer,
        smtp_ports: cfg.smtpPorts,
        smtp_ssl_port: cfg.smtpSslPort,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.post('/test-smtp-email', async (req, res) => {
  try {
    const toEmail = String(req.body.email || 'shishkarnem@gmail.com').trim().toLowerCase();
    const type = String(req.body.type || 'both');
    const siteUrl = 'https://qaiz.ru';
    const results: Record<string, any> = {};

    if (type === 'reset' || type === 'both') {
      const resetCode = String(Math.floor(100000 + Math.random() * 900000));
      const token = createEncryptedMailToken({
        action: 'reset_password',
        uid: '10016926299',
        email: toEmail,
        code: resetCode,
        exp: Date.now() + 3600000,
      });
      const resetLink = `${siteUrl}/?reset_token=${encodeURIComponent(token)}`;
      results.passwordReset = await sendPasswordResetEmail({
        toEmail,
        displayName: 'Тимошенко Денис',
        uid: '10016926299',
        resetCode,
        resetLink,
        siteUrl,
      });
    }

    if (type === 'reminder' || type === 'both') {
      const featured = REMINDER_GAMES_POOL[0];
      const others = REMINDER_GAMES_POOL.slice(1);
      results.weeklyReminder = await sendWeeklyGameReminderEmail({
        toEmail,
        displayName: 'Тимошенко Денис',
        uid: '10016926299',
        featuredGame: featured,
        otherGames: others,
        siteUrl,
      });
    }

    res.json({ success: true, toEmail, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Panel Access Verification - GET (for fast check) and POST (for credential verification)
authRouter.get('/admin-verify', async (req, res) => {
  try {
    const rawUid = req.headers['x-user-uid'] || req.query.uid || req.query.user_id;
    if (!rawUid) {
      return res.status(401).json({ authorized: false, error: 'Требуется идентификатор пользователя' });
    }

    const cleanUid = String(rawUid).trim();
    const user = await getOne(
      'SELECT * FROM users WHERE uid = $1 OR id = $2 OR telegram_id::text = $3 OR LOWER(email) = $4',
      [cleanUid, cleanUid, cleanUid, cleanUid.toLowerCase()]
    );

    if (user && isSuperAdminRecord(user)) {
      const safeUser = { ...user };
      delete safeUser.password;
      return res.json({
        authorized: true,
        success: true,
        message: 'Доступ к панели управления разрешен',
        data: safeUser
      });
    }

    // Direct check for hardcoded superadmin UID / TG / email
    if (cleanUid === '10016926299' || cleanUid === '169262990' || cleanUid.toLowerCase() === 'shishkarnem@gmail.com') {
      return res.json({
        authorized: true,
        success: true,
        message: 'Доступ к панели управления разрешен',
        data: { uid: '10016926299', role: 'admin', display_name: 'Главный Администратор' }
      });
    }

    return res.status(403).json({ authorized: false, error: 'Доступ ограничен. Панель управления доступна только супер-администратору.' });
  } catch (err: any) {
    console.error('Error in GET /api/auth/admin-verify:', err);
    res.status(500).json({ authorized: false, error: err.message });
  }
});

authRouter.post('/admin-verify', async (req, res) => {
  try {
    const { uid, password } = req.body;
    const headerUid = req.headers['x-user-uid'];
    const targetUid = uid || headerUid;

    if (!targetUid) {
      return res.status(400).json({ authorized: false, error: 'UID обязателен' });
    }

    const cleanUid = String(targetUid).trim();
    const user = await getOne(
      'SELECT * FROM users WHERE uid = $1 OR id = $2 OR telegram_id::text = $3 OR LOWER(email) = $4',
      [cleanUid, cleanUid, cleanUid, cleanUid.toLowerCase()]
    );

    const isSuper = user ? isSuperAdminRecord(user) : (cleanUid === '10016926299' || cleanUid === '169262990' || cleanUid.toLowerCase() === 'shishkarnem@gmail.com');

    if (!isSuper) {
      return res.status(403).json({ authorized: false, error: 'Доступ запрещен: действие разрешено только главному администратору' });
    }

    // If password supplied, verify password
    if (password && password !== ADMIN_MASTER_PASSWORD) {
      return res.status(401).json({ authorized: false, error: 'Неверный пароль доступа к панели управления' });
    }

    const safeUser = user ? { ...user } : { uid: cleanUid, role: 'admin', display_name: 'Главный Администратор' };
    delete safeUser.password;

    res.json({
      authorized: true,
      success: true,
      message: 'Доступ к панели управления разрешен',
      data: safeUser
    });
  } catch (err: any) {
    console.error('Error in POST /api/auth/admin-verify:', err);
    res.status(500).json({ authorized: false, error: err.message });
  }
});

