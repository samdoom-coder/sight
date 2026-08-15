export type DataChannelMessageType =
  | 'cursor'
  | 'hello'
  | 'welcome'
  | 'participant-state'
  | 'session-event'
  | 'control'
  | 'ping'
  | 'pong'
  | 'latency'

export interface DataChannelMessage<T = unknown> {
  v: 1
  type: DataChannelMessageType
  payload: T
}

export interface CursorData {
  participantId: string
  x: number
  y: number
  timestamp: number
}

export interface ParticipantStateData {
  participantId: string
  displayName?: string
  audioState?: boolean
  videoState?: boolean
  connectionState?: string
}

export interface SessionEventData {
  kind: 'ended' | 'peer-joined' | 'peer-left'
  peerId?: string
  displayName?: string
}

export interface ControlData {
  kind: 'mute-audio' | 'unmute-audio' | 'hide-cursors' | 'show-cursors' | 'request-rtt'
}

export interface LatencyData {
  rtt: number
}
