import { describe, it, expect } from 'vitest'
import { participantColor, displayNameToColor } from '../../src/shared/lib/color'
import type { Participant } from '../../src/shared/types/models'

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p1',
    displayName: 'Alice',
    cursor: null,
    connectionState: 'connected',
    audioState: true,
    videoState: true,
    isHost: false,
    isSelf: false,
    color: '#6366f1',
    rtt: null,
    ...overrides
  }
}

describe('participant state', () => {
  it('creates a well-formed participant', () => {
    const p = makeParticipant({ id: 'x1', displayName: 'Bob' })
    expect(p.id).toBe('x1')
    expect(p.connectionState).toBe('connected')
  })

  it('participantColor cycles through the palette', () => {
    expect(participantColor(0)).toBe(participantColor(10))
    expect(participantColor(1)).not.toBe(participantColor(2))
  })

  it('displayNameToColor is deterministic', () => {
    expect(displayNameToColor('Alice')).toBe(displayNameToColor('Alice'))
    expect(displayNameToColor('Alice')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('host participants are distinguishable', () => {
    const host = makeParticipant({ isHost: true })
    const guest = makeParticipant({ isHost: false })
    expect(host.isHost).toBe(true)
    expect(guest.isHost).toBe(false)
  })
})