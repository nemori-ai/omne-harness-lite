import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { ScopeSource, ShellLogin } from './host.ts'
import type { AttachedLayout, ItemOf, SlotName } from './slots.ts'

/** @owner packages/frontend/shell-contract */
export abstract class ShellService extends Service {
  static readonly provide = 'shell'
  abstract readonly login: ShellLogin
  abstract readonly scope: ScopeSource

  constructor(ctx: Context) {
    super(ctx, ShellService.provide)
  }

  contribute<K extends SlotName>(slot: K, item: ItemOf<K>): void {
    this.ctx.effect(() => this.place(slot, item), 'shell.contribute')
  }

  abstract navigate(pageId: string): void

  abstract attached(anchor: string, subject: string): ReactNode

  abstract arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode

  protected abstract place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void
}
export const shellKey = ShellService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: ShellService
  }
}

export type UiModuleDefinition<S extends Record<string, unknown>> = Readonly<{
  name: string
  inject: readonly (keyof S & string)[]
  apply: (shell: ShellService, services: Readonly<S>) => void
}>

export function defineUiModule<S extends Record<string, unknown> = Record<string, unknown>>(
  definition: UiModuleDefinition<S>,
): Plugin.Object {
  return {
    name: definition.name,
    inject: [ShellService.provide, ...definition.inject],
    apply(ctx: Context) {
      const lookup = ctx as unknown as { get(name: string): unknown }
      const services: Record<string, unknown> = {}
      for (const name of definition.inject) services[name] = lookup.get(name)
      definition.apply(ctx.shell, services as S)
    },
  }
}
