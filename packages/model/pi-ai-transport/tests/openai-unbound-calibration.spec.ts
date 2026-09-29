import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getEncoding } from 'js-tiktoken'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { strictObject } from '../src/json.ts'
import { openaiDefinitions } from '../src/official-models/openai.ts'
import packet from './fixtures/openai-delivery/unbound-gpt6-cases.json' with { type: 'json' }

const models = [
  'openai/gpt-6-astra',
  'openai/gpt-6-astra-pro',
  'openai/gpt-6-sol-pro',
  'openai/gpt-6-luna-pro',
]
const encoder = getEncoding('o200k_base')

describe('four original research routes: independent frozen calibration inputs', () => {
  it.each(models)('%s owns two fits and an untouched tool/reminder holdout', model => {
    const cases = packet.cases.filter(value => value.modelId === model)
    expect(cases.map(value => value.set)).toEqual(['fit', 'fit', 'holdout'])
    expect(cases.map(value => value.requestSha256)).toHaveLength(3)
    const definition = openaiDefinitions.find(value => value.modelId === model)
    if (definition === undefined) throw new Error('missing exact definition')
    expect(definition.revision).toBe('2')
    // Frozen research inputs do not become measured observations when a meter is supplied.
    if (model === 'openai/gpt-6-astra')
      expect(createOpenAiInputMeter(definition).algorithmRevision).toContain(
        'astra-final-visible-json',
      )
    else expect(() => createOpenAiInputMeter(definition)).toThrow('unsupported OpenAI')
  })

  it.each(packet.cases)(
    '$id freezes the complete proposed input, separately from any actual usage',
    c => {
      expect(packet.status).toBe('unbound-research-hypothesis')
      expect(createHash('sha256').update(c.wire).digest('hex')).toBe(c.requestSha256)
      const body = strictObject(c.wire)
      if (body === undefined || !Array.isArray(body.messages))
        throw new Error('invalid raw fixture')
      expect(writeJsonLossless(body)).toBe(c.wire)
      expect(body).toMatchObject({
        model: c.modelId,
        provider: { order: ['openai'], allow_fallbacks: false, require_parameters: true },
        stream: true,
        store: false,
        reasoning: { effort: 'low' },
        max_tokens: 64,
      })
      const visible = {
        messages: body.messages,
        ...(body.tools === undefined ? {} : { tools: body.tools }),
      }
      expect(encoder.encode(writeJsonLossless(visible)).length).toBe(c.proposedTokens)
      expect(body.messages.length).toBe(
        c.id.endsWith('plain-history') ? 5 : c.set === 'fit' ? 6 : 7,
      )
      if (c.set === 'holdout') {
        expect(body.tools).toHaveLength(2)
        expect(c.wire).toContain('保留完整工具历史。不要再调用工具。')
        expect(c.wire).toContain('"role":"tool"')
        expect(c.wire).toContain('"tool_call_id"')
      }
      expect(c).not.toHaveProperty('actualTokens')
    },
  )
})
