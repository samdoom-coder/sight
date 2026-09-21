export const DEFAULT_SIGNALING_URL = 'ws://localhost:8787/ws'

export function normalizeSignalingUrl(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim() || DEFAULT_SIGNALING_URL
  let url = trimmed
  if (url.startsWith('http://')) url = `ws://${url.slice('http://'.length)}`
  else if (url.startsWith('https://')) url = `wss://${url.slice('https://'.length)}`
  else if (!url.startsWith('ws://') && !url.startsWith('wss://')) url = `ws://${url}`
  url = url.replace(/\/+$/, '')
  if (!url.endsWith('/ws')) url = `${url}/ws`
  return url
}
