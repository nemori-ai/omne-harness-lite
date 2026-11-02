// The `agentAccountOutlet` plugin on real Cordis 4.0.4, with the real request-context provider
// as the one that provides `requestContext` and `contextAccountingInbox`. Only the trust object
// and the memory sources are doubles.
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { sampleAccountHandoff } from '@omne-harness/agent-contract/testing'
import { agentAccountOutletKey } from '@omne-harness/agent-cordis-contract/cordis'
import { AgentAccountOutletProvider } from '@omne-harness/agent-context/cordis'
import { RequestContextProvider } from '@omne-harness/request-context-cordis/cordis'
import {
  RequestContextTrustService,
  contextAccountingInboxKey,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { createScriptedRequestContextTrust } from '@omne-harness/request-context-cordis-contract/testing'
import {
  createAssemblyFixture,
  createMemoryAdoptedSource,
  createMemoryReadEligibility,
} from '@omne-harness/request-context-contract/testing'
import { access, otherAccess, sender } from './fixtures/outlet-world.ts'

// `FiberState` is a const enum in Cordis 4.0.4, erased at runtime: PENDING is its first member,
// ACTIVE its third and FAILED its fourth.
const PENDING = 0
const ACTIVE = 2
const FAILED = 3

const f = createAssemblyFixture()
const trust = createScriptedRequestContextTrust<unknown>({ keys: [], grants: [] })
class ProbeTrust extends RequestContextTrustService<unknown> {
  readonly principalBinding = trust.principalBinding
  readonly registrationAuthority = trust.registrationAuthority
}
const providerOptions = {
  policies: f.policies,
  accounting: {
    sourceAuthority: { check: async () => ({ kind: 'allowed' as const }) },
    readEligibility: createMemoryReadEligibility<unknown>(),
    adoptedSource: createMemoryAdoptedSource<unknown>(),
    recoveryAuthority: {
      check: async () => ({ kind: 'allowed' as const }),
      checkFact: async () => ({ kind: 'allowed' as const }),
    },
    limits: { maxTargets: 4, maxFactsPerTarget: 4, maxRevisionsPerDispatch: 4 },
  },
}
const config = { sender }

async function assembled() {
  const ctx = new Context()
  await ctx.plugin(ProbeTrust)
  const provider = await ctx.plugin(RequestContextProvider, providerOptions)
  const outlet = await ctx.plugin(AgentAccountOutletProvider, config)
  return { ctx, provider, outlet }
}

describe('the plugin on real Cordis', () => {
  it('loads and provides agentAccountOutlet once the request context keys are there', async () => {
    const { ctx, outlet } = await assembled()
    expect(outlet.state).toBe(ACTIVE)
    expect(ctx.get(agentAccountOutletKey)).toBeInstanceOf(AgentAccountOutletProvider)
  })

  it('stays pending and provides nothing while requestContext is absent, then loads', async () => {
    const ctx = new Context()
    const outlet = await ctx.plugin(AgentAccountOutletProvider, config)
    expect(outlet.state).toBe(PENDING)
    expect(ctx.get(agentAccountOutletKey)).toBeUndefined()
    await ctx.plugin(ProbeTrust)
    await ctx.plugin(RequestContextProvider, providerOptions)
    expect(ctx.get(agentAccountOutletKey)).toBeDefined()
    expect(outlet.state).toBe(ACTIVE)
  })

  it('returns to pending when the provider of the request context keys is disposed', async () => {
    const { ctx, provider, outlet } = await assembled()
    await provider.dispose()
    expect(ctx.get(requestContextKey)).toBeUndefined()
    expect(ctx.get(contextAccountingInboxKey)).toBeUndefined()
    expect(ctx.get(agentAccountOutletKey)).toBeUndefined()
    expect(outlet.state).toBe(PENDING)
  })

  it('stops: disposing the plugin removes the key and leaves the request context alone', async () => {
    const { ctx, outlet } = await assembled()
    await outlet.dispose()
    expect(ctx.get(agentAccountOutletKey)).toBeUndefined()
    expect(ctx.get(requestContextKey)).toBeDefined()
    expect(ctx.get(contextAccountingInboxKey)).toBeDefined()
  })

  it('answers unavailable, not a success, through a reference kept after the plugin stopped', async () => {
    const { ctx, outlet } = await assembled()
    const kept = ctx.get(agentAccountOutletKey)!
    await outlet.dispose()
    expect(
      await kept.deliver({ access, handoff: sampleAccountHandoff(access.tenant, 'stopped') }),
    ).toEqual({ kind: 'unavailable', diagnostic: 'outlet-closed' })
  })

  it('fails to load for a configuration without an adoption identity', async () => {
    const ctx = new Context()
    await ctx.plugin(ProbeTrust)
    await ctx.plugin(RequestContextProvider, providerOptions)
    const outlet = ctx.plugin(AgentAccountOutletProvider, {} as never)
    await Promise.resolve(outlet).catch(() => undefined)
    expect(outlet.state).toBe(FAILED)
    expect(ctx.get(agentAccountOutletKey)).toBeUndefined()
  })
})

describe('what the plugin answers in the first wave (ACCT-INIT, ACCT-TARGET)', () => {
  it('answers unavailable with scope-unresolved, so the account is never received', async () => {
    const { ctx } = await assembled()
    const outlet = ctx.get(agentAccountOutletKey)!
    const handoff = sampleAccountHandoff(access.tenant, 'first-wave')
    expect(await outlet.deliver({ access, handoff })).toEqual({
      kind: 'unavailable',
      diagnostic: 'scope-unresolved',
    })
  })

  it('denies a call of another tenant before it says anything about the scope', async () => {
    const { ctx } = await assembled()
    const outlet = ctx.get(agentAccountOutletKey)!
    const handoff = sampleAccountHandoff(otherAccess.tenant, 'foreign')
    expect(await outlet.deliver({ access, handoff })).toEqual({ kind: 'denied' })
  })
})
