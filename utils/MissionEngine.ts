/**
 * MissionEngine — local-first evaluator for the Missions feature.
 *
 * Day 2 deliverable. Walks each active mission's progress forward to
 * yesterday's end, evaluating one day at a time:
 *
 *   1. Rule passed for that day → daysCompleted++
 *   2. Rule failed + shields remaining → consume shield, daysCompleted++
 *   3. Rule failed + no shields → status = "failed"
 *
 * If daysCompleted hits durationDays, status = "completed".
 *
 * Catches up missed days too — if the user closes the app for a week,
 * the next foreground call evaluates all 7 days in one pass. The
 * lastEvaluatedDate on each progress is the high-water mark.
 *
 * Today is intentionally NOT evaluated until midnight rolls over — partial
 * days would falsely fail abstain / dailyMin missions that the user might
 * still satisfy later in the day.
 *
 * Rule support (caffeine cut killed dailyMax):
 *   ✔ dailyGoalMet   — used by Hero's Journey
 *   ✔ abstain        — used by Dry Spell
 *   ✔ dailyMin       — used by Tea Time
 *   ✔ hourlyMinimum  — used by Hourly Hydration (single-day pacing missions)
 *   ⚠ logCount       — pass-through (no per-day log-count history surface yet)
 *   ⚠ multiBevDay    — pass-through (no multi-bev flag in storage yet)
 *   ⚠ weatherBonus   — pass-through (no temperature history)
 *
 * The pass-through cases skip evaluation rather than fail, so future
 * seasonal missions using those rules don't false-fail in the field while
 * we wait on the underlying history surfaces.
 */

import { BevCategory } from "../constants/beverages";
import {
  Mission,
  MissionProgress,
  MissionRule,
  getMission,
} from "../constants/missions";
import { addDays, getDateKey } from "./dateKey";
import { pGetItem, pSetItem } from "./profileStorage";

// ─── Per-day input ───────────────────────────────────────────────────────────

export type DayData = {
  date: string;       // getDateKey result
  goalHit: boolean;   // goalHistory[date] >= 1
  breakdown: Partial<Record<BevCategory, number>>;
  // Per-hour oz totals (key = 0-23). Optional because the engine pre-dates
  // entry snapshots and old water_history records won't have them. Missing
  // entries means the hourlyMinimum rule pass-throughs (treat as success)
  // rather than false-failing missions on historic days that never tracked.
  hourBuckets?: Record<number, number>;
};

// ─── Rule evaluation ─────────────────────────────────────────────────────────

export function evaluateRule(rule: MissionRule, day: DayData): boolean {
  switch (rule.kind) {
    case "dailyGoalMet":
      return day.goalHit;
    case "abstain":
      return rule.beverageIds.every((id) => (day.breakdown[id] ?? 0) === 0);
    case "dailyMin":
      return (day.breakdown[rule.beverageId] ?? 0) >= rule.amountOz;
    case "hourlyMinimum": {
      // Walk the 24 hour buckets and find the longest consecutive run where
      // each hour has at least amountOz logged. Pass if that run ≥ hours.
      // No bucket data (historic days) → pass-through.
      if (!day.hourBuckets) return true;
      let best = 0;
      let run  = 0;
      for (let h = 0; h < 24; h++) {
        if ((day.hourBuckets[h] ?? 0) >= rule.amountOz) {
          run++;
          if (run > best) best = run;
        } else {
          run = 0;
        }
      }
      return best >= rule.hours;
    }
    case "logCount":
    case "multiBevDay":
    case "weatherBonus":
      // Pass-through until history surfaces land — see file header.
      return true;
  }
}

// ─── Progress stepping ───────────────────────────────────────────────────────

export function applyDay(
  mission: Mission,
  progress: MissionProgress,
  day: DayData,
): MissionProgress {
  if (progress.status !== "active") return progress;
  const passed = evaluateRule(mission.rule, day);
  const next: MissionProgress = { ...progress, lastEvaluatedDate: day.date };
  if (passed) {
    next.daysCompleted = progress.daysCompleted + 1;
  } else if (progress.shieldsRemaining > 0) {
    next.shieldsRemaining = progress.shieldsRemaining - 1;
    next.shieldsUsedOn = [...progress.shieldsUsedOn, day.date];
    next.daysCompleted = progress.daysCompleted + 1;
  } else {
    next.status = "failed";
    return next;
  }
  if (next.daysCompleted >= mission.durationDays) {
    next.status = "completed";
  }
  return next;
}

export function catchUp(
  mission: Mission,
  progress: MissionProgress,
  today: Date,
  lookupDay: (key: string) => DayData,
): MissionProgress {
  if (progress.status !== "active") return progress;
  // Evaluate every full day from (lastEvaluatedDate + 1) through yesterday.
  let cur = progress;
  const yesterday = addDays(today, -1);

  // Walk by iterating dates; parsing lastEvaluatedDate lets us advance by
  // calendar day even when months / DST roll over.
  const parts = cur.lastEvaluatedDate.split("_");
  if (parts.length !== 4) return progress;
  const last = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));

  let d = addDays(last, 1);
  while (d.getTime() <= yesterday.getTime()) {
    const key = getDateKey(d);
    cur = applyDay(mission, cur, lookupDay(key));
    if (cur.status !== "active") break;
    d = addDays(d, 1);
  }
  return cur;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export function startMission(missionId: string, today: Date = new Date()): MissionProgress {
  const mission = getMission(missionId);
  if (!mission) throw new Error(`Unknown mission: ${missionId}`);
  // lastEvaluatedDate = yesterday so the next catchUp / midnight tick evaluates
  // today's full data (which becomes available once today rolls over).
  return {
    missionId,
    startedAt: today.toISOString(),
    daysCompleted: 0,
    lastEvaluatedDate: getDateKey(addDays(today, -1)),
    shieldsRemaining: mission.shieldsGranted,
    shieldsUsedOn: [],
    status: "active",
  };
}

export function abandonMission(progress: MissionProgress): MissionProgress {
  return { ...progress, status: "abandoned" };
}

// ─── Persistence ─────────────────────────────────────────────────────────────
//
// One key (`mission_progresses_v1`) holding a Record<missionId, progress>.
// Smaller surface than per-mission keys, single read/write per save.

const STORAGE_KEY = "mission_progresses_v1";

export type ProgressMap = Record<string, MissionProgress>;

export async function loadProgresses(): Promise<ProgressMap> {
  try {
    const raw = await pGetItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveProgresses(map: ProgressMap): Promise<void> {
  try {
    await pSetItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // swallow — engine failures must never crash the main app
  }
}

// ─── High-level: evaluate all active missions ────────────────────────────────

export async function evaluateAllActive(
  today: Date,
  lookupDay: (key: string) => DayData,
): Promise<{ map: ProgressMap; changed: MissionProgress[] }> {
  const map = await loadProgresses();
  const changed: MissionProgress[] = [];
  for (const [id, progress] of Object.entries(map)) {
    if (progress.status !== "active") continue;
    const mission = getMission(progress.missionId);
    if (!mission) continue;
    const before = progress;
    const after = catchUp(mission, progress, today, lookupDay);
    if (
      after.daysCompleted !== before.daysCompleted
      || after.status !== before.status
      || after.shieldsRemaining !== before.shieldsRemaining
    ) {
      map[id] = after;
      changed.push(after);
    }
  }
  if (changed.length > 0) await saveProgresses(map);
  return { map, changed };
}
