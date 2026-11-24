import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  RequestContextTrustService,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { createScriptedRequestContextTrust } from '@omne-harness/request-context-cordis-contract/testing'
import {
  createAssemblyFixture,
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
}

describe('the provider needs the trust key', () => {
  it('stays unloaded while the trust key is absent and loads when it appears', async () => {
    const ctx = new Context()
    await ctx.plugin(RequestContextProvider, options)
    expect(ctx.get(requestContextKey)).toBeUndefined()
    await ctx.plugin(ProbeTrust)
    expect(ctx.get(requestContextKey)).toBeInstanceOf(RequestContextProvider)
  })
  it('returns to the absent state when the trust provider unloads', async () => {
    const ctx = new Context()
    const trustFiber = await ctx.plugin(ProbeTrust)
    await ctx.plugin(RequestContextProvider, options)
    expect(ctx.get(requestContextKey)).toBeDefined()
    await trustFiber.dispose()
    expect(ctx.get(requestContextKey)).toBeUndefined()
  })
})

describe('one plugin, one fiber', () => {
  it('disposing the plugin fiber removes the key', async () => {
    const ctx = new Context()
    await ctx.plugin(ProbeTrust)
    const fiber = await ctx.plugin(RequestContextProvider, options)
    expect(ctx.get(requestContextKey)).toBeDefined()
    await fiber.dispose()
    expect(ctx.get(requestContextKey)).toBeUndefined()
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
})

describe('the fourth group joins the source set and the registration face (contract property 2)', () => {
  const sectionOf = (name: string, order: string, template: string) => ({
    kind: 'section' as const,
    name,
    scope: f.target.scope,
    source: owner,
    revision: '1',
    order,
    template,
    uses: [],
  })
  async function assembledText(ctx: Context) {
    const result = await ctx.get(requestContextKey)!.assembly(f.target).assemble(f.call)
    if (result.kind !== 'candidate-before-extension') throw new Error(result.kind)
    return result.candidate.assembled.system
      .map(block => (block.kind === 'text' ? block.text : ''))
      .join('\n')
  }

  it('puts the contributions the source gives first and the registered ones after', async () => {
    const ctx = new Context()
    await ctx.plugin(ProbeTrust)
    await ctx.plugin(RequestContextProvider, options)
    const prompt = f.sources.values().prompt
    f.sources.update('prompt', {
      ...prompt,
      promptContributions: {
        contributions: [sectionOf('definition/role', '0-definition-000', '# Role')],
        digest: 'definition',
        generation: null,
      },
    })
    try {
      const service = ctx.get(requestContextKey)!
      const registered = await service.register({
        access: f.call.access,
        target: f.target,
        owner,
        sources: f.sources,
      })
      expect(registered.kind).toBe('registered')
      expect(await assembledText(ctx)).toBe('# Role')
      await ctx.plugin({
        inject: { requestContext: { scope: f.target.scope } },
        apply(c: Context) {
          c.requestContext.contributeSection(sectionOf('workspace/guide', '1', '# Guide'))
        },
      })
      expect(await assembledText(ctx)).toBe('# Role\n# Guide')
    } finally {
      f.sources.update('prompt', prompt)
    }
  })

  it('keeps a source read of the fourth group that gives no value: the face adds no empty set', async () => {
    const ctx = new Context()
    await ctx.plugin(ProbeTrust)
    await ctx.plugin(RequestContextProvider, options)
    const prompt = f.sources.groups.prompt
    const readSource = prompt.readSource.bind(prompt)
    prompt.readSource = async () => ({ kind: 'unavailable', diagnostic: 'definition-store-down' })
    try {
      const service = ctx.get(requestContextKey)!
      await service.register({ access: f.call.access, target: f.target, owner, sources: f.sources })
      const result = await service.assembly(f.target).assemble(f.call)
      expect(result).toMatchObject({ kind: 'unavailable' })
      expect(JSON.stringify(result)).toContain('definition-store-down')
    } finally {
      prompt.readSource = readSource
    }
  })
})
