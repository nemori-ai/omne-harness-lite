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
}>
/** The acquisition as stored: its own stop facts, never a handover. */
type StoredEnvironmentState = Omit<EnvironmentState, 'resources'> &
  Readonly<{ resources: readonly StoredResourceFact[] }>
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
export type RetainedResourceFact = Readonly<{
  resource: ManagedResource
  permitted: boolean
  adopted: boolean
  stop: RetainedStop
  creator: RetainedCreator
}>
/**
 * The record of one retention scope: the resources the scope still holds. An entry the scope
 * took over (`permitted` for a terminal, `adopted` for a process) lives until its stop is
 * confirmed; a reservation nobody took over lives until its creator closes. A closed scope with no
 * entry left has no record. The end fact of an adopted process is not an entry: it is a record of
 * its own in the scope's domain (`ended/<key>`), so this record holds live entries only.
 */
export type RetentionState = Readonly<{
  scope: ScopeRef
  closed: boolean
  resources: readonly RetainedResourceFact[]
}>
type StateChange<T> = (
  state: T | null,
  receipt: (value: unknown) => DurableEvidence,
) => Outcome<T, ToolFailure>
/**
 * The decision of one handover: the retention scope after it adopted a resource of the
 * acquisition. The acquisition is read, never written: its `handedOver` facts are the adoptions
 * of its scope.
 */
type HandOverChange = (
  acquisition: EnvironmentState,
  retention: RetentionState | null,
  receipt: (value: unknown) => DurableEvidence,
) => Outcome<RetentionState, ToolFailure>
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
  /** The retention scope's revision when the acquisition names one, for the write's assertion. */
  retention: Readonly<{ revision: ToolRevision }> | null
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
/** The prefix of the end fact records of a retention scope's domain. */
const ENDED_RECORD_PREFIX = 'ended/'
/** The key of the end fact of the retained process `key` in its scope's domain. */
export const endedRecordKey = (key: string): string => `${ENDED_RECORD_PREFIX}${key}`
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

/** The acquisition with every resource its retention scope adopted from it marked `handedOver`. */
function withHandovers(
  stored: StoredEnvironmentState,
  retention: RetentionState | null,
): EnvironmentState {
  if (retention === null) return stored
  const adopted = new Set(
    retention.resources
      .filter(item => item.adopted && createdBy(item.creator, stored))
      .map(item => item.resource.key),
  )
  if (adopted.size === 0) return stored
  return {
    ...stored,
    resources: stored.resources.map(item =>
      adopted.has(item.resource.key) ? { ...item, stop: 'handedOver' } : item,
    ),
  }
}

/**
 * The decided state as the acquisition stores it: a resource the decision left `handedOver`
 * keeps the acquisition's own stored stop fact, because the handover is the scope's fact.
 */
function withoutHandovers(
  next: EnvironmentState,
  stored: StoredEnvironmentState | null,
): StoredEnvironmentState {
  const own = new Map(stored?.resources.map(item => [item.resource.key, item.stop]) ?? [])
  function ownStop(key: string, stop: ResourceStop): StoredResourceStop {
    if (stop === 'handedOver') return own.get(key) ?? 'active'
    return stop
  }
  const resources: StoredResourceFact[] = next.resources.map(item => ({
    ...item,
    stop: ownStop(item.resource.key, item.stop),
  }))
  return { ...next, resources }
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

async function decodeState(value: unknown): Promise<StoredEnvironmentState | null> {
  if (!object(value)) return null
  const prepared = preparation(value.preparation)
  const acquired = await decodeOriginal(value.original)
  const released = release(value.release)
  const allocated = allocation(value.allocation)
  if (
    !prepared ||
    !acquired ||
    released === undefined ||
    !allocated ||
    typeof value.digest !== 'string' ||
    typeof value.closed !== 'boolean' ||
    !evidence(value.evidence) ||
    !Array.isArray(value.resources)
  )
    return null
  const resources: StoredResourceFact[] = []
  for (const item of value.resources) {
    const resource = await decodeResourceFact(item, isStoredStop)
    if (!resource) return null
    resources.push(resource)
  }
  return {
    preparation: prepared,
    original: acquired,
    digest: value.digest,
    allocation: allocated,
    closed: value.closed,
    evidence: value.evidence,
    release: released,
    resources,
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
  const resource = await managedResourceSchema['~standard'].validate(item.resource)
  return resource.issues
    ? null
    : {
        resource: resource.value,
        permitted: item.permitted,
        adopted: item.adopted,
        stop: item.stop,
      }
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

async function decodeRetention(value: unknown): Promise<RetentionState | null> {
  if (!object(value) || typeof value.closed !== 'boolean' || !Array.isArray(value.resources))
    return null
  const scope = decodeScopeRef(value.scope)
  if ('failure' in scope) return null
  const resources: RetainedResourceFact[] = []
  for (const entry of value.resources) {
    if (!object(entry)) return null
    const creator = decodeCreator(entry.creator)
    const resource = await decodeResourceFact(entry, isRetainedStop)
    if (!creator || !resource) return null
    resources.push({ ...resource, creator })
  }
  return { scope: scope.ok, closed: value.closed, resources }
}

/** A closed scope that holds nothing has no record. */
const emptied = (state: RetentionState): boolean => state.closed && state.resources.length === 0

/**
 * The processes whose hold ends between `before` and `next`: adopted in `before`, no longer
 * adopted under their key in `next`. An adopted entry leaves its scope only by its confirmed stop,
 * so each of them has ended, and its end fact is written in the commit that removes it.
 */
function endedBetween(
  before: RetentionState | null,
  next: RetentionState,
): readonly ManagedResource[] {
  const held = new Set(next.resources.filter(item => item.adopted).map(item => item.resource.key))
  const ended = new Map<string, ManagedResource>()
  for (const item of before?.resources ?? [])
    if (item.adopted && !held.has(item.resource.key)) ended.set(item.resource.key, item.resource)
  return [...ended.values()]
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
   * The acquisition record with the handovers of its retention scope applied: a resource the
   * scope adopted from this acquisition is `handedOver` here. The scope owns the handover fact;
   * the acquisition domain never stores it (one decision, one owner). The retention revision is
   * returned so a write of the acquisition can assert it and stay serialized with handovers.
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
    if (
      !stored ||
      preparationKey(stored.preparation) !== preparationKey(address) ||
      !tenantEquals(stored.preparation.tenant, address.tenant) ||
      !tenantEquals(stored.original.tenant, address.tenant) ||
      canonicalDigest(stored.preparation) !== stored.digest
    )
      return environmentFailure('invalid environment ledger state')
    const scope = stored.original.retentionScope
    const retention = scope === undefined ? null : await retentionSnapshot(address.tenant, scope)
    if (retention !== null && 'failure' in retention) return retention
    const state = retention === null ? stored : withHandovers(stored, retention.ok.state)
    observe(address, state)
    return succeed({
      revision: read.ok.revision,
      stored,
      state,
      mutation: read.ok.mutation,
      retention: retention === null ? null : { revision: retention.ok.revision },
    })
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

  async function commitResult<T extends Readonly<{ closed: boolean }>>(
    address: EnvironmentAddress,
    result: LedgerCommit,
    next: T,
    mutation: string,
    reread: () => Promise<MutationRead<T>>,
    diagnostic: string,
    key?: string,
  ): Promise<Outcome<T, ToolFailure> | null> {
    if (result.kind === 'committed') {
      observe(address, next, key)
      return succeed(next)
    }
    if (result.kind === 'conflict') return null
    if (result.kind === 'unavailable') return environmentFailure(diagnostic)
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
    change: StateChange<EnvironmentState>,
    authorize?: CurrentResourceAuthorization,
  ): Promise<Outcome<EnvironmentState, ToolFailure>> {
    const mutation = randomUUID()
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const before = await snapshot(address)
      if ('failure' in before) return before
      const revision = decodeToolRevision((BigInt(before.ok.revision) + 1n).toString())
      if ('failure' in revision) return environmentFailure('invalid next revision')
      const next = change(before.ok.state, value => ({
        owner: '@omne-harness/tool-host-local',
        record: `execution-environment:${JSON.stringify([address.tenant.organization.text, address.tenant.account.text, preparationKey(address)])}`,
        revision: revision.ok,
        digest: canonicalDigest(value),
      }))
      if ('failure' in next) return next
      const stored = withoutHandovers(next.ok, before.ok.stored)
      const call = await callAssertion(
        address,
        stored.preparation,
        authorize,
        'current resource authorization unavailable',
      )
      if ('failure' in call) return call
      // The retention scope may hand a resource over between this snapshot and the write; the
      // assertion makes such a handover a conflict, and the retry decides on the current scope.
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
        mutation,
        () => snapshot(address),
        'environment ledger commit unavailable',
      )
      if (result === null) continue
      // A closed acquisition can take nothing over any more: its reservations in the scope die.
      if ('ok' in result && stored.closed && before.ok.stored?.closed === false && scope)
        await dropReservations(address, scope, stored)
      return result
    }
    return environmentFailure('environment ledger revision contention')
  }

  /**
   * Removes the reservations of a closed acquisition from its scope: entries it created that the
   * scope never took over. This is the commit after the close; a scope write that does not land
   * leaves the entries until the scope closes, which drops every reservation.
   */
  async function dropReservations(
    address: EnvironmentAddress,
    scope: ScopeRef,
    creator: EnvironmentState,
  ): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const before = await retentionSnapshot(address.tenant, scope)
      if ('failure' in before || before.ok.state === null) return
      const kept = before.ok.state.resources.filter(
        item => item.permitted || item.adopted || !createdBy(item.creator, creator),
      )
      if (kept.length === before.ok.state.resources.length) return
      const committed = await commitScope(address, scope, before.ok, {
        ...before.ok.state,
        resources: kept,
      })
      if (committed.kind !== 'conflict') return
    }
  }

  /**
   * One commit of a scope's record at the revision of `before`. It writes the end fact of every
   * process whose hold it ends next to the record. An emptied closed scope instead deletes its
   * record and all its end facts: the release reads the scope's domain whole, once, to name them.
   * The commit is conditioned on the revision of `before`, so an end fact written after that
   * snapshot makes it a conflict, and the retry names it too.
   */
  async function commitScope(
    address: EnvironmentAddress,
    scope: ScopeRef,
    before: RetentionSnapshot,
    next: RetentionState,
    asserts: readonly LedgerAssertion[] = [],
    mutation = randomUUID(),
  ): Promise<LedgerCommit> {
    const expected = before.revision
    const revision = decodeToolRevision((BigInt(expected) + 1n).toString())
    if ('failure' in revision)
      return { kind: 'unavailable', diagnostic: 'invalid retention revision' }
    const domain = retentionDomain(address.tenant, scope)
    let writes: LedgerWrite[]
    if (emptied(next)) {
      const whole = await options.store.read(domain)
      if (whole.kind !== 'complete')
        return { kind: 'unavailable', diagnostic: 'retention release read unavailable' }
      writes = [
        { kind: 'delete', key: hostKey(RETENTION_RECORD_KEY) },
        ...whole.records.flatMap((record): LedgerWrite[] =>
          record.kind === 'host' && record.host.key.startsWith(ENDED_RECORD_PREFIX)
            ? [{ kind: 'delete', key: hostKey(record.host.key) }]
            : [],
        ),
      ]
    } else
      writes = [
        put(RETENTION_RECORD_KEY, mutation, next),
        ...endedBetween(before.state, next).map(resource =>
          put(endedRecordKey(resource.key), mutation, { resource }),
        ),
      ]
    return options.store.commit({ domain, expected, revision: revision.ok, writes, asserts })
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
   * One commit of the retention record, decided on the scope's record and the creating
   * acquisition. It asserts the acquisition domain, so a change of the acquisition between the
   * snapshot and the write is a conflict and the retry decides on the current acquisition.
   */
  async function commitRetention(
    address: EnvironmentAddress,
    scope: ScopeRef,
    authorize: CurrentResourceAuthorization | undefined,
    decide: HandOverChange,
    diagnostics: Readonly<{ missing: string; authorization: string; commit: string }>,
  ): Promise<Outcome<RetentionState, ToolFailure>> {
    const mutation = randomUUID()
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const before = await retentionSnapshot(address.tenant, scope)
      if ('failure' in before) return before
      const original = await snapshot(address)
      if ('failure' in original) return original
      if (!original.ok.state) return environmentFailure(diagnostics.missing)
      if (authorize && original.ok.state.closed) return fail({ kind: 'not-settled' })
      const revision = decodeToolRevision((BigInt(before.ok.revision) + 1n).toString())
      if ('failure' in revision) return environmentFailure('invalid retention revision')
      const next = decide(original.ok.state, before.ok.state, value => ({
        owner: '@omne-harness/tool-host-local',
        record: retentionKey(scope),
        revision: revision.ok,
        digest: canonicalDigest(value),
      }))
      if ('failure' in next) return next
      const call = await callAssertion(
        address,
        original.ok.state.preparation,
        authorize,
        diagnostics.authorization,
      )
      if ('failure' in call) return call
      const committed = await commitScope(
        address,
        scope,
        before.ok,
        next.ok,
        [...call.ok, { domain: acquisitionDomain(address), revision: original.ok.revision }],
        mutation,
      )
      const result = await commitResult(
        address,
        committed,
        next.ok,
        mutation,
        async () => {
          const reread = await retentionSnapshot(address.tenant, scope)
          // A deleted record is the committed outcome of an emptied closed scope.
          if ('ok' in reread && reread.ok.state === null && emptied(next.ok))
            return succeed({ state: next.ok, mutation })
          return reread
        },
        diagnostics.commit,
        retentionKey(scope),
      )
      if (result === null) continue
      return result
    }
    return environmentFailure('retention ledger revision contention')
  }

  function updateRetention(
    address: EnvironmentAddress,
    scope: ScopeRef,
    change: StateChange<RetentionState>,
    authorize?: CurrentResourceAuthorization,
  ): Promise<Outcome<RetentionState, ToolFailure>> {
    return commitRetention(
      address,
      scope,
      authorize,
      (_acquisition, retention, receipt) => change(retention, receipt),
      {
        missing: 'retained creator acquisition missing',
        authorization: 'current retained resource authorization unavailable',
        commit: 'retention ledger commit unavailable',
      },
    )
  }

  /**
   * The handover commit: the retention scope adopts a resource of the acquisition. The scope's
   * record is the one record written; the acquisition shows the resource as `handedOver` through
   * the handovers of its scope. The commit asserts the acquisition domain and the original call,
   * so an acquisition that closed or a call that settled since the snapshot is a conflict, and
   * the retry answers `not-settled`.
   */
  function handOver(
    address: EnvironmentAddress,
    scope: ScopeRef,
    change: HandOverChange,
    authorize: CurrentResourceAuthorization,
  ): Promise<Outcome<RetentionState, ToolFailure>> {
    return commitRetention(address, scope, authorize, change, {
      missing: 'handed-over acquisition missing',
      authorization: 'current handover authorization unavailable',
      commit: 'handover commit unavailable',
    })
  }

  return Object.freeze({
    read,
    update,
    onClosed,
    permit: (
      address: EnvironmentAddress,
      change: StateChange<EnvironmentState>,
      authorize: CurrentResourceAuthorization,
    ) => update(address, change, authorize),
    readRetention,
    readEnded,
    updateRetention,
    handOver,
  })
}
export type EnvironmentStateStore = ReturnType<typeof createEnvironmentStateStore>
