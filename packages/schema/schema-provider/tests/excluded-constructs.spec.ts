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

const refused = { kind: 'refused', reason: 'unsupported-construct' } as const

async function admit(schema: z.ZodType, text: string) {
  const ref = defineSchema({
    id: 'chat.message',
    load: async () =>
      zodDefinition({
        revision: '3',
        numbers: 'exact-or-reject',
        schema,
      }),
  })
  return validate(createSchemaProvider(budget), ref, readJsonText(text, limits))
}

it('defect: .catch compiles and replaces a bad value', async () => {
  expect(await admit(z.string().catch('ada'), '1')).toEqual(refused)
})

it('defect: z.lazy compiles a recursive shape as a native hit', async () => {
  expect(await admit(z.lazy(() => z.string()), '"ada"')).toEqual(refused)
})

it('defect: .pipe compiles and checks the output schema', async () => {
  expect(await admit(z.string().pipe(z.string()), '"ada"')).toEqual(refused)
})

it('defect: .transform compiles and rewrites the value', async () => {
  expect(await admit(z.string().transform(value => value.trim()), '" ada "')).toEqual(refused)
})
