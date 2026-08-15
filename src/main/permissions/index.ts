import { systemPreferences } from 'electron'

export interface PermissionState {
  granted: boolean
  restricted: boolean
}

export function getScreenCapturePermissionState(): PermissionState {
  if (process.platform === 'darwin') {
    try {
      const status = systemPreferences.getMediaAccessStatus('screen' as 'camera')
      return {
        granted: status === 'granted',
        restricted: status === 'restricted' || status === 'denied'
      }
    } catch {
      return { granted: false, restricted: false }
    }
  }
  if (process.platform === 'win32' || process.platform === 'linux') {
    return { granted: true, restricted: false }
  }
  return { granted: false, restricted: false }
}

export async function requestScreenCapturePermission(): Promise<PermissionState> {
  if (process.platform !== 'darwin') {
    return { granted: true, restricted: false }
  }
  try {
    const status = await systemPreferences.askForMediaAccess('screen' as 'camera')
    return { granted: status, restricted: !status }
  } catch {
    return getScreenCapturePermissionState()
  }
}

export function getPermissionHelpText(platform: NodeJS.Platform): string | null {
  if (platform === 'darwin') {
    return (
      'Screen recording permission is required.\n\n' +
      'Open System Settings → Privacy & Security → Screen Recording\n' +
      'and allow Sight. You may need to restart the app after enabling it.'
    )
  }
  if (platform === 'win32') {
    return 'On Windows, Sight uses the built-in screen capture API. No additional permission is required.'
  }
  if (platform === 'linux') {
    return 'On Linux, screen capture works under Wayland via the portal and on X11 via the desktop environment. ' +
      'You may need to grant the desktop portal permission.'
  }
  return null
}