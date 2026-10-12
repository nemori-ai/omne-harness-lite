import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { LosslessNumber } from '../src/json.ts'
import { generateSchemaModule } from '../src/schema-codegen.ts'

const require = createRequire(new URL('../package.json', import.meta.url))
interface GeneratedValidation {
  readonly valid: boolean
  readonly errors: readonly { readonly schemaPath: string }[] | null
}
function loaded(source: string): Record<string, (text: string) => GeneratedValidation> {
  const module = { exports: {} as Record<string, (text: string) => GeneratedValidation> }
  runInNewContext(source, { module, exports: module.exports, require })
  return module.exports
}

it('registers fixed resources before compiling definitions and preserves exact numeric bounds', () => {
  const schema = {
    $id: 'https://test.invalid/codegen-boundary',
    type: 'integer',
    minimum: new LosslessNumber('9007199254740993'),
  }
  const before = schema.minimum.source
  const exports = loaded(
    generateSchemaModule({
      resources: [schema],
      definitions: [{ name: '__proto__', schema: { $ref: schema.$id } }],
    }),
  )
  expect(Object.getPrototypeOf(exports)).toBeNull()
  expect(Object.keys(exports)).toEqual(['__proto__'])
  expect(exports.__proto__!('9007199254740992').valid).toBe(false)
  expect(exports.__proto__!('9007199254740993').valid).toBe(true)
  expect(exports.__proto__!('9007199254740993.1').valid).toBe(false)
  expect(schema.minimum.source).toBe(before)
})

it('keeps anonymous Schema error paths when it registers a standalone export name', () => {
  const exports = loaded(
    generateSchemaModule({
      resources: [],
      definitions: [{ name: 'a/b', schema: { type: 'integer' } }],
    }),
  )
  const result = exports['a/b']!('1.00000000000000000001')
  expect(result.valid).toBe(false)
  expect(result.errors?.map(error => error.schemaPath)).toEqual(['#/exact_integer'])
  expect(exports['a/b']!('1').valid).toBe(true)
})

it('rejects resources without a fixed id or with invalid meta-Schema before definitions', () => {
  let schemaRead = false
  const definition = {
    name: 'unreached',
    get schema() {
      schemaRead = true
      return true
    },
  }
  for (const resource of [false, {}, { $id: 'https://test.invalid/bad', type: 'imaginary' }]) {
    expect(() =>
      generateSchemaModule({ resources: [resource], definitions: [definition] }),
    ).toThrow(TypeError)
  }
  expect(schemaRead).toBe(false)
})

it('rejects empty or duplicate export names before reading that definition Schema', () => {
  let schemaRead = false
  for (const name of ['', 'taken']) {
    expect(() =>
      generateSchemaModule({
        resources: [],
        definitions: [
          { name: 'taken', schema: true },
          {
            name,
            get schema() {
              schemaRead = true
              return true
            },
          },
        ],
      }),
    ).toThrow('fixed Schema export names must be non-empty and unique')
  }
  expect(schemaRead).toBe(false)
})

it('returns no output when a later definition fails meta-validation or reference resolution', () => {
  const first = { name: 'valid', schema: true }
  expect(() =>
    generateSchemaModule({
      resources: [],
      definitions: [first, { name: 'bad', schema: { minLength: 1.01 } }],
    }),
  ).toThrow('Schema fails Draft 2020-12 meta-validation')
  expect(() =>
    generateSchemaModule({
      resources: [],
      definitions: [first, { name: 'missing', schema: { $ref: 'https://missing.invalid/schema' } }],
    }),
  ).toThrow(/can't resolve reference/u)
})

it('preserves definition access order and propagates the original unexpected exception', () => {
  const reads: string[] = []
  const sentinel = new Error('definition schema failure')
  const first = {
    get name() {
      reads.push('first:name')
      return 'first'
    },
    get schema() {
      reads.push('first:schema')
      return true
    },
  }
  const second = {
    get name() {
      reads.push('second:name')
      return 'second'
    },
    get schema(): boolean {
      reads.push('second:schema')
      throw sentinel
    },
  }
  try {
    generateSchemaModule({ resources: [], definitions: [first, second] })
    expect.fail('expected original exception')
  } catch (error) {
    expect(error).toBe(sentinel)
  }
  expect(reads).toEqual([
    'first:name',
    'first:name',
    'first:schema',
    'first:name',
    'first:name',
    'second:name',
    'second:name',
    'second:schema',
  ])
})
