/** Pure grading + limits for the Playground (unit-tested). */
import type { Challenge, DomCheck, IoTest } from './challenges';

/** Output comparison ignores trailing spaces on each line and trailing blank lines; Windows line endings are normalised. */
export const normalise = (s: string) => s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');

export interface TestResult {
  name: string;
  pass: boolean;
  /** Shown to the learner when a test fails. Hidden tests (none yet) would omit it. */
  expected?: string;
  got?: string;
  error?: string;
}

export const gradeIo = (t: IoTest, stdout: string, error?: string): TestResult =>
  error ? { name: t.name, pass: false, error } : { name: t.name, pass: normalise(stdout) === normalise(t.expect), expected: normalise(t.expect), got: normalise(stdout) };

export function gradeSql(expect: (string | number | null)[][], got: unknown[][] | null, ordered: boolean): TestResult {
  const key = (r: unknown[]) => JSON.stringify(r.map((v) => (typeof v === 'number' ? Number(v) : v)));
  if (!got) return { name: 'Query result', pass: false, error: 'Your query did not return a table. Finish with a SELECT.' };
  const a = got.map(key);
  const b = expect.map(key);
  const pass = ordered ? a.length === b.length && a.every((x, i) => x === b[i]) : a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  return { name: 'Query result', pass, expected: b.join('\n'), got: a.join('\n') };
}

/** Result of evaluating one DOM check inside the preview (computed in the page; graded here). */
export interface DomObservation {
  count: number;
  text: string; // concatenated text of the matches
  styles: string[]; // computed style value of the asked property for each match
}
export const gradeDom = (c: DomCheck, o: DomObservation): TestResult => {
  let pass = o.count > 0;
  if (c.count !== undefined) pass = o.count === c.count;
  if (pass && c.text !== undefined) pass = o.text.replace(/\s+/g, ' ').trim().includes(c.text);
  if (pass && c.style) pass = o.styles.length > 0 && o.styles.every((v) => v === c.style![1]);
  return { name: c.name, pass, got: `${o.count} match${o.count === 1 ? '' : 'es'}` };
};

export const summary = (rs: TestResult[]) => ({ passed: rs.filter((r) => r.pass).length, total: rs.length, allPass: rs.length > 0 && rs.every((r) => r.pass) });

/* ───────── limits (the server enforces the same numbers; see supabase/migrations/0006_playground.sql) ───────── */
export const PLAYGROUND_LIMITS = {
  remoteRunsPerDay: 30, // compiled-language runs / checks per learner per day (browser runners are unlimited — they cost Bodhin nothing)
  savedProjects: 30,
  maxFileBytes: 64 * 1024,
  maxFiles: 8,
  stdinBytes: 8 * 1024,
  runTimeoutMs: 5000, // browser runners
  remoteRunTimeoutMs: 10000,
  remoteMemoryMb: 256,
};

export type CodeIssue = 'too_big' | 'too_many_files' | 'bad_name' | 'stdin_too_big';
export function validateProject(files: { name: string; code: string }[], stdin = ''): CodeIssue | null {
  if (files.length === 0 || files.length > PLAYGROUND_LIMITS.maxFiles) return 'too_many_files';
  if (files.some((f) => !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,59}$/.test(f.name) || f.name.includes('..'))) return 'bad_name';
  if (files.some((f) => new TextEncoder().encode(f.code).length > PLAYGROUND_LIMITS.maxFileBytes)) return 'too_big';
  if (new TextEncoder().encode(stdin).length > PLAYGROUND_LIMITS.stdinBytes) return 'stdin_too_big';
  return null;
}

export const ISSUE_TEXT: Record<CodeIssue, string> = {
  too_big: 'One of your files is too large (limit 64 KB).',
  too_many_files: 'A project can have 1 to 8 files.',
  bad_name: 'File names can use letters, numbers, dot, dash and underscore only.',
  stdin_too_big: 'The Input box is too large (limit 8 KB).',
};

export const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** Points from solved challenges (each counts once). */
export const pointsOf = (solved: string[], all: Pick<Challenge, 'id' | 'points'>[]) => all.filter((c) => solved.includes(c.id)).reduce((s, c) => s + c.points, 0);

/** Learner level from points — drives the little progress badge. */
export const LEVELS = [
  { min: 0, name: 'Newcomer' }, { min: 30, name: 'Coder' }, { min: 100, name: 'Builder' }, { min: 200, name: 'Engineer' },
];
export const levelOf = (pts: number) => [...LEVELS].reverse().find((l) => pts >= l.min)!;

/** Piston response → what the learner sees. Compile errors and runtime errors are separated. */
export interface PistonResp {
  run?: { stdout?: string; stderr?: string; code?: number | null; signal?: string | null; output?: string };
  compile?: { stdout?: string; stderr?: string; code?: number | null };
  message?: string;
}
export function fromPiston(r: PistonResp): { stdout: string; stderr: string; ok: boolean; phase: 'compile' | 'run' | 'server' } {
  if (r.message && !r.run) return { stdout: '', stderr: r.message, ok: false, phase: 'server' };
  if (r.compile && r.compile.code !== 0 && r.compile.code !== undefined && r.compile.code !== null) return { stdout: r.compile.stdout ?? '', stderr: r.compile.stderr || r.compile.stdout || 'Compilation failed.', ok: false, phase: 'compile' };
  const timedOut = r.run?.signal === 'SIGKILL';
  return {
    stdout: r.run?.stdout ?? '',
    stderr: timedOut ? (r.run?.stderr ?? '') + '\nStopped: the program ran too long or used too much memory.' : r.run?.stderr ?? '',
    ok: !timedOut && (r.run?.code ?? 0) === 0,
    phase: 'run',
  };
}
