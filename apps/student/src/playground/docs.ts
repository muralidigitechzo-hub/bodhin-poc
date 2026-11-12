/** Builds the HTML documents for the sandboxed preview iframe. Pure strings → unit-testable. */
import type { PFile } from './stacks';
import type { DomCheck } from './challenges';

const esc = (s: string) => s.replace(/<\/(script|style)/gi, '<\\/$1');

/** Console bridge: forwards console.* and uncaught errors to the page (iframe has an opaque origin, so postMessage is the only channel). */
const BRIDGE = `<script>(function(){var P=function(t,s){parent.postMessage({bodhin:1,t:t,s:s},'*')};var sh=function(v){try{return typeof v==='string'?v:JSON.stringify(v)}catch(e){return String(v)}};
['log','info'].forEach(function(k){console[k]=function(){P('out',[].map.call(arguments,sh).join(' ')+'\\n')}});['warn','error'].forEach(function(k){console[k]=function(){P('err',[].map.call(arguments,sh).join(' ')+'\\n')}});
window.addEventListener('error',function(e){P('err',(e.message||'Error')+(e.lineno?' (line '+e.lineno+')':'')+'\\n')});window.addEventListener('unhandledrejection',function(e){P('err','Unhandled promise rejection: '+sh(e.reason)+'\\n')});})();</script>`;

/** Runs the lesson's DOM checks after load and reports what it saw (grading happens in the app, not in the page). */
const harness = (checks: DomCheck[]) => `<script>window.addEventListener('load',function(){setTimeout(function(){var C=${JSON.stringify(checks)};var out=C.map(function(c){var els=[].slice.call(document.querySelectorAll(c.selector));return{count:els.length,text:els.map(function(e){return e.textContent}).join(' '),styles:c.style?els.map(function(e){return getComputedStyle(e).getPropertyValue(c.style[0])}):[]}});parent.postMessage({bodhin:1,t:'checks',s:out},'*')},60)});</script>`;

export function webDoc(files: PFile[], checks?: DomCheck[]): string {
  const html = files.find((f) => f.name.endsWith('.html'))?.code ?? '';
  const css = files.filter((f) => f.name.endsWith('.css')).map((f) => f.code).join('\n');
  const js = files.filter((f) => f.name.endsWith('.js')).map((f) => f.code).join('\n;\n');
  const body = /<\s*html[\s>]/i.test(html) ? html : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
  const head = `${BRIDGE}<style>${esc(css)}</style>`;
  const withHead = /<\/head>/i.test(body) ? body.replace(/<\/head>/i, head + '</head>') : body.replace(/<body/i, head + '<body');
  const tail = `<script>try{${esc(js)}\n}catch(e){console.error(e&&e.message||e)}</script>${checks ? harness(checks) : ''}`;
  return /<\/body>/i.test(withHead) ? withHead.replace(/<\/body>/i, tail + '</body>') : withHead + tail;
}

export function reactDoc(compiled: string, urls: { react: string; reactDom: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${BRIDGE}</head><body><div id="root"></div>
<script src="${urls.react}"></script><script src="${urls.reactDom}"></script>
<script>try{${esc(compiled)}
if(typeof App==='undefined'){throw new Error('Define a component named App.')}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));}catch(e){console.error(e&&e.message||e)}</script></body></html>`;
}
