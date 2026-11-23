import type { CursorPosition } from '../types/models'

export interface NormalizeOptions {
  clamp?: boolean
  round?: number
}

export function normalizeCoordinates(x: number, y: number, width: number, height: number): CursorPosition {
  if (width <= 0 || height <= 0) {
    return { x: 0, y: 0, timestamp: 0 }
  }
  return {
    x: Math.min(1, Math.max(0, x / width)),
    y: Math.min(1, Math.max(0, y / height)),
    timestamp: 0
  }
}

export function denormalizeCoordinates(cursor: CursorPosition, width: number, height: number): { x: number; y: number } {
  return {
    x: Math.round(cursor.x * width),
    y: Math.round(cursor.y * height)
  }
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export interface InterpolatedCursor {
  x: number
  y: number
}

const SMOOTHING_FACTOR = 0.35

export function interpolateCursor(current: CursorPosition | null, target: CursorPosition): CursorPosition {
  const tx = Number.isFinite(target.x) ? clamp01(target.x) : 0
  const ty = Number.isFinite(target.y) ? clamp01(target.y) : 0
  if (!current) {
    return { ...target, x: tx, y: ty }
  }
  const alpha = SMOOTHING_FACTOR
  return {
    x: current.x + (tx - current.x) * alpha,
    y: current.y + (ty - current.y) * alpha,
    timestamp: target.timestamp
  }
}
