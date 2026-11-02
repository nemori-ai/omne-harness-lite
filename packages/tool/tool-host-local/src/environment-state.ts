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
import { canonicalDigest, type ToolLedgerStore } from '@omne-harness/tool'
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

export type ResourceFact = Readonly<{
  resource: ManagedResource
  permitted: boolean
  adopted: boolean
  stop: 'active' | 'unconfirmed' | 'confirmed'
}>
export type AllocationFact =
  | Readonly<{ kind: 'sent' | 'unknown' | 'allocated' | 'excluded' }>
  | Readonly<{ kind: 'rejected'; reason: string }>
export type EnvironmentState = Readonly<{
  preparation: PreparationRecord
  original: OriginalAcquisition
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
  mode?: 'production' | 'test'
  commitAttempts?: number
}>
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
    value.kind === 'excluded'
  )
    return { kind: value.kind }
  return null
}

async function decodeState(value: unknown): Promise<EnvironmentState | null> {
  if (!object(value)) return null
  const prepared = preparation(value.preparation)
  const acquired = await originalAcquisitionSchema['~standard'].validate(value.original)
  const released = release(value.release)
  const allocated = allocation(value.allocation)
  if (
    !prepared ||
    acquired.issues ||
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
    if (
      !object(item) ||
      typeof item.permitted !== 'boolean' ||
      typeof item.adopted !== 'boolean' ||
      (item.stop !== 'active' && item.stop !== 'unconfirmed' && item.stop !== 'confirmed')
    )
      return null
    const resource = await managedResourceSchema['~standard'].validate(item.resource)
    if (resource.issues) return null
    resources.push({
      resource: resource.value,
      permitted: item.permitted,
      adopted: item.adopted,
      stop: item.stop,
    })
  }
  return {
    preparation: prepared,
    original: acquired.value,
    digest: value.digest,
    allocation: allocated,
    closed: value.closed,
    evidence: value.evidence,
    release: released,
    resources,
  }
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
  const identity = (address: EnvironmentAddress) =>
    JSON.stringify([
      address.tenant.organization.text,
      address.tenant.account.text,
      preparationKey(address),
    ])
  function observe(address: EnvironmentAddress, state: EnvironmentState) {
    if (!state.closed) return
    const key = identity(address)
    const pending = listeners.get(key)
    listeners.delete(key)
    for (const close of pending ?? []) close()
  }
  function onClosed(address: EnvironmentAddress, close: () => void) {
    const key = identity(address)
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

  async function update(
    address: EnvironmentAddress,
    change: (
      state: EnvironmentState | null,
      receipt: (value: unknown) => DurableEvidence,
    ) => Outcome<EnvironmentState, ToolFailure>,
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
      const result = await options.store.commit({
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
      })
      if (result.kind === 'committed') {
        observe(address, next.ok)
        return next
      }
      if (result.kind === 'conflict') continue
      if (result.kind === 'unavailable')
        return environmentFailure('environment ledger commit unavailable')
      const recognized = await snapshot(address)
      if ('ok' in recognized && recognized.ok.mutation === mutation && recognized.ok.state)
        return succeed(recognized.ok.state)
      return fail({ kind: 'commit-unknown', operation: address.operation })
    }
    return environmentFailure('environment ledger revision contention')
  }
  return Object.freeze({ read, update, onClosed })
}
export type EnvironmentStateStore = ReturnType<typeof createEnvironmentStateStore>
