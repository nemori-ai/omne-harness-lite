import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  createSchemaProvider,
  defineSchema,
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

it('defect: a strict object never becomes a compiled projection', async () => {
  let loads = 0
  const schema = defineSchema({
    id: 'chat.message',
    load: async () => {
      loads += 1
      return zodDefinition({
        revision: '3',
        numbers: 'exact-or-reject',
        schema: z.strictObject({ name: z.string() }),
      })
    },
  })
  const read = readJsonText('{"name":"ada"}', limits)
  const verdict = await validate(createSchemaProvider(budget), schema, read)

  expect(loads).toBe(1)
  expect(verdict).toEqual({
    kind: 'valid',
    value: { name: 'ada' },
    path: 'compiled',
    revision: '3',
  })
})

it('defect: .default is compiled and fills a missing field', async () => {
  let loads = 0
  const schema = defineSchema({
    id: 'chat.message',
    load: async () => {
      loads += 1
      return zodDefinition({
        revision: '3',
        numbers: 'exact-or-reject',
        schema: z.strictObject({ name: z.string().default('ada') }),
      })
    },
  })
  const read = readJsonText('{}', limits)
  const verdict = await validate(createSchemaProvider(budget), schema, read)

  expect(loads).toBe(1)
  expect(verdict).toEqual({ kind: 'refused', reason: 'unsupported-construct' })
})

it('defect: a failed JsonRead is dropped or copied', async () => {
  const failure = readJsonText('', limits)
  expect(failure).toEqual({ kind: 'empty' })
  const schema = defineSchema({
    id: 'chat.message',
    load: async () =>
      zodDefinition({
        revision: '3',
        numbers: 'exact-or-reject',
        schema: z.strictObject({ name: z.string() }),
      }),
  })
  const verdict = await validate(createSchemaProvider(budget), schema, failure)

  expect(verdict).toEqual({ kind: 'unreadable', failure })
  if (verdict.kind === 'unreadable') expect(verdict.failure).toBe(failure)
})
