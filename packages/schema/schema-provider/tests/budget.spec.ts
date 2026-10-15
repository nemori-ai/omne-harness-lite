import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  createSchemaProvider,
  defineSchema,
  lease,
  validate,
  zodDefinition,
  type SchemaBudget,
  type SchemaRef,
} from '@omne-harness/schema-provider'
import { expect, it } from 'vitest'
import { z } from 'zod'

const limits: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 8,
  maxItems: 50,
  maxMembers: 50,
  maxStringLength: 100,
  maxNumberLength: 100,
}

const budget: SchemaBudget = {
  maxSnapshots: 1,
  maxConstructDepth: 8,
  maxConstructNodes: 32,
  failureBackoffMs: 1_000,
  maxAttempts: 3,
}

const read = readJsonText('{"name":"ada"}', limits)

const heldResult = {
  kind: 'valid',
  value: { name: 'ada' },
  path: 'compiled',
  revision: '3',
} as const

function named(id: string): { schema: SchemaRef<{ name: string }>; loads: () => number } {
  let loads = 0
  const schema = defineSchema({
    id,
    load: async () => {
      loads += 1
      return zodDefinition({
        revision: '3',
        numbers: 'exact-or-reject',
        schema: z.strictObject({ name: z.string() }),
      })
    },
  })
  return { schema, loads: () => loads }
}

it('defect: a full budget evicts a leased snapshot for a new shape', async () => {
  const provider = createSchemaProvider(budget)
  const held = named('chat.message')
  const incoming = named('chat.other')
  const outcome = await lease(provider, held.schema)

  expect(outcome.kind).toBe('leased')
  if (outcome.kind !== 'leased') return
  expect(held.loads()).toBe(1)

  expect(await validate(provider, incoming.schema, read)).toEqual({
    kind: 'refused',
    reason: 'budget-exhausted',
  })
  expect(incoming.loads()).toBe(0)
  expect(outcome.lease.check(read)).toEqual(heldResult)
  expect(await validate(provider, held.schema, read)).toEqual(heldResult)
  expect(held.loads()).toBe(1)
})
