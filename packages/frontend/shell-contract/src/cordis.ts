import { CordisError, Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { ScopeSource, ShellLogin } from './host.ts'
import type { ServiceKey } from './service-key.ts'
import type { AttachedLayout, ItemOf, SlotName } from './slots.ts'
import type { Toast, ToastBoard } from './toast-store.ts'

/** @owner packages/frontend/shell-contract */
export abstract class ShellService extends Service {
  static readonly provide = 'shell'
  abstract readonly login: ShellLogin
  abstract readonly scope: ScopeSource
  /** The callers whose scope already carries the take-down of their toasts. */
  private readonly toastCallers = new WeakSet<object>()

  constructor(ctx: Context) {
    super(ctx, ShellService.provide)
  }

  contribute<K extends SlotName>(slot: K, item: ItemOf<K>): void {
    this.ctx.effect(() => this.place(slot, item), 'shell.contribute')
  }

  /** Best effort and without a result: a toast shown is not a toast a person saw. */
  toast(toast: Toast): void {
    const board = this.toasts()
    if (board === undefined) return
    const caller = this.ctx.fiber
    if (caller.committed === undefined) return
    if (!this.toastCallers.has(caller) && !this.bindToasts(caller, board)) return
    board.show(caller, toast)
  }

  private bindToasts(caller: object, board: ToastBoard): boolean {
    try {
      this.ctx.effect(() => {
        this.toastCallers.add(caller)
        return () => {
          this.toastCallers.delete(caller)
          board.withdraw(caller)
        }
      }, 'shell.toast')
      return true
    } catch (error) {
      if (error instanceof CordisError && error.code === 'INACTIVE_EFFECT') return false
      throw error
    }
  }

  abstract navigate(pageId: string, subject?: string): void

  abstract attached(anchor: string, subject: string): ReactNode

  abstract arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode

  protected abstract place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void

  /** A shell that draws toasts gives its board here; without one a toast is dropped. */
  protected toasts(): ToastBoard | undefined {
    return undefined
  }
}
export const shellKey = ShellService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: ShellService
  }
}

export type Provide = <T>(key: ServiceKey<T>, value: NoInfer<T>) => void

export type UiModuleDefinition<S extends Record<string, unknown>> = Readonly<{
  name: string
  inject: readonly (keyof S & string)[]
  apply: (shell: ShellService, services: Readonly<S>, provide: Provide) => void
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
      const provide: Provide = (key, value) => {
        ctx.effect(() => ctx.reflect.provide(key, value), 'ui-module.provide')
      }
      definition.apply(ctx.shell, services as S, provide)
    },
  }
}
