import { BrowserWindow, app, shell, desktopCapturer } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { getRememberedCaptureSourceId } from '../capture'

let mainWindow: BrowserWindow | null = null

function resolvePreloadPath(): string {
  const candidates = [
    // Production bundle: dist/main/index.cjs -> dist/preload/index.cjs
    join(__dirname, '../preload/index.cjs'),
    // Running from repo root via tsx/electron .: dist + src fallbacks
    join(process.cwd(), 'dist/preload/index.cjs'),
    join(process.cwd(), 'src/preload/index.ts')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

function resolveRendererIndex(): string {
  const candidates = [
    // Production bundle: dist/main/index.cjs -> dist/renderer/index.html
    join(__dirname, '../renderer/index.html'),
    join(process.cwd(), 'dist/renderer/index.html'),
    join(process.cwd(), 'src/renderer/index.html')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

export function createMainWindow(): BrowserWindow {
  const preloadPath = resolvePreloadPath()
  const rendererIndex = resolveRendererIndex()
  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  const rendererUrl = pathToFileURL(rendererIndex).href
  const isAppUrl = (url: string): boolean => {
    if (url === 'about:blank') return true
    if (devServerUrl) {
      try {
        return new URL(url).origin === new URL(devServerUrl).origin
      } catch {
        return false
      }
    }
    return url === rendererUrl || url.startsWith(`${rendererUrl}#`)
  }

  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0b10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
    }
  })

  const appSession = mainWindow.webContents.session
  appSession.setPermissionRequestHandler((webContents, _permission, callback) => {
    callback(isAppUrl(webContents.getURL()))
  })
  appSession.setPermissionCheckHandler((webContents, _permission) => {
    if (!webContents) return false
    return isAppUrl(webContents.getURL())
  })

  // Electron requires a handler for getDisplayMedia(). The app uses it only to
  // attach system audio (the main screen stream comes from getUserMedia), so
  // reuse the source the user just selected when possible.
  appSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      const wanted = getRememberedCaptureSourceId()
      const source = sources.find((s) => s.id === wanted) ?? sources[0]
      if (!source) {
        callback({})
        return
      }
      if (process.platform === 'win32') {
        callback({ video: source, audio: 'loopback' })
      } else {
        callback({ video: source })
      }
    } catch {
      callback({})
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized-changed', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized-changed', false))

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(rendererIndex)
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function destroyMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
  }
  mainWindow = null
}

export function registerWindowIpc(): void {
  app.on('before-quit', () => {
    destroyMainWindow()
  })
}