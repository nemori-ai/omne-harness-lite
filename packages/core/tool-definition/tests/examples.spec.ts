import { assertToolSchemaTransition } from './schema-transition.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import frozen from './examples-fixtures.json' with { type: 'json' }
import schema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import {
  judgeToolDefinition,
  judgeToolReturn,
  isToolDefinition,
  validate,
  modelInput,
  modelEntry,
  createParameterJudge,
} from '../src/index.ts'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'

describe('frozen v2 normative examples', () => {
  for (const [index, value] of frozen.definitions.entries())
    it(`EX1-4 positive definition ${index}`, () =>
      expect(judgeToolDefinition(value)).toEqual({ ok: true }))
  for (const fixture of frozen.negativeDefinitions)
    it(`${fixture.id} named rejection and frozen Schema oracle`, () => {
      const result = judgeToolDefinition(fixture.value)
      expect(result).toMatchObject({
        rejected: fixture.rejected,
        ...('malformed' in fixture ? { malformed: fixture.malformed } : {}),
      })
      expect(validate('ToolDefinition', fixture.value).valid).toBe(fixture.schemaValid)
    })
  for (const [index, value] of frozen.positiveReturns.entries())
    it(`EX7 positive return ${index}`, () => expect(judgeToolReturn(value)).toEqual({ ok: true }))
  for (const fixture of frozen.negativeReturns)
    it(`${fixture.id} return rejection precedence`, () =>
      expect(judgeToolReturn(fixture.value)).toMatchObject({
        rejected: fixture.rejected,
        ...('malformed' in fixture ? { malformed: fixture.malformed } : {}),
      }))
  it('V1 adopted isError delta and unchanged Schema remainder, TD1 ModelToolName assertion copy equality', () => {
    const packaged = readFileSync(
      fileURLToPath(new URL('../schema/tool-definition.schema.json', import.meta.url)),
    )
    const normative = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../.meta_harness/design/spec/data/tool-definition/v3/tool-definition.schema.json',
          import.meta.url,
        ),
      ),
    )
    assertToolSchemaTransition(packaged, normative)
    const assertionFields = (definition: object) =>
      Object.fromEntries(
        Object.entries(definition).filter(
          ([key]) => !['title', 'description', '$comment', 'examples'].includes(key),
        ),
      )
    expect(assertionFields(schema.$defs.ModelToolName)).toEqual(
      assertionFields(contentSchema.$defs.ModelToolName),
    )
  })
  it('V2 exact multi input and both model entries', () => {
    const multi = frozen.definitions[2]
    const mcp = frozen.definitions[3]
    if (!isToolDefinition(multi) || !isToolDefinition(mcp))
      throw new Error('invalid normative fixture')
    expect(modelInput(multi)).toEqual(frozen.multiInput)
    expect(modelEntry(mcp)).toEqual(frozen.entries[0])
    expect(modelEntry(multi)).toEqual(frozen.entries[1])
    for (const entry of frozen.entries) expect(validate('ModelToolEntry', entry).valid).toBe(true)
    const entry = frozen.entries[0]
    if (entry === undefined) throw new Error('missing entry')
    expect(validate('ModelToolEntry', { ...entry, name: 'mcp:search' }).valid).toBe(false)
    expect(
      validate('ModelToolEntry', { name: entry.name, description: entry.description }).valid,
    ).toBe(false)
  })
  it('V2 provider shape examples only rename keys and add documented envelopes', () => {
    for (const [index, entry] of frozen.entries.entries()) {
      if (entry === undefined) throw new Error('missing entry')
      expect(frozen.providerShapes[index * 3]).toEqual({ type: 'function', ...entry })
      expect(frozen.providerShapes[index * 3 + 1]).toEqual({ type: 'function', function: entry })
      expect(frozen.providerShapes[index * 3 + 2]).toEqual({
        name: entry.name,
        description: entry.description,
        input_schema: entry.parameters,
      })
    }
  })
  it('M50 separate owners and schema content reuse have equal actual conclusions', () => {
    const first = createParameterJudge()
    const second = createParameterJudge()
    for (const fixture of [
      ...frozen.definitions,
      ...frozen.negativeDefinitions.map(value => value.value),
    ])
      expect(judgeToolDefinition(fixture, first)).toEqual(judgeToolDefinition(fixture, second))
    expect(judgeToolDefinition(frozen.definitions[0], second)).toEqual({ ok: true })
  })
  it('V1 JSON-value boundary rejects nonJSON values without dropping keys', () => {
    for (const value of [
      undefined,
      NaN,
      Infinity,
      new Date(),
      () => 1,
      { ...frozen.definitions[0], hidden: undefined },
    ])
      expect(judgeToolDefinition(value)).toMatchObject({ rejected: 'malformed', malformed: 'M1' })
    const parsed = readJsonStrict(
      '{"name":"t","description":"d","paradigm":"single","input":{"type":"object","properties":{}},"permissions":{"execute":{"default":"ask"}},"origin":{"kind":"authored"},"settings":{"concurrency":{"category":"preference","default":1e400}}}',
    )
    if ('failed' in parsed) throw new Error('invalid numeric fixture')
    expect(judgeToolDefinition(parsed.ok)).toEqual({ ok: true })
    expect(writeJsonLossless(parsed.ok)).toContain('1e400')
  })
})
