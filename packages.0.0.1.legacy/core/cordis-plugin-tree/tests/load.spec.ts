import { Context, Service } from '@deepseek-ai/cordis'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import { describe, expect, it } from 'vitest'
import { composePluginTree, type AssemblyDeclaration } from '../src/index.ts'
import { preparePluginTree, loadPluginTree, inspectPluginTree } from '../src/cordis.ts'

const Config: StandardSchemaV1 = {
  '~standard': { version: 1, vendor: 'test', validate: value => ({ value }) },
}
const declaration = (optional: readonly string[] = []): AssemblyDeclaration => ({
  provides: [],
  requires: [],
  optional,
  dynamicProvides: [],
  dynamicRequires: [],
  claims: [],
})
function managed(
  setup: () => Promise<void>,
  close: () => Promise<void>,
  optional: readonly string[] = [],
) {
  return {
    name: 'test-managed',
    Config,
    assemblyLifecycle: 1,
    inject: [ASSEMBLY_LIFETIME_SERVICE],
    describeAssembly: () => declaration(optional),
    apply(ctx: Context) {
      startAssemblyWork(ctx, setup, close)
    },
  }
}
const ctx = () => new Context()
class ExtraService extends Service {
  constructor(context: Context) {
    super(context, 'extra')
  }
}
async function prepare(plugins: readonly ReturnType<typeof managed>[]) {
  return preparePluginTree(
    composePluginTree(
      plugins.map((_, index) => ({
        id: `row-${index}`,
        plugin: { package: `test-${index}`, export: 'managed' },
        config: {},
      })),
    ),
    {
      externalServices: [],
      resolveModule: async reference => ({ managed: plugins[Number(reference.package.slice(5))] }),
    },
  )
}
describe('owned plugin tree lifecycle', () => {
  it('ends the generation on conditional child withdrawal and waits for owned work', async () => {
    const context = ctx(),
      release = Promise.withResolvers<void>()
    const provider = context.plugin(inner => {
      new ExtraService(inner)
    })
    await provider
    const plugin = {
      name: 'conditional',
      Config,
      assemblyLifecycle: 1,
      inject: [ASSEMBLY_LIFETIME_SERVICE],
      describeAssembly: (): AssemblyDeclaration => ({ ...declaration(), requires: ['extra'] }),
      apply(inner: Context) {
        startAssemblyWork(
          inner,
          async () => {
            await inner.inject(['extra'], () => {})
          },
          () => release.promise,
        )
      },
    }
    const prepared = await preparePluginTree(
      composePluginTree([
        { id: 'a', plugin: { package: 'conditional', export: 'Managed' }, config: {} },
      ]),
      { externalServices: ['extra'], resolveModule: async () => ({ Managed: plugin }) },
    )
    const lifetime = createAssemblyLifetime(prepared.ids, () => {})
    const handle = loadPluginTree(context, prepared, lifetime)
    try {
      await handle.ready
      await provider.dispose()
      expect(lifetime.isCurrent()).toBe(false)
      let closed = false
      void handle.closed.then(() => {
        closed = true
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      release.resolve()
      await handle.closed
    } finally {
      release.resolve()
      await handle.dispose()
      await context.fiber.dispose()
    }
  })
  it('reports setup failure before prefix close and retains both failures', async () => {
    const context = ctx(),
      release = Promise.withResolvers<void>(),
      closing = Promise.withResolvers<void>()
    let suffixStarted = false
    const prepared = await prepare([
      managed(
        async () => {},
        async () => {
          closing.resolve()
          await release.promise
          throw new Error('close')
        },
      ),
      managed(
        async () => {
          throw new Error('setup')
        },
        async () => {},
      ),
      managed(
        async () => {
          suffixStarted = true
        },
        async () => {},
      ),
    ])
    const handle = loadPluginTree(
      context,
      prepared,
      createAssemblyLifetime(prepared.ids, () => {}),
    )
    try {
      await expect(handle.ready).rejects.toMatchObject({ code: 'apply-failed', rowId: 'row-1' })
      await closing.promise
      let finished = false
      void handle.closed.then(() => {
        finished = true
      })
      await Promise.resolve()
      expect(finished).toBe(false)
      expect(suffixStarted).toBe(false)
      expect(inspectPluginTree(handle).map(item => item.id)).toEqual(['row-0', 'row-1'])
      release.resolve()
      expect((await handle.closed).rows.map(item => item.result)).toEqual([
        { kind: 'failed', codes: ['setup'] },
        { kind: 'failed', codes: ['close'] },
      ])
    } finally {
      release.resolve()
      await handle.dispose()
      await context.fiber.dispose()
    }
  })
  it('stops on new optional ownership but ignores a foreign isolated provider', async () => {
    const context = ctx()
    const prepared = await prepare([
      managed(
        async () => {},
        async () => {},
        ['extra'],
      ),
    ])
    const lifetime = createAssemblyLifetime(prepared.ids, () => {})
    const handle = loadPluginTree(context, prepared, lifetime)
    try {
      await handle.ready
      const foreign = context.isolate('extra').plugin(inner => {
        new ExtraService(inner)
      })
      await foreign
      expect(lifetime.isCurrent()).toBe(true)
      await foreign.dispose()
      const local = context.plugin(inner => {
        new ExtraService(inner)
      })
      await local
      expect(lifetime.isCurrent()).toBe(false)
      await handle.closed
      await local.dispose()
    } finally {
      await handle.dispose()
      await context.fiber.dispose()
    }
  })
})
