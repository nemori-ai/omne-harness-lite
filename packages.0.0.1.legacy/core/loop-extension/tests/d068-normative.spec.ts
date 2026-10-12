import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { SCHEMA_DEF_NAMES, validate, judgeValue } from '@omne-harness-lite/loop-extension'

import rows from './fixtures/narrow-revision-examples.json' with { type: 'json' }

describe('D068 data.loop-extension/3 normative adoption cases', () => {
  it('covers every accepted v3 appendix instance without relabeling the retained v2 cases', () => {
    expect(rows).toHaveLength(4)
  })
  for (const row of rows)
    it(`D068 ${row.title}`, () => {
      const definition = SCHEMA_DEF_NAMES.find(name => name === row.definition)
      const source = row.source
      if (definition === undefined || source === undefined)
        throw new Error('invalid normative metadata')
      const parsed = readJsonStrict(source)
      if ('failed' in parsed) throw new Error('invalid normative JSON')
      const before = writeJsonLossless(parsed.ok)
      expect(validate(definition, parsed.ok).valid).toBe(row.schema)
      const result = judgeValue(definition, parsed.ok)
      // Dispatch restrictions belong to the runtime consumer, not a new data rejection.
      if (row.result === '—' || row.result === '禁止派发') expect(result).toHaveProperty('ok')
      else expect(result).toMatchObject({ rejected: row.result })
      expect(writeJsonLossless(parsed.ok)).toBe(before)
    })
})
