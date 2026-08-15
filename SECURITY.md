# Security

Sight is designed to be secure by construction. This document describes the security model,
the threat model, and the hardening measures in place.

## 1. Threat model

Sight's primary flows:

1. **Signaling** — small JSON messages exchanged through a public WebSocket server.
2. **Media** — screen video and optional audio, encrypted end-to-end via WebRTC.
3. **Collaboration** — cursor positions and participant state over a WebRTC data channel.
4. **Local** — the desktop app runs untrusted network code in a sandboxed renderer.

Security goals:

- An attacker cannot read or tamper with screen content (DTLS-SRTP encryption).
- An attacker cannot inject commands into the host machine (no remote control).
- An attacker cannot hijack sessions or impersonate peers (cryptographically strong ids,
  ephemeral sessions, message validation).
- A malicious web page cannot reach Node/Electron APIs (context isolation + sandbox).

## 2. Electron hardening

| Setting               | Value                    | Why                                                        |
| --------------------- | ------------------------ | ---------------------------------------------------------- |
| `contextIsolation`    | `true`                   | Renderer and preload live in separate worlds               |
| `nodeIntegration`     | `false`                  | No Node globals in the renderer                            |
| `sandbox`             | `true`                   | Preload runs sandboxed; renderer has no Node access        |
| `webSecurity`         | `true`                   | Standard web security enforced                             |
| `setWindowOpenHandler`| external links only      | No new Electron windows / arbitrary navigation             |

The preload exposes a single object `window.desktop` with a **tightly scoped API**
(`src/shared/types/desktop-api.ts`): capture source listing, permission checks, window
controls, settings, and telemetry events. It never exposes `ipcRenderer` directly, `require`,
`process`, or the filesystem.

IPC channels are allow-listed in `src/shared/constants/ipc.ts`. The main process validates
the shape of every argument before acting (e.g., the capture source must exist, external URLs
must be `http(s)`).

## 3. Renderer CSP

The renderer `index.html` ships a strict Content-Security-Policy:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; media-src 'self' blob:;
connect-src 'self' ws: wss:; font-src 'self' data:
```

This blocks remote script injection, inline scripts, and unexpected network origins.

## 4. Signaling security

- **Origin validation** — `ALLOWED_ORIGINS` limits which origins may connect; set it to your
  real origins in production (not `*`).
- **Message validation** — every message is validated against a type allow-list with payload
  shape checks (`server/src/protocol/validate.ts`). Malformed messages are rejected and never
  routed.
- **Size limits** — messages larger than `MAX_MESSAGE_BYTES` are dropped.
- **Rate limiting** — per-connection token-bucket limiter (`RATE_LIMIT_WINDOW_MS`,
  `RATE_LIMIT_MAX_MESSAGES`) prevents abuse.
- **Role enforcement** — only `host` sockets may `create-session`; only `guest` sockets may
  `join-session`.
- **Relay scoping** — SDP/ICE messages are only relayed to peers that are actually members of
  the same session; unknown `to` targets are ignored.

## 5. Session security

- **Cryptographically strong ids** — session ids and peer ids are generated with
  `node:crypto.randomBytes` (256-bit and 192-bit respectively).
- **Unambiguous short codes** — codes use a 32-character alphabet without lookalike
  characters (`A-F`, `J-K`, etc.), generated with CSPRNG bytes. Short codes are convenient,
  not a security boundary — treat them like a meeting PIN.
- **Ephemeral sessions** — session state lives in memory only, expires after
  `SESSION_TTL_MS`, and is destroyed when the host disconnects. No history is stored.
- **No persistence** — the signaling server stores no screen data and no session history.

## 6. Transport security

- **WebRTC media** is always encrypted (DTLS for the data channel and DTLS-SRTP for media).
  This is inherent to WebRTC and not optional.
- **Signaling** should be served over `wss://` in production (see DEPLOYMENT.md).
- **TURN** traffic is end-to-end encrypted by WebRTC; the relay cannot decrypt it.

## 7. Remote control

Sight **does not** implement remote keyboard/mouse control. If it is ever added, the
requirements are:

- Explicitly opt-in (host must enable it per session).
- Clearly visible in the UI at all times.
- Revocable instantly (host can revoke with one click).
- Permission-gated (never silently enabled).

## 8. Data minimization & privacy

- **Telemetry is opt-in and off by default.** When enabled, only non-sensitive events are
  queued locally in this build; nothing leaves the machine without a deployed collector.
- Settings are stored locally in the OS user-data directory.
- "Clear local session data" removes stored settings.
- No accounts. No tracking cookies. No analytics SDKs.

## 9. Reporting

If you find a vulnerability, please open a private issue in the repository and include a
minimal reproduction. Do not share exploit details publicly before a fix is released.