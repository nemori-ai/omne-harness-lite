// Test doubles shared by the registry tests: tenants, scopes, a ledger, guards and a scripted
// provider whose answers each test chooses. None of them touches machine resources.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  acquisitionRef,
  commandFacility,
  originRef,
  type Access,
  type CommandFacility,
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

export const host: EnvironmentBinding = { kind: 'host_machine' }
export const session: EnvironmentBinding = { kind: 'session_sandbox', scope: scope('scope-1') }

export const ledger: ResourceLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  adopt: async () => 'confirmed',
  stopped: async () => 'recorded',
}

export const allow: FacilityGuard<string> = { authorize: async () => 'authorized' }
export const recovery: RecoveryAuthority = { authorizeRecovery: async () => 'authorized' }

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
}

export function commandStub(calls: Calls): CommandFacility<unknown> {
  return {
    async start(request): Promise<FacilityResult<ProcessHandle>> {
      calls.start += 1
      return { kind: 'unknown', requestId: request.requestId }
    },
  }
}

/** Answers a test may script. Anything not given behaves as a healthy provider. */
export type Script = {
  name?: string
  generation?: string
  bindingKinds?: EnvironmentProvider['bindingKinds']
  continuity?: EnvironmentContinuity
  keys?: readonly FacilityKey[]
  isolation?: readonly IsolationClaim[]
  /** Facilities the lease hands out; defaults to a command stub for `command`. */
  facilities?: Partial<EnvironmentFacilities>
  acquire?: (input: ProviderAcquireInput) => Promise<ProviderAcquisition>
  /** Binding the receipt claims; defaults to the placement's binding. */
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
  /** Settles every lease this provider handed out, as the provider itself would. */
  invalidateLeases(value: LeaseInvalidation): void
  /** Ends every lease's invalidation notice with a rejection. */
  breakLeases(): void
}

export function scriptedProvider(script: Script = {}): Scripted {
  const calls: Calls = { acquire: 0, release: 0, retire: 0, start: 0, list: 0, recover: 0 }
  const name = script.name ?? 'scripted'
  const generation = script.generation ?? '1'
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
    bindingKinds: script.bindingKinds ?? ['host_machine'],
    continuity: script.continuity ?? { kind: 'not_guaranteed' },
    facilities: keys,
    isolation: script.isolation ?? [],
    async describe() {
      return {
        provider: name,
        generation,
        platform: 'test',
        facilities: keys,
        isolation: script.isolation ?? [],
        prerequisites: 'satisfied',
      }
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
          return script.release === undefined ? { kind: 'released' } : script.release()
        },
      }
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

/** A registry with `command` declared and the given providers registered. */
export function registryWith(
  providers: readonly EnvironmentProvider[],
  authority: RecoveryAuthority = recovery,
): EnvironmentRegistry<string> {
  const registry = createEnvironmentRegistry<string>({ recovery: authority })
  registry.registerFacility(commandFacility)
  for (const provider of providers) registry.registerProvider(provider)
  return registry
}

export async function placed(
  registry: EnvironmentRegistry<string>,
  wanted: EnvironmentRequirement,
  access: Access<string> = accessA,
): Promise<Placement> {
  const placement = await registry.resolvePlacement(access, wanted)
  if (placement.kind !== 'placement') throw new Error(`no placement: ${placement.reason}`)
  return placement
}

export function acquireInput(placement: Placement, key = 'acq-1', guard = allow) {
  return { acquisition: acquisitionRef(key), origin: originRef('call-1'), placement, ledger, guard }
}

export async function leased(
  registry: EnvironmentRegistry<string>,
  placement: Placement,
  key = 'acq-1',
  guard = allow,
  access: Access<string> = accessA,
) {
  const acquired = await registry.acquire(access, acquireInput(placement, key, guard))
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

/** A promise with its settle functions, for interleavings a test controls. */
export function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}
