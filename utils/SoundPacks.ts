/**
 * utils/SoundPacks.ts
 *
 * Defines the four available sound packs for Hydro Hero.
 * Each pack specifies tone parameters for every SoundRole.
 *
 * ┌─ TO REPLACE WITH REAL AUDIO FILES ────────────────────────────────────────┐
 * │ When real audio files are ready, replace the NoteSpec arrays in each       │
 * │ pack's `tones` map with { asset: require('../assets/sounds/xxx.mp3') }     │
 * │ entries. The SoundManager loader handles both formats automatically.        │
 * │                                                                             │
 * │ Suggested file locations per pack:                                          │
 * │   assets/sounds/classic/  → water_drop.mp3, pour.mp3, bubble.mp3, etc.     │
 * │   assets/sounds/flowing/  → fountain.mp3, splash.mp3, gush.mp3, etc.       │
 * │   assets/sounds/nature/   → wave.mp3, rain.mp3, stream.mp3, etc.           │
 * │   assets/sounds/scifi/    → laser.mp3, powerup.mp3, beep.mp3, etc.         │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NoteSpec {
  freq: number;
  freqEnd?: number;
  durationMs: number;
  silenceMs?: number;
  amplitude?: number;
}

/** Wraps a `require('../assets/sounds/foo.mp3')` so SoundManager can tell it from a NoteSpec array. */
export interface AssetSound {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  asset: any;
}

/** A role can be either a synthesized NoteSpec array or a real audio file. */
export type RoleSound = NoteSpec[] | AssetSound;

/**
 * The six logical sound roles that SoundManager maps to.
 * Each pack provides a RoleSound for every role.
 */
export type SoundRole =
  | 'buttonTap'   // every UI button press
  | 'droplet'     // droplet leaves the +Xoz circle to fly to the tank
  | 'waterLog'    // droplet lands in the tank and cues the fill
  | 'jackpot'     // goal hit fanfare
  | 'badgeUnlock' // achievement unlocked
  | 'morning';    // morning reset / new day chime

export interface SoundPack {
  id: string;
  name: string;
  emoji: string;
  description: string;
  isPro: boolean;
  /** Short label shown on cards */
  tagline: string;
  /** Sound for each role — NoteSpec[] for synth, { asset: require('...') } for a real file */
  tones: Record<SoundRole, RoleSound>;
  /** Preview played when user taps ▶ on the card */
  preview: RoleSound;
}

// ─── Pack 1 — Classic (FREE) ──────────────────────────────────────────────────
//
// Clean, minimal water-themed tones.
// Preview: gentle two-note water drop.
//
const classicPack: SoundPack = {
  id: 'classic',
  name: 'Classic',
  emoji: '💧',
  description: 'Clean and simple water sounds',
  tagline: 'The original Hydro Hero experience',
  isPro: false,
  tones: {
    // Soft UI click
    buttonTap: [{ freq: 1200, durationMs: 18, amplitude: 55 }],

    // Quick falling droplet — leaves the +X oz ring
    droplet: [{ freq: 1400, freqEnd: 600, durationMs: 80, amplitude: 60 }],

    // Rising-then-settling pour — droplet lands in the tank
    waterLog: [
      { freq: 600, freqEnd: 950, durationMs: 180, amplitude: 80 },
      { freq: 950, freqEnd: 700, durationMs: 200, amplitude: 72, silenceMs: 10 },
    ],

    // Goal-reached: rising water-splash whoosh into a bright held chime.
    // Replaces the previous C-major arpeggio (C-E-G-C) which was textbook
    // slot-machine fanfare. The frequency slide at the start reads as
    // "satisfying splash" not "discrete win notes."
    jackpot: [
      { freq: 220, freqEnd: 880,  durationMs: 320, amplitude: 75, silenceMs: 25 },
      { freq: 1047, durationMs: 120, amplitude: 92, silenceMs: 30 },
      { freq: 1568, durationMs: 700, amplitude: 96 },
    ],

    // Badge unlock: soft two-tone "tap-chime" notification.
    // Replaces the previous A-C-E-G arpeggio. Pitched bright but minimal —
    // clearly an unlock notification, not a celebratory fanfare.
    badgeUnlock: [
      { freq: 1175, durationMs: 90, amplitude: 80, silenceMs: 40 },
      { freq: 1568, durationMs: 420, amplitude: 92 },
    ],

    // Gentle two-tone drop
    morning: [
      { freq: 880, durationMs: 90,  amplitude: 72, silenceMs: 55 },
      { freq: 660, durationMs: 210, amplitude: 68 },
    ],
  },
  preview: [
    { freq: 880, durationMs: 90,  amplitude: 72, silenceMs: 55 },
    { freq: 660, durationMs: 350, amplitude: 68 },
  ],
};

// ─── Pack 2 — Flowing Water (PRO) ─────────────────────────────────────────────
//
// Rushing-water tones — fountain bursts, splash bubbles, gushing flow.
// Distinct from Nature (which leans birds/wind/rain) by focusing on
// continuous moving water: fountains, faucets, rapids.
// Real files to swap in: fountain spray, splash, bubble burst, gush,
// faucet drip, water bell.
//
const flowingPack: SoundPack = {
  id: 'flowing',
  name: 'Flowing Water',
  emoji: '💦',
  description: 'Fountains, splashes, and rushing flow',
  tagline: 'Hydrate to the sound of moving water',
  isPro: true,
  tones: {
    buttonTap:   { asset: require('../assets/sounds/flowing/button_tap.m4a') },
    droplet:     { asset: require('../assets/sounds/flowing/droplet.m4a') },
    waterLog:    { asset: require('../assets/sounds/flowing/water_log.m4a') },
    jackpot:     { asset: require('../assets/sounds/flowing/jackpot.m4a') },
    badgeUnlock: { asset: require('../assets/sounds/flowing/badge_unlock.m4a') },
    morning:     { asset: require('../assets/sounds/flowing/morning.m4a') },
  },
  preview: { asset: require('../assets/sounds/flowing/water_log.m4a') },
};

// ─── Pack 3 — Nature (PRO) ────────────────────────────────────────────────────
//
// Softer, lower-pitched tones with slow sweeps evoking natural water.
// Real files: ocean wave, rain drop, stream babble, bird chirp, thunder, wind chime.
//
const naturePack: SoundPack = {
  id: 'nature',
  name: 'Nature',
  emoji: '🌊',
  description: 'Calming nature sounds to keep you flowing',
  tagline: 'Peaceful ocean & forest vibes',
  isPro: true,
  tones: {
    buttonTap:   { asset: require('../assets/sounds/nature/button_tap.m4a') },
    droplet:     { asset: require('../assets/sounds/nature/droplet.m4a') },
    waterLog:    { asset: require('../assets/sounds/nature/water_log.m4a') },
    jackpot:     { asset: require('../assets/sounds/nature/jackpot.m4a') },
    badgeUnlock: { asset: require('../assets/sounds/nature/badge_unlock.m4a') },
    morning:     { asset: require('../assets/sounds/nature/morning.m4a') },
  },
  preview: { asset: require('../assets/sounds/nature/water_log.m4a') },
};

// ─── Pack 4 — Sci-Fi (PRO) ───────────────────────────────────────────────────
//
// Electronic warbling tones with pitch shifts evoking futuristic technology.
// Real files: laser beam, power up, computer beep, warp, energy charge, teleport.
//
const scifiPack: SoundPack = {
  id: 'scifi',
  name: 'Sci-Fi',
  emoji: '🚀',
  description: 'Hydrate like you\'re from the future',
  tagline: 'Lasers, warp drives & power-ups',
  isPro: true,
  tones: {
    // Quick laser click
    // Real file: assets/sounds/scifi/laser_click.mp3
    buttonTap: [
      { freq: 2400, freqEnd: 1600, durationMs: 22, amplitude: 65 },
    ],

    // Energy bolt — droplet leaves the +X oz ring
    droplet: [
      { freq: 1800, freqEnd: 900, durationMs: 80, amplitude: 70 },
    ],

    // Power-up charge with rising sweep
    // Real file: assets/sounds/scifi/power_up.mp3
    waterLog: [
      { freq: 200, freqEnd: 1200, durationMs: 300, amplitude: 85 },
      { freq: 1200, durationMs: 100, amplitude: 70, silenceMs: 10 },
    ],

    // Energy charge building to teleport burst
    // Real file: assets/sounds/scifi/energy_charge.mp3
    jackpot: [
      { freq: 300,  freqEnd: 800,  durationMs: 180, amplitude: 80, silenceMs: 15 },
      { freq: 800,  freqEnd: 1400, durationMs: 180, amplitude: 88, silenceMs: 15 },
      { freq: 1400, freqEnd: 2200, durationMs: 180, amplitude: 94, silenceMs: 15 },
      { freq: 2200, durationMs: 500, amplitude: 100 },
    ],

    // Teleport sound — two-sweep power discharge
    // Real file: assets/sounds/scifi/teleport.mp3
    badgeUnlock: [
      { freq: 400,  freqEnd: 1600, durationMs: 200, amplitude: 85, silenceMs: 30 },
      { freq: 1600, freqEnd: 400,  durationMs: 200, amplitude: 82, silenceMs: 30 },
      { freq: 400,  freqEnd: 2400, durationMs: 400, amplitude: 92 },
    ],

    // Computer system startup beeps
    // Real file: assets/sounds/scifi/startup_beep.mp3
    morning: [
      { freq: 880,  durationMs: 60, amplitude: 70, silenceMs: 40 },
      { freq: 1320, durationMs: 60, amplitude: 73, silenceMs: 40 },
      { freq: 1760, durationMs: 160, amplitude: 76 },
    ],
  },
  preview: [
    { freq: 300,  freqEnd: 800,  durationMs: 160, amplitude: 78, silenceMs: 15 },
    { freq: 800,  freqEnd: 1600, durationMs: 160, amplitude: 85, silenceMs: 15 },
    { freq: 1600, freqEnd: 2400, durationMs: 400, amplitude: 92 },
  ],
};

// ─── Exported registry ────────────────────────────────────────────────────────

export const ALL_SOUND_PACKS: SoundPack[] = [
  classicPack,
  flowingPack,
  naturePack,
  scifiPack,
];

export const DEFAULT_PACK_ID = 'classic';

export function getPackById(id: string): SoundPack {
  // Legacy id from earlier builds; testers who selected it keep their PRO pack.
  const resolved = id === 'casino' ? 'flowing' : id;
  return ALL_SOUND_PACKS.find((p) => p.id === resolved) ?? classicPack;
}
