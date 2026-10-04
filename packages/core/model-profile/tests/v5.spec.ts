import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  judgeModelProfileDocument,
  SCHEMA_DEF_NAMES,
  schemaId,
  validate,
  type ModelProfile,
  type ModelProfileSnapshot,
} from '@omne-harness-lite/model-profile'
import retainedSchema from '@omne-harness-lite/model-profile/schema/v2' with { type: 'json' }

const examples = JSON.parse(
  readFileSync(
    new URL(
      '../../../../.meta_harness/design/spec/data/model-profile/v5/examples.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  readonly contract: string
  readonly cases: readonly {
    readonly id: string
    readonly definition: (typeof SCHEMA_DEF_NAMES)[number]
    readonly value: unknown
    readonly schemaValid: boolean
    readonly representationResult?: string
  }[]
}

function strict(source: string): unknown {
  const parsed = readJsonStrict(source)
  if ('failed' in parsed) throw new Error(parsed.failed)
  return parsed.ok
}

const base = examples.cases.find(test => test.id === 'P-image-unknown')?.value as ModelProfile
if (base === undefined) throw new Error('missing normative profile fixture')

describe('data.model-profile/v5 public artifact', () => {
  it('publishes the exact v5 Schema and keeps both older resources distinct', () => {
    for (const version of ['v5', 'v2'] as const) {
      const publicPath =
        version === 'v5'
          ? '../schema/model-profile.schema.json'
          : `../schema/${version}/model-profile.schema.json`
      const normativePath = `../../../../.meta_harness/design/spec/data/model-profile/${version}/model-profile.schema.json`
      expect(readFileSync(new URL(publicPath, import.meta.url))).toEqual(
        readFileSync(new URL(normativePath, import.meta.url)),
      )
    }
    expect(new Set([schemaId, retainedSchema.$id]).size).toBe(2)
    expect(SCHEMA_DEF_NAMES).toHaveLength(14)
    expect(SCHEMA_DEF_NAMES).toContain('InputLimitFact')
    expect(SCHEMA_DEF_NAMES).toContain('UpstreamInputLimits')
  })

  it.each(examples.cases)('$id: normative shape and full judgment remain distinct', test => {
    expect(validate(test.definition, test.value).valid).toBe(test.schemaValid)
    if (test.representationResult !== undefined) {
      expect(judgeModelProfileDocument(test.definition as 'ModelProfile', test.value)).toEqual(
        test.representationResult === 'valid'
          ? { ok: true }
          : { rejected: test.representationResult },
      )
    }
  })

  it('compares adjacent huge integers exactly across all four cap metrics', () => {
    const low = strict('900719925474099200000000000000000000001')
    const high = strict('900719925474099200000000000000000000002')
    for (const metric of [
      'maxInputTokens',
      'maxRequestBytes',
      'maxImageBytes',
      'maxImages',
    ] as const) {
      const constraints =
        metric === 'maxInputTokens'
          ? base.inputConstraints
          : { ...base.inputConstraints, [metric]: high }
      const value = {
        ...base,
        maxInputTokens: metric === 'maxInputTokens' ? high : base.maxInputTokens,
        inputConstraints: constraints,
        upstreamInputLimits: {
          ...base.upstreamInputLimits,
          [metric]: { status: 'limited', value: low },
        },
      }
      expect(validate('ModelProfile', value).valid, metric).toBe(true)
      expect(judgeModelProfileDocument('ModelProfile', value)).toEqual({ rejected: 'malformed' })
      const equal = {
        ...value,
        upstreamInputLimits: {
          ...value.upstreamInputLimits,
          [metric]: { status: 'limited', value: high },
        },
      }
      expect(judgeModelProfileDocument('ModelProfile', equal)).toEqual({ ok: true })
    }
  })

  it('does not interpret matching metadata keys as limits or mutate input', () => {
    const value = {
      ...base,
      adaptation: {
        ...base.adaptation,
        configuration: {
          ...base.adaptation.configuration,
          values: { value: strict('1e400'), maxImages: strict('1e-400'), maxRequestBytes: 0 },
        },
      },
      parameters: { extra: { value: strict('1e400'), maxImages: strict('1e-400') } },
    }
    const before = writeJsonLossless(value)
    expect(validate('ModelProfile', value).valid).toBe(true)
    expect(judgeModelProfileDocument('ModelProfile', value)).toEqual({ ok: true })
    expect(writeJsonLossless(value)).toBe(before)
  })

  it('reports a finite cap conflict before an empty route or unknown constraint', () => {
    const conflicting = {
      ...base,
      routeName: '',
      inputConstraints: { ...base.inputConstraints, maxAudioSeconds: 60 },
      upstreamInputLimits: {
        ...base.upstreamInputLimits,
        maxInputTokens: { status: 'limited', value: 4095 },
      },
    }
    expect(judgeModelProfileDocument('ModelProfile', conflicting)).toEqual({
      rejected: 'malformed',
    })
    expect(
      judgeModelProfileDocument('ModelProfile', {
        ...conflicting,
        upstreamInputLimits: base.upstreamInputLimits,
      }),
    ).toEqual({ rejected: 'route_name_empty' })
  })

  it('checks image applicability in snapshots while leaving independent facts without a host', () => {
    const snapshot: ModelProfileSnapshot = {
      adaptation: base.adaptation,
      providers: base.providers,
      allowFallback: base.allowFallback,
      inputModalities: base.inputModalities,
      outputModalities: base.outputModalities,
      maxInputTokens: base.maxInputTokens,
      maxOutputTokens: base.maxOutputTokens,
      inputConstraints: base.inputConstraints,
      upstreamInputLimits: base.upstreamInputLimits,
      updatedAt: base.updatedAt,
    }
    expect(validate('ModelProfileSnapshot', snapshot).valid).toBe(true)
    expect(
      validate('ModelProfileSnapshot', {
        ...snapshot,
        inputConstraints: {},
      }).valid,
    ).toBe(false)
    expect(
      validate('UpstreamInputLimits', {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      }).valid,
    ).toBe(true)
  })

  it('rejects legacy profile shapes without fabricating upstream facts', () => {
    const { upstreamInputLimits: _limits, ...old } = base
    expect(validate('ModelProfile', old).valid).toBe(false)
    expect(judgeModelProfileDocument('ModelProfile', old)).toEqual({ rejected: 'malformed' })
  })
})
