import { AsyncLocalStorage } from 'node:async_hooks'
import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail } from '@omne-harness/operation-result'
import {
  ToolBindingsService,
  ToolCatalogService,
  type ToolContributionAuthority,
} from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalToolBindingRegistry } from './bindings.ts'
import { createLocalToolCatalog, type LocalToolCatalogInput } from './catalog.ts'
import { createLocalToolBindings, type LocalToolBindingsInput } from './executor-binding.ts'
import { captureToolCaller, checkEmptyToolConfig } from './cordis-host.ts'

export type LocalToolBindingsPluginInput<P, E, B extends ContentBlock> = Omit<
  LocalToolBindingsInput<P, E, B>,
  'registry' | 'catalog'
> &
  Pick<LocalToolCatalogInput<P>, 'availability'>

export type LocalToolBindingsPlugin<P, E, B extends ContentBlock> = {
  new (ctx: Context, config?: Readonly<Record<string, never>>): ToolBindingsService<P, B, E>
  readonly inject: ['toolContributionAuthority']
  readonly provide: 'toolBindings'
}

export function createLocalToolBindingsPlugin<P, E, B extends ContentBlock>(
  input: LocalToolBindingsPluginInput<P, E, B>,
): LocalToolBindingsPlugin<P, E, B> {
  return class LocalToolBindings extends ToolBindingsService<P, B, E> {
    static readonly inject: ['toolContributionAuthority'] = ['toolContributionAuthority']
    private readonly callers = new AsyncLocalStorage<string>()
    private readonly registry
    private readonly live: () => boolean
    readonly snapshot: ToolBindingsService<P, B, E>['snapshot']
    readonly pins: ToolBindingsService<P, B, E>['pins']
    readonly close: ToolBindingsService<P, B, E>['close']
    readonly reopen: ToolBindingsService<P, B, E>['reopen']
    readonly drain: ToolBindingsService<P, B, E>['drain']
    readonly inspect: ToolBindingsService<P, B, E>['inspect']
    readonly resolve: ToolBindingsService<P, B, E>['resolve']
    readonly recover: ToolBindingsService<P, B, E>['recover']

    constructor(ctx: Context, config?: Readonly<Record<string, never>>) {
      checkEmptyToolConfig(config)
      super(ctx)
      let retired = false
      this.live = () => !retired && (ctx.fiber.state === 1 || ctx.fiber.state === 2)
      ctx.effect(() => () => {
        retired = true
      })
      // The assembly fixes P; the service registry erases it to unknown.
      const verifier = ctx.toolContributionAuthority as ToolContributionAuthority<P>
      const registry = (this.registry = createLocalToolBindingRegistry<P, E, B>({
        verifier,
        fiber: () => this.callers.getStore() ?? null,
      }))
      const unavailable = () =>
        fail({
          kind: 'unavailable' as const,
          dependency: 'toolBindings',
          diagnostic: 'binding provider retired',
        })
      this.snapshot = scope => (this.live() ? registry.snapshot(scope) : unavailable())
      const unknownKey = () => fail({ kind: 'unknown-key' as const })
      this.pins = key => (this.live() ? registry.pins(key) : unknownKey())
      this.close = key => (this.live() ? registry.close(key) : unknownKey())
      this.reopen = key => (this.live() ? registry.reopen(key) : unknownKey())
      this.drain = key => (this.live() ? registry.drain(key) : unknownKey())
      const catalog = createLocalToolCatalog({ registry, availability: input.availability })
      const live = this.live
      class Catalog extends ToolCatalogService<P> {
        readonly inspect: ToolCatalogService<P>['inspect'] = async request => {
          if (!live()) return unavailable()
          const answer = await catalog.inspect(request)
          return live() ? answer : unavailable()
        }
        readonly usage: ToolCatalogService<P>['usage'] = async request => {
          if (!live()) return unavailable()
          const answer = await catalog.usage(request)
          return live() ? answer : unavailable()
        }
        readonly search: ToolCatalogService<P>['search'] = async request => {
          if (!live()) return unavailable()
          const answer = await catalog.search(request)
          return live() ? answer : unavailable()
        }
      }
      const exposed = new Catalog(ctx)
      const bindings = createLocalToolBindings({ ...input, registry, catalog: exposed })
      this.inspect = exposed.inspect
      this.resolve = request =>
        live() ? bindings.resolve(request) : Promise.resolve(unavailable())
      this.recover = request =>
        live() ? bindings.recover(request) : Promise.resolve(unavailable())
    }

    readonly register: ToolBindingsService<P, B, E>['register'] = function (
      this: LocalToolBindings,
      request,
    ) {
      const caller = this.ctx
      const uid = caller.fiber.uid
      if (!this.live() || uid === null || !captureToolCaller(caller)())
        return fail({ kind: 'unavailable', diagnostic: 'binding provider or caller retired' })
      const fiber = String(uid)
      return this.callers.run(fiber, () => {
        const contribution = this.registry.register(request)
        if ('failure' in contribution) return contribution
        caller.effect(
          () => () => {
            contribution.ok.release()
            if (caller.fiber.uid === null) this.registry.retire(fiber)
          },
          'toolBindings.register',
        )
        return contribution
      })
    }
  }
}
