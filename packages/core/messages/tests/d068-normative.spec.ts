import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { SCHEMA_DEF_NAMES, validate, judgeMessage } from '@omne-harness-lite/messages'

const examples = readFileSync(new URL('fixtures/reminder-examples.md', import.meta.url), 'utf8')
const appendix = examples.slice(examples.indexOf('## v3 窄修订'))
const rows = [
  ...appendix.matchAll(
    /### ([^\n]+)\n\n校验对象：`\$defs\/(\w+)`。预期 Schema：`(通过|拒绝)`；契约结果：`([^`]+)`[^\n]*\n\n```json\n([\s\S]*?)\n```/gu,
  ),
]

describe('D068 data.messages/3 normative adoption cases', () => {
  it('covers every accepted v3 appendix instance without relabeling the retained v2 cases', () => {
    expect(rows).toHaveLength(2)
  })
  for (const row of rows)
    it(`D068 ${row[1]}`, () => {
      const definition = SCHEMA_DEF_NAMES.find(name => name === row[2])
      const source = row[5]
      if (definition === undefined || source === undefined)
        throw new Error('invalid normative metadata')
      const parsed = readJsonStrict(source)
      if ('failed' in parsed) throw new Error('invalid normative JSON')
      const before = writeJsonLossless(parsed.ok)
      expect(validate(definition, parsed.ok).valid).toBe(row[3] === '通过')
      const result = judgeMessage(parsed.ok)
      // Dispatch restrictions belong to the runtime consumer, not a new data rejection.
      if (row[4] === '—' || row[4] === '禁止派发') expect(result).toHaveProperty('ok')
      else expect(result).toMatchObject({ rejected: row[4] })
      expect(writeJsonLossless(parsed.ok)).toBe(before)
    })
})
