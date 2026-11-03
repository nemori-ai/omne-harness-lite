import { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail } from '@omne-harness/operation-result'
import {
  ToolGenerationsService,
  type ToolContributionAuthority,
} from '@omne-harness/tool-cordis-contract/cordis'
import type { ToolBindingRegistry } from '@omne-harness/tool-contract/provider'
import { createLocalToolGenerations, type LocalToolGenerationsInput } from './author-generations.ts'

export type LocalToolHostPluginInput<P, E, B extends ContentBlock> = Omit<
  LocalToolGenerationsInput<P, E, B>,
  'host' | 'registry' | 'verifier' | 'residency'
>

export type LocalToolHostPlugin<P, E, B extends ContentBlock> = {
  new (ctx: Context, config?: Readonly<Record<string, never>>): ToolGenerationsService<P, E, B>
  readonly inject: ['toolBindings', 'toolContributionAuthority', 'toolResidencyReader']
  readonly provide: 'toolGenerations'
}

export function checkEmptyToolConfig(config: unknown): void {
  if (config === undefined) return
  if (
    typeof config !== 'object' ||
    config === null ||
    Array.isArray(config) ||
    Object.keys(config).length !== 0
  )
    throw new TypeError('tool plugin configuration must be an empty object')
}

export function captureToolCaller(caller: Context): () => boolean {
  const snapshot = caller.fiber.store
  const dependencies = Object.entries(snapshot ?? {}).map(([name, impl]) => ({
    name,
    impl,
    scope: caller[Context.isolate][name],
  }))
  return () => {
    if (caller.fiber.store !== snapshot || (caller.fiber.state !== 1 && caller.fiber.state !== 2))
      return false
    return dependencies.every(({ name, impl, scope }) => {
      if (scope === undefined || caller.reflect.store[scope] !== impl || impl.fiber.state !== 2)
        return false
      try {
        return impl.check === undefined || impl.check.call(caller.get(name))
      } catch {
        return false
      }
    })
  }
}

export function createLocalToolHostPlugin<P, E, B extends ContentBlock>(
  input: LocalToolHostPluginInput<P, E, B>,
): LocalToolHostPlugin<P, E, B> {
  return class LocalToolHost extends ToolGenerationsService<P, E, B> {
    static readonly inject: LocalToolHostPlugin<P, E, B>['inject'] = [
      'toolBindings',
      'toolContributionAuthority',
      'toolResidencyReader',
    ]
    readonly ensureLoaded: ToolGenerationsService<P, E, B>['ensureLoaded']
    readonly unload: ToolGenerationsService<P, E, B>['unload']
    readonly sweep: ToolGenerationsService<P, E, B>['sweep']
    readonly loaderFor: ToolGenerationsService<P, E, B>['loaderFor']

    constructor(ctx: Context, config?: Readonly<Record<string, never>>) {
      checkEmptyToolConfig(config)
      super(ctx)
      // The assembly fixes P/E/B; Cordis stores services with erased type parameters.
      const erasedRegistry: unknown = ctx.toolBindings
      const registry = erasedRegistry as ToolBindingRegistry<P, E, B>
      const verifier = ctx.toolContributionAuthority as ToolContributionAuthority<P>
      const generations = createLocalToolGenerations({
        ...input,
        host: ctx,
        registry,
        verifier,
        residency: ctx.toolResidencyReader,
      })
      this.ensureLoaded = generations.ensureLoaded
      this.unload = generations.unload
      this.sweep = generations.sweep
      this.loaderFor = function (this: LocalToolHost, authority) {
        const caller = this.ctx
        const current = captureToolCaller(caller)
        let active = current()
        const unavailable = () =>
          fail({
            kind: 'unavailable' as const,
            dependency: 'toolGenerations',
            diagnostic: 'author activation retired',
          })
        const stopped = new Promise<ReturnType<typeof unavailable>>(resolve => {
          if (!active) return resolve(unavailable())
          caller.effect(
            () => () => {
              active = false
              resolve(unavailable())
            },
            'toolGenerations.loaderFor',
          )
        })
        const loader = generations.loaderFor(authority)
        return {
          load: async request => {
            if (!active || !current()) return unavailable()
            const answer = await Promise.race([loader.load(request), stopped])
            return active && current() ? answer : unavailable()
          },
        }
      }
    }
  }
}
