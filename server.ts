import dns from 'dns';
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch (e) {
    console.warn('DNS result order setup warning:', e);
  }
}

// Global unhandled rejection and exception safety handlers
process.on('unhandledRejection', (reason) => {
  console.warn('[Server Warning] Unhandled rejection intercepted:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Server Warning] Uncaught exception intercepted:', err);
});

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { initDb, performDailyDatabaseBackup, recalculateAllUserBalances, reconcileGameData } from './src/server/db';
import { setupApiRoutes } from './src/server/routes';
import { seoRouter } from './src/server/routes/seo';
import { ensurePushInfrastructure } from './src/server/push';
import { initBackupCronJob } from './src/server/cron';
import { initSavRssScheduler } from './src/server/blog/savRssSync';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8663485854:AAHP70ovPUjIzha-YzD4B5rWkUrI57uG6VM';
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Security barrier: block direct HTTP access to backups, tokens, .env, DB dumps, or server code
  app.use((req, res, next) => {
    const p = decodeURIComponent(req.path || req.url || '').toLowerCase();
    if (
      p.startsWith('/backups') ||
      p.startsWith('/tokens') ||
      p.startsWith('/.env') ||
      p.startsWith('/src/server') ||
      p === '/server.ts' ||
      p.endsWith('.sqlite') ||
      p.endsWith('.sqlite.bak') ||
      p.endsWith('.db') ||
      p.endsWith('.sql')
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  });

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Disable caching for all API endpoints to guarantee instant updates
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  let dbReady = false;
  let dbInitPromise: Promise<boolean> | null = null;
  let postInitTasksScheduled = false;

  const ensureBackendReady = (): Promise<boolean> => {
    if (dbReady) return Promise.resolve(true);
    if (dbInitPromise) return dbInitPromise;

    dbInitPromise = (async () => {
      try {
        await initDb();
        await ensurePushInfrastructure().catch((err) =>
          console.warn('[WebPush Startup Warning]:', err?.message || err)
        );
        dbReady = true;
        console.log('[ProTalk PG] PostgreSQL database initialized successfully.');

        if (!postInitTasksScheduled) {
          postInitTasksScheduled = true;
          initSavRssScheduler();
          setTimeout(() => {
            recalculateAllUserBalances()
              .then(() => reconcileGameData())
              .catch((err) => console.error('[Startup Sync Warning]:', err));
          }, 1500);
        }
        return true;
      } catch (err: any) {
        console.error('[ProTalk PG Init Warning]:', err?.message || err);
        dbInitPromise = null;
        return false;
      }
    })();

    return dbInitPromise;
  };

  // Start DB initialization asynchronously in background so port binding is never delayed
  void ensureBackendReady();

  // Health endpoint responds immediately even while initial DB handshake finishes
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', dbReady });
  });

  // Ensure API requests wait briefly for DB readiness on cold boot (max 6s) and retry if needed
  app.use('/api', async (req, _res, next) => {
    if (req.path === '/health' || dbReady) return next();
    try {
      await Promise.race([
        ensureBackendReady(),
        new Promise((resolve) => setTimeout(resolve, 6000)),
      ]);
    } catch (_) {}
    next();
  });

  // Initialize Daily 06:00 MSK Backup Cron Service
  initBackupCronJob();

  // Initialize API routes
  setupApiRoutes(app);

  // Daily DB Backup Cron Job (every 24h)
  setInterval(() => {
    performDailyDatabaseBackup().catch(err => console.error('[Backup Error]:', err));
  }, 24 * 60 * 60 * 1000);

  // Initialize Telegram Bot safely without unhandled rejection crashes
  if (BOT_TOKEN) {
    try {
      const bot = new TelegramBot(BOT_TOKEN, { polling: false });

      bot.on('error', (err) => {
        console.warn('[TelegramBot Error]:', err?.message || err);
      });

      bot.on('polling_error', (err) => {
        console.warn('[TelegramBot Polling Error]:', err?.message || err);
      });

      bot.on('webhook_error', (err) => {
        console.warn('[TelegramBot Webhook Error]:', err?.message || err);
      });

      const rawAppUrl = process.env.APP_URL || (process.env.VITE_VERCEL_URL ? `https://${process.env.VITE_VERCEL_URL}` : '');
      const APP_URL = rawAppUrl && !rawAppUrl.includes('undefined') ? rawAppUrl : '';

      if (APP_URL) {
        const webhookUrl = `${APP_URL}/api/telegram-webhook`;
        bot.setWebHook(webhookUrl).then(() => {
          console.log(`Telegram Webhook set to: ${webhookUrl}`);
        }).catch((err) => {
          console.warn(`[TelegramBot] Failed to set webhook to ${webhookUrl}:`, err?.message || err);
        });

        app.post('/api/telegram-webhook', (req, res) => {
          try {
            bot.processUpdate(req.body);
          } catch (e) {
            console.warn('[TelegramBot Webhook Process Error]:', e);
          }
          res.sendStatus(200);
        });
      } else {
        console.log('[TelegramBot] No external APP_URL configured for webhook.');
      }

      bot.onText(/\/start (.+)/, (msg, match) => {
        const chatId = msg.chat.id;
        const startParam = match ? match[1] : '';

        if (startParam === 'link') {
          const code = `sdf${chatId}gh`;
          bot.sendMessage(chatId, `Ваш код для привязки аккаунта в Квайз:\n\n<code>${code}</code>\n\nСкопируйте этот код и вставьте его в приложении.`, {
            parse_mode: 'HTML'
          }).catch(e => console.warn('[TelegramBot sendMessage Error]:', e?.message));
          console.log(`Generated linking code ${code} for chat ${chatId}`);
        }
      });

      bot.on('message', (msg) => {
        if (msg.text === '/start') {
          bot.sendMessage(msg.chat.id, 'Добро пожаловать в Квайз! Чтобы привязать аккаунт, используйте кнопку в приложении.')
            .catch(e => console.warn('[TelegramBot sendMessage Error]:', e?.message));
        }
      });

      console.log('Telegram Bot initialized safely.');
    } catch (err: any) {
      console.warn('[TelegramBot Initialization Warning]:', err?.message || err);
    }
  } else {
    console.warn('VITE_TELEGRAM_BOT_TOKEN not found. Bot disabled.');
  }

  // Dynamic SEO, RSS, Yandex Tableau, Browserconfig & Sitemap routes
  app.use('/', seoRouter);

  // Ensure unmatched /api/* routes always return JSON 404 instead of HTML SPA fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Serve optimized production build when running in production or preview mode
  const isProdMode =
    process.env.NODE_ENV === 'production' ||
    process.env.SERVE_DIST === 'true' ||
    process.argv.includes('--prod') ||
    process.argv.includes('--preview');
  const distPath = path.join(process.cwd(), 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const hasDistBuild = fs.existsSync(distIndexPath);

  if (!isProdMode || !hasDistBuild) {
    if (isProdMode && !hasDistBuild) {
      console.warn('[Server] dist/index.html not found, falling back to Vite dev middleware. Run "npm run build" first.');
    }
    const hmrEnabled = process.env.ENABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: hmrEnabled ? { server: httpServer } : false,
        ws: hmrEnabled ? undefined : (false as const),
      },
      appType: 'spa',
    });

    if (!hmrEnabled) {
      let cachedPatchedViteClient: string | null = null;
      app.get('/@vite/client', async (_req, res, next) => {
        try {
          if (!cachedPatchedViteClient) {
            const transformed = await vite.transformRequest('/@vite/client');
            if (transformed?.code) {
              cachedPatchedViteClient = transformed.code
                .replace(
                  'transport.connect(createHMRHandler(handleMessage));',
                  '/* HMR WebSocket disabled by server runtime */'
                )
                .replace(
                  'throw new Error("send was called before connect");',
                  'return;'
                )
                .replace(
                  'throw new Error("invoke was called before connect");',
                  'return;'
                )
                .replace(
                  'wsTransport.send(data);',
                  '/* HMR WebSocket send disabled */'
                );
            }
          }
          if (cachedPatchedViteClient) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            return res.send(cachedPatchedViteClient);
          }
        } catch (err) {
          console.warn('[Vite Client Patch Warning]:', err);
        }
        next();
      });
    }

    app.use(vite.middlewares);
  } else {
    console.log(`[Server] Running in optimized production mode, serving ${distPath} with ProTalk PG API.`);
    app.use(express.static(distPath, { index: false, maxAge: '1d' }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(distIndexPath);
    });
  }

  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server Fatal Startup Error]:', err);
});
