import AsyncStorage from '@react-native-async-storage/async-storage';
import { File as FSFile, Paths as FSPaths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type HydrationExportSummary = {
  days: number;
  totalConsumed: number;
  totalHydrated: number;
  bestStreak: number;
  filePath: string;
};

type HistoryRow = {
  date: string;
  oz: number;
  goal: number;
  breakdown?: Record<string, number>;
};

const COLS = [
  'Date', 'Day of Week', 'Daily Goal (oz)', 'True Hydration (oz)',
  'Total Consumed (oz)', 'Hydration %', 'Goal Hit',
  'Water (oz)', 'Coffee (oz)', 'Tea (oz)', 'Soda (oz)', 'Juice (oz)',
  'Sports Drink (oz)', 'Beer (oz)', 'Cocktail (oz)', 'Wine (oz)',
  'Milk (oz)', 'Coconut Water (oz)', 'Energy Drink (oz)', 'Streak Day #',
];

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const BEV_EXPORT_KEYS: [string, string][] = [
  ['water', 'Water'], ['coffee', 'Coffee'], ['tea', 'Tea'],
  ['soda', 'Soda'], ['juice', 'Juice'], ['sports', 'Sports Drink'],
  ['beer', 'Beer'], ['cocktail', 'Cocktail'], ['wine', 'Wine'],
  ['milk', 'Milk'], ['coconut', 'Coconut Water'], ['energy', 'Energy Drink'],
];

/**
 * Build a CSV of the user's last `maxDays` of hydration history, write it to a
 * temp file, and return a summary + file path. Throws on read/parse errors;
 * callers should wrap in try/catch + Sentry.
 *
 * Returns null if there's no history yet.
 */
export async function buildHydrationCSV(maxDays: number): Promise<HydrationExportSummary | null> {
  const [rawHistory, rawGoalHist] = await Promise.all([
    AsyncStorage.getItem('water_history'),
    AsyncStorage.getItem('goal_history'),
  ]);

  const historyArr: HistoryRow[] = rawHistory ? JSON.parse(rawHistory) : [];
  if (historyArr.length === 0) return null;

  const goalHistMap: Record<string, number> = rawGoalHist ? JSON.parse(rawGoalHist) : {};

  // Build streak map: for each goal-hit date, what consecutive-day streak number was it?
  const sortedKeys = Object.keys(goalHistMap)
    .filter((k) => goalHistMap[k] >= 1.0)
    .sort();
  const streakMap: Record<string, number> = {};
  let run = 0;
  for (let i = 0; i < sortedKeys.length; i++) {
    if (i === 0) {
      run = 1;
    } else {
      const prev = new Date(sortedKeys[i - 1].replace(/water_(\d+)_(\d+)_(\d+)/, '$1-$2-$3'));
      const cur = new Date(sortedKeys[i].replace(/water_(\d+)_(\d+)_(\d+)/, '$1-$2-$3'));
      const diff = Math.round((cur.getTime() - prev.getTime()) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    }
    streakMap[sortedKeys[i]] = run;
  }
  const bestStreak = streakMap[sortedKeys[sortedKeys.length - 1]] ?? 0;

  const rows: string[] = [COLS.join(',')];
  let totalConsumed = 0;
  let totalHydrated = 0;

  const sorted = [...historyArr]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-maxDays);

  for (const day of sorted) {
    const m = day.date.match(/water_(\d+)_(\d+)_(\d+)/);
    if (!m) continue;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    const dateStr = `${mm}/${dd}/${yyyy}`;
    const dowStr = DOW[d.getDay()];
    const goalOz = day.goal ?? 64;
    const pct = goalHistMap[day.date] ?? 0;
    const hydOz = Math.round(pct * goalOz * 10) / 10;
    const consumedOz = day.oz ?? 0;
    const goalHit = pct >= 1.0 ? 'Yes' : 'No';
    const streakDay = streakMap[day.date] ?? 0;

    totalConsumed += consumedOz;
    totalHydrated += hydOz;

    const bd = day.breakdown ?? {};
    const bevCols = BEV_EXPORT_KEYS.map(([key]) => (bd[key] ?? 0).toFixed(1));

    rows.push([
      dateStr, dowStr,
      goalOz.toFixed(1),
      hydOz.toFixed(1),
      consumedOz.toFixed(1),
      Math.round(pct * 100).toString(),
      goalHit,
      ...bevCols,
      streakDay.toString(),
    ].join(','));
  }

  const csvContent = rows.join('\n');
  const today = new Date();
  const fileName = `HydroHero_Export_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}.csv`;
  const file = new FSFile(FSPaths.document, fileName);
  try { file.create(); } catch {}
  file.write(csvContent);

  return {
    days: sorted.length,
    totalConsumed: Math.round(totalConsumed),
    totalHydrated: Math.round(totalHydrated),
    bestStreak,
    filePath: file.uri,
  };
}

export async function shareExportFile(filePath: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing not available');
  await Sharing.shareAsync(filePath, {
    mimeType: 'text/csv',
    dialogTitle: 'Share your Hydro Hero history',
    UTI: 'public.comma-separated-values-text',
  });
}

export function deleteExportFile(filePath: string): void {
  try { new FSFile(filePath).delete(); } catch {}
}
