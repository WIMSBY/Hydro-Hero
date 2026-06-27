/**
 * HeroStore — load/save the user's Hero record.
 *
 * Day 3 of the Missions feature. Single AsyncStorage key + a sibling
 * "setup seen" flag so a cancelled onboarding doesn't auto-reopen mid-
 * session. Future ranks update is fire-and-forget; we never throw to the
 * caller because Hero failures must never crash the main app.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Hero } from "../constants/hero";

const HERO_KEY        = "hero_v1";
const SETUP_SEEN_KEY  = "hero_setup_seen_v1";

export async function loadHero(): Promise<Hero | null> {
  try {
    const raw = await AsyncStorage.getItem(HERO_KEY);
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
    await AsyncStorage.setItem(HERO_KEY, JSON.stringify(hero));
  } catch {}
}

export async function markSetupSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SETUP_SEEN_KEY, "1");
  } catch {}
}

export async function wasSetupSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SETUP_SEEN_KEY)) === "1";
  } catch {
    return false;
  }
}
