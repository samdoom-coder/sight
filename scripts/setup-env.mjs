// Cross-platform env setup: copies .env.example -> .env.development (and .env)
// Run: npm run setup
import { existsSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const src = resolve(root, '.env.example')
const targets = ['.env.development', '.env']

let created = 0
for (const name of targets) {
  const dest = resolve(root, name)
  if (existsSync(dest)) {
    console.log(`keep ${name} (already exists)`)
    continue
  }
  copyFileSync(src, dest)
  console.log(`created ${name} from .env.example`)
  created++
}

console.log(
  created === 0
    ? 'Env files already exist. Edit .env.development (dev) / .env.production (prod) as needed.'
    : 'Done. Defaults work for localhost: signaling ws://localhost:8787/ws, server 0.0.0.0:8787.'
)
