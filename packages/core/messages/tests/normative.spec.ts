import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import {
  validate,
  SCHEMA_DEF_NAMES,
  judgeMessage,
  judgeModelInvocationRecord,
  type SchemaDefName,
} from '@omne-harness-lite/messages'

const design = new URL('../../../../.meta_harness/design/', import.meta.url)
const examples = readFileSync(new URL('spec/data/messages/v2/examples.md', design), 'utf8')
interface Row {
  readonly line: number
  readonly def: SchemaDefName
  readonly value: unknown
  readonly schema: boolean
  readonly rejection?: string
  readonly label: string
}
const rows: Row[] = []
function legacyDispatch(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    'kind' in value &&
    value.kind === 'model_call_dispatched'
  )
}
let def: SchemaDefName = 'Message'
let section = ''
for (const [index, line] of examples.split('\n').entries()) {
  if (line.startsWith('## ')) section = line
  const target = line.match(/校验对象.*\$defs\/([A-Za-z]+)/)?.[1]
  if (target !== undefined) {
    const found = SCHEMA_DEF_NAMES.find(name => name === target)
    if (found === undefined) throw new Error(`unknown normative target ${target}`)
    def = found
  }
  const normal = line.match(/^\| `(.+)` \| (通过|拒绝) \| ([^|]+) \| (.*)\|$/)
  const scene = section.startsWith('## 11.') ? line.match(/^\| m[1-5] \| `(.+)` \|$/) : undefined
  if (normal == null && scene == null) continue
  const text = normal?.[1] ?? scene?.[1]
  if (text === undefined) throw new Error('missing example text')
  const read = readJsonStrict(text)
  if ('failed' in read) throw new Error(`invalid normative JSON line ${index + 1}`)
  const rejection = normal?.[3]?.trim().replaceAll('`', '')
  rows.push({
    line: index + 1,
    def: scene === null || scene === undefined ? def : 'Message',
    value: read.ok,
    schema: normal === null || normal === undefined || normal[2] === '通过',
    ...(rejection === undefined || rejection === '—' ? {} : { rejection }),
    label: normal?.[4] ?? 'five-message scene',
  })
}

describe('V-1 frozen normative rows', () => {
  it('collects exactly the declared 142 rows (57 shape passes and 85 shape failures)', () => {
    expect(rows).toHaveLength(142)
    expect(rows.filter(row => row.schema)).toHaveLength(57)
  })
  for (const row of rows)
    it(`V1 line ${row.line} ${row.def}`, () => {
      expect(validate(row.def, row.value).valid).toBe(
        row.def === 'ModelInvocationRecord' && legacyDispatch(row.value) ? false : row.schema,
      )
    })
  it('has exactly 43 public definitions and the Schema is frozen-byte identical', () => {
    const original = readFileSync(new URL('spec/data/messages/v3/messages.schema.json', design))
    const copied = readFileSync(new URL('../schema/v3/messages.schema.json', import.meta.url))
    expect(copied.equals(original)).toBe(true)
    expect(createHash('sha256').update(copied).digest('hex')).toBe(
      '5e832dccf0b5a88387d1b71c064331f81fe9251b5ff87bd1c6ab4151b5862005',
    )
    expect(SCHEMA_DEF_NAMES).toHaveLength(43)
  })
})
describe('V-2/V-3 first-stage rejection and full record constraints', () => {
  for (const row of rows.filter(
    row => row.def === 'Message' || row.def === 'ModelInvocationRecord',
  )) {
    it(`V2 line ${row.line} ${row.def}`, () => {
      const actual =
        row.def === 'Message' ? judgeMessage(row.value) : judgeModelInvocationRecord(row.value)
      // S-49's shape-valid requested mismatch is explicitly a writer violation in this row.
      const expected =
        row.def === 'ModelInvocationRecord' && legacyDispatch(row.value)
          ? 'malformed'
          : row.rejection
      expect('rejected' in actual ? actual.rejected : undefined).toBe(expected)
    })
  }
})
