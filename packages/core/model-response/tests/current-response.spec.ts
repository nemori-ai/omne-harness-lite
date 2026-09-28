import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { isObject } from '../src/json.ts'
import {
  judgeModelResponse,
  judgePendingModelResponse,
  SCHEMA_DEF_NAMES,
  schemaId,
  validate,
} from '@omne-harness-lite/model-response'
import schema from '@omne-harness-lite/model-response/schema' with { type: 'json' }

const source = readFileSync(
  new URL(
    '../../../../.meta_harness/design/spec/data/model-response/v7/examples.md',
    import.meta.url,
  ),
  'utf8',
)

function parseJson(text: string): JsonValue {
  const result = readJsonStrict(text)
  if ('failed' in result)
    throw new Error(`invalid normative JSON: ${result.failed}; ${text.slice(0, 120)}`)
  return result.ok
}

function normativeSection(
  start: string,
  end: string,
): readonly {
  readonly name: string
  readonly body: string
  readonly values: readonly JsonValue[]
}[] {
  const section = source.slice(source.indexOf(start), source.indexOf(end))
  return section
    .split(/^### /mu)
    .slice(1)
    .map(chunk => {
      const line = chunk.indexOf('\n')
      return {
        name: chunk.slice(0, line),
        body: chunk.slice(line),
        values: [...chunk.matchAll(/```json\n([\s\S]*?)\n```/gu)].flatMap(match => {
          const literal = match[1]
          return literal?.trimStart().startsWith('{') ? [parseJson(literal)] : []
        }),
      }
    })
}

function object(value: JsonValue): JsonObject {
  if (!isObject(value)) throw new Error('expected normative object')
  return value
}

describe('MR7 exact public resource', () => {
  it('matches the accepted Schema bytes and compiles all definitions in its fixed closure', () => {
    const actual = readFileSync(new URL('../schema/model-response.schema.json', import.meta.url))
    const accepted = readFileSync(
      new URL(
        '../../../../.meta_harness/design/spec/data/model-response/v7/model-response.schema.json',
        import.meta.url,
      ),
    )
    expect(actual.equals(accepted)).toBe(true)
    expect(createHash('sha256').update(actual).digest('hex')).toBe(
      '69ebf2ea1ac34f7400aabb40d1e128740023ad6ead85ecaf6928340e254bb1f2',
    )
    expect(schemaId).toBe(schema.$id)
    expect(SCHEMA_DEF_NAMES).toEqual(Object.keys(schema.$defs))
    expect(SCHEMA_DEF_NAMES).toHaveLength(19)
    for (const name of SCHEMA_DEF_NAMES) expect(() => validate(name, null)).not.toThrow()
  })

  it('has no executable previous response subpath', () => {
    expect(() => import.meta.resolve('@omne-harness-lite/model-response/v3')).toThrow()
    expect(() => import.meta.resolve('@omne-harness-lite/model-response/v5')).toThrow()
    expect(() => import.meta.resolve('@omne-harness-lite/model-response/schema/v5')).toThrow()
  })
})

const accepted = normativeSection('## 一、合法实例', '## 二、非法实例')
const rejected = normativeSection('## 二、非法实例', '## 三、Schema 挡不住')

describe('MR7 persisted examples and ordered rejection', () => {
  const positives = accepted.flatMap(row => row.values.filter(value => 'id' in object(value)))
  it('covers complete, truncated, interrupted, failure, and repeated dispatch examples', () => {
    expect(positives.length).toBeGreaterThanOrEqual(12)
    for (const value of positives) {
      const before = writeJsonLossless(value)
      expect(validate('ModelResponse', value).valid).toBe(true)
      expect(judgeModelResponse(value)).toEqual({ ok: true })
      expect(writeJsonLossless(value)).toBe(before)
    }
  })

  it('preserves each named rejection from the accepted examples', () => {
    let checked = 0
    for (const row of rejected) {
      const expected = row.body.match(/预期：`拒绝：([a-z_]+)`/u)?.[1]
      if (expected === undefined) continue
      for (const value of row.values) {
        if (!Object.hasOwn(object(value), 'id')) continue
        const before = writeJsonLossless(value)
        expect(judgeModelResponse(value), row.name).toEqual({ rejected: expected })
        expect(writeJsonLossless(value)).toBe(before)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(29)
  })

  it('rejects a previous response shape missing the required input-limit facts', () => {
    const current = object(positives[0] ?? null)
    const route = object(current.route ?? null)
    const profileSnapshot = object(route.profileSnapshot ?? null)
    const { upstreamInputLimits: _removed, ...oldSnapshot } = profileSnapshot
    expect(
      judgeModelResponse({ ...current, route: { ...route, profileSnapshot: oldSnapshot } }),
    ).toEqual({
      rejected: 'malformed',
    })
  })
})

const pendingCases: Readonly<Record<string, 'ok' | string>> = {
  'MR7-complete': 'ok',
  'MR7-truncated': 'ok',
  'MR7-interrupted': 'ok',
  'MR7-forbidden_replyDisposition': 'malformed',
  'MR7-forbidden_late': 'malformed',
  'MR7-forbidden_outcome': 'malformed',
  'MR7-missing_reply': 'malformed',
  'MR7-ending_mismatch': 'reply_ending_mismatch',
  'MR7-missing_first_token': 'first_token_inconsistent',
  'MR7-ordered_headers': 'ok',
  'MR7-missing_limits': 'malformed',
  'MR7-runtime_lost_reply': 'malformed',
}

describe('MR7 retained current facts and multi-value headers', () => {
  const v3Rows = normativeSection('## v3 窄修订的规范对照', '## 六、v4 适配绑定')
  const v4Rows = normativeSection('## 六、v4 适配绑定', '## 七、v5 多值响应头')
  const headerRows = normativeSection('## 七、v5 多值响应头', '## 六、v6 待提交投影')

  it('keeps all current complete normative examples, including binding equality and header order', () => {
    let counts = [0, 0, 0]
    for (const [kind, rows] of [v3Rows, v4Rows, headerRows].entries()) {
      for (const row of rows) {
        let schemaPass: boolean
        let judgment: string | undefined
        if (kind === 0) {
          const expected = row.body.match(/预期 Schema：`(通过|拒绝)`；契约结果：`([^`]+)`/u)
          if (expected === null) continue
          schemaPass = expected[1] === '通过'
          judgment = expected[2] === '—' ? undefined : expected[2]
        } else if (kind === 1) {
          const expected = row.body.match(/预期 Schema：`(通过|拒绝)`；纯判定：`([^`]+)`/u)
          if (expected === null) continue
          schemaPass = expected[1] === '通过'
          judgment = expected[2] === '通过' ? 'ok' : expected[2]
        } else {
          const expected = row.body.match(/预期：`(通过|拒绝：([^`]+))`/u)
          if (expected === null) continue
          schemaPass = expected[1] === '通过'
          judgment = schemaPass ? 'ok' : expected[2]
        }
        for (const value of row.values) {
          const before = writeJsonLossless(value)
          expect(validate('ModelResponse', value).valid, row.name).toBe(schemaPass)
          if (judgment !== undefined)
            expect(judgeModelResponse(value), row.name).toEqual(
              judgment === 'ok' ? { ok: true } : { rejected: judgment },
            )
          expect(writeJsonLossless(value)).toBe(before)
          counts[kind] = (counts[kind] ?? 0) + 1
        }
      }
    }
    expect(counts).toEqual([4, 12, 19])
  })
})

describe('MR7 S-39 pending reply', () => {
  const rows = normativeSection('## 六、v6 待提交投影与新版本边界', '## 七、MR7 与 LC6')
  const complete = rows.find(row => row.name === 'MR7-complete')?.values[0]

  it('uses the same leading rejection priority before pending member conditions', () => {
    const value = object(complete ?? null)
    expect(judgePendingModelResponse({ ...value, outcome: 'future', dispatch: 0 })).toEqual({
      rejected: 'outcome_unknown',
    })
    expect(
      judgePendingModelResponse({ ...value, dispatch: 0, failure: { cause: 'future' } }),
    ).toEqual({
      rejected: 'dispatch_zero',
    })
    expect(judgePendingModelResponse({ ...value, failure: { cause: 'future' } })).toEqual({
      rejected: 'cause_unknown',
    })
  })

  it('covers all twelve normative pending examples without adding a disposition', () => {
    const covered = new Set<string>()
    for (const row of rows) {
      const expected = pendingCases[row.name]
      if (expected === undefined) continue
      expect(row.values, row.name).toHaveLength(1)
      const value = row.values[0]
      if (value === undefined) throw new Error(`missing ${row.name}`)
      const before = writeJsonLossless(value)
      expect(judgePendingModelResponse(value), row.name).toEqual(
        expected === 'ok' ? { ok: true } : { rejected: expected },
      )
      expect(validate('PendingModelResponse', value).valid, row.name).toBe(expected === 'ok')
      if (expected === 'ok') expect(validate('ModelResponse', value).valid).toBe(false)
      expect(writeJsonLossless(value)).toBe(before)
      covered.add(row.name)
    }
    expect(covered).toEqual(new Set(Object.keys(pendingCases)))
  })
})
