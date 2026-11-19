import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
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

describe('the bytes leaf', () => {
  it.each([
    ['no bytes', new Uint8Array([]), ''],
    ['one byte', new Uint8Array([0x41]), 'QQ=='],
    ['two bytes', new Uint8Array([0x41, 0x42]), 'QUI='],
    ['three bytes', new Uint8Array([0x41, 0x42, 0x43]), 'QUJD'],
    ['every byte value', Uint8Array.from({ length: 256 }, (_, index) => index), undefined],
  ])('writes %s as base64 text and reads the same bytes back', (_label, value, wire) => {
    const written = part.write({ bytes: value }, limits)
    if (!written.ok) throw new Error('write')
    if (wire !== undefined) expect(written.value).toEqual(holding(text(wire)))
    expect(part.read(written.value, limits)).toEqual({ ok: true, value: { bytes: value } })
  })

  it('carries more bytes than one call of the character conversion takes', () => {
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
    ['a number', { kind: 'number', lexeme: '1' }],
    ['null', { kind: 'null' }],
  ] as const)('rejects %s', (_label, value) => {
    expect(part.read(holding(value as JsonValue), limits)).toEqual({ ok: false })
  })

  it.each([
    ['text', 'QQ=='],
    ['an array of numbers', [65]],
    ['an array buffer', new ArrayBuffer(1)],
  ])('does not write %s as bytes', (_label, value) => {
    expect(part.write({ bytes: value as never }, limits)).toEqual({ ok: false })
  })
})
