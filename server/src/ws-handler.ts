import type { WebSocket, RawData } from 'ws'
import type { SignalEnvelope } from '../../src/shared/protocol/messages'
import { encodeMessage, validateMessage } from './protocol/validate'
import { RateLimiter } from './security/rate-limiter'
import { MAX_MESSAGE_BYTES, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_MESSAGES } from './config'
import { generatePeerId } from './session/ids'
import type { Session, SessionRegistry, SessionPeer } from './session/registry'

function send(ws: WebSocket, message: SignalEnvelope): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(encodeMessage(message))
  }
}

function sendToPeer(session: Session, peerId: string, message: SignalEnvelope): void {
  const peer = session.peers.get(peerId)
  if (peer) {
    const ws = peer.ws as WebSocket
    if (ws.readyState === ws.OPEN) {
      ws.send(encodeMessage(message))
    }
  }
}

export function handleConnection(ws: WebSocket, registry: SessionRegistry, log: (msg: string) => void): void {
  const rateLimiter = new RateLimiter(RATE_LIMIT_MAX_MESSAGES, RATE_LIMIT_WINDOW_MS)
  const peerId = generatePeerId()
  const state: {
    kind: 'host' | 'guest' | null
    displayName: string
    sessionId: string | null
  } = { kind: null, displayName: 'Guest', sessionId: null }

  ws.on('message', (rawData: RawData) => {
    if (!rateLimiter.allow(peerId)) {
      send(ws, { type: 'error', payload: { code: 'rate-limited', message: 'Too many messages. Slow down.' } })
      return
    }
    const raw = Buffer.isBuffer(rawData)
      ? rawData
      : Array.isArray(rawData)
        ? Buffer.concat(rawData)
        : Buffer.from(rawData)
    if (raw.length > MAX_MESSAGE_BYTES) {
      send(ws, { type: 'error', payload: { code: 'message-too-large', message: 'Message too large.' } })
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw.toString())
    } catch {
      send(ws, { type: 'error', payload: { code: 'malformed', message: 'Could not parse message.' } })
      return
    }

    const validation = validateMessage(parsed)
    if (!validation.ok || !validation.message) {
      send(ws, { type: 'error', payload: { code: 'invalid-message', message: validation.error ?? 'Invalid message.' } })
      return
    }

    const msg = validation.message
    switch (msg.type) {
      case 'hello': {
        const p = msg.payload as { kind: 'host' | 'guest'; displayName: string }
        state.kind = p.kind
        state.displayName = p.displayName
        send(ws, { type: 'welcome', payload: { peerId, displayName: p.displayName } })
        break
      }
      case 'create-session': {
        if (state.kind !== 'host') {
          send(ws, { type: 'error', payload: { code: 'forbidden', message: 'Only hosts can create sessions.' } })
          return
        }
        const p = msg.payload as { displayName: string }
        const hostPeer: SessionPeer = {
          id: peerId,
          displayName: p.displayName,
          kind: 'host',
          ws,
          joinedAt: Date.now()
        }
        const { session, code } = registry.createSession(hostPeer)
        state.sessionId = session.id
        send(ws, {
          type: 'session-created',
          payload: { sessionId: session.id, code, peerId, expiresAt: session.expiresAt }
        })
        log(`Session created ${code} (${session.id})`)
        break
      }
      case 'join-session': {
        if (state.kind !== 'guest') {
          send(ws, { type: 'error', payload: { code: 'forbidden', message: 'Only guests can join sessions.' } })
          return
        }
        const p = msg.payload as { code: string; displayName: string }
        const session = registry.getByCode(p.code)
        if (!session) {
          send(ws, { type: 'session-not-found', payload: { code: p.code } })
          return
        }
        if (session.expiresAt < Date.now()) {
          send(ws, { type: 'session-expired', payload: { code: p.code } })
          return
        }
        if (!registry.hasCapacity(session)) {
          send(ws, { type: 'session-full', payload: { code: p.code } })
          return
        }
        const guestPeer: SessionPeer = {
          id: peerId,
          displayName: p.displayName,
          kind: 'guest',
          ws,
          joinedAt: Date.now()
        }
        registry.addPeer(session, guestPeer)
        state.sessionId = session.id
        const hostPeer = session.peers.get(session.hostId)
        send(ws, {
          type: 'session-joined',
          payload: { sessionId: session.id, hostId: session.hostId, hostName: hostPeer?.displayName ?? 'Host', peerId }
        })
        if (hostPeer) {
          sendToPeer(session, hostPeer.id, { type: 'peer-joined', payload: { peerId, displayName: p.displayName }, sessionId: session.id })
        }
        for (const existing of registry.listPeers(session)) {
          if (existing.id !== peerId && existing.id !== session.hostId) {
            send(ws, { type: 'peer-joined', payload: { peerId: existing.id, displayName: existing.displayName }, sessionId: session.id })
          }
        }
        log(`Guest joined ${p.code} (${p.displayName})`)
        break
      }
      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        if (!state.sessionId) return
        const session = registry.getById(state.sessionId)
        if (!session) {
          send(ws, { type: 'session-expired', payload: { code: '' } })
          return
        }
        const targetId = msg.to
        if (!targetId) return
        if (!session.peers.has(targetId)) return
        const target = session.peers.get(targetId)!
        const relayed: SignalEnvelope = {
          type: msg.type,
          payload: msg.payload,
          from: peerId,
          sessionId: session.id
        }
        sendToPeer(session, target.id, relayed)
        break
      }
      case 'peer-renamed': {
        if (!state.sessionId) return
        const session = registry.getById(state.sessionId)
        if (!session) return
        const p = msg.payload as { displayName: string }
        const peer = session.peers.get(peerId)
        if (peer) peer.displayName = p.displayName
        for (const other of registry.listPeers(session)) {
          if (other.id !== peerId) {
            sendToPeer(session, other.id, { type: 'peer-renamed', payload: { peerId, displayName: p.displayName }, sessionId: session.id })
          }
        }
        break
      }
      case 'ping': {
        send(ws, { type: 'pong', payload: {} })
        break
      }
    }
  })

  ws.on('close', () => {
    if (state.sessionId) {
      const session = registry.getById(state.sessionId)
      if (session) {
        registry.removePeer(session, peerId)
        const wasHost = registry.isHost(session, peerId)
        if (wasHost || session.peers.size === 0) {
          for (const peer of registry.listPeers(session)) {
            if (peer.id !== peerId) {
              sendToPeer(session, peer.id, { type: 'peer-left', payload: { peerId }, sessionId: session.id })
            }
          }
          registry.delete(session.id)
          log(`Session ended ${session.code}`)
        } else {
          for (const peer of registry.listPeers(session)) {
            if (peer.id !== peerId) {
              sendToPeer(session, peer.id, { type: 'peer-left', payload: { peerId }, sessionId: session.id })
            }
          }
          log(`Peer left ${session.code}`)
        }
      }
    }
  })

  ws.on('error', () => {
    ws.close()
  })
}