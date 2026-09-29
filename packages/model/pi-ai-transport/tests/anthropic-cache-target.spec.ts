import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createAnthropicInputMeter } from '../src/input-meters/anthropic.ts'
import { anthropicDefinitions } from '../src/official-models/anthropic.ts'
import { planRequest } from '../src/plan.ts'
import { directFull } from './direct-full-input.ts'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { testImagePreparerFor } from './image-transport-support.ts'
import { at, input, judgedMessage, message } from './support.ts'
const image = {
  kind: 'image',
  id: 'image',
  mediaType: 'image/gif',
  data: {
    inline: readFileSync(
      new URL('./fixtures/anthropic/reference-single-frame.gif', import.meta.url),
    ).toString('base64'),
  },
  visibility: { toHuman: true, toModel: true },
}
const text = (value: string) => ({
  kind: 'text',
  id: 'text',
  text: value,
  visibility: { toHuman: true, toModel: true },
})

describe.each(anthropicDefinitions)('$modelId strict last_message cache target', original => {
  const definition = original
  const meter = createAnthropicInputMeter(definition)
  const profile = createOfficialProfileContent(definition, {
    providers: ['anthropic'],
    allowFallback: false,
    configuration: {
      revision: '1',
      values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
    },
  })
  if ('rejected' in profile) throw Error(profile.rejected)
  const resolved = profile.ok
  function request(blocks: readonly unknown[]) {
    const base = input()
    return {
      ...base,
      routeName: definition.modelId,
      provider: 'anthropic',
      messages: [
        message('user', 'older text', 'older'),
        judgedMessage({ type: 'user', id: 'tail', createdAt: at, blocks }),
      ],
      snapshot: {
        ...base.snapshot,
        ...definition.capabilities,
        adaptation: resolved.adaptation,
        providers: resolved.providers,
        allowFallback: false,
      },
    }
  }
  async function plan(blocks: readonly unknown[]) {
    return planRequest(
      request(blocks),
      [definition],
      meter,
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
  }
  it.each([1, 2])(
    'uses configured top-level TTL only for the final %i pure images',
    async count => {
      const result = await plan(
        Array.from({ length: count }, (_, i) => ({ ...image, id: `image-${i}` })),
      )
      if (!('planned' in result)) throw Error(JSON.stringify(result))
      expect(result.planned.body.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
      expect(result.planned.serialized.match(/cache_control/g)).toHaveLength(1)
      expect(result.planned.serialized).not.toContain('"text":""')
      expect(result.planned.requestInput.kind).toBe('known')
    },
  )
  it('retains the text-block layout for real text mixed with images', async () => {
    const result = await plan([text('question'), image])
    if (!('planned' in result)) throw Error(JSON.stringify(result))
    expect(result.planned.body.cache_control).toBeUndefined()
    expect(result.planned.serialized).toContain(
      '"text":"question","cache_control":{"type":"ephemeral","ttl":"1h"}',
    )
  })
  it.each([{ blocks: [] }, { blocks: [text('')] }, { blocks: [text(''), image] }])(
    'does not move an empty target back to older text',
    async ({ blocks }) => {
      expect(await plan(blocks)).toEqual({ rejected: 'unavailable' })
    },
  )
  it('does not omit an arbitrary caller top-level control from the meter', () => {
    const body = {
      model: definition.modelId,
      provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
      cache_control: { type: 'ephemeral', ttl: '1h', extra: true },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/gif;base64,${image.data.inline}` } },
          ],
        },
      ],
    }
    expect(directFull(meter, { body, serialized: writeJsonLossless(body) })).toEqual({
      kind: 'unavailable',
    })
  })
})
