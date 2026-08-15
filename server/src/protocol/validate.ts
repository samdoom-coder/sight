import type { SignalEnvelope, SignalType } from '../../../src/shared/protocol/messages'

const VALID_TYPES = new Set<SignalType>([
  'hello',
  'create-session',
  'join-session',
  'offer',
  'answer',
  'ice-candidate',
  'peer-renamed',
  'ping'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSessionDescriptionLike(value: unknown): boolean {
  if (!isRecord(value)) return false
  const desc = isRecord(value.sdp) ? value.sdp : value
  if (typeof desc.type !== 'string') return false
  if (typeof desc.sdp !== 'string' && desc.sdp !== undefined) return false
  if (desc.sdp && desc.sdp.length > 64 * 1024) return false
  return true
}

function isIceCandidateLike(value: unknown): boolean {
  if (value === null) return true
  if (!isRecord(value)) return false
  const cand = value.candidate !== undefined && isRecord(value.candidate) ? value.candidate : value
  if (cand.candidate !== undefined && typeof cand.candidate !== 'string') return false
  if (cand.sdpMid !== undefined && typeof cand.sdpMid !== 'string') return false
  if (cand.sdpMLineIndex !== undefined && typeof cand.sdpMLineIndex !== 'number') return false
  return true
}

function isValidHello(payload: unknown): boolean {
  if (!isRecord(payload)) return false
  if (payload.kind !== 'host' && payload.kind !== 'guest') return false
  return typeof payload.displayName === 'string' && payload.displayName.length <= 64
}

function isValidCreateSession(payload: unknown): boolean {
  if (!isRecord(payload)) return false
  return typeof payload.displayName === 'string' && payload.displayName.length <= 64
}

function isValidJoinSession(payload: unknown): boolean {
  if (!isRecord(payload)) return false
  if (typeof payload.code !== 'string') return false
  if (payload.code.length < 3 || payload.code.length > 16) return false
  return typeof payload.displayName === 'string' && payload.displayName.length <= 64
}

function isValidPayload(type: SignalType, payload: unknown): boolean {
  switch (type) {
    case 'hello':
      return isValidHello(payload)
    case 'create-session':
      return isValidCreateSession(payload)
    case 'join-session':
      return isValidJoinSession(payload)
    case 'offer':
    case 'answer':
      return isSessionDescriptionLike(payload)
    case 'ice-candidate':
      return isIceCandidateLike(payload)
    case 'peer-renamed':
      return isRecord(payload) && typeof payload.displayName === 'string' && payload.displayName.length <= 64
    case 'ping':
      return true
    default:
      return false
  }
}

export interface ValidationResult {
  ok: boolean
  error?: string
  message?: SignalEnvelope
}

export function validateMessage(raw: unknown): ValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, error: 'message must be an object' }
  }
  const type = raw.type as SignalType
  if (typeof type !== 'string' || !VALID_TYPES.has(type)) {
    return { ok: false, error: 'unknown or disallowed message type' }
  }
  if (raw.sessionId !== undefined && typeof raw.sessionId !== 'string') {
    return { ok: false, error: 'invalid sessionId' }
  }
  if (!isValidPayload(type, raw.payload)) {
    return { ok: false, error: `invalid payload for ${type}` }
  }
  return {
    ok: true,
    message: raw as unknown as SignalEnvelope
  }
}

export function encodeMessage(message: SignalEnvelope): string {
  return JSON.stringify(message)
}