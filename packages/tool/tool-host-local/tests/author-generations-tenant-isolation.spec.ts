import { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import type { Access, SourceLayer } from '@omne-harness/tool-contract'
import type {
  ToolAuthority,
  ToolBindingEntry,
  ToolBindingRegistry,
} from '@omne-harness/tool-contract/provider'
import {
  ToolBindingsService,
  ToolGenerationsService,
  type ToolResidencyReader,
  type ToolResidencyReference,
} from '@omne-harness/tool-cordis-contract/cordis'
import type { LocalToolContributionVerifier } from '@omne-harness/tool-host-local'
import {
  createLocalToolGenerations,
  type LocalToolGenerationsInput,
} from '@omne-harness/tool-host-local/author'
import { describe, expect, it, vi } from 'vitest'
import {
  accessOf,
  authorityFor,
  fiberedRegistry,
  scriptedVerifier,
  tenantA,
  tenantA2,
  tenantB,
} from './binding-values.ts'
import {
  authorAuthority,
  authorLoader,
  authorModule,
  construction,
  settings,
  unbox,
} from './author-values.ts'
import { evidence } from './coordinator-values.ts'

type Tenant = Access<unknown>['tenant']
type Registry = ToolBindingRegistry<string, unknown, ContentBlock>
type GenerationsInput = LocalToolGenerationsInput<string, unknown, ContentBlock>
const emptyReader: ToolResidencyReader = {
  referencing: async () => succeed({ items: [], next: null }),
}
const keyOf = (authority: ToolAuthority) => ({ layer: authority.layer, asset: authority.asset })
const accessFor = (layer: SourceLayer): Access<string> =>
  accessOf(
    layer.kind === 'tenant'
      ? layer.tenant
      : layer.kind === 'organization' && layer.organization.text === tenantB.organization.text
        ? tenantB
        : tenantA,
  )

async function assemble(
  options: {
    authorities?: readonly ToolAuthority[]
    verifier?: LocalToolContributionVerifier<string>
    reader?: ToolResidencyReader
    registry?: (base: Registry) => Registry
  } = {},
) {
  const root = new Context()
  const verifier = options.verifier ?? scriptedVerifier(options.authorities ?? [authorAuthority])
  const source = fiberedRegistry(verifier)
  const registry = options.registry?.(source.registry) ?? source.registry
  const register = vi.fn(registry.register)
  class Bindings extends ToolBindingsService<string, ContentBlock, unknown> {
    readonly register: Registry['register'] = function (this: Bindings, input) {
      return source.asFiber(String(this.ctx.fiber.uid), () => register(input))
    }
    readonly snapshot = registry.snapshot
    readonly pins = registry.pins
    readonly close = registry.close
    readonly reopen = registry.reopen
    readonly drain = registry.drain
    readonly inspect: ToolBindingsService<string, ContentBlock, unknown>['inspect'] = async () =>
      fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'unused' })
    readonly resolve: ToolBindingsService<string, ContentBlock, unknown>['resolve'] = async () =>
      fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'unused' })
    readonly recover: ToolBindingsService<string, ContentBlock, unknown>['recover'] = async () =>
      fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'unused' })
  }
  await root.plugin(Bindings)
  const module = authorModule(async () => 'done')
  const construct = vi.spyOn(module, 'createAuthor')
  const resolve: GenerationsInput['source']['resolve'] = async authority => {
    return succeed({
      module,
      config: {
        authority,
        settings,
        construction,
      },
      context: {
        access: accessFor(authority.layer),
        asset: { asset: authority.asset, requiredCapabilities: [] },
        services: {},
      },
    })
  }
  const sourceResolve = vi.fn(resolve)
  const generations = createLocalToolGenerations({
    host: root,
    registry,
    verifier,
    residency: options.reader ?? emptyReader,
    source: { resolve: sourceResolve },
    loaderFor: authorLoader,
    recordRejection: async () => evidence('quality-rejected'),
  })
  class Generations extends ToolGenerationsService<string, unknown, ContentBlock> {
    readonly ensureLoaded = generations.ensureLoaded
    readonly unload = generations.unload
    readonly sweep = generations.sweep
    readonly loaderFor = generations.loaderFor
  }
  await root.plugin(Generations)
  return {
    root,
    registry: source.registry,
    generations,
    construct,
    register,
    sourceResolve,
    load: (authority = authorAuthority) =>
      generations.ensureLoaded({ authority, access: accessFor(authority.layer) }),
    rows: () => unbox(source.registry.snapshot({ scope: 'system' })),
  }
}

function reference(
  row: ToolBindingEntry,
  overrides: { tenant?: Tenant; shape?: ToolBindingEntry['shape'] } = {},
): ToolResidencyReference {
  return {
    holder: 'resident',
    tenant: overrides.tenant ?? tenantA,
    shape: overrides.shape ?? row.shape,
  }
}

describe('tenant isolation in unload protection', () => {
  it('retains when tenant codec validation fails for a holder', async () => {
    const fixture = await assemble()
    try {
      unbox(await fixture.load())
      const row = fixture.rows()[0]
      if (row === undefined) throw new Error('missing original author')

      const invalidTenant: Tenant = {
        ...tenantA,
        account: { ...tenantA.account, text: '' }, // Invalid empty account text
      }

      const fixture2 = await assemble({
        reader: {
          referencing: async () =>
            succeed({
              items: [reference(row, { tenant: invalidTenant })],
              next: null,
            }),
        },
      })
      try {
        const { key: key2 } = unbox(await fixture2.load())
        const row2 = fixture2.rows()[0]
        if (row2 === undefined) throw new Error('missing second author')

        // Invalid tenant codec causes retain (line 119 returns retain())
        expect(await fixture2.generations.unload({ key: key2 })).toEqual(
          succeed({ state: 'retained' }),
        )
        expect(fixture2.rows()).toHaveLength(1)
      } finally {
        await fixture2.root.fiber.dispose()
      }
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('distinguishes official layer from organization layer', async () => {
    const officialReplacement = authorityFor({ kind: 'official' }, 'read_file', 'official-v2', '2')
    const orgReplacement = authorityFor(
      { kind: 'organization', organization: tenantA.organization },
      'read_file',
      'org-v2',
      '2',
    )

    const fixture = await assemble({
      authorities: [authorAuthority, officialReplacement, orgReplacement],
    })
    try {
      unbox(await fixture.load())
      const row = fixture.rows()[0]
      if (row === undefined) throw new Error('missing original author')

      // Load official replacement
      unbox(await fixture.load(officialReplacement))
      expect(fixture.rows()).toHaveLength(2)

      // Load organization replacement
      unbox(await fixture.load(orgReplacement))
      expect(fixture.rows()).toHaveLength(3)

      const referenceItems = [reference(row)]
      const fixture2 = await assemble({
        authorities: [authorAuthority, officialReplacement, orgReplacement],
        reader: {
          referencing: async () => succeed({ items: referenceItems, next: null }),
        },
      })
      try {
        unbox(await fixture2.load())
        unbox(await fixture2.load(officialReplacement))
        unbox(await fixture2.load(orgReplacement))

        const originalKey = keyOf(authorAuthority)
        // Both official and organization replacements should protect the original
        expect(await fixture2.generations.unload({ key: originalKey })).toEqual(
          succeed({ state: 'released' }),
        )
        expect(fixture2.rows()).toHaveLength(2) // Both replacements remain
      } finally {
        await fixture2.root.fiber.dispose()
      }
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('enforces organization text match for organization layers', async () => {
    const orgB = authorityFor(
      { kind: 'organization', organization: tenantB.organization },
      'read_file',
      'org-b',
      '2',
    )

    const fixture = await assemble({
      authorities: [authorAuthority, orgB],
    })
    try {
      unbox(await fixture.load())
      const row = fixture.rows()[0]
      if (row === undefined) throw new Error('missing original author')

      // Load organization B replacement (different org from tenantA)
      unbox(await fixture.load(orgB))
      expect(fixture.rows()).toHaveLength(2)

      const referenceItems = [reference(row)]
      const fixture2 = await assemble({
        authorities: [authorAuthority, orgB],
        reader: {
          referencing: async () => succeed({ items: referenceItems, next: null }),
        },
      })
      try {
        const { key: keyA } = unbox(await fixture2.load())
        unbox(await fixture2.load(orgB))

        // Organization B replacement should NOT protect tenantA's original
        // because organization.text doesn't match
        expect(await fixture2.generations.unload({ key: keyA })).toEqual(
          succeed({ state: 'retained' }),
        )
        expect(fixture2.rows()).toHaveLength(2) // Both remain
      } finally {
        await fixture2.root.fiber.dispose()
      }
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('distinguishes tenant layer from same-organization tenant', async () => {
    const tenantA2Authority = authorityFor(
      { kind: 'tenant', tenant: tenantA2 },
      'read_file',
      'tenant-a2',
      '2',
    )

    const fixture = await assemble({
      authorities: [authorAuthority, tenantA2Authority],
    })
    try {
      unbox(await fixture.load())
      const row = fixture.rows()[0]
      if (row === undefined) throw new Error('missing original author')

      // Load tenantA2 (same organization, different account)
      unbox(await fixture.load(tenantA2Authority))
      expect(fixture.rows()).toHaveLength(2)

      const referenceItems = [reference(row)]
      const fixture2 = await assemble({
        authorities: [authorAuthority, tenantA2Authority],
        reader: {
          referencing: async () => succeed({ items: referenceItems, next: null }),
        },
      })
      try {
        const { key: keyA } = unbox(await fixture2.load())
        unbox(await fixture2.load(tenantA2Authority))

        // tenantA2 should NOT protect tenantA's original
        // even though they share the same organization
        expect(await fixture2.generations.unload({ key: keyA })).toEqual(
          succeed({ state: 'retained' }),
        )
        expect(fixture2.rows()).toHaveLength(2)
      } finally {
        await fixture2.root.fiber.dispose()
      }
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('verifies exact tenant match for tenant layer protection', async () => {
    const tenantAAuthority = authorityFor(
      { kind: 'tenant', tenant: tenantA },
      'read_file',
      'tenant-exact',
      '1',
    )
    const tenantAReplacement = authorityFor(
      { kind: 'tenant', tenant: tenantA },
      'read_file',
      'tenant-replacement',
      '2',
    )

    const fixture = await assemble({
      authorities: [tenantAAuthority, tenantAReplacement],
    })
    try {
      unbox(await fixture.load(tenantAAuthority))
      const row = fixture.rows()[0]
      if (row === undefined) throw new Error('missing original author')

      unbox(await fixture.load(tenantAReplacement))
      expect(fixture.rows()).toHaveLength(2)

      const fixture2 = await assemble({
        authorities: [tenantAAuthority, tenantAReplacement],
        reader: {
          referencing: async () =>
            succeed({
              items: [reference(row)],
              next: null,
            }),
        },
      })
      try {
        const { key: keyA } = unbox(await fixture2.load(tenantAAuthority))
        unbox(await fixture2.load(tenantAReplacement))

        // Exact tenant match should protect the original
        expect(await fixture2.generations.unload({ key: keyA })).toEqual(
          succeed({ state: 'released' }),
        )
        expect(fixture2.rows()).toHaveLength(1) // Only replacement remains
      } finally {
        await fixture2.root.fiber.dispose()
      }
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('releases when no residency holders exist', async () => {
    const fixture = await assemble()
    try {
      const { key } = unbox(await fixture.load())

      // emptyReader returns no holders, so the loop completes without hitting retain()
      expect(await fixture.generations.unload({ key })).toEqual(succeed({ state: 'released' }))
      expect(fixture.rows()).toEqual([])
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('retains when a holder exists but no replacement serves it', async () => {
    const fixture = await assemble()
    try {
      unbox(await fixture.load())
      const row = fixture.rows()[0]
      if (row === undefined) throw new Error('missing original author')

      const fixture2 = await assemble({
        reader: {
          referencing: async () =>
            succeed({
              items: [reference(row)],
              next: null,
            }),
        },
      })
      try {
        const { key: key2 } = unbox(await fixture2.load())

        // Holder exists but no replacement loaded, so serving=false → retain()
        expect(await fixture2.generations.unload({ key: key2 })).toEqual(
          succeed({ state: 'retained' }),
        )
        expect(fixture2.rows()).toHaveLength(1)
      } finally {
        await fixture2.root.fiber.dispose()
      }
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('requires both binding key difference and live state', async () => {
    const replacement = authorityFor({ kind: 'official' }, 'read_file', 'official-v2', '2')

    const fixture = await assemble({
      authorities: [authorAuthority, replacement],
    })
    try {
      unbox(await fixture.load())
      const row = fixture.rows()[0]
      if (row === undefined) throw new Error('missing original author')

      unbox(await fixture.load(replacement))
      const replacementRow = fixture.rows().find(r => r.key.asset.adoption.revision === '2')
      if (replacementRow === undefined) throw new Error('missing replacement')

      // Close the replacement to make it draining
      unbox(fixture.registry.close(keyOf(replacement)))

      const fixture2 = await assemble({
        authorities: [authorAuthority, replacement],
        reader: {
          referencing: async () =>
            succeed({
              items: [reference(row)],
              next: null,
            }),
        },
      })
      try {
        const { key: keyA } = unbox(await fixture2.load())
        unbox(await fixture2.load(replacement))
        unbox(fixture2.registry.close(keyOf(replacement)))

        // Draining replacement should NOT protect the original
        expect(await fixture2.generations.unload({ key: keyA })).toEqual(
          succeed({ state: 'retained' }),
        )
      } finally {
        await fixture2.root.fiber.dispose()
      }
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('requires shape match for protection', async () => {
    const replacement = authorityFor({ kind: 'official' }, 'read_file', 'different-shape', '2')

    const fixture = await assemble({
      authorities: [authorAuthority, replacement],
    })
    try {
      unbox(await fixture.load())
      const row = fixture.rows()[0]
      if (row === undefined) throw new Error('missing original author')

      unbox(await fixture.load(replacement))

      const differentShape = { ...row.shape, name: 'completely_different_tool' }
      const fixture2 = await assemble({
        authorities: [authorAuthority, replacement],
        reader: {
          referencing: async () =>
            succeed({
              items: [reference(row, { shape: differentShape })],
              next: null,
            }),
        },
      })
      try {
        const { key: keyA } = unbox(await fixture2.load())
        unbox(await fixture2.load(replacement))

        // Different shape should NOT protect the original
        expect(await fixture2.generations.unload({ key: keyA })).toEqual(
          succeed({ state: 'retained' }),
        )
      } finally {
        await fixture2.root.fiber.dispose()
      }
    } finally {
      await fixture.root.fiber.dispose()
    }
  })
})
