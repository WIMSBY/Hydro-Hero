/**
 * WidgetDataSync.ts
 *
 * Safe utility for pushing hydration data into the shared App Group container
 * so the home-screen widget stays current.
 *
 * - In Expo Go: the native module does not exist → silently no-ops.
 * - On Android:  always no-ops (widgets are iOS only).
 * - In a real EAS build: calls LLWidgetSync.updateData which writes to
 *   UserDefaults(suiteName: "group.com.wimsby.liquidluck") and calls
 *   WidgetCenter.shared.reloadAllTimelines() for an immediate refresh.
 *
 * Never throws — widget update failures must never affect the main app.
 */

import { NativeModules, Platform } from 'react-native';

const { LLWidgetSync } = NativeModules as {
  LLWidgetSync?: {
    updateData(hydrationOz: number, goalOz: number, pct: number): Promise<void>;
  };
};

export async function syncWidgetData(
  hydrationOz: number,
  goalOz: number,
): Promise<void> {
  if (Platform.OS !== 'ios' || !LLWidgetSync) return;
  try {
    const pct = goalOz > 0 ? hydrationOz / goalOz : 0;
    await LLWidgetSync.updateData(hydrationOz, goalOz, pct);
  } catch {
    // Widget sync failures must never crash the main app
  }
}
