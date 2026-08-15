import { RATE_LIMIT_MAX_MESSAGES, RATE_LIMIT_WINDOW_MS } from '../config'

export class RateLimiter {
  private readonly counts = new Map<string, { count: number; windowStart: number }>()

  constructor(
    private readonly maxMessages = RATE_LIMIT_MAX_MESSAGES,
    private readonly windowMs = RATE_LIMIT_WINDOW_MS
  ) {}

  allow(key: string): boolean {
    const now = Date.now()
    const entry = this.counts.get(key)
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.counts.set(key, { count: 1, windowStart: now })
      return true
    }
    if (entry.count >= this.maxMessages) {
      return false
    }
    entry.count += 1
    return true
  }

  reset(key: string): void {
    this.counts.delete(key)
  }
}