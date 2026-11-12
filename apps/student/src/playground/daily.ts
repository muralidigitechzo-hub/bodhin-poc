/**
 * Daily Practice Arena — pure logic (no React, no storage).
 *  - everyone gets the same "challenge of the day", picked by calendar date
 *  - a day counts toward the streak when that day's challenge is solved
 *  - the streak survives until the end of the next day: solve today OR yesterday's run is still alive
 */

/** Local calendar day as YYYY-MM-DD (a learner's "today" is their own, not UTC). */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parse = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // noon: immune to DST shifts
};
export const addDays = (k: string, n: number) => {
  const d = parse(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
const dayNumber = (k: string) => Math.floor(parse(k).getTime() / 864e5);

/** Same challenge for every learner on a given day; rotates through the whole list. */
export function pickDaily<T extends { id: string }>(list: readonly T[], day: string): T | undefined {
  if (!list.length) return undefined;
  return list[((dayNumber(day) % list.length) + list.length) % list.length];
}

export interface Streak {
  /** Consecutive days ending today (or yesterday, if today isn't done yet). */
  current: number;
  best: number;
  doneToday: boolean;
  /** Has a live streak that will be lost if today passes without a solve. */
  atRisk: boolean;
}

export function streakOf(days: readonly string[], today: string): Streak {
  const set = new Set(days);
  const doneToday = set.has(today);
  let current = 0;
  for (let k = doneToday ? today : addDays(today, -1); set.has(k); k = addDays(k, -1)) current++;
  let best = 0;
  for (const k of set) {
    if (set.has(addDays(k, -1))) continue; // not the start of a run
    let n = 0;
    for (let x = k; set.has(x); x = addDays(x, 1)) n++;
    best = Math.max(best, n);
  }
  return { current, best, doneToday, atRisk: current > 0 && !doneToday };
}

/** The last `n` days ending today, oldest first, for the week dots. */
export function lastDays(days: readonly string[], today: string, n = 7) {
  const set = new Set(days);
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - (n - 1));
    return { day, done: set.has(day), today: day === today, label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][parse(day).getDay()] };
  });
}
