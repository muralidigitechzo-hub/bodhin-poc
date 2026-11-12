export interface Table { columns: string[]; rows: (string | number | null)[][] }
export interface RunResult {
  stdout: string;
  stderr: string;
  ok: boolean;
  ms: number;
  tables?: Table[];
  timedOut?: boolean;
  phase?: 'compile' | 'run' | 'server';
  /** Remote runs only: how many of today's runs are left. */
  runsLeft?: number;
}
export const PYODIDE_VERSION = '314.0.7';
export const SQLJS_VERSION = '1.15.2';
export const REACT_VERSION = '18.3.1';
/** Where the in-browser runtimes load from. Default: public CDN. Production: self-host and set EXPO_PUBLIC_PLAYGROUND_RT. Tests override via localStorage 'bodhin.rt'. */
export function runtimeUrls() {
  let o: Partial<Record<'pyodide' | 'sqljs' | 'react' | 'reactDom', string>> = {};
  try {
    if (typeof localStorage !== 'undefined') o = JSON.parse(localStorage.getItem('bodhin.rt') || '{}');
  } catch { /* ignore */ }
  const root = process.env.EXPO_PUBLIC_PLAYGROUND_RT; // e.g. https://assets.thebodhin.com/rt/
  return {
    pyodide: o.pyodide ?? (root ? `${root}pyodide/` : `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`),
    sqljs: o.sqljs ?? (root ? `${root}sqljs/` : `https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist/`),
    react: o.react ?? (root ? `${root}react.production.min.js` : `https://unpkg.com/react@${REACT_VERSION}/umd/react.production.min.js`),
    reactDom: o.reactDom ?? (root ? `${root}react-dom.production.min.js` : `https://unpkg.com/react-dom@${REACT_VERSION}/umd/react-dom.production.min.js`),
  };
}
