import type { ConnectionPhase } from '../types/models'

export type StateMachineEvent =
  | { type: 'START' }
  | { type: 'SIGNALING_CONNECTED' }
  | { type: 'SIGNALING_DISCONNECTED' }
  | { type: 'NEGOTIATING' }
  | { type: 'ESTABLISHING' }
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECTED' }
  | { type: 'RECONNECTING' }
  | { type: 'PEER_DISCONNECTED' }
  | { type: 'RESET' }

const TRANSITIONS: Record<ConnectionPhase, StateMachineEvent['type'][]> = {
  idle: ['START', 'SIGNALING_CONNECTED'],
  connecting: ['SIGNALING_CONNECTED', 'NEGOTIATING', 'ESTABLISHING', 'CONNECTED', 'DISCONNECTED', 'RECONNECTING'],
  negotiating: ['ESTABLISHING', 'CONNECTED', 'DISCONNECTED', 'RECONNECTING', 'NEGOTIATING'],
  establishing: ['CONNECTED', 'DISCONNECTED', 'RECONNECTING'],
  connected: ['DISCONNECTED', 'RECONNECTING', 'RESET'],
  reconnecting: ['CONNECTED', 'DISCONNECTED', 'RECONNECTING', 'RESET'],
  disconnected: ['CONNECTED', 'RECONNECTING', 'RESET']
}

export function canTransition(from: ConnectionPhase, event: StateMachineEvent['type']): boolean {
  return TRANSITIONS[from].includes(event)
}

export function transition(from: ConnectionPhase, event: StateMachineEvent['type']): ConnectionPhase {
  if (!canTransition(from, event)) {
    return from
  }
  switch (event) {
    case 'START':
      return 'connecting'
    case 'SIGNALING_CONNECTED':
      return from === 'idle' ? 'connecting' : from
    case 'NEGOTIATING':
      return 'negotiating'
    case 'ESTABLISHING':
      return 'establishing'
    case 'CONNECTED':
      return 'connected'
    case 'DISCONNECTED':
      return 'disconnected'
    case 'RECONNECTING':
      return 'reconnecting'
    case 'PEER_DISCONNECTED':
      return 'disconnected'
    case 'RESET':
      return 'idle'
    default:
      return from
  }
}

export interface StateChange {
  state: string
  changed: string[]
  timestamp: number
}

export class ConnectionStateMachine {
  private _state: ConnectionPhase
  private readonly _history: Array<{ state: string; timestamp: number }> = []

  constructor(initial: ConnectionPhase = 'idle') {
    this._state = initial
  }

  get state(): ConnectionPhase {
    return this._state
  }

  get history(): Array<{ state: string; timestamp: number }> {
    return [...this._history]
  }

  send(event: StateMachineEvent['type']): StateChange {
    const from = this._state
    const to = transition(from, event)
    const changed: string[] = []
    if (to !== from) {
      this._state = to
      this._history.push({ state: to, timestamp: Date.now() })
      changed.push(from, to)
      if (this._history.length > 100) {
        this._history.shift()
      }
    }
    return { state: this._state, changed, timestamp: Date.now() }
  }

  reset(): void {
    this._state = 'idle'
    this._history.length = 0
  }
}