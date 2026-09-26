import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { SCHEMA_DEF_NAMES, schemaId, validate, judgeValue } from '../src/index.ts'
import schema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import fixture from './normative-examples.json' with { type: 'json' }

describe('frozen normative instances', () => {
  it('LE-FROZEN: full bytes, registry digest and all 42 definitions', () => {
    const local = readFileSync(new URL('../schema/loop-extension.schema.json', import.meta.url))
    const original = readFileSync(
      new URL(
        '../../../../.meta_harness/design/spec/data/loop-extension/v3/loop-extension.schema.json',
        import.meta.url,
      ),
    )
    expect(local.equals(original)).toBe(true)
    expect(createHash('sha256').update(local).digest('hex')).toBe(
      'cc6c0bee411e7044166be429cd0e7701b92f0938b42d1a2f0ec86da4b8411b9f',
    )
    expect(SCHEMA_DEF_NAMES).toHaveLength(42)
    expect([...SCHEMA_DEF_NAMES].sort()).toEqual(Object.keys(schema.$defs).sort())
    expect(schemaId).toBe(schema.$id)
    expect(fixture.section_counts).toEqual({ 1: 14, 2: 27, 3: 19, 4: 15, 5: 18, 7: 11 })
    expect(fixture.code_blocks).toBe(11)
    expect(fixture.rows).toHaveLength(115)
  })
  for (const row of fixture.rows)
    it(`${row.id}: frozen line ${row.line}`, () => {
      const definition = SCHEMA_DEF_NAMES.find(name => name === row.definition)
      if (definition === undefined) throw new Error(`unknown fixture definition ${row.definition}`)
      const parsed = readJsonStrict(row.text)
      if ('failed' in parsed) throw new Error(`invalid frozen fixture ${row.id}`)
      const before = writeJsonLossless(parsed.ok)
      expect(validate(definition, parsed.ok).valid).toBe(row.schema)
      const result = judgeValue(definition, parsed.ok)
      if (row.rejection === null) expect(result).toHaveProperty('ok')
      else expect(result).toEqual({ rejected: row.rejection })
      expect(writeJsonLossless(parsed.ok)).toBe(before)
    })
  it('LE-REGISTRY: invalid definition names are configuration errors', () => {
    // @ts-expect-error invalid fixed definition
    expect(() => validate('Unknown', {})).toThrow(TypeError)
  })
})
