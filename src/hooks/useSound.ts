import { useCallback, useState, useEffect } from 'react';
import {
  audioSystem,
  CustomAudioSlotConfig,
  VOLUME_CHANGE_EVENT
} from '../services/audio/audioSystem';

export type { CustomAudioSlotConfig };
export { audioSystem };

export function useUserVolume() {
  const [volume, setVolumeState] = useState<number>(() => audioSystem.getMasterVolume());
  const [muted, setMutedState] = useState<boolean>(() => audioSystem.getIsMuted());

  useEffect(() => {
    const handler = () => {
      setVolumeState(audioSystem.getMasterVolume());
      setMutedState(audioSystem.getIsMuted());
    };
    window.addEventListener(VOLUME_CHANGE_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(VOLUME_CHANGE_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const setVolume = useCallback((vol: number) => {
    audioSystem.setMasterVolume(vol);
    setVolumeState(audioSystem.getMasterVolume());
    setMutedState(audioSystem.getIsMuted());
  }, []);

  const toggleMute = useCallback(() => {
    audioSystem.setMuted(!audioSystem.getIsMuted());
    setVolumeState(audioSystem.getMasterVolume());
    setMutedState(audioSystem.getIsMuted());
  }, []);

  return {
    volume,
    muted,
    effectiveVolume: muted ? 0 : volume,
    setVolume,
    toggleMute
  };
}

const playSynthesizedCroak = () => {
  audioSystem.playSynthesizedCroak();
};

export const useFrogSound = () => {
  const playCroak = useCallback((slotKey: string = 'ui_btn_leaf_click') => {
    audioSystem.playSlot(slotKey, () => {
      audioSystem.playSlot('ui_frog_croak', playSynthesizedCroak);
    });
  }, []);

  const playAudioSlot = useCallback((slotKey: string) => {
    audioSystem.playSlot(slotKey, playSynthesizedCroak);
  }, []);

  const playBackgroundMusic = useCallback((slotKey: string) => {
    audioSystem.playBackground(slotKey);
  }, []);

  const stopBackgroundMusic = useCallback(() => {
    audioSystem.stopBackground();
  }, []);

  return { playCroak, playAudioSlot, playBackgroundMusic, stopBackgroundMusic };
};
