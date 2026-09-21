import { describe, it, expect } from 'vitest'
import { normalizeSignalingUrl, DEFAULT_SIGNALING_URL } from '../../src/shared/lib/signaling-url'

describe('signaling-url', () => {
  it('defaults to local /ws endpoint', () => {
    expect(DEFAULT_SIGNALING_URL).toBe('ws://localhost:8787/ws')
    expect(normalizeSignalingUrl('')).toBe(DEFAULT_SIGNALING_URL)
    expect(normalizeSignalingUrl(undefined)).toBe(DEFAULT_SIGNALING_URL)
  })

  it('appends /ws when missing (the server only listens on /ws)', () => {
    expect(normalizeSignalingUrl('ws://localhost:8787')).toBe('ws://localhost:8787/ws')
    expect(normalizeSignalingUrl('ws://localhost:8787/')).toBe('ws://localhost:8787/ws')
    expect(normalizeSignalingUrl('wss://signal.example.com')).toBe('wss://signal.example.com/ws')
  })

  it('keeps an explicit /ws path untouched', () => {
    expect(normalizeSignalingUrl('ws://localhost:8787/ws')).toBe('ws://localhost:8787/ws')
    expect(normalizeSignalingUrl('wss://signal.example.com/ws')).toBe('wss://signal.example.com/ws')
  })

  it('converts http(s) to ws(s) and accepts bare hosts', () => {
    expect(normalizeSignalingUrl('http://localhost:8787')).toBe('ws://localhost:8787/ws')
    expect(normalizeSignalingUrl('https://signal.example.com')).toBe('wss://signal.example.com/ws')
    expect(normalizeSignalingUrl('localhost:8787')).toBe('ws://localhost:8787/ws')
  })
})
