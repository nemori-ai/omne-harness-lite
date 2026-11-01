// The instance provision through the `./testing` entry: the memory double passes the conformance
// suite of `AgentInstanceProvision`, and a provider that breaks one named rule fails the case of
// that rule. The second part keeps the suite honest: a suite that passes a broken provider would
// prove nothing. The double stands in for the host plugin, so its pass does not prove the host.
import {
  decodeAgentInstanceId,
  type AgentInstanceId,
  type AgentRuntime,
  type Failure,
} from '@omne-harness/agent-contract'
import type { ConformanceCase } from '@omne-harness/agent-contract/testing'
import {
  agentInstanceProvisionConformance,
  createMemoryInstanceProvision,
  type AgentInstanceProvision,
  type AgentInstanceProvisionFixture,
} from '@omne-harness/agent-cordis-contract/testing'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('fixture identity text does not parse')
  return result.value
}

const tenants: Readonly<Record<'a' | 'b', TenantId>> = {
  a: tenant(
    parsed(organizationCodec.parse(`org_${'0'.repeat(26)}`)),
    parsed(accountCodec.parse(`acc_${'1'.repeat(26)}`)),
  ),
  b: tenant(
    parsed(organizationCodec.parse(`org_${'2'.repeat(26)}`)),
    parsed(accountCodec.parse(`acc_${'3'.repeat(26)}`)),
  ),
}

const scope = { owner: 'session', record: 'slot-session', revision: '1', digest: 'sha256:scope' }
const definitions = {
  first: { owner: 'agents', name: 'planner', revision: '1', digest: 'sha256:first' },
  'other-definition': { owner: 'agents', name: 'planner', revision: '2', digest: 'sha256:other' },
} as const

const unknownInstance = (() => {
  const decoded = decodeAgentInstanceId('unknown-instance')
  if (!('ok' in decoded)) throw new Error('fixture identity text does not decode')
  return decoded.ok
})()

function stubRuntime(instance: AgentInstanceId): AgentRuntime<string> {
  return {
    instance,
    invoke: async () => fail({ kind: 'unsupported' }),
    resume: async () => fail({ kind: 'unsupported' }),
  }
}

type Memory = ReturnType<typeof createMemoryInstanceProvision<string>>
type Create = Parameters<typeof createMemoryInstanceProvision<string>>[0]['create']
type Fixture = AgentInstanceProvisionFixture<string> & { readonly memory: Memory }

/**
 * The fixture of the double. `refuse` names the one operation whose next check fails. `provision`
 * wraps the port that the suite sees, so a test can break one rule of the provider.
 */
function memoryFixture(
  options: {
    readonly create?: Create
    readonly provision?: (memory: Memory) => AgentInstanceProvision<string>
  } = {},
): Fixture {
  let refuse: 'reserve' | 'publish' | undefined
  const memory = createMemoryInstanceProvision<string>({
    create: options.create ?? (async (_slot, instance) => succeed(stubRuntime(instance))),
    check(_access, operation) {
      if (refuse !== operation) return succeed(undefined)
      refuse = undefined
      return fail({ kind: 'denied', action: operation })
    },
  })
  const settle = async (instance: AgentInstanceId, idle: boolean) => {
    memory.setIdle(instance, idle)
    await memory.reclaimIdle()
  }
  return {
    memory,
    provision: options.provision?.(memory) ?? memory.provision,
    directory: memory.directory,
    access: who => ({ principal: `principal-${who}`, tenant: tenants[who] }),
    slot: variant => ({ scope, definition: definitions[variant] }),
    idleOut: instance => settle(instance, true),
    busyOut: instance => settle(instance, false),
    live: () => memory.live(),
    denyReserve: () => void (refuse = 'reserve'),
    denyHostPrincipal: () => void (refuse = 'publish'),
  }
}

/** Runs every case of a suite and names the first case that fails. */
async function runAll(cases: readonly ConformanceCase[]): Promise<void> {
  expect(cases.length).toBeGreaterThan(0)
  for (const entry of cases) {
    await entry.run().catch((error: unknown) => {
      throw new Error(`case "${entry.name}" failed`, { cause: error })
    })
  }
}

function caseNamed(cases: readonly ConformanceCase[], fragment: string): ConformanceCase {
  const found = cases.find(entry => entry.name.includes(fragment))
  if (found === undefined) throw new Error(`no case named like ${fragment}`)
  return found
}

/** The cases of the suite, run against the double with its port wrapped by `provision`. */
const casesOver = (provision: (memory: Memory) => AgentInstanceProvision<string>) =>
  agentInstanceProvisionConformance(() => memoryFixture({ provision }))

function failureOf<T>(answer: Outcome<T, Failure>): Failure {
  if (!('failure' in answer)) throw new Error('the answer should be a failure')
  return answer.failure
}

function okOf<T>(answer: Outcome<T, Failure>): T {
  if (!('ok' in answer)) throw new Error(`the answer should succeed: ${JSON.stringify(answer)}`)
  return answer.ok
}

describe('the memory double of the instance provision', () => {
  it('passes every case of the conformance suite', async () => {
    await runAll(agentInstanceProvisionConformance(() => memoryFixture()))
  })
})

describe('the suite fails a provider that breaks a rule', () => {
  // A provider that gives each call its own slot never finds the instance of an earlier call.
  const forgetful = (memory: Memory): AgentInstanceProvision<string> => {
    let calls = 0
    return {
      acquire: input =>
        memory.provision.acquire({
          ...input,
          scope: { ...input.scope, record: `${input.scope.record}-${++calls}` },
        }),
    }
  }

  it('fails a provider that builds again for a slot that already has an instance', async () => {
    const cases = casesOver(forgetful)
    await expect(caseNamed(cases, 'same slot twice').run()).rejects.toThrow()
  })

  it('fails a provider that builds twice for two calls made at the same time', async () => {
    const cases = casesOver(forgetful)
    await expect(caseNamed(cases, 'at the same time').run()).rejects.toThrow()
  })

  it('fails a provider that keeps going after the reserve check refused', async () => {
    const cases = casesOver(memory => ({
      async acquire(input) {
        const first = await memory.provision.acquire(input)
        return 'failure' in first && first.failure.kind === 'denied'
          ? memory.provision.acquire(input)
          : first
      },
    }))
    await expect(caseNamed(cases, 'reserve').run()).rejects.toThrow()
  })

  it('fails a provider that keeps going after the host principal was refused', async () => {
    const cases = casesOver(memory => ({
      async acquire(input) {
        const first = await memory.provision.acquire(input)
        return 'failure' in first && first.failure.kind === 'denied'
          ? memory.provision.acquire(input)
          : first
      },
    }))
    await expect(caseNamed(cases, 'host principal').run()).rejects.toThrow()
  })

  it('fails a provider that gives one tenant the instance of another', async () => {
    const cases = casesOver(memory => ({
      acquire: input => memory.provision.acquire({ ...input, tenant: tenants.a }),
    }))
    await expect(caseNamed(cases, 'another tenant').run()).rejects.toThrow()
  })
})

describe('the memory double', () => {
  it('answers a slot that is not valid with a named failure and builds nothing', async () => {
    const fixture = memoryFixture()
    const access = fixture.access('a')
    const { definition } = fixture.slot('first')
    const named = async (input: Record<string, unknown>) =>
      failureOf(await fixture.provision.acquire(input as never))
    expect(await named({ ...access, scope: { owner: 'x' }, definition })).toMatchObject({
      kind: 'invalid',
      field: 'scope',
    })
    expect(await named({ ...access, scope, definition: 'text' })).toMatchObject({
      kind: 'invalid',
      field: 'definition',
    })
    expect(await named({ ...access, tenant: 'not a tenant', scope, definition })).toMatchObject({
      kind: 'invalid',
      field: 'tenant',
    })
    expect(fixture.live()).toBe(0)
  })

  it('returns the failure of the factory unchanged and keeps nothing', async () => {
    const fixture = memoryFixture({ create: async () => fail({ kind: 'unsupported' }) })
    const slot = { ...fixture.access('a'), ...fixture.slot('first') }
    expect(failureOf(await fixture.provision.acquire(slot))).toEqual({ kind: 'unsupported' })
    expect(fixture.live()).toBe(0)
  })

  it('builds again after a build failed', async () => {
    let calls = 0
    const fixture = memoryFixture({
      create: async (_slot, instance) =>
        ++calls === 1
          ? fail({ kind: 'unavailable', owner: 'factory', diagnostic: 'once' })
          : succeed(stubRuntime(instance)),
    })
    const slot = { ...fixture.access('a'), ...fixture.slot('first') }
    expect(failureOf(await fixture.provision.acquire(slot)).kind).toBe('unavailable')
    okOf(await fixture.provision.acquire(slot))
    expect(fixture.live()).toBe(1)
  })

  it('does not publish when the host principal is refused', async () => {
    const fixture = memoryFixture()
    fixture.denyHostPrincipal()
    const slot = { ...fixture.access('a'), ...fixture.slot('first') }
    expect(failureOf(await fixture.provision.acquire(slot)).kind).toBe('denied')
    expect(fixture.live()).toBe(0)
  })

  it('keeps an idle instance published while the host principal is refused the quiesce', async () => {
    let refuseQuiesce = true
    const memory = createMemoryInstanceProvision<string>({
      create: async (_slot, instance) => succeed(stubRuntime(instance)),
      check: (_access, operation) =>
        operation === 'quiesce' && refuseQuiesce
          ? fail({ kind: 'denied', action: 'quiesce' })
          : succeed(undefined),
    })
    const who = { principal: 'ada', tenant: tenants.a }
    const { instance } = okOf(
      await memory.provision.acquire({ ...who, scope, definition: definitions.first }),
    )
    memory.setIdle(instance, true)
    await memory.reclaimIdle()
    expect(memory.live()).toBe(1)
    refuseQuiesce = false
    await memory.reclaimIdle()
    expect(memory.live()).toBe(0)
  })

  it('serves connect by the tenant rule of resolve and reports no live route', async () => {
    const fixture = memoryFixture()
    const { instance } = okOf(
      await fixture.provision.acquire({ ...fixture.access('a'), ...fixture.slot('first') }),
    )
    expect(await fixture.directory.connect({ ...fixture.access('a'), instance })).toEqual({
      ok: { kind: 'no-live-route' },
    })
    const other = await fixture.directory.connect({ ...fixture.access('b'), instance })
    expect(failureOf(other).kind).toBe('denied')
    const unknown = await fixture.directory.resolve({
      ...fixture.access('a'),
      instance: unknownInstance,
    })
    expect(failureOf(unknown).kind).toBe('denied')
  })

  it('refuses to set the idle state of an instance that it does not know', () => {
    expect(() => memoryFixture().memory.setIdle(unknownInstance, true)).toThrow(/unknown/u)
  })
})
