// Smoke test for the full signaling flow as the app performs it.
// Spins up the real HTTP+WS server on an ephemeral port and drives a
// host + guest through hello -> create/join -> offer/answer/ICE relay.
// Run: npm run smoke
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { SessionRegistry } from '../server/src/session/registry'
import { handleConnection } from '../server/src/ws-handler'
import { normalizeSignalingUrl } from '../src/shared/lib/signaling-url'

interface Msg {
  type: string
  payload: unknown
  from?: string
  to?: string
  sessionId?: string
}

function waitFor(ws: WebSocket, type: string, timeoutMs = 5000): Promise<Msg> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      reject(new Error(`timeout waiting for ${type}`))
    }, timeoutMs)
    function onMessage(data: Buffer): void {
      try {
        const msg = JSON.parse(data.toString()) as Msg
        if (msg.type === type) {
          clearTimeout(timer)
          ws.off('message', onMessage)
          resolve(msg)
        }
      } catch {
        // ignore
      }
    }
    ws.on('message', onMessage)
  })
}

async function main(): Promise<void> {
  const httpServer = createServer()
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
  const registry = new SessionRegistry()
  wss.on('connection', (ws) => handleConnection(ws, registry, () => {}))
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()))
  const port = (httpServer.address() as { port: number }).port

  // The app must always connect to the /ws path.
  const appUrl = normalizeSignalingUrl(`ws://127.0.0.1:${port}`)
  if (!appUrl.endsWith('/ws')) throw new Error(`normalize failed: ${appUrl}`)

  const host = new WebSocket(appUrl)
  await new Promise<void>((resolve, reject) => {
    host.on('open', () => resolve())
    host.on('error', reject)
  })
  host.send(JSON.stringify({ type: 'hello', payload: { kind: 'host', displayName: 'Host' } }))
  const welcome = await waitFor(host, 'welcome')
  const hostId = (welcome.payload as { peerId: string }).peerId

  host.send(JSON.stringify({ type: 'create-session', payload: { displayName: 'Host' } }))
  const created = await waitFor(host, 'session-created')
  const { code, sessionId } = created.payload as { code: string; sessionId: string }
  console.log(`host ${hostId} created session ${code}`)

  const guest = new WebSocket(appUrl)
  await new Promise<void>((resolve, reject) => {
    guest.on('open', () => resolve())
    guest.on('error', reject)
  })
  guest.send(JSON.stringify({ type: 'hello', payload: { kind: 'guest', displayName: 'Guest' } }))
  const guestWelcome = await waitFor(guest, 'welcome')
  const guestId = (guestWelcome.payload as { peerId: string }).peerId

  guest.send(JSON.stringify({ type: 'join-session', payload: { code, displayName: 'Guest' } }))
  await waitFor(guest, 'session-joined')
  await waitFor(host, 'peer-joined')
  console.log(`guest ${guestId} joined`)

  // SDP + ICE relay both directions (this is what SessionService/WebRTCService do).
  host.send(
    JSON.stringify({ type: 'offer', to: guestId, sessionId, payload: { sdp: { type: 'offer', sdp: 'v=0' } } })
  )
  const offer = await waitFor(guest, 'offer')
  if (offer.from !== hostId) throw new Error('offer not relayed from host')

  guest.send(
    JSON.stringify({ type: 'answer', to: hostId, sessionId, payload: { sdp: { type: 'answer', sdp: 'v=0' } } })
  )
  const answer = await waitFor(host, 'answer')
  if (answer.from !== guestId) throw new Error('answer not relayed from guest')

  guest.send(
    JSON.stringify({
      type: 'ice-candidate',
      to: hostId,
      sessionId,
      payload: { candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } }
    })
  )
  await waitFor(host, 'ice-candidate')

  host.send(
    JSON.stringify({
      type: 'ice-candidate',
      to: guestId,
      sessionId,
      payload: { candidate: { candidate: 'candidate:2', sdpMid: '0', sdpMLineIndex: 0 } }
    })
  )
  await waitFor(guest, 'ice-candidate')

  console.log('SMOKE OK: hello, session, offer/answer, ICE relay all work via', appUrl)
  host.close()
  guest.close()
  wss.close()
  httpServer.close()
}

main().catch((err) => {
  console.error(`SMOKE FAILED: ${(err as Error).message}`)
  process.exit(1)
})
