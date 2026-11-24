import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import { afterEach, describe, expect, it } from 'vitest'
import { ruleCodec } from '@omne-harness/public-contract'

const limits: JsonLimits = {
  maxBytes: 200_000,
  maxDepth: 8,
  maxItems: 32,
  maxMembers: 16,
  maxStringLength: 150_000,
  maxNumberLength: 32,
}

const part = ruleCodec({ kind: 'object', fields: { bytes: { rule: { kind: 'bytes' } } } })

const holding = (value: JsonValue): JsonValue => ({
  kind: 'object',
  entries: [{ key: 'bytes', value }],
})
const text = (value: string): JsonValue => ({ kind: 'string', value })

type Native = { fromBase64?: unknown }
type NativeProto = { toBase64?: unknown }
const native = {
  from: (Uint8Array as unknown as Native).fromBase64,
  to: (Uint8Array.prototype as unknown as NativeProto).toBase64,
}

/** The leaf is run twice: with the platform's own base64 where it has one, and without it. */
describe.each([['with the base64 of the platform'], ['without it']])('the bytes leaf, %s', mode => {
  if (mode === 'without it') {
    ;(Uint8Array as unknown as Native).fromBase64 = undefined
    ;(Uint8Array.prototype as unknown as NativeProto).toBase64 = undefined
  }
  afterEach(() => {
    ;(Uint8Array as unknown as Native).fromBase64 = native.from
    ;(Uint8Array.prototype as unknown as NativeProto).toBase64 = native.to
  })
  const off = (): void => {
    if (mode !== 'without it') return
    ;(Uint8Array as unknown as Native).fromBase64 = undefined
    ;(Uint8Array.prototype as unknown as NativeProto).toBase64 = undefined
  }
  it.each([
    ['no bytes', new Uint8Array([]), ''],
    ['one byte', new Uint8Array([0x41]), 'QQ=='],
    ['two bytes', new Uint8Array([0x41, 0x42]), 'QUI='],
    ['three bytes', new Uint8Array([0x41, 0x42, 0x43]), 'QUJD'],
    ['every byte value', Uint8Array.from({ length: 256 }, (_, index) => index), undefined],
  ])('writes %s as base64 text and reads the same bytes back', (_label, value, wire) => {
    off()
    const written = part.write({ bytes: value }, limits)
    if (!written.ok) throw new Error('write')
    if (wire !== undefined) expect(written.value).toEqual(holding(text(wire)))
    expect(part.read(written.value, limits)).toEqual({ ok: true, value: { bytes: value } })
  })

  it('carries more bytes than one call of the character conversion takes', () => {
    off()
    const value = Uint8Array.from({ length: 100_000 }, (_, index) => index % 251)
    const written = part.write({ bytes: value }, limits)
    if (!written.ok) throw new Error('write')
    expect(part.read(written.value, limits)).toEqual({ ok: true, value: { bytes: value } })
  })

  it.each([
    ['text that is not base64', text('not base64!')],
    ['base64 without its padding', text('QQ')],
    ['a second spelling of the same byte', text('QR==')],
    ['URL-safe base64', text('-_8=')],
    ['base64 with a space inside', text('QU JD')],
    ['base64 with a line break', text('QUJD\n')],
    ['padding in the middle', text('QQ==QUJD')],
    ['too much padding', text('Q===')],
    ['bits left over in the last character of two bytes', text('QUJ=')],
    ['a number', { kind: 'number', lexeme: '1' }],
    ['null', { kind: 'null' }],
  ] as const)('rejects %s', (_label, value) => {
    off()
    expect(part.read(holding(value as JsonValue), limits)).toEqual({ ok: false })
  })

  it.each([
    ['text', 'QQ=='],
    ['an array of numbers', [65]],
    ['an array buffer', new ArrayBuffer(1)],
  ])('does not write %s as bytes', (_label, value) => {
    expect(part.write({ bytes: value as never }, limits)).toEqual({ ok: false })
  })

  it('carries a megabyte there and back fast enough to carry files (the middle of five runs)', () => {
    off()
    const big = { ...limits, maxBytes: 4_000_000, maxStringLength: 2_000_000 }
    const value = Uint8Array.from({ length: 1_000_000 }, (_, index) => index % 251)
    const runs = Array.from({ length: 5 }, () => {
      const started = performance.now()
      const written = part.write({ bytes: value }, big)
      if (!written.ok) throw new Error('write')
      const read = part.read(written.value, big)
      const took = performance.now() - started
      if (!read.ok) throw new Error('read')
      expect((read.value as { bytes: Uint8Array }).bytes.byteLength).toBe(1_000_000)
      return took
    }).sort((left, right) => left - right)
    expect(runs[2]).toBeLessThan(mode === 'without it' ? 40 : 15)
  })
})
