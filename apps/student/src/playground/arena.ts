/**
 * Code Arena — pure logic on top of the Daily Challenge (daily.ts): XP tiers, streak bonus,
 * GitHub-style heatmap and the weekly cohort leaderboard. No React, no storage.
 *
 * XP ledger (one number for everything a learner does in the Arena):
 *   + each playground challenge's points, the first time it is solved
 *   + Daily Concept Quiz: 10 XP for a correct answer, 2 XP for trying
 *   + streak bonus on the first daily activity of a day: min(streak - 1, 7) XP
 */
import { addDays } from './daily';

/* ─────────────── badges ─────────────── */

export const TIERS = [
  { id: 'bronze', name: 'Bronze', min: 50, color: '#B45309', bg: '#FDEBD3' },
  { id: 'silver', name: 'Silver', min: 200, color: '#64748B', bg: '#E8EDF3' },
  { id: 'gold', name: 'Gold', min: 500, color: '#B7791F', bg: '#FFF1C2' },
  { id: 'platinum', name: 'Platinum', min: 1000, color: '#4F46E5', bg: '#E4E7FF' },
] as const;
export type Tier = (typeof TIERS)[number];

/** Highest tier reached, or null while still under Bronze. */
export const tierOf = (xp: number): Tier | null => [...TIERS].reverse().find((t) => xp >= t.min) ?? null;

/** Progress toward the next badge (null at Platinum). */
export function nextTier(xp: number): { tier: Tier; need: number; pct: number } | null {
  const next = TIERS.find((t) => xp < t.min);
  if (!next) return null;
  const cur = tierOf(xp);
  const from = cur?.min ?? 0;
  return { tier: next, need: next.min - xp, pct: Math.max(0, Math.min(100, Math.round(((xp - from) / (next.min - from)) * 100))) };
}

export const QUIZ_XP = { correct: 10, tried: 2 } as const;
export const STREAK_BONUS_CAP = 7;
/** Bonus for the first daily activity of a day, given the streak length *including* today. */
export const streakBonus = (streakAfter: number) => Math.max(0, Math.min(streakAfter - 1, STREAK_BONUS_CAP));

/* ─────────────── heatmap ─────────────── */

const dow = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12).getDay(); }; // 0 = Sunday

/** 0 = nothing, 1–4 = darker the more XP that day. */
export const heatLevel = (xp: number) => (xp <= 0 ? 0 : xp < 10 ? 1 : xp < 20 ? 2 : xp < 35 ? 3 : 4);

export interface HeatCell { day: string; xp: number; level: number; future: boolean; today: boolean }

/** `weeks` columns (Sunday → Saturday, oldest first); the last column is the current week. */
export function heatmap(xpByDay: Record<string, number>, today: string, weeks = 15): HeatCell[][] {
  const lastSunday = addDays(today, -dow(today));
  return Array.from({ length: weeks }, (_, w) => {
    const sunday = addDays(lastSunday, (w - (weeks - 1)) * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(sunday, i);
      const xp = xpByDay[day] ?? 0;
      return { day, xp, level: heatLevel(xp), future: day > today, today: day === today };
    });
  });
}

/** Short month label above the first column of each new month. */
export function monthLabels(cols: HeatCell[][]): (string | null)[] {
  let prev = '';
  return cols.map((col) => {
    const m = col[0].day.slice(0, 7);
    if (m === prev) return null;
    prev = m;
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.slice(5)) - 1];
  });
}

/* ─────────────── weekly leaderboard ─────────────── */

/** Weeks run Monday → Sunday. */
export const weekStart = (day: string) => addDays(day, -((dow(day) + 6) % 7));
export const inWeek = (day: string, today: string) => day >= weekStart(today) && day <= today;

/** FNV-1a: tiny, stable string hash (no Math.random — the board must not reshuffle on every load). */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const PEER_DAY_XP = [0, 0, 0, 10, 10, 12, 15, 22, 30];
/**
 * POC placeholder for classmates who have no Arena account yet: a stable pseudo-activity per person per day.
 * The real backend replaces this with their actual XP ledger.
 */
export function peerWeeklyXp(personId: string, today: string) {
  let sum = 0;
  for (let d = weekStart(today); d <= today; d = addDays(d, 1)) sum += PEER_DAY_XP[hash(`${personId}|${d}`) % PEER_DAY_XP.length];
  return sum;
}
export const peerTotalXp = (personId: string, today: string) => 20 + (hash(personId) % 640) + peerWeeklyXp(personId, today);

export interface BoardEntry { id: string; name: string; xp: number; total: number; streak: number; you: boolean }
export interface BoardRow extends BoardEntry { rank: number; tier: Tier | null }

/** Most weekly XP first; ties → higher total XP, then name, so the order is always the same. */
export function rankBoard(entries: BoardEntry[]): BoardRow[] {
  return [...entries]
    .sort((a, b) => b.xp - a.xp || b.total - a.total || a.name.localeCompare(b.name))
    .map((e, i) => ({ ...e, rank: i + 1, tier: tierOf(e.total) }));
}

/** Top `n` plus the learner's own row (with a gap marker handled by the UI) when they are outside the top `n`. */
export function boardView(rows: BoardRow[], n = 5) {
  const top = rows.slice(0, n);
  const me = rows.find((r) => r.you);
  return { top, me: me && me.rank > n ? me : null };
}
