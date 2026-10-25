import { judgeJsonValue, type JsonValue } from '@omne-harness/json-text'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  AuthorityDecision,
  ScopeBinding,
  ScopeBindingSource,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'
import type {
  Access,
  AcquisitionListing,
  AcquisitionSettlement,
  EnvironmentAction,
  EnvironmentAuthority,
  EnvironmentLease,
  OriginalAcquisition,
  ProviderAcquisitionStatus,
  QuotaAnswer,
  EnvironmentProvider,
  EnvironmentFacilities,
  EnvironmentBinding,
  EnvironmentContinuity,
  FacilityGuard,
  FacilityKey,
  LeaseInvalidation,
  LeaseRelease,
  ManagedResource,
  ProviderAcquireInput,
  ProviderAcquisition,
  RecoveryAuthority,
  RecoveryListing,
  ResourceLedger,
  ResourceRecovery,
  Retirement,
} from '../index.ts'
export type ProviderScript = Readonly<{
  name?: string
  generation?: string
  version?: string
  quotaDomain?: string
  quota?: (tenant: TenantId) => Promise<QuotaAnswer>
  inspect?: (original: OriginalAcquisition) => Promise<ProviderAcquisitionStatus>
  list?: (scope: ScopeRef) => Promise<AcquisitionListing>
  settle?: (original: OriginalAcquisition) => Promise<AcquisitionSettlement>
  bindingKinds?: EnvironmentProvider['bindingKinds']
  continuity?: EnvironmentContinuity
  facilities?: readonly FacilityKey[]
  isolation?: EnvironmentProvider['isolation']
  lease?: Partial<EnvironmentFacilities>
  acquire?: (input: ProviderAcquireInput) => Promise<ProviderAcquisition>
  /** Runs before the default allocation; it may change test state, for example revoke access. */
  beforeAcquire?: (input: ProviderAcquireInput) => void | Promise<void>
  /**
   * Runs after the allocation is recorded. It may replace or throw away the response, which models a
   * provider that allocated but whose answer was lost.
   */
  afterAcquire?: (
    input: ProviderAcquireInput,
    receipt: ProviderAcquisition,
  ) => Promise<ProviderAcquisition>
  receiptBinding?: EnvironmentBinding
  extraReceiptFields?: Readonly<Record<string, unknown>>
  release?: () => Promise<LeaseRelease>
  retire?: () => Promise<Retirement>
  recoverable?: {
    list(scope: ProviderAcquireInput['scope']): Promise<RecoveryListing>
    recover(resource: ManagedResource): Promise<ResourceRecovery>
  }
}>
type HeldRecord = {
  original: OriginalAcquisition
  lease: EnvironmentLease | null
  evidence: JsonValue
  state: 'acquired' | 'released'
}
/** The double's key of one original acquisition: quota domain, tenant text and acquisition key. */
function recordKey(original: OriginalAcquisition): string | undefined {
  const tenant = tenantCodec.encode(original.tenant)
  if (!tenant.ok) return undefined
  return JSON.stringify([original.placement.quotaDomain, tenant.value, original.acquisition])
}
function scopeChain(scope: ScopeRef | undefined): readonly string[] {
  const refs: string[] = []
  for (let s = scope; s; s = s.parent) refs.push(s.ref)
  return refs
}
/** Fingerprint of an original description without the tenant, which the key already names. */
function fingerprint(original: OriginalAcquisition): string {
  const p = original.placement
  return JSON.stringify([
    original.origin,
    scopeChain(original.scope),
    p.quotaDomain,
    p.binding.kind,
    'scope' in p.binding ? scopeChain(p.binding.scope) : null,
    p.provider,
    p.continuity,
    [...new Set(p.requirement.facilities)].sort(),
    [...new Set(p.requirement.isolation)].sort(),
    p.requirement.allowedBindings.map(b => [b.kind, 'scope' in b ? scopeChain(b.scope) : null]),
  ])
}
/**
 * A scripted provider. Its original-acquisition record lives in this object only: it suits tests of
 * the registry, never a real provider. Default quota is unbounded per tenant with no global bound.
 */
export function createScriptedEnvironmentProvider(script: ProviderScript = {}) {
  const evidence = judgeJsonValue({ kind: 'boolean', value: true })
  if (!('ok' in evidence)) throw new TypeError('invalid test evidence')
  const calls = {
    acquire: 0,
    release: 0,
    retire: 0,
    start: 0,
    list: 0,
    recover: 0,
    quota: 0,
    inspect: 0,
    listAcquisitions: 0,
    settle: 0,
  }
  const records = new Map<string, HeldRecord>()
  function remember(input: ProviderAcquireInput, receipt: ProviderAcquisition): void {
    if (receipt.kind !== 'acquired') return
    const original: OriginalAcquisition = {
      tenant: input.tenant,
      acquisition: input.acquisition,
      origin: input.origin,
      scope: input.scope,
      placement: input.placement,
    }
    const key = recordKey(original)
    if (key === undefined) return
    records.set(key, { original, lease: receipt.lease, evidence: receipt.evidence, state: 'acquired' })
  }
  function lookup(original: OriginalAcquisition): HeldRecord | 'conflict' | undefined {
    const key = recordKey(original)
    const held = key === undefined ? undefined : records.get(key)
    if (!held) return undefined
    return fingerprint(held.original) === fingerprint(original) ? held : 'conflict'
  }
  let retired = false
  const notices: ((value: LeaseInvalidation) => void)[] = []
  const unknown = async (request: { readonly requestId: string }) =>
    retired
      ? { kind: 'rejected' as const, requestId: request.requestId, reason: 'closed' as const }
      : { kind: 'unknown' as const, requestId: request.requestId }
  const facilities: Partial<EnvironmentFacilities> = script.lease ?? {
    terminal: { create: unknown, execute: unknown, close: unknown, list: unknown },
    command: {
      async start(request) {
        if (retired) return { kind: 'rejected', requestId: request.requestId, reason: 'closed' }
        calls.start++
        return { kind: 'unknown', requestId: request.requestId }
      },
    },
  }
  const recoverable = script.recoverable
  const provider: EnvironmentProvider = {
    name: script.name ?? 'scripted',
    generation: script.generation ?? 'g1',
    version: script.version ?? '0.0.0',
    quotaDomain: script.quotaDomain ?? 'scripted',
    bindingKinds: script.bindingKinds ?? ['host_machine', 'session_sandbox'],
    continuity: script.continuity ?? { kind: 'not_guaranteed' },
    facilities: script.facilities ?? ['command', 'terminal'],
    isolation: script.isolation ?? [],
    async describe() {
      return {
        provider: this.name,
        generation: this.generation,
        version: this.version,
        platform: { os: 'test', release: '1' },
        facilities: this.facilities,
        isolation: this.isolation,
        prerequisites: 'unknown',
      }
    },
    async quota(tenant) {
      calls.quota++
      if (script.quota) return script.quota(tenant)
      return {
        kind: 'declared',
        quota: { unit: 'unsettled-acquisition', perTenant: Number.MAX_SAFE_INTEGER, global: null },
      }
    },
    async acquire(input) {
      calls.acquire++
      if (retired) return { kind: 'rejected', reason: 'providerUnavailable' }
      if (script.acquire) {
        const receipt = await script.acquire(input)
        remember(input, receipt)
        return receipt
      }
      if (!this.bindingKinds.includes(input.placement.binding.kind))
        return { kind: 'rejected', reason: 'noMatchingEnvironment' }
      await script.beforeAcquire?.(input)
      const actual = {
        ...input.placement,
        binding: script.receiptBinding ?? input.placement.binding,
      }
      let held: HeldRecord | undefined
      const receipt: ProviderAcquisition = {
        kind: 'acquired',
        evidence: evidence.ok,
        ...script.extraReceiptFields,
        lease: {
          placement: actual,
          instance: { id: 'instance', generation: '1' },
          continuity: this.continuity,
          facility(key) {
            return facilities[key]
          },
          invalidated: new Promise(resolve => notices.push(resolve)),
          async release() {
            calls.release++
            const released: LeaseRelease = script.release
              ? await script.release()
              : { kind: 'released' }
            if (held && released.kind === 'released') held.state = 'released'
            return released
          },
        },
      }
      remember(input, receipt)
      const key = recordKey(input)
      held = key === undefined ? undefined : records.get(key)
      return script.afterAcquire ? script.afterAcquire(input, receipt) : receipt
    },
    async inspectAcquisition(original) {
      calls.inspect++
      if (script.inspect) return script.inspect(original)
      const held = lookup(original)
      if (held === undefined) return { kind: 'notAllocated' }
      if (held === 'conflict') return { kind: 'conflict' }
      if (held.state === 'released' || !held.lease) return { kind: 'settled' }
      return { kind: 'acquired', lease: held.lease, evidence: held.evidence }
    },
    async listAcquisitions(scope) {
      calls.listAcquisitions++
      if (script.list) return script.list(scope)
      const acquisitions = [...records.values()]
        .filter(r => r.state === 'acquired' && r.original.scope.ref === scope.ref)
        .map(r => r.original)
      return { kind: 'listed', acquisitions }
    },
    async settleAcquisition(original) {
      calls.settle++
      if (script.settle) return script.settle(original)
      const held = lookup(original)
      if (held === undefined) return { kind: 'notAllocated' }
      if (held === 'conflict') return { kind: 'conflict' }
      if (held.state === 'acquired' && held.lease) {
        const released = await held.lease.release()
        if (released.kind === 'pending') return released
      }
      held.state = 'released'
      return { kind: 'settled' }
    },
    async retire() {
      calls.retire++
      retired = true
      return script.retire ? script.retire() : { kind: 'drained' }
    },
    ...(recoverable
      ? {
          async listRecoveryResources(scope: ProviderAcquireInput['scope']) {
            calls.list++
            return recoverable.list(scope)
          },
          async recover(resource: ManagedResource) {
            calls.recover++
            return recoverable.recover(resource)
          },
        }
      : {}),
  }
  return Object.assign(provider, {
    durability: 'none' as const,
    calls,
    invalidateLeases(value: LeaseInvalidation) {
      for (const settle of notices) settle(value)
    },
  })
}
export type ScriptedEnvironmentProvider = ReturnType<typeof createScriptedEnvironmentProvider>
export function createMemoryResourceLedger(
  answers: Partial<{
    plan: 'recorded' | 'conflict' | 'closed' | 'unavailable'
    permit: 'confirmed' | 'closed' | 'unavailable'
    adopt: 'confirmed' | 'closed' | 'unavailable'
    stopped: 'recorded' | 'unavailable'
  }> = {},
) {
  const controller = new AbortController()
  const calls: { method: 'plan' | 'permit' | 'adopt' | 'stopped'; key: string }[] = []
  const ledger: ResourceLedger = {
    closed: controller.signal,
    async plan(resource) {
      calls.push({ method: 'plan', key: resource.key })
      return controller.signal.aborted ? 'closed' : (answers.plan ?? 'recorded')
    },
    async permit(key) {
      calls.push({ method: 'permit', key })
      return controller.signal.aborted ? 'closed' : (answers.permit ?? 'confirmed')
    },
    async adopt(key) {
      calls.push({ method: 'adopt', key })
      return controller.signal.aborted ? 'closed' : (answers.adopt ?? 'confirmed')
    },
    async stopped(key) {
      calls.push({ method: 'stopped', key })
      return answers.stopped ?? 'recorded'
    },
  }
  return {
    durability: 'none' as const,
    ledger,
    calls,
    close() {
      controller.abort()
    },
  }
}
export type MemoryResourceLedger = ReturnType<typeof createMemoryResourceLedger>
export function createScriptedFacilityGuard<P>(
  answer: 'authorized' | 'notAuthorized' | 'unavailable' = 'authorized',
) {
  const calls: { facility: FacilityKey; operation: string }[] = []
  const guard: FacilityGuard<P> = {
    async authorize(facility, operation) {
      calls.push({ facility, operation })
      return answer
    },
  }
  return Object.assign(guard, { durability: 'none' as const, calls })
}
export function createScriptedRecoveryAuthority(
  answer: 'authorized' | 'notAuthorized' | 'unavailable' = 'authorized',
): RecoveryAuthority & { readonly durability: 'none' } {
  return {
    durability: 'none',
    async authorizeRecovery() {
      return answer
    },
  }
}

/** A scripted answer to one environment action; `undefined` keeps the default authorized answer. */
export type EnvironmentAuthorityScript<P> = (
  access: Access<P>,
  action: EnvironmentAction,
) => AuthorityDecision<P> | undefined

/**
 * A scripted environment authority. It authorizes every action with the caller's principal until a
 * script or `revokeAll` says otherwise; after `revokeAll`, `current()` of every earlier answer is false.
 * Not for production: it holds no real policy.
 */
export function createScriptedEnvironmentAuthority<P>() {
  const calls: { access: Access<P>; action: EnvironmentAction }[] = []
  let scripted: EnvironmentAuthorityScript<P> | undefined
  let revision = 0
  const authority: EnvironmentAuthority<P> = {
    async authorize(access, action) {
      calls.push({ access, action })
      const answer = scripted?.(access, action)
      if (answer !== undefined) return answer
      const issued = revision
      return { kind: 'authorized', principal: access.principal, current: () => issued === revision }
    },
  }
  return Object.assign(authority, {
    durability: 'none' as const,
    calls,
    script(next: EnvironmentAuthorityScript<P> | undefined) {
      scripted = next
    },
    revokeAll() {
      revision++
    },
  })
}

/**
 * A scripted trusted binding source. It trusts whatever the test binds; an unbound scope answers
 * `unbound`. Not for production.
 */
export type ScriptedScopeBindings = ScopeBindingSource &
  Readonly<{
    durability: 'none'
    calls: readonly ScopeRef[]
    bind(scope: ScopeRef, tenant: TenantId): void
    answer(scope: ScopeRef, binding: ScopeBinding): void
  }>
export function createScriptedScopeBindings(): ScriptedScopeBindings {
  const table = new Map<string, ScopeBinding>()
  const calls: ScopeRef[] = []
  const source: ScopeBindingSource = {
    async lookup(scope) {
      calls.push(scope)
      return table.get(scope.ref) ?? { kind: 'unbound' }
    },
  }
  return Object.assign(source, {
    durability: 'none' as const,
    calls,
    bind(scope: ScopeRef, tenant: TenantId) {
      table.set(scope.ref, { kind: 'bound', tenant })
    },
    answer(scope: ScopeRef, binding: ScopeBinding) {
      table.set(scope.ref, binding)
    },
  })
}

export type ScriptedFacilityGuard<P> = ReturnType<typeof createScriptedFacilityGuard<P>>
export type ScriptedEnvironmentAuthority<P> = ReturnType<typeof createScriptedEnvironmentAuthority<P>>

export type ScriptedRecoveryAuthority = ReturnType<typeof createScriptedRecoveryAuthority>
