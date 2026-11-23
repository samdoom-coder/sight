const { join } = require('node:path')
const { notarize } = require('@electron/notarize')

/**
 * electron-builder afterSign hook. Signing itself is handled by
 * electron-builder when CSC_LINK/CSC_KEY_PASSWORD are present. Notarization is
 * optional and only runs when all Apple credentials are configured.
 */
exports.default = async function notarizeApp(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID
  if (!appleId || !appleIdPassword || !teamId) {
    console.log('[notarize] skipped: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  console.log(`[notarize] submitting ${appPath}`)
  await notarize({
    appBundleId: 'app.sight.desktop',
    appPath,
    appleId,
    appleIdPassword,
    teamId
  })
  console.log('[notarize] complete')
}
