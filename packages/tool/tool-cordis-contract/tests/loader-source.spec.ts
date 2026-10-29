import { AssertionError } from 'node:assert/strict'
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import type { SourceLayer } from '@omne-harness/tool-contract'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import {
  memoryToolBindingRegistryFixture,
  runConformanceCase,
  toolLoaderSourceConformance,
  type ToolLoaderSourceFixture,
} from '@omne-harness/tool-cordis-contract/testing'
import { expect, it } from 'vitest'

/** A loader seam double. These checks do not supply a production loader or settings SDK. */
function fixture(
  kind: 'official' | 'organization',
  leaking: boolean,
): ToolLoaderSourceFixture<string, unknown, ContentBlock> {
  const registry = memoryToolBindingRegistryFixture()
  const tenant = testingTenant('org_c0nf0rmance000000000000000', 'acc_11111111111111111111111111')
  const authority = {
    ...registry.authority,
    layer:
      kind === 'official'
        ? { kind: 'official' as const }
        : { kind: 'organization' as const, organization: tenant.organization },
  }
  const loaded = registry.loaded(authority, 'fixture')
  const reads: SourceLayer[] = []
  return {
    authority,
    access: registry.access,
    otherAccess: { principal: 'other-registrant', tenant },
    load: {
      asset: { asset: authority.asset, requiredCapabilities: [] },
      settings: loaded.settings,
      module: { executor: loaded.executor, createAuthor: () => succeed(loaded.implementation) },
      services: {},
    },
    settingsReads: () => reads,
    generations: {
      loaderFor: verified => ({
        load: async input => {
          reads.push(leaking ? { kind: 'tenant', tenant: input.tenant } : verified.layer)
          return succeed(loaded)
        },
      }),
    },
  }
}

it.each(['official', 'organization'] as const)(
  'observes %s reads through loaderFor/load and rejects registrant leakage',
  async source => {
    const cases = toolLoaderSourceConformance<string, unknown, ContentBlock>()
    expect(cases.map(test => test.name)).toEqual([
      'shared loading reads the contribution source, independently of the registrant tenant',
    ])
    for (const test of cases) {
      expect(await runConformanceCase(test, fixture(source, false))).toEqual({ kind: 'passed' })
      await expect(runConformanceCase(test, fixture(source, true))).rejects.toThrow(AssertionError)
    }
  },
)

it('reports the missing real Loader instead of passing absent reads', async () => {
  const { generations: _generations, ...missing } = fixture('official', false)
  for (const test of toolLoaderSourceConformance<string, unknown, ContentBlock>())
    expect(await runConformanceCase(test, missing)).toEqual({
      kind: 'not-applicable',
      handle: 'loaderFor',
    })
})

it.each(['no-read', 'failed-load', 'same-tenant'] as const)(
  'the source suite detects %s',
  async breach => {
    const source = fixture('organization', false)
    const broken =
      breach === 'same-tenant'
        ? { ...source, otherAccess: source.access }
        : breach === 'no-read'
          ? { ...source, settingsReads: () => [] }
          : {
              ...source,
              generations: {
                loaderFor: () => ({
                  load: async () => ({
                    failure: {
                      kind: 'unavailable' as const,
                      dependency: 'loader',
                      diagnostic: 'fixture unavailable',
                    },
                  }),
                }),
              },
            }
    const cases = toolLoaderSourceConformance<string, unknown, ContentBlock>()
    expect(cases).toHaveLength(1)
    const test = cases[0]
    if (!test) throw new Error('missing loader source case')
    await expect(test.run(broken)).rejects.toThrow(AssertionError)
  },
)
