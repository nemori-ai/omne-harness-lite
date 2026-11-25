import type { CanvasBody, CanvasItemBody, CanvasPileBody } from '@omne-harness/canvas-protocol'
import { Ago, AssistantIcon, ContactIcon, LockIcon, PaperStatus } from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useState, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import type { KindStanding } from '../model/kinds.ts'
import { canvasStatus } from '../parts.ts'
import { CANVAS_APP } from './app.tsx'
import { kindName } from './element.tsx'

/** A thing on the sheet: a loose item or a pile. */
type Thing = Readonly<{ kind: 'item' | 'pile'; id: string }>

type Looks = Readonly<{ over: Thing | undefined; focus: Thing | undefined }>

const same = (one: Thing | undefined, other: Thing | undefined): boolean =>
  one?.kind === other?.kind && one?.id === other?.id

/** The thing on the sheet an element belongs to; none for bare paper and for anything off the sheet. */
function thingAt(target: EventTarget | null): Thing | undefined {
  if (!(target instanceof Element)) return undefined
  const at = target.closest('[data-item], [data-pile]')
  if (at === null || at.closest('.omne-paper-surface') === null) return undefined
  const item = at.getAttribute('data-item')
  return item === null
    ? { kind: 'pile', id: at.getAttribute('data-pile') ?? '' }
    : { kind: 'item', id: item }
}

/** Where the pointer and the focus are among the things, held apart from the sheet so a hover redraws the bar alone. */
export class LookedAt {
  private now: Looks = { over: undefined, focus: undefined }
  private readonly listeners = new Set<() => void>()

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly get = (): Looks => this.now

  over(target: EventTarget | null): void {
    this.set({ ...this.now, over: thingAt(target) })
  }

  focus(target: EventTarget | null): void {
    this.set({ ...this.now, focus: thingAt(target) })
  }

  private set(next: Looks): void {
    if (same(next.over, this.now.over) && same(next.focus, this.now.focus)) return
    this.now = next
    for (const listener of this.listeners) listener()
  }
}

export function useLookedAt(): LookedAt {
  return useState(() => new LookedAt())[0]
}

type Seen = Thing | Readonly<{ kind: 'many'; count: number }> | undefined

/** The pointer first, then the focus, then what is selected. */
function seenOf(looks: Looks, selected: ReadonlySet<string>): Seen {
  const looked = looks.over ?? looks.focus
  if (looked !== undefined) return looked
  if (selected.size === 1) return { kind: 'item', id: [...selected][0]! }
  return selected.size > 1 ? { kind: 'many', count: selected.size } : undefined
}

function Who({ by, when }: Readonly<Pick<CanvasItemBody, 'by' | 'when'>>): JSX.Element {
  const Mark = by.kind === 'human' ? ContactIcon : AssistantIcon
  return (
    <span className="canvas-status-part">
      <Mark aria-hidden="true" className="canvas-status-icon" />
      {by.kind === 'human' ? '人' : 'agent'}
      <Ago at={encodeInstant(when)} />
    </span>
  )
}

function ItemSaid({ item, standing }: Readonly<{ item: CanvasItemBody; standing: KindStanding }>) {
  const named = item.reference.kind === CANVAS_APP ? item.reference.ref : undefined
  return (
    <>
      <span className="canvas-status-part canvas-status-what">
        <span className="canvas-status-kind">{kindName(item, standing)}</span>
        {named === undefined ? null : <span className="canvas-status-name">{named}</span>}
      </span>
      <Who by={item.by} when={item.when} />
      {item.locked ? (
        <span className="canvas-status-part">
          <LockIcon aria-hidden="true" className="canvas-status-icon" />
          锁着
        </span>
      ) : null}
    </>
  )
}

function PileSaid({ pile, pages }: Readonly<{ pile: CanvasPileBody; pages: number }>) {
  return (
    <>
      <span className="canvas-status-part canvas-status-what">
        <span className="canvas-status-name">{pile.name ?? '没有名字的一叠'}</span>
        <span className="canvas-status-count">{pages} 页</span>
      </span>
      <Who by={pile.by} when={pile.when} />
    </>
  )
}

function said(
  seen: Seen,
  canvas: CanvasBody,
  standing: (item: CanvasItemBody) => KindStanding,
): ReactNode {
  if (seen === undefined) return undefined
  if (seen.kind === 'many') return `选中 ${seen.count} 样`
  if (seen.kind === 'pile') {
    const pile = canvas.piles.find(one => one.id === seen.id)
    const pages = canvas.items.filter(item => item.state === 'on' && item.pile === seen.id).length
    return pile === undefined ? undefined : <PileSaid pile={pile} pages={pages} />
  }
  const item = canvas.items.find(one => one.id === seen.id && one.state === 'on')
  return item === undefined ? undefined : <ItemSaid item={item} standing={standing(item)} />
}

export type CanvasStatusProps = Readonly<{
  looking: LookedAt
  canvas: CanvasBody
  standing: (item: CanvasItemBody) => KindStanding
  selected: ReadonlySet<string>
  tools: ReactNode
}>

/** The bar under the sheet: the sheet's own tools, and what is looked at now. */
export function CanvasStatus({ looking, canvas, standing, selected, tools }: CanvasStatusProps) {
  const looks = useSyncExternalStore(looking.subscribe, looking.get)
  return (
    <PaperStatus
      tools={tools}
      info={said(seenOf(looks, selected), canvas, standing)}
      {...canvasStatus.props}
    />
  )
}
