import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import fixtures from './examples.json' with { type: 'json' }
import { createAssetModelJudge, SCHEMA_DEF_NAMES } from '../src/index.ts'
import { bodies } from './ports.ts'

const judge = createAssetModelJudge(bodies)
describe('frozen examples sections 1–14: Schema and local receiving boundary', () => {
  it.each(fixtures)('$id [$def; $scope]', fixture => {
    const name = SCHEMA_DEF_NAMES.find(candidate => candidate === fixture.def)
    if (name === undefined) throw new Error('unknown fixture definition')
    const before = writeJsonLossless(fixture.value)
    expect(judge.validate(name, fixture.value).valid).toBe(fixture.schema)
    if (fixture.scope === 'local')
      expect(judge.judgeAssetValue(name, fixture.value)).toEqual(
        fixture.rejection === null ? { ok: true } : { rejected: fixture.rejection },
      )
    // External rows test their local shape only; their actual contextual duties remain external.
    expect(writeJsonLossless(fixture.value)).toBe(before)
  })
  it('contains exactly the 14 prescribed priority regressions and accounts for every section', () => {
    expect(fixtures.filter(fixture => fixture.id.startsWith('13.'))).toHaveLength(14)
    for (let section = 1; section <= 14; section++)
      expect(fixtures.some(fixture => fixture.id.startsWith(`${section}.`))).toBe(true)
    expect(fixtures.filter(fixture => fixture.scope === 'external')).toHaveLength(15)
  })
})
