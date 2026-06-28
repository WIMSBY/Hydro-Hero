/**
 * profileStorage — namespaced AsyncStorage wrapper for Family Mode.
 *
 * Reads/writes profile-scoped keys under `<activeProfileId>:<key>`. If the
 * namespaced key is missing on read, falls back to the legacy un-prefixed
 * key, then writes the value back under the namespaced key and clears the
 * legacy one. This makes the Build 32 → 33 migration lazy: data moves on
 * first access rather than requiring an atomic migration step at boot.
 *
 * Falls back to plain AsyncStorage when no active profile is set (e.g.
 * before ProfileStore.ensureBootstrap has run). That guarantees a safe
 * degraded mode if boot ordering ever slips.
 *
 * NOT for account-level keys (sounds, RC, theme, notification toggles).
 * Use AsyncStorage directly for those — see project_family_mode_spec.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureBootstrap, getActiveProfileId } from './ProfileStore';

export function prefixKey(key: string, profileId?: string | null): string {
  const id = profileId ?? getActiveProfileId();
  return id ? `${id}:${key}` : key;
}

// Every wrapper awaits ensureBootstrap() — idempotent, cached promise. This
// guarantees a profile ID is resolved before we attempt to namespace, even
// if a component reads from storage on its first useEffect tick.
export async function pGetItem(key: string): Promise<string | null> {
  await ensureBootstrap();
  const id = getActiveProfileId();
  if (!id) return AsyncStorage.getItem(key);
  const namespaced = `${id}:${key}`;
  const direct = await AsyncStorage.getItem(namespaced);
  if (direct !== null) return direct;
  // Lazy migration: fall back to the legacy key, promote into the namespaced
  // slot, then wipe the legacy entry so subsequent reads short-circuit.
  const legacy = await AsyncStorage.getItem(key);
  if (legacy === null) return null;
  try {
    await AsyncStorage.setItem(namespaced, legacy);
    await AsyncStorage.removeItem(key);
  } catch {}
  return legacy;
}

export async function pSetItem(key: string, value: string): Promise<void> {
  await ensureBootstrap();
  await AsyncStorage.setItem(prefixKey(key), value);
}

export async function pRemoveItem(key: string): Promise<void> {
  await ensureBootstrap();
  await AsyncStorage.removeItem(prefixKey(key));
}

export async function pMultiGet(keys: readonly string[]): Promise<[string, string | null][]> {
  // Sequential to keep the lazy-migration semantics consistent with pGetItem.
  // Profile-scoped multi-gets are small (a dozen keys at boot) so sequential
  // is fine; the parallelism win wouldn't be felt.
  const out: [string, string | null][] = [];
  for (const k of keys) {
    out.push([k, await pGetItem(k)]);
  }
  return out;
}

// ─── Key-classification helper ──────────────────────────────────────────────
//
// Used by call-site refactors to decide whether a key should use this wrapper
// or stay on plain AsyncStorage. Exporting the set here so the source of
// truth is one place; the call-site changes can `import { isProfileScoped }`
// and assert at the import site.

const ACCOUNT_LEVEL_KEYS: ReadonlySet<string> = new Set([
  // Sound + theme + RC (all account-wide)
  'color_mode',
  'sound_enabled',
  'haptics_enabled',
  'selected_sound_pack',
  'custom_sounds_v1',
  'promo_lifetime_unlocked',
  'hasLifetimeAccess',
  'LIFETIME2026_used',
  // Health / notifications / Live Activity master toggles
  'health_permission_asked',
  'health_permission_granted',
  'health_sync_enabled',
  'water_last_health_sample',
  'show_live_activity_option',
  // Family Mode internal
  'profiles_v1',
  'active_profile_v1',
]);

export function isProfileScoped(key: string): boolean {
  return !ACCOUNT_LEVEL_KEYS.has(key);
}
