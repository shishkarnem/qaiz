import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import {
  getAll,
  getOne,
  runSql,
  performDailyDatabaseBackup,
  recalculateAllUserBalances,
  recalculateUserBalancesFromTransactions,
  syncScoringFromSettingsToRules,
  syncScoringFromRulesToSettings,
  maskSecret,
  isSensitiveSettingKey,
  getSystemSettingAsync,
  setSystemSetting,
  formatRuDate,
} from '../db';
import { mcpCall, pgOne, pgQuery } from '../pg';
import { sendTelegramTransactionNotification } from '../telegramNotifier';
import { requireSuperAdmin } from '../authMiddleware';
import { getModerationConfig, moderateChatMessage } from '../function763Moderation';
import { APP_VERSION, APP_VERSION_DATE } from '../../shared/version';
import { runWeeklyInactivityReminders } from '../cron';
import { getDirectFileUrlMap, replaceFilePathWithMap } from './files';

export const adminSystemRouter = Router();

function isSafeIdent(ident: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident);
}

async function deleteAllTableRows(tableName: string): Promise<void> {
  if (!isSafeIdent(tableName)) {
    throw new Error(`Недопустимое имя таблицы: ${tableName}`);
  }
  await pgQuery(`DELETE FROM "${tableName}" WHERE 1=1`, [], { safeMode: false });
}

interface PgColMeta {
  name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  dflt_value: string | null;
  is_identity: string;
  identity_generation: string | null;
  pk: number;
}

async function getPgTableMeta(tableName: string): Promise<PgColMeta[]> {
  if (!isSafeIdent(tableName)) return [];
  return getAll<PgColMeta>(
    `SELECT
       c.column_name AS name,
       c.data_type,
       c.udt_name,
       c.is_nullable,
       c.column_default AS dflt_value,
       c.is_identity,
       c.identity_generation,
       CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS pk
     FROM information_schema.columns c
     LEFT JOIN (
       SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = 'public'
         AND tc.table_name = $1
         AND tc.constraint_type = 'PRIMARY KEY'
     ) pk ON pk.column_name = c.column_name
     WHERE c.table_schema = 'public'
       AND c.table_name = $1
     ORDER BY c.ordinal_position ASC`,
    [tableName]
  );
}

async function syncIdentitySequenceIfNeeded(tableName: string, colsMeta: PgColMeta[]): Promise<void> {
  for (const col of colsMeta) {
    if (col.is_identity === 'YES' || (col.dflt_value && col.dflt_value.includes('nextval('))) {
      try {
        await runSql(
          `SELECT setval(
             pg_get_serial_sequence($1, $2),
             COALESCE((SELECT MAX("${col.name}") FROM "${tableName}"), 1),
             EXISTS (SELECT 1 FROM "${tableName}")
           )`,
          [`public.${tableName}`, col.name]
        );
      } catch (_) {}
    }
  }
}

function coerceValueForPgColumn(val: any, colMeta: PgColMeta): any {
  if (val === undefined || val === null) return null;
  const dt = (colMeta.data_type || '').toLowerCase();
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  if (dt.includes('integer') || dt === 'bigint' || dt === 'smallint') {
    if (val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  if (dt.includes('double') || dt === 'real' || dt === 'numeric' || dt === 'decimal') {
    if (val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  if (dt === 'boolean') {
    if (typeof val === 'boolean') return val;
    if (val === 1 || val === '1' || String(val).toLowerCase() === 'true') return true;
    if (val === 0 || val === '0' || String(val).toLowerCase() === 'false') return false;
    return null;
  }
  if (dt.includes('timestamp') || dt === 'date') {
    if (val === '') return null;
  }
  return val;
}

async function persistAppVersionAndDate(
  rawVersion: string,
  rawDate?: string
): Promise<{ version: string; versionDate: string }> {
  const dbCurVer = (await getSystemSettingAsync('app_version', APP_VERSION)) || APP_VERSION;
  const dbCurDate =
    (await getSystemSettingAsync('app_version_date', APP_VERSION_DATE || formatRuDate())) ||
    APP_VERSION_DATE ||
    formatRuDate();
  const cleanVersion = String(rawVersion || dbCurVer).replace(/['"`\\]/g, '').trim() || dbCurVer;
  const cleanDate = String(rawDate || dbCurDate).replace(/['"`\\]/g, '').trim() || dbCurDate;

  await setSystemSetting('app_version', cleanVersion, false);
  await setSystemSetting('app_version_date', cleanDate, false);

  try {
    const versionFilePath = path.join(process.cwd(), 'src', 'shared', 'version.ts');
    const fileContent = `// Автоматически синхронизируемая версия платформы КвИИз (берется из базы данных system_settings)\nexport const APP_VERSION = '${cleanVersion}';\nexport const APP_VERSION_DATE = '${cleanDate}';\n`;
    fs.writeFileSync(versionFilePath, fileContent, 'utf8');
  } catch (fileErr) {
    console.error('Failed to write src/shared/version.ts:', fileErr);
  }

  return { version: cleanVersion, versionDate: cleanDate };
}

// Apply super admin security barrier to all adminSystem routes
adminSystemRouter.use(requireSuperAdmin);

// Helper to convert rows to CSV format
function arrayToCsv(rows: any[], columns?: string[]): string {
  if (!rows || rows.length === 0) {
    if (columns && columns.length > 0) {
      return '\uFEFF' + columns.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';
    }
    return '';
  }

  const cols = columns && columns.length > 0 ? columns : Object.keys(rows[0]);
  const headerRow = cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');

  const dataRows = rows.map((row) => {
    return cols
      .map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return '""';
        if (typeof val === 'object') {
          const str = JSON.stringify(val);
          return `"${str.replace(/"/g, '""')}"`;
        }
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  return '\uFEFF' + [headerRow, ...dataRows].join('\n');
}

// Helper to parse CSV/TSV format (supports UTF-8 BOM, multi-line quoted fields, comma/semicolon/tab delimiters, and optional schema column fallback)
function parseCsv(csvText: string, schemaColumns?: string[]): { columns: string[]; rows: any[] } {
  const cleanText = String(csvText || '').replace(/^\uFEFF/, '').trim();
  if (!cleanText) return { columns: [], rows: [] };

  let delimiter = ',';
  const firstLineEnd = cleanText.indexOf('\n');
  const firstLine = firstLineEnd >= 0 ? cleanText.slice(0, firstLineEnd) : cleanText;
  let commaCount = 0;
  let semiCount = 0;
  let tabCount = 0;
  let inQ = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') inQ = !inQ;
    else if (!inQ) {
      if (ch === ',') commaCount++;
      else if (ch === ';') semiCount++;
      else if (ch === '\t') tabCount++;
    }
  }
  if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = '\t';
  } else if (semiCount > commaCount) {
    delimiter = ';';
  }

  const parsedRows: string[][] = [];
  let currentRow: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    if (char === '"') {
      if (inQuotes && cleanText[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(cur);
      cur = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && cleanText[i + 1] === '\n') {
        i++;
      }
      currentRow.push(cur);
      if (currentRow.some((cell) => cell.trim().length > 0)) {
        parsedRows.push(currentRow);
      }
      currentRow = [];
      cur = '';
    } else {
      cur += char;
    }
  }
  currentRow.push(cur);
  if (currentRow.some((cell) => cell.trim().length > 0)) {
    parsedRows.push(currentRow);
  }

  if (parsedRows.length === 0) return { columns: [], rows: [] };

  const cleanHeaderCell = (h: string) =>
    String(h || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/^["']+|["']+$/g, '')
      .trim();

  let headers = parsedRows[0].map(cleanHeaderCell);
  let startRowIndex = 1;

  if (schemaColumns && schemaColumns.length > 0) {
    const schemaLowerSet = new Set(schemaColumns.map((c) => c.toLowerCase()));
    const hasMatchingHeader = headers.some((h) => h && schemaLowerSet.has(h.toLowerCase()));
    if (!hasMatchingHeader) {
      headers = [...schemaColumns];
      startRowIndex = 0;
    }
  }

  const rows: any[] = [];

  for (let i = startRowIndex; i < parsedRows.length; i++) {
    const vals = parsedRows[i];
    if (vals.length === 0) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      let raw: any = idx < vals.length ? vals[idx] : null;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (raw === '' || trimmed.toLowerCase() === 'null') {
          raw = null;
        } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            raw = JSON.parse(trimmed);
          } catch (_) {}
        }
      }
      obj[h] = raw;
    });
    rows.push(obj);
  }

  return { columns: headers.filter(Boolean), rows };
}

// Universal parser for table import: accepts CSV, TSV, JSON array, single-table JSON, or full DB backup JSON
function parseTableImportPayload(rawInput: any, tableName: string, schemaColumns: string[]): any[] {
  if (!rawInput) return [];
  if (Array.isArray(rawInput)) {
    return rawInput.filter((r) => r && typeof r === 'object');
  }

  const text = String(rawInput || '').replace(/^\uFEFF/, '').trim();
  if (!text) return [];

  const targetLower = tableName.toLowerCase();

  const looksLikeJson =
    text.startsWith('[') || text.startsWith('{') || /^"[^"]+"\s*:\s*\[/.test(text);

  if (looksLikeJson) {
    try {
      const normalizedJsonText = /^"[^"]+"\s*:\s*\[/.test(text)
        ? `{${text.replace(/,\s*$/, '')}}`
        : text;
      const parsed = JSON.parse(normalizedJsonText);
      if (Array.isArray(parsed)) {
        return parsed.filter((r) => r && typeof r === 'object');
      }
      if (parsed && typeof parsed === 'object') {
        const rawBody = parsed.backupData || parsed;
        if (rawBody.tables && typeof rawBody.tables === 'object') {
          const matchKey = Object.keys(rawBody.tables).find((k) => k.toLowerCase() === targetLower);
          if (matchKey && Array.isArray(rawBody.tables[matchKey])) {
            return rawBody.tables[matchKey];
          }
        }
        const directKey = Object.keys(rawBody).find((k) => k.toLowerCase() === targetLower);
        if (directKey && Array.isArray(rawBody[directKey])) {
          return rawBody[directKey];
        }
        if (Array.isArray(rawBody.rows)) {
          return rawBody.rows;
        }
        if (Array.isArray(rawBody.data)) {
          return rawBody.data;
        }
        const arrayValues = Object.values(rawBody).filter((v) => Array.isArray(v)) as any[][];
        if (arrayValues.length === 1) {
          return arrayValues[0];
        }
        const schemaLowerSet = new Set(schemaColumns.map((c) => c.toLowerCase()));
        if (Object.keys(rawBody).some((k) => schemaLowerSet.has(k.toLowerCase()))) {
          return [rawBody];
        }
      }
    } catch (_) {}
  }

  const { rows } = parseCsv(text, schemaColumns);
  return rows;
}

// Upsert a single row cleanly into PostgreSQL using table metadata
async function upsertPgRow(
  tableName: string,
  row: Record<string, any>,
  colsMeta: PgColMeta[],
  pkCols: string[]
): Promise<void> {
  const colMetaMap = new Map(colsMeta.map((c) => [c.name, c]));
  const rowCols = Object.keys(row).filter((c) => colMetaMap.has(c));
  if (rowCols.length === 0) return;

  const hasExplicitAlwaysIdentity = rowCols.some((c) => {
    const m = colMetaMap.get(c);
    return m?.is_identity === 'YES' && m?.identity_generation === 'ALWAYS';
  });

  const rowVals = rowCols.map((c) => coerceValueForPgColumn(row[c], colMetaMap.get(c)!));
  const placeholders = rowCols.map((_, idx) => `$${idx + 1}`).join(', ');
  const colList = rowCols.map((c) => `"${c}"`).join(', ');
  const overrideClause = hasExplicitAlwaysIdentity ? ' OVERRIDING SYSTEM VALUE' : '';

  const validConflictCols = pkCols.filter((pk) => rowCols.includes(pk));
  let conflictClause = '';
  if (validConflictCols.length > 0) {
    const nonPkCols = rowCols.filter((c) => !validConflictCols.includes(c));
    const target = validConflictCols.map((c) => `"${c}"`).join(', ');
    if (nonPkCols.length > 0) {
      const updates = nonPkCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
      conflictClause = ` ON CONFLICT (${target}) DO UPDATE SET ${updates}`;
    } else {
      conflictClause = ` ON CONFLICT (${target}) DO NOTHING`;
    }
  }

  const sql = `INSERT INTO "${tableName}" (${colList})${overrideClause} VALUES (${placeholders})${conflictClause}`;
  await runSql(sql, rowVals);
}

interface BatchUpsertResult {
  processedCount: number;
  failedCount: number;
  sampleErrors: string[];
}

// Fast batched multi-row PostgreSQL upsert (groups identical schemas in chunks of 35 rows)
async function upsertPgRowsBatch(
  tableName: string,
  rows: Record<string, any>[],
  colsMeta: PgColMeta[],
  pkCols: string[]
): Promise<BatchUpsertResult> {
  if (!rows || rows.length === 0) {
    return { processedCount: 0, failedCount: 0, sampleErrors: [] };
  }
  const colMetaMap = new Map(colsMeta.map((c) => [c.name, c]));

  // Group rows by sorted exact column signature so multi-VALUES INSERT matches every row cleanly
  const groups = new Map<string, { cols: string[]; rows: Record<string, any>[] }>();
  for (const row of rows) {
    const cols = Object.keys(row)
      .filter((c) => colMetaMap.has(c))
      .sort();
    if (cols.length === 0) continue;
    const sig = cols.join('|');
    let grp = groups.get(sig);
    if (!grp) {
      grp = { cols, rows: [] };
      groups.set(sig, grp);
    }
    grp.rows.push(row);
  }

  const CHUNK_SIZE = 35;
  let totalProcessed = 0;
  let totalFailed = 0;
  const sampleErrors: string[] = [];

  for (const { cols, rows: grpRows } of groups.values()) {
    const hasExplicitAlwaysIdentity = cols.some((c) => {
      const m = colMetaMap.get(c);
      return m?.is_identity === 'YES' && m?.identity_generation === 'ALWAYS';
    });
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const overrideClause = hasExplicitAlwaysIdentity ? ' OVERRIDING SYSTEM VALUE' : '';
    const validConflictCols = pkCols.filter((pk) => cols.includes(pk));

    let conflictClause = '';
    if (validConflictCols.length > 0) {
      const nonPkCols = cols.filter((c) => !validConflictCols.includes(c));
      const target = validConflictCols.map((c) => `"${c}"`).join(', ');
      if (nonPkCols.length > 0) {
        const updates = nonPkCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
        conflictClause = ` ON CONFLICT (${target}) DO UPDATE SET ${updates}`;
      } else {
        conflictClause = ` ON CONFLICT (${target}) DO NOTHING`;
      }
    }

    for (let i = 0; i < grpRows.length; i += CHUNK_SIZE) {
      let chunk = grpRows.slice(i, i + CHUNK_SIZE);

      // Deduplicate by primary key within the same INSERT VALUES batch (PG disallows updating the same row twice in one statement)
      if (validConflictCols.length > 0) {
        const deduped = new Map<string, Record<string, any>>();
        for (const r of chunk) {
          const pkKey = validConflictCols.map((c) => String(r[c] ?? '')).join('::');
          deduped.set(pkKey, r);
        }
        chunk = Array.from(deduped.values());
      }

      const params: any[] = [];
      const tupleSql: string[] = [];
      let pIdx = 1;

      for (const r of chunk) {
        const rowPlaceholders: string[] = [];
        for (const c of cols) {
          params.push(coerceValueForPgColumn(r[c], colMetaMap.get(c)!));
          rowPlaceholders.push(`$${pIdx++}`);
        }
        tupleSql.push(`(${rowPlaceholders.join(', ')})`);
      }

      const batchSql = `INSERT INTO "${tableName}" (${colList})${overrideClause} VALUES ${tupleSql.join(', ')}${conflictClause}`;
      try {
        await runSql(batchSql, params);
        totalProcessed += chunk.length;
      } catch (_batchErr) {
        // Fallback to single-row upsert for this chunk so a secondary unique constraint never blocks the rest
        for (const r of chunk) {
          try {
            await upsertPgRow(tableName, r, colsMeta, pkCols);
            totalProcessed++;
          } catch (rowErr: any) {
            totalFailed++;
            const msg = `${tableName}: ${rowErr?.message || rowErr}`;
            console.warn('[Restore Batch Warning]', msg);
            if (sampleErrors.length < 10) {
              sampleErrors.push(msg);
            }
          }
        }
      }
    }
  }

  return { processedCount: totalProcessed, failedCount: totalFailed, sampleErrors };
}

// GET all tables with exact row count in a single PostgreSQL query
adminSystemRouter.get('/tables', async (_req, res) => {
  try {
    const rawTables = await getAll<{ name: string }>(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name ASC`
    );

    const safeNames = rawTables.map((t) => t.name).filter((name) => isSafeIdent(name));
    if (safeNames.length === 0) {
      return res.json({ tables: [] });
    }

    const unionParts = safeNames.map(
      (name) => `SELECT '${name}' AS name, (SELECT COUNT(*)::int FROM "${name}") AS "rowCount"`
    );
    const countRows = await getAll<{ name: string; rowCount: number }>(
      unionParts.join(' UNION ALL ')
    );

    const countMap = new Map(countRows.map((r) => [r.name, Number(r.rowCount || 0)]));
    const tables = safeNames.map((name) => ({
      name,
      rowCount: countMap.get(name) ?? 0,
    }));

    res.json({ tables });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET specific table columns & rows
adminSystemRouter.get('/table/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    if (!isSafeIdent(tableName)) {
      return res.status(400).json({ error: 'Некорректное имя таблицы' });
    }

    const limitQuery = req.query.limit as string;
    let rows: any[] = [];
    if (limitQuery && limitQuery !== 'all' && limitQuery !== '-1') {
      const limit = parseInt(limitQuery, 10);
      if (!isNaN(limit) && limit > 0) {
        rows = await getAll(`SELECT * FROM "${tableName}" LIMIT $1`, [limit]);
      } else {
        rows = await getAll(`SELECT * FROM "${tableName}"`);
      }
    } else {
      rows = await getAll(`SELECT * FROM "${tableName}"`);
    }

    const meta = await getPgTableMeta(tableName);
    const columns = meta.length > 0 ? meta.map((col) => col.name) : rows.length > 0 ? Object.keys(rows[0]) : [];

    const lowerTable = tableName.toLowerCase();
    const safeRows = rows.map((r: any) => {
      if (!r || typeof r !== 'object') return r;
      const copy = { ...r };
      for (const k of Object.keys(copy)) {
        const lk = k.toLowerCase();
        if (
          lk.includes('token') ||
          lk.includes('secret') ||
          lk.includes('api_key') ||
          lk === 'password' ||
          lk === 'password_hash'
        ) {
          if (copy[k]) copy[k] = maskSecret(String(copy[k]));
        }
      }
      if (lowerTable === 'system_settings' && copy.key && isSensitiveSettingKey(String(copy.key)) && copy.value) {
        copy.value = maskSecret(String(copy.value));
      }
      return copy;
    });

    res.json({ tableName, columns, rows: safeRows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Protected balance columns in users table
const BALANCE_COLUMNS = new Set([
  'balance',
  'balance_free',
  'balance_ref',
  'balance_start',
  'balance_admin',
  'balance_pay',
  'balance_author',
  'balance_out',
  'balance_gift',
  'balance_time',
  'balance_point',
  'ballance_point',
]);

// Helper for update
const updateRowHandler = async (req: any, res: any) => {
  try {
    const { tableName, id } = req.params;
    if (!isSafeIdent(tableName)) {
      return res.status(400).json({ error: 'Некорректное имя таблицы' });
    }
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Данные обязательны' });
    }

    if (tableName.toLowerCase() === 'users') {
      const attemptedBalanceCols = Object.keys(data).filter((k) => BALANCE_COLUMNS.has(k.toLowerCase()));
      if (attemptedBalanceCols.length > 0) {
        return res.status(400).json({
          error: `Прямое редактирование колонок баланса (${attemptedBalanceCols.join(', ')}) в таблице users запрещено. Пожалуйста, используйте модальное окно «Корректировка баланса» администратора с вводом комментария для создания записи в transactions.`,
        });
      }
    }

    const colsMeta = await getPgTableMeta(tableName);
    const colMetaMap = new Map(colsMeta.map((c) => [c.name, c]));

    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;
    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'uid' && isSafeIdent(key) && colMetaMap.has(key)) {
        if (typeof value === 'string' && value.includes('•')) {
          continue; // Never overwrite real tokens/secrets with masked placeholders
        }
        setClauses.push(`"${key}" = $${pIdx++}`);
        params.push(coerceValueForPgColumn(value, colMetaMap.get(key)!));
      }
    }

    if (setClauses.length > 0) {
      const pkCol =
        colsMeta.find((c) => c.pk > 0)?.name ||
        (colMetaMap.has('id') ? 'id' : colMetaMap.has('uid') ? 'uid' : colsMeta[0]?.name || 'id');
      const hasId = colMetaMap.has('id');
      const hasUid = colMetaMap.has('uid');

      if (hasId && hasUid) {
        params.push(String(id), String(id));
        await runSql(
          `UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE id::text = $${pIdx++} OR uid::text = $${pIdx++}`,
          params
        );
      } else {
        params.push(String(id));
        await runSql(`UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE "${pkCol}"::text = $${pIdx++}`, params);
      }

      // Auto-sync bidirectional scoring tables if modified
      const lowerTable = tableName.toLowerCase();
      if (lowerTable === 'game_scoring_settings') {
        await syncScoringFromSettingsToRules(id);
      } else if (lowerTable === 'game_scoring_rules') {
        await syncScoringFromRulesToSettings(id);
      } else if (lowerTable === 'system_settings') {
        const targetKey = String(data.key || id || '').trim();
        if (targetKey === 'app_version' && data.value !== undefined) {
          await persistAppVersionAndDate(String(data.value), formatRuDate());
          try {
            await performDailyDatabaseBackup(true);
          } catch (_) {}
        } else if (targetKey === 'app_version_date' && data.value !== undefined) {
          const curVer = (await getSystemSettingAsync('app_version', APP_VERSION)) || APP_VERSION;
          await persistAppVersionAndDate(curVer, String(data.value));
          try {
            await performDailyDatabaseBackup(true);
          } catch (_) {}
        }
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// Admin balance adjustment endpoint (unified handler supporting uid / userId and comment / description)
adminSystemRouter.post('/users/adjust-balance', async (req, res) => {
  try {
    const { userId, uid, amount, comment, description, type } = req.body || {};
    const rawUid = String(uid || userId || '').trim();
    const reasonText = String(comment || description || '').trim();

    if (!rawUid || amount === undefined || !reasonText) {
      return res.status(400).json({ error: 'Пожалуйста, укажите UID пользователя, сумму и комментарий (причину).' });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount === 0) {
      return res.status(400).json({ error: 'Сумма корректировки должна быть ненулевым числом.' });
    }

    const user = await getOne<{ id: string; uid: string; display_name?: string }>(
      'SELECT id, uid, display_name FROM users WHERE uid = $1 OR id = $1 OR telegram_id::text = $1 LIMIT 1',
      [rawUid]
    );

    if (!user) {
      return res.status(404).json({ error: 'Пользователь с указанным UID не найден.' });
    }

    const targetUid = user.uid || user.id;
    const txId = `tx_admin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const txType = type || 'admin';
    const desc = `Корректировка администратора: ${reasonText}`;
    const ts = Date.now();

    await runSql(
      `INSERT INTO transactions (id, user_id, amount, currency, type, description, reference_id, timestamp, created_at)
       VALUES ($1, $2, $3, 'ИИкр', $4, $5, 'admin_manual', $6, NOW())`,
      [txId, targetUid, numAmount, txType, desc, ts]
    );

    const newBalance = await recalculateUserBalancesFromTransactions(targetUid);

    sendTelegramTransactionNotification(targetUid, {
      id: txId,
      amount: numAmount,
      currency: 'ИИкр',
      type: txType,
      description: desc,
      timestamp: ts,
    }).catch((err) => console.error('Telegram notification error:', err));

    const updatedUser = await getOne('SELECT * FROM users WHERE uid = $1 OR id = $1 LIMIT 1', [targetUid]);
    if (updatedUser) {
      delete updatedUser.password;
      delete updatedUser.password_hash;
    }

    res.json({
      success: true,
      message: `Баланс успешно скорректирован на ${numAmount > 0 ? `+${numAmount}` : numAmount} ИИкр. Текущий баланс: ${newBalance} ИИкр`,
      transaction_id: txId,
      balance: newBalance,
      user: updatedUser,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE table row (both paths)
adminSystemRouter.put('/table/:tableName/row/:id', updateRowHandler);
adminSystemRouter.put('/table/:tableName/:id', updateRowHandler);

// Helper for delete
const deleteRowHandler = async (req: any, res: any) => {
  try {
    const { tableName, id } = req.params;
    if (!isSafeIdent(tableName)) {
      return res.status(400).json({ error: 'Некорректное имя таблицы' });
    }
    const colsMeta = await getPgTableMeta(tableName);
    const pkCol =
      colsMeta.find((c) => c.pk > 0)?.name ||
      (colsMeta.some((c) => c.name === 'id')
        ? 'id'
        : colsMeta.some((c) => c.name === 'uid')
        ? 'uid'
        : colsMeta[0]?.name || 'id');
    const hasId = colsMeta.some((c) => c.name === 'id');
    const hasUid = colsMeta.some((c) => c.name === 'uid');

    if (hasId && hasUid) {
      await runSql(`DELETE FROM "${tableName}" WHERE id::text = $1 OR uid::text = $2`, [String(id), String(id)]);
    } else {
      await runSql(`DELETE FROM "${tableName}" WHERE "${pkCol}"::text = $1`, [String(id)]);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// Helper for bulk/batch delete
const bulkDeleteHandler = async (req: any, res: any) => {
  try {
    const { tableName } = req.params;
    if (!isSafeIdent(tableName)) {
      return res.status(400).json({ error: 'Некорректное имя таблицы' });
    }
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Список ID для удаления обязателен' });
    }

    const strIds = ids.map(String);
    const colsMeta = await getPgTableMeta(tableName);
    const pkCol =
      colsMeta.find((c) => c.pk > 0)?.name ||
      (colsMeta.some((c) => c.name === 'id')
        ? 'id'
        : colsMeta.some((c) => c.name === 'uid')
        ? 'uid'
        : colsMeta[0]?.name || 'id');

    const hasId = colsMeta.some((c) => c.name === 'id');
    const hasUid = colsMeta.some((c) => c.name === 'uid');

    const placeholders = strIds.map((_, idx) => `$${idx + 1}`).join(', ');
    let sql = '';

    if (hasId && hasUid) {
      sql = `DELETE FROM "${tableName}" WHERE id::text IN (${placeholders}) OR uid::text IN (${placeholders})`;
    } else {
      sql = `DELETE FROM "${tableName}" WHERE "${pkCol}"::text IN (${placeholders})`;
    }

    await runSql(sql, strIds);
    res.json({ success: true, count: strIds.length, deletedIds: ids });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE table row (both paths)
adminSystemRouter.delete('/table/:tableName/row/:id', deleteRowHandler);
adminSystemRouter.delete('/table/:tableName/:id', deleteRowHandler);

// BULK DELETE table rows
adminSystemRouter.post('/table/:tableName/bulk-delete', bulkDeleteHandler);
adminSystemRouter.post('/table/:tableName/rows/delete', bulkDeleteHandler);
adminSystemRouter.delete('/table/:tableName/bulk', bulkDeleteHandler);

// Helper for insert
const insertRowHandler = async (req: any, res: any) => {
  try {
    const { tableName } = req.params;
    if (!isSafeIdent(tableName)) {
      return res.status(400).json({ error: 'Некорректное имя таблицы' });
    }
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Данные обязательны' });
    }

    const colsMeta = await getPgTableMeta(tableName);
    const colMetaMap = new Map(colsMeta.map((c) => [c.name, c]));

    const keys = Object.keys(data).filter((k) => isSafeIdent(k) && colMetaMap.has(k));
    if (keys.length === 0) {
      return res.status(400).json({ error: 'Пустой объект или несовпадающие колонки' });
    }

    const filteredKeys = keys.filter((k) => {
      const m = colMetaMap.get(k);
      if (m?.is_identity === 'YES' && m?.identity_generation === 'ALWAYS' && (data[k] === undefined || data[k] === null || data[k] === '')) {
        return false;
      }
      return true;
    });

    const hasExplicitAlwaysIdentity = filteredKeys.some((k) => {
      const m = colMetaMap.get(k);
      return m?.is_identity === 'YES' && m?.identity_generation === 'ALWAYS';
    });

    const quotedKeys = filteredKeys.map((k) => `"${k}"`).join(', ');
    const placeholders = filteredKeys.map((_, idx) => `$${idx + 1}`).join(', ');
    const params = filteredKeys.map((k) => coerceValueForPgColumn(data[k], colMetaMap.get(k)!));
    const overrideClause = hasExplicitAlwaysIdentity ? ' OVERRIDING SYSTEM VALUE' : '';

    const inserted = await pgOne(
      `INSERT INTO "${tableName}" (${quotedKeys})${overrideClause} VALUES (${placeholders}) RETURNING *`,
      params
    );
    if (hasExplicitAlwaysIdentity) {
      await syncIdentitySequenceIfNeeded(tableName, colsMeta);
    }

    res.json({ success: true, data: inserted || data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// INSERT new row into table (both paths)
adminSystemRouter.post('/table/:tableName/row', insertRowHandler);
adminSystemRouter.post('/table/:tableName', insertRowHandler);

// EXPORT CSV FOR SINGLE TABLE
adminSystemRouter.get('/export/csv/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    if (!isSafeIdent(tableName)) {
      return res.status(400).json({ error: 'Некорректное имя таблицы' });
    }
    const rows = await getAll(`SELECT * FROM "${tableName}"`);
    const meta = await getPgTableMeta(tableName);
    const columns = meta.map((c) => c.name);

    const csvData = arrayToCsv(rows, columns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${tableName}.csv"`);
    res.send(csvData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// EXPORT JSON FOR SINGLE TABLE
adminSystemRouter.get('/export/json/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    if (!isSafeIdent(tableName)) {
      return res.status(400).json({ error: 'Некорректное имя таблицы' });
    }
    const rows = await getAll(`SELECT * FROM "${tableName}"`);
    const payload = {
      version: '2.0-pg',
      exportedAt: new Date().toISOString(),
      tableName,
      rowCount: rows.length,
      tables: {
        [tableName]: rows,
      },
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${tableName}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// IMPORT CSV OR JSON INTO SINGLE TABLE (Supports 3 modes: add_new, only_mismatches, replace_all)
const importSingleTableHandler = async (req: any, res: any) => {
  try {
    const { tableName } = req.params;
    if (!isSafeIdent(tableName)) {
      return res.status(400).json({ error: 'Некорректное имя таблицы' });
    }

    const rawContent =
      req.body.rows ||
      req.body.csvContent ||
      req.body.csv ||
      req.body.content ||
      req.body.json;
    const clearExisting = Boolean(req.body.clearExisting ?? req.body.clearTable ?? false);
    const rawMode = String(req.body.importMode || req.body.mode || '').trim();
    const importMode: 'add_new' | 'only_mismatches' | 'replace_all' =
      rawMode === 'replace_all' || rawMode === 'only_mismatches' || rawMode === 'add_new'
        ? rawMode
        : clearExisting
        ? 'replace_all'
        : 'add_new';

    if (!rawContent) {
      return res.status(400).json({ error: 'Содержимое для импорта обязательно (CSV или JSON)' });
    }

    const colsMeta = await getPgTableMeta(tableName);
    if (!colsMeta || colsMeta.length === 0) {
      return res.status(404).json({ error: `Таблица ${tableName} не найдена в базе данных` });
    }

    const schemaColNames = colsMeta.map((c) => c.name);
    const colInfoMap = new Map(colsMeta.map((c) => [c.name.toLowerCase(), c]));
    const pkCols = colsMeta.filter((c) => Number(c.pk) > 0).map((c) => c.name);
    const effectiveKeyCols =
      pkCols.length > 0
        ? pkCols
        : colInfoMap.has('id')
        ? ['id']
        : colInfoMap.has('uid')
        ? ['uid']
        : colInfoMap.has('key')
        ? ['key']
        : [];

    const parsedRows = parseTableImportPayload(rawContent, tableName, schemaColNames);
    if (!parsedRows || parsedRows.length === 0) {
      return res.status(400).json({
        error: `Не удалось распознать строки для импорта в таблицу ${tableName}. Проверьте формат CSV или JSON.`,
      });
    }

    const existingPasswords = new Map<string, { password?: string; password_hash?: string }>();
    if (tableName.toLowerCase() === 'users') {
      const curUsers = await getAll<any>('SELECT id, uid, password, password_hash FROM users');
      for (const u of curUsers) {
        const k = String(u.uid || u.id || '');
        if (k) existingPasswords.set(k, { password: u.password, password_hash: u.password_hash });
      }
    }

    const preparedRows: Record<string, any>[] = [];
    for (const rawRow of parsedRows) {
      if (!rawRow || typeof rawRow !== 'object') continue;
      const norm: Record<string, any> = {};

      for (const [k, v] of Object.entries(rawRow)) {
        const cleanK = String(k || '')
          .replace(/^\uFEFF/, '')
          .trim()
          .replace(/^["']+|["']+$/g, '')
          .trim()
          .toLowerCase();
        const colMeta = colInfoMap.get(cleanK);
        if (colMeta) {
          norm[colMeta.name] = v;
        }
      }

      if (Object.keys(norm).length === 0) continue;

      if (tableName.toLowerCase() === 'users') {
        if (norm.uid && !norm.id) norm.id = String(norm.uid);
        if (norm.id && !norm.uid) norm.uid = String(norm.id);
        const rowKey = String(norm.uid || norm.id || '');
        for (const c of Object.keys(norm)) {
          const v = norm[c];
          if ((c === 'telegram_id' || c === 'email' || c === 'username') && (v === '' || v === 'null')) {
            norm[c] = null;
          }
          if ((c === 'password' || c === 'password_hash') && typeof v === 'string' && v.includes('•')) {
            const prev = existingPasswords.get(rowKey);
            norm[c] = (prev as any)?.[c] ?? null;
          }
        }
      }

      if (pkCols.length === 1 && pkCols[0] === 'id') {
        const idMeta = colInfoMap.get('id');
        if (
          idMeta &&
          (idMeta.data_type || '').toLowerCase().includes('text') &&
          (norm.id === undefined || norm.id === null || String(norm.id).trim() === '')
        ) {
          norm.id = `${tableName.slice(0, 3)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        }
      }

      for (const colMeta of colsMeta) {
        const val = norm[colMeta.name];
        if (colMeta.is_identity === 'YES' && (val === null || val === undefined || val === '')) {
          delete norm[colMeta.name];
          continue;
        }
        if (val === null || val === undefined) {
          if (colMeta.is_nullable === 'NO') {
            if (colMeta.dflt_value !== null && colMeta.dflt_value !== undefined) {
              delete norm[colMeta.name];
            } else {
              const dt = (colMeta.data_type || '').toLowerCase();
              if (dt.includes('int') || dt.includes('double') || dt.includes('num') || dt === 'real') {
                norm[colMeta.name] = 0;
              } else if (dt === 'boolean') {
                norm[colMeta.name] = false;
              } else if (dt.includes('timestamp')) {
                norm[colMeta.name] = new Date().toISOString();
              } else {
                norm[colMeta.name] = '';
              }
            }
          }
        } else if (typeof val === 'object') {
          norm[colMeta.name] = JSON.stringify(val);
        }
      }

      if (Object.keys(norm).length > 0) {
        preparedRows.push(norm);
      }
    }

    if (preparedRows.length === 0) {
      return res.status(400).json({
        error: `В импортируемых данных не найдено колонок, совпадающих со структурой таблицы ${tableName}`,
      });
    }

    const existingRows = await getAll<any>(`SELECT * FROM "${tableName}"`);
    const normalizeCompareVal = (v: any): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v).trim();
    };

    const getRowKeyStr = (r: Record<string, any>): string => {
      if (effectiveKeyCols.length === 0) return '';
      const parts = effectiveKeyCols.map((k) => normalizeCompareVal(r[k]));
      if (parts.every((p) => p === '')) return '';
      return parts.join('::');
    };

    const existingByKey = new Map<string, any>();
    for (const ex of existingRows) {
      const k = getRowKeyStr(ex);
      if (k) existingByKey.set(k, ex);
    }

    const isRowMatchingExisting = (incoming: Record<string, any>, existing: Record<string, any>): boolean => {
      const cols = Object.keys(incoming);
      if (cols.length === 0) return false;
      return cols.every((c) => normalizeCompareVal(incoming[c]) === normalizeCompareVal(existing[c]));
    };

    let skipped = 0;

    if (importMode === 'replace_all') {
      await deleteAllTableRows(tableName);
    }

    const rowsToUpsert: Record<string, any>[] = [];
    for (const row of preparedRows) {
      const rowCols = Object.keys(row);
      if (rowCols.length === 0) continue;

      const rKey = getRowKeyStr(row);

      if (importMode === 'only_mismatches') {
        if (rKey && existingByKey.has(rKey)) {
          const ex = existingByKey.get(rKey);
          if (isRowMatchingExisting(row, ex)) {
            skipped++;
            continue;
          }
        } else {
          const nonPkCols = rowCols.filter((c) => !effectiveKeyCols.includes(c));
          if (nonPkCols.length > 0) {
            const fullMatch = existingRows.find((ex) =>
              nonPkCols.every((c) => normalizeCompareVal(row[c]) === normalizeCompareVal(ex[c]))
            );
            if (fullMatch) {
              skipped++;
              continue;
            }
          }
        }
      }

      rowsToUpsert.push(row);
    }

    const batchResult = await upsertPgRowsBatch(
      tableName,
      rowsToUpsert,
      colsMeta,
      pkCols.length > 0 ? pkCols : effectiveKeyCols
    );
    const inserted = batchResult.processedCount;

    await syncIdentitySequenceIfNeeded(tableName, colsMeta);

    if (tableName.toLowerCase() === 'transactions') {
      try {
        await recalculateAllUserBalances();
      } catch (_) {}
    }
    try {
      await performDailyDatabaseBackup(true);
    } catch (_) {}

    const modeTitle =
      importMode === 'replace_all'
        ? 'Заменить все'
        : importMode === 'only_mismatches'
        ? 'Только несовпадения'
        : 'Добавить новые';

    res.json({
      success: true,
      mode: importMode,
      count: inserted,
      importedCount: inserted,
      skippedCount: skipped,
      totalRowsInPayload: preparedRows.length,
      message:
        importMode === 'only_mismatches'
          ? `Импорт (${modeTitle}) в ${tableName}: добавлено/обновлено ${inserted}, пропущено совпадений ${skipped}`
          : `Успешно импортировано (${modeTitle}) ${inserted} записей в таблицу ${tableName}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

adminSystemRouter.post('/import/csv/:tableName', importSingleTableHandler);
adminSystemRouter.post('/import/:tableName', importSingleTableHandler);

// EXPORT ALL TABLES AS ZIP ARCHIVE (CSVs)
adminSystemRouter.get('/export/zip', async (_req, res) => {
  try {
    const rawTables = await getAll<{ name: string }>(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name ASC`
    );

    const zip = new JSZip();

    for (const t of rawTables) {
      if (!isSafeIdent(t.name)) continue;
      const rows = await getAll(`SELECT * FROM "${t.name}"`);
      const meta = await getPgTableMeta(t.name);
      const columns = meta.map((c) => c.name);
      const csv = arrayToCsv(rows, columns);
      zip.file(`${t.name}.csv`, csv);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const dateStr = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="qaiz_all_tables_${dateStr}.zip"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// EXPORT FULL DATABASE BACKUP AS JSON (both paths)
const exportJsonBackupHandler = async (_req: any, res: any) => {
  try {
    const rawTables = await getAll<{ name: string }>(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name ASC`
    );

    const backupTables: Record<string, any[]> = {};
    for (const t of rawTables) {
      if (!isSafeIdent(t.name)) continue;
      backupTables[t.name] = await getAll(`SELECT * FROM "${t.name}"`);
    }

    const backupPayload = {
      version: '2.0-pg',
      exportedAt: new Date().toISOString(),
      tablesCount: rawTables.length,
      tables: backupTables,
    };

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="qaiz_db_backup_${dateStr}.json"`);
    res.send(JSON.stringify(backupPayload, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

adminSystemRouter.get('/backup/json/export', exportJsonBackupHandler);
adminSystemRouter.get('/backup/json', exportJsonBackupHandler);

// FETCH JSON BACKUP FROM EXTERNAL URL (Server-side proxy to avoid CORS)
const fetchBackupFromUrlHandler = async (req: any, res: any) => {
  try {
    const rawUrl = String(req.body?.url || req.query?.url || '').trim();
    if (!rawUrl || (!rawUrl.startsWith('https://') && !rawUrl.startsWith('http://'))) {
      return res.status(400).json({ error: 'Укажите корректную http/https ссылку на файл .json' });
    }
    const upstream = await fetch(rawUrl, { signal: AbortSignal.timeout(45000) });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Ошибка загрузки файла (${upstream.status})` });
    }
    const text = await upstream.text();
    const parsed = JSON.parse(text);
    return res.json({ success: true, backup: parsed, rawSize: text.length });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Не удалось загрузить или распарсить JSON по ссылке' });
  }
};

adminSystemRouter.post('/backup/json/fetch-url', fetchBackupFromUrlHandler);
adminSystemRouter.post('/backup/fetch-url', fetchBackupFromUrlHandler);

const LEGACY_FOLDER_DEFAULTS: Array<{ legacyId: string; id: number; name: string; color: string }> = [
  { legacyId: 'fld_images', id: 1, name: 'Изображения', color: '#E7C768' },
  { legacyId: 'fld_audio', id: 2, name: 'Аудиозаписи', color: '#E7C768' },
  { legacyId: '3', id: 3, name: 'Голосовые', color: '#E7C768' },
  { legacyId: 'fld_video', id: 4, name: 'Видеоролики', color: '#E7C768' },
  { legacyId: 'fld_docs', id: 5, name: 'Документы', color: '#E7C768' },
  { legacyId: 'fld_a8c4bb4cd0fbe665', id: 6, name: 'Для Сайта', color: '#E7C768' },
  { legacyId: 'folder_sounds', id: 7, name: 'Звуки', color: '#E7C768' },
  { legacyId: 'chat_media', id: 8, name: 'Медиа чатов', color: '#E7C768' },
  { legacyId: 'avatars', id: 9, name: 'Аватары', color: '#E7C768' },
];

function resolveLegacyFolderNumericId(rawId: any, customMap?: Map<string, number>): number | null {
  if (rawId === null || rawId === undefined || rawId === '') return null;
  const str = String(rawId).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    const n = Number(str);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  if (customMap && customMap.has(str)) {
    return customMap.get(str)!;
  }
  const preset = LEGACY_FOLDER_DEFAULTS.find((f) => f.legacyId === str);
  if (preset) return preset.id;
  // Deterministic positive hash fallback for unknown legacy string folder IDs
  let hash = 100;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % 900000;
  }
  return 1000 + hash;
}

// RESTORE FULL DATABASE BACKUP FROM JSON (PostgreSQL Batched)
const restoreJsonBackupHandler = async (req: any, res: any) => {
  try {
    const rawBody = req.body.backupData || req.body;
    if (!rawBody || typeof rawBody !== 'object') {
      return res.status(400).json({ error: 'Невалидный формат файла бэкапа JSON' });
    }

    const existingTablesRows = await getAll<{ name: string }>(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const existingTablesSet = new Set(existingTablesRows.map((t) => t.name));

    const priorityOrder = (name: string): number => {
      const lower = name.toLowerCase();
      if (lower === 'file_folders') return 5;
      if (lower === 'file_storage') return 10;
      if (lower === 'multiplayer_rooms') return 15;
      if (lower === 'multiplayer_participants') return 20;
      if (lower === 'transactions') return 25;
      if (lower === 'notifications') return 90;
      if (lower === 'users') return 95;
      return 50;
    };

    // Fast pre-clear step for chunked replace_all restores (deletes child tables before parent tables and keeps active superadmin row intact!)
    if (req.body?.prepareReplaceAll && Array.isArray(req.body?.tableNames)) {
      const activeAdminUid = String((req as any).adminUser?.uid || (req as any).adminUser?.id || '10016926299');
      const requestedNames = Array.from(new Set(req.body.tableNames as string[]));
      const skippedTables = requestedNames.filter((n) => typeof n === 'string' && !existingTablesSet.has(n));
      const targetNames = requestedNames.filter((n) => typeof n === 'string' && existingTablesSet.has(n) && isSafeIdent(n));

      const parentNames = new Set(['file_folders', 'multiplayer_rooms', 'users']);
      const childNames = targetNames.filter((n) => !parentNames.has(n.toLowerCase()));

      // Tier 1: Delete child/independent tables in parallel chunks of 8
      for (let i = 0; i < childNames.length; i += 8) {
        const batch = childNames.slice(i, i + 8);
        await Promise.all(batch.map((tbl) => deleteAllTableRows(tbl)));
      }

      // Tier 2: Clear self-references and delete parent tables safely
      const tier2Ops: Promise<any>[] = [];
      if (targetNames.some((n) => n.toLowerCase() === 'file_folders')) {
        tier2Ops.push(
          runSql(`UPDATE "file_folders" SET parent_id = NULL WHERE parent_id IS NOT NULL`).then(() =>
            deleteAllTableRows('file_folders')
          )
        );
      }
      if (targetNames.some((n) => n.toLowerCase() === 'multiplayer_rooms')) {
        tier2Ops.push(deleteAllTableRows('multiplayer_rooms'));
      }
      if (targetNames.some((n) => n.toLowerCase() === 'users')) {
        // Keep the currently authenticated Super Admin row during slice restoration so requireSuperAdmin never rejects subsequent slices
        tier2Ops.push(
          runSql(`DELETE FROM "users" WHERE COALESCE(uid, '') <> $1 AND COALESCE(id, '') <> $1`, [activeAdminUid])
        );
      }
      if (tier2Ops.length > 0) {
        await Promise.all(tier2Ops);
      }

      return res.json({
        success: true,
        clearedTables: targetNames.length,
        skippedTables,
        message: `Подготовка: очищено ${targetNames.length} таблиц`,
      });
    }

    const tables: Record<string, any[]> =
      rawBody.tables && typeof rawBody.tables === 'object'
        ? rawBody.tables
        : rawBody.tableName && Array.isArray(rawBody.rows)
        ? { [rawBody.tableName]: rawBody.rows }
        : rawBody;

    const IGNORED_META_KEYS = new Set([
      'partial',
      'finalize',
      'skipDeleteOnPartial',
      'prepareReplaceAll',
      'tableNames',
      'restoreMode',
      'importMode',
      'mode',
      'version',
      'exportedAt',
      'tablesCount',
      'meta',
    ]);

    const rawEntries = Object.entries(tables).filter(
      ([key, rows]) => !IGNORED_META_KEYS.has(key) && Array.isArray(rows)
    );
    if (rawEntries.length === 0) {
      return res.status(400).json({ error: 'В файле бэкапа JSON не найдено таблиц с массивами записей' });
    }

    const rawMode = String(req.body?.restoreMode || req.body?.importMode || req.body?.mode || 'replace_all').trim();
    const restoreMode: 'add_new' | 'only_mismatches' | 'replace_all' =
      rawMode === 'add_new' || rawMode === 'only_mismatches' || rawMode === 'replace_all'
        ? rawMode
        : 'replace_all';

    const tableEntries = [...rawEntries].sort((a, b) => priorityOrder(a[0]) - priorityOrder(b[0]));

    const isPartial = Boolean(req.body?.partial);
    const skipDeleteOnPartial = Boolean(req.body?.skipDeleteOnPartial);
    const isFinalize = req.body?.finalize !== undefined ? Boolean(req.body.finalize) : !isPartial;

    let totalRestored = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let restoredTablesCount = 0;
    const skippedTables: string[] = [];
    const sampleErrors: string[] = [];

    const tableMetaMap = new Map<string, PgColMeta[]>();
    const tableColumnsMap = new Map<string, Set<string>>();
    const tablePkColsMap = new Map<string, string[]>();
    const existingTableRowsMap = new Map<string, any[]>();

    for (const [tableName] of tableEntries) {
      if (!existingTablesSet.has(tableName) || !isSafeIdent(tableName)) {
        skippedTables.push(tableName);
        continue;
      }
      const meta = await getPgTableMeta(tableName);
      tableMetaMap.set(tableName, meta);
      const colSet = new Set(meta.map((c) => c.name));
      tableColumnsMap.set(tableName, colSet);
      const pkCols = meta.filter((c) => Number(c.pk) > 0).map((c) => c.name);
      const effectiveKeyCols =
        pkCols.length > 0
          ? pkCols
          : colSet.has('id')
          ? ['id']
          : colSet.has('uid')
          ? ['uid']
          : colSet.has('key')
          ? ['key']
          : [];
      tablePkColsMap.set(tableName, effectiveKeyCols);

      if (restoreMode === 'only_mismatches') {
        const curRows = await getAll<any>(`SELECT * FROM "${tableName}"`);
        existingTableRowsMap.set(tableName, curRows);
      }
    }

    const normalizeCompareVal = (v: any): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v).trim();
    };

    // Build file URL map & folder legacy_id -> numeric id map
    const [directFileUrlMap, currentFolders] = await Promise.all([
      getDirectFileUrlMap(),
      getAll<{ id: any; legacy_id?: string | null }>(`SELECT id, legacy_id FROM file_folders`).catch(() => []),
    ]);

    const folderLegacyToIdMap = new Map<string, number>();
    for (const def of LEGACY_FOLDER_DEFAULTS) {
      folderLegacyToIdMap.set(def.legacyId, def.id);
    }
    for (const f of currentFolders) {
      const numId = Number(f.id);
      if (Number.isFinite(numId) && f.legacy_id) {
        folderLegacyToIdMap.set(String(f.legacy_id), numId);
      }
    }

    // If non-chunked replace_all (and not already cleared in prepareReplaceAll), delete children before parents
    if (restoreMode === 'replace_all' && !skipDeleteOnPartial) {
      const activeAdminUid = String((req as any).adminUser?.uid || (req as any).adminUser?.id || '10016926299');
      const deleteOrder = [...tableEntries].reverse();
      for (const [tableName] of deleteOrder) {
        if (!tableColumnsMap.has(tableName)) continue;
        if (tableName.toLowerCase() === 'users') {
          await runSql(`DELETE FROM "users" WHERE COALESCE(uid, '') <> $1 AND COALESCE(id, '') <> $1`, [activeAdminUid]);
        } else if (tableName.toLowerCase() === 'file_folders') {
          await runSql(`UPDATE "file_folders" SET parent_id = NULL WHERE parent_id IS NOT NULL`).catch(() => {});
          await deleteAllTableRows('file_folders');
        } else {
          await deleteAllTableRows(tableName);
        }
      }
    }

    const mediaColumns = new Set(['avatar_url', 'photo_url', 'telegram_photo', 'image_url', 'file_url']);

    for (const [tableName, rows] of tableEntries) {
      const validCols = tableColumnsMap.get(tableName);
      const colsMeta = tableMetaMap.get(tableName);
      if (!validCols || validCols.size === 0 || !colsMeta) continue;

      restoredTablesCount++;
      const lowerTable = tableName.toLowerCase();

      const keyCols = tablePkColsMap.get(tableName) || [];
      const existingRows = existingTableRowsMap.get(tableName) || [];
      const existingByKey = new Map<string, any>();
      if (restoreMode === 'only_mismatches' && keyCols.length > 0) {
        for (const ex of existingRows) {
          const k = keyCols.map((c) => normalizeCompareVal(ex[c])).join('::');
          if (k) existingByKey.set(k, ex);
        }
      }

      const sanitizedBatch: Record<string, any>[] = [];

      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const rawRowCols = Object.keys(row).filter((c) => validCols.has(c));
        if (rawRowCols.length === 0) continue;

        // Normalize legacy file_folders and file_storage rows before comparison & insert
        const workingRow: Record<string, any> = { ...row };
        if (lowerTable === 'file_folders') {
          const rawId = workingRow.id;
          const resolvedId = resolveLegacyFolderNumericId(rawId, folderLegacyToIdMap);
          if (rawId !== null && rawId !== undefined && typeof rawId === 'string' && isNaN(Number(rawId))) {
            workingRow.legacy_id = workingRow.legacy_id || String(rawId);
          } else if (workingRow.legacy_id === undefined && rawId !== null && rawId !== undefined) {
            workingRow.legacy_id = String(rawId);
          }
          if (resolvedId !== null) {
            if (workingRow.legacy_id) folderLegacyToIdMap.set(String(workingRow.legacy_id), resolvedId);
            workingRow.id = resolvedId;
          }
          if (workingRow.parent_id !== undefined && workingRow.parent_id !== null) {
            workingRow.parent_id = resolveLegacyFolderNumericId(workingRow.parent_id, folderLegacyToIdMap);
          }
          if (!workingRow.name && validCols.has('name')) {
            workingRow.name = `Папка ${workingRow.id ?? ''}`.trim();
          }
          if (validCols.has('description') && !workingRow.description) {
            workingRow.description = workingRow.name;
          }
        } else if (lowerTable === 'file_storage') {
          const rawFolderId = workingRow.folder_id;
          if (rawFolderId !== null && rawFolderId !== undefined && typeof rawFolderId === 'string' && isNaN(Number(rawFolderId))) {
            if (validCols.has('folder_key') && !workingRow.folder_key) {
              workingRow.folder_key = rawFolderId;
            }
            workingRow.folder_id = resolveLegacyFolderNumericId(rawFolderId, folderLegacyToIdMap);
          } else if (workingRow.folder_id !== null && workingRow.folder_id !== undefined) {
            const parsedFid = Number(workingRow.folder_id);
            workingRow.folder_id = Number.isFinite(parsedFid) ? parsedFid : null;
          }
          if (validCols.has('filename') && (!workingRow.filename || String(workingRow.filename).trim() === '')) {
            workingRow.filename = String(workingRow.name || workingRow.file_key || `file_${workingRow.id || Date.now()}`);
          }
          if (validCols.has('original_url') && typeof workingRow.original_url === 'string' && workingRow.original_url.includes('/file/')) {
            workingRow.original_url = replaceFilePathWithMap(workingRow.original_url, directFileUrlMap);
          }
          if (validCols.has('url') && (!workingRow.url || String(workingRow.url).trim() === '')) {
            const candidateUrl =
              (typeof workingRow.original_url === 'string' && workingRow.original_url.trim()) ||
              (workingRow.id ? `https://qaiz.ru/file/${workingRow.id}/${encodeURIComponent(String(workingRow.filename || 'file'))}` : '');
            workingRow.url = candidateUrl.includes('/file/') ? replaceFilePathWithMap(candidateUrl, directFileUrlMap) : candidateUrl;
          }
          if (validCols.has('size_bytes') && (workingRow.size_bytes === undefined || workingRow.size_bytes === null)) {
            workingRow.size_bytes = Number(workingRow.size ?? workingRow.file_size ?? 0) || 0;
          }
        }

        const rowCols = Object.keys(workingRow).filter((c) => validCols.has(c));

        if (restoreMode === 'only_mismatches') {
          const rKey = keyCols.length > 0 ? keyCols.map((c) => normalizeCompareVal(workingRow[c])).join('::') : '';
          if (rKey && existingByKey.has(rKey)) {
            const ex = existingByKey.get(rKey);
            const isSame = rowCols.every((c) => normalizeCompareVal(workingRow[c]) === normalizeCompareVal(ex[c]));
            if (isSame) {
              totalSkipped++;
              continue;
            }
          } else if (existingRows.length > 0) {
            const nonPkCols = rowCols.filter((c) => !keyCols.includes(c));
            if (nonPkCols.length > 0) {
              const fullMatch = existingRows.find((ex) =>
                nonPkCols.every((c) => normalizeCompareVal(workingRow[c]) === normalizeCompareVal(ex[c]))
              );
              if (fullMatch) {
                totalSkipped++;
                continue;
              }
            }
          }
        }

        const sanitizedRow: Record<string, any> = {};
        for (const c of rowCols) {
          let v = workingRow[c];
          if (lowerTable === 'users' && (c === 'telegram_id' || c === 'email' || c === 'username') && v === '') {
            v = null;
          }
          if (mediaColumns.has(c.toLowerCase()) && typeof v === 'string' && v.includes('/file/')) {
            v = replaceFilePathWithMap(v, directFileUrlMap);
          } else if (c.toLowerCase() === 'files_json' && typeof v === 'string' && v.includes('/file/')) {
            try {
              const parsedFiles = JSON.parse(v);
              if (Array.isArray(parsedFiles)) {
                v = JSON.stringify(
                  parsedFiles.map((item: any) =>
                    item && typeof item === 'object' && typeof item.file_url === 'string'
                      ? { ...item, file_url: replaceFilePathWithMap(item.file_url, directFileUrlMap) }
                      : item
                  )
                );
              }
            } catch (_) {}
          }
          if (lowerTable === 'file_storage' && c === 'id' && v !== null && v !== undefined) {
            const origUrl = workingRow.original_url || workingRow.url;
            if (typeof origUrl === 'string' && origUrl.startsWith('http')) {
              directFileUrlMap.set(String(v), origUrl);
            }
          }
          sanitizedRow[c] = v === undefined ? null : v;
        }

        sanitizedBatch.push(sanitizedRow);
      }

      if (sanitizedBatch.length > 0) {
        if (lowerTable === 'file_folders') {
          sanitizedBatch.sort((a, b) => {
            const ap = a.parent_id ? 1 : 0;
            const bp = b.parent_id ? 1 : 0;
            return ap - bp;
          });
        } else if (lowerTable === 'file_storage') {
          // Auto-ensure any referenced folder_id exists in file_folders so FK file_storage_folder_id_fkey never rejects system folders (chat_media, avatars, etc.)
          const referencedFolderIds = Array.from(
            new Set(
              sanitizedBatch
                .map((r) => (r.folder_id !== null && r.folder_id !== undefined ? Number(r.folder_id) : null))
                .filter((fid): fid is number => fid !== null && Number.isFinite(fid) && fid > 0)
            )
          );
          if (referencedFolderIds.length > 0) {
            try {
              const existingFolders = await getAll<{ id: any }>(`SELECT id FROM "file_folders"`);
              const existingFolderIdSet = new Set(existingFolders.map((f) => Number(f.id)));
              for (const fid of referencedFolderIds) {
                if (!existingFolderIdSet.has(fid)) {
                  const def = LEGACY_FOLDER_DEFAULTS.find((d) => d.id === fid);
                  await runSql(
                    `INSERT INTO "file_folders" (id, name, description, legacy_id, color, created_at)
                     VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (id) DO NOTHING`,
                    [
                      fid,
                      def?.name || `Папка ${fid}`,
                      def?.name || `Папка ${fid}`,
                      def?.legacyId || String(fid),
                      def?.color || '#E7C768',
                    ]
                  );
                }
              }
            } catch (_) {}
          }
        } else if (lowerTable === 'users') {
          // Prevent users_uid_key conflict if an incoming user row shares uid with a different id row
          for (const uRow of sanitizedBatch) {
            if (uRow.uid && uRow.id) {
              try {
                await runSql(`DELETE FROM "users" WHERE uid = $1 AND id <> $2`, [String(uRow.uid), String(uRow.id)]);
              } catch (_) {}
            }
          }
        }

        const batchResult = await upsertPgRowsBatch(tableName, sanitizedBatch, colsMeta, keyCols);
        totalRestored += batchResult.processedCount;
        totalFailed += batchResult.failedCount;
        for (const msg of batchResult.sampleErrors) {
          if (sampleErrors.length < 15) sampleErrors.push(msg);
        }
      }

      await syncIdentitySequenceIfNeeded(tableName, colsMeta);
    }

    if (isFinalize) {
      try {
        await runSql(
          `UPDATE bot_config
           SET ref_link_template = 'https://t.me/qaiz_aibot/app?startapp={uid}',
               direct_site_url = 'https://t.me/qaiz_aibot/app'
           WHERE id = 1`
        );
      } catch (_) {}

      // Run ProTalk MCP snapshot asynchronously so the final restore slice responds instantly
      setImmediate(() => {
        performDailyDatabaseBackup(true).catch(() => {});
      });
    }

    res.json({
      success: true,
      mode: restoreMode,
      message:
        totalFailed > 0
          ? `Восстановление завершено с предупреждениями: загружено ${totalRestored} зап., ошибок строк: ${totalFailed}.`
          : `База данных PostgreSQL успешно восстановлена! Загружено ${totalRestored} записей в ${restoredTablesCount} таблиц.`,
      restoredCount: totalRestored,
      skippedCount: totalSkipped,
      failedCount: totalFailed,
      tablesCount: restoredTablesCount,
      skippedTables,
      warnings: sampleErrors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

adminSystemRouter.post('/backup/json/restore', restoreJsonBackupHandler);
adminSystemRouter.post('/backup/restore', restoreJsonBackupHandler);

// TRIGGERS MANAGEMENT (Native PostgreSQL & ProTalk MCP Triggers)
adminSystemRouter.get('/triggers', async (_req, res) => {
  try {
    const triggers = await getAll<{ name: string; tbl_name: string; sql: string }>(
      `SELECT
         t.tgname AS name,
         c.relname AS tbl_name,
         pg_get_triggerdef(t.oid, true) AS sql
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND NOT t.tgisinternal
       ORDER BY c.relname ASC, t.tgname ASC`
    );
    res.json({ triggers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const createTriggerHandler = async (req: any, res: any) => {
  try {
    const { sql, name, table, timing, events, plpgsqlBody } = req.body || {};

    if (name && table && timing && Array.isArray(events) && plpgsqlBody) {
      if (!isSafeIdent(name) || !isSafeIdent(table)) {
        return res.status(400).json({ error: 'Некорректное имя триггера или таблицы' });
      }
      await mcpCall('create_trigger', {
        name: String(name).trim(),
        schema: 'public',
        table: String(table).trim(),
        timing: String(timing).trim(),
        events,
        plpgsqlBody: String(plpgsqlBody),
      });
      return res.json({ success: true, message: `Триггер "${name}" создан через ProTalk PG MCP` });
    }

    if (!sql) return res.status(400).json({ error: 'SQL триггера обязателен' });

    await runSql(sql);

    res.json({ success: true, message: 'Триггер успешно создан и сохранен в PostgreSQL' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

adminSystemRouter.post('/triggers', createTriggerHandler);
adminSystemRouter.post('/triggers/create', createTriggerHandler);

adminSystemRouter.delete('/triggers/:name', async (req, res) => {
  try {
    const { name } = req.params;
    if (!isSafeIdent(name)) {
      return res.status(400).json({ error: 'Некорректное имя триггера' });
    }
    const trig = await getOne<{ tbl_name: string }>(
      `SELECT c.relname AS tbl_name
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND t.tgname = $1 AND NOT t.tgisinternal
       LIMIT 1`,
      [name]
    );

    if (trig?.tbl_name && isSafeIdent(trig.tbl_name)) {
      await runSql(`DROP TRIGGER IF EXISTS "${name}" ON "${trig.tbl_name}"`);
    } else {
      return res.status(404).json({ error: `Триггер ${name} не найден` });
    }

    res.json({ success: true, message: `Триггер ${name} удален` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CRON JOBS MANAGEMENT (ProTalk PostgreSQL Cron)
function normalizeProTalkCronJob(j: any) {
  return {
    id: j.id,
    name: j.name,
    schedule: j.cronExpression || j.schedule || '',
    cronExpression: j.cronExpression || j.schedule || '',
    action_type: j.actionType || j.action_type || 'sql',
    action_payload: j.actionPayload || j.action_payload || '',
    enabled: j.enabled !== false,
    status: j.enabled === false ? 'disabled' : (j.lastStatus || 'active'),
    last_run: j.lastRunAt || j.last_run || null,
    last_output: j.lastOutput || null,
    created_at: j.createdAt || j.created_at || null,
  };
}

adminSystemRouter.get('/cron', async (_req, res) => {
  try {
    const [rawJobs, logs] = await Promise.all([
      mcpCall('list_cron_jobs', {}),
      getAll('SELECT * FROM mailing_logs ORDER BY timestamp DESC LIMIT 50'),
    ]);
    const jobsList = Array.isArray(rawJobs) ? rawJobs : (Array.isArray(rawJobs?.jobs) ? rawJobs.jobs : []);
    const jobs = jobsList.filter((j: any) => j && j.enabled !== false).map(normalizeProTalkCronJob);
    res.json({ jobs, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminSystemRouter.post('/cron', async (req, res) => {
  try {
    const { name, schedule, action_type, action_payload } = req.body;
    if (!name || !schedule) {
      return res.status(400).json({ error: 'Название и расписание крон-задачи обязательны' });
    }

    let actionType: 'sql' | 'function' | 'google_sheet' = 'sql';
    let actionPayload = typeof action_payload === 'string' && action_payload.trim() ? action_payload.trim() : '';

    if (action_type === 'function' || action_type === 'sql' || action_type === 'google_sheet') {
      actionType = action_type;
    }

    if (!actionPayload) {
      if (action_type === 'balance_check') {
        actionType = 'function';
        actionPayload = 'balance-audit';
      } else if (action_type === 'cleanup') {
        actionType = 'function';
        actionPayload = 'cleanup-maintenance';
      } else if (action_type === 'reminder' || action_type === 'reminders') {
        actionType = 'function';
        actionPayload = 'inactivity-reminders';
      } else {
        actionType = 'sql';
        actionPayload = 'SELECT NOW()';
      }
    }

    await mcpCall('upsert_cron_job', {
      name: String(name).trim(),
      cronExpression: String(schedule).trim(),
      actionType,
      actionPayload,
      enabled: true,
    });

    res.json({ success: true, message: `Крон-задача "${name}" создана в ProTalk PostgreSQL Cron` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const runCronHandler = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const nowStr = new Date().toISOString();

    const rawJobs = await mcpCall('list_cron_jobs', {}).catch(() => []);
    const jobsList = Array.isArray(rawJobs) ? rawJobs : (Array.isArray(rawJobs?.jobs) ? rawJobs.jobs : []);
    const job = jobsList.find((j: any) => String(j.id) === String(id));

    if (id === 'cron_backup' || String(id).includes('backup')) {
      await performDailyDatabaseBackup(true);
    } else if (
      id === 'cron_reminder_7d' ||
      String(id).includes('reminder') ||
      job?.actionPayload === 'inactivity-reminders'
    ) {
      await runWeeklyInactivityReminders({ limit: 30 });
    } else if (job?.actionPayload === 'balance-audit' || String(id).includes('balance')) {
      await recalculateAllUserBalances();
    } else if (job?.actionType === 'sql' && job?.actionPayload) {
      await pgQuery(job.actionPayload);
    }

    await runSql(
      `INSERT INTO mailing_logs (id, recipient_id, type, status, timestamp, created_at)
       VALUES ($1, 'system_cron', $2, 'executed_manual', $3, NOW())`,
      [`log_${Date.now()}`, `cron_exec_${job?.actionPayload || id}`, Date.now()]
    );

    res.json({ success: true, message: `Крон-задача выполнена успешно (${nowStr})` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

adminSystemRouter.post('/cron/run/:id', runCronHandler);
adminSystemRouter.post('/cron/:id/run', runCronHandler);

adminSystemRouter.delete('/cron/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rawJobs = await mcpCall('list_cron_jobs', {});
    const jobsList = Array.isArray(rawJobs) ? rawJobs : (Array.isArray(rawJobs?.jobs) ? rawJobs.jobs : []);
    const job = jobsList.find((j: any) => String(j.id) === String(id));

    if (!job) {
      return res.status(404).json({ error: `Крон-задача ${id} не найдена` });
    }

    await mcpCall('upsert_cron_job', {
      name: job.name,
      cronExpression: job.cronExpression,
      actionType: job.actionType || 'sql',
      actionPayload: job.actionPayload || 'SELECT NOW()',
      enabled: false,
    });

    res.json({ success: true, message: `Крон-задача "${job.name}" отключена в ProTalk PostgreSQL Cron` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminSystemRouter.post('/cron/backup', async (_req, res) => {
  try {
    await performDailyDatabaseBackup(true);
    res.json({ success: true, message: 'Бэкап базы данных PostgreSQL успешно создан в ProTalk' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// LOGS MANAGEMENT
adminSystemRouter.get('/logs', async (_req, res) => {
  try {
    const logs = await getAll('SELECT * FROM logs ORDER BY created_at DESC LIMIT 200');
    res.json({ logs, data: logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message, logs: [] });
  }
});

// GET /api/admin/system/moderation/config - Get current function 763 moderation settings
adminSystemRouter.get('/moderation/config', async (_req, res) => {
  try {
    const config = await getModerationConfig();
    res.json({
      success: true,
      config: {
        ...config,
        bot_token: '',
        has_bot_token: Boolean(config.bot_token),
        masked_bot_token: config.bot_token ? maskSecret(config.bot_token) : '',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/system/moderation/config - Update function 763 moderation settings
adminSystemRouter.put('/moderation/config', async (req, res) => {
  try {
    const {
      function_id,
      functions_base_id,
      bot_id,
      bot_token,
      instruction,
      options,
      decision_type,
      debug,
      log_url,
      enable_sheets_logging,
      user_prefix,
      is_active,
      reject_threshold,
    } = req.body;

    const existing = await getOne<any>('SELECT id, log_url FROM moderation_config ORDER BY id DESC LIMIT 1');
    const rawTokenStr = bot_token ? String(bot_token).trim() : '';
    const cleanToken = rawTokenStr && !rawTokenStr.includes('•') ? rawTokenStr.replace(/^\d+_/, '').trim() : undefined;

    if (existing?.id) {
      await runSql(
        `UPDATE moderation_config SET
          function_id = COALESCE($1, function_id),
          functions_base_id = COALESCE($2, functions_base_id),
          bot_id = COALESCE($3, bot_id),
          bot_token = COALESCE($4, bot_token),
          instruction = COALESCE($5, instruction),
          options = COALESCE($6, options),
          decision_type = COALESCE($7, decision_type),
          debug = COALESCE($8, debug),
          log_url = $9,
          enable_sheets_logging = COALESCE($10, enable_sheets_logging),
          user_prefix = COALESCE($11, user_prefix),
          is_active = COALESCE($12, is_active),
          reject_threshold = COALESCE($13, reject_threshold),
          updated_at = NOW()
        WHERE id = $14`,
        [
          function_id !== undefined ? Number(function_id) : null,
          functions_base_id || null,
          bot_id !== undefined ? Number(bot_id) : null,
          cleanToken || null,
          instruction || null,
          options || null,
          decision_type || null,
          debug !== undefined ? (debug ? 1 : 0) : null,
          log_url !== undefined ? (log_url && String(log_url).trim().length > 0 ? String(log_url).trim() : null) : existing.log_url,
          enable_sheets_logging !== undefined ? (enable_sheets_logging ? 1 : 0) : null,
          user_prefix || null,
          is_active !== undefined ? (is_active ? 1 : 0) : null,
          reject_threshold !== undefined ? Number(reject_threshold) : null,
          existing.id,
        ]
      );
    } else {
      await runSql(
        `INSERT INTO moderation_config (
          function_id, functions_base_id, bot_id, bot_token,
          instruction, options, decision_type, debug,
          log_url, enable_sheets_logging, user_prefix, is_active, reject_threshold, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
        [
          Number(function_id) || 763,
          functions_base_id || 'appkq3HrzrxYxoAV8',
          Number(bot_id) || 60381,
          cleanToken || 'FONb1dD2SQdv7FwG0ui2PZ9ODxXMKkz7',
          instruction || '',
          options || 'Отказ::no;;Согласие::yes',
          decision_type || 'choice',
          debug ? 1 : 0,
          log_url ? String(log_url).trim() : null,
          enable_sheets_logging ? 1 : 0,
          user_prefix || 'qaiz_chat_{id}',
          is_active !== undefined ? (is_active ? 1 : 0) : 1,
          Number(reject_threshold) || 0.5,
        ]
      );
    }

    if (instruction) {
      await runSql(
        `INSERT INTO prompts (id, game_id, content, description, updated_at)
         VALUES ('prompt_chat_moderation', 'chat_moderation', $1, 'Системная инструкция для функции 763 модерации сообщений в чатах в соответствии с законодательством РФ', NOW())
         ON CONFLICT (game_id) DO UPDATE SET
           content = EXCLUDED.content,
           description = EXCLUDED.description,
           updated_at = NOW()`,
        [instruction]
      );
    }

    const updated = await getModerationConfig();
    res.json({
      success: true,
      message: 'Настройки модерации (функция 763) успешно зафиксированы в базе данных',
      config: {
        ...updated,
        bot_token: '',
        has_bot_token: Boolean(updated.bot_token),
        masked_bot_token: updated.bot_token ? maskSecret(updated.bot_token) : '',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/system/version - Get current app version and date
adminSystemRouter.get('/version', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const verRow = await getOne<{ value: string }>("SELECT value FROM system_settings WHERE key = 'app_version' LIMIT 1");
    const dateRow = await getOne<{ value: string }>("SELECT value FROM system_settings WHERE key = 'app_version_date' LIMIT 1");
    const version =
      (verRow?.value && String(verRow.value).trim()) ||
      (await getSystemSettingAsync('app_version', APP_VERSION)) ||
      APP_VERSION;
    const versionDate =
      (dateRow?.value && String(dateRow.value).trim()) ||
      (await getSystemSettingAsync('app_version_date', APP_VERSION_DATE || formatRuDate())) ||
      APP_VERSION_DATE ||
      formatRuDate();
    res.json({ success: true, version, versionDate });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST & PUT /api/admin/system/version - Update app version and date in DB and persist to src/shared/version.ts code
const updateVersionHandler = async (req: any, res: any) => {
  try {
    const rawVersion = String(req.body?.version || '').trim();
    if (!rawVersion) {
      return res.status(400).json({ error: 'Укажите название версии (например, 1.13)' });
    }
    const rawDate = req.body?.versionDate ? String(req.body.versionDate).trim() : formatRuDate();
    const { version: cleanVersion, versionDate: cleanDate } = await persistAppVersionAndDate(rawVersion, rawDate);

    try {
      await performDailyDatabaseBackup(true);
    } catch (_) {}

    res.json({
      success: true,
      version: cleanVersion,
      versionDate: cleanDate,
      message: `Версия ${cleanVersion} (от ${cleanDate}) успешно сохранена в базе данных и зафиксирована в коде`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

adminSystemRouter.post('/version', updateVersionHandler);
adminSystemRouter.put('/version', updateVersionHandler);

// POST /api/admin/system/moderation/test - Test Function 763 live
adminSystemRouter.post('/moderation/test', async (req, res) => {
  try {
    const { text, instruction, senderUid, chatId } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Поле text обязательно для проверки' });
    }

    const testSender = senderUid || 'admin_tester';
    const testChat = chatId || 'test_room';

    const result = await moderateChatMessage(text, testChat, testSender, instruction, 'group');
    res.json({
      success: true,
      text,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// CRM KANBAN & 7-DAY REMINDER MANAGEMENT
// ============================================================================

const VALID_CRM_STATUSES = ['new', 'playing', 'paying', 'vip', 'sleeping', 'blocked'] as const;

async function syncAutoCrmStatuses(forceAll: boolean = false): Promise<number> {
  const whereClause = forceAll ? '1=1' : 'COALESCE(crm_manual_override, 0) = 0';
  await runSql(`
    UPDATE users
    SET
      crm_status = CASE
        WHEN COALESCE(telegram_bot_blocked, 0) = 1 OR COALESCE(is_bot_blocked, 0) = 1 THEN 'blocked'
        WHEN COALESCE(balance_pay, 0) >= 1000
          OR COALESCE(referral_reward_balance, 0) >= 600
          OR COALESCE(total_points, 0) >= 50000
          OR (SELECT COUNT(*) FROM users r WHERE r.referred_by = users.uid OR r.referred_by = users.id) >= 2
          THEN 'vip'
        WHEN COALESCE(balance_pay, 0) > 0
          OR EXISTS (SELECT 1 FROM transactions t WHERE (t.user_id = users.uid OR t.user_id = users.id) AND t.type = 'top_up' AND t.amount > 0)
          THEN 'paying'
        WHEN COALESCE(
            NULLIF(TRIM(last_active_at::text), '')::timestamptz,
            NULLIF(TRIM(last_seen::text), '')::timestamptz,
            NULLIF(TRIM(last_login::text), '')::timestamptz,
            NULLIF(TRIM(created_at::text), '')::timestamptz,
            '2000-01-01'::timestamptz
          ) <= NOW() - INTERVAL '7 days'
          THEN 'sleeping'
        WHEN (SELECT COUNT(*) FROM game_sessions gs WHERE gs.user_id = users.uid OR gs.user_id = users.id) > 0
          OR (SELECT COUNT(*) FROM game_packs gp WHERE gp.user_id = users.uid OR gp.user_id = users.id) > 0
          OR COALESCE(total_points, 0) > 0
          OR COALESCE(balance_free, 300) < 300
          THEN 'playing'
        ELSE 'new'
      END,
      crm_manual_override = CASE WHEN ${forceAll ? 'TRUE' : 'FALSE'} THEN 0 ELSE COALESCE(crm_manual_override, 0) END,
      crm_updated_at = NOW()
    WHERE ${whereClause}
  `);
  return 1;
}

// GET /api/admin/system/crm - Fetch all CRM client cards with real-time enriched stats
adminSystemRouter.get('/crm', async (_req, res) => {
  try {
    await syncAutoCrmStatuses(false);

    const clients = await getAll<any>(`
      SELECT
        u.uid,
        u.id,
        u.display_name,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.telegram_id,
        u.photo_url,
        u.avatar_url,
        u.telegram_photo,
        u.role,
        COALESCE(u.crm_status, 'new') AS crm_status,
        u.crm_notes,
        COALESCE(u.crm_order, 0) AS crm_order,
        u.crm_updated_at,
        COALESCE(u.crm_manual_override, 0) AS crm_manual_override,
        COALESCE(u.balance, 0) AS balance,
        COALESCE(u.balance_pay, 0) AS balance_pay,
        COALESCE(u.balance_free, 0) AS balance_free,
        COALESCE(u.balance_ref, 0) AS balance_ref,
        COALESCE(u.balance_admin, 0) AS balance_admin,
        COALESCE(u.total_points, u.points, 0) AS total_points,
        COALESCE(u.ballance_point, u.balance_point, 0) AS ballance_point,
        u.last_active_at,
        u.last_seen,
        u.last_login,
        u.created_at,
        u.next_reminder_at,
        u.last_reminder_sent_at,
        COALESCE(u.reminder_count, 0) AS reminder_count,
        GREATEST(COALESCE(u.telegram_bot_blocked, 0), COALESCE(u.is_bot_blocked, 0)) AS telegram_bot_blocked,
        (SELECT COUNT(*)::int FROM game_sessions gs WHERE gs.user_id = u.uid OR gs.user_id = u.id) AS sessions_count,
        (SELECT COUNT(*)::int FROM game_packs gp WHERE gp.user_id = u.uid OR gp.user_id = u.id) AS packs_count,
        (SELECT COUNT(*)::int FROM users r WHERE r.referred_by = u.uid OR r.referred_by = u.id) AS referrals_count,
        (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t WHERE (t.user_id = u.uid OR t.user_id = u.id) AND t.type = 'top_up' AND t.amount > 0) AS topup_total
      FROM users u
      ORDER BY COALESCE(u.crm_order, 0) ASC,
               COALESCE(
                 NULLIF(TRIM(u.last_active_at::text), '')::timestamptz,
                 NULLIF(TRIM(u.last_login::text), '')::timestamptz,
                 NULLIF(TRIM(u.created_at::text), '')::timestamptz,
                 '2000-01-01'::timestamptz
               ) DESC
    `);

    const normalizedClients = clients.map((c: any) => ({
      ...c,
      uid: String(c.uid || c.id),
      crm_status: VALID_CRM_STATUSES.includes(c.crm_status) ? c.crm_status : 'new',
      games_count: Number(c.sessions_count || 0) + Number(c.packs_count || 0),
      referrals_count: Number(c.referrals_count || 0),
      topup_total: Number(c.topup_total || c.balance_pay || 0),
    }));

    res.json({
      success: true,
      clients: normalizedClients,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST & PUT /api/admin/system/crm/move and /api/admin/system/crm/card/:uid
const updateCrmCardHandler = async (req: any, res: any) => {
  try {
    const uid = req.params?.uid || req.body?.uid;
    if (!uid) {
      return res.status(400).json({ error: 'UID клиента обязателен' });
    }

    const { crm_status, crm_notes, crm_order, crm_manual_override } = req.body;
    const updates: string[] = ['crm_updated_at = NOW()', 'updated_at = NOW()'];
    const params: any[] = [];
    let pIdx = 1;

    if (crm_status !== undefined && VALID_CRM_STATUSES.includes(crm_status)) {
      updates.push(`crm_status = $${pIdx++}`);
      params.push(crm_status);
      if (crm_manual_override === undefined) {
        updates.push('crm_manual_override = 1');
      }
      if (crm_status === 'blocked') {
        updates.push('telegram_bot_blocked = 1', 'is_bot_blocked = 1');
      } else {
        updates.push('telegram_bot_blocked = 0', 'is_bot_blocked = 0');
      }
    }

    if (crm_notes !== undefined) {
      updates.push(`crm_notes = $${pIdx++}`);
      params.push(crm_notes === null ? null : String(crm_notes));
    }

    if (crm_order !== undefined && !Number.isNaN(Number(crm_order))) {
      updates.push(`crm_order = $${pIdx++}`);
      params.push(Number(crm_order));
    }

    if (crm_manual_override !== undefined) {
      updates.push(`crm_manual_override = $${pIdx++}`);
      params.push(crm_manual_override ? 1 : 0);
    }

    params.push(String(uid), String(uid));

    await runSql(
      `UPDATE users SET ${updates.join(', ')} WHERE uid = $${pIdx++} OR id = $${pIdx++}`,
      params
    );

    if (crm_manual_override === false || crm_manual_override === 0) {
      await syncAutoCrmStatuses(false);
    }

    const updated = await getOne('SELECT * FROM users WHERE uid = $1 OR id = $2 LIMIT 1', [String(uid), String(uid)]);
    if (updated) {
      delete updated.password;
      delete updated.password_hash;
    }

    res.json({
      success: true,
      message: 'Карточка клиента в CRM успешно обновлена',
      client: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

adminSystemRouter.post('/crm/move', updateCrmCardHandler);
adminSystemRouter.put('/crm/card/:uid', updateCrmCardHandler);
adminSystemRouter.post('/crm/card/:uid', updateCrmCardHandler);

// POST /api/admin/system/crm/auto-sync - Trigger automatic CRM status calculation for all users
adminSystemRouter.post('/crm/auto-sync', async (req, res) => {
  try {
    const forceAll = Boolean(req.body?.forceAll);
    await syncAutoCrmStatuses(forceAll);
    res.json({
      success: true,
      message: forceAll
        ? 'Все карточки клиентов автоматически перераспределены по воронке CRM'
        : 'Автоматические статусы клиентов синхронизированы',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/system/reminders/run - Trigger 7-day inactivity rich-message reminder cascade
adminSystemRouter.post('/reminders/run', async (req, res) => {
  try {
    const { limit, forceTestUid } = req.body || {};
    const summary = await runWeeklyInactivityReminders({
      limit: limit ? Number(limit) : 30,
      forceTestUid: forceTestUid ? String(forceTestUid).trim() : undefined,
    });
    res.json({
      success: true,
      summary,
      message: `Каскад напоминаний выполнен: проверено ${summary.checked}, отправлено ${summary.sent}, заблокировали бота ${summary.blocked}, ошибок ${summary.errors}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
