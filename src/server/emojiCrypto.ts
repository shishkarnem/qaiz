import crypto from 'crypto';

const SECRET_KEY = crypto
  .createHash('sha256')
  .update(process.env.ENCRYPTION_SECRET || 'qaiz-bubble-app-emoji-secret-key-2025')
  .digest();

// 16 distinct emojis for representing hex nibbles 0..15
const EMOJI_MAP: string[] = [
  '⚡', // 0
  '🍀', // 1
  '💎', // 2
  '🚀', // 3
  '✨', // 4
  '🌟', // 5
  '🪐', // 6
  '🔮', // 7
  '🍉', // 8
  '🥑', // 9
  '🍇', // a (10)
  '🎉', // b (11)
  '⭐', // c (12)
  '🍃', // d (13)
  '🌿', // e (14)
  '🔥'  // f (15)
];

const REVERSE_EMOJI_MAP: Map<string, string> = new Map();
EMOJI_MAP.forEach((emoji, idx) => {
  REVERSE_EMOJI_MAP.set(emoji, idx.toString(16));
});

const CIPHER_PREFIX = '🔐';

/**
 * Encrypts plain text into an emoji cipher string for database storage
 */
export function encryptEmojiText(plainText: string | null | undefined): string {
  if (!plainText || typeof plainText !== 'string' || !plainText.trim()) {
    return plainText || '';
  }

  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const fullHex = iv.toString('hex') + encrypted;

    // Convert hex string into emoji runes
    let emojiResult = CIPHER_PREFIX;
    for (let i = 0; i < fullHex.length; i++) {
      const nibble = parseInt(fullHex[i], 16);
      emojiResult += EMOJI_MAP[nibble] || '⚡';
    }

    return emojiResult;
  } catch (err) {
    console.warn('[EmojiCrypto] Error encrypting:', err);
    return plainText;
  }
}

/**
 * Decrypts an emoji cipher string back into normal plain text.
 * If the input is not encrypted, returns it unchanged (backward compatibility).
 */
export function decryptEmojiText(cipherText: string | null | undefined): string {
  if (!cipherText || typeof cipherText !== 'string' || !cipherText.startsWith(CIPHER_PREFIX)) {
    return cipherText || '';
  }

  try {
    const rawEmojis = Array.from(cipherText.slice(CIPHER_PREFIX.length));
    let hexStr = '';

    for (const em of rawEmojis) {
      const hexChar = REVERSE_EMOJI_MAP.get(em);
      if (hexChar !== undefined) {
        hexStr += hexChar;
      }
    }

    if (hexStr.length < 32) {
      // Invalid length for IV + ciphertext
      return cipherText;
    }

    const ivHex = hexStr.slice(0, 32);
    const encryptedHex = hexStr.slice(32);

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.warn('[EmojiCrypto] Error decrypting (returning raw):', err);
    return cipherText;
  }
}
