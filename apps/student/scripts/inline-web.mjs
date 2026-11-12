// Packs the Expo web export (dist/) into ONE self-contained HTML file for preview sharing.
// Usage: node scripts/inline-web.mjs dist preview/bodhin-preview.html
import fs from 'node:fs';
import path from 'node:path';

const [dist = 'dist', out = 'preview/bodhin-preview.html'] = process.argv.slice(2);
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };

const scripts = [...html.matchAll(/<script src="([^"]+)"[^>]*><\/script>/g)].map((m) => m[1]);
let js = scripts.map((s) => fs.readFileSync(path.join(dist, s), 'utf8')).join('\n;\n');

// Inline every /assets/... path the bundle references as a data URI.
js = js.replace(/"(\/assets\/[^"]+)"/g, (m, p) => {
  const file = path.join(dist, decodeURIComponent(p.split('?')[0]));
  if (!fs.existsSync(file)) return m;
  if (file.endsWith('.ttf') && !/Ionicons/.test(file)) return m; // only the icon font we use
  const type = mime[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  return JSON.stringify(`data:${type};base64,${fs.readFileSync(file).toString('base64')}`);
});
js = js.replace(/<\/script/gi, '<\\/script');
// `<!--` inside an inline <script> flips the HTML parser into 'escaped' mode and swallows the closing tag.
js = js.replace(/<!--/g, '<\\!--');

// The preview host serves the page at an arbitrary path; start the router at "/".
const boot = `<script>try{history.replaceState(null,'','/'+location.search)}catch(e){}</script>`;
const page = html
  .replace(/<link rel="icon"[^>]*>/, '')
  .replace('<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />', '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n    <meta name="theme-color" content="#FBF7F0" />')
  .replace(/<script src="[^"]+"[^>]*><\/script>/g, '')
  .replace('</body>', () => `${boot}<script>${js}</script></body>`);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`${out} ${(page.length / 1024 / 1024).toFixed(2)} MB`);

// Artifact variant: page content only (the host adds doctype/head/body).
const artifact = page
  .replace(/<!doctype html>\s*<html[^>]*>\s*<head>/i, '<title>Bodhin Student App</title>')
  .replace(/<meta charset="utf-8" \/>|<meta httpEquiv[^>]*>|<meta name="viewport"[^>]*>/g, '')
  .replace('</head>', '<style>body{background:#FBF7F0}</style>')
  .replace('<title>Bodhin</title>', '')
  .replace(/<body>/, '')
  .replace(/<\/body>\s*<\/html>\s*$/, '');
fs.writeFileSync(out.replace(/\.html$/, '.artifact.html'), artifact);
