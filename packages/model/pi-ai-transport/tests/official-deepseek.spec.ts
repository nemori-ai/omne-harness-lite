import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import {
  LosslessNumber,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import {
  judgeModelProfileDocument,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  planRequest,
  readModelDefinition,
  type PlannedRequest,
} from '@omne-harness-lite/pi-ai-transport'
import {
  deepseekV4Pro0813Definition as definition,
  deepseekV4Pro0813Configuration as configuration,
} from '../src/official-models/deepseek.ts'

const provider = 'deepinfra/fp8'
const at = '2026-09-28T00:00:00Z'
const coordinates = {
  implementation: definition.implementation,
  definition: { modelId: definition.modelId, revision: definition.revision },
}
function profile() {
  const result = createOfficialProfileContent(definition, {
    providers: [provider],
    allowFallback: false,
    configuration,
  })
  if ('rejected' in result) throw new Error(result.rejected)
  return result.ok
}
function message(type: 'system' | 'system_reminder' | 'user', text: string): Message {
  const result = judgeMessage({
    type,
    id: type,
    createdAt: at,
    blocks: [
      { id: `${type}-text`, kind: 'text', text, visibility: { toHuman: true, toModel: true } },
    ],
    ...(type === 'system_reminder'
      ? { nature: 'event', source: { kind: 'attempt_started', attempt: 1, reason: 'first', at } }
      : {}),
  })
  if ('rejected' in result) throw new Error(result.rejected)
  return result.ok
}
function input(parameters: ModelRequestParameters = {}): PlanInput {
  const content = profile()
  return {
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('leaf-call', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: definition.modelId,
    provider,
    snapshot: {
      adaptation: content.adaptation,
      providers: content.providers,
      allowFallback: content.allowFallback,
      inputModalities: content.inputModalities,
      outputModalities: content.outputModalities,
      maxInputTokens: content.maxInputTokens,
      maxOutputTokens: content.maxOutputTokens,
      inputConstraints: content.inputConstraints,
      upstreamInputLimits: content.upstreamInputLimits,
      updatedAt: at,
    },
    parameters,
    messages: [
      message('system', 'instruction'),
      message('system_reminder', 'continue'),
      message('user', 'hello'),
    ],
    tools: [],
  }
}
function plan(parameters: ModelRequestParameters = {}): PlannedRequest {
  const result = planRequest(input(parameters), [definition])
  if ('rejected' in result) throw new Error(result.rejected)
  return result.planned
}
interface Validator {
  compile(schema: unknown): (value: unknown) => boolean
}
function isValidator(value: unknown): value is Validator {
  return (
    !!value &&
    typeof value === 'object' &&
    'compile' in value &&
    typeof value.compile === 'function'
  )
}
function validator(): Validator {
  const module: unknown = createRequire(import.meta.resolve('@omne-harness-lite/model-profile'))(
    'ajv/dist/2020.js',
  )
  if (
    !module ||
    (typeof module !== 'object' && typeof module !== 'function') ||
    !('Ajv2020' in module) ||
    typeof module.Ajv2020 !== 'function'
  )
    throw new Error('missing locked Ajv2020')
  const instance: unknown = Reflect.construct(module.Ajv2020, [
    { strict: true, ownProperties: true },
  ])
  if (!isValidator(instance)) throw new Error('invalid Ajv2020')
  return instance
}

describe('official DeepSeek Pro leaf: public pure boundaries, no HTTP', () => {
  it('preserves the exact route, coordinates and full output-reserving input budget', () => {
    const content = profile()
    expect(readModelDefinition([definition], coordinates)).toEqual({ ok: definition })
    expect(content.routeName).toBe('deepseek/deepseek-v4-pro-0813')
    expect(content.adaptation).toEqual({ ...coordinates, configuration })
    expect(content.maxInputTokens).toBe(1048576 - 16384)
    expect(content.maxOutputTokens).toBe(16384)
    expect(content.inputModalities).toEqual(['text'])
    expect(content.outputModalities).toEqual(['text'])
    expect(content.inputConstraints).toEqual({})
    expect(content.providers).toEqual([provider])
    expect(content.allowFallback).toBe(false)
    expect(judgeModelProfileDocument('ModelProfileContent', content)).toEqual({ ok: true })
    expect(content).not.toHaveProperty('updatedAt')
    expect(content).not.toHaveProperty('registration')
    expect(content).not.toHaveProperty('parameters')
  })
  it('owns nested leaf and configuration values against mutation', () => {
    expect(Reflect.set(definition.capabilities, 'maxInputTokens', 1048576)).toBe(false)
    expect(Reflect.set(definition.routes[provider]?.parameters.seed ?? {}, 'kind', 'pass')).toBe(
      false,
    )
    expect(Reflect.set(configuration.values.cache ?? {}, 'ttl', '1h')).toBe(false)
    expect(profile().maxInputTokens).toBe(1032192)
  })
  it('refuses wrong coordinates/providers and invalid content constraints', () => {
    expect(
      readModelDefinition([definition], {
        ...coordinates,
        implementation: { ...coordinates.implementation, revision: '7' },
      }),
    ).toEqual({ rejected: 'unavailable' })
    expect(
      readModelDefinition([definition], {
        ...coordinates,
        definition: { ...coordinates.definition, revision: '' },
      }),
    ).toEqual({ rejected: 'invalidInput' })
    expect(configurationSchema(definition, 'deepseek')).toEqual({ rejected: 'unavailable' })
    expect(
      createOfficialProfileContent(definition, {
        providers: ['deepseek'],
        allowFallback: false,
        configuration,
      }),
    ).toEqual({ rejected: 'invalidInput' })
    for (const maxInputTokens of [0, null, Infinity])
      expect(
        Reflect.apply(createOfficialProfileContent, undefined, [
          { ...definition, capabilities: { ...definition.capabilities, maxInputTokens } },
          { providers: [provider], allowFallback: false, configuration },
        ]),
      ).toEqual({ rejected: 'invalidInput' })
    expect(
      createOfficialProfileContent(definition, {
        providers: [provider],
        allowFallback: false,
        configuration,
        parameters: { maxOutputTokens: 16385 },
      }),
    ).toEqual({ rejected: 'max_output_exceeds_profile' })
  })
  it('independently validates the exact automatic configuration and refuses legacy TTL/layouts', () => {
    const schema = configurationSchema(definition, provider)
    if ('rejected' in schema) throw new Error(schema.rejected)
    const validate = validator().compile(JSON.parse(writeJsonLossless(schema.ok)))
    const cases: JsonObject[] = [
      configuration.values,
      {},
      { cache: {} },
      { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['system'] } },
      { cache: { mode: 'automatic', ttl: '1h' } },
      { cache: { mode: 'automatic', breakpoints: ['last_message'] } },
      { cache: { mode: 'automatic' }, extra: true },
    ]
    for (const values of cases) {
      expect('ok' in interpretConfiguration(definition, values, provider)).toBe(validate(values))
      const request = input()
      const result = planRequest(
        {
          ...request,
          snapshot: {
            ...request.snapshot,
            adaptation: {
              ...request.snapshot.adaptation,
              configuration: { revision: 'negative-control', values },
            },
          },
        },
        [definition],
      )
      expect('planned' in result).toBe(values === configuration.values)
    }
    expect(writeJsonLossless(schema.ok)).not.toContain('default')
  })
  it('maps reminders to marked user messages, keeps ordinary system/user and uses one fixed provider', () => {
    const actual = plan({ reasoningEffort: 'low', maxOutputTokens: 1024 })
    expect(actual.body.messages).toEqual([
      { role: 'system', content: [{ type: 'text', text: 'instruction' }] },
      {
        role: 'user',
        content: [
          { type: 'text', text: '[system_reminder "system_reminder"]' },
          { type: 'text', text: 'continue' },
        ],
      },
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ])
    expect(actual.input.snapshot.adaptation).toEqual(profile().adaptation)
    expect(actual.body.provider).toEqual({
      order: [provider],
      allow_fallbacks: false,
      require_parameters: true,
    })
    expect(actual.body.model).toBe(definition.modelId)
    expect(actual.body.reasoning).toEqual({ effort: 'low' })
    expect(actual.body.max_tokens).toBe(1024)
    expect(actual.serialized).not.toContain('cache_control')
    expect(actual.serialized).not.toContain('ttl')
    expect(actual.serialized).not.toContain('breakpoints')
    expect(actual.body).not.toHaveProperty('tools')
    expect(actual.body).not.toHaveProperty('models')
  })
  it('keeps absent parameters absent and accepts only the deliberately supplied seed/stop subsets', () => {
    expect(plan().parameters).toEqual({})
    expect(plan().body).not.toHaveProperty('reasoning')
    const actual = plan({ seed: 0, stopSequences: ['END'], maxOutputTokens: 16384 })
    expect(actual.parameters).toEqual({ seed: 0, stopSequences: ['END'], maxOutputTokens: 16384 })
    expect(actual.body.seed).toBe(0)
    expect(actual.body.stop).toEqual(['END'])
    expect(actual.body.max_tokens).toBe(16384)
    expect(actual).not.toHaveProperty('droppedParameters')
    expect(actual).not.toHaveProperty('parameterAdjustments')
  })
  it.each(['none', 'medium', 'high', 'max'] as const)(
    'records %s as deliberately outside the supplied effort subset',
    reasoningEffort => {
      const actual = plan({ reasoningEffort })
      expect(actual.parameters).toEqual({})
      expect(actual.droppedParameters).toEqual(['reasoningEffort'])
      expect(actual.body).not.toHaveProperty('reasoning')
    },
  )
  it('traces all unprovided unified/private values without overriding protected request fields', () => {
    const actual = plan({
      temperature: 1,
      topP: 0.99,
      seed: new LosslessNumber('9007199254740993'),
      maxOutputTokens: 1024,
      stopSequences: ['END', 'STOP'],
      frequencyPenalty: 1,
      presencePenalty: -1,
      extra: {
        model: 'other',
        reasoning: { effort: 'high' },
        include_reasoning: false,
        unknown: 1,
      },
    })
    expect(actual.parameters).toEqual({ maxOutputTokens: 1024 })
    expect(actual.droppedParameters).toEqual([
      'temperature',
      'topP',
      'seed',
      'stopSequences',
      'frequencyPenalty',
      'presencePenalty',
      'include_reasoning',
      'model',
      'reasoning',
      'unknown',
    ])
    expect(actual).not.toHaveProperty('parameterAdjustments')
    expect(actual.body.model).toBe(definition.modelId)
    expect(actual.body).not.toHaveProperty('include_reasoning')
    expect(actual.body).not.toHaveProperty('extra')
    expect(actual.body).not.toHaveProperty('reasoning')
  })
  it('refuses out-of-profile output and unknown route before any sending path', () => {
    expect(planRequest(input({ maxOutputTokens: 16385 }), [definition])).toEqual({
      rejected: 'invalidInput',
    })
    expect(planRequest({ ...input(), provider: 'deepseek' }, [definition])).toEqual({
      rejected: 'unavailable',
    })
    expect(planRequest(input(), [])).toEqual({ rejected: 'unavailable' })
  })
})
