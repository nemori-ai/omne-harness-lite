import { readJsonText, type JsonLimits, type JsonRead } from '@omne-harness/json-text'
import {
  close,
  createSchemaProvider,
  defineSchema,
  validate,
  zodDefinition,
  type SchemaBudget,
  type SchemaIssue,
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
  maxSnapshots: 4,
  maxConstructDepth: 40,
  maxConstructNodes: 400,
  failureBackoffMs: 0,
  maxAttempts: 1,
}

export type Checked<T> =
  | { readonly kind: 'valid'; readonly value: T }
  | { readonly kind: 'invalid'; readonly issues: readonly [SchemaIssue, ...SchemaIssue[]] }
  | { readonly kind: 'local-refusal'; readonly reason: 'executable' | 'malformed' | 'checker-failed' }

type Plain =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: 'executable' | 'malformed' }

function plainJson(value: unknown, seen = new Set<object>()): Plain {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return { ok: true, value }
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, reason: 'malformed' }
  }
  if (typeof value === 'function') return { ok: false, reason: 'executable' }
  if (typeof value !== 'object') return { ok: false, reason: 'malformed' }
  if (seen.has(value)) return { ok: false, reason: 'malformed' }
  seen.add(value)
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return { ok: false, reason: 'malformed' }
    const copy: unknown[] = []
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') continue
      if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        return ownKeyRefusal(value, key)
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      const child = readOwn(value, String(index))
      if (!child.ok) return child
      const nested = plainJson(child.value, seen)
      if (!nested.ok) return nested
      copy.push(nested.value)
    }
    return { ok: true, value: copy }
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return { ok: false, reason: 'malformed' }
  const copy: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return ownKeyRefusal(value, key)
    const child = readOwn(value, key)
    if (!child.ok) return child
    const nested = plainJson(child.value, seen)
    if (!nested.ok) return nested
    copy[key] = nested.value
  }
  return { ok: true, value: copy }
}

function ownKeyRefusal(value: object, key: string | symbol): Plain {
  const description = Object.getOwnPropertyDescriptor(value, key)
  if (description !== undefined && (typeof description.value === 'function' || typeof description.get === 'function')) {
    return { ok: false, reason: 'executable' }
  }
  return { ok: false, reason: 'malformed' }
}

function readOwn(value: object, key: string): Plain {
  const description = Object.getOwnPropertyDescriptor(value, key)
  if (description === undefined) return { ok: false, reason: 'malformed' }
  if (typeof description.get === 'function' || typeof description.set === 'function') {
    return { ok: false, reason: 'executable' }
  }
  return { ok: true, value: description.value }
}

function settle<T>(verdict: SchemaVerdict<T>): Checked<T> {
  switch (verdict.kind) {
    case 'valid':
      return { kind: 'valid', value: verdict.value }
    case 'invalid':
      return { kind: 'invalid', issues: verdict.issues }
    case 'unreadable':
      return { kind: 'local-refusal', reason: 'malformed' }
    case 'refused':
    case 'unavailable':
    case 'cancelled':
      return { kind: 'local-refusal', reason: 'checker-failed' }
    default: {
      const unreachable: never = verdict
      return unreachable
    }
  }
}

export async function checkJson<T>(id: string, schema: z.ZodType<T>, value: unknown): Promise<Checked<T>> {
  const plain = plainJson(value)
  if (!plain.ok) return { kind: 'local-refusal', reason: plain.reason }
  const encoded = JSON.stringify(plain.value)
  if (typeof encoded !== 'string') return { kind: 'local-refusal', reason: 'malformed' }
  const read: JsonRead = readJsonText(encoded, limits)
  if (read.kind !== 'ok') return { kind: 'local-refusal', reason: 'malformed' }
  const provider = createSchemaProvider(budget)
  try {
    const ref = defineSchema({
      id,
      load: async () =>
        zodDefinition({
          revision: '1',
          numbers: 'exact-or-reject',
          schema,
        }),
    })
    return settle(await validate<T>(provider, ref, read))
  } finally {
    close(provider)
  }
}
