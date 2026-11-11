import { describe, expect, it } from 'vitest'
import { decodeCarrier, encodeCarrier } from '../src/index.ts'

const traceId = '4bf92f3577b34da6a3ce929d0e0e4736'
const spanId = '00f067aa0ba902b7'

describe('encodeCarrier and decodeCarrier', () => {
  it('encode a sampled and an unsampled carrier in the traceparent subset', () => {
    expect(encodeCarrier({ traceId, spanId, sampled: true })).toBe(`00-${traceId}-${spanId}-01`)
    expect(encodeCarrier({ traceId, spanId, sampled: false })).toBe(`00-${traceId}-${spanId}-00`)
  })

  it.each([true, false])('round-trip the identities and the sampled flag (sampled %s)', sampled => {
    const carrier = encodeCarrier({ traceId, spanId, sampled })

    expect(decodeCarrier(carrier)).toEqual({ kind: 'ok', traceId, spanId, sampled, carrier })
  })

  it('reads the sampled flag from the low bit of other flag values', () => {
    expect(decodeCarrier(`00-${traceId}-${spanId}-03`)).toMatchObject({ kind: 'ok', sampled: true })
    expect(decodeCarrier(`00-${traceId}-${spanId}-02`)).toMatchObject({
      kind: 'ok',
      sampled: false,
    })
  })

  it.each([
    ['an all-zero trace', `00-${'0'.repeat(32)}-${spanId}-01`],
    ['an all-zero span', `00-${traceId}-${'0'.repeat(16)}-01`],
    ['a short trace', `00-${traceId.slice(1)}-${spanId}-01`],
    ['a long span', `00-${traceId}-${spanId}0-01`],
    ['one flag digit', `00-${traceId}-${spanId}-1`],
    ['uppercase hexadecimal', `00-${traceId.toUpperCase()}-${spanId}-01`],
    ['an uppercase flag', `00-${traceId}-${spanId}-0A`],
    ['an extra segment', `00-${traceId}-${spanId}-01-extra`],
    ['another version', `01-${traceId}-${spanId}-01`],
    ['the invalid version ff', `ff-${traceId}-${spanId}-01`],
    ['surrounding whitespace', ` 00-${traceId}-${spanId}-01`],
    ['a trailing newline', `00-${traceId}-${spanId}-01\n`],
    ['an empty text', ''],
  ])('decodeCarrier rejects %s', (_, text) => {
    expect(decodeCarrier(text)).toEqual({ kind: 'invalid' })
  })

  it.each([
    ['null', null],
    ['a number', 1],
    ['an object', { traceId, spanId }],
  ])('decodeCarrier rejects %s without throwing', (_, value) => {
    expect(decodeCarrier(value as never)).toEqual({ kind: 'invalid' })
  })

  it.each([
    ['an all-zero trace', { traceId: '0'.repeat(32), spanId, sampled: true }],
    ['an uppercase span', { traceId, spanId: spanId.toUpperCase(), sampled: true }],
    ['a short trace', { traceId: traceId.slice(2), spanId, sampled: true }],
    ['a sampled flag that is not a boolean', { traceId, spanId, sampled: 1 }],
  ])('encodeCarrier throws TypeError for %s', (_, input) => {
    expect(() => encodeCarrier(input as never)).toThrow(TypeError)
  })
})
