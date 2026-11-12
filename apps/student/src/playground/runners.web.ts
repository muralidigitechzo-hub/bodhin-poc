/** Browser runners (web build). JS/TS/Python/SQL execute inside Web Workers that the page can kill on timeout. */
import { transform } from 'sucrase';
import type { PFile, Stack } from './stacks';
import { PLAYGROUND_LIMITS } from './checks';
import type { DomCheck } from './challenges';
import type { DomObservation } from './checks';
import { JS_WORKER, pyWorker, sqlWorker } from './workers';
import { reactDoc, webDoc } from './docs';
import { runtimeUrls, type RunResult, type Table } from './types';

export const browserCapable = (s: Stack) => s.runner !== 'remote';

type W = { worker: Worker; ready: Promise<void> };
const pool: Record<string, W | undefined> = {};

function spawn(kind: 'js' | 'python' | 'sql'): W {
  const rt = runtimeUrls();
  const src = kind === 'js' ? JS_WORKER : kind === 'python' ? pyWorker(rt.pyodide) : sqlWorker(rt.sqljs);
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), kind === 'python' ? { type: 'module' } : undefined);
  const ready = kind === 'js' ? Promise.resolve() : new Promise<void>((res) => {
    const h = (e: MessageEvent) => { if (e.data?.t === 'ready') { worker.removeEventListener('message', h); res(); } };
    worker.addEventListener('message', h);
  });
  return { worker, ready };
}
const get = (kind: 'js' | 'python' | 'sql') => (pool[kind] ??= spawn(kind));
function kill(kind: string) { pool[kind]?.worker.terminate(); pool[kind] = undefined; }
export function stopAll() { Object.keys(pool).forEach(kill); }

/** Compile TypeScript/JSX by stripping types (sucrase). Throws a readable error on syntax mistakes. */
export function compile(file: PFile, ts: boolean, jsx = false): string {
  try {
    return transform(file.code, { transforms: [...(ts ? (['typescript'] as const) : []), ...(jsx ? (['jsx'] as const) : [])], jsxRuntime: 'classic', disableESTransforms: true, production: true }).code;
  } catch (e) {
    const m = String((e as Error).message);
    throw new Error(/^syntax error/i.test(m) ? m : `Syntax error: ${m}`);
  }
}

export async function runInBrowser(stack: Stack, files: PFile[], stdin: string): Promise<RunResult> {
  const t0 = Date.now();
  const kind = stack.runner === 'python' ? 'python' : stack.runner === 'sql' ? 'sql' : 'js';
  let code = files[0].code;
  if (stack.runner === 'ts') {
    try { code = compile(files[0], true); } catch (e) { return { stdout: '', stderr: String((e as Error).message) + '\n', ok: false, ms: 0, phase: 'compile' }; }
  }
  const w = get(kind);
  return new Promise<RunResult>((resolve) => {
    let out = '', err = '', tables: Table[] | undefined, done = false;
    const finish = (extra: Partial<RunResult> = {}) => {
      if (done) return; done = true; clearTimeout(timer); w.worker.removeEventListener('message', onMsg);
      resolve({ stdout: out, stderr: err, ok: !err && !extra.timedOut, ms: Date.now() - t0, tables, ...extra });
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (d.t === 'out') out += d.s; else if (d.t === 'err') err += d.s; else if (d.t === 'tables') tables = d.tables; else if (d.t === 'done') finish();
    };
    // The clock for user code starts when the runtime is ready — loading Python must not count against the learner's 5 seconds.
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => { timer = setTimeout(() => { kill(kind); err += `\nStopped: your program ran longer than ${PLAYGROUND_LIMITS.runTimeoutMs / 1000} seconds (is there an infinite loop?).\n`; finish({ timedOut: true, ok: false }); }, PLAYGROUND_LIMITS.runTimeoutMs); };
    timer = setTimeout(() => { kill(kind); err += '\nCould not load the runtime. Check your internet connection and try again.\n'; finish({ ok: false }); }, 150000); // first Python start downloads ~15 MB and compiles WebAssembly: slow on weak phones
    w.worker.addEventListener('message', onMsg);
    w.ready.then(() => { clearTimeout(timer); arm(); w.worker.postMessage({ code, stdin }); });
  });
}

/** Document for the live preview iframe (web / react stacks). */
export function previewDoc(stack: Stack, files: PFile[], checks?: DomCheck[]): { doc: string } | { error: string } {
  if (stack.runner === 'web') return { doc: webDoc(files, checks) };
  try {
    const rt = runtimeUrls();
    return { doc: reactDoc(compile(files[0], false, true), { react: rt.react, reactDom: rt.reactDom }) };
  } catch (e) {
    return { error: String((e as Error).message) };
  }
}

/** Renders the page invisibly and reads back what the DOM checks need. Resolves null on timeout. */
export function observeDom(files: PFile[], checks: DomCheck[]): Promise<DomObservation[] | null> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;border:0;visibility:hidden';
    const finish = (v: DomObservation[] | null) => { window.removeEventListener('message', h); clearTimeout(t); frame.remove(); resolve(v); };
    const h = (e: MessageEvent) => { if (e.source === frame.contentWindow && e.data?.bodhin && e.data.t === 'checks') finish(e.data.s); };
    const t = setTimeout(() => finish(null), 4000);
    window.addEventListener('message', h);
    frame.srcdoc = webDoc(files, checks);
    document.body.appendChild(frame);
  });
}
