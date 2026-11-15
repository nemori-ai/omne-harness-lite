import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import { ruleCodec } from '@omne-harness/public-contract'

const limits: JsonLimits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 32,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 32,
}

const tally = ruleCodec({ kind: 'object', fields: { pending: { rule: { kind: 'count' } } } })

const holding = (value: JsonValue): JsonValue => ({
  kind: 'object',
  entries: [{ key: 'pending', value }],
})
const number = (lexeme: string): JsonValue => ({ kind: 'number', lexeme })

describe('the count leaf', () => {
  it.each([
    ['zero', '0', 0],
    ['one', '1', 1],
    ['the largest safe integer', String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])('reads %s from a JSON number and writes it back as a number', (_label, lexeme, value) => {
    const read = tally.read(holding(number(lexeme)), limits)
    expect(read).toEqual({ ok: true, value: { pending: value } })
    expect(tally.write({ pending: value }, limits)).toEqual({
      ok: true,
      value: holding(number(lexeme)),
    })
  })

  it.each([
    ['a negative number', number('-1')],
    ['negative zero', number('-0')],
    ['a fraction', number('0.5')],
    ['an integer written with a fraction', number('1.0')],
    ['an integer written with an exponent', number('1e2')],
    ['a number past the largest safe integer', number(String(Number.MAX_SAFE_INTEGER + 1))],
    ['the text of a number', { kind: 'string', value: '0' }],
    ['null', { kind: 'null' }],
  ] as const)('rejects %s', (_label, value) => {
    expect(tally.read(holding(value as JsonValue), limits)).toEqual({ ok: false })
  })

  it.each([
    ['a negative number', -1],
    ['a fraction', 0.5],
    ['a number past the largest safe integer', Number.MAX_SAFE_INTEGER + 1],
    ['the text of a number', '0'],
  ])('refuses to write %s', (_label, value) => {
    expect(tally.write({ pending: value as number }, limits)).toEqual({ ok: false })
  })
})
