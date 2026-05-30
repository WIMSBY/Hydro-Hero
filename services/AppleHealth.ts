/**
 * Apple Health (HealthKit) integration for Hydro Hero.
 *
 * Backed by @kingstinct/react-native-healthkit (Nitro Modules, new-arch compatible).
 * All calls are safe no-ops on Android, on simulators without HealthKit,
 * and in any environment where the native module fails to load.
 * Every function swallows errors — the app must never crash because of Health.
 */

import { Platform } from "react-native";

const WATER_TYPE = "HKQuantityTypeIdentifierDietaryWater" as const;

// Lazy conditional import — avoids crashes on Android and in Expo Go
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HK: any = null;
if (Platform.OS === "ios") {
  try {
    HK = require("@kingstinct/react-native-healthkit");
  } catch {
    // Native module not linked — all ops become no-ops
  }
}

function moduleReady(): boolean {
  return Platform.OS === "ios" && HK !== null && typeof HK.isHealthDataAvailable === "function";
}

/** True only when HealthKit is reachable on this device */
export const isHealthAvailable: boolean = (() => {
  if (!moduleReady()) return false;
  try {
    return Boolean(HK.isHealthDataAvailable());
  } catch {
    return false;
  }
})();

/**
 * Initialise HealthKit and request read+write permission for Water.
 * Returns true if the authorization request succeeded (which does NOT
 * mean the user granted — iOS deliberately doesn't expose that).
 */
export async function initHealthKit(): Promise<boolean> {
  if (!isHealthAvailable) return false;
  try {
    return await HK.requestAuthorization({
      toShare: [WATER_TYPE],
      toRead: [WATER_TYPE],
    });
  } catch {
    return false;
  }
}

/**
 * Save a water intake sample to Apple Health.
 * @param oz  Raw consumed ounces (not hydration-adjusted)
 * @returns   ISO timestamp of the sample on success, null on failure
 */
export async function saveWaterSample(oz: number): Promise<string | null> {
  if (!isHealthAvailable) return null;
  const now = new Date();
  try {
    const saved = await HK.saveQuantitySample(WATER_TYPE, "fl_oz_us", oz, now, now);
    return saved ? now.toISOString() : null;
  } catch {
    return null;
  }
}

/**
 * Delete water samples saved at approximately the given timestamp (±2 s window).
 * Used to support the Undo Last Entry feature.
 */
export async function deleteWaterSample(timestamp: string): Promise<void> {
  if (!isHealthAvailable || !timestamp) return;
  try {
    const t = new Date(timestamp).getTime();
    await HK.deleteObjects(WATER_TYPE, {
      date: {
        startDate: new Date(t - 2000),
        endDate: new Date(t + 2000),
      },
    });
  } catch {
    // Silent — undo should never crash the app
  }
}
