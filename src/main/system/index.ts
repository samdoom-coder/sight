import { shell, app } from 'electron'

export function getPlatform(): string {
  return process.platform
}

export function openExternal(url: string): void {
  if (url.startsWith('https://') || url.startsWith('http://')) {
    shell.openExternal(url)
  }
}

export function getAppPath(): string {
  return app.getAppPath()
}