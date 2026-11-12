// Which `fetch` failures prove that no request byte left (#1249 C13): only a cause, or a list of
// causes, whose codes are all connection errors before the first byte.
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
