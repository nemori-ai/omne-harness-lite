import { CordisError, Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import {
  adopt,
  declare,
  standingOf,
  type Adoption,
  type Contract,
  type Entry,
  type Reference,
  type Registry,
  type Scope,
} from '@omne-harness/dynamis'
import { DynamisRefused, type Made } from '@omne-harness/dynamis-cordis/cordis'
import type { ReactNode } from 'react'
import {
  changesOn,
  laidOut,
  layoutContract,
  layoutEntry,
  renderContract,
  renderEntry,
  styleContract,
  styleEntry,
  tenantScope,
  tokensContract,
  tokensEntry,
  type Changes,
  type PartStyle,
} from './change.ts'
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
import {
  PART_ATTRIBUTE,
  partEntry,
  partFault,
  partHostOf,
  partsContract,
  type PartDeclaration,
  type PartRender,
} from './part.ts'
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

const offered = (name: string): Contract => ({
  name,
  tree: 'client',
  arity: 'one',
  keyFrom: null,
  key: 'none',
  gives: 'what the view module that declares it provides to other view modules',
  item: { kind: 'pure', fields: {} },
  resolve: 'conflict',
  binding: 'run',
  onError: 'a module that needs it does without it, or is drawn as lacking it',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  summary: `What one view module provides to the others under ${name}.`,
})

function adoptOn(registry: Registry, references: Readonly<Record<string, Reference>>): Adoption {
  const absent = Object.entries(references)
    .filter(
      ([, { optional, point }]) =>
        optional === true && standingOf(registry, point, []).kind === 'undeclared',
    )
    .map(([slot]) => slot)
  const asked = Object.entries(references).filter(([slot]) => !absent.includes(slot))
  const made = adopt(registry, Object.fromEntries(asked), [])
  if (made.kind !== 'adopted' || absent.length === 0) return made
  const empty = Object.fromEntries(absent.map(slot => [slot, null]))
  return { kind: 'adopted', bindings: { ...made.bindings, ...empty } }
}

const CONTRACTS = [
  ...shellContracts,
  partsContract,
  tokensContract,
  styleContract,
  renderContract,
  layoutContract,
]

function checkedPart(declaration: PartDeclaration, host: string): Entry {
  const drawn = host === 'shell' && declaration.depths.includes('render')
  const fault = drawn ? 'a part of the shell does not open render' : partFault(declaration, host)
  if (fault !== null) throw new ShellAssemblyError('attached', declaration.name, 'invalid', fault)
  return partEntry(declaration)
}

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
  private readonly changeWatchers = new Set<() => void>()
  private read:
    | Readonly<{ registry: Registry; tenant: string | undefined; changes: Changes }>
    | undefined
  private adopted: Readonly<{ registry: Registry; of: Map<string, Adoption> }> | undefined

  constructor(ctx: Context) {
    super(ctx, ShellService.provide)
    const { dynamis } = ctx
    for (const slot of SLOT_NAMES) this.views.set(slot, viewOf(dynamis.registry(), slot))
    dynamis.put(CONTRACTS.map(contract => declare(contract)))
    ctx.on('dynamis-cordis/changed', registry => this.follow(registry))
  }

  contribute<K extends SlotName>(slot: K, item: ItemOf<K>): void {
    this.put(slot, item.id, instance => [entryOf(slot, item, instance)])
  }

  declare(contract: Contract): void {
    this.put('attached', contract.name, [declare(contract)])
  }

  declarePart(declaration: PartDeclaration): void {
    this.put('attached', declaration.name, instance => [
      checkedPart(declaration, partHostOf(instance.fiber)),
    ])
  }

  protected declareOwn(declarations: readonly PartDeclaration[]): void {
    const whole = declarations.some(declaration => declaration.name === 'shell.app')
    this.ctx.dynamis.put([
      ...declarations.map(declaration => checkedPart(declaration, 'shell')),
      ...(whole ? [tokensEntry('shell.app', {}, [], true)] : []),
    ])
  }

  putTokens(
    part: string,
    tokens: Readonly<Record<string, string>>,
    scope: Scope = [],
  ): () => unknown {
    return this.ctx.dynamis.put([tokensEntry(part, tokens, scope)])
  }

  putStyle(part: string, style: PartStyle, scope: Scope = []): () => unknown {
    return this.ctx.dynamis.put([styleEntry(part, style, scope)])
  }

  putRender<P>(part: string, render: PartRender<P>, scope: Scope = []): () => unknown {
    return this.ctx.dynamis.put(instance => [
      renderEntry(part, render as PartRender, scope, `${instance.fiber}#${instance.generation}`),
    ])
  }

  putLayout(key: string, order: readonly string[], scope: Scope = []): () => unknown {
    return this.ctx.dynamis.put([layoutEntry(key, order, scope)])
  }

  changes(): Changes {
    const registry = this.registry()
    const tenant = this.scope.get()
    if (this.read?.registry !== registry || this.read.tenant !== tenant) {
      const known = (name: string): boolean => this.knowsToken(name)
      this.read = { registry, tenant, changes: changesOn(registry, tenantScope(tenant), known) }
    }
    return this.read.changes
  }

  drawn(part: string, builtIn: () => ReactNode, props: unknown): ReactNode {
    const render = this.changes().renders.get(part)
    if (render === undefined) return builtIn()
    try {
      return render({ props: props as never, part: { [PART_ATTRIBUTE]: part }, builtIn })
    } catch {
      return builtIn()
    }
  }

  watchChanges(listener: () => void): () => void {
    this.changeWatchers.add(listener)
    return () => void this.changeWatchers.delete(listener)
  }

  protected rescope(): void {
    this.follow(this.registry())
  }

  protected knowsToken(_name: string): boolean {
    return false
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
    const made = adoptOn(registry, references)
    this.adopted.of.set(module, made)
    return made
  }

  offer<T>(key: ServiceKey<T>, value: NoInfer<T>): void {
    this.ctx.dynamis.put(instance => [
      declare(offered(key)),
      {
        point: key,
        key: '',
        id: '',
        scope: [],
        rank: 0,
        digest: `${instance.fiber}#${instance.generation}`,
        item: value,
      },
    ])
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
    const order = this.changes().layouts['shell.pages']
    const changed = SLOT_NAMES.filter(slot => {
      const read = viewOf(registry, slot)
      const fresh = slot === 'pages' ? { ...read, items: laidOut(read.items, order) } : read
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
    for (const listener of Array.from(this.changeWatchers)) {
      try {
        listener()
      } catch {
        this.ctx.logger.warn('shell: a watcher of the changes threw')
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

export type UiModuleDefinition<N extends Readonly<Record<string, Need>>> = Readonly<{
  name: string
  needs: N
  apply: (shell: ShellService, bound: BoundOf<N>, provide: Provide) => void | (() => void)
}>

type NeedsModule = UiModuleDefinition<Record<string, Need>>

function lacking(shell: ShellService): ShellService {
  return new Proxy(shell, {
    get(target, key) {
      if (key === 'contribute')
        return (slot: SlotName, item: never) => {
          if (slot === 'pages' || slot === 'gate') target.contribute(slot, item)
        }
      const value: unknown = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function turnOf(definition: NeedsModule, bound: object, whole: boolean): Plugin.Object {
  return {
    name: definition.name,
    inject: [ShellService.provide],
    apply(ctx: Context) {
      const provide: Provide = (key, value) => {
        if (whole) ctx.shell.offer(key, value)
      }
      const shell = whole ? ctx.shell : lacking(ctx.shell)
      const back = definition.apply(shell, bound as BoundOf<Record<string, Need>>, provide)
      if (back !== undefined) ctx.effect(() => back, 'ui-module.apply')
    },
  }
}

function followAdoption(ctx: Context, definition: NeedsModule, bound: object): void {
  const { shell } = ctx
  let mark: string | undefined
  let turn: { dispose(): Promise<void> } | undefined
  let turning: Promise<void> = Promise.resolve()
  let gone = false
  const followed = Object.entries(definition.needs)
    .filter(([, need]) => need.kind === 'point' && need.optional)
    .map(([slot]) => slot)
  const markOf = (adoption: Adoption | undefined): string =>
    JSON.stringify(adoption, (key, value: unknown) => (followed.includes(key) ? undefined : value))
  const settle = (): void => {
    const adoption = shell.adoption(definition.name)
    const next = markOf(adoption)
    if (next === mark) return
    mark = next
    const last = turn
    turn = undefined
    turning = turning
      .then(() => last?.dispose())
      .then(() => {
        if (gone || mark !== next) return
        turn = ctx.plugin(turnOf(definition, bound, adoption?.kind === 'adopted'))
      })
  }
  ctx.effect(() => {
    const stop = shell.watchAdoptions(settle)
    return () => {
      gone = true
      stop()
    }
  }, 'ui-module.adoption')
  settle()
}

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
): Plugin.Object {
  const module = definition as unknown as NeedsModule
  return {
    name: module.name,
    inject: [ShellService.provide],
    apply(ctx: Context) {
      const { shell } = ctx
      shell.require(module.name, referencesOf(module.needs))
      followAdoption(
        ctx,
        module,
        boundOf(shell, () => shell.registry(), module.needs),
      )
    },
  }
}
