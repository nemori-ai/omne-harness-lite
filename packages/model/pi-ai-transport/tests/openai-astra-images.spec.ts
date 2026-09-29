import { directFull, directNew } from './direct-full-input.ts'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getEncoding } from 'js-tiktoken'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { patchImageTokens } from '../src/input-meters/openai-images.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { planRequest } from '../src/plan.ts'
import {
  at,
  certificate,
  finish,
  fixture,
  input,
  judgedMessage,
  message,
  policy,
  sse,
} from './support.ts'

const tokenized = vi.hoisted(() => [] as string[])
vi.mock('js-tiktoken', async importOriginal => {
  const actual = await importOriginal<typeof import('js-tiktoken')>()
  return {
    ...actual,
    getEncoding(...args: Parameters<typeof actual.getEncoding>) {
      const encoder = actual.getEncoding(...args)
      const encode = encoder.encode.bind(encoder)
      encoder.encode = (...values: Parameters<typeof encode>) => {
        tokenized.push(values[0])
        return encode(...values)
      }
      return encoder
    },
  }
})
const definition = openaiDefinitions.find(d => d.modelId === 'openai/gpt-6-astra')!
const bytes = (name: string) =>
  readFileSync(new URL(`./fixtures/openai-meter/${name}`, import.meta.url))
const imageUrl = (name: string) =>
  `data:image/${name.endsWith('.gif') ? 'gif' : 'png'};base64,${bytes(name).toString('base64')}`
function visual(name: string, id: string) {
  return judgedMessage({
    type: 'user',
    id,
    createdAt: at,
    blocks: [
      {
        id: `${id}-text`,
        kind: 'text',
        text: `image prompt ${id}`,
        visibility: { toHuman: true, toModel: true },
      },
      {
        id: `${id}-image`,
        kind: 'image',
        mediaType: 'image/png',
        data: { inline: bytes(name).toString('base64') },
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
}
function request(): PlanInput {
  const profile = createOfficialProfileContent(definition, {
    providers: ['openai'],
    allowFallback: false,
    configuration: openaiConfiguration,
  })
  if ('rejected' in profile) throw Error(profile.rejected)
  return {
    ...input(),
    routeName: definition.modelId,
    provider: 'openai',
    parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
    messages: [
      message('system', 'STABLE_IMAGE_PREFIX ' + 'unchanged history '.repeat(100), 'system'),
      message('system_reminder', 'Describe images.', 'reminder'),
      visual('1024x1024.png', 'first'),
    ],
    snapshot: {
      ...input().snapshot,
      ...definition.capabilities,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: false,
    },
    tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
  }
}
function body(url: string, detail?: string): JsonObject {
  return {
    model: definition.modelId,
    provider: { order: ['openai'], allow_fallbacks: false, require_parameters: true },
    stream: true,
    store: false,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe.' },
          { type: 'image_url', image_url: { url, ...(detail === undefined ? {} : { detail }) } },
        ],
      },
    ],
  }
}
const full = (value: JsonObject) =>
  directFull(createOpenAiInputMeter(definition), {
    body: value,
    serialized: writeJsonLossless(value),
  })
const plan = (value: PlanInput, meter = createOpenAiInputMeter(definition)) => {
  const result = planRequest(value, [definition], meter)
  if ('rejected' in result) throw Error(JSON.stringify(result))
  return result.planned
}

describe('Astra named patch rule, shared calculations and final visible projection', () => {
  it.each([
    [1024, 1024, 'high', 1229],
    [2048, 2048, 'high', 3000],
    [4096, 512, 'high', 2458],
    [4096, 512, 'low', 39],
    [1, 1, 'low', 2],
    [2048, 2048, 'original', 4916],
    [2048, 2048, 'auto', 4916],
    [9600, 3200, 'original', 36000],
    [65536, 32, 'original', 2458],
    [131070, 64, 'auto', 2458],
  ] as const)('matches archived dimensions %s × %s / %s → %s', (width, height, detail, tokens) => {
    expect(patchImageTokens(width, height, detail, 'astra-patch')).toBe(tokens)
  })
  it('keeps Astra high dimensions separate from GPT-5.6 and rejects excess processed patches', () => {
    expect(patchImageTokens(4096, 512, 'high', 'gpt56-patch')).toBe(615)
    expect(patchImageTokens(4096, 512, 'high', 'astra-patch')).toBe(2458)
    for (const detail of ['original', 'auto'] as const)
      expect(patchImageTokens(9601, 3200, detail, 'astra-patch')).toBeUndefined()
    for (const [w, h] of [
      [0, 1],
      [-1, 1],
      [1.5, 1],
      [NaN, 1],
      [Infinity, 1],
    ])
      expect(patchImageTokens(w!, h!, 'high', 'astra-patch')).toBeUndefined()
    expect(patchImageTokens(9601, 3200, 'high', 'astra-patch')).toBeLessThanOrEqual(3000)
    // GPT-5.6 also fits oversized sources before checking processed patches.
    expect(patchImageTokens(65536, 32, 'original', 'gpt56-patch')).toBe(2458)
  })
  it.each(['low', 'high', 'original', 'auto', undefined] as const)(
    'adds visual contribution once, omits base64 only in the meter copy: %s',
    detail => {
      const value = body(imageUrl('1024x1024.png'), detail)
      const before = writeJsonLossless(value)
      const expected =
        getEncoding('o200k_base').encode(writeJsonLossless(body('[image]', detail))).length +
        (detail === 'low' ? 308 : 1229)
      const meter = createOpenAiInputMeter(definition)
      expect(full(value)).toEqual({ kind: 'estimated', tokens: expected })
      expect(writeJsonLossless(value)).toBe(before)
      const { messages, ...envelope } = value
      if (!Array.isArray(messages)) throw Error('messages required')
      const marginal = { units: messages, envelope, precedingUnitCount: 7 }
      const contribution = {
        kind: 'estimated',
        tokens:
          expected -
          getEncoding('o200k_base').encode(writeJsonLossless({ ...envelope, messages: [] })).length,
      }
      expect(
        meter.measureReplay({
          ...marginal,
          outputHistory: [],
          observation: {
            kind: 'observation',
            inputCalibration: {
              requestInput: { kind: 'unavailable', reason: 'not_retained' },
              observedInput: { kind: 'unavailable', reason: 'missing_usage' },
              outputGroup: { kind: 'unavailable', reason: 'not_retained' },
            },
            usage: {
              input_tokens: 'unknown',
              output_tokens: 'unknown',
              cache_read_tokens: 'unknown',
              cache_write_tokens: 'unknown',
              source: 'none',
            },
            outputBlocks: [],
            replaySelection: [],
          },
          unitIndices: messages.map((_, index) => index + 7),
          selectionSpans: [],
        }),
      ).toEqual(contribution)
      expect(directNew(meter, marginal)).toEqual(contribution)
      expect(directNew(meter, { ...marginal, units: [] })).toEqual({ kind: 'exact', tokens: 0 })
    },
  )
  it('validates MIME, base64, image fields, GIF completeness and unsupported model scope', () => {
    expect(full(body(imageUrl('single-frame.gif'), 'low')).kind).toBe('estimated')
    for (const url of [
      imageUrl('two-frame.gif'),
      imageUrl('truncated.gif'),
      'https://example.invalid/image.png',
      'data:image/png;base64,eA==',
      imageUrl('1x1.png').replace('image/png', 'image/jpeg'),
      imageUrl('1x1.png').replace('image/png', 'image/webp'),
      imageUrl('1x1.png') + '=',
      imageUrl('1x1.png').replace('base64,', 'base64,\n'),
    ])
      expect(full(body(url))).toEqual({ kind: 'unavailable' })
    expect(full(body(imageUrl('1x1.png'), 'ultra'))).toEqual({ kind: 'unavailable' })
    const value = body(imageUrl('1x1.png'))
    expect(
      directFull(createOpenAiInputMeter(definition), { body: value, serialized: '{}' }),
    ).toEqual({ kind: 'unavailable' })
    for (const model of ['openai/gpt-6-sol', 'openai/gpt-6-luna']) {
      const d = openaiDefinitions.find(d => d.modelId === model)!
      const other = { ...value, model }
      expect(
        directFull(createOpenAiInputMeter(d), {
          body: other,
          serialized: writeJsonLossless(other),
        }),
      ).toEqual({ kind: 'unavailable' })
    }
    const pro = openaiDefinitions.find(item => item.modelId === 'openai/gpt-6-astra-pro')
    if (!pro) throw new Error('Astra Pro definition missing')
    const proBody = { ...value, model: pro.modelId }
    expect(
      directFull(createOpenAiInputMeter(pro), {
        body: proBody,
        serialized: writeJsonLossless(proBody),
      }),
    ).toMatchObject({ kind: 'estimated' })
    expect(() =>
      createOpenAiInputMeter({
        ...definition,
        revision: '2',
        implementation: { name: 'pi-ai:openai', revision: 'mp4-8' },
      }),
    ).toThrow('unsupported OpenAI')
    expect(createOpenAiInputMeter(definition).replayRevision).toBe(
      'openai-gpt-6-astra-visible-image-units-json-net-estimated/1',
    )
  })
})

describe('Astra actual image planner and public local TLS', () => {
  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())
  it('sends images intact, reuses stable P, meters new images and invalidates changed prefix/basis', async () => {
    const meter = createOpenAiInputMeter(definition)
    const measure = vi.fn(meter.measureFull)
    const bound = { ...meter, measureFull: measure }
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          sse({
            model: definition.modelId,
            provider: 'OpenAI',
            choices: [{ delta: { content: 'image answer' } }],
          }) +
            sse({
              choices: [],
              usage: {
                prompt_tokens: 9000,
                completion_tokens: 2,
                prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                cost: 0.000123,
              },
            }) +
            finish(),
        ),
      {},
      undefined,
      [definition],
    )
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [bound],
    })
    let next = request()
    try {
      for (let round = 1; round <= 3; round++) {
        tokenized.length = 0
        const calls = measure.mock.calls.length
        const p = plan(next, bound)
        expect(p.measurement.mode).toBe(round === 1 ? 'full' : 'marginal')
        expect(p.inputLimitEvidence.images).toBe(round)
        expect(p.serialized).toContain(imageUrl('1024x1024.png'))
        const response = await invokeModel({
          ...next,
          transport,
          credential: 'local-test-key',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        if (!('outcome' in response)) throw Error(JSON.stringify(response))
        expect(response.outcome).toBe('complete')
        expect(writeJsonLossless(response.usage.input_tokens)).toBe('9000')
        expect(writeJsonLossless(response.cost.cost_usd)).toBe('0.000123')
        expect(host.requests.at(-1)?.body).toBe(p.serialized)
        expect(tokenized.some(text => text.includes('data:image/'))).toBe(false)
        if (round > 1) {
          expect(measure.mock.calls.length).toBe(calls)
          expect(tokenized.some(text => text.includes('STABLE_IMAGE_PREFIX'))).toBe(false)
          expect(tokenized.some(text => text.includes('[image]'))).toBe(true)
        }
        const messageIndex = next.messages.length
        next = {
          ...next,
          messages: [
            ...next.messages,
            judgedMessage({
              type: 'assistant',
              id: `a${round}`,
              response: `r${round}`,
              ending: 'complete',
              createdAt: at,
              blocks: response.blocks,
            }),
            visual('1x1.png', `new${round}`),
          ],
          calibration: {
            kind: 'observation',
            inputCalibration: response.inputCalibration,
            usage: response.usage,
            outputBlocks: response.blocks,
            replaySelection: response.blocks.map((_b, index) => ({
              sourceBlockIndex: index,
              messageIndex,
              blockIndex: index,
            })),
          },
        }
      }
      expect(
        plan(
          {
            ...next,
            messages: [
              ...next.messages.slice(0, 2),
              visual('1x1.png', 'first'),
              ...next.messages.slice(3),
            ],
          },
          bound,
        ).measurement,
      ).toMatchObject({ mode: 'full', fallbackReason: 'prefix_changed' })
      if (
        next.calibration.kind !== 'observation' ||
        next.calibration.inputCalibration.requestInput.kind !== 'known'
      )
        throw Error('known anchor required')
      const prior = next.calibration.inputCalibration.requestInput
      const old = {
        ...prior.countingBasis,
        binding: {
          ...prior.countingBasis.binding,
          definition: { modelId: definition.modelId, revision: '2' },
          implementation: { name: 'pi-ai:openai', revision: 'mp4-8' },
        },
        meterRevision: 'openai-gpt-6-astra-final-visible-json-o200k-1/response-calibration-1',
        replayRevision: 'visible-final-units-json-net-estimated/1',
      }
      expect(
        plan(
          {
            ...next,
            calibration: {
              ...next.calibration,
              inputCalibration: {
                ...next.calibration.inputCalibration,
                requestInput: { ...prior, countingBasis: old },
              },
            },
          },
          bound,
        ).measurement,
      ).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
      expect(host.requests).toHaveLength(3)
    } finally {
      await transport.close()
      await host.close()
    }
  })
  it('uses original bytes/images for exact cap checks and rejects bad images and opaque before HTTP', async () => {
    const host = await fixture(cert.tls, res => res.end(finish()), {}, undefined, [definition])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createOpenAiInputMeter(definition)],
    })
    const original = request()
    const p = plan(original)
    const length = bytes('1024x1024.png').length
    expect(p.inputLimitEvidence.imageBytes).toEqual([length])
    expect(p.inputLimitEvidence.requestBytes).toBe(Buffer.byteLength(p.serialized))
    const limits = {
      ...original.snapshot,
      inputConstraints: {
        maxImageBytes: length,
        maxImages: 1,
        maxRequestBytes: Buffer.byteLength(p.serialized),
      },
    }
    expect(
      planRequest(
        { ...original, snapshot: limits },
        [definition],
        createOpenAiInputMeter(definition),
      ),
    ).toHaveProperty('planned')
    try {
      for (const inputConstraints of [
        { ...limits.inputConstraints, maxImageBytes: length - 1 },
        { ...limits.inputConstraints, maxRequestBytes: Buffer.byteLength(p.serialized) - 1 },
      ]) {
        const result = await invokeModel({
          ...original,
          snapshot: { ...limits, inputConstraints },
          transport,
          credential: 'local-only',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        expect(result).toMatchObject({ rejected: 'invalidInput', reason: 'input_limit_exceeded' })
      }
      expect(
        await invokeModel({
          ...original,
          messages: [...original.messages, visual('1x1.png', 'second')],
          snapshot: {
            ...original.snapshot,
            inputConstraints: { maxImageBytes: length, maxImages: 1 },
          },
          transport,
          credential: 'local-only',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome,
      ).toMatchObject({
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        metric: 'maxImages',
      })
      const opaque = judgedMessage({
        type: 'assistant',
        id: 'opaque',
        response: 'opaque-response',
        ending: 'complete',
        createdAt: at,
        blocks: [
          {
            id: 'opaque-block',
            kind: 'thinking',
            text: '',
            opaque: {
              routeName: definition.modelId,
              reasoning_details: [
                { type: 'reasoning.encrypted', data: 'retained-opaque', index: 0 },
              ],
            },
            visibility: { toHuman: false, toModel: true },
          },
        ],
      })
      const bad = judgedMessage({
        type: 'user',
        id: 'bad',
        createdAt: at,
        blocks: [
          {
            id: 'bad-image',
            kind: 'image',
            mediaType: 'image/png',
            data: { inline: Buffer.from('not an image').toString('base64') },
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      for (const extra of [opaque, bad]) {
        const value = { ...original, messages: [...original.messages, extra] }
        const before = writeJsonLossless(value)
        expect(
          await invokeModel({
            ...value,
            transport,
            credential: 'local-only',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome,
        ).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
        expect(writeJsonLossless(value)).toBe(before)
      }
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  })
})
