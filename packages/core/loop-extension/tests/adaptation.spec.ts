import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
  LosslessNumber,
} from '@omne-harness-lite/content-blocks'
import { judgeValue, judgeInput, validate, SCHEMA_DEF_NAMES } from '../src/index.ts'
import { judgeValue as judgeV3 } from '@omne-harness-lite/loop-extension/v3'
import schema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import v3 from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import v2 from '@omne-harness-lite/loop-extension/schema/v2' with { type: 'json' }

const normative = new URL(
  '../../../../.meta_harness/design/spec/data/loop-extension/v4/',
  import.meta.url,
)
const examples = readFileSync(new URL('examples.md', normative), 'utf8')
const appendix = examples.slice(examples.indexOf('## 11.'))
const rows = [...appendix.matchAll(/^\| `([^`]+)` \| (通过|拒绝) \| ([^|]+) \|/gmu)]
function parsed(text: string): JsonValue {
  const result = readJsonStrict(text)
  if ('failed' in result) throw new Error('bad normative fixture')
  return result.ok
}
function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
test('all ten LC4 failure-binding examples remain normative', () => {
  expect(rows).toHaveLength(10)
})
for (const [index, row] of rows.entries())
  test(`LC4 example ${index + 1}`, () => {
    const text = row[1]
    if (text === undefined) throw new Error('missing fixture')
    const value = parsed(text)
    const before = writeJsonLossless(value)
    expect(validate('ExtensionInput', value).valid).toBe(row[2] === '通过')
    const result = judgeValue('ExtensionInput', value)
    if (row[3]?.trim() === '—') expect(result).toHaveProperty('ok')
    else expect(result).toEqual({ rejected: 'malformed' })
    expect(writeJsonLossless(value)).toBe(before)
  })
test('LC4 and explicitly retained schemas are exact resources; all 42 definitions compile', () => {
  for (const [version, resource, file] of [
    [4, schema, 'loop-extension.schema.json'],
    [3, v3, 'loop-extension.v3.schema.json'],
    [2, v2, 'loop-extension.v2.schema.json'],
  ] as const) {
    expect(readFileSync(new URL(`../schema/${file}`, import.meta.url))).toEqual(
      readFileSync(new URL(`../v${version}/loop-extension.schema.json`, normative)),
    )
    expect(resource.$id).toContain(`/v${version}/`)
  }
  expect(SCHEMA_DEF_NAMES).toHaveLength(42)
  for (const definition of SCHEMA_DEF_NAMES) expect(() => validate(definition, {})).not.toThrow()
  expect(v2.$defs.FailureCause.enum).toEqual(v3.$defs.FailureCause.enum)
})
test('a historical LC3 failure input cannot acquire bindings implicitly', () => {
  const text = rows[8]?.[1]
  if (text === undefined) throw new Error('missing historical fixture')
  expect(judgeV3('ExtensionInput', parsed(text))).toHaveProperty('ok')
  expect(judgeValue('ExtensionInput', parsed(text))).toEqual({ rejected: 'malformed' })
})
test('the public failure subject uses the same full single-record predicate as ExtensionInput', () => {
  const text = rows[6]?.[1]
  if (text === undefined) throw new Error('missing binding mismatch fixture')
  const value = parsed(text)
  if (!object(value) || !object(value.subject)) throw new Error('bad failure fixture')
  expect(validate('AfterModelCallFailureSubject', value.subject).valid).toBe(true)
  expect(judgeValue('AfterModelCallFailureSubject', value.subject)).toEqual({
    rejected: 'malformed',
  })
  expect(judgeInput(value)).toEqual({ rejected: 'malformed' })
})
