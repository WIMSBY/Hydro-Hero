import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import * as Sentry from '@sentry/react-native';
import { BEVERAGES } from '../../constants/beverages';
import { useProContext } from '../../contexts/ProContext';
import {
  buildHydrationCSV,
  shareExportFile,
  deleteExportFile,
  type HydrationExportSummary,
} from '../../utils/hydrationExport';

const FREE_EXPORT_DAYS = 7;
const PRO_EXPORT_DAYS = 30;

// ─── Constants ────────────────────────────────────────────────────────────────
const GOLD = '#FFD700';
const BG = '#0a0520';
const CARD_BG = 'rgba(255,255,255,0.07)';
const CARD_BORDER = 'rgba(255,215,0,0.28)';

const BEV_COLORS: Record<string, string> = {
  water:      '#1565C0',
  coffee:     '#7B4F2E',
  tea:        '#8B7355',
  icedtea:    '#C8A000',
  soda:       '#C0392B',
  flavored:   '#4488CC',
  coconut:    '#8B6914',
  juice:      '#E8920A',
  lemonade:   '#FFD700',
  fruit:      '#CC4488',
  sports:     '#2E8B4A',
  milk:       '#AAAAAA',
  protein:    '#8844AA',
  beer:       '#D4881A',
  wine:       '#8B1A3A',
  cocktail:   '#7B1A8B',
  energy:     '#AACC00',
  energyshot: '#CC8800',
  hotchoc:    '#5C3317',
  spirits:    '#AA6622',
};
const BEV_LABELS: Record<string, string> = {
  water: 'Water', coffee: 'Coffee', tea: 'Tea', icedtea: 'Iced Tea',
  soda: 'Soda', flavored: 'Flavored Water', coconut: 'Coconut Water',
  juice: 'Juice', lemonade: 'Lemonade', fruit: 'Fruit Drinks',
  sports: 'Sports Drink', milk: 'Milk', protein: 'Protein Shake',
  beer: 'Beer', wine: 'Wine', cocktail: 'Cocktail',
  energy: 'Energy Drink', energyshot: 'Energy Shot', hotchoc: 'Hot Chocolate', spirits: 'Spirits',
};
const BEV_KEYS = [
  'water','coffee','tea','icedtea','soda','flavored','coconut',
  'juice','lemonade','fruit','sports','milk','protein',
  'beer','wine','cocktail','energy','energyshot','hotchoc','spirits',
] as const;
type BevCat = typeof BEV_KEYS[number];

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DOW_ABBR = ['S','M','T','W','T','F','S'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ─── Types ────────────────────────────────────────────────────────────────────
interface DayStats {
  date: Date;
  dateKey: string;
  totalOz: number;
  hydratedOz: number;
  goal: number;
  pct: number;
  goalHit: boolean;
  breakdown: Record<BevCat, number>;
  hasData: boolean;
  isFuture: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDateKey(d: Date) {
  return `water_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function barColor(pct: number) {
  if (pct >= 1.0) return GOLD;
  if (pct >= 0.5) return '#0088ff';
  return '#C0152A';
}
function heatColor(pct: number) {
  if (pct >= 1.0) return GOLD;
  if (pct >= 0.75) return '#1E9E4A';
  if (pct >= 0.50) return '#E8920A';
  if (pct >= 0.25) return '#D94E00';
  return '#C0152A';
}
function emptyBd(): Record<BevCat, number> {
  return {
    water: 0, coffee: 0, tea: 0, icedtea: 0, soda: 0, flavored: 0, coconut: 0,
    juice: 0, lemonade: 0, fruit: 0, sports: 0, milk: 0, protein: 0,
    beer: 0, wine: 0, cocktail: 0, energy: 0, energyshot: 0, hotchoc: 0, spirits: 0,
  };
}
/** Safely merge stored breakdown (may have only old 7 keys) with full 20-key default */
function mergeBd(stored: Record<string, number>): Record<BevCat, number> {
  return { ...emptyBd(), ...stored } as Record<BevCat, number>;
}
function formatDate(d: Date) {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function computeStreaks(
  goalHistory: Record<string, number>,
  today: Date,
): { current: number; longest: number } {
  // Sort all entries chronologically
  const entries = Object.entries(goalHistory)
    .map(([k, v]) => {
      const m = k.match(/water_(\d+)_(\d+)_(\d+)/);
      if (!m) return null;
      return { date: new Date(+m[1], +m[2] - 1, +m[3]), pct: v };
    })
    .filter(Boolean)
    .sort((a, b) => a!.date.getTime() - b!.date.getTime()) as { date: Date; pct: number }[];

  // Longest streak
  let longest = 0, run = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].pct >= 1.0) {
      const consecutive = i === 0
        || Math.round((entries[i].date.getTime() - entries[i - 1].date.getTime()) / 86400000) === 1;
      run = consecutive ? run + 1 : 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  // Current streak (backward from today, include today if goal hit)
  let current = 0;
  let d = new Date(today);
  while (true) {
    const dk = getDateKey(d);
    const pct = goalHistory[dk];
    if (pct !== undefined && pct >= 1.0) {
      current++;
      d = addDays(d, -1);
    } else {
      break;
    }
  }

  return { current, longest };
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function StatsScreen() {
  const router = useRouter();
  const [view, setView] = useState<'weekly' | 'monthly'>('weekly');
  const [loading, setLoading] = useState(true);
  const [weekDays, setWeekDays] = useState<DayStats[]>([]);
  const [monthDays, setMonthDays] = useState<DayStats[]>([]);
  const [currentGoal, setCurrentGoal] = useState(64);
  const [lifetimeOz, setLifetimeOz] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [selectedDay, setSelectedDay] = useState<DayStats | null>(null);

  const hasAnyData = weekDays.some((d) => d.hasData) || monthDays.some((d) => d.hasData);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [])
  );

  async function loadStats() {
    setLoading(true);
    try {
      const [
        rawHistory, rawGoalHist, rawGoal,
        rawTodayHyd, rawBreakdown, rawLifetime,
      ] = await Promise.all([
        AsyncStorage.getItem('water_history'),
        AsyncStorage.getItem('goal_history'),
        AsyncStorage.getItem('water_goal'),
        AsyncStorage.getItem('water_total_hydration'),
        AsyncStorage.getItem('water_category_breakdown'),
        AsyncStorage.getItem('lifetime_hydration_oz'),
      ]);

      const goal: number = rawGoal ? JSON.parse(rawGoal) : 64;
      setCurrentGoal(goal);
      if (rawLifetime) setLifetimeOz(JSON.parse(rawLifetime));

      const goalHistory: Record<string, number> = rawGoalHist ? JSON.parse(rawGoalHist) : {};
      const history: { date: string; oz: number; goal: number; breakdown?: Record<BevCat, number> }[] =
        rawHistory ? JSON.parse(rawHistory) : [];
      const todayHyd: number = rawTodayHyd ? JSON.parse(rawTodayHyd) : 0;
      const todayBreakdown: Record<BevCat, number> = rawBreakdown ? mergeBd(JSON.parse(rawBreakdown)) : emptyBd();

      const histMap = new Map(history.map((h) => [h.date, h]));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayKey = getDateKey(today);
      const todayTotalOz = Object.values(todayBreakdown).reduce((a, b) => a + b, 0);

      const { current, longest } = computeStreaks(goalHistory, today);
      setCurrentStreak(current);
      setLongestStreak(longest);

      function buildDay(d: Date): DayStats {
        const dk = getDateKey(d);
        const isToday = dk === todayKey;
        const isFuture = d > today;
        const entry = histMap.get(dk);
        let totalOz = 0, hydratedOz = 0, pct = 0;
        let dayGoal = goal;
        let breakdown = emptyBd();
        let hasData = false;

        if (isToday && todayTotalOz > 0) {
          totalOz = todayTotalOz;
          hydratedOz = todayHyd;
          dayGoal = goal;
          breakdown = { ...todayBreakdown };
          pct = goal > 0 ? todayHyd / goal : 0;
          hasData = true;
        } else if (!isFuture && entry) {
          totalOz = entry.oz;
          dayGoal = entry.goal || goal;
          breakdown = entry.breakdown ? mergeBd(entry.breakdown) : emptyBd();
          pct = goalHistory[dk] ?? 0;
          hydratedOz = pct * dayGoal;
          hasData = totalOz > 0 || pct > 0;
        } else if (!isFuture && goalHistory[dk] !== undefined) {
          pct = goalHistory[dk];
          hydratedOz = pct * goal;
          hasData = pct > 0;
        }

        return {
          date: d, dateKey: dk, totalOz, hydratedOz,
          goal: dayGoal, pct, goalHit: pct >= 1.0,
          breakdown, hasData, isFuture,
        };
      }

      // Last 7 days (oldest → today)
      const week: DayStats[] = [];
      for (let i = 6; i >= 0; i--) week.push(buildDay(addDays(today, -i)));
      setWeekDays(week);

      // Current calendar month
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const month: DayStats[] = [];
      for (let i = 1; i <= daysInMonth; i++) {
        month.push(buildDay(new Date(today.getFullYear(), today.getMonth(), i)));
      }
      setMonthDays(month);
    } catch (e) {
      console.warn('Stats load error', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Fixed header */}
      <View style={s.header}>
        <Text style={s.title}>YOUR STATS</Text>
        <View style={s.toggleRow}>
          {(['weekly', 'monthly'] as const).map((v) => (
            <TouchableOpacity
              key={v}
              style={[s.toggleBtn, view === v && s.toggleActive]}
              onPress={() => setView(v)}
              activeOpacity={0.8}
            >
              <Text style={[s.toggleTxt, view === v && s.toggleActiveTxt]}>
                {v === 'weekly' ? 'WEEKLY' : 'MONTHLY'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : !hasAnyData ? (
        <View style={s.center}>
          <Text style={s.emptyIcon}>📊</Text>
          <Text style={s.emptyHeadline}>Your hydration story starts here</Text>
          <Text style={s.emptyText}>Log your first drink to unlock weekly trends, your 30-day streak calendar, and achievement badges.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.navigate('/')} activeOpacity={0.8}>
            <Text style={s.emptyBtnTxt}>Start Logging</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} bounces={false}>
          {view === 'weekly'
            ? <WeeklyView days={weekDays} goal={currentGoal} currentStreak={currentStreak} />
            : <MonthlyView days={monthDays} goal={currentGoal} lifetimeOz={lifetimeOz}
                longestStreak={longestStreak} currentStreak={currentStreak}
                onDayPress={(d) => { if (!d.isFuture && d.hasData) setSelectedDay(d); }} />
          }
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* Day detail modal */}
      <Modal visible={!!selectedDay} transparent animationType="fade" onRequestClose={() => setSelectedDay(null)}>
        <TouchableOpacity style={s.popupOverlay} activeOpacity={1} onPress={() => setSelectedDay(null)}>
          <View style={s.popup}>
            {selectedDay && <>
              <Text style={s.popupDate}>{formatDate(selectedDay.date)}</Text>
              <View style={s.popupDivider} />
              <PopupRow label="True Hydration" value={`${selectedDay.hydratedOz.toFixed(1)} oz  (${Math.round(selectedDay.pct * 100)}%)`} />
              <PopupRow label="Total Consumed" value={`${selectedDay.totalOz.toFixed(1)} oz`} />
              <PopupRow label="Goal" value={`${selectedDay.goal} oz`} />
              {(() => {
                const top = (Object.entries(selectedDay.breakdown) as [BevCat, number][])
                  .sort((a, b) => b[1] - a[1]).find(([, v]) => v > 0);
                return top
                  ? <PopupRow label="Top Beverage"
                      value={BEV_LABELS[top[0]]}
                      valueColor={BEV_COLORS[top[0]]} />
                  : null;
              })()}
              <PopupRow
                label="Goal Hit"
                value={selectedDay.goalHit ? '✓ Yes' : '✗ No'}
                valueColor={selectedDay.goalHit ? '#1E9E4A' : '#C0152A'}
              />
              <TouchableOpacity onPress={() => setSelectedDay(null)} style={s.popupClose}>
                <Text style={s.popupCloseTxt}>Close</Text>
              </TouchableOpacity>
            </>}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function PopupRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={s.popupRow}>
      <Text style={s.popupLabel}>{label}</Text>
      <Text style={[s.popupVal, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

// ─── Weekly View ──────────────────────────────────────────────────────────────
function WeeklyView({ days, goal, currentStreak }: { days: DayStats[]; goal: number; currentStreak: number }) {
  const withData = days.filter((d) => d.hasData);
  const avgHyd = withData.length ? withData.reduce((a, d) => a + d.hydratedOz, 0) / withData.length : 0;
  const bestDay = days.reduce<DayStats | null>((b, d) => !b || d.hydratedOz > b.hydratedOz ? d : b, null);
  const goalsHit = days.filter((d) => d.goalHit).length;
  const avgPct = goal > 0 ? avgHyd / goal : 0;

  const bevTotals: Record<string, number> = {};
  BEV_KEYS.forEach((k) => { bevTotals[k] = days.reduce((a, d) => a + (d.breakdown[k] ?? 0), 0); });
  const totalBev = Object.values(bevTotals).reduce((a, b) => a + b, 0);
  const totalHyd = withData.reduce((a, d) => a + d.hydratedOz, 0);
  const totalConsumed = withData.reduce((a, d) => a + d.totalOz, 0);
  const efficiency = totalConsumed > 0 ? (totalHyd / totalConsumed) * 100 : 0;

  // Top beverage across the week
  const topBevKey = (Object.entries(bevTotals) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .find(([, v]) => v > 0)?.[0];
  const topBev = topBevKey ? BEVERAGES.find((b) => b.key === topBevKey) : null;
  const bestDayDate = bestDay ? `${bestDay.date.getMonth() + 1}/${bestDay.date.getDate()}` : '—';

  return (
    <>
      <View style={s.cardRow}>
        <SummaryCard label="AVG DAILY" value={`${avgHyd.toFixed(1)} oz`} sub={`${Math.round(avgPct * 100)}% of goal`} />
        <SummaryCard label="BEST DAY" value={`${(bestDay?.hydratedOz ?? 0).toFixed(1)} oz`} sub={bestDayDate} />
        <GoalRingCard goalsHit={goalsHit} total={7} />
      </View>
      <View style={[s.cardRow, { marginTop: 8 }]}>
        <SummaryCard
          label="TOP BEVERAGE"
          value={topBev?.emoji ?? '—'}
          sub={topBev?.label ?? 'No data'}
        />
        <SummaryCard
          label="DAY STREAK"
          value={currentStreak > 0 ? `🔥${currentStreak}` : '—'}
          sub={currentStreak > 0 ? (currentStreak === 1 ? 'day' : 'days') : 'No streak'}
        />
      </View>

      <SectionTitle title="DAILY HYDRATION" />
      <WeeklyBarChart days={days} goal={goal} />

      <SectionTitle title="BEVERAGE TRENDS" />
      <View style={s.card}>
        {totalBev > 0 ? (
          <>
            <DailyBevTrendsChart days={days} />
            <BeverageLegend totals={bevTotals} />
          </>
        ) : (
          <Text style={s.noData}>No beverage data this week</Text>
        )}
      </View>

      <SectionTitle title="HYDRATION EFFICIENCY" />
      <View style={s.card}>
        <Text style={s.effPct}>{efficiency.toFixed(0)}%</Text>
        <Text style={s.effSub}>of your drinks counted toward hydration</Text>
        {(Object.entries(bevTotals) as [string, number][])
          .sort((a, b) => b[1] - a[1]).slice(0, 2).filter(([, v]) => v > 0)
          .map(([k]) => (
            <View key={k} style={s.effRow}>
              <View style={[s.effDot, { backgroundColor: BEV_COLORS[k] }]} />
              <Text style={s.effLabel}>{BEV_LABELS[k]}</Text>
              <Text style={s.effOz}>{bevTotals[k].toFixed(1)} oz</Text>
            </View>
          ))}
      </View>
    </>
  );
}

// ─── Monthly View ─────────────────────────────────────────────────────────────
function MonthlyView({
  days, goal, lifetimeOz, longestStreak, currentStreak, onDayPress,
}: {
  days: DayStats[]; goal: number; lifetimeOz: number;
  longestStreak: number; currentStreak: number;
  onDayPress: (d: DayStats) => void;
}) {
  const { isPro, openPaywall } = useProContext();
  const pastWithData = days.filter((d) => d.hasData && !d.isFuture);
  const totalHyd = pastWithData.reduce((a, d) => a + d.hydratedOz, 0);
  const avgHyd = pastWithData.length ? totalHyd / pastWithData.length : 0;
  const goalsHit = pastWithData.filter((d) => d.goalHit).length;
  const successRate = pastWithData.length ? (goalsHit / pastWithData.length) * 100 : 0;
  const bestDay = days.reduce<DayStats | null>((b, d) => !b || d.hydratedOz > b.hydratedOz ? d : b, null);
  const today = new Date();

  return (
    <>
      <View style={s.cardRow}>
        <SummaryCard label="MONTHLY AVG" value={`${avgHyd.toFixed(1)} oz`} sub="per day" />
        <SummaryCard label="TOTAL" value={`${totalHyd.toFixed(0)} oz`} sub="true hydration" />
        <SummaryCard label="SUCCESS" value={`${Math.round(successRate)}%`} sub="days hit goal" />
      </View>

      <SectionTitle title={`${MONTH_NAMES[today.getMonth()].toUpperCase()} CALENDAR`} />
      {isPro ? (
        <MonthCalendar days={days} today={today} onDayPress={onDayPress} />
      ) : (
        <LockedSection
          emoji="🗓️"
          headline="See your whole month at a glance"
          sub="Daily heatmap of every goal hit. Tap any day to drill in."
          onUnlock={() => openPaywall()}
        />
      )}

      <SectionTitle title="MONTHLY TREND" />
      {isPro ? (
        <TrendChart days={days} goal={goal} />
      ) : (
        <LockedSection
          emoji="📈"
          headline="Track your trajectory"
          sub="A line chart of your hydration vs. goal over the month."
          onUnlock={() => openPaywall()}
        />
      )}

      <SectionTitle title="PERSONAL RECORDS" />
      {isPro ? (
        <View style={s.recordGrid}>
          <RecordCard emoji="💧" label="Best Single Day" value={`${(bestDay?.hydratedOz ?? 0).toFixed(1)} oz`} />
          <RecordCard emoji="👑" label="Longest Streak" value={`${longestStreak} days`} />
          <RecordCard emoji="🔥" label="Current Streak" value={`${currentStreak} days`} />
          <RecordCard emoji="🌊" label="Lifetime Total" value={`${lifetimeOz.toFixed(0)} oz`} />
        </View>
      ) : (
        <LockedSection
          emoji="🏆"
          headline="Unlock your records"
          sub="Best day, longest streak, current streak, and lifetime total."
          onUnlock={() => openPaywall()}
        />
      )}

      <SectionTitle title="EXPORT" />
      <ExportSection />
    </>
  );
}

function ExportSection() {
  const { isPro, openPaywall } = useProContext();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<HydrationExportSummary | null>(null);
  const days = isPro ? PRO_EXPORT_DAYS : FREE_EXPORT_DAYS;

  async function handleExport() {
    setLoading(true);
    try {
      const result = await buildHydrationCSV(days);
      if (!result) {
        Alert.alert('No History Yet', 'No history to export yet — start logging to build your history!');
        return;
      }
      setSummary(result);
    } catch (e) {
      Sentry.captureException(e);
      Alert.alert('Export Failed', `Something went wrong: ${(e as Error)?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    if (!summary) return;
    try {
      await shareExportFile(summary.filePath);
    } catch {
      Alert.alert('Share Failed', 'Could not open the share sheet. Please try again.');
    } finally {
      deleteExportFile(summary.filePath);
      setSummary(null);
    }
  }

  function handleCancel() {
    if (summary) deleteExportFile(summary.filePath);
    setSummary(null);
  }

  return (
    <>
      <View style={s.card}>
        <TouchableOpacity
          style={[s.exportBtn, loading && { opacity: 0.6 }]}
          onPress={handleExport}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator size="small" color={GOLD} />
            : <Text style={{ fontSize: 18 }}>⬇️</Text>}
          <Text style={s.exportBtnTxt}>Export {days} days as CSV</Text>
        </TouchableOpacity>
        {!isPro && (
          <TouchableOpacity onPress={() => openPaywall()} activeOpacity={0.7}>
            <Text style={s.exportProHint}>
              Get the full {PRO_EXPORT_DAYS} days with <Text style={{ color: GOLD, fontWeight: '800' }}>Pro</Text> →
            </Text>
          </TouchableOpacity>
        )}
        <Text style={s.exportFootnote}>
          Your hydration data lives on this device. Your iPhone backup keeps it safe across new devices.
        </Text>
      </View>

      <Modal visible={!!summary} transparent animationType="fade" onRequestClose={handleCancel}>
        <View style={s.exportOverlay}>
          <View style={s.exportModal}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>✅</Text>
            <Text style={s.exportModalTitle}>Ready to Export!</Text>
            <Text style={s.exportModalSub}>
              Your hydration history is packaged and ready to share
            </Text>
            <View style={{ width: '100%', gap: 10, marginBottom: 24 }}>
              {([
                ['📅', 'Days included', `${summary?.days ?? 0} days`],
                ['💧', 'Total consumed', `${summary?.totalConsumed ?? 0} oz`],
                ['✨', 'True hydration', `${summary?.totalHydrated ?? 0} oz`],
                ['🔥', 'Best streak', `${summary?.bestStreak ?? 0} days`],
              ] as const).map(([emoji, label, value]) => (
                <View key={label} style={s.exportStatRow}>
                  <Text style={s.exportStatLabel}>{emoji} {label}</Text>
                  <Text style={s.exportStatValue}>{value}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={s.exportShareBtn} onPress={handleShare} activeOpacity={0.85}>
              <Text style={s.exportShareTxt}>📤 Share File</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 12 }} onPress={handleCancel}>
              <Text style={s.exportCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function LockedSection({
  emoji, headline, sub, onUnlock,
}: { emoji: string; headline: string; sub: string; onUnlock: () => void }) {
  return (
    <TouchableOpacity style={s.lockedCard} activeOpacity={0.85} onPress={onUnlock}>
      <Text style={s.lockedEmoji}>{emoji}</Text>
      <Text style={s.lockedHeadline}>{headline}</Text>
      <Text style={s.lockedSub}>{sub}</Text>
      <View style={s.lockedBtn}>
        <Text style={s.lockedBtnTxt}>⭐ Unlock with Pro</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionTitle({ title }: { title: string }) {
  return <Text style={s.sectionTitle}>{title}</Text>;
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={s.summaryCard}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue}>{value}</Text>
      <Text style={s.summarySub}>{sub}</Text>
    </View>
  );
}

function GoalRingCard({ goalsHit, total }: { goalsHit: number; total: number }) {
  const pct = total > 0 ? goalsHit / total : 0;
  const r = 20, cx = 26, cy = 30;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(pct, 1);
  return (
    <View style={s.summaryCard}>
      <Text style={s.summaryLabel}>GOAL HIT</Text>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={52} height={52}>
          <G rotation={-90} origin={`${cx}, ${cy}`}>
            <Circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,215,0,0.18)" strokeWidth={5} />
            <Circle cx={cx} cy={cy} r={r} fill="none" stroke={GOLD} strokeWidth={5}
              strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
          </G>
          <SvgText x={cx} y={cy + 5} fill="#ffffff" fontSize={13} fontWeight="700" textAnchor="middle">
            {`${goalsHit}/${total}`}
          </SvgText>
        </Svg>
      </View>
    </View>
  );
}

function WeeklyBarChart({ days, goal }: { days: DayStats[]; goal: number }) {
  const { width } = Dimensions.get('window');
  const svgW = width - 32;
  const padL = 8, padR = 8, padT = 22, padB = 22;
  const chartH = 150;
  const svgH = padT + chartH + padB;
  const MAX_PCT = 1.2;
  const colW = (svgW - padL - padR) / 7;
  const barW = Math.min(26, colW * 0.55);
  const goalY = padT + chartH * (1 - 1 / MAX_PCT);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function bx(i: number) { return padL + colW * i + colW / 2 - barW / 2; }
  function bh(pct: number) { return Math.max(Math.min(pct, MAX_PCT) / MAX_PCT * chartH, 3); }
  function by(pct: number) { return padT + chartH - bh(pct); }

  return (
    <View style={s.card}>
      <Svg width={svgW} height={svgH}>
        {/* Goal dashed line */}
        <Line x1={padL} y1={goalY} x2={svgW - padR} y2={goalY}
          stroke={GOLD} strokeWidth={1.5} strokeDasharray="5 4" />
        <SvgText x={padL + 2} y={goalY - 3} fill={GOLD} fontSize={7.5} fontWeight="700">100%</SvgText>

        {days.map((day, i) => {
          const isToday = isSameDay(day.date, today);
          const h = day.hasData ? bh(day.pct) : 3;
          const x = bx(i);
          const y = day.hasData ? by(day.pct) : padT + chartH - 3;
          const color = day.hasData ? barColor(day.pct) : 'rgba(255,255,255,0.12)';
          const pctTxt = day.hasData ? `${Math.round(day.pct * 100)}%` : '';
          const dayLbl = DOW_ABBR[day.date.getDay()];
          return (
            <G key={day.dateKey}>
              <Rect x={x} y={y} width={barW} height={h} fill={color} rx={3} />
              {isToday && <Rect x={x - 2} y={y - 2} width={barW + 4} height={h + 4}
                fill="none" stroke="#ffffff" strokeWidth={1.5} rx={4} />}
              {day.hasData && <SvgText x={x + barW / 2} y={y - 4}
                fill="rgba(255,255,255,0.7)" fontSize={7.5} textAnchor="middle">{pctTxt}</SvgText>}
              <SvgText x={x + barW / 2} y={svgH - 4}
                fill={isToday ? GOLD : 'rgba(255,255,255,0.5)'}
                fontSize={10} fontWeight={isToday ? '700' : '400'} textAnchor="middle">{dayLbl}</SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

function DailyBevTrendsChart({ days }: { days: DayStats[] }) {
  const { width } = Dimensions.get('window');
  const svgW = width - 32 - 28; // outer page padding + card inner padding
  const chartH = 130;
  const padL = 24, padR = 4, padT = 8, padB = 18;
  const innerW = svgW - padL - padR;
  const colW = innerW / 7;
  const barW = Math.min(24, colW * 0.62);

  const dayTotals = days.map((d) => Object.values(d.breakdown).reduce((a, b) => a + b, 0));
  const maxOz = Math.max(8, ...dayTotals);

  return (
    <Svg width={svgW} height={padT + chartH + padB}>
      {/* Y guide lines + labels */}
      {[0, 0.5, 1].map((frac) => {
        const y = padT + chartH - frac * chartH;
        const oz = Math.round(frac * maxOz);
        return (
          <G key={frac}>
            <Line x1={padL} y1={y} x2={svgW - padR} y2={y}
              stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            <SvgText x={padL - 4} y={y + 3} fontSize={8}
              fill="rgba(255,255,255,0.45)" textAnchor="end">{oz}</SvgText>
          </G>
        );
      })}
      {/* Per-day stacked bars */}
      {days.map((day, i) => {
        const x = padL + colW * i + (colW - barW) / 2;
        let stackY = padT + chartH;
        const segments = BEV_KEYS
          .filter((k) => (day.breakdown[k] ?? 0) > 0)
          .map((k) => {
            const h = (day.breakdown[k] / maxOz) * chartH;
            stackY -= h;
            return <Rect key={k} x={x} y={stackY} width={barW} height={h} fill={BEV_COLORS[k]} rx={2} />;
          });
        return (
          <G key={day.dateKey}>
            {segments}
            <SvgText x={x + barW / 2} y={padT + chartH + 12}
              fontSize={9} fill="rgba(255,255,255,0.6)" textAnchor="middle">
              {DOW_ABBR[day.date.getDay()]}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function BeverageLegend({ totals }: { totals: Record<string, number> }) {
  const nonZero = BEV_KEYS.filter((k) => totals[k] > 0);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
      {nonZero.map((k) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BEV_COLORS[k] }} />
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
            {BEV_LABELS[k]}  {totals[k].toFixed(1)}oz
          </Text>
        </View>
      ))}
    </View>
  );
}

function MonthCalendar({
  days, today, onDayPress,
}: { days: DayStats[]; today: Date; onDayPress: (d: DayStats) => void }) {
  const firstDow = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const cells: (DayStats | null)[] = [
    ...Array(firstDow).fill(null),
    ...days,
  ];
  const CELL = 38;

  return (
    <View style={s.card}>
      {/* Day-of-week headers */}
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {DOW_ABBR.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: GOLD, fontSize: 11, fontWeight: '700' }}>{d}</Text>
          </View>
        ))}
      </View>
      {/* Grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((cell, i) => {
          if (!cell) {
            return <View key={`empty-${i}`} style={{ width: `${100 / 7}%`, height: CELL }} />;
          }
          const isToday = isSameDay(cell.date, today);
          const bg = cell.hasData && !cell.isFuture ? heatColor(cell.pct) : 'transparent';
          const textColor = cell.isFuture
            ? 'rgba(255,255,255,0.18)'
            : cell.hasData
              ? (cell.pct >= 0.5 ? '#ffffff' : '#ffffff')
              : 'rgba(255,255,255,0.5)';
          return (
            <TouchableOpacity
              key={cell.dateKey}
              style={{ width: `${100 / 7}%`, height: CELL, padding: 2 }}
              onPress={() => onDayPress(cell)}
              activeOpacity={cell.hasData && !cell.isFuture ? 0.7 : 1}
              disabled={cell.isFuture || !cell.hasData}
            >
              <View style={{
                flex: 1, borderRadius: 7,
                backgroundColor: bg,
                borderWidth: isToday ? 2 : (cell.hasData ? 0 : 1),
                borderColor: isToday ? '#ffffff' : 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: textColor, fontSize: 12, fontWeight: isToday ? '800' : '500' }}>
                  {cell.date.getDate()}
                </Text>
                {cell.goalHit && <Text style={{ fontSize: 7, lineHeight: 9 }}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function TrendChart({ days, goal }: { days: DayStats[]; goal: number }) {
  const { width } = Dimensions.get('window');
  const svgW = width - 32;
  const padL = 30, padR = 10, padT = 16, padB = 24;
  const chartW = svgW - padL - padR;
  const chartH = 150;
  const svgH = padT + chartH + padB;
  const MAX_Y = goal * 1.2 || 80;
  const n = days.length;

  function px(dayIdx: number) { return padL + (dayIdx / Math.max(n - 1, 1)) * chartW; }
  function py(oz: number) { return padT + chartH - Math.min(oz / MAX_Y, 1.2) * chartH; }

  const goalY = py(goal);
  const dataPoints = days.filter((d) => d.hasData);

  // Y-axis labels
  const yTicks = [0, goal * 0.5, goal].map(Math.round);

  // X-axis labels (every 7 days, plus last)
  const xLabels = days.filter((d) => d.date.getDate() % 7 === 1 || d.date.getDate() === n);

  return (
    <View style={s.card}>
      <Svg width={svgW} height={svgH}>
        {/* Goal dashed line */}
        <Line x1={padL} y1={goalY} x2={svgW - padR} y2={goalY}
          stroke={GOLD} strokeWidth={1.5} strokeDasharray="5 4" />
        <SvgText x={padL - 2} y={goalY - 3} fill={GOLD} fontSize={7.5} textAnchor="end">goal</SvgText>

        {/* Y axis ticks */}
        {yTicks.map((oz) => (
          <SvgText key={oz} x={padL - 4} y={py(oz) + 3}
            fill="rgba(255,255,255,0.35)" fontSize={8} textAnchor="end">{oz}</SvgText>
        ))}

        {/* Colored line segments */}
        {dataPoints.map((d, i) => {
          if (i === 0) return null;
          const prev = dataPoints[i - 1];
          const midPct = (d.pct + prev.pct) / 2;
          const color = midPct >= 1.0 ? GOLD : midPct >= 0.5 ? '#0088ff' : '#C0152A';
          return (
            <Line key={d.dateKey}
              x1={px(prev.date.getDate() - 1)} y1={py(prev.hydratedOz)}
              x2={px(d.date.getDate() - 1)} y2={py(d.hydratedOz)}
              stroke={color} strokeWidth={2} strokeLinecap="round" />
          );
        })}

        {/* Data point circles */}
        {dataPoints.map((d) => (
          <Circle key={d.dateKey}
            cx={px(d.date.getDate() - 1)} cy={py(d.hydratedOz)}
            r={3} fill={d.goalHit ? GOLD : '#0088ff'} />
        ))}

        {/* X axis labels */}
        {xLabels.map((d) => (
          <SvgText key={d.dateKey} x={px(d.date.getDate() - 1)} y={svgH - 4}
            fill="rgba(255,255,255,0.45)" fontSize={9} textAnchor="middle">
            {d.date.getDate()}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function RecordCard({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <View style={s.recordCard}>
      <Text style={{ fontSize: 22, marginBottom: 4 }}>{emoji}</Text>
      <Text style={s.recordLabel}>{label}</Text>
      <Text style={s.recordValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,215,0,0.15)',
  },
  title: {
    color: GOLD,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  toggleActive: { backgroundColor: GOLD },
  toggleTxt: { color: GOLD, fontSize: 13, fontWeight: '700', letterSpacing: 0.8 },
  toggleActiveTxt: { color: '#0a0520' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyHeadline: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  emptyText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24, maxWidth: 320 },
  emptyBtn: { backgroundColor: GOLD, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 },
  emptyBtnTxt: { color: '#0a0520', fontSize: 16, fontWeight: '800' },

  scroll: { paddingHorizontal: 16, paddingTop: 14 },

  sectionTitle: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 20,
    marginBottom: 8,
  },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    overflow: 'hidden',
  },

  cardRow: { flexDirection: 'row', gap: 8 },
  summaryCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 10,
    alignItems: 'center',
  },
  summaryLabel: {
    color: GOLD,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 4,
    textAlign: 'center',
  },
  summaryValue: { color: '#ffffff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  summarySub: { color: 'rgba(255,255,255,0.45)', fontSize: 10, textAlign: 'center', marginTop: 2 },

  noData: { color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  effPct: { color: GOLD, fontSize: 36, fontWeight: '900', textAlign: 'center' },
  effSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', marginBottom: 12 },
  effRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  effDot: { width: 10, height: 10, borderRadius: 5 },
  effLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, flex: 1 },
  effOz: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },

  recordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recordCard: {
    width: '47.5%',
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    alignItems: 'center',
  },
  recordLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, textAlign: 'center', marginBottom: 4 },
  recordValue: { color: GOLD, fontSize: 20, fontWeight: '900', textAlign: 'center' },

  // Day detail popup
  popupOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  popup: {
    backgroundColor: '#1a0a3a',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    padding: 22,
    width: '82%',
  },
  popupDate: { color: GOLD, fontSize: 16, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  popupDivider: { height: 1, backgroundColor: 'rgba(255,215,0,0.2)', marginBottom: 12 },
  popupRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  popupLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  popupVal: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  popupClose: {
    marginTop: 14,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingVertical: 10,
    alignItems: 'center',
  },
  popupCloseTxt: { color: GOLD, fontSize: 14, fontWeight: '700' },

  // Locked section (free tier in Stats)
  lockedCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 22,
    alignItems: 'center',
  },
  lockedEmoji: { fontSize: 36, marginBottom: 8 },
  lockedHeadline: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  lockedSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center', lineHeight: 17, marginBottom: 14, maxWidth: 280 },
  lockedBtn: {
    backgroundColor: GOLD,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  lockedBtnTxt: { color: '#0a0520', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  // Export section
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: GOLD, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, gap: 8,
  },
  exportBtnTxt: { color: GOLD, fontSize: 15, fontWeight: '700' },
  exportProHint: { color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center', marginTop: 10 },
  exportFootnote: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 12, textAlign: 'center', lineHeight: 16 },

  exportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  exportModal: {
    backgroundColor: '#0d0030', borderRadius: 20,
    borderWidth: 2, borderColor: 'rgba(255,215,0,0.5)',
    padding: 28, width: '100%', alignItems: 'center',
  },
  exportModalTitle: { color: GOLD, fontSize: 22, fontWeight: '900', marginBottom: 4 },
  exportModalSub: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 20, textAlign: 'center' },
  exportStatRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  exportStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 13 },
  exportStatValue: { color: GOLD, fontSize: 14, fontWeight: '700' },
  exportShareBtn: {
    width: '100%', backgroundColor: GOLD, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  exportShareTxt: { color: '#0a0520', fontSize: 16, fontWeight: '900' },
  exportCancelTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
});
