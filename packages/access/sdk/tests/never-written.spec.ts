import { describe, expect, it } from 'vitest'
import { neverWritten } from '../src/never-written.ts'

const failed = (cause: unknown): Error => new TypeError('fetch failed', { cause })
const coded = (code: unknown): object => ({ code })

describe('neverWritten', () => {
  it('is true for each code before the first byte, alone or in a list', () => {
    for (const code of [
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'EADDRNOTAVAIL',
      'UND_ERR_CONNECT_TIMEOUT',
    ]) {
      expect(neverWritten(failed(coded(code)))).toBe(true)
      expect(neverWritten(failed({ errors: [coded(code), coded('ECONNREFUSED')] }))).toBe(true)
    }
  })

  it('is true when fetch refuses the port before it connects', async () => {
    expect(neverWritten(failed(new Error('bad port')))).toBe(true)
    const refused = await fetch('http://127.0.0.1:6667/', { method: 'POST' }).catch(
      (error: unknown) => error,
    )
    expect(neverWritten(refused)).toBe(true)
  })

  it('is false for another refusal of fetch, and for a bad port that is not an Error', () => {
    expect(neverWritten(failed(new Error('bad url')))).toBe(false)
    expect(neverWritten(failed({ message: 'bad port' }))).toBe(false)
  })

  it('is false for any other code, a mixed list, no code, or no cause', () => {
    expect(neverWritten(failed(coded('ECONNRESET')))).toBe(false)
    expect(neverWritten(failed({ errors: [coded('ECONNREFUSED'), coded('EPIPE')] }))).toBe(false)
    expect(neverWritten(failed({ errors: 'ECONNREFUSED' }))).toBe(false)
    expect(neverWritten(failed(coded(7)))).toBe(false)
    expect(neverWritten(failed(null))).toBe(false)
    expect(neverWritten(failed('ECONNREFUSED'))).toBe(false)
    expect(neverWritten(failed({}))).toBe(false)
    expect(neverWritten(new TypeError('fetch failed'))).toBe(false)
    expect(neverWritten({ cause: coded('ECONNREFUSED') })).toBe(false)
  })
})
