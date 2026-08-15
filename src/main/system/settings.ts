import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/types/settings'

let cached: AppSettings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  if (cached) return cached
  try {
    const raw = readFileSync(settingsPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    cached = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      general: { ...DEFAULT_SETTINGS.general, ...parsed.general },
      session: { ...DEFAULT_SETTINGS.session, ...parsed.session },
      network: {
        ...DEFAULT_SETTINGS.network,
        ...parsed.network,
        iceServers: parsed.network?.iceServers?.length ? parsed.network.iceServers : DEFAULT_SETTINGS.network.iceServers
      },
      privacy: { ...DEFAULT_SETTINGS.privacy, ...parsed.privacy }
    }
  } catch {
    cached = structuredClone(DEFAULT_SETTINGS)
  }
  return cached!
}

export function setSettings(settings: AppSettings): AppSettings {
  cached = settings
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  return cached
}

export function clearSessionData(): void {
  cached = structuredClone(DEFAULT_SETTINGS)
  try {
    rmSync(settingsPath(), { force: true })
  } catch {
    // ignore
  }
}