import { readJsonText, type JsonLimits, type JsonRead } from '@omne-harness/json-text'
import {
  createSchemaProvider,
  defineSchema,
  validate,
  zodDefinition,
  type SchemaBudget,
  type SchemaProvider,
  type SchemaVerdict,
} from '@omne-harness/schema-provider'
import type { z } from 'zod'

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 20,
  maxItems: 200,
  maxMembers: 80,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}

const budget: SchemaBudget = {
  maxSnapshots: 8,
  maxConstructDepth: 40,
  maxConstructNodes: 400,
  failureBackoffMs: 0,
  maxAttempts: 2,
}

let provider: SchemaProvider | undefined

function checker(): SchemaProvider {
  provider ??= createSchemaProvider(budget)
  return provider
}

export function containsExecutable(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === 'function') return true
  if (value === null || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) return value.some(item => containsExecutable(item, seen))
  return Object.values(value).some(item => containsExecutable(item, seen))
}

export async function checkJson<T>(
  id: string,
  schema: z.ZodType<T>,
  value: unknown,
): Promise<SchemaVerdict<T> | { readonly kind: 'local-refusal'; readonly reason: 'executable' | 'malformed' }> {
  if (containsExecutable(value)) return { kind: 'local-refusal', reason: 'executable' }
  let text: string
  try {
    const encoded = JSON.stringify(value)
    if (typeof encoded !== 'string') return { kind: 'local-refusal', reason: 'malformed' }
    text = encoded
  } catch {
    return { kind: 'local-refusal', reason: 'malformed' }
  }
  const read: JsonRead = readJsonText(text, limits)
  if (read.kind !== 'ok') return { kind: 'local-refusal', reason: 'malformed' }
  const ref = defineSchema({
    id,
    load: async () =>
      zodDefinition({
        revision: '1',
        numbers: 'exact-or-reject',
        schema,
      }),
  })
  return validate<T>(checker(), ref, read)
}
