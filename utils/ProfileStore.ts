/**
 * ProfileStore — local multi-profile (Family Mode) for Build 33.
 *
 * Two account-level AsyncStorage keys:
 *   profiles_v1        — Profile[]
 *   active_profile_v1  — string (the active Profile.id)
 *
 * Everything else profile-scoped (drink log, water history, goal, Hero,
 * missions, presets, unit prefs, etc.) lives behind `prefixKey()` in
 * profileStorage.ts. Sounds, RC entitlement, theme, notification toggles
 * stay account-level — see project_family_mode_spec for the split.
 *
 * Pro entitlement is tied to Apple ID via RC, so it spans all profiles
 * automatically. Free cap = 2, Pro cap = 5.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type Profile = {
  id: string;
  name: string;
  avatarKey: string;  // emoji char OR hero-emblem id
  createdAt: number;
};

const PROFILES_KEY       = 'profiles_v1';
const ACTIVE_PROFILE_KEY = 'active_profile_v1';

export const FREE_PROFILE_CAP = 2;
export const PRO_PROFILE_CAP  = 5;

// ─── Read / write profile list ───────────────────────────────────────────────

export async function loadProfiles(): Promise<Profile[]> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidProfile);
  } catch {
    return [];
  }
}

export async function saveProfiles(profiles: Profile[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {}
}

function isValidProfile(p: unknown): p is Profile {
  return !!p
    && typeof (p as Profile).id === 'string'
    && typeof (p as Profile).name === 'string'
    && typeof (p as Profile).avatarKey === 'string'
    && typeof (p as Profile).createdAt === 'number';
}

// ─── Active profile ID ───────────────────────────────────────────────────────
//
// Cached in-module so prefixKey() can stay synchronous. Reads/writes are still
// persisted to AsyncStorage; call sites refresh the cache when they switch.

let activeIdCache: string | null = null;

export async function loadActiveProfileId(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
    activeIdCache = stored && stored.length > 0 ? stored : null;
    return activeIdCache;
  } catch {
    return null;
  }
}

export function getActiveProfileId(): string | null {
  return activeIdCache;
}

export async function setActiveProfileId(id: string): Promise<void> {
  activeIdCache = id;
  try {
    await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, id);
  } catch {}
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function addProfile(profile: Omit<Profile, 'id' | 'createdAt'>): Promise<Profile> {
  const created: Profile = {
    id: generateProfileId(),
    name: profile.name,
    avatarKey: profile.avatarKey,
    createdAt: Date.now(),
  };
  const existing = await loadProfiles();
  await saveProfiles([...existing, created]);
  return created;
}

export async function updateProfile(id: string, patch: Partial<Pick<Profile, 'name' | 'avatarKey'>>): Promise<void> {
  const existing = await loadProfiles();
  const next = existing.map((p) => (p.id === id ? { ...p, ...patch } : p));
  await saveProfiles(next);
}

export async function deleteProfile(id: string): Promise<void> {
  const existing = await loadProfiles();
  const next = existing.filter((p) => p.id !== id);
  await saveProfiles(next);
  // Active-profile reassignment is the caller's responsibility — it knows
  // which profile to swap to and what UI to refresh.
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
//
// First-launch flow: if no profiles exist, create Profile 1 named "Me" with a
// default emoji avatar. Caller (boot sequence) then runs the legacy-data
// migration that renames old un-prefixed AsyncStorage keys to
// `<profile1.id>:<key>`. Migration logic lives in profileStorage.ts so the
// fallback-and-promote behavior stays colocated with the read/write code.

const DEFAULT_AVATAR = '🦊';

// Cached promise so concurrent callers from boot + first-render share one
// bootstrap pass. profileStorage.pGetItem awaits this before namespacing so
// the very first storage read of the app session is correct even if it
// races boot.
let bootstrapPromise: Promise<{ profile: Profile; created: boolean }> | null = null;

export function ensureBootstrap(): Promise<{ profile: Profile; created: boolean }> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const existing = await loadProfiles();
    if (existing.length > 0) {
      const activeId = await loadActiveProfileId();
      const active = existing.find((p) => p.id === activeId) ?? existing[0];
      if (active.id !== activeId) {
        await setActiveProfileId(active.id);
      }
      return { profile: active, created: false };
    }
    const profile = await addProfile({ name: 'Me', avatarKey: DEFAULT_AVATAR });
    await setActiveProfileId(profile.id);
    return { profile, created: true };
  })();
  return bootstrapPromise;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateProfileId(): string {
  // 12-char base36 from random + time — collision-resistant enough for a
  // local-only on-device list of ≤5 profiles. No crypto dependency.
  const r = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-6);
  return `p_${r}${t}`;
}
