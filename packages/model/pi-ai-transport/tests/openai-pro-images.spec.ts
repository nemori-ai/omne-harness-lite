import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { planRequest } from '../src/plan.ts'
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
  'openai/gpt-6-astra-pro',
  'openai/gpt-5.6-sol-pro',
  'openai/gpt-5.6-terra-pro',
  'openai/gpt-5.6-luna-pro',
]
const bytes = (name: string) =>
  readFileSync(new URL(`./fixtures/openai-meter/${name}`, import.meta.url))
const imageUrl = (name: string) =>
  `data:image/${name.endsWith('.gif') ? 'gif' : 'png'};base64,${bytes(name).toString('base64')}`

// These assert the frozen surrogate, not the private Pro preprocessor's accuracy.
describe.each(models)('%s base-image estimated proxy', modelId => {
  const astra = modelId === 'openai/gpt-6-astra-pro'
  const definition = openaiDefinitions.find(item => item.modelId === modelId)!
  const meter = createOpenAiInputMeter(definition)
  function measured(name: string, detail: string | undefined = undefined) {
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
  it('requires the new binding and records the inference as estimated', () => {
    expect(definition).toMatchObject({
      revision: astra ? '5' : '7',
      implementation: { revision: 'mp4-17' },
    })
    expect(meter.algorithmRevision).toBe(
      astra
        ? 'openai-gpt-6-astra-pro-final-visible-json-o200k-image-proxy-1/response-calibration-1'
        : 'openai-gpt-5.6-pro-base-image-proxy-1/response-calibration-1',
    )
    expect(meter.evidence).toContain('not verified Pro preprocessing')
    expect(() =>
      createOpenAiInputMeter({
        ...definition,
        revision: astra ? '3' : '5',
        implementation: { name: 'pi-ai:openai', revision: astra ? 'mp4-8' : 'mp4-7' },
      }),
    ).toThrow('unsupported OpenAI')
  })
  it.each([
    ['low', 229],
    ['high', 2940],
    ['original', 3685],
    ['auto', 3685],
    [undefined, 3685],
  ] as const)('keeps detail %s numeric patch goldens (%s net)', (detail, expected) => {
    const large = measured('2048x1536.png', detail)
    const small = measured('1x1.png', detail)
    expect(large.kind).toBe('estimated')
    expect(small.kind).toBe('estimated')
    if (large.kind !== 'estimated' || small.kind !== 'estimated') throw Error('missing estimate')
    expect(Number(large.tokens) - Number(small.tokens)).toBe(expected)
  })
  it('keeps Astra and GPT-5.6 high-detail fit limits separate', () => {
    const wide = measured('65536x32.png', 'high')
    const small = measured('1x1.png', 'high')
    if (wide.kind !== 'estimated' || small.kind !== 'estimated') throw Error('missing estimate')
    // Astra fits to 65535 x 31 (2048 patches); GPT-5.6 to 2048 x 1 (64 patches).
    expect(Number(wide.tokens) - Number(small.tokens)).toBe(astra ? 2456 : 75)
  })
  it('accepts a complete single-frame GIF and refuses animated, truncated and unknown detail input', () => {
    expect(measured('single-frame.gif', 'low')).toEqual(measured('1x1.png', 'low'))
    expect(measured('two-frame.gif')).toEqual({ kind: 'unavailable' })
    expect(measured('truncated.gif')).toEqual({ kind: 'unavailable' })
    expect(measured('1x1.png', 'ultra')).toEqual({ kind: 'unavailable' })
  })
  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())
  it('uses the public invocation unchanged wire and actual accounts, without creating an input anchor', async () => {
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
      messages: [message('system_reminder', 'Keep the image in history.', 'reminder'), visual],
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
      const rejected = planRequest(
        { ...request, tokenMargin: { multiplier: 1, reserveTokens: 10000000 } },
        [definition],
        meter,
      )
      expect(rejected).toMatchObject({ rejected: 'invalidInput', reason: 'input_limit_exceeded' })
      expect(host.requests).toHaveLength(0)
      const planned = planRequest(request, [definition], meter)
      if ('rejected' in planned) throw Error(JSON.stringify(planned))
      expect(planned.planned.measurement.mode).toBe('full')
      expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
      expect(planned.planned.inputLimitEvidence.images).toBe(1)
      const response = await invokeModel({
        ...request,
        transport,
        credential: 'local-only',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      if (!('outcome' in response)) throw Error(JSON.stringify(response))
      expect(response.outcome).toBe('complete')
      expect(response.inputCalibration.observedInput).toEqual({
        kind: 'unavailable',
        reason: 'scope_unknown',
      })
      expect(writeJsonLossless(response.usage.input_tokens)).toBe('9000')
      expect(writeJsonLossless(response.cost.cost_usd)).toBe('0.000123')
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]?.body).toBe(planned.planned.serialized)
      expect(host.requests[0]?.body).toContain(imageUrl('1024x1024.png'))
      expect(host.requests[0]?.body).toContain('"role":"developer"')
    } finally {
      await transport.close()
      await host.close()
    }
  })
})
