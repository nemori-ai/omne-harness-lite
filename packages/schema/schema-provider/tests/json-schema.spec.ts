import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  createSchemaProvider,
  defineSchema,
  jsonSchemaDefinition,
  validate,
  type SchemaBudget,
} from '@omne-harness/schema-provider'
import { expect, it } from 'vitest'

const limits: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 8,
  maxItems: 50,
  maxMembers: 50,
  maxStringLength: 100,
  maxNumberLength: 100,
}

const budget: SchemaBudget = {
  maxSnapshots: 4,
  maxConstructDepth: 8,
  maxConstructNodes: 32,
  failureBackoffMs: 1_000,
  maxAttempts: 3,
}

const nameSchema = {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
  additionalProperties: false,
} as const

function check(document: Readonly<Record<string, unknown>>, text: string) {
  let loads = 0
  const schema = defineSchema({
    id: 'chat.message',
    load: async () => {
      loads += 1
      return jsonSchemaDefinition({ document, numbers: 'exact-or-reject' })
    },
  })
  const provider = createSchemaProvider(budget)
  const read = readJsonText(text, limits)
  return {
    loads: () => loads,
    run: () => validate(provider, schema, read),
  }
}

it('defect: an acyclic JSON Schema is refused before it can validate', async () => {
  const { loads, run } = check(nameSchema, '{"name":"ada"}')
  const verdict = await run()

  expect(loads()).toBe(1)
  expect(verdict).toMatchObject({
    kind: 'valid',
    value: { name: 'ada' },
    path: 'compiled',
  })
})

it('defect: a cyclic JSON Schema is compiled and reported as a hit', async () => {
  const { loads, run } = check(
    {
      type: 'object',
      properties: { child: { $ref: '#' } },
    },
    '{}',
  )

  expect(await run()).toEqual({ kind: 'refused', reason: 'runtime-path-closed' })
  expect(await run()).toEqual({ kind: 'refused', reason: 'runtime-path-closed' })
  expect(loads()).toBe(1)
})

it('defect: Ajv coerces, fills defaults, and removes keys', async () => {
  const coerced = await check(
    {
      type: 'object',
      properties: { n: { type: 'number' } },
      required: ['n'],
      additionalProperties: false,
    },
    '{"n":"1"}',
  ).run()
  expect(coerced).toMatchObject({ kind: 'invalid', path: 'compiled' })

  const filled = await check(
    {
      type: 'object',
      properties: { name: { type: 'string', default: 'ada' } },
      additionalProperties: false,
    },
    '{}',
  ).run()
  expect(filled).toMatchObject({ kind: 'valid', value: {}, path: 'compiled' })

  const removed = await check(
    {
      type: 'object',
      properties: { name: { type: 'string' } },
      additionalProperties: false,
    },
    '{"name":"ada","extra":1}',
  ).run()
  expect(removed).toMatchObject({ kind: 'invalid', path: 'compiled' })
})
