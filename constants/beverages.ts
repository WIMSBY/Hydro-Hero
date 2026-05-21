/**
 * constants/beverages.ts
 *
 * Single source of truth for all beverage definitions used across the app.
 * Import BEV_COLORS, BEV_LABELS, BEV_KEYS for stats/partner screens.
 * Import BEVERAGES, BevCategory, BevDef for the main screen.
 */

export type BevCategory =
  | 'water' | 'coffee' | 'tea' | 'icedtea' | 'soda' | 'flavored' | 'coconut'
  | 'juice' | 'lemonade' | 'fruit' | 'sports' | 'milk' | 'protein'
  | 'beer' | 'wine' | 'cocktail' | 'energy' | 'energyshot' | 'hotchoc' | 'spirits';

export interface BevDef {
  key: BevCategory;
  label: string;
  emoji: string;
  color: string;
  eff: number;
}

export const BEVERAGES: BevDef[] = [
  { key: 'water',      label: 'Water',          emoji: '💧', color: '#1565C0', eff: 1.00 },
  { key: 'coffee',     label: 'Coffee',          emoji: '☕', color: '#7B4F2E', eff: 0.98 },
  { key: 'tea',        label: 'Tea',             emoji: '🍵', color: '#8B7355', eff: 0.99 },
  { key: 'icedtea',    label: 'Iced Tea',        emoji: '🧋', color: '#C8A000', eff: 0.99 },
  { key: 'soda',       label: 'Soda',            emoji: '🥤', color: '#C0392B', eff: 0.90 },
  { key: 'flavored',   label: 'Flavored Water',  emoji: '🫧', color: '#4488CC', eff: 0.95 },
  { key: 'coconut',    label: 'Coconut Water',   emoji: '🥥', color: '#8B6914', eff: 0.94 },
  { key: 'juice',      label: 'Juice',           emoji: '🍊', color: '#E8920A', eff: 0.85 },
  { key: 'lemonade',   label: 'Lemonade',        emoji: '🍋', color: '#FFD700', eff: 0.85 },
  { key: 'fruit',      label: 'Fruit Drinks',    emoji: '🍹', color: '#CC4488', eff: 0.85 },
  { key: 'sports',     label: 'Sports Drink',    emoji: '🏃', color: '#2E8B4A', eff: 0.88 },
  { key: 'milk',       label: 'Milk',            emoji: '🥛', color: '#AAAAAA', eff: 0.87 },
  { key: 'protein',    label: 'Protein Shake',   emoji: '💪', color: '#8844AA', eff: 0.75 },
  { key: 'beer',       label: 'Beer',            emoji: '🍺', color: '#D4881A', eff: 0.90 },
  { key: 'wine',       label: 'Wine',            emoji: '🍷', color: '#8B1A3A', eff: 0.85 },
  { key: 'cocktail',   label: 'Cocktail',        emoji: '🍸', color: '#7B1A8B', eff: 0.70 },
  { key: 'energy',     label: 'Energy Drink',    emoji: '⚡', color: '#AACC00', eff: 0.80 },
  { key: 'energyshot', label: 'Energy Shot',     emoji: '🔋', color: '#CC8800', eff: 0.50 },
  { key: 'hotchoc',    label: 'Hot Chocolate',   emoji: '🍫', color: '#5C3317', eff: 0.85 },
  { key: 'spirits',    label: 'Spirits',         emoji: '🥃', color: '#AA6622', eff: 0.40 },
];

export const BEV_COLORS: Record<string, string> = Object.fromEntries(
  BEVERAGES.map(b => [b.key, b.color])
);

export const BEV_LABELS: Record<string, string> = Object.fromEntries(
  BEVERAGES.map(b => [b.key, b.label])
);

export const BEV_KEYS: string[] = BEVERAGES.map(b => b.key);
