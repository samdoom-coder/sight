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
    // Headless CI runners cannot initialise the X11 desktop capturer reliably.
    // Playwright launches with Chromium's fake media device, so use that for the
    // E2E pipeline while real builds keep the native screen capture path.
    if (await window.desktop.system.isE2E()) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: 1280, height: 720, frameRate: 30 }
      })
      console.debug('[capture] e2e fake stream tracks', stream.getTracks().map((t) => t.kind))
      return stream
    }
    console.debug('[capture] requesting source', sourceId)
    const handle = await window.desktop.capture.getMediaSource(sourceId)
    console.debug('[capture] source accepted', handle)
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
    console.debug(
      '[capture] stream tracks',
      stream.getTracks().map((t) => `${t.kind}:${t.readyState}`)
    )
    return stream
  }

  getPlatform(): string {
    return this.platform
  }
}