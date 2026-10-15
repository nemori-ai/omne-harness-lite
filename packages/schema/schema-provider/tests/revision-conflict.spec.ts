import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  createSchemaProvider,
  defineSchema,
  lease,
  refresh,
  validate,
  zodDefinition,
  type SchemaBudget,
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

it('defect: a changed shape with the same revision replaces the leased snapshot', async () => {
  const provider = createSchemaProvider(budget)
  let shape: z.ZodType = z.strictObject({ name: z.string() })
  const schema = defineSchema({
    id: 'chat.message',
    load: async () =>
      zodDefinition({
        revision: '3',
        numbers: 'exact-or-reject',
        schema: shape,
      }),
  })
  const outcome = await lease(provider, schema)
  expect(outcome.kind).toBe('leased')
  if (outcome.kind !== 'leased') return

  shape = z.strictObject({ name: z.number() })
  refresh(provider, schema.id)
  const next = await validate(provider, schema, read)

  expect(next).toEqual({ kind: 'refused', reason: 'revision-conflict' })
  expect(outcome.lease.check(read)).toEqual({
    kind: 'valid',
    value: { name: 'ada' },
    path: 'compiled',
    revision: '3',
  })
})
