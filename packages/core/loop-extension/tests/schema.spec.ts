import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { SCHEMA_DEF_NAMES, schemaId, validate, judgeValue } from '../src/index.ts'
import schema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import fixture from './normative-examples.json' with { type: 'json' }

describe('frozen normative instances', () => {
  it('LE-FROZEN: LC6 full bytes and all 43 definitions', () => {
    const local = readFileSync(new URL('../schema/loop-extension.schema.json', import.meta.url))
    const original = readFileSync(
      new URL(
        '../../../../.meta_harness/design/spec/data/loop-extension/v6/loop-extension.schema.json',
        import.meta.url,
      ),
    )
    expect(local.equals(original)).toBe(true)
    expect(createHash('sha256').update(local).digest('hex')).toBe(
      '5c74a3d0827449f3eb32b0c4468c410c78ef9714026bfb0801d4c6e361858727',
    )
    expect(SCHEMA_DEF_NAMES).toHaveLength(43)
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
      const oldShape = ['LE-V1-3-01', 'LE-V1-3-12', 'LE-V1-6-JSON-11'].includes(row.id)
      expect(validate(definition, parsed.ok).valid).toBe(oldShape ? false : row.schema)
      const result = judgeValue(definition, parsed.ok)
      if (oldShape) expect(result).toEqual({ rejected: 'malformed' })
      else if (row.rejection === null) expect(result).toHaveProperty('ok')
      else expect(result).toEqual({ rejected: row.rejection })
      expect(writeJsonLossless(parsed.ok)).toBe(before)
    })
  it('LE-REGISTRY: invalid definition names are configuration errors', () => {
    // @ts-expect-error invalid fixed definition
    expect(() => validate('Unknown', {})).toThrow(TypeError)
  })
})
