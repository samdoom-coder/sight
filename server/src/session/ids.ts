import { randomBytes } from 'node:crypto'
import { SESSION_CODE_ALPHABET, SESSION_CODE_GROUP_LEN, SESSION_CODE_GROUPS } from '../config'

function randomInt(max: number): number {
  const buf = randomBytes(4)
  return buf.readUInt32BE(0) % max
}

export function generateSessionCode(): string {
  const groups: string[] = []
  for (let g = 0; g < SESSION_CODE_GROUPS; g++) {
    let group = ''
    for (let i = 0; i < SESSION_CODE_GROUP_LEN; i++) {
      group += SESSION_CODE_ALPHABET[randomInt(SESSION_CODE_ALPHABET.length)]
    }
    groups.push(group)
  }
  return groups.join('-')
}

export function generateSessionId(): string {
  return `s_${randomBytes(16).toString('hex')}`
}

export function generatePeerId(): string {
  return `p_${randomBytes(12).toString('hex')}`
}