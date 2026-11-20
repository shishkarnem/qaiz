import React, { useState, useEffect, useRef } from 'react';
import { Mic, Video, Volume2, X, Check, RefreshCw } from 'lucide-react';
import { BubbleElement } from '../ui/BubbleElement';
import { LeafButton } from '../ui/LeafButton';

export interface UserMediaDeviceSettings {
  audioInputId: string;
  videoInputId: string;
  audioOutputId: string;
  mirrorVideo?: boolean;
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
}

interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentSettings: UserMediaDeviceSettings;
  onSaveSettings: (settings: UserMediaDeviceSettings) => void;
}

export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  isOpen,
  onClose,
  userId,
  currentSettings,
  onSaveSettings
}) => {
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  
  const [selectedMic, setSelectedMic] = useState(currentSettings.audioInputId || '');
  const [selectedCamera, setSelectedCamera] = useState(currentSettings.videoInputId || '');
  const [selectedSpeaker, setSelectedSpeaker] = useState(currentSettings.audioOutputId || '');
  const [micVolume, setMicVolume] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const loadDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const mics = devices.filter((d) => d.kind === 'audioinput');
      const cams = devices.filter((d) => d.kind === 'videoinput');
      const speakers = devices.filter((d) => d.kind === 'audiooutput');

      setAudioInputs(mics);
      setVideoInputs(cams);
      setAudioOutputs(speakers);

      if (!selectedMic && mics.length > 0) setSelectedMic(mics[0].deviceId);
      if (!selectedCamera && cams.length > 0) setSelectedCamera(cams[0].deviceId);
      if (!selectedSpeaker && speakers.length > 0) setSelectedSpeaker(speakers[0].deviceId);
    } catch (e) {
      console.warn('Failed to enumerate devices:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDevices();
      setSelectedMic(currentSettings.audioInputId || '');
      setSelectedCamera(currentSettings.videoInputId || '');
      setSelectedSpeaker(currentSettings.audioOutputId || '');
    }
  }, [isOpen, currentSettings]);

  // Mic level test
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const startMicTest = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
          video: false
        });
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        micStreamRef.current = stream;
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (!isMounted) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch (err) {
        console.warn('Mic level test warning:', err);
      }
    };

    startMicTest();

    return () => {
      isMounted = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [isOpen, selectedMic]);

  if (!isOpen) return null;

  const handleSave = () => {
    const updated: UserMediaDeviceSettings = {
      audioInputId: selectedMic,
      videoInputId: selectedCamera,
      audioOutputId: selectedSpeaker
    };
    try {
      localStorage.setItem(`qaiz_media_settings_${userId}`, JSON.stringify(updated));
    } catch (_) {}
    onSaveSettings(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-background/50 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl border border-primary/30 bg-background/30 backdrop-blur-2xl shadow-2xl p-5 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-primary/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/35 flex items-center justify-center text-primary">
              <Volume2 size={22} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-foreground">
                Настройки аудио и видео
              </h3>
              <p className="text-sm text-foreground/60">
                Индивидуальные параметры вашего устройства
              </p>
            </div>
          </div>
          <BubbleElement
            size="sm"
            onClick={onClose}
            icon={<X size={18} />}
            title="Закрыть"
          />
        </div>

        {/* Device selects */}
        <div className="space-y-4">
          {/* Microphone */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Mic size={16} className="text-primary" />
                Микрофон
              </span>
              <span className="text-sm text-foreground/50">
                {audioInputs.length} устр.
              </span>
            </label>
            <select
              value={selectedMic}
              onChange={(e) => setSelectedMic(e.target.value)}
              className="w-full text-sm rounded-2xl border border-primary/30 bg-background/40 backdrop-blur-md px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition-all"
            >
              {audioInputs.length === 0 ? (
                <option value="">Микрофон по умолчанию</option>
              ) : (
                audioInputs.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId} className="bg-background text-foreground">
                    {d.label || `Микрофон ${idx + 1}`}
                  </option>
                ))
              )}
            </select>
            {/* Live Volume Meter */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-sm text-foreground/60">
                <span>Проверка уровня микрофона</span>
                <span>{micVolume}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-background/40 border border-primary/20 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-75"
                  style={{ width: `${micVolume}%` }}
                />
              </div>
            </div>
          </div>

          {/* Camera */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Video size={16} className="text-primary" />
                Камера
              </span>
              <span className="text-sm text-foreground/50">
                {videoInputs.length} устр.
              </span>
            </label>
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="w-full text-sm rounded-2xl border border-primary/30 bg-background/40 backdrop-blur-md px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition-all"
            >
              {videoInputs.length === 0 ? (
                <option value="">Камера по умолчанию</option>
              ) : (
                videoInputs.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId} className="bg-background text-foreground">
                    {d.label || `Камера ${idx + 1}`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Speakers / Headphones */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Volume2 size={16} className="text-primary" />
                Динамики и наушники
              </span>
              <span className="text-sm text-foreground/50">
                {audioOutputs.length} устр.
              </span>
            </label>
            <select
              value={selectedSpeaker}
              onChange={(e) => setSelectedSpeaker(e.target.value)}
              className="w-full text-sm rounded-2xl border border-primary/30 bg-background/40 backdrop-blur-md px-3.5 py-2.5 text-foreground focus:outline-none focus:border-primary transition-all"
            >
              {audioOutputs.length === 0 ? (
                <option value="">Системные динамики (по умолчанию)</option>
              ) : (
                audioOutputs.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId} className="bg-background text-foreground">
                    {d.label || `Динамики ${idx + 1}`}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-primary/20 gap-3">
          <BubbleElement
            size="sm"
            onClick={loadDevices}
            icon={<RefreshCw size={14} />}
          >
            Обновить список
          </BubbleElement>

          <div className="flex items-center gap-2">
            <LeafButton
              variant="glass"
              size="sm"
              onClick={onClose}
            >
              Отмена
            </LeafButton>
            <LeafButton
              variant="primary"
              size="sm"
              onClick={handleSave}
              icon={<Check size={16} />}
            >
              Сохранить
            </LeafButton>
          </div>
        </div>
      </div>
    </div>
  );
};
