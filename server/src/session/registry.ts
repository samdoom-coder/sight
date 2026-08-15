import { SESSION_TTL_MS, MAX_PARTICIPANTS } from '../config'
import { generatePeerId, generateSessionCode, generateSessionId } from './ids'

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
  createdAt: number
  expiresAt: number
  peers: Map<string, SessionPeer>
}

export class SessionRegistry {
  private readonly sessions = new Map<string, Session>()
  private readonly byCode = new Map<string, string>()

  get size(): number {
    return this.sessions.size
  }

  createSession(hostPeer: SessionPeer): { session: Session; code: string } {
    let code = generateSessionCode()
    let guard = 0
    while (this.byCode.has(code) && guard < 10) {
      code = generateSessionCode()
      guard++
    }
    const session: Session = {
      id: generateSessionId(),
      code,
      hostId: hostPeer.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      peers: new Map([[hostPeer.id, hostPeer]])
    }
    this.sessions.set(session.id, session)
    this.byCode.set(code, session.id)
    return { session, code }
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

  expire(): void {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.sessions.delete(id)
        this.byCode.delete(session.code)
      }
    }
  }

  delete(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      this.sessions.delete(id)
      this.byCode.delete(session.code)
    }
  }
}