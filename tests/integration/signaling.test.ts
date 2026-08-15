import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { SessionRegistry } from '../../server/src/session/registry'
import { handleConnection } from '../../server/src/ws-handler'

describe('signaling server', () => {
  let httpServer: ReturnType<typeof createServer>
  let wss: WebSocketServer
  let port: number

  beforeAll(async () => {
    httpServer = createServer()
    wss = new WebSocketServer({ server: httpServer, path: '/ws' })
    const registry = new SessionRegistry()
    wss.on('connection', (ws) => {
      handleConnection(ws, registry, () => {})
    })
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve())
    })
    const address = httpServer.address() as { port: number }
    port = address.port
  })

  afterAll(async () => {
    wss.close()
    httpServer.close()
  })

  function connect(kind: 'host' | 'guest', displayName: string): Promise<{
    ws: WebSocket
    inbox: Array<{ type: string; payload: unknown }>
    peerId: string
    waitFor: (type: string, timeoutMs?: number) => Promise<{ type: string; payload: unknown; from?: string }>
  }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
      const inbox: Array<{ type: string; payload: unknown; from?: string }> = []
      const waiters: Array<{ type: string; resolve: (m: unknown) => void }> = []
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'hello', payload: { kind, displayName } }))
      })
      ws.on('message', (d) => {
        const msg = JSON.parse(d.toString()) as { type: string; payload: unknown; from?: string }
        inbox.push(msg)
        const idx = waiters.findIndex((w) => w.type === msg.type)
        if (idx >= 0) {
          waiters.splice(idx, 1)[0].resolve(msg)
        }
      })
      ws.on('error', reject)
      ws.on('message', () => {
        const welcome = inbox.find((m) => m.type === 'welcome')
        if (welcome) {
          const peerId = (welcome.payload as { peerId: string }).peerId
          resolve({
            ws,
            inbox,
            peerId,
            waitFor: (type, timeoutMs = 5000) =>
              new Promise((res, rej) => {
                const existing = inbox.find((m) => m.type === type)
                if (existing) return res(existing)
                const timer = setTimeout(() => {
                  const i = waiters.findIndex((w) => w.type === type)
                  if (i >= 0) waiters.splice(i, 1)
                  rej(new Error(`timeout waiting for ${type}`))
                }, timeoutMs)
                waiters.push({
                  type,
                  resolve: (m) => {
                    clearTimeout(timer)
                    res(m as { type: string; payload: unknown; from?: string })
                  }
                })
              })
          })
        }
      })
    })
  }

  function send(ws: WebSocket, msg: unknown): void {
    ws.send(JSON.stringify(msg))
  }

  it('creates a session and returns a short code', async () => {
    const host = await connect('host', 'Host')
    send(host.ws, { type: 'create-session', payload: { displayName: 'Host' } })
    const created = await host.waitFor('session-created')
    const payload = created.payload as { code: string; sessionId: string; expiresAt: number }
    expect(payload.code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/)
    expect(payload.expiresAt).toBeGreaterThan(Date.now())
    host.ws.close()
  })

  it('lets a guest join with a code and notifies the host', async () => {
    const host = await connect('host', 'Host')
    send(host.ws, { type: 'create-session', payload: { displayName: 'Host' } })
    const created = await host.waitFor('session-created')
    const code = (created.payload as { code: string }).code

    const guest = await connect('guest', 'Guest')
    send(guest.ws, { type: 'join-session', payload: { code, displayName: 'Guest' } })
    const joined = await guest.waitFor('session-joined')
    const joinedPayload = joined.payload as { hostId: string; sessionId: string }
    expect(joinedPayload.hostId).toBe(host.peerId)
    expect(joinedPayload.sessionId).toBe((created.payload as { sessionId: string }).sessionId)

    const peerJoined = await host.waitFor('peer-joined')
    const peerJoinedPayload = peerJoined.payload as { peerId: string; displayName: string }
    expect(peerJoinedPayload.peerId).toBe(guest.peerId)
    expect(peerJoinedPayload.displayName).toBe('Guest')
    host.ws.close()
    guest.ws.close()
  })

  it('relays offers, answers and ICE candidates between peers', async () => {
    const host = await connect('host', 'Host')
    send(host.ws, { type: 'create-session', payload: { displayName: 'Host' } })
    const created = await host.waitFor('session-created')
    const sessionId = (created.payload as { sessionId: string }).sessionId

    const guest = await connect('guest', 'Guest')
    send(guest.ws, { type: 'join-session', payload: { code: (created.payload as { code: string }).code, displayName: 'Guest' } })
    await guest.waitFor('session-joined')
    await host.waitFor('peer-joined')

    send(host.ws, { type: 'offer', to: guest.peerId, sessionId, payload: { sdp: { type: 'offer', sdp: 'v=0' } } })
    const offer = await guest.waitFor('offer')
    expect((offer as { from: string }).from).toBe(host.peerId)

    send(guest.ws, { type: 'answer', to: host.peerId, sessionId, payload: { sdp: { type: 'answer', sdp: 'v=0' } } })
    const answer = await host.waitFor('answer')
    expect((answer as { from: string }).from).toBe(guest.peerId)

    send(guest.ws, {
      type: 'ice-candidate',
      to: host.peerId,
      sessionId,
      payload: { candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5678 typ host', sdpMid: '0', sdpMLineIndex: 0 } }
    })
    const ice = await host.waitFor('ice-candidate')
    expect((ice as { from: string }).from).toBe(guest.peerId)
    host.ws.close()
    guest.ws.close()
  })

  it('rejects unknown session codes', async () => {
    const guest = await connect('guest', 'Guest')
    send(guest.ws, { type: 'join-session', payload: { code: 'ZZZ-ZZZ', displayName: 'Guest' } })
    const notFound = await guest.waitFor('session-not-found')
    expect((notFound.payload as { code: string }).code).toBe('ZZZ-ZZZ')
    guest.ws.close()
  })

  it('rejects guests trying to create sessions', async () => {
    const guest = await connect('guest', 'Guest')
    send(guest.ws, { type: 'create-session', payload: { displayName: 'Guest' } })
    const error = await guest.waitFor('error')
    expect((error.payload as { code: string }).code).toBe('forbidden')
    guest.ws.close()
  })

  it('rejects malformed messages', async () => {
    const guest = await connect('guest', 'Guest')
    send(guest.ws, { type: 'offer', payload: 'garbage' })
    const error = await guest.waitFor('error')
    expect((error.payload as { code: string }).code).toBe('invalid-message')
    guest.ws.close()
  })

  it('propagates host disconnect and expires the session', async () => {
    const host = await connect('host', 'Host')
    send(host.ws, { type: 'create-session', payload: { displayName: 'Host' } })
    const created = await host.waitFor('session-created')
    const code = (created.payload as { code: string }).code

    const guest = await connect('guest', 'Guest')
    send(guest.ws, { type: 'join-session', payload: { code, displayName: 'Guest' } })
    await guest.waitFor('session-joined')
    await host.waitFor('peer-joined')

    host.ws.close()
    const left = await guest.waitFor('peer-left')
    expect((left as { from: string }).from).toBeUndefined()

    // The code should no longer be joinable
    const late = await connect('guest', 'Late')
    send(late.ws, { type: 'join-session', payload: { code, displayName: 'Late' } })
    await late.waitFor('session-not-found')
    guest.ws.close()
    late.ws.close()
  })
})