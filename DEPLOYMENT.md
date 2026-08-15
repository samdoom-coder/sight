# Deployment

How to run Sight's infrastructure in production: the signaling server, STUN, and TURN.

## Architecture

```
┌──────────────┐          ┌──────────────────┐          ┌──────────────┐
│  Sight (A)   │ ◀──────▶ │ Signaling server │ ◀──────▶ │  Sight (B)   │
│  desktop app │  WebSocket│   (wss)         │ WebSocket│  desktop app │
└──────┬───────┘          └──────────────────┘          └──────┬───────┘
       │                                                       │
       │◀══════════ WebRTC media (P2P, encrypted) ════════════▶│
       │                                                       │
       └──────── STUN discovery ──▶ stun.example.com ◀─────────┘
       └──────── TURN relay (only when needed) ─▶ turn.example.com ─┘
```

**Signaling server responsibilities:** session creation/joining, SDP + ICE relay, peer
notifications, session expiry. It never sees screen or audio content.

**STUN** helps peers discover their public addresses for direct connectivity.

**TURN** relays media only when direct connectivity fails (symmetric NATs, strict firewalls).
TURN traffic is encrypted end-to-end by WebRTC (DTLS-SRTP), so the TURN server cannot read it.

## 1. Signaling server

### Build

```bash
npm run build:server   # → dist/server/index.js
```

### Run with a process manager

Shortcuts (equivalent to the commands below):

```bash
npm run server:start   # node dist/server/index.js (requires prior build)
npm run server:prod    # build:server && node dist/server/index.js
```

```bash
# env
export PORT=8787
export HOST=0.0.0.0
export SIGNALING_URL=wss://signal.example.com   # for the app env, not the server itself
export SESSION_TTL_MS=1800000
export MAX_PARTICIPANTS=8
export ALLOWED_ORIGINS=app://sight,https://sight.example.com

node dist/server/index.js
```

Use `pm2`, `systemd`, or a container to keep it running. Ready-to-adapt examples are in [`deploy/`](../deploy): `nginx.conf.example` (TLS + WebSocket upgrade) and `sight-signaling.service.example` (systemd).

### systemd unit (example)

```ini
[Unit]
Description=Sight signaling server
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/sight/dist/server/index.js
Environment=PORT=8787
Environment=ALLOWED_ORIGINS=app://sight
Restart=always
User=sight

[Install]
WantedBy=multi-user.target
```

### TLS / reverse proxy

Serve the WebSocket over `wss://`. A reverse proxy (Caddy/nginx) in front of the server:

```
signal.example.com → 127.0.0.1:8787
```

**Caddy**

```caddy
signal.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

**nginx**

```nginx
server {
    listen 443 ssl;
    server_name signal.example.com;
    ssl_certificate     /etc/ssl/certs/fullchain.pem;
    ssl_certificate_key /etc/ssl/private/privkey.pem;

    location /ws {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
}
```

> **Important:** In production set `ALLOWED_ORIGINS` to the actual app origin(s) rather than
> `*` to prevent cross-site WebSocket hijacking.

## 2. STUN

Public STUN servers are fine for testing:

- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

For production, run your own or rely on your TURN server's built-in STUN.

## 3. TURN with coturn

TURN is required for reliable connections behind restrictive NATs/firewalls. Deploy
[coturn](https://github.com/coturn/coturn).

### Install

```bash
# Debian/Ubuntu
apt install coturn
```

### Configure `/etc/turnserver.conf`

```ini
listening-port=3478
tls-listening-port=5349
realm=turn.example.com
fingerprint
lt-cred-mech

# Static credentials (rotate regularly). Better: use a REST API / time-limited credentials.
user=sight:CHANGE_ME_STRONG_PASSWORD

# Optional: allow LAN traffic only where appropriate
# allowed-peer-ip=10.0.0.0/8

# TLS certificates for turn over TLS
cert=/etc/ssl/certs/fullchain.pem
pkey=/etc/ssl/private/privkey.pem

# STUN is included with coturn
```

Open the UDP/TCP range for media (default 49152–65535 or `min-port`/`max-port` you set).

### Health check

```bash
turnutils_uclient -u sight -w CHANGE_ME_STRONG_PASSWORD 127.0.0.1
```

## 4. Client configuration

In the app, Settings → Network lets users configure ICE servers. For managed deployments,
set these in `.env.production` (they are baked into the renderer at build time):

```env
VITE_SIGNALING_URL=wss://signal.example.com
VITE_STUN_URL=stun:turn.example.com:3478
VITE_TURN_URL=turn:turn.example.com:3478
VITE_TURN_USERNAME=sight
VITE_TURN_PASSWORD=CHANGE_ME_STRONG_PASSWORD
```

> Do not commit real TURN credentials. Generate them per deployment.

### Time-limited TURN credentials (recommended)

coturn supports REST API credentials. On the server, mint short-lived credentials:

```
username = <expiry-unixtimestamp>:<userid>
password = base64(hmac_sha1(static-auth-secret, username))
```

Configure the app to request these from your API before starting a session, and pass them as
`RTCIceServer` entries.

## 5. Packaging and distribution

```bash
npm run package
```

Artifacts land in `release/`:

- Windows: NSIS `.exe` + portable `.exe`
- macOS: `.dmg`
- Linux: `.AppImage` + `.deb`

### Distribution channels

- **Windows**: sign the installer (Authenticode) with a code-signing cert to avoid SmartScreen.
- **macOS**: sign + notarize the app and DMG (`electron-builder` supports this with your
  Apple Developer identity).
- **Linux**: ship the AppImage; attach the `.deb` for Debian/Ubuntu repos.

### Auto-updates

Sight's version lives only in `package.json`, so wiring `electron-updater` later is
straightforward:

1. Add `electron-updater` as a dependency.
2. Configure `publish` in the `build` block (GitHub Releases, generic server, etc.).
3. In `src/main`, check for updates on app start and install on quit.

## 6. Operations checklist

- [ ] Signaling server behind TLS (`wss://`)
- [ ] `ALLOWED_ORIGINS` set to real origins (not `*`)
- [ ] Rate limiting enabled (defaults are sane; tune if needed)
- [ ] TURN deployed with strong, rotated credentials
- [ ] Client `.env.production` points at your signaling + TURN
- [ ] Session TTL matches your product expectations (`SESSION_TTL_MS`)
- [ ] Logs are monitored (`/health` endpoint returns `{"status":"ok"}`)