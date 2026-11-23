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

export interface SessionInit {
  signalingUrl: string
  iceServers: RTCIceServer[]
  platform: string
  displayName: string
  role: 'host' | 'guest'
  localStream: MediaStream | null
  sourceKind: 'screen' | 'window' | null
  sessionTtlMs?: number
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
  private participantId: string | null = null
  private hostId: string | null = null
  private sessionCode = ''
  private sessionId: string | null = null
  private role: 'host' | 'guest'
  private iceServers: RTCIceServer[]
  private reconnectAttempts = 0
  private ended = false
  private lastPhase: ConnectionPhase = 'idle'
  private audio: AudioService
  private remotePeerId: string | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null
  private guestRecoveryTimer: ReturnType<typeof setTimeout> | null = null
  private cursorBounds: { x: number; y: number; width: number; height: number } | null = null

  readonly phase = writable<ConnectionPhase>('idle')
  readonly signalingStatus = writable<SignalingStatus>('idle')
  private signalingStatusValue: SignalingStatus = 'idle'
  readonly participants = writable<Participant[]>([])
  readonly metrics = writable<ConnectionMetrics | null>(null)
  readonly sessionCodeStore = writable<string>('')
  readonly sessionIdStore = writable<string>('')
  readonly errorStore = writable<{ code: string; message: string } | null>(null)
  readonly statusMessage = writable<string>('')
  readonly audioMuted = writable<boolean>(true)
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
        if (status === 'connected') {
          this.onConnectedToSignaling()
        }
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

  isActive(): boolean {
    return !this.ended
  }

  getSignalingStatus(): SignalingStatus {
    return this.signalingStatusValue
  }

  getPeerConnection(): RTCPeerConnection | null {
    return this.webrtc?.peerConnection ?? null
  }

  /** Local capture stream (used by the host's own preview). */
  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  /** Bounds of the display being shared, used to normalize host cursor coordinates. */
  setCursorBounds(bounds: { x: number; y: number; width: number; height: number } | null): void {
    this.cursorBounds = bounds
  }

  getParticipantId(): string | null {
    return this.participantId
  }

  getCode(): string {
    return this.sessionCode
  }

  start(): void {
    this.setPhase('connecting')
    this.callbacks.onStatusMessage('Connecting to signaling service...')
    this.signaling.connect()
  }

  private setPhase(next: ConnectionPhase): void {
    if (this.lastPhase === next) return
    this.lastPhase = next
    this.phase.set(next)
    this.callbacks.onPhaseChange(next)
  }

  private onConnectedToSignaling(): void {
    if (!this.signaling.isConnected) return
    console.debug('[session] hello as', this.role)
    this.signaling.send({ type: 'hello', payload: { kind: this.role, displayName: this.init.displayName } })
  }

  private handleSignal(message: SignalEnvelope): void {
    console.debug('[session] signal <-', message.type)
    switch (message.type) {
      case 'welcome': {
        const payload = message.payload as { peerId: string }
        this.participantId = payload.peerId
        this.signaling.setPeerId(this.participantId)
        if (this.role === 'host') {
          this.signaling.send({
            type: 'create-session',
            payload: {
              displayName: this.init.displayName,
              sourceKind: this.init.sourceKind,
              ttlMs: this.init.sessionTtlMs
            }
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
        this.setPhase('connecting')
        break
      }
      case 'session-joined': {
        const payload = message.payload as { sessionId: string; hostId: string; hostName: string; peerId: string }
        this.sessionId = payload.sessionId
        this.hostId = payload.hostId
        this.remotePeerId = payload.hostId
        this.sessionIdStore.set(payload.sessionId)
        this.participantId = payload.peerId
        this.signaling.setPeerId(payload.peerId)
        this.addParticipant(payload.hostId, payload.hostName, true)
        this.addSelfParticipant()
        this.callbacks.onStatusMessage('Session joined. Waiting for the host...')
        this.setPhase('connecting')
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
          this.remotePeerId = payload.peerId
          this.initWebRTCForPeer(payload.peerId)
        }
        break
      }
      case 'peer-left': {
        const payload = message.payload as { peerId: string }
        this.removeParticipant(payload.peerId)
        if (this.role === 'guest' && payload.peerId === this.hostId) {
          this.handleHostLeft()
        } else if (this.role === 'host' && this.remotePeerId === payload.peerId) {
          // The guest left; keep the host session (and capture) alive for the
          // next guest, but tear down the peer connection.
          this.teardownPeer()
        }
        break
      }
      case 'offer': {
        if (message.from) this.remotePeerId = message.from
        const payload = message.payload as { sdp: RTCSessionDescriptionInit }
        this.handleIncomingOffer(payload.sdp)
        break
      }
      case 'answer': {
        if (message.from) this.remotePeerId = message.from
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
    this.remotePeerId = targetPeerId
    await this.initWebRTCCommon()
    this.setPhase('negotiating')
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
        this.setPhase('connected')
        this.callbacks.onStatusMessage('Connected.')
        this.startCursorTransport()
        this.sendHello()
      },
      onIceCandidate: (candidate) => {
        const target = this.remotePeerId ?? this.hostId
        if (!target) return
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

    // Audio may have been enabled before this peer connection was created
    // (e.g. after a guest leaves and a new guest joins). Re-attach it.
    const audioTrack = this.audio.getAudioTrack()
    if (audioTrack) {
      this.webrtc.addAudioTrack(audioTrack)
      this.webrtc.setAudioEnabled(!get(this.audioMuted))
    }

    this.startStatsLoop()
  }

  private async handleIncomingOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    this.clearGuestRecoveryTimer()
    if (!this.webrtc) {
      await this.initWebRTCCommon()
    }
    this.setPhase('negotiating')
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
    console.debug('[webrtc] ice state:', state)
    switch (state) {
      case 'checking':
        this.setPhase('establishing')
        this.callbacks.onStatusMessage('Establishing a secure connection...')
        break
      case 'connected':
      case 'completed':
        this.clearRecoveryTimers()
        this.reconnectAttempts = 0
        this.setPhase('connected')
        this.callbacks.onStatusMessage('Connected.')
        break
      case 'disconnected':
        this.scheduleDisconnectCheck()
        break
      case 'failed':
        this.handleConnectionFailure()
        break
    }
  }

  private scheduleDisconnectCheck(): void {
    if (this.ended || this.disconnectTimer) return
    this.disconnectTimer = setTimeout(() => {
      this.disconnectTimer = null
      this.handleConnectionFailure()
    }, 2500)
  }

  private handleConnectionFailure(): void {
    if (this.ended) return

    if (this.role === 'guest') {
      // Guests cannot renegotiate. Wait for the host to send a recovery offer.
      if (this.guestRecoveryTimer) return
      this.setPhase('reconnecting')
      this.callbacks.onStatusMessage('The connection was interrupted. Waiting for the host to recover it...')
      this.guestRecoveryTimer = setTimeout(() => {
        this.guestRecoveryTimer = null
        if (this.ended) return
        this.setPhase('disconnected')
        this.callbacks.onStatusMessage('Connection lost. The host could not re-establish it.')
      }, 20_000)
      return
    }

    if (this.reconnectTimer) return
    if (this.reconnectAttempts >= 4) {
      this.setPhase('disconnected')
      this.callbacks.onStatusMessage('Connection lost. We could not re-establish it.')
      return
    }

    this.reconnectAttempts += 1
    this.setPhase('reconnecting')
    this.callbacks.onStatusMessage(
      this.reconnectAttempts === 1
        ? 'The connection was interrupted. Reconnecting...'
        : `Reconnecting... attempt ${this.reconnectAttempts} of 4`
    )

    const delay = 1200 * this.reconnectAttempts
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.renegotiateAsHost()
    }, delay)
  }

  /**
   * ICE restart only takes effect after a new offer/answer exchange. Calling
   * restartIce() by itself does not renegotiate the connection.
   */
  private async renegotiateAsHost(): Promise<void> {
    if (this.ended || this.role !== 'host' || !this.webrtc || !this.remotePeerId) return
    if (!this.signaling.isConnected) {
      // The signaling socket is required to deliver the recovery offer.
      this.handleConnectionFailure()
      return
    }
    try {
      await this.webrtc.restartIce()
      const offer = await this.webrtc.createOffer()
      this.signaling.sendTo(this.remotePeerId, {
        type: 'offer',
        payload: { sdp: offer },
        sessionId: this.sessionId ?? undefined
      })
    } catch (err) {
      console.warn('[session] ICE renegotiation failed', err)
      this.handleConnectionFailure()
    }
  }

  private clearGuestRecoveryTimer(): void {
    if (this.guestRecoveryTimer) {
      clearTimeout(this.guestRecoveryTimer)
      this.guestRecoveryTimer = null
    }
  }

  private clearRecoveryTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer)
      this.disconnectTimer = null
    }
    this.clearGuestRecoveryTimer()
  }

  private teardownPeer(): void {
    this.clearRecoveryTimers()
    this.reconnectAttempts = 0
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
    this.cursorService?.stop()
    this.cursorService = null
    this.webrtc?.close()
    this.webrtc = null
    this.monitor = null
    this.remotePeerId = null
    this.remoteStreamStore.set(null)
    this.metrics.set(null)
    if (this.role === 'host' && !this.ended) {
      this.setPhase('connecting')
      this.callbacks.onStatusMessage('Waiting for someone to join...')
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
    // Cursor coordinates are only meaningful for a full-display share. For a
    // window share we don't know the window bounds, so don't draw a misleading
    // cursor overlay.
    const shareCursor = isHost && this.init.sourceKind !== 'window'
    let current = { x: 0, y: 0, width: 1, height: 1 }
    let cleanup: (() => void) | null = null
    if (shareCursor) {
      const onMove = (event: MouseEvent): void => {
        const bounds = this.cursorBounds
        const width = bounds?.width ?? (window.screen.width || 1)
        const height = bounds?.height ?? (window.screen.height || 1)
        current = {
          x: Math.min(Math.max(event.screenX - (bounds?.x ?? 0), 0), Math.max(0, width - 1)),
          y: Math.min(Math.max(event.screenY - (bounds?.y ?? 0), 0), Math.max(0, height - 1)),
          width: width || 1,
          height: height || 1
        }
      }
      window.addEventListener('mousemove', onMove, { passive: true })
      cleanup = () => window.removeEventListener('mousemove', onMove)
    }
    this.cursorService = new CursorService(
      this.participantId ?? 'unknown',
      shareCursor
        ? {
            getPosition: () => current,
            onMove: () => cleanup ?? (() => {})
          }
        : null,
      shareCursor
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
        const remoteId = this.role === 'host' ? this.remotePeerId : this.hostId
        if (!remoteId) break
        const payload = message.payload as CursorPosition & { participantId?: string }
        const cursor = this.cursorService?.handleRemoteCursor(remoteId, payload)
        if (cursor) {
          this.participants.update((list) =>
            list.map((p) => (p.id === remoteId ? { ...p, cursor } : p))
          )
        }
        break
      }
      case 'participant-state': {
        const remoteId = this.role === 'host' ? this.remotePeerId : this.hostId
        if (!remoteId) break
        const payload = message.payload as {
          participantId?: string
          audioState?: boolean
          connectionState?: string
        }
        this.participants.update((list) =>
          list.map((p) =>
            p.id === remoteId
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
        const payload = message.payload as { kind: string; peerId?: string }
        if (payload.kind === 'ended') {
          if (this.role === 'guest') {
            this.handleHostLeft()
          } else {
            // An older/guest client asked to end the whole session. The host
            // owns the session, so treat it as that guest leaving instead.
            if (this.remotePeerId) this.removeParticipant(this.remotePeerId)
            this.teardownPeer()
          }
        } else if (payload.kind === 'peer-left' && this.role === 'host') {
          if (this.remotePeerId) this.removeParticipant(this.remotePeerId)
          this.teardownPeer()
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
          const remoteId = this.role === 'host' ? this.remotePeerId : this.hostId
          this.participants.update((list) =>
            list.map((p) => (p.id === remoteId ? { ...p, rtt } : p))
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
    const tick = async (): Promise<void> => {
      const client = this.webrtc
      if (this.ended || !client) return
      try {
        const stats = await client.getStats()
        await this.monitor?.update(stats)
      } catch {
        // The peer connection can close between the ended check and getStats().
      }
    }
    void tick()
    this.statsInterval = setInterval(tick, 2000)
  }

  private statsInterval: ReturnType<typeof setInterval> | null = null

  private sendParticipantState(audioState: boolean): void {
    this.webrtc?.sendDataChannelMessage({
      v: 1,
      type: 'participant-state',
      payload: { participantId: this.participantId, audioState }
    })
  }

  async enableAudio(): Promise<void> {
    if (this.role !== 'host') {
      this.callbacks.onError('audio-guest', 'Only the host can share audio.')
      return
    }
    if (!this.audio.isSupported) {
      this.callbacks.onError('audio-unsupported', 'System audio sharing is not supported on this platform.')
      return
    }
    if (!this.webrtc) {
      this.callbacks.onError('audio-not-connected', 'Wait for the session to connect before sharing audio.')
      return
    }
    if (!this.audio.isEnabled) {
      const enabled = await this.audio.enable()
      if (!enabled) {
        this.callbacks.onError('audio-denied', 'System audio could not be captured.')
        return
      }
    }
    const track = this.audio.getAudioTrack()
    if (!track) {
      this.callbacks.onError('audio-denied', 'System audio could not be captured.')
      return
    }
    // Re-add on every enable: the peer connection may have been rebuilt after
    // a guest left and a new one joined.
    this.webrtc.addAudioTrack(track)
    this.audio.setEnabled(true)
    this.webrtc.setAudioEnabled(true)
    this.audioMuted.set(false)
    this.sendParticipantState(true)
  }

  disableAudio(): void {
    this.audio.setEnabled(false)
    this.webrtc?.setAudioEnabled(false)
    this.audioMuted.set(true)
    this.sendParticipantState(false)
  }

  async toggleAudio(): Promise<void> {
    if (get(this.audioMuted)) {
      await this.enableAudio()
    } else {
      this.disableAudio()
    }
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
    if (this.role === 'host') {
      this.webrtc?.sendDataChannelMessage({ v: 1, type: 'session-event', payload: { kind: 'ended' } })
    } else {
      this.webrtc?.sendDataChannelMessage({
        v: 1,
        type: 'session-event',
        payload: { kind: 'peer-left', peerId: this.participantId }
      })
    }
    this.cleanup()
  }

  private cleanup(): void {
    this.ended = true
    this.clearRecoveryTimers()
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
    this.cursorService?.stop()
    this.cursorService = null
    this.webrtc?.close()
    this.webrtc = null
    this.monitor = null
    this.signaling.close()

    // Stop the local capture. Closing the RTCPeerConnection does not stop the
    // source tracks, so without this the OS keeps sharing/recording the screen
    // after the user ends the session.
    const stream = this.localStream
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
      this.localStream = null
    }
    this.audio.stop()
    if (typeof window !== 'undefined' && window.__sightPendingStream === stream) {
      window.__sightPendingStream = null
    }

    this.remoteStreamStore.set(null)
    this.metrics.set(null)
    this.participants.set([])
    this.sessionCodeStore.set('')
    this.sessionIdStore.set('')
    this.audioMuted.set(true)
    this.reconnectAttempts = 0
    this.remotePeerId = null
    this.setPhase('disconnected')
  }

  private setError(code: string, message: string): void {
    console.warn('[session] error:', code, message)
    this.errorStore.set({ code, message })
    this.callbacks.onError(code, message)
  }
}