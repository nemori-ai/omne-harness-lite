// C2 of #509: every public operation of the four faces checks the tenant of its Access against the
// binding, then calls access.check exactly once, and only `allowed` reaches the operation body.
// Apart from invoke (#510), the bodies are not implemented yet: after `allowed` each returns a named
// `unavailable`. That is a stage-temporary answer, not a contract result; the tests that pin it say so.
import { describe, expect, it } from 'vitest'
import type { AgentProvider } from '@omne-harness/agent'
import { createTestAgentDependencies } from '@omne-harness/agent/testing'
import type {
  Access,
  AgentAccessDecision,
  AgentAccessOperation,
  AgentAccessTarget,
  AgentObservation,
  Failure,
  Reply,
} from '@omne-harness/agent-contract'
import { createdProvider, take, watched } from './factory-support.ts'
import {
  acceptedInput,
  attachment,
  evidence,
  execution,
  failure,
  instance,
  operation,
  otherTenant,
  tenantA,
  type Principal,
} from './journal-support.ts'

const alice: Access<Principal> = { principal: 'alice', tenant: tenantA }
const mutation = { execution: execution(), operation: operation('op-1') }

type Operation = Readonly<{
  name: AgentAccessOperation
  target: AgentAccessTarget
  call: (provider: AgentProvider<Principal>, access: Access<Principal>) => Reply<unknown>
}>

const onInstance: AgentAccessTarget = { kind: 'instance', instance: instance() }
const onExecution: AgentAccessTarget = { kind: 'execution', execution: execution() }

/** Every public operation of the four faces that answers with a Reply. */
const operations: readonly Operation[] = [
  {
    name: 'invoke',
    target: onInstance,
    call: (provider, access) =>
      provider.runtime.invoke({
        ...access,
        ...mutation,
        initial: acceptedInput('input-1'),
        grant: null,
      }),
  },
  {
    name: 'resume',
    target: onExecution,
    call: (provider, access) =>
      provider.runtime.resume({
        ...access,
        ...mutation,
        recovery: evidence('recovery'),
        grant: null,
      }),
  },
  {
    name: 'query',
    target: onExecution,
    call: (provider, access) => provider.recovery.query({ ...access, ...mutation }),
  },
  {
    name: 'load',
    target: onExecution,
    call: (provider, access) => provider.recovery.load({ ...access, execution: execution() }),
  },
  {
    name: 'reconcile',
    target: onExecution,
    call: (provider, access) => provider.recovery.reconcile({ ...access, ...mutation }),
  },
  {
    name: 'detach',
    target: onExecution,
    call: (provider, access) =>
      provider.recovery.detach({
        ...access,
        ...mutation,
        authority: {
          execution: execution(),
          executionAttachment: attachment(),
          instance: instance(),
          generation: '1',
          source: evidence('authority'),
        },
        reason: evidence('reason'),
      }),
  },
  {
    name: 'quiesce',
    target: onInstance,
    call: (provider, access) =>
      provider.control.quiesce({
        ...access,
        operation: operation('op-q'),
        reason: evidence('retire'),
      }),
  },
]

/** A provider over the test assembly whose every dependency call is logged. */
async function setup() {
  const assembly = createTestAgentDependencies<Principal>()
  const { dependencies, calls } = watched(assembly.dependencies)
  const provider = await createdProvider(dependencies)
  return { provider, calls, check: assembly.controls.access.check }
}

/** An Access without a tenant, as an untyped caller could send it. */
const withoutTenant = { principal: 'alice' } as unknown as Access<Principal>

/** Tenants that legal-identity did not mint: a copy of a minted one and a plain string. */
const malformedTenants: readonly [string, Access<Principal>][] = [
  ['a copy of a minted tenant', { principal: 'alice', tenant: { ...tenantA } }],
  ['a string', { principal: 'alice', tenant: 'tenant-a' as unknown as typeof tenantA }],
]

/** Answers of the check that are not one of the three decisions, as a provider could send them. */
const strayDecisions: readonly [string, unknown][] = [
  ['undefined', undefined],
  ['null', null],
  ['a string', 'allowed'],
  ['an unknown kind', { kind: 'granted' }],
  ['unavailable without diagnostic', { kind: 'unavailable' }],
]

/** Scripts the check to answer a value outside its type. */
const strayAnswer = (value: unknown) => () => value as AgentAccessDecision

describe.each(operations)('C2 $name', ({ name, target, call }) => {
  it('another tenant is denied before access.check', async () => {
    const { provider, calls } = await setup()
    expect(failure(await call(provider, otherTenant)).kind).toBe('denied')
    expect(calls).toEqual([])
  })

  it('an Access without tenant is invalid before access.check', async () => {
    const { provider, calls } = await setup()
    expect(failure(await call(provider, withoutTenant))).toMatchObject({
      kind: 'invalid',
      field: 'tenant',
    })
    expect(calls).toEqual([])
  })

  it.each(malformedTenants)(
    'an Access whose tenant is %s is invalid before access.check',
    async (_, access) => {
      const { provider, calls } = await setup()
      expect(failure(await call(provider, access))).toEqual({
        kind: 'invalid',
        field: 'tenant',
        reason: 'type',
      })
      expect(calls).toEqual([])
    },
  )

  it.each(strayDecisions)(
    'a check that answers %s returns unavailable and does not pass',
    async (_, answer) => {
      const { provider, calls, check } = await setup()
      check.always(strayAnswer(answer))
      expect(failure(await call(provider, alice))).toMatchObject({
        kind: 'unavailable',
        owner: 'agentAccessCheck',
      })
      expect(calls).toEqual(['access.check'])
    },
  )

  it('check denied returns denied', async () => {
    const { provider, calls, check } = await setup()
    check.always(() => ({ kind: 'denied' }))
    expect(failure(await call(provider, alice))).toEqual({ kind: 'denied', action: name })
    expect(calls).toEqual(['access.check'])
  })

  it('check unavailable returns unavailable and does not pass', async () => {
    const { provider, calls, check } = await setup()
    check.always(() => ({ kind: 'unavailable', diagnostic: 'authorization offline' }))
    expect(failure(await call(provider, alice))).toEqual({
      kind: 'unavailable',
      owner: 'agentAccessCheck',
      diagnostic: 'authorization offline',
    })
    expect(calls).toEqual(['access.check'])
  })

  it('a check that rejects returns unavailable and does not pass', async () => {
    const { provider, calls, check } = await setup()
    check.always(() => Promise.reject(new Error('boom')))
    expect(failure(await call(provider, alice))).toMatchObject({
      kind: 'unavailable',
      owner: 'agentAccessCheck',
    })
    expect(calls).toEqual(['access.check'])
  })

  it('checks the principal once with the operation name and its target', async () => {
    const { provider, check } = await setup()
    await call(provider, alice)
    expect(check.calls).toEqual([{ access: alice, operation: name, target }])
  })

  it('does not cache allowed: two calls check twice', async () => {
    const { provider, check } = await setup()
    await call(provider, alice)
    check.always(() => ({ kind: 'denied' }))
    expect(failure(await call(provider, alice)).kind).toBe('denied')
    expect(check.calls).toHaveLength(2)
  })
})

// invoke has its body since #510; its allowed path is in loop-invoke.spec.ts and just below.
const bodiless = operations.filter(entry => entry.name !== 'invoke')

describe.each(bodiless)('C2 $name', ({ name, call }) => {
  it('stage-temporary (#502): allowed reaches a body that answers a named unavailable and writes nothing', async () => {
    const { provider, calls } = await setup()
    const result: Failure = failure(await call(provider, alice))
    expect(result).toMatchObject({ kind: 'unavailable', owner: '@omne-harness/agent' })
    expect(result.kind === 'unavailable' && result.diagnostic).toMatch(
      new RegExp(`^${name} is not implemented until #502 stage \\d`, 'u'),
    )
    expect(calls).toEqual(['access.check'])
  })
})

describe('C2 invoke after allowed', () => {
  it('resolves the bound definition first; without an adoption it answers that unavailable and opens nothing', async () => {
    const { provider, calls } = await setup()
    const invoked = await provider.runtime.invoke({
      ...alice,
      ...mutation,
      initial: acceptedInput('input-1'),
      grant: null,
    })
    expect(failure(invoked)).toMatchObject({ kind: 'unavailable', owner: 'agentAdoptions' })
    expect(calls).toEqual(['access.check', 'adoptions.resolve'])
  })
})

describe('C2 observe', () => {
  const observe = (
    provider: AgentProvider<Principal>,
    access: Access<Principal>,
    signal = new AbortController().signal,
  ) => provider.observation.observe({ ...access, signal })

  const ended = (reason: Extract<AgentObservation, { kind: 'ended' }>['reason']) => ({
    kind: 'ended',
    reason,
  })

  it('another tenant ends with denied before access.check', async () => {
    const { provider, calls } = await setup()
    expect(await take(observe(provider, otherTenant), 5)).toEqual([ended('denied')])
    expect(calls).toEqual([])
  })

  it('check denied ends with denied', async () => {
    const { provider, calls, check } = await setup()
    check.always(() => ({ kind: 'denied' }))
    expect(await take(observe(provider, alice), 5)).toEqual([ended('denied')])
    expect(calls).toEqual(['access.check'])
  })

  it('check unavailable ends with unavailable', async () => {
    const { provider, calls, check } = await setup()
    check.always(() => ({ kind: 'unavailable', diagnostic: 'authorization offline' }))
    expect(await take(observe(provider, alice), 5)).toEqual([ended('unavailable')])
    expect(calls).toEqual(['access.check'])
  })

  it('a check that rejects ends with unavailable', async () => {
    const { provider, check } = await setup()
    check.always(() => Promise.reject(new Error('boom')))
    expect(await take(observe(provider, alice), 5)).toEqual([ended('unavailable')])
  })

  it.each(strayDecisions)('a check that answers %s ends with unavailable', async (_, answer) => {
    const { provider, calls, check } = await setup()
    check.always(strayAnswer(answer))
    expect(await take(observe(provider, alice), 5)).toEqual([ended('unavailable')])
    expect(calls).toEqual(['access.check'])
  })

  // 待拥有者: as for a missing tenant, the contract gives no `invalid` end reason. The guard answers
  // invalid, and the observation ends as `denied`, fail closed, without access.check.
  it.each(malformedTenants)(
    '待拥有者: an Access whose tenant is %s ends with denied before access.check',
    async (_, access) => {
      const { provider, calls } = await setup()
      expect(await take(observe(provider, access), 5)).toEqual([ended('denied')])
      expect(calls).toEqual([])
    },
  )

  it('allowed shows idle, and the signal closes the observation', async () => {
    const { provider, calls, check } = await setup()
    const controller = new AbortController()
    const sequence = observe(provider, alice, controller.signal)[Symbol.asyncIterator]()
    expect((await sequence.next()).value).toEqual({
      kind: 'state',
      value: { kind: 'idle', instance: instance() },
    })
    const next = sequence.next()
    controller.abort()
    expect((await next).value).toEqual(ended('closed'))
    expect((await sequence.next()).done).toBe(true)
    expect(check.calls).toEqual([{ access: alice, operation: 'observe', target: onInstance }])
    expect(calls).toEqual(['access.check'])
  })

  it('an aborted signal closes without a state', async () => {
    const { provider } = await setup()
    const controller = new AbortController()
    controller.abort()
    expect(await take(observe(provider, alice, controller.signal), 5)).toEqual([ended('closed')])
  })

  it('does not cache allowed: each observation checks once', async () => {
    const { provider, check } = await setup()
    await take(observe(provider, alice), 1)
    check.always(() => ({ kind: 'denied' }))
    expect(await take(observe(provider, alice), 5)).toEqual([ended('denied')])
    expect(check.calls).toHaveLength(2)
  })

  // 待拥有者: AgentObservation has no `invalid` reason, so the contract gives no channel for an
  // Access without tenant. The test pins only what holds whatever the owner decides: the sequence
  // ends, shows no state and never reaches access.check. The ended reason is not asserted.
  it('待拥有者: an Access without tenant ends without a state and without access.check', async () => {
    const { provider, calls } = await setup()
    const seen = await take(observe(provider, withoutTenant), 5)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.kind).toBe('ended')
    expect(calls).toEqual([])
  })
})
