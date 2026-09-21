# Sight — Fix Log & Current Context

> Last updated: 2026-09-21. This file exists so anyone picking up the project
> knows exactly what was broken, what was changed, and how to run it.
> Base: `sight-main.zip` (Sight v0.1.0 — Electron 31 + Svelte 4 + Vite 5 +
> WebRTC P2P screen sharing with a Node `ws` signaling server).

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
- UI is currently 1 host + 1 guest; the server already supports up to
  `MAX_PARTICIPANTS=8`.
- Suggested follow-ups: multi-guest viewer UI, `electron-updater` wiring,
  time-limited TURN credentials, ESLint.
