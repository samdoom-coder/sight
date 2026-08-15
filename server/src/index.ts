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