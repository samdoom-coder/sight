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

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Compute the letterboxed content rect for `object-fit: contain` inside a box.
 * Used to map pointer coordinates to the actual video frame, not the empty
 * letterbox area.
 */
export function fitContainRect(
  contentWidth: number,
  contentHeight: number,
  box: Rect
): Rect | null {
  if (contentWidth <= 0 || contentHeight <= 0 || box.width <= 0 || box.height <= 0) return null
  const contentAspect = contentWidth / contentHeight
  const boxAspect = box.width / box.height
  let width: number
  let height: number
  let offsetX: number
  let offsetY: number
  if (contentAspect > boxAspect) {
    width = box.width
    height = box.width / contentAspect
    offsetX = 0
    offsetY = (box.height - height) / 2
  } else {
    height = box.height
    width = box.height * contentAspect
    offsetX = (box.width - width) / 2
    offsetY = 0
  }
  return {
    left: box.left + offsetX,
    top: box.top + offsetY,
    width,
    height
  }
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
