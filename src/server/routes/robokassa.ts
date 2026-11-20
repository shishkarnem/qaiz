import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  getAll,
  getOne,
  runSql,
  generateId,
  recalculateUserBalancesFromTransactions,
  getIikrWord,
  encryptSecretValue,
  decryptSecretValue,
} from '../db';
import { pgOne } from '../pg';
import { sendTelegramTransactionNotification, resolveRequestDomain } from '../telegramNotifier';

export const robokassaRouter = Router();

export interface RobokassaConfigRow {
  id: string;
  merchant_login: string;
  password_1: string;
  password_2: string;
  test_password_1: string;
  test_password_2: string;
  hash_algorithm: string;
  is_test_mode: number;
  site_domain: string;
  result_url: string;
  result_method: string;
  success_url: string;
  success_method: string;
  fail_url: string;
  fail_method: string;
  payment_gateway_url: string;
  receipt_enabled: number;
  tax_system: string;
  vat_rate: string;
  is_active: number;
  updated_at: string;
}

function computeHash(input: string, algorithm: string = 'MD5'): string {
  const algo = (algorithm || 'MD5').toUpperCase().trim();
  if (algo === 'SHA256') {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  }
  if (algo === 'SHA512') {
    return crypto.createHash('sha512').update(input, 'utf8').digest('hex');
  }
  return crypto.createHash('md5').update(input, 'utf8').digest('hex');
}

async function getRobokassaConfig(): Promise<RobokassaConfigRow> {
  let row = await getOne<RobokassaConfigRow>(
    'SELECT * FROM robokassa_config WHERE id = $1 LIMIT 1',
    ['default']
  );

  if (!row) {
    const encPass1 = encryptSecretValue(process.env.ROBOKASSA_PASSWORD_1 || 'qaizPass1_2026');
    const encPass2 = encryptSecretValue(process.env.ROBOKASSA_PASSWORD_2 || 'qaizPass2_2026');
    const encTest1 = encryptSecretValue(process.env.ROBOKASSA_TEST_PASSWORD_1 || 'qaizTestPass1_2026');
    const encTest2 = encryptSecretValue(process.env.ROBOKASSA_TEST_PASSWORD_2 || 'qaizTestPass2_2026');

    await runSql(
      `INSERT INTO robokassa_config (
        id, merchant_login, password_1, password_2, test_password_1, test_password_2,
        hash_algorithm, is_test_mode, site_domain,
        result_url, result_method, success_url, success_method, fail_url, fail_method,
        payment_gateway_url, receipt_enabled, tax_system, vat_rate, is_active, updated_at
      ) VALUES (
        'default', 'qaiz', $1, $2, $3, $4,
        'MD5', 0, 'https://qaiz.ru',
        'https://qaiz.ru/api/payments/robokassa/result', 'POST',
        'https://qaiz.ru/api/payments/robokassa/success', 'GET',
        'https://qaiz.ru/api/payments/robokassa/fail', 'GET',
        'https://auth.robokassa.ru/Merchant/Index.aspx', 1, 'osn', 'vat5', 1, NOW()
      ) ON CONFLICT (id) DO NOTHING`,
      [encPass1, encPass2, encTest1, encTest2]
    );

    row = await getOne<RobokassaConfigRow>(
      'SELECT * FROM robokassa_config WHERE id = $1 LIMIT 1',
      ['default']
    );
  }

  const pass1 = decryptSecretValue(row?.password_1 || '') || 'qaizPass1_2026';
  const pass2 = decryptSecretValue(row?.password_2 || '') || 'qaizPass2_2026';
  const testPass1 = decryptSecretValue(row?.test_password_1 || '') || 'qaizTestPass1_2026';
  const testPass2 = decryptSecretValue(row?.test_password_2 || '') || 'qaizTestPass2_2026';

  return {
    id: 'default',
    merchant_login: row?.merchant_login || 'qaiz',
    password_1: pass1,
    password_2: pass2,
    test_password_1: testPass1,
    test_password_2: testPass2,
    hash_algorithm: row?.hash_algorithm || 'MD5',
    is_test_mode: Number(row?.is_test_mode || 0),
    site_domain: row?.site_domain || 'https://qaiz.ru',
    result_url: row?.result_url || 'https://qaiz.ru/api/payments/robokassa/result',
    result_method: row?.result_method || 'POST',
    success_url: row?.success_url || 'https://qaiz.ru/api/payments/robokassa/success',
    success_method: row?.success_method || 'GET',
    fail_url: row?.fail_url || 'https://qaiz.ru/api/payments/robokassa/fail',
    fail_method: row?.fail_method || 'GET',
    payment_gateway_url: row?.payment_gateway_url || 'https://auth.robokassa.ru/Merchant/Index.aspx',
    receipt_enabled: Number(row?.receipt_enabled !== undefined ? row.receipt_enabled : 1),
    tax_system: row?.tax_system || 'osn',
    vat_rate: row?.vat_rate && row.vat_rate !== 'none' ? row.vat_rate : 'vat5',
    is_active: row?.is_active !== undefined ? Number(row.is_active) : 1,
    updated_at: row?.updated_at || new Date().toISOString(),
  };
}

async function completeRobokassaOrder(
  invId: number,
  fallbackUserId?: string,
  fallbackIikr?: number,
  fallbackOutSum?: number,
  rawCallback?: any,
  req?: Request
): Promise<{ alreadyCompleted: boolean; order: any; txId?: string }> {
  let order = await getOne<any>('SELECT * FROM robokassa_orders WHERE inv_id = $1', [invId]);

  if (order && order.status === 'completed') {
    return { alreadyCompleted: true, order, txId: order.tx_id };
  }

  const config = await getRobokassaConfig().catch(() => null);
  const userId = order?.user_id || fallbackUserId;
  const iikrAmount = Math.max(1, Math.round(Number(order?.iikr_amount || fallbackIikr || 100)));
  const outSum = Number(order?.out_sum || fallbackOutSum || (iikrAmount * 0.99));
  const resolvedDomain = resolveRequestDomain(req, order?.site_domain || config?.site_domain || 'https://qaiz.ru');

  if (!userId) {
    throw new Error(`Не найден пользователь для заказа InvId=${invId}`);
  }

  // Check if transaction with reference_id = robokassa_inv_<invId> already exists
  const refId = `robokassa_inv_${invId}`;
  const existingTx = await getOne<any>(
    'SELECT * FROM transactions WHERE reference_id = $1 LIMIT 1',
    [refId]
  );

  let txId = existingTx?.id;

  if (!existingTx) {
    txId = generateId('tx_rk');
    const currencyWord = getIikrWord(iikrAmount);
    const ts = Date.now();
    const desc =
      order?.description ||
      `Пополнение баланса через Робокассу (заказ №${invId}): +${iikrAmount} ${currencyWord} (${outSum.toFixed(2)} ₽)`;

    await runSql(
      `INSERT INTO transactions (id, user_id, amount, currency, type, description, reference_id, timestamp, created_at)
       VALUES ($1, $2, $3, $4, 'robokassa', $5, $6, $7, NOW())`,
      [txId, userId, iikrAmount, currencyWord, desc, refId, ts]
    );

    await recalculateUserBalancesFromTransactions(userId);

    sendTelegramTransactionNotification(
      userId,
      {
        id: txId,
        amount: iikrAmount,
        currency: currencyWord,
        type: 'robokassa',
        description: desc,
        reference_id: refId,
        timestamp: ts,
      },
      {
        domain: resolvedDomain,
        req,
        outSumRub: outSum,
        invId,
        iikrAmount,
      }
    ).catch((err) => console.error('[Robokassa] Telegram notification error:', err));
  }

  const callbackJsonStr = rawCallback ? JSON.stringify(rawCallback) : null;

  if (order) {
    await runSql(
      `UPDATE robokassa_orders
       SET status = 'completed',
           tx_id = $1,
           site_domain = COALESCE(site_domain, $2),
           raw_callback_json = COALESCE($3, raw_callback_json),
           completed_at = NOW(),
           updated_at = NOW()
       WHERE inv_id = $4`,
      [txId, resolvedDomain, callbackJsonStr, invId]
    );
  } else {
    const orderUid = `rk_ord_${invId}_${Date.now()}`;
    await runSql(
      `INSERT INTO robokassa_orders (
        inv_id, order_uid, user_id, out_sum, iikr_amount, status, site_domain, tx_id, raw_callback_json, created_at, completed_at, updated_at
      ) OVERRIDING SYSTEM VALUE VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, NOW(), NOW(), NOW())
      ON CONFLICT (inv_id) DO UPDATE SET
        status = 'completed',
        tx_id = EXCLUDED.tx_id,
        completed_at = NOW(),
        updated_at = NOW()`,
      [invId, orderUid, userId, outSum, iikrAmount, resolvedDomain, txId, callbackJsonStr]
    );
  }

  order = await getOne<any>('SELECT * FROM robokassa_orders WHERE inv_id = $1', [invId]);
  return { alreadyCompleted: false, order, txId };
}

async function recordFailedRobokassaOrder(params: {
  invId?: number;
  fallbackUserId?: string;
  fallbackIikr?: number;
  fallbackOutSum?: number;
  reason?: string;
  rawCallback?: any;
  req?: Request;
}): Promise<{ alreadyRecorded: boolean; order?: any; txId?: string }> {
  const invId = Number(params.invId || 0);
  let order = invId > 0 ? await getOne<any>('SELECT * FROM robokassa_orders WHERE inv_id = $1', [invId]) : null;

  // Never mark an already completed order as failed
  if (order && order.status === 'completed') {
    return { alreadyRecorded: true, order, txId: order.tx_id };
  }

  const config = await getRobokassaConfig().catch(() => null);
  const userId = String(order?.user_id || params.fallbackUserId || '').trim();
  const iikrAmount = Math.max(1, Math.round(Number(order?.iikr_amount || params.fallbackIikr || 100)));
  const outSum = Number(order?.out_sum || params.fallbackOutSum || (iikrAmount * 0.99));
  const resolvedDomain = resolveRequestDomain(params.req, order?.site_domain || config?.site_domain || 'https://qaiz.ru');
  const callbackJsonStr = params.rawCallback ? JSON.stringify(params.rawCallback) : null;

  if (invId > 0 && order) {
    await runSql(
      `UPDATE robokassa_orders
       SET status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'failed' END,
           site_domain = COALESCE(site_domain, $1),
           raw_callback_json = COALESCE($2, raw_callback_json),
           updated_at = NOW()
       WHERE inv_id = $3`,
      [resolvedDomain, callbackJsonStr, invId]
    );
  }

  if (!userId || userId.startsWith('demo_')) {
    return { alreadyRecorded: false, order };
  }

  const refId = invId > 0 ? `robokassa_fail_${invId}` : `robokassa_fail_${userId}_${Math.floor(Date.now() / 60000)}`;
  const existingFailTx = await getOne<any>(
    'SELECT * FROM transactions WHERE reference_id = $1 LIMIT 1',
    [refId]
  );

  if (existingFailTx) {
    return { alreadyRecorded: true, order, txId: existingFailTx.id };
  }

  const txId = generateId('tx_rk_fail');
  const currencyWord = getIikrWord(iikrAmount);
  const ts = Date.now();
  const reasonText = params.reason || 'платеж отменен или отклонен';
  const desc = `Неудачная попытка оплаты через Робокассу${invId > 0 ? ` (заказ №${invId})` : ''}: пакет ${iikrAmount} ${currencyWord} (${outSum.toFixed(2)} ₽) — ${reasonText}`;

  await runSql(
    `INSERT INTO transactions (id, user_id, amount, currency, type, description, reference_id, timestamp, created_at)
     VALUES ($1, $2, 0, $3, 'payment_failed', $4, $5, $6, NOW())`,
    [txId, userId, currencyWord, desc, refId, ts]
  );

  sendTelegramTransactionNotification(
    userId,
    {
      id: txId,
      amount: 0,
      currency: currencyWord,
      type: 'payment_failed',
      description: desc,
      reference_id: refId,
      timestamp: ts,
    },
    {
      domain: resolvedDomain,
      req: params.req,
      outSumRub: outSum,
      invId: invId > 0 ? invId : undefined,
      iikrAmount,
    }
  ).catch((err) => console.error('[Robokassa Fail] Telegram notification error:', err));

  if (invId > 0) {
    order = await getOne<any>('SELECT * FROM robokassa_orders WHERE inv_id = $1', [invId]);
  }
  return { alreadyRecorded: false, order, txId };
}

// 1. GET /api/payments/robokassa/config - Get configuration and order history
robokassaRouter.get('/config', async (_req: Request, res: Response) => {
  try {
    const config = await getRobokassaConfig();
    const orders = await getAll<any>(
      'SELECT * FROM robokassa_orders ORDER BY inv_id DESC LIMIT 50'
    );
    const statsRow = await getOne<any>(
      `SELECT 
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::int AS completed_orders,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN out_sum ELSE 0 END), 0) AS total_rub,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN iikr_amount ELSE 0 END), 0) AS total_iikr
       FROM robokassa_orders`
    );

    res.json({
      success: true,
      config,
      orders,
      stats: {
        totalOrders: Number(statsRow?.total_orders || 0),
        completedOrders: Number(statsRow?.completed_orders || 0),
        totalRub: Number(statsRow?.total_rub || 0),
        totalIikr: Number(statsRow?.total_iikr || 0),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка чтения настроек Робокассы' });
  }
});

// 2. PUT & POST /api/payments/robokassa/config - Save configuration to PostgreSQL
const saveConfigHandler = async (req: Request, res: Response) => {
  try {
    const current = await getRobokassaConfig();
    const body = req.body || {};

    const merchantLogin = String(body.merchant_login ?? current.merchant_login ?? 'qaiz').trim() || 'qaiz';
    const rawPass1 = String(body.password_1 ?? current.password_1 ?? 'qaizPass1_2026').trim();
    const rawPass2 = String(body.password_2 ?? current.password_2 ?? 'qaizPass2_2026').trim();
    const rawTestPass1 = String(body.test_password_1 ?? current.test_password_1 ?? 'qaizTestPass1_2026').trim();
    const rawTestPass2 = String(body.test_password_2 ?? current.test_password_2 ?? 'qaizTestPass2_2026').trim();

    const hashAlgorithm = String(body.hash_algorithm ?? current.hash_algorithm ?? 'MD5').toUpperCase().trim();
    const isTestMode = body.is_test_mode !== undefined ? (body.is_test_mode ? 1 : 0) : current.is_test_mode;
    const siteDomain = String(body.site_domain ?? current.site_domain ?? 'https://qaiz.ru').trim().replace(/\/+$/, '');

    const resultUrl = String(body.result_url ?? `${siteDomain}/api/payments/robokassa/result`).trim();
    const resultMethod = String(body.result_method ?? current.result_method ?? 'POST').toUpperCase().trim();
    const successUrl = String(body.success_url ?? `${siteDomain}/api/payments/robokassa/success`).trim();
    const successMethod = String(body.success_method ?? current.success_method ?? 'GET').toUpperCase().trim();
    const failUrl = String(body.fail_url ?? `${siteDomain}/api/payments/robokassa/fail`).trim();
    const failMethod = String(body.fail_method ?? current.fail_method ?? 'GET').toUpperCase().trim();
    const paymentGatewayUrl = String(
      body.payment_gateway_url ?? current.payment_gateway_url ?? 'https://auth.robokassa.ru/Merchant/Index.aspx'
    ).trim();

    const receiptEnabled = body.receipt_enabled !== undefined ? (body.receipt_enabled ? 1 : 0) : current.receipt_enabled;
    const taxSystem = String(body.tax_system ?? current.tax_system ?? 'osn').trim();
    const vatRate = String(body.vat_rate ?? current.vat_rate ?? 'none').trim();
    const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : current.is_active;

    await runSql(
      `INSERT INTO robokassa_config (
        id, merchant_login, password_1, password_2, test_password_1, test_password_2,
        hash_algorithm, is_test_mode, site_domain,
        result_url, result_method, success_url, success_method, fail_url, fail_method,
        payment_gateway_url, receipt_enabled, tax_system, vat_rate, is_active, updated_at
      ) VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
      ON CONFLICT (id) DO UPDATE SET
        merchant_login = EXCLUDED.merchant_login,
        password_1 = EXCLUDED.password_1,
        password_2 = EXCLUDED.password_2,
        test_password_1 = EXCLUDED.test_password_1,
        test_password_2 = EXCLUDED.test_password_2,
        hash_algorithm = EXCLUDED.hash_algorithm,
        is_test_mode = EXCLUDED.is_test_mode,
        site_domain = EXCLUDED.site_domain,
        result_url = EXCLUDED.result_url,
        result_method = EXCLUDED.result_method,
        success_url = EXCLUDED.success_url,
        success_method = EXCLUDED.success_method,
        fail_url = EXCLUDED.fail_url,
        fail_method = EXCLUDED.fail_method,
        payment_gateway_url = EXCLUDED.payment_gateway_url,
        receipt_enabled = EXCLUDED.receipt_enabled,
        tax_system = EXCLUDED.tax_system,
        vat_rate = EXCLUDED.vat_rate,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()`,
      [
        merchantLogin,
        encryptSecretValue(rawPass1),
        encryptSecretValue(rawPass2),
        encryptSecretValue(rawTestPass1),
        encryptSecretValue(rawTestPass2),
        hashAlgorithm,
        isTestMode,
        siteDomain,
        resultUrl,
        resultMethod,
        successUrl,
        successMethod,
        failUrl,
        failMethod,
        paymentGatewayUrl,
        receiptEnabled,
        taxSystem,
        vatRate,
        isActive,
      ]
    );

    const updated = await getRobokassaConfig();
    res.json({
      success: true,
      message: 'Настройки Робокассы успешно сохранены и зафиксированы в базе данных PostgreSQL',
      config: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сохранения настроек Робокассы' });
  }
};

robokassaRouter.put('/config', saveConfigHandler);
robokassaRouter.post('/config', saveConfigHandler);

/**
 * Robokassa 54-FZ Fiscalization Receipt generator.
 * Position verbatim from the public offer: "Внутриигровая валюта ИИкра".
 * Includes sno: "osn", tax: "vat5" (5% VAT), payment_method: "full_payment", payment_object: "service".
 * Calculates unit cost so cost * quantity equals sum.
 */
export function buildRobokassaReceipt(
  outSum: number | string,
  iikrAmount?: number,
  config?: { tax_system?: string; vat_rate?: string }
): { receiptObj: any; receiptJson: string } {
  const numSum = Number(Number(outSum).toFixed(2));
  const qty = Math.max(1, Math.round(Number(iikrAmount || 1)));
  const vat = config?.vat_rate && config.vat_rate !== 'none' ? config.vat_rate : 'vat5';
  const sno = config?.tax_system || 'osn';

  let unitCost = Number((numSum / qty).toFixed(2));
  let finalQty = qty;

  // If cost with 2 decimals doesn't match total sum within 1 kopeck, check 4 decimals
  if (Math.abs(Number((unitCost * finalQty).toFixed(2)) - numSum) > 0.001) {
    unitCost = Number((numSum / qty).toFixed(4));
  }

  // If still not matching due to integer rounding on odd discounts, bundle as 1 position
  if (Math.abs(Number((unitCost * finalQty).toFixed(2)) - numSum) > 0.01) {
    finalQty = 1;
    unitCost = numSum;
  }

  const receiptObj = {
    sno,
    items: [
      {
        name: 'Внутриигровая валюта ИИкра',
        quantity: finalQty,
        cost: unitCost,
        sum: numSum,
        tax: vat,
        payment_method: 'full_payment',
        payment_object: 'service',
      },
    ],
  };

  return {
    receiptObj,
    receiptJson: JSON.stringify(receiptObj),
  };
}

// 3. POST /api/payments/robokassa/initiate - Generate payment link & create order in PostgreSQL
robokassaRouter.post('/initiate', async (req: Request, res: Response) => {
  try {
    const config = await getRobokassaConfig();
    const {
      userId,
      user_id,
      payPrice,
      outSum: reqOutSum,
      baseEnergy,
      baseIikr,
      amount,
      discountPercent = 0,
      email = '',
      description: customDesc,
      domain: reqDomain,
    } = req.body || {};

    const resolvedUserId = String(userId || user_id || '').trim();
    const resolvedIikr = Math.max(1, Math.round(Number(baseEnergy ?? baseIikr ?? amount ?? 100)));
    const rawPrice = Number(payPrice ?? reqOutSum ?? resolvedIikr * 0.99);
    const formattedOutSum = rawPrice.toFixed(2);
    const resolvedSiteDomain = resolveRequestDomain(req, reqDomain || config.site_domain);

    if (!resolvedUserId) {
      return res.status(400).json({ error: 'Не указан идентификатор пользователя (userId)' });
    }

    const currencyWord = getIikrWord(resolvedIikr);
    const discountNote = Number(discountPercent) > 0 ? ` (скидка ${discountPercent}%)` : '';
    const orderDescription =
      customDesc ||
      `Пополнение баланса Квайз на ${resolvedIikr} ${currencyWord}${discountNote}`;

    const orderUid = generateId('rk');

    const createdOrder = await pgOne<{ inv_id: number }>(
      `INSERT INTO robokassa_orders (
        order_uid, user_id, out_sum, iikr_amount, discount_percent, description,
        status, is_test, payment_method, email, site_domain, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, 'card', $8, $9, NOW(), NOW())
      RETURNING inv_id`,
      [
        orderUid,
        resolvedUserId,
        Number(formattedOutSum),
        resolvedIikr,
        Number(discountPercent) || 0,
        orderDescription,
        config.is_test_mode ? 1 : 0,
        email || null,
        resolvedSiteDomain,
      ]
    );
    const invId = Number(createdOrder?.inv_id || Math.floor(Date.now() / 1000));

    // Select Password #1 (live or test)
    const activePass1 = config.is_test_mode ? config.test_password_1 || config.password_1 : config.password_1;

    // 54-FZ Fiscalization: One item for the full OutSum amount verbatim from the offer
    const { receiptJson, receiptObj } = buildRobokassaReceipt(formattedOutSum, resolvedIikr, config);

    // Alphabetically sorted Shp_ parameters: Shp_energy, Shp_userId
    // Signature formula with Receipt:
    // MerchantLogin:OutSum:InvId:Receipt:Password#1:Shp_energy=...:Shp_userId=...
    const shpParamsString = `Shp_energy=${resolvedIikr}:Shp_userId=${resolvedUserId}`;
    const signatureBase = `${config.merchant_login}:${formattedOutSum}:${invId}:${receiptJson}:${activePass1}:${shpParamsString}`;
    const signatureValue = computeHash(signatureBase, config.hash_algorithm);

    await runSql(
      'UPDATE robokassa_orders SET signature_value = $1, receipt_json = $2 WHERE inv_id = $3',
      [signatureValue, receiptJson, invId]
    );

    const params = new URLSearchParams({
      MerchantLogin: config.merchant_login,
      OutSum: formattedOutSum,
      InvId: String(invId),
      Description: orderDescription,
      SignatureValue: signatureValue,
      Receipt: receiptJson,
      Shp_energy: String(resolvedIikr),
      Shp_userId: resolvedUserId,
      Culture: 'ru',
    });

    if (email) {
      params.set('Email', String(email));
    }
    if (config.is_test_mode) {
      params.set('IsTest', '1');
    }

    const gatewayBase = config.payment_gateway_url || 'https://auth.robokassa.ru/Merchant/Index.aspx';
    // URLSearchParams encodes parameters once; replace + with %20 for strict RFC 3986 encoding
    const paymentUrl = `${gatewayBase}?${params.toString().replace(/\+/g, '%20')}`;

    res.json({
      success: true,
      invId,
      orderUid,
      userId: resolvedUserId,
      outSum: formattedOutSum,
      baseEnergy: resolvedIikr,
      baseIikr: resolvedIikr,
      discountPercent: Number(discountPercent) || 0,
      receipt: receiptObj,
      receiptJson,
      signatureValue,
      isTestMode: Boolean(config.is_test_mode),
      paymentUrl,
    });
  } catch (err: any) {
    console.error('[Robokassa Initiate Error]:', err);
    res.status(500).json({ error: err.message || 'Ошибка создания платежа Робокассы' });
  }
});

// 3b. POST /api/payments/robokassa/recurring - Recurring payment (автосписания) with Receipt
robokassaRouter.post('/recurring', async (req: Request, res: Response) => {
  try {
    const config = await getRobokassaConfig();
    const {
      userId,
      user_id,
      previousInvoiceId,
      previous_inv_id,
      payPrice,
      outSum: reqOutSum,
      baseEnergy,
      baseIikr,
      amount,
      description: customDesc,
      domain: reqDomain,
    } = req.body || {};

    const resolvedUserId = String(userId || user_id || '').trim();
    const resolvedIikr = Math.max(1, Math.round(Number(baseEnergy ?? baseIikr ?? amount ?? 100)));
    const rawPrice = Number(payPrice ?? reqOutSum ?? resolvedIikr * 0.99);
    const formattedOutSum = rawPrice.toFixed(2);
    const prevInvId = Number(previousInvoiceId || previous_inv_id || 0);
    const resolvedSiteDomain = resolveRequestDomain(req, reqDomain || config.site_domain);

    if (!resolvedUserId) {
      return res.status(400).json({ error: 'Не указан идентификатор пользователя (userId)' });
    }

    const currencyWord = getIikrWord(resolvedIikr);
    const orderDescription = customDesc || `Автоплатеж Квайз: ${resolvedIikr} ${currencyWord}`;
    const orderUid = generateId('rk_rec');

    const createdOrder = await pgOne<{ inv_id: number }>(
      `INSERT INTO robokassa_orders (
        order_uid, user_id, out_sum, iikr_amount, description,
        status, is_test, payment_method, site_domain, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, 'recurring', $7, NOW(), NOW())
      RETURNING inv_id`,
      [orderUid, resolvedUserId, Number(formattedOutSum), resolvedIikr, orderDescription, config.is_test_mode ? 1 : 0, resolvedSiteDomain]
    );

    const invId = Number(createdOrder?.inv_id || Math.floor(Date.now() / 1000));
    const activePass1 = config.is_test_mode ? config.test_password_1 || config.password_1 : config.password_1;

    const { receiptJson, receiptObj } = buildRobokassaReceipt(formattedOutSum, resolvedIikr, config);
    const shpParamsString = `Shp_energy=${resolvedIikr}:Shp_userId=${resolvedUserId}`;
    const signatureBase = `${config.merchant_login}:${formattedOutSum}:${invId}:${receiptJson}:${activePass1}:${shpParamsString}`;
    const signatureValue = computeHash(signatureBase, config.hash_algorithm);

    await runSql('UPDATE robokassa_orders SET signature_value = $1, receipt_json = $2 WHERE inv_id = $3', [signatureValue, receiptJson, invId]);

    const recurringPayload = {
      MerchantLogin: config.merchant_login,
      InvoiceID: invId,
      PreviousInvoiceID: prevInvId,
      Amount: formattedOutSum,
      Description: orderDescription,
      SignatureValue: signatureValue,
      Receipt: receiptJson,
      Shp_energy: String(resolvedIikr),
      Shp_userId: resolvedUserId,
    };

    res.json({
      success: true,
      invId,
      orderUid,
      previousInvoiceId: prevInvId,
      outSum: formattedOutSum,
      receipt: receiptObj,
      receiptJson,
      signatureValue,
      recurringPayload,
      message: 'Параметры регулярного платежа успешно сформированы с номенклатурой Receipt',
    });
  } catch (err: any) {
    console.error('[Robokassa Recurring Error]:', err);
    res.status(500).json({ error: err.message || 'Ошибка формирования регулярного платежа' });
  }
});

// 4. ALL /api/payments/robokassa/result - Server-to-Server Callback from Robokassa (Password #2)
const handleResultCallback = async (req: Request, res: Response) => {
  try {
    const config = await getRobokassaConfig();
    const data: Record<string, any> = { ...(req.query || {}), ...(req.body || {}) };

    const outSumRaw = String(data.OutSum ?? data.outsum ?? data.out_sum ?? '').trim();
    const invIdRaw = String(data.InvId ?? data.invid ?? data.inv_id ?? '').trim();
    const signatureRaw = String(data.SignatureValue ?? data.signaturevalue ?? data.crc ?? '').trim().toLowerCase();
    const shpEnergy = String(data.Shp_energy ?? data.shp_energy ?? data.Shp_iikr ?? '').trim();
    const shpUserId = String(data.Shp_userId ?? data.shp_userid ?? data.Shp_user_id ?? '').trim();
    const isTestParam = String(data.IsTest ?? data.istest ?? '') === '1' || Boolean(config.is_test_mode);

    if (!outSumRaw || !invIdRaw || !signatureRaw) {
      return res.status(400).type('text/plain').send('bad request: missing parameters');
    }

    const invId = Number(invIdRaw);
    const activePass2 = isTestParam ? config.test_password_2 || config.password_2 : config.password_2;

    // Collect all Shp_* parameters sorted alphabetically (case-insensitive key match, preserving exact key=value)
    const shpKeys = Object.keys(data)
      .filter((k) => k.toLowerCase().startsWith('shp_'))
      .sort((a, b) => a.localeCompare(b));
    const dynamicShpPart = shpKeys.map((k) => `${k}=${data[k]}`).join(':');

    // Candidate signature bases to ensure compatibility with any OutSum formatting or Shp_ order
    const candidateBases = [
      `${outSumRaw}:${invIdRaw}:${activePass2}:Shp_energy=${shpEnergy}:Shp_userId=${shpUserId}`,
      `${outSumRaw}:${invIdRaw}:${config.password_2}:Shp_energy=${shpEnergy}:Shp_userId=${shpUserId}`,
      dynamicShpPart ? `${outSumRaw}:${invIdRaw}:${activePass2}:${dynamicShpPart}` : '',
      dynamicShpPart ? `${outSumRaw}:${invIdRaw}:${config.password_2}:${dynamicShpPart}` : '',
      `${outSumRaw}:${invIdRaw}:${activePass2}`,
      `${outSumRaw}:${invIdRaw}:${config.password_2}`,
    ].filter(Boolean);

    const isSignatureValid = candidateBases.some(
      (base) => computeHash(base, config.hash_algorithm).toLowerCase() === signatureRaw
    );

    if (!isSignatureValid) {
      console.warn('[Robokassa Result] Invalid signature for InvId:', invIdRaw, {
        receivedSignature: signatureRaw,
        outSumRaw,
        shpEnergy,
        shpUserId,
      });
      await recordFailedRobokassaOrder({
        invId,
        fallbackUserId: shpUserId || undefined,
        fallbackIikr: shpEnergy ? Number(shpEnergy) : undefined,
        fallbackOutSum: outSumRaw ? Number(outSumRaw) : undefined,
        reason: 'ошибка контрольной подписи шлюза (bad sign)',
        rawCallback: data,
        req,
      }).catch(() => {});
      return res.status(400).type('text/plain').send('bad sign');
    }

    await completeRobokassaOrder(
      invId,
      shpUserId || undefined,
      shpEnergy ? Number(shpEnergy) : undefined,
      Number(outSumRaw),
      data,
      req
    );

    // Robokassa requires exact plain-text response: OK<InvId>
    return res.status(200).type('text/plain').send(`OK${invId}`);
  } catch (err: any) {
    console.error('[Robokassa Result Error]:', err);
    return res.status(500).type('text/plain').send(`error: ${err.message}`);
  }
};

robokassaRouter.post('/result', handleResultCallback);
robokassaRouter.get('/result', handleResultCallback);

// 5. ALL /api/payments/robokassa/success - Browser Redirect on Successful Payment (Password #1)
const handleSuccessRedirect = async (req: Request, res: Response) => {
  try {
    const config = await getRobokassaConfig();
    const data: Record<string, any> = { ...(req.query || {}), ...(req.body || {}) };

    const outSumRaw = String(data.OutSum ?? data.outsum ?? '').trim();
    const invIdRaw = String(data.InvId ?? data.invid ?? '').trim();
    const signatureRaw = String(data.SignatureValue ?? data.signaturevalue ?? data.crc ?? '').trim().toLowerCase();
    const shpEnergy = String(data.Shp_energy ?? data.shp_energy ?? '').trim();
    const shpUserId = String(data.Shp_userId ?? data.shp_userid ?? '').trim();
    const isTestParam = String(data.IsTest ?? data.istest ?? '') === '1' || Boolean(config.is_test_mode);

    const invId = Number(invIdRaw || 0);

    // Verify with Password #1 if signature is provided and complete order if not yet completed
    if (outSumRaw && invIdRaw && signatureRaw) {
      const activePass1 = isTestParam ? config.test_password_1 || config.password_1 : config.password_1;
      const candidateBases = [
        `${outSumRaw}:${invIdRaw}:${activePass1}:Shp_energy=${shpEnergy}:Shp_userId=${shpUserId}`,
        `${outSumRaw}:${invIdRaw}:${config.password_1}:Shp_energy=${shpEnergy}:Shp_userId=${shpUserId}`,
        `${outSumRaw}:${invIdRaw}:${activePass1}`,
        `${outSumRaw}:${invIdRaw}:${config.password_1}`,
      ];
      const isValid = candidateBases.some(
        (base) => computeHash(base, config.hash_algorithm).toLowerCase() === signatureRaw
      );

      if (isValid && invId > 0) {
        await completeRobokassaOrder(
          invId,
          shpUserId || undefined,
          shpEnergy ? Number(shpEnergy) : undefined,
          Number(outSumRaw),
          data,
          req
        );
      }
    }

    const order = invId > 0 ? await getOne<any>('SELECT * FROM robokassa_orders WHERE inv_id = $1', [invId]) : null;
    const finalIikr = order?.iikr_amount || shpEnergy || '';
    const finalOutSum = order?.out_sum || outSumRaw || '';
    const finalUserId = order?.user_id || shpUserId || '';

    const redirectQuery = new URLSearchParams({
      payment: 'success',
      ...(invId ? { invId: String(invId) } : {}),
      ...(finalOutSum ? { outSum: String(finalOutSum) } : {}),
      ...(finalIikr ? { iikr: String(finalIikr) } : {}),
      ...(finalUserId ? { userId: String(finalUserId) } : {}),
    });

    return res.redirect(`/payment/success?${redirectQuery.toString()}`);
  } catch (err: any) {
    console.error('[Robokassa Success Redirect Error]:', err);
    return res.redirect('/payment/success?payment=success');
  }
};

robokassaRouter.get('/success', handleSuccessRedirect);
robokassaRouter.post('/success', handleSuccessRedirect);

// 6. ALL /api/payments/robokassa/fail - Browser Redirect on Failed or Cancelled Payment
const handleFailRedirect = async (req: Request, res: Response) => {
  try {
    const data: Record<string, any> = { ...(req.query || {}), ...(req.body || {}) };
    const outSumRaw = String(data.OutSum ?? data.outsum ?? '').trim();
    const invIdRaw = String(data.InvId ?? data.invid ?? '').trim();
    const shpEnergy = String(data.Shp_energy ?? data.shp_energy ?? '').trim();
    const shpUserId = String(data.Shp_userId ?? data.shp_userid ?? data.Shp_user_id ?? '').trim();
    const invId = Number(invIdRaw || 0);

    await recordFailedRobokassaOrder({
      invId,
      fallbackUserId: shpUserId || undefined,
      fallbackIikr: shpEnergy ? Number(shpEnergy) : undefined,
      fallbackOutSum: outSumRaw ? Number(outSumRaw) : undefined,
      reason: 'платеж отменен пользователем или отклонен банком',
      rawCallback: data,
      req,
    });

    const order = invId > 0 ? await getOne<any>('SELECT * FROM robokassa_orders WHERE inv_id = $1', [invId]) : null;
    const finalIikr = order?.iikr_amount || shpEnergy || '';
    const finalOutSum = order?.out_sum || outSumRaw || '';
    const finalUserId = order?.user_id || shpUserId || '';

    const redirectQuery = new URLSearchParams({
      payment: 'fail',
      ...(invId ? { invId: String(invId) } : {}),
      ...(finalOutSum ? { outSum: String(finalOutSum) } : {}),
      ...(finalIikr ? { iikr: String(finalIikr) } : {}),
      ...(finalUserId ? { userId: String(finalUserId) } : {}),
    });

    return res.redirect(`/payment/fail?${redirectQuery.toString()}`);
  } catch (err: any) {
    console.error('[Robokassa Fail Redirect Error]:', err);
    return res.redirect('/payment/fail?payment=fail');
  }
};

robokassaRouter.get('/fail', handleFailRedirect);
robokassaRouter.post('/fail', handleFailRedirect);

// 6b. POST /api/payments/robokassa/report-fail - Client-side report when landing on /payment/fail or payment error
robokassaRouter.post('/report-fail', async (req: Request, res: Response) => {
  try {
    const { invId, userId, iikr, outSum, reason } = req.body || {};
    const result = await recordFailedRobokassaOrder({
      invId: invId ? Number(invId) : undefined,
      fallbackUserId: userId ? String(userId).trim() : undefined,
      fallbackIikr: iikr ? Number(iikr) : undefined,
      fallbackOutSum: outSum ? Number(outSum) : undefined,
      reason: reason || 'платеж отменен или отклонен',
      req,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[Robokassa Report Fail Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. GET /api/payments/robokassa/order/:invId - Get single order details
robokassaRouter.get('/order/:invId', async (req: Request, res: Response) => {
  try {
    const invId = Number(req.params.invId);
    if (!invId) {
      return res.status(400).json({ error: 'Некорректный номер заказа' });
    }
    const order = await getOne<any>('SELECT * FROM robokassa_orders WHERE inv_id = $1', [invId]);
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    res.json({ success: true, order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. POST /api/payments/robokassa/test-simulate - Admin/Test simulation of full payment cycle
robokassaRouter.post('/test-simulate', async (req: Request, res: Response) => {
  try {
    const config = await getRobokassaConfig();
    const { userId, iikrAmount = 100, outSum = 99.0, simulateFail = false } = req.body || {};
    const targetUserId = String(userId || '10016926299').trim();
    const targetIikr = Math.max(1, Math.round(Number(iikrAmount)));
    const formattedOutSum = Number(outSum).toFixed(2);
    const resolvedSiteDomain = resolveRequestDomain(req, config.site_domain);

    const orderUid = generateId('rk_test');
    const currencyWord = getIikrWord(targetIikr);
    const desc = `Тестовая проверка шлюза Робокассы: +${targetIikr} ${currencyWord}`;

    const created = await pgOne<{ inv_id: number }>(
      `INSERT INTO robokassa_orders (
        order_uid, user_id, out_sum, iikr_amount, discount_percent, description,
        status, is_test, payment_method, site_domain, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 0, $5, 'pending', 1, 'card', $6, NOW(), NOW())
      RETURNING inv_id`,
      [orderUid, targetUserId, Number(formattedOutSum), targetIikr, desc, resolvedSiteDomain]
    );

    const invId = Number(created?.inv_id || Math.floor(Date.now() / 1000));

    // Generate signatures with Password #1 (with Receipt) and Password #2
    const { receiptJson: testReceiptJson } = buildRobokassaReceipt(formattedOutSum, targetIikr, config);
    const shpPart = `Shp_energy=${targetIikr}:Shp_userId=${targetUserId}`;
    const sign1 = computeHash(
      `${config.merchant_login}:${formattedOutSum}:${invId}:${testReceiptJson}:${config.password_1}:${shpPart}`,
      config.hash_algorithm
    );
    const sign2 = computeHash(
      `${formattedOutSum}:${invId}:${config.password_2}:${shpPart}`,
      config.hash_algorithm
    );

    if (simulateFail) {
      const failRes = await recordFailedRobokassaOrder({
        invId,
        fallbackUserId: targetUserId,
        fallbackIikr: targetIikr,
        fallbackOutSum: Number(formattedOutSum),
        reason: 'тестовая проверка неудачной оплаты',
        rawCallback: { simulatedFail: true, InvId: invId, OutSum: formattedOutSum },
        req,
      });
      return res.json({
        success: true,
        message: `Тестовый отказ оплаты по заказу №${invId} зафиксирован в транзакциях и отправлен в Telegram!`,
        invId,
        order: failRes.order,
        txId: failRes.txId,
      });
    }

    const result = await completeRobokassaOrder(
      invId,
      targetUserId,
      targetIikr,
      Number(formattedOutSum),
      {
        simulated: true,
        OutSum: formattedOutSum,
        InvId: invId,
        SignatureValue: sign2,
        Shp_energy: targetIikr,
        Shp_userId: targetUserId,
      },
      req
    );

    res.json({
      success: true,
      message: `Тестовый заказ №${invId} успешно проверен! Ответ шлюзу: OK${invId}. Начислено +${targetIikr} ${currencyWord}.`,
      invId,
      robokassaResponse: `OK${invId}`,
      signatureInit: sign1,
      signatureResult: sign2,
      order: result.order,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка тестовой проверки Робокассы' });
  }
});
