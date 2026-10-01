import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { getMainWindow } from '../window'

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

let started = false

function send(status: UpdateStatus): void {
  getMainWindow()?.webContents.send('updates:status', status)
}

export function initAutoUpdates(): void {
  if (started) return
  started = true

  log.transports.file.level = 'info'
  autoUpdater.logger = log
  // Don't auto-download: let the user confirm in Settings → Updates.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Dev / unpacked runs have no update metadata — skip silently.
  if (!app.isPackaged) {
    log.info('[updates] skipped (not packaged)')
    return
  }

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', (info) => send({ state: 'not-available', version: info.version }))
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => send({ state: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) => {
    log.error('[updates] error', err)
    send({ state: 'error', message: err?.message ?? String(err) })
  })

  // Defer first check until the window is up; failures are reported via 'error'.
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err: unknown) => {
      log.error('[updates] check failed', err)
    })
  }, 15_000)
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    send({ state: 'error', message: 'Updates are only available in packaged builds.' })
    return
  }
  await autoUpdater.checkForUpdates()
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) return
  await autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  // Restarts the app and installs the downloaded update.
  autoUpdater.quitAndInstall(false, true)
}

export function currentVersion(): string {
  return app.getVersion()
}
