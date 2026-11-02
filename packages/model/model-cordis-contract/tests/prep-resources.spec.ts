// The `modelPreparationResources` key: its shape, its `./testing` double, and the conformance
// cases a provider runs. The double runs on a real Cordis Context. Passing proves the lease rules
// of one provider in one process; it proves nothing about the request assembly that meters with it.
import { Context, Service } from '@deepseek-ai/cordis'
import type {
  Adoption,
  ModelCountingBasis,
  ModelInputMeter,
  ModelPreparationResources,
  ModelProfile,
} from '@omne-harness/model-contract'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelPreparationResourcesService, modelPreparationResourcesKey } from '../src/cordis.ts'
import {
  createModelPreparationResourcesPlugin,
  createScriptedModelPreparationResources,
  modelPreparationResourcesConformance,
  type ModelPreparationResourcesFixture,
  type ScriptedModelPreparationResourcesScript,
} from '../src/testing/index.ts'

type Acquire = ModelPreparationResources<unknown>['acquire']

const ADOPTION: Adoption = { owner: 'o', name: 'n', revision: '1', digest: '0'.repeat(64) }
const SUPPLIER = { adoption: ADOPTION, recipient: 'test.invalid', model: 'test' }
const BASIS: ModelCountingBasis = {
  supplier: SUPPLIER,
  meter: ADOPTION,
  tokenization: { kind: 'not-used', method: ADOPTION },
  prompt: { kind: 'provider-private', estimation: ADOPTION },
  projection: ADOPTION,
  mediaTransform: ADOPTION,
  replay: ADOPTION,
  evidence: ADOPTION,
}
const METER: ModelInputMeter = {
  basis: BASIS,
  measure: () => ({
    ok: { kind: 'complete', inputDigest: 'stub', checks: [], counting: [BASIS] },
  }),
}

const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
if (!account.ok || !organization.ok) throw new Error('fixture identity')
const TENANT = tenant(organization.value, account.value)

const PROFILE = {
  identity: { scope: { kind: 'factory' }, route: 'test' },
  adoption: ADOPTION,
  revision: '1',
  updatedAt: '2026-10-23T00:00:00Z',
  availability: 'active',
  definition: { suppliers: [SUPPLIER] },
} as unknown as ModelProfile

const INPUT: Parameters<Acquire>[0] = {
  principal: { subject: 't' },
  tenant: TENANT,
  profile: PROFILE,
}

/** The scripted double behind the double's own provider plugin. */
function fixtureOver(
  script: (failRelease: boolean) => ScriptedModelPreparationResourcesScript,
): ModelPreparationResourcesFixture {
  const start = async (failRelease: boolean) => {
    const context = new Context()
    const resources = createScriptedModelPreparationResources<unknown>(script(failRelease))
    await context.plugin(createModelPreparationResourcesPlugin(resources))
    return {
      context,
      input: INPUT,
      dispose: async () => {
        await context.fiber.dispose()
      },
    }
  }
  return { create: () => start(false), createWithFailingRelease: () => start(true) }
}

const releaseFailure = {
  failure: { kind: 'unavailable', dependency: 'stub', diagnostic: 'x' },
} as const

async function failures(fixture: ModelPreparationResourcesFixture): Promise<string[]> {
  const failed: string[] = []
  for (const test of modelPreparationResourcesConformance(fixture)) {
    try {
      await test.run()
    } catch {
      failed.push(test.name)
    }
  }
  return failed.sort()
}

describe('modelPreparationResources key', () => {
  it('has one abstract member, acquire, with the signature of ModelPreparationResources', () => {
    expectTypeOf<Parameters<ModelPreparationResourcesService<unknown>['acquire']>>().toEqualTypeOf<
      Parameters<Acquire>
    >()
    expectTypeOf<ReturnType<ModelPreparationResourcesService<unknown>['acquire']>>().toEqualTypeOf<
      ReturnType<Acquire>
    >()
    expectTypeOf<
      Exclude<keyof ModelPreparationResourcesService<unknown>, keyof Service>
    >().toEqualTypeOf<'acquire'>()
    expectTypeOf<Context['modelPreparationResources']>().toEqualTypeOf<
      ModelPreparationResourcesService<unknown>
    >()
    expect(modelPreparationResourcesKey).toBe('modelPreparationResources')
    expect(ModelPreparationResourcesService.provide).toBe(modelPreparationResourcesKey)
  })

  it('is provided on the plugin fiber and gone after the plugin is unloaded', async () => {
    const context = new Context()
    const resources = createScriptedModelPreparationResources<unknown>({ meter: METER })
    const fiber = context.plugin(createModelPreparationResourcesPlugin(resources))
    await fiber
    expect(context.get(modelPreparationResourcesKey)).toBeInstanceOf(
      ModelPreparationResourcesService,
    )
    await fiber.dispose()
    expect(context.get(modelPreparationResourcesKey)).toBeUndefined()
    await context.fiber.dispose()
  })
})

describe('modelPreparationResources conformance', () => {
  it('has two cases with distinct names and non-empty clauses', () => {
    const cases = modelPreparationResourcesConformance(fixtureOver(() => ({ meter: METER })))
    expect(cases).toHaveLength(2)
    expect(new Set(cases.map(c => c.name)).size).toBe(2)
    expect(cases.every(c => c.clause.length > 0)).toBe(true)
  })

  it('the scripted double passes every case', async () => {
    const fixture = fixtureOver(failRelease => ({
      meter: METER,
      ...(failRelease && { release: () => releaseFailure }),
    }))
    expect(await failures(fixture)).toEqual([])
  })

  it('a release that throws instead of answering failure turns its case red', async () => {
    const fixture = fixtureOver(failRelease => ({
      meter: METER,
      ...(failRelease && {
        release: () => {
          throw new Error('release hook failed')
        },
      }),
    }))
    expect(await failures(fixture)).toEqual(['failed-release-returns-failure'])
  })

  it('a release that hides its failure as success turns its case red', async () => {
    expect(await failures(fixtureOver(() => ({ meter: METER })))).toEqual([
      'failed-release-returns-failure',
    ])
  })

  it('a source that gives no lease after a release turns its case red', async () => {
    const fixture = fixtureOver(failRelease => {
      let given = 0
      return {
        meter: METER,
        acquire: () =>
          ++given > 1 ? { kind: 'unavailable', dependency: 'stub', diagnostic: 'used-up' } : null,
        ...(failRelease && { release: () => releaseFailure }),
      }
    })
    expect(await failures(fixture)).toEqual(['released-lease-gives-way-to-a-new-one'])
  })
})
