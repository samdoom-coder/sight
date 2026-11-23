import type { ConnectionMetrics } from '@shared/types/models'

function candidateTypeFromString(value: string | undefined): string | null {
  if (!value) return null
  if (value.includes('host')) return 'host'
  if (value.includes('srflx')) return 'srflx'
  if (value.includes('relay')) return 'relay'
  return value
}

function codecName(mimeType: string | undefined): string | null {
  if (!mimeType) return null
  const parts = mimeType.split('/')
  return parts[parts.length - 1] ?? null
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

  private lastOutboundBytes = 0
  private lastOutboundTimestamp = 0
  private lastInboundBytes = 0
  private lastInboundTimestamp = 0

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
    let fallbackCodec: RTCStats | null = null

    stats.forEach((report) => {
      const r = report as unknown as Record<string, unknown>
      switch (report.type) {
        case 'outbound-rtp':
          if (r.kind === 'video' && !outboundRtp) outboundRtp = report
          break
        case 'inbound-rtp':
          if (r.kind === 'video' && !inboundRtp) inboundRtp = report
          break
        case 'candidate-pair':
          if ((r.nominated === true || (r.state as string) === 'succeeded') && !candidatePair) candidatePair = report
          break
        case 'codec': {
          const mime = (r.mimeType as string | undefined) ?? ''
          if (!fallbackCodec && mime.startsWith('video/')) fallbackCodec = report
          break
        }
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

    const outbound = outboundRtp as unknown as {
      bytesSent?: number
      framesPerSecond?: number
      codecId?: string
    } | null
    const inbound = inboundRtp as unknown as {
      bytesReceived?: number
      packetsLost?: number
      packetsReceived?: number
      framesPerSecond?: number
      frameWidth?: number
      frameHeight?: number
      codecId?: string
    } | null

    if (outbound) {
      if (outbound.bytesSent !== undefined) {
        if (this.lastOutboundTimestamp > 0) {
          const deltaTime = (now - this.lastOutboundTimestamp) / 1000
          const deltaBytes = outbound.bytesSent - this.lastOutboundBytes
          if (deltaTime > 0 && deltaBytes >= 0) {
            this.metrics.bitrate = Math.round((deltaBytes * 8) / deltaTime)
          }
        }
        this.lastOutboundBytes = outbound.bytesSent
        this.lastOutboundTimestamp = now
      }
      if (outbound.framesPerSecond !== undefined) {
        this.metrics.frameRate = Math.round(outbound.framesPerSecond)
      }
    }

    if (inbound) {
      if (inbound.bytesReceived !== undefined) {
        if (this.lastInboundTimestamp > 0) {
          const deltaTime = (now - this.lastInboundTimestamp) / 1000
          const deltaBytes = inbound.bytesReceived - this.lastInboundBytes
          if (deltaTime > 0 && deltaBytes >= 0) {
            // On a viewer there is no outbound video, so the inbound bitrate is
            // the number the user actually cares about.
            this.metrics.bitrate = Math.round((deltaBytes * 8) / deltaTime)
          }
        }
        this.lastInboundBytes = inbound.bytesReceived
        this.lastInboundTimestamp = now
      }
      if (outbound?.framesPerSecond === undefined && inbound.framesPerSecond !== undefined) {
        this.metrics.frameRate = Math.round(inbound.framesPerSecond)
      }
      if (inbound.packetsLost !== undefined && inbound.packetsReceived !== undefined) {
        const total = inbound.packetsLost + inbound.packetsReceived
        this.metrics.packetLoss = total > 0 ? Math.round((inbound.packetsLost / total) * 1000) / 10 : 0
      }
      if (inbound.frameWidth && inbound.frameHeight) {
        this.metrics.videoWidth = inbound.frameWidth
        this.metrics.videoHeight = inbound.frameHeight
      }
    }

    const codecId = outbound?.codecId ?? inbound?.codecId
    const codecReport = codecId ? stats.get(codecId) : fallbackCodec
    this.metrics.codec = codecName((codecReport as unknown as { mimeType?: string } | null)?.mimeType)

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
    this.lastOutboundBytes = 0
    this.lastOutboundTimestamp = 0
    this.lastInboundBytes = 0
    this.lastInboundTimestamp = 0
  }
}
