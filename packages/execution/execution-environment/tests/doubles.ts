import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  ScopeBinding,
  ScopeBindingSource,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'
import {
  acquisitionRef,
  bindingScope,
  commandFacility,
  originRef,
  type Access,
  type AcquisitionListing,
  type AcquisitionSettlement,
  type CommandFacility,
  type EnvironmentAuthority,
  type OriginalAcquisition,
  type ProviderAcquisitionStatus,
  type QuotaAnswer,
  type EnvironmentBinding,
  type EnvironmentContinuity,
  type EnvironmentFacilities,
  type EnvironmentLease,
  type EnvironmentProvider,
  type EnvironmentRequirement,
  type FacilityGuard,
  type FacilityKey,
  type FacilityResult,
  type IsolationClaim,
  type LeaseInvalidation,
  type LeaseRelease,
  type ManagedResource,
  type Placement,
  type PlacementInput,
  type ProcessHandle,
  type ProviderAcquireInput,
  type ProviderAcquisition,
  type RecoveryAuthority,
  type RecoveryListing,
  type ResourceLedger,
  type ResourceRecovery,
  type Retirement,
} from '@omne-harness/execution-environment-contract'
import {
  createEnvironmentRegistry,
  type EnvironmentRegistry,
} from '@omne-harness/execution-environment'

export function tenantFrom(organization: string, account: string): TenantId {
  const parsed = tenantCodec.parse(JSON.stringify({ organization, account }))
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
}

export const tenantA = tenantFrom(
  'org_0123456789abcdefghjkmnpqrs',
  'acc_0123456789abcdefghjkmnpqrs',
)
export const tenantB = tenantFrom(
  'org_0123456789abcdefghjkmnpqrt',
  'acc_0123456789abcdefghjkmnpqrt',
)
export const accessA: Access<string> = { principal: 'subject-a', tenant: tenantA }
export const accessB: Access<string> = { principal: 'subject-b', tenant: tenantB }

function isScopeText(text: string): text is ScopeRef['ref'] {
  return text.length > 0
}

export function scope(text: string): ScopeRef {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

export const scope1 = scope('scope-1')
export const host: EnvironmentBinding = { kind: 'host_machine' }
export const session: EnvironmentBinding = { kind: 'session_sandbox', scope: scope1 }

export const ledger: ResourceLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  adopt: async () => 'confirmed',
  stopped: async () => 'recorded',
}

export const allow: FacilityGuard<string> = { authorize: async () => 'authorized' }
export const recovery: RecoveryAuthority = { authorizeRecovery: async () => 'authorized' }

export function openAuthority() {
  let revision = 0
  const calls: Parameters<EnvironmentAuthority<string>['authorize']>[1][] = []
  const authority: EnvironmentAuthority<string> = {
    async authorize(access, action) {
      calls.push(action)
      const issued = revision
      return { kind: 'authorized', principal: access.principal, current: () => issued === revision }
    },
  }
  return Object.assign(authority, {
    calls,
    revokeAll() {
      revision++
    },
  })
}

export function bindingTable() {
  const table = new Map<string, ScopeBinding>()
  const source: ScopeBindingSource = {
    async lookup(scopeRef) {
      return table.get(scopeRef.ref) ?? { kind: 'bound', tenant: tenantA }
    },
  }
  return Object.assign(source, {
    bind(scopeRef: ScopeRef, tenant: TenantId) {
      table.set(scopeRef.ref, { kind: 'bound', tenant })
    },
    answer(scopeRef: ScopeRef, binding: ScopeBinding) {
      table.set(scopeRef.ref, binding)
    },
  })
}

export const scopeB = scope('scope-b')

export function openPorts() {
  const bindings = bindingTable()
  bindings.bind(scopeB, tenantB)
  return { authority: openAuthority(), bindings }
}

export function local(acquisition: string) {
  return { kind: 'local', acquisition: acquisitionRef(acquisition) } as const
}

export function resource(key: string, provider = 'scripted'): ManagedResource {
  return { key, provider, reference: { kind: 'string', value: key } }
}

export type Calls = {
  acquire: number
  release: number
  retire: number
  start: number
  list: number
  recover: number
  quota: number
  inspect: number
  listAcquisitions: number
  settle: number
}

export function commandStub(calls: Calls): CommandFacility<unknown> {
  return {
    async start(request): Promise<FacilityResult<ProcessHandle>> {
      calls.start += 1
      return { kind: 'unknown', requestId: request.requestId }
    },
  }
}

export type Script = {
  name?: string
  generation?: string
  version?: string
  quotaDomain?: string
  quota?: (tenant: TenantId) => Promise<QuotaAnswer>
  inspect?: (original: OriginalAcquisition) => Promise<ProviderAcquisitionStatus>
  listAcquisitions?: (scopeRef: ScopeRef) => Promise<AcquisitionListing>
  settle?: (original: OriginalAcquisition) => Promise<AcquisitionSettlement>
  bindingKinds?: EnvironmentProvider['bindingKinds']
  continuity?: EnvironmentContinuity
  keys?: readonly FacilityKey[]
  isolation?: readonly IsolationClaim[]
  facilities?: Partial<EnvironmentFacilities>
  acquire?: (input: ProviderAcquireInput) => Promise<ProviderAcquisition>
  receiptBinding?: EnvironmentBinding
  release?: () => Promise<LeaseRelease>
  retire?: () => Promise<Retirement>
  recoverable?: {
    list: (scope: ScopeRef) => Promise<RecoveryListing>
    recover: (resource: ManagedResource) => Promise<ResourceRecovery>
  }
}

export type Scripted = EnvironmentProvider & {
  readonly calls: Calls
  invalidateLeases(value: LeaseInvalidation): void
  breakLeases(): void
}

export function scriptedProvider(script: Script = {}): Scripted {
  const calls: Calls = {
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
  const held = new Map<
    string,
    { original: OriginalAcquisition; lease: EnvironmentLease; open: boolean }
  >()
  const name = script.name ?? 'scripted'
  const generation = script.generation ?? '1'
  const version = script.version ?? 'test-version'
  const keys = script.keys ?? ['command']
  const facilities = script.facilities ?? { command: commandStub(calls) }
  const settlers: {
    resolve: (value: LeaseInvalidation) => void
    reject: (reason: Error) => void
  }[] = []
  const recoverable = script.recoverable
  const provider: Scripted = {
    calls,
    name,
    generation,
    version,
    quotaDomain: script.quotaDomain ?? name,
    bindingKinds: script.bindingKinds ?? ['host_machine'],
    continuity: script.continuity ?? { kind: 'not_guaranteed' },
    facilities: keys,
    isolation: script.isolation ?? [],
    async describe() {
      return {
        provider: name,
        generation,
        version,
        platform: { os: 'test', release: 'test' },
        facilities: keys,
        isolation: script.isolation ?? [],
        prerequisites: 'satisfied',
      }
    },
    async quota(tenant) {
      calls.quota += 1
      if (script.quota !== undefined) return script.quota(tenant)
      return {
        kind: 'declared',
        quota: { unit: 'unsettled-acquisition', perTenant: 100, global: null },
      }
    },
    async inspectAcquisition(original) {
      calls.inspect += 1
      if (script.inspect !== undefined) return script.inspect(original)
      const record = held.get(original.acquisition)
      if (record === undefined) return { kind: 'notAllocated' }
      if (record.original.origin !== original.origin) return { kind: 'conflict' }
      return record.open
        ? { kind: 'acquired', lease: record.lease, evidence: { kind: 'string', value: 'held' } }
        : { kind: 'settled' }
    },
    async listAcquisitions(scopeRef) {
      calls.listAcquisitions += 1
      if (script.listAcquisitions !== undefined) return script.listAcquisitions(scopeRef)
      const acquisitions = [...held.values()]
        .filter(
          record =>
            record.open &&
            (record.original.scope.ref === scopeRef.ref ||
              record.original.retentionScope?.ref === scopeRef.ref),
        )
        .map(record => record.original)
      return { kind: 'listed', acquisitions }
    },
    async settleAcquisition(original) {
      calls.settle += 1
      if (script.settle !== undefined) return script.settle(original)
      const record = held.get(original.acquisition)
      if (record === undefined) return { kind: 'notAllocated' }
      if (record.original.origin !== original.origin) return { kind: 'conflict' }
      if (record.open) {
        const released = await record.lease.release()
        if (released.kind === 'pending') return released
      }
      record.open = false
      return { kind: 'settled' }
    },
    async acquire(input) {
      calls.acquire += 1
      if (script.acquire !== undefined) return script.acquire(input)
      const invalidated = new Promise<LeaseInvalidation>((resolve, reject) => {
        settlers.push({ resolve, reject })
      })
      const lease: EnvironmentLease = {
        placement: {
          ...input.placement,
          binding: script.receiptBinding ?? input.placement.binding,
        },
        instance: { id: `${name}-instance`, generation },
        continuity: input.placement.continuity,
        invalidated,
        facility<F extends FacilityKey>(key: F) {
          return facilities[key]
        },
        async release() {
          calls.release += 1
          const released: LeaseRelease =
            script.release === undefined ? { kind: 'released' } : await script.release()
          const record = held.get(input.acquisition)
          if (record && released.kind === 'released') record.open = false
          return released
        },
      }
      held.set(input.acquisition, {
        original: {
          tenant: input.tenant,
          acquisition: input.acquisition,
          origin: input.origin,
          scope: input.scope,
          placement: input.placement,
          ...(input.retention === undefined ? {} : { retentionScope: input.retention.scope }),
        },
        lease,
        open: true,
      })
      return { kind: 'acquired', lease, evidence: { kind: 'string', value: `${name}-evidence` } }
    },
    async retire() {
      calls.retire += 1
      return script.retire === undefined ? { kind: 'drained' } : script.retire()
    },
    invalidateLeases(value) {
      for (const settler of settlers) settler.resolve(value)
    },
    breakLeases() {
      for (const settler of settlers) settler.reject(new Error('lost'))
    },
  }
  if (recoverable === undefined) return provider
  return {
    ...provider,
    async listRecoveryResources(scopeRef) {
      calls.list += 1
      return recoverable.list(scopeRef)
    },
    async recover(managed) {
      calls.recover += 1
      return recoverable.recover(managed)
    },
  }
}

export function requirement(
  allowedBindings: readonly EnvironmentBinding[],
  facilityKeys: readonly FacilityKey[] = ['command'],
  isolation: readonly IsolationClaim[] = [],
): EnvironmentRequirement {
  return { allowedBindings, facilities: facilityKeys, isolation }
}

export function registryWith(
  providers: readonly EnvironmentProvider[],
  authority: RecoveryAuthority = recovery,
  ports: Readonly<{ authority?: EnvironmentAuthority<string>; bindings?: ScopeBindingSource }> = {},
): EnvironmentRegistry<string> {
  const open = openPorts()
  const registry = createEnvironmentRegistry<string>({
    recovery: authority,
    authority: ports.authority ?? open.authority,
    bindings: ports.bindings ?? open.bindings,
  })
  registry.registerFacility(commandFacility)
  for (const provider of providers) registry.registerProvider(provider)
  return registry
}

export function want(wanted: EnvironmentRequirement, requester: ScopeRef = scope1): PlacementInput {
  return { scope: requester, requirement: wanted }
}

export async function placed(
  registry: EnvironmentRegistry<string>,
  wanted: EnvironmentRequirement,
  access: Access<string> = accessA,
  requester: ScopeRef = scope1,
): Promise<Placement> {
  const placement = await registry.resolvePlacement(access, want(wanted, requester))
  if (placement.kind !== 'placement') throw new Error(`no placement: ${JSON.stringify(placement)}`)
  return placement
}

export function acquireInput(
  placement: Placement,
  key = 'acq-1',
  guard = allow,
  requester: ScopeRef = bindingScope(placement.binding) ?? scope1,
  acquisitionLedger: ResourceLedger = ledger,
) {
  return {
    acquisition: acquisitionRef(key),
    origin: originRef('call-1'),
    scope: requester,
    placement,
    ledger: acquisitionLedger,
    guard,
  }
}

export async function leased(
  registry: EnvironmentRegistry<string>,
  placement: Placement,
  key = 'acq-1',
  guard = allow,
  access: Access<string> = accessA,
  requester: ScopeRef = bindingScope(placement.binding) ?? scope1,
) {
  const acquired = await registry.acquire(access, acquireInput(placement, key, guard, requester))
  if (acquired.kind !== 'acquired') throw new Error(`expected a lease: ${JSON.stringify(acquired)}`)
  return acquired
}

export function startRequest(
  requestId: string,
  binding: EnvironmentBinding = host,
  access: Access<string> = accessA,
): Parameters<CommandFacility<string>['start']>[0] {
  return {
    requestId,
    access,
    origin: originRef('call-1'),
    binding,
    executable: '/bin/true',
    args: [],
    cwd: '/',
    env: {},
    outputMode: 'separate',
  }
}

export function commandOf(lease: EnvironmentLease): CommandFacility<unknown> {
  const command = lease.facility('command')
  if (command === undefined) throw new Error('expected the command facility')
  return command
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

export async function stateOf(
  registry: EnvironmentRegistry<string>,
  access: Access<string>,
  key: string,
) {
  const answer = await registry.inspectAcquisition(access, local(key))
  return answer.kind === 'known' ? answer.state : answer
}
