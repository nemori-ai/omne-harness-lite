import { randomUUID } from 'node:crypto'

import {
  managedResourceSchema,
  originalAcquisitionSchema,
  type ManagedResource,
  type OriginalAcquisition,
} from '@omne-harness/execution-environment-contract'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeScopeRef, type ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  CALL_RECORD_KEY,
  canonicalDigest,
  hostKey,
  type LedgerAssertion,
  type LedgerCommit,
  type LedgerDomain,
  type LedgerWrite,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type Adoption,
  type DurableEvidence,
  type ToolCallId,
  type ToolFailure,
  type ToolOperationId,
  type ToolRevision,
} from '@omne-harness/tool-contract'
import {
  decodeToolRevision,
  judgeFixedToolRequest,
  type PreparationRecord,
  type ReleaseRecord,
} from '@omne-harness/tool-contract/provider'
import { callHostDomain, retentionHostDomain } from './host-domains.ts'

/** The stop fact an acquisition stores for one of its resources. */
export type StoredResourceStop = 'active' | 'unconfirmed' | 'confirmed'
/**
 * The stop fact as a reader of the acquisition sees it. `handedOver` is never stored: the
 * retention scope of the acquisition adopted the resource, so the acquisition no longer owns it.
 * The scope's record owns that fact; a read of the acquisition applies it, and a write of the
 * acquisition keeps its own stored fact for the key. No later stop fact replaces it in the view.
 */
export type ResourceStop = StoredResourceStop | 'handedOver'
export type ResourceFact = Readonly<{
  resource: ManagedResource
  permitted: boolean
  adopted: boolean
  stop: ResourceStop
}>
type StoredResourceFact = ResourceFact & Readonly<{ stop: StoredResourceStop }>
/**
 * A reservation (`plan`) of the acquisition's retention scope view: it stays in the creating
 * acquisition's record with its stop fact, and reads `handedOver` while the scope holds the key.
 */
export type Reservation = Readonly<{ resource: ManagedResource; stop: ResourceStop }>
type StoredReservation = Reservation & Readonly<{ stop: StoredResourceStop }>
export type AllocationFact =
  | Readonly<{ kind: 'sent' | 'unknown' | 'allocated' | 'not-allocated' | 'settled' }>
  | Readonly<{ kind: 'rejected'; reason: string }>
export type EnvironmentOriginal = OriginalAcquisition & Readonly<{ retentionScope?: ScopeRef }>
export type EnvironmentState = Readonly<{
  preparation: PreparationRecord
  original: EnvironmentOriginal
  digest: string
  allocation: AllocationFact
  closed: boolean
  evidence: DurableEvidence
  release: Readonly<{ record: ReleaseRecord; confirmed: boolean }> | null
  resources: readonly ResourceFact[]
  reservations: readonly Reservation[]
}>
/** The acquisition as stored: its own stop facts, never a handover. */
type StoredEnvironmentState = Omit<EnvironmentState, 'resources' | 'reservations'> &
  Readonly<{
    resources: readonly StoredResourceFact[]
    reservations: readonly StoredReservation[]
  }>
export type EnvironmentAddress = Readonly<{
  tenant: TenantId
  call: ToolCallId
  operation: ToolOperationId
}>
export type EnvironmentStorageOptions = Readonly<{
  store: ToolLedgerStore
  mode?: 'production' | 'test'
  commitAttempts?: number
}>
/**
 * The acquisition that created a retained entry: a reference by key, with the digest of its
 * original binding. The entry copies nothing of the preparation; a reader that needs it reads the
 * creator's `environment@<call>` record by key.
 */
export type RetainedCreator = Readonly<{
  call: ToolCallId
  operation: ToolOperationId
  original: string
}>
/** The stop fact of a live retained entry; a confirmed stop removes the entry. */
export type RetainedStop = 'active' | 'unconfirmed'
/** An entry the scope took over: a permitted terminal or an adopted process. */
export type RetainedResourceFact = Readonly<{
  resource: ManagedResource
  taken: 'permitted' | 'adopted'
  stop: RetainedStop
  creator: RetainedCreator
}>
/**
 * The record of one retention scope (SPEC, 环境准备的租户调度): `open` or `closed`, never open
 * again, and never deleted. It holds only the entries the scope took over; a reservation stays
 * in its creator's record. The end fact of an adopted process is a record of its own in the
 * scope's domain (`ended/<key>`).
 */
export type RetentionState = Readonly<{
  phase: 'open' | 'closed'
  scope: ScopeRef
  resources: readonly RetainedResourceFact[]
}>

/** The acquisition as it closes: every reservation the scope did not take over is stopped. */
export function closedAcquisition(state: EnvironmentState): EnvironmentState {
  return {
    ...state,
    closed: true,
    reservations: state.reservations.map(item =>
      item.stop === 'handedOver' ? item : { ...item, stop: 'confirmed' },
    ),
  }
}

/** A change of an acquisition record, decided on it and on its retention scope's record. */
type StateChange = (
  state: EnvironmentState | null,
  receipt: (value: unknown) => DurableEvidence,
  retention: RetentionState | null,
) => Outcome<EnvironmentState, ToolFailure>
/**
 * The decision of one take-over: the entry the scope adds for a reservation of the creating
 * acquisition, or `held` when the scope holds it already, decided on that acquisition and the
 * scope's record. The acquisition is read, never written.
 */
type TakeOverDecision = (
  creator: EnvironmentState,
  retention: RetentionState | null,
) => Outcome<RetainedResourceFact | 'held', ToolFailure>
type CurrentResourceAuthorization = () => Promise<'authorized' | 'notAuthorized' | 'unavailable'>
type MutationRead<T> = Outcome<{ state: T | null; mutation: string | null }, ToolFailure>
type RetentionSnapshot = Readonly<{
  revision: ToolRevision
  state: RetentionState | null
  mutation: string | null
}>
type AcquisitionSnapshot = Readonly<{
  revision: ToolRevision
  /** The record as stored, or null when there is none. */
  stored: StoredEnvironmentState | null
  /** The record with the handovers of its retention scope applied. */
  state: EnvironmentState | null
  mutation: string | null
  /** The retention scope's record when the acquisition names one, for the write's assertion. */
  retention: RetentionSnapshot | null
}>
const localClosures = new WeakMap<ToolLedgerStore, Map<string, Set<() => void>>>()

export const environmentFailure = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'execution-environment-adapter', diagnostic })
export const preparationKey = (address: Pick<EnvironmentAddress, 'call' | 'operation'>): string =>
  JSON.stringify([address.call, address.operation])
/** The host domain of one call's environment acquisitions. */
export const acquisitionDomain = (address: Pick<EnvironmentAddress, 'tenant' | 'call'>) =>
  callHostDomain(address.tenant, 'environment', address.call)
/** The host domain of one retention scope: state that spans the calls of that scope. */
export const retentionDomain = (tenant: TenantId, scope: ScopeRef) =>
  retentionHostDomain(tenant, canonicalDigest(scope))
/** The key of the one record of a retention scope's domain. */
export const RETENTION_RECORD_KEY = 'scope'
/** The key of the end fact of the retained process `key` in its scope's domain. */
export const endedRecordKey = (key: string): string => `ended/${key}`
const callDomain = (address: Pick<EnvironmentAddress, 'tenant' | 'call'>): LedgerDomain => ({
  kind: 'call',
  tenant: address.tenant,
  call: address.call,
})

/** Whether `entry` was created by the acquisition `stored`. */
export function createdBy(creator: RetainedCreator, stored: EnvironmentState): boolean {
  return (
    creator.call === stored.preparation.call &&
    creator.operation === stored.preparation.operation &&
    creator.original === canonicalDigest(stored.original)
  )
}

/**
 * The acquisition with every key its retention scope took over from it marked `handedOver`, in
 * its resources and its reservations.
 */
function withHandovers(
  stored: StoredEnvironmentState,
  retention: RetentionState | null,
): EnvironmentState {
  const taken = new Set(
    (retention?.resources ?? [])
      .filter(item => createdBy(item.creator, stored))
      .map(item => item.resource.key),
  )
  if (taken.size === 0) return stored
  const handedOver = <T extends Readonly<{ resource: ManagedResource; stop: ResourceStop }>>(
    item: T,
  ): T => (taken.has(item.resource.key) ? { ...item, stop: 'handedOver' } : item)
  return {
    ...stored,
    resources: stored.resources.map(handedOver),
    reservations: stored.reservations.map(handedOver),
  }
}

/**
 * The decided state as the acquisition stores it: a fact the decision left `handedOver` keeps the
 * acquisition's own stored stop fact, because the handover is the scope's fact.
 */
function withoutHandovers(
  next: EnvironmentState,
  stored: StoredEnvironmentState | null,
): StoredEnvironmentState {
  const own = <T extends Readonly<{ resource: ManagedResource; stop: ResourceStop }>>(
    before: readonly Readonly<{ resource: ManagedResource; stop: StoredResourceStop }>[],
  ) => {
    const stops = new Map(before.map(item => [item.resource.key, item.stop]))
    return (item: T): T & Readonly<{ stop: StoredResourceStop }> => ({
      ...item,
      stop: item.stop === 'handedOver' ? (stops.get(item.resource.key) ?? 'active') : item.stop,
    })
  }
  return {
    ...next,
    resources: next.resources.map(own(stored?.resources ?? [])),
    reservations: next.reservations.map(own(stored?.reservations ?? [])),
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function evidence(value: unknown): value is DurableEvidence {
  return (
    object(value) &&
    ['owner', 'record', 'revision', 'digest'].every(
      key => typeof value[key] === 'string' && value[key].length > 0,
    )
  )
}
function adoption(value: unknown): value is Adoption {
  return (
    object(value) &&
    ['owner', 'name', 'revision', 'digest'].every(
      key => typeof value[key] === 'string' && value[key].length > 0,
    )
  )
}
function protocol(value: unknown) {
  if (
    !object(value) ||
    typeof value.tenant !== 'string' ||
    !adoption(value.adoption) ||
    typeof value.inputDigest !== 'string'
  )
    return null
  const tenant = tenantCodec.parse(value.tenant)
  const call = decodeToolCallId(value.call)
  const operation = decodeToolOperationId(value.operation)
  if (!tenant.ok || 'failure' in call || 'failure' in operation) return null
  return {
    tenant: tenant.value,
    call: call.ok,
    operation: operation.ok,
    adoption: value.adoption,
    inputDigest: value.inputDigest,
  }
}
function preparation(value: unknown): PreparationRecord | null {
  const identity = protocol(value)
  if (!identity || !object(value) || (value.purpose !== 'initial' && value.purpose !== 'resume'))
    return null
  const request = judgeFixedToolRequest(value.request)
  return 'failure' in request ? null : { ...identity, purpose: value.purpose, request: request.ok }
}
function release(value: unknown): EnvironmentState['release'] | undefined {
  if (value === null) return null
  if (!object(value) || typeof value.confirmed !== 'boolean' || !object(value.record))
    return undefined
  const identity = protocol(value.record)
  const operation = decodeToolOperationId(value.record.preparation)
  if (
    !identity ||
    'failure' in operation ||
    !evidence(value.record.resource) ||
    !evidence(value.record.custody)
  )
    return undefined
  return {
    confirmed: value.confirmed,
    record: {
      ...identity,
      preparation: operation.ok,
      resource: value.record.resource,
      custody: value.record.custody,
    },
  }
}
function allocation(value: unknown): AllocationFact | null {
  if (!object(value)) return null
  if (value.kind === 'rejected' && typeof value.reason === 'string')
    return { kind: value.kind, reason: value.reason }
  if (
    value.kind === 'sent' ||
    value.kind === 'unknown' ||
    value.kind === 'allocated' ||
    value.kind === 'not-allocated' ||
    value.kind === 'settled'
  )
    return { kind: value.kind }
  return null
}

/** Every item of a stored list decoded, or null when the value is not a list or an item fails. */
async function decodeEach<T>(
  value: unknown,
  decode: (item: unknown) => Promise<T | null>,
): Promise<T[] | null> {
  if (!Array.isArray(value)) return null
  const decoded: T[] = []
  for (const item of value) {
    const one = await decode(item)
    if (!one) return null
    decoded.push(one)
  }
  return decoded
}

async function decodeReservation(item: unknown): Promise<StoredReservation | null> {
  if (!object(item) || !isStoredStop(item.stop)) return null
  const resource = await decodeResource(item.resource)
  return resource ? { resource, stop: item.stop } : null
}

function decodeSeal(
  value: Record<string, unknown>,
): Pick<StoredEnvironmentState, 'digest' | 'closed' | 'evidence'> | null {
  return typeof value.digest === 'string' &&
    typeof value.closed === 'boolean' &&
    evidence(value.evidence)
    ? { digest: value.digest, closed: value.closed, evidence: value.evidence }
    : null
}

async function decodeState(value: unknown): Promise<StoredEnvironmentState | null> {
  if (!object(value)) return null
  const prepared = preparation(value.preparation)
  const acquired = await decodeOriginal(value.original)
  const released = release(value.release)
  const allocated = allocation(value.allocation)
  const sealed = decodeSeal(value)
  const resources = await decodeEach(value.resources, item =>
    decodeResourceFact(item, isStoredStop),
  )
  const reservations = await decodeEach(value.reservations, decodeReservation)
  if (
    !prepared ||
    !acquired ||
    released === undefined ||
    !allocated ||
    !sealed ||
    !resources ||
    !reservations
  )
    return null
  return {
    preparation: prepared,
    original: acquired,
    ...sealed,
    allocation: allocated,
    release: released,
    resources,
    reservations,
  }
}

const storedStops: readonly unknown[] = [
  'active',
  'unconfirmed',
  'confirmed',
] satisfies readonly StoredResourceStop[]
const isStoredStop = (value: unknown): value is StoredResourceStop => storedStops.includes(value)
const retainedStops: readonly unknown[] = [
  'active',
  'unconfirmed',
] satisfies readonly RetainedStop[]
const isRetainedStop = (value: unknown): value is RetainedStop => retainedStops.includes(value)

async function decodeResource(value: unknown): Promise<ManagedResource | null> {
  const resource = await managedResourceSchema['~standard'].validate(value)
  return resource.issues ? null : resource.value
}

async function decodeResourceFact<S extends string>(
  item: unknown,
  isStop: (value: unknown) => value is S,
): Promise<Readonly<{
  resource: ManagedResource
  permitted: boolean
  adopted: boolean
  stop: S
}> | null> {
  if (
    !object(item) ||
    typeof item.permitted !== 'boolean' ||
    typeof item.adopted !== 'boolean' ||
    !isStop(item.stop)
  )
    return null
  const resource = await decodeResource(item.resource)
  return resource
    ? { resource, permitted: item.permitted, adopted: item.adopted, stop: item.stop }
    : null
}

async function decodeOriginal(value: unknown): Promise<EnvironmentOriginal | null> {
  if (!object(value)) return null
  const { retentionScope, ...ordinary } = value
  const original = await originalAcquisitionSchema['~standard'].validate(ordinary)
  if (original.issues) return null
  if (retentionScope === undefined) return original.value
  const scope = decodeScopeRef(retentionScope)
  return 'failure' in scope ? null : { ...original.value, retentionScope: scope.ok }
}

function encode(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) => {
      if (
        object(item) &&
        item.name === 'TenantId' &&
        object(item.organization) &&
        object(item.account)
      ) {
        const tenant = tenantCodec.parse(
          JSON.stringify({ organization: item.organization.text, account: item.account.text }),
        )
        if (!tenant.ok) throw new TypeError('invalid stored tenant')
        const encoded = tenantCodec.encode(tenant.value)
        if (!encoded.ok) throw new TypeError('invalid stored tenant')
        return encoded.value
      }
      return item
    }),
  )
}

function encodeState(state: StoredEnvironmentState): unknown {
  const tenant = tenantCodec.encode(state.preparation.tenant)
  if (!tenant.ok) throw new TypeError('invalid preparation tenant')
  return {
    ...state,
    preparation: { ...state.preparation, tenant: tenant.value },
    original: encode(state.original),
    release: state.release
      ? { ...state.release, record: { ...state.release.record, tenant: tenant.value } }
      : null,
  }
}

/** The closure listener key of a retention scope; the tenant is added by `identity`. */
const retentionKey = (scope: ScopeRef): string => `retention:${canonicalDigest(scope)}`

function decodeCreator(value: unknown): RetainedCreator | null {
  if (!object(value) || typeof value.original !== 'string') return null
  const call = decodeToolCallId(value.call)
  const operation = decodeToolOperationId(value.operation)
  if ('failure' in call || 'failure' in operation) return null
  return { call: call.ok, operation: operation.ok, original: value.original }
}

async function decodeRetainedFact(entry: unknown): Promise<RetainedResourceFact | null> {
  if (
    !object(entry) ||
    (entry.taken !== 'permitted' && entry.taken !== 'adopted') ||
    !isRetainedStop(entry.stop)
  )
    return null
  const creator = decodeCreator(entry.creator)
  const resource = await decodeResource(entry.resource)
  return creator && resource ? { resource, taken: entry.taken, stop: entry.stop, creator } : null
}

async function decodeRetention(value: unknown): Promise<RetentionState | null> {
  if (!object(value) || (value.phase !== 'open' && value.phase !== 'closed')) return null
  const scope = decodeScopeRef(value.scope)
  const resources = await decodeEach(value.resources, decodeRetainedFact)
  return 'failure' in scope || !resources
    ? null
    : { phase: value.phase, scope: scope.ok, resources }
}

/** Whether a decoded acquisition is the one of `address`, under the digest of its preparation. */
function storedAt(stored: StoredEnvironmentState, address: EnvironmentAddress): boolean {
  return (
    preparationKey(stored.preparation) === preparationKey(address) &&
    tenantEquals(stored.preparation.tenant, address.tenant) &&
    tenantEquals(stored.original.tenant, address.tenant) &&
    canonicalDigest(stored.preparation) === stored.digest
  )
}

export function createEnvironmentStateStore(options: EnvironmentStorageOptions) {
  if (options.store.durability !== 'durable' && options.mode !== 'test')
    throw new TypeError('execution environments require a durable store')
  const attempts = options.commitAttempts ?? 8
  if (!Number.isSafeInteger(attempts) || attempts < 1)
    throw new TypeError('commitAttempts must be positive')
  let closures = localClosures.get(options.store)
  if (!closures) {
    closures = new Map()
    localClosures.set(options.store, closures)
  }
  const listeners = closures
  const identity = (address: EnvironmentAddress, key = preparationKey(address)) =>
    JSON.stringify([address.tenant.organization.text, address.tenant.account.text, key])
  function observe(
    address: EnvironmentAddress,
    state: Readonly<{ closed: boolean }>,
    hostKey = preparationKey(address),
  ) {
    if (!state.closed) return
    const key = identity(address, hostKey)
    const pending = listeners.get(key)
    listeners.delete(key)
    for (const close of pending ?? []) close()
  }
  function onClosed(address: EnvironmentAddress, close: () => void, scope?: ScopeRef) {
    const key = identity(address, scope ? retentionKey(scope) : preparationKey(address))
    let pending = listeners.get(key)
    if (!pending) {
      pending = new Set()
      listeners.set(key, pending)
    }
    pending.add(close)
    return () => {
      pending.delete(close)
      if (pending.size === 0) listeners.delete(key)
    }
  }

  /** The envelope of one host record: its mutation marker and the encoded state. */
  async function envelope(
    domain: LedgerDomain,
    key: string,
    diagnostic: string,
  ): Promise<
    Outcome<{ revision: ToolRevision; mutation: string | null; state: unknown }, ToolFailure>
  > {
    const read = await options.store.readRecord(domain, hostKey(key))
    if (read.kind !== 'complete') return environmentFailure(`${diagnostic} read unavailable`)
    const found = read.record
    if (!found) return succeed({ revision: read.revision, mutation: null, state: null })
    if (
      found.kind !== 'host' ||
      !object(found.host.value) ||
      typeof found.host.value.mutation !== 'string'
    )
      return environmentFailure(`invalid ${diagnostic} envelope`)
    return succeed({
      revision: read.revision,
      mutation: found.host.value.mutation,
      state: found.host.value.state,
    })
  }

  async function retentionSnapshot(
    tenant: TenantId,
    scope: ScopeRef,
  ): Promise<Outcome<RetentionSnapshot, ToolFailure>> {
    const read = await envelope(
      retentionDomain(tenant, scope),
      RETENTION_RECORD_KEY,
      'retention ledger',
    )
    if ('failure' in read) return read
    if (read.ok.mutation === null)
      return succeed({ revision: read.ok.revision, state: null, mutation: null })
    const state = await decodeRetention(read.ok.state)
    if (!state || canonicalDigest(state.scope) !== canonicalDigest(scope))
      return environmentFailure('invalid retention state')
    return succeed({ revision: read.ok.revision, state, mutation: read.ok.mutation })
  }

  /**
   * The acquisition record with the handovers of its retention scope applied: a key the scope
   * took over from this acquisition is `handedOver` here. The scope owns the handover fact; the
   * acquisition domain never stores it (one decision, one owner). The scope's record is returned
   * so a write of the acquisition decides on it and asserts its revision, which keeps the write
   * serialized with take-overs.
   */
  async function snapshot(
    address: EnvironmentAddress,
  ): Promise<Outcome<AcquisitionSnapshot, ToolFailure>> {
    const read = await envelope(
      acquisitionDomain(address),
      preparationKey(address),
      'environment ledger',
    )
    if ('failure' in read) return read
    if (read.ok.mutation === null)
      return succeed({
        revision: read.ok.revision,
        stored: null,
        state: null,
        mutation: null,
        retention: null,
      })
    const stored = await decodeState(read.ok.state)
    if (!stored || !storedAt(stored, address))
      return environmentFailure('invalid environment ledger state')
    const scoped = await withRetention(address.tenant, stored)
    if ('failure' in scoped) return scoped
    observe(address, scoped.ok.state)
    return succeed({
      revision: read.ok.revision,
      stored,
      mutation: read.ok.mutation,
      ...scoped.ok,
    })
  }

  /** The acquisition with the handovers of its retention scope, and the scope's snapshot. */
  async function withRetention(
    tenant: TenantId,
    stored: StoredEnvironmentState,
  ): Promise<
    Outcome<Readonly<{ state: EnvironmentState; retention: RetentionSnapshot | null }>, ToolFailure>
  > {
    const scope = stored.original.retentionScope
    if (scope === undefined) return succeed({ state: stored, retention: null })
    const retention = await retentionSnapshot(tenant, scope)
    if ('failure' in retention) return retention
    return succeed({ state: withHandovers(stored, retention.ok.state), retention: retention.ok })
  }

  async function read(
    address: EnvironmentAddress,
  ): Promise<Outcome<EnvironmentState | null, ToolFailure>> {
    const result = await snapshot(address)
    return 'failure' in result ? result : succeed(result.ok.state)
  }

  /** The revision of the original call while it is live and bound to `expected`. */
  async function callRevision(
    address: EnvironmentAddress,
    expected: PreparationRecord,
  ): Promise<Outcome<ToolRevision, ToolFailure>> {
    const read = await options.store.readRecord(callDomain(address), CALL_RECORD_KEY)
    if (read.kind !== 'complete') return environmentFailure('original call read unavailable')
    const record = read.record
    if (!record || record.kind !== 'call') return environmentFailure('original call is missing')
    const call = record.call
    const tenant = tenantCodec.parse(
      JSON.stringify({
        organization: call.tenant.organization.text,
        account: call.tenant.account.text,
      }),
    )
    if (
      !tenant.ok ||
      !tenantEquals(tenant.value, address.tenant) ||
      call.call !== address.call ||
      canonicalDigest(call.request) !== canonicalDigest(expected.request) ||
      !call.preparations.some(item => canonicalDigest(item) === canonicalDigest(expected))
    )
      return environmentFailure('original call preparation binding mismatch')
    if (call.state.phase === 'settled') return fail({ kind: 'not-settled' })
    return succeed(read.revision)
  }

  /**
   * The assertion that the original call is still the live call the snapshot was taken for, and
   * the current resource authorization, when a change needs them.
   */
  async function callAssertion(
    address: EnvironmentAddress,
    preparation: PreparationRecord,
    authorize: CurrentResourceAuthorization | undefined,
    diagnostic: string,
  ): Promise<Outcome<readonly LedgerAssertion[], ToolFailure>> {
    if (!authorize) return succeed([])
    const current = await callRevision(address, preparation)
    if ('failure' in current) return current
    if ((await authorize()) !== 'authorized') return environmentFailure(diagnostic)
    return succeed([{ domain: callDomain(address), revision: current.ok }])
  }

  async function commitResult<T>(
    address: EnvironmentAddress,
    result: LedgerCommit,
    next: T,
    closed: boolean,
    mutation: string,
    reread: () => Promise<MutationRead<T>>,
    diagnostic: string,
    key?: string,
  ): Promise<Outcome<T, ToolFailure> | null> {
    if (result.kind === 'committed') {
      observe(address, { closed }, key)
      return succeed(next)
    }
    if (result.kind === 'conflict') return null
    if (result.kind === 'unavailable') return environmentFailure(diagnostic)
    if (result.kind === 'rejected')
      return fail({ kind: 'invalid', field: 'storage', reason: result.reason })
    const recognized = await reread()
    if ('ok' in recognized && recognized.ok.mutation === mutation && recognized.ok.state)
      return succeed(recognized.ok.state)
    return fail({ kind: 'commit-unknown', operation: address.operation })
  }

  const put = (key: string, mutation: string, state: unknown): LedgerWrite => ({
    kind: 'put',
    record: { kind: 'host', host: { key, value: { mutation, state } } },
  })

  async function update(
    address: EnvironmentAddress,
    change: StateChange,
    authorize?: CurrentResourceAuthorization,
  ): Promise<Outcome<EnvironmentState, ToolFailure>> {
    const mutation = randomUUID()
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const before = await snapshot(address)
      if ('failure' in before) return before
      const revision = decodeToolRevision((BigInt(before.ok.revision) + 1n).toString())
      if ('failure' in revision) return environmentFailure('invalid next revision')
      const next = change(
        before.ok.state,
        value => ({
          owner: '@omne-harness/tool-host-local',
          record: `execution-environment:${JSON.stringify([address.tenant.organization.text, address.tenant.account.text, preparationKey(address)])}`,
          revision: revision.ok,
          digest: canonicalDigest(value),
        }),
        before.ok.retention?.state ?? null,
      )
      if ('failure' in next) return next
      const stored = withoutHandovers(next.ok, before.ok.stored)
      const call = await callAssertion(
        address,
        stored.preparation,
        authorize,
        'current resource authorization unavailable',
      )
      if ('failure' in call) return call
      // The retention scope may take a key over between this snapshot and the write; the
      // assertion makes such a take-over a conflict, and the retry decides on the current scope.
      const scope = stored.original.retentionScope
      const retention: readonly LedgerAssertion[] =
        before.ok.retention === null || scope === undefined
          ? []
          : [
              {
                domain: retentionDomain(address.tenant, scope),
                revision: before.ok.retention.revision,
              },
            ]
      const committed = await options.store.commit({
        domain: acquisitionDomain(address),
        expected: before.ok.revision,
        revision: revision.ok,
        writes: [put(preparationKey(address), mutation, encodeState(stored))],
        asserts: [...call.ok, ...retention],
      })
      const result = await commitResult(
        address,
        committed,
        next.ok,
        next.ok.closed,
        mutation,
        () => snapshot(address),
        'environment ledger commit unavailable',
      )
      if (result === null) continue
      return result
    }
    return environmentFailure('environment ledger revision contention')
  }

  async function readRetention(
    address: EnvironmentAddress,
    scope: ScopeRef,
  ): Promise<Outcome<RetentionState | null, ToolFailure>> {
    const result = await retentionSnapshot(address.tenant, scope)
    return 'failure' in result ? result : succeed(result.ok.state)
  }

  /**
   * Whether the scope holds the end fact of the retained process `key`: one keyed read of
   * `ended/<key>` in the scope's domain, never a read of the whole domain.
   */
  async function readEnded(
    address: EnvironmentAddress,
    scope: ScopeRef,
    key: string,
  ): Promise<'confirmed' | 'none' | 'unavailable'> {
    const read = await envelope(
      retentionDomain(address.tenant, scope),
      endedRecordKey(key),
      'end fact',
    )
    if ('failure' in read) return 'unavailable'
    if (read.ok.mutation === null) return 'none'
    const state = read.ok.state
    return object(state) && object(state.resource) && state.resource.key === key
      ? 'confirmed'
      : 'unavailable'
  }

  /**
   * One commit of a scope's record: `next` at the revision of `before`, with `writes` next to it,
   * asserting `asserts`. A lost answer is recognized by the mutation of the record.
   */
  async function commitScope(
    address: EnvironmentAddress,
    scope: ScopeRef,
    before: RetentionSnapshot,
    next: RetentionState,
    writes: readonly LedgerWrite[] = [],
    asserts: readonly LedgerAssertion[] = [],
  ): Promise<Outcome<RetentionState, ToolFailure> | null> {
    const mutation = randomUUID()
    const revision = decodeToolRevision((BigInt(before.revision) + 1n).toString())
    if ('failure' in revision) return environmentFailure('invalid retention revision')
    const committed = await options.store.commit({
      domain: retentionDomain(address.tenant, scope),
      expected: before.revision,
      revision: revision.ok,
      writes: [put(RETENTION_RECORD_KEY, mutation, next), ...writes],
      asserts,
    })
    return commitResult(
      address,
      committed,
      next,
      next.phase === 'closed',
      mutation,
      () => retentionSnapshot(address.tenant, scope),
      'retention ledger commit unavailable',
      retentionKey(scope),
    )
  }

  /**
   * The take-over (`permit`, `adopt`): the one commit across domains. It adds the entry `decide`
   * gives for a reservation of the creating acquisition at `address` to the scope's record, and
   * asserts the creator acquisition domain and the original call. An acquisition that changed or
   * a call that settled since the snapshot is a conflict; the retry decides again.
   */
  async function takeOver(
    address: EnvironmentAddress,
    scope: ScopeRef,
    decide: TakeOverDecision,
    authorize: CurrentResourceAuthorization,
  ): Promise<Outcome<'taken' | 'held', ToolFailure>> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const before = await retentionSnapshot(address.tenant, scope)
      if ('failure' in before) return before
      const creator = await snapshot(address)
      if ('failure' in creator) return creator
      if (!creator.ok.state) return environmentFailure('retained creator acquisition missing')
      const entry = decide(creator.ok.state, before.ok.state)
      if ('failure' in entry) return entry
      if (entry.ok === 'held') return succeed('held')
      const call = await callAssertion(
        address,
        creator.ok.state.preparation,
        authorize,
        'current take-over authorization unavailable',
      )
      if ('failure' in call) return call
      const result = await commitScope(
        address,
        scope,
        before.ok,
        {
          phase: 'open',
          scope,
          resources: [...(before.ok.state?.resources ?? []), entry.ok],
        },
        [],
        [...call.ok, { domain: acquisitionDomain(address), revision: creator.ok.revision }],
      )
      if (result !== null) return 'ok' in result ? succeed('taken') : result
    }
    return environmentFailure('retention ledger revision contention')
  }

  /**
   * The stop of an entry the scope holds, by any view of the scope. An unconfirmed stop changes
   * the entry's stop fact. A confirmed stop removes the entry and, for an adopted process, writes
   * its end fact `ended/<key>` in the same commit.
   */
  async function stopRetained(
    address: EnvironmentAddress,
    scope: ScopeRef,
    key: string,
    status: 'confirmed' | 'unconfirmed',
  ): Promise<Outcome<RetentionState, ToolFailure>> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const before = await retentionSnapshot(address.tenant, scope)
      if ('failure' in before) return before
      const state = before.ok.state
      const entry = state?.resources.find(item => item.resource.key === key)
      if (!state || !entry) return environmentFailure('retained resource is not held')
      const result =
        status === 'confirmed'
          ? await commitScope(
              address,
              scope,
              before.ok,
              { ...state, resources: state.resources.filter(item => item !== entry) },
              entry.taken === 'adopted'
                ? [put(endedRecordKey(key), randomUUID(), { resource: entry.resource })]
                : [],
            )
          : await commitScope(address, scope, before.ok, {
              ...state,
              resources: state.resources.map(item =>
                item === entry ? { ...item, stop: status } : item,
              ),
            })
      if (result !== null) return result
    }
    return environmentFailure('retention ledger revision contention')
  }

  /**
   * Marks the scope closed, creating the record when there is none. A closed record is the
   * durable closed signal; it keeps its entries.
   */
  async function closeRetention(
    address: EnvironmentAddress,
    scope: ScopeRef,
  ): Promise<Outcome<RetentionState, ToolFailure>> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const before = await retentionSnapshot(address.tenant, scope)
      if ('failure' in before) return before
      const state = before.ok.state
      if (state?.phase === 'closed') return succeed(state)
      const result = await commitScope(address, scope, before.ok, {
        phase: 'closed',
        scope,
        resources: state?.resources ?? [],
      })
      if (result !== null) return result
    }
    return environmentFailure('retention ledger revision contention')
  }

  return Object.freeze({
    read,
    update,
    onClosed,
    permit: (
      address: EnvironmentAddress,
      change: StateChange,
      authorize: CurrentResourceAuthorization,
    ) => update(address, change, authorize),
    readRetention,
    readEnded,
    takeOver,
    stopRetained,
    closeRetention,
  })
}
export type EnvironmentStateStore = ReturnType<typeof createEnvironmentStateStore>
