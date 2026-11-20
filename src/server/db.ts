import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { pgAll, pgOne, pgRun, pgQuery, mcpCall } from './pg';
import { APP_VERSION, APP_VERSION_DATE } from '../shared/version';

export function formatRuDate(dateInput?: Date | string | number): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const dd = String(validDate.getDate()).padStart(2, '0');
  const mm = String(validDate.getMonth() + 1).padStart(2, '0');
  const yyyy = validDate.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export const generateId = (prefix: string = 'id') => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

export function generate11DigitUID(): string {
  const min = 10000000000;
  const max = 99999999999;
  return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
}

export async function getUnique11DigitUID(): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const uid = generate11DigitUID();
    const existing = await getOne('SELECT id FROM users WHERE id = $1 OR uid = $1', [uid]);
    if (!existing) return uid;
  }
  return generate11DigitUID();
}

// ============================================================================
// POSTGRESQL DATA ACCESS LAYER (via ProTalk DB Proxy)
// ============================================================================

let initialized = false;
const settingsCache = new Map<string, string>();

export async function refreshSettingsCache(): Promise<void> {
  try {
    const rows = await pgAll<{ key: string; value: string }>('SELECT key, value FROM system_settings');
    for (const r of rows) {
      if (r.key) {
        settingsCache.set(String(r.key), r.value !== null && r.value !== undefined ? String(r.value) : '');
      }
    }
  } catch (err) {
    console.warn('[PG Settings] Failed to refresh settings cache:', err);
  }
}


export async function getAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return pgAll<T>(sql, params);
}

export async function getOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  return pgOne<T>(sql, params);
}

export async function runSql(sql: string, params: any[] = []): Promise<void> {
  await pgRun(sql, params);
}

export const queryAll = getAll;
export const queryGet = getOne;
export const queryRun = runSql;

export async function initDb(): Promise<{ query: typeof pgQuery }> {
  if (initialized) return { query: pgQuery };

  await pgOne('SELECT 1 AS ok');
  await refreshSettingsCache();

  // Sync src/shared/version.ts from PostgreSQL system_settings
  try {
    const curDbVer = settingsCache.get('app_version')?.trim() || APP_VERSION;
    const curDbDate = settingsCache.get('app_version_date')?.trim() || APP_VERSION_DATE || formatRuDate();
    const versionFilePath = path.join(process.cwd(), 'src', 'shared', 'version.ts');
    const desiredContent = `// Автоматически синхронизируемая версия платформы КвИИз (берется из базы данных system_settings)\nexport const APP_VERSION = '${curDbVer.replace(/['"`\\]/g, '')}';\nexport const APP_VERSION_DATE = '${curDbDate.replace(/['"`\\]/g, '')}';\n`;
    if (!fs.existsSync(versionFilePath) || fs.readFileSync(versionFilePath, 'utf8') !== desiredContent) {
      fs.writeFileSync(versionFilePath, desiredContent, 'utf8');
    }
  } catch (_) {}

  initialized = true;
  console.log('[ProTalk PG] Connected to PostgreSQL database "qaiz" successfully.');
  return { query: pgQuery };
}

// ============================================================================
// SERVER-SIDE SECRET ENCRYPTION & MASKING (AES-256-GCM)
// ============================================================================
const SERVER_VAULT_SECRET = crypto
  .createHash('sha256')
  .update(process.env.SERVER_VAULT_KEY || 'qaiz_quantum_vault_secret_key_2026_v1_99d037')
  .digest();

export function encryptSecretValue(plain: string): string {
  if (!plain || typeof plain !== 'string') return '';
  if (plain.startsWith('enc:v1:')) return plain;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', SERVER_VAULT_SECRET, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (_) {
    return plain;
  }
}

export function decryptSecretValue(stored: string): string {
  if (!stored || typeof stored !== 'string') return '';
  if (!stored.startsWith('enc:v1:')) return stored;
  try {
    const parts = stored.split(':');
    if (parts.length !== 5) return stored;
    const iv = Buffer.from(parts[2], 'hex');
    const tag = Buffer.from(parts[3], 'hex');
    const encrypted = Buffer.from(parts[4], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', SERVER_VAULT_SECRET, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (_) {
    return '';
  }
}

export function maskSecretToken(rawVal: string | null | undefined): string {
  if (!rawVal) return '';
  const plain = decryptSecretValue(String(rawVal));
  if (!plain) return '';
  if (plain.length <= 8) return '••••••••';
  return `${plain.slice(0, 4)}••••••••${plain.slice(-4)}`;
}

export function isSensitiveSettingKey(key: string): boolean {
  const k = String(key || '').toLowerCase();
  return (
    k.includes('token') ||
    k.includes('secret') ||
    k.includes('password') ||
    k.includes('api_key') ||
    k.includes('private')
  );
}

export function getProtectedSetting(key: string, fallback: string = ''): string {
  const cached = settingsCache.get(key);
  if (cached !== undefined && cached.trim() !== '') {
    return decryptSecretValue(cached);
  }
  return fallback;
}

export async function getProtectedSettingAsync(key: string, fallback: string = ''): Promise<string> {
  try {
    const row = await getOne<{ value: string }>('SELECT value FROM system_settings WHERE key = $1 LIMIT 1', [key]);
    if (row && row.value !== undefined && row.value !== null && String(row.value).trim() !== '') {
      const strVal = String(row.value);
      settingsCache.set(key, strVal);
      return decryptSecretValue(strVal);
    }
  } catch (_) {}
  return getProtectedSetting(key, fallback);
}

export async function setProtectedSetting(key: string, value: string, forceEncrypt?: boolean): Promise<void> {
  const shouldEncrypt = forceEncrypt !== undefined ? forceEncrypt : isSensitiveSettingKey(key);
  const storedVal = shouldEncrypt ? encryptSecretValue(String(value)) : String(value);
  settingsCache.set(key, storedVal);
  try {
    await runSql(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, storedVal]
    );
  } catch (e) {
    console.error('[PG Vault] Error saving setting:', key, e);
  }
}

export const encryptSecret = encryptSecretValue;
export const decryptSecret = decryptSecretValue;
export const maskSecret = maskSecretToken;
export const getSystemSetting = getProtectedSetting;
export const getSystemSettingAsync = getProtectedSettingAsync;
export const setSystemSetting = setProtectedSetting;

// ============================================================================
// CURRENCY, BALANCES & BONUSES
// ============================================================================

export function getIikrWord(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  const last2 = abs % 100;
  const last1 = abs % 10;
  if (last2 >= 11 && last2 <= 19) return 'ИИкр';
  if (last1 === 1) return 'ИИкра';
  if (last1 >= 2 && last1 <= 4) return 'ИИкры';
  return 'ИИкр';
}

export function formatIikrCurrency(amount: number): string {
  return `${amount} ${getIikrWord(amount)}`;
}

export async function recalculateUserBalancesFromTransactions(userId: string) {
  const user = await getOne<{
    id: string;
    uid: string;
    telegram_id?: string;
    email?: string;
    role?: string;
    created_at?: string;
  }>(
    `SELECT id, uid, telegram_id, email, role, created_at FROM users WHERE uid = $1 OR id = $1 OR telegram_id = $1`,
    [userId]
  );

  if (!user) return 0;
  const targetUid = user.uid || user.id;

  // 1. Check if start_tma transaction is needed (300 IIKR for telegram link/registration)
  if (user.telegram_id && String(user.telegram_id).trim().length > 0) {
    const hasTma = await getOne(`SELECT id FROM transactions WHERE user_id = $1 AND type = 'start_tma'`, [targetUid]);
    if (!hasTma) {
      const bonusAmount = 300;
      await runSql(
        `INSERT INTO transactions (id, user_id, amount, currency, type, description, timestamp, created_at)
         VALUES ($1, $2, $3, $4, 'start_tma', $5, $6, NOW())`,
        [
          `tx_start_tma_${targetUid}_${Date.now()}`,
          targetUid,
          bonusAmount,
          getIikrWord(bonusAmount),
          'Приветственный бонус за регистрацию через Telegram (300 ИИкр)',
          Date.now()
        ]
      );
    }
  }

  // 2. Check if start_email transaction is needed (300 IIKR for email link/registration)
  if (user.email && String(user.email).trim().length > 0) {
    const hasEmail = await getOne(`SELECT id FROM transactions WHERE user_id = $1 AND type = 'start_email'`, [targetUid]);
    if (!hasEmail) {
      const bonusAmount = 300;
      await runSql(
        `INSERT INTO transactions (id, user_id, amount, currency, type, description, timestamp, created_at)
         VALUES ($1, $2, $3, $4, 'start_email', $5, $6, NOW())`,
        [
          `tx_start_email_${targetUid}_${Date.now()}`,
          targetUid,
          bonusAmount,
          getIikrWord(bonusAmount),
          'Приветственный бонус при регистрации по почте (300 ИИкр)',
          Date.now()
        ]
      );
    }
  }

  // 3. Aggregate all transaction categories
  const rows = await getAll<{ type: string; total_amount: number; count: number }>(
    `SELECT type, COALESCE(SUM(amount), 0) as total_amount, COUNT(*)::int as count
     FROM transactions
     WHERE user_id = $1 OR user_id = $2 OR user_id = $3
     GROUP BY type`,
    [targetUid, user.id, user.telegram_id || '']
  );

  let balance_start = 0;
  let balance_ref = 0;
  let balance_admin = 0;
  let balance_pay = 0;
  let balance_author = 0;
  let balance_out = 0;
  let balance_time = 0;
  let balance_spent = 0;
  let ballance_point = 0;
  let balance_gift = 0;

  for (const r of rows) {
    const amt = Number(r.total_amount) || 0;
    const t = (r.type || '').toLowerCase();

    if (t === 'start_tma' || t === 'start_email' || t === 'welcome_bonus') {
      balance_start += amt;
    } else if (t.startsWith('ref') || t === 'referral_reward' || t === 'referral_bonus') {
      balance_ref += amt;
    } else if (t === 'admin' || t.startsWith('admin') || t === 'admin_adjustment' || t === 'admin_bonus') {
      balance_admin += amt;
    } else if (t === 'pay' || t.startsWith('pay') || t === 'deposit' || t === 'purchase_iikr' || t === 'purchase_balance' || t === 'top_up' || t === 'topup' || t === 'robokassa') {
      balance_pay += amt;
    } else if (t.startsWith('author') || t === 'pack_sale_reward') {
      balance_author += amt;
    } else if (t === 'gift_received' || t === 'balance_gift') {
      balance_gift += amt;
    } else if (t === 'gift_sent' || t.startsWith('out') || t === 'withdraw' || t === 'payout' || t === 'balance_out') {
      balance_out += Math.abs(amt);
      balance_spent += (amt < 0 ? amt : -amt);
    } else if (t.startsWith('time') || t === 'monthly_bonus' || t === 'activity_bonus') {
      balance_time += amt;
    } else if (t === 'point_exchange' || t === 'ballance_point' || t === 'points_exchange' || t === 'exchange_point') {
      ballance_point += amt;
    } else if (t === 'spend' || t.startsWith('spend') || t === 'purchase_game' || t === 'game_play') {
      balance_spent += amt;
    } else {
      if (amt > 0) {
        balance_admin += amt;
      } else {
        balance_spent += amt;
      }
    }
  }

  if (balance_time > 300) {
    balance_time = 300;
  }

  const candidateUserIds = [targetUid];
  if (user.id && !candidateUserIds.includes(user.id)) candidateUserIds.push(user.id);
  if (user.telegram_id && !candidateUserIds.includes(String(user.telegram_id))) candidateUserIds.push(String(user.telegram_id));
  const userPlaceholders = candidateUserIds.map((_, idx) => `$${idx + 1}`).join(',');

  const gameStats = await getOne<{ total_game_points: number }>(
    `SELECT COALESCE(SUM(score), 0) as total_game_points
     FROM game_sessions
     WHERE user_id IN (${userPlaceholders})
       AND (game_id IS NULL OR (game_id != 'free_millionaire' AND game_id NOT LIKE 'free_%'))
       AND (mode IS NULL OR mode != 'free')
       AND (game_title IS NULL OR (game_title NOT LIKE '%Freeлионер%' AND game_title NOT LIKE '%Free%'))`,
    candidateUserIds
  );

  const pointExchanges = await getOne<{ total_exchanged_points: number }>(
    `SELECT COALESCE(SUM(CASE WHEN reference_id ~ '^-?[0-9]+$' THEN reference_id::bigint ELSE 0 END), 0) as total_exchanged_points
     FROM transactions
     WHERE user_id IN (${userPlaceholders})
       AND type IN ('point_exchange', 'ballance_point', 'points_exchange', 'exchange_point')`,
    candidateUserIds
  );

  const totalEarnedPoints = Number(gameStats?.total_game_points || 0);
  const totalExchangedPoints = Number(pointExchanges?.total_exchanged_points || 0);
  const availablePoints = Math.max(0, totalEarnedPoints - totalExchangedPoints);

  const totalFreeEarned = Math.max(0, balance_start + balance_ref + balance_time + balance_admin + balance_author + ballance_point + balance_gift);
  const totalSpentAbs = Math.abs(balance_spent);
  const freeSpent = Math.min(totalFreeEarned, totalSpentAbs);
  const remainingSpentForPay = totalSpentAbs - freeSpent;

  const balance_free = Math.max(0, totalFreeEarned - freeSpent);
  const remaining_pay = Math.max(0, balance_pay - remainingSpentForPay);
  const total_balance = balance_free + remaining_pay;

  await runSql(
    `UPDATE users SET
      balance = $1,
      balance_free = $2,
      balance_ref = $3,
      balance_start = $4,
      balance_admin = $5,
      balance_pay = $6,
      balance_author = $7,
      balance_out = $8,
      balance_gift = $9,
      balance_time = $10,
      ballance_point = $11,
      balance_point = $12,
      total_points = $13,
      points = $14,
      updated_at = NOW()
     WHERE uid = $15 OR id = $16`,
    [
      total_balance,
      balance_free,
      balance_ref,
      balance_start,
      balance_admin,
      remaining_pay,
      balance_author,
      balance_out,
      balance_gift,
      balance_time,
      ballance_point,
      ballance_point,
      availablePoints,
      availablePoints,
      targetUid,
      user.id
    ]
  );

  return total_balance;
}

export async function checkAndApplyMonthlyTimeBonuses() {
  try {
    const allUsers = await getAll<{ id: string; uid: string; created_at: string }>(
      `SELECT id, uid, created_at FROM users`
    );

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const u of allUsers) {
      const targetUid = u.uid || u.id;
      const lastMonthlyTx = await getOne<{ created_at: string }>(
        `SELECT created_at FROM transactions
         WHERE user_id = $1 AND type = 'monthly_bonus'
         ORDER BY created_at DESC LIMIT 1`,
        [targetUid]
      );

      const referenceTime = lastMonthlyTx?.created_at
        ? new Date(lastMonthlyTx.created_at).getTime()
        : new Date(u.created_at || 0).getTime();

      if (now - referenceTime >= thirtyDaysMs) {
        const bonusAmount = 300;
        await runSql(
          `INSERT INTO transactions (id, user_id, amount, currency, type, description, timestamp, created_at)
           VALUES ($1, $2, $3, $4, 'monthly_bonus', $5, $6, NOW())`,
          [
            `tx_monthly_${targetUid}_${Date.now()}`,
            targetUid,
            bonusAmount,
            getIikrWord(bonusAmount),
            'Ежемесячный бонус за активность (300 ИИкр)',
            Date.now()
          ]
        );
        await recalculateUserBalancesFromTransactions(targetUid);
      }
    }
  } catch (err) {
    console.error('[Monthly Bonus Engine] Ошибка начисления бонусов:', err);
  }
}

export async function recalculateAllUserBalances() {
  try {
    const users = await getAll<{ id: string; uid: string }>(`SELECT id, uid FROM users`);
    for (const u of users) {
      await recalculateUserBalancesFromTransactions(u.uid || u.id);
    }
    console.log(`[Balance Engine] Синхронизированы балансы из таблицы транзакций для ${users.length} пользователей.`);
  } catch (err) {
    console.error('[Balance Engine] Ошибка синхронизации балансов:', err);
  }
}

export async function performDailyDatabaseBackup(_forceJson: boolean = false) {
  try {
    const mcpResult = await mcpCall('run_backup_now', {});
    console.log('[Backup Engine] ProTalk PostgreSQL backup completed:', mcpResult?.filename || 'OK');
    return mcpResult;
  } catch (err: any) {
    console.warn('[Backup Engine] ProTalk MCP backup warning:', err?.message || err);
    return null;
  }
}

export async function reconcileGameData() {
  try {
    const allPacks = await getAll<any>('SELECT * FROM game_packs');
    const packMap = new Map<string, any>();
    const packsWithJson: Array<{ pack: any; questions: any[] }> = [];

    for (const pack of allPacks) {
      if (pack?.id) packMap.set(String(pack.id), pack);
      if (!pack?.id || !pack.questions_json) continue;
      try {
        const packQs = JSON.parse(pack.questions_json || '[]');
        if (Array.isArray(packQs) && packQs.length > 0) {
          packsWithJson.push({ pack, questions: packQs });
        }
      } catch (_) {}
    }

    if (packsWithJson.length > 0) {
      const existingAllPackQs = await getAll<any>(
        'SELECT id, pack_id, question_index, question, answer, is_answered, is_correct, user_answer FROM generated_questions WHERE pack_id IS NOT NULL ORDER BY pack_id ASC, question_index ASC'
      );
      const questionsByPack = new Map<string, any[]>();
      for (const dq of existingAllPackQs) {
        const pid = String(dq.pack_id || '');
        if (!pid) continue;
        if (!questionsByPack.has(pid)) questionsByPack.set(pid, []);
        questionsByPack.get(pid)!.push(dq);
      }

      for (const { pack, questions: packQs } of packsWithJson) {
        const existingPackQs = questionsByPack.get(String(pack.id)) || [];

        for (let i = 0; i < packQs.length; i++) {
          const q = packQs[i];
          const qIdx = i + 1;
          const matchDb = existingPackQs.find((dq: any) => Number(dq.question_index) === qIdx);
          const scopedId = `gq_${pack.id}_${qIdx}`;
          const qText = q.text || q.question || matchDb?.question || `Вопрос ${qIdx}`;
          const qAns = q.correctAnswer || q.answer || matchDb?.answer || '';
          const isAns = (Number(q.is_answered) === 1 || Number(matchDb?.is_answered) === 1 || Boolean(q.user_answer) || Boolean(matchDb?.user_answer)) ? 1 : 0;
          const isCorr = (Number(q.is_correct) === 1 || Number(matchDb?.is_correct) === 1) ? 1 : 0;
          const uAns = q.user_answer || matchDb?.user_answer || null;

          if (!matchDb) {
            await runSql(
              `INSERT INTO generated_questions (
                id, user_id, pack_id, game_id, topic, title, difficulty, question_index, question, answer,
                options_json, hint, explanation, user_answer, is_answered, is_correct, times_shown, times_correct,
                times_incorrect, times_skipped, created_at
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0,$20::timestamptz)
              ON CONFLICT (id) DO NOTHING`,
              [
                scopedId,
                String(pack.user_id || 'usr_guest'),
                String(pack.id),
                String(pack.game_id || 'blitz'),
                String(pack.topic || 'Общие знания'),
                String(q.categoryName || q.title || 'Вопрос'),
                String(pack.difficulty || 'people'),
                qIdx,
                String(qText),
                String(qAns),
                q.options ? JSON.stringify(q.options) : null,
                q.hint || null,
                q.explanation || null,
                uAns,
                isAns,
                isCorr,
                isAns ? 1 : 0,
                isCorr ? 1 : 0,
                (isAns && !isCorr) ? 1 : 0,
                pack.created_at || new Date().toISOString()
              ]
            );
          } else if (isAns && Number(matchDb.is_answered) !== 1) {
            await runSql(
              `UPDATE generated_questions SET is_answered = 1, is_correct = $1, user_answer = COALESCE($2, user_answer) WHERE id = $3`,
              [isCorr, uAns, matchDb.id]
            );
          }
        }
      }
    }

    const [distinctPacks, allProgress, allRooms, allParticipants] = await Promise.all([
      getAll<{
        pack_id: string;
        user_id: string;
        game_id: string;
        topic: string;
        difficulty: string;
        min_created: string;
        max_created: string;
        total_count: number;
        answered_count: number;
        correct_count: number;
        max_index_answered: number;
      }>(`
        SELECT
          pack_id,
          MAX(user_id) as user_id,
          MAX(game_id) as game_id,
          MAX(topic) as topic,
          MAX(difficulty) as difficulty,
          MIN(created_at) as min_created,
          MAX(created_at) as max_created,
          COUNT(*)::int as total_count,
          SUM(CASE WHEN is_answered = 1 OR times_skipped > 0 THEN 1 ELSE 0 END)::int as answered_count,
          SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END)::int as correct_count,
          MAX(CASE WHEN is_answered = 1 OR times_skipped > 0 THEN question_index ELSE 0 END)::int as max_index_answered
        FROM generated_questions
        WHERE pack_id IS NOT NULL AND pack_id != ''
        GROUP BY pack_id
      `),
      getAll<{
        id: string;
        pack_id: string;
        game_type: string;
        current_step: number;
        total_steps: number;
        correct_answers: number;
        score: number;
        is_completed: number;
        topic: string;
        difficulty: string;
        state: string;
      }>(
        `SELECT id, pack_id, game_type, current_step, total_steps, correct_answers, score, is_completed, topic, difficulty, state
         FROM game_progress
         WHERE pack_id IS NOT NULL`
      ),
      getAll<{ id: string; pack_id: string; status: string; created_at: string }>(
        `SELECT id, pack_id, status, created_at FROM multiplayer_rooms WHERE pack_id IS NOT NULL ORDER BY created_at DESC`
      ),
      getAll<{ room_id: string; current_round: number; correct_count: number; score: number }>(
        `SELECT room_id, current_round, correct_count, score FROM multiplayer_participants ORDER BY current_round DESC, correct_count DESC`
      )
    ]);

    const progressByPack = new Map<string, (typeof allProgress)[number]>();
    for (const pr of allProgress) {
      const pid = String(pr.pack_id || '');
      if (pid && !progressByPack.has(pid)) progressByPack.set(pid, pr);
    }

    const roomByPack = new Map<string, (typeof allRooms)[number]>();
    for (const r of allRooms) {
      const pid = String(r.pack_id || '');
      if (pid && !roomByPack.has(pid)) roomByPack.set(pid, r);
    }

    const topPartByRoom = new Map<string, (typeof allParticipants)[number]>();
    for (const part of allParticipants) {
      const rid = String(part.room_id || '');
      if (rid && !topPartByRoom.has(rid)) topPartByRoom.set(rid, part);
    }

    const MILLIONAIRE_NOMINALS = [
      100, 200, 300, 500, 1000,
      2000, 4000, 8000, 16000, 32000,
      64000, 125000, 250000, 500000, 1000000
    ];

    for (const p of distinctPacks) {
      const existingPack = packMap.get(String(p.pack_id)) || null;
      const defaultPackMin = p.game_id === 'jeopardy' ? 75 : (p.game_id === '100to1' ? 24 : 10);
      const effectiveTotalCount = Math.max(Number(p.total_count) || 0, Number(existingPack?.question_count) || 0, defaultPackMin);
      const resolvedTitle = p.game_id === 'millionaire' ? 'Квиллионер' : (p.game_id === 'blitz' ? 'КвИИз' : (p.game_id === 'jeopardy' ? 'Своя Икра' : (p.game_id === 'whatwherewhen' ? 'Что? Где? Квада?' : (p.game_id === '100to1' ? 'Сто Квадному' : (p.game_id === 'melody' ? 'Укавкай мелодию' : 'Пакет вопросов')))));

      if (!existingPack) {
        const newPackObj = {
          id: p.pack_id,
          user_id: p.user_id,
          game_id: p.game_id,
          game_title: resolvedTitle,
          topic: p.topic || 'Общие знания',
          difficulty: p.difficulty || 'people',
          question_count: effectiveTotalCount,
        };
        await runSql(
          `INSERT INTO game_packs (id, user_id, game_id, game_title, topic, difficulty, question_count, questions_json, play_count, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, '[]', 1, $8::timestamptz, $9::timestamptz)
           ON CONFLICT (id) DO NOTHING`,
          [
            p.pack_id,
            p.user_id,
            p.game_id,
            resolvedTitle,
            newPackObj.topic,
            newPackObj.difficulty,
            effectiveTotalCount,
            p.min_created || new Date().toISOString(),
            p.max_created || new Date().toISOString()
          ]
        );
        packMap.set(String(p.pack_id), newPackObj);
      } else {
        const existingTopic = existingPack.topic;
        const newTopic = (p.game_id === 'jeopardy' && existingTopic && existingTopic !== 'Общие знания')
          ? existingTopic
          : (p.topic || existingTopic || 'Общие знания');
        const newTitle = p.game_id === 'jeopardy' ? 'Своя Икра' : existingPack.game_title;
        const newDiff = p.difficulty || existingPack.difficulty;

        if (
          Number(existingPack.question_count) !== effectiveTotalCount ||
          existingPack.topic !== newTopic ||
          existingPack.game_title !== newTitle ||
          existingPack.difficulty !== newDiff
        ) {
          await runSql(
            `UPDATE game_packs
             SET question_count = $1, topic = $2, game_title = $3, difficulty = COALESCE($4, difficulty)
             WHERE id = $5`,
            [effectiveTotalCount, newTopic, newTitle, newDiff, p.pack_id]
          );
          existingPack.question_count = effectiveTotalCount;
          existingPack.topic = newTopic;
          existingPack.game_title = newTitle;
          existingPack.difficulty = newDiff;
        }
      }

      const mpRoom = roomByPack.get(String(p.pack_id)) || null;
      const mpPart = mpRoom ? (topPartByRoom.get(String(mpRoom.id)) || null) : null;
      const existingProgress = progressByPack.get(String(p.pack_id)) || null;
      let stateStep = 0;
      if (existingProgress?.state) {
        try {
          const st = typeof existingProgress.state === 'string' ? JSON.parse(existingProgress.state) : existingProgress.state;
          stateStep = Number(st?.currentIndex || 0);
        } catch (_) {}
      }

      const mpStep = mpPart ? Math.max(0, (Number(mpPart.current_round) || 1) - 1, Number(mpPart.correct_count) || 0) : 0;
      const mpCorrect = mpPart ? Number(mpPart.correct_count || 0) : 0;
      const rawDbStep = (p.game_id === 'blitz' || p.game_id === 'jeopardy' || p.game_id === '100to1')
        ? Number(p.answered_count || 0)
        : Number(p.max_index_answered || 0);
      const currentStep = Math.max(rawDbStep, Number(existingProgress?.current_step || 0), stateStep, mpStep);
      const effectiveCorrect = Math.max(Number(p.correct_count || 0), Number(existingProgress?.correct_answers || 0), mpCorrect);

      const isMpActiveOrWaiting = Boolean(mpRoom && (mpRoom.status === 'waiting' || mpRoom.status === 'active'));
      const isCompleted = isMpActiveOrWaiting ? 0 : (currentStep >= effectiveTotalCount ? 1 : 0);

      let calcScore = effectiveCorrect;
      if (p.game_id === 'millionaire') {
        calcScore = effectiveCorrect > 0 ? (MILLIONAIRE_NOMINALS[Math.min(15, effectiveCorrect) - 1] || 0) : 0;
      } else if (p.game_id === '100to1' || p.game_id === 'jeopardy') {
        calcScore = Number(existingProgress?.score ?? (mpPart ? mpPart.score : 0) ?? 0);
      }

      if (!existingProgress && (currentStep > 0 || mpRoom)) {
        const progId = `gp_${p.pack_id}_${Date.now()}`;
        const initState = JSON.stringify({ currentIndex: currentStep, score: calcScore, topic: p.topic, difficulty: p.difficulty });
        await runSql(
          `INSERT INTO game_progress (id, user_id, pack_id, game_type, current_step, total_steps, score, correct_answers, is_completed, topic, difficulty, state, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$14::timestamptz)
           ON CONFLICT (user_id, pack_id, game_type) DO NOTHING`,
          [
            progId,
            p.user_id,
            p.pack_id,
            p.game_id,
            currentStep,
            effectiveTotalCount,
            calcScore,
            effectiveCorrect,
            isCompleted,
            p.topic,
            p.difficulty,
            initState,
            p.min_created || new Date().toISOString(),
            p.max_created || new Date().toISOString()
          ]
        );
      } else if (existingProgress) {
        const progTopicUpdate = p.game_id === 'jeopardy' ? undefined : p.topic;
        const targetScore =
          existingProgress.game_type === 'jeopardy'
            ? (existingProgress.score !== null && existingProgress.score !== undefined ? Number(existingProgress.score) : calcScore)
            : Math.max(Number(existingProgress.score || 0), calcScore);
        const targetCorrect = Math.max(Number(existingProgress.correct_answers || 0), effectiveCorrect);
        const targetTopic = progTopicUpdate || existingProgress.topic;
        const targetDiff = p.difficulty || existingProgress.difficulty;

        const needsUpdate =
          Number(existingProgress.current_step ?? -1) !== currentStep ||
          Number(existingProgress.total_steps ?? -1) !== effectiveTotalCount ||
          Number(existingProgress.score ?? 0) !== targetScore ||
          Number(existingProgress.correct_answers ?? 0) !== targetCorrect ||
          Number(existingProgress.is_completed ?? -1) !== isCompleted ||
          (progTopicUpdate && existingProgress.topic !== targetTopic) ||
          (p.difficulty && existingProgress.difficulty !== targetDiff);

        if (needsUpdate) {
          if (progTopicUpdate) {
            await runSql(
              `UPDATE game_progress
               SET current_step = $1, total_steps = $2,
                   score = CASE WHEN game_type = 'jeopardy' THEN COALESCE(score, $3) ELSE GREATEST(COALESCE(score, 0), $4) END,
                   correct_answers = GREATEST(COALESCE(correct_answers, 0), $5),
                   is_completed = $6, topic = COALESCE($7, topic), difficulty = COALESCE($8, difficulty)
               WHERE pack_id = $9`,
              [currentStep, effectiveTotalCount, calcScore, calcScore, effectiveCorrect, isCompleted, progTopicUpdate, p.difficulty, p.pack_id]
            );
          } else {
            await runSql(
              `UPDATE game_progress
               SET current_step = $1, total_steps = $2,
                   score = CASE WHEN game_type = 'jeopardy' THEN COALESCE(score, $3) ELSE GREATEST(COALESCE(score, 0), $4) END,
                   correct_answers = GREATEST(COALESCE(correct_answers, 0), $5),
                   is_completed = $6, difficulty = COALESCE($7, difficulty)
               WHERE pack_id = $8`,
              [currentStep, effectiveTotalCount, calcScore, calcScore, effectiveCorrect, isCompleted, p.difficulty, p.pack_id]
            );
          }
        }
      }
    }

    try {
      const jeopardyProgress = allProgress.filter(
        (pr) => pr.pack_id && (pr.game_type === 'jeopardy' || String(pr.pack_id).includes('jeopardy'))
      );

      if (jeopardyProgress.length > 0) {
        const jeopardyQTopics = await getAll<{ pack_id: string; topic: string }>(
          `SELECT DISTINCT pack_id, topic FROM generated_questions WHERE (game_id = 'jeopardy' OR pack_id LIKE '%jeopardy%') AND pack_id IS NOT NULL`
        );
        const qTopicsByPack = new Map<string, Set<string>>();
        for (const row of jeopardyQTopics) {
          const pid = String(row.pack_id || '');
          if (!pid) continue;
          if (!qTopicsByPack.has(pid)) qTopicsByPack.set(pid, new Set());
          qTopicsByPack.get(pid)!.add(String(row.topic || ''));
        }

        for (const jp of jeopardyProgress) {
          if (!jp.pack_id) continue;
          let stateTopic = null;
          try {
            const st = typeof jp.state === 'string' ? JSON.parse(jp.state) : jp.state;
            stateTopic = st?.gameTopic;
          } catch (_) {}
          const authoritativeTopic = stateTopic || (jp.topic && jp.topic !== 'Разные' && jp.topic !== 'Общие знания' ? jp.topic : null);
          if (!authoritativeTopic) continue;

          const curPack = packMap.get(String(jp.pack_id));
          if (curPack && (curPack.topic !== authoritativeTopic || curPack.game_title !== 'Своя Икра')) {
            await runSql(
              `UPDATE game_packs SET topic = $1, game_title = 'Своя Икра' WHERE id = $2 AND (topic != $1 OR game_title != 'Своя Икра')`,
              [authoritativeTopic, jp.pack_id]
            );
          }

          const qTopics = qTopicsByPack.get(String(jp.pack_id));
          if (qTopics && Array.from(qTopics).some((t) => t !== authoritativeTopic)) {
            await runSql(
              `UPDATE generated_questions SET topic = $1 WHERE pack_id = $2 AND topic != $1`,
              [authoritativeTopic, jp.pack_id]
            );
          }

          if (jp.topic !== authoritativeTopic) {
            await runSql(
              `UPDATE game_progress SET topic = $1 WHERE pack_id = $2 AND topic != $1`,
              [authoritativeTopic, jp.pack_id]
            );
          }
        }
      }
    } catch (jErr) {
      console.warn('[Reconciliation Engine] Jeopardy topic sync warning:', jErr);
    }

    console.log(`[Reconciliation Engine] Успешно синхронизированы ${distinctPacks.length} пакетов игр с PostgreSQL.`);
  } catch (err) {
    console.error('[Reconciliation Engine] Ошибка сверки данных:', err);
  }
}

// ============================================================================
// DYNAMIC GAME SCORING RULES
// ============================================================================

export interface GameScoringRule {
  id: string;
  game_id: string;
  game_title: string;
  difficulty_id: string;
  difficulty_name: string;
  multiplier: number;
  points_per_correct: number;
  points_per_incorrect: number;
  win_bonus: number;
  min_score: number;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export function normalizeGameId(gameId: string): string {
  const g = (gameId || '').toLowerCase().trim();
  if (g === 'blitz' || g === 'quiz' || g === 'квииз' || g === 'квиз') return 'blitz';
  if (g === 'whatwherewhen' || g === 'chgk' || g === 'чтогдекдвада' || g === 'чтогдекогда') return 'whatwherewhen';
  if (g === 'millionaire' || g === 'free_millionaire' || g === 'квиллионер' || g === 'миллионер') return 'millionaire';
  if (g === '100to1' || g === '100_to_1' || g === 'стоквадному' || g === 'стокодному') return '100to1';
  if (g === 'jeopardy' || g === 'svoikra' || g === 'свояикра' || g === 'свояигра') return 'jeopardy';
  return g;
}

export function normalizeDifficulty(difficulty?: string): string {
  const d = (difficulty || 'people').toLowerCase().trim();
  if (d === 'dummy' || d === 'икра' || d === 'иикра' || d === 'easy' || d === 'легкий' || d === 'простой' || d === '1' || d === '1/4') return 'dummy';
  if (d === 'people' || d === 'головастик' || d === 'normal' || d === 'medium' || d === 'средний' || d === '2' || d === '2/4') return 'people';
  if (d === 'genius' || d === 'квант' || d === 'hard' || d === 'сложный' || d === '3' || d === '3/4') return 'genius';
  if (d === 'god' || d === 'ляга' || d === 'expert' || d === 'эксперт' || d === '4' || d === '4/4') return 'god';
  return d;
}

export async function getGameScoringRules(gameId?: string): Promise<GameScoringRule[]> {
  if (gameId) {
    const norm = normalizeGameId(gameId);
    return getAll<GameScoringRule>(
      `SELECT * FROM game_scoring_rules WHERE game_id = $1
       ORDER BY CASE difficulty_id WHEN 'dummy' THEN 1 WHEN 'people' THEN 2 WHEN 'genius' THEN 3 WHEN 'god' THEN 4 ELSE 5 END, id ASC`,
      [norm]
    );
  }
  return getAll<GameScoringRule>(
    `SELECT * FROM game_scoring_rules
     ORDER BY game_id ASC, CASE difficulty_id WHEN 'dummy' THEN 1 WHEN 'people' THEN 2 WHEN 'genius' THEN 3 WHEN 'god' THEN 4 ELSE 5 END, id ASC`
  );
}

export async function syncScoringFromSettingsToRules(gameIdOrId: string): Promise<void> {
  const norm = normalizeGameId(gameIdOrId);
  const setting = await getOne<any>(
    'SELECT * FROM game_scoring_settings WHERE id = $1 OR game_id = $1',
    [norm]
  );
  if (!setting) return;

  const ptsCorrect = Number(setting.points_per_correct) || 0;
  const ptsIncorrect = Number(setting.points_per_incorrect) || 0;
  const winBonus = Number(setting.win_bonus) || 0;
  const scoreMult = Number(setting.score_multiplier) || 1.0;
  const hasDiff = setting.has_difficulty !== 0 && !['millionaire', '100to1', 'jeopardy'].includes(norm);

  if (!hasDiff) {
    const ruleId = `${norm}_standard`;
    const diffName = norm === 'millionaire' ? 'Лестница вопросов' : norm === '100to1' ? 'Все раунды' : 'Номиналы тем';
    const existingRule = await getOne<any>('SELECT id FROM game_scoring_rules WHERE game_id = $1', [norm]);

    if (existingRule) {
      await runSql(
        `UPDATE game_scoring_rules
         SET multiplier = $1, points_per_correct = $2, points_per_incorrect = $3, win_bonus = $4, updated_at = NOW()
         WHERE id = $5`,
        [scoreMult, ptsCorrect, ptsIncorrect, winBonus, existingRule.id]
      );
    } else {
      await runSql(
        `INSERT INTO game_scoring_rules (
          id, game_id, game_title, difficulty_id, difficulty_name, multiplier, points_per_correct, points_per_incorrect, win_bonus, min_score, description
        ) VALUES ($1, $2, $3, 'standard', $4, $5, $6, $7, $8, 0, $9)
        ON CONFLICT (id) DO NOTHING`,
        [ruleId, norm, setting.game_title || norm, diffName, scoreMult, ptsCorrect, ptsIncorrect, winBonus, setting.description || '']
      );
    }

    await runSql(
      `DELETE FROM game_scoring_rules WHERE game_id = $1 AND difficulty_id IN ('dummy', 'genius', 'god')`,
      [norm]
    );
    return;
  }

  const diffMap: Record<string, number> = {
    dummy: Number(setting.multiplier_ikra) || 1.0,
    people: Number(setting.multiplier_golovastik) || 10.0,
    genius: Number(setting.multiplier_kvant) || 100.0,
    god: Number(setting.multiplier_lyaga) || 1000.0
  };

  for (const [diffId, multVal] of Object.entries(diffMap)) {
    const existingRule = await getOne<any>(
      'SELECT id FROM game_scoring_rules WHERE game_id = $1 AND difficulty_id = $2',
      [norm, diffId]
    );
    if (existingRule) {
      await runSql(
        `UPDATE game_scoring_rules
         SET multiplier = $1, points_per_correct = $2, points_per_incorrect = $3, win_bonus = $4, updated_at = NOW()
         WHERE id = $5`,
        [multVal, ptsCorrect, ptsIncorrect, winBonus, existingRule.id]
      );
    } else {
      const ruleId = `${norm}_${diffId}`;
      const diffName = diffId === 'dummy' ? 'Икра' : diffId === 'people' ? 'Головастик' : diffId === 'genius' ? 'Квант' : 'Ляга';
      await runSql(
        `INSERT INTO game_scoring_rules (
          id, game_id, game_title, difficulty_id, difficulty_name, multiplier, points_per_correct, points_per_incorrect, win_bonus, min_score, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10)
        ON CONFLICT (id) DO NOTHING`,
        [ruleId, norm, setting.game_title || norm, diffId, diffName, multVal, ptsCorrect, ptsIncorrect, winBonus, setting.description || '']
      );
    }
  }
}

export async function syncScoringFromRulesToSettings(ruleIdOrGameId: string): Promise<void> {
  const rule = await getOne<any>('SELECT * FROM game_scoring_rules WHERE id = $1', [ruleIdOrGameId]);
  if (!rule) return;

  const gameId = normalizeGameId(rule.game_id);
  const diffId = normalizeDifficulty(rule.difficulty_id);
  const isNoDiffGame = ['millionaire', '100to1', 'jeopardy'].includes(gameId);

  const setting = await getOne<any>(
    'SELECT * FROM game_scoring_settings WHERE id = $1 OR game_id = $1',
    [gameId]
  );

  if (setting) {
    if (isNoDiffGame || rule.difficulty_id === 'standard') {
      await runSql(
        `UPDATE game_scoring_settings
         SET score_multiplier = $1, points_per_correct = $2, points_per_incorrect = $3, win_bonus = $4, updated_at = NOW()
         WHERE id = $5 OR game_id = $5`,
        [Number(rule.multiplier) || 1.0, Number(rule.points_per_correct) || 0, Number(rule.points_per_incorrect) || 0, Number(rule.win_bonus) || 0, setting.id]
      );
      return;
    }

    let colName: string | null = null;
    if (diffId === 'dummy') colName = 'multiplier_ikra';
    else if (diffId === 'people') colName = 'multiplier_golovastik';
    else if (diffId === 'genius') colName = 'multiplier_kvant';
    else if (diffId === 'god') colName = 'multiplier_lyaga';

    if (colName) {
      await runSql(
        `UPDATE game_scoring_settings
         SET ${colName} = $1, points_per_correct = $2, points_per_incorrect = $3, win_bonus = $4, updated_at = NOW()
         WHERE id = $5 OR game_id = $5`,
        [Number(rule.multiplier) || 1.0, Number(rule.points_per_correct) || 0, Number(rule.points_per_incorrect) || 0, Number(rule.win_bonus) || 0, setting.id]
      );
    }
  }
}

export async function getGameScoringRule(gameId: string, difficulty?: string): Promise<GameScoringRule | null> {
  const normGame = normalizeGameId(gameId);
  const isNoDiffGame = ['millionaire', '100to1', 'jeopardy'].includes(normGame);

  if (isNoDiffGame) {
    const singleRule = await getOne<GameScoringRule>(
      'SELECT * FROM game_scoring_rules WHERE game_id = $1 LIMIT 1',
      [normGame]
    );
    if (singleRule) return singleRule;
  }

  const normDiff = normalizeDifficulty(difficulty);
  const rule = await getOne<GameScoringRule>(
    'SELECT * FROM game_scoring_rules WHERE game_id = $1 AND difficulty_id = $2',
    [normGame, normDiff]
  );
  if (rule) return rule;

  const fallback = await getOne<GameScoringRule>(
    `SELECT * FROM game_scoring_rules WHERE game_id = $1 ORDER BY CASE WHEN difficulty_id = 'people' THEN 0 ELSE 1 END LIMIT 1`,
    [normGame]
  );
  return fallback || null;
}

export async function updateGameScoringRule(id: string, updates: Partial<GameScoringRule>): Promise<GameScoringRule | null> {
  const allowedFields = [
    'multiplier', 'points_per_correct', 'points_per_incorrect',
    'win_bonus', 'min_score', 'description', 'game_title', 'difficulty_name'
  ];

  const setClauses: string[] = [];
  const params: any[] = [];
  let pIdx = 1;

  for (const field of allowedFields) {
    if ((updates as any)[field] !== undefined) {
      setClauses.push(`"${field}" = $${pIdx++}`);
      params.push((updates as any)[field]);
    }
  }

  if (setClauses.length > 0) {
    setClauses.push(`updated_at = NOW()`);
    params.push(id);
    await runSql(`UPDATE game_scoring_rules SET ${setClauses.join(', ')} WHERE id = $${pIdx}`, params);
    await syncScoringFromRulesToSettings(id);
  }

  return getOne<GameScoringRule>('SELECT * FROM game_scoring_rules WHERE id = $1', [id]);
}

export interface ScoreBreakdownItem {
  label: string;
  value: string;
  sublabel?: string;
  highlight?: boolean;
  isPositive?: boolean;
  isNegative?: boolean;
}

export interface ScoreCalculationResult {
  authoritativeScore: number;
  gameId: string;
  gameTitle: string;
  difficultyId: string;
  difficultyName: string;
  hasDifficulty: boolean;
  scoreMultiplier: number;
  multiplier: number;
  pointsPerCorrect: number;
  pointsPerIncorrect: number;
  winBonus: number;
  minScore: number;
  correctAnswers: number;
  totalQuestions: number;
  rawScore?: number;
  isWin: boolean;
  formula: string;
  breakdown: ScoreBreakdownItem[];
}

export async function calculateAuthoritativeScoreWithBreakdown({
  gameId,
  difficulty,
  score,
  correctAnswers,
  totalQuestions,
  isWin,
  rawScore,
  mode
}: {
  gameId: string;
  difficulty?: string;
  score?: number;
  correctAnswers?: number;
  totalQuestions?: number;
  isWin?: boolean;
  rawScore?: number;
  mode?: string;
}): Promise<ScoreCalculationResult> {
  const normGame = normalizeGameId(gameId);
  const normDiff = normalizeDifficulty(difficulty);

  const diffNames: Record<string, string> = {
    dummy: 'Икра',
    people: 'Головастик',
    genius: 'Квант',
    god: 'Ляга'
  };
  const diffName = diffNames[normDiff] || 'Головастик';

  const rule = await getGameScoringRule(normGame, normDiff);
  const setting = await getOne<any>(
    'SELECT * FROM game_scoring_settings WHERE id = $1 OR game_id = $1',
    [normGame]
  );

  const isNoDiffGame = ['millionaire', '100to1', 'jeopardy'].includes(normGame) || setting?.has_difficulty === 0;
  const gameTitle = setting?.game_title || (
    normGame === 'blitz' ? 'КвИИз' :
    normGame === 'millionaire' ? 'Квиллионер' :
    normGame === '100to1' ? 'Сто Квадному' :
    normGame === 'whatwherewhen' ? 'ЧтоГдеКвада' :
    normGame === 'jeopardy' ? 'Своя Икра' :
    normGame === 'melody' ? 'Уквакай мелодию' : normGame
  );

  const scoreMultiplier = Number(setting?.score_multiplier ?? 1.0);
  const ptsCorrect = Number(rule?.points_per_correct ?? setting?.points_per_correct ?? 0.0);
  const ptsIncorrect = Number(rule?.points_per_incorrect ?? setting?.points_per_incorrect ?? 0.0);
  const winBonus = isWin ? Number(rule?.win_bonus ?? setting?.win_bonus ?? 0.0) : 0.0;
  const minScore = Number(rule?.min_score ?? 0.0);

  const correct = Number(correctAnswers || 0);
  const total = Number(totalQuestions || 0);
  const incomingScore = Number(score || 0);

  let mult = rule?.multiplier;
  if (mult === undefined || mult === null || isNaN(mult)) {
    if (normDiff === 'dummy') mult = setting?.multiplier_ikra ?? 1.0;
    else if (normDiff === 'people') mult = setting?.multiplier_golovastik ?? 3.0;
    else if (normDiff === 'genius') mult = setting?.multiplier_kvant ?? 9.0;
    else if (normDiff === 'god') mult = setting?.multiplier_lyaga ?? 27.0;
    else mult = 1.0;
  }
  mult = Number(mult);

  if (normGame === 'millionaire') {
    if (mode === 'free' || gameId === 'free_millionaire') {
      return {
        authoritativeScore: 0,
        gameId: normGame,
        gameTitle,
        difficultyId: 'standard',
        difficultyName: 'Бесплатный режим',
        hasDifficulty: false,
        scoreMultiplier,
        multiplier: 1,
        pointsPerCorrect: 0,
        pointsPerIncorrect: 0,
        winBonus: 0,
        minScore: 0,
        correctAnswers: correct,
        totalQuestions: 15,
        rawScore: 0,
        isWin: Boolean(isWin),
        formula: 'Бесплатный тренировочный режим — очки в рейтинг не начисляются',
        breakdown: [
          { label: 'Режим', value: 'Freeлионер (тренировка)' },
          { label: 'Итого начислено', value: '0 очков', highlight: true }
        ]
      };
    }

    let ladderPrize = typeof rawScore === 'number' ? rawScore : incomingScore;
    if (ladderPrize < 100 && correct >= 1) {
      const ladder = [0, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
      const idx = Math.min(15, Math.max(0, correct));
      if (isWin || idx >= 15) ladderPrize = 1000000;
      else if (idx >= 10) ladderPrize = 32000;
      else if (idx >= 5) ladderPrize = 1000;
      else ladderPrize = ladder[idx] || 0;
    }

    const computed = Math.max(minScore, Math.round(ladderPrize * scoreMultiplier) + (correct * ptsCorrect) + winBonus);
    const formula = `${ladderPrize.toLocaleString('ru-RU')} выигрыш × ${scoreMultiplier} коэфф.${winBonus > 0 ? ` + ${winBonus} бонус` : ''} = ${computed.toLocaleString('ru-RU')} очков`;

    const breakdown: ScoreBreakdownItem[] = [
      { label: 'Выигрыш в викторине', value: `${ladderPrize.toLocaleString('ru-RU')} очков` },
      { label: 'Коэффициент начисления', value: `×${scoreMultiplier}`, highlight: true },
      { label: 'Пройдено вопросов', value: `${correct} из 15` }
    ];
    if (ptsCorrect > 0) {
      breakdown.push({ label: 'Бонус за верные ответы', value: `+${correct * ptsCorrect} очков` });
    }
    if (winBonus > 0) {
      breakdown.push({ label: 'Бонус за суперприз', value: `+${winBonus} очков` });
    }
    breakdown.push({ label: 'Итого начислено в баланс', value: `+${computed.toLocaleString('ru-RU')} очков`, highlight: true });

    return {
      authoritativeScore: computed,
      gameId: normGame,
      gameTitle,
      difficultyId: 'standard',
      difficultyName: 'Лестница вопросов',
      hasDifficulty: false,
      scoreMultiplier,
      multiplier: scoreMultiplier,
      pointsPerCorrect: ptsCorrect,
      pointsPerIncorrect: ptsIncorrect,
      winBonus,
      minScore,
      correctAnswers: correct,
      totalQuestions: 15,
      rawScore: ladderPrize,
      isWin: Boolean(isWin),
      formula,
      breakdown
    };
  }

  if (normGame === '100to1') {
    const baseScore = typeof rawScore === 'number' ? rawScore : incomingScore;
    const computed = Math.max(minScore, Math.round(baseScore * scoreMultiplier) + (correct * ptsCorrect) + winBonus);
    const formula = `${baseScore} баллов опросов × ${scoreMultiplier} коэфф.${winBonus > 0 ? ` + ${winBonus} бонус` : ''} = ${computed.toLocaleString('ru-RU')} очков`;

    const breakdown: ScoreBreakdownItem[] = [
      { label: 'Баллы популярных ответов', value: `${baseScore} баллов` },
      { label: 'Множитель игры', value: `×${scoreMultiplier}`, highlight: true },
      { label: 'Выиграно раундов', value: `${correct} из 4` }
    ];
    if (ptsCorrect > 0) {
      breakdown.push({ label: 'Бонус за раунды', value: `+${correct * ptsCorrect} очков` });
    }
    if (winBonus > 0) {
      breakdown.push({ label: 'Бонус за победу команды', value: `+${winBonus} очков` });
    }
    breakdown.push({ label: 'Итого начислено в баланс', value: `+${computed.toLocaleString('ru-RU')} очков`, highlight: true });

    return {
      authoritativeScore: computed,
      gameId: normGame,
      gameTitle,
      difficultyId: 'standard',
      difficultyName: 'Все раунды',
      hasDifficulty: false,
      scoreMultiplier,
      multiplier: scoreMultiplier,
      pointsPerCorrect: ptsCorrect,
      pointsPerIncorrect: ptsIncorrect,
      winBonus,
      minScore,
      correctAnswers: correct,
      totalQuestions: 4,
      rawScore: baseScore,
      isWin: Boolean(isWin),
      formula,
      breakdown
    };
  }

  if (normGame === 'jeopardy') {
    const baseScore = typeof rawScore === 'number' ? rawScore : incomingScore;
    const effectiveBase = Math.max(0, baseScore);
    const computed = Math.max(minScore, Math.round(effectiveBase * scoreMultiplier) + (correct * ptsCorrect) + winBonus);
    const formula = `${effectiveBase} очков раундов × ${scoreMultiplier} коэфф.${winBonus > 0 ? ` + ${winBonus} бонус` : ''} = ${computed.toLocaleString('ru-RU')} очков`;

    const breakdown: ScoreBreakdownItem[] = [
      { label: 'Счет в раундах', value: `${effectiveBase} очков` },
      { label: 'Коэффициент начисления', value: `×${scoreMultiplier}`, highlight: true },
      { label: 'Исход матча', value: isWin ? '1 место (Победа)' : 'Участие в игре' }
    ];
    if (winBonus > 0 && isWin) {
      breakdown.push({ label: 'Бонус за 1 место', value: `+${winBonus} очков` });
    }
    breakdown.push({ label: 'Итого начислено в баланс', value: `+${computed.toLocaleString('ru-RU')} очков`, highlight: true });

    return {
      authoritativeScore: computed,
      gameId: normGame,
      gameTitle,
      difficultyId: 'standard',
      difficultyName: 'Номиналы тем',
      hasDifficulty: false,
      scoreMultiplier,
      multiplier: scoreMultiplier,
      pointsPerCorrect: ptsCorrect,
      pointsPerIncorrect: ptsIncorrect,
      winBonus,
      minScore,
      correctAnswers: correct,
      totalQuestions: total || 75,
      rawScore: effectiveBase,
      isWin: Boolean(isWin),
      formula,
      breakdown
    };
  }

  if (normGame === 'blitz') {
    const pointsPerAnswer = Math.round(ptsCorrect * mult * scoreMultiplier);
    const computed = Math.max(minScore, Math.round(correct * ptsCorrect * mult * scoreMultiplier) + winBonus);
    const formula = `${correct} ответов × ${ptsCorrect} базовых × коэфф. ${mult} (${diffName})${winBonus > 0 ? ` + ${winBonus} бонус` : ''} = ${computed.toLocaleString('ru-RU')} очков`;

    const breakdown: ScoreBreakdownItem[] = [
      { label: 'Правильных ответов', value: `${correct} из ${total || 10}` },
      { label: 'Базовые очки за вопрос', value: `${ptsCorrect} очков` },
      { label: `Множитель сложности (${diffName})`, value: `×${mult}`, highlight: true },
      { label: 'Очков за каждый правильный ответ', value: `${pointsPerAnswer} очков` }
    ];
    if (winBonus > 0) {
      breakdown.push({ label: 'Бонус за победу', value: `+${winBonus} очков` });
    }
    breakdown.push({ label: 'Итого начислено', value: `+${computed.toLocaleString('ru-RU')} очков`, highlight: true });

    return {
      authoritativeScore: computed,
      gameId: normGame,
      gameTitle,
      difficultyId: normDiff,
      difficultyName: diffName,
      hasDifficulty: true,
      scoreMultiplier,
      multiplier: mult,
      pointsPerCorrect: ptsCorrect,
      pointsPerIncorrect: ptsIncorrect,
      winBonus,
      minScore,
      correctAnswers: correct,
      totalQuestions: total || 10,
      rawScore: correct,
      isWin: Boolean(isWin),
      formula,
      breakdown
    };
  }

  if (normGame === 'whatwherewhen') {
    const expertScore = correct;
    const viewerScore = Math.max(0, total - expertScore);
    const won = Boolean(isWin || expertScore >= 6);
    const basePoints = Math.max(0, (expertScore * ptsCorrect) - (viewerScore * ptsIncorrect));
    const computed = won ? Math.max(minScore, Math.round(basePoints * mult * scoreMultiplier) + winBonus) : minScore;

    const formula = won
      ? `(${expertScore} × ${ptsCorrect} − ${viewerScore} × ${ptsIncorrect}) × коэфф. ${mult} (${diffName})${winBonus > 0 ? ` + ${winBonus}` : ''} = ${computed.toLocaleString('ru-RU')} очков`
      : 'Поражение знатоков (счет меньше 6) — начислено 0 очков';

    const breakdown: ScoreBreakdownItem[] = [
      { label: 'Итоговый счет', value: `Знатоки ${expertScore} : ${viewerScore} Зрители` },
      { label: 'Очки за ответы знатоков', value: `+${expertScore * ptsCorrect} (${expertScore} × ${ptsCorrect})` },
      { label: 'Штраф за зрителей', value: `-${viewerScore * ptsIncorrect} (${viewerScore} × ${ptsIncorrect})` },
      { label: `Множитель сложности (${diffName})`, value: `×${mult}`, highlight: true },
      { label: 'Статус раунда', value: won ? 'Победа знатоков' : 'Поражение (сброс на 0)' }
    ];
    if (winBonus > 0 && won) {
      breakdown.push({ label: 'Бонус за победу', value: `+${winBonus} очков` });
    }
    breakdown.push({ label: 'Итого начислено', value: `+${computed.toLocaleString('ru-RU')} очков`, highlight: true });

    return {
      authoritativeScore: computed,
      gameId: normGame,
      gameTitle,
      difficultyId: normDiff,
      difficultyName: diffName,
      hasDifficulty: true,
      scoreMultiplier,
      multiplier: mult,
      pointsPerCorrect: ptsCorrect,
      pointsPerIncorrect: ptsIncorrect,
      winBonus,
      minScore,
      correctAnswers: correct,
      totalQuestions: total || 9,
      rawScore: basePoints,
      isWin: won,
      formula,
      breakdown
    };
  }

  if (normGame === 'melody') {
    const pointsPerTrack = Math.round(ptsCorrect * mult * scoreMultiplier);
    const computed = Math.max(minScore, Math.round(correct * ptsCorrect * mult * scoreMultiplier) + winBonus);
    const formula = `${correct} угадано × ${ptsCorrect} базовых × коэфф. ${mult} (${diffName})${winBonus > 0 ? ` + ${winBonus}` : ''} = ${computed.toLocaleString('ru-RU')} очков`;

    const breakdown: ScoreBreakdownItem[] = [
      { label: 'Угадано мелодий', value: `${correct} из ${total || 25}` },
      { label: 'Базовые очки за трек', value: `${ptsCorrect} очков` },
      { label: `Множитель сложности (${diffName})`, value: `×${mult}`, highlight: true },
      { label: 'Очков за угаданный трек', value: `${pointsPerTrack} очков` }
    ];
    if (winBonus > 0) {
      breakdown.push({ label: 'Бонус за победу', value: `+${winBonus} очков` });
    }
    breakdown.push({ label: 'Итого начислено', value: `+${computed.toLocaleString('ru-RU')} очков`, highlight: true });

    return {
      authoritativeScore: computed,
      gameId: normGame,
      gameTitle,
      difficultyId: normDiff,
      difficultyName: diffName,
      hasDifficulty: true,
      scoreMultiplier,
      multiplier: mult,
      pointsPerCorrect: ptsCorrect,
      pointsPerIncorrect: ptsIncorrect,
      winBonus,
      minScore,
      correctAnswers: correct,
      totalQuestions: total || 25,
      rawScore: correct,
      isWin: Boolean(isWin),
      formula,
      breakdown
    };
  }

  return {
    authoritativeScore: incomingScore,
    gameId: normGame,
    gameTitle,
    difficultyId: normDiff,
    difficultyName: diffName,
    hasDifficulty: !isNoDiffGame,
    scoreMultiplier,
    multiplier: mult,
    pointsPerCorrect: ptsCorrect,
    pointsPerIncorrect: ptsIncorrect,
    winBonus,
    minScore,
    correctAnswers: correct,
    totalQuestions: total,
    rawScore,
    isWin: Boolean(isWin),
    formula: `Начислено: ${incomingScore.toLocaleString('ru-RU')} очков`,
    breakdown: [
      { label: 'Итого начислено', value: `${incomingScore.toLocaleString('ru-RU')} очков`, highlight: true }
    ]
  };
}

export async function calculateAuthoritativeScore(params: {
  gameId: string;
  difficulty?: string;
  score?: number;
  correctAnswers?: number;
  totalQuestions?: number;
  isWin?: boolean;
  rawScore?: number;
  mode?: string;
}): Promise<number> {
  const res = await calculateAuthoritativeScoreWithBreakdown(params);
  return res.authoritativeScore;
}
