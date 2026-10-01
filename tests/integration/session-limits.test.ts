import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { SessionRegistry } from '../../server/src/session/registry'
import { handleConnection } from '../../server/src/ws-handler'

describe('session creation limits (per-IP DoS guard)', () => {
  let httpServer: ReturnType<typeof createServer>
  let wss: WebSocketServer
  let port: number
  let registry: SessionRegistry

  beforeAll(async () => {
    httpServer = createServer()
    registry = new SessionRegistry()
    wss = new WebSocketServer({ server: httpServer, path: '/ws' })
    wss.on('connection', (ws) => {
      handleConnection(ws, registry, () => {}, {
        ip: '9.9.9.9',
        canCreateSession: () => false,
        recordSessionCreated: () => {},
        recordSessionEnded: () => {}
      })
    })
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve())
    })
    port = (httpServer.address() as { port: number }).port
  })

  afterAll(async () => {
    wss.close()
    httpServer.close()
  })

  it('rejects create-session with session-limit when IP is over quota', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    const error = await new Promise<{ type: string; payload: unknown }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for error')), 5000)
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'hello', payload: { kind: 'host', displayName: 'H' } }))
      })
      ws.on('message', (d) => {
        const msg = JSON.parse(d.toString()) as { type: string; payload: unknown }
        if (msg.type === 'welcome') {
          ws.send(JSON.stringify({ type: 'create-session', payload: { displayName: 'H' } }))
        }
        if (msg.type === 'error') {
          clearTimeout(timer)
          resolve(msg)
        }
      })
      ws.on('error', reject)
    })
    expect((error.payload as { code: string }).code).toBe('session-limit')
    ws.close()
  })
})
