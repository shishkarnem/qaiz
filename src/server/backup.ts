import { queryAll, getSystemSetting, getSystemSettingAsync } from "./db";
import { mcpCall } from "./pg";
import { sendTelegramDocument, sendTelegramMessage, getTelegramBotConfig } from "./telegram";
import { APP_VERSION } from "../shared/version";

export async function executeDatabaseBackup(reason = "Автоматический бэкап"): Promise<{
  success: boolean;
  totalRows: number;
  tablesCount: number;
  filename: string;
  version: string;
  pgSnapshotTriggered?: boolean;
  error?: string;
}> {
  try {
    const now = new Date();
    const mskTime = new Date(now.getTime() + 3 * 3600 * 1000);
    const mskTimeStr = mskTime.toISOString().replace("T", " ").substring(0, 19) + " MSK";
    const fileTimestamp = mskTime.toISOString().replace(/[:.]/g, "-").substring(0, 19);

    const dbVer = await getSystemSettingAsync("app_version", APP_VERSION);
    const currentVersion = (dbVer && String(dbVer).trim()) || APP_VERSION;
    const safeVer = currentVersion.replace(/[^a-zA-Z0-9._-]/g, "");
    const filename = `db_backup_v${safeVer}_${fileTimestamp}.json`;

    // Trigger native PostgreSQL binary dump snapshot in ProTalk DB infrastructure
    let pgSnapshotTriggered = false;
    try {
      await mcpCall("run_backup_now", {});
      pgSnapshotTriggered = true;
    } catch (pgErr: any) {
      console.warn("[Backup Engine] ProTalk MCP run_backup_now warning:", pgErr?.message || pgErr);
    }

    const tableRows = await queryAll<{ name: string }>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name ASC"
    );
    const allowedTables = tableRows.map((r) => r.name);

    const backupData: Record<string, any> = {
      meta: {
        app: "КвИИз",
        engine: "PostgreSQL (ProTalk qaiz)",
        version: currentVersion,
        exportedAt: now.getTime(),
        exportedAtMSK: mskTimeStr,
        reason
      },
      tables: {}
    };

    let totalRows = 0;
    let tablesWithData = 0;

    for (const table of allowedTables) {
      try {
        const rows = await queryAll(`SELECT * FROM "${table}"`);
        backupData.tables[table] = rows || [];
        totalRows += (rows || []).length;
        if (rows && rows.length > 0) tablesWithData++;
      } catch (_err) {
        backupData.tables[table] = [];
      }
    }

    let jsonString = JSON.stringify(backupData);
    let fileBuffer = Buffer.from(jsonString, "utf-8");

    // If backup exceeds 8 MB due to embedded base64 data URLs in file_storage, create a lightweight copy for Telegram
    if (fileBuffer.length > 8 * 1024 * 1024 && Array.isArray(backupData.tables["file_storage"])) {
      const lightBackup = {
        ...backupData,
        tables: {
          ...backupData.tables,
          file_storage: backupData.tables["file_storage"].map((row: any) => {
            if (row && typeof row.original_url === "string" && row.original_url.startsWith("data:") && row.original_url.length > 65536) {
              return { ...row, original_url: row.url && String(row.url).startsWith("http") ? row.url : "" };
            }
            return row;
          })
        }
      };
      jsonString = JSON.stringify(lightBackup);
      fileBuffer = Buffer.from(jsonString, "utf-8");
    }

    const caption =
      `📦 <b>Резервная копия PostgreSQL КвИИз</b>\n` +
      `🏷 Версия платформы: <b>v${currentVersion}</b>\n\n` +
      `🎯 Причина: <i>${reason}</i>\n` +
      `⏰ Время (МСК): <code>${mskTimeStr}</code>\n` +
      `🗄 PG Snapshot: <b>${pgSnapshotTriggered ? "Создан в ProTalk" : "Пропущен"}</b>\n` +
      `📊 Таблиц: <b>${allowedTables.length}</b> (с данными: <b>${tablesWithData}</b>)\n` +
      `📈 Всего записей: <b>${totalRows.toLocaleString("ru-RU")}</b>\n` +
      `💾 Размер файла: <b>${(fileBuffer.length / 1024).toFixed(1)} KB</b>`;

    const config = await getTelegramBotConfig();
    const adminId = config.adminTelegramId || "169262990";

    const result = await sendTelegramDocument({
      chatId: adminId,
      fileBuffer,
      filename,
      caption
    });

    if (!result.ok) {
      console.log(`[Backup Engine] Telegram delivery skipped or deferred (${adminId}): ${result.error || "unavailable"}`);
      await sendTelegramMessage({
        chatId: adminId,
        text: `⚠️ <b>Уведомление о бэкапе PostgreSQL (v${currentVersion})</b>\n\nСнимок базы создан (${totalRows} записей), но отправка файла в Telegram не удалась: ${result.error || "Неизвестная ошибка"}`
      }).catch(() => {});
      return {
        success: true,
        totalRows,
        tablesCount: allowedTables.length,
        filename,
        version: currentVersion,
        pgSnapshotTriggered,
        error: result.error
      };
    }

    console.log(`[Backup Engine] Резервная копия PostgreSQL v${currentVersion} (${filename}, ${totalRows} строк) успешно отправлена админу ${adminId} в Telegram.`);
    return {
      success: true,
      totalRows,
      tablesCount: allowedTables.length,
      filename,
      version: currentVersion,
      pgSnapshotTriggered
    };
  } catch (error: any) {
    console.log("[Backup Engine] Ошибка создания бэкапа:", error?.message || error);
    return {
      success: false,
      totalRows: 0,
      tablesCount: 0,
      filename: "",
      version: getSystemSetting("app_version", APP_VERSION) || APP_VERSION,
      error: error?.message || "Unknown error"
    };
  }
}
