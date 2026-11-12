// Edge Function: live-media — short-lived download links for a class recording or a file shared in class.
// Deploy:  supabase functions deploy live-media
// Buckets (private): `recordings` (written by the egress job) and `live-files` (written by the host's upload).
// Body: { kind: "recording", sessionId } | { kind: "file", fileId }   →  { state, url? }
// Access is decided in Postgres as the CALLER (live_recording / RLS on live_files); only then is a link signed with the service key.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f-]{36}$/i;
const TTL = 60 * 60; // one hour

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json();
    const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const signer = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (b.kind === 'recording' && typeof b.sessionId === 'string' && UUID.test(b.sessionId)) {
      const { data, error } = await asCaller.rpc('live_recording', { p_session: b.sessionId });
      if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400);
      if (data.state !== 'ready') return json({ state: data.state });
      const { data: signed, error: e2 } = await signer.storage.from('recordings').createSignedUrl(data.path, TTL);
      if (e2 || !signed) return json({ error: 'The recording is not available right now.' }, 502);
      return json({ state: 'ready', url: signed.signedUrl });
    }

    if (b.kind === 'file' && typeof b.fileId === 'string' && UUID.test(b.fileId)) {
      // RLS on live_files lets only enrolled learners and the academy's educators read the row
      const { data, error } = await asCaller.from('live_files').select('storage_path, name').eq('id', b.fileId).maybeSingle();
      if (error || !data) return json({ error: 'File not found.' }, 404);
      const { data: signed, error: e2 } = await signer.storage.from('live-files').createSignedUrl(data.storage_path, TTL, { download: data.name });
      if (e2 || !signed) return json({ error: 'The file is not available right now.' }, 502);
      return json({ url: signed.signedUrl });
    }

    return json({ error: 'Bad request.' }, 400);
  } catch (_e) {
    return json({ error: 'Could not open that right now.' }, 500);
  }
});
