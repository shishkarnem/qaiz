/**
 * Калькулятор стоимости пополнения баланса ИИкры за рубли со скидками за объем.
 * 
 * Шкала скидок за разовое пополнение:
 * 0 - 299 ИИкр: 0%
 * 300 - 499 ИИкр: 5%
 * 500 - 999 ИИкр: 10%
 * 1000 - 2499 ИИкр: 15%
 * 2500 - 4999 ИИкр: 20%
 * 5000 и выше: 25%
 */

export function getTopUpDiscountPercent(iikrAmount: number): number {
  const amount = Number(iikrAmount) || 0;
  if (amount >= 5000) return 25;
  if (amount >= 2500) return 20;
  if (amount >= 1000) return 15;
  if (amount >= 500) return 10;
  if (amount >= 300) return 5;
  return 0;
}

export function calculateTopUpPriceRub(iikrAmount: number) {
  const safeAmount = Math.max(0, Math.floor(Number(iikrAmount) || 0));
  const basePriceRub = Math.round(safeAmount * 0.99 * 100) / 100;
  const discountPercent = getTopUpDiscountPercent(safeAmount);
  const discountRub = Math.round(basePriceRub * (discountPercent / 100) * 100) / 100;
  const finalPriceRub = Math.max(0, Math.round((basePriceRub - discountRub) * 100) / 100);

  return {
    amount: safeAmount,
    basePriceRub,
    discountPercent,
    discountRub,
    finalPriceRub
  };
}

export interface DiscountTier {
  range: string;
  min: number;
  max: number;
  discount: number;
  percent: number;
}

export interface PresetPack {
  iikr: number;
  basePriceRub: number;
  discountPercent: number;
  discountRub: number;
  finalPriceRub: number;
}

export const TOP_UP_DISCOUNT_TIERS: DiscountTier[] = [
  { range: '0 – 299 ИИкр', min: 0, max: 299, discount: 0, percent: 0 },
  { range: '300 – 499 ИИкр', min: 300, max: 499, discount: 5, percent: 5 },
  { range: '500 – 999 ИИкр', min: 500, max: 999, discount: 10, percent: 10 },
  { range: '1 000 – 2 499 ИИкр', min: 1000, max: 2499, discount: 15, percent: 15 },
  { range: '2 500 – 4 999 ИИкр', min: 2500, max: 4999, discount: 20, percent: 20 },
  { range: '5 000+ ИИкр', min: 5000, max: Infinity, discount: 25, percent: 25 },
];

export const TOP_UP_PRESET_PACKS: PresetPack[] = [
  100, 300, 500, 1000, 2500, 5000
].map(iikr => {
  const p = calculateTopUpPriceRub(iikr);
  return {
    iikr,
    basePriceRub: p.basePriceRub,
    discountPercent: p.discountPercent,
    discountRub: p.discountRub,
    finalPriceRub: p.finalPriceRub
  };
});
