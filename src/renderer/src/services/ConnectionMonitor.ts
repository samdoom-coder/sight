import type { ConnectionMetrics, ConnectionType } from '@shared/types/models'

function candidateTypeFromString(value: string | undefined): string | null {
  if (!value) return null
  if (value.includes('host')) return 'host'
  if (value.includes('srflx')) return 'srflx'
  if (value.includes('relay')) return 'relay'
  return value
}

export class ConnectionMonitor {
  private metrics: ConnectionMetrics = {
    rtt: null,
    packetLoss: null,
    bitrate: null,
    frameRate: null,
    codec: null,
    connectionType: 'unknown',
    localCandidateType: null,
    remoteCandidateType: null,
    videoWidth: null,
    videoHeight: null
  }

  private lastBytes = 0
  private lastTimestamp = 0

  constructor(private readonly onUpdate: (metrics: ConnectionMetrics) => void) {}

  get current(): ConnectionMetrics {
    return { ...this.metrics }
  }

  async update(stats: RTCStatsReport | null): Promise<void> {
    if (!stats) return
    const now = performance.now()
    let outboundRtp: RTCStats | null = null
    let inboundRtp: RTCStats | null = null
    let candidatePair: RTCStats | null = null
    let codec: RTCStats | null = null

    stats.forEach((report) => {
      const r = report as unknown as Record<string, unknown>
      switch (report.type) {
        case 'outbound-rtp':
          if ((r.kind === 'video' || (r.kind as string) === 'video') && !outboundRtp) outboundRtp = report
          break
        case 'inbound-rtp':
          if ((r.kind as string) === 'video' && !inboundRtp) inboundRtp = report
          break
        case 'candidate-pair':
          if ((r.nominated === true || (r.state as string) === 'succeeded') && !candidatePair) candidatePair = report
          break
        case 'codec':
          if (!codec) codec = report
          break
      }
    })

    if (candidatePair) {
      const cp = candidatePair as unknown as {
        currentRoundTripTime?: number
        totalRoundTripTime?: number
        responsesReceived?: number
        localCandidateId?: string
        remoteCandidateId?: string
        state?: string
      }
      if (cp.currentRoundTripTime !== undefined) {
        this.metrics.rtt = Math.round(cp.currentRoundTripTime * 1000)
      } else if (cp.totalRoundTripTime && cp.responsesReceived) {
        this.metrics.rtt = Math.round((cp.totalRoundTripTime / cp.responsesReceived) * 1000)
      }
      this.metrics.packetLoss = null
      const localCandidate = this.findCandidate(stats, cp.localCandidateId)
      const remoteCandidate = this.findCandidate(stats, cp.remoteCandidateId)
      this.metrics.localCandidateType = candidateTypeFromString(localCandidate?.candidateType)
      this.metrics.remoteCandidateType = candidateTypeFromString(remoteCandidate?.candidateType)
      this.metrics.connectionType =
        this.metrics.localCandidateType === 'relay' || this.metrics.remoteCandidateType === 'relay'
          ? 'relay'
          : this.metrics.localCandidateType || this.metrics.remoteCandidateType
            ? 'direct'
            : 'unknown'
    }

    if (outboundRtp) {
      const r = outboundRtp as unknown as {
        bytesSent?: number
        framesPerSecond?: number
        codecId?: string
      }
      const deltaTime = (now - this.lastTimestamp) / 1000
      if (r.bytesSent !== undefined && this.lastBytes !== undefined && deltaTime > 0) {
        const deltaBytes = r.bytesSent - this.lastBytes
        this.metrics.bitrate = Math.round((deltaBytes * 8) / deltaTime)
        if (this.metrics.bitrate < 0) this.metrics.bitrate = null
      }
      this.lastBytes = r.bytesSent ?? 0
      this.lastTimestamp = now
      if (r.framesPerSecond !== undefined) {
        this.metrics.frameRate = Math.round(r.framesPerSecond)
      }
    }

    if (inboundRtp) {
      const r = inboundRtp as unknown as {
        bytesReceived?: number
        packetsLost?: number
        packetsReceived?: number
        codecId?: string
      }
      if (r.packetsLost !== undefined && r.packetsReceived !== undefined) {
        const total = r.packetsLost + r.packetsReceived
        this.metrics.packetLoss = total > 0 ? Math.round((r.packetsLost / total) * 1000) / 10 : 0
      }
    }

    if (codec) {
      const c = codec as unknown as { mimeType?: string }
      if (c.mimeType) {
        const parts = c.mimeType.split('/')
        this.metrics.codec = parts[parts.length - 1] ?? null
      }
    }

    this.onUpdate(this.current)
  }

  private findCandidate(stats: RTCStatsReport, id: string | undefined): { candidateType?: string } | null {
    if (!id) return null
    const report = stats.get(id)
    if (!report) return null
    return { candidateType: (report as unknown as { candidateType?: string }).candidateType }
  }

  reset(): void {
    this.metrics = {
      rtt: null,
      packetLoss: null,
      bitrate: null,
      frameRate: null,
      codec: null,
      connectionType: 'unknown',
      localCandidateType: null,
      remoteCandidateType: null,
      videoWidth: null,
      videoHeight: null
    }
    this.lastBytes = 0
    this.lastTimestamp = 0
  }
}