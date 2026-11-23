import {
  ipcMain,
  BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import { IPC } from '../../shared/constants/ipc'
import { listSources, getCapturePermissionState, rememberCaptureSource, type SourceKindFilter } from '../capture'
import { getPlatform, openExternal, getDisplayBounds } from '../system'
import { getSettings, setSettings, clearSessionData } from '../system/settings'
import { getMainWindow } from '../window'
import { getScreenCapturePermissionState } from '../permissions'
import { checkForUpdates, currentVersion, downloadUpdate, installUpdate } from '../updates'

function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url || event.sender.getURL()
  if (process.env.VITE_DEV_SERVER_URL) {
    try {
      return new URL(url).origin === new URL(process.env.VITE_DEV_SERVER_URL).origin
    } catch {
      return false
    }
  }
  return url.startsWith('file://') && url.includes('/dist/renderer/')
}

function assertTrusted(event: IpcMainEvent | IpcMainInvokeEvent): void {
  if (!isTrustedSender(event)) {
    throw new Error('Untrusted IPC sender')
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.capture.listSources, async (event, kind: SourceKindFilter = 'all') => {
    assertTrusted(event)
    const safeKind: SourceKindFilter =
      kind === 'screen' || kind === 'window' || kind === 'all' ? kind : 'all'
    return listSources(safeKind)
  })

  ipcMain.handle(IPC.capture.permissionState, async (event) => {
    assertTrusted(event)
    return getScreenCapturePermissionState()
  })

  ipcMain.handle(IPC.capture.getMediaSource, async (event, sourceId: string) => {
    assertTrusted(event)
    const sources = await listSources('all')
    const exists = sources.some((s) => s.id === sourceId)
    if (!exists) {
      throw new Error('The selected capture source is no longer available. Please pick a source again.')
    }
    rememberCaptureSource(sourceId)
    return sourceId
  })

  ipcMain.on(IPC.window.minimize, (event) => {
    if (!isTrustedSender(event)) return
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on(IPC.window.maximize, (event) => {
    if (!isTrustedSender(event)) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on(IPC.window.close, (event) => {
    if (!isTrustedSender(event)) return
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle(IPC.window.isMaximized, (event) => {
    assertTrusted(event)
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  ipcMain.handle(IPC.system.platform, (event) => {
    assertTrusted(event)
    return getPlatform()
  })
  ipcMain.on(IPC.system.openExternal, (event, url: string) => {
    if (!isTrustedSender(event)) return
    openExternal(url)
  })
  ipcMain.handle(IPC.system.displayBounds, (event, displayId: string) => {
    assertTrusted(event)
    return getDisplayBounds(displayId)
  })

  ipcMain.handle(IPC.settings.get, (event) => {
    assertTrusted(event)
    return getSettings()
  })
  ipcMain.handle(IPC.settings.set, (event, settings) => {
    assertTrusted(event)
    return setSettings(settings)
  })
  ipcMain.handle(IPC.settings.clearSessionData, (event) => {
    assertTrusted(event)
    clearSessionData()
    getMainWindow()?.reload()
  })

  ipcMain.on(IPC.telemetry.event, (event, _name: string, _data?: Record<string, unknown>) => {
    if (!isTrustedSender(event)) return
    // Telemetry is opt-in; when enabled events are queued. No data leaves the machine in this build.
  })

  ipcMain.handle(IPC.updates.check, (event) => {
    assertTrusted(event)
    return checkForUpdates()
  })
  ipcMain.handle(IPC.updates.download, (event) => {
    assertTrusted(event)
    return downloadUpdate()
  })
  ipcMain.handle(IPC.updates.version, (event) => {
    assertTrusted(event)
    return currentVersion()
  })
  ipcMain.on(IPC.updates.install, (event) => {
    if (!isTrustedSender(event)) return
    installUpdate()
  })
}
