import { expect, it } from 'vitest'
import type { BodyContract } from '@omne-harness-lite/asset-model'
import assetSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import loopSchema from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import {
  loopExtensionBodyContract,
  judgeDefinition,
  loopExtensionAttributeDeclarations,
  loopExtensionReferences,
} from '../src/index.ts'
import { json } from './helpers.ts'

const declarationJudge = createSchemaRuntime([assetSchema, loopSchema]).compile({
  $ref: `${assetSchema.$id}#/$defs/AttributeDeclaration`,
})
for (const power of ['observe', 'rewrite', 'veto'])
  it(`LE-BODY-POWER-${power}: exact author downset and no reserved declarations`, () => {
    const definition = judgeDefinition({
      name: 'g',
      position: 'before_action',
      power,
      implementation: { kind: 'builtin', builtinName: 'g' },
    })
    if ('rejected' in definition) throw new Error('valid definition rejected')
    const declarations = loopExtensionAttributeDeclarations(definition.ok)
    expect(declarations.map(item => item.item)).toEqual(['position', 'power'])
    expect(declarations.at(-1)).toEqual({
      item: 'power',
      kind: 'permission',
      domain: {
        kind: 'enum',
        values:
          power === 'observe'
            ? ['observe']
            : power === 'rewrite'
              ? ['observe', 'rewrite']
              : ['observe', 'rewrite', 'veto'],
      },
      default: power,
    })
    const port: BodyContract<'loop_extension'> = loopExtensionBodyContract
    expect(port.category).toBe('loop_extension')
    expect(port.judge(definition.ok, { capabilityName: 'g' })).toEqual({ ok: true })
    expect(port.judge(definition.ok, { capabilityName: 'other' })).toEqual({
      rejected: 'malformed',
    })
    expect(port.deriveDeclarations(json(JSON.stringify(definition.ok)))).toEqual({ declarations })
    expect(loopExtensionReferences(definition.ok)).toEqual([])
    expect(port.references(json(JSON.stringify(definition.ok)))).toEqual([])
    for (const declaration of declarations)
      expect(declarationJudge.validate(json(JSON.stringify(declaration)))).toBe(true)
    expect(Object.isFrozen(declarations)).toBe(true)
  })
for (const [position, dimension, member, values] of [
  ['after_model_call', { ending: 'failure' }, 'ending', ['complete_reply', 'failure']],
  ['after_action', { scope: 'each' }, 'scope', ['each', 'batch']],
] as const)
  it(`LE-BODY-DIM-${position}: dimension member stays in its own domain`, () => {
    const definition = judgeDefinition({
      name: 'g',
      position,
      dimension,
      power: 'rewrite',
      onError: 'record',
      needs: ['dep'],
      implementation: { kind: 'builtin', builtinName: 'g' },
    })
    if ('rejected' in definition) throw new Error('valid definition rejected')
    const declarations = loopExtensionAttributeDeclarations(definition.ok)
    expect(declarations.map(item => item.item)).toEqual(['position', 'dimension', 'power'])
    expect(declarations[0]).toEqual({
      item: 'position',
      kind: 'setting',
      category: 'binding',
      domain: { kind: 'open', schema: { enum: [position] } },
      default: position,
    })
    expect(declarations[1]).toEqual({
      item: 'dimension',
      kind: 'setting',
      category: 'binding',
      domain: {
        kind: 'open',
        schema: {
          type: 'object',
          properties: { [member]: { enum: values } },
          required: [member],
          additionalProperties: false,
        },
      },
      default: dimension,
    })
  })
it('LE-BODY-IDENTITY: exact codepoint name, no builtin asset reference or implicit defaults', () => {
  const authored = {
    name: 'é',
    position: 'before_action',
    power: 'veto',
    implementation: {
      kind: 'builtin',
      builtinName: 'tenant:implementation-is-not-asset-reference',
    },
  }
  expect(loopExtensionBodyContract.judge(authored, { capabilityName: 'é' })).toEqual({
    rejected: 'malformed',
  })
  expect(loopExtensionBodyContract.judge(authored, { capabilityName: 'é' })).toEqual({ ok: true })
  expect(loopExtensionBodyContract.references(json(JSON.stringify(authored)))).toEqual([])
  expect(authored).not.toHaveProperty('onError')
  expect(loopExtensionBodyContract.judge({}, { definition: 'EnvironmentHandle' })).toEqual({
    rejected: 'malformed',
  })
  expect(loopExtensionBodyContract.judge('env_1', { definition: 'EnvironmentHandle' })).toEqual({
    ok: true,
  })
  expect(() => loopExtensionBodyContract.judge({}, { definition: 'NoSuchDef' })).toThrow(TypeError)
  expect(() => loopExtensionBodyContract.deriveDeclarations({})).toThrow(TypeError)
  expect(() => loopExtensionBodyContract.references({})).toThrow(TypeError)
})
it('LE-BODY-OPAQUE: no execution environment resolving export or mutable schema', async () => {
  const api = await import('../src/index.ts')
  expect(Object.keys(api).some(name => /resolve|environment/i.test(name))).toBe(false)
  expect(Object.isFrozen(loopExtensionBodyContract)).toBe(true)
  expect(Object.isFrozen(loopExtensionBodyContract.schema)).toBe(true)
})
