import { shell, app, screen } from 'electron'
import type { DisplayBounds } from '../../shared/types/desktop-api'

export function getPlatform(): string {
  return process.platform
}

export function openExternal(url: string): void {
  if (typeof url !== 'string') return
  if (url.startsWith('https://') || url.startsWith('http://')) {
    shell.openExternal(url)
  }
}

export function getDisplayBounds(displayId: string): DisplayBounds | null {
  const display = screen.getAllDisplays().find((d) => String(d.id) === displayId)
  if (!display) return null
  return {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    scaleFactor: display.scaleFactor
  }
}

export function getAppPath(): string {
  return app.getAppPath()
}