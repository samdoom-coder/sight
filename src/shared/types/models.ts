export type ParticipantState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'

export type ConnectionPhase =
  | 'idle'
  | 'connecting'
  | 'negotiating'
  | 'establishing'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export type ConnectionType = 'direct' | 'relay' | 'unknown'

export interface Participant {
  id: string
  displayName: string
  cursor: CursorPosition | null
  connectionState: ParticipantState
  audioState: boolean
  videoState: boolean
  isHost: boolean
  isSelf: boolean
  color: string
  rtt: number | null
}

export interface CursorPosition {
  x: number
  y: number
  timestamp: number
}

export interface ConnectionMetrics {
  rtt: number | null
  packetLoss: number | null
  bitrate: number | null
  frameRate: number | null
  codec: string | null
  connectionType: ConnectionType
  localCandidateType: string | null
  remoteCandidateType: string | null
  videoWidth: number | null
  videoHeight: number | null
}

export interface CaptureSource {
  id: string
  name: string
  thumbnailDataUrl: string | null
  appIconDataUrl: string | null
  display_id: string
}

export interface SessionInfo {
  code: string
  id: string
  inviteUrl: string
  expiresAt: number
}

export type ScreenSourceKind = 'screen' | 'window'

export interface ConnectionState {
  phase: ConnectionPhase
  signaling: 'connected' | 'disconnected' | 'connecting'
  ice: RTCIceConnectionState
  message: string | null
}
