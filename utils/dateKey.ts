/**
 * Shared date-key helpers.
 *
 * The format `water_YYYY_M_D` (no zero padding) is the project's canonical
 * day identifier — used as AsyncStorage keys for per-day intake, as the
 * field in goal_history records, and as the lastEvaluatedDate field on
 * MissionProgress. Keep parse() and format() in lockstep.
 *
 * Originally lived inline in app/(tabs)/index.tsx; extracted to utils/ so
 * the Mission engine can share the same vocabulary without duplicating the
 * format.
 */

export function getDateKey(d: Date): string {
  return `water_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

export function getTodayKey(): string {
  return getDateKey(new Date());
}

export function parseDateKey(key: string): Date | null {
  // Expected: water_<year>_<month1based>_<day>
  const parts = key.split("_");
  if (parts.length !== 4 || parts[0] !== "water") return null;
  const year  = Number(parts[1]);
  const month = Number(parts[2]);
  const day   = Number(parts[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(year, month - 1, day);
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}
