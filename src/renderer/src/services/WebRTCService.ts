import type { DataChannelMessage } from '@shared/protocol/datachannel'
import type { SignalEnvelope } from '@shared/protocol/messages'
import { ConnectionStateMachine } from '@shared/lib/connection-state-machine'

export type Role = 'host' | 'guest'
export type ChannelLabel = 'sight-data'

export interface WebRtcServiceOptions {
  iceServers: RTCIceServer[]
  role: Role
  onConnectionStateChange?: (state: RTCIceConnectionState) => void
  onDataChannelMessage?: (message: DataChannelMessage) => void
  onTrack?: (event: RTCTrackEvent) => void
  onStats?: (stats: RTCStatsReport) => void
  onIceCandidate?: (candidate: RTCIceCandidate) => void
  onDataChannelOpen?: () => void
  onDataChannelClose?: () => void
  onDataChannelError?: () => void
  onIceError?: (error: Error) => void
}

export class WebRTCService {
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private pendingCandidates: RTCIceCandidateInit[] = []
  private readonly stateMachine = new ConnectionStateMachine()
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private remoteAudioTrack: MediaStreamTrack | null = null
  private readonly onDataChannelMessage: ((message: DataChannelMessage) => void) | null

  constructor(private readonly options: WebRtcServiceOptions) {
    this.onDataChannelMessage = options.onDataChannelMessage ?? null
  }

  get connectionState(): RTCIceConnectionState {
    return this.pc?.iceConnectionState ?? 'new'
  }

  get peerConnection(): RTCPeerConnection | null {
    return this.pc
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream
  }

  setLocalStream(stream: MediaStream): void {
    this.localStream = stream
  }

  async initialize(): Promise<RTCPeerConnection> {
    if (this.pc) return this.pc
    const pc = new RTCPeerConnection({
      iceServers: this.options.iceServers,
      iceCandidatePoolSize: 10
    })

    pc.oniceconnectionstatechange = () => {
      this.options.onConnectionStateChange?.(pc.iceConnectionState)
    }

    pc.onconnectionstatechange = () => {
      this.options.onConnectionStateChange?.(pc.iceConnectionState)
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.pendingCandidates.push(event.candidate)
        this.options.onIceCandidate?.(event.candidate)
      }
    }

    pc.ondatachannel = (event) => {
      this.dataChannel = event.channel
      this.setupDataChannel(this.dataChannel)
    }

    pc.ontrack = (event) => {
      if (event.streams.length > 0) {
        this.remoteStream = event.streams[0]
      }
      if (event.track.kind === 'audio') {
        this.remoteAudioTrack = event.track
      }
      this.options.onTrack?.(event)
    }

    this.pc = pc

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream)
      }
    }

    if (this.options.role === 'host') {
      this.createDataChannel()
    }

    return pc
  }

  private createDataChannel(): void {
    if (!this.pc) return
    const channel = this.pc.createDataChannel('sight-data', {
      ordered: false,
      maxRetransmits: 3
    })
    this.dataChannel = channel
    this.setupDataChannel(channel)
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.options.onDataChannelOpen?.()
    }
    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as DataChannelMessage
        this.onDataChannelMessage?.(message)
      } catch {
        // ignore malformed data channel messages
      }
    }
    channel.onclose = () => {
      this.options.onDataChannelClose?.()
    }
    channel.onerror = () => {
      this.options.onDataChannelError?.()
    }
  }

  sendDataChannelMessage(message: DataChannelMessage): boolean {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message))
      return true
    }
    return false
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('Peer connection not initialized')
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    })
    await this.pc.setLocalDescription(offer)
    return offer
  }

  async handleOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('Peer connection not initialized')
    await this.pc.setRemoteDescription(sdp)
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    return answer
  }

  async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('Peer connection not initialized')
    await this.pc.setRemoteDescription(sdp)
    this.flushPendingCandidates()
  }

  async addIceCandidate(candidate: RTCIceCandidateInit | null): Promise<void> {
    if (!this.pc) return
    if (!candidate) return
    try {
      await this.pc.addIceCandidate(candidate)
    } catch (err) {
      this.options.onIceError?.(err as Error)
    }
  }

  private flushPendingCandidates(): void {
    if (!this.pc) return
    const pending = this.pendingCandidates.splice(0)
    for (const candidate of pending) {
      this.pc.addIceCandidate(candidate).catch((err) => this.options.onIceError?.(err as Error))
    }
  }

  async restartIce(): Promise<void> {
    if (!this.pc) return
    try {
      await this.pc.restartIce()
    } catch {
      // restartIce may throw if not in a valid state
    }
  }

  async getStats(): Promise<RTCStatsReport | null> {
    if (!this.pc) return null
    return this.pc.getStats()
  }

  setAudioEnabled(enabled: boolean): void {
    if (!this.localStream) return
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = enabled
    }
  }

  addAudioTrack(track: MediaStreamTrack): void {
    if (!this.pc) return
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'audio')
    if (sender) {
      sender.replaceTrack(track).catch(() => {})
    } else {
      this.pc.addTrack(track, this.localStream ?? new MediaStream([track]))
    }
  }

  getAudioEnabled(): boolean {
    if (!this.localStream) return false
    const track = this.localStream.getAudioTracks()[0]
    return track ? track.enabled : false
  }

  close(): void {
    if (this.dataChannel) {
      this.dataChannel.onclose = null
      this.dataChannel.close()
      this.dataChannel = null
    }
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    this.pendingCandidates = []
    this.stateMachine.reset()
    this.localStream = null
    this.remoteStream = null
    this.remoteAudioTrack = null
  }
}