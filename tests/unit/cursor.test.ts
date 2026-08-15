import { describe, it, expect } from 'vitest'
import { normalizeCoordinates, denormalizeCoordinates, interpolateCursor, clamp01 } from '../../src/shared/lib/cursor'

describe('cursor normalization', () => {
  it('normalizes absolute pixel coordinates to 0..1', () => {
    const pos = normalizeCoordinates(960, 540, 1920, 1080)
    expect(pos.x).toBeCloseTo(0.5)
    expect(pos.y).toBeCloseTo(0.5)
  })

  it('clamps out-of-range coordinates', () => {
    const pos = normalizeCoordinates(5000, -100, 1920, 1080)
    expect(pos.x).toBe(1)
    expect(pos.y).toBe(0)
  })

  it('handles zero-size displays gracefully', () => {
    const pos = normalizeCoordinates(10, 10, 0, 0)
    expect(pos.x).toBe(0)
    expect(pos.y).toBe(0)
  })

  it('round-trips through denormalization', () => {
    const normalized = normalizeCoordinates(960, 540, 1920, 1080)
    const abs = denormalizeCoordinates(normalized, 1920, 1080)
    expect(abs.x).toBe(960)
    expect(abs.y).toBe(540)
  })

  it('clamps values to the 0..1 unit interval', () => {
    expect(clamp01(-0.5)).toBe(0)
    expect(clamp01(1.5)).toBe(1)
    expect(clamp01(0.42)).toBe(0.42)
  })

  it('interpolates smoothly toward the target', () => {
    const start = { x: 0, y: 0, timestamp: 1 }
    const target = { x: 1, y: 1, timestamp: 2 }
    const next = interpolateCursor(start, target)
    expect(next.x).toBeGreaterThan(0)
    expect(next.x).toBeLessThan(1)
    expect(next.y).toBeGreaterThan(0)
    expect(next.y).toBeLessThan(1)
  })

  it('returns target directly when no current position exists', () => {
    const target = { x: 0.5, y: 0.5, timestamp: 5 }
    const next = interpolateCursor(null, target)
    expect(next).toEqual(target)
  })
})