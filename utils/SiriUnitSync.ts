/**
 * SiriUnitSync.ts
 *
 * Mirrors the user's preferred display unit ("oz" / "ml") into the shared
 * App Group so the Siri / App Intents BeverageIntents extension can adapt
 * its requestValueDialog ("How many ounces?" vs "How many milliliters?").
 *
 * - Expo Go / Android: silently no-ops.
 * - Never throws — a failed mirror only affects the spoken prompt unit,
 *   not the log itself.
 */

import { NativeModules, Platform } from 'react-native';

const { LLSiriQueue } = NativeModules as {
  LLSiriQueue?: {
    setUnit(unit: 'oz' | 'ml'): Promise<boolean>;
  };
};

export async function syncSiriUnit(unit: 'oz' | 'ml'): Promise<void> {
  if (Platform.OS !== 'ios' || !LLSiriQueue?.setUnit) return;
  try {
    await LLSiriQueue.setUnit(unit);
  } catch {
    // ignore — Siri will fall back to the static default unit string
  }
}
