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
// Host + guests. The host UI now manages one peer connection per guest; raise
// this only if you have tested the bandwidth for that many viewers.
export const MAX_PARTICIPANTS = Number(process.env.MAX_PARTICIPANTS ?? 8)

export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 1000)
export const RATE_LIMIT_MAX_MESSAGES = Number(process.env.RATE_LIMIT_MAX_MESSAGES ?? 60)

export const MAX_MESSAGE_BYTES = Number(process.env.MAX_MESSAGE_BYTES ?? 64 * 1024)

export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((o) => o.trim())

// Optional coturn REST credentials. When set, sessions receive short-lived
// TURN credentials instead of relying on static VITE_TURN_* values baked into
// the desktop bundle.
export const TURN_URLS = (process.env.TURN_URLS ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean)
export const TURN_SECRET = process.env.TURN_SECRET ?? ''
export const TURN_TTL_SECONDS = Number(process.env.TURN_TTL_SECONDS ?? 86_400)

export const MAX_SESSIONS_PER_IP = Number(process.env.MAX_SESSIONS_PER_IP ?? 10)

// Set TRUST_PROXY=1 only when the server is behind a reverse proxy you control
// (nginx/Caddy). Otherwise X-Forwarded-For is attacker-controlled.
export const TRUST_PROXY = ['1', 'true', 'yes', 'on'].includes(
  (process.env.TRUST_PROXY ?? '').toLowerCase()
)

export const MAX_CONNECTIONS_PER_IP = Number(process.env.MAX_CONNECTIONS_PER_IP ?? 20)

export const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 30_000)

// How long a session survives a host signaling disconnect so the same host can
// resume it without invalidating the code for everyone.
export const HOST_RECONNECT_GRACE_MS = Number(process.env.HOST_RECONNECT_GRACE_MS ?? 60_000)

export const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000)

export const SERVER_VERSION = process.env.SIGHT_SERVER_VERSION ?? '0.2.0'

if (process.env.NODE_ENV === 'production' && ALLOWED_ORIGINS.includes('*')) {
  console.warn(
    '[sight] WARNING: ALLOWED_ORIGINS=* in production. Set it to your real origins ' +
      '(e.g. ALLOWED_ORIGINS=app://sight) to prevent cross-site WebSocket hijacking.'
  )
}

export const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const SESSION_CODE_GROUPS = 2
export const SESSION_CODE_GROUP_LEN = 3