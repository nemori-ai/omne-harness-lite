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
const day = ruleCodec({ kind: 'object', fields: { date: { rule: { kind: 'plain-date' } } } })
const holding = (value: JsonValue): JsonValue => ({
  kind: 'object',
  entries: [{ key: 'date', value }],
})
const text = (value: string): JsonValue => ({ kind: 'string', value })

describe('the plain-date leaf', () => {
  it.each(['2026-10-10', '2028-02-29', '0001-01-01', '9999-12-31'])(
    'reads and writes %s unchanged',
    value => {
      expect(day.read(holding(text(value)), limits)).toEqual({ ok: true, value: { date: value } })
      expect(day.write({ date: value }, limits)).toEqual({ ok: true, value: holding(text(value)) })
    },
  )

  it.each([
    ['a day the month does not have', '2026-02-30'],
    ['February 29 of a common year', '2026-02-29'],
    ['month zero', '2026-00-10'],
    ['a time of day', '2026-10-10T00:00:00Z'],
    ['an unpadded month', '2026-1-10'],
    ['an instant', '2026-10-10T08:00:00+08:00'],
    ['empty text', ''],
    ['text before the date', 'x2026-10-10'],
    ['month thirteen', '2026-13-01'],
    ['day zero', '2026-10-00'],
    ['the thirty-first of a thirty-day month', '2026-09-31'],
  ])('rejects %s', (_label, value) => {
    expect(day.read(holding(text(value)), limits)).toEqual({ ok: false })
    expect(day.write({ date: value }, limits)).toEqual({ ok: false })
  })

  it('rejects a number', () => {
    expect(day.read(holding({ kind: 'number', lexeme: '20261010' }), limits)).toEqual({
      ok: false,
    })
  })
})
