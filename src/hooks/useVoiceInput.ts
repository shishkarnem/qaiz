import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseVoiceInputOptions {
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onAudioRecorded?: (audioUrl: string, transcript: string) => void;
  lang?: string;
  onActiveChange?: (isActive: boolean) => void;
}

export interface UseVoiceInputReturn {
  isListening: boolean;
  isRecording: boolean;
  isRecognizing: boolean;
  isSupported: boolean;
  isPermissionModalOpen: boolean;
  permissionModalMode: 'prompt' | 'instruction';
  permissionErrorType: 'denied' | 'not_found' | 'not_readable' | null;
  permissionErrorMessage: string | null;
  transcript: string;
  interimTranscript: string;
  audioLevel: number;
  recordingSeconds: number;
  recognitionSeconds: number;
  statusStep: 'idle' | 'recording' | 'preparing' | 'uploading' | 'recognizing' | 'done' | 'error';
  statusLabel: string;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  cancelListening: () => void;
  resetTranscript: () => void;
  requestPermissionAndStart: () => Promise<void>;
  retryPermission: () => Promise<void>;
  closePermissionModal: () => void;
  clearError: () => void;
  error: string | null;
  errorStep: string | null;
  errorReason: string | null;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [statusStep, setStatusStep] = useState<'idle' | 'recording' | 'preparing' | 'uploading' | 'recognizing' | 'done' | 'error'>('idle');
  const [statusLabel, setStatusLabel] = useState('Готов к записи');
  
  // Dual UX Permission & Instructions state
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [permissionModalMode, setPermissionModalMode] = useState<'prompt' | 'instruction'>('prompt');
  const [permissionErrorType, setPermissionErrorType] = useState<'denied' | 'not_found' | 'not_readable' | null>(null);
  const [permissionErrorMessage, setPermissionErrorMessage] = useState<string | null>(null);

  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recognitionSeconds, setRecognitionSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorStep, setErrorStep] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const errorTimerRef = useRef<any>(null);

  const onTranscriptRef = useRef(options.onTranscript);
  onTranscriptRef.current = options.onTranscript;

  const onAudioRecordedRef = useRef(options.onAudioRecorded);
  onAudioRecordedRef.current = options.onAudioRecorded;

  const onActiveChangeRef = useRef(options.onActiveChange);
  onActiveChangeRef.current = options.onActiveChange;

  const isVoiceBusy = isRecording || isRecognizing;
  useEffect(() => {
    onActiveChangeRef.current?.(isVoiceBusy);
  }, [isVoiceBusy]);

  useEffect(() => {
    return () => {
      onActiveChangeRef.current?.(false);
    };
  }, []);

  const setErrorWithTimeout = useCallback((msg: string | null, step?: string | null, reason?: string | null) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setError(msg);
    setErrorStep(step || null);
    setErrorReason(reason || null);
    if (msg) {
      setStatusStep('error');
      setStatusLabel(step ? `${step}: ${msg}` : msg);
      errorTimerRef.current = setTimeout(() => {
        setError(null);
        setErrorStep(null);
        setErrorReason(null);
        setStatusStep('idle');
        setStatusLabel('Готов к записи');
      }, 5000);
    }
  }, []);

  const clearError = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setError(null);
    setErrorStep(null);
    setErrorReason(null);
    if (statusStep === 'error') {
      setStatusStep('idle');
      setStatusLabel('Готов к записи');
    }
  }, [statusStep]);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const recTimerRef = useRef<any>(null);
  const sttTimerRef = useRef<any>(null);
  const shouldSendRef = useRef<boolean>(true);

  // Check if getUserMedia & MediaRecorder are supported
  const isSupported = typeof window !== 'undefined' && Boolean(
    navigator?.mediaDevices?.getUserMedia && (window.MediaRecorder || (window as any).webkitMediaRecorder)
  );

  const stopAudioVisualizer = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  const startAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const level = Math.min(1, Math.max(0, avg / 120));
        setAudioLevel(level);

        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('Audio visualizer error:', err);
    }
  };

  const clearTimers = () => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    if (sttTimerRef.current) {
      clearInterval(sttTimerRef.current);
      sttTimerRef.current = null;
    }
  };

  const convertBlobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        resolve(res);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  /**
   * Полный процесс транскрибации согласно скиллу ProTalk STT:
   * 1. Загрузка во временное хранилище (БЕЗ ТОКЕНА)
   * 2. Распознавание речи через STT сервис (БЕЗ ТОКЕНА)
   */
  const processAudioWithProTalk = async (audioBlob: Blob) => {
    if (!audioBlob || audioBlob.size < 250) {
      setIsRecognizing(false);
      setErrorWithTimeout(
        'Слишком короткая запись',
        'Шаг 1/3: Запись голоса',
        'Аудиофайл почти пустой. Нажмите на микрофон и четко произнесите ответ.'
      );
      return;
    }

    setIsRecognizing(true);
    setStatusStep('preparing');
    setStatusLabel('Шаг 1/3: Подготовка аудио...');
    setRecognitionSeconds(0);
    const startTs = Date.now();

    if (sttTimerRef.current) {
      clearInterval(sttTimerRef.current);
    }
    sttTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTs) / 1000;
      setRecognitionSeconds(parseFloat(elapsed.toFixed(1)));
    }, 100);

    try {
      const base64Audio = await convertBlobToBase64(audioBlob);

      setStatusStep('uploading');
      setStatusLabel('Шаг 2/3: Отправка и ссылка...');

      const rawMime = (audioBlob.type || 'audio/webm').toLowerCase();
      const ext =
        rawMime.includes('mp4') || rawMime.includes('m4a')
          ? 'm4a'
          : rawMime.includes('ogg')
          ? 'ogg'
          : rawMime.includes('wav')
          ? 'wav'
          : 'webm';

      const response = await fetch('/api/voice/stt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audio_base64: base64Audio,
          audio: base64Audio,
          mime_type: audioBlob.type || 'audio/webm',
          mimeType: audioBlob.type || 'audio/webm',
          fileName: `voice_input.${ext}`
        })
      });

      setStatusStep('recognizing');
      setStatusLabel('Шаг 3/3: Распознавание ИИ...');

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        const stepName = errJson?.step === 'upload' ? 'Шаг 2/3: Ссылка на аудио' : 'Шаг 3/3: Распознавание';
        const reasonDesc = errJson?.reason || (errJson?.error ? errJson.error : `Код ответа ${response.status}`);
        setErrorWithTimeout(
          errJson?.error || 'Сбой распознавания аудио',
          stepName,
          reasonDesc
        );
        return;
      }

      const data = await response.json();
      const text = data?.text || data?.transcript || '';
      const fileUrl = data?.file_url || '';

      if (text && text.trim()) {
        const cleanText = text.trim();
        setTranscript(cleanText);
        setStatusStep('done');
        setStatusLabel('Речь распознана');
        if (onTranscriptRef.current) {
          onTranscriptRef.current(cleanText, true);
        }
        if (onAudioRecordedRef.current && fileUrl) {
          onAudioRecordedRef.current(fileUrl, cleanText);
        }
      } else if (fileUrl && onAudioRecordedRef.current) {
        onAudioRecordedRef.current(fileUrl, '');
      } else {
        setErrorWithTimeout(
          'Речь не распознана',
          'Шаг 3/3: Распознавание ИИ',
          data?.reason || 'Нейросеть не смогла различить слова (тихая запись или шум). Попробуйте сказать громче.'
        );
      }
    } catch (err: any) {
      console.error('[Voice STT Error]:', err);
      setErrorWithTimeout(
        'Ошибка передачи данных',
        'Шаг 2/3: Сетевой запрос',
        err?.message || 'Не удалось отправить аудиофайл. Проверьте соединение с интернетом.'
      );
    } finally {
      if (sttTimerRef.current) {
        clearInterval(sttTimerRef.current);
        sttTimerRef.current = null;
      }
      setIsRecognizing(false);
    }
  };

  const stopListening = useCallback(() => {
    shouldSendRef.current = true;
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    setIsRecording(false);
    setIsRecognizing(true);
    setStatusStep('preparing');
    setStatusLabel('Шаг 1/3: Подготовка аудио...');

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        if (mediaRecorderRef.current.state === 'recording' && typeof mediaRecorderRef.current.requestData === 'function') {
          mediaRecorderRef.current.requestData();
        }
      } catch (_) {}
      try {
        mediaRecorderRef.current.stop();
        return;
      } catch (_) {}
    }
    stopAudioVisualizer();
    setIsRecognizing(false);
  }, []);

  const cancelListening = useCallback(() => {
    shouldSendRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }
    stopAudioVisualizer();
    clearTimers();
    setIsRecording(false);
    setIsRecognizing(false);
    setAudioLevel(0);
    setRecordingSeconds(0);
    setRecognitionSeconds(0);
  }, []);

  /**
   * Запуск захвата аудиопотока и записи.
   * Если доступ заблокирован, открывает модалку с инструкцией и кнопкой повтора.
   */
  const initiateRecordingStream = async () => {
    clearError();
    clearTimers();
    audioChunksRef.current = [];
    shouldSendRef.current = true;
    setRecordingSeconds(0);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setErrorWithTimeout('Запись аудио не поддерживается в этом браузере.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      console.log('Микрофон включен');

      // Успешно получен доступ: закрываем модалку, если была открыта
      setIsPermissionModalOpen(false);
      setPermissionModalMode('prompt');
      setPermissionErrorType(null);
      setPermissionErrorMessage(null);

      try {
        localStorage.setItem('qaiz_mic_allowed', 'true');
      } catch (_) {}

      mediaStreamRef.current = stream;

      // Определение поддерживаемого аудиоформата (приоритет webm/opus)
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg'
      ];
      let selectedMime = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      const recorderOptions: MediaRecorderOptions = selectedMime ? { mimeType: selectedMime } : {};
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stopAudioVisualizer();
        if (shouldSendRef.current && audioChunksRef.current.length > 0) {
          const blobType = selectedMime || recorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
          audioChunksRef.current = [];

          if (audioBlob.size > 250) {
            await processAudioWithProTalk(audioBlob);
          } else {
            setIsRecognizing(false);
            setErrorWithTimeout('Запись слишком короткая', 'Шаг 1/3: Запись голоса', 'Нажмите на микрофон, произнесите текст и затем остановите запись.');
          }
        } else {
          setIsRecognizing(false);
        }
        audioChunksRef.current = [];
      };

      recorder.start(250);
      setIsRecording(true);
      setStatusStep('recording');
      setStatusLabel('Идет запись...');
      startAudioVisualizer(stream);

      // Таймер записи
      const startTs = Date.now();
      recTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTs) / 1000);
        setRecordingSeconds(elapsed);
      }, 500);

    } catch (err: any) {
      console.error('Нет доступа к микрофону', err);
      setIsRecording(false);
      stopAudioVisualizer();

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionErrorType('denied');
        setPermissionErrorMessage('Доступ к микрофону отклонен или закрыт в настройках браузера.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermissionErrorType('not_found');
        setPermissionErrorMessage('Микрофон не найден или отключен от вашего устройства.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setPermissionErrorType('not_readable');
        setPermissionErrorMessage('Микрофон занят другой программой.');
      } else {
        setPermissionErrorType('denied');
        setPermissionErrorMessage(err?.message || 'Не удалось получить доступ к микрофону.');
      }

      // Переключаем в режим понятной пошаговой инструкции с кнопкой повтора без обновления страницы
      setPermissionModalMode('instruction');
      setIsPermissionModalOpen(true);
    }
  };

  /**
   * Двойной UX:
   * При первом клике или если нет подтверждения разрешения — показываем понятный UI "Разрешите доступ к микрофону".
   * По кнопке "🎤 Начать запись" уже запрашиваем getUserMedia.
   */
  const startListening = useCallback(async () => {
    // Проверка статуса разрешений браузера
    if (typeof navigator !== 'undefined' && (navigator as any).permissions?.query) {
      try {
        const status = await (navigator as any).permissions.query({ name: 'microphone' });
        if (status.state === 'granted') {
          // Уже разрешено — сразу стартуем
          await initiateRecordingStream();
          return;
        } else if (status.state === 'denied') {
          setPermissionModalMode('instruction');
          setPermissionErrorType('denied');
          setPermissionErrorMessage('Доступ к микрофону заблокирован в браузере.');
          setIsPermissionModalOpen(true);
          return;
        }
      } catch {
        // Safari / Firefox fallback
      }
    }

    const wasAllowedBefore = localStorage.getItem('qaiz_mic_allowed') === 'true';
    if (!wasAllowedBefore) {
      setPermissionModalMode('prompt');
      setPermissionErrorType(null);
      setPermissionErrorMessage(null);
      setIsPermissionModalOpen(true);
      return;
    }

    await initiateRecordingStream();
  }, []);

  const requestPermissionAndStart = useCallback(async () => {
    await initiateRecordingStream();
  }, []);

  const retryPermission = useCallback(async () => {
    await initiateRecordingStream();
  }, []);

  const closePermissionModal = useCallback(() => {
    setIsPermissionModalOpen(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isRecording) {
      stopListening();
    } else if (!isRecognizing) {
      startListening();
    }
  }, [isRecording, isRecognizing, startListening, stopListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    clearError();
  }, [clearError]);

  useEffect(() => {
    return () => {
      cancelListening();
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, [cancelListening]);

  return {
    isListening: isRecording,
    isRecording,
    isRecognizing,
    isSupported,
    isPermissionModalOpen,
    permissionModalMode,
    permissionErrorType,
    permissionErrorMessage,
    transcript,
    interimTranscript: isRecognizing ? `Распознавание (${recognitionSeconds}с)...` : '',
    audioLevel,
    recordingSeconds,
    recognitionSeconds,
    startListening,
    stopListening,
    toggleListening,
    cancelListening,
    resetTranscript,
    requestPermissionAndStart,
    retryPermission,
    closePermissionModal,
    clearError,
    error,
    errorStep,
    errorReason,
    statusStep,
    statusLabel
  };
}
