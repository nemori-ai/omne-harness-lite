import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  judgeModelResponse as judgeV4,
  validate as validateV4,
} from '@omne-harness-lite/model-response'
import {
  judgeModelResponse,
  SCHEMA_DEF_NAMES,
  schemaId,
  validate,
  type SchemaDefName,
} from '@omne-harness-lite/model-response/v5'
import schema from '@omne-harness-lite/model-response/schema/v5' with { type: 'json' }

const sourcePath = new URL(
  '../../../../.meta_harness/design/spec/data/model-response/v5/examples.md',
  import.meta.url,
)
const source = readFileSync(sourcePath, 'utf8')
const sections = [
  source.slice(source.indexOf('## 一、'), source.indexOf('## 三、')),
  source.slice(source.indexOf('## v3 窄修订'), source.indexOf('## 六、')),
  source.slice(source.indexOf('## 六、'), source.indexOf('## 七、')),
  source.slice(source.indexOf('## 七、'), source.indexOf('### MR5-H4')),
]
type Row = {
  readonly id: string
  readonly line: number
  readonly value: JsonValue
  readonly schemaValid: boolean
  readonly judgment: string | undefined
}
function parse(value: string): JsonValue {
  const parsed = readJsonStrict(value)
  if ('failed' in parsed) throw new Error(`invalid normative JSON: ${parsed.failed}`)
  return parsed.ok
}
function rowsIn(section: string, kind: number): Row[] {
  return [...section.matchAll(/```json\n([\s\S]*?)\n```/gu)].flatMap(match => {
    const literal = match[1]
    if (literal === undefined || !literal.trimStart().startsWith('{')) return []
    const before = section.slice(0, match.index)
    const heading = [...before.matchAll(/^### (.+)$/gmu)].at(-1)
    if (heading === undefined || heading[1] === undefined)
      throw new Error('normative JSON without heading')
    const local = before.slice(heading.index)
    const line = source.slice(0, source.indexOf(section) + match.index).split('\n').length
    const id = `${heading[1]} @ ${line}`
    let schemaValid: boolean
    let judgment: string | undefined
    if (kind === 0) {
      const result = local.match(/预期：`(通过|拒绝：([^`]+))`/u)
      if (result === null) throw new Error(`${id}: missing expected outcome`)
      schemaValid = result[1] === '通过'
      judgment = schemaValid ? 'ok' : result[2]
    } else if (kind === 1) {
      const result = local.match(/预期 Schema：`(通过|拒绝)`；契约结果：`([^`]+)`/u)
      if (result === null) throw new Error(`${id}: missing v3 expectation`)
      schemaValid = result[1] === '通过'
      judgment = result[2] === '—' ? undefined : result[2]
    } else if (kind === 2) {
      const result = local.match(/预期 Schema：`(通过|拒绝)`；纯判定：`([^`]+)`/u)
      if (result === null) throw new Error(`${id}: missing v4 expectation`)
      schemaValid = result[1] === '通过'
      judgment = result[2] === '通过' ? 'ok' : result[2]
    } else {
      const result = local.match(/预期：`(通过|拒绝：([^`]+))`/u)
      if (result === null) throw new Error(`${id}: missing v5 expectation`)
      schemaValid = result[1] === '通过'
      judgment = schemaValid ? 'ok' : result[2]
    }
    return [{ id, line, value: parse(literal), schemaValid, judgment }]
  })
}
const rows = sections.flatMap((section, kind) => rowsIn(section, kind))

describe('MR5 all complete normative examples', () => {
  it('accounts for 42 + 4 + 12 + 19 source examples and all independent expectations', () => {
    expect(sections.map((section, kind) => rowsIn(section, kind).length)).toEqual([42, 4, 12, 19])
    expect(rows).toHaveLength(77)
    expect(rows.filter(row => row.schemaValid)).toHaveLength(27)
    expect(rows.filter(row => !row.schemaValid)).toHaveLength(50)
    expect(rows.filter(row => row.judgment !== undefined)).toHaveLength(75)
  })
  for (const row of rows)
    it(row.id, () => {
      const before = writeJsonLossless(row.value)
      expect(validate('ModelResponse', row.value).valid).toBe(row.schemaValid)
      if (row.judgment !== undefined)
        expect(judgeModelResponse(row.value)).toEqual(
          row.judgment === 'ok' ? { ok: true } : { rejected: row.judgment },
        )
      expect(writeJsonLossless(row.value)).toBe(before)
    })
  it('keeps the frozen complete resource and all seventeen definitions', () => {
    const actual = readFileSync(new URL('../schema/v5/model-response.schema.json', import.meta.url))
    const original = readFileSync(
      new URL(
        '../../../../.meta_harness/design/spec/data/model-response/v5/model-response.schema.json',
        import.meta.url,
      ),
    )
    expect(actual.equals(original)).toBe(true)
    expect(createHash('sha256').update(actual).digest('hex')).toBe(
      'acfd0652805dcecc3e97b34a39375eda9042044fc42fe64b0dc83d1af18ec8d7',
    )
    expect(schemaId).toBe(schema.$id)
    expect(SCHEMA_DEF_NAMES).toEqual(Object.keys(schema.$defs))
    expect(SCHEMA_DEF_NAMES).toHaveLength(17)
    expect(Object.isFrozen(SCHEMA_DEF_NAMES)).toBe(true)
    expect(() => Reflect.apply(validate, undefined, ['Invented', null])).toThrow(TypeError)
  })
  it('accepts ordered mixed headers only through the explicit v5 surface', () => {
    const mixed = rows.find(row => row.id.startsWith('MR5-H1 · 混合字符串与数组'))
    if (mixed === undefined) throw new Error('missing mixed-header example')
    expect(validate('ModelResponse', mixed.value).valid).toBe(true)
    expect(judgeModelResponse(mixed.value)).toEqual({ ok: true })
    expect(validateV4('ModelResponse', mixed.value).valid).toBe(false)
    expect(judgeV4(mixed.value)).toEqual({ rejected: 'malformed' })
  })
})

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('expected normative object')
  return Object.fromEntries(Object.entries(value))
}
const mixed = rows.find(row => row.id.startsWith('MR5-H1 · 混合字符串与数组'))
if (mixed === undefined) throw new Error('missing mixed header fixture')
const base = record(mixed.value)
const raw = record(base.raw)
const headers = record(raw.headers)
const route = record(base.route)
const legalArray = { ...base, raw: { headers } }
const badHeader = { ...base, raw: { headers: { ...headers, 'x-bad': 4 } } }
const mismatchedRoute = {
  ...route,
  adaptation: {
    ...record(route.adaptation),
    configuration: { revision: 'other', values: {} },
  },
}
const complete = rows.find(row => row.id.startsWith('E-1 正常收尾'))
if (complete === undefined) throw new Error('missing complete fixture')
const completeValue = record(complete.value)

describe('MR5 every public definition compiles on first validation', () => {
  const completeCall = record(completeValue.call)
  const completeRoute = record(completeValue.route)
  const positives: Record<SchemaDefName, unknown> = {
    ResponseId: completeValue.id,
    RunId: completeCall.runId,
    AttemptId: completeValue.attemptId,
    ModelCallId: completeCall.callId,
    ReplyDisposition: completeValue.replyDisposition,
    ModelCallRef: completeValue.call,
    SelectedBy: completeRoute.selectedBy,
    CredentialScope: completeRoute.credentialScope,
    Route: completeValue.route,
    ParameterAdjustment: { name: 'extra', requested: null, sent: { nested: true } },
    ResponseOutcome: completeValue.outcome,
    UpstreamError: { raw: null },
    Failure: { cause: 'request_rejected', statusCode: 429 },
    Timing: completeValue.timing,
    RawHeaders: headers,
    RawResponse: { headers },
    ModelResponse: complete.value,
  }
  for (const name of SCHEMA_DEF_NAMES)
    it(name, () => {
      expect(validate(name, positives[name])).toEqual({ valid: true })
      expect(validate(name, null)).toEqual({ valid: false })
    })
})

describe('MR5 fixed precedence and lossless pure admission', () => {
  const order: readonly [string, unknown, string][] = [
    ['outcome before bad header', { ...badHeader, outcome: 'future' }, 'outcome_unknown'],
    ['dispatch before bad header', { ...badHeader, dispatch: 0 }, 'dispatch_zero'],
    ['cause before bad header', { ...badHeader, failure: { cause: 'future' } }, 'cause_unknown'],
    ['bad header before reply missing', { ...badHeader, outcome: 'complete' }, 'malformed'],
    ['legal array before reply missing', { ...legalArray, outcome: 'complete' }, 'reply_missing'],
    [
      'legal array before reply ending',
      {
        ...completeValue,
        raw: { headers },
        reply: { ...record(completeValue.reply), ending: 'truncated_at_limit' },
      },
      'reply_ending_mismatch',
    ],
    [
      'inBand missing status after interrupted failure',
      { ...legalArray, failure: { cause: 'request_rejected', inBand: true } },
      'failure_on_interrupted',
    ],
    [
      'binding mismatch after missing reply',
      {
        ...legalArray,
        outcome: 'complete',
        route: mismatchedRoute,
      },
      'reply_missing',
    ],
    [
      'binding mismatch after member and named conditions',
      {
        ...legalArray,
        route: mismatchedRoute,
      },
      'malformed',
    ],
    [
      'legal array before first-token mismatch',
      {
        ...completeValue,
        raw: { headers },
        timing: {
          sentAt: record(completeValue.timing).sentAt,
          endedAt: record(completeValue.timing).endedAt,
        },
      },
      'first_token_inconsistent',
    ],
  ]
  for (const [name, value, rejection] of order)
    it(name, () => expect(judgeModelResponse(value)).toEqual({ rejected: rejection }))
  it('keeps complete Schema and ordered judge distinct for S-36 binding equality', () => {
    const value = {
      ...legalArray,
      route: {
        ...route,
        adaptation: {
          ...record(route.adaptation),
          configuration: { revision: 'other', values: {} },
        },
      },
    }
    expect(validate('ModelResponse', value).valid).toBe(true)
    expect(judgeModelResponse(value)).toEqual({ rejected: 'malformed' })
  })
  it('does not mutate mutable or deep frozen ordered arrays', () => {
    const mutable: unknown = JSON.parse(writeJsonLossless(mixed.value))
    const before = JSON.stringify(mutable)
    expect(judgeModelResponse(mutable)).toEqual({ ok: true })
    expect(JSON.stringify(mutable)).toBe(before)
    expect(Object.isFrozen(mixed.value)).toBe(true)
    expect(Object.isFrozen(record(record(record(mixed.value).raw).headers)['x-many'])).toBe(true)
    expect(judgeModelResponse(mixed.value)).toEqual({ ok: true })
    expect(writeJsonLossless(mixed.value)).toBe(writeJsonLossless(parse(before)))
  })
  it('never calls getters or toJSON and preserves foreign trap errors', () => {
    let calls = 0
    const getter = { ...base }
    Object.defineProperty(getter, 'extra', { enumerable: true, get: () => ++calls })
    const toJSON = { ...base }
    Object.defineProperty(toJSON, 'toJSON', { value: () => ++calls })
    expect(judgeModelResponse(getter)).toEqual({ rejected: 'malformed' })
    expect(judgeModelResponse(toJSON)).toEqual({ rejected: 'malformed' })
    expect(calls).toBe(0)
    const defect = new Error('foreign trap')
    const trapped = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw defect
        },
      },
    )
    expect(() => judgeModelResponse(trapped)).toThrow(defect)
    expect(() => validate('ModelResponse', trapped)).toThrow(defect)
  })
  it('retains adjacent huge integers, exact configuration and tiny cost values', () => {
    const exact = new LosslessNumber('9007199254740993')
    const oneLess = new LosslessNumber('9007199254740992')
    const adaptation = record(route.adaptation)
    const profileSnapshot = record(route.profileSnapshot)
    const configured = {
      ...adaptation,
      configuration: { revision: 'config-1', values: { n: exact } },
    }
    const withExact = {
      ...legalArray,
      dispatch: exact,
      attemptId: exact,
      route: {
        ...route,
        adaptation: configured,
        profileSnapshot: { ...profileSnapshot, adaptation: configured },
        parameters: { seed: exact },
      },
      cost: { cost_usd: new LosslessNumber('1e-400'), source: 'upstream_usage' },
    }
    expect(validate('ModelResponse', withExact).valid).toBe(true)
    expect(judgeModelResponse(withExact)).toEqual({ ok: true })
    expect(writeJsonLossless(withExact)).toContain('9007199254740993')
    expect(writeJsonLossless(withExact)).toContain('1e-400')
    const withMismatch = {
      ...withExact,
      route: {
        ...record(withExact.route),
        profileSnapshot: {
          ...profileSnapshot,
          adaptation: {
            ...adaptation,
            configuration: { revision: 'config-1', values: { n: oneLess } },
          },
        },
      },
    }
    expect(validate('ModelResponse', withMismatch).valid).toBe(true)
    expect(judgeModelResponse(withMismatch)).toEqual({ rejected: 'malformed' })
    expect(
      judgeModelResponse({
        ...withExact,
        cost: { cost_usd: new LosslessNumber('-1e-400'), source: 'upstream_usage' },
      }),
    ).toEqual({ rejected: 'malformed' })
  })
})
