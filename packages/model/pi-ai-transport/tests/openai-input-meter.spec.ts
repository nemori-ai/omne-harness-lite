import { directFull, directNew } from './direct-full-input.ts'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getEncoding } from 'js-tiktoken'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { createModelTransportService } from '../src/registry.ts'
import { planRequest } from '../src/plan.ts'
import {
  at,
  certificate,
  content,
  finish,
  fixture,
  judgedMessage,
  message,
  input as testInput,
  sse,
} from './support.ts'

const baseModel = 'openai/gpt-5.6-sol'
const baseModels = [baseModel, 'openai/gpt-5.6-terra', 'openai/gpt-5.6-luna']
const proModels = baseModels.map(id => `${id}-pro`)
const gpt6Models = [
  'openai/gpt-6-astra',
  'openai/gpt-6-astra-pro',
  'openai/gpt-6-sol',
  'openai/gpt-6-sol-pro',
  'openai/gpt-6-luna',
  'openai/gpt-6-luna-pro',
]
const image = (name: string) =>
  readFileSync(new URL(`./fixtures/openai-meter/${name}`, import.meta.url))
const url = (name: string) =>
  `data:image/${name.endsWith('.gif') ? 'gif' : 'png'};base64,${image(name).toString('base64')}`

function definition(modelId: string) {
  const found = openaiDefinitions.find(item => item.modelId === modelId)
  if (!found) throw new Error(`missing definition: ${modelId}`)
  return found
}

function measuredTokens(
  modelId: string,
  body: Parameters<ReturnType<typeof createOpenAiInputMeter>['measureFull']>[0]['body'],
) {
  const result = directFull(createOpenAiInputMeter(definition(modelId)), {
    body,
    serialized: writeJsonLossless(body),
  })
  if (result.kind !== 'estimated') throw new Error('expected estimated input')
  return Number(result.tokens)
}

function imageBody(modelId: string, imageUrl: string, detail?: string) {
  return {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image.' },
          { type: 'image_url', image_url: { url: imageUrl, ...(detail ? { detail } : {}) } },
        ],
      },
    ],
  }
}

describe('OpenAI model-specific input estimator', () => {
  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())
  it('matches independent OpenAI tiktoken 0.12.0 o200k_base vectors', () => {
    const encoding = getEncoding('o200k_base')
    expect(encoding.encode('Hello, 世界!')).toEqual([13225, 11, 185558, 0])
    expect(encoding.encode('{"role":"developer","content":"Remember the policy."}')).toEqual([
      10848, 8716, 7534, 77944, 4294, 3252, 7534, 43605, 290, 7562, 3692, 92,
    ])
    expect(encoding.encode('{"role":"tool","tool_call_id":"call_1","content":"sunny"}')).toEqual([
      10848, 8716, 7534, 17952, 4294, 17952, 25158, 1537, 7534, 9925, 62, 16, 4294, 3252, 7534,
      41133, 3008, 18583,
    ])
  })

  it('binds only six exact GPT-5.6 leaves and the fixed OpenAI provider', () => {
    for (const modelId of [...baseModels, ...proModels]) {
      const meter = createOpenAiInputMeter(definition(modelId))
      expect(meter).toMatchObject({
        modelId,
        provider: 'openai',
        definitionRevision: proModels.includes(modelId) ? '5' : '6',
      })
      expect(meter.algorithmRevision).toBe(
        proModels.includes(modelId)
          ? 'openai-gpt-5.6-o200k-base-4/response-calibration-1'
          : 'openai-gpt-5.6-o200k-base-complete-output-6/response-calibration-1',
      )
      expect(meter.algorithmRevision).toContain('gpt-5.6')
    }
    for (const modelId of gpt6Models)
      expect(createOpenAiInputMeter(definition(modelId))).toMatchObject({
        modelId,
        provider: 'openai',
      })
    expect(() => createOpenAiInputMeter({ ...definition(baseModel), revision: '2' })).toThrow(
      TypeError,
    )
    expect(() => createOpenAiInputMeter({ ...definition(baseModel), routes: {} })).toThrow(
      TypeError,
    )
  })

  it.each(baseModels)(
    '%s resizes oversized source images before full and delta measurement',
    modelId => {
      const meter = createOpenAiInputMeter(definition(modelId))
      const body = imageBody(modelId, url('65536x32.png'))
      const serialized = writeJsonLossless(body)
      // 65,536 × 32 fits to 65,535 × 31 (documented fit; local floor convention).
      // ceil(65,535 / 32) × ceil(31 / 32) × 1.2 rounds up to 2,458 tokens.
      const textTokens = getEncoding('o200k_base').encode(
        writeJsonLossless(imageBody(modelId, '[image]')),
      ).length
      expect(directFull(meter, { body, serialized })).toEqual({
        kind: 'estimated',
        tokens: textTokens + 2458,
      })
      const { messages, ...envelope } = body
      const emptyTokens = getEncoding('o200k_base').encode(
        writeJsonLossless({ ...envelope, messages: [] }),
      ).length
      const contribution = directNew(meter, { units: messages, envelope, precedingUnitCount: 2 })
      if (!('tokens' in contribution)) throw new Error('expected available delta')
      expect(ExactDecimal.from(contribution.tokens).toString()).toBe(
        String(textTokens + 2458 - emptyTokens),
      )
      expect(writeJsonLossless(body)).toBe(serialized)
      expect(() =>
        createOpenAiInputMeter({
          ...definition(modelId),
          revision: '5',
          implementation: { name: 'pi-ai:openai', revision: 'mp4-11' },
        }),
      ).toThrow(TypeError)
    },
  )

  it('estimates full multi-turn, developer, tools, results and reasoning contribution', () => {
    const modelId = baseModel
    const body = {
      model: modelId,
      provider: { order: ['openai'], allow_fallbacks: false, require_parameters: true },
      stream: true,
      store: false,
      reasoning: { effort: 'medium' },
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'You are a weather assistant.' }] },
        {
          role: 'developer',
          content: [{ type: 'text', text: 'Always cite the forecast source.' }],
        },
        { role: 'user', content: [{ type: 'text', text: 'What is the weather in Paris?' }] },
        {
          role: 'assistant',
          content: '',
          reasoning: 'Need the weather tool.',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'weather', arguments: '{"city":"Paris"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'Sunny, 22 C' },
        { role: 'user', content: [{ type: 'text', text: 'And tomorrow?' }] },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'weather',
            description: 'Read weather forecasts',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
          },
        },
      ],
    }
    const complete = measuredTokens(modelId, body)
    expect(complete).toBeGreaterThan(0)
    expect(
      measuredTokens(modelId, {
        ...body,
        messages: body.messages.filter(message => message.role !== 'developer'),
      }),
    ).not.toBe(complete)
    expect(measuredTokens(modelId, { ...body, tools: [] })).not.toBe(complete)
    expect(
      measuredTokens(modelId, {
        ...body,
        messages: body.messages.filter(message => message.role !== 'tool'),
      }),
    ).not.toBe(complete)
    const { reasoning: _reasoning, ...withoutReasoning } = body
    expect(measuredTokens(modelId, withoutReasoning)).not.toBe(complete)
    const meter = createOpenAiInputMeter(definition(modelId))
    expect(directFull(meter, { body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
  })

  it('applies official named-model image patch calculation; variants without a rule refuse images', () => {
    for (const modelId of baseModels) {
      const small = measuredTokens(modelId, imageBody(modelId, url('1x1.png')))
      const square = measuredTokens(modelId, imageBody(modelId, url('1024x1024.png')))
      // OpenAI's published 1024-square example is 1,229 tokens; 1x1 is ceil(1.2)=2.
      expect(square - small).toBe(1227)
    }
    for (const modelId of proModels) {
      const body = imageBody(modelId, url('1x1.png'))
      expect(
        directFull(createOpenAiInputMeter(definition(modelId)), {
          body,
          serialized: writeJsonLossless(body),
        }),
      ).toEqual({ kind: 'unavailable' })
      expect(
        measuredTokens(modelId, { model: modelId, messages: [{ role: 'user', content: 'hello' }] }),
      ).toBeGreaterThan(0)
    }
    const modelId = baseModel
    const remote = imageBody(modelId, 'https://example.invalid/a.png')
    const invalid = imageBody(modelId, 'data:image/png;base64,eA==')
    const meter = createOpenAiInputMeter(definition(modelId))
    expect(directFull(meter, { body: remote, serialized: writeJsonLossless(remote) })).toEqual({
      kind: 'unavailable',
    })
    expect(directFull(meter, { body: invalid, serialized: writeJsonLossless(invalid) })).toEqual({
      kind: 'unavailable',
    })
  })

  it('uses independent OpenAI patch examples and low/high sizing limits', () => {
    for (const modelId of baseModels) {
      const high = measuredTokens(modelId, imageBody(modelId, url('1024x1024.png'), 'high'))
      const highBudget = measuredTokens(modelId, imageBody(modelId, url('2048x2048.png'), 'high'))
      const highRect = measuredTokens(modelId, imageBody(modelId, url('2048x1536.png'), 'high'))
      const low = measuredTokens(modelId, imageBody(modelId, url('1024x1024.png'), 'low'))
      const smallHigh = measuredTokens(modelId, imageBody(modelId, url('1x1.png'), 'high'))
      const smallLow = measuredTokens(modelId, imageBody(modelId, url('1x1.png'), 'low'))
      const noImage = measuredTokens(modelId, {
        model: modelId,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Describe this image.' }] }],
      })
      expect(high - smallHigh).toBe(1227)
      expect(highBudget - smallHigh).toBe(2998)
      // 2048x1536 first fits exactly; the 2500-patch shrink gives 1824x1368,
      // 2451 patches and 2942 image tokens.
      expect(highRect - smallHigh).toBe(2940)
      expect(low - smallLow).toBe(306)
      expect(low).toBeGreaterThan(noImage)
      const unsupported = imageBody(modelId, url('1x1.png'), 'ultra')
      expect(
        directFull(createOpenAiInputMeter(definition(modelId)), {
          body: unsupported,
          serialized: writeJsonLossless(unsupported),
        }),
      ).toEqual({ kind: 'unavailable' })
      // Non-integral 2048-pixel fit exercises this estimate's stated floor convention.
      const fractionalFit = measuredTokens(
        modelId,
        imageBody(modelId, url('2049x2903.png'), 'high'),
      )
      expect(fractionalFit - smallHigh).toBe(2901)
    }
  })

  it('meters a single-frame GIF and refuses animated or incomplete GIF data', () => {
    const modelId = baseModel
    const singleFrame = imageBody(modelId, url('single-frame.gif'), 'low')
    expect(measuredTokens(modelId, singleFrame)).toBe(
      measuredTokens(modelId, imageBody(modelId, url('1x1.png'), 'low')),
    )
    const meter = createOpenAiInputMeter(definition(modelId))
    for (const name of ['two-frame.gif', 'truncated.gif']) {
      const body = imageBody(modelId, url(name), 'low')
      expect(directFull(meter, { body, serialized: writeJsonLossless(body) })).toEqual({
        kind: 'unavailable',
      })
    }
  })

  it('admits a real projected developer reminder and image, with external margin and exact bytes', () => {
    const selected = definition(baseModel)
    const profile = createOfficialProfileContent(selected, {
      providers: ['openai'],
      allowFallback: false,
      configuration: openaiConfiguration,
    })
    if ('rejected' in profile) throw new Error(profile.rejected)
    const request = testInput()
    const inline = image('1024x1024.png')
    const visual = judgedMessage({
      type: 'user',
      id: 'visual',
      createdAt: at,
      blocks: [
        {
          id: 'visual-text',
          kind: 'text',
          text: 'Describe this image',
          visibility: { toHuman: true, toModel: true },
        },
        {
          id: 'visual-image',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: inline.toString('base64') },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const input = {
      ...request,
      routeName: selected.modelId,
      provider: 'openai',
      calibration: { kind: 'none' as const, reason: 'no_observation' as const },
      tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
      messages: [...request.messages, visual],
      snapshot: {
        ...request.snapshot,
        adaptation: profile.ok.adaptation,
        providers: profile.ok.providers,
        allowFallback: profile.ok.allowFallback,
        inputModalities: profile.ok.inputModalities,
        outputModalities: profile.ok.outputModalities,
        maxInputTokens: profile.ok.maxInputTokens,
        maxOutputTokens: profile.ok.maxOutputTokens,
        inputConstraints: profile.ok.inputConstraints,
        upstreamInputLimits: profile.ok.upstreamInputLimits,
      },
    }
    const meter = createOpenAiInputMeter(selected)
    const planned = planRequest(input, [selected], meter)
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    expect(planned.planned.body.messages).toContainEqual({
      role: 'developer',
      content: [
        { type: 'text', text: '[system_reminder "system_reminder"]' },
        { type: 'text', text: 'keep going' },
      ],
    })
    expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(planned.planned.inputLimitEvidence.images).toBe(1)
    expect(planned.planned.inputLimitEvidence.imageBytes).toEqual([inline.length])
    expect(planned.planned.inputLimitEvidence.requestBytes).toBe(
      Buffer.byteLength(planned.planned.serialized),
    )
    const refused = planRequest(
      { ...input, tokenMargin: { multiplier: 1, reserveTokens: 922000 } },
      [selected],
      meter,
    )
    expect(refused).toMatchObject({
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'estimated',
      metric: 'maxInputTokens',
    })
  })

  it.each([...baseModels, ...proModels])(
    '%s sends visible reasoning and tool history with the real meter through the public factory',
    async modelId => {
      const selected = definition(modelId)
      const meter = createOpenAiInputMeter(selected)
      const profile = createOfficialProfileContent(selected, {
        providers: ['openai'],
        allowFallback: false,
        configuration: openaiConfiguration,
      })
      if ('rejected' in profile) throw new Error(profile.rejected)
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            content('ok') +
              sse({
                choices: [],
                usage: {
                  prompt_tokens: 240,
                  completion_tokens: 2,
                  prompt_tokens_details: { cached_tokens: 20 },
                },
              }) +
              finish(),
          ),
        {},
        undefined,
        [selected],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [selected],
        inputMeters: [meter],
      })
      try {
        const original = testInput()
        const previousAssistant = judgedMessage({
          id: 'opaque-assistant',
          type: 'assistant',
          response: 'opaque-response',
          ending: 'complete',
          createdAt: at,
          blocks: [
            {
              id: 'opaque-thinking',
              kind: 'thinking',
              text: '',
              opaque: {
                routeName: selected.modelId,
                reasoning_details: [
                  { type: 'reasoning.text', text: 'Need the forecast.', index: 0 },
                  { type: 'reasoning.summary', summary: 'Use the weather tool.', index: 1 },
                ],
              },
              visibility: { toHuman: false, toModel: true },
            },
            {
              id: 'opaque-call',
              kind: 'tool_call',
              callId: 'call with spaces',
              tool: 'lookup',
              complete: true,
              unparseable: true,
              rawArguments: '{"city":"Paris"}',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        })
        const previousTool = judgedMessage({
          id: 'opaque-result',
          type: 'tool',
          callId: 'call with spaces',
          createdAt: at,
          blocks: [
            {
              id: 'opaque-result-block',
              kind: 'tool_result',
              callId: 'call with spaces',
              outcome: 'completed',
              visibility: { toHuman: true, toModel: true },
              blocks: [
                {
                  id: 'opaque-result-text',
                  kind: 'text',
                  text: 'Sunny in Paris',
                  visibility: { toHuman: true, toModel: true },
                },
              ],
            },
          ],
        })
        const visual = judgedMessage({
          id: 'single-frame-visual',
          type: 'user',
          createdAt: at,
          blocks: [
            {
              id: 'single-frame-image',
              kind: 'image',
              mediaType: 'image/gif',
              data: { inline: image('single-frame.gif').toString('base64') },
              visibility: { toHuman: true, toModel: true },
            },
          ],
        })
        const input = {
          ...original,
          routeName: selected.modelId,
          provider: 'openai',
          calibration: { kind: 'none' as const, reason: 'no_observation' as const },
          tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
          parameters: { reasoningEffort: 'medium' as const, maxOutputTokens: 64 },
          tools: [
            {
              name: 'lookup',
              description: 'Look up a forecast',
              parameters: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
                additionalProperties: false,
              },
            },
          ],
          messages: [
            ...original.messages,
            previousAssistant,
            previousTool,
            message('user', 'And tomorrow?', 'tomorrow'),
            ...(!modelId.endsWith('-pro') ? [visual] : []),
          ],
          snapshot: {
            ...original.snapshot,
            adaptation: profile.ok.adaptation,
            providers: profile.ok.providers,
            allowFallback: profile.ok.allowFallback,
            inputModalities: profile.ok.inputModalities,
            outputModalities: profile.ok.outputModalities,
            maxInputTokens: profile.ok.maxInputTokens,
            maxOutputTokens: profile.ok.maxOutputTokens,
            inputConstraints: profile.ok.inputConstraints,
            upstreamInputLimits: profile.ok.upstreamInputLimits,
          },
        }
        const planned = transport.plan(input)
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
        expect(planned.planned.serialized).toContain('"reasoning_details"')
        expect(planned.planned.serialized).toContain('Need the forecast.')
        expect(planned.planned.serialized).toContain('Use the weather tool.')
        expect(planned.planned.serialized).toContain('"tool_calls"')
        expect(planned.planned.serialized).toContain('"tool_call_id"')
        expect(planned.planned.serialized).toContain('"tools"')
        expect(planned.planned.inputLimitEvidence.images).toBe(modelId.endsWith('-pro') ? 0 : 1)
        expect(planned.planned.serialized.includes('"image_url"')).toBe(!modelId.endsWith('-pro'))
        if (!modelId.endsWith('-pro')) {
          const animated = judgedMessage({
            id: 'animated-visual',
            type: 'user',
            createdAt: at,
            blocks: [
              {
                id: 'animated-image',
                kind: 'image',
                mediaType: 'image/gif',
                data: { inline: image('two-frame.gif').toString('base64') },
                visibility: { toHuman: true, toModel: true },
              },
            ],
          })
          expect(
            transport.plan({ ...input, messages: [...original.messages, animated] }),
          ).toMatchObject({
            rejected: 'invalidInput',
            reason: 'input_size_unavailable',
            metrics: ['maxInputTokens'],
          })
        }
        const foreignThinking = judgedMessage({
          id: 'foreign-assistant',
          type: 'assistant',
          response: 'foreign-response',
          ending: 'complete',
          createdAt: at,
          blocks: [
            {
              id: 'foreign-thinking',
              kind: 'thinking',
              text: '',
              opaque: {
                routeName: gpt6Models[0],
                reasoning_details: [{ type: 'reasoning.encrypted', data: 'foreign-fixture' }],
              },
              visibility: { toHuman: false, toModel: true },
            },
          ],
        })
        const foreign = transport.plan({
          ...input,
          messages: [...original.messages, foreignThinking],
        })
        if ('rejected' in foreign) throw new Error(JSON.stringify(foreign))
        expect(foreign.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
        expect(foreign.planned.serialized).not.toContain('reasoning_details')
        expect(foreign.planned.serialized).not.toContain('foreign-fixture')
        expect(host.requests).toHaveLength(0)
        const signal = new AbortController().signal
        const sent = await transport.send(planned.planned, 'controlled-test-credential', signal)
        if (!('response' in sent)) throw new Error(JSON.stringify(sent))
        const events = []
        for await (const event of transport.read(sent.response, planned.planned, signal))
          events.push(event)
        expect(events).toContainEqual(expect.objectContaining({ t: 'account' }))
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(planned.planned.serialized)
        expect(host.requests[0]?.body).toContain('"role":"developer"')
        expect(host.requests[0]?.body).toContain('"reasoning":{"effort":"medium"}')
        expect(host.requests[0]?.body).toContain('"reasoning_details"')
        expect(host.requests[0]?.body).not.toContain('cache_control')
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )

  it.each([...baseModels, ...proModels])(
    '%s serves the same bound meter and final wire through a service lease',
    async modelId => {
      const selected = definition(modelId)
      const meter = createOpenAiInputMeter(selected)
      const profile = createOfficialProfileContent(selected, {
        providers: ['openai'],
        allowFallback: false,
        configuration: openaiConfiguration,
      })
      if ('rejected' in profile) throw new Error(profile.rejected)
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            content('ready') +
              sse({ choices: [], usage: { prompt_tokens: 48, completion_tokens: 1 } }) +
              finish(),
          ),
        {},
        undefined,
        [selected],
      )
      const service = createModelTransportService(host.options)
      let lease: ReturnType<typeof service.acquire> | undefined
      try {
        const registered = service.registerAdaptation(selected, meter, {}, () => {})
        if ('rejected' in registered) throw new Error(registered.rejected)
        const request = testInput()
        const input = {
          ...request,
          routeName: modelId,
          provider: 'openai',
          calibration: { kind: 'none' as const, reason: 'no_observation' as const },
          tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
          snapshot: {
            ...request.snapshot,
            adaptation: profile.ok.adaptation,
            providers: profile.ok.providers,
            allowFallback: profile.ok.allowFallback,
            inputModalities: profile.ok.inputModalities,
            outputModalities: profile.ok.outputModalities,
            maxInputTokens: profile.ok.maxInputTokens,
            maxOutputTokens: profile.ok.maxOutputTokens,
            inputConstraints: profile.ok.inputConstraints,
            upstreamInputLimits: profile.ok.upstreamInputLimits,
          },
        }
        lease = service.acquire(input.snapshot.adaptation, modelId)
        if ('rejected' in lease) throw new Error(lease.rejected)
        const unsupportedImage = modelId.endsWith('-pro') ? '1x1.png' : 'two-frame.gif'
        const visual = judgedMessage({
          id: 'service-unavailable-image',
          type: 'user',
          createdAt: at,
          blocks: [
            {
              id: 'service-unavailable-image-block',
              kind: 'image',
              mediaType: unsupportedImage.endsWith('.gif') ? 'image/gif' : 'image/png',
              data: { inline: image(unsupportedImage).toString('base64') },
              visibility: { toHuman: true, toModel: true },
            },
          ],
        })
        expect(
          lease.lease.transport.plan({ ...input, messages: [...input.messages, visual] }),
        ).toMatchObject({
          rejected: 'invalidInput',
          reason: 'input_size_unavailable',
          metrics: ['maxInputTokens'],
        })
        expect(host.requests).toHaveLength(0)
        const planned = lease.lease.transport.plan(input)
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
        const signal = new AbortController().signal
        const sent = await lease.lease.transport.send(
          planned.planned,
          'controlled-service-credential',
          signal,
        )
        if (!('response' in sent)) throw new Error(JSON.stringify(sent))
        const events = []
        for await (const event of lease.lease.transport.read(
          sent.response,
          planned.planned,
          signal,
        ))
          events.push(event)
        expect(events).toContainEqual(expect.objectContaining({ t: 'account' }))
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(planned.planned.serialized)
      } finally {
        if (lease && 'lease' in lease) lease.lease.release()
        await service.close({
          force: false,
          waitMilliseconds: 20,
          schedule(ms, callback) {
            const timer = setTimeout(callback, ms)
            return () => clearTimeout(timer)
          },
        })
        await service.closed
        await host.close()
      }
    },
  )
})
