import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { pGetItem } from '../../utils/profileStorage';
import { useFocusEffect } from '@react-navigation/native';
import Achievements from '../../components/Achievements';
import TrophyCase from '../../components/TrophyCase';
import SigilCase from '../../components/SigilCase';
import { MissionsSection } from '../../components/MissionsSection';
import { loadProgresses, type ProgressMap } from '../../utils/MissionEngine';
import { playBadgeUnlockSound } from '../../utils/SoundManager';
import { setPendingBadgeCount } from '../../utils/badgeDetection';

const GOLD = '#FFD700';
const BG = '#0a0520';

type Loaded = {
  streak: number;
  goalHistory: Record<string, number>;
  totalHydration: number;
  intake: number;
  goal: number;
  categoryBreakdown: Record<string, number>;
  lifetimeHydrationOz: number;
  lifetimeJackpots: number;
  lifetimeCoffeeLogs: number;
  lifetimeBeerLogs: number;
  firstDrinkTime: string | null;
};

function todayKey() {
  const d = new Date();
  return `water_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

function computeCurrentStreak(goalHistory: Record<string, number>): number {
  let count = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (true) {
    const k = `water_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
    const pct = goalHistory[k];
    if (pct !== undefined && pct >= 1.0) {
      count++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return count;
}

export default function BadgesScreen() {
  const [data, setData] = useState<Loaded | null>(null);
  const [trigger, setTrigger] = useState(0);
  const [missionProgresses, setMissionProgresses] = useState<ProgressMap>({});
  const [showAlcoholicDrinks, setShowAlcoholicDrinks] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [
        rawGoalHist, rawTotalHyd, rawTodayIntake, rawGoal, rawBreakdown,
        rawLifeOz, rawLifeJp, rawLifeCoffee, rawLifeBeer, rawFirstDrink,
        progresses, rawAlc,
      ] = await Promise.all([
        pGetItem('goal_history'),
        pGetItem('water_total_hydration'),
        pGetItem(todayKey()),
        pGetItem('water_goal'),
        pGetItem('water_category_breakdown'),
        pGetItem('lifetime_hydration_oz'),
        pGetItem('lifetime_jackpots'),
        pGetItem('lifetime_coffee_logs'),
        pGetItem('lifetime_beer_logs'),
        pGetItem('first_drink_time'),
        loadProgresses(),
        pGetItem('show_alcoholic_drinks'),
      ]);
      setMissionProgresses(progresses);
      setShowAlcoholicDrinks(rawAlc === 'true');

      // Tolerant parse: a single corrupt key (Sentry HYDRO-HERO-9 saw
      // "Unexpected character in number: -" here) used to abort the whole
      // load via the outer .catch. Now each key falls back to its default.
      const parseOr = <T,>(raw: string | null, fallback: T): T => {
        if (!raw) return fallback;
        try { return JSON.parse(raw) as T; } catch { return fallback; }
      };

      const goalHistory = parseOr<Record<string, number>>(rawGoalHist, {});
      const breakdown = parseOr<Record<string, number>>(rawBreakdown, {});

      setData({
        streak: computeCurrentStreak(goalHistory),
        goalHistory,
        totalHydration: parseOr<number>(rawTotalHyd, 0),
        intake: parseOr<number>(rawTodayIntake, 0),
        goal: parseOr<number>(rawGoal, 64),
        categoryBreakdown: breakdown,
        lifetimeHydrationOz: parseOr<number>(rawLifeOz, 0),
        lifetimeJackpots: parseOr<number>(rawLifeJp, 0),
        lifetimeCoffeeLogs: parseOr<number>(rawLifeCoffee, 0),
        lifetimeBeerLogs: parseOr<number>(rawLifeBeer, 0),
        firstDrinkTime: rawFirstDrink, // stored as a plain ISO string, not JSON
      });
      setTrigger(Date.now());
      // User is now viewing Badges — clear the "new badges" indicator.
      // The Achievements component will run its own detection and persist
      // any newly-unlocked badges to AsyncStorage as a side effect.
      setPendingBadgeCount(0);
    })().catch((e) => console.warn('Badges load error', e));
  }, []));

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <View style={s.header}>
        <Text style={s.title}>MISSIONS</Text>
      </View>
      {!data ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Missions live at the top — Day 4 of the Missions feature.
              Existing TrophyCase (streak grid) + Achievements (badge wall)
              fall below so the page reads: chase → reflect → collect. */}
          <MissionsSection
            progresses={missionProgresses}
            onProgressesChange={setMissionProgresses}
            showAlcoholicDrinks={showAlcoholicDrinks}
          />
          <SigilCase progresses={missionProgresses} />
          <TrophyCase goalHistory={data.goalHistory} />
          <Achievements
            trigger={trigger}
            streak={data.streak}
            goalHistory={data.goalHistory}
            totalHydration={data.totalHydration}
            intake={data.intake}
            goal={data.goal}
            categoryBreakdown={data.categoryBreakdown as never}
            lifetimeHydrationOz={data.lifetimeHydrationOz}
            lifetimeJackpots={data.lifetimeJackpots}
            lifetimeCoffeeLogs={data.lifetimeCoffeeLogs}
            lifetimeBeerLogs={data.lifetimeBeerLogs}
            firstDrinkTime={data.firstDrinkTime}
            onBadgeUnlocked={() => playBadgeUnlockSound()}
          />
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: BG,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,215,0,0.15)',
  },
  title: { color: GOLD, fontSize: 26, fontWeight: '900', letterSpacing: 3, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  scroll: { paddingHorizontal: 16, paddingTop: 14 },
});
