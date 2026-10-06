import { imagePreparation, testImagePreparerFor } from './image-transport-support.ts'
import { readFileSync } from 'node:fs'
import { crc32 } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { planRequest } from '../src/plan.ts'
import { imageTokens, patchImageTokens } from '../src/input-meters/openai-images.ts'
import { directFull } from './direct-full-input.ts'
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

const models = [
  'openai/gpt-6-sol',
  'openai/gpt-6-luna',
  'openai/gpt-6-sol-pro',
  'openai/gpt-6-luna-pro',
]
const bytes = (name: string) =>
  readFileSync(new URL(`./fixtures/openai-meter/${name}`, import.meta.url))
const imageUrl = (name: string) =>
  `data:image/${name.endsWith('.gif') ? 'gif' : 'png'};base64,${bytes(name).toString('base64')}`

describe('Sol/Luna native-dimension proxy applicability', () => {
  it('refuses arithmetic beyond safe integer representation without inventing a pixel cap', () => {
    expect(patchImageTokens(4294967295, 4294967295, 'auto', 'sol-luna-auto-proxy')).toBeUndefined()
  })
  it('handles canonical 4 MiB PNG bytes without a regex stack failure', () => {
    const original = bytes('1x1.png')
    const data = Buffer.alloc(4194304 - original.length - 12, 65)
    data.set(Buffer.from('Comment\0'))
    const header = Buffer.alloc(8)
    header.writeUInt32BE(data.length)
    header.write('tEXt', 4)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])))
    const png = Buffer.concat([
      original.subarray(0, -12),
      header,
      data,
      crc,
      original.subarray(-12),
    ])
    expect(png.length).toBe(4194304)
    const url = `data:image/png;base64,${png.toString('base64')}`
    expect(imageTokens({ type: 'image_url', image_url: { url } }, 'sol-luna-auto-proxy')).toBe(2)
    expect(
      imageTokens({ type: 'image_url', image_url: { url: url + '=' } }, 'sol-luna-auto-proxy'),
    ).toBeUndefined()
  })

  it.each([
    [65, 65, 11],
    [1024, 1024, 1229],
    [2049, 2903, 7098],
    [9601, 3200, 36120],
    [131070, 64, 9831],
  ] as const)('counts %s × %s as an estimate %s without borrowing Astra caps', (w, h, n) => {
    expect(patchImageTokens(w, h, 'auto', 'sol-luna-auto-proxy')).toBe(n)
  })
  it.each(['low', 'high', 'original'] as const)(
    'does not invent an exposed %s detail mode',
    detail => {
      expect(patchImageTokens(1024, 1024, detail, 'sol-luna-auto-proxy')).toBeUndefined()
    },
  )
})
describe.each(models)('%s complete visible image input', modelId => {
  const definition = openaiDefinitions.find(d => d.modelId === modelId)!
  const meter = createOpenAiInputMeter(definition)
  function measured(name: string, detail?: string) {
    const body = {
      model: modelId,
      provider: { order: ['openai'], allow_fallbacks: false, require_parameters: true },
      stream: true,
      store: false,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl(name), ...(detail === undefined ? {} : { detail }) },
            },
          ],
        },
      ],
    }
    return directFull(meter, { body, serialized: writeJsonLossless(body) })
  }
  it('requires the new exact coordinates and retains estimated evidence', () => {
    expect(definition.revision).toBe(modelId === 'openai/gpt-6-luna' ? '7' : '6')
    expect(definition.implementation.revision).toBe('mp4-18')
    expect(meter.evidence).toContain('estimated')
    expect(() => createOpenAiInputMeter({ ...definition, revision: 'stale' })).toThrow(
      'unsupported OpenAI',
    )
  })
  it.each([
    ['1024x1024.png', 1227],
    ['2048x1536.png', 3685],
    ['2049x2903.png', 7096],
  ] as const)('generically counts %s beyond the pilot byte whitelist', (name, net) => {
    const result = measured(name),
      small = measured('1x1.png')
    expect(result.kind).toBe('estimated')
    expect(small.kind).toBe('estimated')
    if (result.kind !== 'estimated' || small.kind !== 'estimated') throw Error('missing estimate')
    expect(Number(result.tokens) - Number(small.tokens)).toBe(net)
    expect(measured(name, 'auto').kind).toBe('estimated')
  })
  it('uses shared complete inline parsing and refuses unsupported animation/detail', () => {
    expect(measured('single-frame.gif')).toEqual(measured('1x1.png'))
    expect(measured('two-frame.gif')).toEqual({ kind: 'unavailable' })
    expect(measured('truncated.gif')).toEqual({ kind: 'unavailable' })
    for (const detail of ['low', 'high', 'original', 'ultra'])
      expect(measured('1x1.png', detail)).toEqual({ kind: 'unavailable' })
  })
  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())
  it('uses the public invocation unchanged wire and actual accounts, with original accounting and route-specific context scope', async () => {
    const profile = createOfficialProfileContent(definition, {
      providers: ['openai'],
      allowFallback: false,
      configuration: openaiConfiguration,
    })
    if ('rejected' in profile) throw Error(profile.rejected)
    const visual = judgedMessage({
      type: 'user',
      id: 'image-user',
      createdAt: at,
      blocks: [
        {
          id: 'image',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: bytes('1024x1024.png').toString('base64') },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const request: PlanInput = {
      ...input(),
      routeName: modelId,
      provider: 'openai',
      tools: [
        {
          name: 'lookup',
          description: 'Read image metadata',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      ],
      messages: [
        message('system_reminder', 'Keep the image in history.', 'reminder'),
        visual,
        judgedMessage({
          type: 'assistant',
          id: 'old-assistant',
          createdAt: at,
          response: 'old-response',
          ending: 'complete',
          blocks: [
            {
              id: 'old-text',
              kind: 'text',
              text: 'Prior visible response',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        }),
        judgedMessage({
          type: 'user',
          id: 'new-user',
          createdAt: at,
          blocks: [
            {
              id: 'small-image',
              kind: 'image',
              mediaType: 'image/png',
              data: { inline: bytes('1x1.png').toString('base64') },
              visibility: { toHuman: true, toModel: true },
            },
          ],
        }),
      ],
      parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
      snapshot: {
        ...input().snapshot,
        ...definition.capabilities,
        adaptation: profile.ok.adaptation,
        providers: profile.ok.providers,
        allowFallback: false,
      },
      tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
    }
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          sse({
            model: modelId,
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
      inputMeters: [meter],
    })
    try {
      const rejected = await planRequest(
        { ...request, tokenMargin: { multiplier: 1, reserveTokens: 10000000 } },
        [definition],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      )
      expect(rejected).toMatchObject({ rejected: 'invalidInput', reason: 'input_limit_exceeded' })
      expect(host.requests).toHaveLength(0)
      const planned = await planRequest(
        request,
        [definition],
        meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      )
      if ('rejected' in planned) throw Error(JSON.stringify(planned))
      expect(planned.planned.measurement.mode).toBe('full')
      expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
      expect(planned.planned.inputLimitEvidence.images).toBe(2)
      const response = await invokeModel({
        ...request,
        transport,
        credential: 'local-only',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      if (!('outcome' in response)) throw Error(JSON.stringify(response))
      expect(response.outcome).toBe('complete')
      expect(response.inputCalibration.observedInput).toMatchObject(
        modelId.endsWith('-pro')
          ? { kind: 'unavailable', reason: 'scope_unknown' }
          : { kind: 'from_usage' },
      )
      expect(writeJsonLossless(response.usage.input_tokens)).toBe('9000')
      expect(writeJsonLossless(response.cost.cost_usd)).toBe('0.000123')
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]?.body).toBe(planned.planned.serialized)
      expect(host.requests[0]?.body).toContain(imageUrl('1024x1024.png'))
      expect(host.requests[0]?.body).toContain('"role":"developer"')
      expect(host.requests[0]?.body).toContain('Prior visible response')
      expect(host.requests[0]?.body).toContain('"name":"lookup"')
      expect(host.requests[0]?.body).toContain(imageUrl('1x1.png'))
    } finally {
      await transport.close()
      await host.close()
    }
  })
})
