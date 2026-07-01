/**
 * Rewards — derive unlocked sigils / powers / cosmetics from mission progress.
 *
 * Build 33 Day 5. No new AsyncStorage key: the source of truth is the
 * existing `mission_progresses_v1` ProgressMap. A reward is "unlocked" the
 * moment its parent mission's status flips to "completed".
 *
 * Returned shape is split by RewardKind so SigilCase can render a grid
 * without re-walking the catalog, and the celebration toast can call out
 * which kinds the user just earned ("Sigil + Power unlocked!").
 */

import { MISSIONS, MissionProgress, Reward, RewardKind, getMission } from "../constants/missions";
import { ProgressMap, startMission } from "./MissionEngine";

export type UnlockedRewards = {
  sigils: Reward[];
  powers: Reward[];
  cosmetics: Reward[];
  ids: Set<string>;
};

function emptyUnlocked(): UnlockedRewards {
  return { sigils: [], powers: [], cosmetics: [], ids: new Set() };
}

function bucketFor(kind: RewardKind, acc: UnlockedRewards): Reward[] {
  if (kind === "sigil") return acc.sigils;
  if (kind === "power") return acc.powers;
  return acc.cosmetics;
}

export function getUnlockedRewards(progresses: ProgressMap): UnlockedRewards {
  const acc = emptyUnlocked();
  for (const progress of Object.values(progresses)) {
    if (progress.status !== "completed") continue;
    const mission = getMission(progress.missionId);
    if (!mission) continue;
    for (const reward of mission.rewards) {
      if (acc.ids.has(reward.id)) continue;
      acc.ids.add(reward.id);
      bucketFor(reward.kind, acc).push(reward);
    }
  }
  return acc;
}

export function hasPower(progresses: ProgressMap, powerId: string): boolean {
  for (const progress of Object.values(progresses)) {
    if (progress.status !== "completed") continue;
    const mission = getMission(progress.missionId);
    if (!mission) continue;
    if (mission.rewards.some((r) => r.kind === "power" && r.id === powerId)) {
      return true;
    }
  }
  return false;
}

// ─── Locked-tease catalog ────────────────────────────────────────────────────
//
// SigilCase renders a few "next up" teases when the user has earned nothing
// yet (or has empty buckets) so the surface doesn't look broken.

export type SigilTease = {
  rewardId: string;
  emblem: string;
  name: string;
  hint: string;
};

export function getSigilTeases(progresses: ProgressMap, limit = 3): SigilTease[] {
  const unlocked = getUnlockedRewards(progresses);
  const teases: SigilTease[] = [];
  for (const mission of MISSIONS) {
    for (const reward of mission.rewards) {
      if (reward.kind !== "sigil") continue;
      if (unlocked.ids.has(reward.id)) continue;
      teases.push({
        rewardId: reward.id,
        emblem: mission.emblem,
        name: reward.name,
        hint: `Complete ${mission.name}`,
      });
      if (teases.length >= limit) return teases;
    }
  }
  return teases;
}

// ─── Mission → reward lookup (used by completion toast) ──────────────────────

export function rewardsForMission(missionId: string): Reward[] {
  return getMission(missionId)?.rewards ?? [];
}

export function emblemForMission(missionId: string): string {
  return getMission(missionId)?.emblem ?? "🏅";
}

// ─── Powers in effect ────────────────────────────────────────────────────────
//
// Iron Will (Origin Story reward): +1 shield on every mission started AFTER
// Origin Story is completed. Wraps the engine's startMission so every call
// site gets the boost consistently.
//
// Other powers are scaffold-only for Build 33 and are wired up in later
// builds — see project_build33_day5_handoff.md:
//   - power-double-tap   → long-press quick-add to double last amount (Build 34)
//   - power-sixth-sense  → adaptive reminders Settings toggle (future build)
//   - power-hydro-vision → custom widget skin unlock (Build 35+)
//   - power-time-warp    → freeze-streak pass (deferred)
//   - power-pace-keeper  → hourly nudge customization (deferred)

export function startMissionWithPowers(
  missionId: string,
  progresses: ProgressMap,
  today: Date = new Date(),
): MissionProgress {
  const progress = startMission(missionId, today);
  if (hasPower(progresses, "power-iron-will")) {
    return { ...progress, shieldsRemaining: progress.shieldsRemaining + 1 };
  }
  return progress;
}

// ─── Diff helper for engine eval → toast ─────────────────────────────────────
//
// Compare two ProgressMaps and return the missions whose status flipped to
// "completed" between them. Used by the completion celebration to find what
// just unlocked.

export function newlyCompletedMissions(
  before: ProgressMap,
  after: ProgressMap,
): MissionProgress[] {
  const completed: MissionProgress[] = [];
  for (const [id, next] of Object.entries(after)) {
    if (next.status !== "completed") continue;
    const prev = before[id];
    if (!prev || prev.status !== "completed") {
      completed.push(next);
    }
  }
  return completed;
}
