import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
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
  testingAccess,
} from '@omne-harness/request-context-contract/testing'
import { decodePrincipalKey, type Adoption } from '@omne-harness/request-context-contract'
import { RequestContextProvider } from '@omne-harness/request-context-cordis/cordis'

const f = createAssemblyFixture()
const owner: Adoption = { owner: 'test', name: 'sources', revision: '1', digest: 'd' }
const key = (() => {
  const decoded = decodePrincipalKey('principal_a')
  if ('failure' in decoded) throw new Error('fixture')
  return decoded.ok
})()
const trust = createScriptedRequestContextTrust<unknown>({
  keys: [{ access: f.call.access, result: { kind: 'value', value: key } }],
  grants: [
    {
      access: f.call.access,
      target: f.target,
      owner,
      action: 'register',
      decision: { kind: 'allowed' },
    },
  ],
})

class ProbeTrust extends RequestContextTrustService<unknown> {
  readonly principalBinding = trust.principalBinding
  readonly registrationAuthority = trust.registrationAuthority
}

const options = {
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

describe('the provider needs the trust key', () => {
  it('stays unloaded while the trust key is absent and loads when it appears', async () => {
    const ctx = new Context()
    await ctx.plugin(RequestContextProvider, options)
    expect(ctx.get(requestContextKey)).toBeUndefined()
    expect(ctx.get(contextAccountingInboxKey)).toBeUndefined()
    await ctx.plugin(ProbeTrust)
    expect(ctx.get(requestContextKey)).toBeInstanceOf(RequestContextProvider)
    expect(ctx.get(contextAccountingInboxKey)).toBeDefined()
  })
  it('returns to the absent state when the trust provider unloads', async () => {
    const ctx = new Context()
    const trustFiber = await ctx.plugin(ProbeTrust)
    await ctx.plugin(RequestContextProvider, options)
    expect(ctx.get(requestContextKey)).toBeDefined()
    await trustFiber.dispose()
    expect(ctx.get(requestContextKey)).toBeUndefined()
    expect(ctx.get(contextAccountingInboxKey)).toBeUndefined()
  })
})

describe('one plugin, one fiber, two keys', () => {
  it('disposing the one plugin fiber removes both keys', async () => {
    const ctx = new Context()
    await ctx.plugin(ProbeTrust)
    const fiber = await ctx.plugin(RequestContextProvider, options)
    expect(ctx.get(requestContextKey)).toBeDefined()
    expect(ctx.get(contextAccountingInboxKey)).toBeDefined()
    await fiber.dispose()
    expect(ctx.get(requestContextKey)).toBeUndefined()
    expect(ctx.get(contextAccountingInboxKey)).toBeUndefined()
  })
})

describe('the provider uses the trust object it was given', () => {
  it('registers only what the trust authority lists', async () => {
    const ctx = new Context()
    await ctx.plugin(ProbeTrust)
    await ctx.plugin(RequestContextProvider, options)
    const service = ctx.get(requestContextKey)!
    const refused = await service.register({
      access: testingAccess('stranger', f.target.tenant),
      target: f.target,
      owner,
      sources: f.sources,
    })
    expect(refused).toMatchObject({ kind: 'unavailable' })
    const accepted = await service.register({
      access: f.call.access,
      target: f.target,
      owner,
      sources: f.sources,
    })
    expect(accepted.kind).toBe('registered')
    expect((await service.assembly(f.target).assemble(f.call)).kind).toBe(
      'candidate-before-extension',
    )
  })
  it('the inbox answers through the original port', async () => {
    const ctx = new Context()
    await ctx.plugin(ProbeTrust)
    await ctx.plugin(RequestContextProvider, options)
    const usage = await ctx.get(contextAccountingInboxKey)!.usage({
      access: f.call.access,
      target: f.target,
    })
    expect(typeof usage.kind).toBe('string')
  })
})
