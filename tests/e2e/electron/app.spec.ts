import { test, expect } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as unknown as string
const ROOT = process.cwd()
const SIGNALING_PORT = 8787
const SIGNALING_URL = `ws://127.0.0.1:${SIGNALING_PORT}/ws`

interface LaunchedApp {
  app: ElectronApplication
  window: Awaited<ReturnType<ElectronApplication['firstWindow']>>
  userData: string
}

const launched: LaunchedApp[] = []
let server: ChildProcess | null = null

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${SIGNALING_PORT}/health`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('signaling server did not become healthy')
}

async function startSignalingServer(): Promise<void> {
  server = spawn(process.execPath, ['dist/server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(SIGNALING_PORT),
      ALLOWED_ORIGINS: '*'
    },
    stdio: 'pipe'
  })
  server.stdout?.on('data', (d) => process.stdout.write(`[signal] ${d}`))
  server.stderr?.on('data', (d) => process.stderr.write(`[signal] ${d}`))
  await waitForServer()
}

async function launchApp(name: string): Promise<LaunchedApp> {
  const userData = mkdtempSync(join(tmpdir(), `sight-e2e-${name}-`))
  const app = await electron.launch({
    executablePath: electronPath,
    args: [
      '.',
      '--no-sandbox',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream'
    ],
    cwd: ROOT,
    env: {
      ...process.env,
      SIGHT_E2E: '1',
      SIGHT_E2E_USER_DATA: userData,
      VITE_SIGNALING_URL: SIGNALING_URL
    }
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  window.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      console.log(`[${name}:${message.type()}] ${message.text()}`)
    }
  })
  window.on('pageerror', (error) => console.log(`[${name}:pageerror] ${error.message}`))
  const entry = { app, window, userData }
  launched.push(entry)
  return entry
}

test.beforeAll(async () => {
  await startSignalingServer()
})

async function closeLaunchedApps(): Promise<void> {
  for (const entry of launched.splice(0)) {
    await entry.app.close().catch(() => {})
    rmSync(entry.userData, { recursive: true, force: true })
  }
}

test.afterEach(async () => {
  await closeLaunchedApps()
})

test.afterAll(async () => {
  await closeLaunchedApps()
  if (server) {
    server.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      server?.once('exit', () => resolve())
      setTimeout(resolve, 2000)
    })
    server = null
  }
})

test('boots, renders the home page, and opens the capture picker', async () => {
  const { window } = await launchApp('smoke')

  await expect(window).toHaveTitle('Sight')
  await expect(window.getByRole('button', { name: /Create a session/i })).toBeVisible()

  await window.getByRole('button', { name: /Create a session/i }).click()
  await expect(window.getByRole('heading', { name: /Share your screen/i })).toBeVisible()

  // Linux/Xvfb should expose at least one capturable screen.
  await expect(window.getByRole('option').first()).toBeVisible({ timeout: 30_000 })
})

test('host shares a screen, guest joins, video arrives, and guest pointer is relayed', async () => {
  const host = await launchApp('host')

  await host.window.getByRole('button', { name: /Create a session/i }).click()
  await expect(host.window.getByRole('heading', { name: /Share your screen/i })).toBeVisible()

  const firstSource = host.window.getByRole('option').first()
  await expect(firstSource).toBeVisible({ timeout: 30_000 })
  await firstSource.click()
  await host.window.getByRole('button', { name: /Start sharing/i }).click()

  await expect(host.window.getByRole('heading', { name: /Your session is ready/i })).toBeVisible({
    timeout: 60_000
  })
  await expect(host.window.locator('.code')).toContainText(/[A-Z2-9]{3}/, { timeout: 20_000 })
  const code = (await host.window.locator('.code').innerText()).replace(/[^A-Z0-9]/g, '')
  expect(code).toHaveLength(6)

  // Launch the guest only after the host is capturing; this keeps GPU/screen
  // capture contention low on headless Linux.
  const guest = await launchApp('guest')
  await guest.window.getByLabel('Session code').fill(code)
  await guest.window.getByRole('button', { name: /^Join$/ }).click()

  await expect(guest.window.locator('.viewer')).toBeVisible({ timeout: 60_000 })
  await expect
    .poll(
      async () =>
        guest.window.locator('video').evaluate((el) => {
          const video = el as HTMLVideoElement
          return video.videoWidth
        }),
      { timeout: 60_000, message: 'guest never received host video' }
    )
    .toBeGreaterThan(0)

  await expect(host.window.getByText(/1 guest connected/i)).toBeVisible({ timeout: 20_000 })

  // Open the host viewer and verify a guest pointer appears over the preview.
  await host.window.getByRole('button', { name: /Open viewer/i }).click()
  await expect(host.window.locator('.viewer')).toBeVisible({ timeout: 20_000 })

  const videoBox = await guest.window.locator('video').boundingBox()
  expect(videoBox).not.toBeNull()
  if (videoBox) {
    await guest.window.mouse.move(videoBox.x + videoBox.width / 2, videoBox.y + videoBox.height / 2)
  }
  await expect(host.window.locator('.remote-cursor')).toBeVisible({ timeout: 20_000 })
})
