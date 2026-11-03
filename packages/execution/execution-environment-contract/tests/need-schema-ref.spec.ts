import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import { createSchemaProvider, validate } from '@omne-harness/schema-provider'
import { describe, expect, it } from 'vitest'
import {
  bindingKinds,
  environmentNeedSchema,
  environmentNeedSchemaRef,
} from '@omne-harness/execution-environment-contract'

const limits: JsonLimits = {
  maxBytes: 10_000,
  maxDepth: 20,
  maxItems: 200,
  maxMembers: 80,
  maxStringLength: 1_000,
  maxNumberLength: 100,
}

const valid = {
  facilities: ['command', 'terminal'],
  isolation: ['process'],
  layers: ['host_machine'],
}

/** One sample per way a field can go wrong, plus the accepted shapes. Samples are JSON values. */
const samples: readonly (readonly [string, unknown])[] = [
  ['a full declaration', valid],
  ['empty arrays', { facilities: [], isolation: [], layers: [] }],
  ['an unregistered facility key', { ...valid, facilities: ['gpu'] }],
  ...bindingKinds.map(kind => [`layer ${kind}`, { ...valid, layers: [kind] }] as const),
  ['every layer', { ...valid, layers: [...bindingKinds] }],
  ['an unknown layer', { ...valid, layers: ['cloud'] }],
  ['a layer with a different case', { ...valid, layers: ['Host_Machine'] }],
  ['a non-string layer', { ...valid, layers: [1] }],
  ['layers as a string', { ...valid, layers: 'host_machine' }],
  ['layers as an object', { ...valid, layers: {} }],
  ['null layers', { ...valid, layers: null }],
  ['a missing layers key', { facilities: [], isolation: [] }],
  ['an empty facility key', { ...valid, facilities: [''] }],
  ['a number facility key', { ...valid, facilities: [1] }],
  ['a null facility key', { ...valid, facilities: [null] }],
  ['a nested facility array', { ...valid, facilities: [['command']] }],
  ['facilities as a string', { ...valid, facilities: 'command' }],
  ['null facilities', { ...valid, facilities: null }],
  ['a missing facilities key', { isolation: [], layers: [] }],
  ['an empty isolation claim', { ...valid, isolation: [''] }],
  ['a boolean isolation claim', { ...valid, isolation: [true] }],
  ['isolation as an object', { ...valid, isolation: { process: true } }],
  ['null isolation', { ...valid, isolation: null }],
  ['a missing isolation key', { facilities: [], layers: [] }],
  ['an unknown key', { ...valid, policy: 'always-allow' }],
  ['an empty object', {}],
  ['an array', [valid]],
  ['null', null],
  ['a string', 'host_machine'],
  ['a number', 1],
  ['a boolean', true],
]

describe('environmentNeedSchemaRef and environmentNeedSchema judge alike', () => {
  const provider = createSchemaProvider({
    maxSnapshots: 4,
    maxConstructDepth: 40,
    maxConstructNodes: 400,
    failureBackoffMs: 0,
    maxAttempts: 1,
  })

  it.each(samples)('agrees on %s', async (_name, sample) => {
    const read = readJsonText(JSON.stringify(sample), limits)
    const viaProvider = await validate(provider, environmentNeedSchemaRef, read)
    const standard = environmentNeedSchema['~standard'].validate(sample)
    if (!('issues' in standard)) {
      expect(viaProvider).toMatchObject({ kind: 'valid', value: sample })
      return
    }
    expect(standard.issues?.length).toBeGreaterThan(0)
    expect(viaProvider.kind).toBe('invalid')
  })

  it('judges both ways in the samples, so the comparison is not one-sided', () => {
    const verdicts = samples.map(
      ([, sample]) => 'issues' in environmentNeedSchema['~standard'].validate(sample),
    )
    expect(verdicts).toContain(true)
    expect(verdicts).toContain(false)
  })
})
