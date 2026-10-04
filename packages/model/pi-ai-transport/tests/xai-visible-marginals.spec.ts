import { describe, expect, it } from 'vitest'
import {
  jsonNumberSource,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { createXaiInputMeter, createXaiVisibleBodyCounter } from '../src/input-meters/xai.ts'
import { createXaiHistoryCandidateInputMeter } from '../src/input-meters/xai-candidate.ts'
import { xaiDefinitions } from '../src/official-models/xai.ts'
import { directFull, directNew } from './direct-full-input.ts'

// Independent ordinary-JSON oracle: no meter/helper/production serializer is used.
function net(envelope: JsonObject, messages: JsonObject[]): number {
  const encoder = new TextEncoder()
  const withoutTools = Object.fromEntries(
    Object.entries(envelope).filter(([key]) => key !== 'tools'),
  )
  const bytes = (units: JsonObject[]) =>
    encoder.encode(JSON.stringify({ ...withoutTools, messages: units })).length
  return Math.floor(bytes(messages) / 4) - Math.floor(bytes([]) / 4)
}

describe.each(xaiDefinitions)('$modelId visible JSON net contribution', definition => {
  const meter = createXaiInputMeter(definition)!
  const counter = createXaiVisibleBodyCounter(definition)!
  const envelope: JsonObject = {
    model: definition.modelId,
    provider: { order: ['xai'], allow_fallbacks: false, require_parameters: true },
    stream: true,
    store: false,
    reasoning: { effort: 'low' },
    max_tokens: 1024,
  }
  it('allows private empty framing but rejects public empty full input', () => {
    const body = { ...envelope, messages: [] }
    const serialized = writeJsonLossless(body)
    expect(counter({ body, serialized }).kind).toBe('estimated')
    expect(directFull(meter, { body, serialized })).toEqual({ kind: 'unavailable' })
    expect(
      directFull(createXaiHistoryCandidateInputMeter(definition)!, { body, serialized }),
    ).toEqual({ kind: 'unavailable' })
    expect(counter({ body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
    expect(directNew(meter, { envelope, units: [], precedingUnitCount: 1000000 })).toEqual({
      kind: 'exact',
      tokens: 0,
    })
  })
  it.each(['A', 'AB', 'ABC', 'ABCD', '你好🙂'])(
    'matches independently framed bytes for %s without an offset or repeated tools',
    text => {
      const units: JsonObject[] = [
        { role: 'assistant', content: text, reasoning: 'visible reasoning' },
        { role: 'tool', content: 'value', tool_call_id: 'call-1' },
        { role: 'user', content: [{ type: 'text', text }] },
      ]
      const tools = [
        {
          type: 'function',
          function: {
            name: 'lookup',
            description: 'large'.repeat(1000),
            parameters: { type: 'object' },
          },
        },
      ]
      for (const current of [envelope, { ...envelope, tools }]) {
        const actual = directNew(meter, { envelope: current, units, precedingUnitCount: 1000000 })
        expect(actual.kind).toBe('estimated')
        if (actual.kind !== 'estimated') throw Error('missing estimated net')
        expect(jsonNumberSource(actual.tokens)).toBe(String(net(envelope, units)))
      }
    },
  )
  it('uses the same strict field and route guard for full and marginal bodies', () => {
    const bad: JsonObject[] = [
      { ...envelope, model: 'wrong' },
      {
        ...envelope,
        provider: { order: ['other'], allow_fallbacks: false, require_parameters: true },
      },
      { ...envelope, reasoning: { effort: 'max' } },
      { ...envelope, unrecognized: true },
    ]
    for (const current of bad) {
      const units = [{ role: 'user', content: 'hello' }]
      const body = { ...current, messages: units }
      expect(directFull(meter, { body, serialized: writeJsonLossless(body) })).toEqual({
        kind: 'unavailable',
      })
      expect(directNew(meter, { envelope: current, units, precedingUnitCount: 0 })).toEqual({
        kind: 'unavailable',
      })
    }
    const unsupported: JsonObject[] = [
      {
        role: 'assistant',
        content: '',
        reasoning_details: [{ type: 'reasoning.encrypted', data: 'opaque' }],
      },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,YQ==' } }],
      },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { type: 'function', id: 'one', function: { name: 'tool', arguments: '{}', extra: true } },
        ],
      },
      { role: 'user', content: 'hello', extra: true },
    ]
    for (const unit of unsupported) {
      const body = { ...envelope, messages: [unit] }
      const serialized = writeJsonLossless(body)
      expect(directFull(meter, { body, serialized })).toEqual({ kind: 'unavailable' })
      expect(directNew(meter, { envelope, units: [unit], precedingUnitCount: 1 })).toEqual({
        kind: 'unavailable',
      })
      expect(writeJsonLossless(body)).toBe(serialized)
    }
  })
})
