import { Router } from 'express';
import { getOne, runSql, encryptSecret, decryptSecret, maskSecret, setSystemSetting } from '../db';
import { requireSuperAdmin } from '../authMiddleware';
import { getTelegramBotConfig, saveTelegramBotConfigSecure, cleanTelegramBaseUrl, PROXY_PRESETS } from '../telegram';
import { executeDatabaseBackup } from '../backup';

export const telegramRouter = Router();

const DEFAULT_NEW_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8663485854:AAHP70ovPUjIzha-YzD4B5rWkUrI57uG6VM';

// GET: Получение настроек бота и прокси (строго с маскированием токена, только для супер-админа)
telegramRouter.get('/admin/bot-settings', requireSuperAdmin, async (_req, res) => {
  try {
    const config = await getTelegramBotConfig();
    const rawToken = decryptSecret(config.botToken || '');
    const maskedToken = maskSecret(rawToken);

    res.json({
      botUsername: config.botUsername || '@qaiz_aibot',
      proxyType: config.proxyType || 'dialog_ai',
      apiBaseUrl: config.apiBaseUrl || PROXY_PRESETS.dialog_ai,
      adminTelegramId: config.adminTelegramId || '169262990',
      isTokenConfigured: Boolean(rawToken),
      maskedToken
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Сохранение настроек прокси и бота (шифрование токена AES-256-GCM в БД)
telegramRouter.post('/admin/bot-settings', requireSuperAdmin, async (req, res) => {
  try {
    const { botToken, botUsername, proxyType, apiBaseUrl, adminTelegramId } = req.body;
    const current = await getTelegramBotConfig();

    let resolvedBaseUrl = PROXY_PRESETS.dialog_ai;
    if (proxyType === 'dialog_ai') {
      resolvedBaseUrl = PROXY_PRESETS.dialog_ai;
    } else if (proxyType === 'direct') {
      resolvedBaseUrl = PROXY_PRESETS.direct;
    } else if (proxyType === 'custom_cloudflare') {
      resolvedBaseUrl = cleanTelegramBaseUrl(apiBaseUrl || '');
    }

    const isMaskedInput =
      !botToken ||
      String(botToken).includes('••') ||
      String(botToken).includes('***') ||
      String(botToken).includes('...');

    const finalPlainToken = isMaskedInput
      ? decryptSecret(current.botToken)
      : decryptSecret(String(botToken).trim());

    const updated = await saveTelegramBotConfigSecure({
      botToken: finalPlainToken,
      botUsername: botUsername?.trim() || current.botUsername,
      proxyType: proxyType || 'dialog_ai',
      apiBaseUrl: resolvedBaseUrl,
      adminTelegramId: adminTelegramId?.trim() || current.adminTelegramId
    });

    if (finalPlainToken) {
      setSystemSetting('telegram_bot_token', finalPlainToken, true);
    }

    res.json({
      success: true,
      message: 'Настройки прокси и бота надежно зашифрованы и сохранены в БД',
      config: {
        botUsername: updated.botUsername,
        proxyType: updated.proxyType,
        apiBaseUrl: updated.apiBaseUrl,
        adminTelegramId: updated.adminTelegramId,
        isTokenConfigured: Boolean(finalPlainToken),
        maskedToken: maskSecret(finalPlainToken)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Ручной запуск бэкапа из админки
telegramRouter.post('/admin/backup/trigger', requireSuperAdmin, async (_req, res) => {
  try {
    const result = await executeDatabaseBackup('Ручной запуск из панели системного администратора');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Protected Telegram Config (Requires Super Admin, reads from unified bot_config)
telegramRouter.get('/admin/telegram-config', requireSuperAdmin, async (_req, res) => {
  try {
    const config = await getOne('SELECT * FROM bot_config WHERE id = 1');
    const decryptedToken = decryptSecret(config?.bot_token || DEFAULT_NEW_BOT_TOKEN);

    res.json({
      bot_token: maskSecret(decryptedToken),
      is_token_configured: Boolean(decryptedToken),
      bot_name: config?.bot_name || 'КвИИз - ИИ Квиз онлайн мультиплеер',
      bot_username: config?.bot_username || '@qaiz_aibot',
      bot_link: config?.bot_link || 'https://t.me/qaiz_aibot',
      channel_username: config?.channel_username || 'qaiz_ru',
      channel_link: config?.channel_link || 'https://t.me/qaiz_ru',
      web_app_url: config?.web_app_url || 'https://t.me/qaiz_aibot/app',
      direct_site_url: config?.direct_site_url || 'https://qaiz.ru/',
      ref_link_template: config?.ref_link_template || 'https://t.me/qaiz_aibot/app?startapp={uid}',
      is_active: 1
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update Telegram Config (Requires Super Admin, stores encrypted token in unified bot_config)
telegramRouter.put('/admin/telegram-config', requireSuperAdmin, async (req, res) => {
  try {
    const {
      bot_token, bot_name, bot_username, bot_link,
      channel_username, channel_link, web_app_url, direct_site_url,
      ref_link_template
    } = req.body;

    const existing = await getOne('SELECT * FROM bot_config WHERE id = 1');
    const currentPlainToken = decryptSecret(existing?.bot_token || DEFAULT_NEW_BOT_TOKEN);

    let tokenToSavePlain = currentPlainToken;
    if (
      bot_token &&
      typeof bot_token === 'string' &&
      bot_token.includes(':') &&
      !bot_token.includes('••') &&
      !bot_token.includes('***') &&
      !bot_token.includes('...')
    ) {
      tokenToSavePlain = decryptSecret(bot_token.trim());
    }

    const encryptedToken = encryptSecret(tokenToSavePlain);
    setSystemSetting('telegram_bot_token', tokenToSavePlain, true);

    if (existing) {
      await runSql(
        `UPDATE bot_config SET
          bot_token = $1, bot_name = $2, bot_username = $3, bot_link = $4,
          channel_username = $5, channel_link = $6, web_app_url = $7, direct_site_url = $8,
          ref_link_template = $9, updated_at = NOW()
         WHERE id = 1`,
        [
          encryptedToken,
          bot_name || 'КвИИз - ИИ Квиз онлайн мультиплеер',
          bot_username || '@qaiz_aibot',
          bot_link || 'https://t.me/qaiz_aibot',
          channel_username || 'qaiz_ru',
          channel_link || 'https://t.me/qaiz_ru',
          web_app_url || 'https://t.me/qaiz_aibot/app',
          direct_site_url || 'https://qaiz.ru/',
          ref_link_template || 'https://t.me/qaiz_aibot/app?startapp={uid}'
        ]
      );
    } else {
      await runSql(
        `INSERT INTO bot_config (
          id, bot_token, bot_name, bot_username, bot_link,
          channel_username, channel_link, web_app_url, direct_site_url, ref_link_template
        ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          encryptedToken,
          bot_name || 'КвИИз - ИИ Квиз онлайн мультиплеер',
          bot_username || '@qaiz_aibot',
          bot_link || 'https://t.me/qaiz_aibot',
          channel_username || 'qaiz_ru',
          channel_link || 'https://t.me/qaiz_ru',
          web_app_url || 'https://t.me/qaiz_aibot/app',
          direct_site_url || 'https://qaiz.ru/',
          ref_link_template || 'https://t.me/qaiz_aibot/app?startapp={uid}'
        ]
      );
    }

    await saveTelegramBotConfigSecure({
      botToken: tokenToSavePlain,
      botUsername: bot_username || '@qaiz_aibot'
    });

    res.json({
      message: 'Настройки Telegram зашифрованы (AES-256-GCM) и сохранены в базе данных',
      masked_token: maskSecret(tokenToSavePlain)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
