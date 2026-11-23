import { SESSION_TTL_MS, MAX_PARTICIPANTS } from '../config'
import { generateHostToken, generatePeerId, generateSessionCode, generateSessionId } from './ids'

export interface SessionPeer {
  id: string
  displayName: string
  kind: 'host' | 'guest'
  ws: unknown
  joinedAt: number
}

export interface Session {
  id: string
  code: string
  hostId: string
  hostToken: string
  hostDisconnectedAt?: number
  createdAt: number
  expiresAt: number
  ttlMs: number
  peers: Map<string, SessionPeer>
  creatorIp?: string
}

export class SessionRegistry {
  private readonly sessions = new Map<string, Session>()
  private readonly byCode = new Map<string, string>()

  get size(): number {
    return this.sessions.size
  }

  get peerCount(): number {
    let total = 0
    for (const session of this.sessions.values()) {
      total += session.peers.size
    }
    return total
  }

  createSession(hostPeer: SessionPeer, creatorIp?: string, ttlMs = SESSION_TTL_MS): { session: Session; code: string } {
    let code = generateSessionCode()
    let guard = 0
    while (this.byCode.has(code) && guard < 100) {
      code = generateSessionCode()
      guard++
    }
    const now = Date.now()
    const safeTtl = Number.isFinite(ttlMs)
      ? Math.min(Math.max(ttlMs, 60_000), 86_400_000)
      : SESSION_TTL_MS
    const session: Session = {
      id: generateSessionId(),
      code,
      hostId: hostPeer.id,
      hostToken: generateHostToken(),
      createdAt: now,
      expiresAt: now + safeTtl,
      ttlMs: safeTtl,
      peers: new Map([[hostPeer.id, hostPeer]]),
      creatorIp
    }
    this.sessions.set(session.id, session)
    this.byCode.set(code, session.id)
    return { session, code }
  }

  /** Sliding expiry: any valid signaling traffic keeps the session alive. */
  touch(session: Session, now = Date.now()): void {
    session.expiresAt = now + session.ttlMs
  }

  markHostDisconnected(session: Session, now = Date.now()): void {
    session.hostDisconnectedAt = now
  }

  markHostConnected(session: Session): void {
    session.hostDisconnectedAt = undefined
  }

  /**
   * Sessions whose host socket dropped and did not resume within the grace
   * window. Guests stay in the session meanwhile so P2P media can continue.
   */
  expireDisconnectedHosts(graceMs: number, now = Date.now()): Session[] {
    const lost: Session[] = []
    for (const [id, session] of this.sessions) {
      if (session.hostDisconnectedAt !== undefined && now - session.hostDisconnectedAt >= graceMs) {
        this.sessions.delete(id)
        this.byCode.delete(session.code)
        lost.push(session)
      }
    }
    return lost
  }

  getByCode(code: string): Session | undefined {
    const id = this.byCode.get(code.toUpperCase())
    if (!id) return undefined
    const session = this.sessions.get(id)
    if (!session) {
      this.byCode.delete(code.toUpperCase())
      return undefined
    }
    return session
  }

  getById(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  hasCapacity(session: Session): boolean {
    return session.peers.size < MAX_PARTICIPANTS
  }

  addPeer(session: Session, peer: SessionPeer): void {
    session.peers.set(peer.id, peer)
  }

  removePeer(session: Session, peerId: string): void {
    session.peers.delete(peerId)
  }

  isHost(session: Session, peerId: string): boolean {
    return session.hostId === peerId
  }

  listPeers(session: Session): SessionPeer[] {
    return [...session.peers.values()]
  }

  expire(now = Date.now()): Session[] {
    const expired: Session[] = []
    for (const [id, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.sessions.delete(id)
        this.byCode.delete(session.code)
        expired.push(session)
      }
    }
    return expired
  }

  delete(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      this.sessions.delete(id)
      this.byCode.delete(session.code)
    }
  }
}