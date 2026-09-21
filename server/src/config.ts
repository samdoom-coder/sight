import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Minimal .env loader so `npm run server` picks up `.env.development` / `.env`
// without requiring a new dependency. Explicit process env always wins.
function loadDotEnvFiles(): void {
  const candidates = ['.env.development', '.env']
  if (process.env.NODE_ENV === 'production') candidates.unshift('.env.production')
  for (const file of candidates) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) continue
    try {
      const content = readFileSync(path, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq < 0) continue
        const key = trimmed.slice(0, eq).trim()
        const value = trimmed.slice(eq + 1).trim()
        if (key && process.env[key] === undefined) process.env[key] = value
      }
    } catch {
      // ignore unreadable env files and fall back to defaults
    }
  }
}

loadDotEnvFiles()

export const PORT = Number(process.env.PORT ?? 8787)
export const HOST = process.env.HOST ?? '0.0.0.0'

export const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS ?? 30 * 60 * 1000)
export const MAX_PARTICIPANTS = Number(process.env.MAX_PARTICIPANTS ?? 8)

export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 1000)
export const RATE_LIMIT_MAX_MESSAGES = Number(process.env.RATE_LIMIT_MAX_MESSAGES ?? 60)

export const MAX_MESSAGE_BYTES = Number(process.env.MAX_MESSAGE_BYTES ?? 64 * 1024)

export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((o) => o.trim())

export const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const SESSION_CODE_GROUPS = 2
export const SESSION_CODE_GROUP_LEN = 3