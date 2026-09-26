import { describe, expect, it } from 'vitest'
import { LosslessNumber, readJsonStrict } from '@omne-harness-lite/content-blocks'
import { OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS } from '@omne-harness-lite/identity-values'
import { judgeAccountValue, prepareAccountGroup, validate } from '../src/index.ts'

describe('S27 ordered rejection boundaries', () => {
  const unknown = {
    input_tokens: 'unknown',
    output_tokens: 'unknown',
    cache_read_tokens: 'unknown',
    cache_write_tokens: 'unknown',
    source: 'none',
  }
  it('correction target faults precede missing members, types and negative amounts', () => {
    expect(
      judgeAccountValue('CostCorrection', {
        target: { kind: 'tool_execution', responseId: 'r' },
        cost_usd: -1,
      }),
    ).toEqual({ rejected: 'correction_without_target' })
  })
  it('structure precedes negative sign and source inconsistency', () => {
    expect(judgeAccountValue('Usage', { ...unknown, input_tokens: -1, extra: true })).toEqual({
      rejected: 'malformed',
    })
    expect(
      judgeAccountValue('Usage', { ...unknown, input_tokens: new LosslessNumber('-0.5') }),
    ).toEqual({ rejected: 'malformed' })
  })
  it('negative sign precedes source inconsistency and combination errors', () => {
    expect(judgeAccountValue('Usage', { ...unknown, input_tokens: -1 })).toEqual({
      rejected: 'negative_amount',
    })
    expect(
      judgeAccountValue('CostItem', {
        service: 'web_search',
        cost_usd: -1,
        source: 'model_response',
      }),
    ).toEqual({ rejected: 'negative_amount' })
  })
  it('source inconsistency precedes combination errors', () => {
    expect(
      judgeAccountValue('CostItem', {
        service: 'web_search',
        cost_usd: 'unknown',
        source: 'model_response',
      }),
    ).toEqual({ rejected: 'unknown_with_source' })
  })
  it('does not accept inherited properties, accessors, undefined, NaN, cycles or instances', () => {
    const cycle: Record<string, unknown> = { cost_usd: 0, source: 'upstream_usage' }
    cycle.self = cycle
    const inherited = Object.create({ source: 'upstream_usage' })
    inherited.cost_usd = 0
    for (const value of [
      inherited,
      { cost_usd: NaN, source: 'upstream_usage' },
      { cost_usd: undefined, source: 'none' },
      cycle,
      new Date(0),
    ])
      expect(judgeAccountValue('Cost', value)).toEqual({ rejected: 'malformed' })
  })
  it('Cost shape admits effective Cost but group original admission rejects it', () => {
    const cost = { cost_usd: 1, source: 'later_correction' }
    expect(judgeAccountValue('Cost', cost)).toEqual({ ok: true })
    expect(
      prepareAccountGroup({
        models: [{ responseId: 'r1', cost, usage: unknown }],
        tools: [],
        corrections: [],
      }),
    ).toEqual({ rejected: 'malformed' })
  })
  it('uses exact reasoning/output subset comparison above floating precision', () => {
    const value = {
      ...unknown,
      output_tokens: new LosslessNumber('9007199254740993'),
      reasoning_tokens: new LosslessNumber('9007199254740994'),
      source: 'upstream',
    }
    expect(validate('Usage', value)).toEqual({ valid: true })
    expect(judgeAccountValue('Usage', value)).toEqual({ rejected: 'malformed' })
  })
  it('rejects a negative supplementary upstream amount before source consistency', () =>
    expect(
      judgeAccountValue('Cost', {
        cost_usd: 'unknown',
        source: 'none',
        upstream_inference_cost_usd: new LosslessNumber('-0.000000000000001'),
      }),
    ).toEqual({ rejected: 'negative_amount' }))
  it('keeps unknown distinct from null, missing, wrong-case and numeric strings', () => {
    for (const value of [null, undefined, 'UNKNOWN', 'Unknown', '0', '', false])
      expect(judgeAccountValue('Cost', { cost_usd: value, source: 'none' })).toEqual({
        rejected: 'malformed',
      })
  })
})
describe('S37 identifiers, all frozen S31 whitespace codepoints', () => {
  for (const name of ['ResponseId', 'RunId', 'ModelCallId'] as const) {
    it.each(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS)(`${name} boundary whitespace U+%s`, point => {
      const whitespace = String.fromCodePoint(point)
      expect(judgeAccountValue(name, `${whitespace}id`)).toEqual({ rejected: 'malformed' })
      expect(judgeAccountValue(name, `id${whitespace}`)).toEqual({ rejected: 'malformed' })
      expect(judgeAccountValue(name, `i${whitespace}d`)).toEqual({ ok: true })
    })
    it(`${name} has no prefix or Unicode normalization rule`, () => {
      for (const value of ['é', 'e\u0301', 'x/y', '1', '🙂'])
        expect(judgeAccountValue(name, value)).toEqual({ ok: true })
    })
  }
  it.each(['1', '9007199254740993', '1e400'])('positive exact attempt ordinal %s', source =>
    expect(judgeAccountValue('AttemptId', new LosslessNumber(source))).toEqual({ ok: true }),
  )
  it('rejects zero, fractions and missing ordinal without inventing one', () => {
    expect(judgeAccountValue('AttemptId', 0)).toEqual({ rejected: 'malformed' })
    expect(judgeAccountValue('AttemptId', 1.5)).toEqual({ rejected: 'malformed' })
    expect(judgeAccountValue('AttemptId', undefined)).toEqual({ rejected: 'malformed' })
  })
})
