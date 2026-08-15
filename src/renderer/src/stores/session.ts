import { writable } from 'svelte/store'
import type { SessionService } from '../services/SessionService'
import type { ConnectionPhase } from '@shared/types/models'

export interface ActiveSessionState {
  service: SessionService | null
  phase: ConnectionPhase
  role: 'host' | 'guest' | null
}

export const sessionStore = writable<ActiveSessionState>({
  service: null,
  phase: 'idle',
  role: null
})

export function setActiveSession(service: SessionService | null, role: 'host' | 'guest' | null): void {
  sessionStore.set({ service, phase: service ? 'idle' : 'idle', role })
}

export function clearActiveSession(): void {
  const current = getCurrent()
  current?.service?.endSession()
  sessionStore.set({ service: null, phase: 'idle', role: null })
}

function getCurrent(): ActiveSessionState | null {
  let value: ActiveSessionState | null = null
  sessionStore.subscribe((s) => {
    value = s
  })()
  return value
}

export function getSessionService(): SessionService | null {
  return getCurrent()?.service ?? null
}