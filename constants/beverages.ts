/**
 * constants/beverages.ts
 *
 * Single source of truth for all beverage definitions used across the app.
 * Import BEV_COLORS, BEV_LABELS, BEV_KEYS for stats/partner screens.
 * Import BEVERAGES, BevCategory, BevDef for the main screen.
 */

import {
  IconDroplet, IconCoffee, IconTeapot, IconCup, IconBubble, IconBowl,
  IconBottle, IconLemon, IconGlassCocktail, IconRun, IconMilk, IconBarbell,
  IconBeer, IconGlassChampagne, IconBolt, IconFlask, IconChocolate,
  IconGlassGin, type IconProps,
} from '@tabler/icons-react-native';

export type BevCategory =
  | 'water' | 'coffee' | 'tea' | 'icedtea' | 'soda' | 'flavored' | 'coconut'
  | 'juice' | 'lemonade' | 'fruit' | 'sports' | 'milk' | 'protein'
  | 'beer' | 'wine' | 'cocktail' | 'energy' | 'energyshot' | 'hotchoc' | 'spirits';

export interface BevDef {
  key: BevCategory;
  label: string;
  emoji: string;
  color: string;
  /** Lightened tint for LiquidRing surface highlight (derived from color). */
  surface: string;
  /** Tabler icon used by LastDrinkReveal. */
  Icon: React.FC<IconProps>;
  eff: number;
}

function lighten(hex: string, amt = 0.4): string {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

type RawBev = Omit<BevDef, 'surface'>;
const RAW: RawBev[] = [
  { key: 'water',      label: 'Water',          emoji: '💧', color: '#1565C0', eff: 1.00, Icon: IconDroplet },
  { key: 'coffee',     label: 'Coffee',         emoji: '☕', color: '#7B4F2E', eff: 0.98, Icon: IconCoffee },
  { key: 'tea',        label: 'Tea',            emoji: '🍵', color: '#8B7355', eff: 0.99, Icon: IconTeapot },
  { key: 'icedtea',    label: 'Iced Tea',       emoji: '🧋', color: '#C8A000', eff: 0.99, Icon: IconCup },
  { key: 'soda',       label: 'Soda',           emoji: '🥤', color: '#C0392B', eff: 0.90, Icon: IconCup },
  { key: 'flavored',   label: 'Flavored Water', emoji: '🫧', color: '#4488CC', eff: 0.95, Icon: IconBubble },
  { key: 'coconut',    label: 'Coconut Water',  emoji: '🥥', color: '#8B6914', eff: 0.94, Icon: IconBowl },
  { key: 'juice',      label: 'Juice',          emoji: '🍊', color: '#E8920A', eff: 0.85, Icon: IconBottle },
  { key: 'lemonade',   label: 'Lemonade',       emoji: '🍋', color: '#FFD700', eff: 0.85, Icon: IconLemon },
  { key: 'fruit',      label: 'Fruit Drinks',   emoji: '🍹', color: '#CC4488', eff: 0.85, Icon: IconGlassCocktail },
  { key: 'sports',     label: 'Sports Drink',   emoji: '🏃', color: '#2E8B4A', eff: 0.88, Icon: IconRun },
  { key: 'milk',       label: 'Milk',           emoji: '🥛', color: '#AAAAAA', eff: 0.87, Icon: IconMilk },
  { key: 'protein',    label: 'Protein Shake',  emoji: '💪', color: '#8844AA', eff: 0.75, Icon: IconBarbell },
  { key: 'beer',       label: 'Beer',           emoji: '🍺', color: '#D4881A', eff: 0.90, Icon: IconBeer },
  { key: 'wine',       label: 'Wine',           emoji: '🍷', color: '#8B1A3A', eff: 0.85, Icon: IconGlassChampagne },
  { key: 'cocktail',   label: 'Cocktail',       emoji: '🍸', color: '#7B1A8B', eff: 0.70, Icon: IconGlassCocktail },
  { key: 'energy',     label: 'Energy Drink',   emoji: '⚡', color: '#AACC00', eff: 0.80, Icon: IconBolt },
  { key: 'energyshot', label: 'Energy Shot',    emoji: '🔋', color: '#CC8800', eff: 0.50, Icon: IconFlask },
  { key: 'hotchoc',    label: 'Hot Chocolate',  emoji: '🍫', color: '#5C3317', eff: 0.85, Icon: IconChocolate },
  { key: 'spirits',    label: 'Spirits',        emoji: '🥃', color: '#AA6622', eff: 0.40, Icon: IconGlassGin },
];

export const BEVERAGES: BevDef[] = RAW.map(b => ({ ...b, surface: lighten(b.color, 0.4) }));

export const BEV_COLORS: Record<string, string> = Object.fromEntries(
  BEVERAGES.map(b => [b.key, b.color])
);

export const BEV_LABELS: Record<string, string> = Object.fromEntries(
  BEVERAGES.map(b => [b.key, b.label])
);

export const BEV_KEYS: string[] = BEVERAGES.map(b => b.key);

export const ALCOHOLIC_BEVS: ReadonlySet<BevCategory> = new Set<BevCategory>([
  'beer', 'wine', 'cocktail', 'spirits',
]);

export const isAlcoholic = (key: BevCategory): boolean => ALCOHOLIC_BEVS.has(key);
