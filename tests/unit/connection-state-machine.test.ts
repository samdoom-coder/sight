import { describe, it, expect } from 'vitest'
import {
  ConnectionStateMachine,
  canTransition,
  transition
} from '../../src/shared/lib/connection-state-machine'
import type { ConnectionPhase } from '../../src/shared/types/models'

describe('connection state machine', () => {
  it('starts idle and transitions to connecting on START', () => {
    const m = new ConnectionStateMachine()
    expect(m.state).toBe('idle')
    m.send('START')
    expect(m.state).toBe('connecting')
  })

  it('follows a full happy path', () => {
    const m = new ConnectionStateMachine()
    m.send('START')
    m.send('SIGNALING_CONNECTED')
    m.send('NEGOTIATING')
    m.send('ESTABLISHING')
    m.send('CONNECTED')
    expect(m.state).toBe('connected')
  })

  it('rejects invalid transitions and keeps state', () => {
    const m = new ConnectionStateMachine()
    m.send('START')
    // cannot go from connecting directly to RESET
    m.send('RESET')
    expect(m.state).toBe('connecting')
  })

  it('enters disconnected and can reconnect', () => {
    const m = new ConnectionStateMachine()
    m.send('START')
    m.send('CONNECTED')
    m.send('DISCONNECTED')
    expect(m.state).toBe('disconnected')
    m.send('RECONNECTING')
    expect(m.state).toBe('reconnecting')
    m.send('CONNECTED')
    expect(m.state).toBe('connected')
  })

  it('records history of transitions', () => {
    const m = new ConnectionStateMachine()
    m.send('START')
    m.send('NEGOTIATING')
    m.send('CONNECTED')
    const history = m.history.map((h) => h.state)
    expect(history).toContain('connecting')
    expect(history).toContain('negotiating')
    expect(history).toContain('connected')
  })

  it('canTransition reflects the transition table', () => {
    expect(canTransition('idle', 'START')).toBe(true)
    expect(canTransition('idle', 'CONNECTED')).toBe(false)
    expect(canTransition('connected', 'RESET')).toBe(true)
  })

  it('transition returns the same state for invalid events', () => {
    expect(transition('idle' as ConnectionPhase, 'CONNECTED')).toBe('idle')
  })

  it('reset returns to idle', () => {
    const m = new ConnectionStateMachine()
    m.send('START')
    m.send('CONNECTED')
    m.reset()
    expect(m.state).toBe('idle')
    expect(m.history).toHaveLength(0)
  })
})