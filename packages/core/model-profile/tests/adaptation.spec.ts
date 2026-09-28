import { readFileSync } from 'node:fs'
import { describe, expect, it, expectTypeOf } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  judgeModelProfileDocument,
  schemaId,
  validate,
  type ModelAdaptationBinding,
  type ModelProfile,
  type ModelProfileContent,
  type ModelProfileSnapshot,
} from '@omne-harness-lite/model-profile'
import {
  judgeModelProfileDocument as judgeV2,
  schemaId as schemaV2,
} from '@omne-harness-lite/model-profile/v2'

const adaptation: ModelAdaptationBinding = {
  implementation: { name: 'openrouter-openai', revision: 'r1' },
  definition: { modelId: 'openai/gpt-6-sol', revision: 'd1' },
  configuration: { revision: 'c1', values: {} },
}
const profile: ModelProfile = {
  routeName: adaptation.definition.modelId,
  adaptation,
  origin: 'official',
  providers: ['OpenAI'],
  allowFallback: false,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 128000,
  maxOutputTokens: 4096,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  registration: 'listed',
  updatedAt: '2026-09-27T01:00:00Z',
}
const { registration: _registration, updatedAt: _updatedAt, ...content } = profile
function json(text: string): JsonValue {
  const result = readJsonStrict(text)
  if ('failed' in result) throw new Error(result.failed)
  return result.ok
}

describe('accepted profile4 value and explicit profile2 consumer', () => {
  it('ships the exact frozen Schema, with different explicit version coordinates', () => {
    expect(readFileSync(new URL('../schema/model-profile.schema.json', import.meta.url))).toEqual(
      readFileSync(
        new URL(
          '../../../../.meta_harness/design/spec/data/model-profile/v4/model-profile.schema.json',
          import.meta.url,
        ),
      ),
    )
    expect(schemaId).not.toBe(schemaV2)
    expect(validate('ModelProfile', profile).valid).toBe(true)
    expect(judgeModelProfileDocument('ModelProfile', profile)).toEqual({ ok: true })
    expect(judgeModelProfileDocument('ModelProfileContent', content)).toEqual({ ok: true })
    const { adaptation: _binding, upstreamInputLimits: _limits, ...old } = profile
    expect(judgeV2('ModelProfile', old)).toEqual({ ok: true })
    expect(judgeModelProfileDocument('ModelProfile', old)).toEqual({ rejected: 'malformed' })
    expect(judgeV2('ModelProfile', profile)).toEqual({ rejected: 'malformed' })
  })

  it.each(['ModelProfile', 'ModelProfileContent'] as const)(
    '%s compares the model name even when the shape is valid',
    kind => {
      const base = kind === 'ModelProfile' ? profile : content
      const value = {
        ...base,
        adaptation: {
          ...adaptation,
          definition: { ...adaptation.definition, modelId: 'openai/gpt-6-luna' },
        },
      }
      expect(validate(kind, value).valid).toBe(true)
      expect(judgeModelProfileDocument(kind, value)).toEqual({ rejected: 'malformed' })
    },
  )

  it('retains malformed priority and skips name alignment until the route itself is valid', () => {
    expect(judgeModelProfileDocument('ModelProfile', { ...profile, routeName: '' })).toEqual({
      rejected: 'route_name_empty',
    })
    expect(
      judgeModelProfileDocument('ModelProfile', {
        ...profile,
        routeName: '',
        adaptation: undefined,
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeModelProfileDocument('ModelProfile', {
        ...profile,
        providers: [],
        adaptation: { ...adaptation, definition: { ...adaptation.definition, modelId: 'other' } },
      }),
    ).toEqual({ rejected: 'malformed' })
  })

  it.each([
    null,
    {},
    { ...adaptation, extra: true },
    { ...adaptation, implementation: { name: '', revision: 'r1' } },
    { ...adaptation, implementation: { name: ' x', revision: 'r1' } },
    { ...adaptation, definition: { modelId: adaptation.definition.modelId, revision: 'r1\u2003' } },
    { ...adaptation, configuration: { revision: 'c1', values: [] } },
    { ...adaptation, configuration: { revision: 'c1', values: { broken: Infinity } } },
  ])('rejects illegal binding members before parameter predicates: %j', binding => {
    expect(
      judgeModelProfileDocument('ModelProfile', {
        ...profile,
        adaptation: binding,
        parameters: { temperature: -1 },
      }),
    ).toEqual({ rejected: 'malformed' })
  })

  it('does not apply model parameter bounds to arbitrary configuration keys or round their values', () => {
    const values = json(
      '{"maxOutputTokens":-1.25,"seed":1.5,"topP":0,"temperature":9e1000,"nested":[9007199254740993,true,null]}',
    )
    const value = {
      ...profile,
      adaptation: { ...adaptation, configuration: { revision: 'c1', values } },
    }
    const before = writeJsonLossless(value)
    expect(validate('ModelProfile', value).valid).toBe(true)
    expect(judgeModelProfileDocument('ModelProfile', value)).toEqual({ ok: true })
    expect(writeJsonLossless(value)).toBe(before)
    expect(before).toContain('9007199254740993')
    expect(before).toContain('9e1000')
  })

  it('does not mistake unregistered revisions or TTL values for shape errors', () => {
    const value = {
      ...content,
      adaptation: {
        ...adaptation,
        implementation: { name: 'custom-unknown', revision: 'not-registered' },
        configuration: { revision: 'local1', values: { ttl: 'configuration-defined' } },
      },
    }
    expect(judgeModelProfileDocument('ModelProfileContent', value)).toEqual({ ok: true })
  })

  it('snapshot shape requires binding but its relation to a route is the caller responsibility', () => {
    const snapshot = {
      adaptation,
      providers: ['OpenAI'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: new LosslessNumber('128000'),
      maxOutputTokens: 4096,
      inputConstraints: {},
      upstreamInputLimits: profile.upstreamInputLimits,
      updatedAt: profile.updatedAt,
    }
    expect(validate('ModelProfileSnapshot', snapshot).valid).toBe(true)
    const { adaptation: _binding, ...old } = snapshot
    expect(validate('ModelProfileSnapshot', old).valid).toBe(false)
    expectTypeOf<ModelProfile['adaptation']>().toEqualTypeOf<ModelAdaptationBinding>()
    expectTypeOf<ModelProfileContent['adaptation']>().toEqualTypeOf<ModelAdaptationBinding>()
    expectTypeOf<ModelProfileSnapshot['adaptation']>().toEqualTypeOf<ModelAdaptationBinding>()
  })
})
