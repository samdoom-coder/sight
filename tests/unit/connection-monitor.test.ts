import { describe, expect, it } from 'vitest'
import { ConnectionMonitor } from '../../src/renderer/src/services/ConnectionMonitor'

interface FakeReport {
  id: string
  type: string
  [key: string]: unknown
}

function makeStats(reports: FakeReport[]): RTCStatsReport {
  const map = new Map(reports.map((r) => [r.id, r]))
  return {
    forEach: (cb: (report: FakeReport) => void) => map.forEach(cb),
    get: (id: string) => map.get(id)
  } as unknown as RTCStatsReport
}

describe('ConnectionMonitor', () => {
  it('derives viewer metrics from inbound RTP and the codec id', async () => {
    const monitor = new ConnectionMonitor(() => {})
    const stats = makeStats([
      {
        id: 'pair',
        type: 'candidate-pair',
        nominated: true,
        currentRoundTripTime: 0.042,
        localCandidateId: 'local',
        remoteCandidateId: 'remote'
      },
      { id: 'local', type: 'local-candidate', candidateType: 'srflx' },
      { id: 'remote', type: 'remote-candidate', candidateType: 'host' },
      {
        id: 'in',
        type: 'inbound-rtp',
        kind: 'video',
        bytesReceived: 10_000,
        framesPerSecond: 30,
        frameWidth: 1920,
        frameHeight: 1080,
        packetsLost: 1,
        packetsReceived: 99,
        codecId: 'codec-video'
      },
      { id: 'codec-audio', type: 'codec', mimeType: 'audio/opus' },
      { id: 'codec-video', type: 'codec', mimeType: 'video/VP8' }
    ])

    await monitor.update(stats)
    const m = monitor.current
    expect(m.rtt).toBe(42)
    expect(m.frameRate).toBe(30)
    expect(m.packetLoss).toBe(1)
    expect(m.codec).toBe('VP8')
    expect(m.videoWidth).toBe(1920)
    expect(m.videoHeight).toBe(1080)
    expect(m.connectionType).toBe('direct')
    expect(m.localCandidateType).toBe('srflx')
  })

  it('falls back to a video codec report when RTP has no codec id', async () => {
    const monitor = new ConnectionMonitor(() => {})
    const stats = makeStats([
      {
        id: 'in',
        type: 'inbound-rtp',
        kind: 'video',
        bytesReceived: 1,
        packetsLost: 0,
        packetsReceived: 1
      },
      { id: 'codec-audio', type: 'codec', mimeType: 'audio/opus' },
      { id: 'codec-video', type: 'codec', mimeType: 'video/H264' }
    ])

    await monitor.update(stats)
    expect(monitor.current.codec).toBe('H264')
  })

  it('uses relay when either candidate is relayed', async () => {
    const monitor = new ConnectionMonitor(() => {})
    const stats = makeStats([
      {
        id: 'pair',
        type: 'candidate-pair',
        state: 'succeeded',
        localCandidateId: 'local',
        remoteCandidateId: 'remote'
      },
      { id: 'local', type: 'local-candidate', candidateType: 'relay' },
      { id: 'remote', type: 'remote-candidate', candidateType: 'srflx' }
    ])

    await monitor.update(stats)
    expect(monitor.current.connectionType).toBe('relay')
  })
})
