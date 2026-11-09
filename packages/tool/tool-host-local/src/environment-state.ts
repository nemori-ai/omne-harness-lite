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
import {
  callHostDomain,
  ENVIRONMENT_RETENTION_DOMAIN_KEY,
  tenantHostDomain,
} from './host-domains.ts'

/**
 * `handedOver`: the retention scope of this acquisition adopted the resource, so this acquisition
 * no longer owns it. The scope's record owns that fact; a read of the acquisition applies it. No
 * later stop fact replaces it.
 */
export type ResourceStop = 'active' | 'unconfirmed' | 'confirmed' | 'handedOver'
export type ResourceFact = Readonly<{
  resource: ManagedResource
  permitted: boolean
  adopted: boolean
  stop: ResourceStop
}>
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
export type RetainedResourceFact = ResourceFact &
  Readonly<{ creator: PreparationRecord; original: EnvironmentOriginal }>
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
/** The tenant-level host domain of the retention scopes: state that spans calls. */
export const retentionDomain = (tenant: TenantId) =>
  tenantHostDomain(tenant, ENVIRONMENT_RETENTION_DOMAIN_KEY)
const callDomain = (address: Pick<EnvironmentAddress, 'tenant' | 'call'>): LedgerDomain => ({
  kind: 'call',
  tenant: address.tenant,
  call: address.call,
})

/** The acquisition with every resource its retention scope adopted from it marked `handedOver`. */
function withHandovers(
  state: EnvironmentState,
  address: EnvironmentAddress,
  retention: RetentionState | null,
): EnvironmentState {
  if (retention === null) return state
  const adopted = new Set(
    retention.resources
      .filter(
        item =>
          item.adopted &&
          item.creator.call === address.call &&
          item.creator.operation === address.operation,
      )
      .map(item => item.resource.key),
  )
  if (adopted.size === 0) return state
  return {
    ...state,
    resources: state.resources.map(item =>
      adopted.has(item.resource.key) ? { ...item, stop: 'handedOver' } : item,
    ),
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

async function decodeState(value: unknown): Promise<EnvironmentState | null> {
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
  const resources: ResourceFact[] = []
  for (const item of value.resources) {
    const resource = await decodeResourceFact(item)
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

const resourceStops: readonly unknown[] = [
  'active',
  'unconfirmed',
  'confirmed',
  'handedOver',
] satisfies readonly ResourceStop[]
const isResourceStop = (value: unknown): value is ResourceStop => resourceStops.includes(value)

async function decodeResourceFact(item: unknown): Promise<ResourceFact | null> {
  if (
    !object(item) ||
    typeof item.permitted !== 'boolean' ||
    typeof item.adopted !== 'boolean' ||
    !isResourceStop(item.stop)
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

function encodeState(state: EnvironmentState): unknown {
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

const retentionKey = (scope: ScopeRef): string => `retention:${canonicalDigest(scope)}`

async function decodeRetention(value: unknown): Promise<RetentionState | null> {
  if (!object(value) || typeof value.closed !== 'boolean' || !Array.isArray(value.resources))
    return null
  const scope = decodeScopeRef(value.scope)
  if ('failure' in scope) return null
  const resources: RetainedResourceFact[] = []
  for (const entry of value.resources) {
    if (!object(entry)) return null
    const creator = preparation(entry.creator)
    const original = await decodeOriginal(entry.original)
    const resource = await decodeResourceFact(entry)
    if (!creator || !original || !resource) return null
    resources.push({ creator, original, ...resource })
  }
  return { scope: scope.ok, closed: value.closed, resources }
}

function encodeRetention(state: RetentionState): unknown {
  return {
    ...state,
    resources: state.resources.map(item => {
      const tenant = tenantCodec.encode(item.creator.tenant)
      if (!tenant.ok) throw new TypeError('invalid retained creator tenant')
      return {
        ...item,
        creator: { ...item.creator, tenant: tenant.value },
        original: encode(item.original),
      }
    }),
  }
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
    const read = await envelope(retentionDomain(tenant), retentionKey(scope), 'retention ledger')
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
      return succeed({ revision: read.ok.revision, state: null, mutation: null, retention: null })
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
    const state = retention === null ? stored : withHandovers(stored, address, retention.ok.state)
    observe(address, state)
    return succeed({
      revision: read.ok.revision,
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
      const call = await callAssertion(
        address,
        next.ok.preparation,
        authorize,
        'current resource authorization unavailable',
      )
      if ('failure' in call) return call
      // The retention scope may hand a resource over between this snapshot and the write; the
      // assertion makes such a handover a conflict, and the retry sees it.
      const retention: readonly LedgerAssertion[] =
        before.ok.retention === null
          ? []
          : [{ domain: retentionDomain(address.tenant), revision: before.ok.retention.revision }]
      const committed = await options.store.commit({
        domain: acquisitionDomain(address),
        expected: before.ok.revision,
        revision: revision.ok,
        writes: [put(preparationKey(address), mutation, encodeState(next.ok))],
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
   * One commit of the retention record, decided on the scope's record and the creating
   * acquisition. It asserts the acquisition domain, so a change of the acquisition between the
   * snapshot and the write is a conflict and the retry decides on the current acquisition.
   */
  async function commitRetention(
    address: EnvironmentAddress,
    scope: ScopeRef,
    authorize: CurrentResourceAuthorization | undefined,
    decide: (
      acquisition: EnvironmentState,
      retention: RetentionState | null,
      receipt: (value: unknown) => DurableEvidence,
    ) => Outcome<RetentionState, ToolFailure>,
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
      const committed = await options.store.commit({
        domain: retentionDomain(address.tenant),
        expected: before.ok.revision,
        revision: revision.ok,
        writes: [put(retentionKey(scope), mutation, encodeRetention(next.ok))],
        asserts: [
          ...call.ok,
          { domain: acquisitionDomain(address), revision: original.ok.revision },
        ],
      })
      const result = await commitResult(
        address,
        committed,
        next.ok,
        mutation,
        () => retentionSnapshot(address.tenant, scope),
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
    updateRetention,
    handOver,
  })
}
export type EnvironmentStateStore = ReturnType<typeof createEnvironmentStateStore>
