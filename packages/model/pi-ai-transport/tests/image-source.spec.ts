import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { writeJsonLossless, type ImageBlock } from '@omne-harness-lite/content-blocks'
import { resolveImageMessages } from '../src/image-source.ts'
import { input, judgedMessage, at } from './support.ts'
import { testDefinitions } from './definitions.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'
import { testImagePreparerFor } from './image-transport-support.ts'
import { planRequest } from '@omne-harness-lite/pi-ai-transport'
import {
  modelLogJsonEqual,
  type PlanExecutionContext,
} from '@omne-harness-lite/model-request-runtime'

const image = {
  id: 'external-image',
  kind: 'image',
  mediaType: 'image/png',
  data: { storage: 'demo-results', key: 'image-source-test', mediaType: 'image/png' },
  visibility: { toHuman: true, toModel: true },
}
function messages() {
  return [judgedMessage({ type: 'user', id: 'image-message', createdAt: at, blocks: [image] })]
}
it('keeps the original array when there is no source', async () => {
  const original = messages()
  expect(await resolveImageMessages(original, { signal: new AbortController().signal })).toBe(
    original,
  )
})
it('projects fixed bytes only for visible references and preserves original blocks', () => {
  const hidden = judgedMessage({
    type: 'tool',
    id: 'hidden-message',
    createdAt: at,
    callId: 'hidden-call',
    blocks: [
      {
        id: 'hidden-result',
        kind: 'tool_result',
        callId: 'hidden-call',
        outcome: 'completed',
        visibility: { toHuman: true, toModel: false },
        blocks: [image],
      },
    ],
  })
  const original = [...messages(), hidden]
  const before = writeJsonLossless(original)
  const bytes = new Uint8Array([1, 2, 3])
  const result = resolveImageMessages(original, {
    signal: new AbortController().signal,
    imageBytes: [{ reference: image.data, bytes }],
  })
  bytes.fill(9)
  expect((result[0]!.blocks[0] as ImageBlock).data).toEqual({ inline: 'AQID' })
  expect(result[1]).toEqual(hidden)
  expect(writeJsonLossless(original)).toBe(before)
})
it.each(['missing', 'duplicate', 'abort'] as const)(
  'refuses %s fixed bytes before wire construction',
  mode => {
    const control = new AbortController()
    const snapshot = { reference: image.data, bytes: new Uint8Array([1]) }
    if (mode === 'abort') control.abort()
    const imageBytes =
      mode === 'missing' ? [] : mode === 'duplicate' ? [snapshot, snapshot] : [snapshot]
    expect(() => resolveImageMessages(messages(), { signal: control.signal, imageBytes })).toThrow()
  },
)
it('keeps inline images independent of the external byte snapshots', () => {
  const inline = judgedMessage({
    type: 'user',
    id: 'inline-message',
    createdAt: at,
    blocks: [{ ...image, data: { inline: 'AQ==' } }],
  })
  expect(
    resolveImageMessages([inline], { signal: new AbortController().signal, imageBytes: [] }),
  ).toEqual([inline])
})
it('resolves a visible nested tool result while retaining text blocks', () => {
  const nested = judgedMessage({
    type: 'tool',
    id: 'visible-message',
    createdAt: at,
    callId: 'visible-call',
    blocks: [
      {
        id: 'visible-result',
        kind: 'tool_result',
        callId: 'visible-call',
        outcome: 'completed',
        visibility: { toHuman: true, toModel: true },
        blocks: [
          {
            id: 'caption',
            kind: 'text',
            text: 'Original caption',
            visibility: { toHuman: true, toModel: true },
          },
          image,
        ],
      },
    ],
  })
  const before = writeJsonLossless(nested)
  const result = resolveImageMessages([nested], {
    signal: new AbortController().signal,
    imageBytes: [{ reference: image.data, bytes: new Uint8Array([1, 2, 3]) }],
  })
  expect(writeJsonLossless(result)).toContain('Original caption')
  expect(writeJsonLossless(result)).toContain('"inline":"AQID"')
  expect(writeJsonLossless(result)).not.toContain('image-source-test')
  expect(writeJsonLossless(nested)).toBe(before)
})
it('does not substitute bytes retained for a different reference', () => {
  expect(() =>
    resolveImageMessages(messages(), {
      signal: new AbortController().signal,
      imageBytes: [
        { reference: { ...image.data, key: 'unrelated-image' }, bytes: new Uint8Array([9]) },
      ],
    }),
  ).toThrow()
})
it('selects the exact reference from multiple retained images', () => {
  const result = resolveImageMessages(messages(), {
    signal: new AbortController().signal,
    imageBytes: [
      { reference: { ...image.data, key: 'unrelated-image' }, bytes: new Uint8Array([9]) },
      { reference: image.data, bytes: new Uint8Array([1, 2, 3]) },
    ],
  })
  expect((result[0]!.blocks[0] as ImageBlock).data).toEqual({ inline: 'AQID' })
})
it.each([{ reuseScope: null }, { reuseScope: 'invalid' }, { imageBytes: {} }])(
  'rejects malformed execution metadata %j before planning',
  async invalid => {
    const request = input()
    const execution = {
      signal: new AbortController().signal,
      ...invalid,
    } as unknown as PlanExecutionContext
    expect(
      await planRequest(
        request,
        testDefinitions,
        syntheticInputMeter(testDefinitions[0]!, request.provider),
        execution,
      ),
    ).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
  },
)
it('accepts an actual object reuse scope through the public planner', async () => {
  const request = input()
  const result = await planRequest(
    request,
    testDefinitions,
    syntheticInputMeter(testDefinitions[0]!, request.provider),
    { signal: new AbortController().signal, reuseScope: {} },
    testImagePreparerFor(planRequest),
  )
  expect(result).toHaveProperty('planned')
  if (!('planned' in result)) throw new Error(result.rejected)
  expect(modelLogJsonEqual(result.planned.input, request)).toBe(true)
})
it('fails closed when the referenced image has no retained bytes', async () => {
  const request = { ...input(), messages: messages() }
  expect(
    await planRequest(
      request,
      testDefinitions,
      syntheticInputMeter(testDefinitions[0]!, request.provider),
      {
        signal: new AbortController().signal,
        imageBytes: [],
      },
    ),
  ).toEqual({ rejected: 'unavailable' })
})
// Real native codec and complete branded plan. No network or upstream counting claim.
it(
  'plans original reference input with actual image wire bytes through the published provider',
  { tags: ['slow'] },
  async () => {
    const bytes = readFileSync(new URL('./fixtures/anthropic/reference-1x1.png', import.meta.url))
    const request = { ...input(), messages: messages() }
    const definition = testDefinitions[0]!
    const result = await planRequest(
      request,
      testDefinitions,
      syntheticInputMeter(definition, request.provider),
      {
        signal: new AbortController().signal,
        imageBytes: [{ reference: image.data, bytes }],
      },
      testImagePreparerFor(planRequest),
    )
    expect(result).toHaveProperty('planned')
    if (!('planned' in result)) throw new Error(result.rejected)
    expect(modelLogJsonEqual(result.planned.input, request)).toBe(true)
    const wire = JSON.parse(result.planned.serialized)
    const url = wire.messages[0].content[0].image_url.url
    expect(Buffer.from(url.split(',')[1], 'base64')).toEqual(bytes)
    expect((request.messages[0]!.blocks[0] as ImageBlock).data).toEqual(image.data)
  },
)
