import { describe, expect, it } from 'vitest'
import { composeTransformRevision, inspectTransformRevision } from '../src/meter-transform.ts'
import { inspectCurrentMeterBasis, relateMeterBases } from '../src/meter-transform.ts'
import { INPUT_PROJECTION_REVISION } from '../src/projection.ts'
import { defineInputMeter } from '../src/input-meter.ts'
import { testDefinitions } from './definitions.ts'
import type { CountingBasis } from '@omne-harness-lite/model-response'

const base = 'openrouter-wire/2'
const preparation = {
  algorithmRevision: 'finite-images/1',
  codecRevision: 'test-codec/1',
  policyDigest: 'a'.repeat(64),
}
function basisFixture() {
  const definition = testDefinitions[0]
  if (!definition) throw new Error('definition fixture required')
  const meter = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider: 'openai',
    algorithmRevision: 'test/1',
    evidence: 'controlled basis identity test',
    measureFull: () => ({ kind: 'exact', tokens: 1 }),
  })
  const basis: CountingBasis = {
    model: definition.modelId,
    provider: 'openai',
    binding: {
      definition: { modelId: definition.modelId, revision: definition.revision },
      implementation: definition.implementation,
      configuration: { revision: 'c1', values: { cache: { mode: 'automatic' } } },
    },
    tokenizerRevision: meter.tokenizerRevision,
    meterRevision: meter.algorithmRevision,
    replayRevision: meter.replayRevision,
    transformRevision: meter.transformRevision,
    projectionRevision: INPUT_PROJECTION_REVISION,
  }
  return { basis, meter }
}
describe('D109 shared transform descriptor', () => {
  it('preserves plain semantics and canonical preparation descriptors', () => {
    expect(composeTransformRevision(base)).toBe(base)
    const revision = composeTransformRevision(base, preparation)
    expect(revision).toBe(
      `image-input/1:["${base}","finite-images/1","test-codec/1","${'a'.repeat(64)}"]`,
    )
    expect(inspectTransformRevision(revision, base)).toEqual({ kind: 'known', base, preparation })
    expect(inspectTransformRevision(base, base)).toEqual({ kind: 'known', base, preparation: null })
  })
  it('rejects ambiguous encoding and malformed known versions', () => {
    const revision = composeTransformRevision(base, preparation)
    for (const value of [
      revision + ' ',
      revision.replace('[', '[ '),
      revision.replace('finite', '\\u0066inite'),
      'image-input/1:[]',
      'image-input/1:bad',
      revision.replace('a'.repeat(64), 'A'.repeat(64)),
    ])
      expect(inspectTransformRevision(value, base)).toEqual({ kind: 'invalid' })
    expect(() => composeTransformRevision(base, { ...preparation, policyDigest: 'bad' })).toThrow(
      TypeError,
    )
    expect(() =>
      composeTransformRevision(base, Object.assign({}, preparation, { extra: true })),
    ).toThrow(TypeError)
  })
  it('never strips unknown versions or treats a foreign base as compatible', () => {
    expect(
      inspectTransformRevision(composeTransformRevision('foreign/1', preparation), base),
    ).toEqual({ kind: 'unknown' })
    expect(inspectTransformRevision('image-input/2:["openrouter-wire/2"]', base)).toEqual({
      kind: 'unknown',
    })
  })
  it('keeps every current binding and meter field exact', () => {
    const { basis, meter } = basisFixture()
    expect(inspectCurrentMeterBasis(basis, meter).kind).toBe('known')
    const compound = {
      ...basis,
      transformRevision: composeTransformRevision(meter.transformRevision, preparation),
    }
    expect(inspectCurrentMeterBasis(compound, meter).kind).toBe('known')
    for (const key of [
      'model',
      'provider',
      'tokenizerRevision',
      'meterRevision',
      'replayRevision',
      'projectionRevision',
    ] as const)
      expect(inspectCurrentMeterBasis({ ...compound, [key]: 'foreign' }, meter).kind).toBe(
        'unknown',
      )
    expect(
      inspectCurrentMeterBasis(
        {
          ...compound,
          binding: {
            ...compound.binding,
            definition: { ...compound.binding.definition, revision: 'foreign' },
          },
        },
        meter,
      ).kind,
    ).toBe('unknown')
  })
  it('distinguishes currentOnly, complete equality, and explicitly interpretable changes', () => {
    const { basis, meter } = basisFixture()
    const first = { ...basis, transformRevision: composeTransformRevision(base, preparation) }
    const next = {
      ...basis,
      transformRevision: composeTransformRevision(base, {
        ...preparation,
        codecRevision: 'changed/1',
      }),
    }
    expect(relateMeterBases(first, undefined, meter).kind).toBe('currentOnly')
    expect(relateMeterBases(first, first, meter).kind).toBe('sameEffective')
    expect(relateMeterBases(next, first, meter).kind).toBe('changedEffective')
    const foreign = {
      ...basis,
      binding: {
        ...basis.binding,
        definition: { ...basis.binding.definition, revision: 'unknown' },
      },
    }
    expect(relateMeterBases(first, foreign, meter)).toEqual({ kind: 'unavailable' })
    expect(relateMeterBases(first, foreign, meter, () => true).kind).toBe('changedEffective')
    expect(
      relateMeterBases(first, { ...basis, transformRevision: 'image-input/1:[]' }, meter),
    ).toEqual({ kind: 'invalidInput' })
    expect(
      relateMeterBases(first, { ...basis, transformRevision: 'image-input/2:unknown' }, meter),
    ).toEqual({ kind: 'unavailable' })
  })
  it('owns and freezes policy inputs and refuses non-boolean/async applicability', async () => {
    const { basis, meter } = basisFixture()
    const original = JSON.stringify(basis)
    expect(
      relateMeterBases(basis, basis, meter, value => {
        expect(Object.isFrozen(value.binding.configuration.values)).toBe(true)
        Object.defineProperty(value.binding.definition, 'revision', { value: 'mutated' })
        return true
      }),
    ).toEqual({ kind: 'unavailable' })
    expect(JSON.stringify(basis)).toBe(original)
    expect(relateMeterBases(basis, basis, meter, () => false)).toEqual({ kind: 'unavailable' })
    expect(
      relateMeterBases(basis, basis, meter, () => {
        throw Error('failure')
      }),
    ).toEqual({ kind: 'unavailable' })
    // @ts-expect-error runtime negative control: async predicates are forbidden
    expect(relateMeterBases(basis, basis, meter, () => Promise.reject(Error('failure')))).toEqual({
      kind: 'unavailable',
    })
    // @ts-expect-error runtime negative control: truthy values are not true
    expect(relateMeterBases(basis, basis, meter, () => 1)).toEqual({ kind: 'unavailable' })
    await Promise.resolve()
  })
})
