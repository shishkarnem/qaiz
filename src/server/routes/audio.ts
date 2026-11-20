import { Router } from 'express';
import { getAll, getOne, runSql } from '../db';
import { ensureSoundsFolder, getDirectFileUrlMap, replaceFilePathWithMap } from './files';
import {
  AUDIO_SECTIONS,
  AUDIO_SLOT_CATALOG,
  AudioInterruptMode,
  AudioPlaybackOrder,
  AudioSlotFileItem
} from '../../shared/audioCatalog';

export const audioRouter = Router();

const VALID_PLAYBACK_ORDERS: AudioPlaybackOrder[] = ['sequential', 'random'];
const VALID_INTERRUPT_MODES: AudioInterruptMode[] = [
  'none',
  'pause_bg',
  'pause_current',
  'pause_all',
  'stop_bg',
  'stop_current',
  'stop_all'
];

export function normalizeAudioUrl(
  rawUrl: string | null | undefined,
  fileId?: number | string | null,
  fileName?: string | null,
  fileUrlMap?: Map<string, string>
): string | null {
  if (fileId && fileUrlMap) {
    const direct = fileUrlMap.get(String(fileId));
    if (direct) return direct;
  }
  if (rawUrl) {
    const trimmed = String(rawUrl).trim();
    if (fileUrlMap && trimmed.includes('/file/')) {
      const resolved = replaceFilePathWithMap(trimmed, fileUrlMap);
      if (resolved) return resolved;
    }
    return trimmed;
  }
  if (fileId) {
    return `/file/${fileId}/${encodeURIComponent(fileName || 'audio.mp3')}`;
  }
  return null;
}

export function parseSlotFiles(
  filesJsonRaw: string | null | undefined,
  fallbackFileId?: number | null,
  fallbackFileKey?: string | null,
  fallbackFileName?: string | null,
  fallbackFileUrl?: string | null,
  fileUrlMap?: Map<string, string>
): AudioSlotFileItem[] {
  if (filesJsonRaw && typeof filesJsonRaw === 'string' && filesJsonRaw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(filesJsonRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned: AudioSlotFileItem[] = [];
        for (const item of parsed) {
          if (!item) continue;
          const fId = item.file_id !== undefined && item.file_id !== null ? Number(item.file_id) : null;
          const fName = String(item.file_name || 'audio.mp3');
          const fUrl = normalizeAudioUrl(item.file_url, fId, fName, fileUrlMap);
          if (fUrl) {
            cleaned.push({
              file_id: fId,
              file_key: item.file_key ? String(item.file_key) : null,
              file_name: fName,
              file_url: fUrl
            });
          }
        }
        if (cleaned.length > 0) return cleaned;
      }
    } catch (_) {}
  }

  const singleUrl = normalizeAudioUrl(fallbackFileUrl, fallbackFileId, fallbackFileName, fileUrlMap);
  if (singleUrl) {
    return [
      {
        file_id: fallbackFileId !== undefined && fallbackFileId !== null ? Number(fallbackFileId) : null,
        file_key: fallbackFileKey || null,
        file_name: fallbackFileName || 'audio.mp3',
        file_url: singleUrl
      }
    ];
  }

  return [];
}

let schemaSeededOnce = false;
let schemaSeedInFlight: Promise<void> | null = null;
let cachedAssetsPayload: { data: any; expiresAt: number } | null = null;
let assetsFetchInFlight: Promise<any> | null = null;

function invalidateAudioAssetsCache() {
  cachedAssetsPayload = null;
}

async function ensureAudioSchemaAndSeed(force: boolean = false) {
  if (schemaSeededOnce && !force) return;
  if (schemaSeedInFlight) return schemaSeedInFlight;

  schemaSeedInFlight = (async () => {
    try {
      await ensureSoundsFolder();

      const existingRows = await getAll<any>(`SELECT * FROM system_audio_assets`);
      const existingMap = new Map<string, any>();
      for (const r of existingRows) {
        existingMap.set(r.slot_key, r);
      }

      const validCatalogKeys = new Set(AUDIO_SLOT_CATALOG.map((s) => s.slot_key));

      for (const r of existingRows) {
        if (!validCatalogKeys.has(r.slot_key)) {
          await runSql(`DELETE FROM system_audio_assets WHERE slot_key = $1`, [r.slot_key]);
          existingMap.delete(r.slot_key);
        }
      }

      for (const slot of AUDIO_SLOT_CATALOG) {
        const existing = existingMap.get(slot.slot_key);

        const defaultOrder: AudioPlaybackOrder = slot.default_playback_order || 'sequential';
        const defaultMaxDur: number = slot.default_max_duration ?? 0;
        const defaultIsBg: number = slot.is_background ? 1 : 0;
        const defaultInterrupt: AudioInterruptMode =
          slot.default_interrupt_mode || (defaultIsBg ? 'stop_bg' : 'none');
        const defaultVol: number = slot.default_volume ?? 0.8;
        const defaultLoop: number = slot.default_loop ? 1 : 0;

        if (!existing) {
          await runSql(
            `INSERT INTO system_audio_assets (
              slot_key, section_id, section_title, subcategory, title, description,
              file_id, file_key, file_name, file_url, files_json,
              playback_order, max_duration, is_background, interrupt_mode,
              volume, loop, is_enabled, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, '[]', $7, $8, $9, $10, $11, $12, 1, NOW())
            ON CONFLICT (slot_key) DO NOTHING`,
            [
              slot.slot_key,
              slot.section_id,
              slot.section_title,
              slot.subcategory,
              slot.title,
              slot.description,
              defaultOrder,
              defaultMaxDur,
              defaultIsBg,
              defaultInterrupt,
              defaultVol,
              defaultLoop
            ]
          );
        } else if (existing.interrupt_mode === null || existing.interrupt_mode === undefined) {
          await runSql(
            `UPDATE system_audio_assets
             SET interrupt_mode = $1,
                 updated_at = NOW()
             WHERE slot_key = $2`,
            [defaultInterrupt, slot.slot_key]
          );
        }
      }
      schemaSeededOnce = true;
    } catch (err) {
      console.warn('Audio schema init warning:', err);
    } finally {
      schemaSeedInFlight = null;
    }
  })();

  return schemaSeedInFlight;
}

// 1. Get all audio slots, sections, and files in 'Звуки' folder
audioRouter.get('/assets', async (_req, res) => {
  try {
    if (cachedAssetsPayload && Date.now() < cachedAssetsPayload.expiresAt) {
      return res.json(cachedAssetsPayload.data);
    }

    if (!assetsFetchInFlight) {
      assetsFetchInFlight = (async () => {
        await ensureAudioSchemaAndSeed();
        const [rows, fileUrlMap] = await Promise.all([
          getAll<any>(`SELECT * FROM system_audio_assets`),
          getDirectFileUrlMap()
        ]);
        const rowMap = new Map<string, any>();
        for (const r of rows) {
          rowMap.set(r.slot_key, r);
        }

        const mergedSlots = AUDIO_SLOT_CATALOG.map((def) => {
          const dbRow = rowMap.get(def.slot_key);

          const files = parseSlotFiles(
            dbRow?.files_json,
            dbRow?.file_id,
            dbRow?.file_key,
            dbRow?.file_name,
            dbRow?.file_url,
            fileUrlMap
          );
          const primary = files[0] || null;

          const isBg =
            dbRow?.is_background !== undefined && dbRow?.is_background !== null
              ? Number(dbRow.is_background) === 1
              : Boolean(def.is_background);

          const playbackOrder: AudioPlaybackOrder =
            dbRow?.playback_order && VALID_PLAYBACK_ORDERS.includes(dbRow.playback_order)
              ? dbRow.playback_order
              : def.default_playback_order || 'sequential';

          const maxDuration =
            dbRow?.max_duration !== undefined && dbRow?.max_duration !== null
              ? Math.max(0, Number(dbRow.max_duration))
              : (def.default_max_duration ?? 0);

          const interruptMode: AudioInterruptMode =
            dbRow?.interrupt_mode && VALID_INTERRUPT_MODES.includes(dbRow.interrupt_mode)
              ? dbRow.interrupt_mode
              : def.default_interrupt_mode || (isBg ? 'stop_bg' : 'none');

          return {
            slot_key: def.slot_key,
            section_id: def.section_id,
            section_title: def.section_title,
            subcategory: def.subcategory,
            title: dbRow?.title || def.title,
            description: dbRow?.description || def.description,
            is_background: isBg,
            file_id: primary?.file_id ?? null,
            file_key: primary?.file_key ?? null,
            file_name: primary?.file_name ?? null,
            file_url: primary?.file_url ?? null,
            files,
            files_json: JSON.stringify(files),
            playback_order: playbackOrder,
            max_duration: maxDuration,
            interrupt_mode: interruptMode,
            volume:
              dbRow?.volume !== undefined && dbRow?.volume !== null
                ? Number(dbRow.volume)
                : (def.default_volume ?? 0.8),
            loop:
              dbRow?.loop !== undefined && dbRow?.loop !== null
                ? Number(dbRow.loop) === 1
                : Boolean(def.default_loop),
            is_enabled:
              dbRow?.is_enabled !== undefined && dbRow?.is_enabled !== null
                ? Number(dbRow.is_enabled) === 1
                : true,
            updated_at: dbRow?.updated_at || null
          };
        });

        const soundFolderFilesRaw = await getAll<any>(
          `SELECT f.id, f.file_key, COALESCE(f.name, f.filename) AS name, f.filename, f.file_type,
                  f.mime_type, f.size, f.original_url, f.url, f.folder_id, f.folder_key, f.created_at,
                  fold.name AS folder_name
           FROM file_storage f
           LEFT JOIN file_folders fold ON f.folder_id = fold.id
           WHERE COALESCE(fold.legacy_id, '') = 'folder_sounds' OR COALESCE(fold.name, '') = 'Звуки' OR f.file_type = 'audio'
           ORDER BY f.id DESC`
        );

        const soundFolderFiles = soundFolderFilesRaw.map((f: any) => {
          const direct = String(f.original_url || f.url || '').trim();
          return {
            ...f,
            direct_url: direct.startsWith('http') ? direct : (fileUrlMap.get(String(f.id)) || direct)
          };
        });

        const payload = {
          sections: AUDIO_SECTIONS,
          slots: mergedSlots,
          soundFiles: soundFolderFiles
        };
        cachedAssetsPayload = { data: payload, expiresAt: Date.now() + 300000 };
        return payload;
      })().finally(() => {
        assetsFetchInFlight = null;
      });
    }

    const payload = await assetsFetchInFlight;
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// 2. Update a specific audio slot (attach/remove/reorder multiple files, playback_order, max_duration, is_background, interrupt_mode, volume, loop, is_enabled)
audioRouter.put('/assets/:slot_key', async (req, res) => {
  try {
    await ensureAudioSchemaAndSeed();
    const { slot_key } = req.params;
    const {
      file_id,
      file_key,
      file_name,
      file_url,
      files,
      append_file,
      remove_index,
      playback_order,
      max_duration,
      is_background,
      interrupt_mode,
      volume,
      loop,
      is_enabled,
      title,
      description
    } = req.body;

    const catalogItem = AUDIO_SLOT_CATALOG.find((s) => s.slot_key === slot_key);
    const existing = await getOne<any>(`SELECT * FROM system_audio_assets WHERE slot_key = $1`, [slot_key]);

    if (!existing && !catalogItem) {
      return res.status(404).json({ error: 'Слот звука не найден' });
    }

    let currentFiles = parseSlotFiles(
      existing?.files_json,
      existing?.file_id,
      existing?.file_key,
      existing?.file_name,
      existing?.file_url
    );

    const soundsFolderId = await ensureSoundsFolder();

    // Helper to resolve a single file object & ensure it is in 'Звуки' folder
    const resolveAndMoveFile = async (input: {
      file_id?: number | null;
      file_key?: string | null;
      file_name?: string | null;
      file_url?: string | null;
    }): Promise<AudioSlotFileItem | null> => {
      const fId = input.file_id !== undefined && input.file_id !== null ? Number(input.file_id) : null;
      let fName = input.file_name || null;
      let fKey = input.file_key || null;
      let fUrl = input.file_url || null;

      if (fId) {
        await runSql(
          `UPDATE file_storage
           SET folder_id = $1,
               folder_key = 'folder_sounds',
               file_type = 'audio'
           WHERE id = $2`,
          [soundsFolderId, fId]
        );
        const fileRecord = await getOne<any>(`SELECT *, COALESCE(name, filename) AS name, COALESCE(original_url, url) AS original_url FROM file_storage WHERE id = $1`, [fId]);
        if (fileRecord) {
          fName = fName || fileRecord.name;
          fKey = fKey || fileRecord.file_key;
          const directOrig = String(fileRecord.original_url || '').trim();
          fUrl = directOrig.startsWith('http') ? directOrig : fUrl;
        }
      }

      const normUrl = normalizeAudioUrl(fUrl, fId, fName);
      if (!normUrl) return null;
      return {
        file_id: fId,
        file_key: fKey,
        file_name: fName || 'audio.mp3',
        file_url: normUrl
      };
    };

    if (Array.isArray(files)) {
      const nextList: AudioSlotFileItem[] = [];
      for (const item of files) {
        if (!item) continue;
        const resolved = await resolveAndMoveFile(item);
        if (resolved) nextList.push(resolved);
      }
      currentFiles = nextList;
    } else if (append_file && typeof append_file === 'object') {
      const resolved = await resolveAndMoveFile(append_file);
      if (resolved) {
        currentFiles = [...currentFiles, resolved];
      }
    } else if (typeof remove_index === 'number') {
      currentFiles = currentFiles.filter((_, idx) => idx !== remove_index);
    } else if (file_id !== undefined || file_url !== undefined) {
      if (file_id === null && !file_url) {
        currentFiles = [];
      } else {
        const resolved = await resolveAndMoveFile({ file_id, file_key, file_name, file_url });
        if (resolved) {
          currentFiles = [resolved];
        }
      }
    }

    const primaryFile = currentFiles[0] || null;

    const nextVolume =
      volume !== undefined
        ? Math.max(0, Math.min(1, Number(volume)))
        : (existing?.volume ?? catalogItem?.default_volume ?? 0.8);

    const nextLoop =
      loop !== undefined
        ? (loop ? 1 : 0)
        : (existing?.loop ?? (catalogItem?.default_loop ? 1 : 0));

    const nextEnabled =
      is_enabled !== undefined
        ? (is_enabled ? 1 : 0)
        : (existing?.is_enabled ?? 1);

    const nextIsBg =
      is_background !== undefined
        ? (is_background ? 1 : 0)
        : (existing?.is_background !== undefined && existing?.is_background !== null
            ? Number(existing.is_background)
            : (catalogItem?.is_background ? 1 : 0));

    const nextPlaybackOrder: AudioPlaybackOrder =
      playback_order && VALID_PLAYBACK_ORDERS.includes(playback_order)
        ? playback_order
        : (existing?.playback_order && VALID_PLAYBACK_ORDERS.includes(existing.playback_order)
            ? existing.playback_order
            : (catalogItem?.default_playback_order || 'sequential'));

    const nextMaxDuration =
      max_duration !== undefined && max_duration !== null
        ? Math.max(0, Number(max_duration))
        : (existing?.max_duration !== undefined && existing?.max_duration !== null
            ? Math.max(0, Number(existing.max_duration))
            : (catalogItem?.default_max_duration ?? 0));

    const nextInterruptMode: AudioInterruptMode =
      interrupt_mode && VALID_INTERRUPT_MODES.includes(interrupt_mode)
        ? interrupt_mode
        : (existing?.interrupt_mode && VALID_INTERRUPT_MODES.includes(existing.interrupt_mode)
            ? existing.interrupt_mode
            : (catalogItem?.default_interrupt_mode || (nextIsBg ? 'stop_bg' : 'none')));

    const nextTitle = title || existing?.title || catalogItem?.title || slot_key;
    const nextDesc = description || existing?.description || catalogItem?.description || '';

    await runSql(
      `INSERT INTO system_audio_assets (
        slot_key, section_id, section_title, subcategory, title, description,
        file_id, file_key, file_name, file_url, files_json,
        playback_order, max_duration, is_background, interrupt_mode,
        volume, loop, is_enabled, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      ON CONFLICT(slot_key) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        file_id = EXCLUDED.file_id,
        file_key = EXCLUDED.file_key,
        file_name = EXCLUDED.file_name,
        file_url = EXCLUDED.file_url,
        files_json = EXCLUDED.files_json,
        playback_order = EXCLUDED.playback_order,
        max_duration = EXCLUDED.max_duration,
        is_background = EXCLUDED.is_background,
        interrupt_mode = EXCLUDED.interrupt_mode,
        volume = EXCLUDED.volume,
        loop = EXCLUDED.loop,
        is_enabled = EXCLUDED.is_enabled,
        updated_at = NOW()`,
      [
        slot_key,
        existing?.section_id || catalogItem?.section_id || 'menu',
        existing?.section_title || catalogItem?.section_title || 'Главное меню и интерфейс',
        existing?.subcategory || catalogItem?.subcategory || 'Общие',
        nextTitle,
        nextDesc,
        primaryFile?.file_id ?? null,
        primaryFile?.file_key ?? null,
        primaryFile?.file_name ?? null,
        primaryFile?.file_url ?? null,
        JSON.stringify(currentFiles),
        nextPlaybackOrder,
        nextMaxDuration,
        nextIsBg,
        nextInterruptMode,
        nextVolume,
        nextLoop,
        nextEnabled
      ]
    );

    const updated = await getOne<any>(`SELECT * FROM system_audio_assets WHERE slot_key = $1`, [slot_key]);
    invalidateAudioAssetsCache();
    res.json({
      success: true,
      slot: {
        ...updated,
        files: currentFiles,
        is_background: Number(updated?.is_background) === 1,
        loop: Number(updated?.loop) === 1,
        is_enabled: Number(updated?.is_enabled) === 1
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Clear all audio files from a slot
audioRouter.delete('/assets/:slot_key', async (req, res) => {
  try {
    const { slot_key } = req.params;
    await runSql(
      `UPDATE system_audio_assets
       SET file_id = NULL,
           file_key = NULL,
           file_name = NULL,
           file_url = NULL,
           files_json = '[]',
           updated_at = NOW()
       WHERE slot_key = $1`,
      [slot_key]
    );
    const updated = await getOne<any>(`SELECT * FROM system_audio_assets WHERE slot_key = $1`, [slot_key]);
    invalidateAudioAssetsCache();
    res.json({ success: true, slot: { ...updated, files: [] } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Synchronize all audio slots with catalog defaults and matching files in file_storage
audioRouter.post('/auto-assign', async (req, res) => {
  try {
    await ensureAudioSchemaAndSeed();
    const overwriteDefaults = req.body?.overwrite !== false;
    const filesRows = await getAll<{ id: number; file_key: string; name: string; original_url?: string }>(
      `SELECT id, file_key, COALESCE(name, filename) AS name, COALESCE(original_url, url) AS original_url
       FROM file_storage
       WHERE file_type = 'audio' OR folder_key = 'folder_sounds'`
    );
    const fileById = new Map<number, { id: number; file_key: string; name: string; original_url?: string }>();
    const fileUrlMap = new Map<string, string>();
    for (const f of filesRows) {
      fileById.set(Number(f.id), f);
      if (f.original_url && String(f.original_url).startsWith('http')) {
        fileUrlMap.set(String(f.id), String(f.original_url));
      }
    }

    const dbAssets = await getAll<any>(`SELECT * FROM system_audio_assets`);
    const assetMap = new Map<string, any>();
    for (const row of dbAssets) {
      assetMap.set(row.slot_key, row);
    }

    let assignedCount = 0;
    for (const slot of AUDIO_SLOT_CATALOG) {
      const existing = assetMap.get(slot.slot_key);
      const currentFiles = parseSlotFiles(
        existing?.files_json,
        existing?.file_id,
        existing?.file_key,
        existing?.file_name,
        existing?.file_url,
        fileUrlMap
      ).map((f) => {
        const matched = f.file_id ? fileById.get(Number(f.file_id)) : undefined;
        if (!matched) return f;
        const directUrl = matched.original_url && String(matched.original_url).startsWith('http')
          ? String(matched.original_url)
          : f.file_url;
        return {
          file_id: matched.id,
          file_key: matched.file_key,
          file_name: matched.name,
          file_url: directUrl
        };
      });

      const primary = currentFiles[0] || null;
      if (primary) {
        assignedCount++;
      }

      if (overwriteDefaults || !existing) {
        const order: AudioPlaybackOrder =
          existing?.playback_order && VALID_PLAYBACK_ORDERS.includes(existing.playback_order)
            ? existing.playback_order
            : (slot.default_playback_order || 'sequential');
        const maxDur = existing?.max_duration ?? slot.default_max_duration ?? 0;
        const isBg = existing?.is_background !== undefined && existing?.is_background !== null
          ? Number(existing.is_background)
          : (slot.is_background ? 1 : 0);
        const interrupt: AudioInterruptMode =
          existing?.interrupt_mode && VALID_INTERRUPT_MODES.includes(existing.interrupt_mode)
            ? existing.interrupt_mode
            : (slot.default_interrupt_mode || (isBg ? 'stop_bg' : 'none'));
        const vol = existing?.volume ?? slot.default_volume ?? 0.8;
        const lp = existing?.loop !== undefined && existing?.loop !== null
          ? Number(existing.loop)
          : (slot.default_loop ? 1 : 0);

        await runSql(
          `UPDATE system_audio_assets
           SET file_id = $1,
               file_key = $2,
               file_name = $3,
               file_url = $4,
               files_json = $5,
               playback_order = $6,
               max_duration = $7,
               is_background = $8,
               interrupt_mode = $9,
               volume = $10,
               loop = $11,
               updated_at = NOW()
           WHERE slot_key = $12`,
          [
            primary?.file_id ?? null,
            primary?.file_key ?? null,
            primary?.file_name ?? null,
            primary?.file_url ?? null,
            JSON.stringify(currentFiles),
            order,
            maxDur,
            isBg,
            interrupt,
            vol,
            lp,
            slot.slot_key
          ]
        );
      }
    }

    invalidateAudioAssetsCache();
    res.json({ success: true, assignedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
