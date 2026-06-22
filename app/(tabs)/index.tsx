import AsyncStorage from "@react-native-async-storage/async-storage";
import { BevCategory, BevDef, BEVERAGES } from "../../constants/beverages";
import { LastDrinkReveal, type LastDrinkRevealHandle } from "../../components/hydration/LastDrinkReveal";
import { HandoffDroplet, type HandoffDropletHandle } from "../../components/hydration/HandoffDroplet";
import Constants from "expo-constants";
import Onboarding from "../../components/Onboarding";
import CustomSoundsModal from "../../components/CustomSoundsModal";
import {
  initSounds, teardownSounds, reloadSounds, setSoundEnabled,
  playButtonTapSound,
  playWaterLogSound, playJackpotSound, playDropletSound,
  playStreakSound, playMorningResetSound,
  setActivePack, previewPack, stopPreview, ALL_SOUND_PACKS, DEFAULT_PACK_ID,
} from "../../utils/SoundManager";
import { deleteWaterSample, initHealthKit, isHealthAvailable, saveWaterSample } from "../../services/AppleHealth";
import { syncWidgetData } from "../../utils/WidgetDataSync";
import {
  detectPendingBadges,
  loadUnlockedBadgeIds,
  setPendingBadgeCount,
} from "../../utils/badgeDetection";
import type { BadgeDef } from "../../components/Achievements";
import { seedDemoData, clearDemoData } from "../../utils/devSeed";
import { initWatch, teardownWatch, sendHydrationUpdate, setWatchMessageHandler } from "../../utils/WatchManager";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { setSettingsModalOpener } from "../../utils/settingsModal";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import * as Sentry from "@sentry/react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { useProContext } from "../../contexts/ProContext";
import { getRevenueCatPurchases } from "../../utils/revenueCat";
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from "react";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  cancelAnimation,
  runOnJS,
  Easing as REasing,
} from "react-native-reanimated";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  Easing,
  FlatList,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View
} from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const DEFAULT_GOAL = 64;
const QUICK_ADD_DEFAULTS = [8, 12, 16, 16.9, 20, 24];
function formatOz(oz: number): string {
  return Number.isInteger(oz) ? String(oz) : oz.toFixed(1);
}
const POPULAR_PRESETS = [
  { oz: 8,    label: "8oz",   sub: "small glass" },
  { oz: 12,   label: "12oz",  sub: "can" },
  { oz: 16,   label: "16oz",  sub: "med bottle" },
  { oz: 16.9, label: "16.9oz",sub: "std bottle" },
  { oz: 20,   label: "20oz",  sub: "lg bottle" },
  { oz: 24,   label: "24oz",  sub: "lg cup" },
  { oz: 32,   label: "32oz",  sub: "Stanley sm" },
  { oz: 40,   label: "40oz",  sub: "Stanley lg" },
  { oz: 64,   label: "64oz",  sub: "half gallon" },
];

interface Preset { id: string; label: string; oz: number; category: BevCategory; }
interface DrinkEntry { oz: number; category: BevCategory; timestamp: number; hydrated: number; }

const CATEGORIES = BEVERAGES;

const DEFAULT_VISIBLE_BEVS: BevCategory[] = ["water", "coffee", "soda", "juice", "sports", "beer", "cocktail"];

// Build lookup maps for O(1) access
const BEV_MAP = new Map<string, BevDef>(CATEGORIES.map((c) => [c.key, c]));
const WATER_BEV = BEV_MAP.get("water")!;
function getBev(key: string): BevDef {
  return BEV_MAP.get(key) ?? WATER_BEV;
}

const EMPTY_BREAKDOWN: Record<BevCategory, number> = {
  water: 0, coffee: 0, tea: 0, icedtea: 0, soda: 0, flavored: 0, coconut: 0,
  juice: 0, lemonade: 0, fruit: 0, sports: 0, milk: 0, protein: 0,
  beer: 0, wine: 0, cocktail: 0, energy: 0, energyshot: 0, hotchoc: 0, spirits: 0,
};

function calcHydratedOz(oz: number, category: BevCategory): number {
  return Math.round(oz * getBev(category).eff * 10) / 10;
}

/** Safely merge stored breakdown (may have only 7 old keys) with the full 20-key default */
function mergeBreakdown(stored: Record<string, number>): Record<BevCategory, number> {
  return { ...EMPTY_BREAKDOWN, ...stored } as Record<BevCategory, number>;
}

/**
 * Format an oz value as either "X oz" or "Y ml" depending on the user's
 * preferred-unit setting. Use this at the call site of any single-unit
 * display so it tracks the preference.
 */
function fmtAmount(oz: number, preferred: 'oz' | 'ml', opts: { precision?: number } = {}): string {
  if (preferred === 'ml') return `${ozToMl(oz)} ml`;
  const p = opts.precision ?? 1;
  return `${oz.toFixed(p)} oz`;
}

function ozToMl(oz: number) {
  return Math.round(oz * 29.5735);
}

const SCREEN_W = Dimensions.get("window").width;

// --- Goal History Calendar ---
function getDateKey(d: Date) {
  return `water_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}


type Stage = { color: string; bg: string; headerBg: string; label: string };

function getStage(pct: number): Stage {
  if (pct < 0.17) return { color: "#C0152A", bg: "#C0152A", headerBg: "#8B0E1E", label: "Parched" };
  if (pct < 0.34) return { color: "#D94E00", bg: "#D94E00", headerBg: "#A33B00", label: "Dry" };
  if (pct < 0.51) return { color: "#E8920A", bg: "#E8920A", headerBg: "#B87008", label: "Warm" };
  if (pct < 0.67) return { color: "#7DB320", bg: "#7DB320", headerBg: "#5C8718", label: "Rising" };
  if (pct < 0.84) return { color: "#1E9E4A", bg: "#1E9E4A", headerBg: "#157035", label: "Almost" };
  return { color: "#0D6EE8", bg: "#0D6EE8", headerBg: "#0A52B0", label: "Hydrated" };
}

function getTodayKey() {
  const d = new Date();
  return `water_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

// --- Scroll Picker ---
const PICKER_ITEM_H = 36;
const PICKER_VISIBLE = 3;

interface ScrollPickerProps {
  items: number[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  label: string;
}

function ScrollPicker({ items, selectedIndex, onIndexChange, label }: ScrollPickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * PICKER_ITEM_H, animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, [selectedIndex]);

  const snapToIndex = (y: number) => {
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / PICKER_ITEM_H)));
    setActiveIndex(idx);
    onIndexChange(idx);
  };

  return (
    <View style={pickerStyles.wrapper}>
      <ScrollView
        ref={scrollRef}
        style={{ height: PICKER_ITEM_H * PICKER_VISIBLE }}
        contentContainerStyle={{ paddingVertical: PICKER_ITEM_H * 2 }}
        snapToInterval={PICKER_ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={(e) => snapToIndex(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => snapToIndex(e.nativeEvent.contentOffset.y)}
        onScroll={(e) => {
          const idx = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H)));
          if (idx !== activeIndex) setActiveIndex(idx);
        }}
        scrollEventThrottle={16}
      >
        {items.map((item, i) => {
          const dist = Math.abs(i - activeIndex);
          return (
            <View key={i} style={pickerStyles.item}>
              <Text style={[
                pickerStyles.itemBase,
                dist === 0 && pickerStyles.itemCenter,
                dist === 1 && pickerStyles.itemNear,
                dist >= 2 && pickerStyles.itemFar,
              ]}>
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={pickerStyles.highlight} pointerEvents="none" />
      <Text style={pickerStyles.unitLabel}>{label}</Text>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  wrapper: { alignItems: "center", backgroundColor: "#F0F2F5", borderRadius: 10, paddingHorizontal: 6 },
  item: { height: PICKER_ITEM_H, justifyContent: "center", alignItems: "center", minWidth: 52 },
  itemBase: { color: "#1A1A2E", fontSize: 13, opacity: 0.2 },
  itemCenter: { fontSize: 16, fontWeight: "700", opacity: 1 },
  itemNear: { fontSize: 14, opacity: 0.4 },
  itemFar: { fontSize: 13, opacity: 0.15 },
  highlight: {
    position: "absolute",
    top: PICKER_ITEM_H,
    left: 0,
    right: 0,
    height: PICKER_ITEM_H,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  unitLabel: { color: "#888888", fontSize: 11, marginTop: 2, marginBottom: 4 },
});


// --- Weather Banner ---
function WeatherBanner({ tempF, extraOz, onApply, onDismiss, stageColor }: {
  tempF: number; extraOz: 8 | 16;
  onApply: () => void; onDismiss: () => void; stageColor: string;
}) {
  return (
    <View style={bannerStyles.wrapper}>
      <Text style={bannerStyles.icon}>🌡️</Text>
      <View style={{ flex: 1 }}>
        <Text style={bannerStyles.title}>{tempF.toFixed(0)}°F outside</Text>
        <Text style={bannerStyles.sub}>Consider +{extraOz} oz to your goal today</Text>
      </View>
      <TouchableOpacity onPress={onApply} style={[bannerStyles.applyBtn, { backgroundColor: stageColor }]}>
        <Text style={bannerStyles.applyText}>+{extraOz} oz</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} style={bannerStyles.dismissBtn}>
        <Text style={bannerStyles.dismissText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  wrapper: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 8, borderRadius: 12, backgroundColor: "rgba(255,165,0,0.18)", borderWidth: 1, borderColor: "rgba(255,165,0,0.5)", padding: 10, gap: 8 },
  icon: { fontSize: 22 },
  title: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  sub: { color: "rgba(255,255,255,0.75)", fontSize: 11 },
  applyBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  applyText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  dismissBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dismissText: { color: "rgba(255,255,255,0.6)", fontSize: 14 },
});

// --- Presets Row ---
function WiggleChip({ children, editMode, index }: { children: React.ReactNode; editMode: boolean; index: number }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    if (editMode) {
      const amp = index % 2 === 0 ? 1.6 : 1.4;
      const dur = 90 + (index % 3) * 8;
      rot.value = withRepeat(
        withSequence(
          withTiming(-amp, { duration: dur }),
          withTiming(amp, { duration: dur }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(rot);
      rot.value = withTiming(0, { duration: 120 });
    }
  }, [editMode, index, rot]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return <Reanimated.View style={aStyle}>{children}</Reanimated.View>;
}

function PresetsRow({ presets, onSelect, onDelete, onReorder, isPro }: {
  presets: Preset[];
  onSelect: (p: Preset) => void;
  onDelete: (id: string) => void;
  onReorder: (next: Preset[]) => void;
  isPro: boolean;
}) {
  const cat = (p: Preset) => CATEGORIES.find((c) => c.key === p.category)!;
  const canReorder = isPro && presets.length > 1;
  const canEdit = presets.length > 0;
  const [editMode, setEditMode] = useState(false);
  useEffect(() => { if (!canEdit && editMode) setEditMode(false); }, [canEdit, editMode]);
  const enterEdit = () => {
    if (!canEdit || editMode) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setEditMode(true);
  };
  const confirmDelete = (p: Preset) => Alert.alert("Delete Preset", `Remove "${p.label}"?`, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: () => onDelete(p.id) },
  ]);
  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<Preset>) => {
    const idx = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <WiggleChip editMode={editMode && canReorder && !isActive} index={idx}>
          <View style={[presetStyles.chipWrap, isActive && { opacity: 0.85 }]}>
            <TouchableOpacity
              style={[presetStyles.chip, { borderLeftColor: cat(item).color }]}
              onPress={() => { if (!editMode) { playButtonTapSound(); onSelect(item); } }}
              onLongPress={canEdit ? () => {
                if (!editMode) enterEdit();
                if (canReorder) drag();
              } : undefined}
              delayLongPress={editMode ? 120 : 260}
              disabled={isActive}
              activeOpacity={editMode ? 1 : 0.8}
            >
              <Text style={presetStyles.chipEmoji}>{cat(item).emoji}</Text>
              <View>
                <Text style={presetStyles.chipLabel}>{item.label}</Text>
                <Text style={[presetStyles.chipSub, { color: cat(item).color }]}>{item.oz} oz</Text>
              </View>
            </TouchableOpacity>
            {editMode && (
              <TouchableOpacity
                style={presetStyles.deleteBtn}
                onPress={() => { playButtonTapSound(); confirmDelete(item); }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel={`Delete ${item.label}`}
              >
                <Text style={presetStyles.deleteX}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        </WiggleChip>
      </ScaleDecorator>
    );
  };
  return (
    <View style={presetStyles.wrapper}>
      <View style={presetStyles.headerRow}>
        <Text style={presetStyles.label}>⚡ QUICK PRESETS</Text>
        {editMode && (
          <TouchableOpacity onPress={() => { playButtonTapSound(); setEditMode(false); }} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Text style={presetStyles.doneBtn}>Done</Text>
          </TouchableOpacity>
        )}
      </View>
      <DraggableFlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={presets}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ gap: 10, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 2 }}
        renderItem={renderItem}
        onDragEnd={({ data }) => onReorder(data)}
        activationDistance={canReorder ? 6 : 10000}
      />
      <Text style={presetStyles.hint}>
        {editMode
          ? canReorder
            ? "Drag to reorder · Tap × to delete · Done when finished"
            : "Tap × to delete · Done when finished"
          : "Long-press to edit"}
      </Text>
    </View>
  );
}

const presetStyles = StyleSheet.create({
  wrapper: { marginHorizontal: 24, marginTop: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  label: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "700", letterSpacing: 0.8 },
  doneBtn: { color: "#FFD700", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  chipWrap: { position: "relative" },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderLeftWidth: 3 },
  chipEmoji: { fontSize: 20 },
  chipLabel: { color: "#ffffff", fontSize: 12, fontWeight: "600" },
  chipSub: { fontSize: 11, fontWeight: "700" },
  deleteBtn: { position: "absolute", top: -7, right: -7, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.92)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", alignItems: "center", justifyContent: "center" },
  deleteX: { color: "#ffffff", fontSize: 15, fontWeight: "700", lineHeight: 17, marginTop: -1 },
  hint: { color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 4 },
});

// ==========================================
//  HYDRO HERO HOME COMPONENTS
// ==========================================
const GOLD = "#FFD700";
const GOLD_DIM = "#c8a000";
// --- Star Particles ---
function StarParticles() {
  const N = 14;
  const anims = useRef(Array.from({ length: N }, () => new Animated.Value(0.2))).current;
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    const loops = anims.map((a, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay((i * 411) % 1800),
          Animated.timing(a, { toValue: 1, duration: 500 + (i * 113) % 400, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0.1, duration: 700 + (i * 97) % 400, useNativeDriver: true }),
        ])
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach((l) => l.stop());
  }, [focused, anims]);
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {anims.map((a, i) => {
        const x = ((i * 73 + 11) % 100) / 100 * SCREEN_W;
        const y = ((i * 53 + 37) % 100) / 100 * 1400;
        const sz = i % 4 === 0 ? 3 : 2;
        return (
          <Animated.View key={i} style={{ position: "absolute", left: x, top: y, width: sz, height: sz, borderRadius: sz / 2, backgroundColor: i % 5 === 0 ? GOLD : "#ffffff", opacity: a }} />
        );
      })}
    </View>
  );
}

// --- Marquee Header ---
const MQ_LIGHTS = 6;
function MarqueeHeader({ goal, hydration, preferredUnit }: { goal: number; hydration: number; preferredUnit: 'oz' | 'ml' }) {
  const lightAnims = useRef(Array.from({ length: MQ_LIGHTS * 2 }, () => new Animated.Value(0.2))).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    const loops: Animated.CompositeAnimation[] = [];
    const runRow = (arr: Animated.Value[]) => {
      arr.forEach((a, i) => {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(i * 130),
            Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.timing(a, { toValue: 0.2, duration: 350, useNativeDriver: true }),
            Animated.delay(MQ_LIGHTS * 130 + 300),
          ])
        );
        loop.start();
        loops.push(loop);
      });
    };
    runRow(lightAnims.slice(0, MQ_LIGHTS));
    const timer = setTimeout(() => runRow(lightAnims.slice(MQ_LIGHTS)), 250);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    loops.push(pulseLoop);
    return () => {
      clearTimeout(timer);
      loops.forEach((l) => l.stop());
    };
  }, [focused, lightAnims, pulseAnim]);
  const won = hydration >= goal;
  const remainingOz = Math.max(0, goal - hydration);
  const remaining = preferredUnit === 'ml' ? `${ozToMl(remainingOz)} ml` : `${remainingOz.toFixed(1)} oz`;
  return (
    <View style={mqStyles.wrapper}>
      <View style={mqStyles.lightsRow}>
        {lightAnims.slice(0, MQ_LIGHTS).map((a, i) => <Animated.View key={i} style={[mqStyles.light, { opacity: a }]} />)}
      </View>
      <View style={mqStyles.titleRow}>
        <Text style={mqStyles.star}>⭐</Text>
        <View style={{ alignItems: "center" }}>
          <Text style={mqStyles.title}>HYDRO HERO</Text>
          <Text style={mqStyles.subtitle}>HYDRATION TRACKER</Text>
        </View>
        <Text style={mqStyles.star}>⭐</Text>
      </View>
      <Animated.View style={[mqStyles.badge, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={won ? mqStyles.wonText : mqStyles.remainText}>
          {won ? "🎯 GOAL REACHED! 🎯" : `💧 ${remaining} to go`}
        </Text>
      </Animated.View>
      <View style={mqStyles.lightsRow}>
        {lightAnims.slice(MQ_LIGHTS).map((a, i) => <Animated.View key={i} style={[mqStyles.light, { opacity: a }]} />)}
      </View>
    </View>
  );
}
const mqStyles = StyleSheet.create({
  wrapper: { backgroundColor: "#12063A", borderWidth: 2, borderColor: GOLD, borderRadius: 16, marginHorizontal: 12, marginTop: 50, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center" },
  lightsRow: { flexDirection: "row", justifyContent: "space-around", width: "100%", marginVertical: 4 },
  light: { width: 11, height: 11, borderRadius: 6, backgroundColor: GOLD },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 6 },
  star: { fontSize: 22 },
  title: { fontSize: 26, fontWeight: "900", color: GOLD, letterSpacing: 3, textShadowColor: GOLD_DIM, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  subtitle: { fontSize: 13, fontWeight: "800", color: "#88CCFF", letterSpacing: 2.5, marginTop: 2 },
  badge: { backgroundColor: "rgba(255,215,0,0.12)", borderRadius: 20, paddingHorizontal: 18, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,215,0,0.4)", marginVertical: 4 },
  remainText: { color: GOLD, fontSize: 13, fontWeight: "700" },
  wonText: { color: GOLD, fontSize: 14, fontWeight: "900" },
});

// --- Particle Spray System ---
const PARTICLE_COUNT = 40;
const PARTICLE_COLORS = ["#66ddff", "#22aaee", "#0066cc", "#aaeeff", "#55ccff"];

interface Particle {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  size: number;
  color: string;
}

function useParticleSpray(originX: number, originY: number) {
  // Pool all Animated.Values once at mount — no allocations after initialization
  const pool = useRef<Particle[]>(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      size: 5,
      color: PARTICLE_COLORS[0],
    }))
  );
  const [visible, setVisible] = useState(false);
  const animRunning = useRef(false);

  const fire = useCallback(() => {
    if (animRunning.current) {
      pool.current.forEach((p) => { p.x.stopAnimation(); p.y.stopAnimation(); p.opacity.stopAnimation(); });
    }
    // Reset values and assign new random properties (no new Animated.Values)
    pool.current.forEach((p) => {
      p.size = 3 + Math.random() * 5;
      p.color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
      p.x.setValue(originX);
      p.y.setValue(originY);
      p.opacity.setValue(1);
    });
    animRunning.current = true;
    setVisible(true);

    const screenW = Dimensions.get("window").width;
    const duration = 1500;
    const steps = 30;
    const dt = duration / steps;

    const anims = pool.current.map((p) => {
      const vx = (Math.random() - 0.5) * screenW * 1.6;
      const vy = -(Math.random() * 600 + 200);
      const gravity = 0.15 + Math.random() * 0.15;

      // Build y keyframe sequence simulating gravity (native driver compatible)
      const yAnims: Animated.CompositeAnimation[] = [];
      let curY = originY;
      let curVY = vy;
      for (let i = 0; i < steps; i++) {
        const nextY = curY + curVY * dt * 0.001 + 0.5 * gravity * (dt * 0.001) ** 2 * 9800;
        yAnims.push(Animated.timing(p.y, { toValue: nextY, duration: dt, useNativeDriver: true, easing: Easing.linear }));
        curVY = curVY + gravity * dt * 0.1 * 9.8;
        curY = nextY;
      }

      return Animated.parallel([
        Animated.timing(p.x, { toValue: originX + vx, duration, useNativeDriver: true, easing: Easing.linear }),
        Animated.sequence(yAnims),
        Animated.timing(p.opacity, { toValue: 0, duration, delay: duration * 0.4, useNativeDriver: true, easing: Easing.in(Easing.cubic) }),
      ]);
    });

    Animated.parallel(anims).start(() => {
      animRunning.current = false;
      setVisible(false);
    });
  }, [originX, originY]);

  return { particles: pool.current, visible, fire };
}

function ParticleOverlay({ particles, visible }: { particles: Particle[]; visible: boolean }) {
  if (!visible || particles.length === 0) return null;
  return (
    <View pointerEvents="none" style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999,
    }}>
      {particles.map((p, i) => (
        <Animated.View key={i} style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: p.size,
          height: p.size,
          borderRadius: p.size / 2,
          backgroundColor: p.color,
          opacity: p.opacity,
          transform: [{ translateX: p.x }, { translateY: p.y }],
        }} />
      ))}
    </View>
  );
}

// ── Art Deco Gold Vault — unified tank + dispenser ─────────────────────────
const AD_SVG_W = 348;
const AD_SLOT_W = 328;
const AD_TANK_W = 240;
const AD_GLASS_W = 212;
const AD_GLASS_H = 172;
const AD_TANK_H = 210;
const AD_CONN_H = 30;
const AD_SLOT_H = 192;
const AD_ARCH_H = 36;
const AD_TANK_X = (AD_SVG_W - AD_TANK_W) / 2;    // 54
const AD_SLOT_X = (AD_SVG_W - AD_SLOT_W) / 2;    // 10
const AD_GLASS_X = AD_TANK_X + 14;               // 68
const AD_GLASS_Y = AD_ARCH_H + 14;               // 50
const AD_TANK_Y = AD_ARCH_H;                     // 36
const AD_CONN_Y = AD_TANK_Y + AD_TANK_H;         // 246
const AD_SLOT_Y = AD_CONN_Y + AD_CONN_H;         // 276
const AD_BASE1_Y = AD_SLOT_Y + AD_SLOT_H;        // 468
const AD_SVG_H = AD_BASE1_Y + 24;                // 492
const AD_SLOT_HDR_H = 22;
const AD_CONN_PATH     = `M ${AD_TANK_X},${AD_TANK_Y + AD_TANK_H} L ${AD_TANK_X + AD_TANK_W},${AD_TANK_Y + AD_TANK_H} L ${AD_SLOT_X + AD_SLOT_W},${AD_SLOT_Y} L ${AD_SLOT_X},${AD_SLOT_Y} Z`;
const AD_TANK_ARCH     = `M ${AD_TANK_X},${AD_TANK_Y} Q ${AD_TANK_X + AD_TANK_W / 2},${AD_TANK_Y - AD_ARCH_H} ${AD_TANK_X + AD_TANK_W},${AD_TANK_Y}`;
const AD_SLOT_ARCH     = `M ${AD_SLOT_X},${AD_SLOT_Y} Q ${AD_SVG_W / 2},${AD_SLOT_Y - 22} ${AD_SLOT_X + AD_SLOT_W},${AD_SLOT_Y}`;

function adDiamondPath(cx: number, cy: number, r: number): string {
  return `M ${cx},${cy - r} L ${cx + r},${cy} L ${cx},${cy + r} L ${cx - r},${cy} Z`;
}

// All static decoration — never re-renders with phase/water animation
const VaultStaticSVG = React.memo(function VaultStaticSVG({ vGoal, preferredUnit }: { vGoal: number; preferredUnit: 'oz' | 'ml' }) {
  return (
    <Svg width={AD_SVG_W} height={AD_SVG_H}>
      <Defs>
        <LinearGradient id="adGoldH" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"    stopColor="#2a1800" stopOpacity="1" />
          <Stop offset="0.10" stopColor="#8b5e00" stopOpacity="1" />
          <Stop offset="0.28" stopColor="#FFD700" stopOpacity="1" />
          <Stop offset="0.42" stopColor="#fff0a0" stopOpacity="1" />
          <Stop offset="0.50" stopColor="#fffde0" stopOpacity="1" />
          <Stop offset="0.58" stopColor="#fff0a0" stopOpacity="1" />
          <Stop offset="0.72" stopColor="#FFD700" stopOpacity="1" />
          <Stop offset="0.90" stopColor="#8b5e00" stopOpacity="1" />
          <Stop offset="1"    stopColor="#2a1800" stopOpacity="1" />
        </LinearGradient>
        <RadialGradient id="studGrad" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#fffde0" stopOpacity="1" />
          <Stop offset="1" stopColor="#8b5e00" stopOpacity="1" />
        </RadialGradient>
        <RadialGradient id="diamondGold" cx="50%" cy="50%" r="50%">
          <Stop offset="0"   stopColor="#fffde0" stopOpacity="1" />
          <Stop offset="0.5" stopColor="#FFD700" stopOpacity="1" />
          <Stop offset="1"   stopColor="#8b5e00" stopOpacity="1" />
        </RadialGradient>
        <RadialGradient id="diamondPurp" cx="50%" cy="50%" r="50%">
          <Stop offset="0"   stopColor="#e0b0ff" stopOpacity="1" />
          <Stop offset="0.5" stopColor="#9933ff" stopOpacity="1" />
          <Stop offset="1"   stopColor="#440077" stopOpacity="1" />
        </RadialGradient>
        <LinearGradient id="slotHdr" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"   stopColor="#2a1800" stopOpacity="1" />
          <Stop offset="0.4" stopColor="#c8a000" stopOpacity="1" />
          <Stop offset="0.5" stopColor="#fffde0" stopOpacity="1" />
          <Stop offset="0.6" stopColor="#c8a000" stopOpacity="1" />
          <Stop offset="1"   stopColor="#2a1800" stopOpacity="1" />
        </LinearGradient>
        <LinearGradient id="base1G" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"   stopColor="#2a1800" stopOpacity="1" />
          <Stop offset="0.5" stopColor="#ffe066" stopOpacity="1" />
          <Stop offset="1"   stopColor="#2a1800" stopOpacity="1" />
        </LinearGradient>
        <LinearGradient id="base2G" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"   stopColor="#1a0e00" stopOpacity="1" />
          <Stop offset="0.5" stopColor="#c8a000" stopOpacity="1" />
          <Stop offset="1"   stopColor="#1a0e00" stopOpacity="1" />
        </LinearGradient>
      </Defs>

      {/* ═══ TANK ═══ */}
      <Rect x={AD_TANK_X} y={AD_TANK_Y} width={AD_TANK_W} height={AD_TANK_H} fill="url(#adGoldH)" rx={8} />
      {[0, 0.33, 0.66, 1].map((m, i) => (
        <Rect key={i} x={AD_TANK_X} y={AD_TANK_Y + AD_TANK_H * m - 2.5} width={AD_TANK_W} height={5} fill="url(#adGoldH)" opacity={0.85} />
      ))}
      <Rect x={AD_TANK_X} y={AD_TANK_Y} width={6} height={AD_TANK_H} fill="url(#adGoldH)" />
      {[0.25, 0.5, 0.75].map((m, i) => (
        <Circle key={i} cx={AD_TANK_X + 3} cy={AD_TANK_Y + AD_TANK_H * m} r={4} fill="url(#studGrad)" stroke="#5a3c00" strokeWidth={0.5} />
      ))}
      <Rect x={AD_TANK_X + AD_TANK_W - 6} y={AD_TANK_Y} width={6} height={AD_TANK_H} fill="url(#adGoldH)" />
      {[0.25, 0.5, 0.75].map((m, i) => (
        <Circle key={i} cx={AD_TANK_X + AD_TANK_W - 3} cy={AD_TANK_Y + AD_TANK_H * m} r={4} fill="url(#studGrad)" stroke="#5a3c00" strokeWidth={0.5} />
      ))}
      <Path d={adDiamondPath(AD_TANK_X - 1, AD_TANK_Y + AD_TANK_H * 0.5, 9)} fill="url(#diamondGold)" stroke="#5a3c00" strokeWidth={0.5} />
      <Path d={adDiamondPath(AD_TANK_X + AD_TANK_W + 1, AD_TANK_Y + AD_TANK_H * 0.5, 9)} fill="url(#diamondGold)" stroke="#5a3c00" strokeWidth={0.5} />

      {/* Side markers: % left, oz right */}
      {[0, 0.25, 0.5, 0.75, 1.0].map((m, i) => {
        const tY = AD_GLASS_Y + AD_GLASS_H - m * AD_GLASS_H;
        return (
          <G key={i}>
            <Line x1={AD_TANK_X - 8} y1={tY} x2={AD_TANK_X} y2={tY} stroke="rgba(255,215,0,0.6)" strokeWidth={1.5} />
            <SvgText x={AD_TANK_X - 10} y={tY + 4} fontSize={9} fill="rgba(255,215,0,0.75)" textAnchor="end" fontWeight="600">{Math.round(m * 100)}%</SvgText>
            <Line x1={AD_TANK_X + AD_TANK_W} y1={tY} x2={AD_TANK_X + AD_TANK_W + 8} y2={tY} stroke="rgba(255,215,0,0.6)" strokeWidth={1.5} />
            <SvgText x={AD_TANK_X + AD_TANK_W + 10} y={tY + 4} fontSize={9} fill="rgba(255,215,0,0.75)" textAnchor="start" fontWeight="600">{preferredUnit === 'ml' ? `${ozToMl(m * vGoal)}ml` : `${Math.round(m * vGoal)}oz`}</SvgText>
          </G>
        );
      })}

      {/* Tank frame border */}
      <Rect x={AD_TANK_X} y={AD_TANK_Y} width={AD_TANK_W} height={AD_TANK_H} fill="none" stroke="#5a3c00" strokeWidth={2} rx={8} />

      {/* Tank arch + gems + stars */}
      <Path d={AD_TANK_ARCH} fill="none" stroke="url(#adGoldH)" strokeWidth={3} />
      <Circle cx={AD_TANK_X + AD_TANK_W / 2}      cy={AD_TANK_Y - 20} r={5}   fill="#4488ff" stroke="#2244bb" strokeWidth={1} />
      <Circle cx={AD_TANK_X + AD_TANK_W / 2 - 55} cy={AD_TANK_Y - 9}  r={3.5} fill="#66aaff" stroke="#2244bb" strokeWidth={0.8} />
      <Circle cx={AD_TANK_X + AD_TANK_W / 2 + 55} cy={AD_TANK_Y - 9}  r={3.5} fill="#66aaff" stroke="#2244bb" strokeWidth={0.8} />
      <SvgText x={AD_TANK_X - 4}            y={AD_TANK_Y - 2} fontSize={14} fill={GOLD} textAnchor="middle">★</SvgText>
      <SvgText x={AD_TANK_X + AD_TANK_W + 4} y={AD_TANK_Y - 2} fontSize={14} fill={GOLD} textAnchor="middle">★</SvgText>

      {/* ═══ CONNECTOR ═══ */}
      <Path d={AD_CONN_PATH} fill="url(#adGoldH)" stroke="#5a3c00" strokeWidth={1.5} />
      <Line x1={AD_TANK_X}             y1={AD_TANK_Y + AD_TANK_H} x2={AD_SLOT_X}             y2={AD_SLOT_Y} stroke="rgba(255,215,0,0.35)" strokeWidth={1} />
      <Line x1={AD_TANK_X + AD_TANK_W} y1={AD_TANK_Y + AD_TANK_H} x2={AD_SLOT_X + AD_SLOT_W} y2={AD_SLOT_Y} stroke="rgba(255,215,0,0.35)" strokeWidth={1} />

      {/* ═══ LAST DRINK PANEL ═══ */}
      <Rect x={AD_SLOT_X} y={AD_SLOT_Y} width={AD_SLOT_W} height={AD_SLOT_H} fill="url(#adGoldH)" rx={8} />
      <Path d={AD_SLOT_ARCH} fill="none" stroke="url(#adGoldH)" strokeWidth={3} />
      <Circle cx={AD_SVG_W / 2}      cy={AD_SLOT_Y - 12} r={5}   fill="#aa44ff" stroke="#6600cc" strokeWidth={1} />
      <Circle cx={AD_SVG_W / 2 - 70} cy={AD_SLOT_Y - 5}  r={3.5} fill="#cc77ff" stroke="#6600cc" strokeWidth={0.8} />
      <Circle cx={AD_SVG_W / 2 + 70} cy={AD_SLOT_Y - 5}  r={3.5} fill="#cc77ff" stroke="#6600cc" strokeWidth={0.8} />
      <SvgText x={AD_SLOT_X - 4}            y={AD_SLOT_Y - 1} fontSize={14} fill={GOLD} textAnchor="middle">★</SvgText>
      <SvgText x={AD_SLOT_X + AD_SLOT_W + 4} y={AD_SLOT_Y - 1} fontSize={14} fill={GOLD} textAnchor="middle">★</SvgText>
      <Rect x={AD_SLOT_X + 8} y={AD_SLOT_Y + 6} width={AD_SLOT_W - 16} height={AD_SLOT_HDR_H} fill="url(#slotHdr)" rx={4} />
      <SvgText x={AD_SVG_W / 2} y={AD_SLOT_Y + 6 + AD_SLOT_HDR_H / 2 + 4} fontSize={9} fontWeight="800" fill="#3d2200" textAnchor="middle" letterSpacing={3}>LAST DRINK</SvgText>
      <Rect x={AD_SLOT_X} y={AD_SLOT_Y} width={7} height={AD_SLOT_H} fill="url(#adGoldH)" />
      {[0.35, 0.65].map((m, i) => (
        <Circle key={i} cx={AD_SLOT_X + 3.5} cy={AD_SLOT_Y + AD_SLOT_H * m} r={4} fill="url(#studGrad)" stroke="#5a3c00" strokeWidth={0.5} />
      ))}
      <Rect x={AD_SLOT_X + AD_SLOT_W - 7} y={AD_SLOT_Y} width={7} height={AD_SLOT_H} fill="url(#adGoldH)" />
      {[0.35, 0.65].map((m, i) => (
        <Circle key={i} cx={AD_SLOT_X + AD_SLOT_W - 3.5} cy={AD_SLOT_Y + AD_SLOT_H * m} r={4} fill="url(#studGrad)" stroke="#5a3c00" strokeWidth={0.5} />
      ))}
      {[0, 1].map((m, i) => (
        <Rect key={i} x={AD_SLOT_X} y={AD_SLOT_Y + AD_SLOT_H * m - 2.5} width={AD_SLOT_W} height={5} fill="url(#adGoldH)" opacity={0.85} />
      ))}
      <Path d={adDiamondPath(AD_SLOT_X - 1, AD_SLOT_Y + AD_SLOT_H * 0.5, 9)} fill="url(#diamondPurp)" stroke="#6600cc" strokeWidth={0.5} />
      <Path d={adDiamondPath(AD_SLOT_X + AD_SLOT_W + 1, AD_SLOT_Y + AD_SLOT_H * 0.5, 9)} fill="url(#diamondPurp)" stroke="#6600cc" strokeWidth={0.5} />
      {/* Dark inset window — gives the overlaid info text high contrast against the gold cabinet */}
      <Rect
        x={AD_SLOT_X + 16}
        y={AD_SLOT_Y + AD_SLOT_HDR_H + 14}
        width={AD_SLOT_W - 32}
        height={AD_SLOT_H - AD_SLOT_HDR_H - 28}
        fill="#020010"
        stroke="#5a3c00"
        strokeWidth={1.5}
        rx={6}
      />
      <Rect x={AD_SLOT_X} y={AD_SLOT_Y} width={AD_SLOT_W} height={AD_SLOT_H} fill="none" stroke="#5a3c00" strokeWidth={2} rx={8} />

      {/* ═══ BASE ═══ */}
      <Rect x={AD_SLOT_X - 4}  y={AD_BASE1_Y}      width={AD_SLOT_W + 8}  height={14} fill="url(#base1G)" rx={4} />
      <Rect x={AD_SLOT_X - 12} y={AD_BASE1_Y + 12} width={AD_SLOT_W + 24} height={10} fill="url(#base2G)" rx={3} />
      <Ellipse cx={AD_SVG_W / 2} cy={AD_BASE1_Y + 26} rx={AD_SLOT_W / 2 + 16} ry={6} fill="rgba(0,0,0,0.35)" />
    </Svg>
  );
});

// Pre-computed sine lookup table — 360 entries, eliminates Math.sin() during animation
const SIN_LUT = Object.freeze(Array.from({ length: 360 }, (_, i) => Math.sin((i / 180) * Math.PI)));
function sinLut(radians: number): number {
  const idx = (((radians * 180) / Math.PI) % 360 + 360) % 360;
  return SIN_LUT[Math.round(idx) % 360];
}

// Inner SVG component — the only part that re-renders at 60fps.
// The outer ArtDecoVault re-renders only when props (pct, oz, category…) change.
function AnimatedWaterSVG({
  phaseRef, fillPctRef, bubConfigsRef, causticRef, pct, forceUpdateRef,
}: {
  phaseRef: React.MutableRefObject<number>;
  fillPctRef: React.MutableRefObject<number>;
  bubConfigsRef: React.MutableRefObject<{ x: number; r: number; speed: number; prog: number }[]>;
  causticRef: React.MutableRefObject<{ x: number; y: number; vx: number; vy: number; ph: number }[]>;
  pct: number;
  forceUpdateRef: React.MutableRefObject<() => void>;
}) {
  const [, dispatch] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    forceUpdateRef.current = dispatch;
    return () => { forceUpdateRef.current = () => {}; };
  }, [forceUpdateRef]);

  const phase = phaseRef.current;
  const fillPct = fillPctRef.current;
  // Visual mapping:
  //   • Empty only when truly zero (start of day or right after Reset).
  //   • Any positive intake gets at least ~18% of the visible glass so
  //     the first drink registers (linear mapping at 12% is ~21 px,
  //     basically invisible against the gold frame's rounded corners).
  //   • Math.ceil so a true 100% fills the very top — Math.round would
  //     leave a 1 px gap at fillPct=0.998 .
  const MIN_VISIBLE_FRACTION = 0.18;
  const targetFrac = fillPct <= 0 ? 0 : Math.max(fillPct, MIN_VISIBLE_FRACTION);
  const waterH = Math.min(Math.ceil(targetFrac * AD_GLASS_H), AD_GLASS_H);
  const waterTop = AD_GLASS_Y + AD_GLASS_H - waterH;
  const waterBot = AD_GLASS_Y + AD_GLASS_H;

  let wave1 = `M ${AD_GLASS_X} ${waterTop}`;
  for (let x = 0; x <= AD_GLASS_W; x += 4)
    wave1 += ` L ${AD_GLASS_X + x} ${waterTop + sinLut(x * 0.04 + phase) * 4}`;
  wave1 += ` L ${AD_GLASS_X + AD_GLASS_W} ${waterBot} L ${AD_GLASS_X} ${waterBot} Z`;

  let wave2 = `M ${AD_GLASS_X} ${waterTop}`;
  for (let x = 0; x <= AD_GLASS_W; x += 4)
    wave2 += ` L ${AD_GLASS_X + x} ${waterTop + sinLut(x * 0.065 - phase * 0.7) * 3}`;
  wave2 += ` L ${AD_GLASS_X + AD_GLASS_W} ${waterBot} L ${AD_GLASS_X} ${waterBot} Z`;

  return (
    <Svg width={AD_SVG_W} height={AD_SVG_H} style={StyleSheet.absoluteFillObject}>
      <Defs>
        <LinearGradient id="wAdWaterGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"    stopColor="#78ebff" stopOpacity="0.95" />
          <Stop offset="0.15" stopColor="#28b4ff" stopOpacity="0.95" />
          <Stop offset="0.55" stopColor="#0a50c8" stopOpacity="0.95" />
          <Stop offset="1"    stopColor="#05236e" stopOpacity="0.95" />
        </LinearGradient>
        <LinearGradient id="wAdWaterSheen" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"   stopColor="#000028" stopOpacity="0.35" />
          <Stop offset="0.3" stopColor="#000000" stopOpacity="0"    />
          <Stop offset="0.5" stopColor="#ffffff"  stopOpacity="0.1"  />
          <Stop offset="0.7" stopColor="#000000" stopOpacity="0"    />
          <Stop offset="1"   stopColor="#000028" stopOpacity="0.35" />
        </LinearGradient>
        <LinearGradient id="wGlassBg" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"   stopColor="#000c18" stopOpacity="1" />
          <Stop offset="0.5" stopColor="#001428" stopOpacity="1" />
          <Stop offset="1"   stopColor="#000c18" stopOpacity="1" />
        </LinearGradient>
        <LinearGradient id="wGlassOvr" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"    stopColor="#aaddff" stopOpacity="0.08" />
          <Stop offset="0.25" stopColor="#aaddff" stopOpacity="0.02" />
          <Stop offset="0.5"  stopColor="#ffffff"  stopOpacity="0.06" />
          <Stop offset="0.75" stopColor="#aaddff" stopOpacity="0.02" />
          <Stop offset="1"    stopColor="#aaddff" stopOpacity="0.08" />
        </LinearGradient>
        <ClipPath id="wGlassClip">
          <Rect x={AD_GLASS_X + 1.5} y={AD_GLASS_Y + 1.5}
            width={AD_GLASS_W - 3} height={AD_GLASS_H - 3} rx={3} />
        </ClipPath>
      </Defs>

      <Rect x={AD_GLASS_X} y={AD_GLASS_Y} width={AD_GLASS_W} height={AD_GLASS_H}
        fill="url(#wGlassBg)" rx={4} />

      {waterH > 0 && (
        <G clipPath="url(#wGlassClip)">
          <Rect x={AD_GLASS_X} y={waterTop} width={AD_GLASS_W} height={waterH}
            fill="url(#wAdWaterGrad)" />
          <Rect x={AD_GLASS_X} y={waterTop} width={AD_GLASS_W} height={waterH}
            fill="url(#wAdWaterSheen)" />
          {pct > 0.02 && <Path d={wave1} fill="rgba(100,210,255,0.45)" />}
          {pct > 0.02 && <Path d={wave2} fill="rgba(180,235,255,0.28)" />}
          {pct > 0.15 && causticRef.current.map((c, i) => (
            <Ellipse key={i}
              cx={AD_GLASS_X + c.x * AD_GLASS_W}
              cy={waterTop + c.y * waterH}
              rx={13 + (i % 3) * 6}
              ry={(13 + (i % 3) * 6) * 0.65}
              fill={`rgba(150,230,255,${(0.14 + sinLut(phase * 1.2 + c.ph) * 0.07).toFixed(2)})`} />
          ))}
          {pct > 0.20 && bubConfigsRef.current.map((b, i) => {
            const bX = AD_GLASS_X + b.x * AD_GLASS_W;
            const bY = waterTop + waterH - b.prog * waterH;
            const op = b.prog < 0.08 ? b.prog / 0.08 : b.prog > 0.92 ? (1 - b.prog) / 0.08 : 1;
            return (
              <G key={i} opacity={op}>
                <Circle cx={bX} cy={bY} r={b.r}
                  stroke="rgba(150,220,255,0.5)" strokeWidth={1}
                  fill="rgba(200,240,255,0.08)" />
                <Circle cx={bX - b.r * 0.35} cy={bY - b.r * 0.35} r={b.r * 0.35}
                  fill="rgba(255,255,255,0.55)" />
              </G>
            );
          })}
        </G>
      )}

      <Rect x={AD_GLASS_X} y={AD_GLASS_Y} width={AD_GLASS_W} height={AD_GLASS_H}
        fill="url(#wGlassOvr)" rx={4} />
      <Rect x={AD_GLASS_X} y={AD_GLASS_Y} width={AD_GLASS_W} height={AD_GLASS_H}
        fill="none" stroke="rgba(180,220,255,0.55)" strokeWidth={1.5} rx={4} />
    </Svg>
  );
}

function ArtDecoVault({
  pct, oz, goal: vGoal,
  loggedCategory, lastReelOz, logNonce,
  onSpoutRef, onTankFill, onLaunchDroplet,
  preferredUnit,
}: {
  pct: number; oz: number; goal: number;
  loggedCategory: BevCategory; lastReelOz: number; logNonce: number;
  onSpoutRef?: (x: number, y: number) => void;
  onTankFill?: () => void;
  onLaunchDroplet?: (start: {x:number;y:number}, end: {x:number;y:number}, onLand: () => void) => void;
  preferredUnit: 'oz' | 'ml';
}) {
  const hydOz = lastReelOz > 0 ? calcHydratedOz(lastReelOz, loggedCategory) : 0;
  const beverage: BevDef = getBev(loggedCategory);
  const focused = useIsFocused();

  // ── RAF-driven animation refs (no setState in the hot path) ──
  const phaseRef = useRef(0);
  const fillPctRef = useRef(pct);
  const forceUpdateWaterRef = useRef<() => void>(() => {});

  const bubConfigs = useRef([
    { x: 0.22, r: 3.5, speed: 0.0045, prog: 0.1  },
    { x: 0.50, r: 2.5, speed: 0.0035, prog: 0.45 },
    { x: 0.72, r: 4.0, speed: 0.005,  prog: 0.75 },
  ]);
  const causticState = useRef([
    { x: 0.2,  y: 0.7, vx:  0.0008, vy: -0.0005, ph: 0   },
    { x: 0.5,  y: 0.5, vx: -0.0006, vy:  0.0007,  ph: 1.2 },
    { x: 0.75, y: 0.8, vx:  0.0007, vy: -0.0009, ph: 2.4 },
  ]);

  // RAF loop — updates refs and triggers a single re-render of AnimatedWaterSVG
  useEffect(() => {
    if (!focused) return;
    let rafId: number;
    let lastTime: number | null = null;
    function tick(time: number) {
      if (lastTime !== null) {
        const dt = Math.min(time - lastTime, 50);
        phaseRef.current += (dt / 33) * 0.033;
        const bubs = bubConfigs.current;
        for (let i = 0; i < bubs.length; i++) {
          bubs[i].prog = bubs[i].prog + bubs[i].speed >= 1 ? 0 : bubs[i].prog + bubs[i].speed;
        }
        const caus = causticState.current;
        for (let i = 0; i < caus.length; i++) {
          let nx = caus[i].x + caus[i].vx, ny = caus[i].y + caus[i].vy;
          let nvx = caus[i].vx, nvy = caus[i].vy;
          if (nx < 0.05 || nx > 0.95) nvx = -nvx;
          if (ny < 0.05 || ny > 0.95) nvy = -nvy;
          caus[i] = { ...caus[i], x: nx, y: ny, vx: nvx, vy: nvy };
        }
        forceUpdateWaterRef.current();
      }
      lastTime = time;
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [focused]);

  // ── fill animation: deferred when a drink is logged ──
  // Normal pct changes (mount, midnight reset, Reset Today, watch sync)
  // animate immediately. Drink-log pct changes are detected by the logNonce
  // jumping ahead; we skip the auto-fire and let LastDrinkReveal's
  // onReachTank trigger the rise so the waves climb at the exact moment
  // the handoff droplet lands in the tank.
  const fillAnim = useRef(new Animated.Value(pct)).current;
  const lastSeenLogNonce = useRef(0);

  useEffect(() => {
    const id = fillAnim.addListener(({ value }) => { fillPctRef.current = value; });
    return () => fillAnim.removeListener(id);
  }, [fillAnim]);

  useEffect(() => {
    // A bumped logNonce means this pct change comes from a fresh drink log —
    // the handoff droplet's onReachTank will run the tank rise. We just
    // mark the nonce as seen and bail. This is robust to effect ordering:
    // even if useEffect[logNonce] fires first or last, this check is purely
    // value-based, not state-based.
    if (logNonce > lastSeenLogNonce.current) {
      lastSeenLogNonce.current = logNonce;
      return;
    }
    Animated.timing(fillAnim, {
      toValue: pct, duration: 1200, useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [pct, fillAnim, logNonce]);

  // ── Last-drink reveal: play() runs splash → ring → onHandoffStart ──
  // The actual ring→tank droplet animation is a top-level overlay (sibling of
  // the scroll content) so it can animate across coordinate systems.
  const revealRef = useRef<LastDrinkRevealHandle>(null);
  const vaultWaterAnchorRef = useRef<View>(null);

  useEffect(() => {
    if (logNonce === 0) return;  // initial mount, no log yet
    revealRef.current?.play();
  }, [logNonce]);

  // Drop landed in the tank: rise the water and let the parent celebrate.
  const onReachTank = useCallback(() => {
    Animated.timing(fillAnim, {
      toValue: pct, duration: 450, useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
    onTankFill?.();
  }, [pct, fillAnim, onTankFill]);

  // Ring filled — measure both anchors and ask Home to launch the overlay.
  const handleHandoffStart = useCallback(async () => {
    if (!onLaunchDroplet) return;
    const ringPos = await revealRef.current?.measureRing();
    if (!ringPos) return;
    const anchor = vaultWaterAnchorRef.current;
    if (!anchor) return;
    playDropletSound();
    anchor.measureInWindow((x, y, w, h) => {
      onLaunchDroplet(ringPos, { x: x + w / 2, y: y + h / 2 }, onReachTank);
    });
  }, [onLaunchDroplet, onReachTank]);

  return (
    <View style={{ alignItems: "center", marginTop: 8, marginBottom: 4 }}
      onLayout={(e) => {
        if (onSpoutRef) {
          e.target.measure((_x, _y, _w, _h, pageX, pageY) => {
            onSpoutRef(pageX + AD_SVG_W / 2, pageY + AD_TANK_Y);
          });
        }
      }}
    >
      <View style={{ width: AD_SVG_W, height: AD_SVG_H }}>

        {/* invisible anchor at the tank waterline — measured in window coords
            by the overlay droplet so it knows where to land */}
        <View
          ref={vaultWaterAnchorRef}
          collapsable={false}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: AD_GLASS_X + AD_GLASS_W / 2 - 2,
            top: AD_GLASS_Y + AD_GLASS_H * 0.2,
            width: 4,
            height: 4,
          }}
        />

        {/* ── Static decoration — never re-renders with phase ── */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <VaultStaticSVG vGoal={vGoal} preferredUnit={preferredUnit} />
        </View>

        {/* ── Animated water SVG — only AnimatedWaterSVG re-renders at 60fps ── */}
        <AnimatedWaterSVG
          phaseRef={phaseRef}
          fillPctRef={fillPctRef}
          bubConfigsRef={bubConfigs}
          causticRef={causticState}
          pct={pct}
          forceUpdateRef={forceUpdateWaterRef}
        />

        {/* ── Last drink panel (LastDrinkReveal) ── */}
        {/* The vault's static SVG already renders the "LAST DRINK" gold header. */}
        <View style={{
          position: "absolute",
          left: AD_SLOT_X + 16,
          top: AD_SLOT_Y + AD_SLOT_HDR_H + 14,
          width: AD_SLOT_W - 32,
          height: AD_SLOT_H - AD_SLOT_HDR_H - 28,
          justifyContent: "center",
        }}>
          {lastReelOz > 0 ? (
            <LastDrinkReveal
              ref={revealRef}
              beverage={beverage}
              ozLogged={lastReelOz}
              hydratedOz={hydOz}
              preferredUnit={preferredUnit}
              onHandoffStart={handleHandoffStart}
            />
          ) : (
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 32 }}>💧</Text>
              <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 10, fontWeight: "600", textAlign: "center", lineHeight: 18 }}>
                Tap a quick-add amount{"\n"}below to log your first drink
              </Text>
            </View>
          )}
        </View>

        {/* ── Tank text overlay ── */}
        <View pointerEvents="none" style={{
          position: "absolute",
          left: AD_GLASS_X, top: AD_GLASS_Y,
          width: AD_GLASS_W, height: AD_GLASS_H,
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 26, fontWeight: "900", color: "#FFD700" }}>
            {`${Math.round(pct * 100)}%`}
          </Text>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "rgba(200,240,255,0.92)", marginTop: 4 }}>
            {`${fmtAmount(oz, preferredUnit)} hydrated`}
          </Text>
          <Text style={{ fontSize: 9, color: "rgba(255,215,0,0.7)", marginTop: 3 }}>
            {preferredUnit === 'ml' ? `${oz.toFixed(1)} oz` : `${ozToMl(oz)} ml`}
          </Text>
        </View>

      </View>
    </View>
  );
}

// --- Reel Confetti Burst ---
const RC_N = 20;
const RC_COLORS = [GOLD, "#44ccff", "#ffffff"];
interface RCParticle { x: Animated.Value; y: Animated.Value; op: Animated.Value; startX: number; color: string; size: number; isSquare: boolean; vx: number; vy: number; }

function ReelConfetti({ visible, originY }: { visible: boolean; originY: number }) {
  const particles = useRef<RCParticle[]>(
    Array.from({ length: RC_N }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      op: new Animated.Value(0),
      startX: ((i * 37 + 13) % 100) / 100 * SCREEN_W,
      color: RC_COLORS[i % RC_COLORS.length],
      size: 4 + (i % 4),
      isSquare: i % 3 !== 0,
      vx: ((i * 47 + 7) % 200) - 100,
      vy: -(80 + (i * 31 + 11) % 220),
    }))
  ).current;

  const fired = useRef(false);

  useEffect(() => {
    if (visible && !fired.current) {
      fired.current = true;
      particles.forEach((p) => {
        p.x.setValue(0); p.y.setValue(0); p.op.setValue(1);
        Animated.parallel([
          Animated.timing(p.x, { toValue: p.vx, duration: 1000, useNativeDriver: true, easing: Easing.linear }),
          Animated.sequence([
            Animated.timing(p.y, { toValue: p.vy, duration: 500, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
            Animated.timing(p.y, { toValue: p.vy + 220, duration: 500, useNativeDriver: true, easing: Easing.in(Easing.cubic) }),
          ]),
          Animated.sequence([
            Animated.delay(300),
            Animated.timing(p.op, { toValue: 0, duration: 700, useNativeDriver: true }),
          ]),
        ]).start();
      });
    }
    if (!visible) fired.current = false;
  }, [visible, particles]);

  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View key={i} style={{
          position: "absolute",
          left: p.startX,
          top: originY,
          width: p.size,
          height: p.size,
          borderRadius: p.isSquare ? 0 : p.size / 2,
          backgroundColor: p.color,
          opacity: p.op,
          transform: [{ translateX: p.x }, { translateY: p.y }],
        }} />
      ))}
    </View>
  );
}

// --- Choose Your 7 Modal ---
interface ChooseBevsModalProps {
  visible: boolean;
  current: BevCategory[];
  usage: Record<BevCategory, number>;
  onSave: (selection: BevCategory[]) => void;
  onCancel: () => void;
}
function ChooseBevsModal({ visible, current, usage, onSave, onCancel }: ChooseBevsModalProps) {
  const [selected, setSelected] = useState<BevCategory[]>(current);
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (visible) { setSelected(current); setHint(""); }
  }, [visible, current]);

  function toggle(key: BevCategory) {
    if (selected.includes(key)) {
      if (selected.length <= 1) {
        setHint("You need at least one beverage selected");
        return;
      }
      setSelected((prev) => prev.filter((k) => k !== key));
      setHint("");
    } else {
      setSelected((prev) => [...prev, key]);
      setHint("");
    }
  }

  // Selected list keeps user-defined order; unselected derived from CATEGORIES.
  const selectedBevs = useMemo(
    () => selected.map((k) => getBev(k)),
    [selected],
  );
  const unselectedBevs = useMemo(() => {
    const selSet = new Set(selected);
    return CATEGORIES.filter((b) => !selSet.has(b.key));
  }, [selected]);

  function sortByMostUsed() {
    // Stable sort: keep current order when usage is equal (0–0 included).
    const ranked = [...selected].sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0));
    setSelected(ranked);
    setHint("");
  }

  const renderSelectedItem = ({ item, drag, isActive }: RenderItemParams<BevDef>) => {
    function startDrag() {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      drag();
    }
    return (
      <ScaleDecorator>
        <View style={[cbStyles.row, cbStyles.rowSel, isActive && cbStyles.rowActive]}>
          {/* Dedicated drag area — touch starts drag immediately */}
          <TouchableOpacity
            onPressIn={startDrag}
            disabled={isActive}
            style={cbStyles.dragArea}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            activeOpacity={1}
          >
            <Text style={cbStyles.dragHandle}>≡</Text>
          </TouchableOpacity>
          {/* Rest of row — tap to remove from selection */}
          <TouchableOpacity
            onPress={() => toggle(item.key)}
            style={cbStyles.rowTapZone}
            activeOpacity={0.75}
          >
            <Text style={cbStyles.rowEmoji}>{item.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[cbStyles.rowName, { color: GOLD }]}>{item.label}</Text>
              <Text style={cbStyles.rowEff}>{Math.round(item.eff * 100)}% hydration</Text>
            </View>
            <Text style={cbStyles.check}>✓</Text>
          </TouchableOpacity>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      {visible ? (
      <View style={cbStyles.overlay}>
        <View style={cbStyles.sheet}>
          {/* Header */}
          <View style={cbStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={cbStyles.title}>Customize Your Beverages</Text>
              <Text style={cbStyles.subtitle}>Long-press a tile to drag and reorder</Text>
              <Text style={cbStyles.counter}>
                <Text style={{ color: GOLD }}>{selected.length}</Text>
                <Text style={{ color: "rgba(255,255,255,0.5)" }}> of 20 selected</Text>
              </Text>
            </View>
            <TouchableOpacity onPress={onCancel} style={cbStyles.closeBtn}>
              <Text style={cbStyles.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Action row: Select All / Clear All / Defaults / Most-used */}
          <View style={cbStyles.actionRow}>
            <TouchableOpacity
              style={cbStyles.actionBtn}
              onPress={() => { setSelected(CATEGORIES.map((b) => b.key)); setHint(""); }}
            >
              <Text style={cbStyles.actionTxt}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={cbStyles.actionBtn}
              onPress={() => { setSelected([CATEGORIES[0].key]); setHint(""); }}
            >
              <Text style={cbStyles.actionTxt}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={cbStyles.actionBtn}
              onPress={() => { setSelected([...DEFAULT_VISIBLE_BEVS]); setHint(""); }}
            >
              <Text style={cbStyles.actionTxt}>Defaults</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={cbStyles.actionBtn}
              onPress={sortByMostUsed}
            >
              <Text style={cbStyles.actionTxt}>Most-used</Text>
            </TouchableOpacity>
          </View>

          {/* Hint */}
          {hint !== "" && (
            <Text style={cbStyles.hint}>{hint}</Text>
          )}

          {/* Draggable selected list + plain unselected list as footer */}
          <View style={{ flex: 1 }}>
            <DraggableFlatList
              data={selectedBevs}
              keyExtractor={(item) => item.key}
              onDragEnd={({ data }) => setSelected(data.map((b) => b.key))}
              renderItem={renderSelectedItem}
              activationDistance={6}
              contentContainerStyle={{ paddingBottom: 12 }}
              ListFooterComponent={
                unselectedBevs.length > 0 ? (
                  <>
                    <View style={cbStyles.divider} />
                    {unselectedBevs.map((bev) => (
                      <TouchableOpacity
                        key={bev.key}
                        style={cbStyles.row}
                        onPress={() => toggle(bev.key)}
                        activeOpacity={0.75}
                      >
                        <View style={cbStyles.dragHandlePlaceholder} />
                        <Text style={cbStyles.rowEmoji}>{bev.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={cbStyles.rowName}>{bev.label}</Text>
                          <Text style={cbStyles.rowEff}>{Math.round(bev.eff * 100)}% hydration</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null
              }
            />
          </View>

          {/* Save button */}
          <View style={cbStyles.btnRow}>
            <TouchableOpacity
              style={cbStyles.saveBtn}
              onPress={() => onSave(selected)}
            >
              <Text style={cbStyles.saveTxt}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      ) : null}
    </Modal>
  );
}
const cbStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0d0030", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 2, borderColor: GOLD, paddingTop: 20, paddingHorizontal: 20, maxHeight: "88%", minHeight: "60%" },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  title: { color: GOLD, fontSize: 18, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 3 },
  counter: { fontSize: 13, fontWeight: "700", marginTop: 6 },
  closeBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  closeTxt: { color: "rgba(255,255,255,0.6)", fontSize: 18 },
  actionRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,215,0,0.35)", alignItems: "center", backgroundColor: "rgba(255,215,0,0.07)" },
  actionTxt: { color: GOLD_DIM, fontSize: 12, fontWeight: "700" },
  hint: { color: "#FF8800", fontSize: 12, fontWeight: "600", marginBottom: 8 },
  divider: { height: 1, backgroundColor: "rgba(255,215,0,0.25)", marginVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4, borderWidth: 1, borderColor: "transparent", gap: 12 },
  rowSel: { backgroundColor: "rgba(255,215,0,0.08)", borderColor: "rgba(255,215,0,0.35)" },
  rowActive: { backgroundColor: "rgba(255,215,0,0.28)", borderColor: GOLD, borderWidth: 2, shadowColor: GOLD, shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  dragArea: { width: 36, alignSelf: "stretch", alignItems: "center", justifyContent: "center", marginLeft: -4 },
  dragHandle: { color: GOLD_DIM, fontSize: 22, fontWeight: "900", letterSpacing: -2, lineHeight: 22 },
  dragHandlePlaceholder: { width: 36 },
  rowTapZone: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  rowEmoji: { fontSize: 22, width: 30, textAlign: "center" },
  rowName: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  rowEff: { color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 1 },
  check: { color: GOLD, fontSize: 18, fontWeight: "800" },
  btnRow: { paddingVertical: 16 },
  saveBtn: { paddingVertical: 14, borderRadius: 12, backgroundColor: GOLD, alignItems: "center" },
  saveTxt: { color: "#000000", fontSize: 14, fontWeight: "800" },
});

// --- Beverage Selector ---
// Returns sizing config based on total visible count (bevs + Custom button)
function getBevSizing(total: number): { emojiSize: number; labelSize: number; padV: number } {
  if (total <= 3)  return { emojiSize: 30, labelSize: 14, padV: 12 };
  if (total <= 6)  return { emojiSize: 24, labelSize: 12, padV: 10 };
  if (total <= 10) return { emojiSize: 20, labelSize: 11, padV: 8  };
  return           { emojiSize: 16, labelSize: 10, padV: 6  };
}

function BeverageSelector({
  selected, onSelect, visibleBevs, onEditBevs, isPro,
}: {
  selected: BevCategory;
  onSelect: (c: BevCategory) => void;
  visibleBevs: BevCategory[];
  onEditBevs: () => void;
  isPro: boolean;
}) {
  const bevs = visibleBevs.map(getBev);
  // +1 for the Custom button
  const totalSlots = bevs.length + 1;
  const sizing = getBevSizing(totalSlots);

  // Layout rules (number of items per row determines width %)
  // 1–4 total: single row → each item fills 1/total width
  // 5–12 total: wrap grid, max 4 per row
  // 13+ total: horizontal scroll
  const useScroll = totalSlots >= 13;
  // "23%" works for 4 per row; compute dynamically for fewer
  const btnWidthPct = totalSlots <= 4 ? `${Math.floor(100 / totalSlots) - 2}%` : "23%";

  function renderBtn(key: string, emoji: string, label: string, isCustom = false) {
    const bev = isCustom ? null : getBev(key);
    const isSel = !isCustom && key === selected;
    return (
      <TouchableOpacity
        key={key}
        style={[
          bvStyles.btn,
          { width: btnWidthPct as any, paddingVertical: sizing.padV },
          isSel && bev ? { borderColor: bev.color, backgroundColor: bev.color + "22" } : null,
          isCustom ? bvStyles.customBtn : null,
        ]}
        onPress={() => {
          playButtonTapSound();
          if (isCustom) { onEditBevs(); }
          else { onSelect(key as BevCategory); }
        }}
        activeOpacity={0.8}
      >
        {isCustom && !isPro && (
          <View style={{
            position: "absolute", top: -6, right: -6, zIndex: 10,
            backgroundColor: GOLD, borderRadius: 5,
            paddingHorizontal: 5, paddingVertical: 2,
          }}>
            <Text style={{ color: "#0a0520", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 }}>PRO</Text>
          </View>
        )}
        <Text style={{ fontSize: sizing.emojiSize }}>{emoji}</Text>
        <Text
          style={[bvStyles.name, { fontSize: sizing.labelSize }, isSel && bev ? { color: bev.color } : null]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  const allButtons = [
    ...bevs.map((cat) => renderBtn(cat.key, cat.emoji, cat.label)),
    renderBtn("__custom__", "⭐", "Custom", true),
  ];

  return (
    <View style={bvStyles.wrapper}>
      <View style={bvStyles.labelRow}>
        <Text style={bvStyles.sectionLabel}>SELECT A BEVERAGE</Text>
      </View>
      {useScroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
          {allButtons}
        </ScrollView>
      ) : (
        <View style={bvStyles.grid}>
          {allButtons}
        </View>
      )}
    </View>
  );
}
const bvStyles = StyleSheet.create({
  wrapper: { marginHorizontal: 12, marginTop: 10 },
  labelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  sectionLabel: { flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "700", letterSpacing: 0.8 },
  editBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,215,0,0.18)", borderWidth: 1, borderColor: "rgba(255,215,0,0.45)", alignItems: "center", justifyContent: "center" },
  editTxt: { fontSize: 17, lineHeight: 22 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  btn: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", minWidth: 52 },
  customBtn: { borderColor: "rgba(255,215,0,0.35)", borderStyle: "dashed", backgroundColor: "rgba(255,255,255,0.06)" },
  name: { color: "#ffffff", fontWeight: "600", marginTop: 2, textAlign: "center" },
});

// --- Quick Bet Buttons ---
function QuickBets({ onBet, spinning, amounts, preferredUnit }: { onBet: (oz: number) => void; spinning: boolean; amounts: number[]; preferredUnit: 'oz' | 'ml' }) {
  return (
    <View style={qbStyles.wrapper}>
      <View style={qbStyles.grid}>
        {amounts.map((oz, i) => {
          const ozText = `${formatOz(oz)} oz`;
          const mlText = `${ozToMl(oz)} ml`;
          const primary = preferredUnit === 'oz' ? ozText : mlText;
          const secondary = preferredUnit === 'oz' ? mlText : ozText;
          return (
            <TouchableOpacity key={i} style={[qbStyles.btn, spinning && qbStyles.dis]} onPress={() => { if (!spinning) { playButtonTapSound(); onBet(oz); } }} activeOpacity={0.8}>
              <Text style={qbStyles.ozTxt}>{primary}</Text>
              <Text style={qbStyles.mlTxt}>{secondary}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
const qbStyles = StyleSheet.create({
  wrapper: { marginHorizontal: 12, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  btn: { width: "31%", backgroundColor: "rgba(80,0,160,0.4)", borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(120,0,220,0.6)" },
  customBtn: { borderColor: GOLD, backgroundColor: "rgba(255,215,0,0.12)" },
  dis: { opacity: 0.45 },
  ozTxt: { fontSize: 15, fontWeight: "800", color: "#ffffff" },
  mlTxt: { fontSize: 11, color: "rgba(230,230,230,0.85)", marginTop: 2 },
});

// --- Quick Add Customization Modal ---
interface QuickAddCustomModalProps {
  visible: boolean;
  currentAmounts: number[];
  onSave: (amounts: number[]) => void;
  onCancel: () => void;
}
function QuickAddCustomModal({ visible, currentAmounts, onSave, onCancel }: QuickAddCustomModalProps) {
  const [drafts, setDrafts] = useState<string[]>(currentAmounts.map(String));
  const [focused, setFocused] = useState<number | null>(null);
  const inputRefs = useRef<(import("react-native").TextInput | null)[]>([]);

  // Sync drafts when modal opens
  useEffect(() => {
    if (visible) setDrafts(currentAmounts.map((oz) => formatOz(oz)));
  }, [visible, currentAmounts]);

  function setSlot(i: number, val: string) {
    setDrafts((prev) => { const next = [...prev]; next[i] = val; return next; });
  }

  function resetSlot(i: number) {
    setDrafts((prev) => { const next = [...prev]; next[i] = formatOz(QUICK_ADD_DEFAULTS[i]); return next; });
  }

  function resetAll() {
    setDrafts(QUICK_ADD_DEFAULTS.map(formatOz));
  }

  function isValid(val: string): boolean {
    const n = parseFloat(val);
    return !isNaN(n) && n >= 1 && n <= 128;
  }

  function handleSave() {
    if (drafts.every(isValid)) {
      onSave(drafts.map((v) => parseFloat(v)));
    }
  }

  function applyPreset(oz: number) {
    const slot = focused ?? 0;
    setSlot(slot, formatOz(oz));
  }

  const allValid = drafts.every(isValid);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalBox, { paddingVertical: 0, paddingHorizontal: 0, overflow: "hidden" }]}>
                {/* Header */}
                <View style={{ backgroundColor: "#1a0a3a", paddingTop: 18, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,215,0,0.2)" }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ color: GOLD, fontSize: 18, fontWeight: "800", flex: 1 }}>✏️ Customize Quick Add</Text>
                    <TouchableOpacity onPress={onCancel} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 20, lineHeight: 22 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 4 }}>Tap a slot to edit, then tap a preset to fill it</Text>
                </View>

                <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>

                    {/* Slot rows */}
                    {drafts.map((val, i) => {
                      const isFocused = focused === i;
                      const valid = isValid(val);
                      const mlVal = valid ? `${ozToMl(parseFloat(val))} ml` : "—";
                      return (
                        <View key={i} style={{ marginBottom: 10 }}>
                          <View style={{
                            flexDirection: "row", alignItems: "center",
                            backgroundColor: "rgba(255,215,0,0.08)",
                            borderRadius: 12, borderWidth: 1.5,
                            borderColor: isFocused ? "#c8a000" : (valid ? "rgba(200,160,0,0.35)" : "#FF6B6B"),
                            paddingHorizontal: 12,
                            minHeight: 52,
                          }}>
                            <Text style={{ color: "#c8a000", fontSize: 12, fontWeight: "700", width: 48 }}>Slot {i + 1}</Text>
                            <TextInput
                              ref={(r) => { inputRefs.current[i] = r; }}
                              value={val}
                              onChangeText={(t) => setSlot(i, t)}
                              onFocus={() => setFocused(i)}
                              onBlur={() => setFocused((f) => f === i ? null : f)}
                              keyboardType="decimal-pad"
                              style={{ flex: 1, color: "#1a1a2e", fontSize: 18, fontWeight: "700", paddingVertical: 10 }}
                              selectTextOnFocus
                              returnKeyType="done"
                              placeholderTextColor="#aaaaaa"
                            />
                            <Text style={{ color: "#888888", fontSize: 12, marginRight: 10, minWidth: 54, textAlign: "right" }}>{mlVal}</Text>
                            <TouchableOpacity onPress={() => resetSlot(i)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.08)", alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ color: "#888888", fontSize: 13, lineHeight: 16 }}>✕</Text>
                            </TouchableOpacity>
                          </View>
                          {!valid && val.length > 0 && (
                            <Text style={{ color: "#CC2200", fontSize: 11, marginTop: 3, marginLeft: 4 }}>Enter a value between 1 and 128 oz</Text>
                          )}
                        </View>
                      );
                    })}

                    {/* Popular Sizes */}
                    <View style={{ marginTop: 8, marginBottom: 4 }}>
                      <Text style={{ color: "#c8a000", fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginBottom: 10 }}>
                        POPULAR SIZES{focused !== null ? `  →  filling Slot ${focused + 1}` : "  (tap a slot to select it)"}
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                        {POPULAR_PRESETS.map((p) => (
                          <TouchableOpacity
                            key={p.oz}
                            onPress={() => applyPreset(p.oz)}
                            activeOpacity={0.7}
                            style={{
                              borderRadius: 20, borderWidth: 1.5,
                              borderColor: "#c8a000",
                              backgroundColor: "rgba(255,215,0,0.07)",
                              paddingHorizontal: 12, paddingVertical: 6,
                              alignItems: "center",
                            }}>
                            <Text style={{ color: "#c8a000", fontSize: 13, fontWeight: "700" }}>{p.label}</Text>
                            <Text style={{ color: "#999999", fontSize: 9, marginTop: 1 }}>{p.sub}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Reset All */}
                    <TouchableOpacity onPress={resetAll}
                      style={{ alignSelf: "flex-start", borderWidth: 1.5, borderColor: "#c8a000", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, marginTop: 14, marginBottom: 6, backgroundColor: "transparent" }}>
                      <Text style={{ color: "#c8a000", fontSize: 13, fontWeight: "700" }}>↺ Reset All to Defaults</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>

                {/* iOS Done toolbar */}
                {Platform.OS === "ios" && (
                  <View style={{ backgroundColor: "#f0f0f0", flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#dddddd" }}>
                    <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}>
                      <Text style={{ color: "#c8a000", fontSize: 15, fontWeight: "700" }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Action buttons */}
                <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "rgba(200,160,0,0.2)" }}>
                  <TouchableOpacity onPress={onCancel} style={{ flex: 1, height: 50, borderRadius: 14, backgroundColor: "#EEEEEE", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#555555", fontSize: 16, fontWeight: "600" }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSave} disabled={!allValid} style={{ flex: 2, height: 50, borderRadius: 14, backgroundColor: allValid ? "#c8a000" : "rgba(200,160,0,0.25)", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: allValid ? "#ffffff" : "#aaaaaa", fontSize: 16, fontWeight: "800" }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --- Result Box ---
function ResultBox({ message }: { message: string | null }) {
  const rawOzMatch = message?.match(/\+([\d.]+) oz/);
  const rawOzNum = rawOzMatch ? parseFloat(rawOzMatch[1]) : 0;
  const isJackpot = !!message?.includes("GOAL");
  return (
    <View style={[rbStyles.wrapper, !message && rbStyles.wrapperIdle]}>
      <Text style={message ? rbStyles.result : rbStyles.idle}>
        {message ?? "Select your drink and tap an amount to reveal hydration"}
      </Text>
      {message && (
        <Text style={rbStyles.sub}>
          {isJackpot
            ? `${rawOzNum} oz (${ozToMl(rawOzNum)} ml) • tank is full! 🏆`
            : `${rawOzNum} oz (${ozToMl(rawOzNum)} ml) consumed • tank is filling up!`}
        </Text>
      )}
    </View>
  );
}
const rbStyles = StyleSheet.create({
  wrapper: { marginHorizontal: 12, marginTop: 10, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(255,215,0,0.3)", minHeight: 58, justifyContent: "center" },
  wrapperIdle: { backgroundColor: "rgba(0,0,0,0.2)", borderColor: "rgba(255,255,255,0.1)" },
  idle: { color: "rgba(255,255,255,0.35)", fontSize: 14, textAlign: "center", fontStyle: "italic", fontWeight: "500" },
  result: { color: GOLD, fontSize: 16, fontWeight: "700", textAlign: "center" },
  sub: { color: "rgba(255,255,255,0.8)", fontSize: 13, textAlign: "center", marginTop: 4 },
});

// --- Stats Bar ---
function StatsBar({
  goal: statGoal,
  hydration,
  intake: statIntake,
  streak,
  healthActive,
  onHealthPress,
  preferredUnit,
}: {
  goal: number;
  hydration: number;
  intake: number;
  streak: number;
  healthActive: boolean;
  onHealthPress: () => void;
  preferredUnit: 'oz' | 'ml';
}) {
  const consumedOz = `${statIntake.toFixed(1)} oz`;
  const consumedMl = `${ozToMl(statIntake)} ml`;
  const goalLabel = preferredUnit === 'ml' ? `${ozToMl(statGoal)} ml` : `${Math.round(statGoal)} oz`;
  const hydratedLabel = preferredUnit === 'ml' ? `${ozToMl(hydration)} ml` : `${hydration.toFixed(1)} oz`;
  const hydratedPct = Math.round((statGoal > 0 ? hydration / statGoal : 0) * 100);
  const secs = [
    { label: "DAILY GOAL", val: goalLabel },
    { label: "HYDRATED", val: `${hydratedLabel}\n${hydratedPct}%` },
    { label: "CONSUMED", val: preferredUnit === 'oz' ? `${consumedOz}\n${consumedMl}` : `${consumedMl}\n${consumedOz}` },
    { label: "STREAK", val: streak > 0 ? `${streak} 🔥` : "0" },
  ];
  return (
    <View style={stbStyles.bar}>
      {secs.map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <View style={stbStyles.div} />}
          <View style={stbStyles.sec}>
            <View style={stbStyles.lblRow}>
              <Text style={stbStyles.lbl}>{s.label}</Text>
              {s.label === "HYDRATED" && (
                <TouchableOpacity onPress={onHealthPress} hitSlop={{ top: 17, bottom: 17, left: 17, right: 17 }}>
                  <Text style={[stbStyles.heart, { color: healthActive ? "#FF3B30" : "rgba(255,255,255,0.25)" }]}>♥</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={stbStyles.val}>{s.val}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}
const stbStyles = StyleSheet.create({
  bar: { flexDirection: "row", marginHorizontal: 12, marginTop: 10, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,215,0,0.3)", overflow: "hidden" },
  sec: { flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 2 },
  div: { width: 1, backgroundColor: "rgba(255,215,0,0.3)", marginVertical: 8 },
  lblRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 },
  lbl: { fontSize: 12, fontWeight: "800", color: GOLD, letterSpacing: 0.5, textAlign: "center" },
  val: { fontSize: 13, fontWeight: "700", color: "#ffffff", textAlign: "center" },
  heart: { fontSize: 13, fontWeight: "900" },
});

// --- Drink Log ---
function DrinkLog({ breakdown, intake: dlIntake, entries: logEntries = [], preferredUnit }: {
  breakdown: Record<BevCategory, number>;
  intake: number;
  entries?: DrinkEntry[];
  preferredUnit: 'oz' | 'ml';
}) {
  const { colors, isDark } = useTheme();
  const catEntries = CATEGORIES.filter((c) => breakdown[c.key] > 0);
  return (
    <View style={[dlStyles.wrapper, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
      <Text style={[dlStyles.title, { color: colors.gold }]}>DRINK LOG</Text>
      {catEntries.length === 0
        ? <Text style={[dlStyles.empty, { color: colors.textMuted }]}>No drinks logged yet — tap an amount to log your first drink!</Text>
        : catEntries.map((cat) => {
            const raw = breakdown[cat.key];
            const hyd = calcHydratedOz(raw, cat.key);
            const share = dlIntake > 0 ? Math.round((raw / dlIntake) * 100) : 0;
            return (
              <View key={cat.key} style={dlStyles.row}>
                <View style={[dlStyles.dot, { backgroundColor: cat.color }]} />
                <Text style={[dlStyles.name, { color: colors.text }]}>{cat.emoji} {cat.label}</Text>
                <Text style={[dlStyles.raw, { color: colors.textSub }]}>{preferredUnit === 'ml' ? `${ozToMl(raw)} ml` : `${raw.toFixed(1)} oz`}</Text>
                <Text style={[dlStyles.effTxt, { color: colors.textMuted }]}>{Math.round(getBev(cat.key).eff * 100)}%</Text>
                <Text style={[dlStyles.hyd, { color: isDark ? "#88ccff" : "#0066cc" }]}>→{preferredUnit === 'ml' ? `${ozToMl(hyd)}ml` : `${hyd.toFixed(1)}oz`}</Text>
                <Text style={[dlStyles.share, { color: cat.color }]}>{share}%</Text>
              </View>
            );
          })
      }

      {/* Individual entries with timestamps */}
      {logEntries.length > 0 && (
        <>
          <View style={[dlStyles.entriesDivider, { backgroundColor: colors.divider }]} />
          <Text style={[dlStyles.entriesLabel, { color: colors.textMuted }]}>RECENT ENTRIES</Text>
          {[...logEntries].reverse().map((e, i) => {
            const cat = CATEGORIES.find((c) => c.key === e.category) ?? CATEGORIES[0];
            return (
              <View key={i} style={dlStyles.entryRow}>
                <View style={[dlStyles.dot, { backgroundColor: cat.color }]} />
                <Text style={[dlStyles.entryText, { color: colors.text }]}>
                  {cat.emoji} {preferredUnit === 'ml' ? `${ozToMl(e.oz)} ml` : `${formatOz(e.oz)} oz`} {cat.label}
                </Text>
                <Text style={[dlStyles.entryTime, { color: colors.textMuted }]}>
                  {formatEntryTime(e.timestamp)}
                </Text>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}
const dlStyles = StyleSheet.create({
  wrapper: { marginHorizontal: 12, marginTop: 10, borderRadius: 12, padding: 12, borderWidth: 1 },
  title: { fontSize: 12, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  empty: { fontSize: 14, fontStyle: "italic", textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  name: { flex: 1, fontSize: 13 },
  raw: { fontSize: 12, width: 44, textAlign: "right" },
  effTxt: { fontSize: 12, width: 32, textAlign: "center" },
  hyd: { fontSize: 12, width: 54, textAlign: "right" },
  share: { fontSize: 13, fontWeight: "700", width: 34, textAlign: "right" },
  entriesDivider: { height: 1, marginVertical: 8 },
  entriesLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 6 },
  entryRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 },
  entryText: { flex: 1, fontSize: 13 },
  entryTime: { fontSize: 12, textAlign: "right" },
});

const undoStyles = StyleSheet.create({
  btn: {
    marginHorizontal: 12, marginTop: 8, paddingVertical: 13, paddingHorizontal: 16,
    borderRadius: 12, backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1.5, borderColor: GOLD_DIM, alignItems: "center",
  },
  btnDisabled: { borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(0,0,0,0.2)" },
  btnText: { color: GOLD, fontSize: 15, fontWeight: "700" },
  btnTextDisabled: { color: "rgba(255,255,255,0.35)", fontStyle: "italic", fontWeight: "500", fontSize: 14 },
});

// --- Entry Time Formatter ---
function formatEntryTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

// --- Goal Celebration ---
const FW_COLORS = [
  ["#FFD700", "#FFA500", "#FFE566"],
  ["#00aaff", "#44ccff", "#0066cc"],
  ["#00ff88", "#44ffaa", "#00cc66"],
  ["#ff44aa", "#ff88cc", "#cc0066"],
  ["#ffffff", "#eeeeee", "#aaaaaa"],
  ["#aa44ff", "#cc88ff", "#7700cc"],
];

// Reanimated firework. Each particle owns its own sharedValues and animations
// run on the UI thread, bypassing RCTNativeAnimatedTurboModule entirely.
// That module's flushOperationQueues was the crash site in Build 3 (SIGSEGV
// inside convertNSExceptionToJSError) — see crash log incident 5890CCFA.
const FW_POOL_SIZE = 120;
const PER_VOLLEY = 10;

type ParticleHandle = {
  fire: (originX: number, originY: number, dx: number, dy: number, color: string, size: number) => void;
  reset: () => void;
};

const Particle = React.forwardRef<ParticleHandle>((_, ref) => {
  const x = useSharedValue(-9999);
  const y = useSharedValue(-9999);
  const op = useSharedValue(0);
  const size = useSharedValue(3);
  const color = useSharedValue<string>('#FFD700');

  useImperativeHandle(ref, () => ({
    fire(originX, originY, dx, dy, c, s) {
      cancelAnimation(x);
      cancelAnimation(y);
      cancelAnimation(op);
      size.value = s;
      color.value = c;
      x.value = originX;
      y.value = originY;
      op.value = 1;
      x.value = withTiming(originX + dx, { duration: 900, easing: REasing.out(REasing.cubic) });
      y.value = withSequence(
        withTiming(originY + dy, { duration: 500, easing: REasing.out(REasing.quad) }),
        withTiming(originY + dy + 80 + Math.random() * 60, { duration: 400, easing: REasing.in(REasing.quad) }),
      );
      op.value = withDelay(300, withTiming(0, { duration: 600 }));
    },
    reset() {
      cancelAnimation(x);
      cancelAnimation(y);
      cancelAnimation(op);
      op.value = 0;
    },
  }), [x, y, op, size, color]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    backgroundColor: color.value,
    width: size.value,
    height: size.value,
    borderRadius: size.value / 2,
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return <Reanimated.View pointerEvents="none" style={[jpStyles.particleBase, animStyle]} />;
});
Particle.displayName = 'CelebrationParticle';

function GoalCelebration({ visible, goal: jpGoal, onDismiss }: { visible: boolean; goal: number; onDismiss: () => void }) {
  const goalTime = useRef("");
  const screenW = Dimensions.get("window").width;
  const screenH = Dimensions.get("window").height;

  const particleRefs = useRef<Array<ParticleHandle | null>>([]);
  if (particleRefs.current.length === 0) {
    particleRefs.current = Array(FW_POOL_SIZE).fill(null);
  }
  const poolIdx = useRef(0);
  const fwTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fwLoopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissed = useRef(false);

  const fade = useSharedValue(0);
  const pulse = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  function clearFwTimers() {
    fwTimers.current.forEach(clearTimeout);
    fwTimers.current = [];
    if (fwLoopTimer.current) {
      clearTimeout(fwLoopTimer.current);
      fwLoopTimer.current = null;
    }
  }

  function resetAllParticles() {
    for (const p of particleRefs.current) p?.reset();
  }

  function fireVolley(positions: { x: number; y: number }[], colorOffset: number) {
    positions.forEach(({ x: vx, y: vy }, posIdx) => {
      const palette = FW_COLORS[(colorOffset + posIdx) % FW_COLORS.length];
      for (let j = 0; j < PER_VOLLEY; j++) {
        const p = particleRefs.current[poolIdx.current % FW_POOL_SIZE];
        poolIdx.current++;
        if (!p) continue;
        const angle = (j / PER_VOLLEY) * Math.PI * 2;
        const speed = 60 + Math.random() * 120;
        const dx = Math.cos(angle) * speed;
        const dy = Math.sin(angle) * speed - (40 + Math.random() * 40);
        const c = palette[Math.floor(Math.random() * palette.length)];
        const s = 2 + Math.random() * 3;
        p.fire(vx, vy, dx, dy, c, s);
      }
    });
  }

  function startFireworks() {
    if (dismissed.current) return;
    poolIdx.current = 0;

    const left = screenW * 0.2;
    const center = screenW * 0.5;
    const right = screenW * 0.8;
    const topY = screenH * 0.15;
    const midY = screenH * 0.28;
    const highY = screenH * 0.22;

    fireVolley([{ x: left, y: topY }, { x: center, y: midY }, { x: right, y: topY }], 0);

    fwTimers.current.push(setTimeout(() => {
      if (!dismissed.current)
        fireVolley([{ x: screenW * 0.35, y: highY }, { x: screenW * 0.65, y: topY }, { x: center, y: screenH * 0.32 }], 2);
    }, 600));

    fwTimers.current.push(setTimeout(() => {
      if (!dismissed.current)
        fireVolley([
          { x: left * 0.6, y: midY }, { x: left, y: topY },
          { x: right, y: midY }, { x: right * 1.1, y: topY },
        ], 4);
    }, 1200));

    fwLoopTimer.current = setTimeout(() => {
      if (!dismissed.current) startFireworks();
    }, 2800);
  }

  useEffect(() => {
    dismissed.current = false;
    if (visible) {
      const now = new Date();
      const h = now.getHours(); const m = now.getMinutes().toString().padStart(2, "0");
      goalTime.current = `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
      fade.value = withTiming(1, { duration: 400 });
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 550 }),
          withTiming(0.95, { duration: 550 }),
        ),
        -1,
        true,
      );
      startFireworks();
    }
    return () => {
      dismissed.current = true;
      clearFwTimers();
      cancelAnimation(fade);
      cancelAnimation(pulse);
      resetAllParticles();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function dismiss() {
    dismissed.current = true;
    clearFwTimers();
    cancelAnimation(pulse);
    resetAllParticles();
    fade.value = withTiming(0, { duration: 300 }, (finished) => {
      'worklet';
      if (finished) runOnJS(onDismiss)();
    });
  }

  if (!visible) return null;

  return (
    <Reanimated.View style={[jpStyles.overlay, fadeStyle]} pointerEvents="box-none">
      {Array.from({ length: FW_POOL_SIZE }).map((_, i) => (
        <Particle key={i} ref={(r) => { particleRefs.current[i] = r; }} />
      ))}
      <View style={jpStyles.card}>
        <Reanimated.Text style={[jpStyles.jackpotText, pulseStyle]}>
          🎆 HYDRO HERO!
        </Reanimated.Text>
        <Text style={jpStyles.emojiRow}>🎆🎇✨🏆💧🎆</Text>
        <Text style={jpStyles.mainText}>Goal reached! Congratulations on hitting your daily goal!</Text>
        <Text style={jpStyles.subText}>{Math.round(jpGoal)} oz / {ozToMl(jpGoal)} ml</Text>
        <Text style={jpStyles.timeText}>Reached at {goalTime.current}</Text>
        <TouchableOpacity style={jpStyles.claimBtn} onPress={dismiss} activeOpacity={0.85}>
          <Text style={jpStyles.claimText}>Awesome!</Text>
        </TouchableOpacity>
      </View>
    </Reanimated.View>
  );
}
const jpStyles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,10,0.94)", zIndex: 9999, alignItems: "center", justifyContent: "center" },
  particleBase: { position: "absolute" },
  card: { backgroundColor: "#0a0030", borderWidth: 2, borderColor: GOLD, borderRadius: 24, padding: 28, alignItems: "center", width: "86%", zIndex: 10000, shadowColor: GOLD, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 20 },
  jackpotText: { fontSize: 40, fontWeight: "900", color: GOLD, letterSpacing: 4, marginBottom: 10, textShadowColor: GOLD_DIM, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  emojiRow: { fontSize: 26, letterSpacing: 4, marginBottom: 12 },
  mainText: { fontSize: 15, color: "#ffffff", fontWeight: "700", textAlign: "center", marginBottom: 8 },
  subText: { fontSize: 18, color: GOLD, fontWeight: "800", marginBottom: 4 },
  timeText: { fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 20 },
  claimBtn: { backgroundColor: GOLD, borderRadius: 16, paddingHorizontal: 32, paddingVertical: 14 },
  claimText: { color: "#000000", fontSize: 16, fontWeight: "900", letterSpacing: 1 },
});

// ─── Confetti + Streak Milestone Card ────────────────────────────────────────
const CONFETTI_COLORS = ["#FFD700", "#0088ff", "#00cc66", "#ff4444", "#ff8800", "#cc44ff"];
const CONFETTI_COUNT = 60;

interface ConfettiParticle {
  x: Animated.Value;
  y: Animated.Value;
  rot: Animated.Value;
  opacity: Animated.Value;
  color: string;
  driftX: number;
}


const MILESTONE_MESSAGES: Record<number, string> = {
  3: "You're on fire! Keep it up!",
  7: "One full week! You're a hydration hero!",
  14: "Two weeks strong! Unstoppable!",
  30: "30 days! You're a Hydro Hero legend!",
};

function StreakMilestoneCard({
  milestone,
  onDismiss,
}: {
  milestone: number | null;
  onDismiss: () => void;
}) {
  const screenW = Dimensions.get("window").width;
  const screenH = Dimensions.get("window").height;
  // Pool: create all 60 confetti values once, reset + reuse per milestone
  const particles = useRef<ConfettiParticle[]>(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(-20),
      rot: new Animated.Value(0),
      opacity: new Animated.Value(0),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      driftX: (Math.random() - 0.5) * 120,
    }))
  );
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (milestone === null) {
      setVisible(false);
      return;
    }
    // Reset pool particles to starting positions with new random properties
    particles.current.forEach((p) => {
      p.x.stopAnimation(); p.y.stopAnimation();
      p.rot.stopAnimation(); p.opacity.stopAnimation();
      p.color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      p.driftX = (Math.random() - 0.5) * 120;
      const startX = Math.random() * screenW;
      p.x.setValue(startX);
      p.y.setValue(-20);
      p.rot.setValue(0);
      p.opacity.setValue(1);
    });
    setVisible(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();

    const anims = particles.current.map((p) => {
      const duration = 2200 + Math.random() * 800;
      const startX = (p.x as any)._value as number;
      return Animated.parallel([
        Animated.timing(p.y, { toValue: screenH + 30, duration, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
        Animated.timing(p.x, { toValue: startX + p.driftX, duration, useNativeDriver: true, easing: Easing.linear }),
        Animated.timing(p.rot, { toValue: (Math.random() - 0.5) * 720, duration, useNativeDriver: true, easing: Easing.linear }),
        Animated.sequence([
          Animated.delay(duration * 0.6),
          Animated.timing(p.opacity, { toValue: 0, duration: duration * 0.4, useNativeDriver: true }),
        ]),
      ]);
    });
    Animated.parallel(anims).start();

    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach(clearTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestone]);

  if (!visible || milestone === null) return null;

  function handleDismiss() {
    Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      setVisible(false);
      onDismiss();
    });
  }

  return (
    <Animated.View
      style={[milestoneStyles.overlay, { opacity: fadeAnim }]}
      pointerEvents="box-none"
    >
      {/* Confetti particles */}
      {particles.current.map((p, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: "absolute",
            width: 6,
            height: 10,
            borderRadius: 2,
            backgroundColor: p.color,
            opacity: p.opacity,
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              { rotate: p.rot.interpolate({ inputRange: [-720, 720], outputRange: ["-720deg", "720deg"] }) },
            ],
          }}
        />
      ))}

      {/* Milestone card */}
      <View style={milestoneStyles.card}>
        <Text style={milestoneStyles.flame}>🔥</Text>
        <Text style={milestoneStyles.streakText}>{milestone} DAY STREAK!</Text>
        <Text style={milestoneStyles.message}>{MILESTONE_MESSAGES[milestone] ?? "Amazing streak! Keep it going!"}</Text>
        <TouchableOpacity style={milestoneStyles.dismissBtn} onPress={handleDismiss} activeOpacity={0.85}>
          <Text style={milestoneStyles.dismissText}>Keep Going! 💧</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const milestoneStyles = StyleSheet.create({
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,10,0.75)", zIndex: 9990,
    alignItems: "center", justifyContent: "center",
  },
  card: {
    backgroundColor: "#1a0a00", borderWidth: 2.5, borderColor: GOLD,
    borderRadius: 24, padding: 28, alignItems: "center", width: "82%",
    shadowColor: GOLD, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 20,
  },
  flame: { fontSize: 56, marginBottom: 8 },
  streakText: { fontSize: 30, fontWeight: "900", color: GOLD, letterSpacing: 2, textAlign: "center", marginBottom: 12 },
  message: { fontSize: 16, color: "#ffffff", textAlign: "center", lineHeight: 23, marginBottom: 24 },
  dismissBtn: { backgroundColor: GOLD, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  dismissText: { color: "#000000", fontSize: 16, fontWeight: "800" },
});


// ─── Hydration Fact / Joke Card ───────────────────────────────────────────────
const HYDRATION_FACTS = [
  "Your brain is 73% water — staying hydrated keeps you sharper!",
  "Drinking water can boost your metabolism by up to 30%!",
  "Even mild dehydration can affect your mood and energy levels",
  "Water helps your kidneys flush out toxins every single day",
  "Drinking water before meals can help you eat less",
  "Your muscles are 79% water — hydration = better performance",
  "Water carries nutrients and oxygen to your cells",
  "Staying hydrated can reduce headaches significantly",
  "Your blood is 90% water — keep it flowing!",
  "Drinking water can improve your skin's elasticity",
  "Hydration helps regulate your body temperature",
  "Water lubricates your joints — essential for active people",
  "Drinking enough water improves kidney function",
  "Proper hydration can improve your sleep quality",
  "Your body loses 2–3 liters of water daily through breathing and sweating",
];

const WATER_JOKES = [
  "Why did the water win an award? Because it was outstanding in its field — a water field!",
  "What do you call a snowman in summer? A puddle who forgot to hydrate!",
  "Why is water so good at math? It knows all the fluid dynamics!",
  "What did the ocean say to the glass of water? Nothing — it just waved!",
  "Why don't fish get thirsty? They are always in the swim of things!",
  "What do you call water that is good at music? A well-tempered fluid!",
  "Why did the glass of water go to school? To become a little more refined!",
  "What is a shark's favorite drink? Whatever is on tap!",
  "Why did the hydrated person win the race? They were running on full!",
  "What do you call a belt made of water bottles? A waist of water!",
];

function FactJokeCard({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const slideAnim = useRef(new Animated.Value(200)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [content, setContent] = useState<{ text: string; type: "fact" | "joke" } | null>(null);

  useEffect(() => {
    if (visible) {
      const isFact = Math.random() < 0.6;
      if (isFact) {
        setContent({ type: "fact", text: HYDRATION_FACTS[Math.floor(Math.random() * HYDRATION_FACTS.length)] });
      } else {
        setContent({ type: "joke", text: WATER_JOKES[Math.floor(Math.random() * WATER_JOKES.length)] });
      }
      slideAnim.setValue(200);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true, easing: Easing.out(Easing.back(1.2)) }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
      autoTimer.current = setTimeout(() => onDismiss(), 4000);
    } else {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    }
    return () => { if (autoTimer.current) clearTimeout(autoTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible || !content) return null;

  return (
    <View style={factStyles.overlay} pointerEvents="box-none">
      <Animated.View
        style={[factStyles.card, { transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}
      >
        <TouchableOpacity activeOpacity={0.95} onPress={onDismiss} style={{ alignItems: "center", width: "100%" }}>
          <Text style={factStyles.icon}>{content.type === "fact" ? "💡" : "😂"}</Text>
          <Text style={factStyles.label}>{content.type === "fact" ? "DID YOU KNOW?" : "WATER JOKE!"}</Text>
          <Text style={factStyles.text}>{content.text}</Text>
          <Text style={factStyles.hint}>Tap to dismiss</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const factStyles = StyleSheet.create({
  overlay: {
    position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 9998,
    alignItems: "center", paddingBottom: 40,
  },
  card: {
    backgroundColor: "#0d0030", borderWidth: 2, borderColor: GOLD,
    borderRadius: 20, padding: 24, marginHorizontal: 16, alignItems: "center",
    shadowColor: GOLD, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 20,
  },
  icon: { fontSize: 36, marginBottom: 8 },
  label: { fontSize: 11, fontWeight: "800", color: GOLD, letterSpacing: 1.5, marginBottom: 10 },
  text: { fontSize: 14, color: "#ffffff", textAlign: "center", lineHeight: 21, marginBottom: 14 },
  hint: { fontSize: 11, color: "rgba(255,255,255,0.4)" },
});

export default function WaterTracker() {
  const tabBarHeight = useBottomTabBarHeight();
  const { isPro, openPaywall, checkProStatus } = useProContext();
  const [intake, setIntake] = useState(0);
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [history, setHistory] = useState<
    { date: string; oz: number; goal: number; breakdown?: Record<BevCategory, number> }[]
  >([]);
  const [customAmount, setCustomAmount] = useState("");
  const [customUnit, setCustomUnit] = useState<"oz" | "ml">("oz");
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [lastEntry, setLastEntry] = useState<number | null>(null);
  const [newGoal, setNewGoal] = useState("");

  // Goal modal tab state
  const [goalTab, setGoalTab] = useState<"custom" | "gallon" | "suggested">("custom");

  // Suggested tab state
  const [suggWeightLbs, setSuggWeightLbs] = useState(150);
  const [suggFeet, setSuggFeet] = useState(5);
  const [suggInches, setSuggInches] = useState(7);
  const [suggActivity, setSuggActivity] = useState<"sedentary" | "moderate" | "active">("sedentary");
  const [weightMode, setWeightMode] = useState<"scroll" | "type">("scroll");
  const [heightMode, setHeightMode] = useState<"scroll" | "type">("scroll");
  const [typeWeight, setTypeWeight] = useState("");
  const [typeFeet, setTypeFeet] = useState("");
  const [typeInches, setTypeInches] = useState("");
  const [kbHeight, setKbHeight] = useState(0);
  const KB_ACCESSORY_ID = "modal-kb-done";
  const CUSTOM_ACCESSORY_ID = "custom-kb-done";

  const [pendingOz, setPendingOz] = useState<number | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryBreakdown, setCategoryBreakdown] = useState<Record<BevCategory, number>>(EMPTY_BREAKDOWN);
  const [lastEntryCategory, setLastEntryCategory] = useState<BevCategory | null>(null);
  const [totalHydration, setTotalHydration] = useState(0);
  const [lastEntryHydratedOz, setLastEntryHydratedOz] = useState<number | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [jackpotFiredToday, setJackpotFiredToday] = useState(false);
  const [goalHistory, setGoalHistory] = useState<Record<string, number>>({});

  // Presets
  const [presets, setPresets] = useState<Preset[]>([]);

  // Achievements — lifetime stats
  const [lifetimeHydrationOz, setLifetimeHydrationOz] = useState(0);
  const [lifetimeJackpots, setLifetimeJackpots] = useState(0);
  const [lifetimeCoffeeLogs, setLifetimeCoffeeLogs] = useState(0);
  const [lifetimeBeerLogs, setLifetimeBeerLogs] = useState(0);
  const [firstDrinkTime, setFirstDrinkTime] = useState<string | null>(null);

  // Weather
  const [weatherBannerOz, setWeatherBannerOz] = useState<8 | 16 | null>(null);
  const [weatherBannerDismissed, setWeatherBannerDismissed] = useState(false);
  const [weatherTempF, setWeatherTempF] = useState<number | null>(null);

  // Dispenser / Hydro Hero
  const [selectedCategory, setSelectedCategory] = useState<BevCategory>("water");
  const [spinning, setSpinning] = useState(false);
  const [jackpotSpinning, setJackpotSpinning] = useState(false);
  // Set true synchronously in handleBet when the pour will trigger the goal
  // celebration. onTankFill checks this and skips the splash so only the
  // jackpot sound plays for goal hits. Cleared by the onTankFill consumer.
  const skipNextSplashRef = useRef(false);
  const [reelConfettiVisible, setReelConfettiVisible] = useState(false);
  const [reelFrameY, setReelFrameY] = useState(300);
  const screenShakeAnim = useRef(new Animated.Value(0)).current;
  const mainScrollRef = useRef<any>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [lastReelOz, setLastReelOz] = useState(0);
  // Beverage at the moment the user last logged a drink — freezes the LAST
  // DRINK panel's icon/label so changing the selection doesn't update it
  // until a new fill happens.
  const [lastLoggedCategory, setLastLoggedCategory] = useState<BevCategory>("water");
  // Increments on every fill so the LastDrinkReveal re-plays even when oz
  // is identical to the previous log.
  const [logNonce, setLogNonce] = useState(0);
  const [pendingBetOz, setPendingBetOz] = useState<number | null>(null);
  // Multi-quantity for the Confirm Drink modal (× 1–5 servings of the same drink).
  const [pendingQty, setPendingQty] = useState(1);
  const [displayedHydration, setDisplayedHydration] = useState(0);

  // Particle spray — origin updates after GlassTank layout
  const [spoutOrigin, setSpoutOrigin] = useState({ x: Dimensions.get("window").width / 2, y: 200 });
  const { particles: sprayParticles, visible: sprayVisible, fire: fireSpray } = useParticleSpray(spoutOrigin.x, spoutOrigin.y);
  const dropletRef = useRef<HandoffDropletHandle>(null);
  const launchDroplet = useCallback(
    (start: {x:number;y:number}, end: {x:number;y:number}, onLand: () => void) => {
      dropletRef.current?.play(start, end, onLand);
    },
    [],
  );

  // Daily reset
  const [toastVisible, setToastVisible] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const midnightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Onboarding — null = loading (not yet determined)
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  // Sound effects
  const [soundEnabled, setSoundEnabledState] = useState(true);

  // Notification preferences
  const [notifMasterEnabled, setNotifMasterEnabled] = useState(true);
  const [notifMorningEnabled, setNotifMorningEnabled] = useState(true);
  const [notifProgressEnabled, setNotifProgressEnabled] = useState(true);
  const [notifStreakEnabled, setNotifStreakEnabled] = useState(true);
  // "granted" | "denied" | "undetermined" | null (null = not yet checked)
  const [notifPermissionStatus, setNotifPermissionStatus] = useState<string | null>(null);

  // Refs so async callbacks (notification toggle onValueChange) always read
  // the latest hydration values without stale closure problems.
  const totalHydrationRef = useRef(0);
  const goalRef           = useRef(DEFAULT_GOAL);
  const goalHistoryRef    = useRef<Record<string, number>>({});

  // Apple Health
  const [healthPermissionGranted, setHealthPermissionGranted] = useState(false);
  const [healthSyncEnabled, setHealthSyncEnabled] = useState(true);
  const [lastHealthSampleTime, setLastHealthSampleTime] = useState<string | null>(null);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // The Settings tab in the bottom bar calls requestOpenSettings() to open
  // this modal. Register the opener while Home is mounted.
  useEffect(() => {
    setSettingsModalOpener(() => setShowSettingsModal(true));
    return () => setSettingsModalOpener(null);
  }, []);

  // Quick Add customization
  const [quickAddAmounts, setQuickAddAmounts] = useState<number[]>(QUICK_ADD_DEFAULTS);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);

  // Haptics
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  // Preferred display unit. Affects which unit shows large/first on Quick
  // Add tiles, the CONSUMED stat row, and the Custom Amount input default.
  // Both units stay visible everywhere — this only controls primary/secondary.
  const [preferredUnit, setPreferredUnit] = useState<'oz' | 'ml'>('oz');
  // Open the Custom Amount modal with the unit toggle defaulted to the user's
  // preferred unit. The user can still flip it mid-flow.
  const openCustomModal = () => { setCustomUnit(preferredUnit); setShowCustomModal(true); };

  // Sound pack
  const [selectedSoundPack, setSelectedSoundPack] = useState(DEFAULT_PACK_ID);
  const [previewingPack, setPreviewingPack] = useState<string | null>(null);
  const [showCustomSounds, setShowCustomSounds] = useState(false);

  // Beverage customization
  const [selectedBeverages, setSelectedBeverages] = useState<BevCategory[]>(DEFAULT_VISIBLE_BEVS);
  const [showChooseBevs, setShowChooseBevs] = useState(false);
  const [catPickerShowAll, setCatPickerShowAll] = useState(false);

  // Individual drink log entries with timestamps
  const [drinkLogEntries, setDrinkLogEntries] = useState<DrinkEntry[]>([]);

  // Streak milestone confetti card
  const [streakMilestone, setStreakMilestone] = useState<number | null>(null);

  // Post-jackpot fact/joke card
  const [showFactCard, setShowFactCard] = useState(false);

  // New-badge toast (fires when a drink log unlocks one or more badges)
  const [badgeToast, setBadgeToast] = useState<BadgeDef[] | null>(null);
  const badgeToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (badgeToastTimer.current) clearTimeout(badgeToastTimer.current);
  }, []);

  // Promo code
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  // Stores every setTimeout ID created in handleBet so they can be cancelled on unmount
  const betTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Haptic helper — wraps all calls; never throws; respects user preference
  function haptic(fn: () => Promise<void>) {
    if (!hapticsEnabled) return;
    try { fn(); } catch {}
  }

  // Clear all pending bet timers on unmount
  useEffect(() => {
    return () => {
      betTimersRef.current.forEach(clearTimeout);
      betTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    loadData();
    // Note: requestNotificationPermission() is NOT called here.
    // For new users it fires after onboarding completes (handleOnboardingComplete).
    // For returning users it fires inside checkOnboarding() once "onboarding_complete"
    // is confirmed, giving the OS dialog the context of a launched app, not a cold start.
    fetchWeatherAdjustment();
    checkOnboarding();
    initSounds();
    try {
      initWatch().catch(() => {});
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-register the Watch log handler every render so it captures the current
  // addWater closure (which reads live state). Without this, the handler set
  // on mount sees `intake`/`totalHydration`/etc. as their mount-time values
  // and overwrites the current day's totals when the Watch logs.
  useEffect(() => {
    setWatchMessageHandler(async (cmd) => {
      const cat = cmd.category as BevCategory;
      const isJackpot = await addWater(cmd.amount, cat).catch(() => false);
      // addWater updates `totalHydration` but not the animated tank value
      // (`displayedHydration`) — the dispenser drives that on phone logs.
      // Watch-originated logs have no dispenser, so update it directly.
      setDisplayedHydration((prev) => prev + calcHydratedOz(cmd.amount, cat));
      return isJackpot ? "🎯 GOAL! Daily target hit!" : `+${cmd.amount} oz logged!`;
    });
  });

  // Keep the Apple Watch in sync with the phone. Runs on launch (once the stored
  // hydration data loads into state) and after any change, so the Watch never
  // shows a stale 0% before the first manual log.
  useEffect(() => {
    const s = (() => {
      let n = 0; const d = new Date();
      while ((goalHistory[getDateKey(d)] ?? 0) >= 1.0) { n++; d.setDate(d.getDate() - 1); }
      return n;
    })();
    sendHydrationUpdate({
      hydrationOz: totalHydration,
      goalOz: goal,
      pct: goal > 0 ? totalHydration / goal : 0,
      streak: s,
      selectedBeverages,
    }).catch(() => {});
  }, [totalHydration, goal, goalHistory, selectedBeverages]);

  async function checkOnboarding() {
    try {
      const done = await AsyncStorage.getItem("onboarding_complete");
      setShowOnboarding(done !== "1");
      // Returning user — onboarding already complete, so request notification
      // permission now (we have app context, better than the cold-start moment).
      if (done === "1") {
        requestNotificationPermission();
      }
    } catch {
      setShowOnboarding(false);
    }
  }

  function handleOnboardingComplete(goalOz: number) {
    setGoal(goalOz);
    setShowOnboarding(false);
    // New user — request notification permission AFTER onboarding so the user
    // has seen what the app does before the OS dialog appears.
    requestNotificationPermission();
    requestHealthPermissionIfNeeded();
  }

  async function requestHealthPermissionIfNeeded() {
    if (!isHealthAvailable) return;
    try {
      const asked = await AsyncStorage.getItem("health_permission_asked");
      if (asked === "1") return;
      Alert.alert(
        "Apple Health",
        "Hydro Hero would like to save your hydration data to Apple Health so all your health data stays in one place.",
        [
          {
            text: "Not Now",
            style: "cancel",
            onPress: async () => {
              await AsyncStorage.setItem("health_permission_asked", "1");
              await AsyncStorage.setItem("health_permission_granted", "false");
              setHealthPermissionGranted(false);
            },
          },
          {
            text: "Allow",
            onPress: async () => {
              await AsyncStorage.setItem("health_permission_asked", "1");
              const granted = await initHealthKit();
              await AsyncStorage.setItem("health_permission_granted", String(granted));
              setHealthPermissionGranted(granted);
            },
          },
        ]
      );
    } catch {}
  }

  async function toggleHealthSync(enabled: boolean) {
    setHealthSyncEnabled(enabled);
    try {
      await AsyncStorage.setItem("health_sync_enabled", String(enabled));
    } catch {}
  }

  async function handleHealthToggle(enabled: boolean) {
    if (healthPermissionGranted) {
      toggleHealthSync(enabled);
      return;
    }
    // Permission not currently marked as granted. Try initHealthKit fresh:
    //   - First time tapping toggle: iOS shows the native HealthKit sheet.
    //   - User re-enabled in iOS Settings: this picks it up silently.
    //   - User natively denied earlier: this is a silent no-op.
    const granted = await initHealthKit();
    try {
      await AsyncStorage.setItem("health_permission_asked", "1");
      await AsyncStorage.setItem("health_permission_granted", String(granted));
    } catch {}
    setHealthPermissionGranted(granted);
    if (granted) {
      toggleHealthSync(true);
      return;
    }
    Alert.alert(
      "Health Access Disabled",
      "To enable Apple Health sync, open iPhone Settings → Privacy & Security → Health → Hydro Hero and turn on Water access.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openURL("app-settings:").catch(() => {}) },
      ]
    );
  }

  // Keep refs in sync so async callbacks (notification toggles) read latest values
  // without stale closure issues.
  useEffect(() => { totalHydrationRef.current = totalHydration; }, [totalHydration]);
  useEffect(() => { goalRef.current = goal; }, [goal]);
  useEffect(() => { goalHistoryRef.current = goalHistory; }, [goalHistory]);

  // Check OS notification permission whenever the Settings modal opens.
  useEffect(() => {
    if (!showSettingsModal) return;
    Notifications.getPermissionsAsync()
      .then(({ status }) => setNotifPermissionStatus(status))
      .catch(() => {});
  }, [showSettingsModal]);

  useEffect(() => {
    if (Platform.OS === "android") {
      const show = Keyboard.addListener("keyboardDidShow", (e) => setKbHeight(e.endCoordinates.height));
      const hide = Keyboard.addListener("keyboardDidHide", () => setKbHeight(0));
      return () => { show.remove(); hide.remove(); };
    }
  }, []);

  async function requestNotificationPermission() {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      // If the user just granted permission for the first time, schedule reminders now.
      // loadData ran before this and would have bailed early on the permission check.
      if (status === "granted") {
        const curPct = goal > 0 ? Math.min(totalHydration / goal, 1) : 0;
        rescheduleSmartNotifications(curPct, 0, Math.max(0, goal - totalHydration));
      }
    } catch {}
  }

  /**
   * Cancel all pending notifications and schedule fresh ones based on current
   * hydration progress, time of day, and user notification preferences.
   *
   * Call this:
   *  - after every drink log
   *  - after daily reset
   *  - after any notification preference toggle
   *
   * @param hydPct   0–1 fraction of goal achieved (hydration oz / goal oz)
   * @param curStreak  current day-streak count
   * @param remOz    remaining oz to reach goal (goal - hydrationOz, floored at 0)
   */
  /**
   * Optional preference overrides — used when state hasn't updated yet
   * (e.g. immediately after a toggle fires, or during loadData before setState).
   */
  interface NotifPrefs {
    master?:   boolean;
    morning?:  boolean;
    progress?: boolean;
    streak?:   boolean;
  }

  async function rescheduleSmartNotifications(
    hydPct: number,
    curStreak: number,
    remOz: number,
    prefOverrides?: NotifPrefs,
  ) {
    // Resolve effective preferences: explicit overrides win over closed-over state.
    const masterOn   = prefOverrides?.master   ?? notifMasterEnabled;
    const morningOn  = prefOverrides?.morning  ?? notifMorningEnabled;
    const progressOn = prefOverrides?.progress ?? notifProgressEnabled;
    const streakOn   = prefOverrides?.streak   ?? notifStreakEnabled;

    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") return;
      if (!masterOn) { await Notifications.cancelAllScheduledNotificationsAsync(); return; }
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch { return; }

    const goalHit = hydPct >= 1.0;
    const pctInt  = Math.round(hydPct * 100);

    // Schedule a DAILY recurring notification. The Expo DAILY trigger fires at
    // the given hour:minute every day. Even if today's time has already passed,
    // the trigger will fire correctly tomorrow — so we never gate on current time.
    async function schedDaily(h: number, m: number, title: string, body: string) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title, body },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: h, minute: m },
        });
      } catch {}
    }

    // ── 1. Morning kickoff  07:30 ──────────────────────────────────────────────
    // No time guard — DAILY trigger ensures this fires tomorrow even if today's
    // 07:30 has already passed.
    if (morningOn && !goalHit) {
      await schedDaily(7, 30,
        "Good morning! Time to hydrate 💧",
        "Your daily goal is waiting — start sipping!"
      );
    }

    // ── 2. Gentle midday check  12:00 ─────────────────────────────────────────
    if (progressOn && !goalHit) {
      await schedDaily(12, 0,
        "Halfway through the day 🌤",
        `You've only hit ${pctInt}% of your goal — time to catch up!`
      );
    }

    // ── 3. Urgent afternoon nudge  14:00 ──────────────────────────────────────
    if (progressOn && !goalHit) {
      // Derive hydrated oz from parameters — avoids a goalRef.current dependency
      // that could be stale immediately after a goal change.
      const hydOz = hydPct > 0 && hydPct < 1
        ? Math.round((remOz / (1 - hydPct)) * hydPct)
        : 0;
      await schedDaily(14, 0,
        "You're falling behind 😅",
        `Only ${hydOz} oz hydrated so far — your goal needs you!`
      );
    }

    // ── 4. Evening push  18:00 ────────────────────────────────────────────────
    if (progressOn && !goalHit) {
      await schedDaily(18, 0,
        "Evening check in 🌆",
        `${remOz.toFixed(1)} oz to go before your goal — you've got this!`
      );
    }

    // ── 5. Final push  20:30 ──────────────────────────────────────────────────
    if (progressOn && !goalHit) {
      const streakTxt = curStreak > 0 ? ` Don't break your ${curStreak} day streak!` : "";
      await schedDaily(20, 30,
        "Last chance to hit your goal tonight! 💧",
        `Just ${remOz.toFixed(1)} oz away —${streakTxt}`
      );
    }

    // ── 6. Streak at risk  21:00 ──────────────────────────────────────────────
    if (streakOn && !goalHit && curStreak >= 3) {
      await schedDaily(21, 0,
        "Your streak is at risk! 🔥",
        `Don't lose your ${curStreak} day streak — ${remOz.toFixed(1)} oz to go before midnight!`
      );
    }
  }

  /**
   * Fire an immediate (≈1 s) notification once per day, guarded by an
   * AsyncStorage flag so it never duplicates.
   */
  async function fireImmediateNotifOnce(
    flagKey: string,
    title: string,
    body: string,
    enabled: boolean,
  ) {
    if (!enabled || !notifMasterEnabled) return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") return;
      const already = await AsyncStorage.getItem(flagKey);
      if (already === "1") return;
    } catch { return; }
    // Write the dedup flag FIRST — outside the schedule try/catch so that
    // if schedule fails or the app crashes, we never fire this twice in one day.
    await AsyncStorage.setItem(flagKey, "1");
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, repeats: false },
      });
    } catch {}
  }

  async function fetchWeatherAdjustment() {
    try {
      const current = await Location.getForegroundPermissionsAsync();
      if (current.status === "denied") return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const { latitude, longitude } = loc.coords;
      const resp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&temperature_unit=fahrenheit`);
      if (!resp.ok) return;
      const json = await resp.json();
      const tempF: number = json.current.temperature_2m;
      setWeatherTempF(tempF);
      if (tempF >= 95) setWeatherBannerOz(16);
      else if (tempF >= 85) setWeatherBannerOz(8);
    } catch {}
  }

  function showMorningToast() {
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  }

  async function performDailyReset(showToast: boolean) {
    // Snapshot yesterday before clearing
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getDateKey(yesterday);

    // Read current values directly from storage so we have accurate data even if state hasn't synced
    const [rawIntake, rawHydration, rawBreakdown, rawGoal, rawHistory, rawGoalHistory] = await Promise.all([
      AsyncStorage.getItem(yesterdayKey),
      AsyncStorage.getItem("water_total_hydration"),
      AsyncStorage.getItem("water_category_breakdown"),
      AsyncStorage.getItem("water_goal"),
      AsyncStorage.getItem("water_history"),
      AsyncStorage.getItem("goal_history"),
    ]);

    const prevIntake   = rawIntake    ? JSON.parse(rawIntake)    : intake;
    const prevHyd      = rawHydration ? JSON.parse(rawHydration) : totalHydration;
    const prevBreakdown= rawBreakdown ? JSON.parse(rawBreakdown) : categoryBreakdown;
    const prevGoal     = rawGoal      ? JSON.parse(rawGoal)      : goal;
    const prevHistory: { date: string; oz: number; goal: number; breakdown?: Record<BevCategory, number> }[]
                       = rawHistory   ? JSON.parse(rawHistory)   : [];
    const prevGoalHist: Record<string, number>
                       = rawGoalHistory ? JSON.parse(rawGoalHistory) : {};

    const prevPct = prevGoal > 0 ? Math.min(prevHyd / prevGoal, 1) : 0;

    // Save yesterday snapshot to history
    const yesterdayEntry = { date: yesterdayKey, oz: prevIntake, goal: prevGoal, breakdown: prevBreakdown };
    const updatedHistory = [yesterdayEntry, ...prevHistory.filter((h) => h.date !== yesterdayKey)].slice(0, 30);
    // Build updated goal history and trim to 30 days
    const updatedGoalHistFull = { ...prevGoalHist, [yesterdayKey]: prevPct };
    const updatedGoalHist = Object.fromEntries(
      Object.entries(updatedGoalHistFull)
        .sort(([a], [b]) => {
          const [, ay, am, ad] = a.split('_').map(Number);
          const [, by, bm, bd] = b.split('_').map(Number);
          return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
        })
        .slice(-30)
    );

    // Wipe today's values
    const todayKey = getTodayKey();

    // Write reset lock before touching storage — if the app is killed mid-reset, next
    // launch will detect this key in checkDateAndMaybeReset and re-run performDailyReset.
    try { await AsyncStorage.setItem('reset_in_progress', yesterdayKey); } catch {}

    try {
      await Promise.all([
        AsyncStorage.setItem("water_history",          JSON.stringify(updatedHistory)),
        AsyncStorage.setItem("goal_history",           JSON.stringify(updatedGoalHist)),
        AsyncStorage.setItem("water_total_hydration",  JSON.stringify(0)),
        AsyncStorage.setItem("water_category_breakdown", JSON.stringify(EMPTY_BREAKDOWN)),
        AsyncStorage.setItem("water_last_entry",       JSON.stringify(null)),
        AsyncStorage.removeItem(`goal_celebrated_${yesterdayKey}`),
        AsyncStorage.setItem("last_active_date",       todayKey),
        AsyncStorage.setItem(todayKey,                 JSON.stringify(0)),
        AsyncStorage.removeItem("water_log_entries"),
      ]);
    } catch {
      // Keep the lock in place — next launch will retry the full reset.
      return;
    }

    // All writes succeeded — release the lock.
    try { await AsyncStorage.removeItem('reset_in_progress'); } catch {}

    // Reset all state
    setHistory(updatedHistory);
    setGoalHistory(updatedGoalHist);
    setIntake(0);
    setTotalHydration(0);
    setDisplayedHydration(0);
    setCategoryBreakdown(EMPTY_BREAKDOWN);
    setLastEntry(null);
    setLastEntryHydratedOz(null);
    setLastEntryCategory(null);
    setResultMessage(null);
    setLastReelOz(0);
    setSpinning(false);
    setJackpotFiredToday(false);
    setShowCelebration(false);
    setDrinkLogEntries([]);

    if (showToast) {
      showMorningToast();
      playMorningResetSound();
    }
    // After reset, hydration is 0 — reschedule with clean slate (streak unknown here, use 0 safely)
    rescheduleSmartNotifications(0, 0, goal);
    sendHydrationUpdate({ hydrationOz: 0, goalOz: goal, pct: 0, streak: 0, selectedBeverages }).catch(() => {});
  }

  async function checkDateAndMaybeReset() {
    const todayKey = getTodayKey();

    // Resume any reset that was interrupted by a force-close.
    try {
      const lockVal = await AsyncStorage.getItem('reset_in_progress');
      if (lockVal) {
        await performDailyReset(false);
        return;
      }
    } catch {}

    const saved = await AsyncStorage.getItem("last_active_date");
    if (saved && saved !== todayKey) {
      await performDailyReset(true);
    } else {
      await AsyncStorage.setItem("last_active_date", todayKey);
    }
  }

  function scheduleMidnightTimer() {
    if (midnightTimer.current) clearTimeout(midnightTimer.current);
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    midnightTimer.current = setTimeout(async () => {
      await performDailyReset(true);
      scheduleMidnightTimer(); // reschedule for the next midnight
    }, msUntilMidnight);
  }

  useEffect(() => {
    scheduleMidnightTimer();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkDateAndMaybeReset();
        setSpinning(false);
        setJackpotSpinning(false);
        reloadSounds();
      } else if (state === "background" || state === "inactive") {
        teardownSounds();
      }
    });
    return () => {
      sub.remove();
      if (midnightTimer.current) clearTimeout(midnightTimer.current);
      teardownSounds();
      try { teardownWatch(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Backup goal-celebration trigger — fires only for edge cases like first
  // load when goal was already met. The extra !showCelebration / !spinning
  // guards keep it from racing the handleBet pour sequence, which would
  // otherwise mount the celebration overlay while the dispenser is
  // mid-animation.
  useEffect(() => {
    if (
      totalHydration >= goal &&
      goal > 0 &&
      !jackpotFiredToday &&
      !jackpotSpinning &&
      !spinning &&
      !showCelebration
    ) {
      const todayKey = getTodayKey();
      const celebKey = `goal_celebrated_${todayKey}`;
      setJackpotFiredToday(true);
      (async () => { try { await AsyncStorage.setItem(celebKey, "1"); } catch {} })();
      setShowCelebration(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalHydration]);

  // ── Promo Code ────────────────────────────────────────────────────────────
  async function redeemPromoCode() {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);
    try {
      if (code === 'LIFETIME2026') {
        const alreadyUsed = await AsyncStorage.getItem('LIFETIME2026_used');
        if (alreadyUsed === 'true') {
          Alert.alert('Already Redeemed', 'This code has already been used on this device.', [{ text: 'OK' }]);
          return;
        }
        await AsyncStorage.setItem('LIFETIME2026_used', 'true');
        await AsyncStorage.setItem('hasLifetimeAccess', 'true');
        await checkProStatus();
        setShowPromoModal(false);
        setPromoCode('');
        Alert.alert('🎉 Welcome to Pro!', 'You now have lifetime access to Hydro Hero Pro!', [{ text: "Let's Go!" }]);
      } else {
        Alert.alert('Invalid Code', 'That promo code is not valid.', [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.', [{ text: 'OK' }]);
    } finally {
      setPromoLoading(false);
    }
  }

  // Debug: clears every path that grants Pro on this device so the paywall can
  // be re-tested on TestFlight. Triggered by long-pressing the version label.
  async function resetProForTesting() {
    try {
      await AsyncStorage.multiRemove([
        'hasLifetimeAccess',
        'promo_lifetime_unlocked',
        'LIFETIME2026_used',
      ]);
    } catch {}
    try {
      const Purchases = getRevenueCatPurchases();
      // logOut generates a fresh anonymous RC user ID, so any entitlement on
      // the previous customer record stops applying to this device.
      if (Purchases) await (Purchases as any).logOut?.();
    } catch {}
    await checkProStatus();
  }

  function confirmResetProForTesting() {
    Alert.alert(
      'Reset Pro?',
      'Clears the lifetime promo flag and signs out of RevenueCat on this device. Use to re-test the paywall.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetProForTesting();
            Alert.alert('Pro Reset', 'Pro access has been cleared. Force-quit and reopen the app if the paywall does not appear.', [{ text: 'OK' }]);
          },
        },
      ],
    );
  }

  // Open the paywall from inside the Settings page-sheet modal. iOS can't
  // present a Modal while another Modal is mid-dismiss — if we don't defer,
  // the Paywall appears but its Subscribe button absorbs no touches. (Apple
  // 2.1(b) rejection on Build 20.)
  function openPaywallFromSettings() {
    setShowSettingsModal(false);
    setTimeout(openPaywall, 350);
  }

  async function loadData() {
    try {
      // Check if the date changed since last launch — resets if new day
      await checkDateAndMaybeReset();
      const todayKey = getTodayKey();
      const celebKey = `goal_celebrated_${todayKey}`;

      // Single batched read for all startup keys (Issues 7 & 8)
      const results = await AsyncStorage.multiGet([
        todayKey,
        'water_goal',
        'water_history',
        'water_last_entry',
        'water_last_hydrated',
        'water_category_breakdown',
        'water_last_category',
        'water_total_hydration',
        'goal_history',
        'water_presets',
        'lifetime_hydration_oz',
        'lifetime_jackpots',
        'lifetime_coffee_logs',
        'lifetime_beer_logs',
        'first_drink_time',
        'health_permission_granted',
        'health_sync_enabled',
        'water_last_health_sample',
        celebKey,
        'notif_master_enabled',
        'notif_morning_enabled',
        'notif_progress_enabled',
        'notif_streak_enabled',
        'sound_enabled',
        'custom_quick_add_amounts',
        'haptics_enabled',
        'preferred_unit',
        'water_log_entries',
        'selected_sound_pack',
        'selected_beverages',
        'cloud_last_sync',
      ]);

      const store = new Map<string, string | null>(results);
      const get = (key: string) => store.get(key) ?? null;

      const savedIntake         = get(todayKey);
      const savedGoal           = get('water_goal');
      const savedHistory        = get('water_history');
      const savedLastEntry      = get('water_last_entry');
      const savedLastHydrated   = get('water_last_hydrated');
      const savedBreakdown      = get('water_category_breakdown');
      const savedLastCategory   = get('water_last_category');
      const savedTotalHydration = get('water_total_hydration');
      const savedGoalHistory    = get('goal_history');
      const savedPresets        = get('water_presets');

      const parsedIntake = savedIntake ? JSON.parse(savedIntake) : 0;
      const parsedGoal   = savedGoal   ? JSON.parse(savedGoal)   : DEFAULT_GOAL;
      if (savedIntake) setIntake(parsedIntake);
      if (savedGoal) setGoal(parsedGoal);
      if (savedHistory) setHistory(JSON.parse(savedHistory));
      if (savedLastEntry) setLastEntry(JSON.parse(savedLastEntry));
      if (savedLastHydrated) setLastEntryHydratedOz(JSON.parse(savedLastHydrated));
      if (savedLastCategory) setLastEntryCategory(JSON.parse(savedLastCategory));
      if (savedTotalHydration) {
        const h = JSON.parse(savedTotalHydration);
        setTotalHydration(h);
        setDisplayedHydration(h); // sync immediately on load, no animation
      }
      if (savedGoalHistory) setGoalHistory(JSON.parse(savedGoalHistory));
      if (savedPresets) setPresets(JSON.parse(savedPresets));

      // Lifetime achievement stats
      const savedLifeHyd    = get('lifetime_hydration_oz');
      const savedLifeJack   = get('lifetime_jackpots');
      const savedLifeCoffee = get('lifetime_coffee_logs');
      const savedLifeBeer   = get('lifetime_beer_logs');
      const savedFirstDrink = get('first_drink_time');
      if (savedLifeHyd)    setLifetimeHydrationOz(JSON.parse(savedLifeHyd));
      if (savedLifeJack)   setLifetimeJackpots(JSON.parse(savedLifeJack));
      if (savedLifeCoffee) setLifetimeCoffeeLogs(JSON.parse(savedLifeCoffee));
      if (savedLifeBeer)   setLifetimeBeerLogs(JSON.parse(savedLifeBeer));
      if (savedFirstDrink) setFirstDrinkTime(savedFirstDrink);

      // Apple Health settings
      const savedHealthPerm   = get('health_permission_granted');
      const savedHealthSync   = get('health_sync_enabled');
      const savedHealthSample = get('water_last_health_sample');
      if (savedHealthPerm   !== null) setHealthPermissionGranted(savedHealthPerm === "true");
      if (savedHealthSync   !== null) setHealthSyncEnabled(savedHealthSync !== "false");
      if (savedHealthSample) setLastHealthSampleTime(savedHealthSample);

      // Jackpot-fired flag for today
      if (get(celebKey)) setJackpotFiredToday(true);

      const initPct = parsedGoal > 0 ? Math.min(parsedIntake / parsedGoal, 1) : 0;
      requestHealthPermissionIfNeeded();

      // Notification preferences — read first, apply to state, then reschedule
      // so rescheduleSmartNotifications uses the real saved values (not the
      // initial useState defaults which are all `true`).
      const nMaster   = get('notif_master_enabled');
      const nMorning  = get('notif_morning_enabled');
      const nProgress = get('notif_progress_enabled');
      const nStreak   = get('notif_streak_enabled');
      const nMasterOn   = nMaster   === null ? true : nMaster   !== "false";
      const nMorningOn  = nMorning  === null ? true : nMorning  !== "false";
      const nProgressOn = nProgress === null ? true : nProgress !== "false";
      const nStreakOn   = nStreak   === null ? true : nStreak   !== "false";
      if (nMaster   !== null) setNotifMasterEnabled(nMasterOn);
      if (nMorning  !== null) setNotifMorningEnabled(nMorningOn);
      if (nProgress !== null) setNotifProgressEnabled(nProgressOn);
      if (nStreak   !== null) setNotifStreakEnabled(nStreakOn);
      // Pass preferences explicitly — state updates above are async dispatches
      // and would not be visible to rescheduleSmartNotifications's closure yet.
      rescheduleSmartNotifications(initPct, 0, Math.max(0, parsedGoal - parsedIntake), {
        master:   nMasterOn,
        morning:  nMorningOn,
        progress: nProgressOn,
        streak:   nStreakOn,
      });

      // Sound preference
      const savedSound = get('sound_enabled');
      if (savedSound !== null) {
        const enabled = savedSound !== "false";
        setSoundEnabledState(enabled);
        setSoundEnabled(enabled);
      }

      // Custom quick add amounts
      try {
        const savedQA = get('custom_quick_add_amounts');
        if (savedQA) {
          const parsed = JSON.parse(savedQA);
          if (Array.isArray(parsed) && parsed.length === 6) setQuickAddAmounts(parsed);
        }
      } catch {}

      // Haptics preference
      const savedHaptics = get('haptics_enabled');
      if (savedHaptics !== null) setHapticsEnabled(savedHaptics !== "false");

      // Preferred display unit
      const savedUnit = get('preferred_unit');
      if (savedUnit === 'ml' || savedUnit === 'oz') setPreferredUnit(savedUnit);

      // Today's drink log entries
      try {
        const savedEntries = get('water_log_entries');
        if (savedEntries) setDrinkLogEntries(JSON.parse(savedEntries));
      } catch {}

      // Selected sound pack (requires side-effectful setActivePack call)
      try {
        const savedPack = get('selected_sound_pack');
        if (savedPack) {
          setSelectedSoundPack(savedPack);
          await setActivePack(savedPack);
        }
      } catch {}

      // Selected beverages (user's custom selection, 1–20)
      try {
        const savedBevs = get('selected_beverages');
        if (savedBevs) {
          const parsed: BevCategory[] = JSON.parse(savedBevs);
          if (Array.isArray(parsed) && parsed.length >= 1) setSelectedBeverages(parsed);
        }
      } catch {}

      // Last cloud sync time — reserved for future settings UI
      // const savedSyncTime = get('cloud_last_sync');

      // Merge stored breakdown with new 20-key structure (backward compat)
      if (savedBreakdown) {
        try {
          setCategoryBreakdown(mergeBreakdown(JSON.parse(savedBreakdown)));
        } catch {}
      }
    } catch {}
  }

  async function savePreset(label: string, oz: number, category: BevCategory) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const next: Preset = { id: `p_${Date.now()}`, label: trimmed.slice(0, 24), oz, category };
    const updated = [...presets, next];
    setPresets(updated);
    try { await AsyncStorage.setItem("water_presets", JSON.stringify(updated)); } catch {}
  }

  async function deletePreset(id: string) {
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    await AsyncStorage.setItem("water_presets", JSON.stringify(updated));
  }

  async function reorderPresets(next: Preset[]) {
    setPresets(next);
    try { await AsyncStorage.setItem("water_presets", JSON.stringify(next)); } catch {}
  }

  async function saveIntake(newIntake: number, newBreakdown: Record<BevCategory, number>, newHydration: number) {
    const todayKey = getTodayKey();
    const currentGoal = goal;
    await AsyncStorage.setItem(todayKey, JSON.stringify(newIntake));
    await AsyncStorage.setItem("water_total_hydration", JSON.stringify(newHydration));
    const todayEntry = { date: todayKey, oz: newIntake, goal: currentGoal, breakdown: newBreakdown };
    const updatedHistory = [
      todayEntry,
      ...history.filter((h) => h.date !== todayKey),
    ].slice(0, 30);
    setHistory(updatedHistory);
    await AsyncStorage.setItem("water_history", JSON.stringify(updatedHistory));
    // Update goal_history with today's hydration pct
    const newGoalHistory = { ...goalHistory, [todayKey]: Math.min(newHydration / currentGoal, 1) };
    setGoalHistory(newGoalHistory);
    await AsyncStorage.setItem("goal_history", JSON.stringify(newGoalHistory));
    // Push updated values to the home-screen widget (no-op in Expo Go / Android)
    syncWidgetData(newHydration, currentGoal);
  }

  // Returns true when this drink triggers the jackpot for the first time today.
  // Caller is responsible for showing the celebration after the pour completes.
  async function addWater(oz: number, category: BevCategory): Promise<boolean> {
    const newIntake = intake + oz;
    const hydratedOz = calcHydratedOz(oz, category);
    const newHydration = Math.round((totalHydration + hydratedOz) * 10) / 10;
    setIntake(newIntake);
    setTotalHydration(newHydration);
    const newBreakdown = { ...categoryBreakdown, [category]: categoryBreakdown[category] + oz };
    setCategoryBreakdown(newBreakdown);
    setLastEntry(oz);
    setLastEntryHydratedOz(hydratedOz);
    setLastEntryCategory(category);

    const isJackpot = newHydration >= goal && !jackpotFiredToday;
    if (isJackpot) {
      setJackpotFiredToday(true);
    }

    // Add individual entry with timestamp
    const newEntry: DrinkEntry = { oz, category, timestamp: Date.now(), hydrated: hydratedOz };
    const newEntries = [...drinkLogEntries, newEntry];
    setDrinkLogEntries(newEntries);

    const saves: Promise<void>[] = [
      AsyncStorage.setItem("water_category_breakdown", JSON.stringify(newBreakdown)),
      saveIntake(newIntake, newBreakdown, newHydration),
      AsyncStorage.setItem("water_last_entry", JSON.stringify(oz)),
      AsyncStorage.setItem("water_last_hydrated", JSON.stringify(hydratedOz)),
      AsyncStorage.setItem("water_last_category", JSON.stringify(category)),
      AsyncStorage.setItem("water_log_entries", JSON.stringify(newEntries)),
      isJackpot
        ? AsyncStorage.setItem("water_last_was_jackpot", "1")
        : AsyncStorage.removeItem("water_last_was_jackpot"),
    ];
    if (isJackpot) {
      const celebKey = `goal_celebrated_${getTodayKey()}`;
      saves.push(AsyncStorage.setItem(celebKey, "1"));
    }
    try {
      await Promise.all(saves);
    } catch (e) {
      console.warn("addWater: failed to persist one or more values", e);
    }

    // Reschedule smart notifications based on current progress
    const newHydPct = goal > 0 ? Math.min(newHydration / goal, 1) : 0;
    const newRemOz  = Math.max(0, goal - newHydration);
    // Compute current streak inline (goalHistory state is current at this point)
    const streakNow = (() => {
      let s = 0; const d = new Date();
      while ((goalHistory[getDateKey(d)] ?? 0) >= 1.0) { s++; d.setDate(d.getDate() - 1); }
      return s;
    })();
    rescheduleSmartNotifications(newHydPct, streakNow, newRemOz);

    // Sync raw consumed oz to Apple Health (silently, never blocks the return)
    if (healthSyncEnabled && healthPermissionGranted && isHealthAvailable) {
      saveWaterSample(oz).then((timestamp) => {
        if (timestamp) {
          setLastHealthSampleTime(timestamp);
          AsyncStorage.setItem("water_last_health_sample", timestamp).catch(() => {});
        }
      });
    }

    // Update lifetime achievement stats
    try {
      const newLifeHyd    = Math.round((lifetimeHydrationOz + hydratedOz) * 10) / 10;
      const newLifeJack   = lifetimeJackpots + (isJackpot ? 1 : 0);
      const newLifeCoffee = lifetimeCoffeeLogs + (category === "coffee" ? 1 : 0);
      const newLifeBeer   = lifetimeBeerLogs   + (category === "beer"   ? 1 : 0);
      setLifetimeHydrationOz(newLifeHyd);
      setLifetimeJackpots(newLifeJack);
      setLifetimeCoffeeLogs(newLifeCoffee);
      setLifetimeBeerLogs(newLifeBeer);
      const lifeSaves: Promise<void>[] = [
        AsyncStorage.setItem("lifetime_hydration_oz",  JSON.stringify(newLifeHyd)),
        AsyncStorage.setItem("lifetime_jackpots",      JSON.stringify(newLifeJack)),
        AsyncStorage.setItem("lifetime_coffee_logs",   JSON.stringify(newLifeCoffee)),
        AsyncStorage.setItem("lifetime_beer_logs",     JSON.stringify(newLifeBeer)),
      ];
      // Record first drink time once, never overwrite
      let firstDrinkTimeAfter = firstDrinkTime;
      if (firstDrinkTime === null) {
        const ts = new Date().toISOString();
        setFirstDrinkTime(ts);
        firstDrinkTimeAfter = ts;
        lifeSaves.push(AsyncStorage.setItem("first_drink_time", ts));
      }
      await Promise.all(lifeSaves);

      // Detect newly-unlockable badges and surface them: tab dot + Home toast.
      // Use locally-computed values so we don't race the state setters above.
      try {
        const todayKey = getTodayKey();
        const newGoalHist = { ...goalHistory, [todayKey]: goal > 0 ? Math.min(newHydration / goal, 1) : 0 };
        let newStreak = 0;
        const d = new Date();
        while ((newGoalHist[getDateKey(d)] ?? 0) >= 1.0) { newStreak++; d.setDate(d.getDate() - 1); }
        const unlockedIds = await loadUnlockedBadgeIds();
        const pending = detectPendingBadges({
          streak: newStreak,
          goalHistory: newGoalHist,
          totalHydration: newHydration,
          intake: newIntake,
          goal,
          categoryBreakdown: newBreakdown,
          lifetimeHydrationOz: newLifeHyd,
          lifetimeJackpots: newLifeJack,
          lifetimeCoffeeLogs: newLifeCoffee,
          lifetimeBeerLogs: newLifeBeer,
          firstDrinkTime: firstDrinkTimeAfter,
          nowHour: new Date().getHours(),
        }, unlockedIds);
        if (pending.length > 0) {
          await setPendingBadgeCount(pending.length);
          if (badgeToastTimer.current) clearTimeout(badgeToastTimer.current);
          setBadgeToast(pending);
          badgeToastTimer.current = setTimeout(() => setBadgeToast(null), 5000);
        }
      } catch {}
    } catch {}

    // Fire immediate threshold notifications (once per day each)
    const todayKey2 = getTodayKey();
    if (!isJackpot && newHydPct >= 0.5) {
      fireImmediateNotifOnce(
        `notif_50pct_fired_${todayKey2}`,
        "Halfway to your goal! 💧",
        "You've hit 50% of your goal — keep sipping!",
        notifProgressEnabled,
      );
    }
    if (!isJackpot && newHydPct >= 0.8) {
      fireImmediateNotifOnce(
        `notif_80pct_fired_${todayKey2}`,
        "So close to your goal! 💪",
        `Only ${newRemOz.toFixed(1)} oz left — one more drink could do it!`,
        notifProgressEnabled,
      );
    }
    if (isJackpot) {
      fireImmediateNotifOnce(
        `notif_goal_fired_${todayKey2}`,
        "GOAL! You did it! 🎯🏆",
        `Daily goal crushed! Your ${streakNow} day streak continues — see you tomorrow!`,
        notifProgressEnabled,
      );
      // Cancel all remaining reminders now that goal is hit
      Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    }

    // Push latest state to Apple Watch
    sendHydrationUpdate({
      hydrationOz: newHydration,
      goalOz: goal,
      pct: goal > 0 ? newHydration / goal : 0,
      streak: streakNow,
      selectedBeverages,
    }).catch(() => {});

    // Do NOT call setShowCelebration here — handleBet runs the pour + shake first
    return isJackpot;
  }

  async function handleBet(oz: number) {
    if (spinning || jackpotSpinning) return;
    setResultMessage(null);
    setLastReelOz(oz);
    setLastLoggedCategory(selectedCategory);
    const cat = CATEGORIES.find((c) => c.key === selectedCategory) ?? CATEGORIES[0];
    const hydrated = calcHydratedOz(oz, selectedCategory);
    const triggersJackpot = await addWater(oz, selectedCategory);

    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

    // The tank's fillAnim takes ~1.2s to ease the water up to the new level.
    // We pour into the tank immediately and gate further taps for that window.
    setSpinning(true);
    if (triggersJackpot) {
      setJackpotSpinning(true);
      skipNextSplashRef.current = true;
    }
    // CRITICAL: bump logNonce in the SAME render batch as setDisplayedHydration.
    // The vault's useEffect[logNonce] fires revealRef.play(), which captures
    // the current `onReachTank` closure (which captures `pct`). If logNonce
    // bumps before pct updates, the play() chain animates fillAnim to the
    // STALE pct — i.e. empty tank on first log, last-value on subsequent.
    setDisplayedHydration((prev) => prev + hydrated);
    setLogNonce(n => n + 1);
    // Reveal start: the middle-area number drop. The water_log / jackpot
    // splash sounds fire later — after the tank fills and the spray lands.
    playMorningResetSound();
    // fireSpray now triggers from the vault's onTankFill so it fires when the
    // handoff droplet actually lands, not immediately on tap.
    // Always scroll the tank into view on tap — the user may have scrolled
    // down to reach the quick-add buttons.
    mainScrollRef.current?.scrollTo({ y: Math.max(0, reelFrameY - 80), animated: true });

    const bt = betTimersRef.current;

    if (triggersJackpot) {
      // Celebratory shake + confetti when the fill completes.
      bt.push(setTimeout(() => {
        haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
        playJackpotSound();
        screenShakeAnim.setValue(0);
        Animated.sequence([
          Animated.timing(screenShakeAnim, { toValue: -6, duration: 40, useNativeDriver: true }),
          Animated.timing(screenShakeAnim, { toValue: 6,  duration: 40, useNativeDriver: true }),
          Animated.timing(screenShakeAnim, { toValue: -6, duration: 40, useNativeDriver: true }),
          Animated.timing(screenShakeAnim, { toValue: 6,  duration: 40, useNativeDriver: true }),
          Animated.timing(screenShakeAnim, { toValue: 0,  duration: 40, useNativeDriver: true }),
        ]).start();
        setReelConfettiVisible(true);
      }, 1100));

      bt.push(setTimeout(() => setReelConfettiVisible(false), 2400));

      bt.push(setTimeout(() => {
        setSpinning(false);
        setJackpotSpinning(false);
        setResultMessage(`${cat.emoji} +${oz} oz ${cat.label} → GOAL! 🏆`);
        setShowCelebration(true);
      }, 1500));
    } else {
      bt.push(setTimeout(() => {
        setResultMessage(`${cat.emoji} +${oz} oz ${cat.label} → ${hydrated} oz hydration`);
        setSpinning(false);
      }, 900));
    }
  }

  function handleCategorySelect(category: BevCategory) {
    if (pendingOz === null) return;
    addWater(pendingOz, category);
    setShowCategoryModal(false);
    setPendingOz(null);
  }

  function undoLastEntry() {
    if (lastEntry === null) return;
    const catLabel = lastEntryCategory ? (CATEGORIES.find((c) => c.key === lastEntryCategory)?.label ?? lastEntryCategory) : "drink";
    Alert.alert(
      "Undo Last Entry",
      `Remove ${lastEntry} oz ${catLabel} from today's total?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo",
          style: "destructive",
          onPress: async () => {
            haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
            const undoneHydratedOz = lastEntryHydratedOz ?? 0;
            const undoneCategory = lastEntryCategory;
            const wasJackpot = (await AsyncStorage.getItem("water_last_was_jackpot")) === "1";
            const newIntake = Math.max(0, intake - lastEntry);
            const newHydration = Math.max(0, Math.round((totalHydration - undoneHydratedOz) * 10) / 10);
            setIntake(newIntake);
            setTotalHydration(newHydration);
            setDisplayedHydration(newHydration);
            let newBreakdown = categoryBreakdown;
            if (undoneCategory !== null) {
              newBreakdown = { ...categoryBreakdown, [undoneCategory]: Math.max(0, categoryBreakdown[undoneCategory] - lastEntry) };
              setCategoryBreakdown(newBreakdown);
              setLastEntryCategory(null);
            }
            setLastEntry(null);
            setLastEntryHydratedOz(null);
            // Remove last drink log entry
            const newEntries = drinkLogEntries.slice(0, -1);
            setDrinkLogEntries(newEntries);
            await AsyncStorage.setItem("water_log_entries", JSON.stringify(newEntries));
            // Attempt to delete the matching Health sample (silent failure is fine)
            if (lastHealthSampleTime) {
              deleteWaterSample(lastHealthSampleTime).catch(() => {});
              setLastHealthSampleTime(null);
            }

            // Roll back lifetime stats so badges keyed off them can revalidate.
            const newLifeHyd = Math.max(0, Math.round((lifetimeHydrationOz - undoneHydratedOz) * 10) / 10);
            const newLifeCoffee = undoneCategory === "coffee" ? Math.max(0, lifetimeCoffeeLogs - 1) : lifetimeCoffeeLogs;
            const newLifeBeer = undoneCategory === "beer" ? Math.max(0, lifetimeBeerLogs - 1) : lifetimeBeerLogs;
            const newLifeJack = wasJackpot ? Math.max(0, lifetimeJackpots - 1) : lifetimeJackpots;
            setLifetimeHydrationOz(newLifeHyd);
            setLifetimeCoffeeLogs(newLifeCoffee);
            setLifetimeBeerLogs(newLifeBeer);
            if (wasJackpot) {
              setLifetimeJackpots(newLifeJack);
              setJackpotFiredToday(false);
            }

            const todayKey = getTodayKey();
            const baseRemovals = [
              AsyncStorage.setItem("water_category_breakdown", JSON.stringify(newBreakdown)),
              saveIntake(newIntake, newBreakdown, newHydration),
              AsyncStorage.removeItem("water_last_entry"),
              AsyncStorage.removeItem("water_last_hydrated"),
              AsyncStorage.removeItem("water_last_category"),
              AsyncStorage.removeItem("water_last_health_sample"),
              AsyncStorage.removeItem("water_last_was_jackpot"),
              AsyncStorage.setItem("lifetime_hydration_oz", JSON.stringify(newLifeHyd)),
              AsyncStorage.setItem("lifetime_coffee_logs", JSON.stringify(newLifeCoffee)),
              AsyncStorage.setItem("lifetime_beer_logs", JSON.stringify(newLifeBeer)),
            ];
            if (wasJackpot) {
              baseRemovals.push(
                AsyncStorage.removeItem(`goal_celebrated_${todayKey}`),
                AsyncStorage.setItem("lifetime_jackpots", JSON.stringify(newLifeJack)),
              );
            }
            // Clear stale streak-milestone "shown" flags for milestones above the new streak,
            // computed from the freshly saved goal_history so re-hitting the milestone re-shows the card.
            const newGoalHist = { ...goalHistoryRef.current, [todayKey]: goal > 0 ? Math.min(newHydration / goal, 1) : 0 };
            let newStreak = 0;
            { const d = new Date(); while ((newGoalHist[getDateKey(d)] ?? 0) >= 1.0) { newStreak++; d.setDate(d.getDate() - 1); } }
            for (const m of [3, 7, 14, 30]) {
              if (newStreak < m) baseRemovals.push(AsyncStorage.removeItem(`streak_milestone_${m}_shown`));
            }

            await Promise.all(baseRemovals);
          },
        },
      ],
    );
  }

  function handleCustomAdd() {
    const raw = parseFloat(customAmount);
    if (!isNaN(raw) && raw > 0) {
      const oz = customUnit === "ml" ? Math.round((raw / 29.5735) * 10) / 10 : raw;
      setShowCustomModal(false);
      setCustomAmount("");
      setCustomUnit("oz");
      setPendingQty(1);
      setPendingBetOz(oz);
    } else {
      Alert.alert("Please enter a valid amount");
    }
  }

  function closeCustomModal() {
    setShowCustomModal(false);
    setCustomAmount("");
    setCustomUnit("oz");
  }

  /** Reschedule notifications immediately after a goal change. */
  function rescheduleAfterGoalChange(newGoalOz: number) {
    const h = totalHydrationRef.current;
    const newPct    = newGoalOz > 0 ? Math.min(h / newGoalOz, 1) : 0;
    const newRemOz  = Math.max(0, newGoalOz - h);
    const gh        = goalHistoryRef.current;
    const streakNow = (() => {
      let s = 0; const d = new Date();
      while ((gh[getDateKey(d)] ?? 0) >= 1.0) { s++; d.setDate(d.getDate() - 1); }
      return s;
    })();
    rescheduleSmartNotifications(newPct, streakNow, newRemOz);
  }

  async function handleSetGoal() {
    const raw = parseFloat(newGoal);
    if (isNaN(raw) || raw <= 0) {
      Alert.alert("Invalid Goal", "Please enter a valid number.");
      return;
    }
    // Storage is always oz; convert ml input back if the user is in ml mode.
    const g = preferredUnit === 'ml' ? Math.round((raw / 29.5735) * 10) / 10 : raw;
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    setGoal(g);
    await AsyncStorage.setItem("water_goal", JSON.stringify(g));
    closeGoalModal();
    sendHydrationUpdate({ hydrationOz: totalHydration, goalOz: g, pct: g > 0 ? totalHydration / g : 0, streak: 0, selectedBeverages }).catch(() => {});
    rescheduleAfterGoalChange(g);
  }

  async function handleSetGallonGoal(oz: number) {
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    setGoal(oz);
    await AsyncStorage.setItem("water_goal", JSON.stringify(oz));
    closeGoalModal();
    sendHydrationUpdate({ hydrationOz: totalHydration, goalOz: oz, pct: oz > 0 ? totalHydration / oz : 0, streak: 0, selectedBeverages }).catch(() => {});
    rescheduleAfterGoalChange(oz);
  }

  function calcSuggestedOz(): number | null {
    let weightLbs: number;
    if (weightMode === "type") {
      const w = parseFloat(typeWeight);
      if (isNaN(w) || w < 80 || w > 400) return null;
      weightLbs = w;
    } else {
      weightLbs = suggWeightLbs;
    }
    let feet: number;
    let inches: number;
    if (heightMode === "type") {
      const f = parseFloat(typeFeet);
      const i = parseFloat(typeInches);
      if (isNaN(f) || f < 4 || f > 7 || isNaN(i) || i < 0 || i > 11) return null;
      feet = f;
      inches = i;
    } else {
      feet = suggFeet;
      inches = suggInches;
    }
    const factor =
      suggActivity === "sedentary" ? 0.5 :
      suggActivity === "moderate" ? 0.6 : 0.7;
    let oz = weightLbs * factor;
    const totalInches = feet * 12 + inches;
    if (totalInches > 60) oz += Math.floor((totalInches - 60) / 6) * 12;
    return Math.min(Math.round(oz), 128);
  }

  function switchWeightMode(mode: "scroll" | "type") {
    if (mode === "type" && weightMode === "scroll") {
      setTypeWeight(String(suggWeightLbs));
    } else if (mode === "scroll" && weightMode === "type") {
      const w = parseFloat(typeWeight);
      if (!isNaN(w) && w >= 80 && w <= 400) setSuggWeightLbs(Math.round(w));
    }
    setWeightMode(mode);
  }

  function switchHeightMode(mode: "scroll" | "type") {
    if (mode === "type" && heightMode === "scroll") {
      setTypeFeet(String(suggFeet));
      setTypeInches(String(suggInches));
    } else if (mode === "scroll" && heightMode === "type") {
      const f = parseFloat(typeFeet);
      const i = parseFloat(typeInches);
      if (!isNaN(f) && f >= 4 && f <= 7) setSuggFeet(Math.round(f));
      if (!isNaN(i) && i >= 0 && i <= 11) setSuggInches(Math.round(i));
    }
    setHeightMode(mode);
  }

  async function handleUseSuggestedGoal() {
    const oz = calcSuggestedOz();
    if (oz === null) return;
    setGoal(oz);
    await AsyncStorage.setItem("water_goal", JSON.stringify(oz));
    closeGoalModal();
    rescheduleAfterGoalChange(oz);
  }

  function closeGoalModal() {
    setShowGoalModal(false);
    setNewGoal("");
    setGoalTab("custom");
    setSuggWeightLbs(150);
    setSuggFeet(5);
    setSuggInches(7);
    setSuggActivity("sedentary");
    setWeightMode("scroll");
    setHeightMode("scroll");
    setTypeWeight("");
    setTypeFeet("");
    setTypeInches("");
  }

  async function resetToday() {
    Alert.alert(
      "Reset Today",
      "Are you sure you want to reset today's intake?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
            setIntake(0);
            setTotalHydration(0);
            setDisplayedHydration(0);
            setCategoryBreakdown(EMPTY_BREAKDOWN);
            setLastEntry(null);
            setLastEntryHydratedOz(null);
            setLastEntryCategory(null);
            setDrinkLogEntries([]);
            setFirstDrinkTime(null);
            // Clear the LAST DRINK reveal panel so it goes back to its empty
            // state ("Tap a quick-add amount") and re-arm the goal celebration
            // so the user can hit jackpot again the same day after resetting.
            setLastReelOz(0);
            setJackpotFiredToday(false);
            setResultMessage(null);
            await AsyncStorage.setItem(getTodayKey(), JSON.stringify(0));
            await AsyncStorage.setItem("water_total_hydration", JSON.stringify(0));
            await AsyncStorage.setItem("water_category_breakdown", JSON.stringify(EMPTY_BREAKDOWN));
            await AsyncStorage.removeItem("water_last_entry");
            await AsyncStorage.removeItem("water_last_hydrated");
            await AsyncStorage.removeItem("water_last_category");
            await AsyncStorage.removeItem("water_log_entries");
            await AsyncStorage.removeItem("first_drink_time");
            const todayKey = getTodayKey();
            const newGoalHistory = { ...goalHistory };
            delete newGoalHistory[todayKey];
            setGoalHistory(newGoalHistory);
            await AsyncStorage.setItem("goal_history", JSON.stringify(newGoalHistory));
          },
        },
      ],
    );
  }

  const hydrationPct = goal > 0 ? totalHydration / goal : 0;
  const stage = getStage(Math.min(hydrationPct, 1));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const suggestedOz = useMemo(() => calcSuggestedOz(), [
    weightMode, typeWeight, suggWeightLbs,
    heightMode, typeFeet, typeInches, suggFeet, suggInches, suggActivity,
  ]);
  const streak = useMemo(() => {
    let s = 0;
    const d = new Date();
    while (true) {
      const key = getDateKey(d);
      if ((goalHistory[key] ?? 0) >= 1.0) { s++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return s;
  }, [goalHistory]);

  const prevStreakRef = useRef(0);
  useEffect(() => {
    const prev = prevStreakRef.current;
    if (streak > prev) {
      const STREAK_NOTIFS: Record<number, [string, string]> = {
        3:  ["3 Day Streak! 🔥",   "You're on fire — 3 days of hitting your goal!"],
        7:  ["One Week Streak! 🏆", "A full week of hitting your goal — you're a hydration legend!"],
        14: ["Two Week Streak! 👑", "14 days straight — unstoppable!"],
        30: ["30 Day Streak! 🌊",  "A whole month of hitting your goal — you're a Hydro Hero legend!"],
      };
      if (STREAK_NOTIFS[streak]) {
        playStreakSound();
        haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
        const [title, body] = STREAK_NOTIFS[streak];
        fireImmediateNotifOnce(`notif_streak_${streak}_${getTodayKey()}`, title, body, notifStreakEnabled);
      }
      // Show confetti milestone card for 3, 7, 14, 30 — only once per milestone
      const CONFETTI_MILESTONES = [3, 7, 14, 30];
      if (CONFETTI_MILESTONES.includes(streak)) {
        const milestoneKey = `streak_milestone_${streak}_shown`;
        (async () => {
          try {
            const shown = await AsyncStorage.getItem(milestoneKey);
            if (!shown) {
              await AsyncStorage.setItem(milestoneKey, "1");
              setStreakMilestone(streak);
            }
          } catch {}
        })();
      }
    }
    prevStreakRef.current = streak;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak]);

  if (showOnboarding === null) {
    return <View style={{ flex: 1, backgroundColor: "#0a0520" }} />;
  }

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0520" }}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0520" />
      <StarParticles />
      {badgeToast && (
        <TouchableOpacity
          style={{
            position: "absolute", bottom: tabBarHeight + 12, left: 16, right: 16, zIndex: 50,
            backgroundColor: "rgba(255,215,0,0.96)", borderRadius: 14,
            paddingVertical: 12, paddingHorizontal: 14,
            flexDirection: "row", alignItems: "center", gap: 12,
            shadowColor: "#000", shadowOpacity: 0.4, shadowOffset: { width: 0, height: -4 }, shadowRadius: 10,
          }}
          activeOpacity={0.9}
          onPress={() => {
            setBadgeToast(null);
            if (badgeToastTimer.current) clearTimeout(badgeToastTimer.current);
            router.navigate("/(tabs)/badges");
          }}
        >
          <Text style={{ fontSize: 28 }}>{badgeToast[0]?.emoji ?? "🏆"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#0a0520", fontSize: 13, fontWeight: "900", letterSpacing: 0.4 }}>
              {badgeToast.length === 1
                ? `NEW BADGE: ${badgeToast[0].name.toUpperCase()}`
                : `${badgeToast.length} NEW BADGES UNLOCKED!`}
            </Text>
            <Text style={{ color: "rgba(10,5,32,0.7)", fontSize: 12, marginTop: 2 }}>
              Tap to view in Badges →
            </Text>
          </View>
        </TouchableOpacity>
      )}
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <Animated.ScrollView
        ref={mainScrollRef}
        contentContainerStyle={[styles.scroll, { paddingTop: 0, paddingBottom: tabBarHeight + 24 }]}
        keyboardShouldPersistTaps="handled"
        style={{ transform: [{ translateX: screenShakeAnim }] }}
      >

        {/* Marquee Header */}
        <MarqueeHeader goal={goal} hydration={totalHydration} preferredUnit={preferredUnit} />

        {/* Art Deco Vault — unified tank + dispenser */}
        <View onLayout={(e) => setReelFrameY(e.nativeEvent.layout.y)}>
          <ArtDecoVault
            pct={goal > 0 ? displayedHydration / goal : 0}
            oz={displayedHydration}
            goal={goal}
            loggedCategory={lastLoggedCategory}
            lastReelOz={lastReelOz}
            logNonce={logNonce}
            onSpoutRef={(x, y) => setSpoutOrigin({ x, y })}
            onTankFill={() => {
              fireSpray();
              if (skipNextSplashRef.current) {
                skipNextSplashRef.current = false;
              } else {
                playWaterLogSound();
              }
            }}
            onLaunchDroplet={launchDroplet}
            preferredUnit={preferredUnit}
          />
        </View>

        {/* Presets Row — placed above the beverage picker so one-tap repeats stay visible without scrolling */}
        {presets.length > 0 && (
          <PresetsRow
            presets={presets}
            onSelect={(p) => {
              haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
              setSelectedCategory(p.category);
              setPendingQty(1);
              setPendingBetOz(p.oz);
            }}
            onDelete={deletePreset}
            onReorder={reorderPresets}
            isPro={isPro}
          />
        )}

        {/* Beverage Selector */}
        <BeverageSelector
          selected={selectedCategory}
          onSelect={setSelectedCategory}
          visibleBevs={isPro ? selectedBeverages : DEFAULT_VISIBLE_BEVS}
          isPro={isPro}
          onEditBevs={() => {
            if (!isPro) { openPaywall(); return; }
            setShowChooseBevs(true);
          }}
        />

        {/* Quick Bet Buttons */}
        <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginTop: 10, marginBottom: 2 }}>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "700", letterSpacing: 0.8, flex: 1 }}>QUICK ADD</Text>
          {isPro && (
            <TouchableOpacity
              onPress={() => setShowQuickAddModal(true)}
              activeOpacity={0.7}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,215,0,0.18)", borderWidth: 1, borderColor: "rgba(255,215,0,0.45)", alignItems: "center", justifyContent: "center" }}
              accessibilityLabel="Edit quick-add amounts"
            >
              <Text style={{ fontSize: 17, lineHeight: 22 }}>✏️</Text>
            </TouchableOpacity>
          )}
        </View>
        <QuickBets onBet={(oz) => { haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); setPendingQty(1); setPendingBetOz(oz); }} spinning={spinning || jackpotSpinning} amounts={quickAddAmounts} preferredUnit={preferredUnit} />

        {/* Pro upsell — Quick Add customization (free users only) */}
        {!isPro && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openPaywall()}
            style={{
              marginHorizontal: 12,
              marginTop: 10,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: "rgba(255,215,0,0.5)",
              borderStyle: "dashed",
              backgroundColor: "rgba(255,215,0,0.06)",
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 26 }}>⭐</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: GOLD, fontSize: 14, fontWeight: "800", letterSpacing: 0.3 }}>
                Customize Your Quick Add
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 2, lineHeight: 16 }}>
                Pick the amounts you actually drink — set 6 of your own.
              </Text>
            </View>
            <View style={{
              backgroundColor: GOLD, borderRadius: 6,
              paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{ color: "#0a0520", fontSize: 10, fontWeight: "900", letterSpacing: 0.6 }}>PRO</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Custom Amount entry — replaces the old "+" header button and the
            "⭐ Custom" beverage tile so there's one unambiguous entry point. */}
        <TouchableOpacity
          style={{
            marginHorizontal: 12,
            marginTop: 8,
            paddingVertical: 13,
            paddingHorizontal: 16,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: "rgba(255,215,0,0.45)",
            backgroundColor: "rgba(255,215,0,0.06)",
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          }}
          activeOpacity={0.75}
          onPress={() => { playButtonTapSound(); openCustomModal(); }}
        >
          <Text style={{ fontSize: 18, color: GOLD }}>＋</Text>
          <Text style={{ color: GOLD, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 }}>Other Amount</Text>
        </TouchableOpacity>

        {/* Result Box */}
        <ResultBox message={resultMessage} />

        {/* Undo Last Entry — prominent full-width button below quick add */}
        <TouchableOpacity
          style={[
            undoStyles.btn,
            lastEntry === null && undoStyles.btnDisabled,
          ]}
          onPress={undoLastEntry}
          disabled={lastEntry === null}
          activeOpacity={0.75}
        >
          <Text style={[undoStyles.btnText, lastEntry === null && undoStyles.btnTextDisabled]}>
            {lastEntry !== null && lastEntryCategory
              ? `↩ Undo last: +${preferredUnit === 'ml' ? `${ozToMl(lastEntry)} ml` : `${formatOz(lastEntry)} oz`} ${CATEGORIES.find((c) => c.key === lastEntryCategory)?.label ?? ""}`
              : lastEntry !== null
              ? `↩ Undo last: +${preferredUnit === 'ml' ? `${ozToMl(lastEntry)} ml` : `${formatOz(lastEntry)} oz`}`
              : "↩ No entry to undo"}
          </Text>
        </TouchableOpacity>

        {/* Stats Bar */}
        <StatsBar
          goal={goal}
          hydration={totalHydration}
          intake={intake}
          streak={streak}
          healthActive={healthPermissionGranted && healthSyncEnabled}
          onHealthPress={() => setShowHealthModal(true)}
          preferredUnit={preferredUnit}
        />

        {/* Drink Log */}
        <DrinkLog breakdown={categoryBreakdown} intake={intake} entries={drinkLogEntries} preferredUnit={preferredUnit} />

        {/* Weather Banner */}
        {weatherBannerOz !== null && !weatherBannerDismissed && (
          <WeatherBanner
            tempF={weatherTempF!}
            extraOz={weatherBannerOz}
            stageColor="#FFD700"
            onApply={() => {
              const newG = goal + weatherBannerOz!;
              setGoal(newG);
              AsyncStorage.setItem("water_goal", JSON.stringify(newG));
              setWeatherBannerDismissed(true);
            }}
            onDismiss={() => setWeatherBannerDismissed(true)}
          />
        )}


        {/* Action Buttons */}
        <View style={[styles.actionRow, { marginBottom: 8 }]}>
          <TouchableOpacity style={casinoActionBtn} onPress={() => setShowGoalModal(true)}>
            <Text style={casinoActionBtnText}>🎯 Set Goal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={casinoActionBtn} onPress={resetToday}>
            <Text style={casinoActionBtnText}>🔄 Reset</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={{ alignSelf: 'center', padding: 16, marginTop: 8, marginBottom: 32 }}
          activeOpacity={0.7}
          onPress={() => setShowPromoModal(true)}
        >
          <Text style={{ color: '#FFD700', fontSize: 14, fontWeight: '700' }}>🎁 Redeem Code</Text>
        </TouchableOpacity>

      </Animated.ScrollView>
      </TouchableWithoutFeedback>

      {/* iOS: InputAccessoryView for Custom Amount */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={CUSTOM_ACCESSORY_ID}>
          <View style={styles.iosKbBar}>
            <TouchableOpacity onPress={Keyboard.dismiss}>
              <Text style={[styles.iosKbDone, { color: stage.color }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

      {/* Android: floating Done button above keyboard for Custom Amount */}
      {Platform.OS === "android" && kbHeight > 0 && (
        <View style={[styles.androidKbBar, { bottom: kbHeight }]}>
          <TouchableOpacity onPress={Keyboard.dismiss}>
            <Text style={[styles.androidKbDone, { color: stage.color }]}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Custom Amount Modal */}
      <Modal visible={showCustomModal} transparent animationType="fade" onRequestClose={closeCustomModal}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.modalBox}>
                  {/* Close button */}
                  <View style={styles.kbToolbar}>
                    <TouchableOpacity onPress={closeCustomModal}>
                      <Text style={[styles.kbDoneBtn, { color: stage.color }]}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.modalTitle}>💧 Enter Amount</Text>
                  <View style={styles.modalDivider} />

                  {/* Unit toggle */}
                  <View style={[styles.modalTabs, { marginTop: 8 }]}>
                    {(["oz", "ml"] as const).map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[styles.modalTab, customUnit === u ? { backgroundColor: stage.color } : styles.modalTabInactive]}
                        onPress={() => { setCustomUnit(u); setCustomAmount(""); }}
                      >
                        <Text style={[styles.modalTabText, customUnit === u && styles.modalTabTextActive]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Input */}
                  <TextInput
                    style={styles.modalInput}
                    placeholder={customUnit === "oz" ? "Enter amount in oz..." : "Enter amount in ml..."}
                    placeholderTextColor="#AAAAAA"
                    keyboardType="decimal-pad"
                    inputAccessoryViewID={CUSTOM_ACCESSORY_ID}
                    value={customAmount}
                    onChangeText={setCustomAmount}
                  />

                  {/* Live conversion */}
                  {(() => {
                    const n = parseFloat(customAmount);
                    if (isNaN(n) || n <= 0) return null;
                    const label = customUnit === "oz"
                      ? `= ${ozToMl(n)} ml`
                      : `= ${(Math.round((n / 29.5735) * 10) / 10).toFixed(1)} oz`;
                    return <Text style={styles.modalMl}>{label}</Text>;
                  })()}

                  {/* Buttons */}
                  <View style={styles.modalBtnRow}>
                    <TouchableOpacity style={styles.modalCancel} onPress={closeCustomModal}>
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: stage.color }]} onPress={handleCustomAdd}>
                      <Text style={styles.modalConfirmText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
        {Platform.OS === "ios" && (
          <InputAccessoryView nativeID={CUSTOM_ACCESSORY_ID}>
            <View style={styles.iosKbBar}>
              <TouchableOpacity onPress={Keyboard.dismiss}>
                <Text style={[styles.iosKbDone, { color: stage.color }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        )}
      </Modal>

      {/* Confirm Drink Modal */}
      <Modal visible={pendingBetOz !== null} transparent animationType="slide" onRequestClose={() => { setPendingBetOz(null); setPendingQty(1); }}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.75)" }}>
          <View style={{
            backgroundColor: "#0d0030",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 28,
            borderTopWidth: 2,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: GOLD,
          }}>
            {/* Title */}
            <Text style={{ color: GOLD, fontSize: 11, fontWeight: "800", letterSpacing: 3, textAlign: "center", marginBottom: 20 }}>
              CONFIRM YOUR DRINK
            </Text>

            {/* Chosen drink */}
            {(() => {
              const cat = CATEGORIES.find((c) => c.key === selectedCategory) ?? CATEGORIES[0];
              const baseOz = pendingBetOz ?? 0;
              const totalOz = baseOz * pendingQty;
              const baseDisplay = preferredUnit === 'ml' ? `${ozToMl(baseOz)} ml` : `${baseOz} oz`;
              const totalDisplay = preferredUnit === 'ml' ? `${ozToMl(totalOz)} ml` : `${totalOz} oz`;
              return (
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,215,0,0.08)", borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,215,0,0.3)" }}>
                  <Text style={{ fontSize: 40, marginRight: 14 }}>{cat.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "800" }}>{cat.label}</Text>
                    <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>
                      {Math.round(getBev(cat.key).eff * 100)}% hydration efficiency
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: GOLD, fontSize: 26, fontWeight: "900" }}>{totalDisplay}</Text>
                    <Text style={{ color: "rgba(255,215,0,0.6)", fontSize: 11, marginTop: 2 }}>
                      {pendingQty > 1
                        ? `${pendingQty} × ${baseDisplay}`
                        : `→ ${calcHydratedOz(totalOz, selectedCategory)} oz hydrated`}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Quantity selector */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = pendingQty === n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={{
                      flex: 1,
                      backgroundColor: active ? GOLD : "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor: active ? GOLD : "rgba(255,215,0,0.25)",
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: "center",
                    }}
                    activeOpacity={0.8}
                    onPress={() => setPendingQty(n)}
                  >
                    <Text style={{
                      color: active ? "#0a0520" : "rgba(255,255,255,0.7)",
                      fontSize: 15,
                      fontWeight: "800",
                    }}>× {n}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Save as Preset (Pro) */}
            <TouchableOpacity
              style={{
                borderRadius: 12,
                paddingVertical: 11,
                alignItems: "center",
                marginBottom: 10,
                borderWidth: 1,
                borderColor: "rgba(255,215,0,0.35)",
                backgroundColor: "rgba(255,215,0,0.06)",
              }}
              activeOpacity={0.8}
              onPress={() => {
                // Tiered: free tier gets 1 preset slot; Pro gets unlimited.
                if (!isPro && presets.length >= 1) { setPendingBetOz(null); setPendingQty(1); openPaywall(); return; }
                const baseOz = pendingBetOz ?? 0;
                const totalOz = baseOz * pendingQty;
                const catLabel = CATEGORIES.find((c) => c.key === selectedCategory)?.label ?? "Drink";
                const suggested = pendingQty > 1 ? `${pendingQty} × ${catLabel}` : `My ${catLabel}`;
                Alert.prompt(
                  "Save as Preset",
                  `One-tap log for ${totalOz} oz ${catLabel}.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Save",
                      onPress: (name?: string) => {
                        savePreset(name ?? suggested, totalOz, selectedCategory);
                      },
                    },
                  ],
                  "plain-text",
                  suggested,
                );
              }}
            >
              <Text style={{ color: GOLD, fontSize: 14, fontWeight: "700", letterSpacing: 0.4 }}>
                💾 Save as Preset{!isPro && presets.length >= 1 ? " 🔒" : ""}
              </Text>
            </TouchableOpacity>

            {/* FILL */}
            <TouchableOpacity
              style={{
                backgroundColor: GOLD,
                borderRadius: 14,
                paddingVertical: 18,
                alignItems: "center",
                marginBottom: 12,
              }}
              onPress={() => {
                playButtonTapSound();
                const oz = (pendingBetOz ?? 0) * pendingQty;
                setPendingBetOz(null);
                setPendingQty(1);
                handleBet(oz);
              }}
            >
              <Text style={{ color: "#0a0520", fontSize: 18, fontWeight: "900", letterSpacing: 2 }}>💧 FILL</Text>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              style={{ alignItems: "center", paddingVertical: 16 }}
              onPress={() => { setPendingBetOz(null); setPendingQty(1); }}
              hitSlop={{ top: 8, bottom: 8, left: 24, right: 24 }}
            >
              <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Category Picker Modal */}
      <Modal
        visible={showCategoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowCategoryModal(false); setPendingOz(null); setCustomAmount(""); setCustomUnit("oz"); setCatPickerShowAll(false); }}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.modalBox}>
              <View style={styles.kbToolbar}>
                <TouchableOpacity onPress={() => { setShowCategoryModal(false); setPendingOz(null); setCustomAmount(""); setCustomUnit("oz"); setCatPickerShowAll(false); }}>
                  <Text style={[styles.kbDoneBtn, { color: stage.color }]}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.modalTitle}>What did you drink?</Text>
              <View style={styles.modalDivider} />
              <View style={styles.categoryGrid}>
                {(catPickerShowAll ? CATEGORIES : selectedBeverages.map(getBev)).map((cat) => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.categoryBtn, { borderColor: cat.color }]}
                    onPress={() => { setCatPickerShowAll(false); handleCategorySelect(cat.key); }}
                  >
                    <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                    <Text style={[styles.categoryLabel, { color: cat.color }]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
                {!catPickerShowAll && (
                  <TouchableOpacity
                    style={[styles.categoryBtn, { borderColor: "rgba(255,215,0,0.5)" }]}
                    onPress={() => setCatPickerShowAll(true)}
                  >
                    <Text style={styles.categoryEmoji}>🔍</Text>
                    <Text style={[styles.categoryLabel, { color: GOLD }]}>More...</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </Modal>

      {/* Choose Your 7 Beverages Modal */}
      <ChooseBevsModal
        visible={showChooseBevs}
        current={selectedBeverages}
        usage={categoryBreakdown}
        onSave={async (bevs) => {
          setSelectedBeverages(bevs);
          setShowChooseBevs(false);
          try {
            await AsyncStorage.setItem("selected_beverages", JSON.stringify(bevs));
          } catch {}
        }}
        onCancel={() => setShowChooseBevs(false)}
      />

      {/* Set Goal Modal */}
      <Modal visible={showGoalModal} transparent animationType="fade" onRequestClose={closeGoalModal}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              {/* Plain View w/ onStartShouldSetResponder swallows tap-bubble to the
                  outer Keyboard.dismiss without claiming pan gestures — lets the
                  Suggest tab's ScrollPickers receive drag events. */}
              <View
                style={styles.modalBox}
                onStartShouldSetResponder={() => true}
              >
                  {/* Close button */}
                  <View style={styles.kbToolbar}>
                    <TouchableOpacity onPress={closeGoalModal}>
                      <Text style={[styles.kbDoneBtn, { color: stage.color }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
            {/* Title */}
            <Text style={styles.modalTitle}>💧 Set Daily Goal</Text>
            <View style={styles.modalDivider} />
            <Text style={styles.goalSafetyNote}>
              Hydration needs vary. Use goals as a guide, avoid forcing fluids, and follow medical guidance if you have health concerns.
            </Text>

            {/* Tabs */}
            <View style={styles.modalTabs}>
              {(["custom", "gallon", "suggested"] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.modalTab,
                    goalTab === tab
                      ? { backgroundColor: stage.color }
                      : styles.modalTabInactive,
                  ]}
                  onPress={() => setGoalTab(tab)}
                >
                  <Text style={[styles.modalTabText, goalTab === tab && styles.modalTabTextActive]}>
                    {tab === "custom" ? "Custom" : tab === "gallon" ? "Gallon" : "Suggested"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Tab */}
            {goalTab === "custom" && (
              <View>
                <TextInput
                  style={styles.modalInput}
                  placeholder={preferredUnit === 'ml' ? "Enter goal in ml..." : "Enter goal in oz..."}
                  placeholderTextColor="#AAAAAA"
                  keyboardType="decimal-pad"
                  inputAccessoryViewID={KB_ACCESSORY_ID}
                  value={newGoal}
                  onChangeText={setNewGoal}
                />
                <Text style={styles.modalMl}>
                  {newGoal
                    ? preferredUnit === 'ml'
                      ? `= ${((parseFloat(newGoal) || 0) / 29.5735).toFixed(1)} oz`
                      : `= ${ozToMl(parseFloat(newGoal) || 0)} ml`
                    : ""}
                </Text>
                <View style={styles.modalBtnRow}>
                  <TouchableOpacity style={styles.modalCancel} onPress={closeGoalModal}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: stage.color }]} onPress={handleSetGoal}>
                    <Text style={styles.modalConfirmText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Gallon Tab */}
            {goalTab === "gallon" && (
              <View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {[
                    { label: "Half Gallon", oz: 64 },
                    { label: "1 Gallon", oz: 128 },
                  ].map(({ label, oz }) => (
                    <TouchableOpacity
                      key={oz}
                      style={[
                        styles.gallonPreset,
                        { flex: 1 },
                        goal === oz && { borderColor: stage.color, backgroundColor: stage.color + "18" },
                      ]}
                      onPress={() => handleSetGallonGoal(oz)}
                    >
                      <Text style={styles.gallonPresetLabel}>{label}</Text>
                      <Text style={[styles.gallonPresetOz, goal === oz && { color: stage.color }]}>
                        {preferredUnit === 'ml' ? `${ozToMl(oz)} ml` : `${oz} oz`}
                      </Text>
                      <Text style={styles.gallonPresetMl}>
                        {preferredUnit === 'ml' ? `${oz} oz` : `${ozToMl(oz)} ml`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={[styles.modalCancel, { marginTop: 12 }]} onPress={closeGoalModal}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Suggested Tab */}
            {goalTab === "suggested" && (
              <View>
                {/* Weight */}
                <View style={styles.inputModeHeader}>
                  <Text style={styles.modalFieldLabel}>Weight</Text>
                  <View style={styles.modeToggle}>
                    {(["scroll", "type"] as const).map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.modeBtn, weightMode === m && { backgroundColor: stage.color }]}
                        onPress={() => switchWeightMode(m)}
                      >
                        <Text style={[styles.modeBtnText, weightMode === m && styles.modeBtnTextActive]}>
                          {m === "scroll" ? "Scroll" : "Type"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {weightMode === "scroll" ? (
                  <View style={styles.pickerRow}>
                    <ScrollPicker
                      items={Array.from({ length: 321 }, (_, i) => i + 80)}
                      selectedIndex={suggWeightLbs - 80}
                      onIndexChange={(i) => setSuggWeightLbs(i + 80)}
                      label="lbs"
                    />
                  </View>
                ) : (
                  <View>
                    <TextInput
                      style={styles.typeInput}
                      placeholder="Weight in lbs"
                      placeholderTextColor="#AAAAAA"
                      keyboardType="numeric"
                      inputAccessoryViewID={KB_ACCESSORY_ID}
                      value={typeWeight}
                      onChangeText={setTypeWeight}
                    />
                    {typeWeight.length > 0 && (() => { const w = parseFloat(typeWeight); return isNaN(w) || w < 80 || w > 400; })() && (
                      <Text style={styles.validationError}>Please enter a valid weight (80–400 lbs)</Text>
                    )}
                  </View>
                )}

                {/* Height */}
                <View style={styles.inputModeHeader}>
                  <Text style={styles.modalFieldLabel}>Height</Text>
                  <View style={styles.modeToggle}>
                    {(["scroll", "type"] as const).map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.modeBtn, heightMode === m && { backgroundColor: stage.color }]}
                        onPress={() => switchHeightMode(m)}
                      >
                        <Text style={[styles.modeBtnText, heightMode === m && styles.modeBtnTextActive]}>
                          {m === "scroll" ? "Scroll" : "Type"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {heightMode === "scroll" ? (
                  <View style={styles.pickerRow}>
                    <ScrollPicker
                      items={[4, 5, 6, 7]}
                      selectedIndex={suggFeet - 4}
                      onIndexChange={(i) => setSuggFeet(i + 4)}
                      label="ft"
                    />
                    <ScrollPicker
                      items={Array.from({ length: 12 }, (_, i) => i)}
                      selectedIndex={suggInches}
                      onIndexChange={(i) => setSuggInches(i)}
                      label="in"
                    />
                  </View>
                ) : (
                  <View>
                    <View style={styles.typeHeightRow}>
                      <TextInput
                        style={[styles.typeInput, { flex: 1 }]}
                        placeholder="ft"
                        placeholderTextColor="#AAAAAA"
                        keyboardType="numeric"
                        inputAccessoryViewID={KB_ACCESSORY_ID}
                        value={typeFeet}
                        onChangeText={setTypeFeet}
                      />
                      <TextInput
                        style={[styles.typeInput, { flex: 1 }]}
                        placeholder="in"
                        placeholderTextColor="#AAAAAA"
                        keyboardType="numeric"
                        inputAccessoryViewID={KB_ACCESSORY_ID}
                        value={typeInches}
                        onChangeText={setTypeInches}
                      />
                    </View>
                    {(typeFeet.length > 0 || typeInches.length > 0) && (() => {
                      const f = parseFloat(typeFeet);
                      const i = parseFloat(typeInches);
                      return isNaN(f) || f < 4 || f > 7 || isNaN(i) || i < 0 || i > 11;
                    })() && (
                      <Text style={styles.validationError}>Please enter a valid height (ft: 4–7, in: 0–11)</Text>
                    )}
                  </View>
                )}

                {/* Activity Level */}
                <Text style={styles.modalFieldLabel}>Activity Level</Text>
                <View style={styles.activityRow}>
                  {(["sedentary", "moderate", "active"] as const).map((level) => (
                    <TouchableOpacity
                      key={level}
                      style={[
                        styles.activityBtn,
                        suggActivity === level && { backgroundColor: stage.color, borderColor: stage.color },
                      ]}
                      onPress={() => setSuggActivity(level)}
                    >
                      <Text style={[styles.activityBtnText, suggActivity === level && styles.activityBtnTextActive]}>
                        {level === "sedentary" ? "Sedentary" : level === "moderate" ? "Moderate" : "Very Active"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Recommended Result */}
                <View style={styles.suggestedResult}>
                  <Text style={styles.suggestedResultLabel}>Recommended daily intake</Text>
                  {suggestedOz !== null ? (
                    <>
                      <Text style={[styles.suggestedOz, { color: stage.color }]}>
                        {preferredUnit === 'ml' ? `${ozToMl(suggestedOz)} ml` : `${suggestedOz} oz`}
                      </Text>
                      <Text style={styles.suggestedMl}>
                        {preferredUnit === 'ml' ? `${suggestedOz} oz` : `${ozToMl(suggestedOz)} ml`}
                      </Text>
                      {suggestedOz === 128 && (
                        <Text style={styles.suggestedCap}>Max recommendation is 1 gallon (128oz)</Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.suggestedPlaceholder}>Enter your details above</Text>
                  )}
                </View>

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity style={styles.modalCancel} onPress={closeGoalModal}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalConfirm, { backgroundColor: suggestedOz !== null ? stage.color : "#CCCCCC" }]}
                    onPress={handleUseSuggestedGoal}
                    disabled={suggestedOz === null}
                  >
                    <Text style={styles.modalConfirmText}>Use This Goal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
                </View>
              {/* Android: floating Done toolbar above keyboard */}
              {Platform.OS === "android" && kbHeight > 0 && (
                <View style={[styles.androidKbBar, { bottom: kbHeight }]}>
                  <TouchableOpacity onPress={Keyboard.dismiss}>
                    <Text style={[styles.androidKbDone, { color: stage.color }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
        {/* iOS: InputAccessoryView docked above keyboard */}
        {Platform.OS === "ios" && (
          <InputAccessoryView nativeID={KB_ACCESSORY_ID}>
            <View style={styles.iosKbBar}>
              <TouchableOpacity onPress={Keyboard.dismiss}>
                <Text style={[styles.iosKbDone, { color: stage.color }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        )}
      </Modal>

      <ReelConfetti visible={reelConfettiVisible} originY={reelFrameY} />
      <GoalCelebration
        visible={showCelebration}
        goal={goal}
        onDismiss={() => {
          setShowCelebration(false);
          setShowFactCard(true);
        }}
      />
      <FactJokeCard visible={showFactCard} onDismiss={() => setShowFactCard(false)} />
      <StreakMilestoneCard milestone={streakMilestone} onDismiss={() => setStreakMilestone(null)} />
      <ParticleOverlay particles={sprayParticles} visible={sprayVisible} />
      <HandoffDroplet ref={dropletRef} />

      {/* Health Info Modal */}
      <Modal visible={showHealthModal} transparent animationType="fade" onRequestClose={() => setShowHealthModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowHealthModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalBox, { paddingVertical: 28, backgroundColor: "#ffffff" }]}>
                <Text style={[styles.modalTitle, { fontSize: 18, color: "#1a1a2e" }]}>
                  {healthPermissionGranted ? "♥ Apple Health" : "🩶 Apple Health"}
                </Text>
                <View style={[styles.modalDivider, { backgroundColor: "rgba(200,160,0,0.3)" }]} />
                <Text style={{ color: "#444444", fontSize: 14, lineHeight: 22, textAlign: "center", marginTop: 10, marginBottom: 20, paddingHorizontal: 8 }}>
                  {healthPermissionGranted && healthSyncEnabled
                    ? "Your hydration data is being synced to Apple Health after each drink."
                    : healthPermissionGranted && !healthSyncEnabled
                    ? "Apple Health sync is currently turned off. Enable it in Settings."
                    : "Enable Apple Health sync in your iPhone Settings to track hydration across all your health apps."}
                </Text>
                <TouchableOpacity
                  style={[styles.modalTab, { backgroundColor: GOLD, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 24 }]}
                  onPress={() => setShowHealthModal(false)}
                >
                  <Text style={[styles.modalTabText, styles.modalTabTextActive, { fontSize: 14 }]}>Got it</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={showSettingsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(200,160,0,0.3)',
          }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a1a2e' }}>⚙️ Settings</Text>
            <TouchableOpacity
              onPress={() => setShowSettingsModal(false)}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 20, color: '#c8a000' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
            showsVerticalScrollIndicator={true}
            scrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            bounces={true}
          >

                {/* Apple Health toggle — only shown on iOS */}
                {Platform.OS === "ios" && (
                  <View style={{ marginTop: 20 }}>
                    <Text style={{ color: "#c8a000", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 14 }}>APPLE HEALTH</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flex: 1, marginRight: 16 }}>
                        <Text style={{ color: "#1a1a2e", fontSize: 15, fontWeight: "600", marginBottom: 3 }}>Sync to Apple Health</Text>
                        <Text style={{ color: "#555555", fontSize: 12, lineHeight: 18 }}>
                          {healthPermissionGranted
                            ? "Save each drink to Apple Health as a Water sample"
                            : "Permission not granted — tap Allow in the system dialog to enable"}
                        </Text>
                      </View>
                      <Switch
                        value={healthSyncEnabled && healthPermissionGranted}
                        onValueChange={handleHealthToggle}
                        trackColor={{ false: "#cccccc", true: "#34C759" }}
                        thumbColor="#ffffff"
                        ios_backgroundColor="#e0e0e0"
                      />
                    </View>
                    <View style={{ marginTop: 10, height: 1, backgroundColor: "rgba(200,160,0,0.3)" }} />
                    <Text style={{ color: "#888888", fontSize: 11, marginTop: 10, textAlign: "center" }}>
                      Existing Health data is never deleted when sync is turned off
                    </Text>
                  </View>
                )}

                {Platform.OS !== "ios" && (
                  <Text style={{ color: "#555555", fontSize: 13, textAlign: "center", marginTop: 20, lineHeight: 20 }}>
                    Apple Health is only available on iPhone.
                  </Text>
                )}

                {/* Notifications section */}
                <View style={{ marginTop: 24 }}>
                  <Text style={{ color: "#c8a000", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 14 }}>NOTIFICATIONS</Text>
                  {notifPermissionStatus === "denied" && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL("app-settings:").catch(() => {})}
                      style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,59,48,0.08)", borderWidth: 1, borderColor: "rgba(255,59,48,0.3)", borderRadius: 10, padding: 12, marginBottom: 14 }}
                    >
                      <Text style={{ fontSize: 16 }}>🔕</Text>
                      <Text style={{ flex: 1, color: "#C0152A", fontSize: 12, lineHeight: 18 }}>
                        Notifications are disabled in iOS Settings — tap here to enable them.
                      </Text>
                      <Text style={{ color: "#C0152A", fontSize: 12, fontWeight: "700" }}>›</Text>
                    </TouchableOpacity>
                  )}
                  {(
                    [
                      { label: "All Notifications", sub: "Master switch for all reminders", key: "notif_master_enabled", val: notifMasterEnabled, set: setNotifMasterEnabled },
                      { label: "Morning Kickoff", sub: "Daily 7:30am reminder to start hydrating", key: "notif_morning_enabled", val: notifMorningEnabled, set: setNotifMorningEnabled },
                      { label: "Progress Updates", sub: "Midday, afternoon, evening and goal alerts", key: "notif_progress_enabled", val: notifProgressEnabled, set: setNotifProgressEnabled },
                      { label: "Streak Alerts", sub: "Warnings when your streak is at risk", key: "notif_streak_enabled", val: notifStreakEnabled, set: setNotifStreakEnabled },
                    ] as { label: string; sub: string; key: string; val: boolean; set: (v: boolean) => void }[]
                  ).map((row, i) => (
                    <View key={row.key}>
                      {i > 0 && <View style={{ height: 1, backgroundColor: "rgba(200,160,0,0.3)", marginVertical: 12 }} />}
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1, marginRight: 16 }}>
                          <Text style={{
                            color: i === 0 ? "#1a1a2e" : (notifMasterEnabled ? "#1a1a2e" : "rgba(26,26,46,0.35)"),
                            fontSize: i === 0 ? 15 : 14, fontWeight: i === 0 ? "600" : "500", marginBottom: 2,
                          }}>{row.label}</Text>
                          <Text style={{ color: "#555555", fontSize: 11, lineHeight: 16 }}>{row.sub}</Text>
                        </View>
                        <Switch
                          value={row.val && (i === 0 || notifMasterEnabled)}
                          disabled={i > 0 && !notifMasterEnabled}
                          onValueChange={async (v) => {
                            row.set(v);
                            try { await AsyncStorage.setItem(row.key, String(v)); } catch {}
                            // Use refs (not closed-over state) so we always read the
                            // latest hydration values. Pass the new toggle value as an
                            // explicit override so the reschedule sees it immediately —
                            // the setState above hasn't propagated yet.
                            const h  = totalHydrationRef.current;
                            const g  = goalRef.current;
                            const gh = goalHistoryRef.current;
                            const curPct = g > 0 ? Math.min(h / g, 1) : 0;
                            const curStreak = (() => {
                              let s = 0; const d = new Date();
                              while ((gh[getDateKey(d)] ?? 0) >= 1.0) { s++; d.setDate(d.getDate() - 1); }
                              return s;
                            })();
                            const prefOverride: NotifPrefs = {};
                            if      (row.key === 'notif_master_enabled')   prefOverride.master   = v;
                            else if (row.key === 'notif_morning_enabled')  prefOverride.morning  = v;
                            else if (row.key === 'notif_progress_enabled') prefOverride.progress = v;
                            else if (row.key === 'notif_streak_enabled')   prefOverride.streak   = v;
                            rescheduleSmartNotifications(curPct, curStreak, Math.max(0, g - h), prefOverride);
                          }}
                          trackColor={{ false: "#cccccc", true: "#c8a000" }}
                          thumbColor="#ffffff"
                          ios_backgroundColor="#e0e0e0"
                        />
                      </View>
                    </View>
                  ))}
                </View>

                {/* Sound Effects toggle */}
                <View style={{ marginTop: 24 }}>
                  <Text style={{ color: "#c8a000", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 14 }}>SOUND</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1, marginRight: 16 }}>
                      <Text style={{ color: isPro ? "#1a1a2e" : "rgba(26,26,46,0.4)", fontSize: 15, fontWeight: "600", marginBottom: 3 }}>
                        Sound Effects{!isPro ? " 🔒" : ""}
                      </Text>
                      <Text style={{ color: "#555555", fontSize: 12, lineHeight: 18 }}>
                        Water pours, log chimes, badge unlocks and more
                      </Text>
                    </View>
                    <Switch
                      value={soundEnabled}
                      onValueChange={async (val) => {
                        if (!isPro) { openPaywallFromSettings(); return; }
                        setSoundEnabledState(val);
                        setSoundEnabled(val);
                        try { await AsyncStorage.setItem("sound_enabled", String(val)); } catch {}
                      }}
                      trackColor={{ false: "#cccccc", true: "#c8a000" }}
                      thumbColor="#ffffff"
                      ios_backgroundColor="#e0e0e0"
                    />
                  </View>
                </View>

                {/* Sound Pack selector */}
                <View style={{ marginTop: 20 }}>
                  <Text style={{ color: "#c8a000", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 12 }}>SOUND PACK</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    {ALL_SOUND_PACKS.map((pack) => {
                      const isSelected = selectedSoundPack === pack.id;
                      const locked = pack.isPro && !isPro;
                      return (
                        <TouchableOpacity
                          key={pack.id}
                          activeOpacity={0.8}
                          style={{
                            width: "47%",
                            borderRadius: 12,
                            borderWidth: isSelected ? 2 : 1,
                            borderColor: isSelected ? "#c8a000" : "rgba(200,160,0,0.25)",
                            backgroundColor: isSelected ? "rgba(200,160,0,0.08)" : "rgba(0,0,0,0.03)",
                            padding: 12,
                            opacity: locked ? 0.65 : 1,
                          }}
                          onPress={async () => {
                            if (locked) { openPaywallFromSettings(); return; }
                            setSelectedSoundPack(pack.id);
                            try {
                              await AsyncStorage.setItem("selected_sound_pack", pack.id);
                              await setActivePack(pack.id);
                            } catch {}
                          }}
                        >
                          {/* PRO badge */}
                          {pack.isPro && (
                            <View style={{
                              position: "absolute", top: 6, right: 6,
                              backgroundColor: "#c8a000", borderRadius: 4,
                              paddingHorizontal: 5, paddingVertical: 2,
                            }}>
                              <Text style={{ color: "#ffffff", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 }}>PRO</Text>
                            </View>
                          )}
                          <Text style={{ fontSize: 26, marginBottom: 4 }}>{pack.emoji}</Text>
                          <Text style={{ color: isSelected ? "#c8a000" : "#1a1a2e", fontSize: 13, fontWeight: "700", marginBottom: 2 }}>
                            {pack.name}
                          </Text>
                          <Text style={{ color: "#666666", fontSize: 10, lineHeight: 14 }} numberOfLines={2}>
                            {pack.description}
                          </Text>
                          {/* Preview button */}
                          <TouchableOpacity
                            style={{
                              position: "absolute", bottom: 8, right: 8,
                              width: 26, height: 26, borderRadius: 13,
                              backgroundColor: previewingPack === pack.id ? "#c8a000" : "rgba(200,160,0,0.15)",
                              alignItems: "center", justifyContent: "center",
                            }}
                            onPress={async () => {
                              if (previewingPack === pack.id) {
                                setPreviewingPack(null);
                                await stopPreview();
                              } else {
                                setPreviewingPack(pack.id);
                                await previewPack(pack.id);
                                setTimeout(() => setPreviewingPack(null), 3000);
                              }
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={{ fontSize: 10 }}>{previewingPack === pack.id ? "⏹" : "▶"}</Text>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Record Your Own Sounds (Pro) */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={{
                      marginTop: 12,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: "rgba(200,160,0,0.5)",
                      borderStyle: "dashed",
                      backgroundColor: "rgba(200,160,0,0.06)",
                      padding: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                    onPress={() => {
                      if (!isPro) { openPaywallFromSettings(); return; }
                      // Same iOS modal-stacking trap as openPaywallFromSettings —
                      // wait for Settings to fully dismiss before presenting the
                      // Custom Sounds modal, or iOS absorbs the new presentation.
                      setShowSettingsModal(false);
                      setTimeout(() => setShowCustomSounds(true), 350);
                    }}
                  >
                    <Text style={{ fontSize: 22 }}>🎙</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#c8a000", fontSize: 14, fontWeight: "800", letterSpacing: 0.3 }}>
                        Record Your Own Sounds
                      </Text>
                      <Text style={{ color: "#666", fontSize: 11, marginTop: 2, lineHeight: 15 }}>
                        Up to 5 clips each for the drink splash and goal celebration.
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: "#c8a000", borderRadius: 6,
                      paddingHorizontal: 8, paddingVertical: 3,
                    }}>
                      <Text style={{ color: "#ffffff", fontSize: 10, fontWeight: "900", letterSpacing: 0.6 }}>PRO</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Haptic Feedback toggle */}
                <View style={{ marginTop: 24 }}>
                  <Text style={{ color: "#c8a000", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 14 }}>HAPTICS</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1, marginRight: 16 }}>
                      <Text style={{ color: isPro ? "#1a1a2e" : "rgba(26,26,46,0.4)", fontSize: 15, fontWeight: "600", marginBottom: 3 }}>
                        Haptic Feedback{!isPro ? " 🔒" : ""}
                      </Text>
                      <Text style={{ color: "#555555", fontSize: 12, lineHeight: 18 }}>
                        Vibration on taps, drink logs, goals and milestones
                      </Text>
                    </View>
                    <Switch
                      value={hapticsEnabled}
                      onValueChange={async (val) => {
                        if (!isPro) { openPaywallFromSettings(); return; }
                        setHapticsEnabled(val);
                        try { await AsyncStorage.setItem("haptics_enabled", String(val)); } catch {}
                      }}
                      trackColor={{ false: "#cccccc", true: "#c8a000" }}
                      thumbColor="#ffffff"
                      ios_backgroundColor="#e0e0e0"
                    />
                  </View>
                </View>

                {/* Preferred unit (oz / ml) */}
                <View style={{ marginTop: 24 }}>
                  <Text style={{ color: "#c8a000", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 6 }}>UNITS</Text>
                  <Text style={{ color: "#555555", fontSize: 12, lineHeight: 18, marginBottom: 10 }}>
                    Choose which appears larger. Both stay visible everywhere.
                  </Text>
                  <View style={{ flexDirection: "row", backgroundColor: "rgba(0,0,0,0.04)", borderRadius: 10, padding: 3 }}>
                    {(["oz", "ml"] as const).map((u) => {
                      const active = preferredUnit === u;
                      return (
                        <TouchableOpacity
                          key={u}
                          activeOpacity={0.8}
                          style={{
                            flex: 1,
                            backgroundColor: active ? "#c8a000" : "transparent",
                            borderRadius: 8,
                            paddingVertical: 10,
                            alignItems: "center",
                          }}
                          onPress={async () => {
                            setPreferredUnit(u);
                            try { await AsyncStorage.setItem("preferred_unit", u); } catch {}
                          }}
                        >
                          <Text style={{
                            color: active ? "#ffffff" : "#1a1a2e",
                            fontSize: 14, fontWeight: "800", letterSpacing: 0.5,
                          }}>{u.toUpperCase()}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Dev-only: demo data for App Store screenshots (never ships — gated by __DEV__) */}
                {__DEV__ && (
                  <View style={{ marginTop: 24 }}>
                    <Text style={{ color: "#c8a000", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 14 }}>SCREENSHOTS (DEV)</Text>
                    <TouchableOpacity
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "center",
                        backgroundColor: "#c8a000", borderRadius: 12,
                        paddingVertical: 14, paddingHorizontal: 16, gap: 8,
                      }}
                      onPress={() => seedDemoData("primed").catch(() => {})}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontSize: 18 }}>🎯</Text>
                      <Text style={{ color: "#0a0520", fontSize: 15, fontWeight: "800" }}>
                        Seed — Primed Goal
                      </Text>
                    </TouchableOpacity>
                    <Text style={{ color: "#888888", fontSize: 11, marginTop: 6, textAlign: "center", lineHeight: 16 }}>
                      Sets today to ~88% (8 oz to go). Tap any amount to capture the live fireworks + fun fact. Best for the preview video.
                    </Text>
                    <TouchableOpacity
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "center",
                        backgroundColor: "#c8a000", borderRadius: 12,
                        paddingVertical: 14, paddingHorizontal: 16, gap: 8, marginTop: 16,
                      }}
                      onPress={() => seedDemoData("full").catch(() => {})}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontSize: 18 }}>🏆</Text>
                      <Text style={{ color: "#0a0520", fontSize: 15, fontWeight: "800" }}>
                        Seed — Full (Goal Hit)
                      </Text>
                    </TouchableOpacity>
                    <Text style={{ color: "#888888", fontSize: 11, marginTop: 6, textAlign: "center", lineHeight: 16 }}>
                      Full gauge + 14-day streak. Best for stats, badges & a celebratory hero shot.
                    </Text>
                    <TouchableOpacity
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "center",
                        borderWidth: 1.5, borderColor: "#c8a000", borderRadius: 12,
                        paddingVertical: 14, paddingHorizontal: 16, gap: 8, marginTop: 12,
                      }}
                      onPress={() => seedDemoData("mid").catch(() => {})}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontSize: 18 }}>🌓</Text>
                      <Text style={{ color: "#c8a000", fontSize: 15, fontWeight: "700" }}>
                        Seed — In Progress (~50%)
                      </Text>
                    </TouchableOpacity>
                    <Text style={{ color: "#888888", fontSize: 11, marginTop: 6, textAlign: "center", lineHeight: 16 }}>
                      Half-full gauge, mid-day look. Same rich history & badges. Great for the home hero.
                    </Text>
                    <TouchableOpacity
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "center",
                        borderWidth: 1.5, borderColor: "rgba(192,21,42,0.5)", borderRadius: 12,
                        paddingVertical: 12, paddingHorizontal: 16, gap: 8, marginTop: 16,
                      }}
                      onPress={() => clearDemoData().catch(() => {})}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 16 }}>🗑️</Text>
                      <Text style={{ color: "#C0152A", fontSize: 14, fontWeight: "700" }}>
                        Clear Demo Data
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Feedback */}
                <View style={{ marginTop: 24 }}>
                  <Text style={{ color: "#c8a000", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 14 }}>FEEDBACK</Text>
                  <TouchableOpacity
                    style={{ borderWidth: 1.5, borderColor: "rgba(200,160,0,0.4)", borderRadius: 12, paddingVertical: 13, alignItems: "center" }}
                    onPress={() => {
                      setShowSettingsModal(false);
                      setTimeout(() => {
                        try { Sentry.showFeedbackWidget(); } catch {}
                      }, 350);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ color: "#1a1a2e", fontSize: 15, fontWeight: "700" }}>💬 Send Feedback</Text>
                  </TouchableOpacity>
                  <Text style={{ color: "#888888", fontSize: 12, marginTop: 8, textAlign: "center" }}>
                    Found a bug or have an idea? Let us know.
                  </Text>
                </View>

                {/* About */}
                <View style={{ marginTop: 32, marginBottom: 8, alignItems: "center" }}>
                  <Text style={{ color: "#c8a000", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 14 }}>ABOUT</Text>

                  <Text style={{ color: "#1a1a2e", fontSize: 14, fontWeight: "700" }}>Hydro Hero</Text>
                  <TouchableOpacity onLongPress={confirmResetProForTesting} delayLongPress={1200} activeOpacity={1}>
                    <Text style={{ color: "#888888", fontSize: 11, marginTop: 2 }}>
                      Version {Constants.expoConfig?.version ?? "1.0.0"} (Build {Constants.expoConfig?.ios?.buildNumber ?? ""})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => Linking.openURL("https://wimsby.github.io/Hydro-Hero/privacy-policy.html").catch(() => {})} activeOpacity={0.7} style={{ marginTop: 14 }}>
                    <Text style={{ color: "#888888", fontSize: 12, textDecorationLine: "underline" }}>Privacy Policy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Linking.openURL("https://wimsby.github.io/Hydro-Hero/support.html").catch(() => {})} activeOpacity={0.7} style={{ marginTop: 6 }}>
                    <Text style={{ color: "#888888", fontSize: 12, textDecorationLine: "underline" }}>Support</Text>
                  </TouchableOpacity>

                  <View style={{ marginTop: 18, alignItems: "center" }}>
                    <Text style={{ color: "#c8a000", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8 }}>CREDITS</Text>
                    <Text style={{ color: "#888888", fontSize: 11, textAlign: "center", lineHeight: 16 }}>
                      Beverage icons by{" "}
                      <Text
                        style={{ color: "#888888", textDecorationLine: "underline" }}
                        onPress={() => Linking.openURL("https://tabler.io/icons").catch(() => {})}
                      >
                        Tabler Icons
                      </Text>
                      {" "}(MIT License)
                    </Text>
                  </View>
                </View>

          </ScrollView>
        </View>
      </Modal>

      {/* Promo Code Modal */}
      <Modal visible={showPromoModal} transparent animationType="fade" onRequestClose={() => { setShowPromoModal(false); setPromoCode(''); }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#0d0030', borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,215,0,0.5)', padding: 28, width: '100%', alignItems: 'center' }}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🎁</Text>
              <Text style={{ color: '#FFD700', fontSize: 22, fontWeight: '900', marginBottom: 4, letterSpacing: 1 }}>Redeem Promo Code</Text>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 24, textAlign: 'center' }}>
                Enter your code to unlock Hydro Hero Pro
              </Text>
              <TextInput
                style={{
                  width: '100%', borderWidth: 1.5, borderColor: 'rgba(255,215,0,0.5)',
                  borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
                  color: '#FFD700', fontSize: 20, fontWeight: '800', letterSpacing: 4,
                  textAlign: 'center', backgroundColor: 'rgba(255,215,0,0.06)', marginBottom: 20,
                }}
                placeholder="XXXXXXXX"
                placeholderTextColor="rgba(255,215,0,0.3)"
                value={promoCode}
                onChangeText={(t) => setPromoCode(t.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={redeemPromoCode}
                maxLength={20}
                editable={!promoLoading}
              />
              <TouchableOpacity
                style={{
                  width: '100%', backgroundColor: '#FFD700', borderRadius: 14,
                  paddingVertical: 16, alignItems: 'center', marginBottom: 12,
                  opacity: promoLoading ? 0.6 : 1,
                }}
                onPress={redeemPromoCode}
                disabled={promoLoading}
                activeOpacity={0.85}
              >
                {promoLoading
                  ? <ActivityIndicator color="#0a0520" />
                  : <Text style={{ color: '#0a0520', fontSize: 17, fontWeight: '900' }}>Redeem</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingVertical: 10 }}
                onPress={() => { setShowPromoModal(false); setPromoCode(''); }}
                activeOpacity={0.7}
              >
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Quick Add Customization Modal */}
      <QuickAddCustomModal
        visible={showQuickAddModal}
        currentAmounts={quickAddAmounts}
        onSave={async (amounts) => {
          setQuickAddAmounts(amounts);
          setShowQuickAddModal(false);
          try { await AsyncStorage.setItem("custom_quick_add_amounts", JSON.stringify(amounts)); } catch {}
        }}
        onCancel={() => setShowQuickAddModal(false)}
      />

      {/* Custom Sounds Modal */}
      <CustomSoundsModal
        visible={showCustomSounds}
        onClose={() => setShowCustomSounds(false)}
        onBackToSettings={() => {
          setShowCustomSounds(false);
          // Same Modal-stacking trap — wait for this Modal to dismiss before
          // re-presenting Settings.
          setTimeout(() => setShowSettingsModal(true), 350);
        }}
        activePackName={ALL_SOUND_PACKS.find((p) => p.id === selectedSoundPack)?.name ?? "your pack"}
      />

      {/* Morning toast notification */}
      {toastVisible && (
        <Animated.View pointerEvents="none" style={{
          position: "absolute", top: 60, left: 20, right: 20, zIndex: 1000,
          backgroundColor: "rgba(0,0,10,0.9)", borderRadius: 14,
          borderWidth: 1, borderColor: GOLD,
          paddingVertical: 14, paddingHorizontal: 18,
          alignItems: "center",
          opacity: toastAnim,
          transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
        }}>
          <Text style={{ color: GOLD, fontSize: 15, fontWeight: "800", textAlign: "center" }}>
            ☀️ Good morning! New day started
          </Text>
          <Text style={{ color: "rgba(255,215,0,0.75)", fontSize: 12, marginTop: 4, textAlign: "center" }}>
            {"Let's hit your goal today! 💧"}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e8a5a5" },
  scroll: { paddingBottom: 40 },
  header: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#e8a5a5",
  },
  headerTitle: { fontSize: 28, fontWeight: "bold", color: "#ffffff" },
  headerDate: { fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 4 },
  progressSection: { alignItems: "center", marginTop: 30 },
  progressRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 8,
    borderColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  intakeText: { fontSize: 42, fontWeight: "bold", color: "#ffffff" },
  unitText: { fontSize: 18, color: "rgba(255,255,255,0.85)" },
  mlText: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  goalText: { marginTop: 12, fontSize: 14, color: "rgba(255,255,255,0.85)" },
  progressBarContainer: {
    height: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 7,
    marginHorizontal: 24,
    marginTop: 20,
    overflow: "hidden",
  },
  progressBarFill: { height: "100%", borderRadius: 7 },
  progressLabel: {
    textAlign: "center",
    color: "rgba(255,255,255,0.85)",
    marginTop: 8,
    fontSize: 13,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 24,
    marginTop: 28,
    marginBottom: 12,
  },
  quickAddGrid: {
    paddingHorizontal: 24,
    gap: 8,
  },
  quickAddRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  quickBtnText: { fontSize: 15, fontWeight: "bold", color: "#ffffff" },
  quickBtnMl: { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  customRow: { flexDirection: "row", paddingHorizontal: 24, gap: 12 },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    color: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  addBtn: {
    borderRadius: 12,
    paddingHorizontal: 24,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  addBtnText: { color: "#ffffff", fontWeight: "bold", fontSize: 16 },
  actionRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    gap: 8,
    marginTop: 20,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  secondaryBtnText: { color: "#ffffff", fontSize: 13 },
  historySection: { marginHorizontal: 24, marginTop: 8 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  historyDate: { color: "rgba(255,255,255,0.85)", fontSize: 12, width: 55 },
  historyBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 4,
    overflow: "hidden",
  },
  historyBarFill: { height: "100%", borderRadius: 4 },
  historyOz: { fontSize: 12, color: "#ffffff", width: 40, textAlign: "right" },
  emptyText: { color: "rgba(255,255,255,0.7)", textAlign: "center", marginTop: 12 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    backgroundColor: "#F8F9FA",
    borderRadius: 24,
    padding: 32,
    width: "90%",
    maxHeight: "88%",
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.1)",
  },
  modalTitle: {
    color: "#1A1A2E",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 14,
    textAlign: "center",
  },
  modalDivider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
    marginBottom: 12,
  },
  goalSafetyNote: {
    color: "#666666",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 4,
  },

  // Tabs
  modalTabs: {
    flexDirection: "row",
    backgroundColor: "#EEEEEE",
    borderRadius: 12,
    marginBottom: 20,
    padding: 4,
  },
  modalTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 9,
  },
  modalTabInactive: {
    backgroundColor: "#EEEEEE",
  },
  modalTabActive: {
    backgroundColor: "transparent",
  },
  modalTabText: {
    color: "#666666",
    fontSize: 15,
    fontWeight: "700",
  },
  modalTabTextActive: {
    color: "#ffffff",
  },

  // Custom tab
  modalInput: {
    backgroundColor: "#ffffff",
    color: "#1A1A2E",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    borderWidth: 1.5,
    borderColor: "#CCCCCC",
  },
  modalMl: { color: "#666666", fontSize: 14, marginTop: 8, marginLeft: 4 },
  modalBtnRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalCancel: {
    flex: 1,
    backgroundColor: "#EEEEEE",
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCancelText: { color: "#666666", fontSize: 18, fontWeight: "600" },
  modalConfirm: {
    flex: 1,
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
  },
  modalConfirmText: { color: "#ffffff", fontWeight: "bold", fontSize: 18 },

  // Gallon tab
  gallonPreset: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 10,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
  },
  gallonPresetLabel: { color: "#888888", fontSize: 14, marginBottom: 4 },
  gallonPresetOz: { color: "#1A1A2E", fontSize: 22, fontWeight: "bold" },
  gallonPresetMl: { color: "#888888", fontSize: 13, marginTop: 2 },

  // Suggested tab
  modalFieldLabel: {
    color: "#1A1A2E",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
    marginTop: 10,
  },
  modalInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  toggleGroup: {
    flexDirection: "row",
    backgroundColor: "#EEEEEE",
    borderRadius: 10,
    padding: 2,
  },
  toggleBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: "#ffffff",
  },
  toggleBtnText: {
    color: "#888888",
    fontSize: 13,
    fontWeight: "600",
  },
  toggleBtnTextActive: {
    color: "#1A1A2E",
  },
  activityRow: {
    flexDirection: "row",
    gap: 6,
  },
  activityBtn: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
  },
  activityBtnActive: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  activityBtnText: {
    color: "#666666",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  activityBtnTextActive: {
    color: "#ffffff",
  },
  suggestedResult: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 14,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  suggestedResultLabel: { color: "#888888", fontSize: 13, marginBottom: 4 },
  suggestedOz: { fontSize: 28, fontWeight: "bold" },
  suggestedMl: { color: "#666666", fontSize: 14, marginTop: 2 },
  suggestedPlaceholder: { color: "#AAAAAA", fontSize: 13, textAlign: "center", paddingHorizontal: 16 },
  suggestedCap: { color: "#AAAAAA", fontSize: 11, marginTop: 4 },
  dropsSection: { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: 16, marginTop: 24, paddingHorizontal: 16 },
  dropCol: { alignItems: "center", gap: 6 },
  dropLabel: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.85)", letterSpacing: 1, textAlign: "center" },
  dualBarSection: { marginHorizontal: 24, marginTop: 14, gap: 8 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barRowLabel: { fontSize: 10, color: "rgba(255,255,255,0.75)", width: 82 },
  barPct: { fontSize: 11, fontWeight: "700", color: "#ffffff", width: 34, textAlign: "right" },
  stageLabel: { color: "#ffffff", fontSize: 15, fontWeight: "700", letterSpacing: 1.5, marginTop: 10, textTransform: "uppercase", textAlign: "center" },
  pickerRow: { flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 2 },
  inputModeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 4 },
  modeToggle: { flexDirection: "row", backgroundColor: "#EEEEEE", borderRadius: 8, padding: 2 },
  modeBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  modeBtnText: { fontSize: 12, fontWeight: "600", color: "#888888" },
  modeBtnTextActive: { color: "#ffffff" },
  typeInput: {
    backgroundColor: "#ffffff",
    color: "#1A1A2E",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: "#CCCCCC",
    marginBottom: 2,
  },
  typeHeightRow: { flexDirection: "row", gap: 10 },
  validationError: { color: "#E53935", fontSize: 11, marginTop: 2, marginBottom: 2 },
  customHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, marginTop: 28, marginBottom: 12 },
  customUnitToggle: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8, padding: 2 },
  customUnitBtn: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 6 },
  customUnitBtnText: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "600" },
  customUnitBtnTextActive: { color: "#ffffff" },
  customConversion: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 4, paddingHorizontal: 24 },
  kbToolbar: { alignItems: "flex-end", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)", marginBottom: 10 },
  kbDoneBtn: { fontSize: 16, fontWeight: "700", paddingVertical: 12, paddingHorizontal: 14, minWidth: 44, minHeight: 44, textAlign: "center", textAlignVertical: "center" },
  iosKbBar: { backgroundColor: "#F0F0F0", borderTopWidth: 1, borderTopColor: "#CCCCCC", paddingHorizontal: 16, paddingVertical: 10, alignItems: "flex-end" },
  iosKbDone: { fontSize: 17, fontWeight: "700", paddingVertical: 6, paddingHorizontal: 12 },
  androidKbBar: { position: "absolute", left: 0, right: 0, backgroundColor: "#F0F0F0", borderTopWidth: 1, borderTopColor: "#CCCCCC", paddingHorizontal: 16, paddingVertical: 10, alignItems: "flex-end", zIndex: 999 },
  androidKbDone: { fontSize: 17, fontWeight: "700", paddingVertical: 6, paddingHorizontal: 12 },
  customModalQuickBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: "#ffffff" },
  customModalQuickBtnText: { fontSize: 13, fontWeight: "700" },
  customModalQuickBtnMl: { fontSize: 10, color: "#888888", marginTop: 2 },

  // Beverage Breakdown
  breakdownSection: { marginHorizontal: 24, marginTop: 8 },
  breakdownRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  breakdownEmoji: { fontSize: 16, width: 22, textAlign: "center" },
  breakdownDot: { width: 10, height: 10, borderRadius: 5 },
  breakdownLabel: { color: "rgba(255,255,255,0.85)", fontSize: 13, width: 76 },
  breakdownAmountGroup: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  breakdownOzText: { fontSize: 13, color: "#ffffff" },
  breakdownMlText: { fontSize: 11, color: "rgba(255,255,255,0.6)" },
  breakdownPct: { fontSize: 15, fontWeight: "bold", minWidth: 40, textAlign: "right" },
  breakdownBarBg: { flex: 1, height: 8, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 4, overflow: "hidden" },
  breakdownBarFill: { height: "100%", borderRadius: 4 },
  breakdownOz: { fontSize: 12, color: "#ffffff", width: 40, textAlign: "right" },

  // History expanded breakdown
  historyExpandedBreakdown: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 10, marginBottom: 8, marginLeft: 63 },
  historyBreakdownItem: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  historyBreakdownLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, flex: 1 },
  historyBreakdownOz: { color: "#ffffff", fontSize: 11, fontWeight: "600" },
  historyBreakdownMl: { fontSize: 10, color: "rgba(255,255,255,0.55)" },
  historyBreakdownPct: { fontSize: 13, fontWeight: "bold", minWidth: 34, textAlign: "right" },

  // Category picker modal
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 8 },
  categoryBtn: { width: "46%", borderWidth: 2, borderRadius: 14, paddingVertical: 14, alignItems: "center", backgroundColor: "#ffffff" },
  categoryEmoji: { fontSize: 28, marginBottom: 4 },
  categoryLabel: { fontSize: 13, fontWeight: "700" },
});

const casinoActionBtn: import("react-native").ViewStyle = {
  flex: 1,
  backgroundColor: "rgba(255,215,0,0.1)",
  borderRadius: 10,
  paddingVertical: 12,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255,215,0,0.4)",
};
const casinoActionBtnText: import("react-native").TextStyle = {
  color: "#FFD700",
  fontSize: 13,
  fontWeight: "600",
};
