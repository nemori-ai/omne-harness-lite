import type { Context } from '@deepseek-ai/cordis'
import type { ExtensionImplementations } from '@omne-harness/agent-contract'
import { ExtensionImplementationsService } from '@omne-harness/agent-cordis-contract/cordis'
import { definePlugin, type StandardSchema } from '@omne-harness/kernel-basis/cordis'
import type {
  BuiltinExtensions,
  EnabledExtensionsViews,
  ExtensionSources,
} from '@omne-harness/loop-extension-contract'
import {
  BuiltinExtensionsService,
  EnabledExtensionsViewsService,
  loopExtensionSourcesKey,
} from '@omne-harness/loop-extension-cordis-contract/cordis'
import { createBuiltinExtensions } from './builtins.ts'
import { createExtensionImplementations } from './implementations.ts'
import { createEnabledExtensionsViews } from './views.ts'

function isEmptyConfiguration(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value !== 'object') return false
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Reflect.ownKeys(value).length === 0
}

const emptyConfig: StandardSchema<object> = {
  '~standard': {
    version: 1,
    vendor: 'omne-harness',
    validate(value: unknown) {
      if (isEmptyConfiguration(value)) return { value: {} }
      return { issues: [{ message: 'configuration accepts no fields' }] }
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

export const loopExtensionPlugin = definePlugin({
  name: 'loop-extension',
  Config: emptyConfig,
  apply(ctx: Context) {
    const sources = sourcesOf(ctx)
    const builtins = createBuiltinExtensions()
    const views = createEnabledExtensionsViews({ sources })
    new HostBuiltins(ctx, builtins)
    new HostViews(ctx, views)
    new HostImplementations(ctx, createExtensionImplementations({ sources, builtins }))
    ctx.effect(() => () => views.close())
  },
})
