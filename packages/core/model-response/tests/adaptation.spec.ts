import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { judgeModelResponse, validate } from '@omne-harness-lite/model-response'
import { judgeModelResponse as judgeV3 } from '@omne-harness-lite/model-response/v3'

const examples = readFileSync(
  new URL(
    '../../../../.meta_harness/design/spec/data/model-response/v4/examples.md',
    import.meta.url,
  ),
  'utf8',
)
const appendix = examples.slice(examples.indexOf('## 六、v4'))
const rows = [
  ...appendix.matchAll(
    /### (V4-E[^\n]+)\n\n预期 Schema：`(通过|拒绝)`；纯判定：`([^`]+)`[^\n]*\n\n```json\n([\s\S]*?)\n```/gu,
  ),
]

describe('D070 response binding and reported facts', () => {
  it('covers every accepted v4 response example', () => {
    expect(rows).toHaveLength(12)
  })
  for (const row of rows)
    it(`${row[1]}`, () => {
      const source = row[4]
      if (source === undefined) throw new Error('missing normative source')
      const parsed = readJsonStrict(source)
      if ('failed' in parsed) throw new Error(parsed.failed)
      const before = writeJsonLossless(parsed.ok)
      expect(validate('ModelResponse', parsed.ok).valid).toBe(row[2] === '通过')
      const result = judgeModelResponse(parsed.ok)
      expect(result).toEqual(row[3] === '通过' ? { ok: true } : { rejected: row[3] })
      expect(writeJsonLossless(parsed.ok)).toBe(before)
    })
  it.each([
    ['{"n":1,"x":[true,null]}', '{"x":[true,null],"n":1.0}', true],
    ['{"n":1}', '{"n":true}', false],
    ['{"n":9007199254740993}', '{"n":9007199254740992}', false],
    ['{"n":0.123456789012345678901}', '{"n":0.123456789012345678900}', false],
    ['{"n":9e1000}', '{"n":90e999}', true],
  ])('uses exact JSON equality for captured configuration %s / %s', (one, two, accepted) => {
    const source = rows[0]?.[4]
    if (source === undefined) throw new Error('missing normative fixture')
    const parsed = readJsonStrict(source),
      a = readJsonStrict(one),
      b = readJsonStrict(two)
    if ('failed' in parsed || 'failed' in a || 'failed' in b) throw new Error('fixture JSON')
    const original = object(parsed.ok)
    const route = object(original.route)
    const profileSnapshot = object(route.profileSnapshot)
    const response = {
      ...original,
      route: {
        ...route,
        adaptation: withValues(route.adaptation, a.ok),
        profileSnapshot: {
          ...profileSnapshot,
          adaptation: withValues(profileSnapshot.adaptation, b.ok),
        },
      },
    }
    const before = writeJsonLossless(response)
    expect(validate('ModelResponse', response).valid).toBe(true)
    expect(judgeModelResponse(response)).toEqual(
      accepted ? { ok: true } : { rejected: 'malformed' },
    )
    expect(writeJsonLossless(response)).toBe(before)
  })
  it('preserves the previous version reader as a separate contract consumer', () => {
    const source = rows[0]?.[4]
    if (source === undefined) throw new Error('missing normative source')
    const parsed = readJsonStrict(source)
    if ('failed' in parsed) throw new Error(parsed.failed)
    expect(judgeV3(parsed.ok)).toEqual({ rejected: 'malformed' })
  })
})

function object(value: unknown): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('fixture object')
  return value as JsonObject
}

function withValues(binding: unknown, values: JsonValue): JsonObject {
  const one = object(binding)
  return { ...one, configuration: { ...object(one.configuration), values } }
}
