import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Trophy {
  days: number;
  emoji: string;
  title: string;
  subtitle: string;
}

const STREAK_TROPHIES: Trophy[] = [
  { days: 3,  emoji: '🌱', title: 'First Steps',  subtitle: '3 day streak'  },
  { days: 7,  emoji: '💧', title: 'One Week',     subtitle: '7 day streak'  },
  { days: 14, emoji: '⭐', title: 'Two Weeks',    subtitle: '14 day streak' },
  { days: 21, emoji: '🔥', title: 'Three Weeks',  subtitle: '21 day streak' },
  { days: 28, emoji: '💪', title: 'Four Weeks',   subtitle: '28 day streak' },
  { days: 35, emoji: '🏅', title: 'Five Weeks',   subtitle: '35 day streak' },
  { days: 42, emoji: '🥉', title: 'Six Weeks',    subtitle: '42 day streak' },
  { days: 49, emoji: '🥈', title: 'Seven Weeks',  subtitle: '49 day streak' },
  { days: 56, emoji: '🥇', title: 'Eight Weeks',  subtitle: '56 day streak' },
  { days: 63, emoji: '🏆', title: 'Nine Weeks',   subtitle: '63 day streak' },
  { days: 70, emoji: '👑', title: 'Ten Weeks',    subtitle: '70 day streak' },
  { days: 84, emoji: '💎', title: 'Twelve Weeks', subtitle: '84 day streak' },
];

function calcMaxStreak(goalHistory: Record<string, number>): number {
  const completedKeys = Object.keys(goalHistory).filter((k) => goalHistory[k] >= 1.0);
  if (completedKeys.length === 0) return 0;
  const dates = completedKeys
    .map((k) => { const [, y, m, d] = k.split('_'); return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)); })
    .sort((a, b) => a.getTime() - b.getTime());
  let max = 1, cur = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (dates[i].getTime() - dates[i - 1].getTime()) / 86400000;
    if (diff === 1) { cur++; if (cur > max) max = cur; }
    else cur = 1;
  }
  return max;
}

export default function TrophyCase({ goalHistory }: { goalHistory: Record<string, number> }) {
  const [expanded, setExpanded] = useState(false);
  const maxStreak = useMemo(() => calcMaxStreak(goalHistory), [goalHistory]);
  const earned = STREAK_TROPHIES.filter((t) => maxStreak >= t.days);
  const locked = STREAK_TROPHIES.filter((t) => maxStreak < t.days);
  const next = locked[0];

  return (
    <View style={s.wrapper}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded((e) => !e)} activeOpacity={0.8}>
        <Text style={s.headerTitle}>🏆 Trophy Case</Text>
        <View style={s.headerRight}>
          <Text style={s.earnedCount}>{earned.length}/{STREAK_TROPHIES.length}</Text>
          <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {!expanded && earned.length > 0 && (
        <View style={s.previewRow}>
          {earned.slice(-5).map((t) => (
            <Text key={t.days} style={s.previewEmoji}>{t.emoji}</Text>
          ))}
          {locked.length > 0 && <Text style={s.previewLocked}>+{locked.length} locked</Text>}
        </View>
      )}

      {expanded && (
        <View>
          {next && (
            <View style={s.nextCard}>
              <Text style={s.nextLabel}>Next trophy in</Text>
              <Text style={s.nextDays}>{next.days - maxStreak} more day{next.days - maxStreak !== 1 ? 's' : ''}</Text>
              <Text style={s.nextName}>{next.emoji} {next.title}</Text>
            </View>
          )}
          <Text style={s.sectionLabel}>Earned</Text>
          {earned.length === 0
            ? <Text style={s.emptyText}>Hit a 3-day streak to earn your first trophy!</Text>
            : (
              <View style={s.grid}>
                {earned.map((t) => (
                  <View key={t.days} style={s.trophyCard}>
                    <Text style={s.trophyEmoji}>{t.emoji}</Text>
                    <Text style={s.trophyTitle}>{t.title}</Text>
                    <Text style={s.trophySub}>{t.subtitle}</Text>
                  </View>
                ))}
              </View>
            )}
          <Text style={s.sectionLabel}>Locked</Text>
          <View style={s.grid}>
            {locked.map((t) => (
              <View key={t.days} style={[s.trophyCard, s.trophyLocked]}>
                <Text style={[s.trophyEmoji, { opacity: 0.25 }]}>{t.emoji}</Text>
                <Text style={[s.trophyTitle, { color: 'rgba(255,255,255,0.3)' }]}>{t.title}</Text>
                <Text style={[s.trophySub, { color: 'rgba(255,255,255,0.2)' }]}>{t.subtitle}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { marginTop: 4, marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerTitle: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  earnedCount: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  chevron: { color: '#ffffff', fontSize: 12 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewEmoji: { fontSize: 24 },
  previewLocked: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginLeft: 4 },
  nextCard: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 12, marginBottom: 14, alignItems: 'center' },
  nextLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 2 },
  nextDays: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  nextName: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  sectionLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  emptyText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontStyle: 'italic' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  trophyCard: { width: '28%', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10, alignItems: 'center', gap: 4 },
  trophyLocked: { backgroundColor: 'rgba(255,255,255,0.05)' },
  trophyEmoji: { fontSize: 28 },
  trophyTitle: { color: '#ffffff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  trophySub: { color: 'rgba(255,255,255,0.6)', fontSize: 9, textAlign: 'center' },
});
