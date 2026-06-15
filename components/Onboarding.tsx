import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, {
  ClipPath,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

const { width: SW, height: SH } = Dimensions.get("window");

// ─── Animated water drop for Screen 1 ───────────────────────────────────────
const DROP_PATH =
  "M 100 12 C 68 52 20 92 20 132 C 20 165 57 190 100 190 C 143 190 180 165 180 132 C 180 92 132 52 100 12 Z";

function AnimatedDrop() {
  const fillAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Fill up the drop over 2 seconds, then hold
    Animated.sequence([
      Animated.delay(400),
      Animated.timing(fillAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();

    // Gentle pulse loop
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [fillAnim, pulseAnim]);

  // We must render the Animated rect outside SVG as a regular View overlay
  // because react-native-svg does not support Animated values directly.
  // Instead we use state driven by fillAnim listener.
  const [fillVal, setFillVal] = useState(0);
  useEffect(() => {
    const id = fillAnim.addListener(({ value }) => setFillVal(value));
    return () => fillAnim.removeListener(id);
  }, [fillAnim]);

  const computedH = Math.round(178 * fillVal);
  const computedY = 190 - computedH;

  return (
    <Animated.View style={[dropS.container, { transform: [{ scale: pulseAnim }] }]}>
      <Svg width={160} height={160} viewBox="0 0 200 200">
        <Defs>
          <ClipPath id="obDropClip">
            <Path d={DROP_PATH} />
          </ClipPath>
          <LinearGradient id="obDropGrad" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor="#1565C0" stopOpacity="1" />
            <Stop offset="0.5" stopColor="#42A5F5" stopOpacity="1" />
            <Stop offset="1" stopColor="#90CAF9" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="obDropSheen" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="rgba(255,255,255,0)" stopOpacity="0" />
            <Stop offset="0.4" stopColor="rgba(255,255,255,0.25)" stopOpacity="1" />
            <Stop offset="1" stopColor="rgba(255,255,255,0)" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {/* Drop outline background */}
        <Path d={DROP_PATH} fill="rgba(255,255,255,0.08)" />
        {/* Animated fill */}
        {computedH > 0 && (
          <Rect
            x={0}
            y={computedY}
            width={200}
            height={computedH}
            fill="url(#obDropGrad)"
            clipPath="url(#obDropClip)"
          />
        )}
        {/* Sheen */}
        <Rect
          x={0}
          y={0}
          width={200}
          height={200}
          fill="url(#obDropSheen)"
          clipPath="url(#obDropClip)"
        />
        {/* Outline */}
        <Path d={DROP_PATH} fill="none" stroke="rgba(255,215,0,0.8)" strokeWidth={3} />
      </Svg>
    </Animated.View>
  );
}

const dropS = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", marginBottom: 24 },
});

// ─── Confetti burst ──────────────────────────────────────────────────────────
const CONFETTI_COLORS = [
  "#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE",
];
const CONFETTI_COUNT = 40;

interface ConfettiPiece {
  x: Animated.Value;
  y: Animated.Value;
  rot: Animated.Value;
  op: Animated.Value;
  color: string;
  size: number;
  startX: number;
}

function ConfettiBurst({ visible }: { visible: boolean }) {
  const pieces = useRef<ConfettiPiece[]>(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      rot: new Animated.Value(0),
      op: new Animated.Value(0),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + (i % 4) * 3,
      startX: SW / 2 + (Math.random() - 0.5) * SW * 0.6,
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    pieces.forEach((p, i) => {
      const dx = (Math.random() - 0.5) * SW * 0.9;
      const dy = -(SH * 0.3 + Math.random() * SH * 0.35);
      p.x.setValue(0);
      p.y.setValue(0);
      p.rot.setValue(0);
      p.op.setValue(1);
      Animated.parallel([
        Animated.timing(p.x, {
          toValue: dx,
          duration: 1000 + i * 20,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(p.y, {
            toValue: dy,
            duration: 600 + i * 15,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(p.y, {
            toValue: SH * 0.3,
            duration: 700,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(p.rot, {
          toValue: 6,
          duration: 1400 + i * 10,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(900),
          Animated.timing(p.op, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    });
  }, [visible, pieces]);

  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {pieces.map((p, i) => {
        const rotate = p.rot.interpolate({
          inputRange: [0, 6],
          outputRange: ["0deg", "1080deg"],
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: p.startX,
              top: SH * 0.55,
              width: p.size,
              height: p.size,
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

// ─── Progress dots ────────────────────────────────────────────────────────────
function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={dotS.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[dotS.dot, i === current ? dotS.active : dotS.inactive]}
        />
      ))}
    </View>
  );
}

const dotS = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  active: { backgroundColor: "#FFD700", width: 24 },
  inactive: { backgroundColor: "rgba(255,255,255,0.25)" },
});

// ─── Goal option button ───────────────────────────────────────────────────────
interface GoalOptionProps {
  label: string;
  sublabel: string;
  selected: boolean;
  onPress: () => void;
}

function GoalOption({ label, sublabel, selected, onPress }: GoalOptionProps) {
  return (
    <TouchableOpacity
      style={[goalOptS.btn, selected && goalOptS.selected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[goalOptS.label, selected && goalOptS.labelSel]}>{label}</Text>
      <Text style={[goalOptS.sub, selected && goalOptS.subSel]}>{sublabel}</Text>
      {selected && <View style={goalOptS.checkDot} />}
    </TouchableOpacity>
  );
}

const goalOptS = StyleSheet.create({
  btn: {
    borderWidth: 1.5,
    borderColor: "rgba(255,215,0,0.3)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    flexDirection: "row",
    alignItems: "center",
  },
  selected: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255,215,0,0.12)",
  },
  label: { fontSize: 16, fontWeight: "700", color: "rgba(255,255,255,0.7)", flex: 1 },
  labelSel: { color: "#FFD700" },
  sub: { fontSize: 13, color: "rgba(255,255,255,0.4)" },
  subSel: { color: "rgba(255,215,0,0.75)" },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFD700",
    marginLeft: 10,
  },
});

// ─── How-it-works step ────────────────────────────────────────────────────────
function HowStep({ number, text }: { number: string; text: string }) {
  return (
    <View style={howS.row}>
      <View style={howS.num}>
        <Text style={howS.numText}>{number}</Text>
      </View>
      <Text style={howS.text}>{text}</Text>
    </View>
  );
}

const howS = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", marginBottom: 18 },
  num: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,215,0,0.2)",
    borderWidth: 1.5,
    borderColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    flexShrink: 0,
    marginTop: 1,
  },
  numText: { fontSize: 14, fontWeight: "800", color: "#FFD700" },
  text: { fontSize: 15, color: "rgba(255,255,255,0.85)", flex: 1, lineHeight: 22 },
});

// ─── Main Onboarding component ────────────────────────────────────────────────
interface OnboardingProps {
  onComplete: (goalOz: number) => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [screen, setScreen] = useState(0);
  const [selectedGoal, setSelectedGoal] = useState<number | null>(64);
  const [showConfetti, setShowConfetti] = useState(false);

  // Slide transition
  const slideAnim = useRef(new Animated.Value(0)).current;

  function goToScreen(next: number) {
    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue: -SW,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      slideAnim.setValue(SW);
      setScreen(next);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }

  async function finish() {
    const goal = selectedGoal ?? 64;
    try {
      await AsyncStorage.setItem("water_goal", JSON.stringify(goal));
      await AsyncStorage.setItem("onboarding_complete", "1");
    } catch {}
    onComplete(goal);
  }

  async function skip() {
    try {
      await AsyncStorage.setItem("onboarding_complete", "1");
    } catch {}
    onComplete(selectedGoal ?? 64);
  }

  function handleStartPlaying() {
    setShowConfetti(true);
    setTimeout(finish, 1200);
  }

  return (
    <View style={s.root}>
      <ConfettiBurst visible={showConfetti} />

      {/* Skip button (screens 0 and 1 only) */}
      {screen < 2 && (
        <TouchableOpacity style={s.skipBtn} onPress={skip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      <Animated.View style={[s.page, { transform: [{ translateX: slideAnim }] }]}>
        {screen === 0 && <Screen1 onNext={() => goToScreen(1)} />}
        {screen === 1 && (
          <Screen2
            selectedGoal={selectedGoal}
            onSelect={setSelectedGoal}
            onNext={() => goToScreen(2)}
          />
        )}
        {screen === 2 && <Screen3 onStart={handleStartPlaying} />}
      </Animated.View>

      <ProgressDots total={3} current={screen} />
    </View>
  );
}

// ─── Screen 1: Welcome ────────────────────────────────────────────────────────
function Screen1({ onNext }: { onNext: () => void }) {
  return (
    <View style={screenS.container}>
      <AnimatedDrop />

      <Text style={screenS.title}>HYDRO HERO</Text>
      <Text style={screenS.subtitle}>Your Art Deco Hydration Tracker</Text>

      <Text style={screenS.body}>
        Pour, fill the vault, and hit your goal — one sip at a time.
        Track every drink, build streaks, and get smart reminders to stay hydrated.
      </Text>

      <TouchableOpacity style={screenS.primaryBtn} onPress={onNext} activeOpacity={0.8}>
        <Text style={screenS.primaryBtnText}>LET&apos;S GO</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen 2: Set Your Goal ─────────────────────────────────────────────────
interface Screen2Props {
  selectedGoal: number | null;
  onSelect: (oz: number) => void;
  onNext: () => void;
}

type ActivityLevel = "low" | "moderate" | "high";
type SexInput = "female" | "male" | null;

// Weight (lbs) × 0.5 baseline + activity bump (sweat loss).
// Baseline matches the general/male recommendation; Female nudges down ~10%.
// Rounded to nearest 4 oz and clamped to a safe 40–200 oz range.
function computeGoalOz(weightLbs: number, activity: ActivityLevel, sex: SexInput): number {
  const base = weightLbs * 0.5;
  const activityBump = activity === "low" ? 0 : activity === "moderate" ? 16 : 32;
  const sexAdjust = sex === "female" ? -8 : 0;
  const total = base + activityBump + sexAdjust;
  const clamped = Math.min(Math.max(total, 40), 200);
  return Math.round(clamped / 4) * 4;
}

function Screen2({ selectedGoal, onSelect, onNext }: Screen2Props) {
  const [weightLbs, setWeightLbs] = useState(160);
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [sex, setSex] = useState<SexInput>(null);

  const [showCustomGoal, setShowCustomGoal] = useState(false);
  const [customGoalDraft, setCustomGoalDraft] = useState("");

  const recommended = computeGoalOz(weightLbs, activity, sex);

  // While the user has the recommended preset selected, keep it in sync with
  // the calculator. Presets stay sticky once tapped.
  const prevRecommendedRef = useRef(recommended);
  useEffect(() => {
    if (selectedGoal === prevRecommendedRef.current) {
      onSelect(recommended);
    }
    prevRecommendedRef.current = recommended;
  }, [recommended, selectedGoal, onSelect]);

  function bumpWeight(delta: number) {
    setWeightLbs((w) => Math.min(Math.max(w + delta, 60), 400));
  }

  const isPresetSelected = (oz: number) => selectedGoal === oz;
  const isRecommendedSelected = selectedGoal === recommended;
  const isCustomSelected =
    selectedGoal !== null &&
    selectedGoal !== recommended &&
    selectedGoal !== 64 &&
    selectedGoal !== 128;

  function openCustomGoal() {
    setCustomGoalDraft(isCustomSelected ? String(selectedGoal) : "");
    setShowCustomGoal(true);
  }

  function saveCustomGoal() {
    const parsed = Number(customGoalDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const rounded = Math.round(parsed);
    onSelect(Math.min(Math.max(rounded, 1), 300));
    setShowCustomGoal(false);
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[screenS.container, { paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={screenS.titleSmall}>SET YOUR GOAL</Text>
      <Text style={screenS.subtitleSmall}>How much do you want to drink each day?</Text>

      <View style={s.goalList}>
        <GoalOption
          label="Half Gallon"
          sublabel="64 oz · Minimum recommended"
          selected={isPresetSelected(64)}
          onPress={() => onSelect(64)}
        />
        <GoalOption
          label="One Gallon"
          sublabel="128 oz · High performance"
          selected={isPresetSelected(128)}
          onPress={() => onSelect(128)}
        />
        <GoalOption
          label="Custom"
          sublabel={isCustomSelected ? `${selectedGoal} oz` : "Set your own number"}
          selected={isCustomSelected}
          onPress={openCustomGoal}
        />
      </View>

      <Text style={s.orPickPreset}>or get a personal recommendation</Text>

      {/* Personalize form */}
      <View style={s.personalizeBox}>
        {/* Weight stepper */}
        <View style={s.personRow}>
          <Text style={s.personLabel}>Weight</Text>
          <View style={s.stepperWrap}>
            <TouchableOpacity style={s.stepperBtn} onPress={() => bumpWeight(-5)} activeOpacity={0.7}>
              <Text style={s.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={s.stepperValue}>{weightLbs} lb</Text>
            <TouchableOpacity style={s.stepperBtn} onPress={() => bumpWeight(5)} activeOpacity={0.7}>
              <Text style={s.stepperBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Activity chips */}
        <View style={s.personRow}>
          <Text style={s.personLabel}>Activity</Text>
          <View style={s.chipsRow}>
            {(["low", "moderate", "high"] as ActivityLevel[]).map((lvl) => (
              <TouchableOpacity
                key={lvl}
                style={[s.chip, activity === lvl && s.chipSel]}
                onPress={() => setActivity(lvl)}
                activeOpacity={0.75}
              >
                <Text style={[s.chipText, activity === lvl && s.chipTextSel]}>
                  {lvl === "low" ? "Low" : lvl === "moderate" ? "Moderate" : "High"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sex chips (optional) */}
        <View style={s.personRow}>
          <Text style={s.personLabel}>Sex <Text style={s.personLabelHint}>(optional)</Text></Text>
          <View style={s.chipsRow}>
            {([
              ["female", "Female"],
              ["male", "Male"],
              [null, "Skip"],
            ] as [SexInput, string][]).map(([val, label]) => (
              <TouchableOpacity
                key={label}
                style={[s.chip, sex === val && s.chipSel]}
                onPress={() => setSex(val)}
                activeOpacity={0.75}
              >
                <Text style={[s.chipText, sex === val && s.chipTextSel]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Recommended preset (tap to select) */}
      <TouchableOpacity
        style={[s.recommendBox, isRecommendedSelected && s.recommendBoxSel]}
        onPress={() => onSelect(recommended)}
        activeOpacity={0.85}
      >
        <Text style={s.recommendTag}>✨ RECOMMENDED FOR YOU</Text>
        <Text style={s.recommendValue}>{recommended} oz</Text>
        <Text style={s.recommendSub}>
          {weightLbs} lb · {activity === "low" ? "Low" : activity === "moderate" ? "Moderate" : "High"} activity
          {sex ? ` · ${sex === "male" ? "Male" : "Female"}` : ""}
        </Text>
        {isRecommendedSelected && <View style={s.recommendCheckDot} />}
      </TouchableOpacity>

      <Text style={s.goalSafetyNote}>
        Hydration needs vary. Use goals as a guide, avoid forcing fluids, and follow medical guidance if you have health concerns.
      </Text>

      <TouchableOpacity style={screenS.primaryBtn} onPress={onNext} activeOpacity={0.8}>
        <Text style={screenS.primaryBtnText}>SET MY GOAL</Text>
      </TouchableOpacity>

      <Modal
        visible={showCustomGoal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomGoal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.customGoalBox}>
            <Text style={s.customGoalTitle}>CUSTOM GOAL</Text>
            <Text style={s.customGoalSubtitle}>Enter your daily goal in ounces.</Text>
            <TextInput
              value={customGoalDraft}
              onChangeText={(text) => setCustomGoalDraft(text.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
              maxLength={3}
              style={s.customGoalInput}
              placeholder={String(recommended)}
              placeholderTextColor="rgba(255,255,255,0.25)"
            />
            <View style={s.customGoalActions}>
              <TouchableOpacity style={s.customGoalCancel} onPress={() => setShowCustomGoal(false)} activeOpacity={0.8}>
                <Text style={s.customGoalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.customGoalSave} onPress={saveCustomGoal} activeOpacity={0.8}>
                <Text style={s.customGoalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─── Screen 3: How It Works ───────────────────────────────────────────────────
function Screen3({ onStart }: { onStart: () => void }) {
  return (
    <View style={screenS.container}>
      <Text style={screenS.titleSmall}>HOW IT WORKS</Text>
      <Text style={screenS.subtitleSmall}>Four simple steps to stay hydrated</Text>

      <View style={s.stepList}>
        <HowStep number="1" text="Log a drink — tap a quick-add button and fill the tank" />
        <HowStep number="2" text="Watch the vault fill up as you hit your daily hydration goal" />
        <HowStep number="3" text="Hit your goal and trigger the celebration overlay" />
        <HowStep number="4" text="Build daily streaks and check your history in the calendar" />
      </View>

      <Text style={s.emojiRow}>💧  🥤  ☕  🍊  🏃  🍺  🍹</Text>
      <Text style={s.emojiNote}>Every drink type has a hydration rating — some count more than others!</Text>

      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textAlign: "center", marginBottom: 16, lineHeight: 16, paddingHorizontal: 8 }}>
        💧 We&apos;ll ask permission to send you hydration reminders — you can adjust these any time in Settings.
      </Text>

      <TouchableOpacity style={screenS.primaryBtn} onPress={onStart} activeOpacity={0.8}>
        <Text style={screenS.primaryBtnText}>START PLAYING</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0520",
    justifyContent: "flex-end",
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  page: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "center",
  },
  skipBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 32,
    right: 24,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: {
    fontSize: 15,
    color: "rgba(255,255,255,0.45)",
    fontWeight: "600",
  },
  goalList: { width: "100%", marginBottom: 24 },
  personalizeBox: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.25)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    marginBottom: 16,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  personLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "700",
  },
  personLabelHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontWeight: "500",
  },
  stepperWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,215,0,0.08)",
  },
  stepperBtnText: {
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 22,
  },
  stepperValue: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    minWidth: 70,
    textAlign: "center",
  },
  chipsRow: { flexDirection: "row", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipSel: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255,215,0,0.18)",
  },
  chipText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextSel: { color: "#FFD700" },
  recommendBox: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,215,0,0.5)",
    backgroundColor: "rgba(255,215,0,0.08)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: "center",
  },
  recommendBoxSel: {
    borderWidth: 2,
    borderColor: "#FFD700",
    backgroundColor: "rgba(255,215,0,0.18)",
  },
  recommendTag: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFD700",
    letterSpacing: 2,
    marginBottom: 4,
  },
  recommendValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#ffffff",
    marginBottom: 2,
  },
  recommendSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
  },
  recommendCheckDot: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFD700",
  },
  orPickPreset: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 10,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,10,0.78)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  customGoalBox: {
    width: "100%",
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#FFD700",
    backgroundColor: "#0a0520",
    padding: 24,
    alignItems: "center",
  },
  customGoalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFD700",
    letterSpacing: 3,
    marginBottom: 8,
  },
  customGoalSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 18,
  },
  customGoalInput: {
    width: 120,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,215,0,0.65)",
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
    paddingVertical: 10,
    marginBottom: 22,
  },
  customGoalActions: {
    flexDirection: "row",
    gap: 12,
  },
  customGoalCancel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  customGoalCancelText: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "800",
  },
  customGoalSave: {
    borderRadius: 18,
    backgroundColor: "#FFD700",
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  customGoalSaveText: {
    color: "#0a0520",
    fontWeight: "900",
  },
  goalSafetyNote: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  stepList: { width: "100%", marginBottom: 16 },
  emojiRow: {
    fontSize: 24,
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: 4,
  },
  emojiNote: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 18,
  },
});

const screenS = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 60 : 40,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: "#FFD700",
    letterSpacing: 6,
    textAlign: "center",
    textShadowColor: "rgba(255,215,0,0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
    marginBottom: 6,
  },
  titleSmall: {
    fontSize: 26,
    fontWeight: "900",
    color: "#FFD700",
    letterSpacing: 4,
    textAlign: "center",
    textShadowColor: "rgba(255,215,0,0.4)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 24,
  },
  subtitleSmall: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    marginBottom: 24,
  },
  body: {
    fontSize: 15,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 36,
    paddingHorizontal: 8,
  },
  primaryBtn: {
    backgroundColor: "#FFD700",
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 200,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0a0520",
    letterSpacing: 3,
  },
});
