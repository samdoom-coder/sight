# Troubleshooting

Common problems when running, connecting, or packaging Sight — and how to fix them.

## The app won't launch

### Missing shared libraries on Linux

```
error while loading shared libraries: libatk-1.0.so.0
```

Install Electron's runtime dependencies:

```bash
sudo apt install libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libasound2 libnss3 libxss1 libgtk-3-0
```

### Headless / container environments

Run under a virtual display:

```bash
xvfb-run -a npm start
```

### "App threw an error during load" / module errors

The app loads `dist/main/index.cjs`. Rebuild everything:

```bash
rm -rf dist && npm run build
```

## The screen can't be captured

### macOS: "Screen recording permission is required"

1. Open **System Settings → Privacy & Security → Screen Recording**.
2. Enable **Sight** (you may need to click **+** and add the app).
3. Quit and relaunch Sight — the OS requires a restart of the app after granting.

Sight checks this permission before listing sources and shows instructions instead of failing
silently.

### Linux

- **Wayland**: capture requires a desktop portal (xdg-desktop-portal). Ensure a portal is
  installed and running, and grant the prompt.
- **X11**: most desktop environments work out of the box. If you see an empty list, make sure
  you're not running with restricted permissions.

### Windows

No extra permission is needed. If the source list is empty, ensure you're running with a
normal (non-restricted) user session.

## Can't connect between two machines

### Step 1 — signaling

1. Confirm the signaling server is reachable: `curl https://your-host/health` returns
   `{"status":"ok"}`.
2. Check the app's `SIGNALING_URL` matches your server (env / Settings).
3. Verify the server is served over `wss://` in production — browsers/Chromium refuse mixed
   content (`ws://` from `https://`).

### Step 2 — WebRTC / NAT

If both peers connect to signaling but video never appears:

- Check the diagnostics panel (⚡ in the viewer). If it shows **Relay (TURN)**, direct
  connectivity failed and TURN is carrying the stream — this is expected behind strict NATs.
- If it shows **Unknown** and RTT is `—`, ICE is stuck. Possible causes:
  - **No TURN server configured.** Add one (Settings → Network or `VITE_TURN_URL`). Direct
    P2P often fails behind carrier-grade NAT / corporate firewalls.
  - **UDP blocked.** TURN with TCP/TLS (`turn:` over 443) can help.
- Try both machines on the **same LAN** first to isolate network issues from config issues.

### Step 3 — firewall

Open the UDP range used for media on any firewall between peers (coturn default
49152–65535, or your `min-port`/`max-port`). The signaling port (8787) must be reachable
from clients.

## Connection drops or shows "Reconnecting"

Sight retries up to 4 times with `restartIce()`. If it keeps failing:

1. Check Wi-Fi/network stability on both ends.
2. Confirm the TURN server is up and its credentials are current (time-limited credentials
   expire).
3. Watch `server` logs for ICE or relay errors.

## "Session not found" / "Session expired"

- Codes are **case-insensitive** and ignore formatting (`8k4 x9p` → `8K4-X9P`).
- Sessions expire after `SESSION_TTL_MS` (default 30 min) and when the host disconnects.
- Ask the host to re-share the code from the live session screen.

## The host screen looks blurry / low FPS

- Bitrate adapts to the network. Poor quality usually means high latency or packet loss —
  check the quality indicator.
- Ensure the guest is not in **actual-size** mode with a tiny window.
- Hardware encode limitations can cap resolution on some setups.

## Cursors aren't showing

1. Verify the cursor toggle is enabled (cursor button in the viewer).
2. Cursors require the WebRTC data channel to be open — check the diagnostics panel.
3. Remote cursors use normalized coordinates, so mismatched display resolutions are fine.

## Tests / build

### `npm run test` fails to connect

The integration tests spin up an in-process server on an ephemeral port; no external service
is needed. If a port error occurs, check for a leftover process and retry.

### `npm run typecheck` errors

TypeScript projects for main, renderer, and server are checked separately. Fix the reported
file and re-run. The build (esbuild for main/preload/server, Vite for renderer) may still
succeed even if types are wrong — always run typecheck.

## Packaging

### electron-builder can't find an icon

Ensure `build/icon.png` exists (512×512 minimum). electron-builder generates platform icons
from it for Linux; provide `build/icon.ico` (Windows) and `build/icon.icns` (macOS) for the
best result.

### AppImage won't run

```bash
chmod +x release/*.AppImage
./release/*.AppImage --no-sandbox   # on restricted environments
```

### macOS "unidentified developer" warning

Sign and notarize the app, or right-click → Open once for local testing.

## Still stuck?

Check the app logs (main process output), the signaling server logs, and the diagnostics
panel. Common root causes are almost always **network reachability** (firewall/NAT) or
**missing TURN**.