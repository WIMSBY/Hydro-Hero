import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import Achievements from '../../components/Achievements';
import TrophyCase from '../../components/TrophyCase';
import SigilCase from '../../components/SigilCase';
import { MissionsSection } from '../../components/MissionsSection';
import { HeroSetupModal } from '../../components/HeroSetupModal';
import { loadProgresses, saveProgresses, type ProgressMap } from '../../utils/MissionEngine';
import { startMissionWithPowers } from '../../utils/Rewards';
import { loadHero, saveHero, markSetupSeen } from '../../utils/HeroStore';
import { Hero, getEmblem } from '../../constants/hero';
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
  const [hero, setHero] = useState<Hero | null>(null);
  const [showHeroSetup, setShowHeroSetup] = useState(false);
  const [heroEditing, setHeroEditing] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [
        rawGoalHist, rawTotalHyd, rawTodayIntake, rawGoal, rawBreakdown,
        rawLifeOz, rawLifeJp, rawLifeCoffee, rawLifeBeer, rawFirstDrink,
        progresses, rawAlc, loadedHero,
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
        loadProgresses(),
        AsyncStorage.getItem('show_alcoholic_drinks'),
        loadHero(),
      ]);
      setMissionProgresses(progresses);
      setShowAlcoholicDrinks(rawAlc === 'true');
      setHero(loadedHero);

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
          {/* Hero entry point — gold CTA when no hero saved, compact badge when
              set. Tapping either opens HeroSetupModal. Origin Story auto-starts
              from the CTA's confirm; the badge opens edit mode. */}
          {hero ? (
            <TouchableOpacity
              style={s.heroBadge}
              activeOpacity={0.7}
              onPress={() => { setHeroEditing(true); setShowHeroSetup(true); }}
            >
              <Text style={s.heroEmblem}>{getEmblem(hero.emblemId).emoji}</Text>
              <Text style={s.heroName} numberOfLines={1}>{hero.name}</Text>
              <Text style={s.heroRank}>{hero.rank.toUpperCase()}</Text>
              <Text style={s.heroEdit}>✏</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.heroCta}
              activeOpacity={0.85}
              onPress={() => { setHeroEditing(false); setShowHeroSetup(true); }}
            >
              <Text style={s.heroCtaEmblem}>🦸</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.heroCtaTitle}>Begin Your Heroic Journey</Text>
                <Text style={s.heroCtaSub}>Origin Story · hit your goal 7 days in a row</Text>
              </View>
              <Text style={s.heroCtaArrow}>›</Text>
            </TouchableOpacity>
          )}

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

      <HeroSetupModal
        visible={showHeroSetup}
        initialHero={heroEditing ? hero : null}
        onClose={() => {
          setShowHeroSetup(false);
          markSetupSeen().catch(() => {});
        }}
        onConfirm={async (nextHero, startedFromSetup) => {
          setHero(nextHero);
          setShowHeroSetup(false);
          await saveHero(nextHero);
          markSetupSeen().catch(() => {});
          if (startedFromSetup) {
            const existing = missionProgresses["heros-journey-bronze"];
            const isLive = existing && existing.status === "active";
            if (!isLive) {
              const next: ProgressMap = {
                ...missionProgresses,
                "heros-journey-bronze": startMissionWithPowers("heros-journey-bronze", missionProgresses),
              };
              setMissionProgresses(next);
              await saveProgresses(next);
            }
          }
        }}
      />
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

  // Hero badge (already set up) — compact emblem + name + rank + edit pencil.
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.30)',
    backgroundColor: 'rgba(255,215,0,0.04)',
    marginBottom: 14,
    gap: 10,
  },
  heroEmblem: { fontSize: 22 },
  heroName: { flex: 1, color: '#ffffff', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  heroRank: {
    color: GOLD,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: 'rgba(255,215,0,0.12)',
  },
  heroEdit: { color: 'rgba(255,255,255,0.45)', fontSize: 14, marginLeft: 6 },

  // Hero CTA (no hero) — taller card with prompt + arrow.
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: GOLD,
    backgroundColor: 'rgba(255,215,0,0.10)',
    marginBottom: 14,
  },
  heroCtaEmblem: { fontSize: 32 },
  heroCtaTitle: { color: GOLD, fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },
  heroCtaSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  heroCtaArrow: { color: GOLD, fontSize: 28, fontWeight: '300', marginLeft: 6 },
});
