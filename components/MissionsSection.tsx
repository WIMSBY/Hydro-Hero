/**
 * components/MissionsSection.tsx
 *
 * Day 4 of the Missions feature, revised to group by chain. The Missions
 * page shows one section per chain with its full Bronze → Silver → Gold
 * progression. Cards self-render their state (active progress bar, locked
 * indicator, completed checkmark). Tapping any unlocked card opens the
 * MissionDetailModal.
 *
 * Filtering: Dry Spell hidden when the alcohol toggle is off AND the user
 * has zero progress in that chain. Once they start Dry Spell Bronze, the
 * whole chain stays visible regardless of the toggle.
 */

import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  Mission,
  MISSIONS,
  MISSION_CHAINS,
  MissionProgress,
  getMission,
} from "../constants/missions";
import {
  abandonMission,
  saveProgresses,
  startMission,
  type ProgressMap,
} from "../utils/MissionEngine";
import { MissionDetailModal } from "./MissionDetailModal";

const GOLD = "#FFD700";

type Props = {
  progresses: ProgressMap;
  onProgressesChange: (next: ProgressMap) => void;
  showAlcoholicDrinks: boolean;
};

type TierState = {
  mission: Mission;
  progress: MissionProgress | undefined;
  locked: boolean;
};

export function MissionsSection({ progresses, onProgressesChange, showAlcoholicDrinks }: Props) {
  const [openMissionId, setOpenMissionId] = useState<string | null>(null);

  const visibleChains = MISSION_CHAINS.filter((chain) => {
    if (showAlcoholicDrinks) return true;
    if (chain.id !== "dry-spell") return true;
    return chain.tierIds.some((id) => !!progresses[id]);
  });

  const chainGroups = visibleChains.map((chain) => {
    const tierStates: TierState[] = chain.tierIds.map((id, idx) => {
      const mission = MISSIONS.find((m) => m.id === id)!;
      const progress = progresses[id];
      const prevTierId = idx > 0 ? chain.tierIds[idx - 1] : null;
      const prevProgress = prevTierId ? progresses[prevTierId] : null;
      // Locked when an earlier tier hasn't been completed yet AND this tier
      // hasn't been started. Once any progress exists (even failed/abandoned),
      // we let the user view the detail sheet to retry.
      const locked = idx > 0
        && prevProgress?.status !== "completed"
        && !progress;
      return { mission, progress, locked };
    });
    return { chain, tierStates };
  });

  const handleStart = async (id: string) => {
    const next: ProgressMap = { ...progresses, [id]: startMission(id) };
    onProgressesChange(next);
    await saveProgresses(next);
    setOpenMissionId(null);
  };

  const handleAbandon = async (id: string) => {
    const existing = progresses[id];
    if (!existing) return;
    const next: ProgressMap = { ...progresses, [id]: abandonMission(existing) };
    onProgressesChange(next);
    await saveProgresses(next);
    setOpenMissionId(null);
  };

  const openMission = openMissionId ? getMission(openMissionId) ?? null : null;
  const openProgress = openMissionId ? progresses[openMissionId] ?? null : null;

  return (
    <View>
      {chainGroups.map(({ chain, tierStates }) => (
        <View key={chain.id} style={styles.chainGroup}>
          <Text style={styles.chainHeader}>{chain.name.toUpperCase()}</Text>
          <Text style={styles.chainTagline}>{chain.tagline}</Text>
          {tierStates.map(({ mission, progress, locked }) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              progress={progress}
              locked={locked}
              onPress={() => {
                if (locked) return;
                setOpenMissionId(mission.id);
              }}
            />
          ))}
        </View>
      ))}

      <MissionDetailModal
        visible={openMissionId !== null}
        mission={openMission}
        progress={openProgress}
        onClose={() => setOpenMissionId(null)}
        onStart={() => openMissionId && handleStart(openMissionId)}
        onAbandon={() => openMissionId && handleAbandon(openMissionId)}
      />
    </View>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function MissionCard({
  mission,
  progress,
  locked,
  onPress,
}: {
  mission: Mission;
  progress: MissionProgress | undefined;
  locked: boolean;
  onPress: () => void;
}) {
  const isActive    = progress?.status === "active";
  const isCompleted = progress?.status === "completed";
  const isFailed    = progress?.status === "failed";
  const isAbandoned = progress?.status === "abandoned";

  const pct = progress && isActive
    ? Math.min(progress.daysCompleted / mission.durationDays, 1)
    : 0;

  return (
    <TouchableOpacity
      style={[cardStyles.wrap, locked && cardStyles.wrapLocked]}
      activeOpacity={locked ? 1 : 0.85}
      onPress={onPress}
      disabled={locked}
    >
      <Text style={[cardStyles.emblem, locked && cardStyles.dim]}>{locked ? "🔒" : mission.emblem}</Text>
      <View style={cardStyles.body}>
        <View style={cardStyles.titleRow}>
          <Text style={[cardStyles.name, locked && cardStyles.dim]} numberOfLines={1}>{mission.name}</Text>
          <Text style={cardStyles.tier}>{mission.difficulty.toUpperCase()}</Text>
        </View>
        <Text style={[cardStyles.tagline, locked && cardStyles.dim]} numberOfLines={2}>
          {locked
            ? "Complete the previous tier to unlock."
            : mission.tagline}
        </Text>

        {isActive && progress && (
          <>
            <View style={cardStyles.progressTrack}>
              <View style={[cardStyles.progressFill, { width: `${pct * 100}%` }]} />
            </View>
            <Text style={cardStyles.meta}>
              Day {progress.daysCompleted}/{mission.durationDays}
              {mission.shieldsGranted > 0 && ` · 🛡 ${progress.shieldsRemaining}`}
            </Text>
          </>
        )}
        {!isActive && !isCompleted && !isFailed && !isAbandoned && !locked && (
          <Text style={cardStyles.meta}>
            {mission.durationDays === 1 ? "single-day challenge" : `${mission.durationDays} days`}
            {mission.shieldsGranted > 0 && ` · 🛡 ${mission.shieldsGranted}`}
          </Text>
        )}
        {isCompleted && <Text style={cardStyles.completed}>🏆 Completed · tap to view</Text>}
        {isFailed    && <Text style={cardStyles.failed}>❌ Failed · tap to restart</Text>}
        {isAbandoned && <Text style={cardStyles.failed}>↩ Abandoned · tap to restart</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chainGroup: { marginBottom: 22 },
  chainHeader: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginBottom: 2,
    marginLeft: 4,
  },
  chainTagline: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontStyle: "italic",
    marginBottom: 10,
    marginLeft: 4,
  },
});

const cardStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.18)",
  },
  wrapLocked: {
    backgroundColor: "rgba(255,255,255,0.015)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  emblem: { fontSize: 32, marginRight: 12, alignSelf: "center" },
  dim: { opacity: 0.45 },
  body: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { color: "#ffffff", fontSize: 15, fontWeight: "800", flex: 1, marginRight: 8 },
  tier: {
    color: GOLD,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: "rgba(255,215,0,0.12)",
  },
  tagline: { color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 16, marginTop: 2 },
  meta: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 8, fontWeight: "700" },
  progressTrack: {
    height: 5,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 3,
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: GOLD },
  completed: { color: GOLD, fontSize: 12, marginTop: 8, fontWeight: "800" },
  failed:    { color: "#ff9b9b", fontSize: 12, marginTop: 8, fontWeight: "700" },
});
