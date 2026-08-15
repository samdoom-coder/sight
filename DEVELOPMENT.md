# Development

Guide for running, building, testing, and packaging Sight locally.

## Prerequisites

- Node.js ≥ 20
- npm ≥ 9
- A desktop environment (Linux needs X11/Wayland libs; see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md))

## Installation

```bash
npm install
```

## Development workflow

Sight is split into two processes during development:

### 1. Signaling server

```bash
npm run server
```

Runs the WebSocket signaling server (tsx) on `ws://localhost:8787/ws` (configurable via env).

### 2. Desktop app

The renderer uses the Vite dev server and the Electron main process loads from `dist/`:

```bash
npm run dev        # terminal A: Vite dev server (port 5173)
npm run dev:main   # terminal B: builds main and launches Electron
```

`dev:main` builds the main/preload/server bundles and launches Electron pointed at the Vite
dev server URL. If you change the main process, rebuild with `npm run build:main`.

> Alternative one-shot flow without the Vite server:

```bash
npm run build
npm start
```

## Build

```bash
npm run build
```

Produces:

- `dist/main/index.cjs` — bundled Electron main process
- `dist/preload/index.cjs` — sandboxed preload (CommonJS, self-contained)
- `dist/server/index.js` — bundled signaling server
- `dist/renderer/` — static Svelte renderer bundle

## Environment configuration

Copy `.env.example`:

```bash
cp .env.example .env.development
cp .env.example .env.production
```

Vite exposes `VITE_*` variables to the renderer at build time (`SIGNALING_URL`, `STUN_URL`,
`TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD`). The signaling server reads `PORT`, `HOST`,
`SESSION_TTL_MS`, `MAX_PARTICIPANTS`, and the rate-limit variables at runtime.
Never commit real TURN credentials.

## Testing

```bash
npm run test         # run once
npm run test:watch   # watch mode
```

- `tests/unit/` — session codes, cursor math, connection state machine, participant state,
  signaling message validation
- `tests/integration/` — the signaling server in-process: session lifecycle, SDP/ICE
  relay, invalid codes, disconnect propagation

## Type checking

```bash
npm run typecheck
```

Checks `src/main`, `src/renderer`, and `server` TypeScript projects.

## Linting

No ESLint is wired in by default. Run typecheck and the tests as the safety net. If you add
ESLint, prefer flat config and run it as part of `npm test`.

## Packaging

```bash
npm run package        # installers for the current platform
npm run package:dir    # unpacked dir (fast iteration)
```

### Targets

| Platform | Targets                          |
| -------- | -------------------------------- |
| Windows  | NSIS installer + portable exe    |
| macOS    | DMG (universal-friendly)         |
| Linux    | AppImage + deb                   |

electron-builder config lives in `package.json` (`build` field). Build resources live in
`build/` (icon is `build/icon.png`, 512×512).

### Release builds

1. Bump `version` in `package.json` (also drives installer versioning automatically).
2. Set production values in `.env.production` (`SIGNALING_URL` to your wss endpoint, TURN).
3. `npm run package`

### Updates

Sight currently ships without a bundled auto-updater. The architecture keeps the version in
`package.json` only, so integrating `electron-updater` later is straightforward — add it as a
dependency, configure the publish backend in the `build` block, and call `autoUpdater`
from the main process. See [DEPLOYMENT.md](./DEPLOYMENT.md) for hosting considerations.

## Common dev tasks

### Adding a page

1. Create `src/renderer/src/pages/MyPage.svelte`
2. Add a route in `src/renderer/src/routes/router.ts`
3. Mount it in `src/renderer/src/App.svelte`

### Adding an IPC channel

1. Add the channel name to `src/shared/constants/ipc.ts`
2. Register the handler in `src/main/ipc/index.ts`
3. Expose the method in `src/preload/index.ts` and type it in
   `src/shared/types/desktop-api.ts`

### Adding a shared pure function

1. Put it in `src/shared/lib/` (or `src/shared/protocol/`)
2. Import from `@shared/...` in the renderer or a relative path in the server
3. Add unit tests under `tests/unit/`

## Troubleshooting dev issues

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for renderer errors, capture failures, and
network connectivity problems.