import { describe, it, expect } from 'vitest'
import {
  generateSessionCode,
  normalizeSessionCode,
  isValidSessionCode,
  formatSessionCode
} from '../../src/shared/lib/session-code'
import { SESSION_CODE_ALPHABET } from '../../src/shared/constants/app'

describe('session-code', () => {
  it('generates codes matching the XXXX-XXX format', () => {
    const code = generateSessionCode()
    expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/)
  })

  it('only uses unambiguous alphabet characters', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateSessionCode()
      for (const ch of code) {
        if (ch !== '-') {
          expect(SESSION_CODE_ALPHABET).toContain(ch)
        }
      }
    }
  })

  it('produces unique codes', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      seen.add(generateSessionCode())
    }
    expect(seen.size).toBe(200)
  })

  it('normalizes to uppercase, strips separators', () => {
    expect(normalizeSessionCode(' 8k4-x9p ')).toBe('8K4X9P')
    expect(normalizeSessionCode('8k4-x9p')).toBe('8K4X9P')
  })

  it('validates well-formed codes', () => {
    expect(isValidSessionCode('8K4X9P')).toBe(true)
    expect(isValidSessionCode('8K4-X9P')).toBe(true)
    expect(isValidSessionCode('short')).toBe(false)
    expect(isValidSessionCode('AAAAAAAA')).toBe(false)
  })

  it('formats normalized codes back to grouped form', () => {
    expect(formatSessionCode('8K4X9P')).toBe('8K4-X9P')
    expect(formatSessionCode('ABC123')).toBe('ABC-123')
  })
})