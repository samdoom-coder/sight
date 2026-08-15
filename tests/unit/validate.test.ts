import { describe, it, expect } from 'vitest'
import { validateMessage } from '../../server/src/protocol/validate'

describe('signaling message validation', () => {
  it('accepts a well-formed hello', () => {
    const result = validateMessage({ type: 'hello', payload: { kind: 'host', displayName: 'Alice' } })
    expect(result.ok).toBe(true)
  })

  it('rejects non-object messages', () => {
    expect(validateMessage('hello').ok).toBe(false)
    expect(validateMessage(null).ok).toBe(false)
  })

  it('rejects unknown message types', () => {
    const result = validateMessage({ type: 'exploit', payload: {} })
    expect(result.ok).toBe(false)
  })

  it('rejects malformed hello payloads', () => {
    const result = validateMessage({ type: 'hello', payload: { kind: 'admin', displayName: 'x' } })
    expect(result.ok).toBe(false)
  })

  it('rejects oversized display names', () => {
    const result = validateMessage({ type: 'hello', payload: { kind: 'host', displayName: 'x'.repeat(100) } })
    expect(result.ok).toBe(false)
  })

  it('accepts nested session description payloads', () => {
    const result = validateMessage({
      type: 'offer',
      payload: { sdp: { type: 'offer', sdp: 'v=0\r\n' } }
    })
    expect(result.ok).toBe(true)
  })

  it('rejects malformed SDP payloads', () => {
    expect(validateMessage({ type: 'offer', payload: { sdp: 'not-an-object' } }).ok).toBe(false)
    expect(validateMessage({ type: 'offer', payload: { sdp: { type: 42 } } }).ok).toBe(false)
  })

  it('accepts nested ICE candidate payloads', () => {
    const result = validateMessage({
      type: 'ice-candidate',
      payload: { candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5678 typ host', sdpMid: '0', sdpMLineIndex: 0 } }
    })
    expect(result.ok).toBe(true)
  })

  it('rejects malformed ICE candidates', () => {
    const result = validateMessage({
      type: 'ice-candidate',
      payload: { candidate: { candidate: 12345 } }
    })
    expect(result.ok).toBe(false)
  })

  it('rejects oversized SDP bodies', () => {
    const result = validateMessage({
      type: 'offer',
      payload: { sdp: { type: 'offer', sdp: 'x'.repeat(70 * 1024) } }
    })
    expect(result.ok).toBe(false)
  })

  it('rejects invalid sessionId field types', () => {
    const result = validateMessage({ type: 'ping', payload: {}, sessionId: 42 })
    expect(result.ok).toBe(false)
  })
})