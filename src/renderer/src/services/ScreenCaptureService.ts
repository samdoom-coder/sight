import type { CaptureSource } from '@shared/types/models'

export type SourceKind = 'screen' | 'window' | 'all'

export class ScreenCaptureService {
  constructor(private readonly platform: string) {}

  async listSources(kind: SourceKind = 'all'): Promise<CaptureSource[]> {
    if (!window.desktop) return []
    return window.desktop.capture.listSources(kind)
  }

  async permissionState(): Promise<{ granted: boolean; restricted: boolean }> {
    if (!window.desktop) return { granted: true, restricted: false }
    return window.desktop.capture.permissionState()
  }

  async captureSource(sourceId: string): Promise<MediaStream> {
    if (!window.desktop) {
      throw new Error('Desktop capture is not available outside the Electron shell.')
    }
    const handle = await window.desktop.capture.getMediaSource(sourceId)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error -- Electron-specific constraint
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: 1,
          maxWidth: 8192,
          minHeight: 1,
          maxHeight: 8192
        }
      }
    })
    return stream
  }

  getPlatform(): string {
    return this.platform
  }
}