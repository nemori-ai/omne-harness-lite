import { describe, expect, it } from 'vitest'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import {
  attachAnthropicCache,
  cacheNeutralBody,
  selectAnthropicCacheTarget,
} from '../src/anthropic-cache.ts'
import { defineInputMeter } from '../src/input-meter.ts'
import { projectInput } from '../src/projection.ts'
import { input } from './support.ts'

function basis() {
  const base = input(true)
  const request = {
    ...base,
    routeName: 'anthropic/claude-opus-5.5',
    snapshot: {
      ...base.snapshot,
      adaptation: {
        ...base.snapshot.adaptation,
        definition: { modelId: 'anthropic/claude-opus-5.5', revision: '4' },
        implementation: { name: 'pi-ai:anthropic', revision: 'mp4-18' },
        configuration: {
          revision: 'fixture-cache/1',
          values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
        },
      },
    },
  }
  const meter = defineInputMeter({
    modelId: request.routeName,
    definitionRevision: '4',
    implementation: request.snapshot.adaptation.implementation,
    provider: 'anthropic',
    algorithmRevision: 'cache-fixture/1',
    evidence: 'local cache projection fixture only',
    measureFull: () => ({ kind: 'unavailable' }),
  })
  return projectInput({ model: request.routeName, messages: [] }, request, meter).requestInput
    .countingBasis
}
const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,YQ==' } }
describe('one strict Anthropic cache selector', () => {
  it.each([{ content: [image] }, { content: [image, image] }])(
    'pure image terminal user uses configured top-level marker and strips the whole property',
    ({ content }) => {
      const body: JsonObject = {
        model: 'anthropic/claude-opus-5.5',
        messages: [{ role: 'user', content }],
      }
      const marked = attachAnthropicCache(body, '1h')
      if (!marked) throw Error('target')
      expect(marked.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
      expect(cacheNeutralBody(marked, basis())).toEqual(body)
      expect(writeJsonLossless(body)).not.toContain('cache_control')
      expect(writeJsonLossless(marked)).toContain('cache_control')
    },
  )
  it('text targets stay at the exact last nonempty text block', () => {
    const body: JsonObject = {
      messages: [
        {
          role: 'user',
          content: [image, { type: 'text', text: 'question' }, { type: 'text', text: '' }],
        },
      ],
    }
    const marked = attachAnthropicCache(body, '1h')
    expect(marked).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            image,
            { type: 'text', text: 'question', cache_control: { type: 'ephemeral', ttl: '1h' } },
            { type: 'text', text: '' },
          ],
        },
      ],
    })
    if (!marked) throw Error('target')
    expect(cacheNeutralBody(marked, basis())).toEqual(body)
    expect(
      attachAnthropicCache({ messages: [{ role: 'tool', content: 'tool answer' }] }, '5m'),
    ).toHaveProperty('messages.0.content.0.cache_control.ttl', '5m')
  })
  it.each(
    [
      [],
      [{ role: 'user', content: '' }],
      [{ role: 'user', content: [] }],
      [{ role: 'user', content: [image, { type: 'text', text: '' }] }],
      [
        { role: 'user', content: [image] },
        { role: 'assistant', content: '' },
      ],
    ].map(messages => ({ messages })),
  )('empty targets do not backtrack or invent text %#', ({ messages }) => {
    expect(selectAnthropicCacheTarget(messages)).toBeUndefined()
    expect(attachAnthropicCache({ messages }, '1h')).toBeUndefined()
  })
  it('foreign TTL/layout/extra fields and a different route retain actual cache wire fields', () => {
    const body: JsonObject = {
      messages: [{ role: 'user', content: [image] }],
      cache_control: { type: 'ephemeral', ttl: '5m' },
    }
    const original = basis()
    expect(cacheNeutralBody(body, original)).toEqual(body)
    const extra = { ...body, cache_control: { type: 'ephemeral', ttl: '1h', extra: true } }
    expect(cacheNeutralBody(extra, original)).toEqual(extra)
    const marked = { ...body, cache_control: { type: 'ephemeral', ttl: '1h' } }
    expect(cacheNeutralBody(marked, { ...original, provider: 'openai' })).toEqual(marked)
    expect(
      cacheNeutralBody(marked, {
        ...original,
        binding: {
          ...original.binding,
          configuration: {
            ...original.binding.configuration,
            values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['system'] } },
          },
        },
      }),
    ).toEqual(marked)
  })
})
