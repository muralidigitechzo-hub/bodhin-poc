/** Date/time display helpers (Indian locale, 12-hour clock). */
const time = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?(am|pm)/i, (m) => ' ' + m.trim().toUpperCase());

export function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(now)) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const timeRange = (a: string, b: string) => `${time(new Date(a))} – ${time(new Date(b))}`;

export function dateParts(iso: string) {
  const d = new Date(iso);
  return { month: d.toLocaleDateString('en-IN', { month: 'short' }), day: String(d.getDate()).padStart(2, '0'), weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }) };
}

/** 'live' | 'soon' (≤15 min) | 'later' | 'ended' plus a human countdown. */
export function sessionStatus(startsAt: string, endsAt: string, now = Date.now()) {
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  if (now >= e) return { state: 'ended' as const, label: 'Ended' };
  if (now >= s) return { state: 'live' as const, label: 'Live now' };
  const mins = Math.round((s - now) / 6e4);
  const label = mins < 60 ? `Starts in ${mins} min` : mins < 24 * 60 ? `Starts in ${Math.floor(mins / 60)}h ${mins % 60}m` : `Starts ${dayLabel(startsAt)}`;
  return { state: mins <= 15 ? ('soon' as const) : ('later' as const), label };
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
