import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  judgeArrivalEnvelope,
  SCHEMA_DEF_NAMES,
  validate,
  type SchemaDefName,
} from '../src/index.ts'
import { json, modelTarget, frameTarget, visibility, cost, usage } from './fixtures.ts'

const text = readFileSync(
  new URL(
    '../../../../.meta_harness/design/spec/data/arrival-events/v2/examples.md',
    import.meta.url,
  ),
  'utf8',
)
interface Row {
  readonly section: number
  readonly row: number
  readonly value: unknown
  readonly def: SchemaDefName
  readonly shape: boolean
  readonly rejection: string | undefined
}
const definitions: readonly SchemaDefName[] = [
  'ArrivalTarget',
  'OpenEvent',
  'BlockHead',
  'FillEvent',
  'CloseEvent',
  'TrimEvent',
  'AccountEvent',
  'FinishEvent',
  'ArrivalEnvelope',
]
const rows: Row[] = []
let section = 0
let ordinal = 0
for (const line of text.split('\n')) {
  const heading = /^## (\d+)\./u.exec(line)
  if (heading !== null) {
    section = Number(heading[1])
    ordinal = 0
  }
  const match = /^\| `(.+)` \| (通过|拒绝) \| (.+?) \|/u.exec(line)
  if (section < 1 || section > 9 || match === null) continue
  ordinal++
  const def =
    section === 3 && [2, 3, 6].includes(ordinal) ? 'PresentationHint' : definitions[section - 1]
  if (def === undefined || match[1] === undefined) throw new Error('missing normative definition')
  rows.push({
    section,
    row: ordinal,
    value: json(match[1]),
    def,
    shape: match[2] === '通过',
    rejection: /`([a-z_]+)`/u.exec(match[3] ?? '')?.[1],
  })
}
function wrap(row: Row): unknown {
  if (row.def === 'ArrivalEnvelope') return row.value
  if (row.def === 'ArrivalTarget')
    return { target: row.value, event: { t: 'finish', reason: 'end' } }
  if (row.def === 'BlockHead' || row.def === 'PresentationHint')
    return {
      target: modelTarget,
      event: {
        t: 'open',
        kind: 'file',
        fill: 'replace',
        index: 0,
        id: 'b_1',
        visibility,
        head: row.def === 'BlockHead' ? row.value : { presentation: row.value },
      },
    }
  return { target: modelTarget, event: row.value }
}
describe('V-1/V-2 frozen examples sections 1–9, exact schema and owned rejection columns', () => {
  test('all 77 rows loaded, 29 positive and 48 negative', () => {
    expect(rows).toHaveLength(77)
    expect(rows.filter(row => row.shape)).toHaveLength(29)
  })
  for (const row of rows) {
    test(`shape §${row.section} row${row.row} ${row.def}`, () =>
      expect(validate(row.def, row.value).valid).toBe(row.shape))
    test(`judge §${row.section} row${row.row} ${row.rejection ?? 'ok'}`, () => {
      expect(judgeArrivalEnvelope(wrap(row))).toEqual(
        row.rejection === undefined ? { ok: true } : { rejected: row.rejection },
      )
    })
  }
  test('all 14 exported definitions equal frozen Schema keys', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../schema/arrival-events.schema.json', import.meta.url), 'utf8'),
    )
    expect([...SCHEMA_DEF_NAMES].sort()).toEqual(Object.keys(schema.$defs).sort())
  })
  test('Schema byte identity with accepted resource', () => {
    expect(readFileSync(new URL('../schema/arrival-events.schema.json', import.meta.url))).toEqual(
      readFileSync(
        new URL(
          '../../../../.meta_harness/design/spec/data/arrival-events/v2/arrival-events.schema.json',
          import.meta.url,
        ),
      ),
    )
  })
})
describe('V-2 frozen priority §11 and legal individual envelopes §12', () => {
  let section = 0
  let row = 0
  for (const line of text.split('\n')) {
    const heading = /^## (\d+)\./u.exec(line)
    if (heading !== null) {
      section = Number(heading[1])
      row = 0
    }
    const priority = /^\| `(.+?)`（`\w+`） \| .+? \| `([a-z_]+)`/u.exec(line)
    if (section === 11 && priority?.[1] !== undefined) {
      row++
      const value = json(priority[1])
      test(`§11 row${row}`, () =>
        expect(judgeArrivalEnvelope({ target: modelTarget, event: value })).toEqual({
          rejected: priority[2],
        }))
    }
    const stream = /^\| (\d+) \| `(.+?)` \|/u.exec(line)
    if (section === 12 && stream?.[2] !== undefined) {
      const event = json(stream[2])
      test(`§12 event${stream[1]}`, () => {
        expect(validate('ArrivalEnvelope', { target: modelTarget, event }).valid).toBe(true)
        expect(judgeArrivalEnvelope({ target: modelTarget, event })).toEqual({ ok: true })
      })
    }
  }
  test('§11 row6 inline frame beats visible frame', () => {
    expect(
      judgeArrivalEnvelope({
        target: frameTarget,
        event: {
          t: 'close',
          index: 0,
          block: {
            kind: 'image',
            id: 'b_1',
            visibility,
            mediaType: 'image/png',
            data: { inline: 'YQ==' },
          },
        },
      }),
    ).toEqual({ rejected: 'frame_media_inline' })
  })
  test('§11 row7 negative frame account beats forbidden account', () => {
    expect(
      judgeArrivalEnvelope({
        target: frameTarget,
        event: { t: 'account', usage: { ...usage, input_tokens: -1 }, cost },
      }),
    ).toEqual({ rejected: 'negative_amount' })
  })
})
