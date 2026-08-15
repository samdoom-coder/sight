export type SignalType =
  | 'hello'
  | 'welcome'
  | 'create-session'
  | 'session-created'
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
}

export interface SessionCreatedPayload {
  sessionId: string
  code: string
  peerId: string
  expiresAt: number
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
