import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  createSchemaProvider,
  defineSchema,
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

const message = z.strictObject({ name: z.string() })

const projected = {
  kind: 'valid',
  value: { name: 'ada' },
  path: 'compiled',
  revision: '3',
} as const

function heldSchema(): {
  schema: SchemaRef<{ name: string }>
  loads: () => number
  release: () => void
} {
  let loads = 0
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const schema = defineSchema({
    id: 'chat.message',
    load: async () => {
      loads += 1
      await gate
      return zodDefinition({
        revision: '3',
        numbers: 'exact-or-reject',
        schema: message,
      })
    },
  })
  return { schema, loads: () => loads, release: () => release() }
}

it('defect: overlapping validates each call load', async () => {
  const provider = createSchemaProvider(budget)
  const { schema, loads, release } = heldSchema()
  const read = readJsonText('{"name":"ada"}', limits)
  const first = validate(provider, schema, read)
  const second = validate(provider, schema, read)

  expect(loads()).toBe(1)
  release()
  expect(await first).toEqual(projected)
  expect(await second).toEqual(projected)
})

it('defect: aborting one caller cancels the other', async () => {
  const provider = createSchemaProvider(budget)
  const { schema, loads, release } = heldSchema()
  const read = readJsonText('{"name":"ada"}', limits)
  const controller = new AbortController()
  const aborted = validate(provider, schema, read, controller.signal)
  const other = validate(provider, schema, read)
  controller.abort()
  release()

  expect(await aborted).toEqual({ kind: 'cancelled' })
  expect(await other).toEqual(projected)
  expect(loads()).toBe(1)
})
