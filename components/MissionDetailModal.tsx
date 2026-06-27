/**
 * components/MissionDetailModal.tsx
 *
 * Day 4 of the Missions feature. Bottom-sheet detail view that shows
 * everything the user needs to decide whether to start a mission, plus
 * Start/Abandon controls. Used from the Trophy Case page's Active and
 * Discover sections.
 */

import React from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Mission, MissionProgress } from "../constants/missions";

const GOLD = "#FFD700";
const NAVY = "#0a0520";

type Props = {
  visible: boolean;
  mission: Mission | null;
  progress: MissionProgress | null;
  onClose: () => void;
  onStart: () => void;
  onAbandon: () => void;
};

export function MissionDetailModal({ visible, mission, progress, onClose, onStart, onAbandon }: Props) {
  if (!mission) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={styles.dismissArea} onPress={onClose} />
        </View>
      </Modal>
    );
  }

  const isActive    = progress?.status === "active";
  const isCompleted = progress?.status === "completed";
  const isFailed    = progress?.status === "failed";
  const isAbandoned = progress?.status === "abandoned";
  const hasProgress = isActive || isCompleted || isFailed || isAbandoned;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.dismissArea} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.eyebrow}>
              {mission.chain
                ? `${mission.difficulty.toUpperCase()} · ${mission.durationDays} DAYS`
                : `${mission.durationDays} DAYS`}
            </Text>
            <View style={styles.headerRow}>
              <Text style={styles.emblem}>{mission.emblem}</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name}>{mission.name}</Text>
                <Text style={styles.tagline}>{mission.tagline}</Text>
              </View>
            </View>

            <View style={styles.rule}>
              <Text style={styles.ruleLabel}>HOW IT WORKS</Text>
              <Text style={styles.ruleText}>{mission.ruleText}</Text>
              <Text style={styles.shieldHint}>
                Hero Shields: {mission.shieldsGranted} forgiveness {mission.shieldsGranted === 1 ? "miss" : "misses"} included.
                {mission.shieldsGranted === 0 ? " Hardcore — one slip ends the mission." : ""}
              </Text>
            </View>

            {hasProgress && progress && (
              <View style={styles.progressBox}>
                <Text style={styles.ruleLabel}>YOUR PROGRESS</Text>
                <Text style={styles.progressLine}>
                  Day {progress.daysCompleted}/{mission.durationDays}
                  {isActive && ` · 🛡 ${progress.shieldsRemaining} left`}
                </Text>
                <Text style={styles.statusLine}>
                  {isActive && "🟢 Active"}
                  {isCompleted && "🏆 Completed"}
                  {isFailed && "❌ Failed"}
                  {isAbandoned && "↩ Abandoned"}
                </Text>
              </View>
            )}

            {mission.rewards.length > 0 && (
              <View style={styles.rewards}>
                <Text style={styles.ruleLabel}>REWARDS</Text>
                {mission.rewards.map((r) => (
                  <View key={r.id} style={styles.rewardRow}>
                    <Text style={styles.rewardKind}>{r.kind.toUpperCase()}</Text>
                    <Text style={styles.rewardName}>{r.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.actionRow}>
            {!hasProgress && (
              <TouchableOpacity style={styles.startBtn} activeOpacity={0.85} onPress={onStart}>
                <Text style={styles.startText}>Start Mission</Text>
              </TouchableOpacity>
            )}
            {(isFailed || isAbandoned) && (
              <TouchableOpacity style={styles.startBtn} activeOpacity={0.85} onPress={onStart}>
                <Text style={styles.startText}>Restart Mission</Text>
              </TouchableOpacity>
            )}
            {isActive && (
              <TouchableOpacity style={styles.abandonBtn} activeOpacity={0.85} onPress={onAbandon}>
                <Text style={styles.abandonText}>Abandon</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeBtn} activeOpacity={0.7} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  dismissArea: { flex: 1 },
  sheet: {
    maxHeight: "85%",
    backgroundColor: NAVY,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,215,0,0.35)",
  },
  eyebrow: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  emblem: { fontSize: 44 },
  name: { color: "#ffffff", fontSize: 22, fontWeight: "800" },
  tagline: { color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 2, lineHeight: 18 },

  rule: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  ruleLabel: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  ruleText: { color: "#ffffff", fontSize: 14, lineHeight: 20, fontWeight: "600" },
  shieldHint: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 8, lineHeight: 17 },

  progressBox: {
    backgroundColor: "rgba(255,215,0,0.06)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.30)",
  },
  progressLine: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  statusLine: { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 4, fontWeight: "700" },

  rewards: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  rewardRow: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 10 },
  rewardKind: {
    color: GOLD,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
    width: 64,
  },
  rewardName: { color: "#ffffff", fontSize: 13, fontWeight: "600", flex: 1 },

  actionRow: { marginTop: 18, gap: 10 },
  startBtn: { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  startText: { color: NAVY, fontSize: 15, fontWeight: "900", letterSpacing: 0.4 },
  abandonBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,140,140,0.55)",
    backgroundColor: "rgba(255,140,140,0.08)",
  },
  abandonText: { color: "#ff9b9b", fontSize: 14, fontWeight: "800", letterSpacing: 0.4 },
  closeBtn: { alignItems: "center", paddingVertical: 8 },
  closeText: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600" },
});
