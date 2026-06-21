/**
 * utils/CustomSounds.ts
 *
 * Data layer for user-recorded custom sound clips. Each customizable role
 * (waterLog, jackpot) can hold up to 5 clips that SoundManager shuffles
 * through on a per-play basis (see SoundManager's custom-sounds branch).
 *
 * Storage layout:
 *   AsyncStorage 'custom_sounds_v1' -> JSON {
 *     waterLog?: CustomSoundClip[],
 *     jackpot?:  CustomSoundClip[],
 *   }
 *   FileSystem documentDirectory/customSounds/<role>_<id>.m4a
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory as FSDirectory, File as FSFile, Paths as FSPaths } from 'expo-file-system';

export type CustomizableRole = 'waterLog' | 'jackpot';

export interface CustomSoundClip {
  id: string;
  uri: string;
  durationMs: number;
  createdAt: number;
  label?: string;
}

export const CUSTOMIZABLE_ROLES: CustomizableRole[] = ['waterLog', 'jackpot'];
export const MAX_CLIPS_PER_ROLE = 5;

export type CustomSoundsState = Partial<Record<CustomizableRole, CustomSoundClip[]>>;

const STORAGE_KEY = 'custom_sounds_v1';
const SOUNDS_SUBDIR = 'customSounds';

function getSoundsDir(): FSDirectory {
  return new FSDirectory(FSPaths.document, SOUNDS_SUBDIR);
}

function ensureDir(): void {
  const dir = getSoundsDir();
  try {
    if (!dir.exists) dir.create({ idempotent: true });
  } catch {
    // Silent — caller will fail at move() if the dir really can't exist.
  }
}

export async function loadCustomSounds(): Promise<CustomSoundsState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CustomSoundsState;
    // Drop entries whose files no longer exist (user cleared app data, restored
    // from backup without files, etc.) so the UI never references dead URIs.
    let mutated = false;
    for (const role of CUSTOMIZABLE_ROLES) {
      const clips = parsed[role];
      if (!clips) continue;
      const alive = clips.filter((c) => {
        try { return new FSFile(c.uri).exists; } catch { return false; }
      });
      if (alive.length !== clips.length) {
        mutated = true;
        parsed[role] = alive;
      }
    }
    if (mutated) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return {};
  }
}

async function saveState(state: CustomSoundsState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Move a freshly recorded temp file into permanent storage and persist its
 * metadata. Throws if the role already has MAX_CLIPS_PER_ROLE clips.
 */
export async function addCustomClip(
  role: CustomizableRole,
  tempUri: string,
  durationMs: number,
): Promise<CustomSoundClip> {
  ensureDir();
  const state = await loadCustomSounds();
  const clips = state[role] ?? [];
  if (clips.length >= MAX_CLIPS_PER_ROLE) {
    throw new Error(`Already at ${MAX_CLIPS_PER_ROLE} clips for ${role}`);
  }
  const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
  const fileName = `${role}_${id}.m4a`;
  const dest = new FSFile(FSPaths.document, SOUNDS_SUBDIR, fileName);
  const tempFile = new FSFile(tempUri);
  tempFile.move(dest);
  const clip: CustomSoundClip = {
    id,
    uri: dest.uri,
    durationMs: Math.round(durationMs),
    createdAt: Date.now(),
  };
  const next: CustomSoundsState = { ...state, [role]: [...clips, clip] };
  await saveState(next);
  return clip;
}

export async function deleteCustomClip(role: CustomizableRole, id: string): Promise<void> {
  const state = await loadCustomSounds();
  const clips = state[role] ?? [];
  const target = clips.find((c) => c.id === id);
  if (target) {
    try { new FSFile(target.uri).delete(); } catch {}
  }
  const next: CustomSoundsState = { ...state, [role]: clips.filter((c) => c.id !== id) };
  await saveState(next);
}

export async function renameCustomClip(
  role: CustomizableRole,
  id: string,
  label: string,
): Promise<void> {
  const state = await loadCustomSounds();
  const clips = state[role] ?? [];
  const next: CustomSoundsState = {
    ...state,
    [role]: clips.map((c) => (c.id === id ? { ...c, label: label.trim() || undefined } : c)),
  };
  await saveState(next);
}

export async function clearAllCustomSounds(): Promise<void> {
  const state = await loadCustomSounds();
  for (const role of CUSTOMIZABLE_ROLES) {
    const clips = state[role] ?? [];
    for (const c of clips) {
      try { new FSFile(c.uri).delete(); } catch {}
    }
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
}
