import { describe, it, expect } from 'vitest'
import { SessionRegistry } from '../../server/src/session/registry'

function hostPeer(id: string) {
  return { id, displayName: 'Host', kind: 'host' as const, ws: {}, joinedAt: Date.now() }
}

describe('registry production hardening', () => {
  it('tracks peerCount across sessions', () => {
    const r = new SessionRegistry()
    expect(r.peerCount).toBe(0)
    const { session } = r.createSession(hostPeer('h1'), '1.2.3.4')
    expect(r.peerCount).toBe(1)
    r.addPeer(session, { id: 'g1', displayName: 'G', kind: 'guest', ws: {}, joinedAt: Date.now() })
    expect(r.peerCount).toBe(2)
    expect(r.size).toBe(1)
  })

  it('stores creatorIp for per-IP accounting', () => {
    const r = new SessionRegistry()
    const { session } = r.createSession(hostPeer('h1'), '9.9.9.9')
    expect(session.creatorIp).toBe('9.9.9.9')
  })

  it('expire() returns expired sessions so callers can notify peers', () => {
    const r = new SessionRegistry()
    const { session } = r.createSession(hostPeer('h1'), '1.1.1.1')
    // Force expiry in the past
    session.expiresAt = Date.now() - 1000
    const expired = r.expire(Date.now())
    expect(expired).toHaveLength(1)
    expect(expired[0].id).toBe(session.id)
    expect(r.size).toBe(0)
    // Second call finds nothing
    expect(r.expire(Date.now())).toHaveLength(0)
  })

  it('expire() leaves live sessions alone', () => {
    const r = new SessionRegistry()
    r.createSession(hostPeer('h1'))
    expect(r.expire(Date.now())).toHaveLength(0)
    expect(r.size).toBe(1)
  })

  it('touch() slides the expiry forward', () => {
    const r = new SessionRegistry()
    const { session } = r.createSession(hostPeer('h1'))
    session.expiresAt = Date.now() - 1000
    r.touch(session)
    expect(session.expiresAt).toBeGreaterThan(Date.now())
    expect(r.expire()).toHaveLength(0)
  })

  it('accepts a per-session TTL and clamps it', () => {
    const r = new SessionRegistry()
    const { session } = r.createSession(hostPeer('h1'), undefined, 5 * 60_000)
    expect(session.ttlMs).toBe(5 * 60_000)
    const { session: tooShort } = r.createSession(hostPeer('h2'), undefined, 1)
    expect(tooShort.ttlMs).toBe(60_000)
    const { session: tooLong } = r.createSession(hostPeer('h3'), undefined, 9999 * 60_000)
    expect(tooLong.ttlMs).toBe(86_400_000)
  })

  it('enforces the configured participant capacity', () => {
    const r = new SessionRegistry()
    const { session } = r.createSession(hostPeer('h1'))
    expect(r.hasCapacity(session)).toBe(true)
    for (let i = 0; i < 7; i++) {
      r.addPeer(session, {
        id: `g${i}`,
        displayName: `G${i}`,
        kind: 'guest',
        ws: {},
        joinedAt: Date.now()
      })
    }
    expect(session.peers.size).toBe(8)
    expect(r.hasCapacity(session)).toBe(false)
  })

  it('gives a disconnected host a grace window before reclaiming the session', () => {
    const r = new SessionRegistry()
    const { session } = r.createSession(hostPeer('h1'))
    const now = Date.now()
    r.markHostDisconnected(session, now)
    expect(r.expireDisconnectedHosts(1000, now + 500)).toHaveLength(0)
    expect(r.size).toBe(1)
    expect(r.expireDisconnectedHosts(1000, now + 1500)).toHaveLength(1)
    expect(r.size).toBe(0)
  })
})
