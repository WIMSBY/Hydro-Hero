/**
 * SiriQueue.ts
 *
 * Reads + clears the App Group queue that the Siri / App Intents extension
 * appends to. Each entry was produced by a "Hey Siri, log N ounces of water"
 * invocation that ran in the background.
 *
 * In Expo Go: the native module does not exist → silently returns [].
 * On Android: always returns [] (App Intents are iOS-only).
 *
 * Never throws — drain failures must never block app foreground.
 */

import { NativeModules, Platform } from 'react-native';
import type { BevCategory } from '../constants/beverages';

const { LLSiriQueue } = NativeModules as {
  LLSiriQueue?: {
    readAndClear(): Promise<SiriQueueEntryRaw[]>;
  };
};

interface SiriQueueEntryRaw {
  amount?: number;
  unit?: 'oz' | 'ml';
  beverage?: string;
  timestamp?: number;
}

export interface SiriQueueEntry {
  amount: number;
  unit: 'oz' | 'ml';
  beverage: BevCategory;
  timestamp: number;
}

const ALL_BEVS: ReadonlySet<string> = new Set([
  'water', 'coffee', 'tea', 'icedtea', 'soda', 'flavored', 'coconut',
  'juice', 'lemonade', 'fruit', 'sports', 'milk', 'protein',
  'beer', 'wine', 'cocktail', 'energy', 'energyshot', 'hotchoc', 'spirits',
]);

export async function drainSiriQueue(): Promise<SiriQueueEntry[]> {
  if (Platform.OS !== 'ios' || !LLSiriQueue) return [];
  try {
    const raw = await LLSiriQueue.readAndClear();
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((e) => {
      const amount = typeof e?.amount === 'number' && e.amount > 0 ? e.amount : null;
      const unit   = e?.unit === 'ml' ? 'ml' : 'oz';
      const bev    = typeof e?.beverage === 'string' && ALL_BEVS.has(e.beverage)
                       ? (e.beverage as BevCategory)
                       : null;
      const ts     = typeof e?.timestamp === 'number' ? e.timestamp : Date.now() / 1000;
      if (amount === null || bev === null) return [];
      return [{ amount, unit, beverage: bev, timestamp: ts }];
    });
  } catch {
    return [];
  }
}
