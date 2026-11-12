/**
 * Worker bodies as strings (platform-neutral). The web runner turns them into Blob workers.
 * Message protocol worker → page:  {t:'out'|'err', s}  {t:'tables', tables}  {t:'done'}  {t:'ready'}
 * Page → worker: {code, stdin}.  Workers are terminated by the page on timeout, so infinite loops cannot hang the app.
 */
const COMMON = `
const MAX = 100000; let size = 0;
const post = (t, s) => { if (size > MAX) return; size += (s || '').length; self.postMessage({ t, s }); if (size > MAX) self.postMessage({ t: 'err', s: '\\n[output truncated: too long]' }); };
const show = (v) => { if (typeof v === 'string') return v; try { if (v instanceof Error) return v.stack || String(v); return typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v); } catch (_) { return String(v); } };
`;

export const JS_WORKER = `${COMMON}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
self.onmessage = async (e) => {
  const { code, stdin } = e.data; const lines = String(stdin || '').split('\\n'); if (lines.length && lines[lines.length - 1] === '') lines.pop(); let i = 0; size = 0;
  const con = { log: (...a) => post('out', a.map(show).join(' ') + '\\n'), info: (...a) => post('out', a.map(show).join(' ') + '\\n'), warn: (...a) => post('err', a.map(show).join(' ') + '\\n'), error: (...a) => post('err', a.map(show).join(' ') + '\\n') };
  const input = () => (i < lines.length ? lines[i++] : '');
  try { await new AsyncFunction('input', 'console', '"use strict";\\n' + code)(input, con); }
  catch (err) { post('err', (err && err.stack ? String(err.stack).split('\\n').slice(0, 4).join('\\n') : String(err)) + '\\n'); }
  self.postMessage({ t: 'done' });
};`;

export const pyWorker = (base: string) => `${COMMON}
// Pyodide >= 0.27 only runs in MODULE workers, so this worker is created with {type:'module'} and imports pyodide.mjs.
let py = null;
const ready = (async () => {
  const load = typeof __loadPyodide !== 'undefined' ? __loadPyodide : (await import(${JSON.stringify(base + 'pyodide.mjs')})).loadPyodide;
  py = await load({ indexURL: ${JSON.stringify(base)} });
  self.postMessage({ t: 'ready' });
})();
ready.catch((err) => { self.postMessage({ t: 'err', s: 'Python could not start: ' + (err && err.message || err) + '\\n' }); self.postMessage({ t: 'ready' }); });
self.onmessage = async (e) => {
  const { code, stdin } = e.data; size = 0;
  try {
    await ready;
    const lines = String(stdin || '').split('\\n'); if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop(); let i = 0; // empty Input box = one empty line, so input() returns '' instead of EOFError
    py.setStdin({ stdin: () => (i < lines.length ? lines[i++] : null) });
    py.setStdout({ batched: (s) => post('out', s + '\\n') });
    py.setStderr({ batched: (s) => post('err', s + '\\n') });
    const ns = py.globals.get('dict')();
    try { await py.runPythonAsync(code, { globals: ns }); }
    catch (err) { const m = String(err && err.message || err); const k = m.indexOf('File "<exec>"'); post('err', (k >= 0 ? 'Traceback (most recent call last):\\n  ' + m.slice(k) : m) + '\\n'); }
    finally { ns.destroy(); }
  } catch (err) { post('err', 'Python could not start: ' + (err && err.message || err) + '\\n'); }
  self.postMessage({ t: 'done' });
};`;

export const sqlWorker = (base: string) => `${COMMON}
importScripts(${JSON.stringify(base + 'sql-wasm.js')});
let SQL = null; const ready = initSqlJs({ locateFile: (f) => ${JSON.stringify(base)} + f }).then((s) => { SQL = s; self.postMessage({ t: 'ready' }); });
self.onmessage = async (e) => {
  const { code } = e.data; size = 0;
  try {
    await ready; const db = new SQL.Database();
    try { const res = db.exec(code); self.postMessage({ t: 'tables', tables: res.map((r) => ({ columns: r.columns, rows: r.values })) }); }
    catch (err) { post('err', 'SQL error: ' + (err && err.message || err) + '\\n'); }
    finally { db.close(); }
  } catch (err) { post('err', 'SQLite could not start: ' + (err && err.message || err) + '\\n'); }
  self.postMessage({ t: 'done' });
};`;
