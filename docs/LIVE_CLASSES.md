# Live classes — open source, no third-party branding

**Engine:** [LiveKit](https://github.com/livekit/livekit) server, Apache-2.0, self-hosted. We use only the headless
`livekit-client` SDK; every pixel (stage, chat, Q&A, polls, whiteboard, controls) is Bodhin's own UI, so no
logo / watermark / "powered by" is drawn. (Jitsi and BigBlueButton were rejected: both ship their own UI and branding.)

## What runs where
| Piece | File |
|---|---|
| Message protocol, validation, rate limit, token grants | `apps/student/src/live/protocol.ts` (pure, unit-tested) |
| LiveKit adapter | `apps/student/src/live/livekit.ts` |
| Video element | `apps/student/src/ui/RoomVideo.tsx` |
| Join rule (enrolled, window, plan, kill-switch) | SQL `public.live_join_check()` in `migrations/0005_live.sql` |
| Token signer | `supabase/functions/live-token/index.ts` |

Students join **listen-only**; the host approves a raised hand (`live_speakers` row) and the next token carries `canPublish`.
Host-only messages (slides, polls, whiteboard, answers) are dropped by every receiver if a student sends them.

## The ten student features and what powers each
| Feature | How it works | Needs the media server? |
|---|---|---|
| 1 Live video & audio | host camera/mic tracks; learners listen-only until the host allows speaking | yes |
| 2 Whiteboard | host strokes (points 0..1) over the data channel; a late joiner gets the board replayed (`hello`) | no |
| 3 Screen sharing | host screen-share track shown full-stage | yes |
| 4 Chat & Q&A | `chat` / `qa` / `qa_answer`; 5 messages per 5 s per learner | no |
| 5 Emoji reactions | `react`, floats over the stage for everyone | no |
| 6 Raise hand | `hand` → host taps *Allow to speak* → `live_speakers` row → next token can publish | no (speaking: yes) |
| 7 Live poll & quiz | `poll` (+`quiz`), one vote per learner counted by identity, live `poll_result`, answer revealed only in `poll_close` | no |
| 8 Attendance | `live_join_check` creates the row, `live_ping` adds a minute per minute in the room (server-capped) | no |
| 9 Class recording | LiveKit Egress → `recordings` bucket → `live_recording()` + `live-media` signed URL | yes |
| 10 File sharing | host picks a file → `live_files` row + `live-files` bucket → `file` message; `live-media` signs the download | no |

Nothing on the learner screen is scripted: there are no demo chat lines, slides, people or files. Until a host sends something, the learner sees an honest waiting state.

**Loopback room (no server).** `provider: 'loopback'` (today's default in `client.ts`) connects a host tab and learner tabs on the same device
through a browser `BroadcastChannel`, so every "no" row above can be tried end to end without installing anything.
Rows marked "yes" show a clear message instead of faking it.

## Turn it on
1. A small VPS (4 vCPU / 8 GB handles ~300 viewers per room): install LiveKit server with its install script, TLS via Caddy, domain `live.thebodhin.com`. Open UDP 50000–60000 + TCP 443/7881.
2. `supabase secrets set LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=… LIVEKIT_URL=wss://live.thebodhin.com`
3. `supabase functions deploy live-token`
4. Run `migrations/0007_live_student.sql` and `supabase functions deploy live-media` (create private buckets `recordings` and `live-files`).
   In `client.ts`, make `liveTab.join` / `liveAdmin.joinHost` call `live-token` and return `{ provider: 'livekit', url, token, name, speakAllowed, record }`;
   `liveTab.heartbeat` → `rpc('live_ping')`, `liveAdmin.allowSpeaker` → insert/delete `live_speakers`, `liveAdmin.uploadMaterial` → storage upload + `live_files` insert,
   `liveTab.recording` → `live-media`. The screens switch automatically: `provider: 'loopback'` (today's default) = the no-server room.
   After a host approves a hand, the learner screen calls `live-token` again so the new token carries `canPublish`; for instant revoke also call LiveKit's `updateParticipant` from a server function (a token alone stays valid until it expires).
5. Recording: LiveKit Egress (room composite → object storage), then write `live_sessions.recording_path`.
6. Native apps: add `@livekit/react-native` + `@livekit/react-native-webrtc`, EAS development build (not Expo Go).

## Cost guide
Self-hosted: server cost only (bandwidth dominates). LiveKit Cloud is an alternative but is a paid third-party service.
