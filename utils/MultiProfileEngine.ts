/**
 * MultiProfileEngine — Family Mode Day 3.
 *
 * Foreground tick handler: for every profile that is NOT currently active,
 * run a storage-only "did midnight happen?" reset + mission-engine catch-up
 * so streaks stay honest on inactive profiles. The active profile is handled
 * by Home's normal flow (`checkDateAndMaybeReset` + `evaluateAllActive`),
 * which also touches React state, sounds, watch sync, and Live Activity.
 *
 * Inactive profiles only need the data side — they're invisible until the
 * user switches to them. The Stack remount on profile switch then picks up
 * the freshly reset/evaluated data.
 *
 * All reads/writes go through `prefixKey(key, profileId)` so we never touch
 * the active-profile-scoped wrappers (pGetItem/pSetItem) and never pollute
 * the active profile's React state.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BevCategory } from '../constants/beverages';
import { getMission } from '../constants/missions';
import { addDays, getDateKey } from './dateKey';
import {
  applyDay,
  catchUp,
  type DayData,
  type ProgressMap,
} from './MissionEngine';
import { loadProfiles, type Profile } from './ProfileStore';
import { prefixKey } from './profileStorage';

// Matches the Home file's water_history entry shape, restated here so this
// module doesn't depend on app/(tabs)/index.tsx.
type HistEntry = {
  date: string;
  oz: number;
  goal: number;
  breakdown?: Partial<Record<BevCategory, number>>;
  hourBuckets?: Record<number, number>;
};

const EMPTY_BREAKDOWN_JSON = JSON.stringify({});
const MISSION_PROGRESS_KEY = 'mission_progresses_v1';

async function getJSON<T>(profileId: string, key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(prefixKey(key, profileId));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function setJSON(profileId: string, key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(prefixKey(key, profileId), JSON.stringify(value));
  } catch {}
}

async function removeKey(profileId: string, key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(prefixKey(key, profileId));
  } catch {}
}

async function getString(profileId: string, key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(prefixKey(key, profileId));
  } catch {
    return null;
  }
}

// ─── Storage-only daily reset for an inactive profile ───────────────────────

async function runDailyResetIfNeededFor(profileId: string, today: Date): Promise<boolean> {
  const todayKey = getDateKey(today);
  const lastActive = await getString(profileId, 'last_active_date');

  // Already up-to-date for today — nothing to do. (Includes brand-new
  // profiles that have never logged anything; we'll seed last_active_date
  // below on first encounter.)
  if (lastActive === todayKey) return false;

  // First-touch case: profile has never been opened, no prior day to snapshot.
  if (!lastActive) {
    await AsyncStorage.setItem(prefixKey('last_active_date', profileId), todayKey);
    return false;
  }

  // last_active_date is the day this profile last saw — usually yesterday,
  // sometimes earlier if the user has been off this profile for a stretch.
  // Validate the format before snapshotting; bail without touching storage
  // if it's corrupted.
  const parts = lastActive.split('_');
  if (parts.length !== 4 || parts[0] !== 'water') {
    await AsyncStorage.setItem(prefixKey('last_active_date', profileId), todayKey);
    return false;
  }
  const yesterdayKey = lastActive; // the day we're snapshotting

  const [prevIntake, prevGoal, prevBreakdown, prevHistory, prevGoalHist, prevEntries] = await Promise.all([
    getJSON<number>(profileId, yesterdayKey, 0),
    getJSON<number>(profileId, 'water_goal', 64),
    getJSON<Partial<Record<BevCategory, number>>>(profileId, 'water_category_breakdown', {}),
    getJSON<HistEntry[]>(profileId, 'water_history', []),
    getJSON<Record<string, number>>(profileId, 'goal_history', {}),
    getJSON<{ oz: number; timestamp: number }[]>(profileId, 'water_log_entries', []),
  ]);

  const prevPct = prevGoal > 0 ? Math.min(prevIntake / prevGoal, 1) : 0;

  const hourBuckets: Record<number, number> = {};
  for (const e of prevEntries) {
    const h = new Date(e.timestamp).getHours();
    hourBuckets[h] = (hourBuckets[h] ?? 0) + (e.oz ?? 0);
  }

  const yesterdayEntry: HistEntry = {
    date: yesterdayKey,
    oz: prevIntake,
    goal: prevGoal,
    breakdown: prevBreakdown,
    hourBuckets,
  };
  const updatedHistory = [yesterdayEntry, ...prevHistory.filter((h) => h.date !== yesterdayKey)].slice(0, 30);

  const updatedGoalHistFull = { ...prevGoalHist, [yesterdayKey]: prevPct };
  const updatedGoalHist = Object.fromEntries(
    Object.entries(updatedGoalHistFull)
      .sort(([a], [b]) => {
        const [, ay, am, ad] = a.split('_').map(Number);
        const [, by, bm, bd] = b.split('_').map(Number);
        return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
      })
      .slice(-30),
  );

  // Reset lock — if the app dies mid-write, next foreground retries.
  await AsyncStorage.setItem(prefixKey('reset_in_progress', profileId), yesterdayKey);

  try {
    await Promise.all([
      setJSON(profileId, 'water_history', updatedHistory),
      setJSON(profileId, 'goal_history', updatedGoalHist),
      setJSON(profileId, 'water_total_hydration', 0),
      AsyncStorage.setItem(prefixKey('water_category_breakdown', profileId), EMPTY_BREAKDOWN_JSON),
      setJSON(profileId, 'water_last_entry', null),
      removeKey(profileId, `goal_celebrated_${yesterdayKey}`),
      AsyncStorage.setItem(prefixKey('last_active_date', profileId), todayKey),
      setJSON(profileId, todayKey, 0),
      removeKey(profileId, 'water_log_entries'),
    ]);
  } catch {
    return false; // keep the lock, retry next foreground
  }

  await removeKey(profileId, 'reset_in_progress');
  return true;
}

// ─── Mission engine catch-up for an inactive profile ────────────────────────

async function runEngineCatchUpFor(profileId: string, today: Date): Promise<void> {
  const [progressMap, goalHist, historyRaw] = await Promise.all([
    getJSON<ProgressMap>(profileId, MISSION_PROGRESS_KEY, {}),
    getJSON<Record<string, number>>(profileId, 'goal_history', {}),
    getJSON<HistEntry[]>(profileId, 'water_history', []),
  ]);

  const historyByDate = new Map(historyRaw.map((h) => [h.date, h]));
  const lookupDay = (dateKey: string): DayData => {
    const h = historyByDate.get(dateKey);
    return {
      date: dateKey,
      goalHit: (goalHist[dateKey] ?? 0) >= 1.0,
      breakdown: h?.breakdown ?? {},
      hourBuckets: h?.hourBuckets,
    };
  };

  let changed = false;
  for (const [id, progress] of Object.entries(progressMap)) {
    if (progress.status !== 'active') continue;
    const mission = getMission(progress.missionId);
    if (!mission) continue;
    const after = catchUp(mission, progress, today, lookupDay);
    if (
      after.daysCompleted !== progress.daysCompleted
      || after.status !== progress.status
      || after.shieldsRemaining !== progress.shieldsRemaining
    ) {
      progressMap[id] = after;
      changed = true;
    }
  }

  if (changed) await setJSON(profileId, MISSION_PROGRESS_KEY, progressMap);
  // applyDay reference kept for potential single-day callsites; lint silence.
  void applyDay;
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

export async function evaluateInactiveProfiles(
  activeProfileId: string | null,
  today: Date = new Date(),
): Promise<void> {
  let profiles: Profile[] = [];
  try {
    profiles = await loadProfiles();
  } catch {
    return;
  }
  for (const p of profiles) {
    if (p.id === activeProfileId) continue;
    try {
      await runDailyResetIfNeededFor(p.id, today);
      await runEngineCatchUpFor(p.id, today);
    } catch {
      // Per-profile failures must never block other profiles.
    }
  }
}
