import { describe, expect, it } from 'vitest'
import { writeJsonLossless, type JsonValue } from '@omne-harness-lite/content-blocks'
import {
  anthropicOriginalMeter,
  anthropicReplayModels,
  classifyAnthropicReasoning,
} from '../src/input-meters/anthropic-replay.ts'
import originalBases from './fixtures/anthropic/original-meter-bases.json' with { type: 'json' }

const signed = {
  type: 'reasoning.text',
  format: 'anthropic-claude-v1',
  text: '',
  signature: 'opaque-signature',
  index: 0,
}
const encrypted = {
  type: 'reasoning.encrypted',
  format: 'anthropic-claude-v1',
  data: 'opaque-data',
  index: 1,
}

describe('Anthropic complete-output policy facts', () => {
  it.each(anthropicReplayModels)('$modelId pins the original factory basis', row => {
    const meter = originalBases.rows.find(value => value.modelId === row.modelId)
    if (!meter) throw new Error('missing executed original Anthropic factory row')
    expect(meter).toMatchObject({
      definitionRevision: anthropicOriginalMeter.definitionRevision,
      implementation: {
        name: 'pi-ai:anthropic',
        revision: anthropicOriginalMeter.implementationRevision,
      },
      algorithmRevision: anthropicOriginalMeter.algorithmRevision,
      tokenizerRevision: anthropicOriginalMeter.tokenizerRevision,
      replayRevision: anthropicOriginalMeter.replayRevision,
      transformRevision: anthropicOriginalMeter.transformRevision,
    })
  })

  it('shares the algorithm domain while identifying only the two stronger prefix obligations', () => {
    expect(
      anthropicReplayModels.filter(row => row.requiresSignedPrefix).map(row => row.modelId),
    ).toEqual(['anthropic/claude-opus-5.5', 'anthropic/claude-fable-5.1'])
    expect(anthropicReplayModels).toHaveLength(4)
  })

  it('routes signed, encrypted and mixed complete details to the same group contribution', () => {
    for (const details of [[signed], [encrypted], [signed, encrypted]])
      expect(classifyAnthropicReasoning(details)).toBe('wholeGroup')
    expect(classifyAnthropicReasoning(undefined)).toBe('visible')
  })

  it('preserves unknown JSON metadata without interpreting opaque lengths', () => {
    const details = [
      { ...signed, extra: { original: true }, signature: 'x'.repeat(10000) },
      encrypted,
    ]
    const before = writeJsonLossless(details)
    expect(classifyAnthropicReasoning(details)).toBe('wholeGroup')
    expect(writeJsonLossless(details)).toBe(before)
  })

  it.each<JsonValue>([
    [],
    null,
    [{ ...signed, signature: '' }],
    [{ ...signed, signature: null }],
    [{ ...signed, text: null }],
    [{ type: 'reasoning.text', text: 'unsigned', format: 'anthropic-claude-v1' }],
    [{ ...encrypted, data: '' }],
    [{ ...encrypted, format: 'openai-responses-v1' }],
    [{ ...signed, type: 'reasoning.summary' }],
    [{ ...signed, index: -1 }],
    [{ ...signed, id: 3 }],
  ])('does not classify unexplained details as visible: %j', details => {
    expect(classifyAnthropicReasoning(details)).toBe('unavailable')
  })
})
