import {
  SESSION_CODE_ALPHABET,
  SESSION_CODE_GROUPS,
  SESSION_CODE_GROUP_LEN
} from '../constants/app'

function secureRandomInt(max: number): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % max
}

export function generateSessionCode(): string {
  const groups: string[] = []
  for (let g = 0; g < SESSION_CODE_GROUPS; g++) {
    let group = ''
    for (let i = 0; i < SESSION_CODE_GROUP_LEN; i++) {
      group += SESSION_CODE_ALPHABET[secureRandomInt(SESSION_CODE_ALPHABET.length)]
    }
    groups.push(group)
  }
  return groups.join('-')
}

export function normalizeSessionCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function isValidSessionCode(input: string): boolean {
  const normalized = normalizeSessionCode(input)
  const expectedLength = SESSION_CODE_GROUPS * SESSION_CODE_GROUP_LEN
  return normalized.length === expectedLength
}

export function formatSessionCode(normalized: string): string {
  const cleaned = normalized.replace(/[^A-Z0-9]/g, '')
  const groups: string[] = []
  for (let i = 0; i < SESSION_CODE_GROUPS; i++) {
    groups.push(cleaned.slice(i * SESSION_CODE_GROUP_LEN, (i + 1) * SESSION_CODE_GROUP_LEN))
  }
  return groups.join('-')
}
