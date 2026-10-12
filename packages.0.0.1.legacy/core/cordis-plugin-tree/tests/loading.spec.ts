import { Context } from '@deepseek-ai/cordis'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import { expect, it } from 'vitest'
import { composePluginTree, type AssemblyDeclaration } from '../src/index.ts'
import { inspectPluginTree, loadPluginTree, preparePluginTree } from '../src/cordis.ts'

it.each(['reject', 'dispose'] as const)(
  'reports actual fixed fiber %s while loading and drains owned work before closing',
  async action => {
    const ctx = new Context()
    const entered = Promise.withResolvers<void>()
    const apply = Promise.withResolvers<void>()
    const closing = Promise.withResolvers<void>()
    const releaseClose = Promise.withResolvers<void>()
    let suffixStarted = false
    const declaration = (): AssemblyDeclaration => ({
      provides: [],
      requires: [],
      optional: [],
      dynamicProvides: [],
      dynamicRequires: [],
      claims: [],
    })
    const Config = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: (value: unknown) => ({ value }),
      },
    }
    const plugins = [
      {
        name: 'loading',
        Config,
        assemblyLifecycle: 1,
        inject: [ASSEMBLY_LIFETIME_SERVICE],
        describeAssembly: declaration,
        apply(inner: Context) {
          startAssemblyWork(
            inner,
            async () => {},
            async () => {
              closing.resolve()
              await releaseClose.promise
            },
          )
          entered.resolve()
          return apply.promise
        },
      },
      {
        name: 'suffix',
        Config,
        assemblyLifecycle: 1,
        inject: [ASSEMBLY_LIFETIME_SERVICE],
        describeAssembly: declaration,
        apply(inner: Context) {
          suffixStarted = true
          startAssemblyWork(
            inner,
            async () => {},
            async () => {},
          )
        },
      },
    ]
    const prepared = await preparePluginTree(
      composePluginTree(
        plugins.map((_, index) => ({
          id: `row-${index}`,
          plugin: { package: `test-${index}`, export: 'Managed' },
          config: {},
        })),
      ),
      {
        externalServices: [],
        resolveModule: async ref => ({ Managed: plugins[Number(ref.package.slice(5))] }),
      },
    )
    const lifetime = createAssemblyLifetime(prepared.ids, () => {})
    const handle = loadPluginTree(ctx, prepared, lifetime)
    try {
      await entered.promise
      const rows = inspectPluginTree(handle)
      expect(rows.map(row => row.id)).toEqual(['row-0'])
      const failure = expect(handle.ready).rejects.toMatchObject({
        code: 'apply-failed',
        rowId: 'row-0',
      })
      let disposed: ReturnType<(typeof rows)[number]['fiber']['dispose']> | undefined
      if (action === 'reject') apply.reject(new Error('private apply failure'))
      else {
        disposed = rows[0]!.fiber.dispose()
        apply.resolve()
      }
      await failure
      await closing.promise
      expect(lifetime.isCurrent()).toBe(false)
      expect(suffixStarted).toBe(false)
      let closed = false
      void handle.closed.then(() => {
        closed = true
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      expect(handle.dispose()).toBe(handle.closed)
      releaseClose.resolve()
      await handle.closed
      await disposed
    } finally {
      apply.resolve()
      releaseClose.resolve()
      await handle.dispose()
      await ctx.fiber.dispose()
    }
  },
)
