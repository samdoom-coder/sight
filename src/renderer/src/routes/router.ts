import { writable } from 'svelte/store'

export type Route =
  | { name: 'home' }
  | { name: 'host-picker' }
  | { name: 'host'; sessionId: string }
  | { name: 'join' }
  | { name: 'joining'; code: string }
  | { name: 'viewer' }
  | { name: 'settings' }
  | { name: 'diagnostics' }

export const route = writable<Route>({ name: 'home' })

export function navigate(next: Route): void {
  route.set(next)
}