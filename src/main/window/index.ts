import { BrowserWindow, app, shell } from 'electron'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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