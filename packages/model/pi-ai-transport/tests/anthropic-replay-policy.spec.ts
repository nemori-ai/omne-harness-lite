import { describe, expect, it } from 'vitest'
import { writeJsonLossless, type JsonValue } from '@omne-harness-lite/content-blocks'
import {
  anthropicOriginalMeter,
  anthropicReplayModels,
  classifyAnthropicReasoning,
  anthropicOutputHistoryPolicy,
  ANTHROPIC_HISTORY_ALGORITHM,
  ANTHROPIC_REPLAY_REVISION,
  ANTHROPIC_TOKENIZER_REVISION,
} from '../src/input-meters/anthropic-replay.ts'
import { defineInputMeter } from '../src/input-meter.ts'
import { INPUT_PROJECTION_REVISION } from '../src/projection.ts'
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

  it.each(anthropicReplayModels)(
    '$modelId limits original basis applicability to exact records',
    row => {
      const meter = defineInputMeter({
        modelId: row.modelId,
        definitionRevision: '4',
        implementation: { name: 'pi-ai:anthropic', revision: 'mp4-18' },
        provider: 'anthropic',
        algorithmRevision: ANTHROPIC_HISTORY_ALGORITHM,
        tokenizerRevision: ANTHROPIC_TOKENIZER_REVISION,
        replayRevision: ANTHROPIC_REPLAY_REVISION,
        transformRevision: 'openrouter-wire/2',
        evidence: 'policy fixture, not a tokenizer',
        measureFull: () => ({ kind: 'unavailable' }),
      })
      const record = originalBases.rows.find(value => value.modelId === row.modelId)
      if (!record) throw Error('missing original factory record')
      const binding = {
        definition: { modelId: row.modelId, revision: record.definitionRevision },
        implementation: record.implementation,
        configuration: {
          revision: '1',
          values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
        },
      }
      const basis = {
        binding,
        model: row.modelId,
        provider: 'anthropic',
        meterRevision: record.algorithmRevision,
        tokenizerRevision: record.tokenizerRevision,
        replayRevision: record.replayRevision,
        transformRevision: record.transformRevision,
        projectionRevision: record.projectionRevision,
      }
      const applies = anthropicOutputHistoryPolicy.originalBasisApplies(meter)
      const base = { kind: 'known' as const, base: 'openrouter-wire/2', preparation: null }
      expect(applies(basis, base)).toBe(true)
      for (const changed of [
        { ...basis, model: 'anthropic/unknown' },
        { ...basis, provider: 'other' },
        { ...basis, meterRevision: 'unknown' },
        { ...basis, replayRevision: 'unknown' },
        { ...basis, projectionRevision: 'unknown' },
        {
          ...basis,
          binding: { ...binding, definition: { ...binding.definition, revision: '999' } },
        },
      ])
        expect(applies(changed, base)).toBe(false)
      expect(
        anthropicOutputHistoryPolicy.projectionRevisionApplies(record.projectionRevision),
      ).toBe(true)
      expect(
        anthropicOutputHistoryPolicy.projectionRevisionApplies(INPUT_PROJECTION_REVISION),
      ).toBe(true)
      expect(anthropicOutputHistoryPolicy.projectionRevisionApplies('unknown')).toBe(false)
    },
  )

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
    expect(classifyAnthropicReasoning(details)).toBe('uninterpretable')
  })
})
