import { describe, expect, it } from 'vitest'
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
import { kimiK3MoonshotRoute, kimiK27CodeMoonshotRoute } from '../src/official-models/moonshot.ts'

const provider = 'moonshotai/test-route'
const at = '2026-09-28T00:00:00Z'
function fixture(route: ModelRoute): ModelDefinition {
  return {
    modelId: 'test/moonshot-route',
    revision: 'fixture-1',
    implementation: { name: 'pi-ai:moonshot-test', revision: '1' },
    // The invented text-only capacities are confined to this offline fixture.
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
    routes: { [provider]: route },
  }
}
function message(type: 'system' | 'system_reminder' | 'user'): Message {
  const value = judgeMessage({
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
  if ('rejected' in value) throw new Error(value.rejected)
  return value.ok
}
async function plan(route: ModelRoute, parameters: ModelRequestParameters = {}) {
  const definition = fixture(route)
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
      callId: unwrap(parseOpaqueIdentifier('test-call', 'ModelCallId')),
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
    messages: [message('system'), message('system_reminder'), message('user')],
    tools: [],
  }
  return { definition, input, result: await planRequest(input, [definition]) }
}

describe('Moonshot route rules (synthetic offline fixture, not an official profile)', () => {
  it.each([kimiK3MoonshotRoute, kimiK27CodeMoonshotRoute])(
    'uses a marked user reminder and automatic cache without manual TTL or breakpoints',
    async route => {
      const { definition, result } = await plan(route)
      expect(
        readModelDefinition([definition], {
          implementation: definition.implementation,
          definition: { modelId: definition.modelId, revision: definition.revision },
        }),
      ).toEqual({ ok: definition })
      expect(
        interpretConfiguration(definition, { cache: { mode: 'automatic' } }, provider),
      ).toEqual({
        ok: { mode: 'automatic' },
      })
      expect(
        interpretConfiguration(definition, { cache: { mode: 'explicit', ttl: '1h' } }, provider),
      ).toEqual({
        rejected: 'invalidInput',
      })
      const schema = configurationSchema(definition, provider)
      if ('rejected' in schema) throw new Error(schema.rejected)
      expect(JSON.stringify(schema.ok)).not.toContain('default')
      if ('rejected' in result) throw new Error(result.rejected)
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
      expect(result.planned.body.provider).toEqual({
        order: [provider],
        allow_fallbacks: false,
        require_parameters: true,
      })
      expect(result.planned.serialized).not.toContain('cache_control')
      expect(result.planned.serialized).not.toContain('ttl')
    },
  )
  it('passes only the evidenced K3 effort values through the unified wire', async () => {
    const { result } = await plan(kimiK3MoonshotRoute, {
      reasoningEffort: 'high',
      maxOutputTokens: 64,
    })
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.planned.parameters).toEqual({ reasoningEffort: 'high', maxOutputTokens: 64 })
    expect(result.planned.body.reasoning).toEqual({ effort: 'high' })
    expect(result.planned.body.max_tokens).toBe(64)
    const unsupported = (await plan(kimiK3MoonshotRoute, { reasoningEffort: 'medium' })).result
    if ('rejected' in unsupported) throw new Error(unsupported.rejected)
    expect(unsupported.planned.droppedParameters).toEqual(['reasoningEffort'])
    expect(unsupported.planned.body).not.toHaveProperty('reasoning')
  })
  it('does not imply K2.7 has an effort switch or a mutable sampling temperature', async () => {
    const { result } = await plan(kimiK27CodeMoonshotRoute, {
      reasoningEffort: 'none',
      temperature: 0.5,
      topP: 0.5,
      frequencyPenalty: 1,
      presencePenalty: 1,
    })
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.planned.parameters).toEqual({})
    expect(result.planned.droppedParameters).toEqual([
      'reasoningEffort',
      'temperature',
      'topP',
      'frequencyPenalty',
      'presencePenalty',
    ])
    for (const key of [
      'reasoning',
      'temperature',
      'top_p',
      'frequency_penalty',
      'presence_penalty',
    ])
      expect(result.planned.body).not.toHaveProperty(key)
  })
  it('refuses a wrong route or out-of-profile output before network execution', async () => {
    const { definition, input } = await plan(kimiK3MoonshotRoute)
    expect(await planRequest({ ...input, provider: 'moonshotai/other' }, [definition])).toEqual({
      rejected: 'unavailable',
    })
    expect(
      await planRequest({ ...input, parameters: { maxOutputTokens: 129 } }, [definition]),
    ).toEqual({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
  })
})
