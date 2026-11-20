import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { CircleDot, Pause, Play, Square } from 'lucide-react';
import { BubbleElement } from '../components/ui/BubbleElement';

interface StartRecordingOptions {
  existingScreenStream?: MediaStream | null;
  existingAudioStream?: MediaStream | null;
  micStream?: MediaStream | null;
  isMicOn?: boolean;
  roomTitle?: string;
  roomId?: string;
}

interface ScreenRecordingContextValue {
  isRecording: boolean;
  isPaused: boolean;
  recordingSeconds: number;
  recordingUrl: string | null;
  recordingError: string | null;
  clearRecordingError: () => void;
  startRecording: (options?: StartRecordingOptions) => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  togglePauseRecording: () => void;
  stopRecording: () => void;
  toggleRecording: (options?: StartRecordingOptions) => Promise<void>;
  downloadLastRecording: () => void;
}

const ScreenRecordingContext = createContext<ScreenRecordingContextValue | null>(null);

export const useScreenRecording = (): ScreenRecordingContextValue => {
  const ctx = useContext(ScreenRecordingContext);
  if (!ctx) {
    throw new Error('useScreenRecording must be used within a ScreenRecordingProvider');
  }
  return ctx;
};

export const ScreenRecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const ownedTracksRef = useRef<MediaStreamTrack[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const activeRoomIdRef = useRef<string>('session');
  const syntheticIntervalRef = useRef<any>(null);

  const clearRecordingError = useCallback(() => {
    setRecordingError(null);
  }, []);

  const cleanupResources = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (syntheticIntervalRef.current) {
      clearInterval(syntheticIntervalRef.current);
      syntheticIntervalRef.current = null;
    }
    ownedTracksRef.current.forEach((t) => {
      try {
        t.stop();
      } catch (_) {}
    });
    ownedTracksRef.current = [];
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (_) {
        cleanupResources();
        setIsRecording(false);
        setIsPaused(false);
      }
    } else {
      cleanupResources();
      setIsRecording(false);
      setIsPaused(false);
    }
  }, [cleanupResources]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.pause();
        setIsPaused(true);
      } catch (_) {}
    }
  }, []);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'paused') {
      try {
        recorder.resume();
        setIsPaused(false);
      } catch (_) {}
    }
  }, []);

  const togglePauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      pauseRecording();
    } else if (recorder.state === 'paused') {
      resumeRecording();
    }
  }, [pauseRecording, resumeRecording]);

  const createFallbackScreenStream = useCallback((): MediaStream => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    const renderFrame = () => {
      if (!ctx) return;
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#12161f');
      grad.addColorStop(0.5, '#181e29');
      grad.addColorStop(1, '#10141d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(202, 253, 0, 0.12)';
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 32, canvas.width - 80, canvas.height - 64);

      ctx.fillStyle = '#cafd00';
      ctx.font = 'bold 28px Inter, system-ui, sans-serif';
      ctx.fillText('Запись экрана КвИИз', 72, 88);

      ctx.fillStyle = '#ffffff';
      ctx.font = '22px Inter, system-ui, sans-serif';
      ctx.fillText(`Страница: ${window.location.pathname}`, 72, 136);
      ctx.fillText(`Время: ${new Date().toLocaleTimeString()}`, 72, 176);
    };

    renderFrame();
    if (syntheticIntervalRef.current) clearInterval(syntheticIntervalRef.current);
    syntheticIntervalRef.current = setInterval(renderFrame, 100);

    return (canvas as any).captureStream ? (canvas as any).captureStream(30) : new MediaStream();
  }, []);

  const startRecording = useCallback(async (options?: StartRecordingOptions) => {
    if (isRecording) return;
    try {
      setRecordingError(null);
      setRecordingSeconds(0);
      setIsPaused(false);
      activeRoomIdRef.current = options?.roomId || 'session';

      let videoTracksToUse: MediaStreamTrack[] = [];
      let screenAudioTracksToUse: MediaStreamTrack[] = [];

      // Clone tracks if an existing screen stream is provided so unmounting the modal/page won't kill recording
      if (options?.existingScreenStream && options.existingScreenStream.getVideoTracks().length > 0) {
        const liveVideoTracks = options.existingScreenStream
          .getVideoTracks()
          .filter((t) => t.readyState === 'live');
        if (liveVideoTracks.length > 0) {
          videoTracksToUse = [liveVideoTracks[0].clone()];
        }
        const liveAudioTracks = options.existingScreenStream
          .getAudioTracks()
          .filter((t) => t.readyState === 'live');
        if (liveAudioTracks.length > 0) {
          screenAudioTracksToUse = [liveAudioTracks[0].clone()];
        }
      }

      if (videoTracksToUse.length === 0) {
        let displayStream: MediaStream | null = null;
        if (navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices) {
          try {
            displayStream = await navigator.mediaDevices.getDisplayMedia({
              video: { cursor: 'always' } as any,
              audio: true
            });
          } catch (_) {
            try {
              displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true
              } as any);
            } catch (_) {}
          }
        }

        if (!displayStream) {
          displayStream = createFallbackScreenStream();
        }

        videoTracksToUse = displayStream.getVideoTracks();
        screenAudioTracksToUse = displayStream.getAudioTracks();
      }

      if (videoTracksToUse.length === 0) {
        setRecordingError('Не удалось получить видеопоток экрана.');
        return;
      }

      // Clone microphone audio track if available, or request mic audio silently
      let micAudioTracksToUse: MediaStreamTrack[] = [];
      if (options?.existingAudioStream && options.existingAudioStream.getAudioTracks().length > 0) {
        const liveMic = options.existingAudioStream
          .getAudioTracks()
          .filter((t) => t.readyState === 'live');
        if (liveMic.length > 0) {
          micAudioTracksToUse = [liveMic[0].clone()];
        }
      } else if (navigator.mediaDevices?.getUserMedia) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          micAudioTracksToUse = micStream.getAudioTracks();
        } catch (_) {}
      }

      ownedTracksRef.current = [
        ...videoTracksToUse,
        ...screenAudioTracksToUse,
        ...micAudioTracksToUse
      ];

      // Mix screen + mic audio via Web Audio API so both are recorded
      let finalAudioTracks: MediaStreamTrack[] = [];
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx && (screenAudioTracksToUse.length > 0 || micAudioTracksToUse.length > 0)) {
          const audioCtx = new AudioCtx();
          audioCtxRef.current = audioCtx;
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }
          const dest = audioCtx.createMediaStreamDestination();

          if (screenAudioTracksToUse.length > 0) {
            const src1 = audioCtx.createMediaStreamSource(new MediaStream([screenAudioTracksToUse[0]]));
            src1.connect(dest);
          }
          if (micAudioTracksToUse.length > 0) {
            const src2 = audioCtx.createMediaStreamSource(new MediaStream([micAudioTracksToUse[0]]));
            src2.connect(dest);
          }
          finalAudioTracks = dest.stream.getAudioTracks();
        }
      } catch (_) {}

      if (finalAudioTracks.length === 0) {
        finalAudioTracks = [...screenAudioTracksToUse, ...micAudioTracksToUse].slice(0, 1);
      }

      const compositeStream = new MediaStream([
        ...videoTracksToUse,
        ...finalAudioTracks
      ]);

      // Stop recording if user stops sharing from native browser bar
      videoTracksToUse[0].onended = () => {
        stopRecording();
      };

      const candidateMimeTypes = finalAudioTracks.length > 0
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

      const supportedMime = candidateMimeTypes.find((t) => {
        try {
          return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t);
        } catch {
          return false;
        }
      });

      const recorder = supportedMime
        ? new MediaRecorder(compositeStream, { mimeType: supportedMime })
        : new MediaRecorder(compositeStream);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blobType = recorder.mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: blobType });
        const url = URL.createObjectURL(blob);
        setRecordingUrl(url);
        setIsRecording(false);
        setIsPaused(false);
        cleanupResources();

        // Trigger automatic download of the recorded video
        try {
          const a = document.createElement('a');
          a.href = url;
          a.download = `qaiz-record-${activeRoomIdRef.current}-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch (_) {}
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
    } catch (err) {
      console.error('Screen recording error:', err);
      setRecordingError('Не удалось запустить запись экрана.');
      cleanupResources();
    }
  }, [isRecording, createFallbackScreenStream, stopRecording, cleanupResources]);

  // Increment timer only while recording and not paused
  useEffect(() => {
    if (!isRecording || isPaused) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording, isPaused]);

  const toggleRecording = useCallback(
    async (options?: StartRecordingOptions) => {
      if (isRecording) {
        stopRecording();
      } else {
        await startRecording(options);
      }
    },
    [isRecording, stopRecording, startRecording]
  );

  const downloadLastRecording = useCallback(() => {
    if (!recordingUrl) return;
    const a = document.createElement('a');
    a.href = recordingUrl;
    a.download = `qaiz-record-${activeRoomIdRef.current}-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [recordingUrl]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <ScreenRecordingContext.Provider
      value={{
        isRecording,
        isPaused,
        recordingSeconds,
        recordingUrl,
        recordingError,
        clearRecordingError,
        startRecording,
        pauseRecording,
        resumeRecording,
        togglePauseRecording,
        stopRecording,
        toggleRecording,
        downloadLastRecording
      }}
    >
      {children}

      {/* Requirement 5: Persistent Floating Corner Widget with Recording, Pause/Resume, and Stop icons across all pages */}
      {isRecording && (
        <div className="fixed bottom-4 right-4 z-[10050] rounded-2xl border border-primary/45 bg-transparent backdrop-blur-2xl px-3.5 py-2 shadow-2xl flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <CircleDot
              size={16}
              className={
                isPaused
                  ? 'text-amber-400'
                  : 'text-rose-400 animate-pulse'
              }
            />
            <span className="text-sm font-bold text-foreground">
              {isPaused ? 'Пауза' : 'Запись'}
            </span>
            <span className="text-sm font-black font-mono text-primary">
              {formatTime(recordingSeconds)}
            </span>
          </div>

          <BubbleElement
            size="sm"
            active={isPaused}
            onClick={togglePauseRecording}
            icon={isPaused ? <Play size={14} className="text-primary" /> : <Pause size={14} className="text-amber-300" />}
            title={isPaused ? 'Продолжить запись экрана' : 'Поставить запись экрана на паузу'}
          />

          <BubbleElement
            size="sm"
            onClick={stopRecording}
            icon={<Square size={14} className="text-rose-400" />}
            title="Остановить запись и сохранить видео"
          />
        </div>
      )}
    </ScreenRecordingContext.Provider>
  );
};
