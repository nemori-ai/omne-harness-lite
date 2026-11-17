import { type Context, Service } from '@deepseek-ai/cordis'
import type {
  BuiltinExtensions,
  EnabledExtensionsViews,
  ExtensionSources,
  RunLocations,
} from '@omne-harness/loop-extension-contract'

/**
 * The view of the extensions a tenant has enabled, as a service.
 *
 * @owner packages/loop-extension/loop-extension-cordis-contract
 */
export abstract class EnabledExtensionsViewsService<P>
  extends Service
  implements EnabledExtensionsViews<P>
{
  static readonly provide = 'loopExtensionViews'
  constructor(ctx: Context) {
    super(ctx, EnabledExtensionsViewsService.provide)
  }
  abstract read(
    ...args: Parameters<EnabledExtensionsViews<P>['read']>
  ): ReturnType<EnabledExtensionsViews<P>['read']>
}

export const loopExtensionViewsKey = EnabledExtensionsViewsService.provide

/**
 * The registry of builtin implementations, as a service. A release registers its functions here.
 *
 * @owner packages/loop-extension/loop-extension-cordis-contract
 */
export abstract class BuiltinExtensionsService extends Service implements BuiltinExtensions {
  static readonly provide = 'loopExtensionBuiltins'
  constructor(ctx: Context) {
    super(ctx, BuiltinExtensionsService.provide)
  }
  abstract register(
    ...args: Parameters<BuiltinExtensions['register']>
  ): ReturnType<BuiltinExtensions['register']>
  abstract get(...args: Parameters<BuiltinExtensions['get']>): ReturnType<BuiltinExtensions['get']>
}

export const loopExtensionBuiltinsKey = BuiltinExtensionsService.provide

/**
 * The port of the tenant sources, as a service. This group declares it; the assembly provides it.
 *
 * @owner packages/loop-extension/loop-extension-cordis-contract
 */
export abstract class ExtensionSourcesService<P> extends Service implements ExtensionSources<P> {
  static readonly provide = 'loopExtensionSources'
  constructor(ctx: Context) {
    super(ctx, ExtensionSourcesService.provide)
  }
  abstract of(...args: Parameters<ExtensionSources<P>['of']>): ReturnType<ExtensionSources<P>['of']>
}

export const loopExtensionSourcesKey = ExtensionSourcesService.provide

/**
 * The port of the run locations, as a service. This group declares it; the assembly provides it.
 *
 * @owner packages/loop-extension/loop-extension-cordis-contract
 */
export abstract class RunLocationsService<P> extends Service implements RunLocations<P> {
  static readonly provide = 'loopExtensionRunLocations'
  constructor(ctx: Context) {
    super(ctx, RunLocationsService.provide)
  }
  abstract of(...args: Parameters<RunLocations<P>['of']>): ReturnType<RunLocations<P>['of']>
}

export const loopExtensionRunLocationsKey = RunLocationsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    loopExtensionViews: EnabledExtensionsViewsService<unknown>
    loopExtensionBuiltins: BuiltinExtensionsService
    loopExtensionSources: ExtensionSourcesService<unknown>
    loopExtensionRunLocations: RunLocationsService<unknown>
  }
}
