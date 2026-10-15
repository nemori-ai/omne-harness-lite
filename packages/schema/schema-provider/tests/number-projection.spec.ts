import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  createSchemaProvider,
  defineSchema,
  validate,
  zodDefinition,
  type NumberProjection,
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

const unsafe = '9007199254740993'

async function checkNumber(numbers: NumberProjection, schema: z.ZodType, text: string) {
  let loads = 0
  const ref = defineSchema({
    id: 'chat.amount',
    load: async () => {
      loads += 1
      return zodDefinition({ revision: '3', numbers, schema })
    },
  })
  const verdict = await validate(createSchemaProvider(budget), ref, readJsonText(text, limits))
  return { loads, verdict }
}

it('defect: an inexact integer becomes a JavaScript number', async () => {
  const { loads, verdict } = await checkNumber('exact-or-reject', z.number(), unsafe)

  expect(loads).toBe(1)
  expect(verdict).toEqual({
    kind: 'invalid',
    issues: [{ path: [], code: 'precision' }],
    path: 'compiled',
    revision: '3',
  })
})

it('defect: an exact integer is rejected as precision', async () => {
  const { loads, verdict } = await checkNumber('exact-or-reject', z.number(), '1')

  expect(loads).toBe(1)
  expect(verdict).toEqual({
    kind: 'valid',
    value: 1,
    path: 'compiled',
    revision: '3',
  })
})

it('defect: lexeme mode hands the checker a JavaScript number', async () => {
  const { loads, verdict } = await checkNumber('lexeme', z.string(), unsafe)

  expect(loads).toBe(1)
  expect(verdict).toEqual({
    kind: 'valid',
    value: unsafe,
    path: 'compiled',
    revision: '3',
  })
})
