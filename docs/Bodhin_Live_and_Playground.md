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

## Turn it on
1. A small VPS (4 vCPU / 8 GB handles ~300 viewers per room): install LiveKit server with its install script, TLS via Caddy, domain `live.thebodhin.com`. Open UDP 50000–60000 + TCP 443/7881.
2. `supabase secrets set LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=… LIVEKIT_URL=wss://live.thebodhin.com`
3. `supabase functions deploy live-token`
4. In `client.ts`, make `liveTab.join` / `liveAdmin.joinHost` call `live-token` and return `{ provider: 'livekit', url, token }`. The screens switch automatically: `provider: 'mock'` (today's default) = the scripted POC room.
5. Recording: LiveKit Egress (room composite → object storage), then write `live_sessions.recording_path`.
6. Native apps: add `@livekit/react-native` + `@livekit/react-native-webrtc`, EAS development build (not Expo Go).

## Cost guide
Self-hosted: server cost only (bandwidth dominates). LiveKit Cloud is an alternative but is a paid third-party service.

---

# Code Playground

Learners practise any stack inside Bodhin — nothing to install. Route: `/playground` (home) and `/playground/[stack]` (workspace; `?challenge=<id>` or `?project=<id>`).

## How code runs
| Stack | Where it runs | Cost to Bodhin | Limit |
|---|---|---|---|
| HTML·CSS·JS, React | sandboxed `<iframe sandbox="allow-scripts">` (opaque origin: cannot touch Bodhin's page, cookies or storage) | none | — |
| JavaScript, TypeScript | Web Worker (TypeScript types stripped with sucrase) | none | 5 s then the worker is killed |
| Python | Pyodide (CPython → WebAssembly) in a Web Worker | none | 5 s of user code (loading the runtime is not counted) |
| SQL | SQLite (sql.js, WebAssembly) in a Web Worker, fresh database each run | none | 5 s |
| Java, C, C++, C#, Go, Rust, PHP, Ruby, Kotlin | Bodhin's own code server: open-source **Piston** (MIT) behind the `playground-run` Edge Function | server | 30 runs/learner/day (a multi-test "Check" = 2) · 10 s · 256 MB |

Runaway output is truncated at 100 KB. Files: ≤ 8 per project, ≤ 64 KB each, input ≤ 8 KB; names are validated both in the app and on the server.

## Challenges
`src/playground/challenges.ts` — 27 challenges (io / sql / dom). Grading is pure code in `checks.ts`. Every reference solution is run for real by `tests/business/playground.test.ts`, so a challenge that cannot be solved cannot ship. DOM challenges (HTML/CSS/JS) are verified in the browser by `tests/e2e/playground.py`.
Points and levels are for motivation only (self-reported by the app) — do not attach money or certificates to them without moving grading to the server.

## Turn the server languages on
1. A VPS with Docker (2 vCPU / 4 GB is enough to start). Run Piston, install the runtimes you want (`java`, `gcc`, `go`, `rust`, `php`, `ruby`, `kotlin`, `mono`/`dotnet`). Do **not** expose it to the internet — only the Edge Function talks to it. Keep Piston's default isolation (no network, limited processes) on.
2. `supabase secrets set PISTON_URL=https://code.internal.thebodhin.com` · `supabase functions deploy playground-run`
3. App env: `EXPO_PUBLIC_PLAYGROUND_URL=https://<project>.supabase.co/functions/v1/playground-run` (and send the user's session token — see `client.ts`).
4. Self-host the in-browser runtimes before launch (CDN is the default): copy `pyodide/`, `sqljs/` and React 18 UMD to your asset host and set `EXPO_PUBLIC_PLAYGROUND_RT=https://assets.thebodhin.com/rt/`.
5. Run `supabase/migrations/0006_playground.sql` (included in `bodhin_setup_all.sql`).

## Mobile apps
Native builds have no in-app browser runtimes, so every stack runs on the code server (JS/TS/Python/SQL need Piston runtimes `node`, `typescript`, `python`, `sqlite3` too). HTML/CSS/JS and React previews are web-only for now; the native editor is a plain monospace input (CodeMirror is web-only).

## Not in this version
Terminals / full-stack workspaces (Node servers, databases, Docker), collaboration, and educator-authored challenges. These need container workspaces (e.g. open-source code-server) — a separate, costlier feature.
