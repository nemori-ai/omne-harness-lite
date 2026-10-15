import type { JsonRead } from '@omne-harness/json-text'
import { admit } from './admit.ts'
import { compileJsonSchema, compileZod, type CheckHit } from './engine.ts'
import type {
  JsonSchemaDefinition,
  LeaseOutcome,
  NumberProjection,
  RefusalReason,
  SchemaBudget,
  SchemaDefinition,
  SchemaId,
  SchemaLease,
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
  readonly id: string
  readonly revision: string
  readonly digest: string
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
  readonly settled: boolean
  resolve: (outcome: FlightOutcome) => void
  held: Snapshot | undefined
  /** A refresh arrived while this load was still running. Later consumers must load again. */
  reload: boolean
  /** Waiters that still have to hold or cancel this ready result. `live` hits zero earlier. */
  undelivered: number
  /** Waiters who have not finished. A claim is counted only while it is still here at publish. */
  readonly open: Set<DeliveryClaim>
}

type DeliveryClaim = {
  readonly flight: Flight
  owed: boolean
}

type Slot =
  | { readonly kind: 'empty' }
  | { readonly kind: 'inflight'; readonly flight: Flight; readonly attempts: number }
  | {
      readonly kind: 'ready'
      readonly snapshot: Snapshot
      readonly reload: boolean
      readonly flight?: Flight
    }
  | {
      readonly kind: 'cooling'
      readonly attempts: number
      readonly reason: UnavailableReason
      readonly retryNotBeforeMillis: number
      readonly held?: Snapshot
    }
  | { readonly kind: 'refused'; readonly reason: RefusalReason; readonly held?: Snapshot }
  | { readonly kind: 'retired'; readonly snapshot: Snapshot; readonly leases: number }

type Domain = {
  readonly budget: SchemaBudget
  readonly slots: Map<string, Slot>
  /** Leased snapshots that are no longer the current slot. They still occupy the budget. */
  readonly retained: Set<Snapshot>
  closed: boolean
}

const providerBrand: unique symbol = Symbol('schema-provider')

/** One cache owner for one execution domain. Callers cannot construct it. Workers do not share it. */
export type SchemaProvider = { readonly [providerBrand]: true }

const domains = new WeakMap<SchemaProvider, Domain>()

export function defineSchema<T>(spec: {
  readonly id: string
  readonly load: () => Promise<SchemaDefinition<T>>
}): SchemaRef<T> {
  if (spec.id === '') throw new TypeError('schema id must not be empty')
  const id = spec.id as SchemaId
  return { id, load: spec.load }
}

type StandardOutput<S> = S extends { readonly '~standard': { readonly types?: infer Types } }
  ? [NonNullable<Types>] extends [never]
    ? unknown
    : NonNullable<Types> extends { readonly output: infer T }
      ? T
      : unknown
  : unknown

export function zodDefinition<S extends StandardTyped<StandardOutput<S>>>(spec: {
  readonly revision: string
  readonly schema: S
  readonly numbers: NumberProjection
}): ZodDefinition<StandardOutput<S>> {
  return {
    origin: 'static',
    engine: 'zod',
    revision: spec.revision as SchemaRevision,
    schema: spec.schema,
    numbers: spec.numbers,
  }
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
  requireSafeInteger('maxSnapshots', budget.maxSnapshots, 1)
  requireSafeInteger('maxConstructDepth', budget.maxConstructDepth, 1)
  requireSafeInteger('maxConstructNodes', budget.maxConstructNodes, 1)
  requireSafeInteger('maxAttempts', budget.maxAttempts, 1)
  requireSafeInteger('failureBackoffMs', budget.failureBackoffMs, 0)
  const provider = { [providerBrand]: true as const }
  domains.set(provider, { budget, slots: new Map(), retained: new Set(), closed: false })
  return provider
}

function requireSafeInteger(name: string, value: number, minimum: number): void {
  if (Number.isSafeInteger(value) && value >= minimum) return
  throw new TypeError(`${name} must be a safe integer greater than or equal to ${minimum}`)
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
      if (slot.reload && (slot.flight === undefined || slot.flight.undelivered === 0)) {
        releaseReloadSlot(domain, schema.id)
        return begin(domain, schema, read, signal, 0)
      }
      return Promise.resolve(checkSnapshot(slot.snapshot, read))
    case 'refused':
      return Promise.resolve({ kind: 'refused', reason: slot.reason })
    case 'inflight':
      return join<T>(domain, schema.id, slot.flight, read, signal)
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
      if (slot.reload && (slot.flight === undefined || slot.flight.undelivered === 0)) {
        releaseReloadSlot(domain, schema.id)
        return holdFlight(domain, schema.id, beginFlight(domain, schema, signal, 0))
      }
      return Promise.resolve(hold(domain, schema.id, slot.snapshot))
    case 'refused':
      return Promise.resolve({ kind: 'refused', reason: slot.reason })
    case 'inflight':
      return holdFlight(domain, schema.id, follow(slot.flight, signal))
    case 'empty':
      return holdFlight(domain, schema.id, beginFlight(domain, schema, signal, 0))
    case 'cooling':
      if (Date.now() < slot.retryNotBeforeMillis) {
        return Promise.resolve({
          kind: 'unavailable',
          reason: slot.reason,
          retryNotBeforeMillis: slot.retryNotBeforeMillis,
        })
      }
      return holdFlight(domain, schema.id, beginFlight(domain, schema, signal, slot.attempts))
    case 'retired':
      return holdFlight(domain, schema.id, beginFlight(domain, schema, signal, 0))
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
      if (slot.reload) return
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
      if (slot.held !== undefined && slot.held.leases > 0) {
        domain.retained.delete(slot.held)
        domain.slots.set(id, { kind: 'retired', snapshot: slot.held, leases: slot.held.leases })
        return
      }
      domain.slots.delete(id)
      return
    case 'inflight':
      slot.flight.reload = true
      return
    case 'retired':
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
  const watched = beginFlight(domain, schema, signal, attempts)
  return watched.result.then(outcome => {
    if (watched.claim !== undefined) settleDelivery(domain, schema.id, watched.claim)
    return outcome.kind === 'cancelled' ? outcome : verdictFrom(outcome, read)
  })
}

function beginFlight<T>(
  domain: Domain,
  schema: SchemaRef<T>,
  signal: AbortSignal | undefined,
  attempts: number,
): { result: Promise<FlightOutcome | { readonly kind: 'cancelled' }>; claim?: DeliveryClaim } {
  const current = domain.slots.get(schema.id)
  const keeping = leasedHeld(current)
  if (keeping !== undefined && !domain.retained.has(keeping)) {
    if (!admitAnother(domain, schema.id)) {
      return { result: Promise.resolve({ kind: 'refused', reason: 'budget-exhausted' }) }
    }
    // Count the leased snapshot from the moment the replacement flight is accepted.
    domain.retained.add(keeping)
  } else if (keeping === undefined && current === undefined && !reserve(domain)) {
    return { result: Promise.resolve({ kind: 'refused', reason: 'budget-exhausted' }) }
  }
  const flight = createFlight()
  if (keeping !== undefined) flight.held = keeping
  domain.slots.set(schema.id, { kind: 'inflight', flight, attempts })
  const watched = follow(flight, signal)
  void execute(domain, schema, flight, attempts).catch(() => {
    refuseAdmission(domain, schema.id, flight)
  })
  return watched
}

function occupancy(domain: Domain): number {
  return domain.slots.size + domain.retained.size
}

function reserve(domain: Domain): boolean {
  if (occupancy(domain) < domain.budget.maxSnapshots) return true
  for (const [id, slot] of domain.slots) {
    if (!evictable(slot)) continue
    domain.slots.delete(id)
    if (occupancy(domain) < domain.budget.maxSnapshots) return true
  }
  return false
}

/** A new snapshot beside one that a lease still holds needs its own budget unit. */
function admitAnother(domain: Domain, keepId: string): boolean {
  if (occupancy(domain) < domain.budget.maxSnapshots) return true
  for (const [id, slot] of domain.slots) {
    if (id === keepId || !evictable(slot)) continue
    domain.slots.delete(id)
    if (occupancy(domain) < domain.budget.maxSnapshots) return true
  }
  return false
}

function residentSnapshot(slot: Slot | undefined): Snapshot | undefined {
  if (slot?.kind === 'ready' || slot?.kind === 'retired') return slot.snapshot
  if (slot?.kind === 'cooling' || slot?.kind === 'refused') return slot.held
  return undefined
}

function leasedHeld(slot: Slot | undefined): Snapshot | undefined {
  if (slot?.kind === 'retired' && slot.snapshot.leases > 0) return slot.snapshot
  if ((slot?.kind === 'cooling' || slot?.kind === 'refused') && slot.held !== undefined && slot.held.leases > 0) {
    return slot.held
  }
  return undefined
}

function evictable(slot: Slot): boolean {
  switch (slot.kind) {
    case 'ready':
      if (slot.reload) return false
      return slot.snapshot.leases === 0
    case 'cooling':
      if (slot.held !== undefined && slot.held.leases > 0) return false
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
  let settled = false
  return {
    live: 0,
    done,
    held: undefined,
    reload: false,
    undelivered: 0,
    open: new Set(),
    get settled() {
      return settled
    },
    resolve(outcome) {
      if (settled) return
      settled = true
      resolve(outcome)
    },
  }
}

function join<T>(
  domain: Domain,
  id: string,
  flight: Flight,
  read: JsonRead,
  signal: AbortSignal | undefined,
): Promise<SchemaVerdict<T>> {
  const watched = follow(flight, signal)
  return watched.result.then(outcome => {
    settleDelivery(domain, id, watched.claim)
    return outcome.kind === 'cancelled' ? outcome : verdictFrom(outcome, read)
  })
}

function follow(
  flight: Flight,
  signal: AbortSignal | undefined,
): { result: Promise<FlightOutcome | { readonly kind: 'cancelled' }>; claim: DeliveryClaim } {
  const claim: DeliveryClaim = { flight, owed: false }
  flight.open.add(claim)
  flight.live += 1
  const result = new Promise<FlightOutcome | { readonly kind: 'cancelled' }>(resolve => {
    let settled = false
    const finish = (outcome: FlightOutcome | { readonly kind: 'cancelled' }) => {
      if (settled) return
      settled = true
      flight.live -= 1
      flight.open.delete(claim)
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
  return { result, claim }
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
  let admitted: ReturnType<typeof admit>
  try {
    admitted = admit(definition, domain.budget)
  } catch {
    refuseAdmission(domain, schema.id, flight)
    return
  }
  if (admitted.kind === 'refused') {
    const held = activeHeld(flight)
    if (held === undefined) domain.slots.set(schema.id, admitted)
    else domain.slots.set(schema.id, { kind: 'refused', reason: admitted.reason, held })
    flight.resolve(admitted)
    noteReload(domain, schema.id, flight)
    return
  }
  if (hasRevisionConflict(domain, schema.id, flight, admitted.revision, admitted.digest)) {
    if (!restoreHeld(domain, schema.id, flight)) domain.slots.delete(schema.id)
    flight.resolve({ kind: 'refused', reason: 'revision-conflict' })
    noteReload(domain, schema.id, flight)
    return
  }
  let check: Snapshot['check']
  try {
    check =
      admitted.engine === 'zod' ? compileZod(admitted.schema) : compileJsonSchema(admitted.document)
  } catch {
    recordFailure(domain, schema.id, flight, attempts, 'compile-failed')
    return
  }
  const snapshot: Snapshot = {
    id: schema.id,
    revision: admitted.revision,
    digest: admitted.digest,
    numbers: admitted.numbers,
    check,
    leases: 0,
    superseded: false,
  }
  if (flight.held !== undefined && flight.held.leases > 0) domain.retained.add(flight.held)
  markSuperseded(domain, schema.id, snapshot, flight.held)
  if (flight.reload) {
    let owed = 0
    for (const claim of flight.open) {
      claim.owed = true
      owed += 1
    }
    flight.undelivered = owed
  }
  domain.slots.set(schema.id, {
    kind: 'ready',
    snapshot,
    reload: flight.reload,
    ...(flight.reload ? { flight } : {}),
  })
  flight.resolve({ kind: 'ready', snapshot })
  noteReload(domain, schema.id, flight)
}

function drop(domain: Domain, id: string, flight: Flight): void {
  if (!flight.reload) {
    if (!restoreHeld(domain, id, flight)) domain.slots.delete(id)
  } else {
    const held = activeHeld(flight)
    if (held !== undefined) domain.retained.add(held)
    domain.slots.delete(id)
  }
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
  const held = activeHeld(flight)
  if (next >= domain.budget.maxAttempts) {
    const refused = { kind: 'refused' as const, reason: 'attempts-exhausted' as const }
    domain.slots.set(id, held === undefined ? refused : { ...refused, held })
    flight.resolve(refused)
    noteReload(domain, id, flight)
    return
  }
  const retryNotBeforeMillis = Date.now() + domain.budget.failureBackoffMs
  domain.slots.set(id, {
    kind: 'cooling',
    attempts: next,
    reason,
    retryNotBeforeMillis,
    ...(held === undefined ? {} : { held }),
  })
  flight.resolve({ kind: 'unavailable', reason, retryNotBeforeMillis })
  noteReload(domain, id, flight)
}

function activeHeld(flight: Flight): Snapshot | undefined {
  const held = flight.held
  if (held === undefined || held.leases === 0) return undefined
  return held
}

function refuseAdmission(domain: Domain, id: string, flight: Flight): void {
  if (flight.settled) return
  const held = activeHeld(flight)
  const refused = { kind: 'refused' as const, reason: 'unsupported-construct' as const }
  domain.slots.set(id, held === undefined ? refused : { ...refused, held })
  flight.resolve(refused)
  noteReload(domain, id, flight)
}

function markSuperseded(
  domain: Domain,
  id: string,
  current: Snapshot,
  held: Snapshot | undefined,
): void {
  if (held !== undefined && held !== current) held.superseded = true
  for (const previous of domain.retained) {
    if (previous.id === id && previous !== current) previous.superseded = true
  }
}

/** A refresh during this flight belongs to the next consumer, on every settlement path. */
function noteReload(domain: Domain, id: string, flight: Flight): void {
  if (!flight.reload) return
  const slot = domain.slots.get(id)
  // A ready result still has to reach its waiters. Deleting it here lets another id take the budget first.
  if (slot?.kind === 'ready' && slot.reload) return
  const held = activeHeld(flight)
  if (held !== undefined) domain.retained.add(held)
  domain.slots.delete(id)
}

function settleDelivery(domain: Domain, id: string, claim: DeliveryClaim): void {
  if (!claim.owed) return
  claim.owed = false
  if (claim.flight.undelivered > 0) claim.flight.undelivered -= 1
  const slot = domain.slots.get(id)
  if (slot?.kind !== 'ready' || slot.flight !== claim.flight) return
  releaseReloadSlot(domain, id)
}

function releaseReloadSlot(domain: Domain, id: string): void {
  const slot = domain.slots.get(id)
  if (slot?.kind !== 'ready' || !slot.reload) return
  if (slot.flight !== undefined && slot.flight.undelivered > 0) return
  if (slot.snapshot.leases > 0) domain.retained.add(slot.snapshot)
  domain.slots.delete(id)
}

function hasRevisionConflict(
  domain: Domain,
  id: string,
  flight: Flight,
  revision: string,
  digest: string,
): boolean {
  const seen = new Set<Snapshot>()
  const candidates = [flight.held, residentSnapshot(domain.slots.get(id))]
  for (const snapshot of domain.retained) {
    if (snapshot.id === id) candidates.push(snapshot)
  }
  for (const snapshot of candidates) {
    if (snapshot === undefined || seen.has(snapshot) || snapshot.leases === 0) continue
    seen.add(snapshot)
    if (snapshot.revision === revision && snapshot.digest !== digest) return true
  }
  return false
}

function restoreHeld(domain: Domain, id: string, flight: Flight): boolean {
  const held = flight.held
  if (held === undefined || held.leases === 0) return false
  domain.retained.delete(held)
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

function holdFlight<T>(
  domain: Domain,
  id: string,
  watched: { result: Promise<FlightOutcome | { readonly kind: 'cancelled' }>; claim?: DeliveryClaim },
): Promise<LeaseOutcome<T>> {
  return watched.result.then(outcome => {
    if (outcome.kind === 'ready') {
      const leased = hold<T>(domain, id, outcome.snapshot)
      if (watched.claim !== undefined) settleDelivery(domain, id, watched.claim)
      return leased
    }
    if (watched.claim !== undefined) settleDelivery(domain, id, watched.claim)
    if (outcome.kind === 'cancelled' || outcome.kind === 'dropped') return { kind: 'cancelled' }
    return outcome
  })
}

function hold<T>(domain: Domain, id: string, snapshot: Snapshot): LeaseOutcome<T> {
  snapshot.leases += 1
  if (residentSnapshot(domain.slots.get(id)) !== snapshot) domain.retained.add(snapshot)
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
      if (snapshot.leases === 0) domain.retained.delete(snapshot)
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
      path: 'projection',
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
