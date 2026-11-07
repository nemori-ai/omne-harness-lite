import { catalogSearch, fixedCatalogView } from '../catalog-view-fixture.ts'
import { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { createMemoryToolStartAuthority } from '@omne-harness/tool-contract/testing'
import {
  ToolContributionAuthorityService,
  ToolResidencyReaderService,
  type ToolResidencyReader,
} from '@omne-harness/tool-cordis-contract/cordis'
import { createMemoryToolBindingRegistry } from '@omne-harness/tool-cordis-contract/testing'
import {
  createLocalToolBindingsPlugin,
  createLocalToolHostPlugin,
  type LocalToolHostPluginInput,
} from '@omne-harness/tool-host-local/cordis'
import { describe, expect, it } from 'vitest'
import {
  authorAccess,
  authorAuthority,
  authorLoader,
  authorModule,
  construction,
  settings,
  unbox,
} from '../author-values.ts'
import { evidence } from '../coordinator-values.ts'
import {
  accessOf,
  authorityFor,
  loadedFor,
  scriptedVerifier,
  tenantA,
  tenantB,
} from '../binding-values.ts'
import {
  sameShape,
  type ToolAuthority,
  type ToolLoader,
} from '@omne-harness/tool-contract/provider'

// Only the authority and residency sources are test doubles. Both plugins and authors are real.
const emptyReader: ToolResidencyReader = {
  referencing: async () => succeed({ items: [], next: null }),
}

async function assembly(
  reader: ToolResidencyReader | null = emptyReader,
  source?: LocalToolHostPluginInput<string, unknown, ContentBlock>['source'],
  grants: readonly ToolAuthority[] = [authorAuthority],
  loaderFor: LocalToolHostPluginInput<string, unknown, ContentBlock>['loaderFor'] = authorLoader,
) {
  const root = new Context()
  const verifier = createMemoryToolBindingRegistry(
    grants.map(authority => ({ authority, registrants: null })),
  )
  class Authority extends ToolContributionAuthorityService<string> {
    readonly verify = verifier.controls.verify
    readonly admits = scriptedVerifier(grants).admits
  }
  class Residency extends ToolResidencyReaderService {
    readonly referencing = reader?.referencing ?? emptyReader.referencing
  }
  await root.plugin(Authority)
  const bindings = root.plugin(
    createLocalToolBindingsPlugin<string, unknown, ContentBlock>({
      view: fixedCatalogView(grants.map(grant => ({ layer: grant.layer, asset: grant.asset }))),
      search: catalogSearch,
      availability: {
        judge: async () =>
          fail({ kind: 'unavailable', dependency: 'fixture', diagnostic: 'unused' }),
      },
      authority: createMemoryToolStartAuthority<string>(),
      scope: () => {
        throw new Error('not executing')
      },
      settle: async () =>
        fail({ kind: 'unavailable', dependency: 'fixture', diagnostic: 'unused' }),
    }),
  )
  await bindings
  const residency = reader === null ? undefined : root.plugin(Residency)
  if (residency !== undefined) await residency
  const plugin = createLocalToolHostPlugin({
    loaderFor,
    recordRejection: async () => evidence('rejected'),
    source: source ?? {
      resolve: async authority =>
        succeed({
          module: authorModule(async () => 'done'),
          config: { authority, construction, settings },
          context: {
            access: authorAccess,
            asset: { asset: authority.asset, requiredCapabilities: [] },
            services: {},
          },
        }),
    },
  })
  const host = root.plugin(plugin)
  await host
  return { root, host, residency, plugin }
}

describe('production Cordis tool host', () => {
  it('rejects a late initial load when a caller dependency disappears before cleanup', async () => {
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const { root, host } = await assembly(emptyReader, undefined, [authorAuthority], authority => ({
      load: async request => {
        entered.resolve()
        await release.promise
        return authorLoader(authority).load(request)
      },
    }))
    let attempts = 0
    let answer: Awaited<ReturnType<ToolLoader<unknown, unknown, ContentBlock>['load']>> | undefined
    try {
      const dependency = root.plugin((ctx: Context) => {
        ctx.provide('testAuthorDependency', {})
      })
      await dependency
      const author = root.plugin({
        inject: ['toolBindings', 'toolGenerations', 'testAuthorDependency'],
        async apply(ctx: Context) {
          answer = await ctx.toolGenerations.loaderFor(authorAuthority).load({
            ...authorAccess,
            asset: { asset: authorAuthority.asset, requiredCapabilities: [] },
            settings,
            module: authorModule(async () => 'unused'),
            services: {},
          })
          if ('ok' in answer) {
            attempts += 1
            unbox(
              ctx.toolBindings.register({
                ...authorAccess,
                authority: authorAuthority,
                loaded: answer.ok,
              }),
            )
          }
        },
      })
      await entered.promise
      expect(author.state).toBe(1)
      const removed = Promise.withResolvers<void>()
      root.on('internal/service', (name, value) => {
        if (name === 'testAuthorDependency' && value === undefined) removed.resolve()
      })
      const retiring = dependency.dispose()
      await removed.promise
      expect(host.state).toBe(2)
      expect(author.state).toBe(1)
      release.resolve()
      await Promise.all([author, retiring])
      expect(answer).toHaveProperty('failure.kind', 'unavailable')
      expect(attempts).toBe(0)
      expect(unbox(root.toolBindings.snapshot({ scope: 'system' }))).toHaveLength(0)
    } finally {
      release.resolve()
      await root.fiber.dispose()
    }
  })

  it('rejects a delayed loader answer from an earlier caller activation', async () => {
    const delayed =
      Promise.withResolvers<
        Awaited<ReturnType<ToolLoader<string, unknown, ContentBlock>['load']>>
      >()
    const entered = Promise.withResolvers<void>()
    const { root } = await assembly(emptyReader, undefined, [authorAuthority], () => ({
      load: () => {
        entered.resolve()
        return delayed.promise
      },
    }))
    const loaders: ToolLoader<unknown, unknown, ContentBlock>[] = []
    try {
      const caller = root.plugin({
        inject: ['toolGenerations'],
        apply(ctx: Context) {
          loaders.push(ctx.toolGenerations.loaderFor(authorAuthority))
        },
      })
      await caller
      const first = loaders[0]
      if (first === undefined) throw new Error('missing caller loader')
      const loading = first.load({
        ...authorAccess,
        asset: { asset: authorAuthority.asset, requiredCapabilities: [] },
        settings,
        module: authorModule(async () => 'unused'),
        services: {},
      })
      await entered.promise
      const uid = caller.uid
      await caller.restart()
      expect(caller.uid).toBe(uid)
      expect(await loading).toHaveProperty('failure.kind', 'unavailable')
      delayed.resolve(succeed(loadedFor(authorAuthority)))
      expect(
        await first.load({
          ...authorAccess,
          asset: { asset: authorAuthority.asset, requiredCapabilities: [] },
          settings,
          module: authorModule(async () => 'unused'),
          services: {},
        }),
      ).toHaveProperty('failure.kind', 'unavailable')
      const next = loaders[1]
      if (next === undefined) throw new Error('missing restarted loader')
      expect(
        await next.load({
          ...authorAccess,
          asset: { asset: authorAuthority.asset, requiredCapabilities: [] },
          settings,
          module: authorModule(async () => 'unused'),
          services: {},
        }),
      ).toHaveProperty('ok')
    } finally {
      delayed.resolve(
        fail({ kind: 'unavailable', dependency: 'fixture', diagnostic: 'test ended' }),
      )
      await root.fiber.dispose()
    }
  })

  it('loads an author under its host, recognizes it and releases its registration', async () => {
    const { root, host } = await assembly()
    try {
      const generations = root.toolGenerations
      const first = unbox(
        await generations.ensureLoaded({ authority: authorAuthority, access: authorAccess }),
      )
      expect(first.state).toBe('loaded')
      expect(
        unbox(await generations.ensureLoaded({ authority: authorAuthority, access: authorAccess }))
          .state,
      ).toBe('recognized')
      const authors = [...root.registry.values()]
        .flatMap(runtime => [...runtime.fibers])
        .filter(fiber => fiber.name === 'tool-author')
      expect(authors).toHaveLength(1)
      expect(authors[0]?.parent).toBe(host.ctx)
      expect(unbox(root.toolBindings.snapshot({ scope: 'system' }))[0]?.fiber).toBe(
        String(authors[0]?.uid),
      )
      expect(await generations.unload({ key: first.key })).toEqual(succeed({ state: 'released' }))
      expect(unbox(root.toolBindings.snapshot({ scope: 'system' }))).toHaveLength(0)
    } finally {
      await root.fiber.dispose()
    }
  })

  it('stays pending without residency', async () => {
    const { root, host } = await assembly(null)
    try {
      expect(host.state).toBe(0)
      expect(root.get('toolGenerations')).toBeUndefined()
    } finally {
      await root.fiber.dispose()
    }
  })

  it('retains and reopens when a live residency provider cannot read', async () => {
    const { root } = await assembly({
      referencing: async () => fail({ kind: 'unavailable', diagnostic: 'read failed' }),
    })
    try {
      const { key } = unbox(
        await root.toolGenerations.ensureLoaded({
          authority: authorAuthority,
          access: authorAccess,
        }),
      )
      expect(await root.toolGenerations.unload({ key })).toEqual(succeed({ state: 'retained' }))
      expect(unbox(root.toolBindings.snapshot({ scope: 'system' }))[0]?.state).toBe('live')
    } finally {
      await root.fiber.dispose()
    }
  })

  it('does not substitute another tenant contribution for a resident holder', async () => {
    const foreign = authorityFor({ kind: 'tenant', tenant: tenantB }, 'read_file', 'foreign')
    const reader: ToolResidencyReader = {
      referencing: async () =>
        succeed({
          items: [{ holder: 'resident', tenant: tenantA, shape: loadedFor(authorAuthority).shape }],
          next: null,
        }),
    }
    const { root } = await assembly(reader, undefined, [authorAuthority, foreign])
    try {
      const { key } = unbox(
        await root.toolGenerations.ensureLoaded({
          authority: authorAuthority,
          access: authorAccess,
        }),
      )
      const original = unbox(root.toolBindings.snapshot({ scope: 'system' }))[0]
      if (original === undefined) throw new Error('missing author')
      reader.referencing = async () =>
        succeed({
          items: [{ holder: 'resident', tenant: tenantA, shape: original.shape }],
          next: null,
        })
      const replacement = unbox(
        await authorLoader(foreign).load({
          ...accessOf(tenantB),
          asset: { asset: foreign.asset, requiredCapabilities: [] },
          settings,
          module: authorModule(async () => 'foreign'),
          services: {},
        }),
      )
      expect(sameShape(replacement.shape, original.shape)).toBe(true)
      await root.plugin({
        inject: ['toolBindings'],
        apply(ctx: Context) {
          unbox(
            ctx.toolBindings.register({
              ...accessOf(tenantB),
              authority: foreign,
              loaded: replacement,
            }),
          )
        },
      })
      expect(await root.toolGenerations.unload({ key })).toEqual(succeed({ state: 'retained' }))
      expect(unbox(root.toolBindings.snapshot({ scope: 'system' }))).toHaveLength(2)
    } finally {
      await root.fiber.dispose()
    }
  })

  it('settles a pending residency read on withdrawal and refuses the old generation', async () => {
    const entered = Promise.withResolvers<void>()
    const page = Promise.withResolvers<Awaited<ReturnType<ToolResidencyReader['referencing']>>>()
    const { root, host, residency, plugin } = await assembly({
      referencing: () => {
        entered.resolve()
        return page.promise
      },
    })
    try {
      const old = root.toolGenerations
      const { key } = unbox(
        await old.ensureLoaded({ authority: authorAuthority, access: authorAccess }),
      )
      const unloading = old.unload({ key })
      await entered.promise
      await residency?.dispose()
      await host
      expect(await unloading).toHaveProperty('failure.kind', 'unavailable')
      expect(root.get('toolGenerations')).toBeUndefined()
      expect(unbox(root.toolBindings.snapshot({ scope: 'system' }))).toHaveLength(0)
      expect(
        await old.ensureLoaded({ authority: authorAuthority, access: authorAccess }),
      ).toHaveProperty('failure.kind', 'unavailable')
      page.resolve(succeed({ items: [], next: null }))
      class Replacement extends ToolResidencyReaderService {
        readonly referencing = emptyReader.referencing
      }
      await root.plugin(Replacement)
      await host
      expect(root.toolGenerations).not.toBe(old)
      expect(
        unbox(
          await root.toolGenerations.ensureLoaded({
            authority: authorAuthority,
            access: authorAccess,
          }),
        ).state,
      ).toBe('loaded')
      expect(await old.unload({ key })).toHaveProperty('failure.kind', 'unavailable')
      expect(unbox(root.toolBindings.snapshot({ scope: 'system' }))).toHaveLength(1)
      expect(plugin.inject).toEqual([
        'toolBindings',
        'toolContributionAuthority',
        'toolResidencyReader',
      ])
    } finally {
      page.resolve(succeed({ items: [], next: null }))
      await root.fiber.dispose()
    }
  })

  it('does not load a late source answer after the host retires', async () => {
    const entered = Promise.withResolvers<void>()
    const source =
      Promise.withResolvers<
        Awaited<
          ReturnType<LocalToolHostPluginInput<string, unknown, ContentBlock>['source']['resolve']>
        >
      >()
    const { root, host } = await assembly(emptyReader, {
      resolve: () => {
        entered.resolve()
        return source.promise
      },
    })
    try {
      const old = root.toolGenerations
      const loading = old.ensureLoaded({ authority: authorAuthority, access: authorAccess })
      await entered.promise
      await host.dispose()
      expect(await loading).toHaveProperty('failure.kind', 'unavailable')
      source.resolve(
        succeed({
          module: authorModule(async () => 'unused'),
          config: { authority: authorAuthority, construction, settings },
          context: {
            access: authorAccess,
            asset: { asset: authorAuthority.asset, requiredCapabilities: [] },
            services: {},
          },
        }),
      )
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(unbox(root.toolBindings.snapshot({ scope: 'system' }))).toHaveLength(0)
    } finally {
      source.resolve(fail({ kind: 'unavailable', diagnostic: 'test ended' }))
      await root.fiber.dispose()
    }
  })

  it('does not take ownership of an author under another parent', async () => {
    const { root, plugin } = await assembly()
    try {
      const { key } = unbox(
        await root.toolGenerations.ensureLoaded({
          authority: authorAuthority,
          access: authorAccess,
        }),
      )
      const other = root.isolate('toolGenerations')
      await other.plugin(plugin)
      expect(await other.toolGenerations.unload({ key })).toHaveProperty(
        'failure.kind',
        'unavailable',
      )
      expect(unbox(root.toolBindings.snapshot({ scope: 'system' }))[0]?.state).toBe('live')
    } finally {
      await root.fiber.dispose()
    }
  })
})
