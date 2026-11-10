import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  acquisitionRef,
  commandFacility,
  originRef,
  terminalFacility,
  type ProviderAcquireInput,
  type FacilityResult,
  type ManagedResource,
} from '@omne-harness/execution-environment-contract'
import { createMemoryResourceLedger } from '@omne-harness/execution-environment-contract/testing'
import { createEnvironmentRegistry } from '@omne-harness/execution-environment'
import { createHostFilesDomain } from '../src/host-domain.ts'
import { createHostFilesProvider } from '../src/host-provider.ts'
import { commandFixture } from './windows-execution/fixture.ts'

export function scope(ref: string) {
  const decoded = decodeScopeRef({ ref })
  if (!('ok' in decoded)) throw new Error('scope fixture')
  return decoded.ok
}
export function value<T>(answer: FacilityResult<T>): T {
  if (answer.kind !== 'done') throw new Error(JSON.stringify(answer))
  return answer.value
}
export async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-win-provider-')))
  const identity = commandFixture(root).request
  const domain = createHostFilesDomain()
  const provider = createHostFilesProvider({
    domain,
    stateDirectory: root,
    command: { startBoundMs: 20_000 },
    terminal: { startBoundMs: 20_000 },
  })
  const plans: ManagedResource[] = []
  let recordStops = true
  function ledger() {
    const memory = createMemoryResourceLedger().ledger
    return {
      ...memory,
      async plan(resource: ManagedResource) {
        plans.push(resource)
        return memory.plan(resource)
      },
      stopped: (...args: Parameters<typeof memory.stopped>) =>
        recordStops ? memory.stopped(...args) : Promise.resolve('unavailable' as const),
    }
  }
  const retention = {
    scope: scope(randomUUID()),
    ledger: ledger(),
    released: new AbortController().signal,
  }
  const registry = createEnvironmentRegistry<unknown>({
    recovery: { authorizeRecovery: async () => 'authorized' },
    authority: {
      authorize: async caller => ({
        kind: 'authorized',
        principal: caller.principal,
        current: () => true,
      }),
    },
    bindings: { lookup: async () => ({ kind: 'bound', tenant: identity.access.tenant }) },
  })
  registry.registerFacility(commandFacility)
  registry.registerFacility(terminalFacility)
  registry.registerProvider(provider)
  /** A session with a process ledger is the acquisition's own scope, so its residue is retained. */
  async function acquire(
    session: NonNullable<ProviderAcquireInput['retention']> = retention,
    tenant = identity.access.tenant,
    throughRegistry = false,
  ) {
    const id = randomUUID()
    const input: ProviderAcquireInput = {
      acquisition: acquisitionRef(id),
      origin: originRef(id),
      tenant,
      scope: session.processes === undefined ? scope(id) : session.scope,
      ledger: ledger(),
      retention: session,
      placement: {
        kind: 'placement',
        provider,
        quotaDomain: provider.quotaDomain,
        binding: identity.binding,
        continuity: provider.continuity,
        requirement: {
          allowedBindings: [identity.binding],
          facilities: ['command', 'terminal'],
          isolation: [],
        },
      },
    }
    const access = { ...identity.access, tenant }
    const answer = await (async () => {
      if (!throughRegistry) return provider.acquire(input)
      expect((await provider.describe()).prerequisites).toBe('satisfied')
      const placement = await registry.resolvePlacement(access, {
        scope: input.scope,
        requirement: input.placement.requirement,
      })
      if (placement.kind !== 'placement') throw new Error(JSON.stringify(placement))
      expect(placement.provider.generation).toBe(provider.generation)
      return registry.acquire(access, {
        ...input,
        placement,
        guard: { authorize: async () => 'authorized' },
      })
    })()
    if (answer.kind !== 'acquired') throw new Error(JSON.stringify(answer))
    const terminal = answer.lease.facility('terminal')
    const command = answer.lease.facility('command')
    if (!terminal || !command) throw new Error('missing facilities')
    const call = {
      requestId: randomUUID(),
      access: { ...identity.access, tenant },
      origin: input.origin,
      binding: identity.binding,
    }
    return { lease: answer.lease, terminal, command, input, call }
  }
  return {
    root,
    identity,
    domain,
    provider,
    acquire,
    retention,
    plans,
    recordStops(value: boolean) {
      recordStops = value
    },
    async cleanup() {
      expect(await provider.retire()).toEqual({ kind: 'drained' })
      await rm(root, { recursive: true, force: true })
    },
  }
}
