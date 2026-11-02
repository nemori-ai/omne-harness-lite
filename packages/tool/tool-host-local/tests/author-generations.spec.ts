import { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolAuthority } from '@omne-harness/tool-contract/provider'
import type {
  ToolGenerations,
  ToolResidencyReader,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  ToolBindingsService,
  ToolGenerationsService,
} from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalToolGenerations } from '@omne-harness/tool-host-local/author'
import { describe, expect, it } from 'vitest'
import { createLocalToolBindings } from '@omne-harness/tool-host-local'
import { createIndependentToolScope } from '@omne-harness/tool'
import { completedFinal, createMemoryToolStartAuthority } from '@omne-harness/tool-contract/testing'
import { callId, evidence, instanceId, operationId, request } from './coordinator-values.ts'
import { authorityFor, fiberedRegistry, scriptedVerifier } from './binding-values.ts'
import {
  authorAccess,
  authorAuthority,
  authorLoader,
  authorModule,
  construction,
  settings,
  unbox,
} from './author-values.ts'

async function assembled(
  reader: ToolResidencyReader,
  badConstruction = false,
  options: {
    beforeResolve?: () => Promise<void>
    authorities?: readonly ToolAuthority[]
  } = {},
) {
  const root = new Context()
  const verifier = scriptedVerifier(options.authorities ?? [authorAuthority])
  class Bindings extends ToolBindingsService<string, ContentBlock, unknown> {
    readonly source = fiberedRegistry(verifier)
    readonly registry = this.source.registry
    readonly register: ToolBindingsService<string, ContentBlock, unknown>['register'] = function (
      this: Bindings,
      input,
    ) {
      return this.source.asFiber(String(this.ctx.fiber.uid), () => this.registry.register(input))
    }
    readonly snapshot = this.registry.snapshot
    readonly pins = this.registry.pins
    readonly close = this.registry.close
    readonly reopen = this.registry.reopen
    readonly drain = this.registry.drain
    readonly inspect: ToolBindingsService<string, ContentBlock, unknown>['inspect'] = async () =>
      fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'not used' })
    readonly resolve: ToolBindingsService<string, ContentBlock, unknown>['resolve'] = async () =>
      fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'not used' })
    readonly recover: ToolBindingsService<string, ContentBlock, unknown>['recover'] = async () =>
      fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'not used' })
  }
  await root.plugin(Bindings)
  const bindings = root.get('toolBindings') as Bindings
  const module = authorModule(async () => 'done')
  const generations = createLocalToolGenerations({
    host: root,
    registry: bindings.registry,
    verifier,
    residency: reader,
    loaderFor: authorLoader,
    recordRejection: async () => evidence('load-rejected'),
    source: {
      resolve: async authority => {
        await options.beforeResolve?.()
        return succeed({
          module,
          config: {
            authority,
            settings,
            construction: badConstruction ? { kind: 'null' } : construction,
          },
          context: {
            access: authorAccess,
            asset: { asset: authority.asset, requiredCapabilities: [] },
            services: {},
          },
        })
      },
    },
  })
  class Generations extends ToolGenerationsService<string, unknown, ContentBlock> {
    readonly ensureLoaded = generations.ensureLoaded
    readonly unload = generations.unload
    readonly sweep = generations.sweep
    readonly loaderFor = generations.loaderFor
  }
  await root.plugin(Generations)
  return { root, registry: bindings.registry, generations }
}

const emptyReader: ToolResidencyReader = {
  referencing: async () => succeed({ items: [], next: null }),
}
const ensure = (generations: ToolGenerations<string, unknown, ContentBlock>) =>
  generations.ensureLoaded({ authority: authorAuthority, access: authorAccess })

describe('Cordis author generations', () => {
  it('settles shared unloads when the host retires before a late reader rejection', async () => {
    const entered = Promise.withResolvers<void>()
    const page = Promise.withResolvers<Awaited<ReturnType<ToolResidencyReader['referencing']>>>()
    let scans = 0
    const { root, generations } = await assembled({
      referencing: async () => {
        scans += 1
        entered.resolve()
        return page.promise
      },
    })
    try {
      const { key } = unbox(await ensure(generations))
      const first = generations.unload({ key })
      await entered.promise
      const second = generations.unload({ key })
      await root.fiber.dispose()
      expect(await first).toHaveProperty('failure.kind', 'unavailable')
      expect(await second).toHaveProperty('failure.kind', 'unavailable')
      page.reject(new Error('late reader failure'))
      expect(await generations.unload({ key })).toHaveProperty('failure.kind', 'unavailable')
      expect(scans).toBe(1)
    } finally {
      page.resolve(succeed({ items: [], next: null }))
      await root.fiber.dispose()
    }
  })
  it('shares an unload scan even when the reader reenters unload', async () => {
    const entered = Promise.withResolvers<void>()
    const page = Promise.withResolvers<Awaited<ReturnType<ToolResidencyReader['referencing']>>>()
    let scans = 0
    let reenter: () => void = () => {}
    const { root, registry, generations } = await assembled({
      referencing: async () => {
        scans += 1
        if (scans > 1) return fail({ kind: 'unavailable', diagnostic: 'second scan failed' })
        reenter()
        entered.resolve()
        return page.promise
      },
    })
    try {
      const { key } = unbox(await ensure(generations))
      let second: ReturnType<typeof generations.unload> | undefined
      reenter = () => {
        second = generations.unload({ key })
      }
      const first = generations.unload({ key })
      await entered.promise
      expect(scans).toBe(1)
      expect(unbox(registry.snapshot({ scope: 'system' }))[0]?.state).toBe('draining')
      page.resolve(succeed({ items: [], next: null }))
      expect(await first).toEqual(succeed({ state: 'released' }))
      expect(await second).toEqual(succeed({ state: 'released' }))
      expect(scans).toBe(1)
      expect(unbox(registry.snapshot({ scope: 'system' }))).toHaveLength(0)
    } finally {
      page.resolve(succeed({ items: [], next: null }))
      await root.fiber.dispose()
    }
  })
  it.each(['draining', 'released'] as const)(
    'rechecks the registry after source resolution when unload has %s',
    async state => {
      const entered = Promise.withResolvers<void>()
      const resume = Promise.withResolvers<void>()
      let delayed = false
      const { root, registry, generations } = await assembled(emptyReader, false, {
        beforeResolve: async () => {
          if (!delayed) return
          entered.resolve()
          await resume.promise
        },
      })
      try {
        const { key } = unbox(await ensure(generations))
        const pin =
          state === 'draining' ? unbox(registry.pin(key, callId('delayed-source'))) : undefined
        delayed = true
        const loading = ensure(generations)
        await entered.promise
        expect(await generations.unload({ key })).toEqual(succeed({ state }))
        resume.resolve()
        expect(await loading).toEqual(
          state === 'draining' ? fail({ kind: 'draining' }) : succeed({ key, state: 'loaded' }),
        )
        expect(unbox(registry.snapshot({ scope: 'system' }))).toHaveLength(1)
        expect(unbox(registry.snapshot({ scope: 'system' }))[0]?.state).toBe(
          state === 'draining' ? 'draining' : 'live',
        )
        pin?.release()
      } finally {
        resume.resolve()
        await root.fiber.dispose()
      }
    },
  )
  it.each(['failure', 'throw'] as const)('retries after a shared residency %s', async failure => {
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    let scans = 0
    const { root, registry, generations } = await assembled({
      referencing: async () => {
        scans += 1
        if (scans > 1) return succeed({ items: [], next: null })
        entered.resolve()
        await resume.promise
        if (failure === 'throw') throw new Error('residency failed')
        return fail({ kind: 'unavailable', diagnostic: 'residency failed' })
      },
    })
    try {
      const { key } = unbox(await ensure(generations))
      const first = generations.unload({ key })
      await entered.promise
      const second = generations.unload({ key })
      resume.resolve()
      expect(await first).toEqual(succeed({ state: 'retained' }))
      expect(await second).toEqual(succeed({ state: 'retained' }))
      expect(scans).toBe(1)
      expect(unbox(registry.snapshot({ scope: 'system' }))[0]?.state).toBe('live')
      expect(await generations.unload({ key })).toEqual(succeed({ state: 'released' }))
      expect(scans).toBe(2)
    } finally {
      resume.resolve()
      await root.fiber.dispose()
    }
  })
  it('loads and unloads another key while the first scan is suspended', async () => {
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const other = authorityFor({ kind: 'official' }, 'read_file', 'holding-other', '2')
    const { root, generations } = await assembled(
      {
        referencing: async ({ key }) => {
          if (key.asset.adoption.revision === authorAuthority.asset.adoption.revision) {
            entered.resolve()
            await resume.promise
          }
          return succeed({ items: [], next: null })
        },
      },
      false,
      { authorities: [authorAuthority, other] },
    )
    try {
      const first = unbox(await ensure(generations))
      const pending = generations.unload({ key: first.key })
      await entered.promise
      const second = unbox(
        await generations.ensureLoaded({ authority: other, access: authorAccess }),
      )
      expect(second.state).toBe('loaded')
      expect(await generations.unload({ key: second.key })).toEqual(succeed({ state: 'released' }))
      resume.resolve()
      expect(await pending).toEqual(succeed({ state: 'released' }))
    } finally {
      resume.resolve()
      await root.fiber.dispose()
    }
  })
  it('does not treat an unreadable registry as an empty registry', async () => {
    const { root, registry } = await assembled(emptyReader)
    let resolutions = 0
    try {
      const generations = createLocalToolGenerations({
        host: root,
        registry: {
          ...registry,
          snapshot: () => fail({ kind: 'unavailable', diagnostic: 'registry absent' }),
        },
        verifier: scriptedVerifier([authorAuthority]),
        residency: emptyReader,
        loaderFor: authorLoader,
        recordRejection: async () => evidence('rejected'),
        source: {
          resolve: async () => {
            resolutions += 1
            return fail({ kind: 'unavailable', diagnostic: 'unused' })
          },
        },
      })
      expect(await ensure(generations)).toHaveProperty('failure.kind', 'unavailable')
      expect(resolutions).toBe(0)
    } finally {
      await root.fiber.dispose()
    }
  })
  it('executes the author registered by a real Cordis fiber through consume and final facts', async () => {
    const { root, registry, generations } = await assembled(emptyReader)
    try {
      const { key } = unbox(await ensure(generations))
      const listing = unbox(registry.listings(authorAccess))[0]
      if (listing === undefined) throw new Error('missing author listing')
      const fixed = request({
        availability: {
          kind: 'available',
          definition: listing.definition,
          executor: listing.executor,
          layer: key.layer,
        },
        settings,
      })
      const authority = createMemoryToolStartAuthority<string>()
      let result: unknown
      const bindings = createLocalToolBindings({
        registry,
        authority,
        catalog: { inspect: async () => succeed(fixed.availability) },
        scope: input =>
          unbox(
            createIndependentToolScope({
              signal: input.execution.signal,
              limits: {
                authorBufferBytes: 1000,
                authorBufferItems: 10,
                authorWaitHistoryBytes: 1000,
                authorWaitHistoryItems: 10,
              },
              process: null,
              waits: null,
            }),
          ),
        settle: async input => {
          result = input.outcome
          return succeed(completedFinal())
        },
      })
      const call = callId('cordis-call')
      const start = {
        kind: 'start' as const,
        operation: operationId('cordis-start'),
        executor: listing.executor,
        execution: { tenant: authorAccess.tenant, call, instance: instanceId, generation: '1' },
      }
      const input = { ...authorAccess, call, start, request: fixed }
      const binding = unbox(await bindings.resolve(input))
      const permit = unbox(await authority.prepare(input))
      const live = unbox(await binding.start({ ...input, permit }, {}))
      const iterator = live
        .facts({ after: null, signal: new AbortController().signal })
        [Symbol.asyncIterator]()
      const batch = (await iterator.next()).value
      if (batch === undefined) throw new Error('author emitted no final')
      expect(result).toEqual({ kind: 'returned', value: 'done' })
      expect(batch.events[0]?.fact.kind).toBe('final')
      expect(unbox(registry.pins(key))).toBe('1')
      unbox(
        await live.acknowledge({
          start: start.operation,
          batch: batch.batch,
          cursor: batch.cursor,
          custody: evidence('saved'),
        }),
      )
      expect(unbox(registry.pins(key))).toBe('0')
      await iterator.return?.()
    } finally {
      await root.fiber.dispose()
    }
  })
  it('loads a real author fiber, recalls it and disposes its own contribution', async () => {
    const { root, registry, generations } = await assembled(emptyReader)
    try {
      const first = unbox(await ensure(generations))
      expect(first.state).toBe('loaded')
      expect(unbox(await ensure(generations)).state).toBe('recognized')
      expect(unbox(registry.snapshot({ scope: 'system' }))).toHaveLength(1)
      const authorFiber = [...root.registry.values()]
        .flatMap(runtime => [...runtime.fibers])
        .find(fiber => fiber.name === 'tool-author')
      expect(unbox(registry.snapshot({ scope: 'system' }))[0]?.fiber).toBe(String(authorFiber?.uid))
      expect(await generations.unload({ key: first.key })).toEqual(succeed({ state: 'released' }))
      expect(unbox(registry.snapshot({ scope: 'system' }))).toHaveLength(0)
    } finally {
      await root.fiber.dispose()
    }
  })
  it('failed construction leaves no partial contribution', async () => {
    const { root, registry, generations } = await assembled(emptyReader, true)
    try {
      expect(await ensure(generations)).toEqual(
        fail({ kind: 'rejected', evidence: evidence('load-rejected') }),
      )
      expect(unbox(registry.snapshot({ scope: 'system' }))).toHaveLength(0)
    } finally {
      await root.fiber.dispose()
    }
  })
  it('keeps inflight work draining and releases only after the pin ends', async () => {
    const { root, registry, generations } = await assembled(emptyReader)
    try {
      const { key } = unbox(await ensure(generations))
      const pin = unbox(registry.pin(key, callId('call-inflight')))
      expect(await generations.unload({ key })).toEqual(succeed({ state: 'draining' }))
      expect(await ensure(generations)).toEqual(fail({ kind: 'draining' }))
      pin.release()
      expect(await generations.unload({ key })).toEqual(succeed({ state: 'released' }))
    } finally {
      await root.fiber.dispose()
    }
  })
  it('retains and reopens when residency cannot be read', async () => {
    const { root, registry, generations } = await assembled({
      referencing: async () => fail({ kind: 'unavailable', diagnostic: 'bridge absent' }),
    })
    try {
      const { key } = unbox(await ensure(generations))
      expect(await generations.unload({ key })).toEqual(succeed({ state: 'retained' }))
      expect(unbox(registry.snapshot({ scope: 'system' }))[0]?.state).toBe('live')
    } finally {
      await root.fiber.dispose()
    }
  })
})
