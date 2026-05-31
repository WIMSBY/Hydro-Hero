/**
 * Dev-only demo data seeder for App Store screenshots / preview video.
 *
 * Writes a curated, realistic "power user" snapshot directly into AsyncStorage
 * so every screen (home slot machine, weekly/monthly stats, achievements) looks
 * full and polished for capture. NONE of this ships to production — the UI that
 * triggers it is gated behind `__DEV__`.
 *
 * After seeding/clearing the app is reloaded so all screens re-read storage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { DevSettings } from "react-native";

const GOAL = 64; // daily goal in oz used for the demo profile
const DAYS = 30; // how many days of history to fabricate

function dateKey(d: Date) {
  return `water_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

function startOfDay(base: Date, offsetDays: number) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

/**
 * Goal-completion fraction for each of the last `DAYS` days.
 * index 0 = today. Days 0–13 are all hits → a clean 14-day current streak.
 * Day 14 is a miss so the streak caps believably. Older days mix hits/misses
 * so the calendar and trend charts have realistic variety (not all gold).
 */
function pctFor(i: number): number {
  if (i === 0) return 1.06; // today: just over goal so it counts toward the streak
  if (i <= 13) {
    const hits = [0, 1.0, 1.12, 1.0, 1.2, 1.0, 1.04, 1.0, 1.15, 1.0, 1.0, 1.08, 1.0, 1.1];
    return hits[i] ?? 1.0;
  }
  if (i === 14) return 0.62; // the miss that ends the current streak
  const misses: Record<number, number> = { 17: 0.55, 21: 0.42, 26: 0.7, 29: 0.8 };
  return misses[i] ?? 1.0 + (i % 3) * 0.05;
}

/** Per-day beverage breakdown (consumed oz per category). Partial objects are
 *  fine — the app merges them against its full 20-key default on load. */
function breakdownFor(i: number, consumed: number): Record<string, number> {
  if (i === 0) return { water: 56, coffee: 16 }; // mirrors the hero "Coffee" bet shot
  const water = Math.round(consumed * 0.6);
  const rem = Math.max(consumed - water, 0);
  const cat = ["coffee", "juice", "sports", "tea", "soda", "lemonade", "protein"][i % 7];
  return { water, [cat]: rem };
}

interface HistoryEntry {
  date: string;
  oz: number;
  goal: number;
  breakdown: Record<string, number>;
}

/** "full"   = today's goal already hit (full gauge + live current streak).
 *  "mid"    = today ~50% in progress (half-full gauge; home shows the friendly
 *             "Start your streak today!" message).
 *  "primed" = today ~88%, just under goal and NOT yet celebrated — tap any bet
 *             to trigger the real jackpot: reels → fireworks → fun fact card.
 *  All history/badges are identical across modes. */
export type SeedMode = "full" | "mid" | "primed";

interface TodayState {
  consumed: number;
  hydration: number;
  breakdown: Record<string, number>;
  lastEntryOz: number;
  lastHydrated: number;
  lastCategory: string;
  logEntries: { oz: number; category: string; timestamp: number; hydrated: number }[];
}

function todayStateFor(mode: SeedMode, today: Date): TodayState {
  if (mode === "primed") {
    // ~88% of a 64oz goal → "8 oz to go". One tap pushes it over for the
    // jackpot fireworks + fun fact (and the streak ticks up to 14 live).
    return {
      consumed: 56, // water 48 + coffee 8
      hydration: 56,
      breakdown: { water: 48, coffee: 8 },
      lastEntryOz: 8,
      lastHydrated: 7.8,
      lastCategory: "coffee",
      logEntries: [
        { oz: 24, category: "water", timestamp: new Date(today).setHours(7, 10, 0, 0), hydrated: 24 },
        { oz: 24, category: "water", timestamp: new Date(today).setHours(11, 30, 0, 0), hydrated: 24 },
        { oz: 8, category: "coffee", timestamp: new Date(today).setHours(14, 15, 0, 0), hydrated: 7.8 },
      ],
    };
  }
  if (mode === "mid") {
    // ~50% of a 64oz goal → half-full slot-machine gauge
    return {
      consumed: 32, // water 22 + coffee 10
      hydration: 31.8,
      breakdown: { water: 22, coffee: 10 },
      lastEntryOz: 10,
      lastHydrated: 9.8,
      lastCategory: "coffee",
      logEntries: [
        { oz: 22, category: "water", timestamp: new Date(today).setHours(7, 10, 0, 0), hydrated: 22 },
        { oz: 10, category: "coffee", timestamp: new Date(today).setHours(11, 30, 0, 0), hydrated: 9.8 },
      ],
    };
  }
  // "full": just over goal so today counts toward the streak, but below the
  // Century (100oz) / Overachiever (96oz) single-day badge thresholds.
  return {
    consumed: 72, // water 56 + coffee 16
    hydration: 71.7,
    breakdown: { water: 56, coffee: 16 },
    lastEntryOz: 16,
    lastHydrated: 15.7,
    lastCategory: "coffee",
    logEntries: [
      { oz: 24, category: "water", timestamp: new Date(today).setHours(7, 10, 0, 0), hydrated: 24 },
      { oz: 32, category: "water", timestamp: new Date(today).setHours(11, 30, 0, 0), hydrated: 32 },
      { oz: 16, category: "coffee", timestamp: new Date(today).setHours(14, 15, 0, 0), hydrated: 15.7 },
    ],
  };
}

export async function seedDemoData(mode: SeedMode = "full"): Promise<void> {
  const today = startOfDay(new Date(), 0);
  const todayKey = dateKey(today);
  const t = todayStateFor(mode, today);

  const goalHistory: Record<string, number> = {};
  const history: HistoryEntry[] = [];
  const dayKeyWrites: [string, string][] = [];

  for (let i = 0; i < DAYS; i++) {
    const day = startOfDay(today, -i);
    const key = dateKey(day);
    const pct = pctFor(i);
    const hydration = Math.round(pct * GOAL * 10) / 10;
    const consumed = Math.round(hydration / 0.9); // ~90% hydration efficiency
    const breakdown = breakdownFor(i, consumed);

    goalHistory[key] = Math.min(pct, 1); // streak logic treats >=1.0 as a hit
    history.push({ date: key, oz: consumed, goal: GOAL, breakdown });
    dayKeyWrites.push([key, JSON.stringify(consumed)]);
  }

  // ── Today's live state (home slot machine), varies by mode ─────────────────
  goalHistory[todayKey] = Math.min(t.hydration / GOAL, 1);
  history[0] = { date: todayKey, oz: t.consumed, goal: GOAL, breakdown: t.breakdown };
  dayKeyWrites[0] = [todayKey, JSON.stringify(t.consumed)];

  const todayHydration = t.hydration;
  const todayBreakdown = t.breakdown;
  const logEntries = t.logEntries;

  const firstDrinkIso = (() => {
    const d = new Date(today);
    d.setHours(7, 10, 0, 0); // before 8am → Early Bird badge stays consistent
    return d.toISOString();
  })();

  // ── Badges: curated set that matches the seeded streak / lifetime numbers ───
  // (12 unlocked / 8 locked → looks accomplished but still aspirational)
  const unlockedIds = [
    "first_drop", "streak_3", "streak_7", "streak_14",
    "first_jackpot", "lucky_7", "high_roller", "hydration_hero",
    "coffee_lover", "early_bird", "perfect_week", "night_owl",
  ];
  const unlockedBadges = unlockedIds.map((id, idx) => ({
    id,
    unlockedAt: startOfDay(today, -(idx + 2)).toISOString(),
  }));

  const writes: [string, string][] = [
    ...dayKeyWrites,
    ["water_goal", JSON.stringify(GOAL)],
    ["water_history", JSON.stringify(history)],
    ["goal_history", JSON.stringify(goalHistory)],
    ["water_total_hydration", JSON.stringify(todayHydration)],
    ["water_category_breakdown", JSON.stringify(todayBreakdown)],
    ["water_last_entry", JSON.stringify(t.lastEntryOz)],
    ["water_last_hydrated", JSON.stringify(t.lastHydrated)],
    ["water_last_category", JSON.stringify(t.lastCategory)],
    ["water_log_entries", JSON.stringify(logEntries)],
    ["lifetime_hydration_oz", JSON.stringify(1875)],
    ["lifetime_jackpots", JSON.stringify(29)],
    ["lifetime_coffee_logs", JSON.stringify(14)],
    ["lifetime_beer_logs", JSON.stringify(3)],
    ["first_drink_time", firstDrinkIso],
    ["unlocked_badges", JSON.stringify(unlockedBadges)],
    ["last_active_date", todayKey],
    ["onboarding_complete", "1"],
  ];

  // Only "full" is already at goal on load, so mark it celebrated to keep the
  // jackpot overlay from auto-firing. "primed" must stay un-celebrated so the
  // next logged drink triggers the real fireworks + fun fact.
  if (mode === "full") {
    writes.push([`goal_celebrated_${todayKey}`, "1"]);
  } else {
    await AsyncStorage.removeItem(`goal_celebrated_${todayKey}`);
  }

  await AsyncStorage.multiSet(writes);
  await AsyncStorage.removeItem("reset_in_progress");

  try {
    DevSettings.reload();
  } catch {}
}

export async function clearDemoData(): Promise<void> {
  const today = startOfDay(new Date(), 0);

  const dayKeys: string[] = [];
  const celebKeys: string[] = [];
  for (let i = -2; i <= DAYS + 15; i++) {
    const k = dateKey(startOfDay(today, -i));
    dayKeys.push(k);
    celebKeys.push(`goal_celebrated_${k}`);
  }

  await AsyncStorage.multiRemove([
    ...dayKeys,
    ...celebKeys,
    "water_history",
    "goal_history",
    "water_total_hydration",
    "water_category_breakdown",
    "water_last_entry",
    "water_last_hydrated",
    "water_last_category",
    "water_log_entries",
    "lifetime_hydration_oz",
    "lifetime_jackpots",
    "lifetime_coffee_logs",
    "lifetime_beer_logs",
    "first_drink_time",
    "unlocked_badges",
    "last_active_date",
    "reset_in_progress",
  ]);

  try {
    DevSettings.reload();
  } catch {}
}
