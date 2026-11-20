import { executeDatabaseBackup } from "./backup";
import { getAll, getOne, runSql } from "./db";
import { sendTelegramPhoto, sendTelegramMessage, getTelegramBotConfig, isTelegramBotBlockedError } from "./telegram";
import { sendWeeklyGameReminderEmail } from "./mailer";

/**
 * Вычисляет дату следующего напоминания ровно через 7 дней в случайное время от 10:00 до 17:00 (МСК)
 */
export function getNextWeeklyRandomReminderIso(): string {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  // Random hour in 10..16 MSK (which is 07..13 UTC) and random minute 0..59
  const randomMskHour = 10 + Math.floor(Math.random() * 7); // 10, 11, 12, 13, 14, 15, 16
  const randomMinute = Math.floor(Math.random() * 60);
  const utcHour = (randomMskHour - 3 + 24) % 24;
  nextWeek.setUTCHours(utcHour, randomMinute, 0, 0);
  return nextWeek.toISOString();
}

export interface GameReminderCard {
  gameId: string;
  fileId: number;
  photoUrl: string;
  title: string;
  tagline: string;
  emoji: string;
}

export const REMINDER_GAMES_POOL: GameReminderCard[] = [
  {
    gameId: "blitz",
    fileId: 18,
    photoUrl: "https://file.pro-talk.ru/tgf/GTUpJwQ9JCkYKglyGHQMIx9jO08kTyobXgJzOAgqaR8NX2F_cwl3AQohaAMZEyNdAg0eCgoBGG8KanInUwN7PSoiHmUpNQQeLA8YFgdnGHEWMGMtN05yTm9kWVx2bl1SGBMkTzhDL1JEJjw_EgstGT0CNywaIC0xBGA3AAwZVgAuOy4GJH9dVHVpW19rZFYD.jpg",
    title: "КвИИз",
    tagline: "Скоростной ИИ-спринт на эрудицию и смекалку с голосовым и текстовым вводом!",
    emoji: "⚡"
  },
  {
    gameId: "millionaire",
    fileId: 19,
    photoUrl: "https://file.pro-talk.ru/tgf/GTUpJwQ9JCkYKglyGHQMI20WO08kTyIDIgAGBRUNIz8KXDoAGTthEwk4MhUZEyNJAg0eCgoBGG8KBj4-YBR9AS0QFjspNQQeLA8YFgdnGHEWMGMtN05yTm9kWVx2bl1SGBMkTzhDL1JEJjw_EgstGT0CNywaIC0xBGA3AAwZVgAuOy4GJH9dVHVpW19rZFYD.jpg",
    title: "Квиллионер",
    tagline: "15 шагов по интеллектуальной лестнице к миллиону очков и несгораемым суммам!",
    emoji: "💎"
  },
  {
    gameId: "100to1",
    fileId: 16,
    photoUrl: "https://file.pro-talk.ru/tgf/GTUpJwQ9JCkYKglyGHQMIx8GO08kTzoRGCVyOCUOCzsuTGxZNDV7ZXw6DzcZEyNTAg0eCgoBGG8KBTY4VgM4DCMTFAUpNQQeLA8YFgdnGHEWMGMtN05yTm9kWVx2bl1SGBMkTzhDL1JEJjw_EgstGT0CNywaIC0xBGA3AAwZVgAuOy4GJH9dVHVpW19rZFYD.jpg",
    title: "Сто Квадному",
    tagline: "Угадайте самые популярные ответы людей на улице и победите в командной дуэли!",
    emoji: "🔥"
  },
  {
    gameId: "whatwherewhen",
    fileId: 20,
    photoUrl: "https://file.pro-talk.ru/tgf/GTUpJwQ9JCkYKglyGHQMIx8WO08kTwgXJxUnADcMNzwBRClmHzdgFSEYNz0ZEyNSAg0eCgoBGG8KADIqZA4TOwA2DyQpNQQeLA8YFgdnGHEWMGMtN05yTm9kWVx2bl1SGBMkTzhDL1JEJjw_EgstGT0CNywaIC0xBGA3AAwZVgAuOy4GJH9dVHVpW19rZFYD.jpg",
    title: "Что? Где? Квада?",
    tagline: "Элитарный клуб знатоков, волчок и глубокие логические загадки против телезрителей!",
    emoji: "🦉"
  },
  {
    gameId: "jeopardy",
    fileId: 17,
    photoUrl: "https://file.pro-talk.ru/tgf/GTUpJwQ9JCkYKglyGHQMIx88O08kTz8GMigIIxc-CgEhRjhmDioANAlILTIZEyNcAg0eCgoBGG8KBHFMYSEeSic_PxUpNQQeLA8YFgdnGHEWMGMtN05yTm9kWVx2bl1SGBMkTzhDL1JEJjw_EgstGT0CNywaIC0xBGA3AAwZVgAuOy4GJH9dVHVpW19rZFYD.jpg",
    title: "Своя Икра",
    tagline: "Интеллектуальное табло тем от 100 до 1500 очков, 3 раунда и кульминационный Суперфинал!",
    emoji: "👑"
  }
];

let lastBackupRunDay = -1;
let isReminderBatchRunning = false;

async function resolveGameCoverMedia(card: GameReminderCard): Promise<{ photoBuffer?: Buffer; photoUrl?: string }> {
  try {
    const row = await getOne<{ original_url?: string; url?: string }>(
      "SELECT original_url, url FROM file_storage WHERE id = $1 LIMIT 1",
      [card.fileId]
    );
    const url = row?.original_url || row?.url || card.photoUrl;
    if (url && url.startsWith("data:")) {
      const commaIdx = url.indexOf(",");
      if (commaIdx !== -1) {
        const base64Data = url.slice(commaIdx + 1);
        return { photoBuffer: Buffer.from(base64Data, "base64") };
      }
    }
    if (url && url.startsWith("http")) {
      return { photoUrl: url };
    }
    return { photoUrl: card.photoUrl };
  } catch {
    return { photoUrl: card.photoUrl };
  }
}

export interface ReminderRunSummary {
  checked: number;
  sent: number;
  blocked: number;
  skipped: number;
  errors: number;
  details: Array<{
    uid: string;
    telegramId: string;
    status: "sent" | "blocked" | "skipped" | "error";
    gameTitle?: string;
    error?: string;
  }>;
}

/**
 * Каскадная отправка rich-message напоминаний раз в 7 дней:
 * - Отправляется ТОЛЬКО пользователям с telegram_id (и Email-пользователям без telegram_id), которые НЕ входили в течение последних 7 дней
 * - Исключает тех, кто заблокировал бота (telegram_bot_blocked = 1), и ставит отметку при обнаружении блокировки
 * - Исключает дубли: при успешной отправке продлевает next_reminder_at на +7 дней (через UPDATE и PostgreSQL триггер)
 * - Формат: Rich-сообщение с обложкой случайной из 5 игр и зеленой инлайн-кнопкой запуска Mini App
 */
export async function runWeeklyInactivityReminders(options?: {
  limit?: number;
  forceTestUid?: string;
  emailOnly?: boolean;
}): Promise<ReminderRunSummary> {
  if (isReminderBatchRunning && !options?.forceTestUid) {
    return { checked: 0, sent: 0, blocked: 0, skipped: 0, errors: 0, details: [] };
  }

  isReminderBatchRunning = true;
  const summary: ReminderRunSummary = {
    checked: 0,
    sent: 0,
    blocked: 0,
    skipped: 0,
    errors: 0,
    details: []
  };

  try {
    const batchLimit = options?.limit || 30;

    // 1. Telegram-напоминания (если не передан флаг emailOnly)
    if (!options?.emailOnly) {
      let candidates: any[] = [];

      if (options?.forceTestUid) {
        candidates = await getAll(
          `SELECT uid, id, telegram_id, display_name, first_name, username,
                  last_login, last_active_at, last_reminder_sent_at, next_reminder_at,
                  GREATEST(COALESCE(is_bot_blocked, 0), COALESCE(telegram_bot_blocked, 0)) AS telegram_bot_blocked
           FROM users
           WHERE (uid = $1 OR id = $1 OR telegram_id = $1)
             AND telegram_id IS NOT NULL AND TRIM(CAST(telegram_id AS TEXT)) != ''
           LIMIT 1`,
          [options.forceTestUid]
        );
      } else {
        candidates = await getAll(
          `SELECT u.uid, u.id, u.telegram_id, u.display_name, u.first_name, u.username,
                  u.last_login, u.last_active_at, u.last_reminder_sent_at, u.next_reminder_at,
                  GREATEST(COALESCE(u.is_bot_blocked, 0), COALESCE(u.telegram_bot_blocked, 0)) AS telegram_bot_blocked
           FROM users u
           WHERE u.telegram_id IS NOT NULL
             AND TRIM(CAST(u.telegram_id AS TEXT)) != ''
             AND COALESCE(u.is_bot_blocked, 0) = 0
             AND COALESCE(u.telegram_bot_blocked, 0) = 0
             AND COALESCE(u.last_active_at, u.last_seen, u.last_login, u.created_at, '2000-01-01'::timestamptz) <= NOW() - INTERVAL '7 days'
             AND (u.next_reminder_at IS NULL OR u.next_reminder_at <= NOW())
             AND (u.last_reminder_sent_at IS NULL OR u.last_reminder_sent_at <= NOW() - INTERVAL '7 days')
             AND NOT EXISTS (
               SELECT 1 FROM mailing_logs ml
               WHERE (ml.recipient_id = u.uid OR ml.recipient_id = CAST(u.telegram_id AS TEXT))
                 AND ml.type = 'inactivity_reminder_7d'
                 AND ml.status = 'sent'
                 AND ml.timestamp > (EXTRACT(EPOCH FROM NOW())::bigint - 604800) * 1000
             )
           ORDER BY COALESCE(u.next_reminder_at, u.last_active_at, u.last_login, '2000-01-01'::timestamptz) ASC
           LIMIT $1`,
          [batchLimit]
        );
      }

      summary.checked += candidates.length;

      if (candidates.length > 0) {
        const botConfig = await getTelegramBotConfig();
        const miniAppUrl = botConfig.miniAppUrl || "https://t.me/qaiz_aibot/app";

        for (const user of candidates) {
          const uid = String(user.uid || user.id);
          const tgId = String(user.telegram_id).trim();

          if (!tgId || (Number(user.telegram_bot_blocked) === 1 && !options?.forceTestUid)) {
            summary.skipped++;
            summary.details.push({ uid, telegramId: tgId, status: "skipped" });
            continue;
          }

          const randomGame = REMINDER_GAMES_POOL[Math.floor(Math.random() * REMINDER_GAMES_POOL.length)];
          const coverMedia = await resolveGameCoverMedia(randomGame);

          const playerName = user.first_name || user.display_name || user.username || "Знаток";
          const caption =
            `${randomGame.emoji} <b>Привет, ${playerName}! Мы скучали по твоей игре в КвИИз!</b>\n\n` +
            `Прошла целая неделя без интеллектуальных дуэлей. Сегодня тебя ждёт <b>«${randomGame.title}»</b>:\n` +
            `<i>${randomGame.tagline}</i>\n\n` +
            `🎁 Заходи прямо сейчас в лобби, забирай бонусы ИИкр и проверь свою эрудицию с друзьями или нейросетью!`;

          const replyMarkup = {
            inline_keyboard: [
              [
                {
                  text: `🟢 Играть в «${randomGame.title}»`,
                  url: miniAppUrl,
                  style: "success"
                }
              ]
            ]
          };

          try {
            let sendRes: { ok: boolean; error?: string; blocked?: boolean };

            if (coverMedia.photoBuffer || coverMedia.photoUrl) {
              sendRes = await sendTelegramPhoto({
                chatId: tgId,
                photoBuffer: coverMedia.photoBuffer,
                photoUrl: coverMedia.photoUrl,
                filename: `${randomGame.gameId}.jpg`,
                caption,
                parseMode: "HTML",
                replyMarkup
              });
              if (!sendRes.ok && !sendRes.blocked && !isTelegramBotBlockedError(sendRes.error)) {
                sendRes = await sendTelegramMessage({
                  chatId: tgId,
                  text: caption,
                  parseMode: "HTML",
                  replyMarkup
                });
              }
            } else {
              sendRes = await sendTelegramMessage({
                chatId: tgId,
                text: caption,
                parseMode: "HTML",
                replyMarkup
              });
            }

            if (sendRes.ok) {
              await runSql(
                `UPDATE users
                 SET last_reminder_sent_at = NOW(),
                     next_reminder_at = NOW() + INTERVAL '7 days',
                     reminder_count = COALESCE(reminder_count, 0) + 1,
                     is_bot_blocked = 0,
                     telegram_bot_blocked = 0,
                     updated_at = NOW()
                 WHERE uid = $1 OR id = $1`,
                [uid]
              );

              await runSql(
                `INSERT INTO mailing_logs (id, recipient_id, type, status, timestamp)
                 VALUES ($1, $2, 'inactivity_reminder_7d', 'sent', $3)`,
                [`rem7d_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, uid, Date.now()]
              );

              summary.sent++;
              summary.details.push({
                uid,
                telegramId: tgId,
                status: "sent",
                gameTitle: randomGame.title
              });
            } else if (sendRes.blocked || isTelegramBotBlockedError(sendRes.error)) {
              await runSql(
                `UPDATE users
                 SET is_bot_blocked = 1,
                     bot_blocked_at = NOW(),
                     telegram_bot_blocked = 1,
                     telegram_bot_blocked_at = NOW(),
                     updated_at = NOW()
                 WHERE uid = $1 OR id = $1`,
                [uid]
              );

              await runSql(
                `INSERT INTO mailing_logs (id, recipient_id, type, status, timestamp)
                 VALUES ($1, $2, 'inactivity_reminder_7d', 'blocked_by_user', $3)`,
                [`rem7d_blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, uid, Date.now()]
              );

              summary.blocked++;
              summary.details.push({
                uid,
                telegramId: tgId,
                status: "blocked",
                error: sendRes.error
              });
            } else {
              await runSql(
                `UPDATE users
                 SET next_reminder_at = NOW() + INTERVAL '6 hours'
                 WHERE uid = $1 OR id = $1`,
                [uid]
              );

              summary.errors++;
              summary.details.push({
                uid,
                telegramId: tgId,
                status: "error",
                error: sendRes.error
              });
            }
          } catch (err: any) {
            const errMsg = err?.message || "Unknown send error";
            if (isTelegramBotBlockedError(errMsg)) {
              await runSql(
                `UPDATE users
                 SET is_bot_blocked = 1,
                     bot_blocked_at = NOW(),
                     telegram_bot_blocked = 1,
                     telegram_bot_blocked_at = NOW(),
                     updated_at = NOW()
                 WHERE uid = $1 OR id = $1`,
                [uid]
              );
              summary.blocked++;
              summary.details.push({ uid, telegramId: tgId, status: "blocked", error: errMsg });
            } else {
              summary.errors++;
              summary.details.push({ uid, telegramId: tgId, status: "error", error: errMsg });
            }
          }

          await new Promise((resolve) => setTimeout(resolve, 450));
        }
      }
    }

    // 2. Отправка еженедельных напоминаний на ПОЧТУ для тех, у кого НЕТ регистрации через Telegram
    let emailCandidates: any[] = [];
    if (options?.forceTestUid) {
      emailCandidates = await getAll(
        `SELECT uid, id, email, display_name, first_name, username, COALESCE(email_unsubscribed, 0) AS email_unsubscribed
         FROM users
         WHERE (uid = $1 OR id = $1 OR LOWER(email) = $2)
           AND (telegram_id IS NULL OR TRIM(CAST(telegram_id AS TEXT)) = '')
           AND email IS NOT NULL AND TRIM(email) != ''
         LIMIT 1`,
        [options.forceTestUid, String(options.forceTestUid).toLowerCase()]
      );
    } else {
      emailCandidates = await getAll(
        `SELECT u.uid, u.id, u.email, u.display_name, u.first_name, u.username,
                COALESCE(u.email_unsubscribed, 0) AS email_unsubscribed
         FROM users u
         LEFT JOIN user_notification_settings uns ON uns.user_id = u.uid
         WHERE (u.telegram_id IS NULL OR TRIM(CAST(u.telegram_id AS TEXT)) = '')
           AND u.email IS NOT NULL AND TRIM(u.email) != ''
           AND COALESCE(u.email_unsubscribed, 0) = 0
           AND COALESCE(uns.telegram_reminders_enabled, 1) = 1
           AND COALESCE(u.last_active_at, u.last_seen, u.last_login, u.created_at, '2000-01-01'::timestamptz) <= NOW() - INTERVAL '7 days'
           AND (u.next_reminder_at IS NULL OR u.next_reminder_at <= NOW())
           AND (u.last_reminder_sent_at IS NULL OR u.last_reminder_sent_at <= NOW() - INTERVAL '7 days')
           AND NOT EXISTS (
             SELECT 1 FROM mailing_logs ml
             WHERE (ml.recipient_id = u.uid OR ml.recipient_id = LOWER(u.email))
               AND ml.type = 'email_inactivity_reminder_7d'
               AND ml.status = 'sent'
               AND ml.timestamp > (EXTRACT(EPOCH FROM NOW())::bigint - 604800) * 1000
           )
         ORDER BY COALESCE(u.next_reminder_at, u.last_active_at, u.last_login, '2000-01-01'::timestamptz) ASC
         LIMIT $1`,
        [batchLimit]
      );
    }

    summary.checked += emailCandidates.length;

    for (const eUser of emailCandidates) {
      const uid = String(eUser.uid || eUser.id);
      const emailAddr = String(eUser.email || '').trim().toLowerCase();
      if (!emailAddr || (Number(eUser.email_unsubscribed) === 1 && !options?.forceTestUid)) {
        summary.skipped++;
        continue;
      }

      const randomIdx = Math.floor(Math.random() * REMINDER_GAMES_POOL.length);
      const featuredGame = REMINDER_GAMES_POOL[randomIdx];
      const otherGames = REMINDER_GAMES_POOL.filter((_, idx) => idx !== randomIdx);
      const nextRandomTime = getNextWeeklyRandomReminderIso();

      try {
        const mailRes = await sendWeeklyGameReminderEmail({
          toEmail: emailAddr,
          displayName: eUser.first_name || eUser.display_name || eUser.username || 'Знаток',
          uid,
          featuredGame,
          otherGames,
          siteUrl: 'https://qaiz.ru',
        });

        if (mailRes.ok) {
          await runSql(
            `UPDATE users
             SET last_reminder_sent_at = NOW(),
                 next_reminder_at = $1::timestamptz,
                 reminder_count = COALESCE(reminder_count, 0) + 1,
                 updated_at = NOW()
             WHERE uid = $2 OR id = $2`,
            [nextRandomTime, uid]
          );

          await runSql(
            `INSERT INTO mailing_logs (id, recipient_id, type, status, timestamp)
             VALUES ($1, $2, 'email_inactivity_reminder_7d', 'sent', $3)`,
            [`emrem7d_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, uid, Date.now()]
          );

          summary.sent++;
          summary.details.push({
            uid,
            telegramId: emailAddr,
            status: 'sent',
            gameTitle: featuredGame.title,
          });
        } else {
          await runSql(
            `UPDATE users SET next_reminder_at = NOW() + INTERVAL '6 hours' WHERE uid = $1 OR id = $1`,
            [uid]
          );
          summary.errors++;
          summary.details.push({
            uid,
            telegramId: emailAddr,
            status: 'error',
            error: mailRes.error,
          });
        }
      } catch (err: any) {
        summary.errors++;
        summary.details.push({
          uid,
          telegramId: emailAddr,
          status: 'error',
          error: err?.message || 'SMTP error',
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (err) {
    console.error("[Reminder Cron] Error in weekly inactivity reminders:", err);
  } finally {
    isReminderBatchRunning = false;
  }

  return summary;
}

export function initBackupCronJob() {
  console.log("[Cron Engine] Daily 06:00 MSK Backup & 7-Day Email Reminder Service (10:00-17:00 MSK) initialized. Telegram reminders run via ProTalk PG Cron.");

  // Проверка каждую минуту для ежедневного бэкапа в 06:00 МСК и очереди email-напоминаний (Telegram обрабатывает PG Cron vtadl756)
  setInterval(async () => {
    try {
      const now = new Date();
      // Calculate Moscow Time (UTC+3)
      const mskTime = new Date(now.getTime() + 3 * 3600 * 1000);
      const mskHour = mskTime.getUTCHours();
      const mskMinute = mskTime.getUTCMinutes();
      const currentMskDay = mskTime.getUTCDate();

      // 1. Ежедневный автобэкап в 06:00 МСК
      if (mskHour === 6 && mskMinute === 0 && lastBackupRunDay !== currentMskDay) {
        lastBackupRunDay = currentMskDay;
        console.log(`[Cron Engine] 06:00 MSK reached (Day ${currentMskDay}). Starting scheduled database backup...`);
        await executeDatabaseBackup("Ежедневный автобэкап в 06:00 МСК");
      }

      // 2. В период 10:00-17:00 МСК проверяем очередь email-напоминаний (Telegram обрабатывается PG Edge cron vtadl756)
      if (mskHour >= 10 && mskHour < 17 && mskMinute % 15 === 7) {
        await runWeeklyInactivityReminders({ limit: 20, emailOnly: true });
      }
    } catch (err) {
      console.error("[Cron Engine] Error in cron ticker:", err);
    }
  }, 60000);
}
