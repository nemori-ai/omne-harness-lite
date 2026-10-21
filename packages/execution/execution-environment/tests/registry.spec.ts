import { expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  acquisitionRef,
  commandFacility,
  createRecoveryAccess,
  filesFacility,
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
  type LeaseInvalidation,
  type Placement,
  type ProcessHandle,
  type RecoveryAuthority,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import {
  createEnvironmentRegistry,
  type EnvironmentRegistry,
} from '@omne-harness/execution-environment'

function tenantFrom(organization: string, account: string): TenantId {
  const parsed = tenantCodec.parse(JSON.stringify({ organization, account }))
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
}

const tenantA = tenantFrom('org_0123456789abcdefghjkmnpqrs', 'acc_0123456789abcdefghjkmnpqrs')
const tenantB = tenantFrom('org_0123456789abcdefghjkmnpqrt', 'acc_0123456789abcdefghjkmnpqrt')
const accessA: Access<string> = { principal: 'subject-a', tenant: tenantA }
const accessB: Access<string> = { principal: 'subject-b', tenant: tenantB }

function isScopeText(text: string): text is ScopeRef['ref'] {
  return text.length > 0
}

function scope(text: string): ScopeRef {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

const ledger: ResourceLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  permit: async () => 'confirmed',
  adopt: async () => 'confirmed',
  stopped: async () => 'recorded',
}

const allow: FacilityGuard<string> = { authorize: async () => 'authorized' }
const recovery: RecoveryAuthority = { authorizeRecovery: async () => 'authorized' }

type Calls = { acquire: number; retire: number; start: number }

function commandStub(calls: Calls): CommandFacility<unknown> {
  return {
    async start(request): Promise<FacilityResult<ProcessHandle>> {
      calls.start += 1
      return { kind: 'unknown', requestId: request.requestId }
    },
  }
}

function stubProvider(options: {
  name: string
  bindingKinds: EnvironmentProvider['bindingKinds']
  continuity: EnvironmentContinuity
  facilities: Partial<EnvironmentFacilities>
  keys: readonly FacilityKey[]
}): EnvironmentProvider & { readonly calls: Calls } {
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  let retired: (value: LeaseInvalidation) => void = () => undefined
  const invalidated = new Promise<LeaseInvalidation>(resolve => {
    retired = resolve
  })
  return {
    calls,
    name: options.name,
    generation: '1',
    bindingKinds: options.bindingKinds,
    continuity: options.continuity,
    facilities: options.keys,
    isolation: [],
    async describe() {
      return {
        provider: options.name,
        generation: '1',
        platform: 'test',
        facilities: options.keys,
        isolation: [],
        prerequisites: 'satisfied',
      }
    },
    async acquire(input) {
      calls.acquire += 1
      const lease: EnvironmentLease = {
        placement: input.placement,
        instance: { id: options.name, generation: '1' },
        continuity: input.placement.continuity,
        invalidated,
        facility<F extends FacilityKey>(key: F) {
          return options.facilities[key]
        },
        async release() {
          return { kind: 'released' }
        },
      }
      return { kind: 'acquired', lease, evidence: { kind: 'null' } }
    },
    async retire() {
      calls.retire += 1
      retired({ source: 'provider', reason: 'retired' })
      return { kind: 'drained' }
    },
  }
}

function requirement(
  allowedBindings: readonly EnvironmentBinding[],
  facilities: readonly FacilityKey[],
): EnvironmentRequirement {
  return { allowedBindings, facilities, isolation: [] }
}

async function placed(
  registry: EnvironmentRegistry<string>,
  wanted: EnvironmentRequirement,
): Promise<Placement> {
  const placement = await registry.resolvePlacement(accessA, wanted)
  if (placement.kind !== 'placement') throw new Error(`no placement: ${placement.reason}`)
  return placement
}

const host: EnvironmentBinding = { kind: 'host_machine' }
const session: EnvironmentBinding = { kind: 'session_sandbox', scope: scope('scope-1') }

function acquireInput(placement: Placement, key = 'acq-1', guard = allow) {
  return { acquisition: acquisitionRef(key), origin: originRef('call-1'), placement, ledger, guard }
}

it('refuses a facility the provider lacks and keeps the host binding for the facility it has', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  registry.registerFacility(filesFacility)
  registry.registerFacility(commandFacility)
  registry.registerProvider(
    stubProvider({
      name: 'host-command',
      bindingKinds: ['host_machine'],
      continuity: { kind: 'not_guaranteed' },
      facilities: { command: commandStub(calls) },
      keys: ['command'],
    }),
  )
  const missing = await registry.resolvePlacement(accessA, requirement([host], ['files']))
  expect(missing).toEqual({ kind: 'rejected', reason: 'missingFacility' })

  const placement = await placed(registry, requirement([host], ['command']))
  const acquired = await registry.acquire(accessA, acquireInput(placement))
  expect(acquired.kind).toBe('acquired')
  if (acquired.kind !== 'acquired') return
  expect(acquired.lease.placement.binding).toEqual({ kind: 'host_machine' })
  expect(acquired.lease.continuity).toEqual({ kind: 'not_guaranteed' })
  expect(acquired.lease.facility('files')).toBeUndefined()
  expect(acquired.lease.facility('command')).toBeDefined()
})

it('refuses a layer with no provider, and refuses again after the provider is removed', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  registry.registerFacility(commandFacility)
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  const provider = stubProvider({
    name: 'host-command',
    bindingKinds: ['host_machine'],
    continuity: { kind: 'not_guaranteed' },
    facilities: { command: commandStub(calls) },
    keys: ['command'],
  })
  const remove = registry.registerProvider(provider)
  const sandbox = await registry.resolvePlacement(
    accessA,
    requirement(
      [{ kind: 'stateless_sandbox', scope: scope('scope-1'), origin: originRef('call-1') }],
      ['command'],
    ),
  )
  expect(sandbox).toEqual({ kind: 'rejected', reason: 'noMatchingEnvironment' })

  const placement = await placed(registry, requirement([host], ['command']))
  const acquired = await registry.acquire(accessA, acquireInput(placement))
  if (acquired.kind !== 'acquired') throw new Error('expected a lease')

  await remove()
  expect(provider.calls.retire).toBe(1)
  await expect(acquired.lease.invalidated).resolves.toEqual({
    source: 'registry',
    reason: 'providerRetired',
  })
  const after = await registry.resolvePlacement(accessA, requirement([host], ['command']))
  expect(after).toEqual({ kind: 'rejected', reason: 'noMatchingEnvironment' })
  expect(await registry.acquire(accessA, acquireInput(placement, 'acq-2'))).toEqual({
    kind: 'rejected',
    reason: 'providerUnavailable',
  })
})

it('uses the matched provider continuity for a session sandbox placement and lease', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  registry.registerFacility(commandFacility)
  const continuity: EnvironmentContinuity = { kind: 'continuous', data: 'data-1', revision: '3' }
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  registry.registerProvider(
    stubProvider({
      name: 'session-command',
      bindingKinds: ['session_sandbox'],
      continuity,
      facilities: { command: commandStub(calls) },
      keys: ['command'],
    }),
  )
  const placement = await placed(registry, requirement([session], ['command']))
  expect(placement).toMatchObject({ kind: 'placement', binding: session, continuity })
  const acquired = await registry.acquire(accessA, acquireInput(placement))
  expect(acquired).toMatchObject({ kind: 'acquired', lease: { continuity } })
})

it('uses the same provider continuity for placement and lease when two providers share a layer', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  registry.registerFacility(filesFacility)
  registry.registerFacility(commandFacility)
  const filesContinuity: EnvironmentContinuity = {
    kind: 'continuous',
    data: 'files-data',
    revision: '1',
  }
  const commandContinuity: EnvironmentContinuity = {
    kind: 'continuous',
    data: 'command-data',
    revision: '9',
  }
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  registry.registerProvider(
    stubProvider({
      name: 'session-files',
      bindingKinds: ['session_sandbox'],
      continuity: filesContinuity,
      facilities: {},
      keys: ['files'],
    }),
  )
  registry.registerProvider(
    stubProvider({
      name: 'session-command',
      bindingKinds: ['session_sandbox'],
      continuity: commandContinuity,
      facilities: { command: commandStub(calls) },
      keys: ['command'],
    }),
  )
  const placement = await placed(registry, requirement([session], ['command']))
  const acquired = await registry.acquire(accessA, acquireInput(placement))
  expect(placement).toMatchObject({ binding: session, continuity: commandContinuity })
  expect(acquired).toMatchObject({ kind: 'acquired', lease: { continuity: commandContinuity } })
})

it('returns the same acquisition for a repeated key and does not allocate again', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  registry.registerFacility(commandFacility)
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  const provider = stubProvider({
    name: 'host-command',
    bindingKinds: ['host_machine'],
    continuity: { kind: 'not_guaranteed' },
    facilities: { command: commandStub(calls) },
    keys: ['command'],
  })
  registry.registerProvider(provider)
  const placement = await placed(registry, requirement([host], ['command']))
  const [first, concurrent] = await Promise.all([
    registry.acquire(accessA, acquireInput(placement)),
    registry.acquire(accessA, acquireInput(placement)),
  ])
  const again = await registry.acquire(accessA, acquireInput(placement))
  expect(provider.calls.acquire).toBe(1)
  expect(first.kind).toBe('acquired')
  expect(concurrent).toEqual({ kind: 'pending', state: { kind: 'acquiring' } })
  if (first.kind !== 'acquired' || again.kind !== 'acquired') throw new Error('expected leases')
  expect(again.lease).toBe(first.lease)
  expect(again.adoption).toBe(first.adoption)
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual({
    kind: 'acquired',
    adoption: first.adoption,
  })
})

it('does not show an acquisition to another tenant that reuses its key', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  registry.registerFacility(commandFacility)
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  const provider = stubProvider({
    name: 'host-command',
    bindingKinds: ['host_machine'],
    continuity: { kind: 'not_guaranteed' },
    facilities: { command: commandStub(calls) },
    keys: ['command'],
  })
  registry.registerProvider(provider)
  const placement = await placed(registry, requirement([host], ['command']))
  const first = await registry.acquire(accessA, acquireInput(placement))
  expect(await registry.inspectAcquisition(accessB, acquisitionRef('acq-1'))).toEqual({
    kind: 'unrecorded',
  })
  const second = await registry.acquire(accessB, acquireInput(placement))
  expect(provider.calls.acquire).toBe(2)
  if (first.kind !== 'acquired' || second.kind !== 'acquired') throw new Error('expected leases')
  expect(second.lease).not.toBe(first.lease)
  expect(await registry.inspectAcquisition(accessA, acquisitionRef('acq-1'))).toEqual({
    kind: 'acquired',
    adoption: first.adoption,
  })
})

it('refuses the same key with a different placement as a parameter conflict', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  registry.registerFacility(commandFacility)
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  const provider = stubProvider({
    name: 'both-layers',
    bindingKinds: ['host_machine', 'session_sandbox'],
    continuity: { kind: 'not_guaranteed' },
    facilities: { command: commandStub(calls) },
    keys: ['command'],
  })
  registry.registerProvider(provider)
  const onHost = await placed(registry, requirement([host], ['command']))
  const inSandbox = await placed(
    registry,
    requirement([{ kind: 'session_sandbox', scope: scope('scope-1') }], ['command']),
  )
  const first = await registry.acquire(accessA, acquireInput(onHost))
  expect(first.kind).toBe('acquired')
  expect(await registry.acquire(accessA, acquireInput(inSandbox))).toEqual({
    kind: 'rejected',
    reason: 'invalidInput',
  })
  expect(provider.calls.acquire).toBe(1)
})

it('refuses placement as ambiguous when two providers of one layer both qualify', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  registry.registerFacility(commandFacility)
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  for (const name of ['host-command-a', 'host-command-b'])
    registry.registerProvider(
      stubProvider({
        name,
        bindingKinds: ['host_machine'],
        continuity: { kind: 'not_guaranteed' },
        facilities: { command: commandStub(calls) },
        keys: ['command'],
      }),
    )
  expect(await registry.resolvePlacement(accessA, requirement([host], ['command']))).toEqual({
    kind: 'rejected',
    reason: 'ambiguousEnvironment',
  })
})

it('refuses a facility key whose descriptor is not registered, even when the provider declares it', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  const provider = stubProvider({
    name: 'host-command',
    bindingKinds: ['host_machine'],
    continuity: { kind: 'not_guaranteed' },
    facilities: { command: commandStub(calls) },
    keys: ['command'],
  })
  registry.registerProvider(provider)
  expect(await registry.resolvePlacement(accessA, requirement([host], ['command']))).toEqual({
    kind: 'rejected',
    reason: 'missingFacility',
  })

  const removeDeclaration = registry.registerFacility(commandFacility)
  const placement = await placed(registry, requirement([host], ['command']))
  await removeDeclaration()
  expect(await registry.acquire(accessA, acquireInput(placement))).toEqual({
    kind: 'rejected',
    reason: 'unsupportedFacility',
  })
  expect(provider.calls.acquire).toBe(0)
})

it('asks the guard before a guarded operation and does not call the facility when refused', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  registry.registerFacility(commandFacility)
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  registry.registerProvider(
    stubProvider({
      name: 'host-command',
      bindingKinds: ['host_machine'],
      continuity: { kind: 'not_guaranteed' },
      facilities: { command: commandStub(calls) },
      keys: ['command'],
    }),
  )
  const asked: string[] = []
  let decision: 'authorized' | 'notAuthorized' | 'unavailable' = 'notAuthorized'
  const guard: FacilityGuard<string> = {
    async authorize(facility, operation) {
      asked.push(`${facility}.${operation}`)
      return decision
    },
  }
  const placement = await placed(registry, requirement([host], ['command']))
  const acquired = await registry.acquire(accessA, acquireInput(placement, 'acq-1', guard))
  if (acquired.kind !== 'acquired') throw new Error('expected a lease')
  const command = acquired.lease.facility('command')
  if (command === undefined) throw new Error('expected the command facility')
  const request: Parameters<CommandFacility<string>['start']>[0] = {
    requestId: 'start-1',
    access: accessA,
    origin: originRef('call-1'),
    binding: host,
    executable: '/bin/true',
    args: [],
    cwd: '/',
    env: {},
    outputMode: 'separate',
  }
  expect(await command.start(request)).toEqual({
    kind: 'rejected',
    requestId: 'start-1',
    reason: 'notAuthorized',
  })
  decision = 'unavailable'
  expect(await command.start(request)).toEqual({
    kind: 'rejected',
    requestId: 'start-1',
    reason: 'unavailable',
  })
  expect(calls.start).toBe(0)
  decision = 'authorized'
  expect(await command.start(request)).toEqual({ kind: 'unknown', requestId: 'start-1' })
  expect(calls.start).toBe(1)
  expect(asked).toEqual(['command.start', 'command.start', 'command.start'])

  const foreign = await command.start({ ...request, requestId: 'start-2', access: accessB })
  expect(foreign).toEqual({ kind: 'rejected', requestId: 'start-2', reason: 'notAuthorized' })
  expect(calls.start).toBe(1)
})

it('releases a scope only with recovery authorization, then refuses new acquisitions there', async () => {
  let answer: 'authorized' | 'notAuthorized' | 'unavailable' = 'notAuthorized'
  const registry = createEnvironmentRegistry<string>({
    recovery: { authorizeRecovery: async () => answer },
  })
  registry.registerFacility(commandFacility)
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  registry.registerProvider(
    stubProvider({
      name: 'session-command',
      bindingKinds: ['session_sandbox'],
      continuity: { kind: 'not_guaranteed' },
      facilities: { command: commandStub(calls) },
      keys: ['command'],
    }),
  )
  const placement = await placed(registry, requirement([session], ['command']))
  const acquired = await registry.acquire(accessA, acquireInput(placement))
  if (acquired.kind !== 'acquired') throw new Error('expected a lease')
  const recoveryAccess = createRecoveryAccess()

  expect(await registry.releaseScope(scope('scope-1'), recoveryAccess)).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await registry.acquire(accessA, acquireInput(placement, 'acq-2'))).toMatchObject({
    kind: 'acquired',
  })

  answer = 'authorized'
  const released = await registry.releaseScope(scope('scope-1'), recoveryAccess)
  expect(released).toEqual({
    kind: 'recovered',
    scope: scope('scope-1'),
    stopped: [],
    pending: [],
    unsupported: [{ kind: 'provider', provider: { name: 'session-command', generation: '1' } }],
    unavailable: [],
  })
  await expect(acquired.lease.invalidated).resolves.toEqual({
    source: 'registry',
    reason: 'scopeReleased',
  })
  expect(await registry.acquire(accessA, acquireInput(placement, 'acq-3'))).toEqual({
    kind: 'rejected',
    reason: 'referenceExpired',
  })
})

it('closes by refusing new acquisitions, invalidating leases and retiring providers', async () => {
  const registry = createEnvironmentRegistry<string>({ recovery })
  registry.registerFacility(commandFacility)
  const calls: Calls = { acquire: 0, retire: 0, start: 0 }
  const provider = stubProvider({
    name: 'host-command',
    bindingKinds: ['host_machine'],
    continuity: { kind: 'not_guaranteed' },
    facilities: { command: commandStub(calls) },
    keys: ['command'],
  })
  registry.registerProvider(provider)
  const placement = await placed(registry, requirement([host], ['command']))
  const acquired = await registry.acquire(accessA, acquireInput(placement))
  if (acquired.kind !== 'acquired') throw new Error('expected a lease')

  expect(await registry.close()).toEqual({ kind: 'drained' })
  expect(provider.calls.retire).toBe(1)
  await expect(acquired.lease.invalidated).resolves.toEqual({
    source: 'registry',
    reason: 'registryClosed',
  })
  expect(await registry.acquire(accessA, acquireInput(placement, 'acq-2'))).toEqual({
    kind: 'rejected',
    reason: 'ownerStopped',
  })
  const command = acquired.lease.facility('command')
  if (command === undefined) throw new Error('expected the command facility')
  const late = await command.start({
    requestId: 'late',
    access: accessA,
    origin: originRef('call-1'),
    binding: host,
    executable: '/bin/true',
    args: [],
    cwd: '/',
    env: {},
    outputMode: 'separate',
  })
  expect(late).toEqual({ kind: 'rejected', requestId: 'late', reason: 'closed' })
  expect(calls.start).toBe(0)
})
