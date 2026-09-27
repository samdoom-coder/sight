# Sight

**Instant peer-to-peer screen sharing, made ridiculously simple.**

Sight is a lightweight, cross-platform desktop app for instant screen sharing, remote cursor
collaboration, and low-friction pairing — a modern alternative to heavyweight tools like
TeamViewer or AnyDesk. No accounts. No central video proxy. Just a short code and a direct,
encrypted peer-to-peer connection.

---

## Features

- **Instant sessions** — start sharing with one click, join with a short code (`8K4-X9P`)
- **Real WebRTC** — true `RTCPeerConnection` media transport, not a demo or simulation
- **Direct P2P by default** — screen/audio traffic flows peer-to-peer whenever the network allows it
- **TURN fallback** — automatic relay when direct connectivity is impossible
- **Multi-cursor collaboration** — see every participant's cursor with unique colors,
  smoothed and throttled over a WebRTC data channel
- **Live connection quality** — RTT, bitrate, frame rate, packet loss, direct/relay type
- **Robust error handling** — clear, human explanations for every failure
- **No accounts, no telemetry by default** — privacy-respecting by design
- **Secure by construction** — `contextIsolation`, sandboxed renderer, tightly scoped IPC,
  ephemeral server-side sessions

## Tech stack

| Layer       | Technology                                             |
| ----------- | ------------------------------------------------------ |
| Desktop     | Electron 41 · TypeScript 5.9 · Svelte 5 · Vite 7         |
| Networking  | WebRTC · WebSocket signaling · STUN · TURN · ICE       |
| Server      | Node.js 22.12+ · TypeScript · `ws`                  |
| Packaging   | electron-builder (NSIS / DMG / AppImage / deb)          |
| Testing     | Vitest (unit + integration)                             |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Start the signaling server (terminal 1)
npm run server

# 3. Start the desktop app in dev mode (terminal 2)
npm run dev        # renderer (Vite dev server)
npm run dev:main   # Electron main process
```

The dev flow uses `electron .` after building `dist/`. See [DEVELOPMENT.md](./DEVELOPMENT.md)
for the full development workflow.

## Scripts

| Script           | Description                                        |
| ---------------- | -------------------------------------------------- |
| `npm run dev`    | Vite dev server for the renderer                   |
| `npm run dev:main` | Watch-mode Electron main process                  |
| `npm run build`  | Build main, preload, server, and renderer           |
| `npm run start`  | Launch the packaged `dist/` build in Electron       |
| `npm run package`| Build installers for the current platform           |
| `npm run test`   | Run unit, integration and e2e tests (Vitest)       |
| `npm run typecheck` | Type-check main, renderer, and server            |
| `npm run server` | Run the signaling server from source                |

## How it works

```
Host                    Signaling Server                Guest
 │                            │                            │
 │  create-session ──────────▶│                            │
 │  ◀───── 8K4-X9P ───────────│                            │
 │                            │◀──── join-session ────────│
 │                            │      SDP offer ──────────▶│
 │◀────────── SDP answer ─────│                            │
 │◀────────── ICE candidates ─│─────── ICE candidates ────▶│
 │                            │                            │
 │◀───────────────── WebRTC (screen + audio + data) ──────▶│
```

The signaling server only relays tiny signaling messages. Screen and audio traffic never
touches the server; it flows directly between peers (or through TURN only when required).

## Project structure

```text
src/
  main/            Electron main process (window, ipc, capture, permissions, system)
  preload/         Context-isolated bridge exposing a tightly scoped API
  renderer/        Svelte UI (pages, components, stores, services)
  shared/          Types, constants, protocol, and pure libs used everywhere
server/
  src/             Signaling server (Node/TS/WebSocket)
tests/
  unit/            Pure-logic tests (codes, cursor, state machine, validation)
  integration/     Signaling server end-to-end tests
  e2e/             Production build-artifact smoke tests
```

## Configuration

Copy `.env.example` to `.env.development` and `.env.production` and fill in your signaling
URL and STUN/TURN servers. See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design and WebRTC flow
- [DEVELOPMENT.md](./DEVELOPMENT.md) — local development, build, and packaging
- [DEPLOYMENT.md](./DEPLOYMENT.md) — running signaling, STUN, and TURN in production
- [SECURITY.md](./SECURITY.md) — security model and hardening
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — common issues and fixes

## License

MIT