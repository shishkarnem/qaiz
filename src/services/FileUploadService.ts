// FileUploadService.ts

export const UPLOAD_URL = "https://file.pro-talk.ru/tgf";
export const FILESTORE_URL = "https://filestore.pro-talk.ru/up";
export const PROXY_FILE_UPLOAD_URL = "/api/files/upload-proxy";
export const PROXY_URL_UPLOAD_URL = "/api/files/upload-url-proxy";
export const STORAGE_KEY = "protalk_upload_token";
export const FILES_MAP_KEY = "protalk_files_map";

export interface FileMap {
  [key: string]: string; // key -> full URL or direct URL
}

export interface StoredFileRecord {
  id: number;
  file_key: string;
  name: string;
  folder_id: string | null;
  folder_name?: string;
  user_id?: string | null;
  uploader_name?: string;
  uploader_username?: string;
  uploader_photo_url?: string;
  uploader_avatar_url?: string;
  uploader_role?: string;
  original_url: string;
  direct_url: string;
  mime_type: string;
  file_type: 'image' | 'video' | 'audio' | 'document' | 'other';
  size: number;
  created_at: string;
}

export class FileUploadService {
  private token: string;

  constructor(token?: string) {
    this.token = token || this.getToken();
  }

  // Получение токена из настроек
  public getToken(): string {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return saved;
    }
    // Токен по умолчанию
    return "YGReV3FiWFBsZlh3GH0WVgI-PSkQEBEoAAVoAxcsbRBXRA5eExN7ZHwMAkwOHxQYaGtdWGtjUgVvAH9YAmk";
  }

  // Установка токена
  public setToken(token: string): void {
    this.token = token;
    localStorage.setItem(STORAGE_KEY, token);
  }

  private parseRawUploadText(text: string): string | null {
    const clean = (text || '').trim();
    if (!clean) return null;
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }
    try {
      const data = JSON.parse(clean);
      if (typeof data === 'string' && (data.startsWith('http://') || data.startsWith('https://'))) {
        return data;
      }
      if (data?.url) return String(data.url);
      if (data?.file) return String(data.file);
    } catch (_) {}
    return null;
  }

  private async parseUploadResponse(response: Response): Promise<string | null> {
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    return this.parseRawUploadText(text);
  }

  private uploadPayloadWithXhr(
    endpoint: string,
    payload: XMLHttpRequestBodyInit,
    headers: Record<string, string>,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);

      Object.entries(headers).forEach(([k, v]) => {
        xhr.setRequestHeader(k, v);
      });

      if (signal) {
        if (signal.aborted) {
          xhr.abort();
          return reject(new Error('Загрузка отменена'));
        }
        signal.addEventListener(
          'abort',
          () => {
            xhr.abort();
            reject(new Error('Загрузка отменена'));
          },
          { once: true }
        );
      }

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable && ev.total > 0) {
            const pct = Math.min(88, Math.max(1, Math.round((ev.loaded / ev.total) * 84)));
            onProgress(pct);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const parsed = this.parseRawUploadText(xhr.responseText || '');
          resolve(parsed);
        } else {
          resolve(null);
        }
      };

      xhr.onerror = () => {
        resolve(null);
      };

      xhr.onabort = () => {
        reject(new Error('Загрузка отменена'));
      };

      xhr.send(payload);
    });
  }

  // Загрузка по URL через same-origin backend proxy (без CORS)
  async uploadFromUrl(url: string, onProgress?: (percent: number) => void): Promise<string> {
    if (onProgress) onProgress(15);
    if (url.includes('filestore.pro-talk.ru/') || url.includes('file.pro-talk.ru/')) {
      if (onProgress) onProgress(85);
      return url;
    }
    try {
      const response = await fetch(PROXY_URL_UPLOAD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Upload-Token": this.token
        },
        body: JSON.stringify({ url, token: this.token })
      });

      if (onProgress) onProgress(85);
      const parsed = await this.parseUploadResponse(response);
      if (parsed) return parsed;
    } catch (_) {}
    if (onProgress) onProgress(85);
    return url;
  }

  // Загрузка из File через same-origin backend proxy в ProTalk (filestore.pro-talk.ru / file.pro-talk.ru) без CORS
  async uploadFromFile(
    file: File,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name || 'file'),
      "X-File-Mime": file.type || 'application/octet-stream',
      "X-Upload-Token": this.token
    };
    if (isPng) {
      headers["X-Preserve-Alpha"] = "true";
    }

    if (onProgress) onProgress(5);

    const proxiedUrl = await this.uploadPayloadWithXhr(
      PROXY_FILE_UPLOAD_URL,
      file,
      headers,
      signal,
      onProgress
    );
    if (proxiedUrl) {
      if (onProgress) onProgress(90);
      return proxiedUrl;
    }

    throw new Error('Не удалось загрузить файл в облачное хранилище ProTalk');
  }

  // Загрузка из Blob
  async uploadFromBlob(blob: Blob, filename: string, onProgress?: (percent: number) => void): Promise<string> {
    const file = new File([blob], filename, { type: blob.type });
    return this.uploadFromFile(file, undefined, onProgress);
  }

  // Загрузка из base64
  async uploadFromBase64(base64: string, filename: string, onProgress?: (percent: number) => void): Promise<string> {
    const response = await fetch(base64);
    const blob = await response.blob();
    return this.uploadFromBlob(blob, filename, onProgress);
  }

  // Получение карты файлов
  public getFileMap(): FileMap {
    const saved = localStorage.getItem(FILES_MAP_KEY);
    return saved ? JSON.parse(saved) : {};
  }

  // Сохранение карты файлов
  public saveFileMap(map: FileMap): void {
    localStorage.setItem(FILES_MAP_KEY, JSON.stringify(map));
  }

  // Добавление файла в карту
  public addFile(key: string, url: string): void {
    const map = this.getFileMap();
    map[key] = url;
    this.saveFileMap(map);
  }

  // Получение URL по ключу
  public getFileUrl(key: string): string | null {
    const map = this.getFileMap();
    return map[key] || null;
  }

  // Удаление файла из карты
  public removeFile(key: string): void {
    const map = this.getFileMap();
    delete map[key];
    this.saveFileMap(map);
  }

  // Получение всех файлов
  public getAllFiles(): FileMap {
    return this.getFileMap();
  }

  // Очистка карты
  public clearFiles(): void {
    localStorage.removeItem(FILES_MAP_KEY);
  }

  // Генерация уникального ключа
  public generateKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Загрузка, сохранение в карту и регистрация в базе данных PostgreSQL (/api/admin/files)
  async uploadAndStore(
    file: File | string,
    folderId?: string | null,
    customKey?: string,
    userId?: string | null,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
  ): Promise<{ key: string; url: string; fileRecord?: StoredFileRecord; dbRecord?: StoredFileRecord; directUrl: string }> {
    let url: string;
    let fileName = 'file';
    let mimeType = 'application/octet-stream';
    let size = 0;

    if (onProgress) onProgress(2);

    if (typeof file === 'string') {
      // Это URL
      url = await this.uploadFromUrl(file, onProgress);
      fileName = file.split('/').pop()?.split('?')[0] || 'url_file';
    } else {
      // Это File
      fileName = file.name;
      mimeType = file.type;
      size = file.size;
      url = await this.uploadFromFile(file, signal, onProgress);
    }

    const key = customKey || this.generateKey();
    this.addFile(key, url);

    if (onProgress) onProgress(92);

    // Register in server database
    let fileRecord: StoredFileRecord | undefined;
    let directUrl = url;

    try {
      let resolvedUid = userId || '';
      if (!resolvedUid && typeof window !== 'undefined') {
        try {
          const sess = localStorage.getItem('user_session') || localStorage.getItem('user_email_session');
          if (sess) {
            const parsed = JSON.parse(sess);
            resolvedUid = String(parsed?.uid || parsed?.id || '');
          }
        } catch (_) {}
        if (!resolvedUid) {
          resolvedUid = localStorage.getItem('qaiz_user_uid') || '';
        }
      }

      const res = await fetch('/api/admin/files', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(resolvedUid ? { 'x-user-uid': resolvedUid } : {})
        },
        body: JSON.stringify({
          file_key: key,
          name: fileName,
          folder_id: folderId || null,
          user_id: resolvedUid || null,
          original_url: url,
          mime_type: mimeType,
          size: size
        })
      });

      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (data.file) {
            fileRecord = data.file;
            const resolvedOriginal = String(data.file.original_url || data.file.url || url || '').trim();
            directUrl = resolvedOriginal.startsWith('http') ? resolvedOriginal : url;
            this.addFile(key, directUrl);
          }
        } catch (jsonErr) {
          console.warn('Could not parse register file response:', jsonErr);
        }
      }
    } catch (err) {
      console.warn('Could not register file in DB:', err);
    }

    if (onProgress) onProgress(100);

    return { key, url, directUrl, fileRecord, dbRecord: fileRecord };
  }

  // Замена ключей на URL в тексте {{key}} -> URL
  replaceKeysWithUrls(text: string): string {
    const map = this.getFileMap();
    let result = text;

    for (const [key, url] of Object.entries(map)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), url);
    }

    return result;
  }

  // Замена URL на ключи в тексте URL -> {{key}}
  replaceUrlsWithKeys(text: string): string {
    const map = this.getFileMap();
    let result = text;

    for (const [key, url] of Object.entries(map)) {
      result = result.replace(new RegExp(url, 'g'), `{{${key}}}`);
    }

    return result;
  }
}

// Синглтон
let uploadService: FileUploadService | null = null;

export function getUploadService(): FileUploadService {
  if (!uploadService) {
    uploadService = new FileUploadService();
  }
  return uploadService;
}
