# Sight — Fix Log & Current Context

> Last updated: 2026-11-23. This file exists so anyone picking up the project
> knows exactly what was broken, what was changed, and how to run it.
> Base: `sight-main.zip` (Sight v0.1.0 — Electron 31 + Svelte 4 + Vite 5 +
> WebRTC P2P screen sharing with a Node `ws` signaling server).

## 0.2.0 release summary (2026-11-23)

Sight 0.2.0 adds multi-guest viewing, host session resume, guest pointer
collaboration, ephemeral TURN credentials, Playwright Electron E2E coverage, and
release signing/notarization scaffolding. See sections 0–0d below for the detailed
change log. The app/server version is now `0.2.0`.

## 0. Correctness/privacy patch (2026-11-23)

- Viewer/Diagnostics now subscribe to the live `SessionService` stores instead of the
  one-shot `sessionStore.phase` snapshot. Reconnect and "Session ended" states work again.
- Fixed async `onMount` cleanups in Viewer/TitleBar that leaked global key handlers and
  store subscriptions after navigation.
- A guest pressing **End** now leaves the session instead of terminating the host's session;
  host-only "ended" semantics are enforced.
- Ending a session stops local screen/audio capture tracks and clears the pending stream.
- Host audio: the "include system audio" flow no longer starts muted, mute actually disables
  the captured track, audio is re-attached after a guest reconnects, and guest mute controls
  are hidden (guests do not send audio).
- Host tears down the peer connection when its guest leaves, so the next guest can connect.
  `MAX_PARTICIPANTS` now defaults to 2 to match the 1:1 UI.
- ICE restart now performs a real offer/answer renegotiation; guests wait for the host's
  recovery offer. Disconnected state is debounced for 2.5s.
- Cursor overlay maps into the actual letterboxed video rect; host cursor coordinates use the
  selected display's bounds. Window shares do not draw a misleading cursor overlay.
- Connection metrics now include inbound bitrate/FPS for viewers, resolve the video codec by
  `codecId`, and expose frame dimensions.
- RTT sparkline uses canvas-compatible colors; view gets a local preview for the host.
- Server: sliding session TTL (the Settings idle-timeout value is now sent per session),
  one hello/one session per socket, per-IP connection cap, `maxPayload`, proxy-aware client
  IPs, sanitized code logging, active client drain on shutdown.
- Electron: app-only `will-navigate` and permission handlers, IPC sender validation,
  self-hosted fonts, tighter CSP.
- Added `npm run check` (svelte-check) and wired it into CI; fixed the Home shake-animation
  type error, removed the broken `dev:watch` script, and clarified the dev commands.

## 0b. Multi-guest + session resume (2026-11-23)

- Host now keeps one `RTCPeerConnection` per guest instead of a single connection. Each
  guest gets the screen/audio stream and a dedicated data channel.
- Server notifies existing guests when a new guest joins (not just the host), so every
  participant list stays complete.
- Cursor messages received by the host are rebroadcast to the other guests.
- Host metrics aggregate bitrate/frame rate/RTT across guests; guest metrics stay
  per-connection.
- Host disconnects from signaling are held for `HOST_RECONNECT_GRACE_MS` (default 60s).
  The host resumes with a 256-bit token, keeps its code, and re-offers to any peer that
  needs recovery. Explicit host end and grace expiry still tear the session down.
- Guest signaling reconnect closes stale peer connections and rejoins the same code, so the
  host creates a fresh connection for it.
- `MAX_PARTICIPANTS` is back to 8 total (host + 7 guests), with bandwidth scaling documented.
- Integration tests cover multi-guest joins, capacity, host resume, bad resume tokens, and
  host-ended sessions.

## 0c. Guest pointer collaboration (2026-11-23)

- Guests now send their pointer position while moving over the host video. The host
  attributes the message to the sender's peer connection, updates that participant, and
  relays it to the other viewers.
- Added a "share my pointer" toggle (and `P` shortcut) to the guest viewer. Host cursors
  continue to appear on every viewer.
- Letterbox mapping is now a tested shared helper (`fitContainRect`), so pointers and
  cursor overlays stay aligned in fit/actual/fullscreen modes.

## 0d. Ephemeral TURN credentials (2026-11-23)

- Server can mint coturn REST credentials when `TURN_URLS` + `TURN_SECRET` are set; the
  username embeds an expiry and the credential is HMAC-SHA1(secret, username).
- `session-created`, `session-joined`, and `session-resumed` carry short-lived `iceServers`;
  the desktop app prefers them over static `VITE_TURN_*` values.
- Added `TURN_TTL_SECONDS` (default 24h, clamped 60s–24h) and unit tests for the credential
  format.
- coturn/deployment docs switched from a static `user=` entry to `use-auth-secret`.

## 0e. Release engineering (2026-11-23)

- Bumped app/server to `0.2.0`.
- Added Playwright Electron E2E tests: boot + capture picker, host/guest video, and guest
  pointer relay. CI runs them under Xvfb with Chromium's fake media device so headless
  runners are deterministic.
- Added electron-builder `afterSign` notarization (`scripts/notarize.cjs`), conditional
  macOS/Windows signing secrets, and removed the forced-unsigned DMG config.
- Release workflow now runs typecheck/check/tests, publishes signed artifacts when secrets
  are present, and pushes the signaling Docker image to GHCR.
- Added `test:e2e`, `build:e2e`, and `playwright.config.ts`; documented signing secrets and
  local E2E requirements.

## 1. How to run (Windows PowerShell / macOS / Linux)

```powershell
npm install
npm run setup            # creates .env.development + .env from .env.example
# terminal 1
npm run server           # signaling: ws://<HOST>:8787/ws  (+ GET /health)
# terminal 2
npm run dev              # Vite renderer: http://localhost:5173
# terminal 3
npm run dev:main         # builds main+preload, launches Electron on the Vite URL
```

Use the **Electron window** to host/share (browsers cannot do
`desktopCapturer` screen capture). A browser tab on the same PC works as a
**guest** for testing. After editing any `VITE_*` var, restart `npm run dev`
(Vite bakes them in at startup) and `npm run server`.

Other commands: `npm run build` (+ `npm start`), `npm run smoke` (headless
signaling round-trip), `npm run test` (52 tests), `npm run typecheck`.

## 2. Environment

`.env.example` is the template (`npm run setup` copies it). Important rules:

- `VITE_SIGNALING_URL` **must** end with `/ws` — the server only accepts
  WebSocket upgrades on the `/ws` path. The app also normalizes any URL by
  appending `/ws` if missing (`src/shared/lib/signaling-url.ts`).
- Renderer variables **must** carry the `VITE_` prefix (Vite only exposes
  `VITE_*` to the app). The old bare `SIGNALING_URL` key was invisible.
- The server loads `.env.development` / `.env` itself (no dotenv dependency —
  see `server/src/config.ts`); explicit process env always wins.
- Same-PC testing works with defaults (`ws://localhost:8787/ws`,
  `stun:stun.l.google.com:19302`). Other devices must use the host's LAN
  address (e.g. `ws://192.168.1.20:8787/ws`) with the server bound to
  `0.0.0.0` and port 8787 reachable. Strict NATs/firewalls need TURN
  (`VITE_TURN_*`, see `DEPLOYMENT.md`).

## 3. Bugs found and fixed

### 3.1 Signaling URL missing `/ws` (nothing could ever connect)
- Client default was `ws://localhost:8787`; server listens on `/ws` only, so
  every handshake failed with HTTP 400.
- Fix: `src/shared/lib/signaling-url.ts` (new) with `normalizeSignalingUrl()`;
  used by `services/config.ts`; defaults updated to `ws://localhost:8787/ws`;
  `.env.example` corrected to `VITE_SIGNALING_URL=ws://localhost:8787/ws`.

### 3.2 `hello` handshake never sent (no session ever created)
- `SessionService.onConnectedToSignaling()` existed but was never called, so
  `create-session` / `join-session` never fired; UI stuck on "Connecting…".
- Fix: `SessionService` now calls it whenever signaling status becomes
  `connected` (`src/renderer/src/services/SessionService.ts`).

### 3.3 Host ICE candidates sent to itself (WebRTC could never establish)
- `onIceCandidate` used `hostId` for both roles; for the host that is its own
  id, so candidates went nowhere.
- Fix: track `remotePeerId` (set on `peer-joined` / `session-joined` / inbound
  `from`) and route ICE to it.

### 3.4 ICE candidate queue was inverted (remote candidates could be dropped)
- `WebRTCService` queued *outgoing* candidates and re-added them to itself.
- Fix: queue *incoming* candidates arriving before the remote description is
  set; flush after `setRemoteDescription` in `handleOffer`/`handleAnswer`.

### 3.5 `npm run dev:main` never launched Electron (and broke on Windows)
- Old script (`tsx watch src/main/index.ts`) only watched TS: no build, no
  Electron, no `VITE_DEV_SERVER_URL`; preload/renderer paths only resolved
  inside `dist/`.
- Fix: `dev:main` = `build:main + build:preload + cross-env
  VITE_DEV_SERVER_URL=http://localhost:5173 electron .` (cross-platform via
  the new `cross-env` devDependency); `src/main/window/index.ts` resolves
  preload/renderer paths with `dist/` + `cwd` fallbacks.

### 3.6 Server ignored `.env` files; origins never checked
- `tsx server/...` doesn't auto-load `.env*`; `ALLOWED_ORIGINS` was defined
  but never enforced.
- Fix: minimal `.env.development`/`.env`/`.env.production` loader in
  `server/src/config.ts`; origin check in `server/src/index.ts` (origin-less
  native/Electron clients always allowed; explicit browser origins checked
  unless `*`).

### 3.7 All buttons dead — Svelte 5 event syntax on Svelte 4
- All 51 handlers used `onclick=` / `oninput=` / `onkeydown=` / `onchange=` /
  `onloadedmetadata=` / `onresize=` (Svelte 5 style); the project pins Svelte
  4, which only understands `on:click=` etc. Clicking "Start a session" did
  literally nothing.
- Fix: converted all handlers in 9 files (`Home`, `HostPicker`, `HostPage`,
  `JoinPage`, `JoiningPage`, `ViewerPage`, `SettingsPage`, `DiagnosticsPage`,
  `TitleBar`) to Svelte 4 syntax.

### 3.8 Sessions suicided on viewer navigation ("code works, nothing shared")
- `JoiningPage` navigated to the viewer on `connected`, then its unmount
  teardown called `service.endSession()` — killing the just-established
  WebRTC + signaling connection (server log: `Guest joined` → `Peer left`
  ~0.6s later). `HostPage` did the same when clicking "Open viewer".
- Fix: teardowns only unsubscribe; the live session belongs to
  `sessionStore`. Ending is explicit only (End buttons via
  `clearActiveSession()`; retry button ends a *failed* session before
  navigating back). `JoiningPage` service variable hoisted so retry can reach
  it.

### 3.9 Failures were silent
- Added `[signaling]` / `[session]` / `[webrtc]` debug logs (connect, message
  direction/type, ICE states, tracks, errors incl. dropped sends) so the
  DevTools console (F12 / Ctrl+Shift+I) shows exactly where a session stops.

### 3.10 Developer experience
- `scripts/setup-env.mjs` + `npm run setup` (cross-platform env bootstrap).
- `scripts/smoke-signaling.ts` + `npm run smoke` (headless host→guest→
  offer/answer/ICE relay check, no Electron needed).
- `tests/unit/signaling-url.test.ts` (4 tests).
- `HostPicker` shows an explicit banner in plain browsers explaining screen
  share requires the Electron window (previously just an empty list).

## 4. Verification (all green on 2026-09-21)

- `npm run typecheck` — clean (main + renderer + server).
- `npm run test` — 8 files, **52/52 pass** (48 pre-existing + 4 new).
- `npm run smoke` — `SMOKE OK: hello, session, offer/answer, ICE relay`.
- `npm run build` — `dist/main`, `dist/preload`, `dist/server`,
  `dist/renderer` produced.
- `node dist/server/index.js` — `/health` returns `{"status":"ok"}`.
- Manual same-PC test: Electron host → browser guest joins with code → video
  flows and the session stays alive (previously: instant `Peer left`).

## 5. Known limitations / next steps

- `wgc_capture_session.cc … ProcessFrame failed` spam in the Electron console
  is Windows capture-layer noise (Chromium reuses the last good frame).
  Harmless when video is live; revisit only if frames freeze (try another
  screen/window source, update GPU drivers).
- No TURN by default: same-LAN works; internet/strict-NAT guests need
  `VITE_TURN_*` (coturn) — see `DEPLOYMENT.md`.
- Multi-guest viewing is supported, but the host uploads one stream per guest; for large
  audiences the next step is an SFU-backed mode.
- Suggested follow-ups: time-limited TURN credentials, ESLint, signed
  releases, and a browser-based guest viewer.
