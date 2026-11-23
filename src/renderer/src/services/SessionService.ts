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

const MAX_RECONNECT_ATTEMPTS = 4
const DISCONNECT_GRACE_MS = 2500
const GUEST_RECOVERY_TIMEOUT_MS = 20_000

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

interface PeerState {
  peerId: string
  webrtc: WebRTCService
  monitor: ConnectionMonitor
  statsInterval: ReturnType<typeof setInterval> | null
  reconnectAttempts: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  disconnectTimer: ReturnType<typeof setTimeout> | null
  recoveryTimer: ReturnType<typeof setTimeout> | null
  dataChannelOpen: boolean
  initializing: boolean
}

interface CursorBounds {
  x: number
  y: number
  width: number
  height: number
}

export class SessionService {
  private signaling: SignalingService
  private peers = new Map<string, PeerState>()
  private cursorService: CursorService | null = null
  private localStream: MediaStream | null = null
  private participantId: string | null = null
  private hostId: string | null = null
  private sessionCode = ''
  private sessionId: string | null = null
  private hostToken: string | null = null
  private role: 'host' | 'guest'
  private iceServers: RTCIceServer[]
  private ended = false
  private lastPhase: ConnectionPhase = 'idle'
  private audio: AudioService
  private cursorBounds: CursorBounds | null = null

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
    for (const peer of this.peers.values()) {
      const pc = peer.webrtc.peerConnection
      if (pc) return pc
    }
    return null
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  setCursorBounds(bounds: CursorBounds | null): void {
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

  private createSession(): void {
    this.signaling.send({
      type: 'create-session',
      payload: {
        displayName: this.init.displayName,
        sourceKind: this.init.sourceKind,
        ttlMs: this.init.sessionTtlMs
      }
    })
  }

  private sendSignal(to: string, message: Omit<SignalEnvelope, 'to'>): boolean {
    return this.signaling.sendTo(to, { ...message, sessionId: this.sessionId ?? undefined })
  }

  private handleSignal(message: SignalEnvelope): void {
    console.debug('[session] signal <-', message.type)
    switch (message.type) {
      case 'welcome': {
        const payload = message.payload as { peerId: string }
        const reconnectingGuest = this.role === 'guest' && this.sessionId !== null
        this.participantId = payload.peerId
        this.signaling.setPeerId(payload.peerId)

        if (this.role === 'host') {
          if (this.hostToken && this.sessionId) {
            this.signaling.send({
              type: 'resume-session',
              payload: { sessionId: this.sessionId, token: this.hostToken }
            })
          } else {
            this.createSession()
          }
        } else {
          if (reconnectingGuest) this.prepareGuestReconnect()
          this.signaling.send({
            type: 'join-session',
            payload: {
              code: this.sessionCode || this.init.code || '',
              displayName: this.init.displayName
            }
          })
        }
        break
      }
      case 'session-created': {
        const payload = message.payload as {
          sessionId: string
          code: string
          peerId: string
          hostToken?: string
          expiresAt: number
        }
        this.sessionId = payload.sessionId
        this.sessionCode = payload.code
        this.hostToken = payload.hostToken ?? null
        this.hostId = payload.peerId
        this.sessionIdStore.set(payload.sessionId)
        this.sessionCodeStore.set(payload.code)
        this.addSelfParticipant()
        this.callbacks.onStatusMessage('Session ready. Waiting for someone to join...')
        this.setPhase('connecting')
        break
      }
      case 'session-resumed': {
        const payload = message.payload as {
          sessionId: string
          code: string
          peerId: string
          expiresAt: number
          peers?: Array<{ peerId: string; displayName: string }>
        }
        this.sessionId = payload.sessionId
        this.sessionCode = payload.code
        this.hostId = payload.peerId
        this.participantId = payload.peerId
        this.signaling.setPeerId(payload.peerId)
        this.sessionIdStore.set(payload.sessionId)
        this.sessionCodeStore.set(payload.code)

        // Reconcile against the server snapshot: guests may have joined or left
        // while this host's signaling socket was down.
        if (payload.peers) {
          const listed = new Set(payload.peers.map((peer) => peer.peerId))
          for (const participant of get(this.participants)) {
            if (!participant.isSelf && !listed.has(participant.id)) {
              this.removeParticipant(participant.id)
            }
          }
          for (const peerId of [...this.peers.keys()]) {
            if (!listed.has(peerId)) this.closePeer(peerId)
          }
          for (const peer of payload.peers) {
            this.addParticipant(peer.peerId, peer.displayName, false)
          }
        }

        this.addSelfParticipant()
        this.updateHostPhase()
        // Recover any existing peer connection that failed while signaling was down.
        for (const peer of this.peers.values()) {
          this.clearPeerTimers(peer)
          peer.reconnectAttempts = 0
          if (!peer.dataChannelOpen && !peer.initializing) void this.renegotiateHostPeer(peer.peerId)
        }
        break
      }
      case 'session-joined': {
        const payload = message.payload as {
          sessionId: string
          hostId: string
          hostName: string
          peerId: string
        }
        this.sessionId = payload.sessionId
        this.hostId = payload.hostId
        this.sessionIdStore.set(payload.sessionId)
        this.participantId = payload.peerId
        this.signaling.setPeerId(payload.peerId)
        this.addParticipant(payload.hostId, payload.hostName, true)
        this.addSelfParticipant()
        this.callbacks.onStatusMessage('Session joined. Waiting for the host...')
        this.setPhase('connecting')
        break
      }
      case 'session-not-found':
      case 'session-expired': {
        if (this.role === 'host' && this.hostToken) {
          // The server no longer has the old session (expired or restarted).
          // Fall back to a fresh code instead of leaving the app dead.
          this.hostToken = null
          this.closeAllPeers()
          this.participants.set([])
          this.remoteStreamStore.set(null)
          this.callbacks.onStatusMessage('Previous session expired. Starting a new one...')
          this.createSession()
          break
        }
        this.setError(
          message.type,
          message.type === 'session-not-found'
            ? 'We could not find that session code. Double-check it and try again.'
            : 'That session has expired. Ask the host to start a new one.'
        )
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
        if (this.role === 'host' && !this.peers.has(payload.peerId)) {
          void this.connectToGuest(payload.peerId)
        }
        break
      }
      case 'peer-left': {
        const payload = message.payload as { peerId: string }
        this.removeParticipant(payload.peerId)
        this.closePeer(payload.peerId)
        if (this.role === 'guest' && payload.peerId === this.hostId) {
          this.handleHostLeft()
        } else if (this.role === 'host') {
          this.updateHostPhase()
        }
        break
      }
      case 'offer': {
        const from = message.from
        if (!from) return
        const payload = message.payload as { sdp: RTCSessionDescriptionInit }
        if (this.role === 'guest') {
          if (from !== this.hostId) return
          void this.handleGuestOffer(from, payload.sdp)
        } else {
          this.handleHostOffer(from, payload.sdp)
        }
        break
      }
      case 'answer': {
        const from = message.from
        if (!from) return
        const payload = message.payload as { sdp: RTCSessionDescriptionInit }
        const peer = this.peers.get(from)
        if (peer) {
          peer.webrtc.handleAnswer(payload.sdp).catch((err) => {
            console.warn('[session] answer failed', err)
          })
        }
        break
      }
      case 'ice-candidate': {
        const from = message.from
        if (!from) return
        const payload = message.payload as { candidate: RTCIceCandidateInit | null }
        this.peers.get(from)?.webrtc.addIceCandidate(payload.candidate)
        break
      }
      case 'peer-renamed': {
        const payload = message.payload as { peerId: string; displayName: string }
        this.updateParticipantName(payload.peerId, payload.displayName)
        break
      }
      case 'error': {
        const payload = message.payload as { code: string; message: string }
        if (payload.code === 'resume-failed' && this.role === 'host' && this.hostToken) {
          this.hostToken = null
          this.closeAllPeers()
          this.participants.set([])
          this.remoteStreamStore.set(null)
          this.callbacks.onStatusMessage('Previous session expired. Starting a new one...')
          this.createSession()
          break
        }
        this.setError(payload.code, payload.message)
        break
      }
    }
  }

  private prepareGuestReconnect(): void {
    this.closeAllPeers()
    this.remoteStreamStore.set(null)
    this.participants.update((list) => list.filter((p) => p.isSelf))
    this.cursorService?.stop()
    this.cursorService = null
  }

  private addParticipant(participantId: string, displayName: string, isHost: boolean): void {
    if (participantId === this.participantId) return
    const existing = get(this.participants).find((p) => p.id === participantId)
    if (existing) {
      this.updateParticipantName(participantId, displayName)
      return
    }
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
    this.participants.update((list) =>
      list.map((p) => (p.id === participantId ? { ...p, displayName } : p))
    )
  }

  private setParticipantConnection(participantId: string, state: Participant['connectionState']): void {
    this.participants.update((list) =>
      list.map((p) => (p.id === participantId ? { ...p, connectionState: state } : p))
    )
  }

  private addSelfParticipant(): void {
    if (!this.participantId) return
    const list = get(this.participants)
    const existing = list.find((p) => p.isSelf)
    if (existing) {
      if (existing.id !== this.participantId) {
        this.participants.update((items) =>
          items.map((p) => (p.isSelf ? { ...p, id: this.participantId! } : p))
        )
      }
      return
    }
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
    this.participants.update((items) => [...items, self])
  }

  private createPeer(peerId: string): PeerState {
    const webrtc = new WebRTCService({
      iceServers: this.iceServers,
      role: this.role,
      onConnectionStateChange: (state) => this.handlePeerIceState(peerId, state),
      onDataChannelMessage: (message) => this.handleDataChannel(peerId, message),
      onTrack: () => this.handlePeerTrack(peerId),
      onIceCandidate: (candidate) => {
        this.sendSignal(peerId, { type: 'ice-candidate', payload: { candidate } })
      },
      onDataChannelOpen: () => this.handlePeerDataChannelOpen(peerId),
      onDataChannelClose: () => this.handlePeerDataChannelClose(peerId),
      onDataChannelError: () => this.handlePeerDataChannelClose(peerId),
      onIceError: (error) => console.warn('[session] ICE candidate error', error)
    })
    if (this.localStream) webrtc.setLocalStream(this.localStream)
    const monitor = new ConnectionMonitor(() => this.handlePeerMetrics(peerId))
    return {
      peerId,
      webrtc,
      monitor,
      statsInterval: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      disconnectTimer: null,
      recoveryTimer: null,
      dataChannelOpen: false,
      initializing: false
    }
  }

  private async connectToGuest(peerId: string): Promise<void> {
    if (this.ended || this.role !== 'host' || this.peers.has(peerId)) return
    const peer = this.createPeer(peerId)
    this.peers.set(peerId, peer)
    peer.initializing = true

    try {
      await peer.webrtc.initialize()
      if (this.ended || this.peers.get(peerId) !== peer) return
      peer.initializing = false
      const audioTrack = this.audio.getAudioTrack()
      if (audioTrack) {
        peer.webrtc.addAudioTrack(audioTrack)
        peer.webrtc.setAudioEnabled(!get(this.audioMuted))
      }
      this.startPeerStats(peer)
      if (!this.hasConnectedPeers()) {
        this.setPhase('negotiating')
        this.callbacks.onStatusMessage('Negotiating with the guest...')
      } else {
        this.callbacks.onStatusMessage('A new guest is joining...')
      }
      const offer = await peer.webrtc.createOffer()
      this.sendSignal(peerId, { type: 'offer', payload: { sdp: offer } })
    } catch (err) {
      console.warn('[session] could not create peer for guest', peerId, err)
      this.closePeer(peerId)
    }
  }

  private async handleGuestOffer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    let peer = this.peers.get(peerId)
    if (!peer) {
      peer = this.createPeer(peerId)
      this.peers.set(peerId, peer)
      peer.initializing = true
      try {
        await peer.webrtc.initialize()
        if (this.ended || this.peers.get(peerId) !== peer) return
        peer.initializing = false
        this.startPeerStats(peer)
      } catch (err) {
        console.warn('[session] could not initialise guest peer', err)
        this.closePeer(peerId)
        return
      }
    }

    this.clearPeerTimers(peer)
    this.setPhase('negotiating')
    this.callbacks.onStatusMessage('Negotiating with the host...')
    try {
      const answer = await peer.webrtc.handleOffer(sdp)
      this.sendSignal(peerId, { type: 'answer', payload: { sdp: answer } })
      if (peer.dataChannelOpen) {
        this.setPhase('connected')
        this.callbacks.onStatusMessage('Connected.')
      }
    } catch (err) {
      console.warn('[session] offer handling failed', err)
      this.handlePeerFailure(peerId)
    }
  }

  private handleHostOffer(peerId: string, sdp: RTCSessionDescriptionInit): void {
    const peer = this.peers.get(peerId)
    if (!peer) return
    this.clearPeerTimers(peer)
    peer.webrtc
      .handleOffer(sdp)
      .then((answer) => {
        this.sendSignal(peerId, { type: 'answer', payload: { sdp: answer } })
        if (peer.dataChannelOpen) this.updateHostPhase()
      })
      .catch((err) => {
        console.warn('[session] offer handling failed', err)
        this.handlePeerFailure(peerId)
      })
  }

  private handlePeerTrack(peerId: string): void {
    if (this.role !== 'guest') return
    const stream = this.peers.get(peerId)?.webrtc.getRemoteStream()
    if (stream) {
      this.remoteStreamStore.set(stream)
      this.callbacks.onVideoReady(stream)
    }
  }

  private startPeerStats(peer: PeerState): void {
    if (peer.statsInterval) return
    const tick = async (): Promise<void> => {
      if (this.ended || this.peers.get(peer.peerId) !== peer) return
      try {
        const stats = await peer.webrtc.getStats()
        await peer.monitor.update(stats)
      } catch {
        // The peer connection can close between the check and getStats().
      }
    }
    void tick()
    peer.statsInterval = setInterval(tick, 2000)
  }

  private handlePeerMetrics(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (!peer) return
    if (this.role === 'guest') {
      const metrics = peer.monitor.current
      this.metrics.set(metrics)
      this.callbacks.onMetrics(metrics)
      return
    }
    const aggregate = this.aggregateHostMetrics()
    this.metrics.set(aggregate)
    if (aggregate) this.callbacks.onMetrics(aggregate)
  }

  private aggregateHostMetrics(): ConnectionMetrics | null {
    const values = [...this.peers.values()].map((p) => p.monitor.current)
    const active = values.filter((m) => m.rtt != null || m.bitrate != null || m.connectionType !== 'unknown')
    if (active.length === 0) return null

    let bitrate: number | null = null
    let frameRate: number | null = null
    let packetLoss: number | null = null
    let rttTotal = 0
    let rttCount = 0
    let localCandidateType: string | null = null
    let remoteCandidateType: string | null = null
    let videoWidth: number | null = null
    let videoHeight: number | null = null
    let codec: string | null = null
    let connectionType: ConnectionMetrics['connectionType'] = 'unknown'

    for (const m of active) {
      if (m.bitrate != null) bitrate = (bitrate ?? 0) + m.bitrate
      if (m.frameRate != null) frameRate = Math.max(frameRate ?? 0, m.frameRate)
      if (m.packetLoss != null) {
        packetLoss = packetLoss == null ? m.packetLoss : (packetLoss + m.packetLoss) / 2
      }
      if (m.rtt != null) {
        rttTotal += m.rtt
        rttCount++
      }
      localCandidateType ??= m.localCandidateType
      remoteCandidateType ??= m.remoteCandidateType
      videoWidth ??= m.videoWidth
      videoHeight ??= m.videoHeight
      codec ??= m.codec
      if (m.connectionType === 'relay') connectionType = 'relay'
      else if (m.connectionType === 'direct' && connectionType !== 'relay') connectionType = 'direct'
    }

    return {
      rtt: rttCount > 0 ? Math.round(rttTotal / rttCount) : null,
      packetLoss: packetLoss == null ? null : Math.round(packetLoss * 10) / 10,
      bitrate,
      frameRate,
      codec,
      connectionType,
      localCandidateType,
      remoteCandidateType,
      videoWidth,
      videoHeight
    }
  }

  private handlePeerIceState(peerId: string, state: RTCIceConnectionState): void {
    const peer = this.peers.get(peerId)
    if (!peer || this.ended) return
    console.debug('[webrtc] ice state:', peerId, state)
    switch (state) {
      case 'checking':
        if (this.role === 'guest') {
          this.setPhase('establishing')
          this.callbacks.onStatusMessage('Establishing a secure connection...')
        }
        break
      case 'connected':
      case 'completed':
        this.clearPeerTimers(peer)
        peer.reconnectAttempts = 0
        this.setParticipantConnection(peerId, 'connected')
        if (this.role === 'guest') {
          this.setPhase('connected')
          this.callbacks.onStatusMessage('Connected.')
        } else {
          this.updateHostPhase()
        }
        break
      case 'disconnected':
        this.schedulePeerDisconnect(peer)
        break
      case 'failed':
        this.handlePeerFailure(peerId)
        break
    }
  }

  private handlePeerDataChannelOpen(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (!peer) return
    peer.dataChannelOpen = true
    this.clearPeerTimers(peer)
    peer.reconnectAttempts = 0
    this.setParticipantConnection(peerId, 'connected')
    this.startCursorTransport()
    if (this.role === 'guest') {
      this.setPhase('connected')
      this.callbacks.onStatusMessage('Connected.')
    } else {
      // Give the new guest the current host audio state immediately.
      peer.webrtc.sendDataChannelMessage({
        v: 1,
        type: 'participant-state',
        payload: { participantId: this.participantId, audioState: !get(this.audioMuted) }
      })
      this.updateHostPhase()
    }
  }

  private handlePeerDataChannelClose(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (!peer || this.ended) return
    peer.dataChannelOpen = false
    this.setParticipantConnection(peerId, 'reconnecting')
    if (this.role === 'guest') {
      this.handlePeerFailure(peerId)
    }
  }

  private schedulePeerDisconnect(peer: PeerState): void {
    if (this.ended || peer.disconnectTimer) return
    peer.disconnectTimer = setTimeout(() => {
      peer.disconnectTimer = null
      this.handlePeerFailure(peer.peerId)
    }, DISCONNECT_GRACE_MS)
  }

  private handlePeerFailure(peerId: string): void {
    if (this.ended) return
    const peer = this.peers.get(peerId)
    if (!peer) return

    this.setParticipantConnection(peerId, 'reconnecting')

    if (this.role === 'guest') {
      if (peer.recoveryTimer) return
      this.setPhase('reconnecting')
      this.callbacks.onStatusMessage('The connection was interrupted. Waiting for the host to recover it...')
      peer.recoveryTimer = setTimeout(() => {
        peer.recoveryTimer = null
        if (this.ended) return
        if (!peer.dataChannelOpen) {
          this.setParticipantConnection(peerId, 'disconnected')
          this.setPhase('disconnected')
          this.callbacks.onStatusMessage('Connection lost. The host could not re-establish it.')
        }
      }, GUEST_RECOVERY_TIMEOUT_MS)
      return
    }

    if (peer.reconnectTimer) return
    if (peer.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setParticipantConnection(peerId, 'disconnected')
      this.updateHostPhase()
      return
    }

    peer.reconnectAttempts += 1
    if (!this.hasConnectedPeers()) this.setPhase('reconnecting')
    this.callbacks.onStatusMessage(
      `Reconnecting guest... attempt ${peer.reconnectAttempts} of ${MAX_RECONNECT_ATTEMPTS}`
    )
    const delay = 1200 * peer.reconnectAttempts
    peer.reconnectTimer = setTimeout(() => {
      peer.reconnectTimer = null
      void this.renegotiateHostPeer(peerId)
    }, delay)
  }

  private async renegotiateHostPeer(peerId: string): Promise<void> {
    if (this.ended || this.role !== 'host') return
    const peer = this.peers.get(peerId)
    if (!peer) return
    if (!this.signaling.isConnected) {
      this.handlePeerFailure(peerId)
      return
    }
    try {
      await peer.webrtc.restartIce()
      const offer = await peer.webrtc.createOffer()
      this.sendSignal(peerId, { type: 'offer', payload: { sdp: offer } })
    } catch (err) {
      console.warn('[session] ICE renegotiation failed', err)
      this.handlePeerFailure(peerId)
    }
  }

  private clearPeerTimers(peer: PeerState): void {
    if (peer.reconnectTimer) {
      clearTimeout(peer.reconnectTimer)
      peer.reconnectTimer = null
    }
    if (peer.disconnectTimer) {
      clearTimeout(peer.disconnectTimer)
      peer.disconnectTimer = null
    }
    if (peer.recoveryTimer) {
      clearTimeout(peer.recoveryTimer)
      peer.recoveryTimer = null
    }
  }

  private closePeer(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (!peer) return
    this.clearPeerTimers(peer)
    if (peer.statsInterval) {
      clearInterval(peer.statsInterval)
      peer.statsInterval = null
    }
    peer.webrtc.close()
    this.peers.delete(peerId)
    if (this.role === 'host') {
      const aggregate = this.aggregateHostMetrics()
      this.metrics.set(aggregate)
      this.updateHostPhase()
    }
  }

  private closeAllPeers(): void {
    for (const peerId of [...this.peers.keys()]) {
      this.closePeer(peerId)
    }
    this.remoteStreamStore.set(null)
  }

  private hasConnectedPeers(): boolean {
    for (const peer of this.peers.values()) {
      if (peer.dataChannelOpen) return true
    }
    return false
  }

  private updateHostPhase(): void {
    if (this.ended) return
    const connected = [...this.peers.values()].filter((p) => p.dataChannelOpen).length
    if (connected > 0) {
      this.setPhase('connected')
      this.callbacks.onStatusMessage(
        connected === 1 ? '1 guest connected.' : `${connected} guests connected.`
      )
    } else if (this.peers.size > 0) {
      this.setPhase(this.lastPhase === 'reconnecting' ? 'reconnecting' : 'connecting')
      this.callbacks.onStatusMessage('Waiting for the guest connection to settle...')
    } else {
      this.setPhase('connecting')
      this.callbacks.onStatusMessage('Waiting for someone to join...')
    }
  }

  private startCursorTransport(): void {
    if (this.cursorService) return
    const isHost = this.role === 'host'
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
              this.broadcastDataChannel({
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

  private broadcastDataChannel(message: DataChannelMessage, exceptPeerId?: string): void {
    for (const peer of this.peers.values()) {
      if (peer.peerId === exceptPeerId) continue
      peer.webrtc.sendDataChannelMessage(message)
    }
  }

  private handleDataChannel(peerId: string, message: DataChannelMessage): void {
    switch (message.type) {
      case 'cursor': {
        const payload = message.payload as CursorPosition & { participantId?: string }
        const fromId = this.role === 'host' ? peerId : payload.participantId ?? this.hostId
        if (!fromId) break
        const cursor = this.cursorService?.handleRemoteCursor(fromId, payload)
        if (cursor) {
          this.participants.update((list) =>
            list.map((p) => (p.id === fromId ? { ...p, cursor } : p))
          )
        }
        if (this.role === 'host') {
          this.broadcastDataChannel(
            {
              v: 1,
              type: 'cursor',
              payload: { participantId: fromId, x: cursor?.x ?? payload.x, y: cursor?.y ?? payload.y, timestamp: payload.timestamp }
            },
            peerId
          )
        }
        break
      }
      case 'participant-state': {
        const payload = message.payload as {
          audioState?: boolean
          connectionState?: string
        }
        const fromId = this.role === 'host' ? peerId : this.hostId
        if (!fromId) break
        this.participants.update((list) =>
          list.map((p) =>
            p.id === fromId
              ? {
                  ...p,
                  audioState: payload.audioState ?? p.audioState,
                  connectionState:
                    (payload.connectionState as Participant['connectionState']) ?? p.connectionState
                }
              : p
          )
        )
        break
      }
      case 'session-event': {
        const payload = message.payload as { kind: string }
        if (payload.kind === 'ended') {
          if (this.role === 'guest') {
            this.handleHostLeft()
          } else {
            this.removeParticipant(peerId)
            this.closePeer(peerId)
          }
        } else if (payload.kind === 'peer-left' && this.role === 'host') {
          this.removeParticipant(peerId)
          this.closePeer(peerId)
        }
        break
      }
      case 'ping': {
        this.peers.get(peerId)?.webrtc.sendDataChannelMessage({
          v: 1,
          type: 'pong',
          payload: { timestamp: Date.now() }
        })
        break
      }
      case 'pong': {
        const payload = message.payload as { timestamp?: number }
        if (payload.timestamp) {
          const rtt = Date.now() - payload.timestamp
          this.participants.update((list) =>
            list.map((p) => (p.id === peerId ? { ...p, rtt } : p))
          )
        }
        break
      }
    }
  }

  private sendParticipantState(audioState: boolean): void {
    this.broadcastDataChannel({
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
    for (const peer of this.peers.values()) {
      peer.webrtc.addAudioTrack(track)
      peer.webrtc.setAudioEnabled(true)
    }
    this.audio.setEnabled(true)
    this.audioMuted.set(false)
    this.sendParticipantState(true)
  }

  disableAudio(): void {
    this.audio.setEnabled(false)
    for (const peer of this.peers.values()) {
      peer.webrtc.setAudioEnabled(false)
    }
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
  }

  endSession(): void {
    this.ended = true
    if (this.role === 'host') {
      this.broadcastDataChannel({ v: 1, type: 'session-event', payload: { kind: 'ended' } })
      this.signaling.send({ type: 'end-session', payload: {} })
    } else {
      this.broadcastDataChannel({
        v: 1,
        type: 'session-event',
        payload: { kind: 'peer-left', peerId: this.participantId }
      })
    }
    this.cleanup()
  }

  private cleanup(): void {
    this.ended = true
    this.closeAllPeers()
    this.cursorService?.stop()
    this.cursorService = null
    this.signaling.close()

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
    this.hostToken = null
    this.sessionId = null
    this.setPhase('disconnected')
  }

  private handleHostLeft(): void {
    if (this.ended) return
    this.setError('host-left', 'The host ended the session.')
    this.cleanup()
  }

  private setError(code: string, message: string): void {
    console.warn('[session] error:', code, message)
    this.errorStore.set({ code, message })
    this.callbacks.onError(code, message)
  }
}
