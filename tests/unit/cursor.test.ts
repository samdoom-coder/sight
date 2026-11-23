import { describe, it, expect } from 'vitest'
import {
  fitContainRect,
  normalizeCoordinates,
  denormalizeCoordinates,
  interpolateCursor,
  clamp01
} from '../../src/shared/lib/cursor'

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

  it('clamps malformed remote cursor coordinates', () => {
    const next = interpolateCursor(null, { x: 99, y: -4, timestamp: 1 })
    expect(next.x).toBe(1)
    expect(next.y).toBe(0)
    const nan = interpolateCursor(null, { x: Number.NaN, y: 0.7, timestamp: 2 })
    expect(nan.x).toBe(0)
    expect(nan.y).toBeCloseTo(0.7)
  })

  it('fits a wide video into a square box with letterboxing', () => {
    const rect = fitContainRect(1920, 1080, { left: 10, top: 20, width: 100, height: 100 })
    expect(rect).not.toBeNull()
    expect(rect!.left).toBe(10)
    expect(rect!.width).toBe(100)
    expect(rect!.height).toBeCloseTo(56.25)
    expect(rect!.top).toBeCloseTo(20 + (100 - 56.25) / 2)
  })

  it('fits a square video into a wide box with pillarboxing', () => {
    const rect = fitContainRect(1000, 1000, { left: 0, top: 0, width: 200, height: 100 })
    expect(rect).not.toBeNull()
    expect(rect!.top).toBe(0)
    expect(rect!.height).toBe(100)
    expect(rect!.width).toBe(100)
    expect(rect!.left).toBe(50)
  })

  it('rejects empty video or container dimensions', () => {
    expect(fitContainRect(0, 100, { left: 0, top: 0, width: 100, height: 100 })).toBeNull()
    expect(fitContainRect(100, 100, { left: 0, top: 0, width: 0, height: 100 })).toBeNull()
  })
})