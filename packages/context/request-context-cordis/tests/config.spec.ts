import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  RequestContextTrustService,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { createScriptedRequestContextTrust } from '@omne-harness/request-context-cordis-contract/testing'
import {
  countingBasis,
  createAssemblyFixture,
  createScriptedInputMeter,
  fixtureBudget,
} from '@omne-harness/request-context-contract/testing'
import {
  decodePrincipalKey,
  type Adoption,
  type CompactionPolicy,
} from '@omne-harness/request-context-contract'
import {
  DEFAULT_COMPACTION_POLICY,
  DEFAULT_REPRESENTATION_CONFIG,
} from '@omne-harness/request-context'
import { RequestContextProvider } from '@omne-harness/request-context-cordis/cordis'

const f = createAssemblyFixture({
  preparation: {
    meter: createScriptedInputMeter(countingBasis, input => ({
      ok: fixtureBudget(String(input.assembled.messages.length)),
    })),
  },
})
const FIBER_FAILED = 3
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

const initial = {
  compaction: { implementation: 'default', config: DEFAULT_COMPACTION_POLICY },
  representation: { implementation: 'default', config: DEFAULT_REPRESENTATION_CONFIG },
}
const validate = (value: unknown) => RequestContextProvider.Config['~standard'].validate(value)
const refused = (value: unknown) => {
  const result = validate(value)
  if (result instanceof Promise || result.issues === undefined)
    throw new Error('Expected the configuration to be refused')
  return result.issues.map(issue => issue.message).join('; ')
}

describe('the configuration schema', () => {
  it('accepts no selection at all, and the initial selection spelled out', () => {
    expect(validate({ policies: f.policies })).toHaveProperty('value')
    expect(validate({})).toHaveProperty('value')
    expect(validate({ selection: initial })).toHaveProperty('value')
  })
  it('refuses a strategy name nothing answers to, including a name from the object prototype', () => {
    for (const implementation of ['missing', 'toString', '', 3]) {
      const selection = { ...initial, compaction: { ...initial.compaction, implementation } }
      expect(refused({ selection }), String(implementation)).toMatch(
        /selection\.compaction names no known strategy/u,
      )
    }
    const selection = {
      ...initial,
      representation: { ...initial.representation, implementation: 'guess' },
    }
    expect(refused({ selection })).toMatch(/selection\.representation names no known/u)
  })
  it('refuses parameters that do not fit the schema instead of correcting them', () => {
    const config: CompactionPolicy = { ...DEFAULT_COMPACTION_POLICY, triggerPercent: '101' }
    const selection = { ...initial, compaction: { implementation: 'default', config } }
    expect(refused({ selection })).toMatch(/selection\.compaction\.config/u)
    const preferences = { ...DEFAULT_REPRESENTATION_CONFIG.preferences, text: ['guess'] }
    expect(
      refused({
        selection: {
          ...initial,
          representation: { implementation: 'default', config: { preferences } },
        },
      }),
    ).toMatch(/selection\.representation\.config/u)
  })
  it('refuses a partial selection, an unknown field and a missing part', () => {
    const half = { compaction: initial.compaction }
    expect(refused({ selection: half })).toMatch(/selection\.representation/u)
    expect(refused({ selection: { ...initial, extra: 1 } })).toMatch(/unknown field/u)
    expect(
      refused({
        selection: { ...initial, compaction: { ...initial.compaction, stepBond: '3' } },
      }),
    ).toMatch(/unknown field stepBond/u)
  })
  it('refuses a null or non-object selection and does not fall back to the default', () => {
    for (const selection of [null, 'default', 3, []])
      expect(refused({ selection }), String(selection)).toMatch(/selection/u)
  })
  it('refuses ready strategy objects together with a selection', () => {
    expect(refused({ policies: f.policies, selection: initial })).toMatch(/exclude each other/u)
  })
  it('refuses a configuration that is not an object', () => {
    expect(refused(undefined)).toMatch(/object/u)
  })
})

describe('loading with a configuration', () => {
  async function load(options: unknown) {
    const ctx = new Context()
    await ctx.plugin(ProbeTrust)
    const fiber = ctx.plugin(RequestContextProvider, options as never)
    await Promise.resolve(fiber).catch(() => undefined)
    return { ctx, fiber }
  }
  it('fails the load of a configuration that does not fit, and provides no key', async () => {
    const selection = {
      ...initial,
      compaction: { ...initial.compaction, implementation: 'missing' },
    }
    const { ctx, fiber } = await load({ selection })
    expect(fiber.state).toBe(FIBER_FAILED)
    expect(ctx.get(requestContextKey)).toBeUndefined()
  })
  it('runs the default strategies with their initial values when nothing is chosen', async () => {
    const { ctx } = await load({})
    const service = ctx.get(requestContextKey)
    if (service === undefined) throw new Error('The provider did not load')
    await service.register({
      access: f.call.access,
      target: f.target,
      owner,
      sources: f.sources,
    })
    expect((await service.assembly(f.target).assemble(f.call)).kind).toBe(
      'candidate-before-extension',
    )
  })
  it('runs the strategy parameters of the selection', async () => {
    const config: CompactionPolicy = { ...DEFAULT_COMPACTION_POLICY, triggerPercent: '0' }
    const selection = { ...initial, compaction: { implementation: 'default', config } }
    const { ctx } = await load({ selection })
    const service = ctx.get(requestContextKey)
    if (service === undefined) throw new Error('The provider did not load')
    await service.register({
      access: f.call.access,
      target: f.target,
      owner,
      sources: f.sources,
    })
    expect(await service.assembly(f.target).assemble(f.call)).toMatchObject({
      kind: 'needs-compaction',
      goals: [{ metric: 'input-tokens', relation: 'at-most', limit: '0' }],
    })
  })
})
