/**
 * Achievement badge system for Liquid Luck.
 * Self-contained — only reads/writes AsyncStorage keys:
 *   "unlocked_badges"  — persisted unlock records
 * All other data arrives via props. Badge checks are purely functional
 * and wrapped in try/catch so no badge failure can crash the app.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

const { width: SW, height: SH } = Dimensions.get("window");
const GOLD = "#FFD700";
const BADGE_SIZE = 70;

// ─── Types ────────────────────────────────────────────────────────────────────
type BevCategory = "water" | "soda" | "coffee" | "juice" | "sports" | "beer" | "cocktail";

interface BadgeCheckData {
  streak: number;
  goalHistory: Record<string, number>;
  totalHydration: number;
  intake: number;
  goal: number;
  categoryBreakdown: Record<BevCategory, number>;
  lifetimeHydrationOz: number;
  lifetimeJackpots: number;
  lifetimeCoffeeLogs: number;
  lifetimeBeerLogs: number;
  firstDrinkTime: string | null;
  nowHour: number;
}

interface BadgeDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  color: string;
  check: (d: BadgeCheckData) => boolean;
  progress?: (d: BadgeCheckData) => { current: number; total: number };
}

interface UnlockedBadge {
  id: string;
  unlockedAt: string;
}

export interface AchievementsProps {
  trigger: number;
  streak: number;
  goalHistory: Record<string, number>;
  totalHydration: number;
  intake: number;
  goal: number;
  categoryBreakdown: Record<BevCategory, number>;
  lifetimeHydrationOz: number;
  lifetimeJackpots: number;
  lifetimeCoffeeLogs: number;
  lifetimeBeerLogs: number;
  firstDrinkTime: string | null;
  onBadgeUnlocked?: () => void;
}

// ─── Badge definitions ────────────────────────────────────────────────────────
const ALL_BADGES: BadgeDef[] = [
  // Streak
  {
    id: "first_drop", name: "First Drop", emoji: "💧",
    description: "Log your first drink ever", color: "#1565C0",
    check: (d) => d.lifetimeHydrationOz > 0,
  },
  {
    id: "streak_3", name: "3 Day Streak", emoji: "🔥",
    description: "Hit your goal 3 days in a row", color: "#E64A19",
    check: (d) => d.streak >= 3,
    progress: (d) => ({ current: Math.min(d.streak, 3), total: 3 }),
  },
  {
    id: "streak_7", name: "7 Day Streak", emoji: "🔥",
    description: "Hit your goal 7 days in a row", color: "#BF360C",
    check: (d) => d.streak >= 7,
    progress: (d) => ({ current: Math.min(d.streak, 7), total: 7 }),
  },
  {
    id: "streak_14", name: "14 Day Streak", emoji: "🔥🔥",
    description: "Hit your goal 14 days in a row", color: "#880E4F",
    check: (d) => d.streak >= 14,
    progress: (d) => ({ current: Math.min(d.streak, 14), total: 14 }),
  },
  {
    id: "streak_30", name: "30 Day Streak", emoji: "👑",
    description: "Hit your goal 30 days in a row", color: "#4A148C",
    check: (d) => d.streak >= 30,
    progress: (d) => ({ current: Math.min(d.streak, 30), total: 30 }),
  },
  // Jackpot
  {
    id: "first_jackpot", name: "First Jackpot", emoji: "🎰",
    description: "Hit your daily goal for the first time", color: "#F57F17",
    check: (d) => d.lifetimeJackpots >= 1,
  },
  {
    id: "lucky_7", name: "Lucky 7", emoji: "7️⃣",
    description: "Hit your daily goal 7 times total", color: "#1B5E20",
    check: (d) => d.lifetimeJackpots >= 7,
    progress: (d) => ({ current: Math.min(d.lifetimeJackpots, 7), total: 7 }),
  },
  {
    id: "high_roller", name: "High Roller", emoji: "💰",
    description: "Hit your daily goal 25 times total", color: "#E65100",
    check: (d) => d.lifetimeJackpots >= 25,
    progress: (d) => ({ current: Math.min(d.lifetimeJackpots, 25), total: 25 }),
  },
  {
    id: "jackpot_legend", name: "Jackpot Legend", emoji: "🏆",
    description: "Hit your daily goal 100 times total", color: "#B71C1C",
    check: (d) => d.lifetimeJackpots >= 100,
    progress: (d) => ({ current: Math.min(d.lifetimeJackpots, 100), total: 100 }),
  },
  // Intake
  {
    id: "hydration_hero", name: "Hydration Hero", emoji: "💧",
    description: "Log 500 oz of true hydration (all-time total)", color: "#01579B",
    check: (d) => d.lifetimeHydrationOz >= 500,
    progress: (d) => ({ current: Math.round(Math.min(d.lifetimeHydrationOz, 500)), total: 500 }),
  },
  {
    id: "gallon_club", name: "Gallon Club", emoji: "🪣",
    description: "Log a full gallon (128 oz consumed) in a single day", color: "#006064",
    check: (d) => d.intake >= 128,
    progress: (d) => ({ current: Math.round(Math.min(d.intake, 128)), total: 128 }),
  },
  {
    id: "century", name: "Century", emoji: "💯",
    description: "Log 100 oz of true hydration in a single day", color: "#1A237E",
    check: (d) => d.totalHydration >= 100,
    progress: (d) => ({ current: Math.round(Math.min(d.totalHydration, 100)), total: 100 }),
  },
  {
    id: "overachiever", name: "Overachiever", emoji: "🚀",
    description: "Hit 150% of your daily goal in one day", color: "#311B92",
    check: (d) => d.goal > 0 && d.totalHydration >= d.goal * 1.5,
    progress: (d) => ({
      current: Math.round(Math.min((d.totalHydration / Math.max(d.goal, 1)) * 100, 150)),
      total: 150,
    }),
  },
  // Beverage
  {
    id: "pure_water", name: "Pure Water", emoji: "💧",
    description: "Log only water for an entire day (at least 1 drink)", color: "#0277BD",
    check: (d) => {
      const cats = Object.keys(d.categoryBreakdown) as BevCategory[];
      const nonWater = cats.filter((k) => k !== "water" && d.categoryBreakdown[k] > 0);
      return d.categoryBreakdown.water > 0 && nonWater.length === 0;
    },
  },
  {
    id: "coffee_lover", name: "Coffee Lover", emoji: "☕",
    description: "Log coffee 10 times total", color: "#4E342E",
    check: (d) => d.lifetimeCoffeeLogs >= 10,
    progress: (d) => ({ current: Math.min(d.lifetimeCoffeeLogs, 10), total: 10 }),
  },
  {
    id: "beer_baron", name: "Beer Baron", emoji: "🍺",
    description: "Log beer 10 times total", color: "#E65100",
    check: (d) => d.lifetimeBeerLogs >= 10,
    progress: (d) => ({ current: Math.min(d.lifetimeBeerLogs, 10), total: 10 }),
  },
  {
    id: "rainbow_drinker", name: "Rainbow Drinker", emoji: "🌈",
    description: "Log all 7 beverage categories in a single day", color: "#6A1B9A",
    check: (d) => {
      const cats: BevCategory[] = ["water","soda","coffee","juice","sports","beer","cocktail"];
      return cats.every((k) => d.categoryBreakdown[k] > 0);
    },
    progress: (d) => {
      const cats: BevCategory[] = ["water","soda","coffee","juice","sports","beer","cocktail"];
      return { current: cats.filter((k) => d.categoryBreakdown[k] > 0).length, total: 7 };
    },
  },
  // Consistency
  {
    id: "early_bird", name: "Early Bird", emoji: "🌅",
    description: "Log your first drink before 8am", color: "#F57F17",
    check: (d) => d.firstDrinkTime !== null && new Date(d.firstDrinkTime).getHours() < 8,
  },
  {
    id: "night_owl", name: "Night Owl", emoji: "🌙",
    description: "Log a drink after 10pm", color: "#1A237E",
    check: (d) => d.nowHour >= 22 && d.intake > 0,
  },
  {
    id: "perfect_week", name: "Perfect Week", emoji: "⭐",
    description: "Hit your goal every day for 7 consecutive days", color: "#F9A825",
    check: (d) => d.streak >= 7,
    progress: (d) => ({ current: Math.min(d.streak, 7), total: 7 }),
  },
];

const TOTAL_BADGES = ALL_BADGES.length; // 20

// ─── Confetti ─────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = [
  "#FFD700","#FF6B6B","#4ECDC4","#45B7D1","#DDA0DD","#FFEAA7","#98D8C8","#F7DC6F",
];
const CONFETTI_COUNT = 28;

interface ConfettiPiece {
  x: Animated.Value;
  y: Animated.Value;
  rot: Animated.Value;
  op: Animated.Value;
  color: string;
  size: number;
  startX: number;
}

function AchConfetti({ visible }: { visible: boolean }) {
  const pieces = useRef<ConfettiPiece[]>(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      rot: new Animated.Value(0),
      op: new Animated.Value(0),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + (i % 4) * 3,
      startX: SW / 2 + (Math.random() - 0.5) * SW * 0.5,
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    pieces.forEach((p, i) => {
      const dx = (Math.random() - 0.5) * SW * 0.85;
      const dy = -(SH * 0.28 + Math.random() * SH * 0.3);
      p.x.setValue(0); p.y.setValue(0); p.rot.setValue(0); p.op.setValue(1);
      Animated.parallel([
        Animated.timing(p.x, { toValue: dx, duration: 1000 + i * 18, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(p.y, { toValue: dy, duration: 600 + i * 12, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(p.y, { toValue: SH * 0.25, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.timing(p.rot, { toValue: 6, duration: 1400 + i * 10, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(900),
          Animated.timing(p.op, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start();
    });
  }, [visible]);

  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {pieces.map((p, i) => {
        const rotate = p.rot.interpolate({ inputRange: [0, 6], outputRange: ["0deg", "1080deg"] });
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: p.startX,
              top: SH * 0.5,
              width: p.size, height: p.size,
              backgroundColor: p.color,
              borderRadius: i % 3 === 0 ? p.size / 2 : 2,
              opacity: p.op,
              transform: [{ translateX: p.x }, { translateY: p.y }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}

// ─── Unlock animation modal ───────────────────────────────────────────────────
function BadgeUnlockModal({
  badge, visible, onDismiss,
}: {
  badge: BadgeDef | null;
  visible: boolean;
  onDismiss: () => void;
}) {
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const burstAnim   = useRef(new Animated.Value(0)).current;
  const scaleAnim   = useRef(new Animated.Value(0)).current;
  const spinAnim    = useRef(new Animated.Value(0)).current;
  const textAnim    = useRef(new Animated.Value(0)).current;
  const [showDismiss, setShowDismiss] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible && badge) {
      setShowDismiss(false);
      backdropAnim.setValue(0); burstAnim.setValue(0);
      scaleAnim.setValue(0); spinAnim.setValue(0); textAnim.setValue(0);

      Animated.sequence([
        Animated.parallel([
          Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(burstAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
          Animated.timing(spinAnim, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.timing(textAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();

      dismissTimer.current = setTimeout(() => setShowDismiss(true), 2000);
    }
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); };
  }, [visible, badge?.id]);

  const rotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["720deg", "0deg"] });

  if (!badge) return null;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, {
          backgroundColor: "#000010",
          opacity: backdropAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.92] }),
        }]}
        pointerEvents="none"
      />
      {/* Gold radial burst */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute", alignSelf: "center", top: SH * 0.28 - 150,
          width: 300, height: 300, borderRadius: 150,
          backgroundColor: GOLD,
          opacity: burstAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.35, 0.08] }),
          transform: [{ scale: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.1, 3.5] }) }],
        }}
      />
      {/* Confetti */}
      <AchConfetti visible={visible} />
      {/* Content */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Animated.Text style={[ulStyles.headline, { opacity: textAnim }]}>
          ACHIEVEMENT UNLOCKED!
        </Animated.Text>
        {/* Badge */}
        <Animated.View style={[
          ulStyles.badgeCircle,
          { backgroundColor: badge.color, transform: [{ scale: scaleAnim }, { rotate }] },
        ]}>
          <Text style={ulStyles.badgeEmoji}>{badge.emoji}</Text>
        </Animated.View>
        <Animated.Text style={[ulStyles.badgeName, { opacity: textAnim }]}>{badge.name}</Animated.Text>
        <Animated.Text style={[ulStyles.badgeDesc, { opacity: textAnim }]}>{badge.description}</Animated.Text>
        {showDismiss && (
          <TouchableOpacity style={ulStyles.dismissBtn} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={ulStyles.dismissText}>AWESOME!</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const ulStyles = StyleSheet.create({
  headline: {
    fontSize: 20, fontWeight: "900", color: GOLD, letterSpacing: 3, textAlign: "center",
    textShadowColor: GOLD, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14,
    marginBottom: 28,
  },
  badgeCircle: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 4, borderColor: GOLD,
    alignItems: "center", justifyContent: "center",
    shadowColor: GOLD, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 24,
    elevation: 16, marginBottom: 20,
  },
  badgeEmoji: { fontSize: 46 },
  badgeName: { fontSize: 22, fontWeight: "800", color: "#ffffff", marginBottom: 8, textAlign: "center" },
  badgeDesc: {
    fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center",
    paddingHorizontal: 40, lineHeight: 21, marginBottom: 12,
  },
  dismissBtn: {
    marginTop: 24, backgroundColor: GOLD, borderRadius: 28,
    paddingVertical: 15, paddingHorizontal: 44,
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12,
    elevation: 8,
  },
  dismissText: { fontSize: 15, fontWeight: "900", color: "#0a0520", letterSpacing: 3 },
});

// ─── Badge detail modal ───────────────────────────────────────────────────────
function BadgeDetailModal({
  badge, unlockedAt, progressData, visible, onClose,
}: {
  badge: BadgeDef | null;
  unlockedAt: string | null;
  progressData: { current: number; total: number } | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!badge) return null;
  const isUnlocked = unlockedAt !== null;
  const dateStr = unlockedAt ? (() => {
    const d = new Date(unlockedAt);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  })() : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={dtStyles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={dtStyles.box}>
              {/* Close */}
              <TouchableOpacity style={dtStyles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={dtStyles.closeText}>✕</Text>
              </TouchableOpacity>
              {/* Badge circle */}
              <View style={[
                dtStyles.circle,
                isUnlocked
                  ? { backgroundColor: badge.color, borderColor: GOLD }
                  : dtStyles.circleLocked,
              ]}>
                <Text style={[dtStyles.emoji, !isUnlocked && dtStyles.emojiLocked]}>{badge.emoji}</Text>
                {!isUnlocked && <Text style={dtStyles.lockOverlay}>🔒</Text>}
              </View>
              <Text style={[dtStyles.name, !isUnlocked && dtStyles.nameLocked]}>{badge.name}</Text>
              {isUnlocked ? (
                <>
                  <Text style={dtStyles.desc}>{badge.description}</Text>
                  <View style={dtStyles.dateRow}>
                    <Text style={dtStyles.dateLbl}>Unlocked </Text>
                    <Text style={dtStyles.dateVal}>{dateStr}</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={dtStyles.howTo}>How to unlock:</Text>
                  <Text style={dtStyles.desc}>{badge.description}</Text>
                  {progressData && (
                    <View style={dtStyles.progressWrap}>
                      <View style={dtStyles.progressTrack}>
                        <View style={[dtStyles.progressFill, {
                          width: `${Math.round((progressData.current / progressData.total) * 100)}%` as unknown as number,
                        }]} />
                      </View>
                      <Text style={dtStyles.progressLbl}>
                        {progressData.current} / {progressData.total}
                      </Text>
                    </View>
                  )}
                </>
              )}
              <TouchableOpacity style={dtStyles.doneBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={dtStyles.doneTxt}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const dtStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center", justifyContent: "center",
  },
  box: {
    width: SW * 0.82, backgroundColor: "#12063A",
    borderRadius: 20, borderWidth: 1.5, borderColor: "rgba(255,215,0,0.5)",
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28,
    alignItems: "center",
  },
  closeBtn: {
    position: "absolute", top: 12, right: 14,
    paddingVertical: 8, paddingHorizontal: 10, minWidth: 44, minHeight: 44,
    alignItems: "center", justifyContent: "center",
  },
  closeText: { fontSize: 16, color: "rgba(255,255,255,0.5)", fontWeight: "700" },
  circle: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3,
    marginTop: 8, marginBottom: 14,
    shadowColor: GOLD, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 10,
    elevation: 8,
  },
  circleLocked: {
    backgroundColor: "#2a2a2a", borderColor: "rgba(255,255,255,0.2)",
    shadowOpacity: 0, elevation: 0,
  },
  emoji: { fontSize: 36 },
  emojiLocked: { opacity: 0.3 },
  lockOverlay: { position: "absolute", bottom: 4, right: 4, fontSize: 16 },
  name: { fontSize: 18, fontWeight: "800", color: GOLD, marginBottom: 10, textAlign: "center" },
  nameLocked: { color: "rgba(255,255,255,0.45)" },
  howTo: { fontSize: 11, fontWeight: "800", color: GOLD, letterSpacing: 1, marginBottom: 6 },
  desc: { fontSize: 13, color: "rgba(255,255,255,0.72)", textAlign: "center", lineHeight: 20, marginBottom: 14 },
  dateRow: { flexDirection: "row", marginBottom: 14 },
  dateLbl: { fontSize: 12, color: "rgba(255,255,255,0.45)" },
  dateVal: { fontSize: 12, color: GOLD, fontWeight: "700" },
  progressWrap: { width: "100%", marginBottom: 14, alignItems: "center", gap: 6 },
  progressTrack: {
    width: "85%", height: 8, borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: GOLD },
  progressLbl: { fontSize: 11, color: "rgba(255,255,255,0.5)" },
  doneBtn: {
    backgroundColor: "rgba(255,215,0,0.12)", borderWidth: 1, borderColor: "rgba(255,215,0,0.4)",
    borderRadius: 20, paddingVertical: 10, paddingHorizontal: 32, marginTop: 4,
  },
  doneTxt: { fontSize: 13, fontWeight: "700", color: GOLD },
});

// ─── Single badge cell ────────────────────────────────────────────────────────
function BadgeItem({
  badge, unlocked, onPress,
}: {
  badge: BadgeDef;
  unlocked: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={bdgStyles.cell}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[
        bdgStyles.circle,
        unlocked
          ? { backgroundColor: badge.color, borderColor: GOLD, shadowColor: GOLD, shadowOpacity: 0.65 }
          : bdgStyles.circleOff,
      ]}>
        <Text style={[bdgStyles.emoji, !unlocked && bdgStyles.emojiOff]}>{badge.emoji}</Text>
        {!unlocked && <Text style={bdgStyles.lock}>🔒</Text>}
      </View>
      <Text
        style={[bdgStyles.name, !unlocked && bdgStyles.nameOff]}
        numberOfLines={2}
        adjustsFontSizeToFit
      >
        {badge.name}
      </Text>
    </TouchableOpacity>
  );
}

const bdgStyles = StyleSheet.create({
  cell: {
    width: "25%",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  circle: {
    width: BADGE_SIZE, height: BADGE_SIZE, borderRadius: BADGE_SIZE / 2,
    borderWidth: 2.5,
    alignItems: "center", justifyContent: "center",
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 8,
    elevation: 6, marginBottom: 6,
  },
  circleOff: {
    backgroundColor: "#1e1e2e", borderColor: "rgba(255,255,255,0.15)",
    shadowOpacity: 0, elevation: 0,
  },
  emoji: { fontSize: 28 },
  emojiOff: { opacity: 0.25 },
  lock: { position: "absolute", bottom: 2, right: 2, fontSize: 13 },
  name: {
    fontSize: 9, fontWeight: "700", color: GOLD,
    textAlign: "center", lineHeight: 13,
  },
  nameOff: { color: "rgba(255,255,255,0.3)" },
});

// ─── Main Achievements component ──────────────────────────────────────────────
export default function Achievements({
  trigger,
  streak,
  goalHistory,
  totalHydration,
  intake,
  goal,
  categoryBreakdown,
  lifetimeHydrationOz,
  lifetimeJackpots,
  lifetimeCoffeeLogs,
  lifetimeBeerLogs,
  firstDrinkTime,
  onBadgeUnlocked,
}: AchievementsProps) {
  const [unlockedBadges, setUnlockedBadges] = useState<UnlockedBadge[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Keep a ref in sync so the check effect always sees the latest unlocked set
  const unlockedRef = useRef<UnlockedBadge[]>([]);

  // Badge detail modal
  const [selectedBadge, setSelectedBadge] = useState<BadgeDef | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Unlock animation queue
  const unlockQueueRef = useRef<BadgeDef[]>([]);
  const [currentUnlock, setCurrentUnlock] = useState<BadgeDef | null>(null);
  const isShowingRef = useRef(false);

  useEffect(() => {
    unlockedRef.current = unlockedBadges;
  }, [unlockedBadges]);

  // Load saved badges on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("unlocked_badges");
        if (saved) {
          const parsed: UnlockedBadge[] = JSON.parse(saved);
          setUnlockedBadges(parsed);
          unlockedRef.current = parsed;
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const showNextUnlock = useCallback(() => {
    if (unlockQueueRef.current.length === 0) {
      isShowingRef.current = false;
      setCurrentUnlock(null);
      return;
    }
    isShowingRef.current = true;
    const next = unlockQueueRef.current[0];
    unlockQueueRef.current = unlockQueueRef.current.slice(1);
    setCurrentUnlock(next);
  }, []);

  // Run badge check whenever trigger changes (after data is loaded)
  useEffect(() => {
    if (!loaded) return;
    try {
      const checkData: BadgeCheckData = {
        streak, goalHistory, totalHydration, intake, goal,
        categoryBreakdown, lifetimeHydrationOz, lifetimeJackpots,
        lifetimeCoffeeLogs, lifetimeBeerLogs, firstDrinkTime,
        nowHour: new Date().getHours(),
      };
      const currentIds = new Set(unlockedRef.current.map((b) => b.id));
      const newlyUnlocked: BadgeDef[] = [];

      for (const badge of ALL_BADGES) {
        if (currentIds.has(badge.id)) continue;
        try {
          if (badge.check(checkData)) newlyUnlocked.push(badge);
        } catch {}
      }

      if (newlyUnlocked.length === 0) return;

      const now = new Date().toISOString();
      const additions = newlyUnlocked.map((b) => ({ id: b.id, unlockedAt: now }));
      const updated = [...unlockedRef.current, ...additions];
      unlockedRef.current = updated;
      setUnlockedBadges(updated);
      // Save with one retry on failure to prevent badge loss on crash
      (async () => {
        try {
          await AsyncStorage.setItem("unlocked_badges", JSON.stringify(updated));
        } catch {
          try {
            await AsyncStorage.setItem("unlocked_badges", JSON.stringify(updated));
          } catch {}
        }
      })();

      // Queue unlock animations and fire sound callback
      unlockQueueRef.current = [...unlockQueueRef.current, ...newlyUnlocked];
      onBadgeUnlocked?.();
      if (!isShowingRef.current) showNextUnlock();
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, loaded]);

  function handleBadgePress(badge: BadgeDef) {
    setSelectedBadge(badge);
    setShowDetail(true);
  }

  function handleUnlockDismiss() {
    setCurrentUnlock(null);
    isShowingRef.current = false;
    setTimeout(showNextUnlock, 350);
  }

  const unlockedMap = new Map(unlockedBadges.map((b) => [b.id, b.unlockedAt]));
  const unlockedCount = unlockedBadges.length;
  const progressPct = TOTAL_BADGES > 0 ? unlockedCount / TOTAL_BADGES : 0;

  const selectedUnlockedAt = selectedBadge ? (unlockedMap.get(selectedBadge.id) ?? null) : null;
  const selectedProgress = selectedBadge?.progress
    ? (() => {
        try {
          return selectedBadge.progress!({
            streak, goalHistory, totalHydration, intake, goal,
            categoryBreakdown, lifetimeHydrationOz, lifetimeJackpots,
            lifetimeCoffeeLogs, lifetimeBeerLogs, firstDrinkTime,
            nowHour: new Date().getHours(),
          });
        } catch { return null; }
      })()
    : null;

  return (
    <View style={achStyles.wrapper}>
      {/* Section header */}
      <Text style={achStyles.sectionTitle}>ACHIEVEMENTS</Text>

      {/* Progress counter + bar */}
      <View style={achStyles.progressHeader}>
        <Text style={achStyles.progressCount}>
          {unlockedCount} of {TOTAL_BADGES} badges unlocked
        </Text>
        <View style={achStyles.progressTrack}>
          <Animated.View style={[achStyles.progressFill, { width: `${Math.round(progressPct * 100)}%` as unknown as number }]} />
        </View>
      </View>

      {/* Badge grid */}
      <View style={achStyles.grid}>
        {ALL_BADGES.map((badge) => (
          <BadgeItem
            key={badge.id}
            badge={badge}
            unlocked={unlockedMap.has(badge.id)}
            onPress={() => handleBadgePress(badge)}
          />
        ))}
      </View>

      {/* Badge detail modal */}
      <BadgeDetailModal
        badge={selectedBadge}
        unlockedAt={selectedUnlockedAt}
        progressData={selectedUnlockedAt ? null : selectedProgress}
        visible={showDetail}
        onClose={() => setShowDetail(false)}
      />

      {/* Unlock animation */}
      <BadgeUnlockModal
        badge={currentUnlock}
        visible={currentUnlock !== null}
        onDismiss={handleUnlockDismiss}
      />
    </View>
  );
}

const achStyles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 12, marginTop: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 14, borderWidth: 1,
    borderColor: "rgba(255,215,0,0.25)",
    paddingHorizontal: 12, paddingTop: 14, paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 10, fontWeight: "800", color: GOLD,
    letterSpacing: 1, marginBottom: 10, textAlign: "center",
  },
  progressHeader: { alignItems: "center", marginBottom: 16, gap: 8 },
  progressCount: { fontSize: 12, color: GOLD, fontWeight: "700" },
  progressTrack: {
    width: "80%", height: 6, borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: GOLD },
  grid: { flexDirection: "row", flexWrap: "wrap" },
});
