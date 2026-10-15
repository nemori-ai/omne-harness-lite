import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  createSchemaProvider,
  defineSchema,
  lease,
  refresh,
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
  maxSnapshots: 4,
  maxConstructDepth: 8,
  maxConstructNodes: 32,
  failureBackoffMs: 1_000,
  maxAttempts: 3,
}

const read = readJsonText('{"name":"ada"}', limits)

const revision3 = {
  kind: 'valid',
  value: { name: 'ada' },
  path: 'compiled',
  revision: '3',
} as const

const revision4 = {
  kind: 'valid',
  value: { name: 'ada' },
  path: 'compiled',
  revision: '4',
} as const

function messageSchema(): { schema: SchemaRef<{ name: string }>; loads: () => number; publish: (revision: string) => void } {
  let loads = 0
  let revision = '3'
  const schema = defineSchema({
    id: 'chat.message',
    load: async () => {
      loads += 1
      return zodDefinition({
        revision,
        numbers: 'exact-or-reject',
        schema: z.strictObject({ name: z.string() }),
      })
    },
  })
  return {
    schema,
    loads: () => loads,
    publish: next => {
      revision = next
    },
  }
}

it('defect: a new revision retargets the outstanding lease', async () => {
  const provider = createSchemaProvider(budget)
  const { schema, loads, publish } = messageSchema()
  const outcome = await lease(provider, schema)

  expect(outcome.kind).toBe('leased')
  if (outcome.kind !== 'leased') return
  expect(loads()).toBe(1)
  expect(outcome.lease.superseded).toBe(false)
  expect(outcome.lease.check(read)).toEqual(revision3)

  publish('4')
  refresh(provider, schema.id)
  expect(await validate(provider, schema, read)).toEqual(revision4)
  expect(loads()).toBe(2)
  expect(outcome.lease.superseded).toBe(true)
  expect(outcome.lease.check(read)).toEqual(revision3)
})
