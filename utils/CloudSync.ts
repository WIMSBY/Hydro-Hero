/**
 * utils/CloudSync.ts
 *
 * Background sync between AsyncStorage (primary) and Supabase (backup layer).
 *
 * Contract:
 *  - Local AsyncStorage is ALWAYS the source of truth.
 *  - Supabase is a backup / cross-device sync layer.
 *  - When isSupabaseConfigured is false every function returns immediately —
 *    the app works identically with no credentials present.
 *  - Every function is try/catch-guarded — network failure never crashes the app.
 *  - Sync never blocks the UI — all calls fire-and-forget or return Promises
 *    that callers can await without risk.
 *  - Today's local data is NEVER overwritten by cloud data during pulls.
 *
 * Assumed Supabase tables (all protected by RLS — users read/write own rows only):
 *
 *   hydration_logs (user_id, date PK, goal_oz, total_consumed_oz,
 *                   total_hydrated_oz, hydration_pct, breakdown jsonb, updated_at)
 *
 *   beverage_logs  (id uuid PK, user_id, date, beverage_name,
 *                   raw_oz, hydrated_oz, efficiency, logged_at)
 *
 *   achievements   (user_id, badge_id PK, unlocked_at)
 *
 *   profiles       (id PK = auth.uid, username, avatar, created_at)
 *                  NOTE: username lookups require profiles to be publicly readable
 *                  (add RLS policy: SELECT allowed for authenticated users).
 *                  hydration_logs lookups for squad also need a permissive SELECT
 *                  policy for authenticated users on today's rows.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BeverageEntryPayload {
  date:          string;  // ISO "YYYY-MM-DD"
  beverageName:  string;
  rawOz:         number;
  hydratedOz:    number;
  efficiency:    number;  // 0–1
}

export interface FoundUser {
  userId:       string;
  username:     string;
  avatar:       string;
  hydrationPct: number;
  hydrationOz:  number;
  goalOz:       number;
}

// ─── Module state ─────────────────────────────────────────────────────────────

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getTodayStorageKey(): string {
  const d = new Date();
  return `water_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

/** "water_2024_1_5" → "2024-01-05" */
function localKeyToIso(key: string): string {
  const parts = key.replace('water_', '').split('_');
  if (parts.length !== 3) return todayISODate();
  const [y, m, d] = parts;
  return `${y}-${String(parseInt(m)).padStart(2, '0')}-${String(parseInt(d)).padStart(2, '0')}`;
}

/** "2024-01-05" → "water_2024_1_5" */
function isoToLocalKey(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `water_${parseInt(y)}_${parseInt(m)}_${parseInt(d)}`;
}

async function getUserId(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}

// ─── Public sync functions ────────────────────────────────────────────────────

/**
 * Upsert today's hydration summary to Supabase.
 * Reads current values from AsyncStorage.
 * Call debouncedSyncTodayLog() from drink-log paths instead of this directly.
 */
export async function syncTodayLog(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const userId = await getUserId();
    if (!userId) return;

    const todayKey = getTodayStorageKey();
    const [rawHyd, rawGoal, rawBreakdown, rawIntake] = await Promise.all([
      AsyncStorage.getItem('water_total_hydration'),
      AsyncStorage.getItem('water_goal'),
      AsyncStorage.getItem('water_category_breakdown'),
      AsyncStorage.getItem(todayKey),
    ]);

    const totalHydrated = rawHyd      ? (JSON.parse(rawHyd)       as number)                    : 0;
    const goalOz        = rawGoal     ? (JSON.parse(rawGoal)      as number)                    : 64;
    const breakdown     = rawBreakdown? (JSON.parse(rawBreakdown) as Record<string, number>)    : {};
    const totalConsumed = rawIntake   ? (JSON.parse(rawIntake)    as number)                    : 0;

    await supabase.from('hydration_logs').upsert({
      user_id:           userId,
      date:              todayISODate(),
      goal_oz:           goalOz,
      total_consumed_oz: totalConsumed,
      total_hydrated_oz: totalHydrated,
      hydration_pct:     goalOz > 0 ? totalHydrated / goalOz : 0,
      breakdown,
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'user_id,date' });

    await AsyncStorage.setItem('cloud_last_sync', new Date().toISOString());
  } catch {}
}

/**
 * Cancel any pending debounced sync (call when app goes to background).
 */
export function cancelPendingSync(): void {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
}

/**
 * Debounced syncTodayLog — call this after every drink log.
 * Collapses rapid successive logs into a single Supabase write.
 */
export function debouncedSyncTodayLog(): void {
  if (!isSupabaseConfigured) return;
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    syncTodayLog().catch(() => {});
    _debounceTimer = null;
  }, DEBOUNCE_MS);
}

/**
 * Insert an individual beverage entry into beverage_logs.
 * Called once per drink log — not debounced.
 */
export async function syncBeverageEntry(entry: BeverageEntryPayload): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const userId = await getUserId();
    if (!userId) return;

    await supabase.from('beverage_logs').insert({
      user_id:       userId,
      date:          entry.date,
      beverage_name: entry.beverageName,
      raw_oz:        entry.rawOz,
      hydrated_oz:   entry.hydratedOz,
      efficiency:    entry.efficiency,
      logged_at:     new Date().toISOString(),
    });
  } catch {}
}

/**
 * Upsert all locally-unlocked badges to the achievements table.
 * Idempotent — safe to call any time; already-synced rows are ignored.
 */
export async function syncAchievements(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const userId = await getUserId();
    if (!userId) return;

    const raw = await AsyncStorage.getItem('unlocked_badges');
    if (!raw) return;

    const badges = JSON.parse(raw) as { id: string; unlockedAt: string }[];
    if (badges.length === 0) return;

    const rows = badges.map(b => ({
      user_id:     userId,
      badge_id:    b.id,
      unlocked_at: b.unlockedAt,
    }));

    await supabase.from('achievements').upsert(rows, {
      onConflict:       'user_id,badge_id',
      ignoreDuplicates: true,
    });
  } catch {}
}

/**
 * Pull the last 30 days of hydration history from Supabase and merge into
 * local AsyncStorage. Never overwrites today's local data.
 * Also pulls achievements and merges with local badge list.
 */
export async function pullCloudData(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const userId = await getUserId();
    if (!userId) return;

    const cutoff    = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const todayStr  = todayISODate();

    // ── Hydration history ────────────────────────────────────────────────────
    const { data: cloudLogs } = await supabase
      .from('hydration_logs')
      .select('date, total_consumed_oz, goal_oz, breakdown')
      .eq('user_id', userId)
      .gte('date', cutoffStr)
      .neq('date', todayStr);  // always keep local data for today

    if (cloudLogs && cloudLogs.length > 0) {
      const rawHistory = await AsyncStorage.getItem('water_history');
      const localHistory: { date: string; oz: number; goal: number; breakdown?: Record<string, number> }[] =
        rawHistory ? JSON.parse(rawHistory) : [];

      const localKeys = new Set(localHistory.map(h => h.date));
      let changed = false;

      for (const log of cloudLogs) {
        const localKey = isoToLocalKey(log.date as string);
        if (!localKeys.has(localKey)) {
          localHistory.push({
            date:      localKey,
            oz:        log.total_consumed_oz as number,
            goal:      log.goal_oz as number,
            breakdown: log.breakdown as Record<string, number>,
          });
          localKeys.add(localKey);
          changed = true;
        }
      }

      if (changed) {
        localHistory.sort((a, b) => b.date.localeCompare(a.date));
        await AsyncStorage.setItem('water_history', JSON.stringify(localHistory.slice(0, 30)));
      }
    }

    // ── Achievements ─────────────────────────────────────────────────────────
    const { data: cloudBadges } = await supabase
      .from('achievements')
      .select('badge_id, unlocked_at')
      .eq('user_id', userId);

    if (cloudBadges && cloudBadges.length > 0) {
      const rawLocal = await AsyncStorage.getItem('unlocked_badges');
      const localBadges: { id: string; unlockedAt: string }[] = rawLocal ? JSON.parse(rawLocal) : [];
      const localIds = new Set(localBadges.map(b => b.id));
      let badgesChanged = false;

      for (const cb of cloudBadges) {
        if (!localIds.has(cb.badge_id as string)) {
          localBadges.push({ id: cb.badge_id as string, unlockedAt: cb.unlocked_at as string });
          localIds.add(cb.badge_id as string);
          badgesChanged = true;
        }
      }

      if (badgesChanged) {
        await AsyncStorage.setItem('unlocked_badges', JSON.stringify(localBadges));
      }
    }
  } catch {}
}

/**
 * Push all existing local AsyncStorage history to Supabase.
 * Designed for the one-time migration when a user first signs in.
 * Idempotent — safe to call multiple times.
 * @param onProgress  Optional 0–1 progress callback for loading indicators.
 */
export async function syncAllHistory(onProgress?: (pct: number) => void): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const userId = await getUserId();
    if (!userId) return;

    const rawHistory = await AsyncStorage.getItem('water_history');
    const history: { date: string; oz: number; goal: number; breakdown?: Record<string, number> }[] =
      rawHistory ? JSON.parse(rawHistory) : [];

    onProgress?.(0.05);

    const rows = history.map(h => ({
      user_id:           userId,
      date:              localKeyToIso(h.date),
      goal_oz:           h.goal ?? 64,
      total_consumed_oz: h.oz ?? 0,
      total_hydrated_oz: h.oz ?? 0,
      hydration_pct:     h.goal > 0 ? Math.min(h.oz / h.goal, 1) : 0,
      breakdown:         h.breakdown ?? {},
      updated_at:        new Date().toISOString(),
    }));

    const CHUNK = 50;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await supabase.from('hydration_logs').upsert(rows.slice(i, i + CHUNK), {
        onConflict:       'user_id,date',
        ignoreDuplicates: true,
      });
      onProgress?.((i + Math.min(CHUNK, rows.length - i)) / Math.max(rows.length, 1) * 0.8);
    }

    await syncAchievements();
    onProgress?.(0.95);

    await AsyncStorage.setItem('cloud_initial_sync_done', '1');
    await AsyncStorage.setItem('cloud_last_sync', new Date().toISOString());
    onProgress?.(1.0);
  } catch {}
}

/**
 * Look up another user by username to add them to the squad.
 * Requires the profiles table to have a SELECT policy for authenticated users,
 * and hydration_logs to allow reading today's rows for authenticated users.
 */
export async function findUserByUsername(username: string): Promise<FoundUser | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, avatar')
      .ilike('username', username.trim())
      .maybeSingle();

    if (!profile) return null;

    const { data: todayLog } = await supabase
      .from('hydration_logs')
      .select('total_hydrated_oz, goal_oz, hydration_pct')
      .eq('user_id', profile.id as string)
      .eq('date', todayISODate())
      .maybeSingle();

    return {
      userId:       profile.id as string,
      username:     profile.username as string,
      avatar:       (profile.avatar as string) ?? '💧',
      hydrationPct: (todayLog?.hydration_pct as number) ?? 0,
      hydrationOz:  (todayLog?.total_hydrated_oz as number) ?? 0,
      goalOz:       (todayLog?.goal_oz as number) ?? 64,
    };
  } catch {
    return null;
  }
}
