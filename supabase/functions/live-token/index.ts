// Edge Function: live-token  — signs a LiveKit access token AFTER Postgres says the caller may join.
// Deploy:  supabase functions deploy live-token
// Secrets: supabase secrets set LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... LIVEKIT_URL=wss://live.thebodhin.com
// Body: { sessionId: "<uuid>" }  →  { url, token, role }
// The rules (enrolled? window? plan? kill-switch?) live in SQL: public.live_join_check(). This file only signs.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | string) => {
  const bytes = typeof b === 'string' ? enc.encode(b) : new Uint8Array(b);
  let s = ''; bytes.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function signHS256(payload: Record<string, unknown>, secret: string) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { sessionId } = await req.json();
    if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: 'Bad request.' }, 400);

    // Run the check AS THE CALLER (their JWT), so RLS and auth.uid() apply.
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data, error } = await sb.rpc('live_join_check', { p_session: sessionId });
    if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400);

    const host = data.role === 'host';
    const speak = host || data.speak_allowed;
    const now = Math.floor(Date.now() / 1000);
    const token = await signHS256(
      {
        iss: Deno.env.get('LIVEKIT_API_KEY'),
        sub: data.identity,
        name: data.name,
        nbf: now - 5,
        exp: now + 6 * 3600,
        metadata: JSON.stringify({ role: data.role }), // the client trusts this only for UI; permissions below are what the server enforces
        video: {
          room: data.room,
          roomJoin: true,
          canSubscribe: true,
          canPublish: speak,
          canPublishData: true, // chat, hand, votes
          canPublishSources: host ? ['microphone', 'camera', 'screen_share', 'screen_share_audio'] : speak ? ['microphone', 'camera'] : [],
          roomRecord: false,
          roomAdmin: host,
        },
      },
      Deno.env.get('LIVEKIT_API_SECRET')!,
    );
    return json({ url: Deno.env.get('LIVEKIT_URL'), token, role: data.role, record: data.record });
  } catch (e) {
    return json({ error: 'Could not join right now.' }, 500);
  }
});
