import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

const audioDurationCache = new Map<string, number>();

interface VoiceMessagePlayerProps {
  audioUrl: string;
  transcript?: string;
  isMine?: boolean;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  audioUrl,
  transcript,
  isMine = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const cachedDuration = audioDurationCache.get(audioUrl) || 0;
  const [duration, setDuration] = useState<number>(cachedDuration);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Asynchronously decode audio data for exact duration before user clicks play
    if (!audioDurationCache.has(audioUrl)) {
      fetch(audioUrl)
        .then((res) => res.arrayBuffer())
        .then((buf) => {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioCtx) return;
          const ctx = new AudioCtx();
          return ctx
            .decodeAudioData(buf)
            .then((decoded) => {
              if (isMounted && decoded?.duration && isFinite(decoded.duration)) {
                const d = Math.round(decoded.duration * 10) / 10;
                audioDurationCache.set(audioUrl, d);
                setDuration(d);
              }
              ctx.close().catch(() => {});
            })
            .catch(() => {
              ctx.close().catch(() => {});
            });
        })
        .catch(() => {});
    }

    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    audioRef.current = audio;

    const updateTime = () => setCurrentTime(audio.currentTime);

    const updateDuration = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        const d = Math.round(audio.duration * 10) / 10;
        if (isMounted) setDuration(d);
        audioDurationCache.set(audioUrl, d);
      } else if (audio.duration === Infinity) {
        // Fix for Chromium WebM Infinity duration quirk
        audio.currentTime = 1e101;
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null;
          let d = 0;
          if (isFinite(audio.duration) && audio.duration > 0) {
            d = Math.round(audio.duration * 10) / 10;
          } else if (isFinite(audio.currentTime) && audio.currentTime > 0) {
            d = Math.round(audio.currentTime * 10) / 10;
          }
          if (d > 0) {
            if (isMounted) setDuration(d);
            audioDurationCache.set(audioUrl, d);
          }
          audio.currentTime = 0;
        };
      }
    };

    const onEnded = () => {
      if (isMounted) {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('canplaythrough', updateDuration);
    audio.addEventListener('ended', onEnded);
    audio.load();

    return () => {
      isMounted = false;
      audio.pause();
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('canplaythrough', updateDuration);
      audio.removeEventListener('ended', onEnded);
      audio.src = '';
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(console.warn);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs) || secs <= 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-2.5 w-full min-w-[240px] max-w-sm">
      <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-background/20 border border-primary/25 backdrop-blur-xl">
        <button
          type="button"
          onClick={togglePlay}
          className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0 ${
            isMine
              ? 'bg-primary text-background shadow-md shadow-primary/25'
              : 'bg-primary/20 text-primary border border-primary/35 hover:bg-primary/30'
          }`}
          title={isPlaying ? 'Пауза' : 'Воспроизвести'}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="relative flex items-center">
            <input
              type="range"
              min="0"
              max={duration > 0 ? duration : 1}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 rounded-lg appearance-none bg-primary/25 accent-primary cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-foreground/75">
            <span>{formatTime(currentTime)}</span>
            <span className="flex items-center gap-1">
              <Mic size={12} className="text-primary" />
              {duration > 0 ? formatTime(duration) : '0:00'}
            </span>
          </div>
        </div>
      </div>

      {transcript && transcript.trim() && (
        <div className="p-3 rounded-2xl bg-background/25 border border-primary/20 backdrop-blur-md space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-primary font-bold">
            <Mic size={13} />
            <span>Распознанный текст:</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap select-text">
            {transcript}
          </p>
        </div>
      )}
    </div>
  );
};
