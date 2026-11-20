import { Router } from 'express';
import { getAll, getOne, runSql, maskSecret, isSensitiveSettingKey } from '../db';
import { pgOne } from '../pg';
import { isSuperAdminRecord } from '../authMiddleware';

export const dbQueryRouter = Router();

const SENSITIVE_TABLES = new Set([
  'bot_config',
  'telegram_config',
  'telegram_bot_config',
  'protalk_config',
  'protalk_bots',
  'moderation_config',
  'system_settings',
  'system_config',
  'admin_audit_logs',
  'mailing_logs',
  'logs'
]);

const IDENTITY_TABLES = new Set([
  'logs',
  'protalk_config',
  'moderation_config',
  'file_folders',
  'file_storage',
  'robokassa_orders'
]);

function isSafeIdent(ident: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident);
}

function sanitizeRowForClient(tableName: string, row: any): any {
  if (!row || typeof row !== 'object') return row;
  const copy = { ...row };
  delete copy.password;
  delete copy.password_hash;
  delete copy.verification_code;
  delete copy.reset_code;

  for (const key of Object.keys(copy)) {
    const lk = key.toLowerCase();
    if (
      lk.includes('token') ||
      lk.includes('secret') ||
      lk.includes('api_key') ||
      lk.includes('private_key')
    ) {
      if (copy[key]) {
        copy[key] = maskSecret(String(copy[key]));
      }
    }
  }

  if (tableName === 'system_settings' && copy.key && isSensitiveSettingKey(String(copy.key)) && copy.value) {
    copy.value = maskSecret(String(copy.value));
  }
  return copy;
}

dbQueryRouter.post('/', async (req, res) => {
  try {
    const { table, action, data, eq, order, limit } = req.body;
    if (!table) {
      return res.status(400).json({ error: 'Таблица обязательна' });
    }

    const rawLowerTable = String(table).toLowerCase();
    const TABLE_ALIASES: Record<string, string> = {
      telegram_config: 'bot_config',
      telegram_bot_config: 'bot_config',
      profiles: 'users',
      news: 'posts',
      system_game_prompts: 'prompts'
    };
    const resolvedTable = TABLE_ALIASES[rawLowerTable] || String(table);
    const lowerTable = resolvedTable.toLowerCase();

    if (!isSafeIdent(resolvedTable)) {
      return res.status(400).json({ error: 'Некорректное имя таблицы' });
    }

    // Check admin identity for sensitive tables or privileged actions
    const candidateUid = (req.headers['x-user-uid'] || req.headers['x-admin-uid']) as string | undefined;
    let isAdmin = false;
    if (candidateUid) {
      const cleanUid = String(candidateUid).trim();
      const user = await getOne(
        'SELECT * FROM users WHERE uid = $1 OR id = $1 OR telegram_id = $1 OR LOWER(email) = $2',
        [cleanUid, cleanUid.toLowerCase()]
      );
      if (user && isSuperAdminRecord(user)) {
        isAdmin = true;
      }
    }

    if (SENSITIVE_TABLES.has(lowerTable) && !isAdmin) {
      return res.status(403).json({ error: 'Доступ к системной таблице запрещен', code: 'ACCESS_DENIED' });
    }

    if (lowerTable === 'users' && (action === 'insert' || action === 'update') && data && data.role && !isAdmin) {
      delete data.role;
    }

    if (action === 'select' || !action) {
      let query = `SELECT * FROM "${resolvedTable}" WHERE 1=1`;
      const params: any[] = [];
      let pIdx = 1;

      if (eq && typeof eq === 'object') {
        for (const [col, val] of Object.entries(eq)) {
          if (!isSafeIdent(col)) continue;
          if (val !== undefined && val !== null) {
            query += ` AND "${col}" = $${pIdx++}`;
            params.push(val);
          }
        }
      }

      if (order && order.column && isSafeIdent(String(order.column))) {
        query += ` ORDER BY "${order.column}" ${order.ascending === false ? 'DESC' : 'ASC'}`;
      }

      if (limit && typeof limit === 'number' && limit > 0) {
        query += ` LIMIT ${Math.min(Math.floor(limit), 5000)}`;
      }

      const rows = await getAll(query, params);
      const safeRows = rows.map(r => sanitizeRowForClient(lowerTable, r));
      return res.json({ data: safeRows });
    }

    if (action === 'insert') {
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Данные обязательны' });
      }
      const payload = { ...data };
      if (IDENTITY_TABLES.has(lowerTable)) {
        delete payload.id;
      }
      const cols = Object.keys(payload).filter(isSafeIdent);
      if (cols.length === 0) {
        return res.status(400).json({ error: 'Нет корректных полей для вставки' });
      }
      const vals = cols.map((c) => payload[c]);
      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
      const sql = `INSERT INTO "${resolvedTable}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;

      const inserted = await pgOne(sql, vals);
      return res.json({ data: inserted || data, success: true });
    }

    if (action === 'update') {
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Данные обязательны' });
      }
      const setClauses: string[] = [];
      const params: any[] = [];
      let pIdx = 1;

      for (const [col, val] of Object.entries(data)) {
        if (!isSafeIdent(col)) continue;
        setClauses.push(`"${col}" = $${pIdx++}`);
        params.push(val);
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'Нет полей для обновления' });
      }

      let whereClause = 'WHERE 1=1';
      if (eq && typeof eq === 'object') {
        for (const [col, val] of Object.entries(eq)) {
          if (!isSafeIdent(col)) continue;
          whereClause += ` AND "${col}" = $${pIdx++}`;
          params.push(val);
        }
      }

      const sql = `UPDATE "${resolvedTable}" SET ${setClauses.join(', ')} ${whereClause}`;
      await runSql(sql, params);
      return res.json({ data, success: true });
    }

    if (action === 'delete' || action === 'bulk_delete') {
      if (Array.isArray(req.body.ids) && req.body.ids.length > 0) {
        const ids = req.body.ids.map(String);
        const colRows = await getAll<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
          [resolvedTable]
        );
        const colNames = new Set(colRows.map((c) => c.column_name));
        const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(', ');
        const conds: string[] = [];
        if (colNames.has('id')) conds.push(`id::text IN (${placeholders})`);
        if (colNames.has('uid')) conds.push(`uid::text IN (${placeholders})`);
        if (colNames.has('inv_id')) conds.push(`inv_id::text IN (${placeholders})`);
        if (conds.length === 0) {
          return res.status(400).json({ error: 'У таблицы нет поддерживаемого ключевого столбца для удаления' });
        }
        const sql = `DELETE FROM "${resolvedTable}" WHERE ${conds.join(' OR ')}`;
        await runSql(sql, ids);
        return res.json({ success: true, count: ids.length });
      }

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];
      let pIdx = 1;
      if (eq && typeof eq === 'object') {
        for (const [col, val] of Object.entries(eq)) {
          if (!isSafeIdent(col)) continue;
          whereClause += ` AND "${col}" = $${pIdx++}`;
          params.push(val);
        }
      }
      const sql = `DELETE FROM "${resolvedTable}" ${whereClause}`;
      await runSql(sql, params);
      return res.json({ success: true });
    }

    res.status(400).json({ error: 'Неизвестное действие' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
