import type { WebSocket, RawData } from 'ws'
import { timingSafeEqual } from 'node:crypto'
import type { SignalEnvelope } from '../../src/shared/protocol/messages'
import { encodeMessage, validateMessage } from './protocol/validate'
import { RateLimiter } from './security/rate-limiter'
import { MAX_MESSAGE_BYTES, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_MESSAGES } from './config'
import { generatePeerId } from './session/ids'
import type { Session, SessionRegistry, SessionPeer } from './session/registry'

function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

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

export interface ConnectionLimits {
  ip?: string
  canCreateSession?: (ip: string) => boolean
  recordSessionCreated?: (ip: string, sessionId: string) => void
  recordSessionEnded?: (ip: string, sessionId: string) => void
}

export function handleConnection(
  ws: WebSocket,
  registry: SessionRegistry,
  log: (msg: string) => void,
  limits?: ConnectionLimits
): void {
  const rateLimiter = new RateLimiter(RATE_LIMIT_MAX_MESSAGES, RATE_LIMIT_WINDOW_MS)
  let peerId = generatePeerId()
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

    // Activity keeps an otherwise-idle session alive. The app's signaling
    // heartbeat sends a ping every 20s, so an active call will not expire at
    // the initial TTL boundary.
    if (state.sessionId) {
      const activeSession = registry.getById(state.sessionId)
      if (activeSession) registry.touch(activeSession)
    }

    switch (msg.type) {
      case 'hello': {
        if (state.kind) {
          send(ws, { type: 'error', payload: { code: 'already-greeted', message: 'Hello was already sent.' } })
          return
        }
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
        if (state.sessionId) {
          send(ws, { type: 'error', payload: { code: 'already-in-session', message: 'This connection already has a session.' } })
          return
        }
        if (limits?.ip && limits.canCreateSession && !limits.canCreateSession(limits.ip)) {
          send(ws, {
            type: 'error',
            payload: { code: 'session-limit', message: 'Too many active sessions from this address. Try again later.' }
          })
          return
        }
        const p = msg.payload as { displayName: string; ttlMs?: number }
        const hostPeer: SessionPeer = {
          id: peerId,
          displayName: p.displayName,
          kind: 'host',
          ws,
          joinedAt: Date.now()
        }
        const { session, code } = registry.createSession(hostPeer, limits?.ip, p.ttlMs)
        state.sessionId = session.id
        registry.touch(session)
        if (limits?.ip && limits.recordSessionCreated) {
          limits.recordSessionCreated(limits.ip, session.id)
        }
        send(ws, {
          type: 'session-created',
          payload: {
            sessionId: session.id,
            code,
            peerId,
            hostToken: session.hostToken,
            expiresAt: session.expiresAt
          }
        })
        log(`Session created (${session.id})`)
        break
      }
      case 'resume-session': {
        if (state.kind !== 'host') {
          send(ws, { type: 'error', payload: { code: 'forbidden', message: 'Only hosts can resume sessions.' } })
          return
        }
        if (state.sessionId) {
          send(ws, { type: 'error', payload: { code: 'already-in-session', message: 'This connection already has a session.' } })
          return
        }
        const p = msg.payload as { sessionId: string; token: string }
        const session = registry.getById(p.sessionId)
        if (!session || !tokensMatch(p.token, session.hostToken)) {
          send(ws, { type: 'error', payload: { code: 'resume-failed', message: 'That session can no longer be resumed.' } })
          return
        }
        const hostPeer = session.peers.get(session.hostId)
        if (!hostPeer) {
          send(ws, { type: 'error', payload: { code: 'resume-failed', message: 'That session no longer has a host.' } })
          return
        }
        const oldSocket = hostPeer.ws as WebSocket
        if (oldSocket.readyState === oldSocket.OPEN) {
          // The old TCP/WebSocket may be half-open (e.g. network change). The
          // valid host token proves ownership, so supersede it.
          oldSocket.close(4001, 'Superseded by resume')
        }
        peerId = session.hostId
        hostPeer.ws = ws
        state.kind = 'host'
        state.displayName = hostPeer.displayName
        state.sessionId = session.id
        registry.markHostConnected(session)
        registry.touch(session)
        send(ws, {
          type: 'session-resumed',
          payload: {
            sessionId: session.id,
            code: session.code,
            peerId: session.hostId,
            expiresAt: session.expiresAt,
            peers: registry
              .listPeers(session)
              .filter((peer) => peer.id !== session.hostId)
              .map((peer) => ({ peerId: peer.id, displayName: peer.displayName }))
          }
        })
        // Tell the resumed host about guests that joined while it was away.
        for (const peer of registry.listPeers(session)) {
          if (peer.id === session.hostId) continue
          send(ws, {
            type: 'peer-joined',
            payload: { peerId: peer.id, displayName: peer.displayName },
            sessionId: session.id
          })
        }
        log(`Session resumed (${session.id})`)
        break
      }
      case 'end-session': {
        if (state.kind !== 'host' || !state.sessionId) return
        const session = registry.getById(state.sessionId)
        if (!session || session.hostId !== peerId) return
        for (const peer of registry.listPeers(session)) {
          if (peer.id === peerId) continue
          sendToPeer(session, peer.id, {
            type: 'peer-left',
            payload: { peerId: session.hostId },
            sessionId: session.id
          })
        }
        registry.delete(session.id)
        state.sessionId = null
        if (session.creatorIp && limits?.recordSessionEnded) {
          limits.recordSessionEnded(session.creatorIp, session.id)
        }
        log(`Session ended by host (${session.id})`)
        break
      }
      case 'join-session': {
        if (state.kind !== 'guest') {
          send(ws, { type: 'error', payload: { code: 'forbidden', message: 'Only guests can join sessions.' } })
          return
        }
        if (state.sessionId) {
          send(ws, { type: 'error', payload: { code: 'already-in-session', message: 'This connection already joined a session.' } })
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
        registry.touch(session)
        state.sessionId = session.id
        const hostPeer = session.peers.get(session.hostId)
        send(ws, {
          type: 'session-joined',
          payload: { sessionId: session.id, hostId: session.hostId, hostName: hostPeer?.displayName ?? 'Host', peerId }
        })
        // Notify the host and every other guest, and send the existing guest
        // list to the guest that just joined.
        for (const existing of registry.listPeers(session)) {
          if (existing.id === peerId) continue
          sendToPeer(session, existing.id, {
            type: 'peer-joined',
            payload: { peerId, displayName: p.displayName },
            sessionId: session.id
          })
          if (existing.id !== session.hostId) {
            send(ws, {
              type: 'peer-joined',
              payload: { peerId: existing.id, displayName: existing.displayName },
              sessionId: session.id
            })
          }
        }
        log(`Guest joined ${session.id} (${p.displayName})`)
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
    if (!state.sessionId) return
    const session = registry.getById(state.sessionId)
    if (!session) return

    const currentPeer = session.peers.get(peerId)
    // After a host resume, the old socket can close after the new one is bound.
    if (!currentPeer || currentPeer.ws !== ws) return

    if (session.hostId === peerId) {
      // Keep the session alive for a grace period so the host can rebind its
      // new signaling socket without invalidating the code for guests.
      registry.markHostDisconnected(session)
      log(`Host signaling dropped (${session.id}); grace period started`)
      return
    }

    registry.removePeer(session, peerId)
    for (const peer of registry.listPeers(session)) {
      sendToPeer(session, peer.id, {
        type: 'peer-left',
        payload: { peerId },
        sessionId: session.id
      })
    }
    log(`Peer left (${session.id})`)
  })

  ws.on('error', () => {
    ws.close()
  })
}