import {
  AudioInterruptMode,
  AudioPlaybackOrder,
  AudioSlotFileItem
} from '../../shared/audioCatalog';
import { DIRECT_MEDIA_URLS } from '../../shared/mediaUrls';
import { safeParseResponseJson } from '../../utils/network/safeFetchJson';
import { AudioCacheManager } from './audioCache';
import { playSynthesizedCroakSound, playSynthesizedSlotPreview } from './audioSynth';

export interface CustomAudioSlotConfig {
  slot_key: string;
  section_id: string;
  file_url: string | null;
  files: AudioSlotFileItem[];
  playback_order: AudioPlaybackOrder;
  max_duration: number;
  is_background: boolean;
  interrupt_mode: AudioInterruptMode;
  volume: number;
  loop: boolean;
  is_enabled: boolean;
}

interface ActiveForegroundTrack {
  id: string;
  slotKey: string;
  audio: HTMLAudioElement;
  volume: number;
  interruptMode: AudioInterruptMode;
  durationTimer: ReturnType<typeof setTimeout> | null;
  pausedByOther: boolean;
}

interface SavedBgPosition {
  rawUrl: string;
  currentTime: number;
}

export const USER_VOLUME_KEY = 'qaiz_user_master_volume';
export const USER_MUTED_KEY = 'qaiz_sound_muted';
export const VOLUME_CHANGE_EVENT = 'qaiz-volume-change';

const CONFIG_RETRY_COOLDOWN_MS = 15000;

class GlobalAudioSystem {
  private slots: Map<string, CustomAudioSlotConfig> = new Map();
  private loadingPromise: Promise<void> | null = null;
  private isConfigLoaded: boolean = false;
  private lastConfigFailedAt: number = 0;

  // Background channel state
  private activeBgAudio: HTMLAudioElement | null = null;
  private activeBgKey: string | null = null;
  private activeBgRawUrl: string | null = null;
  private desiredBgKey: string | null = null;
  private activeBgDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private bgPausedByInterrupt: boolean = false;
  private bgBlockedByAutoplay: boolean = false;
  private savedBgPositions: Map<string, SavedBgPosition> = new Map();

  // Foreground (over-background) channel state
  private activeForegrounds: Map<string, ActiveForegroundTrack> = new Map();

  // Sequence & random tracking per slot_key
  private sequenceCounters: Map<string, number> = new Map();
  private lastRandomIndex: Map<string, number> = new Map();

  // Rapid fire deduplication for UI click/hover slots
  private lastSlotPlayTime: Map<string, number> = new Map();

  // Browser/device cache for same-origin audio links only
  private audioCache = new AudioCacheManager();

  private isMuted: boolean = false;
  private masterVolume: number = 0.5;
  private sharedAudioCtx: AudioContext | null = null;
  private hasUserGesture: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const migrated50 = localStorage.getItem('qaiz_vol_default_50_v2');
        if (!migrated50) {
          this.masterVolume = 0.5;
          this.isMuted = false;
          localStorage.setItem(USER_VOLUME_KEY, '0.5');
          localStorage.setItem(USER_MUTED_KEY, 'false');
          localStorage.setItem('qaiz_vol_default_50_v2', '1');
        } else {
          const savedMuted = localStorage.getItem(USER_MUTED_KEY);
          if (savedMuted !== null) this.isMuted = JSON.parse(savedMuted);
          const savedVol = localStorage.getItem(USER_VOLUME_KEY);
          if (savedVol !== null) {
            const parsed = parseFloat(savedVol);
            if (!isNaN(parsed)) {
              this.masterVolume = Math.max(0, Math.min(1, parsed));
            }
          }
        }
      } catch (_) {}

      this.setupAutoplayUnlockListeners();
      this.refreshConfig().catch(() => {});
    }
  }

  public getHasUserGesture(): boolean {
    return this.hasUserGesture;
  }

  public getSharedAudioContext(): AudioContext | null {
    return this.sharedAudioCtx;
  }

  public ensureAudioUnlocked(fromRealGesture: boolean = false): void {
    if (typeof window === 'undefined') return;
    if (fromRealGesture) {
      this.hasUserGesture = true;
    }
    if (!this.hasUserGesture) return;
    if (this.getEffectiveMasterVolume() <= 0) return;

    const navActivation = (navigator as any)?.userActivation;
    const canStartAudioCtx = !navActivation || Boolean(navActivation.hasBeenActive);
    if (!canStartAudioCtx) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!this.sharedAudioCtx || this.sharedAudioCtx.state === 'closed') {
          this.sharedAudioCtx = new AudioCtx();
        }
        if (this.sharedAudioCtx.state === 'suspended') {
          this.sharedAudioCtx.resume().catch(() => {});
        }
      }
    } catch (_) {}

    if (this.desiredBgKey && !this.bgPausedByInterrupt) {
      if (!this.activeBgAudio) {
        if (this.isConfigLoaded || Date.now() - this.lastConfigFailedAt >= CONFIG_RETRY_COOLDOWN_MS) {
          this.playBackground(this.desiredBgKey);
        }
      } else {
        const slot = this.slots.get(this.activeBgKey || this.desiredBgKey);
        const targetVol = Math.max(0, Math.min(1, (slot?.volume ?? 0.45) * this.getEffectiveMasterVolume()));
        if (this.activeBgAudio.muted) {
          this.activeBgAudio.muted = false;
          this.activeBgAudio.volume = targetVol;
        }
        if (this.activeBgAudio.paused || this.bgBlockedByAutoplay) {
          this.bgBlockedByAutoplay = false;
          this.activeBgAudio.volume = targetVol;
          this.activeBgAudio.play().catch(() => {
            this.bgBlockedByAutoplay = true;
          });
        }
      }
    }
  }

  private setupAutoplayUnlockListeners(): void {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.ensureAudioUnlocked(true);
    };

    // Only real user-activation gestures (never mousemove/pointermove/scroll/visibilitychange)
    const gestureEvents = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'];
    for (const evt of gestureEvents) {
      window.addEventListener(evt, unlock, { passive: true, capture: true });
      document.addEventListener(evt, unlock, { passive: true, capture: true });
    }
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getEffectiveMasterVolume(): number {
    return this.isMuted ? 0 : this.masterVolume;
  }

  public setMasterVolume(vol: number): void {
    this.hasUserGesture = true;
    const clamped = Math.max(0, Math.min(1, vol));
    this.masterVolume = clamped;
    if (clamped > 0 && this.isMuted) {
      this.isMuted = false;
    } else if (clamped === 0) {
      this.isMuted = true;
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(USER_VOLUME_KEY, String(clamped));
        localStorage.setItem(USER_MUTED_KEY, JSON.stringify(this.isMuted));
      } catch (_) {}
      this.syncActiveAudioVolume();
      window.dispatchEvent(
        new CustomEvent(VOLUME_CHANGE_EVENT, {
          detail: { volume: this.masterVolume, muted: this.isMuted }
        })
      );
    }
  }

  public setMuted(muted: boolean): void {
    this.hasUserGesture = true;
    this.isMuted = Boolean(muted);
    if (!this.isMuted && this.masterVolume <= 0) {
      this.masterVolume = 0.5;
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(USER_MUTED_KEY, JSON.stringify(this.isMuted));
        localStorage.setItem(USER_VOLUME_KEY, String(this.masterVolume));
      } catch (_) {}
      this.syncActiveAudioVolume();
      window.dispatchEvent(
        new CustomEvent(VOLUME_CHANGE_EVENT, {
          detail: { volume: this.masterVolume, muted: this.isMuted }
        })
      );
    }
  }

  private syncActiveAudioVolume(): void {
    const master = this.getEffectiveMasterVolume();
    if (master <= 0) {
      if (this.activeBgAudio && !this.activeBgAudio.paused) {
        try {
          if (this.activeBgKey && this.activeBgRawUrl) {
            this.savedBgPositions.set(this.activeBgKey, {
              rawUrl: this.activeBgRawUrl,
              currentTime: this.activeBgAudio.currentTime || 0
            });
          }
          this.activeBgAudio.pause();
        } catch (_) {}
      }
      for (const fg of this.activeForegrounds.values()) {
        fg.audio.volume = 0;
      }
      return;
    }

    if (this.activeBgAudio && this.activeBgKey) {
      const slot = this.slots.get(this.activeBgKey);
      const baseVol = slot?.volume ?? 0.45;
      this.activeBgAudio.volume = Math.max(0, Math.min(1, baseVol * master));
      if (this.activeBgAudio.paused && !this.bgPausedByInterrupt) {
        this.activeBgAudio.play().catch(() => {
          this.bgBlockedByAutoplay = true;
        });
      }
    } else if (this.desiredBgKey && !this.bgPausedByInterrupt && this.isConfigLoaded) {
      this.playBackground(this.desiredBgKey);
    }

    for (const fg of this.activeForegrounds.values()) {
      fg.audio.volume = Math.max(0, Math.min(1, fg.volume * master));
    }
  }

  public async refreshConfig(force: boolean = false): Promise<void> {
    if (this.loadingPromise) return this.loadingPromise;
    if (!force && !this.isConfigLoaded && this.lastConfigFailedAt > 0) {
      if (Date.now() - this.lastConfigFailedAt < CONFIG_RETRY_COOLDOWN_MS) {
        return;
      }
    }

    this.loadingPromise = (async () => {
      try {
        const res = await fetch('/api/audio/assets');
        if (!res.ok) {
          this.lastConfigFailedAt = Date.now();
          return;
        }
        const data = await safeParseResponseJson<{ slots?: any[] }>(res);
        if (data && Array.isArray(data.slots)) {
          const next = new Map<string, CustomAudioSlotConfig>();
          for (const s of data.slots) {
            const files: AudioSlotFileItem[] =
              Array.isArray(s.files) && s.files.length > 0
                ? s.files
                : s.file_url
                ? [
                    {
                      file_id: s.file_id ?? null,
                      file_key: s.file_key ?? null,
                      file_name: s.file_name || 'audio.mp3',
                      file_url: s.file_url
                    }
                  ]
                : [];
            next.set(s.slot_key, {
              slot_key: s.slot_key,
              section_id: s.section_id || 'menu',
              file_url: files[0]?.file_url || s.file_url || null,
              files,
              playback_order: s.playback_order === 'random' ? 'random' : 'sequential',
              max_duration: typeof s.max_duration === 'number' ? Math.max(0, s.max_duration) : 0,
              is_background: Boolean(s.is_background),
              interrupt_mode: s.interrupt_mode || (s.is_background ? 'stop_bg' : 'none'),
              volume: typeof s.volume === 'number' ? s.volume : 0.8,
              loop: Boolean(s.loop),
              is_enabled: s.is_enabled !== false
            });
          }
          this.slots = next;
          this.isConfigLoaded = true;
          this.lastConfigFailedAt = 0;

          if (this.desiredBgKey && !this.activeBgAudio) {
            this.playBackground(this.desiredBgKey);
          }
        } else {
          this.lastConfigFailedAt = Date.now();
        }
      } catch {
        this.lastConfigFailedAt = Date.now();
      } finally {
        this.loadingPromise = null;
      }
    })();
    return this.loadingPromise;
  }

  public resolveAndCacheAudioUrl(rawUrl: string): string {
    return this.audioCache.resolveAndCacheAudioUrl(rawUrl);
  }

  private enqueuePreloadUrls(urls: string[], highPriority: boolean = false): void {
    this.audioCache.enqueuePreloadUrls(urls, highPriority);
  }

  public async preloadSlots(slotKeys: string[], highPriority: boolean = false): Promise<void> {
    if (!this.isConfigLoaded) {
      await this.refreshConfig();
    }
    if (!this.isConfigLoaded) return;
    const urls: string[] = [];
    for (const key of slotKeys) {
      const slot = this.slots.get(key);
      if (!slot || !slot.is_enabled) continue;
      for (const f of slot.files) {
        if (f.file_url) urls.push(f.file_url);
      }
    }
    this.enqueuePreloadUrls(urls, highPriority);
  }

  public async preloadSections(sectionIds: string[], prioritySlotKeys: string[] = []): Promise<void> {
    if (!this.isConfigLoaded) {
      await this.refreshConfig();
    }
    if (!this.isConfigLoaded) return;
    if (prioritySlotKeys.length > 0) {
      await this.preloadSlots(prioritySlotKeys, true);
    }
    const sectionSet = new Set(sectionIds);
    const urls: string[] = [];
    for (const slot of this.slots.values()) {
      if (!slot.is_enabled || !sectionSet.has(slot.section_id)) continue;
      for (const f of slot.files) {
        if (f.file_url) urls.push(f.file_url);
      }
    }
    this.enqueuePreloadUrls(urls, false);
  }

  public async preloadGameBatch(gameId: string, includeMultiplayer: boolean = false): Promise<void> {
    const sections = [gameId, 'melody'];
    if (includeMultiplayer) sections.push('multiplayer');
    await this.preloadSections(sections, ['fx_ai_pack_ready', 'fx_snake_minigame_eat']);
  }

  public pickNextRawFileForSlot(slot: CustomAudioSlotConfig): string | null {
    const list =
      Array.isArray(slot.files) && slot.files.length > 0
        ? slot.files
        : slot.file_url
        ? [{ file_id: null, file_key: null, file_name: 'audio.mp3', file_url: slot.file_url }]
        : [];

    if (list.length === 0) return null;
    if (list.length === 1) return list[0].file_url;

    if (slot.playback_order === 'random') {
      const prevIdx = this.lastRandomIndex.get(slot.slot_key) ?? -1;
      let nextIdx = Math.floor(Math.random() * list.length);
      if (list.length > 1 && nextIdx === prevIdx) {
        nextIdx = (nextIdx + 1) % list.length;
      }
      this.lastRandomIndex.set(slot.slot_key, nextIdx);
      return list[nextIdx].file_url;
    } else {
      const currentIdx = this.sequenceCounters.get(slot.slot_key) ?? 0;
      const picked = list[currentIdx % list.length];
      this.sequenceCounters.set(slot.slot_key, (currentIdx + 1) % list.length);
      return picked.file_url;
    }
  }

  public pickNextFileForSlot(slot: CustomAudioSlotConfig): string | null {
    const raw = this.pickNextRawFileForSlot(slot);
    if (!raw) return null;
    return this.resolveAndCacheAudioUrl(raw);
  }

  private applyInterruptOnStart(interruptMode: AudioInterruptMode, excludeFgId?: string): void {
    if (interruptMode === 'none') return;

    if (interruptMode === 'stop_bg' || interruptMode === 'stop_all') {
      this.stopBackground(false);
    }
    if (interruptMode === 'stop_current' || interruptMode === 'stop_all') {
      this.stopAllForeground(excludeFgId);
    }

    if (interruptMode === 'pause_bg' || interruptMode === 'pause_all') {
      this.bgPausedByInterrupt = true;
      if (this.activeBgAudio) {
        try {
          this.activeBgAudio.pause();
        } catch (_) {}
      }
    }

    if (interruptMode === 'pause_current' || interruptMode === 'pause_all') {
      for (const [id, fg] of this.activeForegrounds.entries()) {
        if (id === excludeFgId) continue;
        if (!fg.audio.paused) {
          try {
            fg.audio.pause();
            fg.pausedByOther = true;
          } catch (_) {}
        }
      }
    }
  }

  private restorePausedSoundsIfFree(): void {
    let anyNeedsBgPaused = false;
    let anyNeedsCurrentPaused = false;

    for (const fg of this.activeForegrounds.values()) {
      if (!fg.pausedByOther) {
        if (fg.interruptMode === 'pause_bg' || fg.interruptMode === 'pause_all') {
          anyNeedsBgPaused = true;
        }
        if (fg.interruptMode === 'pause_current' || fg.interruptMode === 'pause_all') {
          anyNeedsCurrentPaused = true;
        }
      }
    }

    if (!anyNeedsCurrentPaused) {
      for (const fg of this.activeForegrounds.values()) {
        if (fg.pausedByOther) {
          fg.pausedByOther = false;
          fg.audio.play().catch(() => {});
        }
      }
    }

    if (!anyNeedsBgPaused && this.bgPausedByInterrupt && this.activeBgAudio) {
      this.bgPausedByInterrupt = false;
      if (this.getEffectiveMasterVolume() > 0) {
        this.activeBgAudio.play().catch(() => {
          this.bgBlockedByAutoplay = true;
        });
      }
    }
  }

  public stopAllForeground(excludeId?: string): void {
    for (const [id, fg] of this.activeForegrounds.entries()) {
      if (excludeId && id === excludeId) continue;
      if (fg.durationTimer) clearTimeout(fg.durationTimer);
      try {
        fg.audio.pause();
        fg.audio.currentTime = 0;
      } catch (_) {}
      this.activeForegrounds.delete(id);
    }
  }

  public stopSlot(slotKey: string): void {
    if (!slotKey) return;
    if (this.activeBgKey === slotKey) {
      this.stopBackground(false);
    }
    let stoppedAny = false;
    for (const [id, fg] of this.activeForegrounds.entries()) {
      if (fg.slotKey === slotKey) {
        if (fg.durationTimer) clearTimeout(fg.durationTimer);
        try {
          fg.audio.pause();
          fg.audio.currentTime = 0;
        } catch (_) {}
        this.activeForegrounds.delete(id);
        stoppedAny = true;
      }
    }
    if (stoppedAny) {
      this.restorePausedSoundsIfFree();
    }
  }

  public playSlot(slotKey: string, fallbackFn?: () => void): boolean {
    const effectiveMaster = this.getEffectiveMasterVolume();
    if (effectiveMaster <= 0) return false;

    const now = Date.now();
    const lastPlayed = this.lastSlotPlayTime.get(slotKey) || 0;
    if (now - lastPlayed < 65) {
      return true;
    }
    this.lastSlotPlayTime.set(slotKey, now);

    const effectiveFallback = fallbackFn || (() => this.playSynthesizedPreview(slotKey, 0.75));

    if (!this.isConfigLoaded) {
      this.refreshConfig().then(() => {
        if (!this.isConfigLoaded) {
          effectiveFallback();
          return;
        }
        const loadedSlot = this.slots.get(slotKey);
        if (!loadedSlot) {
          effectiveFallback();
          return;
        }
        if (!loadedSlot.is_enabled) return;
        if (loadedSlot.is_background) {
          this.playBackground(slotKey);
        } else {
          const url = this.pickNextFileForSlot(loadedSlot);
          if (url) {
            this.playSlotWithConfig(loadedSlot, url, effectiveFallback);
          } else {
            effectiveFallback();
          }
        }
      });
      return true;
    }

    const slot = this.slots.get(slotKey);
    if (!slot) {
      effectiveFallback();
      return false;
    }
    if (!slot.is_enabled) {
      return false;
    }

    if (slot.is_background) {
      const nextUrl = this.pickNextRawFileForSlot(slot);
      if (nextUrl) {
        this.playBackground(slotKey);
        return true;
      }
      if (fallbackFn) fallbackFn();
      return false;
    }

    const pickedUrl = this.pickNextFileForSlot(slot);
    if (pickedUrl) {
      return this.playSlotWithConfig(slot, pickedUrl, effectiveFallback);
    }

    effectiveFallback();
    return false;
  }

  public playSlotWithConfig(
    slot: CustomAudioSlotConfig,
    explicitUrl?: string,
    fallbackFn?: () => void,
    onEndedCallback?: () => void
  ): boolean {
    const effectiveMaster = this.getEffectiveMasterVolume();
    if (effectiveMaster <= 0) return false;

    const effectiveFallback =
      fallbackFn || (() => this.playSynthesizedPreview(slot.slot_key, slot.volume ?? 0.8));
    const targetUrl = explicitUrl || this.pickNextFileForSlot(slot);
    if (!targetUrl) {
      effectiveFallback();
      return false;
    }

    const fgId = `${slot.slot_key}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.applyInterruptOnStart(slot.interrupt_mode || 'none', fgId);

    try {
      const audio = new Audio(targetUrl);
      const baseVol = slot.volume ?? 0.8;
      audio.volume = Math.max(0, Math.min(1, baseVol * effectiveMaster));
      const hasMultipleFiles = Array.isArray(slot.files) && slot.files.length > 1;
      audio.loop = Boolean(slot.loop) && !hasMultipleFiles;

      const finishTrack = () => {
        const record = this.activeForegrounds.get(fgId);
        if (record?.durationTimer) {
          clearTimeout(record.durationTimer);
        }
        this.activeForegrounds.delete(fgId);
        try {
          audio.pause();
        } catch (_) {}
        this.restorePausedSoundsIfFree();
        if (onEndedCallback) onEndedCallback();
      };

      let durationTimer: ReturnType<typeof setTimeout> | null = null;
      if (slot.max_duration && slot.max_duration > 0) {
        durationTimer = setTimeout(() => {
          finishTrack();
        }, slot.max_duration * 1000);
      }

      const trackRecord: ActiveForegroundTrack = {
        id: fgId,
        slotKey: slot.slot_key,
        audio,
        volume: baseVol,
        interruptMode: slot.interrupt_mode || 'none',
        durationTimer,
        pausedByOther: false
      };

      this.activeForegrounds.set(fgId, trackRecord);

      audio.onended = () => {
        if (slot.loop && hasMultipleFiles && this.activeForegrounds.has(fgId)) {
          const nextUrl = this.pickNextFileForSlot(slot);
          if (nextUrl) {
            audio.src = nextUrl;
            audio.play().catch(() => finishTrack());
            return;
          }
        }
        finishTrack();
      };

      audio.onerror = () => {
        finishTrack();
        effectiveFallback();
      };

      audio.play().catch(() => {
        finishTrack();
        effectiveFallback();
      });

      return true;
    } catch (_) {
      this.restorePausedSoundsIfFree();
      effectiveFallback();
      return false;
    }
  }

  public playBackground(slotKey: string) {
    this.desiredBgKey = slotKey;

    if (!this.isConfigLoaded) {
      this.refreshConfig().then(() => {
        if (this.isConfigLoaded && this.desiredBgKey === slotKey) {
          this.playBackground(slotKey);
        }
      });
      return;
    }

    const effectiveMaster = this.getEffectiveMasterVolume();
    if (effectiveMaster <= 0) {
      return;
    }

    let slot = this.slots.get(slotKey);
    if (!slot) {
      const genDefaults: Record<string, { url: string; name: string; id: number }> = {
        blitz_bg_generation: { id: 58, name: 'baraban_1995_hq.mp3', url: DIRECT_MEDIA_URLS.AUDIO_BLITZ_GEN },
        mill_bg_generation: { id: 165, name: 'us-open-walkout.mp3', url: DIRECT_MEDIA_URLS.AUDIO_MILL_GEN },
        sto_bg_generation: { id: 215, name: 'main_almost_full_reconstr.mp3', url: DIRECT_MEDIA_URLS.AUDIO_STO_GEN },
        www_bg_generation: { id: 196, name: 'meeting.mp3', url: DIRECT_MEDIA_URLS.AUDIO_WWW_GEN },
        jeopardy_bg_generation: { id: 210, name: 'si_closing.mp3', url: DIRECT_MEDIA_URLS.AUDIO_JEOPARDY_GEN }
      };
      const def = genDefaults[slotKey];
      if (def) {
        slot = {
          slot_key: slotKey,
          section_id: 'menu',
          file_url: def.url,
          files: [{ file_id: def.id, file_key: null, file_name: def.name, file_url: def.url }],
          playback_order: 'sequential',
          max_duration: 0,
          is_background: true,
          interrupt_mode: 'stop_bg',
          volume: 0.5,
          loop: true,
          is_enabled: true
        };
      }
    }
    if (!slot || !slot.is_enabled) {
      return;
    }

    if (this.activeBgKey === slotKey && this.activeBgAudio) {
      this.activeBgAudio.volume = Math.max(0, Math.min(1, (slot.volume ?? 0.45) * effectiveMaster));
      if (this.activeBgAudio.paused && !this.bgPausedByInterrupt) {
        this.activeBgAudio.play().catch(() => {
          this.bgBlockedByAutoplay = true;
        });
      }
      return;
    }

    if (
      this.activeBgAudio &&
      !this.activeBgAudio.paused &&
      this.activeBgRawUrl &&
      Array.isArray(slot.files) &&
      slot.files.some((f) => f.file_url === this.activeBgRawUrl)
    ) {
      if (this.activeBgDurationTimer) {
        clearTimeout(this.activeBgDurationTimer);
        this.activeBgDurationTimer = null;
      }
      this.activeBgKey = slotKey;
      this.activeBgAudio.volume = Math.max(0, Math.min(1, (slot.volume ?? 0.45) * effectiveMaster));
      if (slot.max_duration && slot.max_duration > 0) {
        this.activeBgDurationTimer = setTimeout(() => {
          if (this.activeBgKey === slotKey) {
            this.stopBackground(false);
          }
        }, slot.max_duration * 1000);
      }
      return;
    }

    if (this.activeBgKey && this.activeBgAudio && this.activeBgRawUrl) {
      try {
        if (this.activeBgAudio.currentTime > 0) {
          this.savedBgPositions.set(this.activeBgKey, {
            rawUrl: this.activeBgRawUrl,
            currentTime: this.activeBgAudio.currentTime
          });
        }
      } catch (_) {}
    }

    const savedPos = this.savedBgPositions.get(slotKey);
    let pickedRawUrl: string | null = null;
    let resumeTime = 0;

    if (
      savedPos &&
      savedPos.rawUrl &&
      Array.isArray(slot.files) &&
      slot.files.some((f) => f.file_url === savedPos.rawUrl)
    ) {
      pickedRawUrl = savedPos.rawUrl;
      resumeTime = savedPos.currentTime;
    } else {
      pickedRawUrl = this.pickNextRawFileForSlot(slot);
    }

    if (!pickedRawUrl) {
      return;
    }

    const playableUrl = this.resolveAndCacheAudioUrl(pickedRawUrl);

    if (slot.interrupt_mode === 'stop_current' || slot.interrupt_mode === 'stop_all') {
      this.stopAllForeground();
    }
    this.stopBackground(false);

    try {
      const audio = new Audio(playableUrl);
      audio.preload = 'auto';
      audio.autoplay = this.hasUserGesture;
      (audio as any).playsInline = true;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      const targetVolume = Math.max(0, Math.min(1, (slot.volume ?? 0.45) * effectiveMaster));
      audio.volume = targetVolume;
      const hasMultipleFiles = Array.isArray(slot.files) && slot.files.length > 1;
      audio.loop = slot.loop !== false && !hasMultipleFiles;

      if (resumeTime > 0) {
        const setResume = () => {
          try {
            if (audio.duration && resumeTime < audio.duration - 1) {
              audio.currentTime = resumeTime;
            }
          } catch (_) {}
        };
        if (audio.readyState >= 1) {
          setResume();
        } else {
          audio.addEventListener('loadedmetadata', setResume, { once: true });
        }
      }

      let anyFgPausesBg = false;
      for (const fg of this.activeForegrounds.values()) {
        if (!fg.pausedByOther && (fg.interruptMode === 'pause_bg' || fg.interruptMode === 'pause_all')) {
          anyFgPausesBg = true;
          break;
        }
      }

      this.activeBgAudio = audio;
      this.activeBgKey = slotKey;
      this.activeBgRawUrl = pickedRawUrl;
      this.bgPausedByInterrupt = anyFgPausesBg;
      this.bgBlockedByAutoplay = false;

      if (slot.max_duration && slot.max_duration > 0) {
        this.activeBgDurationTimer = setTimeout(() => {
          if (this.activeBgKey === slotKey) {
            this.stopBackground(false);
          }
        }, slot.max_duration * 1000);
      }

      audio.onended = () => {
        if (this.activeBgKey !== slotKey) return;
        this.savedBgPositions.delete(slotKey);
        if (slot.loop !== false && hasMultipleFiles) {
          const nextRaw = this.pickNextRawFileForSlot(slot);
          if (nextRaw && this.activeBgAudio) {
            this.activeBgRawUrl = nextRaw;
            this.activeBgAudio.src = this.resolveAndCacheAudioUrl(nextRaw);
            this.activeBgAudio.play().catch(() => {
              this.bgBlockedByAutoplay = true;
            });
            return;
          }
        }
        this.stopBackground(false);
      };

      const attemptStart = () => {
        if (this.activeBgAudio !== audio || this.bgPausedByInterrupt) return;
        audio.muted = false;
        audio.volume = Math.max(0, Math.min(1, (slot.volume ?? 0.45) * this.getEffectiveMasterVolume()));
        audio.play().catch(() => {
          this.bgBlockedByAutoplay = true;
        });
      };

      if (!anyFgPausesBg) {
        if (this.hasUserGesture) {
          attemptStart();
        } else {
          this.bgBlockedByAutoplay = true;
        }
      }
    } catch (_) {}
  }

  public stopBackground(clearDesired: boolean = true) {
    if (clearDesired) {
      this.desiredBgKey = null;
    }
    if (this.activeBgDurationTimer) {
      clearTimeout(this.activeBgDurationTimer);
      this.activeBgDurationTimer = null;
    }
    if (this.activeBgAudio) {
      try {
        if (this.activeBgKey && this.activeBgRawUrl && this.activeBgAudio.currentTime > 0) {
          this.savedBgPositions.set(this.activeBgKey, {
            rawUrl: this.activeBgRawUrl,
            currentTime: this.activeBgAudio.currentTime
          });
        }
        this.activeBgAudio.pause();
      } catch (_) {}
      this.activeBgAudio = null;
      this.activeBgKey = null;
      this.activeBgRawUrl = null;
      this.bgPausedByInterrupt = false;
      this.bgBlockedByAutoplay = false;
    }
  }

  public stopAllSounds() {
    this.stopAllForeground();
    this.stopBackground(true);
  }

  public playSynthesizedPreview(slotKey: string, slotVolume: number = 0.8): void {
    const effectiveMaster = this.isMuted ? 0 : this.masterVolume > 0 ? this.masterVolume : 0.8;
    playSynthesizedSlotPreview(
      slotKey,
      slotVolume,
      effectiveMaster,
      this.sharedAudioCtx,
      this.hasUserGesture
    );
  }

  public playSynthesizedCroak(): void {
    playSynthesizedCroakSound(
      this.getEffectiveMasterVolume(),
      this.sharedAudioCtx,
      this.hasUserGesture
    );
  }
}

export const audioSystem = new GlobalAudioSystem();
