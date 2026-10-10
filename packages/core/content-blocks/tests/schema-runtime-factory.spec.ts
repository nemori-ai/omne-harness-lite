import { expect, it, vi } from 'vitest'
import { createSchemaRuntime, createSchemaRuntimeFactory } from '../src/schema-runtime.ts'
import { LosslessNumber } from '../src/json.ts'

const readings = vi.hoisted(() => ({ transformed: 0, metaValidated: 0 }))
vi.mock('../src/exact-schema.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/exact-schema.ts')>()
  return {
    ...actual,
    exactSchema(...args: Parameters<typeof actual.exactSchema>) {
      readings.transformed++
      return actual.exactSchema(...args)
    },
    createExactMetaValidator() {
      const validate = actual.createExactMetaValidator()
      return (...args: Parameters<typeof validate>) => {
        readings.metaValidated++
        return validate(...args)
      }
    },
  }
})

it('prepares fixed resources once while each runtime compiles its own author schema', () => {
  const resource = { $id: 'https://test.invalid/fixed', type: 'number' }
  readings.transformed = 0
  readings.metaValidated = 0
  const factory = createSchemaRuntimeFactory([resource])
  expect(readings.transformed).toBe(1)
  expect(readings.metaValidated).toBe(1)
  readings.transformed = 0
  readings.metaValidated = 0
  const first = factory()
  const second = factory()
  expect(first).not.toBe(second)
  expect(readings.transformed).toBe(0)
  expect(readings.metaValidated).toBe(0)
  const author = { $ref: resource.$id }
  expect(first.compile(author).validate(1)).toBe(true)
  expect(second.compile(author).validate(null)).toBe(false)
  expect(readings.transformed).toBe(2)
  expect(readings.metaValidated).toBe(2)
})

it('captures resource graphs, their array and the pattern factory at construction', () => {
  const resource = {
    $id: 'https://test.invalid/pinned',
    type: 'string',
    pattern: '^\\-$',
    $defs: { Exact: { const: 1 } },
  }
  const resources = [resource]
  const options = { patternFactory: (source: string) => new RegExp(source) }
  const factory = createSchemaRuntimeFactory(resources, options)
  resource.$defs.Exact.const = 2
  resource.pattern = 'changed'
  resources.length = 0
  options.patternFactory = () => {
    throw new Error('mutated options must not be read')
  }
  for (const runtime of [factory(), factory()]) {
    expect(runtime.compile({ $ref: resource.$id }).validate('-')).toBe(true)
    const exact = runtime.compile({ $ref: `${resource.$id}#/$defs/Exact` })
    expect(exact.validate(1)).toBe(true)
    expect(exact.validate(2)).toBe(false)
  }
})

it('reports the original construction error before inspecting later invalid resources', () => {
  const invalid = { $id: 'https://test.invalid/malformed', type: 'imaginary' }
  const resources = [
    { $id: 'https://test.invalid/duplicate' },
    { $id: 'https://test.invalid/duplicate' },
    invalid,
  ]
  expect(() => createSchemaRuntime(resources)).toThrow('already exists')
  expect(() => createSchemaRuntimeFactory(resources)).toThrow('already exists')
  expect(() => createSchemaRuntimeFactory([invalid])).toThrow('invalid Schema resource')
})

it('isolates repeated author ids and compilation failures while retaining exact external refs', () => {
  const factory = createSchemaRuntimeFactory([
    {
      $id: 'https://test.invalid/exact',
      minimum: new LosslessNumber('9007199254740993'),
    },
  ])
  const first = factory()
  const second = factory()
  const id = 'https://test.invalid/author'
  const number = first.compile({ $id: id, $ref: 'https://test.invalid/exact', type: 'number' })
  const nil = second.compile({ $id: id, type: 'null' })
  expect(number.validate(new LosslessNumber('9007199254740992'))).toBe(false)
  expect(number.validate(new LosslessNumber('9007199254740993'))).toBe(true)
  expect(number.validate(null)).toBe(false)
  expect(nil.validate(null)).toBe(true)
  expect(nil.validate(1)).toBe(false)
  expect(() => first.compile({ $ref: 'https://test.invalid/missing' })).toThrow()
  expect(factory().compile({ $id: id, const: 'fresh' }).validate('fresh')).toBe(true)
  expect(number.validate(new LosslessNumber('9007199254740993'))).toBe(true)
})
