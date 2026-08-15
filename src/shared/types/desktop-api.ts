import type { CaptureSource } from './models'
import type { AppSettings } from './settings'

export interface DesktopApi {
  capture: {
    listSources: (kind: 'screen' | 'window' | 'all') => Promise<CaptureSource[]>
    getMediaSource: (sourceId: string) => Promise<string>
    permissionState: () => Promise<{ granted: boolean; restricted: boolean }>
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
  }
  system: {
    platform: () => Promise<string>
    openExternal: (url: string) => void
  }
  settings: {
    get: () => Promise<AppSettings>
    set: (settings: AppSettings) => Promise<AppSettings>
    clearSessionData: () => Promise<void>
  }
  telemetry: {
    event: (name: string, data?: Record<string, unknown>) => void
  }
  platform: string
}
