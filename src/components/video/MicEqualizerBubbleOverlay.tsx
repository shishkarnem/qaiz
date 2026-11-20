import React, { useEffect, useRef, useState } from 'react';

export interface MicAudioState {
  isSpeaking: boolean;
  level: number;
  bands: number[];
}

const DEFAULT_BANDS = [0.15, 0.2, 0.15, 0.25, 0.2, 0.15, 0.2, 0.15];

/**
 * Monitors real microphone audio signal using Web Audio API AnalyserNode.
 * Works whether the main camera stream already has an audio track or not
 * (automatically acquires a lightweight audio-only stream when isMicOn is true).
 */
export function useMicAudioAnalyzer(
  isMicOn: boolean,
  existingStream?: MediaStream | null
): MicAudioState {
  const [state, setState] = useState<MicAudioState>({
    isSpeaking: false,
    level: 0,
    bands: DEFAULT_BANDS
  });

  useEffect(() => {
    if (!isMicOn || typeof window === 'undefined') {
      setState({ isSpeaking: false, level: 0, bands: DEFAULT_BANDS });
      return;
    }

    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let dedicatedAudioStream: MediaStream | null = null;
    let rafId: number | null = null;
    let lastUpdateMs = 0;

    const setupAnalyzer = async () => {
      try {
        let targetStream: MediaStream | null = null;
        const existingAudioTracks = existingStream
          ? existingStream.getAudioTracks().filter(t => t.readyState === 'live' && t.enabled)
          : [];

        if (existingAudioTracks.length > 0 && existingStream) {
          targetStream = existingStream;
        } else if (navigator.mediaDevices?.getUserMedia) {
          dedicatedAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            },
            video: false
          });
          if (cancelled) {
            dedicatedAudioStream.getTracks().forEach(t => t.stop());
            return;
          }
          targetStream = dedicatedAudioStream;
        }

        if (!targetStream) return;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.72;

        sourceNode = audioCtx.createMediaStreamSource(targetStream);
        sourceNode.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const tick = (now: number) => {
          if (cancelled || !analyser) return;
          if (now - lastUpdateMs >= 45) {
            lastUpdateMs = now;
            analyser.getByteFrequencyData(dataArray);

            // Compute average voice energy across speech bins (bins 1..16)
            let sum = 0;
            const binCount = Math.min(16, dataArray.length);
            for (let i = 1; i < binCount; i++) {
              sum += dataArray[i];
            }
            const avg = binCount > 1 ? sum / (binCount - 1) : 0;
            const normalized = Math.min(1, avg / 95);
            const speaking = normalized > 0.045;

            if (speaking) {
              const nextBands: number[] = [];
              for (let b = 0; b < 8; b++) {
                const rawVal = dataArray[Math.min(dataArray.length - 1, b + 1)] || 0;
                const val = Math.max(0.18, Math.min(1, (rawVal / 140) * 1.15));
                nextBands.push(val);
              }
              setState({
                isSpeaking: true,
                level: normalized,
                bands: nextBands
              });
            } else {
              setState(prev =>
                prev.isSpeaking || prev.level > 0
                  ? { isSpeaking: false, level: 0, bands: DEFAULT_BANDS }
                  : prev
              );
            }
          }
          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      } catch (_) {
        // Microphone permission denied or unavailable
      }
    };

    setupAnalyzer();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      try {
        sourceNode?.disconnect();
      } catch (_) {}
      try {
        if (audioCtx && audioCtx.state !== 'closed') {
          audioCtx.close().catch(() => {});
        }
      } catch (_) {}
      if (dedicatedAudioStream) {
        dedicatedAudioStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [isMicOn, existingStream]);

  return state;
}

/**
 * Reliable video element that always attaches MediaStream via ref + useEffect,
 * ensuring the 2nd participant's camera tile (_self2 or 2nd player) renders properly.
 */
export const LiveCameraVideo: React.FC<{
  stream: MediaStream | null;
  className?: string;
}> = ({ stream, className = '' }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={className}
    />
  );
};

/**
 * Liquid Glass bubble equalizer animation around the square webcam/avatar tile
 * when microphone audio signal is active.
 */
export const MicEqualizerBubbleOverlay: React.FC<{
  isSpeaking: boolean;
  level?: number;
  bands?: number[];
}> = ({ isSpeaking, level = 0.5, bands = DEFAULT_BANDS }) => {
  if (!isSpeaking) return null;

  const activeScale = 1 + Math.min(0.04, level * 0.06);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 rounded-2xl overflow-visible">
      {/* Outer pulsing border ring around the webcam/avatar without any blur on the video */}
      <div
        style={{ transform: `scale(${activeScale})` }}
        className="absolute -inset-0.5 rounded-[1.15rem] border-2 border-primary bg-transparent transition-transform duration-75 shadow-[0_0_20px_rgba(153,208,55,0.75)]"
      />

      {/* Secondary wave ring around the tile */}
      <div className="absolute -inset-1.5 rounded-[1.3rem] border border-primary/55 bg-transparent animate-pulse shadow-[0_0_24px_rgba(153,208,55,0.4)]" />

      {/* Equalizer bars along left & right edges */}
      <div className="absolute inset-y-3 left-1 flex flex-col justify-center gap-1">
        {bands.slice(0, 4).map((b, i) => (
          <span
            key={`eq-l-${i}`}
            style={{ width: `${Math.round(3 + b * 8)}px` }}
            className="h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(153,208,55,0.9)] transition-all duration-75"
          />
        ))}
      </div>
      <div className="absolute inset-y-3 right-1 flex flex-col justify-center items-end gap-1">
        {bands.slice(4, 8).map((b, i) => (
          <span
            key={`eq-r-${i}`}
            style={{ width: `${Math.round(3 + b * 8)}px` }}
            className="h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(153,208,55,0.9)] transition-all duration-75"
          />
        ))}
      </div>
    </div>
  );
};
