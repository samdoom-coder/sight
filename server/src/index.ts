import { createServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import {
  ALLOWED_ORIGINS,
  HEARTBEAT_INTERVAL_MS,
  HOST,
  MAX_SESSIONS_PER_IP,
  PORT,
  SERVER_VERSION,
  SHUTDOWN_TIMEOUT_MS
} from './config'
import { SessionRegistry } from './session/registry'
import { encodeMessage } from './protocol/validate'
import { handleConnection } from './ws-handler'

const registry = new SessionRegistry()

// Active session count per client IP (DoS guard: caps create-session per IP).
const sessionsPerIp = new Map<string, number>()
const sessionIp = new Map<string, string>()

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket.remoteAddress ?? 'unknown'
}

function setSecurityHeaders(res: { setHeader: (k: string, v: string) => void }): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-store')
}

const httpServer = createServer((req, res) => {
  setSecurityHeaders(res)
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        version: SERVER_VERSION,
        uptime: Math.floor(process.uptime()),
        sessions: registry.size,
        peers: registry.peerCount
      })
    )
    return
  }
  if (req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sight signaling</title>` +
        `<style>body{font-family:system-ui,sans-serif;background:#0f1115;color:#e6e6e6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{text-align:center;padding:40px;border:1px solid #2a2f3a;border-radius:12px;background:#161a22;max-width:420px}h1{font-size:22px;margin:0 0 8px}.ok{color:#4ade80;font-weight:600}code{background:#0f1115;padding:2px 6px;border-radius:6px;font-size:13px}p{color:#9aa3b2;font-size:14px;line-height:1.6}</style></head>` +
        `<body><div class="card"><h1>Sight signaling server</h1><p class="ok">● Online</p><p>This service relays WebRTC signaling. It has no web UI — the app connects to the WebSocket endpoint below.</p><p><code>wss://${req.headers.host}/ws</code></p></div></body></html>`
    )
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('Not found')
})

const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

function canCreateSession(ip: string): boolean {
  return (sessionsPerIp.get(ip) ?? 0) < MAX_SESSIONS_PER_IP
}

function recordSessionCreated(ip: string, sessionId: string): void {
  sessionsPerIp.set(ip, (sessionsPerIp.get(ip) ?? 0) + 1)
  sessionIp.set(sessionId, ip)
}

function recordSessionEnded(ip: string, sessionId: string): void {
  if (sessionIp.get(sessionId) !== ip) return
  sessionIp.delete(sessionId)
  const current = sessionsPerIp.get(ip) ?? 0
  if (current <= 1) sessionsPerIp.delete(ip)
  else sessionsPerIp.set(ip, current - 1)
}

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const origin = req.headers.origin
  // Native Electron / Node ws clients send no Origin; browsers do.
  // Only reject when an explicit Origin is present and not allow-listed.
  if (origin && !ALLOWED_ORIGINS.includes('*') && !ALLOWED_ORIGINS.includes(origin)) {
    log(`Rejected connection with disallowed origin=${origin}`)
    ws.close(4403, 'Forbidden origin')
    return
  }
  const ip = getClientIp(req)
  ;(ws as unknown as { isAlive: boolean }).isAlive = true
  ws.on('pong', () => {
    ;(ws as unknown as { isAlive: boolean }).isAlive = true
  })
  log(`Connection from ${ip}${origin ? ` origin=${origin}` : ''}`)
  handleConnection(ws, registry, log, { ip, canCreateSession, recordSessionCreated, recordSessionEnded })
})

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

// WS-level heartbeat: drop dead peers that never answer pong.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const state = ws as unknown as { isAlive: boolean }
    if (state.isAlive === false) {
      ws.terminate()
      continue
    }
    state.isAlive = false
    ws.ping()
  }
}, HEARTBEAT_INTERVAL_MS)
heartbeat.unref()

// Expire sessions and notify remaining peers instead of vanishing silently.
const expirer = setInterval(() => {
  const expired = registry.expire()
  for (const session of expired) {
    for (const peer of session.peers.values()) {
      const ws = peer.ws as WebSocket
      if (ws.readyState === ws.OPEN) {
        ws.send(encodeMessage({ type: 'session-expired', payload: { code: session.code } }))
        ws.close(4400, 'Session expired')
      }
    }
    const ip = session.creatorIp
    if (ip) recordSessionEnded(ip, session.id)
  }
  if (expired.length > 0) {
    log(`Expired ${expired.length} session(s)`)
  }
}, 60 * 1000)
expirer.unref()

let shuttingDown = false
function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  log(`Received ${signal}, draining...`)
  clearInterval(heartbeat)
  clearInterval(expirer)
  wss.close(() => {
    httpServer.close(() => {
      log('Shutdown complete')
      process.exit(0)
    })
  })
  setTimeout(() => {
    log('Shutdown forced after timeout')
    process.exit(0)
  }, SHUTDOWN_TIMEOUT_MS).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

httpServer.listen(PORT, HOST, () => {
  log(`Sight signaling server v${SERVER_VERSION} listening on ws://${HOST}:${PORT}/ws`)
  log(`Limits: MAX_SESSIONS_PER_IP=${MAX_SESSIONS_PER_IP} HEARTBEAT=${HEARTBEAT_INTERVAL_MS}ms`)
})
