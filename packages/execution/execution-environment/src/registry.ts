import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  bindingScope,
  matchProviders,
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
  type LeaseRelease,
  type ManagedResource,
  type OriginRef,
  type Pending,
  type Placement,
  type ProviderAcquisition,
  type ProviderIdentity,
  type ProviderRegistrations,
  type RecoveryAccess,
  type RecoveryAuthority,
  type RejectReason,
  type Rejected,
  type Retirement,
} from '@omne-harness/execution-environment-contract'
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
  readonly origin: OriginRef
  readonly placement: Placement
  readonly entry: ProviderEntry | null
  state: AcquisitionState
  lease: EnvironmentLease | null
  invalidate: (reason: string) => void
}

function rejected(reason: RejectReason): Rejected {
  return Object.freeze({ kind: 'rejected', reason })
}

function sameTenant(left: TenantId, right: TenantId): boolean {
  return left === right || tenantEquals(left, right)
}

function sameScope(left: ScopeRef | undefined, right: ScopeRef | undefined): boolean {
  return left?.ref === right?.ref
}

function sameBinding(left: EnvironmentBinding, right: EnvironmentBinding): boolean {
  switch (left.kind) {
    case 'host_machine':
      return right.kind === 'host_machine'
    case 'stateless_sandbox':
      return (
        right.kind === 'stateless_sandbox' &&
        left.origin === right.origin &&
        sameScope(left.scope, right.scope)
      )
    case 'session_sandbox':
      return right.kind === 'session_sandbox' && sameScope(left.scope, right.scope)
    case 'tenant_sandbox':
      return right.kind === 'tenant_sandbox' && sameTenant(left.tenant, right.tenant)
    default: {
      const exhaustive: never = left
      return exhaustive
    }
  }
}

function adoptionOf(state: AcquisitionState): EnvironmentAdoption | null {
  switch (state.kind) {
    case 'acquired':
    case 'invalidated':
    case 'releasing':
    case 'released':
      return state.adoption
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

  function* allRecords(): Generator<AcquisitionRecord> {
    for (const list of records.values()) yield* list
  }

  const findRecord = (acquisition: AcquisitionRef, tenant: TenantId) =>
    records.get(acquisition)?.find(record => sameTenant(record.tenant, tenant))

  const sameSet = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && [...left].sort().every((key, i) => key === [...right].sort()[i])

  const samePlacement = (left: Placement, right: Placement) =>
    sameBinding(left.binding, right.binding) &&
    left.provider.name === right.provider.name &&
    left.provider.generation === right.provider.generation &&
    sameSet(left.requirement.facilities, right.requirement.facilities) &&
    sameSet(left.requirement.isolation, right.requirement.isolation)
  let closing: Promise<Retirement> | undefined

  const scopeReleased = (binding: EnvironmentBinding) => {
    const scope = bindingScope(binding)
    return scope !== undefined && releasedScopes.has(scope.ref)
  }

  const foreignTenantBinding = (binding: EnvironmentBinding, tenant: TenantId) =>
    binding.kind === 'tenant_sandbox' && !sameTenant(binding.tenant, tenant)

  const current = (record: AcquisitionRecord): Acquired | Pending | Rejected => {
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

  const settleRejected = (record: AcquisitionRecord, reason: RejectReason): Rejected => {
    record.state = { kind: 'rejected', reason }
    return rejected(reason)
  }

  const retireEntry = (entry: ProviderEntry): Promise<Retirement> => {
    entry.active = false
    for (const record of allRecords())
      if (record.entry === entry) record.invalidate('providerRetired')
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

  const verify = (
    record: AcquisitionRecord,
    entry: ProviderEntry,
    result: Extract<ProviderAcquisition, { kind: 'acquired' }>,
  ): RejectReason | undefined => {
    if (closed) return 'ownerStopped'
    if (!entry.active || !providers.includes(entry)) return 'providerUnavailable'
    if (scopeReleased(record.placement.binding)) return 'referenceExpired'
    if (!sameBinding(result.lease.placement.binding, record.placement.binding)) return 'unavailable'
    const missing = record.placement.requirement.facilities.some(
      key => result.lease.facility(key) === undefined,
    )
    return missing ? 'unsupportedFacility' : undefined
  }

  const registry: EnvironmentRegistry<P> = {
    async resolvePlacement(access, requirement) {
      if (closed) return rejected('ownerStopped')
      const candidates = providers
        .filter(entry => entry.active)
        .map(entry => ({
          entry,
          bindingKinds: entry.provider.bindingKinds,
          facilities: entry.provider.facilities,
          isolation: entry.provider.isolation,
        }))
      const match = matchProviders(candidates, requirement)
      if (match.kind === 'rejected') return match
      if (foreignTenantBinding(match.binding, access.tenant)) return rejected('notAuthorized')
      if (scopeReleased(match.binding)) return rejected('referenceExpired')
      return Object.freeze({
        kind: 'placement',
        requirement,
        binding: match.binding,
        provider: match.provider.entry.identity,
        continuity: match.provider.entry.provider.continuity,
      })
    },

    async acquire(access, input) {
      const existing = findRecord(input.acquisition, access.tenant)
      if (existing !== undefined)
        return samePlacement(existing.placement, input.placement)
          ? current(existing)
          : rejected('invalidInput')
      if (closed) return rejected('ownerStopped')
      const placement = input.placement
      if (foreignTenantBinding(placement.binding, access.tenant)) return rejected('notAuthorized')
      const entry = providers.find(
        candidate =>
          candidate.active &&
          candidate.identity.name === placement.provider.name &&
          candidate.identity.generation === placement.provider.generation,
      )
      const record: AcquisitionRecord = {
        acquisition: input.acquisition,
        tenant: access.tenant,
        origin: input.origin,
        placement,
        entry: entry ?? null,
        state: { kind: 'acquiring' },
        lease: null,
        invalidate: () => undefined,
      }
      records.set(input.acquisition, [...(records.get(input.acquisition) ?? []), record])
      if (entry === undefined) return settleRejected(record, 'providerUnavailable')
      if (scopeReleased(placement.binding)) return settleRejected(record, 'referenceExpired')
      const listed = placement.requirement.allowedBindings.some(binding =>
        sameBinding(binding, placement.binding),
      )
      if (!listed || !entry.provider.bindingKinds.includes(placement.binding.kind))
        return settleRejected(record, 'noMatchingEnvironment')
      if (!placement.requirement.isolation.every(claim => entry.provider.isolation.includes(claim)))
        return settleRejected(record, 'isolationUnconfirmed')
      const unsupported = placement.requirement.facilities.some(
        key => !facilities.has(key) || !entry.provider.facilities.includes(key),
      )
      if (unsupported) return settleRejected(record, 'unsupportedFacility')

      let result: ProviderAcquisition
      try {
        result = await entry.provider.acquire({
          acquisition: input.acquisition,
          origin: input.origin,
          placement,
          tenant: access.tenant,
          ledger: input.ledger,
        })
      } catch {
        return settleRejected(record, 'providerUnavailable')
      }
      if (result.kind === 'rejected') return settleRejected(record, result.reason)

      record.state = { kind: 'provisional' }
      const failure = verify(record, entry, result)
      if (failure !== undefined) {
        let release: LeaseRelease
        try {
          release = await result.lease.release()
        } catch {
          release = { kind: 'pending', resources: [] }
        }
        if (release.kind === 'released') return settleRejected(record, failure)
        record.state = { kind: 'pendingRelease', adoption: null, resources: release.resources }
        return Object.freeze({ kind: 'pending', state: record.state })
      }

      const adoption: EnvironmentAdoption = Object.freeze({
        acquisition: input.acquisition,
        origin: input.origin,
        placement,
        provider: entry.identity,
        instance: result.lease.instance,
        continuity: result.lease.continuity,
        evidence: result.evidence,
      })
      const view = createLeaseView(result.lease, input.guard, {
        tenant: access.tenant,
        placement,
        descriptor: key => facilities.get(key),
        invalidated: reason => {
          if (record.state.kind === 'acquired')
            record.state = { kind: 'invalidated', adoption, reason }
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
    },

    async inspectAcquisition(access, acquisition) {
      const record = findRecord(acquisition, access.tenant)
      if (record === undefined) return { kind: 'unrecorded' }
      return record.state
    },

    async describe(access, scope) {
      if (closed) return rejected('ownerStopped')
      const descriptions: EnvironmentDescription[] = []
      for (const record of allRecords()) {
        if (!sameTenant(record.tenant, access.tenant)) continue
        if (!sameScope(bindingScope(record.placement.binding), scope)) continue
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
        if (sameScope(bindingScope(record.placement.binding), scope))
          record.invalidate('scopeReleased')
      return driveRecovery(scope, providers)
    },

    registerFacility<K extends FacilityKey>(descriptor: FacilityDescriptor<K>) {
      if (facilities.has(descriptor.key))
        throw new Error(`Facility ${descriptor.key} is already registered`)
      const stored: StoredDescriptor = descriptor
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
        identity: Object.freeze({ name: provider.name, generation: provider.generation }),
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
        for (const record of allRecords()) record.invalidate('registryClosed')
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
      if (
        record.state.kind === 'pendingRelease' &&
        sameScope(bindingScope(record.placement.binding), scope)
      )
        known.push(...record.state.resources)
    try {
      return await deps.recovery.authorizeRecovery(access, scope, known)
    } catch {
      return 'unavailable'
    }
  }

  return Object.freeze(registry)
}
