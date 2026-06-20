import AsyncStorage from '@react-native-async-storage/async-storage';
import { ALL_BADGES, type BadgeCheckData, type BadgeDef } from '../components/Achievements';

const PENDING_KEY = 'pending_badges_count';

/**
 * Given current app state and the set of already-unlocked badge IDs, return
 * the definitions of badges whose check() passes but which haven't been
 * unlocked yet. Pure function — no AsyncStorage reads.
 */
export function detectPendingBadges(
  data: BadgeCheckData,
  unlockedIds: Set<string>,
): BadgeDef[] {
  const pending: BadgeDef[] = [];
  for (const badge of ALL_BADGES) {
    if (unlockedIds.has(badge.id)) continue;
    try { if (badge.check(data)) pending.push(badge); } catch {}
  }
  return pending;
}

export async function loadUnlockedBadgeIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem('unlocked_badges');
    if (!raw) return new Set();
    const parsed: { id: string }[] = JSON.parse(raw);
    return new Set(parsed.map((b) => b.id));
  } catch {
    return new Set();
  }
}

export async function setPendingBadgeCount(count: number): Promise<void> {
  try { await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(count)); } catch {}
}

export async function getPendingBadgeCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : 0;
  } catch {
    return 0;
  }
}
