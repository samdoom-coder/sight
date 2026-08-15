# Architecture

Sight is an Electron desktop application with a signaling server. This document describes the
system design, the WebRTC flow, and the responsibilities of each module.

## 1. High-level overview

```
┌─────────────────────────── Desktop App ───────────────────────────┐
│                                                                   │
│  Renderer (Svelte)                                                │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│   │ Home / Host  │ │ Join / View  │ │ Settings /   │             │
│   │  pages       │ │  viewer      │ │ Diagnostics  │             │
│   └──────┬───────┘ └──────┬───────┘ └──────┬───────┘             │
│          │                │                │                      │
│   ┌──────┴────────────────┴────────────────┴──────┐              │
│   │            Services layer                     │              │
│   │  SessionService (orchestrator)                │              │
│   │   ├─ WebRTCService                            │              │
│   │   ├─ SignalingService                         │              │
│   │   ├─ CursorService                            │              │
│   │   ├─ ConnectionMonitor                        │              │
│   │   ├─ ScreenCaptureService                     │              │
│   │   └─ AudioService                             │              │
│   └──────────────┬────────────────────────────────┘              │
│                  │  window.desktop (preload bridge)              │
│                  ▼                                                │
│   Preload (contextIsolation, sandbox)                            │
│                  │  IPC (scoped channels only)                   │
│                  ▼                                                │
│   Electron Main Process                                          │
│    ├─ window/    window lifecycle                                 │
│    ├─ ipc/       registered IPC handlers                         │
│    ├─ capture/   desktopCapturer source discovery                │
│    ├─ permissions/  macOS screen-recording permission            │
│    └─ system/    platform, external links, settings store        │
└───────────────────────────────────────────────────────────────────┘
```

### Separation of concerns

- **UI** (renderer pages/components) never touches WebRTC or Node APIs directly.
- **Networking** (WebRTC, signaling, ICE, reconnection) lives in the renderer services.
- **Privileged operations** (screen capture, permissions, settings persistence) live in the
  Electron main process and are exposed only through a narrow, typed preload API.
- **Pure logic** (session codes, cursor math, connection state machine, protocol validation)
  lives in `src/shared` so it can be unit-tested and reused by the server.

## 2. WebRTC flow

### Host path

1. Host clicks **Start a session** and picks a capture source.
2. `SessionService.start()` opens the signaling WebSocket and sends `hello`.
3. Server replies `welcome` with the host's peer id; host sends `create-session`.
4. Server returns a short code (`8K4-X9P`) and `session-created`.
5. When a guest joins, the host receives `peer-joined` and creates an `RTCPeerConnection`
   with the captured screen stream, creates the `sight-data` data channel, and sends an
   `offer` (SDP) to the guest through the signaling server.
6. ICE candidates are exchanged through the server until the connection is established.
7. On `iceConnectionState === connected`, media flows peer-to-peer. Cursor and participant
   state flow over the data channel.

### Guest path

1. Guest enters a code and clicks **Connect**.
2. `SessionService.start()` connects signaling and sends `join-session`.
3. Server replies `session-joined` with the host's id, and notifies the host.
4. The host's `offer` arrives; the guest creates a `RTCPeerConnection` (no local media),
   sets the remote description, produces an `answer`, and relays it back.
5. ICE completes → remote video is attached to the `<video>` element and cursors appear.

```
Host                        Server                       Guest
 │  hello+create-session ────▶│                             │
 │  ◀───── session-created ───│                             │
 │                            │◀── hello+join-session ─────│
 │  ◀───── peer-joined ───────│  session-joined ──────────▶│
 │  offer ───────────────────▶│───────────────────────────▶│
 │                            │◀────────── answer ─────────│
 │  ◀───────────────── ice-candidate exchange ─────────────│
 │◀═════════════════ WebRTC media + data ═════════════════▶│
```

## 3. Signaling protocol

All signaling messages are JSON envelopes:

```ts
interface SignalEnvelope {
  type: SignalType
  payload: unknown
  from?: string
  to?: string
  sessionId?: string
}
```

### Messages (client → server)

| Type              | Payload                                | Purpose                          |
| ----------------- | -------------------------------------- | -------------------------------- |
| `hello`           | `{ kind: 'host'|'guest', displayName }`| Authenticate the socket role     |
| `create-session`  | `{ displayName }`                      | Host requests a new session      |
| `join-session`    | `{ code, displayName }`                | Guest joins by code              |
| `offer`           | `{ sdp }`                              | Relay SDP offer to a peer        |
| `answer`          | `{ sdp }`                              | Relay SDP answer to a peer       |
| `ice-candidate`   | `{ candidate }`                        | Relay an ICE candidate           |
| `peer-renamed`    | `{ displayName }`                      | Notify peers of a rename         |
| `ping`            | `{}`                                   | Keepalive                        |

### Messages (server → client)

| Type                 | Payload                          | Purpose                          |
| -------------------- | -------------------------------- | -------------------------------- |
| `welcome`            | `{ peerId }`                     | Assign a peer id                 |
| `session-created`    | `{ sessionId, code, expiresAt }` | Host session ready               |
| `session-joined`     | `{ sessionId, hostId, hostName }`| Guest joined                     |
| `peer-joined`        | `{ peerId, displayName }`        | A peer joined the session        |
| `peer-left`          | `{ peerId }`                     | A peer left / host ended         |
| `session-not-found`  | `{ code }`                       | Invalid code                     |
| `session-expired`    | `{ code }`                       | Session timed out                |
| `session-full`       | `{ code }`                       | Session at capacity              |
| `offer`/`answer`/`ice-candidate` | relayed payloads      | Peer signaling                   |
| `error`              | `{ code, message }`              | Error response                   |

The server validates every message (type allow-list, payload shape, size limits) and rate
limits each connection. Session state is ephemeral and held in memory only.

## 4. Data channel protocol

Once WebRTC connects, a dedicated `sight-data` data channel carries collaboration traffic.
This keeps cursors and participant state off the signaling server.

```ts
interface DataChannelMessage {
  v: 1
  type: 'cursor' | 'hello' | 'participant-state' | 'session-event' | 'control' | 'ping' | 'pong'
  payload: unknown
}
```

Cursor messages use normalized coordinates:

```ts
{ participantId: 'p_abc', x: 0.483, y: 0.271, timestamp: 123456789 }
```

The `CursorService` samples the host's mouse, throttles sends (~30ms), and interpolates
remote cursors on the receiving side for smooth motion with minimal traffic.

## 5. Connection quality

`ConnectionMonitor` polls `RTCPeerConnection.getStats()` every 2 seconds and derives:

- **RTT** from `candidate-pair.currentRoundTripTime`
- **Bitrate** from outbound RTP byte deltas
- **Frame rate** from outbound RTP `framesPerSecond`
- **Packet loss** from inbound RTP counters
- **Connection type** from local/remote candidate types (`host`/`srflx`/`relay`)

Metrics are exposed to the UI for the quality indicator and the diagnostics panel.

## 6. Reconnection

- On `iceConnectionState === disconnected|failed`, the app transitions to `reconnecting`,
  shows the state, and calls `restartIce()` with backoff (up to 4 attempts).
- Signaling disconnects automatically reconnect with exponential backoff (max 15s).
- If the host closes the app or the session ends, guests receive `peer-left` /
  `session-event { kind: 'ended' }` and the UI leaves the connected state.

## 7. Screen capture

- The main process uses `desktopCapturer.getSources()` to list screens and windows
  (with thumbnails and app icons).
- macOS: `systemPreferences` is used to check/request **Screen Recording** permission;
  denied state is surfaced with actionable instructions.
- The renderer captures the chosen source via `getUserMedia` with the Electron
  `chromeMediaSource: 'desktop'` constraint.

## 8. Multi-participant design

`Participant` models are stored per peer:

```ts
interface Participant {
  id: string
  displayName: string
  cursor: CursorPosition | null
  connectionState: ParticipantState
  audioState: boolean
  videoState: boolean
  isHost: boolean
  isSelf: boolean
  color: string
  rtt: number | null
}
```

The signaling server supports up to `MAX_PARTICIPANTS` peers and relays SDP/ICE between any
pair, so group collaboration can be added to the UI without rewriting the networking layer.
The current UI limits the active flow to a single host/guest pair.

## 9. Directory reference

```text
src/main/             Electron main process
  index.ts              app bootstrap, single-instance lock
  window/index.ts       BrowserWindow creation + secure webPreferences
  ipc/index.ts          scoped IPC handler registration
  capture/index.ts      desktop source discovery
  permissions/index.ts  screen-recording permission checks
  system/index.ts       platform helpers
  system/settings.ts    JSON settings store in userData
src/preload/index.ts    contextBridge: exposes window.desktop
src/renderer/           Svelte UI
  pages/                Home, HostPicker, Host, Join, Joining, Viewer, Settings, Diagnostics
  components/           TitleBar, Toast
  services/             Session, WebRTC, Signaling, Cursor, Audio, ConnectionMonitor, Capture, config
  stores/               session (active service), toast, router
src/shared/             types, constants, protocol, lib (codes, cursor, state machine)
server/src/             signaling server
  index.ts                HTTP + WebSocket bootstrap
  ws-handler.ts           message routing per connection
  session/registry.ts     ephemeral session store
  protocol/validate.ts    message validation
  security/rate-limiter.ts per-connection rate limiting
tests/                  unit + integration tests
```