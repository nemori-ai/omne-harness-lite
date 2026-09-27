import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  validate as contentValidate,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  judgeModelProfileDocument,
  validate,
  type ModelProfileDocumentKind,
  type SchemaDefName,
} from '@omne-harness-lite/model-profile/v2'

const normative = new URL(
  '../../../../.meta_harness/design/spec/data/model-profile/v2/',
  import.meta.url,
)
const examples = readFileSync(new URL('examples.md', normative), 'utf8')

function json(text: string): JsonValue {
  const result = readJsonStrict(text)
  if ('failed' in result) throw new Error(`invalid normative JSON: ${result.failed}`)
  return result.ok
}
function object(value: JsonValue | undefined): JsonObject {
  if (!isObject(value)) throw new Error('fixture must be an object')
  return value
}
function isObject(value: JsonValue | undefined): value is JsonObject {
  return (
    value !== undefined &&
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
const blocks = [...examples.matchAll(/```json\n([\s\S]*?)\n```/gu)].map(match =>
  json(match[1] ?? ''),
)
const a = object(blocks[0])
const b = object(blocks[1])
const bRef = object(blocks[2])
const c = object(blocks[3])
const cRef = object(blocks[4])
const d = object(blocks[5])
const bases: Readonly<Record<string, JsonObject>> = { A: a, B: b, C: c, D: d }

interface Fixture {
  readonly id: string
  readonly definition: SchemaDefName | 'Modality'
  readonly kind?: ModelProfileDocumentKind
  readonly value: JsonValue
  readonly shape: boolean
  readonly rejection?: string
}

// Decode only the normative table's documented edit notation, independently of the judge.
function edited(cell: string): JsonObject {
  if (cell.startsWith('正例 B 原样')) return b
  const baseName = cell[0] ?? ''
  const base = bases[baseName]
  if (base === undefined) throw new Error(`unknown fixture base: ${cell}`)
  let value: Record<string, JsonValue> = { ...base }
  for (const operation of cell.slice(2).split('，且 ')) {
    const remove = /−`([^`]+)`/u.exec(operation)
    const replace = /`([^`]+)` → `([^`]+)`/u.exec(operation)
    const add = /＋`([^`]+)`/u.exec(operation)
    if (remove?.[1] !== undefined) delete value[remove[1]]
    else if (replace?.[1] !== undefined && replace[2] !== undefined)
      value[replace[1]] = json(replace[2])
    else if (add?.[1] !== undefined) value = { ...value, ...object(json(`{${add[1]}}`)) }
    else throw new Error(`unknown fixture edit: ${operation}`)
  }
  return value
}

function literal(cell: string): JsonValue {
  if (cell === '正例 B 的引用') return bRef
  if (cell === '正例 C 的引用') return cRef
  const match = /`([^`]+)`/u.exec(cell)
  if (match?.[1] === undefined) throw new Error(`missing fixture JSON: ${cell}`)
  return json(match[1])
}

const fixtures: Fixture[] = [a, b, c].map((value, index) => ({
  id: `EX-1-${index + 1}`,
  definition: 'ModelProfile',
  kind: 'ModelProfile',
  value,
  shape: true,
}))
fixtures.push({
  id: 'EX-10-D',
  definition: 'ModelProfileContent',
  kind: 'ModelProfileContent',
  value: d,
  shape: true,
})
let section = ''
let row = 0
for (const line of examples.split('\n')) {
  const heading = /^#{2,3} (\d+(?:\.\d+)?)\.? /u.exec(line)
  if (heading?.[1] !== undefined) {
    section = heading[1]
    row = 0
  }
  if (
    !line.startsWith('| ') ||
    !['2', '3', '4', '5.1', '5.2', '5.3', '5.4', '6', '9', '10'].includes(section)
  )
    continue
  const columns = line
    .split('|')
    .slice(1, -1)
    .map(column => column.trim())
  const cell = columns[0] ?? ''
  if (section === '5.3') {
    if (!cell.startsWith('`$defs/')) continue
    const definition = cell.match(/\$defs\/(\w+)/u)?.[1]
    if (definition === undefined) throw new Error('missing definition')
    for (const [index, column] of columns.slice(1, 3).entries()) {
      for (const item of column.matchAll(/`([^`]+)`/gu)) {
        const def = schemaName(definition)
        fixtures.push({
          id: `EX-${section}-${++row}`,
          definition: def,
          value: json(item[1] ?? ''),
          shape: index === 0,
        })
      }
    }
    continue
  }
  if (columns[1] !== '通过' && columns[1] !== '拒绝') continue
  const kind =
    section === '2' || section === '6'
      ? 'ModelProfile'
      : section === '3'
        ? 'ModelProfileRef'
        : section === '4'
          ? 'ModelRequestParameters'
          : section === '10'
            ? 'ModelProfileContent'
            : undefined
  const definition =
    kind ??
    (section === '9'
      ? 'ModelProfileSnapshot'
      : section === '5.1'
        ? 'RouteName'
        : section === '5.2'
          ? 'ProviderName'
          : 'InputConstraints')
  const rejection = kind === undefined ? undefined : columns[2]?.match(/`([^`]+)`/u)?.[1]
  const value =
    section === '2' || section === '6' || section === '10' ? edited(cell) : literal(cell)
  fixtures.push({
    id: `EX-${section}-${++row}`,
    definition,
    ...(kind === undefined ? {} : { kind }),
    value,
    // EX-6-4 also carries an unknown constraint, which the shape Schema rejects.
    shape: columns[1] === '通过' || (rejection === 'max_output_exceeds_profile' && section !== '6'),
    ...(rejection === undefined ? {} : { rejection }),
  })
}

function schemaName(name: string): SchemaDefName | 'Modality' {
  if (
    name === 'Modality' ||
    name === 'Registration' ||
    name === 'ProfileOrigin' ||
    name === 'ReasoningEffort'
  )
    return name
  throw new Error(`unsupported grouped definition: ${name}`)
}

describe('frozen examples, every local shape and document row', () => {
  it('fixture parser covers the six source blocks and all represented sections', () => {
    expect(blocks).toHaveLength(6)
    expect(fixtures).toHaveLength(155)
    for (const sectionName of ['1', '2', '3', '4', '5.1', '5.2', '5.3', '5.4', '6', '9', '10'])
      expect(fixtures.some(fixture => fixture.id.startsWith(`EX-${sectionName}-`))).toBe(true)
    expect(fixtures.filter(fixture => fixture.id.startsWith('EX-6-'))).toHaveLength(4)
    expect(fixtures.filter(fixture => fixture.id.startsWith('EX-10-'))).toHaveLength(13)
  })
  it.each(fixtures)('$id: shape and exact representation result', fixture => {
    const shape =
      fixture.definition === 'Modality'
        ? contentValidate('Modality', fixture.value)
        : validate(fixture.definition, fixture.value)
    expect(shape.valid).toBe(fixture.shape)
    if (fixture.kind !== undefined)
      expect(judgeModelProfileDocument(fixture.kind, fixture.value)).toEqual(
        fixture.rejection === undefined ? { ok: true } : { rejected: fixture.rejection },
      )
  })
  it('SCHEMA-BYTES: exported Schema is byte-identical to its frozen source', () => {
    expect(
      readFileSync(new URL('../schema/v2/model-profile.schema.json', import.meta.url)),
    ).toEqual(readFileSync(new URL('model-profile.schema.json', normative)))
  })
  it('S10-SHAPE: withdrawn and relisted are representations of the same valid row', () => {
    expect(judgeModelProfileDocument('ModelProfile', { ...c, registration: 'listed' })).toEqual({
      ok: true,
    })
  })
})
