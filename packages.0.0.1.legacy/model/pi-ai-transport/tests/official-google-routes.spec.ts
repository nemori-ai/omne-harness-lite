import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { planRequest } from './synthetic-input-meter.ts'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
} from '@omne-harness-lite/pi-ai-transport'
import { type ModelDefinition, type ModelRoute } from '@omne-harness-lite/model-request-runtime'
import { gemini37FlashRoutes, gemini38FlashRoutes } from '../src/official-models/google.ts'
import { certificate, content, finish, fixture as httpsFixture } from './support.ts'

const at = '2026-09-28T00:00:00Z'
const variants = [
  ['3.8', gemini38FlashRoutes],
  ['3.7', gemini37FlashRoutes],
] as const
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

function member(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' && key in value
    ? Reflect.get(value, key)
    : undefined
}

function fixture(version: string, routes: Readonly<Record<string, ModelRoute>>): ModelDefinition {
  return {
    modelId: `fixture/google-${version}`,
    revision: 'fixture-1',
    implementation: { name: 'pi-ai:google-route-test', revision: '1' },
    // Invented text-only capacities are confined to offline wire tests. They
    // are not the confirmed Gemini multimodal profile or upstream limits.
    capabilities: {
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 1024,
      maxOutputTokens: 128,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
    },
    routes,
  }
}

function message(type: 'system' | 'system_reminder' | 'user'): Message {
  const judged = judgeMessage({
    id: type,
    type,
    createdAt: at,
    ...(type === 'system_reminder'
      ? { nature: 'event', source: { kind: 'extension', extension: 'transport-business-reminder' } }
      : {}),
    blocks: [
      {
        id: `${type}-text`,
        kind: 'text',
        text: type,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if ('rejected' in judged) throw new Error(judged.rejected)
  return judged.ok
}

async function request(
  version: string,
  routes: Readonly<Record<string, ModelRoute>>,
  provider: string,
  parameters: ModelRequestParameters = {},
  messages: readonly Message[] = [message('system'), message('system_reminder'), message('user')],
) {
  const definition = fixture(version, routes)
  const configuration = { revision: 'fixture-1', values: { cache: { mode: 'automatic' } } }
  const profile = createOfficialProfileContent(definition, {
    providers: [provider],
    allowFallback: false,
    configuration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const input: PlanInput = {
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    outputHistory: [],
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('google-test-call', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: definition.modelId,
    provider,
    snapshot: {
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
      updatedAt: at,
    },
    parameters,
    messages,
    tools: [],
  }
  return { definition, input, result: await planRequest(input, [definition]) }
}

describe('Google Flash routes (synthetic offline fixture, no official profile)', () => {
  it.each(variants)(
    '%s has precisely the two evidenced OpenRouter provider slugs',
    (version, routes) => {
      expect(Object.keys(routes).sort()).toEqual(['google-ai-studio', 'google-vertex'])
      expect(
        readModelDefinition([fixture(version, routes)], {
          implementation: { name: 'pi-ai:google-route-test', revision: '1' },
          definition: { modelId: `fixture/google-${version}`, revision: 'fixture-1' },
        }),
      ).toHaveProperty('ok')
    },
  )

  for (const [version, routes] of variants) {
    for (const provider of ['google-ai-studio', 'google-vertex']) {
      it(`${version} on ${provider} sends user reminder, exact provider and automatic cache`, async () => {
        const { definition, result } = await request(version, routes, provider)
        expect(
          interpretConfiguration(definition, { cache: { mode: 'automatic' } }, provider),
        ).toEqual({
          ok: { mode: 'automatic' },
        })
        for (const cache of [
          { mode: 'explicit', ttl: '5m', breakpoints: ['system'] },
          { mode: 'automatic', ttl: '5m' },
          { mode: 'automatic', breakpoints: ['last_message'] },
        ])
          expect(interpretConfiguration(definition, { cache }, provider)).toEqual({
            rejected: 'invalidInput',
          })
        const schema = configurationSchema(definition, provider)
        if ('rejected' in schema) throw new Error(schema.rejected)
        expect(JSON.stringify(schema.ok)).not.toContain('default')
        if ('rejected' in result) throw new Error(result.rejected)
        expect(result.planned.body.provider).toEqual({
          order: [provider],
          allow_fallbacks: false,
          require_parameters: true,
        })
        expect(result.planned.body.messages).toEqual([
          { role: 'system', content: [{ type: 'text', text: 'system' }] },
          {
            role: 'user',
            content: [
              { type: 'text', text: '[system_reminder "system_reminder"]' },
              { type: 'text', text: 'system_reminder' },
            ],
          },
          { role: 'user', content: [{ type: 'text', text: 'user' }] },
        ])
        expect(result.planned.serialized).not.toContain('cache_control')
        expect(result.planned.serialized).not.toContain('ttl')
      })

      it(`${version} on ${provider} passes only declared efforts and unchanged output count`, async () => {
        for (const effort of ['low', 'medium', 'high'] as const) {
          const { result } = await request(version, routes, provider, {
            reasoningEffort: effort,
            maxOutputTokens: 64,
          })
          if ('rejected' in result) throw new Error(result.rejected)
          expect(result.planned.parameters).toEqual({
            reasoningEffort: effort,
            maxOutputTokens: 64,
          })
          expect(result.planned.body.reasoning).toEqual({ effort })
          expect(result.planned.body.max_tokens).toBe(64)
        }
        const { result } = await request(version, routes, provider, {
          reasoningEffort: 'none',
          temperature: 0.5,
          topP: 0.5,
          seed: 1,
          stopSequences: ['END'],
          frequencyPenalty: 1,
          presencePenalty: 1,
          extra: { unknown: true },
        })
        if ('rejected' in result) throw new Error(result.rejected)
        expect(result.planned.parameters).toEqual({})
        expect(result.planned.droppedParameters).toEqual([
          'reasoningEffort',
          'temperature',
          'topP',
          'seed',
          'stopSequences',
          'frequencyPenalty',
          'presencePenalty',
          'unknown',
        ])
        expect(result.planned.body).not.toHaveProperty('reasoning')
        expect(result.planned.body).not.toHaveProperty('temperature')
        expect(result.planned.body).not.toHaveProperty('top_p')
      })
    }
  }

  it('keeps assistant tool calls and reasoning paired for replay on either Flash model', async () => {
    const assistant = judgeMessage({
      id: 'assistant-1',
      type: 'assistant',
      response: 'response-1',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'thinking-1',
          kind: 'thinking',
          text: 'consider the lookup',
          visibility: { toHuman: false, toModel: true },
        },
        {
          id: 'call-1',
          kind: 'tool_call',
          callId: 'google tool call',
          tool: 'lookup',
          complete: true,
          arguments: { key: 'x' },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const tool = judgeMessage({
      id: 'tool-1',
      type: 'tool',
      callId: 'google tool call',
      createdAt: at,
      blocks: [
        {
          id: 'result-1',
          kind: 'tool_result',
          callId: 'google tool call',
          outcome: 'completed',
          visibility: { toHuman: true, toModel: true },
          blocks: [
            {
              id: 'result-text',
              kind: 'text',
              text: 'found',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
      ],
    })
    if ('rejected' in assistant || 'rejected' in tool) throw new Error('invalid replay fixture')
    for (const [version, routes] of variants) {
      const { definition, input, result } = await request(version, routes, 'google-ai-studio', {}, [
        assistant.ok,
        tool.ok,
      ])
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.planned.body.messages).toMatchObject([
        {
          role: 'assistant',
          reasoning: 'consider the lookup',
          tool_calls: [{ id: expect.stringMatching(/^call_/), function: { name: 'lookup' } }],
        },
        { role: 'tool', tool_call_id: expect.stringMatching(/^call_/), content: 'found' },
      ])
      const wireMessages = result.planned.body.messages
      if (!Array.isArray(wireMessages)) throw new Error('planned messages missing')
      const wireCalls = member(wireMessages[0], 'tool_calls')
      if (!Array.isArray(wireCalls)) throw new Error('planned tool calls missing')
      expect(member(wireCalls[0], 'id')).toBe(member(wireMessages[1], 'tool_call_id'))
      expect(await planRequest({ ...input, messages: [assistant.ok] }, [definition])).toEqual({
        rejected: 'orphan_tool_call',
      })
    }
  })

  it('rejects an unlisted provider and a request above the fixture profile limit', async () => {
    const { definition, input } = await request('3.8', gemini38FlashRoutes, 'google-ai-studio')
    expect(await planRequest({ ...input, provider: 'google-vertex/flex' }, [definition])).toEqual({
      rejected: 'unavailable',
    })
    expect(
      await planRequest({ ...input, parameters: { maxOutputTokens: 129 } }, [definition]),
    ).toEqual({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
  })

  it.each([
    ['3.8', gemini38FlashRoutes, 'google-vertex'],
    ['3.7', gemini37FlashRoutes, 'google-ai-studio'],
  ] as const)(
    '%s sends the planned bytes over controlled HTTPS',
    async (version, routes, provider) => {
      const { definition, input } = await request(version, routes, provider, {
        reasoningEffort: 'medium',
        maxOutputTokens: 64,
      })
      const host = await httpsFixture(
        cert.tls,
        res => res.end(content('ok') + finish()),
        {},
        undefined,
        [definition],
      )
      try {
        const planned = await host.transport.plan(input, { signal: new AbortController().signal })
        if ('rejected' in planned) throw new Error(planned.rejected)
        const sent = await host.transport.send(
          planned.planned,
          'google-offline-test-credential',
          new AbortController().signal,
        )
        if (!('response' in sent)) throw new Error('controlled response unavailable')
        const events = []
        for await (const event of host.transport.read(
          sent.response,
          planned.planned,
          new AbortController().signal,
        ))
          events.push(event)
        expect(events).toContainEqual(expect.objectContaining({ t: 'fill', payload: 'ok' }))
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(planned.planned.serialized)
        expect(host.requests[0]?.body).toContain(`"order":["${provider}"]`)
        expect(host.requests[0]?.body).toContain('"reasoning":{"effort":"medium"}')
        expect(host.requests[0]?.body).not.toContain('cache_control')
      } finally {
        await host.close()
      }
    },
  )
})
