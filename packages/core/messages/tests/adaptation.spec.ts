import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeModelInvocationRecord, validate } from '@omne-harness-lite/messages'
import { judgeModelInvocationRecord as judgeV3 } from '@omne-harness-lite/messages/v3'

const examples = readFileSync(
  new URL('../../../../.meta_harness/design/spec/data/messages/v4/examples.md', import.meta.url),
  'utf8',
)
const appendix = examples.slice(examples.indexOf('## 15.'))
const rows = [...appendix.matchAll(/^\| `([^`]+)` \| (通过|拒绝) \| ([^|]+) \|/gmu)]

describe('D070 dispatched record binding', () => {
  it('covers all accepted binding examples including exact JSON equality', () => {
    expect(rows).toHaveLength(15)
  })
  for (const [index, row] of rows.entries())
    it(`accepted binding example ${index + 1}`, () => {
      const source = row[1]
      if (source === undefined) throw new Error('missing normative source')
      const parsed = readJsonStrict(source)
      if ('failed' in parsed) throw new Error(parsed.failed)
      const before = writeJsonLossless(parsed.ok)
      expect(validate('ModelInvocationRecord', parsed.ok).valid).toBe(row[2] === '通过')
      const result = judgeModelInvocationRecord(parsed.ok)
      if (row[3]?.trim() === '—') expect(result).toHaveProperty('ok')
      else expect(result).toEqual({ rejected: row[3]?.trim().replaceAll('`', '') })
      expect(writeJsonLossless(parsed.ok)).toBe(before)
    })
  it('requires an explicit version choice rather than filling a missing binding', () => {
    const row = rows[0]?.[1]
    if (row === undefined) throw new Error('missing normative fixture')
    const parsed = readJsonStrict(row)
    if ('failed' in parsed) throw new Error(parsed.failed)
    expect(judgeV3(parsed.ok)).toEqual({ rejected: 'malformed' })
  })
})
