import { describe, expect, it } from 'vitest'
import { composeTransformRevision, inspectTransformRevision } from '../src/meter-transform.ts'
import { inspectCurrentMeterBasis } from '../src/meter-transform.ts'
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
})
