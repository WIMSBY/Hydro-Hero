/**
 * LiveActivitySync.ts
 *
 * Safe wrapper around the LLLiveActivity native module (see
 * plugins/withLiveActivity.js). The native side exposes start/update/end for
 * the tank-droplet Live Activity that mirrors today's hydration on the Lock
 * Screen + Dynamic Island.
 *
 * - In Expo Go: native module absent → all calls no-op (return null/false).
 * - On Android: always no-op (Live Activities are iOS only).
 * - On iOS < 16.2: native module rejects with UNSUPPORTED → swallowed here.
 * - User has Live Activities disabled in Settings: native rejects DISABLED.
 *
 * Never throws — Live Activity failures must never affect the main app.
 */

import { NativeModules, Platform } from 'react-native';

const { LLLiveActivity } = NativeModules as {
  LLLiveActivity?: {
    startActivity(hydrationOz: number, goalOz: number): Promise<string>;
    updateActivity(hydrationOz: number, goalOz: number): Promise<boolean>;
    endActivity(): Promise<boolean>;
  };
};

export function liveActivityAvailable(): boolean {
  return Platform.OS === 'ios' && !!LLLiveActivity;
}

export async function startTankActivity(
  hydrationOz: number,
  goalOz: number,
): Promise<string | null> {
  if (!liveActivityAvailable()) return null;
  try {
    return await LLLiveActivity!.startActivity(hydrationOz, goalOz);
  } catch {
    return null;
  }
}

export async function updateTankActivity(
  hydrationOz: number,
  goalOz: number,
): Promise<boolean> {
  if (!liveActivityAvailable()) return false;
  try {
    return await LLLiveActivity!.updateActivity(hydrationOz, goalOz);
  } catch {
    return false;
  }
}

export async function endTankActivity(): Promise<boolean> {
  if (!liveActivityAvailable()) return false;
  try {
    return await LLLiveActivity!.endActivity();
  } catch {
    return false;
  }
}
