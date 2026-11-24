import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ExtensionImplementations } from '@omne-harness/agent-contract'
import { ExtensionImplementationsService } from '@omne-harness/agent-cordis-contract/cordis'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { definePlugin, type StandardSchema } from '@omne-harness/kernel-basis/cordis'
import type {
  BuiltinExtensions,
  EnabledExtensionsViews,
  ExtensionSources,
} from '@omne-harness/loop-extension-contract'
import {
  BuiltinExtensionsService,
  EnabledExtensionsViewsService,
  loopExtensionRunLocationsKey,
  loopExtensionSourcesKey,
} from '@omne-harness/loop-extension-cordis-contract/cordis'
import { createBuiltinExtensions } from './builtins.ts'
export { loopExtensionCategoryPlugin } from './category.ts'
import { createCommandHost } from './commands.ts'
import { createExtensionImplementations } from './implementations.ts'
import { createEnabledExtensionsViews } from './views.ts'

export type LoopExtensionHostConfig = Readonly<{
  /** With these three the host runs command implementations; without them it runs builtin ones only. */
  commands?: Readonly<{
    interpreters: Readonly<Record<string, string>>
    env: Readonly<Record<string, string>>
    stateDirectory: string
  }>
}>

const texts = (value: unknown): value is Readonly<Record<string, string>> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(item => typeof item === 'string')

function judgeConfig(value: unknown): LoopExtensionHostConfig | string {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) return 'configuration is not an object'
  const fields = Reflect.ownKeys(value)
  if (fields.some(field => field !== 'commands')) return 'configuration accepts only `commands`'
  const commands: unknown = Reflect.get(value, 'commands')
  if (commands === undefined) return {}
  if (typeof commands !== 'object' || commands === null) return 'commands: not an object'
  const { interpreters, env, stateDirectory } = commands as Record<string, unknown>
  if (!texts(interpreters)) return 'commands.interpreters: not a table of paths'
  if (!Object.values(interpreters).every(path => isAbsolute(path)))
    return 'commands.interpreters: a path is not absolute'
  if (!texts(env)) return 'commands.env: not a table of texts'
  if (typeof stateDirectory !== 'string' || !isAbsolute(stateDirectory))
    return 'commands.stateDirectory: not an absolute path'
  return { commands: { interpreters, env, stateDirectory } }
}

const hostConfig: StandardSchema<LoopExtensionHostConfig> = {
  '~standard': {
    version: 1,
    vendor: 'omne-harness',
    validate(value: unknown) {
      const judged = judgeConfig(value)
      return typeof judged === 'string' ? { issues: [{ message: judged }] } : { value: judged }
    },
  },
}

class HostViews extends EnabledExtensionsViewsService<unknown> {
  private readonly views: EnabledExtensionsViews<unknown>
  constructor(ctx: Context, views: EnabledExtensionsViews<unknown>) {
    super(ctx)
    this.views = views
  }
  read(...args: Parameters<EnabledExtensionsViews<unknown>['read']>) {
    return this.views.read(...args)
  }
}

class HostBuiltins extends BuiltinExtensionsService {
  private readonly builtins: BuiltinExtensions
  constructor(ctx: Context, builtins: BuiltinExtensions) {
    super(ctx)
    this.builtins = builtins
  }
  register(...args: Parameters<BuiltinExtensions['register']>) {
    return this.builtins.register(...args)
  }
  get(...args: Parameters<BuiltinExtensions['get']>) {
    return this.builtins.get(...args)
  }
}

class HostImplementations extends ExtensionImplementationsService<unknown> {
  readonly resolve: ExtensionImplementations<unknown>['resolve']
  constructor(ctx: Context, implementations: ExtensionImplementations<unknown>) {
    super(ctx)
    this.resolve = input => implementations.resolve(input)
  }
}

// The sources are asked for on every call: while the assembly does not provide them, the answer is that they are away.
function sourcesOf(ctx: Context): ExtensionSources<unknown> {
  return { of: async access => ctx.get(loopExtensionSourcesKey)?.of(access) }
}

function commandHostOf(
  ctx: Context,
  sources: ExtensionSources<unknown>,
  config: LoopExtensionHostConfig,
) {
  if (config.commands === undefined) return undefined
  const { interpreters, env, stateDirectory } = config.commands
  return createCommandHost<unknown>({
    sources,
    interpreters,
    env,
    directory: stateDirectory,
    locations: {
      of: async input =>
        (await ctx.get(loopExtensionRunLocationsKey)?.of(input)) ?? { kind: 'unavailable' },
    },
    environment: () =>
      ctx.intercept(executionEnvironmentKey, { caller: 'integrator' }).get(executionEnvironmentKey),
  })
}

export const loopExtensionPlugin = definePlugin({
  name: 'loop-extension',
  Config: hostConfig,
  apply(ctx: Context, config: LoopExtensionHostConfig = {}) {
    const sources = sourcesOf(ctx)
    const builtins = createBuiltinExtensions()
    const views = createEnabledExtensionsViews({ sources })
    const commands = commandHostOf(ctx, sources, config)
    new HostBuiltins(ctx, builtins)
    new HostViews(ctx, views)
    new HostImplementations(
      ctx,
      createExtensionImplementations({
        sources,
        builtins,
        ...(commands === undefined ? {} : { commands: commands.implementations }),
      }),
    )
    ctx.effect(() => async () => {
      views.close()
      await commands?.close()
    })
  },
})
