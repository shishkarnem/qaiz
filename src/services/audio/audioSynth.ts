/**
 * Web Audio API synthesized fallback sounds (only invoked after real user activation).
 */
export function playSynthesizedSlotPreview(
  slotKey: string,
  slotVolume: number,
  effectiveMaster: number,
  sharedCtx: AudioContext | null,
  hasUserGesture: boolean
): void {
  if (!hasUserGesture || effectiveMaster <= 0 || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = sharedCtx && sharedCtx.state !== 'closed' ? sharedCtx : new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const shouldCloseAfter = ctx !== sharedCtx;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();

    let hash = 0;
    for (let i = 0; i < slotKey.length; i++) {
      hash = (hash * 31 + slotKey.charCodeAt(i)) & 0xffff;
    }

    const isErrorOrWrong =
      slotKey.includes('wrong') ||
      slotKey.includes('lose') ||
      slotKey.includes('timeout') ||
      slotKey.includes('strike');
    const isWinOrCorrect =
      slotKey.includes('correct') || slotKey.includes('win') || slotKey.includes('victory');
    const isTick = slotKey.includes('tick') || slotKey.includes('countdown');

    const peak = Math.max(0.01, Math.min(0.45, 0.25 * slotVolume * effectiveMaster));
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.03);

    if (isErrorOrWrong) {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (isWinOrCorrect) {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.12);
      osc.frequency.setValueAtTime(783.99, now + 0.24);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (isTick) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    } else {
      const f1 = 360 + (hash % 280);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f1, now);
      osc.frequency.exponentialRampToValueAtTime(f1 * 1.25, now + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    }

    if (shouldCloseAfter) {
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 650);
    }
  } catch {
    // Graceful silent fallback
  }
}

export function playSynthesizedCroakSound(
  effectiveMaster: number,
  sharedCtx: AudioContext | null,
  hasUserGesture: boolean
): void {
  if (!hasUserGesture || effectiveMaster <= 0 || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = sharedCtx && sharedCtx.state !== 'closed' ? sharedCtx : new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const shouldCloseAfter = ctx !== sharedCtx;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    const now = ctx.currentTime;

    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.3);

    const peak = Math.max(0.001, 0.15 * effectiveMaster);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);

    if (shouldCloseAfter) {
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 500);
    }
  } catch {
    // Graceful silent fallback
  }
}
