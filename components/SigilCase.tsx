/**
 * SigilCase — collapsible grid of earned mission rewards.
 *
 * Build 33 Day 5. Surfaces sigils, powers, and cosmetics earned from
 * completed missions. Modeled on TrophyCase's expand/preview pattern so the
 * Missions tab keeps a consistent rhythm: header summary + earned preview +
 * tap-to-expand full grid.
 *
 * Source of truth = the ProgressMap passed down from the Missions tab. No
 * extra storage — earned set is recomputed on every render via Rewards.ts.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MISSIONS, Reward } from '../constants/missions';
import { getUnlockedRewards, type UnlockedRewards } from '../utils/Rewards';
import type { ProgressMap } from '../utils/MissionEngine';

const GOLD = '#FFD700';

type DisplayReward = Reward & { emblem: string; missionName: string; locked: boolean };

function buildCatalog(unlocked: UnlockedRewards): DisplayReward[] {
  const seen = new Set<string>();
  const out: DisplayReward[] = [];
  for (const mission of MISSIONS) {
    for (const reward of mission.rewards) {
      if (seen.has(reward.id)) continue;
      seen.add(reward.id);
      out.push({
        ...reward,
        emblem: mission.emblem,
        missionName: mission.name,
        locked: !unlocked.ids.has(reward.id),
      });
    }
  }
  // Earned first, then locked — same visual order as TrophyCase.
  return out.sort((a, b) => Number(a.locked) - Number(b.locked));
}

const KIND_LABEL: Record<Reward['kind'], string> = {
  sigil: 'SIGIL',
  power: 'POWER',
  cosmetic: 'COSMETIC',
};

export default function SigilCase({ progresses }: { progresses: ProgressMap }) {
  const [expanded, setExpanded] = useState(false);
  const unlocked = useMemo(() => getUnlockedRewards(progresses), [progresses]);
  const catalog = useMemo(() => buildCatalog(unlocked), [unlocked]);
  const earned = catalog.filter((r) => !r.locked);
  const locked = catalog.filter((r) => r.locked);
  const nextLocked = locked[0];

  return (
    <View style={s.wrapper}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded((e) => !e)} activeOpacity={0.8}>
        <Text style={s.headerTitle}>✨ Sigil Case</Text>
        <View style={s.headerRight}>
          <Text style={s.earnedCount}>{earned.length}/{catalog.length}</Text>
          <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {!expanded && earned.length > 0 && (
        <View style={s.previewRow}>
          {earned.slice(0, 5).map((r) => (
            <Text key={r.id} style={s.previewEmoji}>{r.emblem}</Text>
          ))}
          {locked.length > 0 && <Text style={s.previewLocked}>+{locked.length} locked</Text>}
        </View>
      )}

      {!expanded && earned.length === 0 && nextLocked && (
        <Text style={s.teaseInline}>
          Complete {nextLocked.missionName} to earn {nextLocked.emblem} {nextLocked.name}
        </Text>
      )}

      {expanded && (
        <View>
          {nextLocked && (
            <View style={s.nextCard}>
              <Text style={s.nextLabel}>Next reward</Text>
              <Text style={s.nextEmoji}>{nextLocked.emblem}</Text>
              <Text style={s.nextName}>{nextLocked.name}</Text>
              <Text style={s.nextHint}>Complete {nextLocked.missionName}</Text>
            </View>
          )}

          <Text style={s.sectionLabel}>Earned</Text>
          {earned.length === 0 ? (
            <Text style={s.emptyText}>No rewards yet — finish a mission to start your collection.</Text>
          ) : (
            <View style={s.grid}>
              {earned.map((r) => (
                <View key={r.id} style={s.card}>
                  <Text style={s.emoji}>{r.emblem}</Text>
                  <Text style={s.kindBadge}>{KIND_LABEL[r.kind]}</Text>
                  <Text style={s.cardTitle} numberOfLines={2}>{r.name}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={s.sectionLabel}>Locked</Text>
          <View style={s.grid}>
            {locked.map((r) => (
              <View key={r.id} style={[s.card, s.cardLocked]}>
                <Text style={[s.emoji, { opacity: 0.22 }]}>{r.emblem}</Text>
                <Text style={[s.kindBadge, { color: 'rgba(255,215,0,0.35)' }]}>{KIND_LABEL[r.kind]}</Text>
                <Text style={[s.cardTitle, { color: 'rgba(255,255,255,0.3)' }]} numberOfLines={2}>{r.name}</Text>
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
  teaseInline: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontStyle: 'italic' },

  nextCard: {
    backgroundColor: 'rgba(255,215,0,0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.20)',
  },
  nextLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  nextEmoji: { fontSize: 32, marginBottom: 4 },
  nextName: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  nextHint: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 4 },

  sectionLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  emptyText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontStyle: 'italic', marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  card: { width: '28%', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10, alignItems: 'center', gap: 4 },
  cardLocked: { backgroundColor: 'rgba(255,255,255,0.05)' },
  emoji: { fontSize: 28 },
  kindBadge: { color: GOLD, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  cardTitle: { color: '#ffffff', fontSize: 10, fontWeight: '700', textAlign: 'center' },
});
