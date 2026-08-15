export type Theme = 'dark' | 'light' | 'system'

export interface AppSettings {
  general: {
    launchAtStartup: boolean
    theme: Theme
    language: string
    notifications: boolean
  }
  session: {
    defaultScreen: string | null
    defaultAudio: boolean
    cursorBehavior: 'show' | 'hide' | 'only-hover'
    timeoutSeconds: number
  }
  network: {
    iceServers: Array<{ urls: string; username?: string; credential?: string }>
  }
  privacy: {
    telemetry: boolean
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    launchAtStartup: false,
    theme: 'dark',
    language: 'en',
    notifications: true
  },
  session: {
    defaultScreen: null,
    defaultAudio: false,
    cursorBehavior: 'show',
    timeoutSeconds: 1800
  },
  network: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  },
  privacy: {
    telemetry: false
  }
}
