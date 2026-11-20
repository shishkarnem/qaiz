import { getOne, runSql, decryptSecret } from './db';
import { sendTelegramMessage } from './telegram';
import { sendWebPushToUser } from './push';

export const ADMIN_TELEGRAM_ID = '169262990';

/**
 * Resolves the exact domain (origin) from an Express request or explicit domain string,
 * ignoring external payment gateway domains (such as robokassa.ru).
 */
export function resolveRequestDomain(req?: any, explicitDomain?: string | null): string {
  const cleanCandidate = (raw?: string | null): string | null => {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const withProto = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `${trimmed.includes('localhost') || trimmed.startsWith('127.') ? 'http' : 'https'}://${trimmed}`;
      const parsed = new URL(withProto);
      const hostLower = parsed.hostname.toLowerCase();
      if (hostLower.includes('robokassa.') || hostLower.includes('telegram.org')) {
        return null;
      }
      return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
    } catch {
      return null;
    }
  };

  if (explicitDomain) {
    const c = cleanCandidate(explicitDomain);
    if (c) return c;
  }

  if (req && typeof req === 'object') {
    const bodyDomain =
      req.body?.domain ||
      req.body?.siteDomain ||
      req.body?.originDomain ||
      req.body?.site_domain ||
      req.query?.domain ||
      req.query?.siteDomain;
    const fromBody = cleanCandidate(bodyDomain);
    if (fromBody) return fromBody;

    const fromOrigin = cleanCandidate(req.headers?.origin);
    if (fromOrigin) return fromOrigin;

    const fromReferer = cleanCandidate(req.headers?.referer || req.headers?.referrer);
    if (fromReferer) return fromReferer;

    const rawHost = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '')
      .split(',')[0]
      .trim();
    if (rawHost) {
      const rawProto = String(req.headers?.['x-forwarded-proto'] || req.protocol || '')
        .split(',')[0]
        .trim();
      const proto =
        rawProto ||
        (rawHost.includes('localhost') || rawHost.startsWith('127.') ? 'http' : 'https');
      const fromHost = cleanCandidate(`${proto}://${rawHost}`);
      if (fromHost) return fromHost;
    }
  }

  return 'https://qaiz.ru';
}

/**
 * Sends a Telegram notification to the Super Admin (TG ID: 169262990)
 * when a new user registers for the first time via Telegram or Email.
 */
export async function sendAdminNewRegistrationNotification(
  userOrUid: any,
  method: 'telegram' | 'email',
  reqOrDomain?: any
): Promise<boolean> {
  try {
    const uid = typeof userOrUid === 'string' ? userOrUid : userOrUid?.uid || userOrUid?.id;
    if (!uid) return false;

    const user =
      typeof userOrUid === 'object' && userOrUid?.uid
        ? userOrUid
        : await getOne<any>('SELECT * FROM users WHERE uid = $1 OR id = $2', [uid, uid]);

    if (!user) return false;

    const domain =
      typeof reqOrDomain === 'string'
        ? resolveRequestDomain(undefined, reqOrDomain)
        : resolveRequestDomain(reqOrDomain);

    const profileUrl = `${domain}/profile/${user.uid}`;
    const displayName =
      user.display_name ||
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      user.username ||
      (user.email ? String(user.email).split('@')[0] : 'Игрок');

    const cleanUsername = user.username ? String(user.username).replace(/^@/, '') : '';
    const tgHtml = cleanUsername
      ? `<a href="https://t.me/${escapeHtml(cleanUsername)}">@${escapeHtml(cleanUsername)}</a>${
          user.telegram_id ? ` (ID: <code>${escapeHtml(String(user.telegram_id))}</code>)` : ''
        }`
      : user.telegram_id
      ? `<a href="tg://user?id=${escapeHtml(String(user.telegram_id))}">Открыть диалог</a> (ID: <code>${escapeHtml(
          String(user.telegram_id)
        )}</code>)`
      : 'Не привязан';

    const dateStr = new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const methodLabel =
      method === 'telegram' ? 'Telegram Mini App / Telegram' : 'Электронная почта (Email)';

    const lines = [
      `🆕 <b>Новая регистрация в Квайз!</b>`,
      ``,
      `👤 <b>Игрок:</b> ${escapeHtml(displayName)}`,
      `🆔 <b>UID:</b> <code>${escapeHtml(String(user.uid))}</code>`,
      `🔑 <b>Способ:</b> ${methodLabel}`,
      `📧 <b>Почта:</b> ${user.email ? escapeHtml(String(user.email)) : 'Не указана'}`,
      `📱 <b>Telegram:</b> ${tgHtml}`,
    ];

    if (user.referred_by) {
      lines.push(`🤝 <b>Пригласил (UID):</b> <code>${escapeHtml(String(user.referred_by))}</code>`);
    }

    lines.push(
      `💳 <b>Стартовый баланс:</b> <b>${user.balance ?? 300} ИИкр</b>`,
      `🌐 <b>Домен:</b> <a href="${domain}">${escapeHtml(domain)}</a>`,
      `🔗 <b>Профиль:</b> <a href="${profileUrl}">${escapeHtml(profileUrl)}</a>`,
      `⏰ <b>Время (МСК):</b> ${dateStr}`
    );

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: `👤 Профиль: ${displayName}`,
            url: profileUrl,
            style: 'success',
          },
        ],
      ],
    };

    const sendRes = await sendTelegramMessage({
      chatId: ADMIN_TELEGRAM_ID,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup,
    });

    return sendRes.ok;
  } catch (err) {
    console.error('[TelegramNotifier] Error sending admin registration notification:', err);
    return false;
  }
}

/**
 * Sends a Telegram notification to the Super Admin (TG ID: 169262990)
 * when a user completes a payment or has a failed payment attempt.
 */
export async function sendAdminPaymentNotification(params: {
  userId: string;
  txId: string;
  isFailed?: boolean;
  iikrAmount: number;
  currency?: string;
  outSumRub?: number;
  invId?: number | string;
  description?: string | null;
  domain?: string | null;
  req?: any;
  timestamp?: number;
}): Promise<boolean> {
  try {
    const user = await getOne<any>(
      'SELECT * FROM users WHERE uid = $1 OR id = $2',
      [params.userId, params.userId]
    );

    const resolvedUid = user?.uid || params.userId;
    const domain = resolveRequestDomain(params.req, params.domain);
    const profileUrl = `${domain}/profile/${resolvedUid}`;

    const displayName =
      user?.display_name ||
      [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
      user?.username ||
      (user?.email ? String(user.email).split('@')[0] : `Игрок ${resolvedUid}`);

    const cleanUsername = user?.username ? String(user.username).replace(/^@/, '') : '';
    const tgHtml = cleanUsername
      ? `<a href="https://t.me/${escapeHtml(cleanUsername)}">@${escapeHtml(cleanUsername)}</a>${
          user?.telegram_id ? ` (ID: <code>${escapeHtml(String(user.telegram_id))}</code>)` : ''
        }`
      : user?.telegram_id
      ? `<a href="tg://user?id=${escapeHtml(String(user.telegram_id))}">Открыть диалог</a> (ID: <code>${escapeHtml(
          String(user.telegram_id)
        )}</code>)`
      : 'Не привязан';

    const dateStr = new Date(params.timestamp || Date.now()).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const currencyLabel = params.currency || 'ИИкр';
    const currentBalance = user?.balance !== undefined ? user.balance : 0;

    let lines: string[] = [];
    if (params.isFailed) {
      lines = [
        `🔴 <b>Неудачная попытка оплаты в Квайз</b>`,
        ``,
        `👤 <b>Игрок:</b> ${escapeHtml(displayName)}`,
        `🆔 <b>UID:</b> <code>${escapeHtml(String(resolvedUid))}</code>`,
        `📧 <b>Почта:</b> ${user?.email ? escapeHtml(String(user.email)) : 'Не указана'}`,
        `📱 <b>Telegram:</b> ${tgHtml}`,
        ``,
        `⚠️ <b>Статус:</b> Оплата отменена или отклонена`,
        ...(params.iikrAmount > 0
          ? [`📦 <b>Пакет:</b> <code>${params.iikrAmount} ${currencyLabel}</code>`]
          : []),
        ...(params.outSumRub && params.outSumRub > 0
          ? [`💵 <b>Сумма заказа:</b> <b>${Number(params.outSumRub).toFixed(2)} ₽</b>`]
          : []),
        ...(params.invId ? [`🧾 <b>Заказ (InvId):</b> <code>#${params.invId}</code>`] : []),
        ...(params.description ? [`📝 <b>Детали:</b> ${escapeHtml(params.description)}`] : []),
        `💳 <b>Текущий баланс:</b> <b>${currentBalance} ИИкр</b>`,
        `🆔 <b>ID транзакции:</b> <code>#${escapeHtml(String(params.txId))}</code>`,
        `🌐 <b>Домен:</b> <a href="${domain}">${escapeHtml(domain)}</a>`,
        `🔗 <b>Профиль:</b> <a href="${profileUrl}">${escapeHtml(profileUrl)}</a>`,
        `⏰ <b>Время (МСК):</b> ${dateStr}`,
      ];
    } else {
      lines = [
        `💰 <b>Новая успешная оплата в Квайз!</b>`,
        ``,
        `👤 <b>Игрок:</b> ${escapeHtml(displayName)}`,
        `🆔 <b>UID:</b> <code>${escapeHtml(String(resolvedUid))}</code>`,
        `📧 <b>Почта:</b> ${user?.email ? escapeHtml(String(user.email)) : 'Не указана'}`,
        `📱 <b>Telegram:</b> ${tgHtml}`,
        ``,
        `⚡️ <b>Начислено:</b> <code>+${params.iikrAmount} ${currencyLabel}</code>`,
        ...(params.outSumRub && params.outSumRub > 0
          ? [`💵 <b>Сумма оплаты:</b> <b>${Number(params.outSumRub).toFixed(2)} ₽</b>`]
          : []),
        ...(params.invId ? [`🧾 <b>Заказ (InvId):</b> <code>#${params.invId}</code>`] : []),
        ...(params.description ? [`📝 <b>Назначение:</b> ${escapeHtml(params.description)}`] : []),
        `💳 <b>Новый баланс игрока:</b> <b>${currentBalance} ИИкр</b>`,
        `🆔 <b>ID транзакции:</b> <code>#${escapeHtml(String(params.txId))}</code>`,
        `🌐 <b>Домен оплаты:</b> <a href="${domain}">${escapeHtml(domain)}</a>`,
        `🔗 <b>Профиль:</b> <a href="${profileUrl}">${escapeHtml(profileUrl)}</a>`,
        `⏰ <b>Время (МСК):</b> ${dateStr}`,
      ];
    }

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: `👤 Профиль: ${displayName}`,
            url: profileUrl,
            style: 'success',
          },
        ],
      ],
    };

    const sendRes = await sendTelegramMessage({
      chatId: ADMIN_TELEGRAM_ID,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup,
    });

    return sendRes.ok;
  } catch (err) {
    console.error('[TelegramNotifier] Error sending admin payment notification:', err);
    return false;
  }
}

/**
 * Checks if a transaction is important enough to send a personal Telegram notification.
 * - Allowed:
 *    1. Balance purchases / top-ups (пополнение баланса, покупка ИИкр)
 *    2. Failed payment attempts (неудачные попытки оплаты)
 *    3. Referral bonuses (реферальные начисления, партнерская программа)
 *    4. Admin balance adjustments and crediting (корректировка и начисление баланса администратором)
 *    5. Payouts and author rewards (выплаты, авторские вознаграждения)
 * - Prohibited / Skipped:
 *    - In-game spending (списания за вопросы, подсказки, право на ошибку, переходы)
 *    - Starting / welcome bonus (стартовый приветственный бонус при регистрации)
 */
export function isImportantTransaction(tx: {
  amount: number;
  type?: string | null;
  description?: string | null;
  reference_id?: string | null;
}): boolean {
  const typeStr = (tx.type || '').toLowerCase();
  const descStr = (tx.description || '').toLowerCase();
  const refStr = (tx.reference_id || '').toLowerCase();

  // 1. Filter out starting/welcome bonus
  if (
    typeStr.includes('start') ||
    typeStr.includes('welcome') ||
    refStr.includes('welcome') ||
    refStr.includes('start') ||
    descStr.includes('стартов') ||
    descStr.includes('приветственн') ||
    descStr.includes('бонус за регистрацию')
  ) {
    return false;
  }

  // 2. Filter out in-game micro-spending & hints
  if (
    typeStr.includes('attempt') ||
    typeStr.includes('question') ||
    typeStr.includes('hint') ||
    typeStr.includes('fifty') ||
    typeStr.includes('skip') ||
    typeStr.includes('game_spend') ||
    typeStr.includes('spend') ||
    typeStr.includes('generation') ||
    typeStr.includes('pack_create') ||
    descStr.includes('попытка ответа') ||
    descStr.includes('списание за вопрос') ||
    descStr.includes('вопрос') ||
    descStr.includes('подсказк') ||
    descStr.includes('генераци') ||
    descStr.includes('право на ошибку') ||
    descStr.includes('50/50') ||
    descStr.includes('помощь зала') ||
    descStr.includes('звонок') ||
    descStr.includes('создание игры')
  ) {
    return false;
  }

  // 3. ALLOW ONLY IMPORTANT:
  // 3a. Real Top-up / Payment / Purchase / Failed payment attempt
  const isTopupOrPayment =
    typeStr.includes('deposit') ||
    typeStr.includes('purchase') ||
    typeStr.includes('topup') ||
    typeStr.includes('payment') ||
    typeStr.includes('fail') ||
    typeStr.includes('buy') ||
    typeStr.includes('stars') ||
    typeStr.includes('sbp') ||
    typeStr.includes('crypto') ||
    typeStr.includes('robokassa') ||
    typeStr.includes('yookassa') ||
    refStr.includes('robokassa') ||
    descStr.includes('пополнение') ||
    descStr.includes('оплата') ||
    descStr.includes('оплаты') ||
    descStr.includes('покупк') ||
    descStr.includes('тариф');

  // 3b. Referral reward
  const isReferral =
    typeStr.includes('ref') ||
    typeStr.includes('referral') ||
    typeStr.includes('partner') ||
    descStr.includes('реферал') ||
    descStr.includes('партнер');

  // 3c. Admin manual adjustment or credit
  const isAdminAdjustment =
    typeStr.includes('admin') ||
    typeStr.includes('adjust') ||
    typeStr.includes('manual') ||
    descStr.includes('администратор') ||
    descStr.includes('корректировк') ||
    descStr.includes('начисление админ') ||
    descStr.includes('от администрации');

  // 3d. Payouts / Author rewards
  const isPayout =
    typeStr.includes('payout') ||
    typeStr.includes('author') ||
    typeStr.includes('reward') ||
    descStr.includes('выплат') ||
    descStr.includes('авторск') ||
    descStr.includes('вознаграждение');

  return isTopupOrPayment || isReferral || isAdminAdjustment || isPayout;
}

export async function sendTelegramTransactionNotification(
  userId: string,
  tx: {
    id: string;
    amount: number;
    currency?: string;
    type?: string;
    description?: string | null;
    reference_id?: string | null;
    timestamp?: number;
  },
  options?: {
    domain?: string | null;
    req?: any;
    outSumRub?: number;
    invId?: number | string;
    iikrAmount?: number;
  }
): Promise<boolean> {
  try {
    if (!tx || !tx.id) return false;

    // Check if already processed/sent in database to ensure ZERO duplicates
    const existingTx = await getOne<{ telegram_sent: number }>(
      'SELECT telegram_sent FROM transactions WHERE id = $1',
      [tx.id]
    );

    if (existingTx && (existingTx.telegram_sent === 1 || existingTx.telegram_sent === 2)) {
      // 1 = Already sent, 2 = Skipped as non-important
      return false;
    }

    // Check importance filter
    if (!isImportantTransaction(tx)) {
      // Mark as 2 (skipped intentionally) in DB so we never query or re-check
      await runSql(
        `UPDATE transactions SET telegram_sent = 2, telegram_sent_at = NOW() WHERE id = $1`,
        [tx.id]
      ).catch(() => {});
      return false;
    }

    // 1. Get user record
    const user = await getOne<{
      uid: string;
      telegram_id: string | null;
      display_name: string | null;
      email?: string | null;
      username?: string | null;
      balance: number;
    }>(
      'SELECT uid, telegram_id, display_name, email, username, balance FROM users WHERE uid = $1 OR id = $2',
      [userId, userId]
    );

    // 2. Get bot token
    const config = await getOne<{ bot_token: string; direct_site_url?: string; web_app_url?: string }>(
      'SELECT bot_token, direct_site_url, web_app_url FROM bot_config WHERE id = 1'
    ).catch(() => null);
    const botToken = decryptSecret(
      config?.bot_token ||
      process.env.TELEGRAM_BOT_TOKEN ||
      process.env.VITE_TELEGRAM_BOT_TOKEN ||
      '8663485854:AAHP70ovPUjIzha-YzD4B5rWkUrI57uG6VM'
    );

    if (!botToken) return false;

    const typeStr = (tx.type || '').toLowerCase();
    const descStr = (tx.description || '').toLowerCase();
    const refStr = (tx.reference_id || '').toLowerCase();

    const isFailedPayment =
      typeStr === 'payment_failed' ||
      typeStr.includes('fail') ||
      refStr.includes('fail') ||
      descStr.includes('неудачная попытка оплаты') ||
      descStr.includes('платеж отменен или отклонен');

    const isPaymentOrTopup =
      isFailedPayment ||
      typeStr.includes('robokassa') ||
      typeStr.includes('deposit') ||
      typeStr.includes('purchase') ||
      typeStr.includes('topup') ||
      typeStr.includes('payment') ||
      refStr.includes('robokassa') ||
      descStr.includes('робокасс') ||
      descStr.includes('пополнение баланса');

    const domain = resolveRequestDomain(
      options?.req,
      options?.domain || config?.direct_site_url || 'https://qaiz.ru'
    );

    // If this is a payment (successful or failed), notify Admin (TG ID: 169262990) with green inline profile link
    let adminSent = false;
    if (isPaymentOrTopup) {
      adminSent = await sendAdminPaymentNotification({
        userId: user?.uid || userId,
        txId: tx.id,
        isFailed: isFailedPayment,
        iikrAmount: options?.iikrAmount ?? Math.abs(Number(tx.amount) || 0),
        currency: tx.currency || 'ИИкр',
        outSumRub: options?.outSumRub,
        invId: options?.invId,
        description: tx.description,
        domain,
        req: options?.req,
        timestamp: tx.timestamp,
      });
    }

    if (!user || !user.telegram_id) {
      if (adminSent) {
        await runSql(
          `UPDATE transactions SET telegram_sent = 1, telegram_sent_at = NOW() WHERE id = $1`,
          [tx.id]
        ).catch(() => {});
      }
      return adminSent;
    }

    // 3. Format amount and text for user notification
    const isPositive = !isFailedPayment && tx.amount >= 0;
    const sign = isPositive ? '+' : '';
    const emoji = isFailedPayment ? '🔴' : isPositive ? '🟢' : '🔴';

    let title = isFailedPayment
      ? 'Неудачная попытка оплаты'
      : isPositive
      ? 'Пополнение баланса'
      : 'Списание средств';

    if (!isFailedPayment) {
      if (typeStr.includes('ref') || descStr.includes('реферал')) {
        title = '🎉 Новый реферал в Квайз!';
      } else if (typeStr.includes('admin') || descStr.includes('админ')) {
        title = 'Корректировка от администрации';
      } else if (typeStr.includes('purchase') || typeStr.includes('deposit') || typeStr.includes('robokassa') || descStr.includes('пополнение')) {
        title = 'Успешное пополнение баланса';
      }
    }

    const amountStr = isFailedPayment
      ? `0 ${tx.currency || 'ИИкр'} (не оплачено)`
      : `${sign}${tx.amount} ${tx.currency || 'ИИкр'}`;
    const desc =
      tx.description ||
      (isFailedPayment
        ? 'Оплата была отменена или отклонена'
        : isPositive
        ? 'Начисление на баланс'
        : 'Списание средств');
    const dateStr = new Date(tx.timestamp || Date.now()).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const currentBalance = user.balance !== undefined ? user.balance : 0;
    const siteBase = domain.replace(/\/+$/, '');

    let messageHtml = '';
    let replyMarkup: any = null;

    if (typeStr.includes('ref') || descStr.includes('реферал')) {
      let refUser: any = null;
      if (tx.reference_id) {
        refUser = await getOne(
          'SELECT uid, display_name, username, email, telegram_id FROM users WHERE uid = $1 OR id = $2',
          [tx.reference_id, tx.reference_id]
        );
      }
      const refTgHtml = refUser?.username
        ? `<a href="https://t.me/${escapeHtml(refUser.username.replace(/^@/, ''))}">@${escapeHtml(refUser.username.replace(/^@/, ''))}</a>`
        : refUser?.telegram_id
        ? `<a href="tg://user?id=${refUser.telegram_id}">Открыть диалог</a>`
        : 'Не привязан';

      const refTargetUid = refUser?.uid || tx.reference_id;

      messageHtml = [
        `<b>${title}</b>`,
        ``,
        `По вашей пригласительной ссылке зарегистрировался новый игрок:`,
        `👤 <b>Имя:</b> ${escapeHtml(refUser?.display_name || 'Игрок')}`,
        `📧 <b>Почта:</b> ${refUser?.email ? escapeHtml(refUser.email) : 'Не указана'}`,
        `📱 <b>Telegram:</b> ${refTgHtml}`,
        `🆔 <b>UID:</b> <code>${refTargetUid}</code>`,
        ``,
        `⚡️ <b>Начислено:</b> <code>+${tx.amount} ${tx.currency || 'ИИкр'}</code>`,
        `💳 <b>Текущий баланс:</b> <b>${currentBalance} ИИкр</b>`,
        `⏰ <b>Время (МСК):</b> ${dateStr}`
      ].join('\n');

      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '🎮 Открыть профиль игрока',
              url: `${siteBase}/profile/${refTargetUid}`,
              style: 'success'
            }
          ]
        ]
      };
    } else if (isFailedPayment) {
      messageHtml = [
        `<b>${emoji} ${title} в Квайз</b>`,
        ``,
        `⚠️ <b>Статус:</b> Оплата не завершена / отклонена`,
        `📝 <b>Детали:</b> ${escapeHtml(desc)}`,
        `💳 <b>Текущий баланс:</b> <b>${currentBalance} ИИкр</b>`,
        `🆔 <b>ID операции:</b> <code>#${tx.id}</code>`,
        `⏰ <b>Время (МСК):</b> ${dateStr}`
      ].join('\n');

      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '💳 Повторить оплату в Квайз',
              url: `${siteBase}/profile/exchange`,
              style: 'success'
            }
          ]
        ]
      };
    } else {
      messageHtml = [
        `<b>${emoji} ${title} в Квайз</b>`,
        ``,
        `⚡️ <b>Сумма:</b> <code>${amountStr}</code>`,
        `📝 <b>Назначение:</b> ${escapeHtml(desc)}`,
        `💳 <b>Текущий баланс:</b> <b>${currentBalance} ИИкр</b>`,
        `🆔 <b>ID операции:</b> <code>#${tx.id}</code>`,
        `⏰ <b>Время (МСК):</b> ${dateStr}`
      ].join('\n');

      const appUrl = `${siteBase}/profile/${user.uid}`;
      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '🎮 Открыть профиль в Квайз',
              url: appUrl,
              style: 'success'
            }
          ]
        ]
      };
    }

    // 4. Send via configured Telegram Bot proxy with inline button
    // (Skip sending duplicate user message if user is the admin and already received the full admin payment report)
    let sendResult: { ok: boolean; error?: string } = { ok: adminSent, error: undefined };
    if (!(isPaymentOrTopup && adminSent && String(user.telegram_id) === ADMIN_TELEGRAM_ID)) {
      sendResult = await sendTelegramMessage({
        chatId: user.telegram_id,
        text: messageHtml,
        parseMode: 'HTML',
        replyMarkup: replyMarkup
      });
    }

    if (sendResult.ok || adminSent) {
      // Mark as permanently sent in database so it can NEVER be resent
      await runSql(
        `UPDATE transactions SET telegram_sent = 1, telegram_sent_at = NOW() WHERE id = $1`,
        [tx.id]
      ).catch(() => {});

      await runSql(
        `UPDATE notifications SET telegram_sent = 1, telegram_sent_at = NOW() WHERE reference_id = $1 OR id = $2`,
        [tx.id, tx.id]
      ).catch(() => {});

      return true;
    } else {
      console.error('Telegram transaction notification error:', sendResult.error);
      return false;
    }
  } catch (err) {
    console.error('Error sending telegram transaction notification:', err);
    return false;
  }
}

/**
 * Send an important custom system message to a user's Telegram PM
 * Matches the reference format (RichMessage with green inline button via style: 'success')
 */
export async function sendTelegramCustomNotification(
  userId: string,
  params: {
    notificationId?: string;
    title: string;
    message: string;
    isHtml?: boolean;
    actionUrl?: string;
    actionText?: string;
    telegramId?: string | number | null;
  }
): Promise<boolean> {
  try {
    if (params.notificationId) {
      const existingNotif = await getOne<{ telegram_sent: number }>(
        'SELECT telegram_sent FROM notifications WHERE id = $1',
        [params.notificationId]
      );
      if (existingNotif && existingNotif.telegram_sent === 1) {
        return false; // Already sent
      }
    }

    const user = await getOne<{
      uid: string;
      telegram_id: string | null;
    }>(
      'SELECT uid, telegram_id FROM users WHERE uid = $1 OR id = $2',
      [userId, userId]
    );

    const cleanTitlePush = (params.title || 'Уведомление Квайз').replace(/^🔔\s*/, '').trim();
    const cleanBodyPush = String(params.message || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    sendWebPushToUser(user?.uid || userId, {
      title: cleanTitlePush || 'Квайз (qAIz)',
      body: cleanBodyPush.slice(0, 180),
      type: 'system_news',
      tag: params.notificationId || undefined,
    }).catch(() => {});

    const targetTelegramId = user?.telegram_id || params.telegramId;
    if (!targetTelegramId) return false;

    const config = await getOne<{ bot_token: string; web_app_url?: string }>(
      'SELECT bot_token, web_app_url FROM bot_config WHERE id = 1'
    ).catch(() => null);

    // Format header and body cleanly with HTML support
    const cleanTitle = (params.title || '').replace(/^🔔\s*/, '').trim();
    const titleHeader = cleanTitle ? `🔔 <b>${escapeHtml(cleanTitle)}</b>\n\n` : '';

    // Check if the message is already formatted with HTML tags (<b>, <i>, <code>, <blockquote>, etc.)
    const hasHtmlTags = params.isHtml || /<\/?(b|i|u|s|code|pre|blockquote|a|tg-spoiler)>/i.test(params.message);
    const formattedBody = hasHtmlTags ? params.message : escapeHtml(params.message);

    const messageHtml = `${titleHeader}${formattedBody}`;

    const appUrl = params.actionUrl || config?.web_app_url || 'https://t.me/qaiz_aibot/app';
    const actionText = params.actionText || '🎮 Открыть Квайз';

    // RichMessage inline keyboard button with green style: 'success' (matching the reference in friends.ts)
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: actionText,
            url: appUrl,
            style: 'success'
          }
        ]
      ]
    };

    const sendRes = await sendTelegramMessage({
      chatId: targetTelegramId,
      text: messageHtml,
      parseMode: 'HTML',
      replyMarkup
    });

    if (sendRes.ok && params.notificationId) {
      await runSql(
        `UPDATE notifications SET telegram_sent = 1, telegram_sent_at = NOW() WHERE id = $1`,
        [params.notificationId]
      ).catch(() => {});
    }

    return sendRes.ok;
  } catch (err) {
    console.error('Error sending telegram custom notification:', err);
    return false;
  }
}

export async function sendCustomTelegramNotification(params: {
  userId: string;
  telegramId?: string | number | null;
  title: string;
  message: string;
  isHtml?: boolean;
  actionUrl?: string;
  actionText?: string;
  notificationId?: string;
}): Promise<boolean> {
  return sendTelegramCustomNotification(params.userId, params);
}

export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
