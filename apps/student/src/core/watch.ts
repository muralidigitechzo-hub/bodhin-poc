/**
 * Video drop-off: where in a lesson viewers stop watching. Pure TypeScript.
 * Every enrolled learner's playback is recorded as the set of 10-second pieces they actually watched
 * (skipping ahead does not count as watching). From those sets we work out how many people are still watching
 * at each moment and where the ones who leave are leaving. Nothing is estimated: with fewer than 5 viewers we show nothing.
 */

export const BUCKET_SEC = 10;
/** drop-off is reported in 30-second windows */
export const WINDOW_BUCKETS = 3;
export const WINDOW_SEC = BUCKET_SEC * WINDOW_BUCKETS;
export const MIN_VIEWERS = 5;
/** someone who watched at least this share of the lesson "finished" it */
export const FINISH_RATIO = 0.9;

export const bucketCount = (durationSec: number) => Math.max(1, Math.ceil(durationSec / BUCKET_SEC));

/**
 * The 10-second pieces covered by one playback step (from → to, in seconds).
 * Normal playback moves forward in small steps and counts; a bigger jump (seeking) or going backwards does not.
 */
export function watchedBuckets(from: number, to: number, maxStep: number): number[] {
  const step = to - from;
  if (!(step > 0) || step > maxStep || from < 0) return [];
  const out: number[] = [];
  for (let b = Math.floor(from / BUCKET_SEC); b <= Math.floor(to / BUCKET_SEC); b++) out.push(b);
  return out;
}

/** Add pieces to a learner's watched set (kept sorted and unique). */
export function mergeBuckets(existing: number[], add: number[], max: number): number[] {
  const s = new Set(existing);
  add.forEach((b) => b >= 0 && b < max && s.add(b));
  return [...s].sort((a, b) => a - b);
}

export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export interface Moment {
  atSec: number;
  endSec: number;
  /** share of all viewers who stopped watching in this window */
  pct: number;
  count: number;
  label: string;
}

export interface WatchAnalysis {
  status: 'ok' | 'not_enough';
  viewers: number;
  minViewers: number;
  /** % of viewers still watching at each 10-second piece */
  curve: number[];
  /** % of viewers who stopped in each 30-second window */
  heat: number[];
  windowSec: number;
  finishPct: number;
  avgWatchedPct: number;
  /** the worst places to look at first (up to 3) */
  moments: Moment[];
}

export function analyseWatch(durationSec: number, sets: number[][], minViewers = MIN_VIEWERS): WatchAnalysis {
  const n = bucketCount(durationSec);
  const watchers = sets.filter((s) => s.length > 0);
  const viewers = watchers.length;
  const windows = Math.ceil(n / WINDOW_BUCKETS);
  const empty: WatchAnalysis = { status: 'not_enough', viewers, minViewers, curve: [], heat: [], windowSec: WINDOW_SEC, finishPct: 0, avgWatchedPct: 0, moments: [] };
  if (viewers < minViewers) return empty;

  const curve = Array.from({ length: n }, (_, i) => Math.round((watchers.filter((s) => s.includes(i)).length / viewers) * 100));
  const quitters = watchers.filter((s) => s.length / n < FINISH_RATIO);
  const quitCount = Array.from({ length: windows }, () => 0);
  // a viewer who did not finish "left" at the furthest point they reached
  quitters.forEach((s) => { quitCount[Math.min(windows - 1, Math.floor(s[s.length - 1] / WINDOW_BUCKETS))] += 1; });
  const heat = quitCount.map((c) => Math.round((c / viewers) * 100));
  const moments = quitCount
    .map((count, w) => ({ w, count, pct: heat[w] }))
    .filter((x) => x.count >= 2 && x.pct >= 10)
    .sort((a, b) => b.pct - a.pct || a.w - b.w)
    .slice(0, 3)
    .map(({ w, count, pct }) => {
      const atSec = w * WINDOW_SEC;
      const endSec = Math.min(durationSec, atSec + WINDOW_SEC);
      return { atSec, endSec, pct, count, label: `${mmss(atSec)}–${mmss(endSec)}` };
    });
  return {
    status: 'ok',
    viewers,
    minViewers,
    curve,
    heat,
    windowSec: WINDOW_SEC,
    finishPct: Math.round(((viewers - quitters.length) / viewers) * 100),
    avgWatchedPct: Math.min(100, Math.round((watchers.reduce((a, s) => a + s.length, 0) / (viewers * n)) * 100)),
    moments,
  };
}
