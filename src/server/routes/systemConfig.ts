import { Router } from 'express';
import { getOne, runSql, getSystemSetting, getSystemSettingAsync, formatRuDate } from '../db';
import { APP_VERSION, APP_VERSION_DATE } from '../../shared/version';

export const systemConfigRouter = Router();

systemConfigRouter.get('/version', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const versionRow = await getOne<{ value: string; updated_at: string }>(
      "SELECT value, updated_at FROM system_settings WHERE key = 'app_version' LIMIT 1"
    );
    const dateRow = await getOne<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'app_version_date' LIMIT 1"
    );
    const version = (versionRow?.value && String(versionRow.value).trim()) || (await getSystemSettingAsync('app_version', APP_VERSION)) || APP_VERSION;
    const rawDateSetting = (dateRow?.value && String(dateRow.value).trim()) || (await getSystemSettingAsync('app_version_date', ''));
    const versionDate =
      (rawDateSetting && String(rawDateSetting).trim()) ||
      (versionRow?.updated_at ? formatRuDate(versionRow.updated_at) : '') ||
      APP_VERSION_DATE ||
      formatRuDate();
    res.json({
      version,
      versionDate,
      updatedAt: versionRow?.updated_at || new Date().toISOString()
    });
  } catch (err: any) {
    res.json({
      version: getSystemSetting('app_version', APP_VERSION) || APP_VERSION,
      versionDate: getSystemSetting('app_version_date', APP_VERSION_DATE || formatRuDate()) || APP_VERSION_DATE || formatRuDate()
    });
  }
});

systemConfigRouter.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const row = await getOne('SELECT * FROM system_config WHERE id = $1', ['default']);
    if (row && typeof row.config_json === 'string') {
      try {
        row.config = JSON.parse(row.config_json);
      } catch (_) {}
    }
    const versionRow = await getOne<{ value: string }>("SELECT value FROM system_settings WHERE key = 'app_version' LIMIT 1");
    const dateRow = await getOne<{ value: string }>("SELECT value FROM system_settings WHERE key = 'app_version_date' LIMIT 1");
    const version = (versionRow?.value && String(versionRow.value).trim()) || (await getSystemSettingAsync('app_version', APP_VERSION)) || APP_VERSION;
    const versionDate = (dateRow?.value && String(dateRow.value).trim()) || (await getSystemSettingAsync('app_version_date', APP_VERSION_DATE || formatRuDate())) || APP_VERSION_DATE || formatRuDate();
    res.json({ data: row ? (row.config || row.config_json) : null, version, versionDate });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

systemConfigRouter.put('/', async (req, res) => {
  try {
    const configData = req.body;
    const configJson = typeof configData === 'string' ? configData : JSON.stringify(configData);

    await runSql(
      `INSERT INTO system_config (id, config_json, updated_at)
       VALUES ('default', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = NOW()`,
      [configJson]
    );

    res.json({ message: 'Системная конфигурация успешно обновлена' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
