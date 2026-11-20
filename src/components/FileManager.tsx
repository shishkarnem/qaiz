import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
  FolderPlus, Upload, Link as LinkIcon, Search, Grid, List, Trash2, 
  Copy, Check, FileText, Image as ImageIcon, Film, Music, File, 
  Eye, Folder, Key, RefreshCw, X, FolderOpen, ExternalLink, Settings,
  Play, Pause, ArrowRightLeft, ShieldCheck, Download, Edit, UserCheck, Users
} from 'lucide-react';
import { useFileUpload } from '../hooks/useFileUpload';
import { getUploadService, StoredFileRecord } from '../services/FileUploadService';
import { useAuth } from '../context/AuthContext';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';

interface FolderRecord {
  id: string;
  name: string;
  parent_id?: string | null;
  created_at?: string;
}

export const FileManager: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { upload, uploading, progress: uploadProgress, error: uploadError } = useFileUpload();
  const fileService = getUploadService();
  const [batchUploadInfo, setBatchUploadInfo] = useState<{
    fileName: string;
    current: number;
    total: number;
    percent: number;
  } | null>(null);

  // State
  const [files, setFiles] = useState<StoredFileRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & View
  const [selectedFolder, setSelectedFolder] = useState<string>('all'); // 'all', 'root', or folder_id
  const [activeFileType, setActiveFileType] = useState<'all' | 'image' | 'video' | 'audio' | 'document'>('all');
  const [selectedUploader, setSelectedUploader] = useState<string>('all'); // 'all', 'system', or uid/id
  const [uploaders, setUploaders] = useState<any[]>([]);
  const [showUploaderModal, setShowUploaderModal] = useState(false);
  const [uploaderSearch, setUploaderSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modals & UI states
  const [showUrlUploadModal, setShowUrlUploadModal] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [targetFolderForUrl, setTargetFolderForUrl] = useState<string>('');

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState(fileService.getToken());

  const [previewFile, setPreviewFile] = useState<StoredFileRecord | null>(null);
  const [moveFileTarget, setMoveFileTarget] = useState<StoredFileRecord | null>(null);
  const [newFolderForMove, setNewFolderForMove] = useState<string>('');

  // Rename File State
  const [renameFileTarget, setRenameFileTarget] = useState<StoredFileRecord | null>(null);
  const [renameFileName, setRenameFileName] = useState('');

  // Delete Confirmation Modal State
  const [deleteModalTarget, setDeleteModalTarget] = useState<{
    type: 'file' | 'folder';
    id: number | string;
    name: string;
  } | null>(null);

  // Audio playing state
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAuthHeaders = () => {
    const uid = profile?.uid || localStorage.getItem('qaiz_user_uid') || '';
    return {
      'x-user-uid': uid,
      'Accept': 'application/json'
    };
  };

  useEffect(() => {
    fetchFolders();
    fetchFiles();
    fetchUploaders();
  }, [selectedFolder, activeFileType, selectedUploader]);

  const fetchFolders = async () => {
    try {
      const res = await fetch('/api/admin/folders', {
        headers: getAuthHeaders()
      });
      if (!res.ok) return;
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data.folders) setFolders(data.folders);
      } catch (jsonErr) {
        console.warn('Invalid JSON from folders endpoint:', text);
      }
    } catch (err) {
      console.error('Error fetching folders:', err);
    }
  };

  const fetchUploaders = async () => {
    try {
      const res = await fetch('/api/admin/files/uploaders', {
        headers: getAuthHeaders()
      });
      if (!res.ok) return;
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data.uploaders) setUploaders(data.uploaders);
      } catch (jsonErr) {
        console.warn('Invalid JSON from uploaders endpoint:', text);
      }
    } catch (err) {
      console.error('Error fetching uploaders:', err);
    }
  };

  const fetchFiles = async () => {
    setLoading(true);
    try {
      let url = `/api/admin/files?folder_id=${selectedFolder}&file_type=${activeFileType}`;
      if (selectedUploader !== 'all') url += `&user_id=${encodeURIComponent(selectedUploader)}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      
      const res = await fetch(url, {
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data.files) {
          setFiles(data.files);
        }
      } catch (jsonErr) {
        console.warn('Invalid JSON from files endpoint:', text);
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFiles();
  };

  // Upload files handler with percentage progress
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const targetFolder = selectedFolder !== 'all' && selectedFolder !== 'root' ? selectedFolder : null;
    const filesArray = Array.from(selectedFiles);

    let successCount = 0;
    for (let idx = 0; idx < filesArray.length; idx++) {
      const f = filesArray[idx];
      setBatchUploadInfo({
        fileName: f.name,
        current: idx + 1,
        total: filesArray.length,
        percent: 0
      });
      try {
        await upload(f, targetFolder, undefined, profile?.uid || null, (pct) => {
          const overallPct = Math.min(
            100,
            Math.round(((idx * 100 + pct) / (filesArray.length * 100)) * 100)
          );
          setBatchUploadInfo({
            fileName: f.name,
            current: idx + 1,
            total: filesArray.length,
            percent: overallPct
          });
        });
        successCount++;
      } catch (err: any) {
        setStatusMessage({ type: 'error', text: `Ошибка при загрузке файла ${f.name}: ${err.message}` });
      }
    }

    setBatchUploadInfo(null);

    if (successCount > 0) {
      setStatusMessage({ type: 'success', text: `Успешно загружено файлов: ${successCount} (100%)` });
      fetchFiles();
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Upload by URL handler with percentage progress
  const handleUploadUrl = async () => {
    if (!urlInput.trim()) return;
    try {
      const targetFolder = targetFolderForUrl || (selectedFolder !== 'all' && selectedFolder !== 'root' ? selectedFolder : null);
      setBatchUploadInfo({
        fileName: urlInput.trim(),
        current: 1,
        total: 1,
        percent: 10
      });
      await upload(urlInput.trim(), targetFolder, undefined, profile?.uid || null, (pct) => {
        setBatchUploadInfo({
          fileName: urlInput.trim(),
          current: 1,
          total: 1,
          percent: pct
        });
      });
      setBatchUploadInfo(null);
      setStatusMessage({ type: 'success', text: 'Файл успешно загружен по URL (100%)' });
      setShowUrlUploadModal(false);
      setUrlInput('');
      fetchFiles();
    } catch (err: any) {
      setBatchUploadInfo(null);
      setStatusMessage({ type: 'error', text: `Ошибка загрузки по URL: ${err.message}` });
    }
  };

  // Create Folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch('/api/admin/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: newFolderName.trim() })
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.success) {
        setStatusMessage({ type: 'success', text: `Папка "${newFolderName}" создана` });
        setNewFolderName('');
        setShowFolderModal(false);
        fetchFolders();
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Ошибка создания папки' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Open Delete Modal for Folder
  const promptDeleteFolder = (folderId: string, folderName: string) => {
    setDeleteModalTarget({ type: 'folder', id: folderId, name: folderName });
  };

  // Open Delete Modal for File
  const promptDeleteFile = (fileId: number, fileName: string) => {
    setDeleteModalTarget({ type: 'file', id: fileId, name: fileName });
  };

  // Confirm Delete Handler (calls API)
  const confirmDelete = async () => {
    if (!deleteModalTarget) return;

    if (deleteModalTarget.type === 'file') {
      try {
        const res = await fetch(`/api/admin/files/${deleteModalTarget.id}`, { 
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const text = await res.text();
        const data = JSON.parse(text);
        if (data.success) {
          setStatusMessage({ type: 'success', text: `Файл "${deleteModalTarget.name}" удален` });
          fetchFiles();
          if (previewFile?.id === Number(deleteModalTarget.id)) setPreviewFile(null);
        }
      } catch (err: any) {
        setStatusMessage({ type: 'error', text: err.message });
      }
    } else if (deleteModalTarget.type === 'folder') {
      try {
        const res = await fetch(`/api/admin/folders/${deleteModalTarget.id}`, { 
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const text = await res.text();
        const data = JSON.parse(text);
        if (data.success) {
          setStatusMessage({ type: 'success', text: `Папка "${deleteModalTarget.name}" удалена` });
          if (selectedFolder === String(deleteModalTarget.id)) setSelectedFolder('all');
          fetchFolders();
          fetchFiles();
        }
      } catch (err: any) {
        setStatusMessage({ type: 'error', text: err.message });
      }
    }

    setDeleteModalTarget(null);
  };

  // Open Rename Modal for File
  const promptRenameFile = (file: StoredFileRecord) => {
    setRenameFileTarget(file);
    setRenameFileName(file.name);
  };

  // Handle Rename File
  const handleRenameFile = async () => {
    if (!renameFileTarget || !renameFileName.trim()) return;
    try {
      const res = await fetch(`/api/admin/files/${renameFileTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: renameFileName.trim()
        })
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.success) {
        setStatusMessage({ type: 'success', text: `Файл переименован в "${renameFileName.trim()}"` });
        setRenameFileTarget(null);
        fetchFiles();
        if (previewFile?.id === renameFileTarget.id) {
          setPreviewFile(prev => prev ? { ...prev, name: renameFileName.trim() } : null);
        }
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Ошибка переименования' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Move File
  const handleMoveFile = async () => {
    if (!moveFileTarget) return;
    try {
      const res = await fetch(`/api/admin/files/${moveFileTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          folder_id: newFolderForMove === 'root' || newFolderForMove === '' ? null : newFolderForMove
        })
      });
      if (res.ok) {
        setStatusMessage({ type: 'success', text: `Файл "${moveFileTarget.name}" перемещен` });
        setMoveFileTarget(null);
        fetchFiles();
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Save Token
  const handleSaveToken = () => {
    if (!tokenInput.trim()) return;
    fileService.setToken(tokenInput.trim());
    setStatusMessage({ type: 'success', text: 'Токен ProTalk успешно сохранен' });
    setShowTokenModal(false);
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(label);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Get Direct URL (original ProTalk storage link)
  const getDirectUrl = (file: StoredFileRecord) => {
    if (file.original_url && file.original_url.startsWith('http')) {
      return file.original_url;
    }
    if (file.direct_url && file.direct_url.startsWith('http')) {
      return file.direct_url;
    }
    const origin = window.location.origin;
    return `${origin}/file/${file.id}/${encodeURIComponent(file.name)}`;
  };

  // Format Bytes
  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Audio Play toggle
  const togglePlayAudio = (file: StoredFileRecord) => {
    if (playingAudioId === file.id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const url = getDirectUrl(file);
      const audio = new Audio(url);
      audio.play().catch(err => {
        console.warn('Audio playback failed:', err);
        setPlayingAudioId(null);
      });
      audioRef.current = audio;
      setPlayingAudioId(file.id);
      audio.onended = () => setPlayingAudioId(null);
      audio.onerror = () => setPlayingAudioId(null);
    }
  };

  // Helper file icon
  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'image': return <ImageIcon className="w-5 h-5 text-emerald-400" />;
      case 'video': return <Film className="w-5 h-5 text-purple-400" />;
      case 'audio': return <Music className="w-5 h-5 text-amber-400" />;
      case 'document': return <FileText className="w-5 h-5 text-blue-400" />;
      default: return <File className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* HEADER CONTROLS & ACTIONS */}
      <div className="bg-transparent backdrop-blur-2xl p-5 sm:p-6 rounded-3xl border border-primary/25 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-transparent backdrop-blur-xl text-primary rounded-2xl border border-primary/30 shrink-0">
              <FolderOpen className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2">
                Облако файлов и галерея ProTalk
              </h1>
              <p className="text-sm text-foreground/75">
                Прямые облачные ссылки <code className="text-primary font-mono font-bold bg-transparent backdrop-blur-md px-2 py-0.5 rounded-lg border border-primary/25">https://file.pro-talk.ru/...</code> для контента, звуков и аватаров
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Navigate to System Audio Studio (/system-admin/audio) */}
            <LeafButton
              variant="primary"
              size="sm"
              onClick={() => navigate('/system-admin/audio')}
              icon={<Music className="w-4 h-4" />}
            >
              <span>Звуки и музыка игр</span>
            </LeafButton>

            {/* Upload File Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />
            <LeafButton
              variant="primary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              icon={<Upload className="w-4 h-4" />}
            >
              <span>
                {uploading
                  ? `Загрузка ${batchUploadInfo?.percent ?? uploadProgress}%...`
                  : 'Загрузить файл'}
              </span>
            </LeafButton>

            {/* Upload by URL */}
            <BubbleElement
              size="md"
              onClick={() => setShowUrlUploadModal(true)}
              icon={<LinkIcon className="w-4 h-4 text-primary" />}
            >
              <span>По ссылке</span>
            </BubbleElement>

            {/* Create Folder */}
            <BubbleElement
              size="md"
              onClick={() => setShowFolderModal(true)}
              icon={<FolderPlus className="w-4 h-4 text-primary" />}
            >
              <span>Папка</span>
            </BubbleElement>

            {/* Filter by Uploader / Author Button */}
            <BubbleElement
              size="md"
              active={selectedUploader !== 'all'}
              onClick={() => { fetchUploaders(); setShowUploaderModal(true); }}
              icon={<Users className="w-4 h-4 text-primary" />}
              title="Фильтр файлов по автору"
            >
              <span>
                {selectedUploader !== 'all'
                  ? `Автор: ${uploaders.find(u => u.uid === selectedUploader)?.display_name || selectedUploader}`
                  : 'Фильтр по автору'}
              </span>
            </BubbleElement>

            {selectedUploader !== 'all' && (
              <BubbleElement
                size="sm"
                onClick={() => setSelectedUploader('all')}
                icon={<X className="w-4 h-4 text-primary" />}
                title="Сбросить фильтр по автору"
              />
            )}

            {/* ProTalk Token Config */}
            <BubbleElement
              size="md"
              onClick={() => setShowTokenModal(true)}
              icon={<Key className="w-4 h-4 text-amber-400" />}
              title="Настройки токена ProTalk"
            />

            {/* Refresh */}
            <BubbleElement
              size="md"
              onClick={() => { fetchFolders(); fetchFiles(); fetchUploaders(); }}
              icon={<RefreshCw className={`w-4 h-4 text-primary ${loading ? 'animate-spin' : ''}`} />}
              title="Обновить список"
            />
          </div>
        </div>

        {/* LIVE PERCENTAGE UPLOAD PROGRESS BAR */}
        {(uploading || batchUploadInfo) && (
          <div className="p-4 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-2xl space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-bold text-foreground truncate">
                Загрузка в галерею
                {batchUploadInfo
                  ? ` (${batchUploadInfo.current}/${batchUploadInfo.total}): ${batchUploadInfo.fileName}`
                  : '...'}
              </span>
              <BubbleElement isBadge active size="sm" className="!text-sm font-mono shrink-0">
                {batchUploadInfo?.percent ?? uploadProgress}%
              </BubbleElement>
            </div>
            <div className="w-full h-2.5 rounded-full border border-primary/30 bg-transparent overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-150 shadow-[0_0_12px_rgba(153,208,55,0.8)]"
                style={{ width: `${Math.max(3, batchUploadInfo?.percent ?? uploadProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* STATUS ALERT */}
        {statusMessage && (
          <div className={`p-3.5 rounded-2xl text-sm font-medium flex items-center justify-between bg-transparent backdrop-blur-2xl ${
            statusMessage.type === 'success' ? 'text-emerald-400 border border-emerald-500/35' : 'text-rose-400 border border-rose-500/35'
          }`}>
            <span>{statusMessage.text}</span>
            <BubbleElement size="sm" onClick={() => setStatusMessage(null)} icon={<X className="w-4 h-4" />} />
          </div>
        )}

        {/* SEARCH & FILTERS BAR */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-primary/15">
          
          {/* Search bar */}
          <form onSubmit={handleSearch} className="md:col-span-5 flex items-center gap-2">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40" />
              <input
                type="text"
                placeholder="Поиск по названию или ключу..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-transparent backdrop-blur-xl border border-primary/25 rounded-2xl text-sm focus:outline-none focus:border-primary text-foreground"
              />
            </div>
            <LeafButton type="submit" variant="glass" size="sm">
              <span>Найти</span>
            </LeafButton>
          </form>

          {/* Type Tabs (wrapped bubbles without horizontal scroll) */}
          <div className="md:col-span-5 flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'Все', icon: File },
              { id: 'image', label: 'Картинки', icon: ImageIcon },
              { id: 'video', label: 'Видео', icon: Film },
              { id: 'audio', label: 'Аудио', icon: Music },
              { id: 'document', label: 'Документы', icon: FileText },
            ].map((t) => {
              const IconComp = t.icon;
              return (
                <BubbleElement
                  key={t.id}
                  size="sm"
                  active={activeFileType === t.id}
                  onClick={() => setActiveFileType(t.id as any)}
                  icon={<IconComp className="w-4 h-4" />}
                >
                  <span>{t.label}</span>
                </BubbleElement>
              );
            })}
          </div>

          {/* View mode toggle */}
          <div className="md:col-span-2 flex items-center justify-end gap-1.5">
            <BubbleElement
              size="sm"
              active={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              icon={<Grid className="w-4 h-4" />}
              title="Сетка"
            />
            <BubbleElement
              size="sm"
              active={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              icon={<List className="w-4 h-4" />}
              title="Список"
            />
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER: FOLDERS SIDEBAR + FILE GALLERY */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* FOLDERS SIDEBAR */}
        <div className="lg:col-span-1 bg-transparent backdrop-blur-2xl rounded-3xl border border-primary/25 p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-primary/15 pb-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Folder className="w-4 h-4 text-primary" />
              <span>Папки хранилища</span>
            </h3>
            <BubbleElement
              size="sm"
              onClick={() => setShowFolderModal(true)}
              icon={<FolderPlus className="w-4 h-4 text-primary" />}
              title="Создать папку"
            />
          </div>

          <div className="space-y-2 flex flex-col">
            <BubbleElement
              size="md"
              active={selectedFolder === 'all'}
              onClick={() => setSelectedFolder('all')}
              className="w-full justify-start"
              icon={<FolderOpen className="w-4 h-4 text-amber-400" />}
            >
              <span>Все файлы</span>
            </BubbleElement>

            <BubbleElement
              size="md"
              active={selectedFolder === 'root'}
              onClick={() => setSelectedFolder('root')}
              className="w-full justify-start"
              icon={<Folder className="w-4 h-4 text-foreground/60" />}
            >
              <span>Без папки (Корень)</span>
            </BubbleElement>

            {folders.map((f) => (
              <div key={f.id} className="group flex items-center justify-between gap-1.5">
                <BubbleElement
                  size="md"
                  active={selectedFolder === f.id}
                  onClick={() => setSelectedFolder(f.id)}
                  className="flex-1 justify-start min-w-0"
                  icon={<Folder className="w-4 h-4 text-primary shrink-0" />}
                >
                  <span className="truncate">{f.name}</span>
                </BubbleElement>
                {f.id !== 'folder_sounds' && (
                  <BubbleElement
                    size="sm"
                    onClick={() => promptDeleteFolder(f.id, f.name)}
                    icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
                    title="Удалить папку"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* FILE GALLERY CONTENT */}
        <div className="lg:col-span-3 bg-transparent backdrop-blur-2xl rounded-3xl border border-primary/25 p-5 sm:p-6 space-y-4 shadow-xl">
          
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/15 pb-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-sm font-medium text-foreground/70">Раздел:</span>
              <BubbleElement size="sm" isBadge active>
                <span className="font-mono">
                  {selectedFolder === 'all' ? 'Все файлы' : selectedFolder === 'root' ? 'Корень' : (folders.find(f => f.id === selectedFolder)?.name || selectedFolder)}
                </span>
              </BubbleElement>
              <BubbleElement size="sm" isBadge>
                <span className="font-mono">{files.length} шт.</span>
              </BubbleElement>
            </div>

            {selectedUploader !== 'all' && (
              <div className="flex items-center gap-2">
                <BubbleElement size="sm" isBadge active icon={<UserCheck className="w-4 h-4" />}>
                  <span>Автор: {uploaders.find(u => u.uid === selectedUploader)?.display_name || selectedUploader}</span>
                </BubbleElement>
                <BubbleElement
                  size="sm"
                  onClick={() => setSelectedUploader('all')}
                  icon={<X className="w-3.5 h-3.5" />}
                  title="Сбросить фильтр"
                />
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center text-foreground/70 text-sm animate-pulse">
              Загрузка файлов из базы данных...
            </div>
          ) : files.length === 0 ? (
            <div className="p-12 text-center text-foreground/70 text-sm space-y-3">
              <p>В этом разделе пока нет файлов</p>
              <LeafButton
                variant="primary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                icon={<Upload className="w-4 h-4" />}
              >
                <span>Загрузить первый файл</span>
              </LeafButton>
            </div>
          ) : viewMode === 'grid' ? (
            /* GRID VIEW GALLERY */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {files.map((file) => {
                const directUrl = getDirectUrl(file);
                const isPlaying = playingAudioId === file.id;
                const uploaderLabel = file.uploader_name || file.uploader_username || (file.user_id ? `UID ${file.user_id}` : 'Система');

                return (
                  <div
                    key={file.id}
                    className="bg-transparent border border-primary/25 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-primary/45 transition group shadow-md backdrop-blur-xl relative overflow-hidden"
                  >
                    {/* Top: ID, Folder & Uploader */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-sm font-mono">
                        <BubbleElement size="sm" isBadge active>
                          <span>ID: {file.id}</span>
                        </BubbleElement>
                        {file.folder_name && (
                          <BubbleElement size="sm" isBadge className="max-w-[130px] truncate">
                            <span className="truncate">{file.folder_name}</span>
                          </BubbleElement>
                        )}
                      </div>

                      {/* Uploader indicator badge */}
                      <div 
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-transparent backdrop-blur-md border border-primary/20 text-sm text-foreground/85 truncate"
                        title={`Загрузил: ${uploaderLabel}`}
                      >
                        {file.uploader_avatar_url || file.uploader_photo_url ? (
                          <img 
                            src={file.uploader_avatar_url || file.uploader_photo_url} 
                            alt="" 
                            className="w-4 h-4 rounded-full object-cover shrink-0 border border-primary/30" 
                          />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                        )}
                        <span className="truncate text-sm font-semibold text-foreground/90">
                          {uploaderLabel}
                        </span>
                      </div>
                    </div>

                    {/* PREVIEW CONTAINER */}
                    <div
                      onClick={() => setPreviewFile(file)}
                      className="aspect-video w-full rounded-xl bg-transparent backdrop-blur-md border border-primary/25 flex items-center justify-center overflow-hidden cursor-pointer relative group-hover:scale-[1.01] transition"
                      style={
                        file.file_type === 'image'
                          ? {
                              backgroundImage: 'repeating-conic-gradient(rgba(255, 255, 255, 0.08) 0% 25%, transparent 0% 50%)',
                              backgroundSize: '16px 16px'
                            }
                          : undefined
                      }
                    >
                      {file.file_type === 'image' ? (
                        <img
                          src={directUrl}
                          alt={file.name}
                          className="max-h-full max-w-full object-contain rounded-lg p-1 drop-shadow-md"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = file.original_url;
                          }}
                        />
                      ) : file.file_type === 'video' ? (
                        <div className="flex flex-col items-center justify-center gap-1 text-purple-400">
                          <Film className="w-8 h-8" />
                          <span className="text-sm font-bold">Видео</span>
                        </div>
                      ) : file.file_type === 'audio' ? (
                        <div className="flex flex-col items-center justify-center gap-2 text-amber-400">
                          <BubbleElement
                            size="md"
                            active={isPlaying}
                            onClick={(e) => { e.stopPropagation(); togglePlayAudio(file); }}
                            icon={isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                          />
                          <span className="text-sm font-bold">Аудио трек</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1 text-blue-400">
                          <FileText className="w-8 h-8" />
                          <span className="text-sm font-bold">
                            {file.name.split('.').pop() || 'Документ'}
                          </span>
                        </div>
                      )}

                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-transparent backdrop-blur-md opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                        <LeafButton variant="primary" size="sm" icon={<Eye className="w-4 h-4" />}>
                          <span>Предпросмотр</span>
                        </LeafButton>
                      </div>
                    </div>

                    {/* FILE DETAILS */}
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-foreground truncate" title={file.name}>
                        {file.name}
                      </p>
                      <div className="flex items-center justify-between text-sm font-mono text-foreground/60">
                        <span>{formatSize(file.size)}</span>
                        <span className="truncate max-w-[130px]">{file.file_key}</span>
                      </div>
                    </div>

                    {/* ACTIONS BAR */}
                    <div className="pt-2 border-t border-primary/15 flex flex-wrap items-center justify-between gap-1.5">
                      {/* Copy Direct URL */}
                      <LeafButton
                        variant={copiedId === `direct_${file.id}` ? 'primary' : 'glass'}
                        size="sm"
                        onClick={() => copyToClipboard(directUrl, `direct_${file.id}`)}
                        icon={copiedId === `direct_${file.id}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        className="flex-1"
                        title="Скопировать прямую ссылку"
                      >
                        <span>Ссылка</span>
                      </LeafButton>

                      {/* Preview File */}
                      <BubbleElement
                        size="sm"
                        onClick={() => setPreviewFile(file)}
                        icon={<Eye className="w-3.5 h-3.5 text-primary" />}
                        title="Открыть предпросмотр"
                      />

                      {/* Rename File */}
                      <BubbleElement
                        size="sm"
                        onClick={() => promptRenameFile(file)}
                        icon={<Edit className="w-3.5 h-3.5 text-primary" />}
                        title="Переименовать файл"
                      />

                      {/* Move Folder */}
                      <BubbleElement
                        size="sm"
                        onClick={() => { setMoveFileTarget(file); setNewFolderForMove(file.folder_id || 'root'); }}
                        icon={<ArrowRightLeft className="w-3.5 h-3.5 text-foreground/80" />}
                        title="Переместить в папку"
                      />

                      {/* Delete */}
                      <BubbleElement
                        size="sm"
                        onClick={() => promptDeleteFile(file.id, file.name)}
                        icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
                        title="Удалить файл"
                      />
                    </div>

                  </div>
                );
              })}
            </div>
          ) : (
            /* LIST VIEW GALLERY */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-primary/20 bg-transparent backdrop-blur-md font-bold text-primary text-sm">
                    <th className="p-3">ID</th>
                    <th className="p-3">Тип</th>
                    <th className="p-3">Название</th>
                    <th className="p-3">Папка</th>
                    <th className="p-3">Загрузил</th>
                    <th className="p-3">Размер</th>
                    <th className="p-3">Ключ</th>
                    <th className="p-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/15">
                  {files.map((file) => {
                    const directUrl = getDirectUrl(file);
                    const uploaderLabel = file.uploader_name || file.uploader_username || (file.user_id ? `UID ${file.user_id}` : 'Система');
                    return (
                      <tr key={file.id} className="hover:bg-primary/5 transition font-mono text-sm">
                        <td className="p-3 font-bold text-primary">#{file.id}</td>
                        <td className="p-3">{getFileIcon(file.file_type)}</td>
                        <td className="p-3 font-sans font-semibold text-foreground max-w-[200px] truncate" title={file.name}>
                          {file.name}
                        </td>
                        <td className="p-3 text-foreground/75">{file.folder_name || '—'}</td>
                        <td className="p-3 font-sans text-sm">
                          <div className="flex items-center gap-1.5">
                            {file.uploader_avatar_url || file.uploader_photo_url ? (
                              <img src={file.uploader_avatar_url || file.uploader_photo_url} alt="" className="w-5 h-5 rounded-full object-cover border border-primary/30 shrink-0" />
                            ) : (
                              <UserCheck className="w-4 h-4 text-primary shrink-0" />
                            )}
                            <span className="font-semibold text-foreground/90 truncate max-w-[120px]" title={uploaderLabel}>
                              {uploaderLabel}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-foreground/70">{formatSize(file.size)}</td>
                        <td className="p-3 text-foreground/70">{file.file_key}</td>
                        <td className="p-3 text-right font-sans">
                          <div className="flex items-center justify-end gap-1.5">
                            <BubbleElement
                              size="sm"
                              onClick={() => setPreviewFile(file)}
                              icon={<Eye className="w-4 h-4 text-primary" />}
                              title="Предпросмотр"
                            />
                            <LeafButton
                              variant={copiedId === `direct_list_${file.id}` ? 'primary' : 'glass'}
                              size="sm"
                              onClick={() => copyToClipboard(directUrl, `direct_list_${file.id}`)}
                              icon={copiedId === `direct_list_${file.id}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              title="Скопировать ссылку"
                            >
                              <span>Копировать</span>
                            </LeafButton>
                            <BubbleElement
                              size="sm"
                              onClick={() => promptRenameFile(file)}
                              icon={<Edit className="w-4 h-4 text-primary" />}
                              title="Переименовать"
                            />
                            <BubbleElement
                              size="sm"
                              onClick={() => { setMoveFileTarget(file); setNewFolderForMove(file.folder_id || 'root'); }}
                              icon={<ArrowRightLeft className="w-4 h-4 text-foreground/80" />}
                              title="Переместить"
                            />
                            <BubbleElement
                              size="sm"
                              onClick={() => promptDeleteFile(file.id, file.name)}
                              icon={<Trash2 className="w-4 h-4 text-rose-400" />}
                              title="Удалить"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>

      {/* MODAL 1: UPLOAD BY URL (Centered on viewport via createPortal) */}
      {showUrlUploadModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-transparent backdrop-blur-2xl flex items-center justify-center p-4"
          onClick={() => setShowUrlUploadModal(false)}
        >
          <div
            className="bg-transparent border border-primary/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl backdrop-blur-3xl text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-primary" />
                <span>Загрузка файла по ссылке</span>
              </h3>
              <BubbleElement size="sm" onClick={() => setShowUrlUploadModal(false)} icon={<X className="w-4 h-4" />} />
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-bold text-foreground/80">Прямая ссылка на файл</label>
                <input
                  type="url"
                  placeholder="https://example.com/image.png"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2.5 bg-transparent backdrop-blur-xl border border-primary/30 rounded-2xl text-sm font-mono focus:outline-none focus:border-primary text-foreground"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-foreground/80">Целевая папка</label>
                <select
                  value={targetFolderForUrl}
                  onChange={(e) => setTargetFolderForUrl(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2.5 bg-transparent backdrop-blur-xl border border-primary/30 rounded-2xl text-sm font-mono text-foreground focus:outline-none"
                >
                  <option value="">Без папки (Корень)</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              {uploading && (
                <div className="p-3 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-xl space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground">Загрузка файла по ссылке...</span>
                    <BubbleElement isBadge active size="sm" className="!text-sm font-mono">
                      {uploadProgress}%
                    </BubbleElement>
                  </div>
                  <div className="w-full h-2 rounded-full border border-primary/30 bg-transparent overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-150"
                      style={{ width: `${Math.max(5, uploadProgress)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <BubbleElement size="md" onClick={() => setShowUrlUploadModal(false)}>
                <span>Отмена</span>
              </BubbleElement>
              <LeafButton
                variant="primary"
                size="sm"
                onClick={handleUploadUrl}
                disabled={uploading || !urlInput.trim()}
              >
                <span>{uploading ? `Загрузка ${uploadProgress}%...` : 'Загрузить'}</span>
              </LeafButton>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 2: CREATE FOLDER (Centered on viewport via createPortal) */}
      {showFolderModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-transparent backdrop-blur-2xl flex items-center justify-center p-4"
          onClick={() => setShowFolderModal(false)}
        >
          <div
            className="bg-transparent border border-primary/40 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl backdrop-blur-3xl text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-primary" />
                <span>Новая папка</span>
              </h3>
              <BubbleElement size="sm" onClick={() => setShowFolderModal(false)} icon={<X className="w-4 h-4" />} />
            </div>

            <div>
              <label className="text-sm font-bold text-foreground/80">Название папки</label>
              <input
                type="text"
                placeholder="например: Вопросы квиза"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full mt-1 px-3.5 py-2.5 bg-transparent backdrop-blur-xl border border-primary/30 rounded-2xl text-sm focus:outline-none focus:border-primary text-foreground"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <BubbleElement size="md" onClick={() => setShowFolderModal(false)}>
                <span>Отмена</span>
              </BubbleElement>
              <LeafButton
                variant="primary"
                size="sm"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                <span>Создать</span>
              </LeafButton>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 3: MOVE FILE TO FOLDER (Centered on viewport via createPortal) */}
      {moveFileTarget && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-transparent backdrop-blur-2xl flex items-center justify-center p-4"
          onClick={() => setMoveFileTarget(null)}
        >
          <div
            className="bg-transparent border border-primary/40 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl backdrop-blur-3xl text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-primary" />
                <span>Перемещение файла</span>
              </h3>
              <BubbleElement size="sm" onClick={() => setMoveFileTarget(null)} icon={<X className="w-4 h-4" />} />
            </div>

            <p className="text-sm text-foreground/85 truncate">
              Файл: <strong className="text-primary font-mono">{moveFileTarget.name}</strong>
            </p>

            <div>
              <label className="text-sm font-bold text-foreground/80">Выберите папку</label>
              <select
                value={newFolderForMove}
                onChange={(e) => setNewFolderForMove(e.target.value)}
                className="w-full mt-1 px-3.5 py-2.5 bg-transparent backdrop-blur-xl border border-primary/30 rounded-2xl text-sm font-mono text-foreground focus:outline-none"
              >
                <option value="root">Без папки (Корень)</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <BubbleElement size="md" onClick={() => setMoveFileTarget(null)}>
                <span>Отмена</span>
              </BubbleElement>
              <LeafButton variant="primary" size="sm" onClick={handleMoveFile}>
                <span>Сохранить</span>
              </LeafButton>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 4: PROTALK TOKEN SETTINGS (Centered on viewport via createPortal) */}
      {showTokenModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-transparent backdrop-blur-2xl flex items-center justify-center p-4"
          onClick={() => setShowTokenModal(false)}
        >
          <div
            className="bg-transparent border border-primary/40 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl backdrop-blur-3xl text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <span>Токен авторизации ProTalk</span>
              </h3>
              <BubbleElement size="sm" onClick={() => setShowTokenModal(false)} icon={<X className="w-4 h-4" />} />
            </div>

            <div className="space-y-2">
              <p className="text-sm text-foreground/80">
                Задайте свой токен авторизации для сервиса <code className="font-mono text-primary bg-transparent border border-primary/25 px-1.5 py-0.5 rounded-lg">file.pro-talk.ru</code>. Токен будет сохранен в памяти вашего браузера.
              </p>
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-transparent backdrop-blur-xl border border-primary/30 rounded-2xl text-sm font-mono focus:outline-none focus:border-primary text-foreground"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <BubbleElement size="md" onClick={() => setShowTokenModal(false)}>
                <span>Отмена</span>
              </BubbleElement>
              <LeafButton variant="primary" size="sm" onClick={handleSaveToken}>
                <span>Сохранить токен</span>
              </LeafButton>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 5: FULL PREVIEW & DETAIL (Centered on viewport via createPortal) */}
      {previewFile && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-transparent backdrop-blur-2xl flex items-center justify-center p-4"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="bg-transparent border border-primary/40 rounded-3xl max-w-3xl w-full p-5 sm:p-6 space-y-5 shadow-2xl backdrop-blur-3xl max-h-[90vh] overflow-y-auto text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-primary/20 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <BubbleElement size="sm" isBadge active>
                  <span className="font-mono">ID: {previewFile.id}</span>
                </BubbleElement>
                <h3 className="font-bold text-base sm:text-lg text-foreground truncate">
                  {previewFile.name}
                </h3>
              </div>
              <BubbleElement
                size="sm"
                onClick={() => setPreviewFile(null)}
                icon={<X className="w-5 h-5" />}
                title="Закрыть предпросмотр"
              />
            </div>

            {/* PREVIEW CONTENT */}
            <div
              className="bg-transparent backdrop-blur-xl rounded-2xl p-4 flex items-center justify-center border border-primary/25 min-h-[240px] relative overflow-hidden"
              style={
                previewFile.file_type === 'image'
                  ? {
                      backgroundImage: 'repeating-conic-gradient(rgba(255, 255, 255, 0.08) 0% 25%, transparent 0% 50%)',
                      backgroundSize: '20px 20px'
                    }
                  : undefined
              }
            >
              {previewFile.file_type === 'image' ? (
                <img
                  src={getDirectUrl(previewFile)}
                  alt={previewFile.name}
                  className="max-h-[420px] w-auto object-contain rounded-xl drop-shadow-xl"
                />
              ) : previewFile.file_type === 'video' ? (
                <video
                  src={getDirectUrl(previewFile)}
                  controls
                  className="max-h-[400px] w-full rounded-xl"
                />
              ) : previewFile.file_type === 'audio' ? (
                <div className="w-full space-y-4 text-center p-4">
                  <Music className="w-12 h-12 text-amber-400 mx-auto animate-bounce" />
                  <audio src={getDirectUrl(previewFile)} controls className="w-full" />
                </div>
              ) : (
                <div className="text-center space-y-2 p-6">
                  <FileText className="w-16 h-16 text-blue-400 mx-auto" />
                  <p className="text-sm text-foreground/80 font-mono">{previewFile.name}</p>
                </div>
              )}
            </div>

            {/* URLS & KEYS DISPLAY */}
            <div className="space-y-3 font-mono text-sm">
              <div>
                <label className="text-sm font-bold text-primary">Прямая облачная ссылка ProTalk</label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
                  <input
                    type="text"
                    readOnly
                    value={getDirectUrl(previewFile)}
                    className="w-full px-3.5 py-2.5 bg-transparent backdrop-blur-xl border border-primary/30 rounded-2xl text-sm text-foreground"
                  />
                  <LeafButton
                    variant="primary"
                    size="sm"
                    onClick={() => copyToClipboard(getDirectUrl(previewFile), 'preview_direct')}
                    icon={copiedId === 'preview_direct' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  >
                    <span>{copiedId === 'preview_direct' ? 'Скопировано' : 'Копировать'}</span>
                  </LeafButton>
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-foreground/80">Оригинальный адрес в хранилище</label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
                  <input
                    type="text"
                    readOnly
                    value={previewFile.original_url}
                    className="w-full px-3.5 py-2.5 bg-transparent backdrop-blur-xl border border-primary/20 rounded-2xl text-sm text-foreground/85"
                  />
                  <BubbleElement
                    size="md"
                    onClick={() => copyToClipboard(previewFile.original_url, 'preview_orig')}
                    icon={copiedId === 'preview_orig' ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-primary" />}
                  >
                    <span>{copiedId === 'preview_orig' ? 'Скопировано' : 'Копировать'}</span>
                  </BubbleElement>
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-foreground/80">Короткий ключ для ИИ / текста</label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
                  <input
                    type="text"
                    readOnly
                    value={`{{${previewFile.file_key}}}`}
                    className="w-full px-3.5 py-2.5 bg-transparent backdrop-blur-xl border border-primary/20 rounded-2xl text-sm text-foreground/85"
                  />
                  <BubbleElement
                    size="md"
                    onClick={() => copyToClipboard(`{{${previewFile.file_key}}}`, 'preview_key')}
                    icon={copiedId === 'preview_key' ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-primary" />}
                  >
                    <span>{copiedId === 'preview_key' ? 'Скопировано' : 'Копировать'}</span>
                  </BubbleElement>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-primary/20">
              <BubbleElement
                size="md"
                onClick={() => promptRenameFile(previewFile)}
                icon={<Edit className="w-4 h-4 text-primary" />}
              >
                <span>Переименовать</span>
              </BubbleElement>
              <BubbleElement
                size="md"
                onClick={() => promptDeleteFile(previewFile.id, previewFile.name)}
                icon={<Trash2 className="w-4 h-4 text-rose-400" />}
              >
                <span className="text-rose-400">Удалить</span>
              </BubbleElement>
              <a
                href={getDirectUrl(previewFile)}
                target="_blank"
                rel="noreferrer"
                download={previewFile.name}
              >
                <LeafButton variant="glass" size="sm" icon={<Download className="w-4 h-4" />}>
                  <span>Скачать</span>
                </LeafButton>
              </a>
              <LeafButton
                variant="primary"
                size="sm"
                onClick={() => setPreviewFile(null)}
              >
                <span>Закрыть</span>
              </LeafButton>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* MODAL 6: RENAME FILE (Centered on viewport via createPortal) */}
      {renameFileTarget && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-transparent backdrop-blur-2xl flex items-center justify-center p-4"
          onClick={() => setRenameFileTarget(null)}
        >
          <div
            className="bg-transparent border border-primary/40 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl backdrop-blur-3xl text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <Edit className="w-5 h-5 text-primary" />
                <span>Переименование файла</span>
              </h3>
              <BubbleElement size="sm" onClick={() => setRenameFileTarget(null)} icon={<X className="w-4 h-4" />} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-bold text-foreground/80">Новое название файла</label>
              <input
                type="text"
                value={renameFileName}
                onChange={(e) => setRenameFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameFile();
                }}
                className="w-full px-3.5 py-2.5 bg-transparent backdrop-blur-xl border border-primary/30 rounded-2xl text-sm font-mono focus:outline-none focus:border-primary text-foreground"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-primary/15">
              <BubbleElement size="md" onClick={() => setRenameFileTarget(null)}>
                <span>Отмена</span>
              </BubbleElement>
              <LeafButton
                variant="primary"
                size="sm"
                onClick={handleRenameFile}
                disabled={!renameFileName.trim()}
              >
                <span>Сохранить</span>
              </LeafButton>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 7: CONFIRM DELETE (Centered on viewport via createPortal) */}
      {deleteModalTarget && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-transparent backdrop-blur-2xl flex items-center justify-center p-4"
          onClick={() => setDeleteModalTarget(null)}
        >
          <div
            className="bg-transparent border border-rose-500/40 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl backdrop-blur-3xl text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
              <h3 className="font-bold text-base text-rose-400 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-400" />
                <span>Подтверждение удаления</span>
              </h3>
              <BubbleElement size="sm" onClick={() => setDeleteModalTarget(null)} icon={<X className="w-4 h-4" />} />
            </div>

            <div className="space-y-2 text-sm text-foreground/90">
              <p>
                Вы уверены, что хотите удалить {deleteModalTarget.type === 'folder' ? 'папку' : 'файл'}:
              </p>
              <div className="p-3 bg-transparent backdrop-blur-xl border border-rose-500/30 rounded-2xl font-mono text-sm text-rose-300 font-bold break-all">
                {deleteModalTarget.name}
              </div>
              <p className="text-sm text-foreground/70 italic">
                {deleteModalTarget.type === 'folder'
                  ? 'Файлы из этой папки перенесутся в корень (не будут удалены).'
                  : 'Запись о файле будет удалена из базы данных.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-rose-500/15">
              <BubbleElement size="md" onClick={() => setDeleteModalTarget(null)}>
                <span>Отмена</span>
              </BubbleElement>
              <LeafButton
                variant="dark"
                size="sm"
                onClick={confirmDelete}
                className="border-rose-500/40 text-rose-300"
                icon={<Trash2 className="w-4 h-4 text-rose-400" />}
              >
                <span>Удалить</span>
              </LeafButton>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 8: FILTER BY UPLOADER / AUTHOR (Centered on viewport via createPortal) */}
      {showUploaderModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-transparent backdrop-blur-2xl flex items-center justify-center p-4"
          onClick={() => setShowUploaderModal(false)}
        >
          <div
            className="bg-transparent backdrop-blur-3xl border border-primary/35 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-primary/20 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-transparent backdrop-blur-xl text-primary rounded-xl border border-primary/25">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground">
                    Фильтр файлов по автору
                  </h3>
                  <p className="text-sm text-foreground/75">
                    Выберите пользователя для просмотра загруженных им файлов
                  </p>
                </div>
              </div>
              <BubbleElement
                size="sm"
                onClick={() => setShowUploaderModal(false)}
                icon={<X className="w-5 h-5" />}
              />
            </div>

            {/* Search uploader */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40" />
              <input
                type="text"
                placeholder="Поиск по имени, username или UID..."
                value={uploaderSearch}
                onChange={(e) => setUploaderSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-transparent backdrop-blur-xl border border-primary/25 rounded-2xl text-sm focus:outline-none focus:border-primary text-foreground"
              />
            </div>

            {/* Uploaders list */}
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {/* All uploaders option */}
              <div
                onClick={() => {
                  setSelectedUploader('all');
                  setShowUploaderModal(false);
                }}
                className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer bg-transparent backdrop-blur-xl ${
                  selectedUploader === 'all'
                    ? 'border-primary text-primary shadow-[0_0_15px_rgba(153,208,55,0.15)] font-bold'
                    : 'border-primary/20 hover:border-primary/40 text-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-transparent border border-primary/30 flex items-center justify-center text-primary shrink-0">
                    <FolderOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Все авторы</p>
                    <p className="text-sm text-foreground/70">Показать все файлы в хранилище</p>
                  </div>
                </div>
                {selectedUploader === 'all' && (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                )}
              </div>

              {uploaders
                .filter((u) => {
                  if (!uploaderSearch) return true;
                  const query = uploaderSearch.toLowerCase();
                  const nameMatch = (u.display_name || '').toLowerCase().includes(query);
                  const userMatch = (u.username || '').toLowerCase().includes(query);
                  const uidMatch = (u.uid || '').toLowerCase().includes(query);
                  return nameMatch || userMatch || uidMatch;
                })
                .map((u, idx) => {
                  const isSelected = selectedUploader === u.uid;
                  return (
                    <div
                      key={`uploader-${u.uid || u.id}-${idx}`}
                      onClick={() => {
                        setSelectedUploader(u.uid);
                        setShowUploaderModal(false);
                      }}
                      className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer bg-transparent backdrop-blur-xl ${
                        isSelected
                          ? 'border-primary text-primary shadow-[0_0_15px_rgba(153,208,55,0.15)] font-bold'
                          : 'border-primary/20 hover:border-primary/40 text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {u.avatar_url || u.photo_url ? (
                          <img
                            src={u.avatar_url || u.photo_url}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-primary/30 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-transparent border border-primary/30 flex items-center justify-center text-primary shrink-0">
                            <UserCheck className="w-4 h-4" />
                          </div>
                        )}
                        <div className="truncate">
                          <p className="text-sm font-bold truncate">
                            {u.display_name}
                          </p>
                          <p className="text-sm text-foreground/70 truncate font-mono">
                            {u.username ? `@${u.username}` : u.uid === 'system' ? 'Системные файлы' : `ID: ${u.uid}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <BubbleElement size="sm" isBadge>
                          <span className="font-mono">
                            {u.file_count} {u.file_count === 1 ? 'файл' : u.file_count < 5 ? 'файла' : 'файлов'}
                          </span>
                        </BubbleElement>
                        {isSelected && (
                          <Check className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-primary/15">
              <BubbleElement size="md" onClick={() => setShowUploaderModal(false)}>
                <span>Закрыть</span>
              </BubbleElement>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};
