export type AudioCapability = 'supported' | 'unsupported-platform' | 'system-audio-denied'

export class AudioService {
  private enabled = false
  private audioTrack: MediaStreamTrack | null = null
  private stream: MediaStream | null = null
  private capability: AudioCapability = 'supported'

  constructor(private readonly platform: string) {
    if (platform === 'linux') {
      // Linux system audio capture is not portable across desktop environments.
      this.capability = 'unsupported-platform'
    }
  }

  get isSupported(): boolean {
    return this.capability === 'supported'
  }

  get capabilityState(): AudioCapability {
    return this.capability
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  async enable(): Promise<void> {
    if (!this.isSupported || this.enabled) return
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      })
      const track = this.stream.getAudioTracks()[0]
      if (!track) {
        this.capability = 'system-audio-denied'
        this.stop()
        return
      }
      this.audioTrack = track
      this.enabled = true
    } catch {
      this.capability = 'system-audio-denied'
      this.enabled = false
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.audioTrack) {
      this.audioTrack.enabled = enabled
    }
    this.enabled = enabled
  }

  getAudioTrack(): MediaStreamTrack | null {
    return this.audioTrack
  }

  stop(): void {
    this.enabled = false
    this.audioTrack?.stop()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.audioTrack = null
    this.stream = null
  }
}