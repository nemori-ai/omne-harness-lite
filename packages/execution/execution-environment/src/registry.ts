import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeBindingSource, ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  bindingScope,
  matchProviders,
  type AcquireInput,
  type AcquisitionInspection,
  type AcquisitionQuery,
  type AcquisitionSettlement,
  type AcquisitionState,
  type Acquired,
  type AllocationCleanup,
  type AllocationFailed,
  type EnvironmentAdoption,
  type EnvironmentAuthority,
  type EnvironmentBinding,
  type EnvironmentDescription,
  type EnvironmentLease,
  type EnvironmentProvider,
  type ExecutionEnvironment,
  type FacilityDescriptor,
  type FacilityGuard,
  type FacilityKey,
  type LeaseInvalidation,
  type LeaseRelease,
  type LookupUnknown,
  type ManagedResource,
  type OriginalAcquisition,
  type OriginalInspection,
  type Pending,
  type Placement,
  type ProviderAcquisition,
  type ProviderAcquisitionStatus,
  type ProviderCapabilities,
  type ProviderIdentity,
  type ProviderRegistrations,
  type RecoveryAccess,
  type RecoveryAuthority,
  type RecoveryInspection,
  type RejectReason,
  type Rejected,
  type ResourceLedger,
  type Retirement,
  type UnknownAcquisition,
} from '@omne-harness/execution-environment-contract'
import { checkAccess, mintedTenant, type AccessFailure } from './access.ts'
import {
  copyOriginal,
  copyPlacement,
  copyScope,
  fingerprint,
  sameBinding,
  sameScope,
  tenantText,
} from './compare.ts'
import { createLeaseView, type StoredDescriptor } from './lease-view.ts'
import { queryOriginal, routeFor, type DomainRoute } from './original.ts'
import { driveRecovery, sameOriginal } from './recovery.ts'

/** A structured diagnostic. It carries keys and reasons, never provider error text or secrets. */
export type RegistryDiagnostic = Readonly<{
  event:
    | 'receiptForOtherKey'
    | 'originalConflict'
    | 'contradictoryOriginal'
    | 'cleanupUnconfirmed'
    | 'providerThrew'
  acquisition: string
  detail?: string
}>

export type RegistryDependencies<P> = Readonly<{
  recovery: RecoveryAuthority
  /** The environment authority port. Ordinary operations ask it before any slot is read. */
  authority: EnvironmentAuthority<P>
  /** The trusted scope binding source; its type belongs to the Runtime Context contract. */
  bindings: ScopeBindingSource
  /**
   * How long the first `acquire` waits for the cleanup of an allocation whose adoption failed,
   * in milliseconds. A configurable initial value; past it the cleanup state is `unknown` and the
   * release keeps running. Default 1000.
   */
  cleanupWaitMs?: number
  diagnose?: (diagnostic: RegistryDiagnostic) => void
}>

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

type ProviderReceipt = Readonly<{
  lease: EnvironmentLease
  evidence: EnvironmentAdoption['evidence']
}>

type AcquisitionRecord<P> = {
  readonly original: OriginalAcquisition
  readonly fingerprint: string
  /** The ports the first call captured. A retry that replaces them is a conflict. */
  readonly ledger: ResourceLedger
  readonly guard: FacilityGuard<P>
  readonly entry: ProviderEntry | null
  state: AcquisitionState
  /** Bumped on every transition; a query response older than the current version is dropped. */
  version: number
  /** True while the first `acquire` still waits on the provider or on the adoption. */
  inFlight: boolean
  /** The provider receipt kept while the record is provisional and not adopted. */
  receipt: ProviderReceipt | null
  adopting: Promise<Acquired | AllocationFailed | Pending | UnknownAcquisition> | undefined
  lease: EnvironmentLease | null
  invalidate: (invalidation: LeaseInvalidation) => void
}

function rejected(reason: RejectReason): Rejected {
  return Object.freeze({ kind: 'rejected', reason })
}

function byRegistry(reason: Extract<LeaseInvalidation, { source: 'registry' }>['reason']) {
  return Object.freeze({ source: 'registry', reason } satisfies LeaseInvalidation)
}

function adoptionOf(state: AcquisitionState): EnvironmentAdoption | null {
  // The closed union carries adoption only after verification.
  return 'adoption' in state ? state.adoption : null
}

/** A layer that names an owning scope must name the requester's scope; other layers fit any scope. */
function fitsScope(binding: EnvironmentBinding, scope: ScopeRef): boolean {
  const owner = bindingScope(binding)
  return owner === undefined || sameScope(owner, scope)
}

function unknownAcquisition(
  acquisition: AcquisitionInput['acquisition'],
  phase: UnknownAcquisition['phase'],
): UnknownAcquisition {
  return Object.freeze({ kind: 'unknown', acquisition, phase })
}

type AcquisitionInput = AcquireInput<unknown>

function pendingProvisional(): Pending {
  return Object.freeze({ kind: 'pending', state: Object.freeze({ kind: 'provisional' }) })
}

function failed<P>(record: AcquisitionRecord<P>): AllocationFailed | undefined {
  const state = record.state
  return state.kind === 'allocationFailed'
    ? Object.freeze({
        kind: 'allocationFailed',
        acquisition: record.original.acquisition,
        reason: state.reason,
        cleanup: state.cleanup,
      })
    : undefined
}

/** What a repeat with the same fingerprint reads from an existing record, without a new allocation. */
function replayAnswer<P>(
  record: AcquisitionRecord<P>,
): Acquired | Pending | Rejected | AllocationFailed | UnknownAcquisition {
  const state = record.state
  switch (state.kind) {
    case 'acquired':
      return record.lease === null
        ? pendingProvisional()
        : Object.freeze({ kind: 'acquired', lease: record.lease, adoption: state.adoption })
    case 'rejected':
      return rejected(state.reason)
    case 'allocationFailed':
      return failed(record) ?? rejected('unavailable')
    case 'allocationUnknown':
      return unknownAcquisition(record.original.acquisition, 'allocation')
    case 'acquiring':
    case 'provisional':
    case 'invalidated':
    case 'releasing':
    case 'pendingRelease':
    case 'released':
    case 'settled':
      return Object.freeze({ kind: 'pending', state })
    default: {
      const exhaustive: never = state
      return exhaustive
    }
  }
}

function accessRefusal(failure: AccessFailure): Rejected {
  return rejected(failure.kind === 'refused' ? 'notAuthorized' : 'unavailable')
}

function lookupAnswer(failure: AccessFailure): Rejected | LookupUnknown {
  return failure.kind === 'unknown'
    ? Object.freeze({ kind: 'unknown', cause: failure.cause })
    : accessRefusal(failure)
}

function queryAnswer(failure: AccessFailure): AcquisitionInspection {
  switch (failure.kind) {
    case 'refused':
      return { kind: 'refused', reason: 'notAuthorized' }
    case 'unavailable':
      return { kind: 'queryUnavailable', cause: failure.cause }
    case 'unknown':
      return { kind: 'queryUnknown', cause: failure.cause }
    default: {
      const exhaustive: never = failure.kind
      return exhaustive
    }
  }
}

/** Waits at most `ms` for a promise. `undefined` means the bound passed first. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Creates the environment registry: provider and facility tables, placement matching, the
 * acquisition state machine with its original-acquisition queries, lease views with their
 * per-operation gate, and recovery over resources and acquisitions. It has no Cordis dependency and
 * keeps only a process-local copy of acquisitions; durable facts stay in the caller's ledger.
 */
export function createEnvironmentRegistry<P>(
  deps: RegistryDependencies<P>,
): EnvironmentRegistry<P> {
  const cleanupWaitMs = deps.cleanupWaitMs ?? 1000
  if (!Number.isFinite(cleanupWaitMs) || cleanupWaitMs < 0)
    throw new RangeError('cleanupWaitMs must be a finite number, zero or more')
  const diagnose = (diagnostic: RegistryDiagnostic) => {
    try {
      deps.diagnose?.(diagnostic)
    } catch {
      /* A diagnostic sink never changes the operation's result. */
    }
  }
  const providers: ProviderEntry[] = []
  const facilities = new Map<FacilityKey, StoredDescriptor>()
  // The slot is tenant plus acquisition key; another tenant reusing a key never sees this slot.
  const records = new Map<string, AcquisitionRecord<P>>()
  const releasedScopes = new Set<string>()
  let closed = false
  let closing: Promise<Retirement> | undefined

  const slotKey = (tenant: TenantId, acquisition: string) =>
    JSON.stringify([tenantText(tenant) ?? null, acquisition])
  const scopeReleased = (scope: ScopeRef) => releasedScopes.has(scope.ref)
  const foreignTenantBinding = (binding: EnvironmentBinding, tenant: TenantId) =>
    binding.kind === 'tenant_sandbox' && !tenantEquals(binding.tenant, tenant)
  const ports = { authority: deps.authority, bindings: deps.bindings }

  // What a provider can serve right now: its facility keys narrowed to registered declarations.
  const capabilities = (entry: ProviderEntry): ProviderCapabilities => ({
    bindingKinds: entry.provider.bindingKinds,
    facilities: entry.provider.facilities.filter(key => facilities.has(key)),
    isolation: entry.provider.isolation,
  })

  const transition = (record: AcquisitionRecord<P>, state: AcquisitionState) => {
    record.state = state
    record.version++
  }

  // ---- cleanup of an allocation whose adoption failed ----------------------------------------

  const cleanupOf = async (receipt: ProviderReceipt): Promise<AllocationCleanup> => {
    let release: LeaseRelease
    try {
      release = await receipt.lease.release()
    } catch {
      return { kind: 'unknown' }
    }
    if (release?.kind === 'released') return { kind: 'settled' }
    if (release?.kind === 'pending') return { kind: 'pending' }
    return { kind: 'unknown' }
  }

  /**
   * Seals the adoption in the same synchronous step that records the failure, then drives cleanup
   * through the original receipt. The first caller observes the cleanup within the bound; a late
   * answer still updates the record. The reason never changes.
   */
  const failAdoption = async (
    record: AcquisitionRecord<P>,
    receipt: ProviderReceipt,
    reason: RejectReason,
  ): Promise<AllocationFailed> => {
    record.receipt = null
    transition(record, { kind: 'allocationFailed', reason, cleanup: { kind: 'pending' } })
    const cleanup = cleanupOf(receipt).then(result => {
      if (record.state.kind === 'allocationFailed' && record.state.cleanup.kind !== 'settled')
        transition(record, { kind: 'allocationFailed', reason, cleanup: result })
      if (result.kind !== 'settled')
        diagnose({
          event: 'cleanupUnconfirmed',
          acquisition: record.original.acquisition,
          detail: result.kind,
        })
      return result
    })
    const observed = await within(cleanup, cleanupWaitMs)
    if (observed === undefined && record.state.kind === 'allocationFailed')
      transition(record, { kind: 'allocationFailed', reason, cleanup: { kind: 'unknown' } })
    const answer: AllocationFailed = failed(record) ?? {
      kind: 'allocationFailed',
      acquisition: record.original.acquisition,
      reason,
      cleanup: { kind: 'unknown' },
    }
    return answer
  }

  /** A provisional record whose adoption can no longer happen turns into an adoption failure. */
  const failProvisional = (record: AcquisitionRecord<P>, reason: RejectReason) => {
    if (record.state.kind !== 'provisional' || record.adopting || record.receipt === null) return
    void failAdoption(record, record.receipt, reason)
  }

  // ---- providers ------------------------------------------------------------------------------

  const retireEntry = (entry: ProviderEntry): Promise<Retirement> => {
    entry.active = false
    for (const record of records.values())
      if (record.entry === entry) {
        record.invalidate(byRegistry('providerRetired'))
        failProvisional(record, 'providerUnavailable')
      }
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

  const routes = (): readonly DomainRoute[] =>
    providers.map(entry => ({ provider: entry.provider, identity: entry.identity }))

  /** Checks the placement again, since resolving and acquiring are not atomic. */
  const recheckPlacement = (
    entry: ProviderEntry | undefined,
    original: OriginalAcquisition,
  ): RejectReason | ProviderEntry => {
    const placement = original.placement
    if (entry === undefined || entry.provider.quotaDomain !== placement.quotaDomain)
      return 'providerUnavailable'
    if (scopeReleased(original.scope)) return 'referenceExpired'
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

  /** The checks on a provisional receipt; the last is the caller's current authorization. */
  const verify = (
    record: AcquisitionRecord<P>,
    receipt: ProviderReceipt,
    current: () => boolean,
  ): RejectReason | undefined => {
    const entry = record.entry
    if (closed) return 'ownerStopped'
    if (entry === null || !entry.active || !providers.includes(entry)) return 'providerUnavailable'
    if (scopeReleased(record.original.scope)) return 'referenceExpired'
    if (!sameBinding(record.original.placement.binding, receipt.lease.placement.binding))
      return 'unavailable'
    const missing = record.original.placement.requirement.facilities.some(
      key => receipt.lease.facility(key) === undefined,
    )
    if (missing) return 'unsupportedFacility'
    return current() ? undefined : 'notAuthorized'
  }

  /** Issues the adoption record and wraps the receipt's lease in a view. */
  const adopt = (record: AcquisitionRecord<P>, receipt: ProviderReceipt): Acquired => {
    const entry = record.entry
    if (entry === null) throw new Error('adoption without a provider entry')
    const original = record.original
    const adoption: EnvironmentAdoption = Object.freeze({
      acquisition: original.acquisition,
      origin: original.origin,
      placement: original.placement,
      provider: entry.identity,
      instance: receipt.lease.instance,
      continuity: receipt.lease.continuity,
      evidence: receipt.evidence,
    })
    const view = createLeaseView(receipt.lease, record.guard, {
      tenant: original.tenant,
      origin: original.origin,
      placement: original.placement,
      ledgerClosed: record.ledger.closed,
      descriptor: key => facilities.get(key),
      invalidated: invalidation => {
        if (record.state.kind === 'acquired')
          transition(record, { kind: 'invalidated', adoption, invalidation })
      },
      releasing: () => transition(record, { kind: 'releasing', adoption }),
      released: release =>
        transition(
          record,
          release.kind === 'released'
            ? { kind: 'released', adoption }
            : { kind: 'pendingRelease', adoption, resources: release.resources },
        ),
    })
    record.invalidate = view.invalidate
    record.lease = view.lease
    record.receipt = null
    transition(record, { kind: 'acquired', adoption })
    return Object.freeze({ kind: 'acquired', lease: view.lease, adoption })
  }

  /** One adoption transition per record: concurrent callers share it, so only one lease is issued. */
  const adoptOnce = (
    record: AcquisitionRecord<P>,
    current: () => boolean,
  ): Promise<Acquired | AllocationFailed | Pending | UnknownAcquisition> => {
    const receipt = record.receipt
    if (record.adopting) return record.adopting
    if (receipt === null || record.state.kind !== 'provisional')
      return Promise.resolve(replayFor(record))
    record.adopting = (async () => {
      try {
        const failure = verify(record, receipt, current)
        if (failure !== undefined) return await failAdoption(record, receipt, failure)
        return adopt(record, receipt)
      } finally {
        record.adopting = undefined
      }
    })()
    return record.adopting
  }

  const replayFor = (record: AcquisitionRecord<P>) => {
    const answer = replayAnswer(record)
    return answer.kind === 'rejected' ? pendingProvisional() : answer
  }

  /** Asks the provider. A throw or an unknown answer keeps the slot as an unknown allocation. */
  const allocate = async (
    record: AcquisitionRecord<P>,
    entry: ProviderEntry,
    current: () => boolean,
  ): Promise<Acquired | Rejected | AllocationFailed | Pending | UnknownAcquisition> => {
    const original = record.original
    let result: ProviderAcquisition
    try {
      result = await entry.provider.acquire({
        acquisition: original.acquisition,
        origin: original.origin,
        scope: original.scope,
        placement: original.placement,
        tenant: original.tenant,
        ledger: record.ledger,
      })
    } catch {
      diagnose({ event: 'providerThrew', acquisition: original.acquisition })
      result = { kind: 'unknown', acquisition: original.acquisition }
    }
    switch (result?.kind) {
      case 'rejected':
        record.inFlight = false
        transition(record, { kind: 'rejected', reason: result.reason })
        return rejected(result.reason)
      case 'acquired':
        record.inFlight = false
        record.receipt = Object.freeze({ lease: result.lease, evidence: result.evidence })
        transition(record, { kind: 'provisional' })
        return adoptOnce(record, current)
      default:
        if (result?.kind === 'unknown' && result.acquisition !== original.acquisition)
          diagnose({ event: 'receiptForOtherKey', acquisition: original.acquisition })
        record.inFlight = false
        transition(record, { kind: 'allocationUnknown', acquisition: original.acquisition })
        return unknownAcquisition(original.acquisition, 'allocation')
    }
  }

  /** Asks the provider's quota before the slot is written. Only a declared quota continues. */
  const quotaPreflight = async (
    entry: ProviderEntry,
    tenant: TenantId,
  ): Promise<'declared' | 'unavailable' | 'unknown'> => {
    try {
      const answer = await entry.provider.quota(tenant)
      if (answer?.kind === 'declared' || answer?.kind === 'unavailable') return answer.kind
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  const findEntry = (placement: Placement) =>
    providers.find(
      candidate =>
        candidate.active &&
        candidate.identity.name === placement.provider.name &&
        candidate.identity.generation === placement.provider.generation &&
        candidate.identity.version === placement.provider.version,
    )

  // ---- queries --------------------------------------------------------------------------------

  /**
   * Applies an original-provider answer to the local cache, per the contract's table. A response
   * older than the record's current version is dropped. Returns the query answer.
   */
  const applyStatus = (
    record: AcquisitionRecord<P>,
    status: ProviderAcquisitionStatus,
  ): AcquisitionInspection => {
    const state = record.state
    const failedReason = state.kind === 'allocationFailed' ? state.reason : undefined
    const adoption = adoptionOf(state)
    switch (status.kind) {
      case 'acquired':
        if (failedReason === undefined && adoption === null && state.kind !== 'rejected') {
          record.receipt = Object.freeze({ lease: status.lease, evidence: status.evidence })
          if (state.kind !== 'provisional') transition(record, { kind: 'provisional' })
        }
        break
      case 'pending':
        if (failedReason !== undefined)
          transition(record, {
            kind: 'allocationFailed',
            reason: failedReason,
            cleanup: { kind: 'pending' },
          })
        else if (status.phase === 'releasing')
          transition(record, { kind: 'pendingRelease', adoption, resources: status.resources })
        else if (adoption === null && state.kind !== 'rejected' && state.kind !== status.phase)
          transition(record, { kind: status.phase })
        break
      case 'notAllocated':
        if (failedReason !== undefined || adoption !== null) {
          diagnose({ event: 'contradictoryOriginal', acquisition: record.original.acquisition })
          return { kind: 'queryUnknown', cause: 'provider' }
        }
        if (state.kind !== 'rejected')
          transition(record, { kind: 'rejected', reason: 'allocationNotPerformed' })
        break
      case 'settled':
        if (failedReason !== undefined)
          transition(record, {
            kind: 'allocationFailed',
            reason: failedReason,
            cleanup: { kind: 'settled' },
          })
        else if (adoption !== null) transition(record, { kind: 'released', adoption })
        else if (state.kind !== 'rejected') transition(record, { kind: 'settled' })
        break
      case 'conflict':
        diagnose({ event: 'originalConflict', acquisition: record.original.acquisition })
        return { kind: 'original', status: 'conflict', original: record.original }
      case 'unavailable':
        return { kind: 'queryUnavailable', cause: 'provider' }
      case 'unknown':
        return { kind: 'queryUnknown', cause: 'provider' }
      default: {
        const exhaustive: never = status
        return exhaustive
      }
    }
    return { kind: 'known', state: record.state }
  }

  const needsOriginal = (record: AcquisitionRecord<P>) => {
    if (record.inFlight || record.adopting) return false
    const state = record.state
    return (
      state.kind === 'allocationUnknown' ||
      state.kind === 'acquiring' ||
      (state.kind === 'provisional' && record.receipt === null) ||
      (state.kind === 'allocationFailed' && state.cleanup.kind !== 'settled')
    )
  }

  const inspectLocal = async (record: AcquisitionRecord<P>): Promise<AcquisitionInspection> => {
    if (!needsOriginal(record)) return { kind: 'known', state: record.state }
    const route = routeFor(routes(), record.original)
    if (route === undefined) return { kind: 'queryUnavailable', cause: 'provider' }
    const version = record.version
    const status = await queryOriginal(route, record.original)
    if (record.version !== version) return { kind: 'known', state: record.state }
    return applyStatus(record, status)
  }

  /** Answers an original query from the provider's record. It never adopts and never returns a lease. */
  const originalAnswer = async (original: OriginalAcquisition): Promise<RecoveryInspection> => {
    const route = routeFor(routes(), original)
    if (route === undefined) return { kind: 'queryUnavailable', cause: 'provider' }
    const local = records.get(slotKey(original.tenant, original.acquisition))
    const matching = local && local.fingerprint === fingerprint(original) ? local : undefined
    const status = await queryOriginal(route, original)
    const adoption = matching ? adoptionOf(matching.state) : null
    const failure = matching ? failed(matching) : undefined
    const answer = (inspection: OriginalInspection): RecoveryInspection => inspection
    switch (status.kind) {
      case 'acquired':
        return answer({ kind: 'original', status: 'allocated', original, adoption })
      case 'pending':
        return failure
          ? answer({
              kind: 'original',
              status: 'allocationFailed',
              original,
              reason: failure.reason,
              cleanup: { kind: 'pending' },
            })
          : answer({
              kind: 'original',
              status: 'pending',
              original,
              adoption,
              phase: status.phase,
              resources: status.resources,
            })
      case 'notAllocated':
        return answer({ kind: 'original', status: 'notAllocated', original })
      case 'settled':
        return failure
          ? answer({
              kind: 'original',
              status: 'allocationFailed',
              original,
              reason: failure.reason,
              cleanup: { kind: 'settled' },
            })
          : answer({ kind: 'original', status: 'settled', original })
      case 'conflict':
        return answer({ kind: 'original', status: 'conflict', original })
      case 'unavailable':
        return { kind: 'queryUnavailable', cause: 'provider' }
      case 'unknown':
        return { kind: 'queryUnknown', cause: 'provider' }
      default: {
        const exhaustive: never = status
        return exhaustive
      }
    }
  }

  // ---- recovery -------------------------------------------------------------------------------

  type RecoveryDecision = 'authorized' | 'notAuthorized' | 'unavailable' | 'unknown'

  const authorizeRecovery = async (
    access: RecoveryAccess,
    scope: ScopeRef,
  ): Promise<RecoveryDecision> => {
    const known: ManagedResource[] = []
    for (const record of records.values())
      if (record.state.kind === 'pendingRelease' && sameScope(record.original.scope, scope))
        known.push(...record.state.resources)
    try {
      const answer = await deps.recovery.authorizeRecovery(access, scope, known)
      return answer === 'authorized' || answer === 'notAuthorized' || answer === 'unavailable'
        ? answer
        : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /** The known list is data the maintainer brought back; it must fit the scope before authorization. */
  const validKnown = (scope: ScopeRef, known: readonly OriginalAcquisition[] | undefined) =>
    known === undefined ||
    (Array.isArray(known) &&
      known.every(
        original =>
          typeof original === 'object' &&
          original !== null &&
          mintedTenant(original.tenant) &&
          typeof original.acquisition === 'string' &&
          original.acquisition !== '' &&
          typeof original.placement?.quotaDomain === 'string' &&
          sameScope(original.scope, scope),
      ))

  /** Updates the local copy after a settlement. It never returns quota itself. */
  const observeSettlement = (original: OriginalAcquisition, answer: AcquisitionSettlement) => {
    const record = records.get(slotKey(original.tenant, original.acquisition))
    if (!record || !sameOriginal(record.original, original)) return
    if (answer.kind !== 'settled' && answer.kind !== 'notAllocated') return
    const state = record.state
    if (state.kind === 'allocationFailed') {
      if (answer.kind === 'settled')
        transition(record, { kind: 'allocationFailed', reason: state.reason, cleanup: answer })
      return
    }
    const adoption = adoptionOf(state)
    if (adoption !== null) transition(record, { kind: 'released', adoption })
    else if (state.kind !== 'rejected')
      transition(
        record,
        answer.kind === 'settled'
          ? { kind: 'settled' }
          : { kind: 'rejected', reason: 'allocationNotPerformed' },
      )
  }

  const recover = async (
    scope: ScopeRef,
    access: RecoveryAccess,
    known: readonly OriginalAcquisition[] | undefined,
    release: boolean,
  ) => {
    if (!validKnown(scope, known)) return rejected('invalidInput')
    const target = copyScope(scope)
    const originals = (known ?? []).map(copyOriginal)
    const decision = await authorizeRecovery(access, target)
    if (decision === 'unknown')
      return Object.freeze({ kind: 'unknown', cause: 'authority' } as const)
    if (decision !== 'authorized') return rejected(decision)
    if (release) {
      releasedScopes.add(target.ref)
      for (const record of records.values())
        if (sameScope(record.original.scope, target)) {
          record.invalidate(byRegistry('scopeReleased'))
          failProvisional(record, 'referenceExpired')
        }
    }
    return driveRecovery(target, routes(), originals, observeSettlement)
  }

  // ---- the surfaces ---------------------------------------------------------------------------

  const registry: EnvironmentRegistry<P> = {
    async resolvePlacement(access, input) {
      if (!mintedTenant(access.tenant)) return rejected('invalidInput')
      const scope = copyScope(input.scope)
      const requirement = input.requirement
      const checked = await checkAccess(ports, access, { kind: 'resolve', scope }, scope)
      if (checked.kind !== 'granted') return lookupAnswer(checked)
      if (closed) return rejected('ownerStopped')
      if (scopeReleased(scope)) return rejected('referenceExpired')
      const candidates = providers
        .filter(entry => entry.active)
        .map(entry => ({ entry, ...capabilities(entry) }))
      const match = matchProviders(candidates, requirement)
      if (match.kind === 'rejected') return match
      if (foreignTenantBinding(match.binding, access.tenant)) return rejected('notAuthorized')
      if (!fitsScope(match.binding, scope)) return rejected('invalidInput')
      const entry = match.provider.entry
      return Object.freeze({
        kind: 'placement',
        requirement,
        binding: match.binding,
        provider: entry.identity,
        continuity: entry.provider.continuity,
        quotaDomain: entry.provider.quotaDomain,
      })
    },

    async acquire(access, input) {
      if (!mintedTenant(access.tenant)) return rejected('invalidInput')
      // Snapshot the data fields before the first await; the ports keep their identity.
      const original: OriginalAcquisition = Object.freeze({
        tenant: access.tenant,
        acquisition: input.acquisition,
        origin: input.origin,
        scope: copyScope(input.scope),
        placement: copyPlacement(input.placement),
      })
      const { ledger, guard } = input
      if (!fitsScope(original.placement.binding, original.scope)) return rejected('invalidInput')
      const checked = await checkAccess(
        ports,
        access,
        { kind: 'acquire', original },
        original.scope,
      )
      if (checked.kind !== 'granted')
        return checked.kind === 'unknown'
          ? unknownAcquisition(original.acquisition, 'preflight')
          : accessRefusal(checked)
      const key = slotKey(access.tenant, original.acquisition)
      const print = fingerprint(original)
      const existing = records.get(key)
      if (existing !== undefined) {
        if (
          existing.fingerprint !== print ||
          existing.ledger !== ledger ||
          existing.guard !== guard
        )
          return rejected('acquisitionConflict')
        if (existing.state.kind === 'provisional' && existing.receipt !== null)
          return adoptOnce(existing, checked.current)
        return replayAnswer(existing)
      }
      if (closed) return rejected('ownerStopped')
      if (foreignTenantBinding(original.placement.binding, access.tenant))
        return rejected('notAuthorized')
      const entry = findEntry(original.placement)
      // The record is written before the next await, so a concurrent repeat sees `acquiring`.
      const record: AcquisitionRecord<P> = {
        original,
        fingerprint: print,
        ledger,
        guard,
        entry: entry ?? null,
        state: { kind: 'acquiring' },
        version: 0,
        inFlight: true,
        receipt: null,
        adopting: undefined,
        lease: null,
        invalidate: () => undefined,
      }
      records.set(key, record)
      const placed = recheckPlacement(entry, original)
      if (typeof placed === 'string') {
        record.inFlight = false
        transition(record, { kind: 'rejected', reason: placed })
        return rejected(placed)
      }
      const quota = await quotaPreflight(placed, access.tenant)
      if (quota !== 'declared' || !checked.current()) {
        // A temporary preflight refusal does not occupy the slot.
        if (records.get(key) === record) records.delete(key)
        if (quota === 'unavailable') return rejected('unavailable')
        if (quota === 'unknown') return unknownAcquisition(original.acquisition, 'preflight')
        return rejected('notAuthorized')
      }
      return allocate(record, placed, checked.current)
    },

    async inspectAcquisition(access, query: AcquisitionQuery) {
      if (!mintedTenant(access.tenant)) return { kind: 'invalidInput' }
      if (query.kind === 'local') {
        const acquisition = query.acquisition
        const checked = await checkAccess(
          ports,
          access,
          { kind: 'inspect', tenant: access.tenant, acquisition },
          undefined,
        )
        if (checked.kind !== 'granted') return queryAnswer(checked)
        const record = records.get(slotKey(access.tenant, acquisition))
        return record === undefined ? { kind: 'unrecorded' } : inspectLocal(record)
      }
      const original = copyOriginal(query.original)
      const checked = await checkAccess(
        ports,
        access,
        { kind: 'inspect-original', original },
        original.scope,
      )
      if (checked.kind !== 'granted') return queryAnswer(checked)
      // Rule 3 of the access check: the description's tenant is the caller's, or the provider is not asked.
      if (!tenantEquals(original.tenant, access.tenant))
        return { kind: 'refused', reason: 'notAuthorized' }
      return originalAnswer(original)
    },

    async inspectRecoveryAcquisition(access, input) {
      const original = copyOriginal(input)
      const decision = await authorizeRecovery(access, original.scope)
      if (decision === 'unknown') return { kind: 'queryUnknown', cause: 'authority' }
      if (decision === 'unavailable') return { kind: 'queryUnavailable', cause: 'authority' }
      if (decision === 'notAuthorized') return { kind: 'refused', reason: 'notAuthorized' }
      return originalAnswer(original)
    },

    async describe(access, input) {
      if (!mintedTenant(access.tenant)) return rejected('invalidInput')
      if (closed) return rejected('ownerStopped')
      const scope = copyScope(input)
      const checked = await checkAccess(ports, access, { kind: 'describe', scope }, scope)
      if (checked.kind !== 'granted') return lookupAnswer(checked)
      const descriptions: EnvironmentDescription[] = []
      for (const record of records.values()) {
        if (!tenantEquals(record.original.tenant, access.tenant)) continue
        if (!sameScope(record.original.scope, scope)) continue
        if (record.state.kind === 'released') continue
        const adoption = adoptionOf(record.state)
        if (adoption === null) continue
        descriptions.push(
          Object.freeze({
            acquisition: record.original.acquisition,
            origin: record.original.origin,
            binding: record.original.placement.binding,
            provider: adoption.provider,
            instance: adoption.instance,
            continuity: adoption.continuity,
            facilities: record.original.placement.requirement.facilities,
            state: record.state.kind,
          }),
        )
      }
      return descriptions
    },

    recoverOwned(scope, access, known) {
      return recover(scope, access, known, false)
    },

    releaseScope(scope, access, known) {
      return recover(scope, access, known, true)
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
        for (const record of records.values()) {
          record.invalidate(byRegistry('registryClosed'))
          failProvisional(record, 'ownerStopped')
        }
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

  return Object.freeze(registry)
}
