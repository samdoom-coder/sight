import { desktopCapturer } from 'electron'
import type { CaptureSource } from '../../shared/types/models'
import { getScreenCapturePermissionState } from '../permissions'

export type SourceKindFilter = 'screen' | 'window' | 'all'

let lastSelectedSourceId: string | null = null

export function rememberCaptureSource(sourceId: string): void {
  lastSelectedSourceId = sourceId
}

export function getRememberedCaptureSourceId(): string | null {
  return lastSelectedSourceId
}

export async function listSources(kind: SourceKindFilter): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: kind === 'all' ? ['screen', 'window'] : [kind],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true
  })

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnailDataUrl: source.thumbnail && source.thumbnail.getSize().width > 0 ? source.thumbnail.toDataURL() : null,
    appIconDataUrl: source.appIcon && source.appIcon.getSize().width > 0 ? source.appIcon.toDataURL() : null,
    display_id: (source as { display_id?: string }).display_id ?? ''
  }))
}

export async function getCapturePermissionState() {
  return getScreenCapturePermissionState()
}