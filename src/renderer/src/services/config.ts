import { writable, derived } from 'svelte/store'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types/settings'
import { DEFAULT_SIGNALING_URL, normalizeSignalingUrl } from '@shared/lib/signaling-url'

export { DEFAULT_SIGNALING_URL, normalizeSignalingUrl }

export interface RuntimeConfig {
  signalingUrl: string
  iceServers: RTCIceServer[]
  appVersion: string
  platform: string
}

function readEnv(): Partial<RuntimeConfig> {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string> }).env ?? {}
  const v = (key: string): string | undefined => viteEnv[`VITE_${key}`] ?? viteEnv[key]
  const signalingUrl = normalizeSignalingUrl(v('SIGNALING_URL') || DEFAULT_SIGNALING_URL)
  const iceServers: RTCIceServer[] = []
  const stun = v('STUN_URL')
  if (stun) iceServers.push({ urls: stun })
  const turn = v('TURN_URL')
  if (turn) {
    const server: RTCIceServer = { urls: turn }
    const username = v('TURN_USERNAME')
    const credential = v('TURN_PASSWORD')
    if (username) server.username = username
    if (credential) server.credential = credential
    iceServers.push(server)
  }
  return { signalingUrl, iceServers }
}

function buildConfig(settings: AppSettings): RuntimeConfig {
  const env = readEnv()
  const configuredIce: RTCIceServer[] = settings.network.iceServers.length
    ? settings.network.iceServers.map((s) => ({
        urls: s.urls,
        ...(s.username ? { username: s.username } : {}),
        ...(s.credential ? { credential: s.credential } : {})
      }))
    : env.iceServers ?? []
  const iceServers: RTCIceServer[] =
    configuredIce.length > 0 ? configuredIce : [{ urls: 'stun:stun.l.google.com:19302' }]
  return {
    signalingUrl: normalizeSignalingUrl(env.signalingUrl || DEFAULT_SIGNALING_URL),
    iceServers,
    appVersion: '0.1.0',
    platform: window.desktop?.platform ?? 'unknown'
  }
}

export const settings = writable<AppSettings>(structuredClone(DEFAULT_SETTINGS))
export const config = derived(settings, ($settings) => buildConfig($settings))

export async function loadSettings(): Promise<AppSettings> {
  const loaded = window.desktop ? await window.desktop.settings.get() : null
  settings.set(loaded ?? structuredClone(DEFAULT_SETTINGS))
  return loaded ?? structuredClone(DEFAULT_SETTINGS)
}

export async function saveSettings(next: AppSettings): Promise<void> {
  settings.set(next)
  if (window.desktop) await window.desktop.settings.set(next)
}