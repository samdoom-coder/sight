export type SignalType =
  | 'hello'
  | 'welcome'
  | 'create-session'
  | 'resume-session'
  | 'session-created'
  | 'session-resumed'
  | 'join-session'
  | 'session-joined'
  | 'session-full'
  | 'session-not-found'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'peer-joined'
  | 'peer-left'
  | 'peer-renamed'
  | 'session-expired'
  | 'end-session'
  | 'error'
  | 'ping'
  | 'pong'

export interface SignalEnvelope<T = unknown> {
  type: SignalType
  payload: T
  from?: string
  to?: string
  sessionId?: string
}

export interface HelloPayload {
  kind: 'host' | 'guest'
  displayName: string
}

export interface WelcomePayload {
  peerId: string
  displayName: string
}

export interface CreateSessionPayload {
  displayName: string
  sourceKind: 'screen' | 'window' | null
  /** Optional per-session idle timeout in milliseconds (clamped server-side). */
  ttlMs?: number
}

export interface SessionCreatedPayload {
  sessionId: string
  code: string
  peerId: string
  hostToken?: string
  expiresAt: number
  iceServers?: TurnIceServer[]
}

export interface TurnIceServer {
  urls: string
  username?: string
  credential?: string
}

export interface ResumeSessionPayload {
  sessionId: string
  token: string
}

export interface SessionResumedPayload {
  sessionId: string
  code: string
  peerId: string
  expiresAt: number
  peers?: Array<{ peerId: string; displayName: string }>
  iceServers?: TurnIceServer[]
}

export interface EndSessionPayload {
  reason?: string
}

export interface JoinSessionPayload {
  code: string
  displayName: string
}

export interface SessionJoinedPayload {
  sessionId: string
  hostId: string
  hostName: string
  peerId: string
  iceServers?: TurnIceServer[]
}

export interface OfferPayload {
  sdp: RTCSessionDescriptionInit
}

export interface AnswerPayload {
  sdp: RTCSessionDescriptionInit
}

export interface IceCandidatePayload {
  candidate: RTCIceCandidateInit | null
}

export interface PeerJoinedPayload {
  peerId: string
  displayName: string
}

export interface PeerLeftPayload {
  peerId: string
}

export interface PeerRenamedPayload {
  peerId: string
  displayName: string
}

export interface ErrorPayload {
  code: string
  message: string
}
