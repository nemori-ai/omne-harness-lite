import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import { expect, it } from 'vitest'
import { composePluginTree, type AssemblyDeclaration } from '../src/index.ts'
import { preparePluginTree, loadPluginTree } from '../src/cordis.ts'

const Config: StandardSchemaV1 = {
  '~standard': { version: 1, vendor: 'test', validate: value => ({ value }) },
}
const empty = (): AssemblyDeclaration => ({
  provides: [],
  requires: [],
  optional: [],
  dynamicProvides: [],
  dynamicRequires: [],
  claims: [],
})
class Capability extends Service {
  constructor(ctx: Context) {
    super(ctx, 'capability')
  }
}
function managed(declaration: AssemblyDeclaration, setup: (ctx: Context) => Promise<void>) {
  return {
    name: 'test-host',
    Config,
    assemblyLifecycle: 1,
    inject: [ASSEMBLY_LIFETIME_SERVICE],
    describeAssembly: () => declaration,
    apply(ctx: Context) {
      startAssemblyWork(
        ctx,
        () => setup(ctx),
        async () => {},
      )
    },
  }
}
async function prepared(plugins: readonly ReturnType<typeof managed>[]) {
  return preparePluginTree(
    composePluginTree(
      plugins.map((_, index) => ({
        id: `host-${index}`,
        plugin: { package: `test-${index}`, export: 'Managed' },
        config: {},
      })),
    ),
    {
      externalServices: [],
      resolveModule: async ref => ({ Managed: plugins[Number(ref.package.slice(5))] }),
    },
  )
}

it.each([false, true])(
  'separates child withdrawal from declared static responsibility (%s)',
  async dynamic => {
    const ctx = new Context()
    let child: Fiber | undefined
    const provider = managed(
      {
        ...empty(),
        ...(dynamic ? { dynamicProvides: ['capability'] } : { provides: ['capability'] }),
      },
      async inner => {
        child = inner.plugin(scope => {
          new Capability(scope)
        })
        await child
      },
    )
    const consumer = managed(
      {
        ...empty(),
        ...(dynamic ? { dynamicRequires: ['capability'] } : { requires: ['capability'] }),
      },
      async () => {},
    )
    const tree = await prepared([provider, consumer])
    const lifetime = createAssemblyLifetime(tree.ids, () => {})
    const handle = loadPluginTree(ctx, tree, lifetime)
    try {
      await handle.ready
      expect(ctx.get('capability')).toBeDefined()
      await child!.dispose()
      expect(ctx.get('capability')).toBeUndefined()
      expect(lifetime.isCurrent()).toBe(dynamic)
      if (!dynamic) expect((await handle.closed).complete).toBe(true)
    } finally {
      await handle.dispose()
      await ctx.fiber.dispose()
    }
  },
)

it('accepts absent dynamic capability and keeps ordinary contribution withdrawal local', async () => {
  const ctx = new Context()
  let contribution: Fiber | undefined
  const tree = await prepared([
    managed({ ...empty(), dynamicProvides: ['capability'] }, async inner => {
      contribution = inner.plugin(() => {})
      await contribution
    }),
    managed({ ...empty(), dynamicRequires: ['capability'] }, async () => {}),
  ])
  const lifetime = createAssemblyLifetime(tree.ids, () => {})
  const handle = loadPluginTree(ctx, tree, lifetime)
  try {
    await handle.ready
    expect(ctx.get('capability')).toBeUndefined()
    await contribution!.dispose()
    expect(lifetime.isCurrent()).toBe(true)
  } finally {
    await handle.dispose()
    await ctx.fiber.dispose()
  }
})

it.each([
  [
    'dynamic-provider/static-require',
    { dynamicProvides: ['capability'] },
    { requires: ['capability'] },
  ],
  [
    'dynamic-provider/static-optional',
    { dynamicProvides: ['capability'] },
    { optional: ['capability'] },
  ],
  [
    'static-provider/dynamic-require',
    { provides: ['capability'] },
    { dynamicRequires: ['capability'] },
  ],
] as const)(
  'rejects mixed lifetime projection before any apply: %s',
  async (_, provides, requires) => {
    let applied = 0
    await expect(
      prepared([
        managed({ ...empty(), ...provides }, async () => {
          applied++
        }),
        managed({ ...empty(), ...requires }, async () => {
          applied++
        }),
      ]),
    ).rejects.toMatchObject({ code: 'invalid-declaration', rowId: 'host-1' })
    expect(applied).toBe(0)
  },
)

it.each([
  { dynamicProvides: ['assemblyLifetime'] },
  { dynamicRequires: ['assemblyLifetime'] },
  { provides: ['capability'], dynamicProvides: ['capability'] },
  { optional: ['capability'], dynamicRequires: ['capability'] },
  { dynamicProvides: ['capability', 'capability'] },
] as const)('rejects conflicting or reserved dynamic declaration %j', async changes => {
  await expect(
    prepared([managed({ ...empty(), ...changes }, async () => {})]),
  ).rejects.toMatchObject({ code: 'invalid-declaration' })
})

it('requires a preceding declared dynamic provider without requiring live publication', async () => {
  await expect(
    prepared([managed({ ...empty(), dynamicRequires: ['capability'] }, async () => {})]),
  ).rejects.toMatchObject({ code: 'missing-service' })
  await expect(
    prepared([
      managed({ ...empty(), dynamicRequires: ['capability'] }, async () => {}),
      managed({ ...empty(), dynamicProvides: ['capability'] }, async () => {}),
    ]),
  ).rejects.toMatchObject({ code: 'service-order' })
})

it('keeps dynamic replacement local and compares stable static provider identity', async () => {
  const ctx = new Context()
  let scope: Context | undefined
  let child: Fiber | undefined
  const tree = await prepared([
    managed({ ...empty(), dynamicProvides: ['capability'] }, async inner => {
      scope = inner
      child = inner.plugin(value => {
        new Capability(value)
      })
      await child
    }),
    managed({ ...empty(), dynamicRequires: ['capability'] }, async () => {}),
  ])
  const lifetime = createAssemblyLifetime(tree.ids, () => {})
  const handle = loadPluginTree(ctx, tree, lifetime)
  try {
    await handle.ready
    await child!.dispose()
    const replacement = scope!.plugin(value => {
      new Capability(value)
    })
    await replacement
    expect(ctx.get('capability')).toBeDefined()
    expect(lifetime.isCurrent()).toBe(true)
  } finally {
    await handle.dispose()
    await ctx.fiber.dispose()
  }
  const next = new Context()
  const provider = next.plugin(value => {
    new Capability(value)
  })
  await provider
  const preparedStatic = await preparePluginTree(
    composePluginTree([
      { id: 'host', plugin: { package: 'test-static', export: 'Managed' }, config: {} },
    ]),
    {
      externalServices: ['capability'],
      resolveModule: async () => ({
        Managed: managed({ ...empty(), requires: ['capability'] }, async () => {}),
      }),
    },
  )
  const staticLifetime = createAssemblyLifetime(preparedStatic.ids, () => {})
  const staticHandle = loadPluginTree(next, preparedStatic, staticLifetime)
  try {
    await staticHandle.ready
    next.reflect.notify(['capability'])
    next.reflect.notify(['capability'])
    expect(staticLifetime.isCurrent()).toBe(true)
    await provider.dispose()
    expect(staticLifetime.isCurrent()).toBe(false)
    await staticHandle.closed
  } finally {
    await staticHandle.dispose()
    await next.fiber.dispose()
  }
})
