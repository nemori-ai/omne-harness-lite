import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  createSchemaRuntime,
  type JsonSchema,
  type SchemaRuntimeOptions,
} from '../src/schema-runtime.ts'
import { json } from './ports.ts'

function schema(text: string): JsonSchema {
  const value = json(text)
  if (typeof value === 'boolean') return value
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('expected test Schema')
  const result = Object.fromEntries(Object.entries(value))
  return result
}
const runtime = createSchemaRuntime([])
describe('protected schema-runtime original-value boundary', () => {
  it.each([
    ['{"type":"integer"}', '1.0000000000000000000001', false],
    ['{"type":["integer","null"]}', '1e400', true],
    ['{"type":["integer","null"]}', 'null', true],
    ['{"type":["integer","string"]}', '1.0000000000000000000001', false],
    ['{"type":["integer","string"]}', '1e400', true],
    ['{"type":["integer","string"]}', '"one"', true],
    ['{"minimum":9007199254740993}', '9007199254740992', false],
    ['{"maximum":-9007199254740993}', '-9007199254740992', false],
    ['{"exclusiveMinimum":0.1}', '0.100000000000000000001', true],
    ['{"exclusiveMaximum":1e400}', '1e399', true],
    ['{"multipleOf":0.1}', '0.3', true],
    ['{"multipleOf":0.1}', '0.300000000000000000001', false],
    ['{"const":{"n":9007199254740993}}', '{"n":9007199254740992}', false],
    ['{"enum":[9007199254740992,9007199254740993]}', '9007199254740993', true],
    ['{"uniqueItems":true}', '[9007199254740992,9007199254740993]', true],
    ['{"uniqueItems":true}', '[1,1.0]', false],
    ['{"exact_minimum":"not a private encoding"}', '-1', true],
    ['{"minimum":0,"exact_minimum":"-10"}', '-1', false],
  ] as const)('validates %s against %s without changing the source', (text, input, expected) => {
    const originalSchema = schema(text)
    const value = json(input)
    expect(runtime.metaValidate(originalSchema)).toBe(true)
    expect(runtime.compile(originalSchema).validate(value)).toBe(expected)
    expect(writeJsonLossless(originalSchema)).toBe(text)
    expect(writeJsonLossless(value)).toBe(input)
  })
  it.each([
    ['{"multipleOf":1e-400}', true],
    ['{"multipleOf":-1e-400}', false],
    ['{"minLength":1.000000000000000000001}', false],
    ['{"maxLength":1e400}', true],
    ['{"type":["integer","integer"]}', false],
    ['{"required":["a","a"]}', false],
  ] as const)('meta-validates exact numeric and enum source %s', (text, expected) => {
    const input = schema(text)
    expect(runtime.metaValidate(input)).toBe(expected)
    expect(writeJsonLossless(input)).toBe(text)
    if (!expected) expect(() => runtime.compile(input)).toThrow(TypeError)
  })
  it('clones fixed resources and author Schemas at their respective binding moments', () => {
    const resource = { $id: 'https://test.invalid/fixed', $defs: { Exact: { const: 1 } } }
    const pinned = createSchemaRuntime([resource])
    resource.$defs.Exact.const = 2
    const author = {
      type: 'object',
      properties: { n: { $ref: 'https://test.invalid/fixed#/$defs/Exact' } },
      required: ['n'],
    }
    const compiled = pinned.compile(author)
    author.properties.n.$ref = 'https://test.invalid/missing'
    expect(compiled.validate(json('{"n":1.0}'))).toBe(true)
    expect(compiled.validate({ n: 2 })).toBe(false)
    expect(Object.isFrozen(pinned)).toBe(true)
    expect(Object.isFrozen(compiled)).toBe(true)
  })
  it('keeps original instance contexts separate across interleaved calls', () => {
    const first = runtime.compile(
      schema(
        '{"type":"object","properties":{"a/b":{"maximum":9007199254740992}},"required":["a/b"]}',
      ),
    )
    const second = runtime.compile(schema('{"type":"array","items":{"minimum":9007199254740993}}'))
    expect(first.validate(json('{"a/b":9007199254740993}'))).toBe(false)
    expect(second.validate(json('[9007199254740993]'))).toBe(true)
    expect(first.validate(json('{"a/b":9007199254740992}'))).toBe(true)
    expect(second.validate(json('[9007199254740992]'))).toBe(false)
  })
  it('propagates reference and compile failures, without remote loading or async validation', () => {
    expect(() => runtime.compile({ $ref: 'https://unavailable.invalid/schema' })).toThrow()
    expect(() => createSchemaRuntime([{ $id: 'x', type: 'imaginary' }])).toThrow(TypeError)
    expect(() => createSchemaRuntime([true])).toThrow(TypeError)
    expect(() => runtime.compile({ $async: true, type: 'string' })).toThrow(TypeError)
    const defect = new SyntaxError('caller pattern failed')
    const failing = createSchemaRuntime([], {
      patternFactory: () => {
        throw defect
      },
    })
    expect(() => failing.compile({ pattern: 'x' })).toThrow(defect)
  })
})

describe('supported Draft 2020-12 compositions with fixed resources', () => {
  it.each([
    [
      '{"allOf":[{"minimum":9007199254740993},{"maximum":9007199254740993}]}',
      '9007199254740993',
      true,
    ],
    ['{"anyOf":[{"const":9007199254740993},{"type":"null"}]}', '9007199254740992', false],
    [
      '{"oneOf":[{"minimum":9007199254740992},{"minimum":9007199254740993}]}',
      '9007199254740993',
      false,
    ],
    ['{"not":{"const":9007199254740993}}', '9007199254740992', true],
    [
      '{"if":{"type":"number"},"then":{"minimum":9007199254740993},"else":{"type":"null"}}',
      '9007199254740992',
      false,
    ],
    [
      '{"type":"object","additionalProperties":{"type":"integer"}}',
      '{"x":1.0000000000000000001}',
      false,
    ],
    [
      '{"type":"object","properties":{"x":{"minimum":9007199254740993}},"unevaluatedProperties":false}',
      '{"x":9007199254740993,"y":0}',
      false,
    ],
    ['{"type":"object","dependentSchemas":{"x":{"required":["y"]}}}', '{"x":1}', false],
    ['{"type":"object","propertyNames":{"enum":["a","b"]}}', '{"a":1,"b":2}', true],
    [
      '{"type":"array","prefixItems":[{"const":9007199254740993}],"items":false}',
      '[9007199254740993]',
      true,
    ],
    [
      '{"type":"array","contains":{"const":9007199254740993},"minContains":1,"maxContains":1}',
      '[9007199254740992,9007199254740993]',
      true,
    ],
    ['{"type":"array","prefixItems":[true],"unevaluatedItems":false}', '[1,2]', false],
    ['{"type":"string","format":"not-a-known-format"}', '"anything"', true],
    ['false', 'null', false],
    ['true', 'null', true],
  ] as const)('checks composition %s', (text, value, expected) =>
    expect(runtime.compile(schema(text)).validate(json(value))).toBe(expected),
  )
  it('uses explicit fixed external refs and recursive dynamic references with original numbers', () => {
    const resource = schema(
      '{"$id":"https://test.invalid/tree","$dynamicAnchor":"node","type":"object","properties":{"n":{"type":"integer"},"next":{"$dynamicRef":"#node"}},"required":["n"]}',
    )
    const compiled = createSchemaRuntime([resource]).compile({ $ref: 'https://test.invalid/tree' })
    expect(compiled.validate(json('{"n":1,"next":{"n":1.0000000000000000001}}'))).toBe(false)
    expect(compiled.validate(json('{"n":1,"next":{"n":1e400}}'))).toBe(true)
  })
})

describe('caller-owned pattern engine for frozen M56 choice', () => {
  const mixed = {
    type: 'object',
    properties: {
      ordinary: { type: 'string', pattern: '^\\-$' },
      unicode: { type: 'string', pattern: '^[\\u{1F600}-\\u{1F64F}]$' },
    },
    required: ['ordinary', 'unicode'],
  }
  const options: SchemaRuntimeOptions = {
    patternFactory(source) {
      try {
        return new RegExp(source)
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
        return new RegExp(source, 'u')
      }
    },
  }
  it('actually compiles both selected flags in one schema; a default-u compiler cannot', () => {
    expect(() => runtime.compile(mixed)).toThrow(SyntaxError)
    const compiled = createSchemaRuntime([], options).compile(mixed)
    expect(compiled.validate({ ordinary: '-', unicode: '😀' })).toBe(true)
    expect(compiled.validate({ ordinary: '-', unicode: 'x' })).toBe(false)
    expect(compiled.validate({ ordinary: 'x', unicode: '😀' })).toBe(false)
  })
  it.each(['g', 'y'])('rejects stateful flag %s during construction of a compiled pattern', flags =>
    expect(() =>
      createSchemaRuntime([], { patternFactory: source => new RegExp(source, flags) }).compile({
        pattern: 'x',
      }),
    ).toThrow(TypeError),
  )
})
