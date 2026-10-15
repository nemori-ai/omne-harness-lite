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

type FlightOutcome =
  | { readonly kind: 'ready'; readonly snapshot: Snapshot }
  | { readonly kind: 'refused'; readonly reason: RefusalReason }
  | {
      readonly kind: 'unavailable'
      readonly reason: UnavailableReason
      readonly retryNotBeforeMillis: number
    }
  | { readonly kind: 'dropped' }

type Flight = {
  live: number
  readonly done: Promise<FlightOutcome>
  resolve: (outcome: FlightOutcome) => void
}

type Slot =
  | { readonly kind: 'empty' }
  | { readonly kind: 'inflight'; readonly flight: Flight; readonly attempts: number }
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
  if (read.kind !== 'ok') return Promise.resolve({ kind: 'unreadable', failure: read })
  if (signal?.aborted) return Promise.resolve({ kind: 'cancelled' })
  const domain = domainOf(provider)
  const slot = domain.slots.get(schema.id) ?? { kind: 'empty' as const }
  switch (slot.kind) {
    case 'ready':
      return Promise.resolve(checkSnapshot(slot.snapshot, read))
    case 'refused':
      return Promise.resolve({ kind: 'refused', reason: slot.reason })
    case 'inflight':
      return join<T>(slot.flight, read, signal)
    case 'empty':
      return begin(domain, schema, read, signal, 0)
    case 'cooling':
      if (Date.now() < slot.retryNotBeforeMillis) {
        return Promise.resolve({
          kind: 'unavailable',
          reason: slot.reason,
          retryNotBeforeMillis: slot.retryNotBeforeMillis,
        })
      }
      return begin(domain, schema, read, signal, slot.attempts)
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

function begin<T>(
  domain: Domain,
  schema: SchemaRef<T>,
  read: JsonRead,
  signal: AbortSignal | undefined,
  attempts: number,
): Promise<SchemaVerdict<T>> {
  const flight = createFlight()
  domain.slots.set(schema.id, { kind: 'inflight', flight, attempts })
  const pending = join<T>(flight, read, signal)
  void execute(domain, schema, flight, attempts)
  return pending
}

function createFlight(): Flight {
  let resolve: (outcome: FlightOutcome) => void = () => {}
  const done = new Promise<FlightOutcome>(settle => {
    resolve = settle
  })
  return { live: 0, done, resolve }
}

function join<T>(
  flight: Flight,
  read: JsonRead,
  signal: AbortSignal | undefined,
): Promise<SchemaVerdict<T>> {
  flight.live += 1
  return new Promise(resolve => {
    let settled = false
    const finish = (verdict: SchemaVerdict<T>) => {
      if (settled) return
      settled = true
      flight.live -= 1
      signal?.removeEventListener('abort', onAbort)
      resolve(verdict)
    }
    const onAbort = () => finish({ kind: 'cancelled' })
    if (signal?.aborted) {
      finish({ kind: 'cancelled' })
      return
    }
    if (signal !== undefined) signal.addEventListener('abort', onAbort)
    void flight.done.then(outcome => {
      if (settled) return
      finish(verdictFrom(outcome, read))
    })
  })
}

async function execute<T>(
  domain: Domain,
  schema: SchemaRef<T>,
  flight: Flight,
  attempts: number,
): Promise<void> {
  let definition: SchemaDefinition<T>
  try {
    definition = await schema.load()
  } catch {
    if (flight.live === 0) {
      drop(domain, schema.id, flight)
      return
    }
    recordFailure(domain, schema.id, flight, attempts, 'load-failed')
    return
  }
  // Every waiter left before compile, so this flight must not publish a snapshot.
  if (flight.live === 0) {
    drop(domain, schema.id, flight)
    return
  }
  const admitted = admit(definition, domain.budget)
  if (admitted.kind === 'refused') {
    domain.slots.set(schema.id, admitted)
    flight.resolve(admitted)
    return
  }
  let check: Snapshot['check']
  try {
    check = compileZod(admitted.schema)
  } catch {
    recordFailure(domain, schema.id, flight, attempts, 'compile-failed')
    return
  }
  const snapshot: Snapshot = { revision: admitted.revision, numbers: admitted.numbers, check }
  domain.slots.set(schema.id, { kind: 'ready', snapshot })
  flight.resolve({ kind: 'ready', snapshot })
}

function drop(domain: Domain, id: string, flight: Flight): void {
  domain.slots.delete(id)
  flight.resolve({ kind: 'dropped' })
}

function recordFailure(
  domain: Domain,
  id: string,
  flight: Flight,
  attempts: number,
  reason: UnavailableReason,
): void {
  const next = attempts + 1
  if (next >= domain.budget.maxAttempts) {
    const refused = { kind: 'refused' as const, reason: 'attempts-exhausted' as const }
    domain.slots.set(id, refused)
    flight.resolve(refused)
    return
  }
  const retryNotBeforeMillis = Date.now() + domain.budget.failureBackoffMs
  domain.slots.set(id, { kind: 'cooling', attempts: next, reason, retryNotBeforeMillis })
  flight.resolve({ kind: 'unavailable', reason, retryNotBeforeMillis })
}

function verdictFrom<T>(outcome: FlightOutcome, read: JsonRead): SchemaVerdict<T> {
  switch (outcome.kind) {
    case 'ready':
      return checkSnapshot(outcome.snapshot, read)
    case 'refused':
    case 'unavailable':
      return outcome
    case 'dropped':
      return { kind: 'cancelled' }
    default: {
      const unreachable: never = outcome
      return unreachable
    }
  }
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
