import { randomUUID } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
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
  canonicalDigest,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
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

/**
 * `handedOver`: a retention scope adopted the resource in the commit that wrote this value, so this
 * acquisition no longer owns it. No later stop fact replaces it.
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
  store: ToolLedgerStore<ContentBlock>
  guarded?: EnvironmentGuardedHostCommit
  mode?: 'production' | 'test'
  commitAttempts?: number
}>
export interface EnvironmentGuardedHostCommit {
  commit(
    input: Readonly<{
      call: Extract<LedgerDomain, { kind: 'call' }>
      callExpected: ToolRevision
      hostCommit: LedgerCommitInput<ContentBlock>
    }>,
  ): Promise<LedgerCommit | Readonly<{ kind: 'call-changed' }>>
}
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
/** The two records of one handover commit: the acquisition that hands over and the adopting scope. */
export type HandOverState = Readonly<{ acquisition: EnvironmentState; retention: RetentionState }>
type HandOverChange = (
  acquisition: EnvironmentState,
  retention: RetentionState | null,
) => Outcome<HandOverState, ToolFailure>
type CurrentResourceAuthorization = () => Promise<'authorized' | 'notAuthorized' | 'unavailable'>
type CommitResult = LedgerCommit | Readonly<{ kind: 'call-changed' }>
type MutationRead<T> = Outcome<{ state: T | null; mutation: string | null }, ToolFailure>
const localClosures = new WeakMap<ToolLedgerStore<ContentBlock>, Map<string, Set<() => void>>>()

export const environmentFailure = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'execution-environment-adapter', diagnostic })
export const preparationKey = (address: Pick<EnvironmentAddress, 'call' | 'operation'>): string =>
  JSON.stringify([address.call, address.operation])
export const environmentDomain = (tenant: TenantId) => ({
  kind: 'host' as const,
  tenant,
  key: 'execution-environment/v1',
})

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

  async function snapshot(
    address: EnvironmentAddress,
  ): Promise<
    Outcome<
      { revision: ToolRevision; state: EnvironmentState | null; mutation: string | null },
      ToolFailure
    >
  > {
    const read = await options.store.read(environmentDomain(address.tenant))
    if (read.kind !== 'complete') return environmentFailure('environment ledger read unavailable')
    const found = read.records.find(
      record => record.kind === 'host' && record.host.key === preparationKey(address),
    )
    if (!found) return succeed({ revision: read.revision, state: null, mutation: null })
    if (
      found.kind !== 'host' ||
      !object(found.host.value) ||
      typeof found.host.value.mutation !== 'string'
    )
      return environmentFailure('invalid environment ledger envelope')
    const state = await decodeState(found.host.value.state)
    if (
      !state ||
      preparationKey(state.preparation) !== preparationKey(address) ||
      !tenantEquals(state.preparation.tenant, address.tenant) ||
      !tenantEquals(state.original.tenant, address.tenant) ||
      canonicalDigest(state.preparation) !== state.digest
    )
      return environmentFailure('invalid environment ledger state')
    observe(address, state)
    return succeed({ revision: read.revision, state, mutation: found.host.value.mutation })
  }

  async function read(
    address: EnvironmentAddress,
  ): Promise<Outcome<EnvironmentState | null, ToolFailure>> {
    const result = await snapshot(address)
    return 'failure' in result ? result : succeed(result.ok.state)
  }

  async function callRevision(
    address: EnvironmentAddress,
    expected: PreparationRecord,
  ): Promise<Outcome<ToolRevision, ToolFailure>> {
    const read = await options.store.read({
      kind: 'call',
      tenant: address.tenant,
      call: address.call,
    })
    if (read.kind !== 'complete') return environmentFailure('original call read unavailable')
    const record = read.records.find(item => item.kind === 'call')
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

  async function commitHost(
    address: EnvironmentAddress,
    preparation: PreparationRecord,
    hostCommit: LedgerCommitInput<ContentBlock>,
    authorize: CurrentResourceAuthorization | undefined,
    diagnostic: string,
  ): Promise<Outcome<CommitResult, ToolFailure>> {
    if (!authorize) return succeed(await options.store.commit(hostCommit))
    if (!options.guarded) return environmentFailure('atomic call and host commit unavailable')
    const current = await callRevision(address, preparation)
    if ('failure' in current) return current
    if ((await authorize()) !== 'authorized') return environmentFailure(diagnostic)
    return succeed(
      await options.guarded.commit({
        call: { kind: 'call', tenant: address.tenant, call: address.call },
        callExpected: current.ok,
        hostCommit,
      }),
    )
  }

  async function commitResult<T extends Readonly<{ closed: boolean }>>(
    address: EnvironmentAddress,
    result: CommitResult,
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
    if (result.kind === 'conflict' || result.kind === 'call-changed') return null
    if (result.kind === 'unavailable') return environmentFailure(diagnostic)
    if (result.kind === 'rejected')
      return fail({ kind: 'invalid', field: 'storage', reason: result.reason })
    const recognized = await reread()
    if ('ok' in recognized && recognized.ok.mutation === mutation && recognized.ok.state)
      return succeed(recognized.ok.state)
    return fail({ kind: 'commit-unknown', operation: address.operation })
  }

  async function update(
    address: EnvironmentAddress,
    change: StateChange<EnvironmentState>,
    authorize?: CurrentResourceAuthorization,
  ): Promise<Outcome<EnvironmentState, ToolFailure>> {
    if (authorize && !options.guarded)
      return environmentFailure('atomic call and host commit unavailable')
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
      const hostCommit: LedgerCommitInput<ContentBlock> = {
        domain: environmentDomain(address.tenant),
        expected: before.ok.revision,
        revision: revision.ok,
        writes: [
          {
            kind: 'put',
            record: {
              kind: 'host',
              host: {
                key: preparationKey(address),
                value: { mutation, state: encodeState(next.ok) },
              },
            },
          },
        ],
      }
      const committed = await commitHost(
        address,
        next.ok.preparation,
        hostCommit,
        authorize,
        'current resource authorization unavailable',
      )
      if ('failure' in committed) return committed
      const result = await commitResult(
        address,
        committed.ok,
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

  async function retentionSnapshot(address: EnvironmentAddress, scope: ScopeRef) {
    const read = await options.store.read(environmentDomain(address.tenant))
    if (read.kind !== 'complete') return environmentFailure('retention ledger read unavailable')
    const key = retentionKey(scope)
    const found = read.records.find(item => item.kind === 'host' && item.host.key === key)
    if (!found) return succeed({ revision: read.revision, state: null, mutation: null })
    if (
      found.kind !== 'host' ||
      !object(found.host.value) ||
      typeof found.host.value.mutation !== 'string'
    )
      return environmentFailure('invalid retention envelope')
    const state = await decodeRetention(found.host.value.state)
    if (!state || canonicalDigest(state.scope) !== canonicalDigest(scope))
      return environmentFailure('invalid retention state')
    observe(address, state, key)
    return succeed({ revision: read.revision, state, mutation: found.host.value.mutation })
  }

  async function readRetention(
    address: EnvironmentAddress,
    scope: ScopeRef,
  ): Promise<Outcome<RetentionState | null, ToolFailure>> {
    const result = await retentionSnapshot(address, scope)
    return 'failure' in result ? result : succeed(result.ok.state)
  }

  async function updateRetention(
    address: EnvironmentAddress,
    scope: ScopeRef,
    change: StateChange<RetentionState>,
    authorize?: CurrentResourceAuthorization,
  ): Promise<Outcome<RetentionState, ToolFailure>> {
    if (authorize && !options.guarded)
      return environmentFailure('atomic call and host commit unavailable')
    const mutation = randomUUID()
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const before = await retentionSnapshot(address, scope)
      if ('failure' in before) return before
      const original = await snapshot(address)
      if ('failure' in original) return original
      if (original.ok.revision !== before.ok.revision) continue
      if (!original.ok.state) return environmentFailure('retained creator acquisition missing')
      if (authorize && original.ok.state.closed) return fail({ kind: 'not-settled' })
      const revision = decodeToolRevision((BigInt(before.ok.revision) + 1n).toString())
      if ('failure' in revision) return environmentFailure('invalid retention revision')
      const next = change(before.ok.state, value => ({
        owner: '@omne-harness/tool-host-local',
        record: retentionKey(scope),
        revision: revision.ok,
        digest: canonicalDigest(value),
      }))
      if ('failure' in next) return next
      const hostCommit: LedgerCommitInput<ContentBlock> = {
        domain: environmentDomain(address.tenant),
        expected: before.ok.revision,
        revision: revision.ok,
        writes: [
          {
            kind: 'put',
            record: {
              kind: 'host',
              host: {
                key: retentionKey(scope),
                value: { mutation, state: encodeRetention(next.ok) },
              },
            },
          },
        ],
      }
      const committed = await commitHost(
        address,
        original.ok.state.preparation,
        hostCommit,
        authorize,
        'current retained resource authorization unavailable',
      )
      if ('failure' in committed) return committed
      const result = await commitResult(
        address,
        committed.ok,
        next.ok,
        mutation,
        () => retentionSnapshot(address, scope),
        'retention ledger commit unavailable',
        retentionKey(scope),
      )
      if (result === null) continue
      return result
    }
    return environmentFailure('retention ledger revision contention')
  }

  /**
   * One guarded commit that writes the retention record and the acquisition record together. Both
   * live in the environment domain, so one revision condition covers both, and both envelopes carry
   * the same mutation: either both changes are durable or neither is. A closed acquisition answers
   * `not-settled`, as a guarded retention update does.
   */
  async function handOver(
    address: EnvironmentAddress,
    scope: ScopeRef,
    change: HandOverChange,
    authorize: CurrentResourceAuthorization,
  ): Promise<Outcome<HandOverState, ToolFailure>> {
    if (!options.guarded) return environmentFailure('atomic call and host commit unavailable')
    const mutation = randomUUID()
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const before = await retentionSnapshot(address, scope)
      if ('failure' in before) return before
      const original = await snapshot(address)
      if ('failure' in original) return original
      if (original.ok.revision !== before.ok.revision) continue
      if (!original.ok.state) return environmentFailure('handed-over acquisition missing')
      if (original.ok.state.closed) return fail({ kind: 'not-settled' })
      const revision = decodeToolRevision((BigInt(before.ok.revision) + 1n).toString())
      if ('failure' in revision) return environmentFailure('invalid handover revision')
      const next = change(original.ok.state, before.ok.state)
      if ('failure' in next) return next
      const put = (
        key: string,
        state: unknown,
      ): LedgerCommitInput<ContentBlock>['writes'][number] => ({
        kind: 'put',
        record: { kind: 'host', host: { key, value: { mutation, state } } },
      })
      const hostCommit: LedgerCommitInput<ContentBlock> = {
        domain: environmentDomain(address.tenant),
        expected: before.ok.revision,
        revision: revision.ok,
        writes: [
          put(retentionKey(scope), encodeRetention(next.ok.retention)),
          put(preparationKey(address), encodeState(next.ok.acquisition)),
        ],
      }
      const committed = await commitHost(
        address,
        original.ok.state.preparation,
        hostCommit,
        authorize,
        'current handover authorization unavailable',
      )
      if ('failure' in committed) return committed
      // The writes are atomic: the mutation on the retention envelope proves both landed.
      const result = await commitResult(
        address,
        committed.ok,
        next.ok.retention,
        mutation,
        () => retentionSnapshot(address, scope),
        'handover commit unavailable',
        retentionKey(scope),
      )
      if (result === null) continue
      return 'failure' in result ? result : succeed(next.ok)
    }
    return environmentFailure('handover revision contention')
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
