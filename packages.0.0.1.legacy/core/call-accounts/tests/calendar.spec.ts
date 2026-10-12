import { describe, expect, it } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { ExactDecimal, judgeAccountValue, prepareAccountGroup, summarize } from '../src/index.ts'

const usage = {
  input_tokens: 'unknown',
  output_tokens: 'unknown',
  cache_read_tokens: 'unknown',
  cache_write_tokens: 'unknown',
  source: 'none',
}
function correction(at: string, amount = '0.1') {
  return {
    sessionLog: 's1',
    correction: {
      target: { kind: 'model_response', responseId: 'r1' },
      cost_usd: new LosslessNumber(amount),
      obtainedVia: 'manual',
      at,
    },
  }
}
describe('S14/S22 early-year and exact instant regression', () => {
  it.each([
    '0000-02-29T00:00:00Z',
    '0001-01-01T00:00:00Z',
    '0099-12-31T23:59:59Z',
    '0100-01-01T00:00:00Z',
    '0400-02-29T00:00:00Z',
  ])('admits legal Gregorian/RFC3339 instant %s', at => {
    expect(judgeAccountValue('CostCorrection', correction(at).correction)).toEqual({ ok: true })
  })
  it.each(['0001-02-29T00:00:00Z', '0100-02-29T00:00:00Z', '0099-04-31T00:00:00Z'])(
    'rejects invalid Gregorian instant %s',
    at => {
      expect(judgeAccountValue('CostCorrection', correction(at).correction)).toEqual({
        rejected: 'malformed',
      })
    },
  )
  it('compares exact fractions and equal offsets around year zero', () => {
    const prepared = prepareAccountGroup({
      models: [{ responseId: 'r1', cost: { cost_usd: 'unknown', source: 'none' }, usage }],
      tools: [],
      corrections: [
        correction('0000-01-01T00:00:00.000000001Z', '0.1'),
        correction('0000-01-01T08:00:00.000000002+08:00', '0.2'),
      ],
    })
    expect(prepared).toHaveProperty('ok')
    if ('rejected' in prepared) throw new Error(prepared.rejected)
    const result = summarize(prepared.ok)
    if ('failed' in result) throw new Error(result.failed)
    expect(result.knownSum.compare(ExactDecimal.from(new LosslessNumber('0.2')))).toBe(0)
  })
  it('equal offset instants and equal amounts at year zero are unambiguous', () => {
    const prepared = prepareAccountGroup({
      models: [{ responseId: 'r1', cost: { cost_usd: 'unknown', source: 'none' }, usage }],
      tools: [],
      corrections: [
        correction('0000-01-01T00:00:00Z', '0.100'),
        correction('0000-01-01T08:00:00+08:00', '1e-1'),
      ],
    })
    if ('rejected' in prepared) throw new Error(prepared.rejected)
    const result = summarize(prepared.ok)
    if ('failed' in result) throw new Error(result.failed)
    expect(result.knownSum.compare(ExactDecimal.from(new LosslessNumber('0.1')))).toBe(0)
  })
})
