import { AsyncLocalStorage } from 'node:async_hooks'
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import {
  ScheduleQueriesService,
  ScheduleCommandsService,
} from '@omne-harness/schedule-cordis-contract/cordis'
import { createScheduleToolsPlugin } from '@omne-harness/schedule-tools/cordis'
import type { ScheduleToolEnvironment } from '@omne-harness/schedule-tools'
import {
  ToolBindingsService,
  ToolGenerationsService,
} from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalToolBindingRegistry } from '@omne-harness/tool-host-local'
import type { ToolMessageContentBlock, ToolAuthority } from '@omne-harness/tool-contract/provider'
import {
  access,
  adoption,
  authority,
  construction,
  loader,
  queries,
  commands,
  value,
  verifier,
} from './world.ts'

async function world(
  options: {
    query?: boolean
    reject?: boolean
    loading?: Promise<void>
    entered?: () => void
  } = {},
) {
  const root = new Context()
  const fibers = new AsyncLocalStorage<string>()
  const registry = createLocalToolBindingRegistry<
    string,
    ScheduleToolEnvironment,
    ToolMessageContentBlock
  >({ verifier, fiber: () => fibers.getStore() ?? null })
  const unavailable = async () =>
    fail({
      kind: 'unavailable' as const,
      dependency: 'fixture',
      diagnostic: 'unused in contribution fixture',
    })
  class Bindings extends ToolBindingsService<
    string,
    ToolMessageContentBlock,
    ScheduleToolEnvironment
  > {
    readonly register: typeof registry.register = function (this: Bindings, input) {
      return fibers.run(String(this.ctx.fiber.uid), () => registry.register(input))
    }
    readonly snapshot = registry.snapshot
    readonly pins = registry.pins
    readonly close = registry.close
    readonly reopen = registry.reopen
    readonly drain = registry.drain
    readonly inspect = unavailable
    readonly resolve = unavailable
    readonly recover = unavailable
  }
  class Generations extends ToolGenerationsService<
    string,
    ScheduleToolEnvironment,
    ToolMessageContentBlock
  > {
    readonly ensureLoaded = unavailable
    readonly unload = unavailable
    readonly sweep = unavailable
    readonly loaderFor = (origin: ToolAuthority) => ({
      load: async (input: Parameters<ReturnType<typeof loader>['load']>[0]) => {
        options.entered?.()
        await options.loading
        return options.reject
          ? fail({ kind: 'denied' as const, action: 'fixture-load' })
          : loader(origin).load(input)
      },
    })
  }
  class Query extends ScheduleQueriesService {
    readonly list = queries.list
    readonly get = queries.get
    readonly revisions = queries.revisions
    readonly executions = queries.executions
    readonly agenda = queries.agenda
    readonly preview = queries.preview
  }
  class Commands extends ScheduleCommandsService {
    readonly create = commands.create
    readonly execute = commands.execute
    readonly queryOperation = commands.queryOperation
  }
  await root.plugin(Commands)
  await root.plugin(Bindings)
  await root.plugin(Generations)
  const provider = options.query === false ? undefined : root.plugin(Query)
  await provider
  const plugin = createScheduleToolsPlugin({
    access: access(),
    asset: { asset: authority.asset, requiredCapabilities: ['schedule.read', 'schedule.write'] },
    services: {},
  })
  const config = { authority, settings: adoption, construction }
  return { root, provider, registry, plugin, config, Query }
}

it('contributes through the real loader and registry and withdraws on provider removal', async () => {
  const w = await world()
  try {
    const first = w.root.plugin(w.plugin, w.config)
    await first
    expect(value(w.registry.snapshot({ scope: 'system' }))).toHaveLength(1)
    const otherAuthority = { ...authority, asset: { ...authority.asset, name: 'OtherSchedule' } }
    const other = w.root.plugin(
      createScheduleToolsPlugin({
        access: access(),
        asset: {
          asset: otherAuthority.asset,
          requiredCapabilities: ['schedule.read', 'schedule.write'],
        },
        services: {},
      }),
      { ...w.config, authority: otherAuthority },
    )
    await other
    await first.restart()
    expect(value(w.registry.snapshot({ scope: 'system' }))).toHaveLength(2)
    await first.dispose()
    expect(value(w.registry.snapshot({ scope: 'system' })).map(row => row.key.asset.name)).toEqual([
      'OtherSchedule',
    ])
    await w.provider?.dispose()
    expect(value(w.registry.snapshot({ scope: 'system' }))).toHaveLength(0)
  } finally {
    await w.root.fiber.dispose()
  }
})

it('leaves no contribution without the required query provider or after a loader rejection', async () => {
  for (const options of [{ query: false }, { reject: true }]) {
    const w = await world(options)
    try {
      const fiber = w.root.plugin(w.plugin, w.config)
      if ('reject' in options)
        await expect(Promise.resolve(fiber)).rejects.toThrow('author contribution: denied')
      else await fiber
      expect(value(w.registry.snapshot({ scope: 'system' }))).toHaveLength(0)
      expect(fiber.state).not.toBe(2)
    } finally {
      await w.root.fiber.dispose()
    }
  }
})

it('cannot register after disposal during asynchronous loading', async () => {
  const gate = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  const w = await world({ loading: gate.promise, entered: () => entered.resolve() })
  try {
    const fiber = w.root.plugin(w.plugin, w.config)
    const observed = Promise.resolve(fiber).then(
      () => null,
      error => error,
    )
    await entered.promise
    const disposed = fiber.dispose()
    gate.resolve()
    await disposed
    expect(await observed).toBeInstanceOf(Error)
    expect(value(w.registry.snapshot({ scope: 'system' }))).toHaveLength(0)
  } finally {
    gate.resolve()
    await w.root.fiber.dispose()
  }
})

it('rejects missing read capability and unrelated capabilities without registration', async () => {
  const w = await world()
  try {
    for (const requiredCapabilities of [
      [],
      ['schedule.read'],
      ['schedule.write'],
      ['schedule.read', 'schedule.write', 'extra'],
    ]) {
      const plugin = createScheduleToolsPlugin({
        access: access(),
        asset: { asset: authority.asset, requiredCapabilities },
        services: {},
      })
      await expect(Promise.resolve(w.root.plugin(plugin, w.config))).rejects.toThrow(
        'require schedule.read and schedule.write',
      )
      expect(value(w.registry.snapshot({ scope: 'system' }))).toHaveLength(0)
    }
  } finally {
    await w.root.fiber.dispose()
  }
})

it('contributes after late dependency arrival and replaces its contribution after provider replacement', async () => {
  const w = await world({ query: false })
  try {
    const consumer = w.root.plugin(w.plugin, w.config)
    await consumer
    expect(value(w.registry.snapshot({ scope: 'system' }))).toHaveLength(0)
    const first = w.root.plugin(w.Query)
    await first
    await consumer
    const before = value(w.registry.snapshot({ scope: 'system' }))
    expect(before).toHaveLength(1)
    await first.dispose()
    expect(value(w.registry.snapshot({ scope: 'system' }))).toHaveLength(0)
    await w.root.plugin(w.Query)
    await consumer
    const after = value(w.registry.snapshot({ scope: 'system' }))
    expect(after).toHaveLength(1)
    expect(after[0]?.ordinal).not.toEqual(before[0]?.ordinal)
  } finally {
    await w.root.fiber.dispose()
  }
})
