import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/constants/ipc'
import { listSources, getCapturePermissionState, type SourceKindFilter } from '../capture'
import { getPlatform, openExternal } from '../system'
import { getSettings, setSettings, clearSessionData } from '../system/settings'
import { getMainWindow } from '../window'
import { getScreenCapturePermissionState } from '../permissions'
import { checkForUpdates, currentVersion, downloadUpdate, installUpdate } from '../updates'

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.capture.listSources, async (_event, kind: SourceKindFilter = 'all') => {
    return listSources(kind)
  })

  ipcMain.handle(IPC.capture.permissionState, async () => {
    return getScreenCapturePermissionState()
  })

  ipcMain.handle(IPC.capture.getMediaSource, async (_event, sourceId: string) => {
    const sources = await listSources('all')
    const exists = sources.some((s) => s.id === sourceId)
    if (!exists) {
      throw new Error('The selected capture source is no longer available. Please pick a source again.')
    }
    return sourceId
  })

  ipcMain.on(IPC.window.minimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on(IPC.window.maximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on(IPC.window.close, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle(IPC.window.isMaximized, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  ipcMain.handle(IPC.system.platform, () => getPlatform())
  ipcMain.on(IPC.system.openExternal, (_event, url: string) => openExternal(url))

  ipcMain.handle(IPC.settings.get, () => getSettings())
  ipcMain.handle(IPC.settings.set, (_event, settings) => setSettings(settings))
  ipcMain.handle(IPC.settings.clearSessionData, () => {
    clearSessionData()
    getMainWindow()?.reload()
  })

  ipcMain.on(IPC.telemetry.event, (_event, _name: string, _data?: Record<string, unknown>) => {
    // Telemetry is opt-in; when enabled events are queued. No data leaves the machine in this build.
  })

  ipcMain.handle(IPC.updates.check, () => checkForUpdates())
  ipcMain.handle(IPC.updates.download, () => downloadUpdate())
  ipcMain.handle(IPC.updates.version, () => currentVersion())
  ipcMain.on(IPC.updates.install, () => installUpdate())
}