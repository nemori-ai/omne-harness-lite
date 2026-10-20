import { readJsonText, type JsonLimits, type JsonRead } from '@omne-harness/json-text'
import {
  close,
  createSchemaProvider,
  defineSchema,
  validate,
  zodDefinition,
  type SchemaBudget,
  type SchemaIssue,
  type SchemaProvider,
  type SchemaVerdict,
} from '@omne-harness/schema-provider'
import type { z } from 'zod'

const DECLARATION_LIMITS: JsonLimits = {
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
  | {
      readonly kind: 'local-refusal'
      readonly reason: 'executable' | 'malformed' | 'checker-failed'
    }

type Plain =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: 'executable' | 'malformed'; readonly index: number }

type Walk = {
  ancestors: Set<object>
  nodes: number
  readonly limits: JsonLimits
}

function refuse(reason: 'executable' | 'malformed', index: number): Plain {
  return { ok: false, reason, index }
}

/** The result for a string or a number, or `undefined` for any other value. */
function plainText(value: unknown, walk: Walk, index: number): Plain | undefined {
  if (typeof value === 'string') {
    if (value.length > walk.limits.maxStringLength) return refuse('malformed', index)
    return { ok: true, value }
  }
  if (typeof value !== 'number') return undefined
  if (!Number.isFinite(value)) return refuse('malformed', index)
  if (JSON.stringify(value).length > walk.limits.maxNumberLength) return refuse('malformed', index)
  return { ok: true, value }
}

/**
 * Whether a value opens a container beyond the depth limit. `depth` counts the containers around
 * the value, and a container counts its own level as it opens, as json-text does when it reads
 * the whole text. A scalar adds no level.
 */
function opensTooDeep(value: unknown, walk: Walk, depth: number): boolean {
  return typeof value === 'object' && value !== null && depth + 1 > walk.limits.maxDepth
}

function plainJson(value: unknown, walk: Walk, depth: number, index: number): Plain {
  if (opensTooDeep(value, walk, depth)) return refuse('malformed', index)
  walk.nodes += 1
  if (walk.nodes > walk.limits.maxItems) return refuse('malformed', 0)
  if (value === null || typeof value === 'boolean') return { ok: true, value }
  const text = plainText(value, walk, index)
  if (text !== undefined) return text
  if (typeof value === 'function') return refuse('executable', index)
  if (typeof value !== 'object') return refuse('malformed', index)
  return copyContainer(value, walk, depth, index)
}

/**
 * The copy of an array or an object. The copy reads each member through its property descriptor,
 * so it runs no accessor. On a Proxy, these reads and the read of an array `length` run the traps
 * of the caller. A trap that throws, or a revoked Proxy, makes the value `malformed`, and the
 * exception does not leave the copy.
 */
function copyContainer(value: object, walk: Walk, depth: number, index: number): Plain {
  if (walk.ancestors.has(value)) return refuse('malformed', index)
  walk.ancestors.add(value)
  try {
    if (Array.isArray(value)) return copyArray(value, walk, depth, index)
    return copyObject(value, walk, depth, index)
  } catch {
    return refuse('malformed', index)
  } finally {
    walk.ancestors.delete(value)
  }
}

function copyArray(value: unknown[], walk: Walk, depth: number, index: number): Plain {
  if (Object.getPrototypeOf(value) !== Array.prototype)
    return { ok: false, reason: 'malformed', index }
  const copy: unknown[] = []
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      return ownKeyRefusal(value, key, index)
    }
  }
  for (let itemIndex = 0; itemIndex < value.length; itemIndex += 1) {
    const child = readOwn(value, String(itemIndex), index)
    if (!child.ok) return { ...child, index: depth === 0 ? itemIndex : index }
    const nested = plainJson(child.value, walk, depth + 1, depth === 0 ? itemIndex : index)
    if (!nested.ok) return nested
    copy.push(nested.value)
  }
  return { ok: true, value: copy }
}

function copyObject(value: object, walk: Walk, depth: number, index: number): Plain {
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null)
    return { ok: false, reason: 'malformed', index }
  const keys = Reflect.ownKeys(value)
  if (keys.length > walk.limits.maxMembers) return { ok: false, reason: 'malformed', index }
  const copy = Object.create(null) as Record<string, unknown>
  for (const key of keys) {
    if (typeof key !== 'string') return ownKeyRefusal(value, key, index)
    const child = readOwn(value, key, index)
    if (!child.ok) return child
    const nested = plainJson(child.value, walk, depth + 1, index)
    if (!nested.ok) return nested
    Object.defineProperty(copy, key, {
      value: nested.value,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return { ok: true, value: copy }
}

function ownKeyRefusal(value: object, key: string | symbol, index: number): Plain {
  const description = Object.getOwnPropertyDescriptor(value, key)
  if (
    description !== undefined &&
    (typeof description.value === 'function' || typeof description.get === 'function')
  ) {
    return { ok: false, reason: 'executable', index }
  }
  return { ok: false, reason: 'malformed', index }
}

function readOwn(value: object, key: string, index: number): Plain {
  const description = Object.getOwnPropertyDescriptor(value, key)
  if (description === undefined) return { ok: false, reason: 'malformed', index }
  if (typeof description.get === 'function' || typeof description.set === 'function') {
    return { ok: false, reason: 'executable', index }
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

function readPlainDocument(value: unknown, limits: JsonLimits): JsonRead | undefined {
  const encoded = JSON.stringify(value)
  if (typeof encoded !== 'string') return undefined
  return readJsonText(encoded, limits)
}

export function jsonTextWithinBudget(
  value: unknown,
  limits: JsonLimits = DECLARATION_LIMITS,
): boolean {
  const read = readPlainDocument(value, limits)
  return read !== undefined && read.kind === 'ok'
}

async function validatePlain<T>(
  provider: SchemaProvider,
  id: string,
  schema: z.ZodType<T>,
  plain: unknown,
): Promise<Checked<T>> {
  const read = readPlainDocument(plain, DECLARATION_LIMITS)
  if (read === undefined || read.kind !== 'ok')
    return { kind: 'local-refusal', reason: 'malformed' }
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
}

/** Whether a value is an object that is not an array. The judgments share this one guard. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function openCheckDomain(): SchemaProvider {
  return createSchemaProvider(budget)
}

export function closeCheckDomain(provider: SchemaProvider): void {
  close(provider)
}

export function copyPlain(value: unknown, limits: JsonLimits = DECLARATION_LIMITS): Plain {
  return plainJson(value, { ancestors: new Set(), nodes: 0, limits }, 0, 0)
}

export async function checkJson<T>(
  id: string,
  schema: z.ZodType<T>,
  value: unknown,
  domain?: SchemaProvider,
): Promise<Checked<T>> {
  const plain = copyPlain(value)
  if (!plain.ok) return { kind: 'local-refusal', reason: plain.reason }
  if (domain !== undefined) return validatePlain(domain, id, schema, plain.value)
  const owned = openCheckDomain()
  try {
    return await validatePlain(owned, id, schema, plain.value)
  } finally {
    closeCheckDomain(owned)
  }
}
