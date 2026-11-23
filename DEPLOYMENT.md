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
export HOST_RECONNECT_GRACE_MS=60000
export ALLOWED_ORIGINS=app://sight,https://sight.example.com
export TRUST_PROXY=1
export MAX_CONNECTIONS_PER_IP=20
# Optional ephemeral TURN credentials (coturn REST API):
export TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349
export TURN_SECRET=CHANGE_ME_STATIC_AUTH_SECRET
export TURN_TTL_SECONDS=86400

node dist/server/index.js
```

`SESSION_TTL_MS` is a sliding idle timeout: valid signaling traffic (including the app's
20s heartbeat) keeps an active session alive. `MAX_PARTICIPANTS` includes the host (default
8 total). `HOST_RECONNECT_GRACE_MS` keeps a session/code alive while a disconnected host
reconnects; guests keep their P2P call during that window. When `TURN_URLS` and
`TURN_SECRET` are set, the server includes short-lived TURN credentials in session
responses, so the desktop bundle does not need a static TURN password.

Set `TRUST_PROXY=1` **only** when the server is behind a reverse proxy you control.
Otherwise `X-Forwarded-For` is attacker-controlled and the per-IP limits can be bypassed.

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
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
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

# Short-lived credentials minted by the Signaling server.
use-auth-secret
static-auth-secret=CHANGE_ME_STATIC_AUTH_SECRET

# Optional: allow LAN traffic only where appropriate
# allowed-peer-ip=10.0.0.0/8

# TLS certificates for turn over TLS
cert=/etc/ssl/certs/fullchain.pem
pkey=/etc/ssl/private/privkey.pem

# STUN is included with coturn
```

Use the same `CHANGE_ME_STATIC_AUTH_SECRET` for `TURN_SECRET` on the Sight signaling
server. Credentials are then issued per session and expire after `TURN_TTL_SECONDS`.

Open the UDP/TCP range for media (default 49152–65535 or `min-port`/`max-port` you set).

### Health check

```bash
# Mint a credential with the same secret, or use a short-lived session credential
turnutils_uclient -u "<expiry>:sight" -w "<base64 hmac>" 127.0.0.1
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

The signaling server can mint coturn REST credentials itself. Set `TURN_URLS`,
`TURN_SECRET`, and `TURN_TTL_SECONDS` on the signaling server; every session response then
includes short-lived `iceServers` entries. The desktop app uses those for ICE gathering.

The static `.env.production` values remain a fallback for local/self-hosted TURN without a
signaling secret, but they are baked into the renderer bundle and should not be used for a
public deployment.

```
username = <expiry-unixtimestamp>:sight
password = base64(hmac_sha1(static-auth-secret, username))
```

Configure coturn with `use-auth-secret` and `static-auth-secret` as shown above.

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

`electron-updater` is already wired up. Packaged builds check GitHub Releases after startup;
downloads require user confirmation. To ship updates:

1. Bump `version` in `package.json`.
2. Sign and notarize macOS builds (auto-update requires it) and sign Windows installers.
3. Tag the release (`v*`); the release workflow builds and publishes artifacts.

Without signing, users can install manually but macOS auto-update will not work and Windows
will show SmartScreen warnings.

## 6. Operations checklist

- [ ] Signaling server behind TLS (`wss://`)
- [ ] `ALLOWED_ORIGINS` set to real origins (not `*`)
- [ ] Rate limiting enabled (defaults are sane; tune if needed)
- [ ] TURN deployed with strong, rotated credentials
- [ ] Client `.env.production` points at your signaling + TURN
- [ ] Session TTL matches your product expectations (`SESSION_TTL_MS`)
- [ ] Logs are monitored (`/health` endpoint returns `{"status":"ok"}`)