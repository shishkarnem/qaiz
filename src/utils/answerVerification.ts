/**
 * Helper utility for fast answer verification and dramatic countdown emulation.
 * If user's answer is an exact or near-exact match, we bypass the AI LLM call,
 * but still provide a dramatic simulated checking experience (with random 3-10s countdown)
 * matching the game experience.
 * If not matching, a 60-second countdown timer runs while neural network evaluates.
 */

export function normalizeAnswerText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let str = text.trim();

  // If not standalone acronym with dots, strip standard option markers
  if (!/^[a-zA-Zа-яА-ЯёЁ]\.([a-zA-Zа-яА-ЯёЁ]\.?)+$/i.test(str)) {
    str = str.replace(/^вариант\s+[a-dA-Dа-гА-Г1-4][\:\.\-]?\s+/i, '');
    str = str.replace(/^\[[a-dA-Dа-гА-Г1-4]\]\s+/i, '');
    str = str.replace(/^\([a-dA-Dа-гА-Г1-4]\)\s+/i, '');
    str = str.replace(/^[a-dA-Dа-гА-Г1-4][\)\.\:\-]\s+/i, '');
  }

  return str
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/^(ответ|это|этот|ответ:|правильный ответ:)\s+/i, '')
    .replace(/[\s\.,\/#!$%\^&\*;:{}=\-_`~()«»""'']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if user answer is an exact match (or direct substring/stem match) to the expected answer.
 */
export function isExactOrCloseAnswerMatch(userInput: string, targetAnswer: string): boolean {
  const userClean = normalizeAnswerText(userInput);
  const targetClean = normalizeAnswerText(targetAnswer);

  if (!userClean || !targetClean) return false;

  // 1. Direct equality
  if (userClean === targetClean) return true;

  // 2. Contains full target or full input if length >= 3
  if (userClean.length >= 3 && targetClean.includes(userClean)) return true;
  if (targetClean.length >= 3 && userClean.includes(targetClean)) return true;

  // 3. Word-level stemming match
  const uWords = userClean.split(' ').filter(w => w.length >= 3);
  const tWords = targetClean.split(' ').filter(w => w.length >= 3);

  if (uWords.length > 0 && tWords.length > 0) {
    let matchedWordCount = 0;
    for (const uw of uWords) {
      const uStem = uw.slice(0, Math.max(3, Math.floor(uw.length * 0.75)));
      for (const tw of tWords) {
        const tStem = tw.slice(0, Math.max(3, Math.floor(tw.length * 0.75)));
        if (uStem === tStem || uw.startsWith(tStem) || tw.startsWith(uStem)) {
          matchedWordCount++;
          break;
        }
      }
    }
    // If all significant words match, or in multi-word answer the majority match
    if (matchedWordCount === Math.max(uWords.length, tWords.length) || (tWords.length <= 2 && matchedWordCount >= 1 && uWords.length <= 2)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns a random integer between min and max (inclusive).
 */
export function getRandomCheckSeconds(min = 3, max = 10): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Runs a simulated countdown timer for duration seconds, calling onTick every second.
 */
export function runSimulatedCheckCountdown(
  seconds: number,
  onTick: (remainingSeconds: number) => void
): Promise<void> {
  return new Promise((resolve) => {
    let current = seconds;
    onTick(current);

    const interval = setInterval(() => {
      current -= 1;
      onTick(Math.max(0, current));
      if (current <= 0) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });
}

/**
 * Starts a 60-second countdown timer for AI neural network verification,
 * calling onTick every second and returning a cleanup/cancellation function.
 */
export function startAICheckCountdown(
  onTick: (remainingSeconds: number) => void,
  initialSeconds = 60,
  onTimeout?: () => void
): () => void {
  let current = initialSeconds;
  onTick(current);

  const interval = setInterval(() => {
    current -= 1;
    onTick(Math.max(0, current));
    if (current <= 0) {
      clearInterval(interval);
      if (onTimeout) {
        onTimeout();
      }
    }
  }, 1000);

  return () => {
    clearInterval(interval);
  };
}

