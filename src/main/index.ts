import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow, registerWindowIpc, getMainWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initAutoUpdates } from './updates'

let quitting = false

app.setName('Sight')

// Playwright launches multiple instances; skip the single-instance lock and
// give each instance its own profile directory in E2E runs.
const e2eUserData = process.env.SIGHT_E2E_USER_DATA
if (e2eUserData) app.setPath('userData', e2eUserData)

const gotTheLock = process.env.SIGHT_E2E === '1' || app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('app.sight.desktop')

    app.on('browser-window-created', (_event, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerIpcHandlers()
    registerWindowIpc()

    createMainWindow()
    initAutoUpdates()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  })

  app.on('before-quit', () => {
    quitting = true
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || quitting) {
      app.quit()
    }
  })
}