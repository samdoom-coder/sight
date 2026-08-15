import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { HOST, PORT, SESSION_TTL_MS } from './config'
import { SessionRegistry } from './session/registry'
import { handleConnection } from './ws-handler'

const registry = new SessionRegistry()

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }))
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

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin
  log(`Connection from ${req.socket.remoteAddress ?? 'unknown'}${origin ? ` origin=${origin}` : ''}`)
  handleConnection(ws, registry, log)
})

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

setInterval(() => {
  const before = registry.size
  registry.expire()
  const after = registry.size
  if (before !== after) {
    log(`Expired ${before - after} session(s)`)
  }
}, 60 * 1000).unref()

httpServer.listen(PORT, HOST, () => {
  log(`Sight signaling server listening on ws://${HOST}:${PORT}/ws`)
})