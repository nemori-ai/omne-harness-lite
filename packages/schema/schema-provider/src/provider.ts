import type { JsonRead } from '@omne-harness/json-text'
import { admit } from './admit.ts'
import { compileZod, type CheckHit } from './engine.ts'
import type {
  JsonSchemaDefinition,
  LeaseOutcome,
  NumberProjection,
  RefusalReason,
  SchemaBudget,
  SchemaDefinition,
  SchemaId,
  SchemaProvider,
  SchemaRef,
  SchemaRevision,
  SchemaVerdict,
  StandardTyped,
  UnavailableReason,
  ZodDefinition,
} from './index.ts'
import { project } from './project.ts'

type Snapshot = {
  readonly revision: string
  readonly numbers: NumberProjection
  readonly check: (value: unknown) => CheckHit
}

type Slot =
  | { readonly kind: 'empty' }
  | { readonly kind: 'inflight' }
  | { readonly kind: 'ready'; readonly snapshot: Snapshot }
  | {
      readonly kind: 'cooling'
      readonly attempts: number
      readonly reason: UnavailableReason
      readonly retryNotBeforeMillis: number
    }
  | { readonly kind: 'refused'; readonly reason: RefusalReason }
  | { readonly kind: 'retired'; readonly snapshot: Snapshot; readonly leases: number }

type Domain = {
  readonly budget: SchemaBudget
  readonly slots: Map<string, Slot>
}

const domains = new WeakMap<SchemaProvider, Domain>()

export function defineSchema<T>(spec: {
  readonly id: string
  readonly load: () => Promise<SchemaDefinition<T>>
}): SchemaRef<T> {
  return { id: spec.id as SchemaId, load: spec.load }
}

export function zodDefinition<S extends StandardTyped<unknown>>(spec: {
  readonly revision: string
  readonly schema: S
  readonly numbers: NumberProjection
}): ZodDefinition<S['~standard']['types'] extends { readonly output: infer T } ? T : unknown> {
  return {
    origin: 'static',
    engine: 'zod',
    revision: spec.revision as SchemaRevision,
    schema: spec.schema,
    numbers: spec.numbers,
  } as ZodDefinition<S['~standard']['types'] extends { readonly output: infer T } ? T : unknown>
}

export function jsonSchemaDefinition<T>(spec: {
  readonly document: Readonly<Record<string, unknown>>
  readonly numbers: NumberProjection
}): JsonSchemaDefinition<T> {
  return { origin: 'static', engine: 'json-schema', document: spec.document, numbers: spec.numbers }
}

/**
 * Create the cache for one execution domain.
 * Throws `TypeError` when a budget field is missing or out of range.
 * Compiles nothing. Does not import Cordis.
 */
export function createSchemaProvider(budget: SchemaBudget): SchemaProvider {
  const provider = {} as SchemaProvider
  domains.set(provider, { budget, slots: new Map() })
  return provider
}

/**
 * Load, admit, compile on first use, and check one `JsonRead`.
 * Concurrent calls for the same key share one in-flight task.
 * `signal` cancels only this caller.
 */
export function validate<T>(
  provider: SchemaProvider,
  schema: SchemaRef<T>,
  read: JsonRead,
  signal?: AbortSignal,
): Promise<SchemaVerdict<T>> {
  void signal
  if (read.kind !== 'ok') return Promise.resolve({ kind: 'unreadable', failure: read })
  const domain = domainOf(provider)
  const slot = domain.slots.get(schema.id) ?? { kind: 'empty' as const }
  switch (slot.kind) {
    case 'ready':
      return Promise.resolve(checkSnapshot(slot.snapshot, read))
    case 'refused':
      return Promise.resolve({ kind: 'refused', reason: slot.reason })
    case 'empty':
      return open(domain, schema, read)
    case 'inflight':
    case 'cooling':
    case 'retired':
      throw new Error(`slot ${slot.kind} is not produced`)
    default: {
      const unreachable: never = slot
      return unreachable
    }
  }
}

/**
 * Hold one admitted snapshot for many synchronous checks.
 * A newer revision does not retarget this lease. `superseded` becomes true.
 * `release` drops the lease. The snapshot stays until its lease count is zero.
 */
export function lease<T>(
  provider: SchemaProvider,
  schema: SchemaRef<T>,
  signal?: AbortSignal,
): Promise<LeaseOutcome<T>> {
  void provider
  void schema
  void signal
  throw new Error('not implemented')
}

/**
 * Ask the provider to call `load` again on the next use of this id.
 * Shape owners call this when they publish a new revision. Request paths do not.
 */
export function refresh(provider: SchemaProvider, id: SchemaId): void {
  void provider
  void id
  throw new Error('not implemented')
}

/**
 * Stop new admission. Checks that already joined finish on the snapshot they joined.
 * A later `validate` or `lease` returns `refused` with reason `closed`.
 * Calling `close` twice leaves the provider closed.
 */
export function close(provider: SchemaProvider): void {
  void provider
  throw new Error('not implemented')
}

async function open<T>(
  domain: Domain,
  schema: SchemaRef<T>,
  read: JsonRead,
): Promise<SchemaVerdict<T>> {
  const definition = await schema.load()
  const admitted = admit(definition, domain.budget)
  if (admitted.kind === 'refused') {
    domain.slots.set(schema.id, admitted)
    return admitted
  }
  const snapshot: Snapshot = {
    revision: admitted.revision,
    numbers: admitted.numbers,
    check: compileZod(admitted.schema),
  }
  domain.slots.set(schema.id, { kind: 'ready', snapshot })
  return checkSnapshot(snapshot, read)
}

function checkSnapshot<T>(snapshot: Snapshot, read: JsonRead): SchemaVerdict<T> {
  if (read.kind !== 'ok') return { kind: 'unreadable', failure: read }
  const projected = project(read.value, snapshot.numbers)
  if (projected.kind === 'invalid') {
    return {
      kind: 'invalid',
      issues: projected.issues,
      path: 'compiled',
      revision: snapshot.revision,
    }
  }
  const hit = snapshot.check(projected.value)
  if (!hit.ok) {
    return { kind: 'invalid', issues: hit.issues, path: 'compiled', revision: snapshot.revision }
  }
  return {
    kind: 'valid',
    value: projected.value as T,
    path: 'compiled',
    revision: snapshot.revision,
  }
}

function domainOf(provider: SchemaProvider): Domain {
  const domain = domains.get(provider)
  if (domain === undefined)
    throw new TypeError('SchemaProvider was not created by createSchemaProvider')
  return domain
}
