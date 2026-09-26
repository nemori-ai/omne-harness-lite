import { expect, it } from 'vitest'
import { createAssetModelJudge, SCHEMA_DEF_NAMES, schemaId } from '@omne-harness-lite/asset-model'
import modelSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import retainedModelSchema from '@omne-harness-lite/asset-model/schema/v2' with { type: 'json' }
import toolSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import loopSchema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import {
  judgeContentBlock,
  toOpaqueJson,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import {
  defaultBodyContracts,
  evaluate,
  evaluationInputFingerprint,
  type NonConnectorEvaluationInput,
} from '../src/index.ts'
import { cap, definition, holding, root, simple, tool } from './fixtures.ts'

it('D068 current AM3 and TD3/Loop3 ports retain a complete AM2 resource and compile every AM3 definition', () => {
  expect(schemaId).toBe(modelSchema.$id)
  expect(modelSchema.$id).toContain('/v3/')
  expect(retainedModelSchema.$id).toContain('/v2/')
  expect(Object.keys(modelSchema.$defs).sort()).toEqual([...SCHEMA_DEF_NAMES].sort())
  expect(SCHEMA_DEF_NAMES).toHaveLength(25)
  expect(defaultBodyContracts.tool.schema).toHaveProperty('$id', toolSchema.$id)
  expect(defaultBodyContracts.loop_extension.schema).toHaveProperty('$id', loopSchema.$id)
  expect(toolSchema.$id).toContain('/v3/')
  expect(loopSchema.$id).toContain('/v3/')
  for (const category of ['skill', 'mcp', 'slash_command'] as const) {
    const resource = defaultBodyContracts[category].schema
    if (typeof resource === 'boolean') throw new Error('fixed body Schema is an object resource')
    expect(resource.$id).toContain('/v2/')
  }
  const model = createAssetModelJudge(defaultBodyContracts)
  for (const name of SCHEMA_DEF_NAMES) expect(() => model.validate(name, {}), name).not.toThrow()
})

for (const [label, name, rejection] of [
  ['128 literal characters', 'a'.repeat(128), undefined],
  ['129 literal characters', 'a'.repeat(129), 'malformed'],
  ['colon transliteration reaches 128', `${'a'.repeat(125)}:b`, undefined],
  ['colon transliteration exceeds 128', `${'a'.repeat(126)}:b`, 'malformed'],
  ['reserved adjacent sequence', 'a__b', 'name_reserved_sequence'],
] as const)
  it(`current real TD3 rejection reaches AM3 and AE3: ${label}`, () => {
    const capability = cap('tool', name)
    const base = simple()
    const entry = definition('ast_v3_tool', capability, tool(name))
    const input: NonConnectorEvaluationInput = {
      ...base,
      definitions: [base.definitions[0] ?? entry, entry],
      holdings: [holding('factory', root, 'ast_root'), holding('factory', capability, entry.id)],
      root: { definition: root, references: [{ capability }] },
    }
    const body = createAssetModelJudge(defaultBodyContracts).judgeAssetValue(
      'AssetDefinition',
      entry,
    )
    const result = evaluate(input)
    if (rejection !== undefined) {
      expect(body).toEqual({ rejected: rejection })
      expect(result).toHaveProperty('invalidInput.diagnostics.0.condition', 'C1')
      expect(result).toHaveProperty('invalidInput.diagnostics.0.rejected', rejection)
      expect(result).not.toHaveProperty('ok')
    } else {
      expect(body).toEqual({ ok: true })
      expect(result).toHaveProperty('ok.composition', [capability])
    }
  })

it('a CB3 bad-name call in opaque root JSON remains data while the full input fingerprint observes it', () => {
  const base = simple()
  const record = base.definitions[0]
  if (record === undefined) throw new Error('fixture absent')
  const raw = {
    kind: 'tool_call',
    id: 'block_opaque',
    callId: 'call_opaque',
    name: 'bad/name',
    arguments: {},
  }
  expect(judgeContentBlock(raw)).toHaveProperty('rejected')
  const withBody = (name: string): NonConnectorEvaluationInput => {
    return {
      ...base,
      definitions: [
        {
          ...record,
          versions: record.versions.map(version => ({
            ...version,
            content: { category: 'agent_definition', body: toOpaqueJson({ ...raw, name }) },
          })),
        },
        ...base.definitions.slice(1),
      ],
    }
  }
  const first = withBody('bad/name')
  const before = writeJsonLossless(first)
  expect(evaluate(first)).toEqual(evaluate(base))
  expect(evaluationInputFingerprint(first)).not.toBe(
    evaluationInputFingerprint(withBody('also/bad')),
  )
  expect(writeJsonLossless(first)).toBe(before)
  expect(Object.isFrozen(first)).toBe(false)
})
