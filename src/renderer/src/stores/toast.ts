import { writable } from 'svelte/store'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

export const toastStore = writable<ToastItem[]>([])

let nextId = 1

export function showToast(message: string, kind: ToastKind = 'info', timeout = 3500): void {
  const id = nextId++
  toastStore.update((list) => [...list, { id, message, kind }])
  setTimeout(() => {
    toastStore.update((list) => list.filter((t) => t.id !== id))
  }, timeout)
}