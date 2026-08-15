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