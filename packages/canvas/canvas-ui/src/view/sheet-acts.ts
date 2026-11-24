import type { CanvasBody, CanvasItemBody, CanvasPileBody } from '@omne-harness/canvas-protocol'
import type { PaperBox, PaperGesture, PaperPoint } from '@omne-harness/ui-kit'
import type { Command } from '../model/commands.ts'
import { contentSize, holds, pileBox, type Sheet } from '../model/sheet.ts'
import type { ItemActs, PressHow } from './item-page.tsx'
import type { KeyAct } from './keys.ts'
import type { PileActs } from './pile-view.tsx'

export type Selection = ReadonlySet<string>

export type SheetDeps = Readonly<{
  canvas: CanvasBody
  sheet: Sheet
  selected: Selection
  select: (next: Selection) => void
  send: (command: Command) => void
  newPile: () => string
}>

const spot = (box: PaperBox): PaperPoint => ({ x: box.x, y: box.y })

/** Brought to the top by being handled, unless it is on top already. */
function raise(canvas: CanvasBody, item: CanvasItemBody): { top?: true } {
  const loose = canvas.items.filter(other => other.pile === null && other.id !== item.id)
  return loose.some(other => other.rank >= item.rank) ? { top: true } : {}
}

/** What an act on one thing is about: the whole selection when the thing is in it, else the thing alone. */
function targets(deps: SheetDeps, item: CanvasItemBody): readonly string[] {
  if (!deps.selected.has(item.id)) return [item.id]
  return deps.canvas.items.filter(other => deps.selected.has(other.id)).map(other => other.id)
}

/** The things a pile would be made of: the selection, and the thing the act came from. */
function group(deps: SheetDeps, item: CanvasItemBody): readonly string[] {
  return deps.canvas.items
    .filter(other => other.id === item.id || deps.selected.has(other.id))
    .sort((one, other) => other.rank - one.rank)
    .map(other => other.id)
}

function pileUnder(
  deps: SheetDeps,
  item: CanvasItemBody,
  under: PaperPoint | undefined,
): CanvasPileBody | undefined {
  if (under === undefined) return undefined
  return deps.canvas.piles.find(
    pile => pile.id !== item.pile && holds(pileBox(pile, deps.sheet), under),
  )
}

function keyed(deps: SheetDeps, item: CanvasItemBody, act: KeyAct): void {
  switch (act) {
    case 'pile': {
      const items = group(deps, item)
      if (items.length < 2) return
      deps.select(new Set())
      deps.send({ op: 'pile', body: { pile: deps.newPile(), items } })
      return
    }
    case 'lock':
      deps.send({ op: 'lock', body: { items: targets(deps, item), locked: !item.locked } })
      return
    case 'take':
      deps.select(new Set())
      deps.send({ op: 'take', body: { items: targets(deps, item) } })
      return
    default:
      return
  }
}

export function itemActs(deps: SheetDeps): ItemActs {
  return {
    place(item, box, gesture: PaperGesture, under) {
      const pile = gesture === 'move' ? pileUnder(deps, item, under) : undefined
      if (pile !== undefined) {
        deps.send({ op: 'arrange', body: { items: [{ item: item.id, pile: pile.id }] } })
        return
      }
      const size = gesture === 'resize' ? { size: contentSize(box) } : {}
      const change = { item: item.id, at: spot(box), ...size, ...raise(deps.canvas, item) }
      deps.send({ op: 'arrange', body: { items: [change] } })
    },
    press(item, how: PressHow) {
      if (how === 'toggle') {
        const next = new Set(deps.selected)
        if (!next.delete(item.id)) next.add(item.id)
        deps.select(next)
        return
      }
      deps.select(new Set([item.id]))
      const top = raise(deps.canvas, item)
      if (top.top === true)
        deps.send({ op: 'arrange', body: { items: [{ item: item.id, top: true }] } })
    },
    act: (item, act) => keyed(deps, item, act),
    putInto(item, pile) {
      deps.send({ op: 'arrange', body: { items: [{ item: item.id, pile }] } })
    },
    grouped: item => group(deps, item).length,
  }
}

export function pileActs(deps: SheetDeps): PileActs {
  return {
    move(pile, box) {
      deps.send({ op: 'arrange', body: { piles: [{ pile: pile.id, at: spot(box) }] } })
    },
    rename(pile, name) {
      deps.send({ op: 'arrange', body: { piles: [{ pile: pile.id, name }] } })
    },
    scatter(pile) {
      deps.send({ op: 'scatter', body: { pile: pile.id } })
    },
    out(item) {
      deps.send({ op: 'arrange', body: { items: [{ item: item.id, pile: null }] } })
    },
    take(item) {
      deps.send({ op: 'take', body: { items: [item.id] } })
    },
  }
}

/** A page dragged out of an open pile and dropped on the sheet lands where it was dropped. */
export function droppedOut(deps: SheetDeps, item: string, at: PaperPoint): void {
  if (!deps.canvas.items.some(one => one.id === item && one.pile !== null)) return
  deps.send({ op: 'arrange', body: { items: [{ item, pile: null, at }] } })
}
