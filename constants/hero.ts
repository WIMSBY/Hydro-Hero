/**
 * Hero — the user's customizable Missions avatar.
 *
 * Day 3 of the Missions feature. Schema mirrors the spec's section 1.
 * Build 34 ships emoji emblems / placeholder cape + mask values; real
 * SVG-layered art (chest + cape + mask + emblem) lands Day 5 alongside
 * mission rewards that unlock new pieces.
 */

export const HERO_RANKS = ["Rookie", "Sidekick", "Solo", "League", "Legend"] as const;
export type HeroRank = (typeof HERO_RANKS)[number];

export type Hero = {
  name: string;
  emblemId: string;
  capeColorId: string;
  maskId: string;
  rank: HeroRank;
};

// ─── Starter palettes ────────────────────────────────────────────────────────

export type EmblemDef = { id: string; emoji: string; label: string };

export const STARTER_EMBLEMS: EmblemDef[] = [
  { id: "emblem-droplet",    emoji: "💧", label: "Droplet" },
  { id: "emblem-wave",       emoji: "🌊", label: "Wave"    },
  { id: "emblem-shield",     emoji: "🛡️", label: "Shield"  },
  { id: "emblem-bolt",       emoji: "⚡", label: "Bolt"    },
  { id: "emblem-star",       emoji: "⭐", label: "Star"    },
];

// Default cape / mask — Day 3 doesn't expose pickers for these; missions
// rewards unlock new options Day 5. Stored under a stable id so future
// upgrades replace without migration.
export const DEFAULT_CAPE_ID = "cape-classic";
export const DEFAULT_MASK_ID = "mask-classic";
export const DEFAULT_HERO_NAME = "Hydro Hero";

export function getEmblem(id: string): EmblemDef {
  return STARTER_EMBLEMS.find((e) => e.id === id) ?? STARTER_EMBLEMS[0];
}

export function freshHero(name: string, emblemId: string): Hero {
  return {
    name: name.trim() || DEFAULT_HERO_NAME,
    emblemId,
    capeColorId: DEFAULT_CAPE_ID,
    maskId: DEFAULT_MASK_ID,
    rank: "Rookie",
  };
}
