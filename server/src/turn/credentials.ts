import { createHmac } from 'node:crypto'

export interface TurnCredential {
  urls: string
  username: string
  credential: string
}

/**
 * coturn REST credentials:
 *   username = "<expiry-unix-seconds>:sight"
 *   password = base64(HMAC-SHA1(auth-secret, username))
 *
 * The client receives these with the session and uses them for ICE gathering.
 */
export function createTurnCredentials(
  urls: string[],
  secret: string,
  ttlSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): TurnCredential[] {
  const cleanUrls = urls.map((url) => url.trim()).filter(Boolean)
  if (cleanUrls.length === 0 || !secret) return []
  const rawTtl = Number.isFinite(ttlSeconds) ? Math.floor(ttlSeconds) : 86_400
  const ttl = Math.min(Math.max(rawTtl, 60), 86_400)
  const username = `${nowSeconds + ttl}:sight`
  const credential = createHmac('sha1', secret).update(username).digest('base64')
  return cleanUrls.map((url) => ({ urls: url, username, credential }))
}
