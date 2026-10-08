import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { judgeAccountValue, validate } from '../src/index.ts'
import { examples } from './fixtures.ts'
describe('V1/V2 frozen normative examples', () => {
  it('extracts all 116 rows rather than accepting an empty suite', () =>
    expect(examples).toHaveLength(116))
  for (const row of examples) {
    it(`${row.kind} examples:${row.line} Schema`, () => {
      const parsed = readJsonStrict(row.source)
      expect(parsed).toHaveProperty('ok')
      if ('failed' in parsed) throw new Error(parsed.failed)
      expect(validate(row.kind, parsed.ok).valid).toBe(row.schema)
    })
    it(`${row.kind} examples:${row.line} ordered judgment`, () => {
      const parsed = readJsonStrict(row.source)
      if ('failed' in parsed) throw new Error(parsed.failed)
      expect(judgeAccountValue(row.kind, parsed.ok)).toEqual(
        row.judgment.startsWith('合法') ? { ok: true } : { rejected: row.judgment },
      )
    })
  }
  it('copies the frozen Schema byte-for-byte', () => {
    const packaged = readFileSync(new URL('../schema/call-accounts.schema.json', import.meta.url))
    expect(createHash('sha256').update(packaged).digest('hex')).toBe(
      '710a589f5692edfd4d5d474ff9fd5df6320dd98ffba7f4c711b50c8fb1dab368',
    )
  })
})
