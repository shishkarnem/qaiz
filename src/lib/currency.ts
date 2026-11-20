/**
 * Currency declension helper for "ИИкра" (analogy with "Икра")
 * 1 ИИкра, 21 ИИкра, 31 ИИкра
 * 2 ИИкры, 3 ИИкры, 4 ИИкры, 22 ИИкры, 24 ИИкры
 * 0 ИИкр, 5-20 ИИкр, 25-30 ИИкр
 * Баланс ИИкры
 * О валюте ИИкра
 * в ИИкрах
 */

export function pluralize(amount: number, one: string, few: string, many: string): string {
  const absAmount = Math.abs(Math.round(amount));
  const rem100 = absAmount % 100;
  const rem10 = absAmount % 10;

  if (rem100 >= 11 && rem100 <= 19) {
    return many;
  }
  if (rem10 === 1) {
    return one;
  }
  if (rem10 >= 2 && rem10 <= 4) {
    return few;
  }
  return many;
}

export function getIikrWord(amount: number): string {
  return pluralize(amount, 'ИИкра', 'ИИкры', 'ИИкр');
}

export function formatIikr(amount: number | null | undefined, includeNumber: boolean = true): string {
  const val = Number(amount || 0);
  const word = getIikrWord(val);
  return includeNumber ? `${val.toLocaleString('ru-RU')} ${word}` : word;
}

export function getRubWord(amount: number): string {
  return pluralize(amount, 'рубль', 'рубля', 'рублей');
}

export function formatRub(amount: number | null | undefined, includeNumber: boolean = true): string {
  const val = Number(amount || 0);
  const word = getRubWord(val);
  return includeNumber ? `${val.toLocaleString('ru-RU')} ${word}` : word;
}

export function getPointsWord(amount: number, capitalize: boolean = false): string {
  if (capitalize) {
    return pluralize(amount, 'Очко', 'Очка', 'Очков');
  }
  return pluralize(amount, 'очко', 'очка', 'очков');
}

export function formatPoints(amount: number | null | undefined, capitalize: boolean = false, includeNumber: boolean = true): string {
  const val = Number(amount || 0);
  const word = getPointsWord(val, capitalize);
  return includeNumber ? `${val.toLocaleString('ru-RU')} ${word}` : word;
}

export function getIikrGenitive(): string {
  return 'ИИкры';
}

export function getIikrPrepositional(): string {
  return 'ИИкрах';
}

