import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTurnCredentials } from '../../server/src/turn/credentials'

describe('TURN REST credentials', () => {
  it('creates one credential per URL with a shared expiry username', () => {
    const now = 1_700_000_000
    const result = createTurnCredentials(
      ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'],
      'super-secret',
      3600,
      now
    )
    expect(result).toHaveLength(2)
    expect(result[0].username).toBe(`${now + 3600}:sight`)
    expect(result[1].username).toBe(result[0].username)
    expect(result[0].credential).toBe(result[1].credential)
    const expected = createHmac('sha1', 'super-secret')
      .update(`${now + 3600}:sight`)
      .digest('base64')
    expect(result[0].credential).toBe(expected)
  })

  it('returns nothing when TURN is not configured', () => {
    expect(createTurnCredentials([], 'secret', 3600)).toEqual([])
    expect(createTurnCredentials(['turn:example.com'], '', 3600)).toEqual([])
  })

  it('clamps the TTL to safe bounds', () => {
    const now = 1000
    const tooShort = createTurnCredentials(['turn:example.com'], 'secret', 1, now)
    expect(tooShort[0].username).toBe(`${now + 60}:sight`)
    const tooLong = createTurnCredentials(['turn:example.com'], 'secret', 999_999, now)
    expect(tooLong[0].username).toBe(`${now + 86_400}:sight`)
  })

  it('changes the credential when the secret changes', () => {
    const a = createTurnCredentials(['turn:example.com'], 'secret-a', 3600, 1000)
    const b = createTurnCredentials(['turn:example.com'], 'secret-b', 3600, 1000)
    expect(a[0].credential).not.toBe(b[0].credential)
  })
})
