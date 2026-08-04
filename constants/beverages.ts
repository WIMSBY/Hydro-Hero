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
  | 'juice' | 'lemonade' | 'preworkout' | 'sports' | 'milk' | 'protein'
  | 'beer' | 'wine' | 'cocktail' | 'energy' | 'kombucha' | 'hotchoc' | 'spirits';

/**
 * How a logged beverage relates to the hydration goal:
 * - 'hydrationCredit': oz × eff counts toward the tank/goal.
 * - 'trackedSeparately': logged and shown in history, but contributes nothing
 *   to the goal and displays no numeric credit. Used for alcohol, where no
 *   single percentage is honest (varies with ABV, serving, food, timing).
 */
export type HydrationContributionMode = 'hydrationCredit' | 'trackedSeparately';

export interface BevDef {
  key: BevCategory;
  label: string;
  emoji: string;
  color: string;
  /** Lightened tint for LiquidRing surface highlight (derived from color). */
  surface: string;
  /** Tabler icon used by LastDrinkReveal. */
  Icon: React.FC<IconProps>;
  /** Hydration-credit multiplier. Inert when contribution is 'trackedSeparately'. */
  eff: number;
  contribution: HydrationContributionMode;
}

function lighten(hex: string, amt = 0.4): string {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

type RawBev = Omit<BevDef, 'surface' | 'contribution'> & { contribution?: HydrationContributionMode };
// Alcohol rows keep eff: 0 as a backstop — trackedSeparately is the real gate,
// but a missed call site then adds nothing instead of phantom credit.
const RAW: RawBev[] = [
  { key: 'water',      label: 'Water',          emoji: '💧', color: '#1565C0', eff: 1.00, Icon: IconDroplet },
  { key: 'coffee',     label: 'Coffee',         emoji: '☕', color: '#7B4F2E', eff: 1.00, Icon: IconCoffee },
  { key: 'tea',        label: 'Tea',            emoji: '🍵', color: '#8B7355', eff: 1.00, Icon: IconTeapot },
  { key: 'icedtea',    label: 'Iced Tea',       emoji: '🧋', color: '#C8A000', eff: 1.00, Icon: IconCup },
  { key: 'soda',       label: 'Soda',           emoji: '🥤', color: '#C0392B', eff: 0.95, Icon: IconCup },
  { key: 'flavored',   label: 'Flavored Water', emoji: '🫧', color: '#4488CC', eff: 1.00, Icon: IconBubble },
  { key: 'coconut',    label: 'Coconut Water',  emoji: '🥥', color: '#8B6914', eff: 1.00, Icon: IconBowl },
  { key: 'juice',      label: 'Juice',          emoji: '🍊', color: '#E8920A', eff: 0.95, Icon: IconBottle },
  { key: 'lemonade',   label: 'Lemonade',       emoji: '🍋', color: '#FFD700', eff: 0.95, Icon: IconLemon },
  { key: 'preworkout', label: 'Preworkout',     emoji: '💥', color: '#DC2626', eff: 0.90, Icon: IconFlask },
  { key: 'sports',     label: 'Sports Drink',   emoji: '🏃', color: '#2E8B4A', eff: 1.00, Icon: IconRun },
  { key: 'milk',       label: 'Milk',           emoji: '🥛', color: '#AAAAAA', eff: 1.00, Icon: IconMilk },
  { key: 'protein',    label: 'Protein Shake',  emoji: '💪', color: '#8844AA', eff: 0.90, Icon: IconBarbell },
  { key: 'beer',       label: 'Beer',           emoji: '🍺', color: '#D4881A', eff: 0, contribution: 'trackedSeparately', Icon: IconBeer },
  { key: 'wine',       label: 'Wine',           emoji: '🍷', color: '#8B1A3A', eff: 0, contribution: 'trackedSeparately', Icon: IconGlassChampagne },
  { key: 'cocktail',   label: 'Cocktail',       emoji: '🍸', color: '#7B1A8B', eff: 0, contribution: 'trackedSeparately', Icon: IconGlassCocktail },
  { key: 'energy',     label: 'Energy Drink',   emoji: '⚡', color: '#AACC00', eff: 0.90, Icon: IconBolt },
  { key: 'kombucha',   label: 'Kombucha',       emoji: '🫙', color: '#C9851F', eff: 0.95, Icon: IconBottle },
  { key: 'hotchoc',    label: 'Hot Chocolate',  emoji: '🍫', color: '#5C3317', eff: 0.95, Icon: IconChocolate },
  { key: 'spirits',    label: 'Spirits',        emoji: '🥃', color: '#AA6622', eff: 0, contribution: 'trackedSeparately', Icon: IconGlassGin },
];

export const BEVERAGES: BevDef[] = RAW.map(b => ({
  ...b,
  surface: lighten(b.color, 0.4),
  contribution: b.contribution ?? 'hydrationCredit',
}));

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

const BEV_DEF_MAP = new Map<BevCategory, BevDef>(BEVERAGES.map(b => [b.key, b]));

/** True when the beverage logs to history but never earns hydration credit. */
export const tracksSeparately = (key: BevCategory): boolean =>
  BEV_DEF_MAP.get(key)?.contribution === 'trackedSeparately';

// Canonical user-facing copy — keep these three in sync across surfaces.
export const TRACKED_SEPARATELY_SHORT = 'Tracked separately';
export const TRACKED_SEPARATELY_SUBTITLE = 'Alcoholic drink · Tracked separately';
export const ALCOHOL_HINT = 'Alcohol can increase fluid loss. Consider drinking water alongside it.';
