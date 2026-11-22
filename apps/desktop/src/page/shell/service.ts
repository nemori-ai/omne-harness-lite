import type { Context, Plugin } from '@deepseek-ai/cordis'
import { createElement, type ReactNode } from 'react'
import { deployment, tree, type Registry } from '@omne-harness/dynamis'
import {
  type AttachedLayout,
  type FigureBoard,
  type ItemOf,
  type ScopeSource,
  type ShellLogin,
  type SlotName,
  type ToastBoard,
} from '@omne-harness/shell-contract'
import { ShellService } from '@omne-harness/shell-contract/cordis'
import { Arranged, Attached } from './attached.tsx'
import type { ShellState } from './state.ts'

const SLOT_NAMES: readonly SlotName[] = ['gate', 'pages', 'sidebar', 'attached']

export class DesktopShell extends ShellService {
  readonly login: ShellLogin
  readonly scope: ScopeSource
  private readonly state: ShellState
  private problems: ReadonlySet<string> = new Set()

  constructor(ctx: Context, state: ShellState) {
    super(ctx)
    this.state = state
    this.login = state.login
    this.scope = state.scope
    ctx.effect(() => state.slots.bind(this), 'desktop-shell.slots')
    for (const slot of SLOT_NAMES)
      ctx.effect(
        () => this.subscribe(slot, () => this.reportConflicts(slot)),
        'desktop-shell.conflicts',
      )
    ctx.on('dynamis-cordis/changed', registry => this.reportProblems(registry))
  }

  /** A point nobody declared, or one declared twice, shows nothing: the log says which point. */
  private reportProblems(registry: Registry): void {
    const now = new Set<string>()
    for (const { kind, point, detail } of tree(registry, deployment).problems) {
      const key = `${kind} ${point}`
      now.add(key)
      if (this.problems.has(key)) continue
      this.ctx.logger.error(`shell: the point ${point} has a problem (${kind}): ${detail}`)
    }
    this.problems = now
  }

  /** A conflict is an assembly mistake nobody threw: the log names the spot and who put there. */
  private reportConflicts(slot: SlotName): void {
    for (const { anchor, id, by } of this.conflicts(slot)) {
      const spot = [slot, anchor, id].filter(part => part !== undefined && part !== '').join(' ')
      this.ctx.logger.error(`shell: ${spot} is put by ${by.join(', ')}; none of them is drawn`)
    }
  }

  /** A page remembers the module that put it: that module is in front while its page is on show. */
  override contribute<K extends SlotName>(slot: K, item: ItemOf<K>): void {
    super.contribute(slot, item)
    if (slot !== 'pages') return
    const { pageOwners } = this.state
    const owner = this.ctx.fiber
    this.ctx.effect(() => {
      pageOwners.set(item.id, [...(pageOwners.get(item.id) ?? []), owner])
      return () => {
        const left = (pageOwners.get(item.id) ?? []).filter(held => held !== owner)
        if (left.length === 0) pageOwners.delete(item.id)
        else pageOwners.set(item.id, left)
      }
    }, 'desktop-shell.page-owner')
  }

  navigate(pageId: string, subject?: string): void {
    this.state.page.choose(pageId, subject)
  }

  /** Only which page is on show: choosing one stays with `navigate`. */
  override get page(): ShellService['page'] {
    const { get, subscribe } = this.state.page
    return { get, subscribe }
  }

  attached(anchor: string, subject: string): ReactNode {
    return createElement(Attached, {
      slots: this.state.slots,
      scope: this.state.scope,
      anchor,
      subject,
    })
  }

  arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode {
    return createElement(Arranged, {
      slots: this.state.slots,
      scope: this.state.scope,
      anchor,
      subject,
      layout,
    })
  }

  protected override toasts(): ToastBoard {
    return this.state.told
  }

  protected override figures(): FigureBoard {
    return this.state.figure
  }
}

export function shellPlugin(state: ShellState): Plugin.Object {
  return {
    name: 'desktop-shell',
    apply(ctx: Context) {
      ctx.plugin(DesktopShell, state)
    },
  }
}
