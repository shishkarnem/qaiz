import { useState, useRef } from 'react';

export interface CsvSummary {
  rows: number;
  cols: number;
  sizeBytes: number;
}

export interface RestoreSummary {
  tablesCount: number;
  rowsCount: number;
  tableNames: string[];
}

export interface RestoreResultState {
  status: 'success' | 'partial' | 'error';
  title: string;
  details: string;
  tablesCount?: number;
  restoredCount?: number;
  skippedCount?: number;
  failedCount?: number;
  skippedTables?: string[];
  warnings?: string[];
}

interface UseAdminBackupIoProps {
  activeTable: string | null;
  tableData: { columns: any[]; rows: any[] };
  getAdminUid: () => string;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  fetchAllData: () => Promise<void>;
  fetchTables: () => Promise<void>;
  fetchTableRows: (tableName: string, isSilent?: boolean) => Promise<void>;
  showNotification: (text: string, type?: 'success' | 'error') => void;
  setStatusMsg: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}

export function useAdminBackupIo({
  activeTable,
  tableData,
  getAdminUid,
  adminFetch,
  fetchAllData,
  fetchTables,
  fetchTableRows,
  showNotification,
  setStatusMsg
}: UseAdminBackupIoProps) {
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreJsonFile, setRestoreJsonFile] = useState<File | null>(null);
  const [restoreJsonText, setRestoreJsonText] = useState('');
  const restoreFullJsonRef = useRef<string>('');
  const [restoreIsLargePreview, setRestoreIsLargePreview] = useState(false);
  const [restoreUrlInput, setRestoreUrlInput] = useState('');
  const [restoreUrlLoading, setRestoreUrlLoading] = useState(false);
  const [restoreMode, setRestoreMode] = useState<'add_new' | 'only_mismatches' | 'replace_all'>('replace_all');
  const [restoreLoadProgress, setRestoreLoadProgress] = useState<number | null>(null);
  const [restoreSaveProgress, setRestoreSaveProgress] = useState<{ percent: number; stepText: string } | null>(null);
  const [restoreParsedSummary, setRestoreParsedSummary] = useState<RestoreSummary | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResultState | null>(null);

  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState('');
  const [csvImportMode, setCsvImportMode] = useState<'add_new' | 'only_mismatches' | 'replace_all'>('add_new');
  const [clearTableOnImport, setClearTableOnImport] = useState(false);
  const [csvLoadProgress, setCsvLoadProgress] = useState<number | null>(null);
  const [csvSaveProgress, setCsvSaveProgress] = useState<{ percent: number; stepText: string } | null>(null);
  const [csvParsedSummary, setCsvParsedSummary] = useState<CsvSummary | null>(null);

  const [exportProgress, setExportProgress] = useState<{ percent: number; label: string } | null>(null);

  const BOM_CHAR = String.fromCharCode(65279);
  const TAB_CHAR = String.fromCharCode(9);
  const LF_CHAR = String.fromCharCode(10);
  const CR_CHAR = String.fromCharCode(13);

  const stripLeadingBom = (str: string): string =>
    str && str.charCodeAt(0) === 65279 ? str.slice(1) : str;

  const stripOuterQuotes = (str: string): string => {
    let s = str.trim();
    while (s.length > 0 && (s[0] === '"' || s[0] === "'")) {
      s = s.slice(1);
    }
    while (s.length > 0 && (s[s.length - 1] === '"' || s[s.length - 1] === "'")) {
      s = s.slice(0, -1);
    }
    return s.trim();
  };

  const isKeyedJsonArrayText = (str: string): boolean => {
    if (!str.startsWith('"')) return false;
    const colonIdx = str.indexOf(':');
    if (colonIdx <= 1) return false;
    const keyPart = str.slice(0, colonIdx).trim();
    if (!keyPart.endsWith('"')) return false;
    const afterColon = str.slice(colonIdx + 1).trim();
    return afterColon.startsWith('[');
  };

  const splitLinesSafe = (str: string): string[] =>
    str
      .split(LF_CHAR)
      .map((line) => (line.endsWith(CR_CHAR) ? line.slice(0, -1) : line))
      .filter((l) => l.trim().length > 0);

  const convertRowsArrayToCsvText = (rows: any[], preferredCols?: string[]): string => {
    if (!Array.isArray(rows) || rows.length === 0) return '';
    const cols = preferredCols && preferredCols.length > 0 ? preferredCols : Object.keys(rows[0] || {});
    if (cols.length === 0) return '';
    const header = cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
    const lines = rows.map(r =>
      cols
        .map(c => {
          const val = r?.[c];
          if (val === null || val === undefined) return '""';
          if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    return [header, ...lines].join(LF_CHAR);
  };

  const computeCsvSummary = (rawText: string) => {
    const clean = stripLeadingBom(rawText || '').trim();
    if (!clean) {
      setCsvParsedSummary(null);
      return;
    }
    if (clean.startsWith('[') || clean.startsWith('{') || isKeyedJsonArrayText(clean)) {
      try {
        let normalized = clean;
        if (isKeyedJsonArrayText(clean)) {
          let inner = clean.trim();
          if (inner.endsWith(',')) inner = inner.slice(0, -1).trim();
          normalized = `{${inner}}`;
        }
        const parsed = JSON.parse(normalized);
        let arr: any[] = [];
        if (Array.isArray(parsed)) {
          arr = parsed;
        } else if (parsed && typeof parsed === 'object') {
          const rawBody = parsed.backupData || parsed;
          const tObj = rawBody.tables || rawBody;
          if (activeTable && Array.isArray(tObj?.[activeTable])) {
            arr = tObj[activeTable];
          } else if (Array.isArray(rawBody.rows)) {
            arr = rawBody.rows;
          } else {
            const firstArr = Object.values(tObj).find(v => Array.isArray(v)) as any[] | undefined;
            arr = firstArr || [rawBody];
          }
        }
        const cols = arr.length > 0 && arr[0] && typeof arr[0] === 'object' ? Object.keys(arr[0]).length : 0;
        setCsvParsedSummary({ rows: arr.length, cols, sizeBytes: new Blob([rawText]).size });
        return;
      } catch (_) {}
    }

    const lines = splitLinesSafe(clean);
    const firstLine = lines[0] || '';
    const colSep =
      firstLine.includes(TAB_CHAR) && !firstLine.includes(',')
        ? TAB_CHAR
        : firstLine.includes(';') && !firstLine.includes(',')
        ? ';'
        : ',';
    const cols = firstLine ? firstLine.split(colSep).length : 0;
    const schemaCols = tableData.columns.map(c => String(c.name || c).toLowerCase());
    const firstCells = firstLine
      .split(colSep)
      .map(c => stripOuterQuotes(stripLeadingBom(c)).toLowerCase());
    const hasHeader = schemaCols.length === 0 || firstCells.some(c => schemaCols.includes(c));
    const rows = hasHeader ? Math.max(0, lines.length - 1) : lines.length;
    setCsvParsedSummary({ rows, cols, sizeBytes: new Blob([rawText]).size });
  };

  const computeRestoreJsonSummary = (rawText: string) => {
    const clean = (rawText || '').trim();
    if (!clean) {
      setRestoreParsedSummary(null);
      return;
    }
    try {
      const parsed = JSON.parse(clean);
      const rawBody = parsed.backupData || parsed;
      const tablesObj: Record<string, any[]> =
        rawBody.tables && typeof rawBody.tables === 'object'
          ? rawBody.tables
          : rawBody.tableName && Array.isArray(rawBody.rows)
          ? { [rawBody.tableName]: rawBody.rows }
          : rawBody;
      const entries = Object.entries(tablesObj).filter(([, r]) => Array.isArray(r));
      const rowsCount = entries.reduce((acc, [, r]) => acc + (Array.isArray(r) ? r.length : 0), 0);
      setRestoreParsedSummary({
        tablesCount: entries.length,
        rowsCount,
        tableNames: entries.slice(0, 8).map(([k, r]) => `${k} (${r.length})`)
      });
    } catch (_) {
      setRestoreParsedSummary(null);
    }
  };

  const applyLoadedRestoreJsonText = (text: string) => {
    restoreFullJsonRef.current = text;
    computeRestoreJsonSummary(text);
    const MAX_TEXTAREA_CHARS = 120000;
    if (text.length > MAX_TEXTAREA_CHARS) {
      setRestoreIsLargePreview(true);
      setRestoreJsonText(
        text.slice(0, MAX_TEXTAREA_CHARS) +
          `${LF_CHAR}${LF_CHAR}--- Полный объем JSON (${(text.length / 1024 / 1024).toFixed(2)} MB) сохранен в памяти и готов к восстановлению ---`
      );
    } else {
      setRestoreIsLargePreview(false);
      setRestoreJsonText(text);
    }
  };

  const handleSelectCsvFile = (file: File | null) => {
    setCsvFile(file);
    if (!file) {
      setCsvLoadProgress(null);
      return;
    }
    setCsvLoadProgress(5);
    const reader = new FileReader();
    reader.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        setCsvLoadProgress(Math.min(99, Math.max(5, Math.round((evt.loaded / evt.total) * 100))));
      }
    };
    reader.onload = () => {
      let text = typeof reader.result === 'string' ? reader.result : '';
      const trimmed = stripLeadingBom(text).trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          let extractedRows: any[] | null = null;
          if (Array.isArray(parsed)) {
            extractedRows = parsed;
          } else if (parsed && typeof parsed === 'object') {
            const rawBody = parsed.backupData || parsed;
            const tObj = rawBody.tables || rawBody;
            if (activeTable) {
              const matchKey = Object.keys(tObj).find(k => k.toLowerCase() === activeTable.toLowerCase());
              if (matchKey && Array.isArray(tObj[matchKey])) {
                extractedRows = tObj[matchKey];
              }
            }
            if (!extractedRows && Array.isArray(rawBody.rows)) {
              extractedRows = rawBody.rows;
            }
          }
          if (extractedRows && extractedRows.length > 0) {
            const schemaCols = tableData.columns.map(c => c.name || c).filter(Boolean);
            text = convertRowsArrayToCsvText(extractedRows, schemaCols.length > 0 ? schemaCols : undefined);
          }
        } catch (_) {}
      }
      setCsvLoadProgress(100);
      setCsvText(text);
      computeCsvSummary(text);
      setTimeout(() => setCsvLoadProgress(null), 700);
    };
    reader.onerror = () => {
      setCsvLoadProgress(null);
      setStatusMsg({ type: 'error', text: 'Не удалось прочитать выбранный файл' });
    };
    reader.readAsText(file, 'utf-8');
  };

  const xhrDownloadText = (url: string, onPct: (pct: number) => void, errLabel: string) =>
    new Promise<string>((resolve, reject) => {
      const uid = getAdminUid();
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.setRequestHeader('x-user-uid', uid);
      xhr.setRequestHeader('x-admin-uid', uid);
      xhr.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          onPct(Math.min(95, Math.max(15, Math.round((evt.loaded / evt.total) * 100))));
        } else {
          onPct(65);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
        else reject(new Error(`${errLabel} (HTTP ${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error(errLabel));
      xhr.send();
    });

  const handleLoadTableFromServerBackup = async () => {
    if (!activeTable) return;
    setCsvLoadProgress(10);
    try {
      const uid = getAdminUid();
      const text = await xhrDownloadText(
        `/api/admin/system/export/csv/${encodeURIComponent(activeTable)}?admin_uid=${encodeURIComponent(uid)}`,
        setCsvLoadProgress,
        'Ошибка подгрузки таблицы'
      );
      setCsvLoadProgress(100);
      setCsvText(stripLeadingBom(text));
      computeCsvSummary(text);
      showNotification(`Данные таблицы «${activeTable}» подгружены в поле для сохранения`);
    } catch (err: any) {
      showNotification(err.message || 'Ошибка подгрузки данных таблицы', 'error');
    } finally {
      setTimeout(() => setCsvLoadProgress(null), 600);
    }
  };

  const handleSelectRestoreJsonFile = (file: File | null) => {
    setRestoreResult(null);
    setRestoreJsonFile(file);
    if (!file) {
      setRestoreLoadProgress(null);
      return;
    }
    setRestoreLoadProgress(5);
    const reader = new FileReader();
    reader.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        setRestoreLoadProgress(Math.min(99, Math.max(5, Math.round((evt.loaded / evt.total) * 100))));
      }
    };
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setRestoreLoadProgress(100);
      applyLoadedRestoreJsonText(text);
      setTimeout(() => setRestoreLoadProgress(null), 700);
    };
    reader.onerror = () => {
      setRestoreLoadProgress(null);
      setRestoreResult({
        status: 'error',
        title: 'Ошибка чтения файла',
        details: 'Не удалось прочитать JSON файл бэкапа'
      });
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleLoadServerBackupIntoField = async () => {
    setRestoreResult(null);
    setRestoreLoadProgress(10);
    try {
      const uid = getAdminUid();
      const text = await xhrDownloadText(
        `/api/admin/system/backup/json?admin_uid=${encodeURIComponent(uid)}`,
        setRestoreLoadProgress,
        'Ошибка сети при загрузке бэкапа'
      );
      setRestoreLoadProgress(100);
      applyLoadedRestoreJsonText(text);
      showNotification('Актуальный бэкап БД подгружен и готов к восстановлению');
    } catch (err: any) {
      setRestoreResult({
        status: 'error',
        title: 'Ошибка загрузки серверного бэкапа',
        details: err.message || 'Не удалось подгрузить серверный бэкап'
      });
    } finally {
      setTimeout(() => setRestoreLoadProgress(null), 600);
    }
  };

  const handleLoadBackupFromUrl = async () => {
    const cleanUrl = restoreUrlInput.trim();
    if (!cleanUrl) return;
    setRestoreResult(null);
    setRestoreUrlLoading(true);
    setRestoreLoadProgress(15);
    try {
      const res = await adminFetch('/api/admin/system/backup/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Сервер вернул некорректный ответ (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (!res.ok || !data.success || !data.backup) {
        throw new Error(data.error || 'Не удалось загрузить JSON бэкап по ссылке');
      }
      setRestoreLoadProgress(85);
      const text = JSON.stringify(data.backup);
      setRestoreJsonFile(null);
      applyLoadedRestoreJsonText(text);
      setRestoreLoadProgress(100);
      showNotification('JSON бэкап успешно загружен по ссылке и проанализирован');
    } catch (err: any) {
      setRestoreResult({
        status: 'error',
        title: 'Ошибка загрузки по ссылке',
        details: err.message || 'Не удалось загрузить или прочитать JSON по ссылке'
      });
    } finally {
      setRestoreUrlLoading(false);
      setTimeout(() => setRestoreLoadProgress(null), 600);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportTableCsv = async (tableName: string) => {
    if (!tableName) return;
    setExportProgress({ percent: 15, label: `Экспорт таблицы ${tableName} в CSV...` });
    try {
      const uid = getAdminUid();
      const csvTextData = await xhrDownloadText(
        `/api/admin/system/export/csv/${encodeURIComponent(tableName)}?admin_uid=${encodeURIComponent(uid)}`,
        (pct) => setExportProgress({ percent: pct, label: `Экспорт таблицы ${tableName} в CSV...` }),
        'Ошибка экспорта таблицы'
      );
      setExportProgress({ percent: 100, label: `Таблица ${tableName} готова к сохранению` });
      const bomChar = String.fromCharCode(65279);
      const withBom = csvTextData.startsWith(bomChar) ? csvTextData : bomChar + csvTextData;
      triggerDownload(
        new Blob([withBom], { type: 'text/csv;charset=utf-8;' }),
        `${tableName}_export_${new Date().toISOString().slice(0, 10)}.csv`
      );
      showNotification(`Таблица «${tableName}» успешно экспортирована в CSV`);
    } catch (err: any) {
      if (tableName === activeTable && tableData.rows.length > 0) {
        const cols = tableData.columns.map(c => c.name || c);
        const fallbackCsv = String.fromCharCode(65279) + convertRowsArrayToCsvText(tableData.rows, cols);
        triggerDownload(new Blob([fallbackCsv], { type: 'text/csv;charset=utf-8;' }), `${tableName}_export.csv`);
        showNotification(`Таблица «${tableName}» экспортирована в CSV (${tableData.rows.length} записей)`);
      } else {
        setStatusMsg({ type: 'error', text: err.message || 'Ошибка экспорта CSV' });
      }
    } finally {
      setTimeout(() => setExportProgress(null), 600);
    }
  };

  const handleExportTableJson = async (tableName: string) => {
    if (!tableName) return;
    setExportProgress({ percent: 15, label: `Экспорт таблицы ${tableName} в JSON...` });
    try {
      const uid = getAdminUid();
      const jsonTextData = await xhrDownloadText(
        `/api/admin/system/export/json/${encodeURIComponent(tableName)}?admin_uid=${encodeURIComponent(uid)}`,
        (pct) => setExportProgress({ percent: pct, label: `Экспорт таблицы ${tableName} в JSON...` }),
        'Ошибка экспорта JSON'
      );
      setExportProgress({ percent: 100, label: `Таблица ${tableName} экспортирована` });
      triggerDownload(
        new Blob([jsonTextData], { type: 'application/json;charset=utf-8;' }),
        `${tableName}_export_${new Date().toISOString().slice(0, 10)}.json`
      );
      showNotification(`Таблица «${tableName}» успешно экспортирована в JSON`);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Ошибка экспорта таблицы в JSON' });
    } finally {
      setTimeout(() => setExportProgress(null), 600);
    }
  };

  const handleExportFullBackupJson = async () => {
    setExportProgress({ percent: 10, label: 'Формирование полного бэкапа БД JSON...' });
    try {
      const uid = getAdminUid();
      const jsonTextData = await xhrDownloadText(
        `/api/admin/system/backup/json?admin_uid=${encodeURIComponent(uid)}`,
        (pct) => setExportProgress({ percent: pct, label: 'Скачивание полного бэкапа БД JSON...' }),
        'Ошибка создания бэкапа'
      );
      setExportProgress({ percent: 100, label: 'Полный бэкап БД готов' });
      triggerDownload(
        new Blob([jsonTextData], { type: 'application/json;charset=utf-8;' }),
        `qaiz_db_backup_${new Date().toISOString().slice(0, 10)}.json`
      );
      showNotification('Полный бэкап базы данных JSON успешно скачан');
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Ошибка экспорта бэкапа БД' });
    } finally {
      setTimeout(() => setExportProgress(null), 600);
    }
  };

  const handleImportCsv = async () => {
    if (!activeTable) return;
    try {
      let content = csvText;
      if (!content.trim() && csvFile) {
        setCsvSaveProgress({ percent: 10, stepText: 'Чтение выбранного файла...' });
        content = await csvFile.text();
        setCsvText(content);
        computeCsvSummary(content);
      }
      if (!content.trim()) {
        setStatusMsg({ type: 'error', text: 'Выберите файл CSV / JSON или вставьте сведения в поле для сохранения' });
        return;
      }

      const modeLabel =
        csvImportMode === 'replace_all'
          ? 'Заменить все'
          : csvImportMode === 'only_mismatches'
          ? 'Добавить только несовпадения к текущим'
          : 'Добавить новые';

      setCsvSaveProgress({ percent: 25, stepText: `Импорт (${modeLabel}) в таблицу ${activeTable}...` });
      const uid = getAdminUid();
      const payloadStr = JSON.stringify({
        csv: content,
        importMode: csvImportMode,
        clearTable: csvImportMode === 'replace_all'
      });

      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/admin/system/import/csv/${encodeURIComponent(activeTable)}`, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('x-user-uid', uid);
        xhr.setRequestHeader('x-admin-uid', uid);
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && evt.total > 0) {
            const pct = Math.min(85, Math.max(25, Math.round(25 + (evt.loaded / evt.total) * 60)));
            setCsvSaveProgress({ percent: pct, stepText: `Передача и запись строк в ${activeTable}...` });
          }
        };
        xhr.onload = () => {
          try {
            const parsed = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300 && parsed.success) resolve(parsed);
            else reject(new Error(parsed.error || `Ошибка импорта (HTTP ${xhr.status})`));
          } catch {
            reject(new Error('Некорректный ответ сервера при импорте в таблицу'));
          }
        };
        xhr.onerror = () => reject(new Error('Ошибка сети при импорте в таблицу'));
        xhr.send(payloadStr);
      });

      const importedCnt = data.importedCount ?? data.count ?? 0;
      const skippedCnt = data.skippedCount ?? 0;
      const doneSummary =
        csvImportMode === 'only_mismatches'
          ? `Готово! Добавлено: ${importedCnt}, пропущено совпадений: ${skippedCnt}`
          : `Успешно сохранено записей: ${importedCnt}`;

      setCsvSaveProgress({ percent: 100, stepText: doneSummary });
      await fetchTableRows(activeTable, true);
      await fetchTables();
      showNotification(data.message || `Импортировано записей в ${activeTable}: ${importedCnt}`);
      setTimeout(() => {
        setCsvSaveProgress(null);
        setShowCsvImportModal(false);
        setCsvFile(null);
        setCsvText('');
        setCsvParsedSummary(null);
      }, 450);
    } catch (err: any) {
      setCsvSaveProgress(null);
      setStatusMsg({ type: 'error', text: err.message || 'Ошибка импорта в таблицу' });
    }
  };

  const handleRestoreBackupJson = async () => {
    setRestoreResult(null);
    try {
      setRestoreSaveProgress({ percent: 3, stepText: 'Чтение и разбор JSON бэкапа...' });
      await new Promise((r) => setTimeout(r, 30));

      let content = restoreFullJsonRef.current || restoreJsonText;
      if (!content.trim() && restoreJsonFile) {
        content = await restoreJsonFile.text();
        applyLoadedRestoreJsonText(content);
      }
      if (!content.trim()) {
        setRestoreSaveProgress(null);
        setRestoreResult({
          status: 'error',
          title: 'Данные бэкапа не загружены',
          details: 'Выберите файл .json, загрузите по ссылке (нажмите кнопку «По ссылке») или вставьте JSON в поле ниже'
        });
        return;
      }

      setRestoreSaveProgress({ percent: 6, stepText: 'Проверка структуры таблиц JSON...' });
      await new Promise((r) => setTimeout(r, 20));

      const parsed = JSON.parse(content);
      const rawBody = parsed.backupData || parsed;
      const tablesObj: Record<string, any[]> =
        rawBody.tables && typeof rawBody.tables === 'object'
          ? rawBody.tables
          : rawBody.tableName && Array.isArray(rawBody.rows)
          ? { [rawBody.tableName]: rawBody.rows }
          : rawBody;

      const rawEntries = Object.entries(tablesObj).filter(([, r]) => Array.isArray(r));
      if (rawEntries.length === 0) {
        setRestoreSaveProgress(null);
        setRestoreResult({
          status: 'error',
          title: 'Невалидная структура JSON',
          details: 'В загруженном JSON не найдено таблиц с массивами записей для восстановления'
        });
        return;
      }

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
      const sortedEntries = [...rawEntries].sort((a, b) => priorityOrder(a[0]) - priorityOrder(b[0]));
      const skippedTableSet = new Set<string>();

      if (restoreMode === 'replace_all') {
        setRestoreSaveProgress({
          percent: 8,
          stepText: `Подготовка: очистка ${sortedEntries.length} таблиц перед полной заменой...`
        });
        const prepRes = await adminFetch('/api/admin/system/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prepareReplaceAll: true,
            tableNames: sortedEntries.map(([name]) => name),
            restoreMode
          })
        });
        const prepCt = prepRes.headers.get('content-type') || '';
        if (!prepCt.includes('application/json')) {
          throw new Error(`Сервер вернул некорректный ответ при подготовке таблиц (HTTP ${prepRes.status})`);
        }
        const prepData = await prepRes.json();
        if (!prepRes.ok || !prepData.success) {
          throw new Error(prepData.error || 'Ошибка подготовки таблиц к замене');
        }
        if (Array.isArray(prepData.skippedTables)) {
          prepData.skippedTables.forEach((t: string) => skippedTableSet.add(t));
        }
      }

      const MAX_ROWS_PER_SLICE = 80;
      const slices: Array<{ tableName: string; rows: any[]; sliceLabel: string }> = [];
      for (const [tName, tRows] of sortedEntries) {
        if (!Array.isArray(tRows) || tRows.length === 0) {
          slices.push({ tableName: tName, rows: [], sliceLabel: `${tName} (0 зап.)` });
          continue;
        }
        for (let offset = 0; offset < tRows.length; offset += MAX_ROWS_PER_SLICE) {
          const part = tRows.slice(offset, offset + MAX_ROWS_PER_SLICE);
          slices.push({
            tableName: tName,
            rows: part,
            sliceLabel: `${tName} (${offset + 1}–${offset + part.length} из ${tRows.length})`
          });
        }
      }

      const totalWorkRows = Math.max(1, sortedEntries.reduce((sum, [, rows]) => sum + rows.length, 0));
      let processedWorkRows = 0;
      let totalRestoredRows = 0;
      let totalSkippedRows = 0;
      let totalFailedRows = 0;
      const restoredTableSet = new Set<string>();
      const collectedWarnings: string[] = [];

      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        const isLastSlice = i === slices.length - 1;
        const currentPct = Math.min(97, Math.max(10, Math.round(10 + (processedWorkRows / totalWorkRows) * 86)));
        setRestoreSaveProgress({
          percent: currentPct,
          stepText: `Восстановление ${slice.sliceLabel} · пакет ${i + 1} из ${slices.length}...`
        });

        const res = await adminFetch('/api/admin/system/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tables: { [slice.tableName]: slice.rows },
            restoreMode,
            partial: true,
            skipDeleteOnPartial: true,
            finalize: isLastSlice
          })
        });
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          throw new Error(`Таймаут или некорректный ответ сервера на таблице ${slice.tableName} (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Ошибка при восстановлении ${slice.sliceLabel}`);
        }

        processedWorkRows += slice.rows.length;
        if (Array.isArray(data.skippedTables)) {
          data.skippedTables.forEach((t: string) => skippedTableSet.add(t));
        }
        if (Number(data.tablesCount || 0) > 0) restoredTableSet.add(slice.tableName);
        totalRestoredRows += Number(data.restoredCount || 0);
        totalSkippedRows += Number(data.skippedCount || 0);
        totalFailedRows += Number(data.failedCount || 0);
        if (Array.isArray(data.warnings)) {
          for (const w of data.warnings) {
            if (collectedWarnings.length < 10) collectedWarnings.push(String(w));
          }
        }

        const donePct = isLastSlice
          ? 100
          : Math.min(98, Math.max(12, Math.round(10 + (processedWorkRows / totalWorkRows) * 88)));
        setRestoreSaveProgress({
          percent: donePct,
          stepText: isLastSlice
            ? `Завершено: ${restoredTableSet.size} табл. · ${totalRestoredRows} зап.`
            : `Сохранено: ${restoredTableSet.size}/${sortedEntries.length} табл. · ${totalRestoredRows} зап.`
        });
      }

      const skippedTablesList = Array.from(skippedTableSet);
      const summaryText =
        restoreMode === 'only_mismatches'
          ? `Добавлено ${totalRestoredRows} несовпадений, пропущено совпадений: ${totalSkippedRows}`
          : `Восстановлено ${totalRestoredRows} записей в ${restoredTableSet.size} таблиц PostgreSQL`;

      setRestoreResult({
        status: totalFailedRows > 0 ? 'partial' : 'success',
        title: totalFailedRows > 0 ? 'Восстановление завершено с предупреждениями' : 'База данных успешно восстановлена!',
        details: summaryText,
        tablesCount: restoredTableSet.size,
        restoredCount: totalRestoredRows,
        skippedCount: totalSkippedRows,
        failedCount: totalFailedRows,
        skippedTables: skippedTablesList,
        warnings: collectedWarnings
      });
      setRestoreSaveProgress(null);
      showNotification(summaryText);

      try {
        await Promise.all([
          fetchAllData(),
          activeTable ? fetchTableRows(activeTable, true) : Promise.resolve()
        ]);
      } catch (_) {}
    } catch (err: any) {
      setRestoreSaveProgress(null);
      setRestoreResult({
        status: 'error',
        title: 'Ошибка восстановления базы данных',
        details: err?.message || 'Непредвиденная ошибка при сохранении данных'
      });
      setStatusMsg({ type: 'error', text: `Ошибка восстановления: ${err.message}` });
    }
  };

  return {
    showRestoreModal,
    setShowRestoreModal,
    restoreJsonFile,
    setRestoreJsonFile,
    restoreJsonText,
    setRestoreJsonText,
    restoreFullJsonRef,
    restoreIsLargePreview,
    setRestoreIsLargePreview,
    restoreUrlInput,
    setRestoreUrlInput,
    restoreUrlLoading,
    restoreMode,
    setRestoreMode,
    restoreLoadProgress,
    setRestoreLoadProgress,
    restoreSaveProgress,
    setRestoreSaveProgress,
    restoreParsedSummary,
    setRestoreParsedSummary,
    restoreResult,
    setRestoreResult,
    computeRestoreJsonSummary,
    handleSelectRestoreJsonFile,
    handleLoadServerBackupIntoField,
    handleLoadBackupFromUrl,
    handleRestoreBackupJson,
    showCsvImportModal,
    setShowCsvImportModal,
    csvFile,
    setCsvFile,
    csvText,
    setCsvText,
    csvImportMode,
    setCsvImportMode,
    clearTableOnImport,
    setClearTableOnImport,
    csvLoadProgress,
    setCsvLoadProgress,
    csvSaveProgress,
    setCsvSaveProgress,
    csvParsedSummary,
    setCsvParsedSummary,
    computeCsvSummary,
    handleSelectCsvFile,
    handleLoadTableFromServerBackup,
    handleImportCsv,
    exportProgress,
    handleExportTableCsv,
    handleExportTableJson,
    handleExportFullBackupJson
  };
}
