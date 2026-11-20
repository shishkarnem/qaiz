import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Music,
  Upload,
  Play,
  Pause,
  Trash2,
  Search,
  Volume2,
  VolumeX,
  Repeat,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  RefreshCw,
  Sliders,
  Sparkles,
  X,
  Check,
  ChevronDown,
  FileAudio,
  Shuffle,
  ListOrdered,
  Clock,
  Layers,
  ShieldAlert,
  Plus,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { LeafButton } from '../ui/LeafButton';
import { BubbleElement } from '../ui/BubbleElement';
import { useFileUpload } from '../../hooks/useFileUpload';
import { StoredFileRecord } from '../../services/FileUploadService';
import { audioSystem } from '../../hooks/useSound';
import { useAuth } from '../../context/AuthContext';
import {
  AudioSectionInfo,
  AudioInterruptMode,
  AudioPlaybackOrder,
  AudioSlotFileItem,
  AUDIO_INTERRUPT_MODE_LABELS
} from '../../shared/audioCatalog';

interface AudioSlotRecord {
  slot_key: string;
  section_id: string;
  section_title: string;
  subcategory: string;
  title: string;
  description: string;
  is_background: boolean;
  file_id: number | null;
  file_key: string | null;
  file_name: string | null;
  file_url: string | null;
  files: AudioSlotFileItem[];
  playback_order: AudioPlaybackOrder;
  max_duration: number;
  interrupt_mode: AudioInterruptMode;
  volume: number;
  loop: boolean;
  is_enabled: boolean;
  updated_at: string | null;
}

const DURATION_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: 'Весь трек' },
  { value: 2, label: '2 сек' },
  { value: 5, label: '5 сек' },
  { value: 10, label: '10 сек' },
  { value: 15, label: '15 сек' },
  { value: 30, label: '30 сек' },
  { value: 60, label: '60 сек' }
];

const INTERRUPT_OPTIONS: { id: AudioInterruptMode; label: string; shortLabel: string }[] = [
  { id: 'none', label: 'Не прерывать (играть поверх всех)', shortLabel: 'Поверх всех' },
  { id: 'pause_bg', label: 'Пауза всех фоновых звуков (на время воспроизведения)', shortLabel: 'Пауза фоновых' },
  { id: 'pause_current', label: 'Пауза текущих звуков (на время воспроизведения)', shortLabel: 'Пауза текущих' },
  { id: 'pause_all', label: 'Пауза всех фоновых и текущих звуков', shortLabel: 'Пауза всех' },
  { id: 'stop_bg', label: 'Остановка фоновых звуков полностью', shortLabel: 'Стоп фоновых' },
  { id: 'stop_current', label: 'Остановка текущих звуков полностью', shortLabel: 'Стоп текущих' },
  { id: 'stop_all', label: 'Остановка всех звуков полностью', shortLabel: 'Стоп всех' }
];

export const SystemAudioManager: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { upload, uploading, progress: uploadProgress } = useFileUpload();

  const [sections, setSections] = useState<AudioSectionInfo[]>([]);
  const [slots, setSlots] = useState<AudioSlotRecord[]>([]);
  const [soundFiles, setSoundFiles] = useState<StoredFileRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeSectionId, setActiveSectionId] = useState<string>('all');
  const [activeSubcategory, setActiveSubcategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'multi' | 'background' | 'foreground' | 'pause' | 'stop'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSectionOpen, setIsMobileSectionOpen] = useState(false);

  // Currently uploading / saving slot key
  const [uploadingSlotKey, setUploadingSlotKey] = useState<string | null>(null);
  const [savingSlotKey, setSavingSlotKey] = useState<string | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);

  // Audio preview state
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slotSeqPreviewCounterRef = useRef<Map<string, number>>(new Map());

  // Modals: URL upload or Pick from folder 'Звуки'
  const [pickerModalSlotKey, setPickerModalSlotKey] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');

  // Status banner
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const singleFileInputRef = useRef<HTMLInputElement | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSlotForFileRef = useRef<string | null>(null);

  const pickerModalSlot = useMemo(
    () => slots.find((s) => s.slot_key === pickerModalSlotKey) || null,
    [slots, pickerModalSlotKey]
  );

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const getAuthHeaders = () => {
    const uid = String(profile?.uid || localStorage.getItem('qaiz_user_uid') || '');
    return {
      'x-user-uid': uid,
      'x-admin-uid': uid,
      Accept: 'application/json'
    };
  };

  const stopPreviewAudio = () => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (audioPreviewRef.current) {
      try {
        audioPreviewRef.current.pause();
        audioPreviewRef.current.currentTime = 0;
      } catch (_) {}
      audioPreviewRef.current = null;
    }
    setPlayingKey(null);
  };

  const fetchAudioData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/audio/assets', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sections)) setSections(data.sections);
        if (Array.isArray(data.slots)) {
          setSlots(
            data.slots.map((s: any) => ({
              ...s,
              files: Array.isArray(s.files)
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
                : [],
              playback_order: s.playback_order === 'random' ? 'random' : 'sequential',
              max_duration: typeof s.max_duration === 'number' ? s.max_duration : 0,
              is_background: Boolean(s.is_background),
              interrupt_mode: s.interrupt_mode || (s.is_background ? 'stop_bg' : 'none')
            }))
          );
        }
        if (Array.isArray(data.soundFiles)) setSoundFiles(data.soundFiles);
      }
    } catch (err: any) {
      showToast('Ошибка загрузки списка звуковых слотов', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudioData();
    return () => {
      stopPreviewAudio();
    };
  }, []);

  useEffect(() => {
    setActiveSubcategory('all');
  }, [activeSectionId]);

  const subcategories = useMemo(() => {
    const set = new Set<string>();
    slots.forEach((s) => {
      if (activeSectionId === 'all' || s.section_id === activeSectionId) {
        set.add(s.subcategory);
      }
    });
    return Array.from(set);
  }, [slots, activeSectionId]);

  const filteredSlots = useMemo(() => {
    return slots.filter((s) => {
      if (activeSectionId !== 'all' && s.section_id !== activeSectionId) return false;
      if (activeSubcategory !== 'all' && s.subcategory !== activeSubcategory) return false;
      if (statusFilter === 'multi' && s.files.length <= 1) return false;
      if (statusFilter === 'background' && !s.is_background) return false;
      if (statusFilter === 'foreground' && s.is_background) return false;
      if (statusFilter === 'pause' && !s.interrupt_mode.startsWith('pause_')) return false;
      if (statusFilter === 'stop' && !s.interrupt_mode.startsWith('stop_')) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const fileMatch = s.files.some((f) => f.file_name.toLowerCase().includes(q));
        return (
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.slot_key.toLowerCase().includes(q) ||
          s.subcategory.toLowerCase().includes(q) ||
          fileMatch
        );
      }
      return true;
    });
  }, [slots, activeSectionId, activeSubcategory, statusFilter, searchQuery]);

  const groupedSlots = useMemo(() => {
    const map = new Map<string, { sectionTitle: string; subMap: Map<string, AudioSlotRecord[]> }>();
    for (const s of filteredSlots) {
      if (!map.has(s.section_id)) {
        map.set(s.section_id, { sectionTitle: s.section_title, subMap: new Map() });
      }
      const secGroup = map.get(s.section_id)!;
      if (!secGroup.subMap.has(s.subcategory)) {
        secGroup.subMap.set(s.subcategory, []);
      }
      secGroup.subMap.get(s.subcategory)!.push(s);
    }
    return Array.from(map.entries());
  }, [filteredSlots]);

  const stats = useMemo(() => {
    const total = slots.length;
    const assigned = slots.filter((s) => s.files.length > 0).length;
    const multiCount = slots.filter((s) => s.files.length > 1).length;
    const bgCount = slots.filter((s) => s.is_background).length;
    const fgCount = total - bgCount;
    const pauseCount = slots.filter((s) => s.interrupt_mode.startsWith('pause_')).length;
    const stopCount = slots.filter((s) => s.interrupt_mode.startsWith('stop_')).length;
    return {
      total,
      assigned,
      multiCount,
      bgCount,
      fgCount,
      pauseCount,
      stopCount,
      folderCount: soundFiles.length
    };
  }, [slots, soundFiles]);

  const getEffectivePreviewVolume = (slotVol?: number) => {
    const base = typeof slotVol === 'number' ? slotVol : 0.8;
    const userMaster = audioSystem.getIsMuted() ? 0 : audioSystem.getMasterVolume();
    const effectiveMaster = userMaster > 0 ? userMaster : audioSystem.getMasterVolume() || 0.8;
    return Math.max(0, Math.min(1, base * effectiveMaster));
  };

  useEffect(() => {
    const handleMasterVolChange = () => {
      if (audioPreviewRef.current && playingKey) {
        const activeSlot = slots.find(
          (s) => s.slot_key === playingKey || playingKey.startsWith(`${s.slot_key}__`)
        );
        const slotVol = activeSlot?.volume ?? pickerModalSlot?.volume ?? 0.8;
        const userMaster = audioSystem.getEffectiveMasterVolume();
        audioPreviewRef.current.volume = Math.max(0, Math.min(1, slotVol * userMaster));
      }
    };
    window.addEventListener('qaiz-volume-change', handleMasterVolChange);
    return () => window.removeEventListener('qaiz-volume-change', handleMasterVolChange);
  }, [playingKey, slots, pickerModalSlot]);

  // Play the entire slot using its playback_order (random/sequential), max_duration, loop
  const togglePlaySlotPreview = (slot: AudioSlotRecord) => {
    if (playingKey === slot.slot_key) {
      stopPreviewAudio();
      return;
    }
    stopPreviewAudio();

    if (!slot.files || slot.files.length === 0) {
      audioSystem.playSynthesizedPreview(slot.slot_key, slot.volume ?? 0.8);
      return;
    }

    let pickedIndex = 0;
    if (slot.files.length > 1) {
      if (slot.playback_order === 'random') {
        pickedIndex = Math.floor(Math.random() * slot.files.length);
      } else {
        const curr = slotSeqPreviewCounterRef.current.get(slot.slot_key) ?? 0;
        pickedIndex = curr % slot.files.length;
        slotSeqPreviewCounterRef.current.set(slot.slot_key, (curr + 1) % slot.files.length);
      }
    }

    const pickedFile = slot.files[pickedIndex];
    const rawPlayableUrl =
      pickedFile.file_url ||
      (pickedFile.file_id ? `/file/${pickedFile.file_id}/${encodeURIComponent(pickedFile.file_name || 'audio.mp3')}` : '');
    const playableUrl = audioSystem.resolveAndCacheAudioUrl(rawPlayableUrl);

    const audio = new Audio(playableUrl);
    audio.volume = getEffectivePreviewVolume(slot.volume ?? 0.8);
    audio.loop = Boolean(slot.loop) && slot.files.length === 1;

    if (slot.max_duration && slot.max_duration > 0) {
      previewTimerRef.current = setTimeout(() => {
        stopPreviewAudio();
      }, slot.max_duration * 1000);
    }

    audio.onended = () => {
      if (slot.loop && slot.files.length > 1) {
        let nextIdx = 0;
        if (slot.playback_order === 'random') {
          nextIdx = Math.floor(Math.random() * slot.files.length);
        } else {
          const curr = slotSeqPreviewCounterRef.current.get(slot.slot_key) ?? 0;
          nextIdx = curr % slot.files.length;
          slotSeqPreviewCounterRef.current.set(slot.slot_key, (curr + 1) % slot.files.length);
        }
        const nextFile = slot.files[nextIdx];
        const nextRawUrl =
          nextFile.file_url ||
          (nextFile.file_id ? `/file/${nextFile.file_id}/${encodeURIComponent(nextFile.file_name || 'audio.mp3')}` : '');
        audio.src = audioSystem.resolveAndCacheAudioUrl(nextRawUrl);
        audio.play().catch(() => stopPreviewAudio());
        return;
      }
      stopPreviewAudio();
    };

    audio.onerror = () => {
      audioSystem.playSynthesizedPreview(slot.slot_key, slot.volume ?? 0.8);
      stopPreviewAudio();
    };

    audio.play().catch(() => {
      audioSystem.playSynthesizedPreview(slot.slot_key, slot.volume ?? 0.8);
      stopPreviewAudio();
    });

    audioPreviewRef.current = audio;
    setPlayingKey(slot.slot_key);
  };

  // Play a specific file item inside a slot
  const togglePlaySpecificTrack = (slot: AudioSlotRecord, fileItem: AudioSlotFileItem, idx: number) => {
    const trackKey = `${slot.slot_key}__${idx}`;
    if (playingKey === trackKey) {
      stopPreviewAudio();
      return;
    }
    stopPreviewAudio();

    const rawPlayableUrl =
      fileItem.file_url ||
      (fileItem.file_id ? `/file/${fileItem.file_id}/${encodeURIComponent(fileItem.file_name || 'audio.mp3')}` : '');
    const playableUrl = audioSystem.resolveAndCacheAudioUrl(rawPlayableUrl);

    const audio = new Audio(playableUrl);
    audio.volume = getEffectivePreviewVolume(slot.volume ?? 0.8);
    audio.loop = Boolean(slot.loop);

    if (slot.max_duration && slot.max_duration > 0) {
      previewTimerRef.current = setTimeout(() => {
        stopPreviewAudio();
      }, slot.max_duration * 1000);
    }

    audio.onended = () => stopPreviewAudio();
    audio.onerror = () => {
      audioSystem.playSynthesizedPreview(slot.slot_key, slot.volume ?? 0.8);
      stopPreviewAudio();
    };
    audio.play().catch(() => {
      audioSystem.playSynthesizedPreview(slot.slot_key, slot.volume ?? 0.8);
      stopPreviewAudio();
    });

    audioPreviewRef.current = audio;
    setPlayingKey(trackKey);
  };

  // Play a file inside the picker modal
  const togglePlaySoundFile = (file: StoredFileRecord, customVolume?: number) => {
    const key = `file_${file.id}`;
    if (playingKey === key) {
      stopPreviewAudio();
      return;
    }
    stopPreviewAudio();
    const rawDirectUrl =
      (file.original_url && file.original_url.startsWith('http') ? file.original_url : '') ||
      (file.direct_url && file.direct_url.startsWith('http') ? file.direct_url : '') ||
      `/file/${file.id}/${encodeURIComponent(file.name || 'audio.mp3')}`;
    const directUrl = audioSystem.resolveAndCacheAudioUrl(rawDirectUrl);
    const audio = new Audio(directUrl);
    audio.volume = getEffectivePreviewVolume(customVolume ?? pickerModalSlot?.volume ?? 0.8);
    audio.play().catch(() => {
      audioSystem.playSynthesizedPreview(file.name || key, customVolume ?? pickerModalSlot?.volume ?? 0.8);
      stopPreviewAudio();
    });
    audio.onended = () => stopPreviewAudio();
    audio.onerror = () => {
      audioSystem.playSynthesizedPreview(file.name || key, customVolume ?? pickerModalSlot?.volume ?? 0.8);
      stopPreviewAudio();
    };
    audioPreviewRef.current = audio;
    setPlayingKey(key);
  };

  const updateSlotOnServer = async (
    slotKey: string,
    payload: Record<string, any>,
    optimisticUpdater?: (prev: AudioSlotRecord) => AudioSlotRecord
  ) => {
    if (optimisticUpdater) {
      setSlots((prev) =>
        prev.map((item) => (item.slot_key === slotKey ? optimisticUpdater(item) : item))
      );
    }
    setSavingSlotKey(slotKey);
    try {
      const res = await fetch(`/api/audio/assets/${encodeURIComponent(slotKey)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения слота');
      await fetchAudioData(true);
      await audioSystem.refreshConfig();
      return true;
    } catch (err: any) {
      showToast(err.message || 'Ошибка сохранения', 'error');
      await fetchAudioData(true);
      return false;
    } finally {
      setSavingSlotKey(null);
    }
  };

  const handleClearSlot = async (slot: AudioSlotRecord) => {
    setSavingSlotKey(slot.slot_key);
    try {
      const res = await fetch(`/api/audio/assets/${encodeURIComponent(slot.slot_key)}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        if (playingKey && playingKey.startsWith(slot.slot_key)) {
          stopPreviewAudio();
        }
        showToast(`Все звуки откреплены от позиции «${slot.title}»`);
        await fetchAudioData(true);
        await audioSystem.refreshConfig();
      }
    } catch (err: any) {
      showToast('Ошибка очистки позиции', 'error');
    } finally {
      setSavingSlotKey(null);
    }
  };

  const handleRemoveSingleTrackFromSlot = async (slot: AudioSlotRecord, indexToRemove: number) => {
    const removed = slot.files[indexToRemove];
    const nextFiles = slot.files.filter((_, i) => i !== indexToRemove);
    const ok = await updateSlotOnServer(
      slot.slot_key,
      { files: nextFiles },
      (prev) => ({ ...prev, files: nextFiles })
    );
    if (ok && removed) {
      showToast(`Трек «${removed.file_name}» убран из позиции «${slot.title}»`);
    }
  };

  const handleMoveTrackInSlot = async (
    slot: AudioSlotRecord,
    index: number,
    direction: 'up' | 'down'
  ) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slot.files.length) return;
    const nextFiles = [...slot.files];
    const temp = nextFiles[index];
    nextFiles[index] = nextFiles[targetIndex];
    nextFiles[targetIndex] = temp;
    await updateSlotOnServer(
      slot.slot_key,
      { files: nextFiles },
      (prev) => ({ ...prev, files: nextFiles })
    );
  };

  const triggerFileSelectForSlot = (slotKey: string) => {
    pendingSlotForFileRef.current = slotKey;
    if (singleFileInputRef.current) {
      singleFileInputRef.current.value = '';
      singleFileInputRef.current.click();
    }
  };

  const handleSingleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetSlotKey = pendingSlotForFileRef.current;
    if (!file || !targetSlotKey) return;

    setUploadingSlotKey(targetSlotKey);
    try {
      const uploaded = await upload(file, 'folder_sounds');
      const dbFile = uploaded.dbRecord;
      const directUrl = uploaded.directUrl || uploaded.url;

      await updateSlotOnServer(targetSlotKey, {
        append_file: {
          file_id: dbFile?.id ?? null,
          file_key: dbFile?.file_key ?? uploaded.key,
          file_name: dbFile?.name || file.name,
          file_url: directUrl
        }
      });

      const slotObj = slots.find((s) => s.slot_key === targetSlotKey);
      showToast(
        `Файл «${file.name}» загружен в папку «Звуки» и добавлен к позиции «${slotObj?.title || targetSlotKey}»`
      );
    } catch (err: any) {
      showToast(`Ошибка загрузки файла: ${err.message}`, 'error');
    } finally {
      setUploadingSlotKey(null);
      pendingSlotForFileRef.current = null;
      if (singleFileInputRef.current) singleFileInputRef.current.value = '';
    }
  };

  const handleBulkFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setBulkUploading(true);
    let uploadedCount = 0;
    let matchedCount = 0;

    try {
      for (const file of Array.from(fileList)) {
        try {
          const uploaded = await upload(file, 'folder_sounds');
          uploadedCount++;
          const dbFile = uploaded.dbRecord;
          const directUrl = uploaded.directUrl || uploaded.url;
          const baseName = file.name.replace(/\.[^/.]+$/, '').trim().toLowerCase();

          const matchingSlot = slots.find(
            (s) =>
              s.slot_key.toLowerCase() === baseName ||
              s.title.toLowerCase() === baseName
          );

          if (matchingSlot) {
            await fetch(`/api/audio/assets/${encodeURIComponent(matchingSlot.slot_key)}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
              },
              body: JSON.stringify({
                append_file: {
                  file_id: dbFile?.id ?? null,
                  file_key: dbFile?.file_key ?? uploaded.key,
                  file_name: dbFile?.name || file.name,
                  file_url: directUrl
                }
              })
            });
            matchedCount++;
          }
        } catch (_) {}
      }

      await fetchAudioData(true);
      await audioSystem.refreshConfig();
      showToast(
        `Загружено в папку «Звуки»: ${uploadedCount} файлов` +
          (matchedCount > 0 ? ` (автоматически добавлено к полям: ${matchedCount})` : '')
      );
    } finally {
      setBulkUploading(false);
      if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
    }
  };

  const handleAttachByUrl = async () => {
    if (!pickerModalSlot || !urlInput.trim()) return;
    setUploadingSlotKey(pickerModalSlot.slot_key);
    try {
      const uploaded = await upload(urlInput.trim(), 'folder_sounds');
      const dbFile = uploaded.dbRecord;
      const directUrl = uploaded.directUrl || uploaded.url;

      await updateSlotOnServer(pickerModalSlot.slot_key, {
        append_file: {
          file_id: dbFile?.id ?? null,
          file_key: dbFile?.file_key ?? uploaded.key,
          file_name: dbFile?.name || 'audio_track.mp3',
          file_url: directUrl
        }
      });

      showToast(
        `Аудио по ссылке загружено в папку «Звуки» и добавлено к позиции «${pickerModalSlot.title}»`
      );
      setUrlInput('');
    } catch (err: any) {
      showToast(`Ошибка загрузки по ссылке: ${err.message}`, 'error');
    } finally {
      setUploadingSlotKey(null);
    }
  };

  const handleAppendExistingSoundFile = async (file: StoredFileRecord) => {
    if (!pickerModalSlot) return;
    const directUrl =
      (file.original_url && file.original_url.startsWith('http') ? file.original_url : '') ||
      (file.direct_url && file.direct_url.startsWith('http') ? file.direct_url : '') ||
      `/file/${file.id}/${encodeURIComponent(file.name)}`;
    const ok = await updateSlotOnServer(pickerModalSlot.slot_key, {
      append_file: {
        file_id: file.id,
        file_key: file.file_key,
        file_name: file.name,
        file_url: directUrl
      }
    });
    if (ok) {
      showToast(`Звук «${file.name}» добавлен к позиции «${pickerModalSlot.title}»`);
    }
  };

  const handleReplaceWithSingleSoundFile = async (file: StoredFileRecord) => {
    if (!pickerModalSlot) return;
    const directUrl =
      (file.original_url && file.original_url.startsWith('http') ? file.original_url : '') ||
      (file.direct_url && file.direct_url.startsWith('http') ? file.direct_url : '') ||
      `/file/${file.id}/${encodeURIComponent(file.name)}`;
    const ok = await updateSlotOnServer(pickerModalSlot.slot_key, {
      files: [
        {
          file_id: file.id,
          file_key: file.file_key,
          file_name: file.name,
          file_url: directUrl
        }
      ]
    });
    if (ok) {
      showToast(`Звук «${file.name}» установлен для «${pickerModalSlot.title}»`);
      setPickerModalSlotKey(null);
    }
  };

  const handleAutoAssignAll = async () => {
    setBulkUploading(true);
    try {
      const res = await fetch('/api/audio/auto-assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ overwrite: true })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchAudioData(true);
        await audioSystem.refreshConfig();
        showToast(
          `Все ${data.assignedCount || 180} звуковых полей и их параметры воспроизведения распределены и сохранены в базе данных`
        );
      } else {
        showToast(data.error || 'Ошибка автораспределения', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка автораспределения', 'error');
    } finally {
      setBulkUploading(false);
    }
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Hidden file inputs */}
      <input
        ref={singleFileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.webm"
        onChange={handleSingleFileChange}
        className="hidden"
      />
      <input
        ref={bulkFileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.webm"
        multiple
        onChange={handleBulkFilesChange}
        className="hidden"
      />

      {/* HEADER BLOCK (Liquid Glass Apple) */}
      <div className="p-5 sm:p-6 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3.5 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl text-primary shrink-0">
              <Music className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-foreground">
                  Звуковая студия и режимы воспроизведения
                </h2>
                <BubbleElement size="sm" isBadge active icon={<Sparkles size={14} />}>
                  <span>
                    {stats.assigned} / {stats.total} озвучено
                  </span>
                </BubbleElement>
                <BubbleElement size="sm" isBadge icon={<Layers size={14} />}>
                  <span>Мульти-позиций: {stats.multiCount}</span>
                </BubbleElement>
              </div>
              <p className="text-sm text-foreground/75 leading-relaxed">
                Настраивайте для каждой позиции один или несколько звуков (последовательно или случайно), длительность звучания, повтор, фоновый или поверхностный режим, а также паузу или остановку других звуков на время воспроизведения.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <LeafButton
              variant="primary"
              size="sm"
              disabled={bulkUploading || uploading}
              onClick={() => bulkFileInputRef.current?.click()}
              icon={<Upload size={16} />}
            >
              <span>{bulkUploading ? 'Загрузка пакета...' : 'Массовая загрузка в «Звуки»'}</span>
            </LeafButton>

            <BubbleElement
              size="md"
              onClick={handleAutoAssignAll}
              disabled={bulkUploading || uploading}
              icon={<Sparkles size={16} className="text-primary" />}
              title="Автоматически распределить звуки и настройки воспроизведения по всем 180 полям"
            >
              <span>Распределить все настройки по умолчанию</span>
            </BubbleElement>

            <BubbleElement
              size="md"
              onClick={() => navigate('/system-admin/files')}
              icon={<FolderOpen size={16} className="text-primary" />}
            >
              <span>Файловый менеджер</span>
            </BubbleElement>

            <BubbleElement
              size="md"
              onClick={() => fetchAudioData()}
              icon={<RefreshCw size={16} className={loading ? 'animate-spin text-primary' : 'text-primary'} />}
              title="Обновить список"
            >
              <span>Обновить</span>
            </BubbleElement>
          </div>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-white/10">
          <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-xl flex items-center justify-between gap-2">
            <span className="text-sm text-foreground/75 font-medium">Всего позиций:</span>
            <span className="text-base font-black text-primary">{stats.total}</span>
          </div>
          <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-xl flex items-center justify-between gap-2">
            <span className="text-sm text-foreground/75 font-medium">Несколько звуков:</span>
            <span className="text-base font-black text-primary">{stats.multiCount}</span>
          </div>
          <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-xl flex items-center justify-between gap-2">
            <span className="text-sm text-foreground/75 font-medium">Фоновые звуки:</span>
            <span className="text-base font-black text-primary">{stats.bgCount}</span>
          </div>
          <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-xl flex items-center justify-between gap-2">
            <span className="text-sm text-foreground/75 font-medium">Поверх фона:</span>
            <span className="text-base font-black text-primary">{stats.fgCount}</span>
          </div>
          <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-xl flex items-center justify-between gap-2">
            <span className="text-sm text-foreground/75 font-medium">Ставят на паузу:</span>
            <span className="text-base font-black text-primary">{stats.pauseCount}</span>
          </div>
          <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-xl flex items-center justify-between gap-2">
            <span className="text-sm text-foreground/75 font-medium">Останавливают:</span>
            <span className="text-base font-black text-primary">{stats.stopCount}</span>
          </div>
        </div>

        {/* Live Upload Progress Bar */}
        {(uploading || bulkUploading) && (
          <div className="p-4 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-2xl space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-bold text-foreground truncate">
                {bulkUploading ? 'Пакетная загрузка и обработка звуков...' : 'Загрузка аудиофайла...'}
              </span>
              <BubbleElement isBadge active size="sm" className="!text-sm font-mono shrink-0">
                {uploadProgress}%
              </BubbleElement>
            </div>
            <div className="w-full h-2.5 rounded-full border border-primary/30 bg-transparent overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-150 shadow-[0_0_12px_rgba(153,208,55,0.8)]"
                style={{ width: `${Math.max(5, uploadProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div className="p-3.5 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-2xl flex items-center justify-between gap-3 text-sm font-semibold text-foreground">
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <CheckCircle2 size={18} className="text-primary shrink-0" />
              ) : (
                <AlertCircle size={18} className="text-rose-400 shrink-0" />
              )}
              <span>{toast.text}</span>
            </div>
            <BubbleElement size="sm" onClick={() => setToast(null)} icon={<X size={14} />} />
          </div>
        )}

        {/* SEARCH & FUNCTIONAL FILTERS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-2 border-t border-white/10">
          <div className="lg:col-span-4 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по действию, игре, файлу или ключу..."
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="lg:col-span-8 flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: `Все позиции (${slots.length})` },
              { id: 'multi', label: `Несколько звуков (${stats.multiCount})` },
              { id: 'background', label: `Фоновые (${stats.bgCount})` },
              { id: 'foreground', label: `Поверх фона (${stats.fgCount})` },
              { id: 'pause', label: `С паузой других (${stats.pauseCount})` },
              { id: 'stop', label: `С остановкой других (${stats.stopCount})` }
            ].map((st) => (
              <BubbleElement
                key={st.id}
                size="sm"
                active={statusFilter === st.id}
                onClick={() => setStatusFilter(st.id as any)}
              >
                <span>{st.label}</span>
              </BubbleElement>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION SELECTOR (Mobile Dropdown Bubble / Desktop Wrapped Bubbles — zero horizontal scroll) */}
      <div className="p-4 sm:p-5 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-2xl space-y-4">
        {/* Mobile Dropdown Selector */}
        <div className="block md:hidden space-y-2">
          <BubbleElement
            size="md"
            active
            className="w-full justify-between"
            onClick={() => setIsMobileSectionOpen(!isMobileSectionOpen)}
            icon={<ChevronDown size={16} className={`transition-transform ${isMobileSectionOpen ? 'rotate-180' : ''}`} />}
          >
            <span>
              Раздел:{' '}
              {activeSectionId === 'all'
                ? `Все разделы и игры (${slots.length})`
                : sections.find((s) => s.id === activeSectionId)?.title || activeSectionId}
            </span>
          </BubbleElement>

          {isMobileSectionOpen && (
            <div className="flex flex-col gap-2 pt-2">
              <BubbleElement
                size="md"
                active={activeSectionId === 'all'}
                className="w-full justify-between"
                onClick={() => {
                  setActiveSectionId('all');
                  setIsMobileSectionOpen(false);
                }}
              >
                <span>Все разделы и игры ({slots.length})</span>
              </BubbleElement>
              {sections.map((sec) => {
                const secSlots = slots.filter((s) => s.section_id === sec.id);
                const secAssigned = secSlots.filter((s) => s.files.length > 0).length;
                return (
                  <BubbleElement
                    key={sec.id}
                    size="md"
                    active={activeSectionId === sec.id}
                    className="w-full justify-between"
                    onClick={() => {
                      setActiveSectionId(sec.id);
                      setIsMobileSectionOpen(false);
                    }}
                  >
                    <span>
                      {sec.title} ({secAssigned}/{secSlots.length})
                    </span>
                  </BubbleElement>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Wrapped Bubble Selector */}
        <div className="hidden md:flex flex-wrap items-center gap-2">
          <BubbleElement
            size="md"
            active={activeSectionId === 'all'}
            onClick={() => setActiveSectionId('all')}
          >
            <span>Все разделы ({slots.length})</span>
          </BubbleElement>
          {sections.map((sec) => {
            const secSlots = slots.filter((s) => s.section_id === sec.id);
            const secAssigned = secSlots.filter((s) => s.files.length > 0).length;
            return (
              <BubbleElement
                key={sec.id}
                size="md"
                active={activeSectionId === sec.id}
                onClick={() => setActiveSectionId(sec.id)}
              >
                <span>
                  {sec.badge} ({secAssigned}/{secSlots.length})
                </span>
              </BubbleElement>
            );
          })}
        </div>

        {/* Subcategory Filter Bubbles */}
        {subcategories.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/10">
            <span className="text-sm font-semibold text-foreground/70 mr-1">Категория действий:</span>
            <BubbleElement
              size="sm"
              active={activeSubcategory === 'all'}
              onClick={() => setActiveSubcategory('all')}
            >
              <span>Все категории</span>
            </BubbleElement>
            {subcategories.map((sub) => (
              <BubbleElement
                key={sub}
                size="sm"
                active={activeSubcategory === sub}
                onClick={() => setActiveSubcategory(sub)}
              >
                <span>{sub}</span>
              </BubbleElement>
            ))}
          </div>
        )}
      </div>

      {/* AUDIO SLOTS LIST BY SECTION & SUBCATEGORY */}
      {loading ? (
        <div className="p-12 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-2xl text-center text-sm text-foreground/70">
          Загрузка звуковых полей и настроек воспроизведения из базы данных...
        </div>
      ) : groupedSlots.length === 0 ? (
        <div className="p-12 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-2xl text-center space-y-3">
          <p className="text-base font-bold text-foreground">Поля не найдены по выбранному фильтру</p>
          <BubbleElement
            size="md"
            onClick={() => {
              setActiveSectionId('all');
              setActiveSubcategory('all');
              setStatusFilter('all');
              setSearchQuery('');
            }}
          >
            <span>Сбросить фильтры</span>
          </BubbleElement>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedSlots.map(([sectionId, secData]) => {
            const secInfo = sections.find((s) => s.id === sectionId);
            return (
              <div
                key={sectionId}
                className="p-4 sm:p-6 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl shadow-xl space-y-6"
              >
                {/* Section Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-primary/20">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <Volume2 className="w-6 h-6 text-primary shrink-0" />
                      <h3 className="text-lg sm:text-xl font-black text-foreground">
                        {secData.sectionTitle}
                      </h3>
                    </div>
                    {secInfo?.subtitle && (
                      <p className="text-sm text-foreground/70">{secInfo.subtitle}</p>
                    )}
                  </div>
                </div>

                {/* Subcategories */}
                <div className="space-y-6">
                  {Array.from(secData.subMap.entries()).map(([subTitle, subSlots]) => (
                    <div key={subTitle} className="space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <BubbleElement size="sm" isBadge active icon={<Sliders size={14} />}>
                          <span>
                            {subTitle} ({subSlots.length})
                          </span>
                        </BubbleElement>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        {subSlots.map((slot) => {
                          const isSlotPlaying = playingKey === slot.slot_key;
                          const isUploadingThis = uploadingSlotKey === slot.slot_key;
                          const isSavingThis = savingSlotKey === slot.slot_key;
                          const hasFiles = slot.files.length > 0;

                          return (
                            <div
                              key={slot.slot_key}
                              className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 bg-transparent backdrop-blur-xl ${
                                hasFiles
                                  ? 'border-primary/45 shadow-[0_0_20px_rgba(153,208,55,0.12)]'
                                  : 'border-white/15 hover:border-primary/30'
                              }`}
                            >
                              {/* 1. Top Header: Title, Summary Bubbles, Enable Toggle */}
                              <div className="space-y-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="space-y-1.5 min-w-0 flex-1">
                                    <h4 className="text-base font-bold text-foreground leading-snug break-words">
                                      {slot.title}
                                    </h4>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <BubbleElement size="sm" isBadge>
                                        <span className="font-mono">{slot.slot_key}</span>
                                      </BubbleElement>
                                      <BubbleElement
                                        size="sm"
                                        isBadge
                                        active={slot.is_background}
                                        icon={<Layers size={13} />}
                                      >
                                        <span>{slot.is_background ? 'Фоновый' : 'Поверх фона'}</span>
                                      </BubbleElement>
                                      <BubbleElement
                                        size="sm"
                                        isBadge
                                        active={slot.files.length > 1}
                                        icon={
                                          slot.playback_order === 'random' ? (
                                            <Shuffle size={13} />
                                          ) : (
                                            <ListOrdered size={13} />
                                          )
                                        }
                                      >
                                        <span>
                                          Звуков: {slot.files.length} (
                                          {slot.playback_order === 'random' ? 'Случайно' : 'По очереди'})
                                        </span>
                                      </BubbleElement>
                                      <BubbleElement size="sm" isBadge icon={<Clock size={13} />}>
                                        <span>
                                          {slot.max_duration > 0 ? `${slot.max_duration} сек` : 'Весь трек'}
                                        </span>
                                      </BubbleElement>
                                      <BubbleElement
                                        size="sm"
                                        isBadge
                                        active={slot.interrupt_mode !== 'none'}
                                        icon={<ShieldAlert size={13} />}
                                      >
                                        <span>{AUDIO_INTERRUPT_MODE_LABELS[slot.interrupt_mode]}</span>
                                      </BubbleElement>
                                    </div>
                                  </div>

                                  {/* Enable/Disable Slot Toggle */}
                                  <BubbleElement
                                    size="sm"
                                    active={slot.is_enabled}
                                    onClick={() =>
                                      updateSlotOnServer(
                                        slot.slot_key,
                                        { is_enabled: !slot.is_enabled },
                                        (prev) => ({ ...prev, is_enabled: !prev.is_enabled })
                                      )
                                    }
                                    icon={slot.is_enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                                    title={slot.is_enabled ? 'Позиция включена' : 'Позиция отключена'}
                                  >
                                    <span>{slot.is_enabled ? 'Вкл' : 'Выкл'}</span>
                                  </BubbleElement>
                                </div>

                                <p className="text-sm text-foreground/75 leading-relaxed break-words">
                                  {slot.description}
                                </p>
                              </div>

                              {/* 2. Attached Audio Files List (Supports 1 or Multiple Sounds per Slot) */}
                              <div className="pt-3 border-t border-white/10 space-y-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm font-bold text-foreground">
                                    Привязанные звуки на позиции ({slot.files.length}):
                                  </span>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <LeafButton
                                      variant={isSlotPlaying ? 'primary' : 'glass'}
                                      size="sm"
                                      onClick={() => togglePlaySlotPreview(slot)}
                                      icon={isSlotPlaying ? <Pause size={14} /> : <Play size={14} />}
                                    >
                                      <span>
                                        {isSlotPlaying
                                          ? 'Стоп'
                                          : `Проверить позицию (${Math.round((slot.volume ?? 0.8) * 100)}%)`}
                                      </span>
                                    </LeafButton>
                                    {hasFiles && (
                                      <BubbleElement
                                        size="sm"
                                        onClick={() => handleClearSlot(slot)}
                                        disabled={isSavingThis}
                                        icon={<Trash2 size={14} className="text-rose-400" />}
                                        title="Очистить все звуки с этой позиции"
                                      >
                                        <span>Очистить</span>
                                      </BubbleElement>
                                    )}
                                  </div>
                                </div>

                                {hasFiles ? (
                                  <div className="space-y-2">
                                    {slot.files.map((fileItem, idx) => {
                                      const trackKey = `${slot.slot_key}__${idx}`;
                                      const isTrackPlaying = playingKey === trackKey;
                                      return (
                                        <div
                                          key={`${fileItem.file_id || fileItem.file_url}_${idx}`}
                                          className="p-2.5 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-md flex flex-wrap items-center justify-between gap-2"
                                        >
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <BubbleElement
                                              size="sm"
                                              active={isTrackPlaying}
                                              onClick={() => togglePlaySpecificTrack(slot, fileItem, idx)}
                                              icon={isTrackPlaying ? <Pause size={14} /> : <Play size={14} />}
                                              title="Прослушать этот трек"
                                            >
                                              <span>#{idx + 1}</span>
                                            </BubbleElement>
                                            <div className="min-w-0 flex-1">
                                              <p
                                                className="text-sm font-bold text-primary truncate"
                                                title={fileItem.file_name}
                                              >
                                                {fileItem.file_name}
                                              </p>
                                              <p className="text-sm text-foreground/60 truncate font-mono">
                                                Папка: Звуки {fileItem.file_id ? `• ID #${fileItem.file_id}` : ''}
                                              </p>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {slot.files.length > 1 && (
                                              <>
                                                <BubbleElement
                                                  size="sm"
                                                  disabled={idx === 0 || isSavingThis}
                                                  onClick={() => handleMoveTrackInSlot(slot, idx, 'up')}
                                                  icon={<ArrowUp size={14} />}
                                                  title="Поднять выше в очереди"
                                                />
                                                <BubbleElement
                                                  size="sm"
                                                  disabled={idx === slot.files.length - 1 || isSavingThis}
                                                  onClick={() => handleMoveTrackInSlot(slot, idx, 'down')}
                                                  icon={<ArrowDown size={14} />}
                                                  title="Опустить ниже в очереди"
                                                />
                                              </>
                                            )}
                                            <BubbleElement
                                              size="sm"
                                              disabled={isSavingThis}
                                              onClick={() => handleRemoveSingleTrackFromSlot(slot, idx)}
                                              icon={<X size={14} className="text-rose-400" />}
                                              title="Убрать этот звук из позиции"
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md flex items-center gap-2 text-sm text-foreground/65 italic">
                                    <FileAudio size={16} className="text-primary/70 shrink-0" />
                                    <span>Звуки не назначены (используется синтезатор по умолчанию)</span>
                                  </div>
                                )}

                                {/* Buttons to add more files to this slot */}
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <LeafButton
                                    variant="primary"
                                    size="sm"
                                    disabled={isUploadingThis || isSavingThis}
                                    onClick={() => triggerFileSelectForSlot(slot.slot_key)}
                                    icon={<Plus size={15} />}
                                    className="flex-1"
                                  >
                                    <span>
                                      {isUploadingThis
                                        ? 'Загрузка...'
                                        : hasFiles
                                        ? 'Добавить файл в позицию'
                                        : 'Загрузить звук'}
                                    </span>
                                  </LeafButton>

                                  <BubbleElement
                                    size="sm"
                                    onClick={() => {
                                      setPickerModalSlotKey(slot.slot_key);
                                      setUrlInput('');
                                      setPickerSearch('');
                                    }}
                                    icon={<FolderOpen size={14} className="text-primary" />}
                                  >
                                    <span>Из папки «Звуки» / URL</span>
                                  </BubbleElement>
                                </div>
                              </div>

                              {/* 3. Playback Mode Settings Grid: Order, Repeat, Layer, Interrupt, Duration, Volume */}
                              <div className="pt-3 border-t border-white/10 space-y-3.5">
                                {/* Row A: Playback Order (Sequential vs Random) & Repeat (Once vs Loop) */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md space-y-2">
                                    <span className="text-sm font-semibold text-foreground/80 block">
                                      Порядок включения звуков:
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                      <BubbleElement
                                        size="sm"
                                        active={slot.playback_order === 'sequential'}
                                        onClick={() =>
                                          updateSlotOnServer(
                                            slot.slot_key,
                                            { playback_order: 'sequential' },
                                            (prev) => ({ ...prev, playback_order: 'sequential' })
                                          )
                                        }
                                        icon={<ListOrdered size={14} />}
                                      >
                                        <span>Последовательно</span>
                                      </BubbleElement>
                                      <BubbleElement
                                        size="sm"
                                        active={slot.playback_order === 'random'}
                                        onClick={() =>
                                          updateSlotOnServer(
                                            slot.slot_key,
                                            { playback_order: 'random' },
                                            (prev) => ({ ...prev, playback_order: 'random' })
                                          )
                                        }
                                        icon={<Shuffle size={14} />}
                                      >
                                        <span>Случайно</span>
                                      </BubbleElement>
                                    </div>
                                  </div>

                                  <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md space-y-2">
                                    <span className="text-sm font-semibold text-foreground/80 block">
                                      Повтор воспроизведения:
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                      <BubbleElement
                                        size="sm"
                                        active={!slot.loop}
                                        onClick={() =>
                                          updateSlotOnServer(
                                            slot.slot_key,
                                            { loop: false },
                                            (prev) => ({ ...prev, loop: false })
                                          )
                                        }
                                      >
                                        <span>Однократно</span>
                                      </BubbleElement>
                                      <BubbleElement
                                        size="sm"
                                        active={slot.loop}
                                        onClick={() =>
                                          updateSlotOnServer(
                                            slot.slot_key,
                                            { loop: true },
                                            (prev) => ({ ...prev, loop: true })
                                          )
                                        }
                                        icon={<Repeat size={14} />}
                                      >
                                        <span>Повтор</span>
                                      </BubbleElement>
                                    </div>
                                  </div>
                                </div>

                                {/* Row B: Sound Layer (Background vs Over Background) */}
                                <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md space-y-2">
                                  <span className="text-sm font-semibold text-foreground/80 block">
                                    Канал звучания (фоновый или поверх фона):
                                  </span>
                                  <div className="flex flex-wrap gap-2">
                                    <BubbleElement
                                      size="sm"
                                      active={slot.is_background}
                                      onClick={() =>
                                        updateSlotOnServer(
                                          slot.slot_key,
                                          { is_background: true },
                                          (prev) => ({ ...prev, is_background: true })
                                        )
                                      }
                                      icon={<Layers size={14} />}
                                    >
                                      <span>Фоновый звук</span>
                                    </BubbleElement>
                                    <BubbleElement
                                      size="sm"
                                      active={!slot.is_background}
                                      onClick={() =>
                                        updateSlotOnServer(
                                          slot.slot_key,
                                          { is_background: false },
                                          (prev) => ({ ...prev, is_background: false })
                                        )
                                      }
                                      icon={<Volume2 size={14} />}
                                    >
                                      <span>Поверх фона (эффект / джингл)</span>
                                    </BubbleElement>
                                  </div>
                                </div>

                                {/* Row C: Interrupt / Ducking Behavior */}
                                <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md space-y-2">
                                  <span className="text-sm font-semibold text-foreground/80 block">
                                    Действие с остальными звуками на момент воспроизведения:
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {INTERRUPT_OPTIONS.map((opt) => (
                                      <BubbleElement
                                        key={opt.id}
                                        size="sm"
                                        active={slot.interrupt_mode === opt.id}
                                        onClick={() =>
                                          updateSlotOnServer(
                                            slot.slot_key,
                                            { interrupt_mode: opt.id },
                                            (prev) => ({ ...prev, interrupt_mode: opt.id })
                                          )
                                        }
                                        title={opt.label}
                                      >
                                        <span>{opt.shortLabel}</span>
                                      </BubbleElement>
                                    ))}
                                  </div>
                                </div>

                                {/* Row D: Playback Duration Control */}
                                <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md space-y-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-foreground/80 flex items-center gap-1.5">
                                      <Clock size={14} className="text-primary" />
                                      <span>
                                        Продолжительность:{' '}
                                        <strong className="text-primary">
                                          {slot.max_duration > 0
                                            ? `${slot.max_duration} сек.`
                                            : 'Весь трек целиком'}
                                        </strong>
                                      </span>
                                    </span>
                                  </div>

                                  <input
                                    type="range"
                                    min={0}
                                    max={90}
                                    step={1}
                                    value={slot.max_duration ?? 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      setSlots((prev) =>
                                        prev.map((item) =>
                                          item.slot_key === slot.slot_key
                                            ? { ...item, max_duration: val }
                                            : item
                                        )
                                      );
                                    }}
                                    onMouseUp={(e) => {
                                      const val = parseInt((e.target as HTMLInputElement).value, 10);
                                      updateSlotOnServer(slot.slot_key, { max_duration: val });
                                    }}
                                    onTouchEnd={(e) => {
                                      const val = parseInt((e.target as HTMLInputElement).value, 10);
                                      updateSlotOnServer(slot.slot_key, { max_duration: val });
                                    }}
                                    className="w-full accent-[#99d037] cursor-pointer"
                                  />

                                  <div className="flex flex-wrap gap-1.5">
                                    {DURATION_PRESETS.map((preset) => (
                                      <BubbleElement
                                        key={preset.value}
                                        size="sm"
                                        active={(slot.max_duration ?? 0) === preset.value}
                                        onClick={() =>
                                          updateSlotOnServer(
                                            slot.slot_key,
                                            { max_duration: preset.value },
                                            (prev) => ({ ...prev, max_duration: preset.value })
                                          )
                                        }
                                      >
                                        <span>{preset.label}</span>
                                      </BubbleElement>
                                    ))}
                                  </div>
                                </div>

                                {/* Row E: Volume Control */}
                                <div className="p-3 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
                                  <span className="text-sm font-semibold text-foreground/80 shrink-0">
                                    Громкость: {Math.round((slot.volume ?? 0.8) * 100)}%
                                  </span>
                                  <input
                                    type="range"
                                    min={0.05}
                                    max={1}
                                    step={0.05}
                                    value={slot.volume ?? 0.8}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setSlots((prev) =>
                                        prev.map((item) =>
                                          item.slot_key === slot.slot_key ? { ...item, volume: val } : item
                                        )
                                      );
                                      if (
                                        playingKey &&
                                        playingKey.startsWith(slot.slot_key) &&
                                        audioPreviewRef.current
                                      ) {
                                        audioPreviewRef.current.volume = getEffectivePreviewVolume(val);
                                      }
                                    }}
                                    onMouseUp={(e) => {
                                      const val = parseFloat((e.target as HTMLInputElement).value);
                                      updateSlotOnServer(slot.slot_key, { volume: val });
                                    }}
                                    onTouchEnd={(e) => {
                                      const val = parseFloat((e.target as HTMLInputElement).value);
                                      updateSlotOnServer(slot.slot_key, { volume: val });
                                    }}
                                    className="flex-1 min-w-[140px] accent-[#99d037] cursor-pointer"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: PICK EXISTING FILES FROM 'ЗВУКИ' OR UPLOAD BY URL (Liquid Glass Apple, centered on viewport via createPortal) */}
      {pickerModalSlot &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-transparent backdrop-blur-2xl flex items-center justify-center p-4"
            onClick={() => setPickerModalSlotKey(null)}
          >
            <div
              className="w-full max-w-3xl rounded-3xl border border-primary/40 bg-transparent backdrop-blur-3xl p-5 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-primary/20 pb-3">
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-foreground">
                    Управление звуками для: «{pickerModalSlot.title}»
                  </h3>
                  <p className="text-sm text-foreground/70">
                    Сейчас в позиции треков: {pickerModalSlot.files.length}. Вы можете добавить несколько звуков для случайного или последовательного воспроизведения.
                  </p>
                </div>
                <BubbleElement
                  size="sm"
                  onClick={() => setPickerModalSlotKey(null)}
                  icon={<X size={16} />}
                />
              </div>

              {/* Currently attached tracks in modal */}
              {pickerModalSlot.files.length > 0 && (
                <div className="p-3 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl space-y-2">
                  <span className="text-sm font-bold text-primary block">
                    Выбранные звуки этой позиции ({pickerModalSlot.files.length}):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {pickerModalSlot.files.map((item, idx) => (
                      <BubbleElement
                        key={`${item.file_id || item.file_url}_${idx}`}
                        size="sm"
                        active
                        onClick={() => handleRemoveSingleTrackFromSlot(pickerModalSlot, idx)}
                        icon={<X size={13} />}
                        title="Нажмите, чтобы убрать трек из позиции"
                      >
                        <span>
                          #{idx + 1} {item.file_name}
                        </span>
                      </BubbleElement>
                    ))}
                  </div>
                </div>
              )}

              {/* Option 1: Upload by direct URL */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">
                  Добавить аудиофайл по прямой ссылке (сохранится в папку «Звуки»):
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/sound.mp3"
                    className="flex-1 px-3.5 py-2.5 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-md text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary"
                  />
                  <LeafButton
                    variant="primary"
                    size="sm"
                    disabled={!urlInput.trim() || uploadingSlotKey === pickerModalSlot.slot_key}
                    onClick={handleAttachByUrl}
                    icon={<LinkIcon size={15} />}
                  >
                    <span>Добавить по ссылке</span>
                  </LeafButton>
                </div>
              </div>

              {/* Option 2: Select from folder 'Звуки' */}
              <div className="space-y-3 flex-1 overflow-hidden flex flex-col pt-2 border-t border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-sm font-bold text-foreground">
                    Выберите звуки из папки «Звуки» ({soundFiles.length}):
                  </span>
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Фильтр по имени файла..."
                    className="px-3 py-1.5 rounded-xl border border-primary/25 bg-transparent text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {soundFiles
                    .filter((f) =>
                      !pickerSearch.trim()
                        ? true
                        : f.name.toLowerCase().includes(pickerSearch.toLowerCase())
                    )
                    .map((f) => {
                      const isFilePlaying = playingKey === `file_${f.id}`;
                      const alreadyInSlot = pickerModalSlot.files.some(
                        (item) => Number(item.file_id) === Number(f.id)
                      );
                      return (
                        <div
                          key={f.id}
                          className={`p-3 rounded-2xl border transition-all bg-transparent backdrop-blur-md flex flex-wrap items-center justify-between gap-2 ${
                            alreadyInSlot
                              ? 'border-primary/50'
                              : 'border-white/15 hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <Music size={16} className="text-primary shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground truncate">{f.name}</p>
                              <p className="text-sm text-foreground/60 font-mono">
                                ID #{f.id} • Папка: {f.folder_name || 'Звуки'}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <BubbleElement
                              size="sm"
                              active={isFilePlaying}
                              onClick={() => togglePlaySoundFile(f, pickerModalSlot?.volume ?? 0.8)}
                              icon={isFilePlaying ? <Pause size={14} /> : <Play size={14} />}
                              title="Прослушать файл"
                            >
                              <span>{isFilePlaying ? 'Стоп' : 'Слушать'}</span>
                            </BubbleElement>

                            <LeafButton
                              variant="primary"
                              size="sm"
                              onClick={() => handleAppendExistingSoundFile(f)}
                              icon={<Plus size={14} />}
                            >
                              <span>{alreadyInSlot ? 'Добавить еще раз' : 'Добавить к позиции'}</span>
                            </LeafButton>

                            <BubbleElement
                              size="sm"
                              onClick={() => handleReplaceWithSingleSoundFile(f)}
                              icon={<Check size={14} />}
                              title="Сделать единственным звуком этой позиции"
                            >
                              <span>Только этот</span>
                            </BubbleElement>
                          </div>
                        </div>
                      );
                    })}

                  {soundFiles.length === 0 && (
                    <div className="p-6 text-center text-sm text-foreground/60">
                      В папке «Звуки» пока нет загруженных аудиофайлов. Нажмите «Загрузить звук» на карточке.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
