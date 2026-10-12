import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  prepareAccountGroup,
  summarize,
  summarizeUsage,
  type ModelUsageInput,
  type Usage,
} from '../src/index.ts'

const unknownUsage: Usage = {
  input_tokens: 'unknown',
  output_tokens: 'unknown',
  cache_read_tokens: 'unknown',
  cache_write_tokens: 'unknown',
  source: 'none',
}
const knownUsage: Usage = {
  input_tokens: new LosslessNumber('9007199254740993'),
  output_tokens: 1,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  source: 'upstream',
}
function summary(models: readonly ModelUsageInput[]) {
  const result = summarizeUsage(models)
  if ('rejected' in result) throw new Error(result.rejected)
  if ('failed' in result) throw new Error(result.failed)
  return result
}

describe('restricted model-only Usage summary', () => {
  it('empty input returns four zero sums and no unknowns', () => {
    for (const field of Object.values(summary([]))) {
      expect(field.knownSum.toString()).toBe('0')
      expect(field.unknownCount).toBe(0)
    }
  })
  it('sums integer values beyond binary precision and counts unknowns separately', () => {
    const input = [
      { responseId: 'r1', usage: knownUsage },
      { responseId: 'r2', usage: { ...knownUsage, input_tokens: 1 } },
      { responseId: 'r3', usage: unknownUsage },
    ]
    const before = writeJsonLossless(input)
    const result = summary(input)
    expect(result.input_tokens.knownSum.toString()).toBe('9007199254740994')
    expect(result.output_tokens.knownSum.toString()).toBe('2')
    expect(result.cache_read_tokens.knownSum.toString()).toBe('0')
    expect(result.cache_write_tokens.knownSum.toString()).toBe('0')
    for (const field of Object.values(result)) expect(field.unknownCount).toBe(1)
    expect(writeJsonLossless(input)).toBe(before)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.values(result).every(Object.isFrozen)).toBe(true)
  })
  it('fails repeated response identity instead of choosing or deduplicating its usage', () => {
    const input = [
      { responseId: 'r1', usage: knownUsage },
      { responseId: 'r1', usage: unknownUsage },
    ]
    expect(summarizeUsage(input)).toEqual({ failed: 'duplicate_account' })
    expect(summarizeUsage(input.toReversed())).toEqual({ failed: 'duplicate_account' })
  })
  it('admits all values before applying the duplicate check or producing any sum', () => {
    const input = [
      { responseId: 'r1', usage: knownUsage },
      { responseId: 'r1', usage: { ...knownUsage, input_tokens: -1 } },
    ]
    expect(summarizeUsage(input)).toEqual({ rejected: 'negative_amount' })
    expect(summarizeUsage(input.toReversed())).toEqual({ rejected: 'negative_amount' })
  })
  it('validates usage source and response identity independently', () => {
    expect(
      summarizeUsage([{ responseId: 'r1', usage: { ...knownUsage, source: 'none' } }]),
    ).toEqual({ rejected: 'unknown_with_source' })
    expect(summarizeUsage([{ responseId: '', usage: knownUsage }])).toEqual({
      rejected: 'malformed',
    })
  })
  it('rejects additional monetary fields instead of ignoring them', () => {
    const input = [
      { responseId: 'r1', usage: knownUsage, cost: { cost_usd: 1, source: 'upstream_usage' } },
    ]
    expect(summarizeUsage(input)).toEqual({ rejected: 'malformed' })
  })
  it('rejects a monetary group instead of accepting its private projection', () => {
    const group = prepareAccountGroup({ models: [], tools: [], corrections: [] })
    if ('rejected' in group) throw new Error(group.rejected)
    // @ts-expect-error A complete monetary group is not a model-only usage input.
    expect(summarizeUsage(group.ok)).toEqual({ rejected: 'malformed' })
  })
  it('does not execute getters while validating external input', () => {
    let calls = 0
    const input = [
      {
        responseId: 'r1',
        get usage() {
          calls++
          return knownUsage
        },
      },
    ]
    expect(summarizeUsage(input)).toEqual({ rejected: 'malformed' })
    expect(calls).toBe(0)
  })
  it('keeps the model-only result independent of a monetary correction tie', () => {
    const models = [{ responseId: 'r1', usage: knownUsage }]
    const corrections = [1, 2].map(cost_usd => ({
      sessionLog: 's1',
      correction: {
        target: { kind: 'model_response', responseId: 'r1' },
        cost_usd,
        obtainedVia: 'manual',
        at: '2026-01-01T00:00:00Z',
      },
    }))
    const group = prepareAccountGroup({
      models: models.map(model => ({ ...model, cost: { cost_usd: 1, source: 'upstream_usage' } })),
      tools: [],
      corrections,
    })
    if ('rejected' in group) throw new Error(group.rejected)
    expect(summarize(group.ok)).toEqual({ failed: 'correction_tie' })
    expect(summary(models).input_tokens.knownSum.toString()).toBe('9007199254740993')
  })
})
