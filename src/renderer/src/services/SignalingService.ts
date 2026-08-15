import type {
  SignalEnvelope,
  SignalType,
  WelcomePayload,
  SessionCreatedPayload,
  SessionJoinedPayload
} from '@shared/protocol/messages'

export type SignalingListener = (message: SignalEnvelope) => void

export type SignalingStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'

export interface SignalingServiceOptions {
  url: string
  onStatusChange?: (status: SignalingStatus) => void
  onMessage?: SignalingListener
  onError?: (error: Error) => void
}

export class SignalingService {
  private ws: WebSocket | null = null
  private status: SignalingStatus = 'idle'
  private peerId: string | null = null
  private reconnectAttempts = 0
  private manualClose = false
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly options: SignalingServiceOptions) {}

  get isConnected(): boolean {
    return this.status === 'connected'
  }

  getPeerId(): string | null {
    return this.peerId
  }

  setPeerId(id: string): void {
    this.peerId = id
  }

  connect(): void {
    if (this.status === 'connecting' || this.status === 'connected') return
    this.manualClose = false
    this.setStatus('connecting')

    try {
      this.ws = new WebSocket(this.options.url)
    } catch (err) {
      this.options.onError?.(err as Error)
      this.setStatus('disconnected')
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.setStatus('connected')
      this.startHeartbeat()
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as SignalEnvelope
        this.handleMessage(message)
        this.options.onMessage?.(message)
      } catch {
        // ignore malformed inbound messages
      }
    }

    this.ws.onclose = () => {
      this.stopHeartbeat()
      this.setStatus('disconnected')
      if (!this.manualClose) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(2000 * Math.pow(1.6, this.reconnectAttempts), 15000)
    this.reconnectAttempts += 1
    setTimeout(() => {
      if (!this.manualClose) this.connect()
    }, delay)
  }

  private handleMessage(message: SignalEnvelope): void {
    switch (message.type) {
      case 'welcome': {
        const payload = message.payload as WelcomePayload
        this.peerId = payload.peerId
        break
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', payload: {} })
      }
    }, 20000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  send(message: SignalEnvelope): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(message))
    return true
  }

  sendTo(to: string, message: Omit<SignalEnvelope, 'to'>): boolean {
    return this.send({ ...message, to })
  }

  private setStatus(status: SignalingStatus): void {
    if (this.status !== status) {
      this.status = status
      this.options.onStatusChange?.(status)
    }
  }

  close(): void {
    this.manualClose = true
    this.stopHeartbeat()
    this.reconnectAttempts = 0
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.setStatus('idle')
    this.peerId = null
  }
}

export function createSignal(message: SignalEnvelope): SignalEnvelope {
  return message
}

export function isSignalOfType(message: SignalEnvelope, type: SignalType): boolean {
  return message.type === type
}

export function getCreatedSession(message: SignalEnvelope | undefined): SessionCreatedPayload | null {
  return message && message.type === 'session-created' ? (message.payload as SessionCreatedPayload) : null
}

export function getJoinedSession(message: SignalEnvelope | undefined): SessionJoinedPayload | null {
  return message && message.type === 'session-joined' ? (message.payload as SessionJoinedPayload) : null
}