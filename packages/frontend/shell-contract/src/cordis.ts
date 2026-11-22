import { CordisError, Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import {
  adopt,
  declare,
  type Adoption,
  type Contract,
  type Reference,
  type Registry,
} from '@omne-harness/dynamis'
import { DynamisRefused, type Made } from '@omne-harness/dynamis-cordis/cordis'
import type { ReactNode } from 'react'
import type { FigureBoard, FigureReport } from './figure-store.ts'
import type { ScopeSource, ShellLogin } from './host.ts'
import {
  pinnedClient,
  pointReader,
  referenceOf,
  referencesOf,
  type BoundOf,
  type Need,
} from './needs.ts'
import type { ServiceKey } from './service-key.ts'
import { entryOf, sameView, shellContracts, viewOf, type SlotView } from './placement.ts'
import {
  ShellAssemblyError,
  slots,
  type AttachedLayout,
  type ItemOf,
  type ShellSlots,
  type SlotConflict,
  type SlotName,
} from './slots.ts'
import type { Toast, ToastBoard } from './toast-store.ts'

type Withdrawing = Readonly<{ withdraw(owner: object): void }>

const NO_PAGE = { get: () => undefined, subscribe: () => () => undefined }

const SLOT_NAMES = Object.keys(slots) as SlotName[]

type Watcher = Readonly<{ slot: SlotName; listener: () => void }>

/** @owner packages/frontend/shell-contract */
export abstract class ShellService extends Service implements ShellSlots {
  static readonly provide = 'shell'
  static readonly inject = ['dynamis']
  abstract readonly login: ShellLogin
  abstract readonly scope: ScopeSource
  /** The callers whose scope already carries the take-down of their toasts, and of their report. */
  private readonly toastCallers = new WeakSet<object>()
  private readonly figureCallers = new WeakSet<object>()

  private readonly views = new Map<SlotName, SlotView>()
  private readonly watchers = new Set<Watcher>()
  private readonly required = new Map<string, Readonly<Record<string, Reference>>>()
  private readonly adoptionWatchers = new Set<() => void>()
  private adopted: Readonly<{ registry: Registry; of: Map<string, Adoption> }> | undefined

  constructor(ctx: Context) {
    super(ctx, ShellService.provide)
    const { dynamis } = ctx
    for (const slot of SLOT_NAMES) this.views.set(slot, viewOf(dynamis.registry(), slot))
    dynamis.put(shellContracts.map(contract => declare(contract)))
    ctx.on('dynamis-cordis/changed', registry => this.follow(registry))
  }

  contribute<K extends SlotName>(slot: K, item: ItemOf<K>): void {
    this.put(slot, item.id, instance => [entryOf(slot, item, instance)])
  }

  declare(contract: Contract): void {
    this.put('attached', contract.name, [declare(contract)])
  }

  items<K extends SlotName>(slot: K): readonly ItemOf<K>[] {
    return (this.views.get(slot) as SlotView<K>).items
  }

  conflicts(slot: SlotName): readonly SlotConflict[] {
    return (this.views.get(slot) as SlotView).conflicts
  }

  subscribe(slot: SlotName, listener: () => void): () => void {
    const watcher = { slot, listener }
    this.watchers.add(watcher)
    return () => void this.watchers.delete(watcher)
  }

  registry(): Registry {
    return this.ctx.dynamis.registry()
  }

  require(module: string, references: Readonly<Record<string, Reference>>): void {
    this.ctx.effect(() => {
      this.required.set(module, references)
      this.adopted = undefined
      return () => {
        this.required.delete(module)
        this.adopted = undefined
      }
    }, 'shell.require')
  }

  adoption(module: string): Adoption | undefined {
    const references = this.required.get(module)
    if (references === undefined) return undefined
    const registry = this.ctx.dynamis.registry()
    if (this.adopted?.registry !== registry) this.adopted = { registry, of: new Map() }
    const known = this.adopted.of.get(module)
    if (known !== undefined) return known
    const made = adopt(registry, references, [])
    this.adopted.of.set(module, made)
    return made
  }

  owner(slot: Exclude<SlotName, 'attached'>, id: string): string | undefined {
    const point = `shell.${slot}`
    return this.ctx.dynamis
      .registry()
      .placed.find(placed => placed.point === point && placed.id === (slot === 'gate' ? '' : id))
      ?.instance.fiber
  }

  watchAdoptions(listener: () => void): () => void {
    this.adoptionWatchers.add(listener)
    return () => void this.adoptionWatchers.delete(listener)
  }

  private put(slot: SlotName, id: string, made: Made): void {
    try {
      this.ctx.dynamis.put(made)
    } catch (error) {
      if (!(error instanceof DynamisRefused)) throw error
      const reason = error.reason === 'held' ? 'duplicate' : 'invalid'
      throw new ShellAssemblyError(slot, id, reason, error.message)
    }
  }

  private follow(registry: Registry): void {
    const changed = SLOT_NAMES.filter(slot => {
      const fresh = viewOf(registry, slot)
      if (sameView(this.views.get(slot) as SlotView, fresh)) return false
      this.views.set(slot, fresh)
      return true
    })
    for (const watcher of Array.from(this.watchers)) {
      if (!changed.includes(watcher.slot)) continue
      try {
        watcher.listener()
      } catch {
        this.ctx.logger.warn(`shell: a watcher of ${watcher.slot} threw`)
      }
    }
    for (const listener of Array.from(this.adoptionWatchers)) {
      try {
        listener()
      } catch {
        this.ctx.logger.warn('shell: a watcher of the adoptions threw')
      }
    }
  }

  /** Best effort and without a result: a toast shown is not a toast a person saw. */
  toast(toast: Toast): void {
    this.handOver(this.toasts(), this.toastCallers, 'shell.toast', (board, caller) =>
      board.show(caller, toast),
    )
  }

  /** Best effort and without a result: a report the shell holds is not a figure a person saw. */
  figure(report: FigureReport): void {
    this.handOver(this.figures(), this.figureCallers, 'shell.figure', (board, caller) =>
      board.report(caller, report),
    )
  }

  /** Gives a board what the calling module handed over; the caller's scope takes it back once. */
  private handOver<B extends Withdrawing>(
    board: B | undefined,
    callers: WeakSet<object>,
    label: string,
    give: (board: B, caller: object) => void,
  ): void {
    if (board === undefined) return
    const caller = this.ctx.fiber
    if (caller.committed === undefined) return
    if (!callers.has(caller) && !this.bindTakeDown(caller, board, callers, label)) return
    give(board, caller)
  }

  private bindTakeDown(
    caller: object,
    board: Withdrawing,
    callers: WeakSet<object>,
    label: string,
  ): boolean {
    try {
      this.ctx.effect(() => {
        callers.add(caller)
        return () => {
          callers.delete(caller)
          board.withdraw(caller)
        }
      }, label)
      return true
    } catch (error) {
      if (error instanceof CordisError && error.code === 'INACTIVE_EFFECT') return false
      throw error
    }
  }

  abstract navigate(pageId: string, subject?: string): void

  get page(): Readonly<{
    get(): string | undefined
    subscribe(listener: (page: string | undefined) => void): () => void
  }> {
    return NO_PAGE
  }

  abstract attached(anchor: string, subject: string): ReactNode

  abstract arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode

  /** A shell that draws toasts gives its board here; without one a toast is dropped. */
  protected toasts(): ToastBoard | undefined {
    return undefined
  }

  /** A shell that draws the figure gives its board here; without one a report is dropped. */
  protected figures(): FigureBoard | undefined {
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

export type InjectingUiModule<S extends Record<string, unknown>> = Readonly<{
  name: string
  inject: readonly (keyof S & string)[]
  apply: (shell: ShellService, services: Readonly<S>, provide: Provide) => void
}>

export type UiModuleDefinition<N extends Readonly<Record<string, Need>>> = Readonly<{
  name: string
  needs: N
  apply: (shell: ShellService, bound: BoundOf<N>, provide: Provide) => void
}>

function boundOf(shell: ShellService, registry: () => Registry, needs: Record<string, Need>) {
  const bound: Record<string, unknown> = {}
  for (const [slot, need] of Object.entries(needs)) {
    const reference = referenceOf(need)
    bound[slot] =
      need.kind === 'protocol'
        ? pinnedClient(registry, reference)
        : pointReader(registry, reference, listener => shell.watchAdoptions(listener))
  }
  return Object.freeze(bound)
}

export function defineUiModule<N extends Readonly<Record<string, Need>>>(
  definition: UiModuleDefinition<N>,
): Plugin.Object
export function defineUiModule<S extends Record<string, unknown> = Record<string, unknown>>(
  definition: InjectingUiModule<S>,
): Plugin.Object
export function defineUiModule(
  definition: UiModuleDefinition<Record<string, Need>> | InjectingUiModule<Record<string, unknown>>,
): Plugin.Object {
  const injected = 'inject' in definition ? definition.inject : []
  return {
    name: definition.name,
    inject: [ShellService.provide, ...injected],
    apply(ctx: Context) {
      const provide: Provide = (key, value) => {
        ctx.effect(() => ctx.reflect.provide(key, value), 'ui-module.provide')
      }
      if ('inject' in definition) {
        const lookup = ctx as unknown as { get(name: string): unknown }
        const services: Record<string, unknown> = {}
        for (const name of definition.inject) services[name] = lookup.get(name)
        definition.apply(ctx.shell, services, provide)
        return
      }
      ctx.shell.require(definition.name, referencesOf(definition.needs))
      const { shell } = ctx
      const registry = (): Registry => shell.registry()
      const bound = boundOf(ctx.shell, registry, definition.needs) as BoundOf<Record<string, Need>>
      definition.apply(ctx.shell, bound, provide)
    },
  }
}
