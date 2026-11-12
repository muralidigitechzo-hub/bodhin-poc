// Edge Function: playground-run — runs compiled/server languages on Bodhin's own Piston code server (open source, MIT).
// Deploy:  supabase functions deploy playground-run
// Secrets: supabase secrets set PISTON_URL=https://code.thebodhin.com   (Piston behind your firewall; never exposed to browsers)
// Body:    { language: "java", files: [{name, code}], stdins: ["..."] }   (1–5 stdins; a multi-stdin "check" costs 2 runs)
// The daily quota is enforced in Postgres (public.playground_consume) BEFORE the code server is called.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const ALLOWED: Record<string, string> = { java: 'java', c: 'c', 'c++': 'c++', csharp: 'csharp', go: 'go', rust: 'rust', php: 'php', ruby: 'ruby', kotlin: 'kotlin' };
const MAX_FILES = 8, MAX_FILE = 64 * 1024, MAX_STDIN = 8 * 1024, MAX_STDINS = 5;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const bytes = (s: string) => new TextEncoder().encode(s).length;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json();
    const language = ALLOWED[String(b.language)];
    const files = Array.isArray(b.files) ? b.files : [];
    const stdins: string[] = Array.isArray(b.stdins) && b.stdins.length ? b.stdins.map(String) : [''];
    if (!language) return json({ error: 'That language is not available.' }, 400);
    if (files.length < 1 || files.length > MAX_FILES || files.some((f: any) => typeof f?.name !== 'string' || typeof f?.code !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,59}$/.test(f.name) || bytes(f.code) > MAX_FILE)) return json({ error: 'Check your files: up to 8 files, 64 KB each, simple names.' }, 400);
    if (stdins.length > MAX_STDINS || stdins.some((s) => bytes(s) > MAX_STDIN)) return json({ error: 'Input is too large.' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: left, error } = await sb.rpc('playground_consume', { p_units: stdins.length > 1 ? 2 : 1 });
    if (error) return json({ error: error.message }, error.code === 'P0001' ? 429 : 401);

    const results = [];
    for (const stdin of stdins) {
      const r = await fetch(`${Deno.env.get('PISTON_URL')}/api/v2/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language, version: '*', files: files.map((f: any) => ({ name: f.name, content: f.code })), stdin,
          compile_timeout: 15000, run_timeout: 10000, compile_memory_limit: 512 * 1024 * 1024, run_memory_limit: 256 * 1024 * 1024,
        }),
      });
      results.push(await r.json().catch(() => ({ message: 'The code server did not answer. Try again.' })));
    }
    return json({ results, runsLeft: left });
  } catch (_e) {
    return json({ error: 'Could not run right now.' }, 500);
  }
});
