import { audioSystem } from '../hooks/useSound';

// Gentle Web Audio API chime for in-app chat notifications
let audioCtx: AudioContext | null = null;

export function playNotificationSound() {
  try {
    const effectiveVol = audioSystem.getEffectiveMasterVolume();
    if (effectiveVol <= 0) return;

    const playedCustom =
      audioSystem.playSlot('ui_direct_msg_receive') ||
      audioSystem.playSlot('ui_notification_toast');
    if (playedCustom) return;

    if (!audioSystem.getHasUserGesture()) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const existingCtx = audioSystem.getSharedAudioContext();
    if (existingCtx && existingCtx.state !== 'closed') {
      audioCtx = existingCtx;
    } else if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const now = audioCtx.currentTime;

    // Harmonic 1 (587.33 Hz - D5)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);

    gain1.gain.setValueAtTime(Math.max(0.001, 0.12 * effectiveVol), now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    osc1.start(now);
    osc1.stop(now + 0.45);

    // Harmonic 2 (Higher crystal shimmer)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1174.66, now + 0.08); // D6
    osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.22); // A6

    gain2.gain.setValueAtTime(Math.max(0.001, 0.06 * effectiveVol), now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);

    osc2.start(now + 0.08);
    osc2.stop(now + 0.5);
  } catch (_) {
    // AudioContext blocked by browser autoplay policy until user gesture
  }
}
