/**
 * Apple Health (HealthKit) integration for Liquid Luck.
 *
 * All calls are safe no-ops on Android, iPad sim without HealthKit,
 * and any environment where react-native-health is not installed.
 * Every function swallows errors — the app must never crash because of Health.
 */

import { Platform } from "react-native";

// Lazy conditional import — avoids crashes on Android and in Expo Go
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HK: any = null;
if (Platform.OS === "ios") {
  try {
    HK = require("react-native-health").default;
  } catch {
    // react-native-health not installed or not linked — all ops become no-ops
  }
}

/** True only when HealthKit is reachable on this device */
export const isHealthAvailable: boolean = Platform.OS === "ios" && HK !== null;

/**
 * Initialise HealthKit and request read+write permission for Water.
 * Returns true if permission was granted, false otherwise.
 */
export async function initHealthKit(): Promise<boolean> {
  if (!isHealthAvailable) return false;
  return new Promise((resolve) => {
    try {
      const permissions = {
        permissions: {
          read: [HK.Constants.Permissions.Water],
          write: [HK.Constants.Permissions.Water],
        },
      };
      HK.initHealthKit(permissions, (error: string) => {
        resolve(!error);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Save a water intake sample to Apple Health.
 * @param oz  Raw consumed ounces (not hydration-adjusted)
 * @returns   ISO timestamp of the sample on success, null on failure
 */
export async function saveWaterSample(oz: number): Promise<string | null> {
  if (!isHealthAvailable) return null;
  // react-native-health expects liters for water samples
  const liters = oz * 0.0295735;
  const timestamp = new Date().toISOString();
  return new Promise((resolve) => {
    try {
      HK.saveWaterSamples(
        { value: liters, startDate: timestamp, endDate: timestamp },
        (error: string) => {
          if (error) {
            resolve(null);
          } else {
            resolve(timestamp);
          }
        }
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Delete water samples saved at approximately the given timestamp (±2 s window).
 * Used to support the Undo Last Entry feature.
 */
export async function deleteWaterSample(timestamp: string): Promise<void> {
  if (!isHealthAvailable || !timestamp) return;
  return new Promise((resolve) => {
    try {
      const t = new Date(timestamp).getTime();
      const startDate = new Date(t - 2000).toISOString();
      const endDate = new Date(t + 2000).toISOString();
      HK.deleteWaterSamples({ startDate, endDate }, () => resolve());
    } catch {
      resolve();
    }
  });
}
