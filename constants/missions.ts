/**
 * Mission data model + seed catalog.
 *
 * Day 2 of the Missions feature. The 9 seed missions form 3 evergreen chains
 * (Bronze → Silver → Gold). All evaluation is local-first — no backend, no
 * sync. ContentState shape mirrored from the spec at project_missions_spec.md;
 * caffeine cut removed the Caffeine Crusader chain and the dailyMax rule kind
 * (see project_missions_no_caffeine.md).
 *
 * Future: this catalog will move to an OTA-shippable missions.json so seasonal
 * chains can land without a binary release. For now it lives in code so we get
 * type safety while the schema is still moving.
 */

import { BevCategory } from "./beverages";

// ─── Rule kinds ──────────────────────────────────────────────────────────────

export type MissionRule =
  | { kind: "dailyGoalMet" }
  | { kind: "abstain"; beverageIds: BevCategory[] }
  | { kind: "dailyMin"; beverageId: BevCategory; amountOz: number }
  | { kind: "logCount"; beverageId: BevCategory; count: number }
  | { kind: "multiBevDay"; count: number }
  | { kind: "weatherBonus"; tempFThreshold: number };

// ─── Mission + Progress ──────────────────────────────────────────────────────

export type MissionDifficulty = "Bronze" | "Silver" | "Gold";
export type MissionCategory   = "evergreen" | "seasonal";
export type MissionStatus     = "active" | "completed" | "failed" | "abandoned";

export type RewardKind = "sigil" | "power" | "cosmetic";
export type Reward = {
  kind: RewardKind;
  id: string;
  // Human-readable name surfaced in unlock toasts + Trophy Case.
  name: string;
};

export type Mission = {
  id: string;
  name: string;
  emblem: string;     // emoji used as placeholder until SVG sigils ship Day 5
  tagline: string;
  // Plain-English one-liner describing the rule. Rendered as-is on the
  // Mission Detail screen and Discover sheet so the UI never has to
  // translate the structured MissionRule at runtime. Future custom-mission
  // editor (Build 35) reuses this field for user-authored descriptions.
  ruleText: string;
  durationDays: number;
  rule: MissionRule;
  rewards: Reward[];
  chain?: { chainId: string; tierIndex: number };
  difficulty: MissionDifficulty;
  shieldsGranted: number;
  category: MissionCategory;
  availableFrom?: string;   // YYYY-MM-DD inclusive
  availableUntil?: string;  // YYYY-MM-DD inclusive
  proOnly?: boolean;
};

export type MissionProgress = {
  missionId: string;
  startedAt: string;          // ISO date (UTC)
  daysCompleted: number;
  // Last calendar date the engine evaluated, in this project's getDateKey
  // format ("day_YYYY_M_D"). Engine walks forward from the day after this.
  lastEvaluatedDate: string;
  shieldsRemaining: number;
  shieldsUsedOn: string[];    // getDateKey strings
  status: MissionStatus;
};

// ─── Chain metadata ──────────────────────────────────────────────────────────

export type MissionChain = {
  id: string;
  name: string;
  tagline: string;
  tierIds: string[];          // mission ids in Bronze → Gold order
};

export const MISSION_CHAINS: MissionChain[] = [
  {
    id: "heros-journey",
    name: "The Hero's Journey",
    tagline: "Hit your daily hydration goal.",
    tierIds: ["heros-journey-bronze", "heros-journey-silver", "heros-journey-gold"],
  },
  {
    id: "dry-spell",
    name: "Dry Spell",
    tagline: "Lay off the alcohol.",
    tierIds: ["dry-spell-bronze", "dry-spell-silver", "dry-spell-gold"],
  },
  {
    id: "tea-time",
    name: "Tea Time",
    tagline: "A daily cup of tea.",
    tierIds: ["tea-time-bronze", "tea-time-silver", "tea-time-gold"],
  },
];

// ─── Mission catalog ─────────────────────────────────────────────────────────
//
// Shield count per difficulty:
//   Bronze: 2 (forgiving) — Silver: 1 (tightening) — Gold: 0 (hardcore opt-in)
//
// Sixth Sense (adaptive reminders) used to unlock on Caffeine Crusader Silver;
// the caffeine cut moved it to Dry Spell Silver per project_missions_no_caffeine.

const ALCOHOLIC_BEV_IDS: BevCategory[] = ["beer", "wine", "cocktail", "spirits"];

export const MISSIONS: Mission[] = [
  // ── Hero's Journey ───────────────────────────────────────────────────────
  {
    id: "heros-journey-bronze",
    name: "Origin Story",
    emblem: "🦸",
    tagline: "Hit your hydration goal 7 days running.",
    ruleText: "Reach your daily goal every day for 7 days.",
    durationDays: 7,
    rule: { kind: "dailyGoalMet" },
    rewards: [
      { kind: "sigil",    id: "sigil-origin",    name: "Origin Sigil" },
      { kind: "power",    id: "power-iron-will", name: "Iron Will (+1 shield on future missions)" },
    ],
    chain: { chainId: "heros-journey", tierIndex: 0 },
    difficulty: "Bronze",
    shieldsGranted: 2,
    category: "evergreen",
  },
  {
    id: "heros-journey-silver",
    name: "Solo Patrol",
    emblem: "🛡️",
    tagline: "Two weeks of hitting your goal, no breaks.",
    ruleText: "Reach your daily goal every day for 14 days.",
    durationDays: 14,
    rule: { kind: "dailyGoalMet" },
    rewards: [
      { kind: "sigil",    id: "sigil-solo",        name: "Solo Sigil" },
      { kind: "power",    id: "power-double-tap",  name: "Double Tap (long-press to double last amount)" },
      { kind: "cosmetic", id: "cape-blue",         name: "Blue Cape" },
    ],
    chain: { chainId: "heros-journey", tierIndex: 1 },
    difficulty: "Silver",
    shieldsGranted: 1,
    category: "evergreen",
  },
  {
    id: "heros-journey-gold",
    name: "League Initiation",
    emblem: "⭐",
    tagline: "A full month of perfect hydration.",
    ruleText: "Reach your daily goal every day for 30 days.",
    durationDays: 30,
    rule: { kind: "dailyGoalMet" },
    rewards: [
      { kind: "sigil",    id: "sigil-league",        name: "League Sigil" },
      { kind: "power",    id: "power-hydro-vision",  name: "Hydro Vision (custom widget skin unlock)" },
      { kind: "cosmetic", id: "mask-signature",      name: "Signature Mask" },
    ],
    chain: { chainId: "heros-journey", tierIndex: 2 },
    difficulty: "Gold",
    shieldsGranted: 0,
    category: "evergreen",
  },

  // ── Dry Spell ────────────────────────────────────────────────────────────
  {
    id: "dry-spell-bronze",
    name: "Dry Spell",
    emblem: "🍃",
    tagline: "One week, no alcohol.",
    ruleText: "Stay alcohol-free for 7 days in a row.",
    durationDays: 7,
    rule: { kind: "abstain", beverageIds: ALCOHOLIC_BEV_IDS },
    rewards: [
      { kind: "sigil", id: "sigil-dry-bronze", name: "Dry Bronze Sigil" },
    ],
    chain: { chainId: "dry-spell", tierIndex: 0 },
    difficulty: "Bronze",
    shieldsGranted: 2,
    category: "evergreen",
  },
  {
    id: "dry-spell-silver",
    name: "Mocktail Fortnight",
    emblem: "🌿",
    tagline: "Two weeks alcohol-free.",
    ruleText: "Stay alcohol-free for 14 days in a row.",
    durationDays: 14,
    rule: { kind: "abstain", beverageIds: ALCOHOLIC_BEV_IDS },
    rewards: [
      { kind: "sigil", id: "sigil-dry-silver",   name: "Dry Silver Sigil" },
      { kind: "power", id: "power-sixth-sense",  name: "Sixth Sense (adaptive reminders)" },
    ],
    chain: { chainId: "dry-spell", tierIndex: 1 },
    difficulty: "Silver",
    shieldsGranted: 1,
    category: "evergreen",
  },
  {
    id: "dry-spell-gold",
    name: "Mocktail Month",
    emblem: "🏆",
    tagline: "Thirty days, no alcohol, no slip-ups.",
    ruleText: "Stay alcohol-free for 30 days in a row.",
    durationDays: 30,
    rule: { kind: "abstain", beverageIds: ALCOHOLIC_BEV_IDS },
    rewards: [
      { kind: "sigil", id: "sigil-dry-gold",   name: "Dry Gold Sigil" },
      { kind: "power", id: "power-time-warp",  name: "Time Warp (one freeze-streak pass per month)" },
    ],
    chain: { chainId: "dry-spell", tierIndex: 2 },
    difficulty: "Gold",
    shieldsGranted: 0,
    category: "evergreen",
  },

  // ── Tea Time ─────────────────────────────────────────────────────────────
  {
    id: "tea-time-bronze",
    name: "Tea Time",
    emblem: "🍵",
    tagline: "At least 8 oz of tea, 7 days running.",
    ruleText: "Drink at least 8 oz of tea every day for 7 days.",
    durationDays: 7,
    rule: { kind: "dailyMin", beverageId: "tea", amountOz: 8 },
    rewards: [
      { kind: "sigil", id: "sigil-tea-bronze", name: "Tea Bronze Sigil" },
    ],
    chain: { chainId: "tea-time", tierIndex: 0 },
    difficulty: "Bronze",
    shieldsGranted: 2,
    category: "evergreen",
  },
  {
    id: "tea-time-silver",
    name: "Afternoon Ritual",
    emblem: "🍃",
    tagline: "Two weeks of daily tea ≥ 12 oz.",
    ruleText: "Drink at least 12 oz of tea every day for 14 days.",
    durationDays: 14,
    rule: { kind: "dailyMin", beverageId: "tea", amountOz: 12 },
    rewards: [
      { kind: "sigil",    id: "sigil-tea-silver", name: "Tea Silver Sigil" },
      { kind: "cosmetic", id: "sound-tea-pack",   name: "Steeping Sound Pack" },
    ],
    chain: { chainId: "tea-time", tierIndex: 1 },
    difficulty: "Silver",
    shieldsGranted: 1,
    category: "evergreen",
  },
  {
    id: "tea-time-gold",
    name: "Tea Master",
    emblem: "🧘",
    tagline: "A month of daily tea ≥ 16 oz.",
    ruleText: "Drink at least 16 oz of tea every day for 30 days.",
    durationDays: 30,
    rule: { kind: "dailyMin", beverageId: "tea", amountOz: 16 },
    rewards: [
      { kind: "sigil", id: "sigil-tea-gold", name: "Tea Gold Sigil" },
    ],
    chain: { chainId: "tea-time", tierIndex: 2 },
    difficulty: "Gold",
    shieldsGranted: 0,
    category: "evergreen",
  },
];

export function getMission(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}

export function getChain(id: string): MissionChain | undefined {
  return MISSION_CHAINS.find((c) => c.id === id);
}
