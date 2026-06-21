/**
 * SoundManager — synthesized placeholder sounds for Hydro Hero.
 *
 * All sounds are generated programmatically as WAV data URIs.
 * Every play function is try/catch-guarded — never crashes the app.
 *
 * Sound routing flows through the active SoundPack (see utils/SoundPacks.ts).
 * Calling setActivePack() rebuilds the sound pool for the new pack.
 *
 * ┌─ TO REPLACE WITH REAL FILES ──────────────────────────────────────────────┐
 * │ See SoundPacks.ts — each pack's tones map has a comment showing the        │
 * │ real file path to drop in per sound role.                                  │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

import { Audio } from "expo-av";
import { ALL_SOUND_PACKS, DEFAULT_PACK_ID, NoteSpec, RoleSound, SoundPack, getPackById } from "./SoundPacks";
import { CustomizableRole, CustomSoundClip, CustomSoundsState, loadCustomSounds } from "./CustomSounds";

function isNoteSpecArray(s: RoleSound): s is NoteSpec[] {
  return Array.isArray(s);
}

function toSource(sound: RoleSound): { uri: string } | number {
  return isNoteSpecArray(sound) ? { uri: generateWav(sound) } : sound.asset;
}

// ─── Module state ──────────────────────────────────────────────────────────────

let _enabled = true;
let _initialized = false;
let _activePack: SoundPack = getPackById(DEFAULT_PACK_ID);
let _previewSound: Audio.Sound | null = null;

// Pool keyed by role name — rebuilt on pack change
const _pool: Partial<Record<string, Audio.Sound>> = {};

// Custom user recordings, keyed by role then clip id. Pre-loaded so playback
// is instant. Shuffle queues hold the random play order; reshuffled on
// exhaustion or whenever the clip list changes.
const _customPool: Partial<Record<CustomizableRole, Record<string, Audio.Sound>>> = {};
const _shuffleQueues: Partial<Record<CustomizableRole, { order: string[]; cursor: number }>> = {};

// ─── WAV synthesis ─────────────────────────────────────────────────────────────

const SAMPLE_RATE = 8000;

function generateWav(notes: NoteSpec[]): string {
  const allSamples: number[] = [];

  for (const note of notes) {
    const numSamples = Math.max(1, Math.floor(SAMPLE_RATE * note.durationMs / 1000));
    const amp = Math.min(127, note.amplitude ?? 100);
    const freqEnd = note.freqEnd ?? note.freq;
    const fadeSamples = Math.min(Math.floor(SAMPLE_RATE * 0.012), Math.floor(numSamples / 3));

    for (let i = 0; i < numSamples; i++) {
      const t = i / SAMPLE_RATE;
      const progress = numSamples > 1 ? i / (numSamples - 1) : 0;
      const freq = note.freq + (freqEnd - note.freq) * progress;

      let env = 1.0;
      if (i < fadeSamples) env = i / fadeSamples;
      else if (i > numSamples - fadeSamples) env = (numSamples - i) / fadeSamples;

      const raw = 128 + amp * env * Math.sin(2 * Math.PI * freq * t);
      allSamples.push(Math.round(Math.max(0, Math.min(255, raw))));
    }

    if (note.silenceMs && note.silenceMs > 0) {
      const silSamples = Math.floor(SAMPLE_RATE * note.silenceMs / 1000);
      for (let i = 0; i < silSamples; i++) allSamples.push(128);
    }
  }

  const dataSize = allSamples.length;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  const tag = (s: string, off: number) => {
    for (let i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i);
  };
  tag("RIFF", 0); view.setUint32(4, 36 + dataSize, true);
  tag("WAVE", 8); tag("fmt ", 12);
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE, true); view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);  tag("data", 36);
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < allSamples.length; i++) bytes[44 + i] = allSamples[i];

  let binary = "";
  const CHUNK = 2048;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.slice(i, Math.min(i + CHUNK, bytes.length))));
  }
  return "data:audio/wav;base64," + btoa(binary);
}

// Volume map per role (0.0–1.0)
const VOLUMES: Record<string, number> = {
  buttonTap:   0.20,
  droplet:     0.45,
  waterLog:    0.60,
  jackpot:     0.80,
  badgeUnlock: 0.75,
  morning:     0.50,
  // legacy keys kept for backward compat
  streak:      0.65,
};

// ─── Private helpers ──────────────────────────────────────────────────────────

async function loadRole(role: string, roleSound: RoleSound, volume: number): Promise<void> {
  try {
    const { sound } = await Audio.Sound.createAsync(
      toSource(roleSound),
      { volume, shouldPlay: false, isLooping: false }
    );
    _pool[role] = sound;
  } catch {
    // Silent — playKey checks for null
  }
}

async function unloadAll(): Promise<void> {
  try {
    for (const snd of Object.values(_pool)) {
      if (snd) await snd.unloadAsync().catch(() => {});
    }
    Object.keys(_pool).forEach((k) => { delete _pool[k]; });
  } catch {}
}

function pickNextCustomClipId(role: CustomizableRole): string | null {
  const pool = _customPool[role];
  if (!pool) return null;
  const ids = Object.keys(pool);
  if (ids.length === 0) return null;
  let q = _shuffleQueues[role];
  if (!q || q.cursor >= q.order.length) {
    // Fisher–Yates shuffle, then reset cursor
    const order = [...ids];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    q = { order, cursor: 0 };
    _shuffleQueues[role] = q;
  }
  return q.order[q.cursor++];
}

async function playKey(role: string): Promise<void> {
  if (!_enabled) return;
  try {
    // Custom user recordings override the active pack for their role.
    if (role === 'waterLog' || role === 'jackpot') {
      const customId = pickNextCustomClipId(role);
      if (customId) {
        const customSnd = _customPool[role]?.[customId];
        if (customSnd) {
          await customSnd.setPositionAsync(0);
          await customSnd.playAsync();
          return;
        }
      }
    }
    const snd = _pool[role];
    if (!snd) return;
    await snd.setPositionAsync(0);
    await snd.playAsync();
  } catch {}
}

// Build pool from the active pack
async function buildPool(pack: SoundPack): Promise<void> {
  await unloadAll();
  const roles = Object.keys(pack.tones) as (keyof typeof pack.tones)[];
  await Promise.all(roles.map((role) =>
    loadRole(role, pack.tones[role], VOLUMES[role] ?? 0.6)
  ));
}

async function unloadCustomRole(role: CustomizableRole): Promise<void> {
  const pool = _customPool[role];
  if (!pool) return;
  for (const snd of Object.values(pool)) {
    try { await snd.unloadAsync(); } catch {}
  }
  delete _customPool[role];
  delete _shuffleQueues[role];
}

async function unloadAllCustom(): Promise<void> {
  await Promise.all(
    (Object.keys(_customPool) as CustomizableRole[]).map(unloadCustomRole)
  );
}

/**
 * Load every clip in `state` into the custom pool, replacing whatever was
 * loaded before. Call this from the UI after add/delete/rename or on init.
 */
export async function refreshCustomSounds(state?: CustomSoundsState): Promise<void> {
  const cs = state ?? (await loadCustomSounds());
  await unloadAllCustom();
  for (const role of ['waterLog', 'jackpot'] as CustomizableRole[]) {
    const clips: CustomSoundClip[] = cs[role] ?? [];
    if (clips.length === 0) continue;
    const volume = VOLUMES[role] ?? 0.6;
    const entries: [string, Audio.Sound][] = [];
    await Promise.all(clips.map(async (clip) => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: clip.uri },
          { volume, shouldPlay: false, isLooping: false },
        );
        entries.push([clip.id, sound]);
      } catch {
        // Skip clips that fail to load — file may be corrupt or removed.
      }
    }));
    if (entries.length > 0) {
      _customPool[role] = Object.fromEntries(entries);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Load all sounds for the default (or previously set) pack. */
export async function initSounds(): Promise<void> {
  if (_initialized) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
    });
    await buildPool(_activePack);
    await refreshCustomSounds().catch(() => {});
    _initialized = true;
  } catch {}
}

/** Unload all sounds and release native resources. */
export async function teardownSounds(): Promise<void> {
  _initialized = false;
  try {
    await unloadAll();
    await unloadAllCustom();
    if (_previewSound) {
      await _previewSound.unloadAsync().catch(() => {});
      _previewSound = null;
    }
  } catch {}
}

/** Reload sounds (call after returning from background). */
export async function reloadSounds(): Promise<void> {
  await initSounds();
}

/** Toggle sound effects on/off immediately. */
export function setSoundEnabled(enabled: boolean): void {
  _enabled = enabled;
  if (!enabled) {
    for (const snd of Object.values(_pool)) {
      snd?.stopAsync().catch(() => {});
    }
    for (const role of Object.keys(_customPool) as CustomizableRole[]) {
      const pool = _customPool[role];
      if (!pool) continue;
      for (const snd of Object.values(pool)) {
        snd?.stopAsync().catch(() => {});
      }
    }
  }
}

/**
 * Switch to a different sound pack.
 * Rebuilds the sound pool immediately — safe to call any time.
 */
export async function setActivePack(packId: string): Promise<void> {
  const pack = getPackById(packId);
  _activePack = pack;
  _initialized = false;
  await buildPool(pack);
  _initialized = true;
}

/** Returns the id of the currently active pack. */
export function getActivePackId(): string {
  return _activePack.id;
}

/**
 * Play a 2-second preview of a pack's signature sound.
 * Stops any currently playing preview first.
 */
export async function previewPack(packId: string): Promise<void> {
  try {
    // Stop previous preview
    if (_previewSound) {
      await _previewSound.stopAsync().catch(() => {});
      await _previewSound.unloadAsync().catch(() => {});
      _previewSound = null;
    }
    const pack = getPackById(packId);
    const { sound } = await Audio.Sound.createAsync(
      toSource(pack.preview),
      { volume: 0.7, shouldPlay: true, isLooping: false }
    );
    _previewSound = sound;
    // Auto-cleanup after 3 seconds
    setTimeout(async () => {
      try {
        if (_previewSound === sound) {
          await sound.stopAsync().catch(() => {});
          await sound.unloadAsync().catch(() => {});
          _previewSound = null;
        }
      } catch {}
    }, 3000);
  } catch {}
}

/** Stop any currently playing preview. */
export async function stopPreview(): Promise<void> {
  try {
    if (_previewSound) {
      await _previewSound.stopAsync().catch(() => {});
      await _previewSound.unloadAsync().catch(() => {});
      _previewSound = null;
    }
  } catch {}
}

// ── Individual play functions ─────────────────────────────────────────────────

export function playButtonTapSound(): void {
  playKey("buttonTap").catch(() => {});
}

export function playDropletSound(): void {
  playKey("droplet").catch(() => {});
}

export function playWaterLogSound(): void {
  playKey("waterLog").catch(() => {});
}

export function playJackpotSound(): void {
  playKey("jackpot").catch(() => {});
}

export function playBadgeUnlockSound(): void {
  playKey("badgeUnlock").catch(() => {});
}

export function playStreakSound(): void {
  // Streak maps to badgeUnlock in the pack system
  playKey("badgeUnlock").catch(() => {});
}

export function playMorningResetSound(): void {
  playKey("morning").catch(() => {});
}

// ── Expose pack list for UI ───────────────────────────────────────────────────

export { ALL_SOUND_PACKS, DEFAULT_PACK_ID, getPackById } from "./SoundPacks";
