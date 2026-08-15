import { get, writable } from 'svelte/store'
import type {
  ConnectionMetrics,
  ConnectionPhase,
  CursorPosition,
  Participant
} from '@shared/types/models'
import type { SignalEnvelope } from '@shared/protocol/messages'
import type { DataChannelMessage } from '@shared/protocol/datachannel'
import { SignalingService, type SignalingStatus } from './SignalingService'
import { WebRTCService } from './WebRTCService'
import { CursorService } from './CursorService'
import { ConnectionMonitor } from './ConnectionMonitor'
import { AudioService } from './AudioService'
import { participantColor, displayNameToColor } from '@shared/lib/color'
import { generateSessionCode } from '@shared/lib/session-code'

export interface SessionInit {
  signalingUrl: string
  iceServers: RTCIceServer[]
  platform: string
  displayName: string
  role: 'host' | 'guest'
  localStream: MediaStream | null
  sourceKind: 'screen' | 'window' | null
  code?: string
}

export interface SessionCallbacks {
  onPhaseChange: (phase: ConnectionPhase) => void
  onMetrics: (metrics: ConnectionMetrics) => void
  onVideoReady: (stream: MediaStream) => void
  onError: (code: string, message: string) => void
  onStatusMessage: (message: string) => void
}

export class SessionService {
  private signaling: SignalingService
  private webrtc: WebRTCService | null = null
  private cursorService: CursorService | null = null
  private monitor: ConnectionMonitor | null = null
  private localStream: MediaStream | null = null
  private localAudioTrack: MediaStreamTrack | null = null
  private participantId: string | null = null
  private hostId: string | null = null
  private hostName = ''
  private sessionCode = ''
  private sessionId: string | null = null
  private role: 'host' | 'guest'
  private iceServers: RTCIceServer[]
  private reconnecting = false
  private reconnectAttempts = 0
  private ended = false
  private audio: AudioService

  readonly phase = writable<ConnectionPhase>('idle')
  readonly signalingStatus = writable<SignalingStatus>('idle')
  private signalingStatusValue: SignalingStatus = 'idle'
  readonly participants = writable<Participant[]>([])
  readonly metrics = writable<ConnectionMetrics | null>(null)
  readonly sessionCodeStore = writable<string>('')
  readonly sessionIdStore = writable<string>('')
  readonly errorStore = writable<{ code: string; message: string } | null>(null)
  readonly statusMessage = writable<string>('')
  readonly audioMuted = writable<boolean>(false)
  readonly cursorsVisible = writable<boolean>(true)
  readonly remoteStreamStore = writable<MediaStream | null>(null)

  __cleanup: (() => void) | null = null

  constructor(private readonly init: SessionInit, private readonly callbacks: SessionCallbacks) {
    this.role = init.role
    this.iceServers = init.iceServers
    this.localStream = init.localStream
    this.signaling = new SignalingService({
      url: init.signalingUrl,
      onStatusChange: (status) => {
        this.signalingStatusValue = status
        this.signalingStatus.set(status)
      },
      onMessage: (message) => this.handleSignal(message),
      onError: () => {
        this.setError('signaling-failed', 'Could not reach the signaling service.')
      }
    })
    this.audio = new AudioService(init.platform)
  }

  getRole(): 'host' | 'guest' {
    return this.role
  }

  getSignalingStatus(): SignalingStatus {
    return this.signalingStatusValue
  }

  getPeerConnection(): RTCPeerConnection | null {
    return this.webrtc?.peerConnection ?? null
  }

  getParticipantId(): string | null {
    return this.participantId
  }

  getCode(): string {
    return this.sessionCode
  }

  start(): void {
    this.phase.set('connecting')
    this.callbacks.onStatusMessage('Connecting to signaling service...')
    this.signaling.connect()
  }

  private onConnectedToSignaling(): void {
    if (!this.signaling.isConnected) return
    this.signaling.send({ type: 'hello', payload: { kind: this.role, displayName: this.init.displayName } })
  }

  private handleSignal(message: SignalEnvelope): void {
    switch (message.type) {
      case 'welcome': {
        const payload = message.payload as { peerId: string }
        this.participantId = payload.peerId
        this.signaling.setPeerId(this.participantId)
        if (this.role === 'host') {
          this.signaling.send({
            type: 'create-session',
            payload: { displayName: this.init.displayName, sourceKind: this.init.sourceKind }
          })
        } else {
          this.signaling.send({
            type: 'join-session',
            payload: { code: this.init.code ?? '', displayName: this.init.displayName }
          })
        }
        break
      }
      case 'session-created': {
        const payload = message.payload as { sessionId: string; code: string; peerId: string; expiresAt: number }
        this.sessionId = payload.sessionId
        this.sessionCode = payload.code
        this.sessionIdStore.set(payload.sessionId)
        this.sessionCodeStore.set(payload.code)
        this.hostId = payload.peerId
        this.addSelfParticipant()
        this.callbacks.onStatusMessage('Session ready. Waiting for someone to join...')
        this.phase.set('connecting')
        break
      }
      case 'session-joined': {
        const payload = message.payload as { sessionId: string; hostId: string; hostName: string; peerId: string }
        this.sessionId = payload.sessionId
        this.hostId = payload.hostId
        this.hostName = payload.hostName
        this.sessionIdStore.set(payload.sessionId)
        this.participantId = payload.peerId
        this.signaling.setPeerId(payload.peerId)
        this.addParticipant(payload.hostId, payload.hostName, true)
        this.addSelfParticipant()
        this.callbacks.onStatusMessage('Session joined. Waiting for the host...')
        this.phase.set('connecting')
        break
      }
      case 'session-not-found': {
        this.setError('session-not-found', 'We could not find that session code. Double-check it and try again.')
        this.cleanup()
        break
      }
      case 'session-expired': {
        this.setError('session-expired', 'That session has expired. Ask the host to start a new one.')
        this.cleanup()
        break
      }
      case 'session-full': {
        this.setError('session-full', 'That session is full. Ask the host to start a new one.')
        this.cleanup()
        break
      }
      case 'peer-joined': {
        const payload = message.payload as { peerId: string; displayName: string }
        this.addParticipant(payload.peerId, payload.displayName, false)
        if (this.role === 'host') {
          this.initWebRTCForPeer(payload.peerId)
        }
        break
      }
      case 'peer-left': {
        const payload = message.payload as { peerId: string }
        this.removeParticipant(payload.peerId)
        if (this.role === 'guest' && payload.peerId === this.hostId) {
          this.handleHostLeft()
        }
        break
      }
      case 'offer': {
        const payload = message.payload as { sdp: RTCSessionDescriptionInit }
        this.handleIncomingOffer(payload.sdp)
        break
      }
      case 'answer': {
        const payload = message.payload as { sdp: RTCSessionDescriptionInit }
        this.handleIncomingAnswer(payload.sdp)
        break
      }
      case 'ice-candidate': {
        const payload = message.payload as { candidate: RTCIceCandidateInit | null }
        this.webrtc?.addIceCandidate(payload.candidate)
        break
      }
      case 'peer-renamed': {
        const payload = message.payload as { peerId: string; displayName: string }
        this.updateParticipantName(payload.peerId, payload.displayName)
        break
      }
      case 'error': {
        const payload = message.payload as { code: string; message: string }
        this.setError(payload.code, payload.message)
        break
      }
    }
  }

  private addParticipant(participantId: string, displayName: string, isHost: boolean): void {
    if (participantId === this.participantId) return
    const existing = get(this.participants).find((p) => p.id === participantId)
    if (existing) return
    const participant: Participant = {
      id: participantId,
      displayName,
      cursor: null,
      connectionState: 'connecting',
      audioState: true,
      videoState: true,
      isHost,
      isSelf: false,
      color: isHost ? participantColor(0) : displayNameToColor(displayName),
      rtt: null
    }
    this.participants.update((list) => [...list, participant])
    this.addSelfParticipant()
  }

  private removeParticipant(participantId: string): void {
    this.cursorService?.removeParticipant(participantId)
    this.participants.update((list) => list.filter((p) => p.id !== participantId))
  }

  private updateParticipantName(participantId: string, displayName: string): void {
    this.participants.update((list) => list.map((p) => (p.id === participantId ? { ...p, displayName } : p)))
  }

  private addSelfParticipant(): void {
    if (!this.participantId) return
    const existing = get(this.participants).find((p) => p.isSelf)
    if (existing) return
    const self: Participant = {
      id: this.participantId,
      displayName: this.init.displayName,
      cursor: null,
      connectionState: 'connected',
      audioState: true,
      videoState: true,
      isHost: this.role === 'host',
      isSelf: true,
      color: participantColor(0),
      rtt: null
    }
    this.participants.update((list) => [...list, self])
  }

  private async initWebRTCForPeer(targetPeerId: string): Promise<void> {
    if (this.webrtc) return
    await this.initWebRTCCommon()
    this.phase.set('negotiating')
    this.callbacks.onStatusMessage('Negotiating with the guest...')
    const offer = await this.webrtc!.createOffer()
    this.signaling.sendTo(targetPeerId, { type: 'offer', payload: { sdp: offer }, sessionId: this.sessionId ?? undefined })
  }

  private async initWebRTCCommon(): Promise<void> {
    if (this.webrtc) return
    this.webrtc = new WebRTCService({
      iceServers: this.iceServers,
      role: this.role,
      onConnectionStateChange: (state) => this.handleIceStateChange(state),
      onDataChannelMessage: (message) => this.handleDataChannel(message),
      onTrack: () => {
        const stream = this.webrtc?.getRemoteStream()
        if (stream) {
          this.remoteStreamStore.set(stream)
          this.callbacks.onVideoReady(stream)
        }
      },
      onDataChannelOpen: () => {
        this.phase.set('connected')
        this.callbacks.onStatusMessage('Connected.')
        this.startCursorTransport()
        this.sendHello()
      },
      onIceCandidate: (candidate) => {
        const target = this.role === 'host' ? this.hostId! : this.hostId!
        this.signaling.sendTo(target, {
          type: 'ice-candidate',
          payload: { candidate },
          sessionId: this.sessionId ?? undefined
        })
      }
    })

    this.monitor = new ConnectionMonitor((metrics) => {
      this.metrics.set(metrics)
      this.callbacks.onMetrics(metrics)
    })

    if (this.localStream) {
      this.webrtc.setLocalStream(this.localStream)
    }

    await this.webrtc.initialize()
    this.startStatsLoop()
  }

  private async handleIncomingOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.webrtc) {
      await this.initWebRTCCommon()
    }
    this.phase.set('negotiating')
    this.callbacks.onStatusMessage('Negotiating with the host...')
    const answer = await this.webrtc!.handleOffer(sdp)
    if (this.hostId) {
      this.signaling.sendTo(this.hostId, { type: 'answer', payload: { sdp: answer }, sessionId: this.sessionId ?? undefined })
    }
  }

  private async handleIncomingAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.webrtc) return
    await this.webrtc.handleAnswer(sdp)
  }

  private handleIceStateChange(state: RTCIceConnectionState): void {
    switch (state) {
      case 'checking':
        this.phase.set('establishing')
        this.callbacks.onStatusMessage('Establishing a secure connection...')
        break
      case 'connected':
      case 'completed':
        this.phase.set('connected')
        this.reconnectAttempts = 0
        this.reconnecting = false
        this.callbacks.onStatusMessage('Connected.')
        break
      case 'disconnected':
      case 'failed':
        this.handleConnectionFailure()
        break
    }
  }

  private handleConnectionFailure(): void {
    if (this.ended) return
    if (this.reconnectAttempts < 4) {
      this.reconnecting = true
      this.reconnectAttempts += 1
      this.phase.set('reconnecting')
      this.callbacks.onStatusMessage(
        this.reconnectAttempts === 1
          ? 'The connection was interrupted. Reconnecting...'
          : `Reconnecting... attempt ${this.reconnectAttempts} of 4`
      )
      setTimeout(() => this.webrtc?.restartIce(), 1200 * this.reconnectAttempts)
    } else {
      this.phase.set('disconnected')
      this.callbacks.onStatusMessage('Connection lost. We could not re-establish it.')
    }
  }

  private handleHostLeft(): void {
    if (this.ended) return
    this.setError('host-left', 'The host ended the session.')
    this.cleanup()
  }

  private startCursorTransport(): void {
    if (!this.webrtc) return
    if (this.cursorService) return
    const isHost = this.role === 'host'
    let current = { x: 0, y: 0, width: 1, height: 1 }
    let cleanup: (() => void) | null = null
    if (isHost) {
      const onMove = (event: MouseEvent): void => {
        const target = event.currentTarget as HTMLElement
        current = {
          x: event.screenX,
          y: event.screenY,
          width: window.screen.availWidth || 1,
          height: window.screen.availHeight || 1
        }
      }
      window.addEventListener('mousemove', onMove, { passive: true })
      cleanup = () => window.removeEventListener('mousemove', onMove)
    }
    this.cursorService = new CursorService(
      this.participantId ?? 'unknown',
      isHost
        ? {
            getPosition: () => current,
            onMove: () => cleanup ?? (() => {})
          }
        : null,
      isHost
        ? {
            sendCursor: (position, participantId) => {
              this.webrtc?.sendDataChannelMessage({
                v: 1,
                type: 'cursor',
                payload: { participantId, x: position.x, y: position.y, timestamp: position.timestamp }
              })
            }
          }
        : null
    )
    this.cursorService.start()
  }

  private handleDataChannel(message: DataChannelMessage): void {
    switch (message.type) {
      case 'cursor': {
        const payload = message.payload as CursorPosition & { participantId: string }
        const cursor = this.cursorService?.handleRemoteCursor(payload.participantId, payload)
        if (cursor) {
          this.participants.update((list) =>
            list.map((p) => (p.id === payload.participantId ? { ...p, cursor } : p))
          )
        }
        break
      }
      case 'participant-state': {
        const payload = message.payload as {
          participantId: string
          audioState?: boolean
          connectionState?: string
        }
        this.participants.update((list) =>
          list.map((p) =>
            p.id === payload.participantId
              ? {
                  ...p,
                  audioState: payload.audioState ?? p.audioState,
                  connectionState: (payload.connectionState as Participant['connectionState']) ?? p.connectionState
                }
              : p
          )
        )
        break
      }
      case 'session-event': {
        const payload = message.payload as { kind: string }
        if (payload.kind === 'ended') {
          this.handleHostLeft()
        }
        break
      }
      case 'ping': {
        this.webrtc?.sendDataChannelMessage({ v: 1, type: 'pong', payload: { timestamp: Date.now() } })
        break
      }
      case 'pong': {
        const payload = message.payload as { timestamp?: number }
        if (payload.timestamp) {
          const rtt = Date.now() - payload.timestamp
          this.participants.update((list) =>
            list.map((p) => (p.id === (this.role === 'host' ? this.hostId : this.participantId) ? { ...p, rtt } : p))
          )
        }
        break
      }
    }
  }

  private sendHello(): void {
    this.webrtc?.sendDataChannelMessage({
      v: 1,
      type: 'hello',
      payload: { participantId: this.participantId, displayName: this.init.displayName }
    })
  }

  private startStatsLoop(): void {
    const tick = async () => {
      if (this.ended || !this.webrtc) return
      const stats = await this.webrtc.getStats()
      await this.monitor?.update(stats)
    }
    tick()
    this.statsInterval = setInterval(tick, 2000)
  }

  private statsInterval: ReturnType<typeof setInterval> | null = null

  async toggleAudio(): Promise<void> {
    const currentMuted = get(this.audioMuted)
    if (!currentMuted) {
      // turning audio off
      this.audioMuted.set(true)
      this.webrtc?.setAudioEnabled(false)
      this.webrtc?.sendDataChannelMessage({
        v: 1,
        type: 'participant-state',
        payload: { participantId: this.participantId, audioState: false }
      })
      return
    }
    // turning audio on
    if (this.role === 'host') {
      if (!this.audio.isEnabled) {
        if (!this.audio.isSupported) {
          this.callbacks.onError('audio-unsupported', 'System audio sharing is not supported on this platform.')
          return
        }
        await this.audio.enable()
        const track = this.audio.getAudioTrack()
        if (track) {
          this.webrtc?.addAudioTrack(track)
          this.webrtc?.setAudioEnabled(true)
        } else {
          this.callbacks.onError('audio-denied', 'System audio could not be captured.')
          return
        }
      } else {
        this.webrtc?.setAudioEnabled(true)
      }
    }
    this.audioMuted.set(false)
    this.webrtc?.sendDataChannelMessage({
      v: 1,
      type: 'participant-state',
      payload: { participantId: this.participantId, audioState: true }
    })
  }

  toggleCursors(): void {
    const next = !get(this.cursorsVisible)
    this.cursorsVisible.set(next)
    this.webrtc?.sendDataChannelMessage({
      v: 1,
      type: 'control',
      payload: { kind: next ? 'show-cursors' : 'hide-cursors' }
    })
  }

  endSession(): void {
    this.ended = true
    this.webrtc?.sendDataChannelMessage({ v: 1, type: 'session-event', payload: { kind: 'ended' } })
    this.cleanup()
  }

  private cleanup(): void {
    this.ended = true
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
    this.cursorService?.stop()
    this.webrtc?.close()
    this.webrtc = null
    this.signaling.close()
    this.participants.set([])
    this.sessionCodeStore.set('')
    this.sessionIdStore.set('')
    this.phase.set('disconnected')
  }

  private setError(code: string, message: string): void {
    this.errorStore.set({ code, message })
    this.callbacks.onError(code, message)
  }
}