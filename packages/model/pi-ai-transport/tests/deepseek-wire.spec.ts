import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { invokeModel } from '@omne-harness-lite/model-request-runtime'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { createPiAiTransport } from '../src/transport.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createDeepSeekV4ProInputMeter } from '../src/input-meters/deepseek-v4-pro.ts'
import { createDeepSeekV41FlashInputMeter } from '../src/input-meters/deepseek-v41-flash.ts'
import {
  deepseekV4Pro0813Configuration,
  deepseekV4Pro0813Definition,
  deepseekV41FlashConfiguration,
  deepseekV41FlashDefinition,
} from '../src/official-models/deepseek.ts'
import type { InputMeter } from '../src/input-meter.ts'
import type { ModelDefinition } from '../src/definitions.ts'
import { object } from '../src/json.ts'
import { at, certificate, finish, fixture, input, judgedMessage, policy, sse } from './support.ts'

const provider = 'deepinfra/fp8'
const visible = { toHuman: true, toModel: true }
const tool: ModelToolEntry = {
  name: 'lookup__exact',
  description: 'Look up an exact value',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
}
const routes = [
  {
    definition: deepseekV4Pro0813Definition,
    configuration: deepseekV4Pro0813Configuration,
    meter: createDeepSeekV4ProInputMeter,
  },
  {
    definition: deepseekV41FlashDefinition,
    configuration: deepseekV41FlashConfiguration,
    meter: createDeepSeekV41FlashInputMeter,
  },
] as const

function request(
  definition: ModelDefinition,
  configuration: typeof deepseekV4Pro0813Configuration,
) {
  const profile = createOfficialProfileContent(definition, {
    providers: [provider],
    allowFallback: false,
    configuration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const base = input()
  const assistant = judgedMessage({
    type: 'assistant',
    id: 'deepseek-tool-call',
    response: 'deepseek-response',
    ending: 'complete',
    createdAt: at,
    blocks: [
      { id: 'reasoning', kind: 'thinking', text: 'Need lookup', visibility: visible },
      {
        id: 'call',
        kind: 'tool_call',
        callId: 'lookup-1',
        tool: tool.name,
        complete: true,
        arguments: { query: 'x' },
        visibility: visible,
      },
    ],
  })
  const result = judgedMessage({
    type: 'tool',
    id: 'deepseek-tool-result',
    callId: 'lookup-1',
    createdAt: at,
    blocks: [
      {
        id: 'result',
        kind: 'tool_result',
        callId: 'lookup-1',
        outcome: 'completed',
        visibility: visible,
        blocks: [{ id: 'value', kind: 'text', text: 'value=42', visibility: visible }],
      },
    ],
  })
  return {
    ...base,
    routeName: definition.modelId,
    provider,
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
    parameters: { reasoningEffort: 'low' as const, maxOutputTokens: 64 },
    messages: [...base.messages, assistant, result],
    tools: [tool],
    snapshot: {
      ...base.snapshot,
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
}

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe('DeepSeek official meters through public HTTPS transport', () => {
  it.each(routes)(
    '$definition.modelId sends complete tool history and retains upstream usage',
    async route => {
      const host = await fixture(
        cert.tls,
        response => {
          response.writeHead(200, { 'content-type': 'text/event-stream' })
          response.end(
            sse({ choices: [{ delta: { content: 'Done.' } }] }) +
              sse({
                choices: [],
                usage: {
                  prompt_tokens: 100,
                  completion_tokens: 3,
                  prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 0 },
                },
              }) +
              finish(),
          )
        },
        {},
        undefined,
        [route.definition],
      )
      const meter: InputMeter = route.meter(route.definition)
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [route.definition],
        inputMeters: [meter],
      })
      try {
        const result = await invokeModel({
          ...request(route.definition, route.configuration),
          transport,
          credential: 'offline-test-credential',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        if (!('outcome' in result)) throw new Error(JSON.stringify(result))
        expect(result.outcome).toBe('complete')
        expect(result.blocks).toMatchObject([{ kind: 'text', text: 'Done.' }])
        if (result.usage.input_tokens === 'unknown') throw new Error('usage input is unknown')
        expect(ExactDecimal.from(result.usage.input_tokens).compare(ExactDecimal.from(80))).toBe(0)
        expect(writeJsonLossless(result.usage)).toContain('"cache_write_tokens":0')
        expect(host.requests).toHaveLength(1)
        const sent = host.requests[0]
        if (!sent) throw new Error('missing captured request')
        const parsed = readJsonStrict(sent.body)
        if (!('ok' in parsed)) throw new Error('invalid fixed wire body')
        expect(parsed.ok).toMatchObject({
          model: route.definition.modelId,
          provider: { order: [provider], allow_fallbacks: false, require_parameters: true },
          reasoning: { effort: 'low' },
          max_tokens: 64,
          messages: [
            { role: 'system' },
            { role: 'user' },
            { role: 'user' },
            {
              role: 'assistant',
              tool_calls: [
                { id: 'lookup-1', function: { name: tool.name, arguments: '{"query":"x"}' } },
              ],
            },
            { role: 'tool', tool_call_id: 'lookup-1', content: 'value=42' },
          ],
        })
        expect(sent.body).not.toContain('cache_control')
        expect(sent.body).not.toContain('"ttl"')
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )

  it('sends both prior and current Flash images without stripping the intervening turns', async () => {
    const definition = deepseekV41FlashDefinition
    const host = await fixture(
      cert.tls,
      response => {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end(
          sse({ choices: [{ delta: { content: 'The first is red and the second is blue.' } }] }) +
            sse({
              choices: [],
              usage: {
                prompt_tokens: 900,
                completion_tokens: 12,
                prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
              },
            }) +
            finish(),
        )
      },
      {},
      undefined,
      [definition],
    )
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createDeepSeekV41FlashInputMeter(definition)],
    })
    const red = readFileSync(
      new URL('./fixtures/deepseek-v41-flash/public-red-544.png', import.meta.url),
    )
    const blue = readFileSync(
      new URL('./fixtures/deepseek-v41-flash/public-blue-1024.png', import.meta.url),
    )
    const imageTurn = (id: string, bytes: Buffer, text: string) =>
      judgedMessage({
        type: 'user',
        id,
        createdAt: at,
        blocks: [
          { id: `${id}-text`, kind: 'text', text, visibility: visible },
          {
            id: `${id}-image`,
            kind: 'image',
            mediaType: 'image/png',
            data: { inline: bytes.toString('base64') },
            visibility: visible,
          },
        ],
      })
    const earlier = imageTurn('earlier-red', red, 'Remember this first image.')
    const intervening = judgedMessage({
      type: 'assistant',
      id: 'intervening-answer',
      response: 'earlier-response',
      ending: 'complete',
      createdAt: at,
      blocks: [{ id: 'answer', kind: 'text', text: 'I saw red.', visibility: visible }],
    })
    const current = imageTurn('current-blue', blue, 'Compare this second image with the first.')
    const base = request(definition, deepseekV41FlashConfiguration)
    const plannedInput = {
      ...base,
      messages: [...base.messages, earlier, intervening, current],
    }
    try {
      const planned = transport.plan(plannedInput)
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.inputLimitEvidence.images).toBe(2)
      expect(planned.planned.inputLimitEvidence.imageBytes).toEqual([red.length, blue.length])
      expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
      const result = await invokeModel({
        ...plannedInput,
        transport,
        credential: 'offline-test-credential',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      if (!('outcome' in result)) throw new Error(JSON.stringify(result))
      expect(result.outcome).toBe('complete')
      expect(result.blocks).toMatchObject([
        { kind: 'text', text: 'The first is red and the second is blue.' },
      ])
      expect(host.requests).toHaveLength(1)
      const sent = host.requests[0]
      if (!sent) throw new Error('missing captured request')
      expect(sent.body).toBe(planned.planned.serialized)
      const parsed = readJsonStrict(sent.body)
      if (!('ok' in parsed) || !object(parsed.ok) || !Array.isArray(parsed.ok.messages))
        throw new Error('invalid captured messages')
      const messages = parsed.ok.messages
      expect(messages.slice(-3)).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Remember this first image.' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${red.toString('base64')}` },
            },
          ],
        },
        { role: 'assistant', content: 'I saw red.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Compare this second image with the first.' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${blue.toString('base64')}` },
            },
          ],
        },
      ])
      if (result.usage.input_tokens === 'unknown') throw new Error('usage input is unknown')
      expect(ExactDecimal.from(result.usage.input_tokens).compare(ExactDecimal.from(900))).toBe(0)
    } finally {
      await transport.close()
      await host.close()
    }
  })
})
