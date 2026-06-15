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

/**
 * The seven logical sound roles that SoundManager maps to.
 * Each pack provides a NoteSpec array for every role.
 */
export type SoundRole =
  | 'buttonTap'   // every UI button press
  | 'waterLog'    // drink successfully logged
  | 'spin'        // dispenser dial loop tick
  | 'reelStop'    // single dial stopping (played 3× with index offset)
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
  /** Tones for each sound role — swap for real files later */
  tones: Record<SoundRole, NoteSpec[]>;
  /** Preview tone played when user taps ▶ on the card */
  preview: NoteSpec[];
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

    // Rising-then-settling pour
    waterLog: [
      { freq: 600, freqEnd: 950, durationMs: 180, amplitude: 80 },
      { freq: 950, freqEnd: 700, durationMs: 200, amplitude: 72, silenceMs: 10 },
    ],

    // Short tick for spin loop
    spin: [{ freq: 340, durationMs: 38, amplitude: 65 }],

    // Mechanical thud — caller adds reelIndex * 50 Hz offset
    reelStop: [{ freq: 380, durationMs: 110, amplitude: 88 }],

    // Ascending 5-note fanfare
    jackpot: [
      { freq: 523, durationMs: 130, amplitude: 88, silenceMs: 25 },
      { freq: 659, durationMs: 130, amplitude: 90, silenceMs: 25 },
      { freq: 784, durationMs: 130, amplitude: 92, silenceMs: 25 },
      { freq: 1047, durationMs: 130, amplitude: 95, silenceMs: 25 },
      { freq: 1047, durationMs: 600, amplitude: 98 },
    ],

    // Rising bell arpeggio
    badgeUnlock: [
      { freq: 880,  durationMs: 160, amplitude: 86, silenceMs: 35 },
      { freq: 1047, durationMs: 160, amplitude: 88, silenceMs: 35 },
      { freq: 1319, durationMs: 160, amplitude: 91, silenceMs: 35 },
      { freq: 1568, durationMs: 440, amplitude: 94 },
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
    // Soft bubble pop
    // Real file: assets/sounds/flowing/bubble_pop.mp3
    buttonTap: [{ freq: 900, freqEnd: 1200, durationMs: 18, amplitude: 60 }],

    // Splash — quick rising plunk into water
    // Real file: assets/sounds/flowing/splash.mp3
    waterLog: [
      { freq: 380, freqEnd: 720, durationMs: 130, amplitude: 85 },
      { freq: 720, freqEnd: 420, durationMs: 200, amplitude: 70, silenceMs: 15 },
    ],

    // Continuous burble for spinning dials
    // Real file: assets/sounds/flowing/burble_tick.mp3
    spin: [{ freq: 440, freqEnd: 520, durationMs: 32, amplitude: 65 }],

    // Faucet thunk — fast water-pressure stop
    // Real file: assets/sounds/flowing/faucet_stop.mp3
    reelStop: [
      { freq: 280, freqEnd: 180, durationMs: 90, amplitude: 88 },
      { freq: 180, durationMs: 50, amplitude: 70 },
    ],

    // Fountain spray crescendo — rising whoosh into shimmer
    // Real file: assets/sounds/flowing/fountain_spray.mp3
    jackpot: [
      { freq: 440, freqEnd: 660,  durationMs: 140, amplitude: 85, silenceMs: 20 },
      { freq: 660, freqEnd: 880,  durationMs: 140, amplitude: 90, silenceMs: 20 },
      { freq: 880, freqEnd: 1175, durationMs: 140, amplitude: 92, silenceMs: 20 },
      { freq: 1175, durationMs: 100, amplitude: 94, silenceMs: 15 },
      { freq: 1568, durationMs: 100, amplitude: 95, silenceMs: 15 },
      { freq: 1760, durationMs: 700, amplitude: 98 },
    ],

    // Water-glass chime — clear ringing tone
    // Real file: assets/sounds/flowing/glass_chime.mp3
    badgeUnlock: [
      { freq: 880,  durationMs: 140, amplitude: 85, silenceMs: 35 },
      { freq: 1175, durationMs: 140, amplitude: 88, silenceMs: 35 },
      { freq: 1568, durationMs: 140, amplitude: 91, silenceMs: 35 },
      { freq: 1976, durationMs: 480, amplitude: 95 },
    ],

    // Morning fountain-on — soft swelling burble
    // Real file: assets/sounds/flowing/fountain_on.mp3
    morning: [
      { freq: 520,  durationMs: 90, amplitude: 72, silenceMs: 45 },
      { freq: 780,  durationMs: 220, amplitude: 78 },
    ],
  },
  preview: [
    { freq: 440, freqEnd: 660,  durationMs: 110, amplitude: 85, silenceMs: 20 },
    { freq: 660, freqEnd: 880,  durationMs: 110, amplitude: 88, silenceMs: 20 },
    { freq: 880, freqEnd: 1175, durationMs: 110, amplitude: 92, silenceMs: 20 },
    { freq: 1568, durationMs: 500, amplitude: 96 },
  ],
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
    // Soft leaf-rustle tap
    // Real file: assets/sounds/nature/leaf_tap.mp3
    buttonTap: [{ freq: 320, durationMs: 28, amplitude: 42 }],

    // Slow rain-drop splash
    // Real file: assets/sounds/nature/rain_drop.mp3
    waterLog: [
      { freq: 280, freqEnd: 160, durationMs: 280, amplitude: 65 },
      { freq: 160, freqEnd: 80,  durationMs: 250, amplitude: 50, silenceMs: 15 },
    ],

    // Very gentle babble tick for spin
    // Real file: assets/sounds/nature/stream_tick.mp3
    spin: [{ freq: 220, durationMs: 45, amplitude: 48 }],

    // Ocean wave wash — slow descend
    // Real file: assets/sounds/nature/wave_stop.mp3
    reelStop: [
      { freq: 180, freqEnd: 100, durationMs: 200, amplitude: 72 },
    ],

    // Bird song followed by wind chime
    // Real file: assets/sounds/nature/bird_chime.mp3
    jackpot: [
      { freq: 880,  durationMs: 120, amplitude: 75, silenceMs: 60 },
      { freq: 1108, durationMs: 120, amplitude: 78, silenceMs: 60 },
      { freq: 1319, durationMs: 120, amplitude: 80, silenceMs: 60 },
      { freq: 880,  durationMs: 120, amplitude: 77, silenceMs: 40 },
      { freq: 1047, durationMs: 600, amplitude: 82 },
    ],

    // Gentle rising wind chime
    // Real file: assets/sounds/nature/wind_chime.mp3
    badgeUnlock: [
      { freq: 440,  durationMs: 200, amplitude: 68, silenceMs: 50 },
      { freq: 554,  durationMs: 200, amplitude: 71, silenceMs: 50 },
      { freq: 659,  durationMs: 200, amplitude: 74, silenceMs: 50 },
      { freq: 880,  durationMs: 500, amplitude: 78 },
    ],

    // Dawn bird call
    // Real file: assets/sounds/nature/dawn_bird.mp3
    morning: [
      { freq: 660, freqEnd: 880, durationMs: 160, amplitude: 62, silenceMs: 80 },
      { freq: 880, freqEnd: 660, durationMs: 250, amplitude: 58 },
    ],
  },
  preview: [
    { freq: 280, freqEnd: 160, durationMs: 320, amplitude: 65 },
    { freq: 160, freqEnd: 80,  durationMs: 280, amplitude: 50, silenceMs: 20 },
    { freq: 440, durationMs: 400, amplitude: 55 },
  ],
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

    // Power-up charge with rising sweep
    // Real file: assets/sounds/scifi/power_up.mp3
    waterLog: [
      { freq: 200, freqEnd: 1200, durationMs: 300, amplitude: 85 },
      { freq: 1200, durationMs: 100, amplitude: 70, silenceMs: 10 },
    ],

    // Computer beep tick for spin
    // Real file: assets/sounds/scifi/computer_tick.mp3
    spin: [{ freq: 1600, durationMs: 22, amplitude: 60 }],

    // Warp deceleration — fast descend
    // Real file: assets/sounds/scifi/warp_stop.mp3
    reelStop: [
      { freq: 1400, freqEnd: 300, durationMs: 120, amplitude: 88 },
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
