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
| `will-navigate`       | app URL only             | Blocks renderer navigation to remote origins               |
| Permission handler    | app URL only             | Denies camera/mic/etc. to any non-app origin               |
| IPC sender check      | trusted URL required     | Rejects IPC from unexpected frames/origins                 |
| `setWindowOpenHandler`| external links only      | No new Electron windows / arbitrary navigation             |

The preload exposes a single object `window.desktop` with a **tightly scoped API**
(`src/shared/types/desktop-api.ts`): capture source listing, permission checks, window
controls, settings, and telemetry events. It never exposes `ipcRenderer` directly, `require`,
`process`, or the filesystem.

IPC channels are allow-listed in `src/shared/constants/ipc.ts`. Every handler checks that the
sender URL is the app (dev server or `dist/renderer`), and the main process validates
arguments before acting (e.g., the capture source must exist, external URLs must be `http(s)`).

## 3. Renderer CSP

The renderer `index.html` ships a strict Content-Security-Policy:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:;
font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'
```

This blocks remote script injection, inline scripts, and unexpected network origins. Fonts
are bundled with the app instead of loaded from Google Fonts, so startup does not leak the
user's IP or depend on network access.

## 4. Signaling security

- **Origin validation** — `ALLOWED_ORIGINS` limits which origins may connect; set it to your
  real origins in production (not `*`).
- **Message validation** — every message is validated against a type allow-list with payload
  shape checks (`server/src/protocol/validate.ts`). Malformed messages are rejected and never
  routed.
- **Size limits** — `ws` rejects frames larger than `MAX_MESSAGE_BYTES` before buffering;
  the handler also checks the decoded size.
- **Connection limits** — `MAX_CONNECTIONS_PER_IP` caps concurrent WebSocket sockets per
  address, and `MAX_SESSIONS_PER_IP` caps active sessions.
- **Rate limiting** — per-connection token-bucket limiter (`RATE_LIMIT_WINDOW_MS`,
  `RATE_LIMIT_MAX_MESSAGES`) prevents abuse.
- **Proxy-aware IPs** — `X-Forwarded-For`/`X-Real-IP` are only trusted with `TRUST_PROXY=1`;
  otherwise the socket address is used, so clients cannot spoof their way around per-IP limits.
- **State guards** — one hello, one session per connection; repeated `create-session` /
  `join-session` attempts are rejected instead of leaving orphaned sessions.
- **Role enforcement** — only `host` sockets may `create-session`; only `guest` sockets may
  `join-session`.
- **Relay scoping** — SDP/ICE messages are only relayed to peers that are actually members of
  the same session; unknown `to` targets are ignored.

## 5. Session security

- **Cryptographically strong ids** — session ids and peer ids are generated with
  `node:crypto.randomBytes` (128-bit and 96-bit respectively).
- **Unambiguous short codes** — codes use a 32-character alphabet without lookalike
  characters (`A-F`, `J-K`, etc.), generated with CSPRNG bytes. Short codes are convenient,
  not a security boundary — treat them like a meeting PIN.
- **Ephemeral sessions** — session state lives in memory only, has a sliding idle expiry
  (`SESSION_TTL_MS`, refreshed by signaling activity), and is destroyed when the host
  explicitly ends it or its reconnect grace window expires. No history is stored.
- **Host resume token** — a 256-bit token is issued only to the host. A reconnecting host
  can rebind its new signaling socket inside `HOST_RECONNECT_GRACE_MS`; the token is
  compared in constant time. Guests cannot use it to impersonate the host.
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
- "Reset app settings" removes the locally stored settings file.
- No accounts. No tracking cookies. No analytics SDKs.

## 9. Reporting

If you find a vulnerability, please open a private issue in the repository and include a
minimal reproduction. Do not share exploit details publicly before a fix is released.