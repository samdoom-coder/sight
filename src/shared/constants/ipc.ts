export const IPC = {
  capture: {
    listSources: 'capture:list-sources',
    getMediaSource: 'capture:get-media-source',
    permissionState: 'capture:permission-state'
  },
  window: {
    minimize: 'window:minimize',
    maximize: 'window:maximize',
    close: 'window:close',
    isMaximized: 'window:is-maximized'
  },
  system: {
    platform: 'system:platform',
    openExternal: 'system:open-external'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
    clearSessionData: 'settings:clear-session-data'
  },
  telemetry: {
    event: 'telemetry:event'
  }
} as const
