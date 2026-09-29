import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { planRequest } from './synthetic-input-meter.ts'
import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
  type ModelDefinition,
  type ModelRoute,
} from '@omne-harness-lite/pi-ai-transport'
import {
  glm52ZAiFp8Route,
  glm53FlashZAiFp8Route,
  glm53FlashxZAiFp8Route,
  glm53PrimeAlibabaRoute,
  glm53ZAiFp8Route,
} from '../src/official-models/zai.ts'
import { certificate, content, finish, fixture } from './support.ts'

const at = '2026-09-28T00:00:00Z'
const cases = [
  { id: 'z-ai/glm-5.3', provider: 'z-ai/fp8', route: glm53ZAiFp8Route },
  { id: 'z-ai/glm-5.3-prime', provider: 'alibaba', route: glm53PrimeAlibabaRoute },
  { id: 'z-ai/glm-5.3-flash', provider: 'z-ai/fp8', route: glm53FlashZAiFp8Route },
  { id: 'z-ai/glm-5.3-flashx', provider: 'z-ai/fp8', route: glm53FlashxZAiFp8Route },
  { id: 'z-ai/glm-5.2', provider: 'z-ai/fp8', route: glm52ZAiFp8Route },
] as const
type Case = (typeof cases)[number]
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

function judged(raw: unknown): Message {
  const result = judgeMessage(raw)
  if ('rejected' in result) throw new Error(result.rejected)
  return result.ok
}
function message(type: 'system' | 'system_reminder' | 'user'): Message {
  return judged({
    type,
    id: type,
    createdAt: at,
    blocks: [
      {
        id: `${type}-text`,
        kind: 'text',
        text: type,
        visibility: { toHuman: true, toModel: true },
      },
    ],
    ...(type === 'system_reminder'
      ? { nature: 'event', source: { kind: 'attempt_started', attempt: 1, reason: 'first', at } }
      : {}),
  })
}
function definition(testCase: Case): ModelDefinition {
  return {
    modelId: testCase.id,
    revision: 'fixture-1',
    implementation: { name: 'pi-ai:zai-fixture', revision: '1' },
    // Synthetic text-only capacities are test inputs, never an official offer.
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
    routes: { [testCase.provider]: testCase.route },
  }
}
function values(testCase: Case) {
  return testCase.provider === 'alibaba'
    ? { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] } }
    : { cache: { mode: 'automatic' } }
}
function request(
  testCase: Case,
  parameters: ModelRequestParameters = {},
): {
  definition: ModelDefinition
  input: PlanInput
} {
  const selected = definition(testCase)
  const configuration = { revision: 'fixture-1', values: values(testCase) }
  const profile = createOfficialProfileContent(selected, {
    providers: [testCase.provider],
    allowFallback: false,
    configuration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    definition: selected,
    input: {
      calibration: { kind: 'none' as const, reason: 'no_observation' as const },
      outputHistory: [],
      tokenMargin: { multiplier: 1, reserveTokens: 0 },
      target: {
        kind: 'model_call',
        callId: unwrap(parseOpaqueIdentifier('zai-route-fixture', 'ModelCallId')),
        dispatch: 1,
      },
      routeName: testCase.id,
      provider: testCase.provider,
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
      messages: [message('system'), message('system_reminder'), message('user')],
      tools: [],
    },
  }
}
function planned(testCase: Case, parameters: ModelRequestParameters = {}) {
  const { definition: selected, input } = request(testCase, parameters)
  const result = planRequest(input, [selected])
  if ('rejected' in result) throw new Error(result.rejected)
  return result.planned
}

describe('Z.ai family routes: synthetic profiles and local HTTPS only', () => {
  it.each(cases)('$id selects its exact route and keeps a marked user reminder', testCase => {
    const { definition: selected } = request(testCase)
    expect(
      readModelDefinition([selected], {
        implementation: selected.implementation,
        definition: { modelId: selected.modelId, revision: selected.revision },
      }),
    ).toEqual({ ok: selected })
    const plan = planned(testCase, { maxOutputTokens: 128 })
    expect(plan.body.model).toBe(testCase.id)
    expect(plan.body.provider).toEqual({
      order: [testCase.provider],
      allow_fallbacks: false,
      require_parameters: true,
    })
    expect(plan.body.messages).toMatchObject([
      { role: 'system' },
      {
        role: 'user',
        content: [{ text: '[system_reminder "system_reminder"]' }, { text: 'system_reminder' }],
      },
      { role: 'user' },
    ])
    expect(plan.body.max_tokens).toBe(128)
    expect(plan.body.store).toBe(false)
    expect(plan.body).not.toHaveProperty('models')
    expect(plan.body).not.toHaveProperty('reasoning')
  })

  it.each(cases)('$id rejects the wrong provider and output beyond its fixture cap', testCase => {
    const { definition: selected, input } = request(testCase)
    expect(planRequest({ ...input, provider: 'other/route' }, [selected])).toEqual({
      rejected: 'unavailable',
    })
    expect(planRequest({ ...input, parameters: { maxOutputTokens: 129 } }, [selected])).toEqual({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
    expect(planRequest(input, [])).toEqual({ rejected: 'unavailable' })
  })

  it('leaves native fp8 caching automatic and forbids manual TTL controls', () => {
    for (const testCase of cases.filter(item => item.provider === 'z-ai/fp8')) {
      const selected = definition(testCase)
      expect(
        interpretConfiguration(selected, { cache: { mode: 'automatic' } }, testCase.provider),
      ).toEqual({ ok: { mode: 'automatic' } })
      expect(
        interpretConfiguration(
          selected,
          { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] } },
          testCase.provider,
        ),
      ).toEqual({ rejected: 'invalidInput' })
      expect(planned(testCase).serialized).not.toContain('cache_control')
      const schema = configurationSchema(selected, testCase.provider)
      if ('rejected' in schema) throw new Error(schema.rejected)
      expect(JSON.stringify(schema.ok)).not.toContain('default')
    }
  })

  it('keeps the observed Alibaba explicit shape caller-selected and rejects other TTLs/layouts', () => {
    const prime = cases[1]
    const selected = definition(prime)
    expect(interpretConfiguration(selected, values(prime), prime.provider)).toEqual({
      ok: { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] },
    })
    for (const invalid of [
      {},
      { cache: { mode: 'automatic' } },
      { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
      { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['system'] } },
    ])
      expect(interpretConfiguration(selected, invalid, prime.provider)).toEqual({
        rejected: 'invalidInput',
      })
    const plan = planned(prime)
    expect(plan.body.messages).toMatchObject([
      { role: 'system' },
      { role: 'user' },
      { role: 'user', content: [{ cache_control: { type: 'ephemeral', ttl: '5m' } }] },
    ])
    expect(plan.serialized).toContain('"ttl":"5m"')
    const schema = configurationSchema(selected, prime.provider)
    if ('rejected' in schema) throw new Error(schema.rejected)
    expect(JSON.stringify(schema.ok)).not.toContain('default')
  })

  it('passes only explicit, evidenced unified efforts and reports every dropped request', () => {
    for (const testCase of [cases[0], cases[1]]) {
      for (const effort of ['low', 'high', 'max'] as const)
        expect(planned(testCase, { reasoningEffort: effort }).body.reasoning).toEqual({
          effort,
        })
      expect(planned(testCase, { reasoningEffort: 'medium' }).droppedParameters).toEqual([
        'reasoningEffort',
      ])
    }
    expect(planned(cases[4], { reasoningEffort: 'high' }).body.reasoning).toEqual({
      effort: 'high',
    })
    for (const testCase of [cases[2], cases[3], cases[4]]) {
      const result = planned(testCase, {
        reasoningEffort: 'max',
        temperature: 0.5,
        topP: 0.9,
        seed: 1,
        stopSequences: ['stop'],
        frequencyPenalty: 1,
        presencePenalty: 1,
        extra: { top_k: 20, model: 'wrong-model' },
      })
      expect(result.droppedParameters).toEqual([
        'reasoningEffort',
        'temperature',
        'topP',
        'seed',
        'stopSequences',
        'frequencyPenalty',
        'presencePenalty',
        'model',
        'top_k',
      ])
      expect(result.body.model).toBe(testCase.id)
      expect(result.body).not.toHaveProperty('reasoning')
      expect(result).not.toHaveProperty('parameterAdjustments')
    }
  })

  it('replays paired tool results and opaque reasoning through the shared planner on every route', () => {
    for (const testCase of cases) {
      const { definition: selected, input } = request(testCase)
      const assistant = judged({
        type: 'assistant',
        id: 'assistant',
        response: 'response',
        ending: 'complete',
        createdAt: at,
        blocks: [
          {
            id: 'thinking',
            kind: 'thinking',
            text: 'thinking',
            opaque: toOpaqueJson({
              routeName: testCase.id,
              reasoning_details: [{ type: 'reasoning.text', text: 'opaque' }],
            }),
            visibility: { toHuman: false, toModel: true },
          },
          {
            id: 'call',
            kind: 'tool_call',
            callId: 'tool-call',
            tool: 'lookup',
            complete: true,
            arguments: { query: 'x' },
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      const tool = judged({
        type: 'tool',
        id: 'tool-result',
        callId: 'tool-call',
        createdAt: at,
        blocks: [
          {
            id: 'result',
            kind: 'tool_result',
            callId: 'tool-call',
            outcome: 'completed',
            visibility: { toHuman: true, toModel: true },
            blocks: [
              {
                id: 'result-text',
                kind: 'text',
                text: 'ok',
                visibility: { toHuman: true, toModel: true },
              },
            ],
          },
        ],
      })
      const result = planRequest({ ...input, messages: [...input.messages, assistant, tool] }, [
        selected,
      ])
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.planned.body.messages).toMatchObject([
        {},
        {},
        {},
        {
          role: 'assistant',
          reasoning_details: [{ type: 'reasoning.text', text: 'opaque' }],
          tool_calls: [
            { id: 'tool-call', function: { name: 'lookup', arguments: '{"query":"x"}' } },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'tool-call',
          ...(testCase.provider === 'alibaba' ? {} : { content: 'ok' }),
        },
      ])
      if (testCase.provider === 'alibaba')
        expect(result.planned.body.messages).toMatchObject([
          {},
          {},
          {},
          {},
          { content: [{ text: 'ok', cache_control: { type: 'ephemeral', ttl: '5m' } }] },
        ])
      expect(
        planRequest({ ...input, messages: [...input.messages, assistant] }, [selected]),
      ).toEqual({
        rejected: 'orphan_tool_call',
      })
    }
  })

  it.each(cases)(
    '$id sends the planned wire once and reads a local HTTPS stream',
    async testCase => {
      const { definition: selected, input } = request(testCase, {
        maxOutputTokens: 64,
        ...(testCase.id === 'z-ai/glm-5.2' ? { reasoningEffort: 'high' } : {}),
      })
      const host = await fixture(
        cert.tls,
        res => res.end(content('zai-stream') + finish()),
        {},
        undefined,
        [selected],
      )
      try {
        const plan = host.transport.plan(input)
        if ('rejected' in plan) throw new Error(plan.rejected)
        const signal = new AbortController().signal
        const sent = await host.transport.send(plan.planned, 'synthetic-zai-credential', signal)
        if (!('response' in sent)) throw new Error('fixture send failed')
        const events = []
        for await (const event of host.transport.read(sent.response, plan.planned, signal))
          events.push(event)
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(plan.planned.serialized)
        expect(host.requests[0]?.path).toBe('/api/v1/chat/completions')
        expect(events.some(event => event.t === 'fill')).toBe(true)
        expect(events.some(event => event.t === 'close')).toBe(true)
        expect(host.requests[0]?.body).not.toContain('synthetic-zai-credential')
      } finally {
        await host.close()
      }
    },
  )
})
