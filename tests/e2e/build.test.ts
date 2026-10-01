import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')

function read(p: string): string {
  return readFileSync(resolve(ROOT, p), 'utf8')
}

describe('e2e: production build artifacts', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' })
  }, 120_000)

  it('produces the main process entrypoint', () => {
    expect(existsSync(resolve(ROOT, 'dist/main/index.cjs'))).toBe(true)
    expect(read('dist/main/index.cjs')).toContain('app.sight.desktop')
  })

  it('produces a CommonJS preload bundle (sandbox-safe)', () => {
    expect(existsSync(resolve(ROOT, 'dist/preload/index.cjs'))).toBe(true)
    const preload = read('dist/preload/index.cjs')
    expect(preload).toContain('contextBridge')
    expect(preload).not.toMatch(/^\s*import\s/m)
  })

  it('produces a runnable signaling server bundle', () => {
    const server = read('dist/server/index.js')
    expect(server).toContain('/ws')
    expect(server).toContain('createServer')
  })

  it('produces the renderer html that mounts the app', () => {
    const html = read('dist/renderer/index.html')
    expect(html).toContain('assets/')
    expect(html).toContain('module')
  })

  it('serves the signaling WebSocket from the bundled server', () => {
    const server = read('dist/server/index.js')
    expect(server).toContain('WebSocketServer')
    expect(server).toContain('connection')
  })

  it('bundles auto-updates in main + preload + renderer', () => {
    const main = read('dist/main/index.cjs')
    expect(main).toContain('updates:status')
    expect(main).toContain('quitAndInstall')
    const preload = read('dist/preload/index.cjs')
    expect(preload).toContain('updates:check')
    const html = read('dist/renderer/index.html')
    expect(html).toContain('assets/')
  })
})