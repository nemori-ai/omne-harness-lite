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
    beforeResolve?: (authority: ToolAuthority) => Promise<void>
    resolvedAuthority?: (authority: ToolAuthority) => ToolAuthority
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
    await options.beforeResolve?.(authority)
    return succeed({
      module,
      config: {
        authority: options.resolvedAuthority?.(authority) ?? authority,
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

function reference(row: ToolBindingEntry): ToolResidencyReference {
  return { holder: 'resident', tenant: tenantA, shape: row.shape }
}

describe('author generation qualification', () => {
  it.each(['origin', 'admission', 'authority'] as const)(
    'rechecks %s after suspended source resolution before constructing an author',
    async change => {
      const entered = Promise.withResolvers<void>()
      const resume = Promise.withResolvers<void>()
      const original = scriptedVerifier([authorAuthority])
      const replacement = authorityFor({ kind: 'official' }, 'read_file', 'replacement', '2')
      let changed = false
      const verifier: LocalToolContributionVerifier<string> = {
        verify: authority =>
          changed && change === 'origin'
            ? fail({ kind: 'denied' })
            : changed && change === 'authority'
              ? succeed(replacement)
              : original.verify(authority),
        admits: (access, layer) =>
          changed && change === 'admission'
            ? fail({ kind: 'denied' })
            : original.admits(access, layer),
      }
      const fixture = await assemble({
        verifier,
        beforeResolve: async () => {
          entered.resolve()
          await resume.promise
        },
      })
      try {
        const pending = fixture.load()
        await entered.promise
        changed = true
        resume.resolve()
        expect(await pending).toEqual(
          change === 'authority'
            ? fail({ kind: 'invalid', reason: 'authority changed during source resolution' })
            : fail({ kind: 'denied' }),
        )
        expect(fixture.construct).not.toHaveBeenCalled()
        expect(fixture.register).not.toHaveBeenCalled()
        expect(fixture.rows()).toEqual([])
        expect(fixture.sourceResolve).toHaveBeenCalledTimes(1)
      } finally {
        resume.resolve()
        await fixture.root.fiber.dispose()
      }
    },
  )

  it('rejects a source that substitutes another key without publishing it', async () => {
    const replacement = authorityFor({ kind: 'official' }, 'read_file', 'replacement', '2')
    const fixture = await assemble({ resolvedAuthority: () => replacement })
    try {
      expect(await fixture.load()).toEqual(
        fail({ kind: 'invalid', reason: 'module source changed the authority' }),
      )
      expect(fixture.construct).not.toHaveBeenCalled()
      expect(fixture.register).not.toHaveBeenCalled()
      expect(fixture.rows()).toEqual([])
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('fails closed when the system registry becomes unreadable during source resolution', async () => {
    let unreadable = false
    const scopes: Parameters<Registry['snapshot']>[0][] = []
    const fixture = await assemble({
      beforeResolve: async () => {
        unreadable = true
      },
      registry: base => ({
        ...base,
        snapshot: scope => {
          scopes.push(scope)
          return unreadable
            ? fail({ kind: 'unavailable', diagnostic: 'registry offline' })
            : base.snapshot(scope)
        },
      }),
    })
    try {
      expect(await fixture.load()).toHaveProperty('failure.kind', 'unavailable')
      expect(scopes).toEqual([{ scope: 'system' }, { scope: 'system' }])
      expect(fixture.construct).not.toHaveBeenCalled()
      expect(fixture.register).not.toHaveBeenCalled()
      expect(fixture.rows()).toEqual([])
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('rejects loading while an unload scan has reopened a retained contribution', async () => {
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const fixture = await assemble({
      reader: {
        referencing: async () => {
          entered.resolve()
          await resume.promise
          return succeed({ items: [], next: null })
        },
      },
    })
    try {
      const { key } = unbox(await fixture.load())
      const unloading = fixture.generations.unload({ key })
      await entered.promise
      unbox(fixture.registry.reopen(key))
      expect(await fixture.load()).toHaveProperty('failure.kind', 'unavailable')
      expect(fixture.construct).toHaveBeenCalledTimes(1)
      expect(fixture.register).toHaveBeenCalledTimes(1)
      expect(fixture.rows()).toHaveLength(1)
      resume.resolve()
      expect(await unloading).toEqual(succeed({ state: 'released' }))
      expect(fixture.rows()).toEqual([])
    } finally {
      resume.resolve()
      await fixture.root.fiber.dispose()
    }
  })
})

describe('author generation serving replacements', () => {
  const cases: readonly {
    name: string
    layer: SourceLayer
    state: 'live' | 'draining'
    sameShape: boolean
    expected: 'retained' | 'released'
  }[] = [
    {
      name: 'official',
      layer: { kind: 'official' },
      state: 'live',
      sameShape: true,
      expected: 'released',
    },
    {
      name: 'own organization',
      layer: { kind: 'organization', organization: tenantA.organization },
      state: 'live',
      sameShape: true,
      expected: 'released',
    },
    {
      name: 'another organization',
      layer: { kind: 'organization', organization: tenantB.organization },
      state: 'live',
      sameShape: true,
      expected: 'retained',
    },
    {
      name: 'same tenant',
      layer: { kind: 'tenant', tenant: tenantA },
      state: 'live',
      sameShape: true,
      expected: 'released',
    },
    {
      name: 'another account in own organization',
      layer: { kind: 'tenant', tenant: tenantA2 },
      state: 'live',
      sameShape: true,
      expected: 'retained',
    },
    {
      name: 'another tenant organization',
      layer: { kind: 'tenant', tenant: tenantB },
      state: 'live',
      sameShape: true,
      expected: 'retained',
    },
    {
      name: 'draining official',
      layer: { kind: 'official' },
      state: 'draining',
      sameShape: true,
      expected: 'retained',
    },
    {
      name: 'different shape',
      layer: { kind: 'official' },
      state: 'live',
      sameShape: false,
      expected: 'retained',
    },
  ]
  it.each(cases)('protects holders with a $name replacement', async test => {
    const replacement = authorityFor(test.layer, 'read_file', 'replacement', '2')
    let references: readonly ToolResidencyReference[] = []
    const scans = vi.fn<ToolResidencyReader['referencing']>(async () =>
      succeed({ items: references, next: null }),
    )
    const fixture = await assemble({
      authorities: [authorAuthority, replacement],
      reader: { referencing: scans },
    })
    try {
      const { key } = unbox(await fixture.load())
      const original = fixture.rows()[0]
      if (original === undefined) throw new Error('missing original author')
      references = [
        {
          ...reference(original),
          shape: test.sameShape ? original.shape : { ...original.shape, name: 'other_tool' },
        },
      ]
      unbox(await fixture.load(replacement))
      if (test.state === 'draining') unbox(fixture.registry.close(keyOf(replacement)))
      expect(await fixture.generations.unload({ key })).toEqual(succeed({ state: test.expected }))
      expect(scans).toHaveBeenCalledExactlyOnceWith({ scope: 'system', key, after: null })
      const rows = fixture.rows()
      expect(rows).toHaveLength(test.expected === 'retained' ? 2 : 1)
      expect(rows.find(row => row.fiber === original.fiber)?.state).toBe(
        test.expected === 'retained' ? 'live' : undefined,
      )
      expect(rows.find(row => row.key.asset.adoption.revision === '2')?.state).toBe(test.state)
      expect(fixture.register).toHaveBeenCalledTimes(2)
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it.each(['own key', 'invalid holder tenant'] as const)(
    'retains when the only matching row is its %s',
    async scenario => {
      let references: readonly ToolResidencyReference[] = []
      const replacement = authorityFor({ kind: 'official' }, 'read_file', 'valid-replacement', '2')
      const fixture = await assemble({
        authorities: [authorAuthority, replacement],
        reader: { referencing: async () => succeed({ items: references, next: null }) },
      })
      try {
        const { key } = unbox(await fixture.load())
        const row = fixture.rows()[0]
        if (row === undefined) throw new Error('missing original author')
        references = [
          {
            ...reference(row),
            tenant:
              scenario === 'own key'
                ? tenantA
                : { ...tenantA, account: { ...tenantA.account, text: 'invalid' } },
          },
        ]
        if (scenario === 'invalid holder tenant') unbox(await fixture.load(replacement))
        const before = fixture.rows()
        expect(await fixture.generations.unload({ key })).toEqual(succeed({ state: 'retained' }))
        expect(fixture.rows()).toEqual(before)
        expect(fixture.register).toHaveBeenCalledTimes(scenario === 'own key' ? 1 : 2)
      } finally {
        await fixture.root.fiber.dispose()
      }
    },
  )
})

describe('author generation residency scan', () => {
  it.each(['holder', 'unavailable', 'throw', 'repeat', 'empty end'] as const)(
    'checks the second page before unloading when it contains %s',
    async second => {
      let references: readonly ToolResidencyReference[] = []
      const scans = vi.fn<ToolResidencyReader['referencing']>(async ({ after }) => {
        if (after === null) return succeed({ items: [], next: 'page-2' })
        if (second === 'unavailable') return fail({ kind: 'unavailable', diagnostic: 'offline' })
        if (second === 'throw') throw new Error('reader lost')
        return succeed({
          items: second === 'holder' ? references : [],
          next: second === 'repeat' ? 'page-2' : null,
        })
      })
      const fixture = await assemble({ reader: { referencing: scans } })
      try {
        const { key } = unbox(await fixture.load())
        const row = fixture.rows()[0]
        if (row === undefined) throw new Error('missing original author')
        references = [reference(row)]
        expect(await fixture.generations.unload({ key })).toEqual(
          succeed({ state: second === 'empty end' ? 'released' : 'retained' }),
        )
        expect(scans.mock.calls).toEqual([
          [{ scope: 'system', key, after: null }],
          [{ scope: 'system', key, after: 'page-2' }],
        ])
        expect(fixture.rows()).toEqual(second === 'empty end' ? [] : [row])
        expect(fixture.register).toHaveBeenCalledTimes(1)
      } finally {
        await fixture.root.fiber.dispose()
      }
    },
  )

  it('reopens without disposing when the post-page registry snapshot fails', async () => {
    let unreadable = false
    const drain = vi.fn<Registry['drain']>(() => succeed({ pins: '0', inflight: [] }))
    const fixture = await assemble({
      reader: {
        referencing: async () => {
          unreadable = true
          return succeed({ items: [], next: null })
        },
      },
      registry: base => ({
        ...base,
        drain,
        snapshot: scope =>
          unreadable
            ? fail({ kind: 'unavailable', diagnostic: 'snapshot failed' })
            : base.snapshot(scope),
      }),
    })
    try {
      const { key } = unbox(await fixture.load())
      const before = fixture.rows()
      expect(await fixture.generations.unload({ key })).toEqual(succeed({ state: 'retained' }))
      expect(fixture.rows()).toEqual(before)
      expect(drain).not.toHaveBeenCalled()
      expect(fixture.register).toHaveBeenCalledTimes(1)
    } finally {
      await fixture.root.fiber.dispose()
    }
  })
})

describe('author generation unload failures', () => {
  it('does not report unknown keys as released or touch another contribution', async () => {
    const close = vi.fn<Registry['close']>(() => succeed(undefined))
    const drain = vi.fn<Registry['drain']>(() => succeed({ pins: '0', inflight: [] }))
    const scans = vi.fn(emptyReader.referencing)
    const fixture = await assemble({
      reader: { referencing: scans },
      registry: base => ({ ...base, close, drain }),
    })
    try {
      unbox(await fixture.load())
      const before = fixture.rows()
      const absent = authorityFor({ kind: 'official' }, 'read_file', 'absent', '99')
      expect(await fixture.generations.unload({ key: keyOf(absent) })).toEqual(
        fail({ kind: 'unknown-key' }),
      )
      expect(fixture.rows()).toEqual(before)
      expect(close).not.toHaveBeenCalled()
      expect(drain).not.toHaveBeenCalled()
      expect(scans).not.toHaveBeenCalled()
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it.each(['close', 'drain'] as const)('preserves the author when %s fails', async operation => {
    const scans = vi.fn(emptyReader.referencing)
    const fixture = await assemble({
      reader: { referencing: scans },
      registry: base => ({ ...base, [operation]: () => fail({ kind: 'unknown-key' }) }),
    })
    try {
      const { key } = unbox(await fixture.load())
      const row = fixture.rows()[0]
      if (row === undefined) throw new Error('missing original author')
      expect(await fixture.generations.unload({ key })).toEqual(fail({ kind: 'unknown-key' }))
      expect(fixture.rows()).toEqual([
        { ...row, state: operation === 'close' ? 'live' : 'draining' },
      ])
      expect(scans).toHaveBeenCalledTimes(operation === 'close' ? 0 : 1)
      expect(fixture.register).toHaveBeenCalledTimes(1)
    } finally {
      await fixture.root.fiber.dispose()
    }
  })

  it('forgets a released handle and permits a new author generation', async () => {
    const fixture = await assemble()
    try {
      const { key } = unbox(await fixture.load())
      const first = fixture.rows()[0]
      expect(await fixture.generations.unload({ key })).toEqual(succeed({ state: 'released' }))
      expect(await fixture.generations.unload({ key })).toEqual(fail({ kind: 'unknown-key' }))
      expect(fixture.rows()).toEqual([])
      expect(await fixture.load()).toEqual(succeed({ key, state: 'loaded' }))
      expect(fixture.rows()).toHaveLength(1)
      expect(fixture.rows()[0]?.fiber).not.toBe(first?.fiber)
      expect(fixture.construct).toHaveBeenCalledTimes(2)
      expect(fixture.register).toHaveBeenCalledTimes(2)
      expect(await fixture.generations.unload({ key })).toEqual(succeed({ state: 'released' }))
      expect(fixture.rows()).toEqual([])
    } finally {
      await fixture.root.fiber.dispose()
    }
  })
})
