import { expect, it } from 'vitest'
import { createAssetModelJudge, SCHEMA_DEF_NAMES } from '@omne-harness-lite/asset-model'
import currentLoopSchema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import declarationSchema from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import {
  judgeDefinition,
  loopExtensionAttributeDeclarations,
} from '@omne-harness-lite/loop-extension'
import { defaultBodyContracts } from '../src/defaults.ts'

const declaration = {
  name: 'review-before-action',
  position: 'before_action',
  power: 'veto',
  implementation: { kind: 'builtin', builtinName: 'review' },
}
const port = defaultBodyContracts.loop_extension

it('AE current body composition receives exact LC3 resource while using current root behavior', () => {
  expect(port.schema).toEqual(declarationSchema)
  expect(port.schema).not.toEqual(currentLoopSchema)
  const judge = createAssetModelJudge(defaultBodyContracts)
  for (const name of SCHEMA_DEF_NAMES) expect(() => judge.validate(name, {})).not.toThrow()
  expect(port.judge(declaration, { capabilityName: declaration.name })).toEqual({ ok: true })
  expect(port.judge(declaration, { capabilityName: 'another-extension' })).toEqual({
    rejected: 'malformed',
  })
  const admitted = judgeDefinition(declaration)
  if ('rejected' in admitted) throw new Error('declaration fixture rejected')
  expect(port.deriveDeclarations(declaration)).toEqual({
    declarations: loopExtensionAttributeDeclarations(admitted.ok),
  })
  expect(port.references(declaration)).toEqual([])
})

for (const [definition, valid] of [
  ['LoopExtensionDefinition', declaration],
  ['Power', 'veto'],
  ['LoopPosition', 'before_action'],
  ['Dimension', { ending: 'failure' }],
  ['ExtensionImplementation', { kind: 'builtin', builtinName: 'review' }],
  ['ErrorPolicy', 'record'],
  ['UnavailabilityPolicy', 'skip'],
] as const)
  it(`AE current LC3 declaration subset admits ${definition}`, () => {
    expect(port.judge(valid, { definition })).toEqual({ ok: true })
  })

it('AE rejects definitions outside its exact declaration subset', () => {
  expect(() => port.judge({}, { definition: 'AfterModelCallFailureSubject' })).toThrow(TypeError)
  expect(() => port.judge({}, { definition: 'ModelRetryConclusion' })).toThrow(TypeError)
})

it('AE private AM compiler fails when the one LC3 resource is replaced or missing', () => {
  const wrong = { ...defaultBodyContracts, loop_extension: { ...port, schema: currentLoopSchema } }
  expect(() => createAssetModelJudge(wrong)).toThrow()
  const missing = { ...defaultBodyContracts, loop_extension: { ...port, schema: false } }
  expect(() => createAssetModelJudge(missing)).toThrow()
})
