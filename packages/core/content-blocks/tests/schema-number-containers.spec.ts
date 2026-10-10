import { expect, it } from 'vitest'
import { readJsonStrict, type JsonValue } from '../src/json.ts'
import { isObject } from '../src/schema.ts'
import { createSchemaRuntime, type SchemaDocument } from '../src/schema-runtime.ts'

function value(text: string): JsonValue {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new Error('invalid test JSON')
  return parsed.ok
}
function schema(text: string): SchemaDocument {
  const parsed = value(text)
  if (!isObject(parsed)) throw new Error('object Schema required')
  return parsed
}

it('compares exact const arrays by numeric value while retaining order, length and nested members', () => {
  const validator = createSchemaRuntime([]).compile(
    schema('{"const":[9007199254740993,{"precision":1.00000000000000000001},[0.1]]}'),
  )
  expect(
    validator.validate(value('[9007199254740993.0,{"precision":1.000000000000000000010},[0.10]]')),
  ).toBe(true)
  for (const text of [
    '[9007199254740992,{"precision":1.00000000000000000001},[0.1]]',
    '[9007199254740993,{"precision":1},[0.1]]',
    '[9007199254740993,{"precision":1.00000000000000000001},[0.2]]',
    '[9007199254740993,[1.00000000000000000001],[0.1]]',
    '[9007199254740993,{"precision":1.00000000000000000001}]',
    '[9007199254740993,{"precision":1.00000000000000000001},[0.1],null]',
    '[{"precision":1.00000000000000000001},9007199254740993,[0.1]]',
    '{"0":9007199254740993,"1":{"precision":1.00000000000000000001},"2":[0.1]}',
  ])
    expect(validator.validate(value(text)), text).toBe(false)
})

it('matches enum arrays without merging reordered or different exact numeric values', () => {
  const validator = createSchemaRuntime([]).compile(schema('{"enum":[[0.1,0.2],[1e400]]}'))
  expect(validator.validate(value('[0.10,0.200]'))).toBe(true)
  expect(validator.validate(value('[10e399]'))).toBe(true)
  expect(validator.validate(value('[0.2,0.1]'))).toBe(false)
  expect(validator.validate(value('[0.1]'))).toBe(false)
  expect(validator.validate(value('[1e4000]'))).toBe(false)
})

it('detects equivalent nested arrays in uniqueItems without collapsing unequal containers', () => {
  const validator = createSchemaRuntime([]).compile({ uniqueItems: true })
  expect(validator.validate(value('[[1.0,0.1],[1,0.10]]'))).toBe(false)
  expect(validator.validate(value('[[9007199254740993],[9007199254740993.0]]'))).toBe(false)
  expect(validator.validate(value('[[1,0.1],[0.1,1]]'))).toBe(true)
  expect(validator.validate(value('[[1],[1,2]]'))).toBe(true)
  expect(validator.validate(value('[[1],{"0":1}]'))).toBe(true)
})
