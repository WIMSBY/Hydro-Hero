/**
 * HeroStore — load/save the user's Hero record.
 *
 * Day 3 of the Missions feature. Single AsyncStorage key + a sibling
 * "setup seen" flag so a cancelled onboarding doesn't auto-reopen mid-
 * session. Future ranks update is fire-and-forget; we never throw to the
 * caller because Hero failures must never crash the main app.
 *
 * Build 33 Family Mode: per-profile. Both keys ride profileStorage, which
 * namespaces them under the active profile ID and lazily migrates Build 32
 * un-prefixed values on first read.
 */

import { Hero } from "../constants/hero";
import { pGetItem, pSetItem } from "./profileStorage";

const HERO_KEY        = "hero_v1";
const SETUP_SEEN_KEY  = "hero_setup_seen_v1";

export async function loadHero(): Promise<Hero | null> {
  try {
    const raw = await pGetItem(HERO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.name === "string") {
      return parsed as Hero;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveHero(hero: Hero): Promise<void> {
  try {
    await pSetItem(HERO_KEY, JSON.stringify(hero));
  } catch {}
}

export async function markSetupSeen(): Promise<void> {
  try {
    await pSetItem(SETUP_SEEN_KEY, "1");
  } catch {}
}

export async function wasSetupSeen(): Promise<boolean> {
  try {
    return (await pGetItem(SETUP_SEEN_KEY)) === "1";
  } catch {
    return false;
  }
}
