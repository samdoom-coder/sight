import type { DesktopApi } from '../../shared/types/desktop-api'

declare global {
  interface Window {
    desktop?: DesktopApi
    __sightPendingStream?: MediaStream
  }
}

export {}