import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  bindingScope,
  matchProviders,
  type AcquireInput,
  type AcquisitionRef,
  type AcquisitionState,
  type Acquired,
  type EnvironmentAdoption,
  type EnvironmentBinding,
  type EnvironmentDescription,
  type EnvironmentLease,
  type EnvironmentProvider,
  type ExecutionEnvironment,
  type FacilityDescriptor,
  type FacilityKey,
  type LeaseInvalidation,
  type LeaseRelease,
  type ManagedResource,
  type OriginRef,
  type Pending,
  type Placement,
  type ProviderAcquisition,
  type ProviderCapabilities,
  type ProviderIdentity,
  type ProviderRegistrations,
  type RecoveryAccess,
  type RecoveryAuthority,
  type RejectReason,
  type Rejected,
  type Retirement,
} from '@omne-harness/execution-environment-contract'
import { sameBinding, sameScope, sameSet } from './compare.ts'
import { createLeaseView, type StoredDescriptor } from './lease-view.ts'
import { driveRecovery } from './recovery.ts'

export type RegistryDependencies = Readonly<{ recovery: RecoveryAuthority }>

/** The registry: the environment surface, the provider surface, and its own closing. */
export interface EnvironmentRegistry<P> extends ExecutionEnvironment<P>, ProviderRegistrations {
  /** Refuses new acquisitions, invalidates every live lease, then retires every provider. */
  close(): Promise<Retirement>
}

/**
 * A retirement left resources behind, or its outcome is unknown. It is not a completion: calling the
 * same removal again retries it.
 */
export class RetirementPending extends Error {
  readonly subject: string
  readonly resources: readonly ManagedResource[]
  constructor(subject: string, resources: readonly ManagedResource[]) {
    super(`${subject} retired with ${resources.length} known resource(s) still pending`)
    this.name = 'RetirementPending'
    this.subject = subject
    this.resources = resources
  }
}

type ProviderEntry = {
  readonly provider: EnvironmentProvider
  readonly identity: ProviderIdentity
  active: boolean
  retiring: Promise<Retirement> | undefined
}

type AcquisitionRecord = {
  readonly acquisition: AcquisitionRef
  readonly tenant: TenantId
  /** The requester's scope. Description, scope release and recovery filter by it, on every layer. */
  readonly scope: ScopeRef
  readonly origin: OriginRef
  readonly placement: Placement
  readonly entry: ProviderEntry | null
  state: AcquisitionState
  lease: EnvironmentLease | null
  invalidate: (invalidation: LeaseInvalidation) => void
}

type ProviderReceipt = Extract<ProviderAcquisition, { kind: 'acquired' }>

function rejected(reason: RejectReason): Rejected {
  return Object.freeze({ kind: 'rejected', reason })
}

function byRegistry(reason: Extract<LeaseInvalidation, { source: 'registry' }>['reason']) {
  return Object.freeze({ source: 'registry', reason } satisfies LeaseInvalidation)
}

function adoptionOf(state: AcquisitionState): EnvironmentAdoption | null {
  switch (state.kind) {
    case 'acquired':
    case 'invalidated':
    case 'releasing':
    case 'released':
    case 'pendingRelease':
      return state.adoption
    case 'unrecorded':
    case 'acquiring':
    case 'provisional':
    case 'rejected':
      return null
    default: {
      const exhaustive: never = state
      return exhaustive
    }
  }
}

/** legal-identity's equality is false for any value it did not mint, so it doubles as the mint check. */
function mintedTenant(tenant: TenantId): boolean {
  return tenantEquals(tenant, tenant)
}

/** A layer that names an owning scope must name the requester's scope; other layers fit any scope. */
function fitsScope(binding: EnvironmentBinding, scope: ScopeRef): boolean {
  const owner = bindingScope(binding)
  return owner === undefined || sameScope(owner, scope)
}

function samePlacement(left: Placement, right: Placement): boolean {
  return (
    sameBinding(left.binding, right.binding) &&
    left.provider.name === right.provider.name &&
    left.provider.generation === right.provider.generation &&
    left.provider.version === right.provider.version &&
    sameSet(left.requirement.facilities, right.requirement.facilities) &&
    sameSet(left.requirement.isolation, right.requirement.isolation)
  )
}

function current(record: AcquisitionRecord): Acquired | Pending | Rejected {
  const state = record.state
  switch (state.kind) {
    case 'acquired':
      return record.lease === null
        ? rejected('unavailable')
        : Object.freeze({ kind: 'acquired', lease: record.lease, adoption: state.adoption })
    case 'rejected':
      return rejected(state.reason)
    case 'unrecorded':
      return rejected('unavailable')
    default:
      return Object.freeze({ kind: 'pending', state })
  }
}

function settleRejected(record: AcquisitionRecord, reason: RejectReason): Rejected {
  record.state = { kind: 'rejected', reason }
  return rejected(reason)
}

/**
 * Creates the environment registry: provider and facility tables, placement matching, the acquisition
 * state machine, lease views with their per-operation gate, and recovery orchestration. It has no
 * Cordis dependency and keeps only a process-local copy of acquisitions; durable facts stay in the
 * caller's ledger.
 */
export function createEnvironmentRegistry<P>(deps: RegistryDependencies): EnvironmentRegistry<P> {
  const providers: ProviderEntry[] = []
  const facilities = new Map<FacilityKey, StoredDescriptor>()
  // Keyed by the integrator's idempotency key; one record per tenant under a key, so another
  // tenant reusing the key neither sees nor disturbs the first tenant's acquisition.
  const records = new Map<AcquisitionRef, AcquisitionRecord[]>()
  const releasedScopes = new Set<string>()
  let closed = false
  let closing: Promise<Retirement> | undefined

  function* allRecords(): Generator<AcquisitionRecord> {
    for (const list of records.values()) yield* list
  }

  const findRecord = (acquisition: AcquisitionRef, tenant: TenantId) =>
    records.get(acquisition)?.find(record => tenantEquals(record.tenant, tenant))

  const scopeReleased = (scope: ScopeRef) => releasedScopes.has(scope.ref)

  const foreignTenantBinding = (binding: EnvironmentBinding, tenant: TenantId) =>
    binding.kind === 'tenant_sandbox' && !tenantEquals(binding.tenant, tenant)

  // What a provider can serve right now: its facility keys narrowed to declarations that are
  // registered. Placement resolution and the recheck in `acquire` both read this.
  const capabilities = (entry: ProviderEntry): ProviderCapabilities => ({
    bindingKinds: entry.provider.bindingKinds,
    facilities: entry.provider.facilities.filter(key => facilities.has(key)),
    isolation: entry.provider.isolation,
  })

  const retireEntry = (entry: ProviderEntry): Promise<Retirement> => {
    entry.active = false
    for (const record of allRecords())
      if (record.entry === entry) record.invalidate(byRegistry('providerRetired'))
    entry.retiring ??= (async (): Promise<Retirement> => {
      let result: Retirement
      try {
        result = await entry.provider.retire()
      } catch {
        result = { kind: 'pending', resources: [] }
      }
      if (result.kind === 'drained') {
        const index = providers.indexOf(entry)
        if (index >= 0) providers.splice(index, 1)
      } else {
        entry.retiring = undefined
      }
      return result
    })()
    return entry.retiring
  }

  /** An existing record answers with its current state, or refuses a conflicting repeat. */
  const replay = (existing: AcquisitionRecord, placement: Placement, scope: ScopeRef) =>
    sameScope(existing.scope, scope) && samePlacement(existing.placement, placement)
      ? current(existing)
      : rejected('invalidInput')

  /** Refusals that leave no record behind. */
  const preAdmit = (tenant: TenantId, placement: Placement): RejectReason | undefined => {
    if (closed) return 'ownerStopped'
    if (foreignTenantBinding(placement.binding, tenant)) return 'notAuthorized'
    return undefined
  }

  /** Checks the placement again, since resolving and acquiring are not atomic. */
  const recheckPlacement = (
    entry: ProviderEntry | undefined,
    record: AcquisitionRecord,
  ): RejectReason | ProviderEntry => {
    const placement = record.placement
    if (entry === undefined) return 'providerUnavailable'
    if (scopeReleased(record.scope)) return 'referenceExpired'
    const offered = capabilities(entry)
    const listed = placement.requirement.allowedBindings.some(binding =>
      sameBinding(binding, placement.binding),
    )
    if (!listed || !offered.bindingKinds.includes(placement.binding.kind))
      return 'noMatchingEnvironment'
    if (!placement.requirement.isolation.every(claim => offered.isolation.includes(claim)))
      return 'isolationUnconfirmed'
    if (!placement.requirement.facilities.every(key => offered.facilities.includes(key)))
      return 'unsupportedFacility'
    return entry
  }

  /** Asks the provider. A throw is `providerUnavailable`; a provider refusal keeps its reason. */
  const callProvider = async (
    record: AcquisitionRecord,
    entry: ProviderEntry,
    tenant: TenantId,
    input: AcquireInput<P>,
  ): Promise<ProviderReceipt | Rejected> => {
    let result: ProviderAcquisition
    try {
      result = await entry.provider.acquire({
        acquisition: input.acquisition,
        origin: input.origin,
        scope: record.scope,
        placement: record.placement,
        tenant,
        ledger: input.ledger,
      })
    } catch {
      return settleRejected(record, 'providerUnavailable')
    }
    if (result.kind === 'rejected') return settleRejected(record, result.reason)
    record.state = { kind: 'provisional' }
    return result
  }

  /** The five checks on a provisional receipt. */
  const verify = (
    record: AcquisitionRecord,
    entry: ProviderEntry,
    receipt: ProviderReceipt,
  ): RejectReason | undefined => {
    if (closed) return 'ownerStopped'
    if (!entry.active || !providers.includes(entry)) return 'providerUnavailable'
    if (scopeReleased(record.scope)) return 'referenceExpired'
    if (!sameBinding(record.placement.binding, receipt.lease.placement.binding))
      return 'unavailable'
    const missing = record.placement.requirement.facilities.some(
      key => receipt.lease.facility(key) === undefined,
    )
    return missing ? 'unsupportedFacility' : undefined
  }

  /** A receipt that failed verification is released; a pending release keeps its resources. */
  const compensate = async (
    record: AcquisitionRecord,
    receipt: ProviderReceipt,
    failure: RejectReason,
  ): Promise<Pending | Rejected> => {
    let release: LeaseRelease
    try {
      release = await receipt.lease.release()
    } catch {
      release = { kind: 'pending', resources: [] }
    }
    if (release.kind === 'released') return settleRejected(record, failure)
    record.state = { kind: 'pendingRelease', adoption: null, resources: release.resources }
    return Object.freeze({ kind: 'pending', state: record.state })
  }

  /** Issues the adoption record and wraps the receipt's lease in a view. */
  const adopt = (
    record: AcquisitionRecord,
    entry: ProviderEntry,
    receipt: ProviderReceipt,
    input: AcquireInput<P>,
  ): Acquired => {
    const adoption: EnvironmentAdoption = Object.freeze({
      acquisition: record.acquisition,
      origin: record.origin,
      placement: record.placement,
      provider: entry.identity,
      instance: receipt.lease.instance,
      continuity: receipt.lease.continuity,
      evidence: receipt.evidence,
    })
    const view = createLeaseView(receipt.lease, input.guard, {
      tenant: record.tenant,
      placement: record.placement,
      ledgerClosed: input.ledger.closed,
      descriptor: key => facilities.get(key),
      invalidated: invalidation => {
        if (record.state.kind === 'acquired')
          record.state = { kind: 'invalidated', adoption, invalidation }
      },
      releasing: () => {
        record.state = { kind: 'releasing', adoption }
      },
      released: release => {
        record.state =
          release.kind === 'released'
            ? { kind: 'released', adoption }
            : { kind: 'pendingRelease', adoption, resources: release.resources }
      },
    })
    record.invalidate = view.invalidate
    record.lease = view.lease
    record.state = { kind: 'acquired', adoption }
    return Object.freeze({ kind: 'acquired', lease: view.lease, adoption })
  }

  const registry: EnvironmentRegistry<P> = {
    async resolvePlacement(access, { scope, requirement }) {
      if (!mintedTenant(access.tenant)) return rejected('invalidInput')
      if (closed) return rejected('ownerStopped')
      if (scopeReleased(scope)) return rejected('referenceExpired')
      const candidates = providers
        .filter(entry => entry.active)
        .map(entry => ({ entry, ...capabilities(entry) }))
      const match = matchProviders(candidates, requirement)
      if (match.kind === 'rejected') return match
      if (foreignTenantBinding(match.binding, access.tenant)) return rejected('notAuthorized')
      if (!fitsScope(match.binding, scope)) return rejected('invalidInput')
      return Object.freeze({
        kind: 'placement',
        requirement,
        binding: match.binding,
        provider: match.provider.entry.identity,
        continuity: match.provider.entry.provider.continuity,
      })
    },

    async acquire(access, input) {
      if (!mintedTenant(access.tenant)) return rejected('invalidInput')
      const placement = input.placement
      if (!fitsScope(placement.binding, input.scope)) return rejected('invalidInput')
      const existing = findRecord(input.acquisition, access.tenant)
      if (existing !== undefined) return replay(existing, placement, input.scope)
      const refusal = preAdmit(access.tenant, placement)
      if (refusal !== undefined) return rejected(refusal)
      const entry = providers.find(
        candidate =>
          candidate.active &&
          candidate.identity.name === placement.provider.name &&
          candidate.identity.generation === placement.provider.generation &&
          candidate.identity.version === placement.provider.version,
      )
      // The record is written before the first await, so a concurrent repeat sees `acquiring`.
      const record: AcquisitionRecord = {
        acquisition: input.acquisition,
        tenant: access.tenant,
        scope: input.scope,
        origin: input.origin,
        placement,
        entry: entry ?? null,
        state: { kind: 'acquiring' },
        lease: null,
        invalidate: () => undefined,
      }
      records.set(input.acquisition, [...(records.get(input.acquisition) ?? []), record])
      const checked = recheckPlacement(entry, record)
      if (typeof checked === 'string') return settleRejected(record, checked)
      const receipt = await callProvider(record, checked, access.tenant, input)
      if (receipt.kind === 'rejected') return receipt
      const failure = verify(record, checked, receipt)
      if (failure !== undefined) return compensate(record, receipt, failure)
      return adopt(record, checked, receipt, input)
    },

    async inspectAcquisition(access, acquisition) {
      // AcquisitionState has no invalid-input answer; an unminted tenant owns no record.
      if (!mintedTenant(access.tenant)) return { kind: 'unrecorded' }
      const record = findRecord(acquisition, access.tenant)
      if (record === undefined) return { kind: 'unrecorded' }
      return record.state
    },

    async describe(access, scope) {
      if (!mintedTenant(access.tenant)) return rejected('invalidInput')
      if (closed) return rejected('ownerStopped')
      const descriptions: EnvironmentDescription[] = []
      for (const record of allRecords()) {
        if (!tenantEquals(record.tenant, access.tenant)) continue
        if (!sameScope(record.scope, scope)) continue
        if (record.state.kind === 'released') continue
        const adoption = adoptionOf(record.state)
        if (adoption === null) continue
        descriptions.push(
          Object.freeze({
            acquisition: record.acquisition,
            origin: record.origin,
            binding: record.placement.binding,
            provider: adoption.provider,
            instance: adoption.instance,
            continuity: adoption.continuity,
            facilities: record.placement.requirement.facilities,
            state: record.state.kind,
          }),
        )
      }
      return descriptions
    },

    async recoverOwned(scope, access) {
      const decision = await authorize(access, scope)
      if (decision !== 'authorized') return rejected(decision)
      return driveRecovery(scope, providers)
    },

    async releaseScope(scope, access) {
      const decision = await authorize(access, scope)
      if (decision !== 'authorized') return rejected(decision)
      releasedScopes.add(scope.ref)
      for (const record of allRecords())
        if (sameScope(record.scope, scope)) record.invalidate(byRegistry('scopeReleased'))
      return driveRecovery(scope, providers)
    },

    registerFacility<K extends FacilityKey>(descriptor: FacilityDescriptor<K>) {
      if (facilities.has(descriptor.key))
        throw new Error(`Facility ${descriptor.key} is already registered`)
      // A copy, so a removal never matches a later registration of the same descriptor object.
      const stored: StoredDescriptor = Object.freeze({
        key: descriptor.key,
        operations: descriptor.operations,
        guarded: descriptor.guarded,
      })
      facilities.set(descriptor.key, stored)
      return async () => {
        if (facilities.get(descriptor.key) === stored) facilities.delete(descriptor.key)
      }
    },

    registerProvider(provider) {
      if (closed) throw new Error('The environment registry is closed')
      const duplicate = providers.some(
        entry =>
          entry.identity.name === provider.name &&
          entry.identity.generation === provider.generation,
      )
      if (duplicate)
        throw new Error(`Provider ${provider.name}@${provider.generation} is already registered`)
      const entry: ProviderEntry = {
        provider,
        identity: Object.freeze({
          name: provider.name,
          generation: provider.generation,
          version: provider.version,
        }),
        active: true,
        retiring: undefined,
      }
      providers.push(entry)
      return async () => {
        const result = await retireEntry(entry)
        if (result.kind === 'pending')
          throw new RetirementPending(
            `Provider ${entry.identity.name}@${entry.identity.generation}`,
            result.resources,
          )
      }
    },

    close() {
      closing ??= (async (): Promise<Retirement> => {
        closed = true
        for (const record of allRecords()) record.invalidate(byRegistry('registryClosed'))
        const results = await Promise.all([...providers].map(retireEntry))
        const resources = results.flatMap(result =>
          result.kind === 'pending' ? result.resources : [],
        )
        return results.every(result => result.kind === 'drained')
          ? { kind: 'drained' }
          : { kind: 'pending', resources }
      })()
      return closing
    },
  }

  async function authorize(
    access: RecoveryAccess,
    scope: ScopeRef,
  ): Promise<'authorized' | 'notAuthorized' | 'unavailable'> {
    const known: ManagedResource[] = []
    for (const record of allRecords())
      if (record.state.kind === 'pendingRelease' && sameScope(record.scope, scope))
        known.push(...record.state.resources)
    try {
      return await deps.recovery.authorizeRecovery(access, scope, known)
    } catch {
      return 'unavailable'
    }
  }

  return Object.freeze(registry)
}
