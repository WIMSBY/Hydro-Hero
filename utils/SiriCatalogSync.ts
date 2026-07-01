/**
 * SiriCatalogSync.ts
 *
 * Pushes the user's custom presets into the App Group so the Siri /
 * App Intents PresetEntityQuery can return them. Mirrors the
 * widget-sync pattern in WidgetDataSync.ts.
 *
 * - In Expo Go: native module missing → no-op.
 * - On Android:  always no-op (App Intents are iOS-only).
 * - In a real EAS build: calls LLSiriQueue.writeCatalog which writes the
 *   array to UserDefaults(suiteName: "group.com.wimsby.hydrationstation")
 *   under key "siri_catalog".
 *
 * Never throws — sync failures must never block app foreground or break
 * preset edits.
 */

import { NativeModules, Platform } from 'react-native';
import type { BevCategory } from '../constants/beverages';

interface PresetIn {
  id: string;
  label: string;
  oz: number;
  category: BevCategory;
}

interface PresetCatalogEntry {
  id: string;
  label: string;
  oz: number;
  beverage: string;
}

const { LLSiriQueue } = NativeModules as {
  LLSiriQueue?: {
    writeCatalog(presets: PresetCatalogEntry[]): Promise<boolean>;
  };
};

export async function syncSiriCatalog(presets: PresetIn[]): Promise<void> {
  if (Platform.OS !== 'ios') {
    console.log("[Siri catalog] non-iOS, skipping");
    return;
  }
  if (!LLSiriQueue?.writeCatalog) {
    console.log("[Siri catalog] LLSiriQueue.writeCatalog missing on NativeModules");
    return;
  }
  try {
    const payload: PresetCatalogEntry[] = presets.map((p) => ({
      id:       p.id,
      label:    p.label,
      oz:       p.oz,
      beverage: p.category,
    }));
    console.log("[Siri catalog] writing", payload.length, "presets:", JSON.stringify(payload));
    const ok = await LLSiriQueue.writeCatalog(payload);
    console.log("[Siri catalog] write result:", ok);
  } catch (e) {
    console.log("[Siri catalog] error:", String(e));
  }
}
