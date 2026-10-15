import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  createSchemaProvider,
  defineSchema,
  validate,
  zodDefinition,
  type SchemaBudget,
} from '@omne-harness/schema-provider'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'

const limits: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 8,
  maxItems: 50,
  maxMembers: 50,
  maxStringLength: 100,
  maxNumberLength: 100,
}

function failingSchema(budget: SchemaBudget): {
  provider: ReturnType<typeof createSchemaProvider>
  loads: () => number
  validateRead: () => ReturnType<typeof validate>
} {
  let loads = 0
  const schema = defineSchema({
    id: 'chat.message',
    load: async () => {
      loads += 1
      return zodDefinition({
        revision: '3',
        numbers: 'exact-or-reject',
        schema: z.xor([z.string(), z.number()]),
      })
    },
  })
  const provider = createSchemaProvider(budget)
  const read = readJsonText('"ada"', limits)
  return {
    provider,
    loads: () => loads,
    validateRead: () => validate(provider, schema, read),
  }
}

it('defect: a compile throw is cached as success or retried during cooldown', async () => {
  const budget: SchemaBudget = {
    maxSnapshots: 4,
    maxConstructDepth: 8,
    maxConstructNodes: 32,
    failureBackoffMs: 60_000,
    maxAttempts: 3,
  }
  const { loads, validateRead } = failingSchema(budget)
  const before = Date.now()
  const first = await validateRead()
  const after = Date.now()

  expect(first).toMatchObject({ kind: 'unavailable', reason: 'compile-failed' })
  if (first.kind !== 'unavailable') return
  expect(first.retryNotBeforeMillis).toBeGreaterThanOrEqual(before + budget.failureBackoffMs)
  expect(first.retryNotBeforeMillis).toBeLessThanOrEqual(after + budget.failureBackoffMs)
  expect(await validateRead()).toEqual(first)
  expect(loads()).toBe(1)
})

it('defect: failures past maxAttempts stay unavailable', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(1_000)
    const budget: SchemaBudget = {
      maxSnapshots: 4,
      maxConstructDepth: 8,
      maxConstructNodes: 32,
      failureBackoffMs: 50,
      maxAttempts: 2,
    }
    const { loads, validateRead } = failingSchema(budget)
    const first = await validateRead()
    expect(first).toEqual({
      kind: 'unavailable',
      reason: 'compile-failed',
      retryNotBeforeMillis: 1_050,
    })
    expect(loads()).toBe(1)

    vi.setSystemTime(1_050)
    expect(await validateRead()).toEqual({ kind: 'refused', reason: 'attempts-exhausted' })
    expect(loads()).toBe(2)
  } finally {
    vi.useRealTimers()
  }
})
