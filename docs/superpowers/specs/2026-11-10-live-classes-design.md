# Live Classes: real-time, local-first, responsive

Date: 2026-11-10 · Status: draft for review · Scope: student Live tab + live room, and the educator host room that feeds it.

## 1. Goal
In the student login, the Live section (Live tab and `live-room/[id]`) must work for real. These ten features work end to end, with a proper UI on phone, tablet and desktop:

1. Live video & audio 2. Interactive whiteboard 3. Screen sharing 4. Live chat & Q&A 5. Emoji reactions 6. Raise hand 7. Live poll & quiz 8. Attendance tracking 9. Class recording 10. File sharing

All scripted/dummy data in the live section is removed. Everything runs on the user's own machine (no Supabase, no VPS). Media goes through LiveKit Cloud (free tier).

## 2. Non-goals
- Replacing the mock data layer for the rest of the app (courses, orders, admin, auth stay mock).
- Real authentication. Login stays mock, so the local server is **demo-grade trust** (see section 11).
- Server-side recording (LiveKit Egress). Recording is host-browser based (section 6.9).
- Native (Android/iOS) screen sharing and recording by the host. Native students are supported only in an EAS development build.

## 3. Architecture
```
Student app (Expo web/native) ──┐                       ┌── LiveKit Cloud (audio, video, screen, data channel)
Educator host room (same app) ──┼── live-server (Node) ─┘   token signing only
                                └── data/ (JSON + files + recordings on disk)
```
- **Media + realtime messages:** LiveKit Cloud. Chat, Q&A, hands, reactions, polls, slides, whiteboard travel on the data channel using the existing `src/live/protocol.ts`.
- **Local server `apps/live-server/`:** zero-dependency Node 20+ script (`node server.mjs`, default port 8787). Holds secrets, signs tokens, stores files, recordings, attendance, chat history and the live-session registry. State is persisted to `data/live.json` and `data/files/`, `data/recordings/`.
- **App:** `liveTab.join` and `liveAdmin.joinHost` call the server and always return `provider: 'livekit'`. The `mock` provider, scripted room and simulations are deleted.
- **Config:** app reads `EXPO_PUBLIC_LIVE_API` (default `http://localhost:8787`; use the PC's LAN IP to test on a phone). Server reads `apps/live-server/.env`: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `PORT`. Secrets never reach the app.
- The existing Supabase files (`live-token`, `0005_live.sql`) are left untouched and unused.

## 4. Live-server API (JSON unless noted; CORS open for local use)
| Route | Who | Purpose |
|---|---|---|
| `POST /sessions` | host | Register/update a class: `{id, tenantId, courseId, batchId?, title, startsAt, endsAt, hostId, record}`. Called when the educator schedules or edits a class. |
| `GET /sessions?userId=` | any | List registered sessions (student Live tab merges these with local data). |
| `POST /sessions/:id/end` | host | Mark ended; closes attendance and finalises the recording. |
| `POST /token` | any | `{sessionId, userId, name, role}` → `{url, token, role, speakAllowed}`. Host role accepted only if `userId === session.hostId`. Join window: 10 min before start to 30 min after end. |
| `POST /speakers` | host | Grant/revoke speaking `{sessionId, userId, on}`. Next token reflects it. |
| `POST /attendance/join` `/heartbeat` `/leave` | student | Server computes minutes from heartbeats (every 60 s, capped at class length + 30 min). |
| `GET /attendance?sessionId=` / `?userId=` | host / student | Real attendance for host summary and the student's Past tab. |
| `POST /chat` `GET /chat?sessionId=` | any | Each sender stores their own chat/Q&A message (fire-and-forget); late joiners load history on join. |
| `POST /files` (raw body, header `x-filename`, `x-session`) `GET /files?sessionId=` `GET /files/:id` | host upload, all read | Max 25 MB; extension allow-list (pdf, docx, pptx, xlsx, txt, png, jpg, zip). Filenames sanitised. |
| `POST /recordings/:sessionId/chunk` `POST /recordings/:sessionId/finish` `GET /recordings/:sessionId` | host / all | Chunked WebM upload; served with range support. |
| `POST /polls` | host | Persist final poll/quiz results for the summary. |

All inputs are size-limited and validated; unknown routes return 404; errors return `{error}` with a user-readable message.

## 5. Protocol changes (`src/live/protocol.ts`)
Existing messages are kept. Changes:
- `qa_answer.id` now means the **question id** being answered.
- `poll` gains optional `quiz: boolean` and `correct?: number` (host sends `correct` only inside `poll_close`, never earlier).
- New host-only `poll_result {id, votes: number[]}` (throttled to 2/s) so students see real live counts.
- `poll_close {id, correct?}` reveals the quiz answer.
- New host-only `file {id, name, size, url}`.
- New `board_request` (student → host) and host replies by re-sending stored `stroke`s, so late joiners see the current board.
- `HOST_ONLY` set updated; `decodeMsg` validates every new field. A student sending a host-only message is dropped by receivers (unchanged rule).

## 6. Feature design
1. **Video & audio:** LiveKit tracks. Students join listen-only; host camera/mic published. Students can publish mic/cam only after approval.
2. **Whiteboard:** host draws (pen, eraser, colours, clear); strokes broadcast lossy on the data channel. Students get a read-only SVG canvas that scales to its container; late joiners request the current board.
3. **Screen sharing:** host `setScreen(true)` (web). Students show the screen track on the stage with `contain`; host camera becomes a small picture-in-picture. Stage priority: screen > whiteboard (when host opens it) > camera.
4. **Chat & Q&A:** separate lists. Chat is everyone; Q&A questions show an answered state when the host replies with `qa_answer`. History loaded from the server on join. Rate limit 5 messages / 5 s, 500-char cap (existing).
5. **Reactions:** picker with the 4 allowed emojis (replaces the random emoji); floating animation for everyone's reactions; rate-limited.
6. **Raise hand:** student toggles; host sees a live hand list (name, time) with Approve/Lower. Approve calls `POST /speakers` and sends `allow_speak`; the student re-fetches a token and gains mic/cam permission. Revoke works the same way.
7. **Poll & quiz:** host form (question, 2–6 options, optional correct answer = quiz). Students vote once (host dedupes by identity); results update live; quiz reveals the correct option on close. Final results persisted.
8. **Attendance:** server-side join/heartbeat/leave. Student Past & Attendance and the host class summary read these numbers. Local mock attendance writes for live sessions are removed.
9. **Recording:** host taps Record (web only). `MediaRecorder` records the shared screen (or camera) plus mixed microphone audio, uploads 5-second chunks, finalises on stop/end. Students watch it in Past & Attendance via a normal video player. If the host closes the tab mid-class the recording stops at the last uploaded chunk. Hidden on native host with an explanatory message.
10. **File sharing:** host picks a file (`expo-document-picker`), uploads to the server, broadcasts `file`. Students see and download from the Files tab; history loaded on join.

## 7. UI and responsive layout
Follows the project's three layouts (`useLayout`, README section 3), existing tokens and components (`Button`, `BottomSheet`, `Avatar`, `Banner`). Phone layout is never changed to suit desktop.
- **Phone < 768 px:** stage on top, tabbed panel (Chat, Q&A, People, Files) below, controls pinned in the thumb zone, polls/emoji/more as bottom sheets. Works at 360 px.
- **Tablet 768–1023 px:** stage plus side panel.
- **Desktop ≥ 1024 px:** large stage and a 380 px side panel; sheets open as centred dialogs; whiteboard and shared screen use the full stage.
- **Student room UI:** stage (video/screen/whiteboard), panel tabs, emoji picker sheet, poll/quiz sheet with live results, raise-hand state banner, connection-lost banner, empty states ("No messages yet", "No files shared"), loading and error states.
- **Host room UI:** hand-raise list with Approve, poll/quiz create sheet, whiteboard toolbar, file upload, Record toggle with timer, share-screen toggle, participant list with real mic state.
- **Live tab:** Live now / Upcoming / Past & Attendance from real data; empty state when nothing is scheduled; recording opens the real player.
- Every control has an accessibility label; touch targets ≥ 48 px (existing rule).

## 8. Dummy data removal (live section only)
Delete: `BOT_LINES`, `SLIDES`, `PEOPLE`, `FILES`, the fake `247` viewers and `Math.random` viewer drift, scripted poll and slide timers, fake hand acknowledgement, the `1 / 24` slide counter, `provider: 'mock'` join with `participants: 247`, and the host room's `CHAT_LINES`/`QUESTIONS`/random poll simulation.
To verify and list before deleting: the demo live sessions (`seedLive`), seeded batch class sessions in `batchSeed.ts`, and seeded attendance in `mockDb`. The exact list goes into the implementation plan. Data outside the live section (courses, orders, assessments, admin) is not touched.

## 9. Testing
- **Unit (extend `tests/business`):** protocol decode/validate for every new message, `isAllowedFrom`, rate limiter, grants.
- **Server (`node:test`):** token grants and host check, join window, file limits and name sanitising, attendance minute capping, speaker grant, recording chunk assembly.
- **Manual two-browser checklist** (educator window + student window) for all ten features, at 360 px, 768 px and 1280 px widths.
- `npm run typecheck` must pass.
- Constraint: the assistant cannot run commands on the user's PC, so the user runs the tests and typecheck; results guide fixes.

## 10. Run it
1. Create a free LiveKit Cloud project; copy URL, API key, secret into `apps/live-server/.env`.
2. `cd apps/live-server && node server.mjs`
3. `cd apps/student && npm install && npx expo start` (press `w`).
4. Educator and student in two browser windows (use one normal and one private window so mock sessions don't clash).

## 11. Risks and limits
- **Trust:** with mock login anyone can call the server claiming a role. Mitigated only by the host check against the registered `hostId`. Replace with real auth before any public launch.
- **Recording:** depends on the host tab staying open; web only.
- **Native:** students on Android/iOS need an EAS development build for WebRTC.
- **LiveKit Cloud free tier** has monthly minute limits; fine for testing.
- **Sessions registry:** a class only appears for students after the educator's app has registered it with the server (server must be running).
