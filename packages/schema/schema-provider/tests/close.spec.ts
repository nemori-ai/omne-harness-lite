import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  close,
  createSchemaProvider,
  defineSchema,
  validate,
  zodDefinition,
  type SchemaBudget,
  type SchemaProvider,
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

const closed = { kind: 'refused', reason: 'closed' } as const

const projected = {
  kind: 'valid',
  value: { name: 'ada' },
  path: 'compiled',
  revision: '3',
} as const

function messageSchema(): SchemaRef<{ name: string }> {
  return defineSchema({
    id: 'chat.message',
    load: async () =>
      zodDefinition({
        revision: '3',
        numbers: 'exact-or-reject',
        schema: z.strictObject({ name: z.string() }),
      }),
  })
}

function readAda() {
  return readJsonText('{"name":"ada"}', limits)
}

it('defect: validate after close still checks the schema', async () => {
  const provider = createSchemaProvider(budget)
  close(provider)
  expect(await validate(provider, messageSchema(), readAda())).toEqual(closed)
})

it('defect: a second close reopens admission', async () => {
  const provider = createSchemaProvider(budget)
  close(provider)
  close(provider)
  expect(await validate(provider, messageSchema(), readAda())).toEqual(closed)
})

it('defect: close cancels a validate that already joined', async () => {
  const provider: SchemaProvider = createSchemaProvider(budget)
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  let loads = 0
  const schema = defineSchema({
    id: 'chat.message',
    load: async () => {
      loads += 1
      await gate
      return zodDefinition({
        revision: '3',
        numbers: 'exact-or-reject',
        schema: z.strictObject({ name: z.string() }),
      })
    },
  })
  const joined = validate(provider, schema, readAda())
  expect(loads).toBe(1)
  close(provider)
  release()

  expect(await joined).toEqual(projected)
  expect(await validate(provider, schema, readAda())).toEqual(closed)
  expect(loads).toBe(1)
})
