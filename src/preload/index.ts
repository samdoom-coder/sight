import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants/ipc'
import type { DesktopApi } from '../shared/types/desktop-api'

const api: DesktopApi = {
  capture: {
    listSources: (kind) => ipcRenderer.invoke(IPC.capture.listSources, kind),
    getMediaSource: (sourceId) => ipcRenderer.invoke(IPC.capture.getMediaSource, sourceId),
    permissionState: () => ipcRenderer.invoke(IPC.capture.permissionState)
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.window.minimize),
    maximize: () => ipcRenderer.send(IPC.window.maximize),
    close: () => ipcRenderer.send(IPC.window.close),
    isMaximized: () => ipcRenderer.invoke(IPC.window.isMaximized)
  },
  system: {
    platform: () => ipcRenderer.invoke(IPC.system.platform),
    openExternal: (url) => ipcRenderer.send(IPC.system.openExternal, url)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    set: (settings) => ipcRenderer.invoke(IPC.settings.set, settings),
    clearSessionData: () => ipcRenderer.invoke(IPC.settings.clearSessionData)
  },
  telemetry: {
    event: (name, data) => ipcRenderer.send(IPC.telemetry.event, name, data)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('desktop', api)