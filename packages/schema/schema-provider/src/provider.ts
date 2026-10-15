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
  SchemaLease,
  SchemaProvider,
  SchemaRef,
  SchemaRevision,
  SchemaVerdict,
  StandardTyped,
  SyncVerdict,
  UnavailableReason,
  ZodDefinition,
} from './index.ts'
import { project } from './project.ts'

type Snapshot = {
  readonly revision: string
  readonly numbers: NumberProjection
  readonly check: (value: unknown) => CheckHit
  leases: number
  superseded: boolean
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
  held: Snapshot | undefined
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
  closed: boolean
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
  domains.set(provider, { budget, slots: new Map(), closed: false })
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
  if (domain.closed) return Promise.resolve({ kind: 'refused', reason: 'closed' })
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
      return begin(domain, schema, read, signal, 0)
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
  if (signal?.aborted) return Promise.resolve({ kind: 'cancelled' })
  const domain = domainOf(provider)
  if (domain.closed) return Promise.resolve({ kind: 'refused', reason: 'closed' })
  const slot = domain.slots.get(schema.id) ?? { kind: 'empty' as const }
  switch (slot.kind) {
    case 'ready':
      return Promise.resolve(hold(domain, schema.id, slot.snapshot))
    case 'refused':
      return Promise.resolve({ kind: 'refused', reason: slot.reason })
    case 'inflight':
      return holdReady(domain, schema.id, follow(slot.flight, signal))
    case 'empty':
      return holdReady(domain, schema.id, beginFlight(domain, schema, signal, 0))
    case 'cooling':
      if (Date.now() < slot.retryNotBeforeMillis) {
        return Promise.resolve({
          kind: 'unavailable',
          reason: slot.reason,
          retryNotBeforeMillis: slot.retryNotBeforeMillis,
        })
      }
      return holdReady(domain, schema.id, beginFlight(domain, schema, signal, slot.attempts))
    case 'retired':
      return holdReady(domain, schema.id, beginFlight(domain, schema, signal, 0))
    default: {
      const unreachable: never = slot
      return unreachable
    }
  }
}

/**
 * Ask the provider to call `load` again on the next use of this id.
 * Shape owners call this when they publish a new revision. Request paths do not.
 */
export function refresh(provider: SchemaProvider, id: SchemaId): void {
  const domain = domainOf(provider)
  const slot = domain.slots.get(id)
  if (slot === undefined) return
  switch (slot.kind) {
    case 'ready':
      if (slot.snapshot.leases > 0) {
        domain.slots.set(id, {
          kind: 'retired',
          snapshot: slot.snapshot,
          leases: slot.snapshot.leases,
        })
        return
      }
      domain.slots.delete(id)
      return
    case 'cooling':
    case 'refused':
      domain.slots.delete(id)
      return
    case 'retired':
    case 'inflight':
    case 'empty':
      return
    default: {
      const unreachable: never = slot
      return unreachable
    }
  }
}

/**
 * Stop new admission. Checks that already joined finish on the snapshot they joined.
 * A later `validate` or `lease` returns `refused` with reason `closed`.
 * Calling `close` twice leaves the provider closed.
 */
export function close(provider: SchemaProvider): void {
  domainOf(provider).closed = true
}

function begin<T>(
  domain: Domain,
  schema: SchemaRef<T>,
  read: JsonRead,
  signal: AbortSignal | undefined,
  attempts: number,
): Promise<SchemaVerdict<T>> {
  return beginFlight(domain, schema, signal, attempts).then(outcome =>
    outcome.kind === 'cancelled' ? outcome : verdictFrom(outcome, read),
  )
}

function beginFlight<T>(
  domain: Domain,
  schema: SchemaRef<T>,
  signal: AbortSignal | undefined,
  attempts: number,
): Promise<FlightOutcome | { readonly kind: 'cancelled' }> {
  const current = domain.slots.get(schema.id)
  if (current === undefined && !reserve(domain)) {
    return Promise.resolve({ kind: 'refused', reason: 'budget-exhausted' })
  }
  const flight = createFlight()
  if (current?.kind === 'retired') flight.held = current.snapshot
  domain.slots.set(schema.id, { kind: 'inflight', flight, attempts })
  const pending = follow(flight, signal)
  void execute(domain, schema, flight, attempts)
  return pending
}

function reserve(domain: Domain): boolean {
  if (domain.slots.size < domain.budget.maxSnapshots) return true
  for (const [id, slot] of domain.slots) {
    if (!evictable(slot)) continue
    domain.slots.delete(id)
    return true
  }
  return false
}

function evictable(slot: Slot): boolean {
  switch (slot.kind) {
    case 'ready':
      return slot.snapshot.leases === 0
    case 'cooling':
      return Date.now() >= slot.retryNotBeforeMillis
    case 'retired':
      return slot.snapshot.leases === 0
    case 'empty':
    case 'inflight':
    case 'refused':
      return false
    default: {
      const unreachable: never = slot
      return unreachable
    }
  }
}

function createFlight(): Flight {
  let resolve: (outcome: FlightOutcome) => void = () => {}
  const done = new Promise<FlightOutcome>(settle => {
    resolve = settle
  })
  return { live: 0, done, resolve, held: undefined }
}

function join<T>(
  flight: Flight,
  read: JsonRead,
  signal: AbortSignal | undefined,
): Promise<SchemaVerdict<T>> {
  return follow(flight, signal).then(outcome =>
    outcome.kind === 'cancelled' ? outcome : verdictFrom(outcome, read),
  )
}

function follow(
  flight: Flight,
  signal: AbortSignal | undefined,
): Promise<FlightOutcome | { readonly kind: 'cancelled' }> {
  flight.live += 1
  return new Promise(resolve => {
    let settled = false
    const finish = (outcome: FlightOutcome | { readonly kind: 'cancelled' }) => {
      if (settled) return
      settled = true
      flight.live -= 1
      signal?.removeEventListener('abort', onAbort)
      resolve(outcome)
    }
    const onAbort = () => finish({ kind: 'cancelled' })
    if (signal?.aborted) {
      finish({ kind: 'cancelled' })
      return
    }
    if (signal !== undefined) signal.addEventListener('abort', onAbort)
    void flight.done.then(outcome => {
      if (settled) return
      finish(outcome)
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
    if (!restoreHeld(domain, schema.id, flight)) domain.slots.set(schema.id, admitted)
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
  if (flight.held !== undefined) flight.held.superseded = true
  const snapshot: Snapshot = {
    revision: admitted.revision,
    numbers: admitted.numbers,
    check,
    leases: 0,
    superseded: false,
  }
  domain.slots.set(schema.id, { kind: 'ready', snapshot })
  flight.resolve({ kind: 'ready', snapshot })
}

function drop(domain: Domain, id: string, flight: Flight): void {
  if (!restoreHeld(domain, id, flight)) domain.slots.delete(id)
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
    if (!restoreHeld(domain, id, flight)) domain.slots.set(id, refused)
    flight.resolve(refused)
    return
  }
  const retryNotBeforeMillis = Date.now() + domain.budget.failureBackoffMs
  if (!restoreHeld(domain, id, flight)) {
    domain.slots.set(id, { kind: 'cooling', attempts: next, reason, retryNotBeforeMillis })
  }
  flight.resolve({ kind: 'unavailable', reason, retryNotBeforeMillis })
}

function restoreHeld(domain: Domain, id: string, flight: Flight): boolean {
  const held = flight.held
  if (held === undefined || held.leases === 0) return false
  domain.slots.set(id, { kind: 'retired', snapshot: held, leases: held.leases })
  return true
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

function holdReady<T>(
  domain: Domain,
  id: string,
  pending: Promise<FlightOutcome | { readonly kind: 'cancelled' }>,
): Promise<LeaseOutcome<T>> {
  return pending.then(outcome => {
    if (outcome.kind === 'cancelled' || outcome.kind === 'dropped') return { kind: 'cancelled' }
    if (outcome.kind === 'ready') return hold(domain, id, outcome.snapshot)
    return outcome
  })
}

function hold<T>(domain: Domain, id: string, snapshot: Snapshot): LeaseOutcome<T> {
  snapshot.leases += 1
  let released = false
  const lease: SchemaLease<T> = {
    revision: snapshot.revision,
    get superseded() {
      return snapshot.superseded
    },
    check(read) {
      return checkSnapshot(snapshot, read)
    },
    release() {
      if (released) return
      released = true
      snapshot.leases -= 1
      const slot = domain.slots.get(id)
      if (slot?.kind !== 'retired' || slot.snapshot !== snapshot) return
      if (snapshot.leases === 0) domain.slots.delete(id)
      else domain.slots.set(id, { kind: 'retired', snapshot, leases: snapshot.leases })
    },
    [Symbol.dispose]() {
      lease.release()
    },
  }
  return { kind: 'leased', lease }
}

function checkSnapshot<T>(snapshot: Snapshot, read: JsonRead): SyncVerdict<T> {
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
