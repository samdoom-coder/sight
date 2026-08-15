import type { CursorPosition } from '@shared/types/models'
import { CURSOR_SAMPLE_INTERVAL_MS, CURSOR_SEND_INTERVAL_MS } from '@shared/constants/app'
import { interpolateCursor, normalizeCoordinates } from '@shared/lib/cursor'

export interface CursorSource {
  getPosition: () => { x: number; y: number; width: number; height: number }
  onMove: (callback: () => void) => () => void
}

export interface CursorRecipient {
  sendCursor: (position: CursorPosition, participantId: string) => void
}

export class CursorService {
  private sending = false
  private sampleTimer: ReturnType<typeof setInterval> | null = null
  private sendTimer: ReturnType<typeof setInterval> | null = null
  private lastSample: CursorPosition | null = null
  private lastSent: CursorPosition | null = null
  private readonly smoothCursors = new Map<string, CursorPosition>()

  constructor(
    private readonly participantId: string,
    private readonly source: CursorSource | null,
    private readonly recipient: CursorRecipient | null
  ) {}

  start(): void {
    if (this.sending) return
    this.sending = true

    this.sampleTimer = setInterval(() => {
      if (!this.source) return
      const pos = this.source.getPosition()
      const normalized = normalizeCoordinates(pos.x, pos.y, pos.width, pos.height)
      this.lastSample = normalized
    }, CURSOR_SAMPLE_INTERVAL_MS)

    this.sendTimer = setInterval(() => {
      if (!this.recipient || !this.lastSample) return
      if (this.lastSent && this.lastSample.timestamp === this.lastSent.timestamp && this.isClose(this.lastSample, this.lastSent)) {
        return
      }
      this.lastSent = { ...this.lastSample }
      this.recipient.sendCursor(this.lastSent, this.participantId)
    }, CURSOR_SEND_INTERVAL_MS)
  }

  private isClose(a: CursorPosition, b: CursorPosition): boolean {
    return Math.abs(a.x - b.x) < 0.0005 && Math.abs(a.y - b.y) < 0.0005
  }

  handleRemoteCursor(participantId: string, position: CursorPosition): CursorPosition {
    const current = this.smoothCursors.get(participantId) ?? null
    const next = interpolateCursor(current, position)
    this.smoothCursors.set(participantId, next)
    return next
  }

  getSmoothedCursor(participantId: string): CursorPosition | null {
    return this.smoothCursors.get(participantId) ?? null
  }

  removeParticipant(participantId: string): void {
    this.smoothCursors.delete(participantId)
  }

  stop(): void {
    this.sending = false
    if (this.sampleTimer) clearInterval(this.sampleTimer)
    if (this.sendTimer) clearInterval(this.sendTimer)
    this.sampleTimer = null
    this.sendTimer = null
  }
}