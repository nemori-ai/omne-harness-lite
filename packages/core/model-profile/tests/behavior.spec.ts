import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  parseScopeLayerIdentity,
  type ScopeLayerIdentity,
} from '@omne-harness-lite/identity-values'
import {
  judgeModelProfileDocument,
  parameterNames,
  refMatches,
  validate,
  type ModelProfile,
  type ModelProfileContent,
  type ModelProfileRef,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile/v2'

const profile: ModelProfile = {
  routeName: 'vendor-a/chat-large',
  origin: 'official',
  providers: ['provider-x'],
  allowFallback: false,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 32000,
  maxOutputTokens: 8192,
  inputConstraints: {},
  registration: 'listed',
  updatedAt: '2026-09-20T02:30:00+08:00',
}
const { registration: _registration, updatedAt: _updatedAt, ...content } = profile
function scope(value: unknown): ScopeLayerIdentity {
  const result = parseScopeLayerIdentity(value)
  if ('invalidInput' in result) throw new Error(result.invalidInput)
  return result.ok
}
const tenant = scope({ layer: 'tenant', tenant: { organization: 'org_a', account: 'acc_a' } })
const otherTenant = scope({ layer: 'tenant', tenant: { organization: 'org_a', account: 'acc_b' } })
const organization = scope({ layer: 'organization', organization: 'org_a' })
function json(source: string): JsonValue {
  const result = readJsonStrict(source)
  if ('failed' in result) throw new Error(result.failed)
  return result.ok
}

describe('local cross-field and matching obligations', () => {
  it.each(['ModelProfile', 'ModelProfileContent'] as const)(
    'S18-%s: same limit passes, higher parameter fails while shape passes',
    kind => {
      const base = kind === 'ModelProfile' ? profile : content
      for (const [limit, expected] of [
        [8192, { ok: true }],
        [8193, { rejected: 'max_output_exceeds_profile' }],
      ] as const) {
        const value = { ...base, parameters: { maxOutputTokens: limit } }
        expect(validate(kind, value).valid).toBe(true)
        expect(judgeModelProfileDocument(kind, value)).toEqual(expected)
      }
    },
  )
  it('S14-MATCH: scope and origin are exact, registration is irrelevant', () => {
    const official: ModelProfileRef = { origin: 'official', routeName: profile.routeName }
    const custom: ModelProfileRef = {
      origin: 'custom',
      routeName: profile.routeName,
      scope: tenant,
    }
    const customProfile: ModelProfile = { ...profile, origin: 'custom', registration: 'withdrawn' }
    expect(refMatches(official, profile)).toBe(true)
    expect(refMatches(official, customProfile)).toBe(false)
    expect(refMatches(custom, profile, tenant)).toBe(false)
    expect(refMatches(custom, customProfile, tenant)).toBe(true)
    expect(refMatches(custom, customProfile, otherTenant)).toBe(false)
    expect(refMatches(custom, customProfile, organization)).toBe(false)
    expect(refMatches(custom, customProfile, undefined)).toBe(false)
    expect(refMatches({ origin: 'official', routeName: 'Vendor-A/chat-large' }, profile)).toBe(
      false,
    )
    expect(
      refMatches(
        { origin: 'official', routeName: '\u0065\u0301' },
        { ...profile, routeName: '\u00e9' },
      ),
    ).toBe(false)
  })
  it('S14-SCOPE: all scope components and layers participate', () => {
    const row = { ...profile, origin: 'custom' } satisfies ModelProfile
    const ref = {
      origin: 'custom',
      routeName: profile.routeName,
      scope: organization,
    } satisfies ModelProfileRef
    expect(refMatches(ref, row, organization)).toBe(true)
    expect(refMatches(ref, row, scope({ layer: 'organization', organization: 'org_b' }))).toBe(
      false,
    )
    expect(refMatches(ref, row, tenant)).toBe(false)
    expect(
      refMatches(
        { origin: 'custom', routeName: profile.routeName, scope: tenant },
        row,
        scope({ layer: 'tenant', tenant: { organization: 'org_b', account: 'acc_a' } }),
      ),
    ).toBe(false)
  })
  it('S17-S20: no defaults, no lost extra keys or changed values', () => {
    const value: ModelRequestParameters = {
      reasoningEffort: 'none',
      temperature: new LosslessNumber('0.123456789012345678901'),
      extra: { top_k: 40, raw: json('{"n":1e400,"null":null}') },
    }
    const before = writeJsonLossless(value)
    expect(parameterNames({})).toEqual([])
    expect(parameterNames(value)).toEqual(['reasoningEffort', 'temperature', 'top_k', 'raw'])
    expect(Object.isFrozen(parameterNames(value))).toBe(true)
    expect(judgeModelProfileDocument('ModelRequestParameters', value)).toEqual({ ok: true })
    expect(writeJsonLossless(value)).toBe(before)
    expect(judgeModelProfileDocument('ModelProfile', profile)).toEqual({ ok: true })
    expect(Object.hasOwn(profile, 'parameters')).toBe(false)
    expect(profile.updatedAt).toBe('2026-09-20T02:30:00+08:00')
  })
})

describe('exact numeric constraints before Ajv projection', () => {
  it('EXACT-INTEGER-ORACLE: fixed seed 20260926 agrees with independent BigInt comparisons', () => {
    let state = 20260926n
    for (let index = 0; index < 64; index++) {
      state = (state * 48271n) % 2147483647n
      const limit = 9007199254740992n + state
      const requested = limit + BigInt((index % 3) - 1)
      const value = {
        ...profile,
        maxOutputTokens: new LosslessNumber(String(limit)),
        parameters: { maxOutputTokens: new LosslessNumber(`${requested}.000`) },
      }
      expect(validate('ModelProfile', value).valid).toBe(true)
      expect(judgeModelProfileDocument('ModelProfile', value)).toEqual(
        requested > limit ? { rejected: 'max_output_exceeds_profile' } : { ok: true },
      )
    }
  })
  it.each([
    ['{"temperature":2.0000000000000000001}', false],
    ['{"temperature":1.9999999999999999999}', true],
    ['{"topP":1e-400}', true],
    ['{"topP":1.0000000000000000001}', false],
    ['{"frequencyPenalty":-2.0000000000000000001}', false],
    ['{"presencePenalty":-1.9999999999999999999}', true],
    ['{"seed":-9007199254740993}', true],
    ['{"seed":9007199254740993.1}', false],
    ['{"seed":1e400}', true],
    ['{"maxOutputTokens":1e400}', true],
    ['{"maxOutputTokens":-1e400}', false],
  ] as const)('EXACT-PARAM %s', (source, valid) => {
    const value = json(source)
    expect(validate('ModelRequestParameters', value).valid).toBe(valid)
    expect('ok' in judgeModelProfileDocument('ModelRequestParameters', value)).toBe(valid)
    expect(writeJsonLossless(value)).toBe(source)
  })
  it.each(['ModelProfile', 'ModelProfileContent'] as const)(
    'EXACT-LIMIT-%s: adjacent integers above 2^53 remain distinct',
    kind => {
      const base = kind === 'ModelProfile' ? profile : content
      const value = {
        ...base,
        maxInputTokens: new LosslessNumber('1e400'),
        maxOutputTokens: new LosslessNumber('9007199254740992'),
        inputConstraints: { maxImageBytes: new LosslessNumber('1e400') },
        parameters: { maxOutputTokens: new LosslessNumber('9007199254740993') },
      }
      expect(validate(kind, value).valid).toBe(true)
      expect(judgeModelProfileDocument(kind, value)).toEqual({
        rejected: 'max_output_exceeds_profile',
      })
      expect(
        judgeModelProfileDocument(kind, {
          ...value,
          parameters: { maxOutputTokens: new LosslessNumber('9007199254740992.0') },
        }),
      ).toEqual({ ok: true })
      expect(
        judgeModelProfileDocument(kind, {
          ...value,
          maxInputTokens: new LosslessNumber('1.0000000000000000001'),
        }),
      ).toEqual({ rejected: 'malformed' })
    },
  )
  it('EXACT-SNAPSHOT: shape omits cross-field judgement, ownership remains with snapshot writer', () => {
    const {
      providers,
      allowFallback,
      inputModalities,
      outputModalities,
      maxInputTokens,
      maxOutputTokens,
      updatedAt,
    } = profile
    expect(
      validate('ModelProfileSnapshot', {
        providers,
        allowFallback,
        inputModalities,
        outputModalities,
        maxInputTokens,
        maxOutputTokens,
        updatedAt,
        parameters: { maxOutputTokens: 1000000 },
      }).valid,
    ).toBe(true)
  })
  it('EXACT-EXPONENT: no numeric infinity conversion or exponent-sized allocations', () => {
    expect(
      judgeModelProfileDocument('ModelRequestParameters', {
        seed: new LosslessNumber('1e9999999999999999999999999'),
      }),
    ).toEqual({ ok: true })
    expect(
      judgeModelProfileDocument('ModelRequestParameters', {
        seed: new LosslessNumber('1e-9999999999999999999999999'),
      }),
    ).toEqual({ rejected: 'malformed' })
  })
  it('JSON-BOUNDARY: class wrappers, non-JSON values, accessors and cycles are malformed', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    let invoked = false
    const getter = {
      get temperature() {
        invoked = true
        return 1
      },
    }
    for (const value of [
      new LosslessNumber('1'),
      [],
      null,
      undefined,
      { seed: 1n },
      { temperature: Infinity },
      { seed: NaN },
      new Date(),
      cyclic,
      getter,
    ])
      expect(judgeModelProfileDocument('ModelRequestParameters', value)).toEqual({
        rejected: 'malformed',
      })
    expect(invoked).toBe(false)
  })
  it('SCHEMA-TYPES: numeric wrappers and objects are never coerced into parameter tokens', () => {
    for (const value of [
      { reasoningEffort: { toString: null } },
      { reasoningEffort: new LosslessNumber('1') },
      { extra: new LosslessNumber('1') },
      { temperature: { value: 1 } },
    ]) {
      expect(validate('ModelRequestParameters', value).valid).toBe(false)
      expect(judgeModelProfileDocument('ModelRequestParameters', value)).toEqual({
        rejected: 'malformed',
      })
    }
  })
  it('M-FIRST: a later malformed member defeats earlier named rejections', () => {
    expect(
      judgeModelProfileDocument('ModelProfile', {
        ...profile,
        routeName: '',
        providers: [],
        parameters: { seed: new LosslessNumber('1.0000000000000000001') },
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeModelProfileDocument('ModelProfileContent', {
        ...content,
        providers: [],
        registration: 'deleted',
      }),
    ).toEqual({ rejected: 'malformed' })
  })
})

// This assignment exercises the publicly declared content type rather than a private fixture type.
const _publicContent: ModelProfileContent = content
