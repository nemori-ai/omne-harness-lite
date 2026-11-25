import {
  CELLS,
  statusOf,
  type Cell,
  type Entry,
  type Item,
  type ItemChange,
  type ItemId,
  type ItemOperation,
  type PileChange,
  type Spot,
} from '@omne-harness/canvas-contract'
import type { CanvasFacts } from './facts.ts'
import { isFree, roomOf, seatOf, takenRects } from './geometry.ts'
import type {
  ArrangeCommand,
  ChangeResult,
  LockCommand,
  PileCommand,
  PlaceCommand,
  PlaceResult,
  ScatterCommand,
  TakeCommand,
} from './store.ts'
import { Work } from './work.ts'

const NO_CHANGE = Object.freeze({ kind: 'no-change' as const })

const open = (
  facts: CanvasFacts,
  command: Pick<PlaceCommand, 'canvas' | 'by' | 'when' | 'rules'>,
) => new Work(facts, command.canvas, command.by, command.when, command.rules)

function stopping(cells: readonly Cell[], entry: Entry): ChangeResult | null {
  for (const cell of cells) {
    if (cell === 'not-found') return { kind: 'not-found', entry }
    if (typeof cell === 'object') return { kind: 'conflict', reason: cell.conflict, entry }
  }
  return null
}

const cellsOf = (operations: readonly ItemOperation[], item: Item | null) =>
  operations.map(operation => CELLS[operation][statusOf(item)])

const saved = (work: Work): ChangeResult => {
  const revision = work.save()
  return revision === null ? NO_CHANGE : { kind: 'changed', revision }
}

function shownAt(work: Work, item: Item): Spot {
  const pile = item.pile === null ? undefined : work.piles.get(item.pile)
  return pile?.at ?? item.at
}

/** Takes an item out of its pile to `at`, or beside the pile; the pile goes when it is left empty. */
function out(work: Work, item: Item, at: Spot | undefined): Item {
  const pile = item.pile
  const spot = at ?? work.freeNear(shownAt(work, item), item.size, item.id)
  const moved = work.update(item, { pile: null, at: spot })
  work.prune(pile)
  return moved
}

function into(work: Work, item: Item, pile: NonNullable<Item['pile']>): Item {
  const from = item.pile
  const moved = work.update(item, { pile })
  if (from !== pile) work.prune(from)
  return moved
}

function raise(work: Work, item: Item): Item {
  return item.rank === work.topRank() ? item : work.update(item, { rank: work.nextRank() })
}

/** The conditional commit of place: still not on, still below the limit, the kind still declared. */
export function placeReference(facts: CanvasFacts, command: PlaceCommand): PlaceResult {
  const work = open(facts, command)
  const existing = facts.itemOf(command.canvas, command.reference)
  if (existing !== null && existing.state === 'on') return { kind: 'no-change', item: existing }
  const placed = [...work.items.values()].filter(item => item.state === 'on').length
  if (placed >= command.rules.placed) return { kind: 'conflict', reason: 'full' }
  if (!command.declared) return { kind: 'conflict', reason: 'kind-undeclared' }

  const size = command.size ?? existing?.size ?? null
  const at = command.at ?? spotFor(work, command, existing, size)
  const rank = work.nextRank()
  const item = work.put({
    id: existing?.id ?? (`i${rank}` as ItemId),
    reference: command.reference,
    state: 'on',
    at,
    size,
    rank,
    pile: null,
    locked: false,
    by: command.by,
    when: command.when,
  })
  const revision = work.save()!
  return { kind: 'changed', revision, item }
}

/** Near the spot asked for; else where a taken item was, when it is still free; else beside the seat. */
function spotFor(
  work: Work,
  command: PlaceCommand,
  existing: Item | null,
  size: Item['size'],
): Spot {
  if (command.near !== undefined) return work.freeNear(command.near, size)
  if (existing === null) return work.freeNear(seatOf(command.rules.sheet), size)
  return isOpen(work, existing.at, size) ? existing.at : work.freeNear(existing.at, size)
}

/** Whether a thing of this size fits at `at` pressing on nothing; sharing an edge does not press. */
function isOpen(work: Work, at: Spot, size: Item['size']): boolean {
  const { sheet, footprint } = work.rules
  const taken = takenRects(work.items.values(), work.piles.values(), sheet, footprint)
  return isFree(sheet, taken, at, roomOf(size, footprint))
}

/** The operations of the table an item change is checked as: where it goes, then whether it is adjusted. */
function operationsOf(change: ItemChange): ItemOperation[] {
  const operations: ItemOperation[] = []
  if (change.pile === null) operations.push('leave')
  else if (change.pile !== undefined) operations.push('enter')
  else if (change.at !== undefined) operations.push('move')
  if (change.size !== undefined || change.top === true) operations.push('adjust')
  return operations
}

function changeItem(work: Work, item: Item, change: ItemChange): ChangeResult | null {
  if (typeof change.pile === 'string') {
    if (!work.piles.has(change.pile)) return { kind: 'not-found', entry: { pile: change.pile } }
    item = into(work, item, change.pile)
  } else if (change.pile === null && item.pile !== null) item = out(work, item, change.at)
  else if (change.at !== undefined) item = work.update(item, { at: change.at })
  if (change.size !== undefined) item = work.update(item, { size: change.size })
  if (change.top === true) raise(work, item)
  return null
}

function arrangeItem(work: Work, change: ItemChange): ChangeResult | null {
  const item = work.item(change.item)
  const stop = stopping(cellsOf(operationsOf(change), item), { item: change.item })
  if (stop !== null || item === null) return stop
  return changeItem(work, item, change)
}

function arrangePile(work: Work, change: PileChange): ChangeResult | null {
  const pile = work.piles.get(change.pile)
  if (pile === undefined) return { kind: 'not-found', entry: { pile: change.pile } }
  work.updatePile(pile, {
    ...(change.at === undefined ? {} : { at: change.at }),
    ...(change.name === undefined ? {} : { name: change.name }),
  })
  return null
}

/** A batch in its order, the items before the piles. One entry that stops it stops all of it. */
export function arrangeBatch(facts: CanvasFacts, command: ArrangeCommand): ChangeResult {
  const work = open(facts, command)
  for (const change of command.items) {
    const stop = arrangeItem(work, change)
    if (stop !== null) return stop
  }
  for (const change of command.piles) {
    const stop = arrangePile(work, change)
    if (stop !== null) return stop
  }
  return saved(work)
}

/** Takes items off the sheet where they showed. Only when one is taken do the oldest taken past the limit go. */
export function takeItems(facts: CanvasFacts, command: TakeCommand): ChangeResult {
  const work = open(facts, command)
  let taking = false
  for (const id of command.items) {
    const item = work.item(id)
    const stop = stopping(cellsOf(['take'], item), { item: id })
    if (stop !== null || item === null) return stop!
    if (item.state === 'off') continue
    const pile = item.pile
    work.update(item, { state: 'off', at: shownAt(work, item), pile: null, rank: work.nextRank() })
    work.prune(pile)
    taking = true
  }
  if (!taking) return NO_CHANGE
  const away = new Map(facts.items(command.canvas, 'off').map(item => [item.id, item]))
  for (const item of work.items.values())
    if (item.state === 'off') away.set(item.id, item)
    else away.delete(item.id)
  const oldest = [...away.values()].sort((left, right) => left.rank - right.rank)
  for (const item of oldest.slice(0, Math.max(0, oldest.length - command.rules.away)))
    work.drop(item.id)
  return saved(work)
}

export function pileItems(facts: CanvasFacts, command: PileCommand): ChangeResult {
  const work = open(facts, command)
  const items: Item[] = []
  for (const id of command.items) {
    const item = work.item(id)
    const stop = stopping(cellsOf(['pile'], item), { item: id })
    if (stop !== null || item === null) return stop!
    items.push(item)
  }
  if (!work.piles.has(command.pile))
    work.createPile(command.pile, command.at ?? shownAt(work, items[0]!))
  for (const item of items) into(work, work.item(item.id)!, command.pile)
  return saved(work)
}

export function scatterPile(facts: CanvasFacts, command: ScatterCommand): ChangeResult {
  const work = open(facts, command)
  const pile = work.piles.get(command.pile)
  if (pile === undefined) return NO_CHANGE
  const topDown = [...work.items.values()]
    .filter(item => item.state === 'on' && item.pile === pile.id)
    .sort((left, right) => right.rank - left.rank)
  work.piles.delete(pile.id)
  for (const [n, item] of topDown.entries()) {
    const stays = n === 0 && isOpen(work, pile.at, item.size)
    work.update(item, {
      pile: null,
      at: stays ? pile.at : work.freeNear(pile.at, item.size, item.id),
    })
  }
  return saved(work)
}

export function lockItems(facts: CanvasFacts, command: LockCommand): ChangeResult {
  const work = open(facts, command)
  const operation = command.locked ? 'lock' : 'unlock'
  for (const id of command.items) {
    const item = work.item(id)
    const stop = stopping(cellsOf([operation], item), { item: id })
    if (stop !== null || item === null) return stop!
    work.update(item, { locked: command.locked })
  }
  return saved(work)
}
