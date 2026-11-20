// useFileUpload.ts
import { useState } from 'react';
import { getUploadService, StoredFileRecord } from '../services/FileUploadService';

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const service = getUploadService();

  const upload = async (
    file: File | string,
    folderId?: string | null,
    key?: string,
    userId?: string | null,
    onProgress?: (percent: number) => void
  ) => {
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const result = await service.uploadAndStore(
        file,
        folderId,
        key,
        userId,
        undefined,
        (pct) => {
          setProgress(pct);
          if (onProgress) onProgress(pct);
        }
      );
      setProgress(100);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      throw err;
    } finally {
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 400);
    }
  };

  const getUrl = (key: string) => service.getFileUrl(key);
  const replaceKeys = (text: string) => service.replaceKeysWithUrls(text);

  return {
    upload,
    getUrl,
    replaceKeys,
    uploading,
    progress,
    error,
    service
  };
}
