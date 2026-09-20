export type Item = { type: string; kg: number };

// Indicative scrap rates in ₹ per kg (informal-sector market rates, India — tune per city).
export const RATES: Record<string, number> = {
  Paper: 9,
  Cardboard: 7,
  Plastic: 12,
  Metal: 28,
  Aluminium: 120,
  Copper: 450,
  Glass: 2,
  'E-waste': 45,
  Other: 1,
};

export const WASTE_TYPES = Object.keys(RATES);

export function lineTotal(item: Item): number {
  return (RATES[item.type] ?? 0) * item.kg;
}

export function calcTotal(items: Item[]): number {
  return items.reduce((sum, i) => sum + lineTotal(i), 0);
}

export function totalKg(items: Item[]): number {
  return items.reduce((sum, i) => sum + i.kg, 0);
}

export function summaryType(items: Item[]): string {
  return items.length > 1 ? 'Mixed' : items[0]?.type || 'Other';
}
