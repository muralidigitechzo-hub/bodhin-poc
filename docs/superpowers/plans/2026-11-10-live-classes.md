# Live Classes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the student Live section (and the host room that feeds it) work end to end for all ten live-class features on a local server, with responsive UI, and delete the live section's dummy data.

**Architecture:** A zero-dependency Node server (`apps/live-server/`) signs LiveKit Cloud tokens and stores sessions, attendance, chat history, files, polls and recordings on disk. Audio/video/screen travel on LiveKit tracks; chat, Q&A, hands, reactions, polls, whiteboard and file notices travel on the LiveKit data channel using `src/live/protocol.ts`. The app talks to the server through one small client (`src/live/api.ts`); the mock room provider is deleted.

**Tech Stack:** Node 20+ (server, `node:test`), Expo SDK 58 / React Native 0.88 / Expo Router / TypeScript strict, `livekit-client`, `react-native-svg`, `expo-document-picker`, existing esbuild-based tests (`tests/business/run.sh`).

**Spec:** `docs/superpowers/specs/2026-11-10-live-classes-design.md`

## Global Constraints
- Server: Node ≥ 20, **zero npm dependencies**, default port `8787`, state in `apps/live-server/data/` (`live.json`, `files/`, `recordings/`), secrets only in `apps/live-server/.env` (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `PORT`).
- App reads `EXPO_PUBLIC_LIVE_API` (default `http://localhost:8787`). No secret ever in the app.
- Join window: 10 min before start to 30 min after end. Chat rate limit 5 messages / 5 s; message ≤ 500 chars; poll 2–6 options; stroke ≤ 400 points. File upload ≤ 25 MB, extensions `pdf docx pptx xlsx txt png jpg zip`. Recording chunks every 5 s.
- Students join listen-only; mic/camera only after host approval; students never get screen share. Host-only messages from students are dropped by receivers.
- Remove only the live section's dummy data. Courses, orders, assessments, admin seeds stay.
- UI follows the three layouts in README §3 (phone < 768, tablet 768–1023, desktop ≥ 1024) using `useLayout()`; never alter the phone layout for desktop. Touch targets ≥ 48 px, every control has an accessibility label, every screen has loading/empty/error states, works at 360 px.
- Reuse `Button`, `BottomSheet`, `Avatar`, `Banner`, `Txt`, theme tokens. Files stay focused (< ~250 lines each); room screens are shells over hooks/components in `src/live/`.
- `npm run typecheck` must stay clean.

## Execution Mechanics (no shell on the user's PC)
- New/changed files are written in the container under `/mnt/user-data/outputs/` mirroring the repo path, then copied with `device_commit_files`. Existing app files are staged with `device_stage_files`, edited, and committed back with `expectedMtimeMs`.
- **Server tasks (1–6) are fully verified in the container** (Node 22): `node --test apps/live-server/test`.
- **App tasks** cannot be typechecked or run in the container (no `node_modules`). After each app task the executor lists the changed files and asks the user to run `npm run typecheck` and `bash tests/business/run.sh` in `apps/student`, then fixes reported errors before the next task.
- "Commit" steps are `git` commands the user runs; the executor prints the exact `git add` / `git commit -m` line.

## Review Focus
1. Server restart mid-class must not lose sessions, attendance, chat or files (state reloads from `live.json`). Test in Task 1.
2. Hostile uploads (`../../x.pdf`, `evil.exe`, oversize body, empty name) are rejected or sanitised. Test in Task 5.
3. A student (or any non-host user id) asking for `role: 'host'`, or a stranger posting speakers/files/recordings, is refused. Test in Task 2 and Task 5.
4. A late joiner sees prior chat, files, the board and any open poll (not a blank room). Tests in Tasks 5, 8 and 18.
5. Duplicate votes count once, out-of-range options are ignored, a forgotten tab / missed heartbeats cannot inflate attendance minutes. Tests in Tasks 4 and 8.

---

## File Structure
```
apps/live-server/
  server.mjs                 entry: loads .env, starts app
  .env.example  README.md  .gitignore (data/, .env)
  src/config.mjs             loadConfig(env)
  src/store.mjs              createStore(file) – JSON persistence
  src/jwt.mjs                signLiveKitToken(grant, cfg)
  src/http.mjs               readJson/readBody(limit)/send/cors helpers, Router
  src/app.mjs                createApp(config, store) → (req,res) handler; mounts routes
  src/routes/{sessions,token,attendance,chat,files,recordings,polls}.mjs
  test/*.test.mjs            node:test, one file per route group
apps/student/src/live/
  protocol.ts (modify)       new messages, diffJoined
  poll.ts                    createTally
  board.ts                   virtual board maths + path
  api.ts  config.ts          server client
  livekit.ts (modify)        reconnect, local tracks, data helpers
  recorder.ts / recorder.web.ts
  useStudentRoom.ts  useHostRoom.ts   room state hooks
  ui/{Stage,BoardView,ChatPanel,QaPanel,PeoplePanel,FilesPanel,ReactionSheet,PollSheet,RoomControls,RoomTopBar}.tsx
  ui/host/{HandList,PollComposer,BoardToolbar,FileUpload,RecordToggle}.tsx
apps/student/src/app/live-room/[id].tsx, (tabs)/live.tsx, edu/host/[id].tsx, edu/summary/[id].tsx (modify)
apps/student/src/api/{client,catalogSeed,mockDb}.ts (modify)
apps/student/tests/business/{live-room,live-api,live-seed}.test.ts
docs/LIVE_CLASSES.md (rewrite), docs/LIVE_CLASSES_TEST_CHECKLIST.md (new)
```

---

## Part A — Local server

### Task 1: Server skeleton, config, store, health
**Files:** Create `apps/live-server/{server.mjs,.env.example,.gitignore}`, `src/{config,store,http,app}.mjs`, `test/store.test.mjs`
**Interfaces:**
- Produces: `loadConfig(env: Record<string,string|undefined>): {port:number, livekitUrl:string, apiKey:string, apiSecret:string, dataDir:string}` (throws `Error` naming the missing key); `createStore(file:string): {data:State, save():void}` (loads existing file, creates dirs, atomic write via temp+rename); `createApp(config, store): (req,res)=>void`; `http.mjs` exports `readJson(req, maxBytes=64_000)`, `readBody(req, maxBytes): Promise<Buffer>`, `send(res, status, obj)`, `fail(res, status, message)`, `Router` with `.on(method, pattern, handler)` where `:param` segments fill `params`.
- State shape: `{sessions:{}, speakers:{}, attendance:{}, chat:{}, files:{}, polls:{}, recordings:{}}` keyed by session id.

- [ ] **Step 1: Write failing tests** in `test/store.test.mjs`: `store persists across restart` (create, mutate `data.sessions.a = {id:'a'}`, `save()`, `createStore` again → same data), `corrupt file falls back to empty state and keeps a .bak`, `loadConfig throws naming LIVEKIT_API_KEY when missing`, `GET /health returns {ok:true}` and `unknown route returns 404 {error}`, `CORS preflight OPTIONS returns 204 with allow-headers incl x-user-id, x-filename, x-seq`.
- [ ] **Step 2:** Run `node --test apps/live-server/test` → FAIL (modules missing).
- [ ] **Step 3:** Implement the five modules per Interfaces; `server.mjs` parses `.env` (KEY=VALUE lines) into `process.env` without a dependency, then listens on `config.port` and prints the LAN URL.
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** Commit `feat(live-server): skeleton, store, health`.

### Task 2: Sessions, token, speakers
**Files:** Create `src/jwt.mjs`, `src/routes/{sessions,token}.mjs`, `test/token.test.mjs`; Modify `src/app.mjs`
**Interfaces:**
- Consumes: Task 1 `Router`, `store`, `loadConfig`.
- Produces: `signLiveKitToken(grant: {identity,name,room,role:'host'|'student', speakAllowed:boolean}, cfg): string` (HS256 JWT; claims `iss`=apiKey, `sub`=identity, `name`, `nbf`/`exp` (6 h), `metadata`=`{"role":...}`, `video` grants exactly mirroring `grantFor` in `src/live/protocol.ts`).
- Routes: `POST /sessions` body `{id,tenantId,courseId,batchId?,title,startsAt,endsAt,hostId,record}` upsert (409 if `hostId` differs from the stored one); `GET /sessions?userId=` → `{sessions: Session[]}` (all non-cancelled); `POST /sessions/:id/end` header `x-user-id` must be host → status `ended`, 403 otherwise; `POST /token` `{sessionId,userId,name,role}` → `{url,token,role,speakAllowed}`; `POST /speakers` header `x-user-id` host-only `{sessionId,userId,on}` → `{ok:true}`.
- Room name is `${tenantId}:${sessionId}`.

- [ ] **Step 1: Write failing tests:** `token decodes with correct claims for host` (decode payload, assert `video.canPublish===true`, `canPublishSources` includes `screen_share`, `metadata.role==='host'`); `student token is listen-only` (`canPublish===false`, sources `[]`, `canPublishData===true`); `student after POST /speakers gets canPublish and sources microphone,camera, never screen_share`; `signature verifies with HMAC-SHA256 and apiSecret`; **role spoof:** `userId !== session.hostId with role host → 403`, `unknown session → 404`; `before window (11 min early) → 400 "opens 10 minutes before"`, `after end+31 min → 400`, `ended status → 400`; `speakers by non-host → 403`; `POST /sessions with different hostId on existing id → 409`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `jwt.mjs` (Web Crypto/`node:crypto`), routes, mount in `app.mjs`; error messages equal the strings in `live_join_check` for the shared cases. **Step 4:** Run → PASS. **Step 5:** Commit `feat(live-server): sessions, token, speakers`.

### Task 3: Attendance
**Files:** Create `src/routes/attendance.mjs`, `test/attendance.test.mjs`; Modify `src/app.mjs`
**Interfaces:** `POST /attendance/join|heartbeat|leave` bodies `{sessionId,userId,name?}`; `GET /attendance?sessionId=` (header `x-user-id` host-only) → `{rows:[{userId,name,joinedAt,minutes}]}`; `GET /attendance?userId=` → `{minutes:{[sessionId]:number}}`. Rule: each heartbeat/leave adds `min(now-lastBeat, 90 s)`; total capped at class length + 30 min; `join` after `leave` resumes the same row.
- [ ] **Step 1: Tests (injectable clock `createApp(config, store, {now})`):** `joining twice creates one row`, `heartbeats every 60 s for 10 min give 10 minutes`, **`a 3-hour gap between heartbeats adds at most 1.5 minutes`**, `total never exceeds class length + 30 min`, `leave adds final partial minutes and rounds down`, `host sees all rows, non-host gets 403`, `student ?userId= sees only their own minutes`.
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(live-server): attendance`.

### Task 4: Chat history and polls
**Files:** Create `src/routes/{chat,polls}.mjs`, `test/chat-polls.test.mjs`; Modify `src/app.mjs`
**Interfaces:** `POST /chat` `{sessionId,id,userId,by,kind:'chat'|'qa'|'qa_answer',text,at,ref?}` (text 1–500; duplicate `id` ignored); `GET /chat?sessionId=` → last 500 items ascending; `POST /polls` (host-only) `{sessionId,id,q,options,quiz,correct?,votes}` upsert by `id`; `GET /polls?sessionId=` → list.
- [ ] **Step 1: Tests:** `history returns messages in order`, `duplicate id stored once`, `501-char text → 400`, `empty text → 400`, `history capped at 500`, `non-host cannot POST /polls (403)`, `poll upsert replaces earlier results for same id`, `chat survives store reload` (Review Focus 1).
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(live-server): chat history and polls`.

### Task 5: File sharing
**Files:** Create `src/routes/files.mjs`, `test/files.test.mjs`; Modify `src/app.mjs`
**Interfaces:** `POST /files?sessionId=&name=` raw body, header `x-user-id` host-only → `{id,name,size,url}` where `url` = `/files/<id>/<safeName>`; `GET /files?sessionId=` → `{files:[...]}`; `GET /files/:id/:name` streams with `Content-Disposition: attachment` and the right `Content-Type`. `sanitizeName(name:string): string|null` exported (strips path parts, keeps `[A-Za-z0-9._ -]`, null if extension not allowed or empty).
- [ ] **Step 1: Tests (Review Focus 2, 3, 4):** `sanitizeName('../../etc/passwd.pdf') === 'passwd.pdf'`, `sanitizeName('evil.exe') === null`, `sanitizeName('') === null`, `26 MB body → 413 and nothing written`, `non-host upload → 403`, `uploaded file downloads byte-identical`, `list returns files for late joiner`, `files are stored under data/files/<id> not by user-supplied name`.
- [ ] **Step 2–4:** fail → implement (stream to disk, abort at limit) → pass. **Step 5:** Commit `feat(live-server): file sharing`.

### Task 6: Recordings and server docs
**Files:** Create `src/routes/recordings.mjs`, `test/recordings.test.mjs`, `apps/live-server/README.md`; Modify `src/app.mjs`
**Interfaces:** `POST /recordings/:sid/chunk` (raw, headers `x-user-id` host, `x-seq` integer from 0; appends to `data/recordings/<sid>.webm`; `409` if `x-seq` ≠ expected next); `POST /recordings/:sid/finish`; `GET /recordings/:sid/info` → `{available:boolean, done:boolean, sizeBytes:number}`; `GET /recordings/:sid` serves `video/webm` with `Range` support (206) and 404 when absent.
- [ ] **Step 1: Tests:** `three chunks concatenate in order`, `out-of-order seq → 409 and file unchanged`, `retrying the same seq is idempotent`, `non-host → 403`, `Range bytes=0-9 returns 206 with 10 bytes`, `info before finish shows done=false`, `finish on unknown session → 404`.
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** README documents: LiveKit Cloud project setup, `.env`, `node server.mjs`, LAN IP for phones, endpoint table. Run the full `node --test apps/live-server/test` → all PASS. Commit `feat(live-server): recordings and docs`.

---

## Part B — App foundations

### Task 7: Protocol, poll tally, board maths
**Files:** Modify `apps/student/src/live/protocol.ts`, `tests/business/live-room.test.ts`; Create `src/live/{poll,board}.ts`
**Interfaces:**
- `RoomMsg` gains `{t:'poll_result'; id:string; votes:number[]}`, `{t:'file'; id:string; name:string; size:number; url:string}`, `{t:'board_request'}`; `poll` gains `quiz?:boolean`; `poll_close` gains `correct?:number`; `qa_answer.id` documents "question id". `HOST_ONLY` adds `poll_result`, `file`. `decodeMsg` validates every new field.
- `diffJoined(prevIds: string[], people: {id:string}[]): string[]` → ids present now but not before (excluding none).
- `createTally(optionCount:number): {vote(identity:string, option:number): boolean; counts(): number[]; total(): number; has(identity:string): boolean}` — first valid vote per identity counts, later or out-of-range votes return `false`.
- `board.ts`: `BOARD_W=1000`, `BOARD_H=562`, `toBoardPoint(x:number,y:number,w:number,h:number): [number,number]` (scales and clamps to the board), `strokePath(pts:[number,number][]): string` (SVG `M/L` path).
- [ ] **Step 1: Failing tests** (extend `live-room.test.ts`; update the host-only count assertion to 9): round-trip of `poll_result`, `file`, `board_request`, quiz `poll`, `poll_close` with `correct`; rejects `poll_result` with negative/non-number votes, `file` with empty name or non-string url, `quiz` non-boolean; `student blocked from poll_result and file`; `diffJoined(['a'],[{id:'a'},{id:'b'}]) → ['b']`; tally: `same identity voting twice counts once`, `option 7 of 4 ignored`, `counts() sums to total()`; board: `toBoardPoint(50,25,100,50) → [500,281]`, `clamps negative and overflow into 0..1000 / 0..562`, `strokePath([[1,2],[3,4]]) === 'M1 2L3 4'`.
- [ ] **Step 2:** Run `bash tests/business/run.sh` (user) → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(live): protocol v2, tally, board maths`.

### Task 8: Server client and config
**Files:** Create `src/live/{config,api}.ts`, `tests/business/live-api.test.ts`
**Interfaces:**
- `config.ts`: `LIVE_API: string` from `process.env.EXPO_PUBLIC_LIVE_API ?? 'http://localhost:8787'` (trailing slash trimmed).
- `createLiveApi(base: string, fetchFn: typeof fetch = fetch)` returns methods, each throwing `ApiError(code,message)` using the server's `{error}` text: `registerSession(s)`, `listSessions(userId)`, `endSession(id,hostId)`, `token({sessionId,userId,name,role})`, `speaker({sessionId,userId,on},hostId)`, `attendanceJoin/Beat/Leave({sessionId,userId,name?})`, `attendanceFor(sessionId,hostId)`, `minutesFor(userId)`, `postChat(item)`, `getChat(sessionId)`, `uploadFile({sessionId,name,body:Blob|ArrayBuffer},hostId)`, `listFiles(sessionId)`, `fileUrl(file)`, `recordingChunk(sessionId,seq,body,hostId)`, `recordingFinish`, `recordingInfo`, `recordingUrl(sessionId)`, `savePoll(poll,hostId)`. Plus `liveApi = createLiveApi(LIVE_API)`.
- [ ] **Step 1: Failing tests with a stub `fetchFn`:** `token posts JSON to /token with the body`, `host-only calls send x-user-id`, `server {error:"Only enrolled…"} surfaces as ApiError message`, `network failure → ApiError('offline','Can’t reach the live server. Is it running?')`, `fileUrl joins base and server path`.
- [ ] **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(live): server client`.

### Task 9: Data layer cut-over and dummy-data removal
**Files:** Modify `src/api/client.ts` (`liveTab`, `liveAdmin`, `unified`, 286/336/975 `seedLive` uses), `src/api/catalogSeed.ts` (`liveSessions`, `MISSED_PAST`), `src/api/mockDb.ts` (seeded `attendance`), `src/api/client.ts` `liveAdmin.summary` fabricated defaults; Create `tests/business/live-seed.test.ts`
**Interfaces:**
- `liveTab.schedule(userId, tenantId)`: sources rows from `liveApi.listSessions(userId)` joined with local enrolment/batch membership and `liveApi.minutesFor(userId)`; returns the same shape as today (`liveNow, upcoming, past, stats, calendarSync`), `past` rows carry `recording: {available:boolean; url:string|null}`. Caches fetched sessions in a module map used by `liveTab.session(id)` (sync) and `liveTab.load(id): Promise<ReturnType<typeof liveTab.session>>` (fetches if missing).
- `liveTab.join(userId, sessionId): Promise<{url:string; token:string; role:'student'; speakAllowed:boolean}>` — enrolment check stays local, then `liveApi.token` + `attendanceJoin`; `provider: 'mock'` removed. `liveTab.leave` → `attendanceLeave`. `liveAdmin.joinHost` → `liveApi.token(role:'host')`. `liveAdmin.schedule` and `liveAdmin.start` call `liveApi.registerSession` (record flag from settings); `liveAdmin.end` calls `endSession`. `liveSessions` seed becomes `[]`, `MISSED_PAST` removed, seeded `attendance` becomes `[]`. `liveAdmin.summary` no longer fabricates text/chapters/materials: a class without a stored summary returns real attendance/Q&A/polls only, empty arrays elsewhere.
- [ ] **Step 1: Failing tests (`live-seed.test.ts`, stub `liveApi`):** `liveSessions seed is empty`, `a fresh learner's Live tab has no rows`, `registered session for an enrolled course appears under upcoming/liveNow/past by time`, `session for a course the learner is not enrolled in is hidden`, `join rejects not_enrolled and too_early without calling the server`, `join never returns provider mock`, `past row exposes recording.available from recordingInfo`, `liveAdmin.summary for a class with no stored summary has empty chapters/materials/qa`. Update affected assertions in the existing business tests that rely on seeded live data (find with `seedLive`, `ls_now`, `lp_`, `u_arjun` attendance); list each changed assertion in the commit message.
- [ ] **Step 2:** user runs `bash tests/business/run.sh` → FAIL. **Step 3:** Implement; run `npm run typecheck` and fix every consumer of the removed seeds (Home upcoming-live card, course page live section, educator live list) so empty arrays render their existing empty states. **Step 4:** run → PASS. **Step 5:** Commit `feat(live): real data layer, remove live dummy data`.

### Task 10: LiveKit adapter additions
**Files:** Modify `src/live/livekit.ts`, `src/ui/RoomVideo.tsx`
**Interfaces:** `RoomClient` gains `localStreams(): {cam: MediaStream|null; screen: MediaStream|null; mic: MediaStreamTrack|null}`, `remoteAudioTracks(): MediaStreamTrack[]` (for the recorder mix), `onState('reconnecting' | 'reconnected')` surfaced; `connect` accepts an optional `{ autoReconnect: true }`; `RoomHandlers.onPeople` entries include `handUp` is NOT added (hands are messages). `RoomVideo` gains optional `label` prop for the accessibility label (default "Instructor video").
- [ ] **Step 1:** Add to `live-room.test.ts` a check that `livekit.ts` exports `RoomClient` with `localStreams` (type-level via `typeof`). **Step 2:** user runs typecheck → FAIL. **Step 3:** Implement. **Step 4:** typecheck → PASS. **Step 5:** Commit `feat(live): adapter additions`.

---

## Part C — Student room (run `ui-consistency:finding-patterns` first and save its checklist to `docs/superpowers/plans/2026-11-10-live-ui-checklist.md`; each UI task below follows it, and Task 17 runs `ui-consistency:verifying`)

### Task 11: Student room shell, join, people, stage
**Files:** Create `src/live/useStudentRoom.ts`, `src/live/ui/{Stage,RoomTopBar,RoomControls,PeoplePanel}.tsx`; Modify `src/app/live-room/[id].tsx` (rewrite as a shell); Remove from it `BOT_LINES, SLIDES, PEOPLE, FILES`, simulated intervals, fake viewers, `1 / 24`, fake hand acknowledgement.
**Interfaces:** `useStudentRoom(sessionId:string, userId:string, userName:string): {state:'loading'|'joining'|'in'|'error'; error:string; connection:'connected'|'reconnecting'|'lost'; people:PersonInfo[]; hostCam:MediaStream|null; hostScreen:MediaStream|null; elapsedSec:number; speakAllowed:boolean; send(m:RoomMsg):void; setMic(on:boolean):Promise<void>; setCam(on:boolean):Promise<void>; leave():Promise<void>; onMessage(cb:(m:RoomMsg,from:PersonInfo)=>void):()=>void}`. It loads the session with `liveTab.load`, joins, runs the 60 s attendance heartbeat, reconnects once on `lost`, and leaves on unmount. `Stage({hostCam,hostScreen,board,hostName,wide})` picks screen > board > camera > "Waiting for <host> to start video…" placeholder.
- [ ] **Step 1:** Add a layout test script `tests/e2e/live_layout.py` (Playwright, Python, style of `desktop_layout.py`) that loads `/live-room/x` with the server stopped and asserts at 360, 768 and 1280 px: no horizontal overflow, an error banner with a "Back" button is visible. **Step 2:** user runs it → FAIL. **Step 3:** Implement hook, components, shell; People tab lists real participants (host first, "You" for self, mic icon from `micOn`), count in the tab label is real. **Step 4:** typecheck + script → PASS. **Step 5:** Commit `feat(live): student room shell on real data`.

### Task 12: Chat and Q&A (student)
**Files:** Create `src/live/ui/{ChatPanel,QaPanel}.tsx`, `src/live/useRoomChat.ts`; Modify the shell
**Interfaces:** `useRoomChat(room, sessionId, me:{id,name}): {chat:ChatItem[]; questions:{id,by,text,at,answered:boolean,answer?:string}[]; sendChat(text):'ok'|'rate_limited'|'empty'; ask(text):'ok'|'rate_limited'|'empty'}` — loads `liveApi.getChat` once on join, merges data-channel messages by `id` (no duplicates), posts own messages to `liveApi.postChat`, marks a question answered when a `qa_answer` with its id arrives. `ChatItem = {id,by,role:'student'|'instructor'|'me'|'system',text,at}`.
- [ ] **Step 1: Failing tests** (`tests/business/live-chat.test.ts`, pure reducer `mergeChat(existing, incoming)` exported from `useRoomChat.ts`): `history and live message with same id merge to one`, `qa_answer marks only its question answered`, `messages stay ordered by at`, `501-char draft is trimmed to 500`, `sixth message in 5 s → rate_limited`. **Step 2–4:** fail → implement (panels use existing message bubble styles, empty states "No messages yet" / "No questions yet — ask the first one", composer pinned above the keyboard) → pass. **Step 5:** Commit `feat(live): student chat and Q&A`.

### Task 13: Reactions and raise hand (student)
**Files:** Create `src/live/ui/ReactionSheet.tsx`; Modify `RoomControls.tsx`, the shell
**Interfaces:** Reaction button opens a sheet with the four `REACTIONS`; choosing sends `{t:'react'}`, floats the emoji for the sender and for every incoming `react` (queue so rapid reactions don't overwrite, max 5 on screen); Raise hand toggles `{t:'hand', up}`, shows a "Hand raised" bar, clears when the host lowers it (`allow_speak` on/off) and, on `allow_speak {who: me, on:true}`, calls `liveTab.join` again to fetch a token with publish rights and reconnects; mic/cam buttons are disabled with tooltip text "Ask to speak first" until `speakAllowed`.
- [ ] **Step 1: Failing tests** (`live-chat.test.ts` or `live-room.test.ts`): pure `nextFloating(queue, emoji, max=5)` drops the oldest beyond 5; `reactions rate-limited by the same limiter`. **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(live): student reactions and raise hand`.

### Task 14: Poll and quiz (student)
**Files:** Create `src/live/ui/PollSheet.tsx`, `src/live/useRoomPoll.ts`; Modify the shell
**Interfaces:** `useRoomPoll(room, me): {poll: null | {id,q,options,quiz,votes:number[],mine?:number,closed:boolean,correct?:number}; vote(i:number):void}`. Opens on a new `poll` message; `poll_result` replaces `votes`; own vote is sent once and locked; `poll_close` freezes and, for a quiz, highlights `correct` and shows "Correct"/"Not quite" for `mine`. Banner above chat while a poll is open.
- [ ] **Step 1: Failing tests:** reducer `pollReducer(state, event)` — `new poll resets mine`, `poll_result updates votes`, `second vote ignored`, `close reveals correct only for quiz`, `result for a different poll id ignored`. **Step 2–4:** fail → implement (sheet on phone, dialog on desktop via `BottomSheet`) → pass. **Step 5:** Commit `feat(live): student poll and quiz`.

### Task 15: Whiteboard view and screen share (student)
**Files:** Create `src/live/ui/BoardView.tsx`, `src/live/useRoomBoard.ts`; Modify `Stage.tsx`, the shell
**Interfaces:** `useRoomBoard(room): {strokes: {color:string;w:number;pts:[number,number][]}[]; visible:boolean}`; `stroke` appends, `board_clear` empties, and on join the student sends `{t:'board_request'}` once; `BoardView({strokes})` renders an SVG with `viewBox="0 0 1000 562"`, white background, `aspectRatio: 16/9`, scales to any container; eraser strokes (`color:'eraser'`) are drawn in the background colour. Board shows when strokes exist or the host has opened it (`slide` message index `-1` is NOT used; the host's stage switch is announced with the existing `slide` message `index: 0` = camera, `1` = board, `2` = screen — documented in `protocol.ts`).
- [ ] **Step 1: Failing tests:** reducer `boardReducer` — `stroke appends`, `board_clear empties`, `strokes capped at 2000 (oldest dropped)`, plus `strokePath` use. **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(live): student whiteboard and screen share view`.

### Task 16: Files (student)
**Files:** Create `src/live/ui/FilesPanel.tsx`, `src/live/useRoomFiles.ts`; Modify the shell
**Interfaces:** `useRoomFiles(room, sessionId): {files:{id,name,size,url}[]}` — loads `liveApi.listFiles` on join, appends incoming `file` messages without duplicates; panel rows show icon by extension, size (`formatSize(bytes)`), tap/click downloads (`Linking.openURL` native, `<a download>` web); empty state "No files shared yet".
- [ ] **Step 1: Failing tests:** `formatSize(180*1024) === '180 KB'`, `formatSize(2.4*1024*1024) === '2.4 MB'`, `mergeFiles` dedupes by id (Review Focus 4). **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(live): student files`.

### Task 17: Live tab and recordings (student) + responsive verification
**Files:** Modify `src/app/(tabs)/live.tsx`, `src/app/live-room/[id].tsx` (recording mode); Create `docs/LIVE_CLASSES_TEST_CHECKLIST.md`
**Interfaces:** Live tab reads the Task 9 `schedule` result, shows attendance minutes per past class, and the recording player (`VideoSurface` is replaced by a plain `<video controls>` on web via `recordingUrl`; native shows "Open recording" using `Linking`); "Recording is being processed" when `recording.available===false && class ended`; "No recording" when the class had record off. Offline server shows `ErrorState` with Retry.
- [ ] **Step 1:** Extend `tests/e2e/live_layout.py` for the Live tab empty state at 360/768/1280. **Step 2–4:** fail → implement → pass. **Step 5:** Run `ui-consistency:verifying` over Tasks 11–17 and fix differences. Commit `feat(live): live tab, recordings, responsive verified`.

---

## Part D — Host room

### Task 18: Host room shell, hands and speaker approval
**Files:** Create `src/live/useHostRoom.ts`, `src/live/ui/host/HandList.tsx`; Modify `src/app/edu/host/[id].tsx`; Remove `CHAT_LINES`, `QUESTIONS`, the random simulation `useEffect`, `joined/peak` fakes, mock slides.
**Interfaces:** `useHostRoom(sessionId,userId,userName): {state, error, people, peak:number, hands:{userId:string;name:string;at:number}[], approve(userId):Promise<void>, lower(userId):Promise<void>, send(m), localStreams(), ...}`. `approve` → `liveApi.speaker(on:true)` then `{t:'allow_speak', who:userId, on:true}`; `lower` reverses. Peak = max participants seen. Whenever `diffJoined` returns ids, the host resends the open poll, the latest `poll_result`, the current stage switch and all board strokes (Review Focus 4 — wired in Tasks 19–20).
- [ ] **Step 1: Failing tests:** pure `handsReducer` — `hand up adds once`, `hand down removes`, `participant leaving removes their hand`, `order is first-raised first`. **Step 2–4:** fail → implement (hand list sits in the People tab and shows a count badge on the tab) → pass. **Step 5:** Commit `feat(live): host room on real data, hand approval`.

### Task 19: Host chat/Q&A answers and polls/quizzes
**Files:** Create `src/live/ui/host/PollComposer.tsx`, `src/live/useHostPoll.ts`; Modify the host screen
**Interfaces:** `useHostPoll(room, sessionId, userId): {active, start(def:{q:string;options:string[];quiz:boolean;correct?:number}):string|null, close():Promise<void>}` — uses `createTally` keyed by sender identity; broadcasts `poll_result` at most every 500 ms; `close` sends `poll_close` (with `correct` for quizzes), calls `liveApi.savePoll`, and records the poll for the class summary. Answering a question sends `{t:'qa_answer', id:<question id>, text}` and posts `kind:'qa_answer'` with `ref`. Validation: 2–6 non-empty options, quiz needs a correct option, question ≥ 4 chars.
- [ ] **Step 1: Failing tests:** `start rejects 1 option / 7 options / quiz without correct`, `votes from the same identity count once`, `vote for option 9 ignored`, `poll_result throttled to 2 per second`, `joiner mid-poll receives poll + current result` (via `diffJoined`). **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(live): host polls, quizzes, answers`.

### Task 20: Host whiteboard and screen share
**Files:** Create `src/live/ui/host/BoardToolbar.tsx`; Modify the host screen
**Interfaces:** The host canvas maps pointer positions with `toBoardPoint` before sending `stroke` (≤ 400 pts, lossy channel) and stores strokes to answer `board_request` and joiners by re-sending all strokes; toolbar: 5 pen colours, eraser, undo/redo, clear (`board_clear`); stage switch (camera / board / screen) announced with `slide` index 0/1/2; "Share screen" calls `RoomClient.setScreen` (web only; hidden on native with the text "Screen sharing is available from the web app").
- [ ] **Step 1: Failing tests:** `undo then redo restores a stroke`, `new stroke clears redo stack`, `board_request triggers a resend of all strokes in order`, `strokes longer than 400 points are split into chunks of 400`. **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(live): host whiteboard and screen share`.

### Task 21: Host file sharing
**Files:** Create `src/live/ui/host/FileUpload.tsx`; Modify the host screen
**Interfaces:** Pick with `expo-document-picker`, reject client-side before upload with the same rules as the server (`validateUpload(name,size): string|null` exported from `src/live/files.ts`), upload via `liveApi.uploadFile`, then broadcast `{t:'file', id, name, size, url}` and add to the summary `materials`; progress and error states shown in the Files tab.
- [ ] **Step 1: Failing tests:** `validateUpload('a.exe',10) → message`, `validateUpload('a.pdf', 26*1024*1024) → message`, `validateUpload('a.pdf', 1024) === null`. **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(live): host file sharing`.

### Task 22: Host recording
**Files:** Create `src/live/recorder.ts` (native stub: `isRecordingSupported=false`, `startRecording` throws), `src/live/recorder.web.ts`, `src/live/ui/host/RecordToggle.tsx`; Modify the host screen
**Interfaces:** `startRecording(opts:{video: MediaStream|null; audioTracks: MediaStreamTrack[]; upload:(seq:number, blob:Blob)=>Promise<void>; onError:(e:Error)=>void}): {stop():Promise<void>}` — mixes audio with `AudioContext`, `MediaRecorder` (`video/webm;codecs=vp8,opus`, fallback `video/webm`) with `timeslice` 5000, sequential uploads with 3 retries, `stop` flushes the last chunk then calls `recordingFinish`. Toggle shows a timer and a red dot; on upload failure shows "Recording interrupted" and keeps the class running. Auto-starts only if the session's `record` flag is on and the host confirms.
- [ ] **Step 1: Failing tests (pure part):** `chunkQueue` – `uploads run strictly in seq order`, `a failed upload retries 3 times then reports error`, `stop waits for pending uploads`. **Step 2–4:** fail → implement → pass. **Step 5:** Commit `feat(live): host recording`.

### Task 23: End class, summary, handoff docs
**Files:** Modify `src/app/edu/host/[id].tsx` (end flow), `src/app/edu/summary/[id].tsx`, `src/api/client.ts` (`liveAdmin.end`), `docs/LIVE_CLASSES.md` (rewrite for the local-first setup), `apps/student/README`/root `README.md` §6 table (Live room row), `tests/business/run.sh` (also runs `node --test ../live-server/test`)
**Interfaces:** `liveAdmin.end` receives real `elapsedSec`, `peak`, `qa`, `polls`, `materials`, `chatCount`, and attendance from `liveApi.attendanceFor`; it stops recording, closes the room, calls `endSession`. Summary screen shows real attendance rows, polls with results, Q&A with answers, files, recording link; sections with no data show empty states (no fabricated text).
- [ ] **Step 1: Failing tests:** `liveAdmin.end stores attended = rows with minutes>0`, `summary.qa contains only real questions`, `summary has no default chapters/materials when none were added`. **Step 2–4:** fail → implement → pass. **Step 5:** Final verification: user runs `npm run typecheck`, `bash tests/business/run.sh`, `node --test apps/live-server/test`, then the manual checklist in `docs/LIVE_CLASSES_TEST_CHECKLIST.md` (two browser windows; each of the ten features at 360, 768 and 1280 px). Commit `feat(live): end-of-class flow, docs, handoff`.

---

## Self-Review
- **Spec coverage:** §3 architecture → Tasks 1–2, 8–9; §4 API → Tasks 1–6; §5 protocol → 7; §6 features: video/audio 11/13/18, whiteboard 15/20, screen share 15/20, chat/Q&A 12/19, reactions 13, hand 13/18, poll/quiz 14/19, attendance 3/9/17/23, recording 6/17/22, files 5/16/21; §7 UI/responsive → 11–23 plus the e2e layout script and checklist; §8 dummy-data removal → 9 and 11, 18, 23; §9 testing → every task plus Task 23; §10 run → Task 6 README and Task 23 docs; §11 limits → documented in README/docs.
- **Type consistency:** `PersonInfo`, `RoomMsg`, `createTally`, `diffJoined`, `toBoardPoint`, `liveApi.*` names are defined once (Tasks 7, 8, 10) and reused unchanged.
- **Stage-switch note:** the spec did not define how the host announces the active stage; Task 15/20 reuse `slide` (0 camera, 1 board, 2 screen) rather than adding a message.
