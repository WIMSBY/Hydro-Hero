import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import Achievements from '../../components/Achievements';
import TrophyCase from '../../components/TrophyCase';
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

  useFocusEffect(useCallback(() => {
    (async () => {
      const [
        rawGoalHist, rawTotalHyd, rawTodayIntake, rawGoal, rawBreakdown,
        rawLifeOz, rawLifeJp, rawLifeCoffee, rawLifeBeer, rawFirstDrink,
      ] = await Promise.all([
        AsyncStorage.getItem('goal_history'),
        AsyncStorage.getItem('water_total_hydration'),
        AsyncStorage.getItem(todayKey()),
        AsyncStorage.getItem('water_goal'),
        AsyncStorage.getItem('water_category_breakdown'),
        AsyncStorage.getItem('lifetime_hydration_oz'),
        AsyncStorage.getItem('lifetime_jackpots'),
        AsyncStorage.getItem('lifetime_coffee_logs'),
        AsyncStorage.getItem('lifetime_beer_logs'),
        AsyncStorage.getItem('first_drink_time'),
      ]);

      const goalHistory: Record<string, number> = rawGoalHist ? JSON.parse(rawGoalHist) : {};
      const breakdown: Record<string, number> = rawBreakdown ? JSON.parse(rawBreakdown) : {};

      setData({
        streak: computeCurrentStreak(goalHistory),
        goalHistory,
        totalHydration: rawTotalHyd ? JSON.parse(rawTotalHyd) : 0,
        intake: rawTodayIntake ? JSON.parse(rawTodayIntake) : 0,
        goal: rawGoal ? JSON.parse(rawGoal) : 64,
        categoryBreakdown: breakdown,
        lifetimeHydrationOz: rawLifeOz ? JSON.parse(rawLifeOz) : 0,
        lifetimeJackpots: rawLifeJp ? JSON.parse(rawLifeJp) : 0,
        lifetimeCoffeeLogs: rawLifeCoffee ? JSON.parse(rawLifeCoffee) : 0,
        lifetimeBeerLogs: rawLifeBeer ? JSON.parse(rawLifeBeer) : 0,
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
        <Text style={s.title}>BADGES</Text>
      </View>
      {!data ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
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
