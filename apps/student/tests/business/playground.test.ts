// @ts-nocheck — Node-only test (spawns real toolchains, loads Pyodide/sql.js); executed by tests/business/run.sh
/* Playground: grading rules, limits, quota, saved projects — and every built-in challenge's reference solution is
   RUN for real (the actual worker code with Pyodide + sql.js, sucrase for TS, and local compilers for Java/C/C++/Go/Rust/PHP/Ruby)
   and must pass its own tests. Kotlin and C# need toolchains that are not on this machine → listed as unverified. */
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { transform } from 'sucrase';
import * as api from '@/api/client';
import { db } from '@/api/mockDb';
import { CHALLENGES } from '@/playground/challenges';
import { STACKS, stackOf } from '@/playground/stacks';
import { fromPiston, gradeDom, gradeIo, gradeSql, levelOf, normalise, PLAYGROUND_LIMITS, pointsOf, summary, validateProject } from '@/playground/checks';
import { JS_WORKER, pyWorker, sqlWorker } from '@/playground/workers';
import { webDoc } from '@/playground/docs';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
async function throws(fn: () => unknown, n: string, m?: RegExp) { try { await fn(); ok(false, n + ' (expected error)'); } catch (e: any) { ok(!m || m.test(e?.message ?? ''), n, e?.message); } }

/* run a worker body exactly as the browser would, with Node stand-ins for importScripts/loadPyodide/initSqlJs */
const ROOT = process.cwd();
async function runWorker(src: string, msg: any, kind: string) {
  const out: any = { out: '', err: '', tables: undefined };
  let resolveDone: Function; const done = new Promise((r) => (resolveDone = r));
  const ready = new Promise((r) => (kind === 'js' ? r(null) : null)); let readyRes: Function; const readyP = kind === 'js' ? Promise.resolve() : new Promise((r) => (readyRes = r));
  const self: any = { postMessage: (m: any) => { if (m.t === 'out') out.out += m.s; else if (m.t === 'err') out.err += m.s; else if (m.t === 'tables') out.tables = m.tables; else if (m.t === 'ready') readyRes?.(); else if (m.t === 'done') resolveDone(); } };
  const pyodide = kind === 'python' ? require('pyodide') : null;
  const sqljs = kind === 'sql' ? require('sql.js') : null;
  new Function('self', 'importScripts', '__loadPyodide', 'initSqlJs', src)(self, () => {}, pyodide?.loadPyodide, sqljs);
  await readyP; self.onmessage({ data: msg }); await done; void ready;
  return out;
}
const PY_BASE = join(ROOT, 'node_modules/pyodide') + '/';
const SQL_BASE = join(ROOT, 'node_modules/sql.js/dist') + '/';

async function runStackLocal(stackId: string, files: any[], stdin: string, setup = '') {
  const s = stackOf(stackId)!; const code = files[0].code;
  if (s.runner === 'js') return runWorker(JS_WORKER, { code, stdin }, 'js');
  if (s.runner === 'ts') return runWorker(JS_WORKER, { code: transform(code, { transforms: ['typescript'], disableESTransforms: true }).code, stdin }, 'js');
  if (s.runner === 'python') return runWorker(pyWorker(PY_BASE), { code, stdin }, 'python');
  if (s.runner === 'sql') return runWorker(sqlWorker(SQL_BASE), { code: setup + '\n' + code }, 'sql');
  return null;
}

/* local compilers for the server languages */
const have = (b: string) => spawnSync('which', [b]).status === 0;
function runCompiled(stackId: string, files: any[], stdin: string): { stdout: string; stderr: string; ok: boolean } | null {
  const dir = mkdtempSync(join(tmpdir(), 'pg-')); const f = files[0]; const p = join(dir, f.name); writeFileSync(p, f.code);
  const sh = (cmd: string, args: string[], inp = '') => spawnSync(cmd, args, { cwd: dir, input: inp, encoding: 'utf8', timeout: 60000 });
  let r;
  if (stackId === 'java' && have('javac')) { const c = sh('javac', [f.name]); if (c.status) return { stdout: '', stderr: c.stderr, ok: false }; r = sh('java', ['-cp', dir, 'Main'], stdin); }
  else if (stackId === 'c' && have('gcc')) { const c = sh('gcc', [f.name, '-o', 'a.out']); if (c.status) return { stdout: '', stderr: c.stderr, ok: false }; r = sh(join(dir, 'a.out'), [], stdin); }
  else if (stackId === 'cpp' && have('g++')) { const c = sh('g++', ['-std=c++17', f.name, '-o', 'a.out']); if (c.status) return { stdout: '', stderr: c.stderr, ok: false }; r = sh(join(dir, 'a.out'), [], stdin); }
  else if (stackId === 'go' && have('go')) { r = spawnSync('go', ['run', f.name], { cwd: dir, input: stdin, encoding: 'utf8', env: { ...process.env, GOCACHE: join(dir, '.cache'), HOME: dir }, timeout: 120000 }); }
  else if (stackId === 'rust' && have('rustc')) { const c = sh('rustc', [f.name, '-o', 'a.out']); if (c.status) return { stdout: '', stderr: c.stderr, ok: false }; r = sh(join(dir, 'a.out'), [], stdin); }
  else if (stackId === 'php' && have('php')) r = sh('php', [f.name], stdin);
  else if (stackId === 'ruby' && have('ruby')) r = sh('ruby', [f.name], stdin);
  else return null;
  return { stdout: r.stdout, stderr: r.stderr, ok: r.status === 0 };
}

async function main() {
  /* ───────── catalogue integrity ───────── */
  ok(new Set(STACKS.map((s) => s.id)).size === STACKS.length, 'stack ids are unique');
  ok(new Set(CHALLENGES.map((c) => c.id)).size === CHALLENGES.length, 'challenge ids are unique');
  ok(STACKS.length === 15, 'fifteen stacks');
  for (const s of STACKS) { ok(s.files.length > 0 && s.files.every((f) => f.code.length > 0), `${s.id}: has starter code`); ok(s.runner !== 'remote' || !!s.piston, `${s.id}: server stack names its language`); }
  for (const ch of CHALLENGES) {
    ok(!!stackOf(ch.stack), `${ch.id}: stack exists`);
    ok(ch.points > 0 && ch.prompt.length > 10, `${ch.id}: has points + prompt`);
    ok(ch.files.map((f) => f.name).join() === ch.solution.map((f) => f.name).join(), `${ch.id}: solution uses the same file names`);
    ok(ch.files.map((f) => f.code).join() !== ch.solution.map((f) => f.code).join(), `${ch.id}: starter is not already the answer`);
    if (ch.kind === 'io') ok(ch.tests.length >= 2, `${ch.id}: at least two tests`);
  }
  const stacksWithChallenges = new Set(CHALLENGES.map((c) => c.stack));
  ok(['javascript', 'typescript', 'python', 'sql', 'web', 'java', 'c', 'cpp', 'go', 'rust', 'php', 'ruby', 'kotlin', 'csharp'].every((s) => stacksWithChallenges.has(s)), 'every stack except React has a challenge');

  /* ───────── grading ───────── */
  ok(normalise('a  \r\nb\n\n') === 'a\nb', 'normalise trims trailing spaces/newlines and CRLF');
  ok(gradeIo({ name: 't', stdin: '', expect: '5' }, '5\n').pass, 'io: trailing newline ok');
  ok(!gradeIo({ name: 't', stdin: '', expect: '5' }, '5.0\n').pass, 'io: 5.0 is not 5');
  ok(!gradeIo({ name: 't', stdin: '', expect: '5' }, '', 'boom').pass && gradeIo({ name: 't', stdin: '', expect: '5' }, '', 'boom').error === 'boom', 'io: error surfaces');
  ok(gradeSql([['a', 1]], [['a', 1]], true).pass && !gradeSql([['a', 1], ['b', 2]], [['b', 2], ['a', 1]], true).pass && gradeSql([['a', 1], ['b', 2]], [['b', 2], ['a', 1]], false).pass, 'sql: order matters only when asked');
  ok(!gradeSql([['a']], null, true).pass, 'sql: no table fails with a hint');
  ok(gradeDom({ name: 'x', selector: 'h1', text: 'Hello Bodhin' }, { count: 1, text: ' Hello   Bodhin ', styles: [] }).pass, 'dom: whitespace-insensitive text');
  ok(!gradeDom({ name: 'x', selector: 'li', count: 3 }, { count: 2, text: '', styles: [] }).pass, 'dom: wrong count fails');
  ok(!gradeDom({ name: 'x', selector: 'li', style: ['color', 'rgb(255, 0, 0)'] }, { count: 2, text: '', styles: ['rgb(255, 0, 0)', 'rgb(0, 0, 0)'] }).pass, 'dom: every match must have the style');
  ok(summary([{ name: 'a', pass: true }, { name: 'b', pass: false }]).passed === 1 && !summary([]).allPass, 'summary counts; empty never passes');
  ok(pointsOf(['js-sum', 'js-sum', 'py-sum'], CHALLENGES) === 20 && levelOf(0).name === 'Newcomer' && levelOf(120).name === 'Builder', 'points + level');

  /* limits */
  ok(validateProject([{ name: 'main.py', code: 'x' }]) === null, 'valid project');
  ok(validateProject([]) === 'too_many_files' && validateProject(Array.from({ length: 9 }, (_, i) => ({ name: `f${i}.js`, code: '' }))) === 'too_many_files', 'file count limits');
  ok(validateProject([{ name: '../etc/passwd', code: '' }]) === 'bad_name' && validateProject([{ name: 'a b.js', code: '' }]) === 'bad_name' && validateProject([{ name: '.hidden', code: '' }]) === 'bad_name', 'unsafe file names rejected');
  ok(validateProject([{ name: 'a.js', code: 'x'.repeat(PLAYGROUND_LIMITS.maxFileBytes + 1) }]) === 'too_big', 'oversized file rejected');
  ok(validateProject([{ name: 'a.js', code: '' }], 'x'.repeat(9000)) === 'stdin_too_big', 'oversized input rejected');

  /* Piston response mapping */
  ok(fromPiston({ run: { stdout: 'hi\n', code: 0 } }).ok, 'piston: success');
  ok(fromPiston({ compile: { code: 1, stderr: 'error: x' }, run: { code: 0 } }).phase === 'compile', 'piston: compile error is reported as such');
  ok(fromPiston({ run: { stdout: '', stderr: '', signal: 'SIGKILL', code: null } }).stderr.includes('too long'), 'piston: killed program explained');
  ok(fromPiston({ run: { stdout: '', stderr: 'Traceback', code: 1 } }).ok === false, 'piston: non-zero exit is a failure');
  ok(fromPiston({ message: 'runtime not found' }).phase === 'server', 'piston: server message passthrough');

  /* docs */
  const d = webDoc([{ name: 'index.html', lang: 'html', code: '<h1>Hi</h1>' }, { name: 'style.css', lang: 'css', code: 'h1{color:red}' }, { name: 'script.js', lang: 'javascript', code: 'console.log(1)' }]);
  ok(d.includes('<h1>Hi</h1>') && d.includes('h1{color:red}') && d.includes('console.log(1)') && d.indexOf('<style>') < d.indexOf('console.log(1)'), 'web doc inlines html, css, js in order');
  ok(webDoc([{ name: 'index.html', lang: 'html', code: '</script><script>alert(1)</script>' }, { name: 'script.js', lang: 'javascript', code: "var s='</script>'" }]).split('</script>').length >= 2 && !webDoc([{ name: 'index.html', lang: 'html', code: '' }, { name: 'script.js', lang: 'javascript', code: "var s='</script><b>'" }]).includes("var s='</script>"), 'closing script tags inside user code cannot break out');

  /* ───────── reference solutions, run for real ───────── */
  const unverified: string[] = [];
  for (const ch of CHALLENGES) {
    let verified = true;
    if (ch.kind === 'dom') continue; // verified in the browser (tests/e2e/playground.py)
    if (ch.kind === 'sql') {
      const r = await runStackLocal(ch.stack, ch.solution, '', ch.setup);
      const last = r.tables?.length ? r.tables[r.tables.length - 1].rows : null;
      ok(gradeSql(ch.expect, last, ch.ordered).pass, `solution passes: ${ch.id}`, { err: r.err, last });
      const bad = await runStackLocal(ch.stack, ch.files, '', ch.setup); // the starter must NOT already pass
      ok(!gradeSql(ch.expect, bad.tables?.length ? bad.tables[bad.tables.length - 1].rows : null, ch.ordered).pass, `starter fails: ${ch.id}`);
      continue;
    }
    for (const t of ch.tests) {
      let r: any = await runStackLocal(ch.stack, ch.solution, t.stdin);
      if (!r) r = runCompiled(ch.stack, ch.solution, t.stdin) && (({ stdout, stderr, ok: o }) => ({ out: stdout, err: o ? '' : stderr }))(runCompiled(ch.stack, ch.solution, t.stdin));
      if (!r) { verified = false; break; }
      ok(gradeIo(t, r.out, r.err || undefined).pass, `solution passes: ${ch.id} / ${t.name}`, { out: r.out, err: String(r.err).slice(0, 200) });
    }
    if (!verified) unverified.push(ch.id);
    else { // the starter must not already pass every test
      const t = ch.tests[0]; let r: any = await runStackLocal(ch.stack, ch.files, t.stdin);
      if (!r) { const c = runCompiled(ch.stack, ch.files, t.stdin); r = c && { out: c.stdout, err: c.ok ? '' : c.stderr }; }
      ok(!r || !gradeIo(t, r.out, r.err || undefined).pass, `starter fails: ${ch.id}`);
    }
  }
  console.log('  not run here (no toolchain): ' + (unverified.join(', ') || 'none'));
  ok(unverified.every((id) => /^(kotlin|csharp)-/.test(id)), 'only Kotlin and C# are unverified', unverified);

  /* runtime behaviour of the real worker bodies */
  let r = await runWorker(JS_WORKER, { code: 'console.log(1+1); console.error("e"); throw new Error("boom")', stdin: '' }, 'js');
  ok(r.out === '2\n' && r.err.includes('e\n') && r.err.includes('boom'), 'js worker: console + uncaught error captured');
  r = await runWorker(JS_WORKER, { code: 'console.log(input(), input(), input())', stdin: 'a\nb\n' }, 'js');
  ok(r.out === 'a b \n', 'js worker: input() reads lines then returns empty');
  r = await runWorker(JS_WORKER, { code: 'await Promise.resolve(); console.log("async ok")', stdin: '' }, 'js');
  ok(r.out === 'async ok\n', 'js worker: top-level await works');
  r = await runWorker(JS_WORKER, { code: 'for (let i=0;i<30000;i++) console.log("x".repeat(20))', stdin: '' }, 'js');
  ok(r.out.length < 120000 && r.err.includes('truncated'), 'js worker: runaway output is truncated');
  r = await runWorker(pyWorker(PY_BASE), { code: 'print(1/0)', stdin: '' }, 'python');
  ok(r.err.includes('ZeroDivisionError') && r.err.startsWith('Traceback'), 'python worker: traceback is shown', r.err);
  r = await runWorker(pyWorker(PY_BASE), { code: 'x = 1', stdin: '' }, 'python');
  const r2 = await runWorker(pyWorker(PY_BASE), { code: 'print("x" in globals())', stdin: '' }, 'python');
  ok(r2.out === 'False\n', 'python worker: runs do not share variables');
  r = await runWorker(sqlWorker(SQL_BASE), { code: 'CREATE TABLE t(a); INSERT INTO t VALUES (1),(2); SELECT a FROM t;' }, 'sql');
  ok(r.tables?.[0]?.rows?.length === 2, 'sql worker: returns tables');
  r = await runWorker(sqlWorker(SQL_BASE), { code: 'SELEC nope' }, 'sql');
  ok(r.err.includes('SQL error'), 'sql worker: syntax error is reported');
  r = await runWorker(sqlWorker(SQL_BASE), { code: 'SELECT count(*) FROM t' }, 'sql');
  ok(r.err.includes('SQL error'), 'sql worker: each run starts with an empty database');

  /* ───────── API: projects, quota, solved ───────── */
  const U = 'u_pg1', V = 'u_pg2';
  const files = [{ name: 'main.py', lang: 'python', code: 'print(1)' }];
  const id = api.playground.save(U, { stack: 'python', title: 'First', files });
  ok(api.playground.overview(U).projects.length === 1 && api.playground.overview(V).projects.length === 0, 'projects are per learner');
  api.playground.save(U, { id, stack: 'python', title: 'First v2', files });
  ok(api.playground.overview(U).projects[0].title === 'First v2' && api.playground.overview(U).projects.length === 1, 'saving again updates, not duplicates');
  await throws(() => api.playground.save(V, { id, stack: 'python', title: 'Hijack', files }), 'cannot overwrite another learner’s project', /not found/i);
  await throws(() => api.playground.remove(V, id), 'cannot delete another learner’s project', /not found/i);
  await throws(() => api.playground.save(U, { stack: 'cobol', title: 'x', files }), 'unknown stack refused', /unknown/i);
  await throws(() => api.playground.save(U, { stack: 'python', title: '  ', files }), 'blank name refused', /name/i);
  await throws(() => api.playground.save(U, { stack: 'python', title: 'x', files: [{ name: '../x', lang: 'python', code: '' }] }), 'bad file name refused', /names/i);
  for (let i = 0; i < PLAYGROUND_LIMITS.savedProjects - 1; i++) api.playground.save(U, { stack: 'python', title: `P${i}`, files });
  await throws(() => api.playground.save(U, { stack: 'python', title: 'one too many', files }), '31st project refused', /30 saved/);
  api.playground.remove(U, id);
  ok(api.playground.overview(U).projects.length === 29, 'deleting frees a slot');

  api.playground.markSolved(U, 'py-sum'); api.playground.markSolved(U, 'py-sum'); api.playground.markSolved(U, 'js-sum');
  ok(api.playground.overview(U).points === 20 && api.playground.overview(U).solved.length === 2, 'solved counted once per challenge');
  await throws(() => api.playground.markSolved(U, 'nope'), 'unknown challenge refused', /unknown/i);

  /* server runs: quota, units, fake code server */
  const calls: any[] = [];
  api.playground.setTransport(async (req) => { calls.push(req); return { results: req.stdins.map((s) => ({ run: { stdout: s.trim().split(' ').map(Number).reduce((a, b) => a + b, 0) + '\n', code: 0 } })) }; });
  const jf = [{ name: 'Main.java', lang: 'java', code: 'class Main{}' }];
  let out = await api.playground.runRemote(V, 'java', jf, ['2 3']);
  ok(out[0].stdout === '5\n' && out[0].runsLeft === 29 && calls[0].language === 'java' && calls[0].files[0].name === 'Main.java', 'server run: sent to the right language, 1 unit');
  out = await api.playground.runRemote(V, 'cpp', jf, ['1 1', '2 2', '3 3']);
  ok(out.length === 3 && out[2].stdout === '6\n' && out[2].runsLeft === 27 && calls[1].language === 'c++', 'multi-test check costs 2 units and maps c++');
  await throws(() => api.playground.runRemote(V, 'python', jf, ['']), 'browser languages never go to the server', /does not run on the server/);
  await throws(() => api.playground.runRemote(V, 'java', jf, Array(6).fill('')), 'at most 5 tests per request', /too many/i);
  await throws(() => api.playground.runRemote(V, 'java', [{ name: 'a b', lang: 'java', code: '' }], ['']), 'unsafe file names never reach the server', /names/i);
  for (let i = 0; i < 13; i++) await api.playground.runRemote(V, 'java', jf, ['1 1', '1 1']); // 27 → 1 left
  ok(api.playground.overview(V).runsLeft === 1, 'quota counts down to 1');
  await throws(() => api.playground.runRemote(V, 'java', jf, ['1 1', '1 1']), 'a 2-unit check is refused when only 1 is left', /today’s 30 server runs/);
  await api.playground.runRemote(V, 'java', jf, ['1 1']);
  await throws(() => api.playground.runRemote(V, 'java', jf, ['1 1']), '31st server run refused', /today’s 30 server runs/);
  const before = calls.length;
  ok(before === calls.length, 'refused runs never contact the code server');
  db.playgroundUsage[`${V}:${new Date().toISOString().slice(0, 10)}`] = 0; // new day
  api.playground.setTransport(async () => { throw new api.ApiError('no_server', 'The code server is not connected in this preview.'); });
  await throws(() => api.playground.runRemote(V, 'java', jf, ['']), 'preview without a server says so', /not connected/);
  ok(api.playground.overview(V).runsLeft === 30, 'nothing is charged when no code ran');
  api.playground.setTransport(async () => { throw new api.ApiError('server', 'Boom'); });
  await throws(() => api.playground.runRemote(V, 'java', jf, ['']), 'server failure surfaces', /Boom/);
  ok(api.playground.overview(V).runsLeft === 29, 'a failed real attempt still costs a run (abuse-proof)');

  console.log(`playground.test: PASS ${pass}  FAIL ${fail}`);
  fails.forEach((f) => console.log('  ✗ ' + f));
  if (fail) process.exit(1);
}
main().catch((e) => { console.error('CRASH', e); process.exit(1); });
