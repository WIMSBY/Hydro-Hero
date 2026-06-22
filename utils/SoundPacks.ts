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
 * The seven logical sound roles that SoundManager maps to.
 * Each pack provides a RoleSound for every role.
 */
export type SoundRole =
  | 'buttonTap'    // every UI button press
  | 'droplet'      // droplet leaves the +Xoz circle to fly to the tank
  | 'waterLog'     // droplet lands in the tank and cues the fill
  | 'jackpot'      // goal hit fanfare
  | 'badgeUnlock'  // achievement unlocked
  | 'reveal'       // mid-screen +Xoz reveal at the start of a drink log
  | 'morningReset'; // first-tap-of-the-day / new-day chime

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

    // Drink-log reveal: gentle falling two-tone drop. Plays at the moment
    // the +X oz number lands in the middle of the screen.
    reveal: [
      { freq: 880, durationMs: 90,  amplitude: 72, silenceMs: 55 },
      { freq: 660, durationMs: 210, amplitude: 68 },
    ],

    // Morning reset: distinct rising two-tone chime — fresh new-day feel,
    // intentionally different from the falling reveal cue so the once-a-day
    // moment sounds special.
    morningReset: [
      { freq: 523, durationMs: 110, amplitude: 72, silenceMs: 35 },
      { freq: 784, durationMs: 220, amplitude: 78 },
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
    buttonTap:    { asset: require('../assets/sounds/flowing/button_tap.m4a') },
    droplet:      { asset: require('../assets/sounds/flowing/droplet.m4a') },
    waterLog:     { asset: require('../assets/sounds/flowing/water_log.m4a') },
    jackpot:      { asset: require('../assets/sounds/flowing/jackpot.m4a') },
    badgeUnlock:  { asset: require('../assets/sounds/flowing/badge_unlock.m4a') },
    reveal:       { asset: require('../assets/sounds/flowing/reveal.m4a') },
    morningReset: { asset: require('../assets/sounds/flowing/morning_reset.m4a') },
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
    buttonTap:    { asset: require('../assets/sounds/nature/button_tap.m4a') },
    droplet:      { asset: require('../assets/sounds/nature/droplet.m4a') },
    waterLog:     { asset: require('../assets/sounds/nature/water_log.m4a') },
    jackpot:      { asset: require('../assets/sounds/nature/jackpot.m4a') },
    badgeUnlock:  { asset: require('../assets/sounds/nature/badge_unlock.m4a') },
    reveal:       { asset: require('../assets/sounds/nature/reveal.m4a') },
    morningReset: { asset: require('../assets/sounds/nature/morning_reset.m4a') },
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
    buttonTap:    { asset: require('../assets/sounds/scifi/button_tap.m4a') },
    droplet:      { asset: require('../assets/sounds/scifi/droplet.m4a') },
    waterLog:     { asset: require('../assets/sounds/scifi/water_log.m4a') },
    jackpot:      { asset: require('../assets/sounds/scifi/jackpot.m4a') },
    badgeUnlock:  { asset: require('../assets/sounds/scifi/badge_unlock.m4a') },
    reveal:       { asset: require('../assets/sounds/scifi/reveal.m4a') },
    morningReset: { asset: require('../assets/sounds/scifi/morning_reset.m4a') },
  },
  preview: { asset: require('../assets/sounds/scifi/water_log.m4a') },
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
