export type AudioCapability = 'supported' | 'unsupported-platform' | 'system-audio-denied'

export class AudioService {
  private enabled = false
  private audioTrack: MediaStreamTrack | null = null
  private stream: MediaStream | null = null
  private capability: AudioCapability
  private readonly platformSupported: boolean

  constructor(private readonly platform: string) {
    // Linux system audio capture is not portable across desktop environments.
    this.platformSupported = platform !== 'linux'
    this.capability = this.platformSupported ? 'supported' : 'unsupported-platform'
  }

  get isSupported(): boolean {
    return this.platformSupported
  }

  get capabilityState(): AudioCapability {
    return this.capability
  }

  get isEnabled(): boolean {
    return this.enabled && this.audioTrack !== null
  }

  /**
   * Capture system audio. This asks the platform for a display capture with
   * audio; the video track is kept alive because Chromium may tie loopback
   * audio to the capture session, but it is never attached to the peer
   * connection.
   *
   * Returns false when the platform/user declined or no audio track was
   * produced. Callers can retry later; a previous denial is not permanent.
   */
  async enable(): Promise<boolean> {
    if (!this.platformSupported) {
      this.capability = 'unsupported-platform'
      return false
    }
    if (this.enabled && this.audioTrack) return true

    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })
      const track = this.stream.getAudioTracks()[0]
      if (!track) {
        this.capability = 'system-audio-denied'
        this.stop()
        return false
      }
      this.audioTrack = track
      this.enabled = true
      this.capability = 'supported'
      track.addEventListener('ended', () => {
        this.enabled = false
        this.audioTrack = null
        this.stream?.getTracks().forEach((t) => t.stop())
        this.stream = null
      })
      return true
    } catch {
      this.capability = 'system-audio-denied'
      this.enabled = false
      this.stop()
      return false
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
