import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, VideoOff, Monitor, Pin, Maximize2 } from 'lucide-react';
import { UserAvatar } from '../UserAvatar';
import { BubbleElement } from '../ui/BubbleElement';
import { MicEqualizerBubbleOverlay, useMicAudioAnalyzer } from './MicEqualizerBubbleOverlay';

export interface CameraTileProps {
  // Interface style 1 (used by src/components/ZoomVideoModal.tsx)
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  displayName?: string;
  avatarUrl?: string | null;
  isCameraOn?: boolean;
  isMicOn?: boolean;
  isScreenSharing?: boolean;
  isLocal?: boolean;
  isSpeaking?: boolean;
  // Interface style 2 (used by src/components/video/ZoomVideoModal.tsx)
  participant?: {
    user_id: string;
    display_name: string;
    avatar_url?: string | null;
    is_camera_on: boolean | number;
    is_mic_on: boolean | number;
    is_screen_sharing?: boolean | number;
    is_speaking?: boolean;
  };
  isSelf?: boolean;
  stream?: MediaStream | null;
  isPinned?: boolean;
  onPin?: () => void;
  onFullscreen?: () => void;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  className?: string;
}

export const CameraTile: React.FC<CameraTileProps> = ({
  videoRef: externalVideoRef,
  displayName,
  avatarUrl,
  isCameraOn,
  isMicOn,
  isScreenSharing,
  isLocal,
  isSpeaking,
  participant,
  isSelf = false,
  stream = null,
  isPinned = false,
  onPin,
  onFullscreen,
  size = 'md',
  compact = false,
  className = ''
}) => {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);

  const resolvedName = displayName ?? participant?.display_name ?? 'Участник';
  const resolvedAvatar = avatarUrl !== undefined ? avatarUrl : participant?.avatar_url;
  const cameraActive = isCameraOn !== undefined ? Boolean(isCameraOn) : Boolean(participant?.is_camera_on);
  const micActive = isMicOn !== undefined ? Boolean(isMicOn) : Boolean(participant?.is_mic_on);
  const screenSharing = isScreenSharing !== undefined ? Boolean(isScreenSharing) : Boolean(participant?.is_screen_sharing);
  const selfFlag = Boolean(isLocal || isSelf);

  // Real-time microphone audio signal analyzer for equalizer bubble around square webcam/avatar
  const micAudio = useMicAudioAnalyzer(Boolean(micActive && (selfFlag || stream)), stream);
  const isSpeakingNow = Boolean(
    micActive && (micAudio.isSpeaking || isSpeaking || participant?.is_speaking)
  );

  const setCombinedVideoRef = (el: HTMLVideoElement | null) => {
    internalVideoRef.current = el;
    if (externalVideoRef && 'current' in externalVideoRef) {
      (externalVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    }
    if (el && stream && (cameraActive || screenSharing)) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.play().catch(() => {});
    }
  };

  useEffect(() => {
    const el = internalVideoRef.current;
    if (!el) return;
    if (stream && (cameraActive || screenSharing)) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.play().catch(() => {});
    } else if (!cameraActive && !screenSharing) {
      el.srcObject = null;
    }
  }, [stream, cameraActive, screenSharing]);

  const heightClasses = participant
    ? {
        sm: 'h-28 sm:h-32',
        md: 'h-44 sm:h-52',
        lg: 'h-64 sm:h-80 md:h-96'
      }[size]
    : 'w-full h-full';

  const hasTopControls = Boolean(screenSharing || onPin || onFullscreen);

  return (
    <div
      className={`relative flex flex-col select-none group ${heightClasses} ${className}`}
    >
      {/* Mobile Top Info Bar — OUTSIDE the video card so it never covers the user */}
      {!compact && hasTopControls && (
        <div className="flex sm:hidden items-center justify-end gap-1 pb-1 px-0.5 shrink-0">
          {screenSharing && (
            <BubbleElement isBadge active size="sm" icon={<Monitor size={12} />} className="!px-2 !py-0.5 !text-sm">
              <span className="sr-only">Экран</span>
            </BubbleElement>
          )}
          {onPin && (
            <BubbleElement
              size="sm"
              active={isPinned}
              onClick={onPin}
              icon={<Pin size={12} />}
              className="!px-2 !py-0.5"
              title={isPinned ? 'Открепить видео' : 'Закрепить видео'}
            />
          )}
          {onFullscreen && (
            <BubbleElement
              size="sm"
              onClick={onFullscreen}
              icon={<Maximize2 size={12} />}
              className="!px-2 !py-0.5"
              title="На весь экран"
            />
          )}
        </div>
      )}

      {/* Main Video Frame — zero blur on active microphone */}
      <div
        className={`relative flex-1 min-h-0 w-full rounded-2xl border transition-all duration-300 bg-transparent ${
          isSpeakingNow
            ? 'border-primary shadow-[0_0_20px_rgba(153,208,55,0.55)]'
            : isPinned
            ? 'border-primary/60 shadow-[0_0_16px_rgba(153,208,55,0.2)]'
            : 'border-primary/25 hover:border-primary/45'
        }`}
      >
        {/* Animated Bubble Equalizer around the webcam/avatar without blurring video */}
        <MicEqualizerBubbleOverlay
          isSpeaking={isSpeakingNow}
          level={micAudio.level}
          bands={micAudio.bands}
        />

        <div className="relative w-full h-full rounded-2xl overflow-hidden flex items-center justify-center bg-transparent">
          {/* Live Video Stream or Avatar Fallback */}
          {stream && (cameraActive || screenSharing) ? (
            <video
              ref={setCombinedVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${selfFlag && !screenSharing ? 'scale-x-[-1]' : ''}`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-2 gap-1.5 relative bg-transparent">
              <div className="relative rounded-2xl p-0.5">
                <UserAvatar
                  avatarUrl={resolvedAvatar}
                  displayName={resolvedName}
                  size={compact || size === 'sm' ? 'sm' : 'lg'}
                  className="border-2 border-primary/40 shadow-lg"
                />
              </div>

              {!cameraActive && !compact && (
                <span className="hidden sm:flex text-sm text-foreground/60 items-center gap-1 font-medium">
                  <VideoOff size={14} className="text-foreground/50" />
                </span>
              )}
            </div>
          )}

          {/* Desktop Top-right Controls (hidden on mobile where it sits outside above the card) */}
          {hasTopControls && (
            <div className="hidden sm:flex absolute top-2 right-2 items-center gap-1.5 z-10">
              {screenSharing && (
                <BubbleElement isBadge active size="sm" icon={<Monitor size={13} />} title="Демонстрация экрана" />
              )}

              {onPin && (
                <BubbleElement
                  size="sm"
                  active={isPinned}
                  onClick={onPin}
                  icon={<Pin size={13} />}
                  className="opacity-80 group-hover:opacity-100 !px-2 !py-1"
                  title={isPinned ? 'Открепить видео' : 'Закрепить видео'}
                />
              )}

              {onFullscreen && (
                <BubbleElement
                  size="sm"
                  onClick={onFullscreen}
                  icon={<Maximize2 size={13} />}
                  className="opacity-80 group-hover:opacity-100 !px-2 !py-1"
                  title="На весь экран"
                />
              )}
            </div>
          )}

          {/* Desktop Bottom Name & Mic Bar (hidden on mobile so it never overlaps the user video) */}
          <div className="hidden sm:flex absolute bottom-2 left-2 right-2 items-center justify-between gap-2 z-10 pointer-events-none">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-primary/35 bg-transparent max-w-[80%]">
              <span className="text-sm font-bold text-foreground truncate drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                {resolvedName}
              </span>
            </div>

            <div
              className={`w-7 h-7 rounded-full border flex items-center justify-center bg-transparent transition-all ${
                micActive
                  ? isSpeakingNow
                    ? 'border-primary text-primary shadow-[0_0_12px_rgba(153,208,55,0.85)] scale-110'
                    : 'border-primary/40 text-primary'
                  : 'border-destructive/50 text-destructive'
              }`}
            >
              {micActive ? <Mic size={14} /> : <MicOff size={14} />}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Info Bar — OUTSIDE the video card so it never covers the user */}
      <div className="flex sm:hidden items-center justify-between gap-1 pt-1 px-0.5 shrink-0">
        <span className="text-sm font-bold text-foreground truncate">
          {resolvedName}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {!cameraActive && (
            <VideoOff size={13} className="text-foreground/50" />
          )}
          <span
            className={`w-6 h-6 rounded-full border flex items-center justify-center bg-transparent transition-all ${
              micActive
                ? isSpeakingNow
                  ? 'border-primary text-primary shadow-[0_0_10px_rgba(153,208,55,0.85)]'
                  : 'border-primary/40 text-primary'
                : 'border-destructive/50 text-destructive'
            }`}
          >
            {micActive ? <Mic size={12} /> : <MicOff size={12} />}
          </span>
        </div>
      </div>
    </div>
  );
};
